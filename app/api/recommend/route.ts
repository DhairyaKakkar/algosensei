import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import type { SkillProfile } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CFProblemRaw {
  contestId?: number;
  problemsetName?: string;
  index: string;
  name: string;
  type: string;
  rating?: number;
  tags: string[];
}

interface CFProblemStat {
  contestId?: number;
  index: string;
  solvedCount: number;
}

export interface Recommendation {
  problemKey: string;
  contestId?: number;
  index: string;
  name: string;
  rating?: number;
  tags: string[];
  topicId: string;
  topicLabel: string;
  reason: string;
  cfUrl: string;
  solvedCount?: number;
}

// ─── CF problemset cache (per-tag, 30-min TTL) ───────────────────────────────

const CF_CACHE = new Map<
  string,
  { problems: CFProblemRaw[]; stats: Map<string, number>; ts: number }
>();
const CACHE_TTL = 30 * 60 * 1000;

async function fetchCFProblemsForTag(
  tag: string
): Promise<{ problems: CFProblemRaw[]; stats: Map<string, number> }> {
  const cached = CF_CACHE.get(tag);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { problems: cached.problems, stats: cached.stats };
  }

  const url = `https://codeforces.com/api/problemset.problems?tags=${encodeURIComponent(tag)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`CF API returned HTTP ${res.status}`);

  const json = await res.json();
  if (json.status !== "OK") throw new Error(`CF API error: ${json.comment ?? "unknown"}`);

  const problems: CFProblemRaw[] = json.result.problems ?? [];
  const rawStats: CFProblemStat[] = json.result.problemStatistics ?? [];

  const stats = new Map<string, number>();
  rawStats.forEach((s) => {
    if (s.contestId) stats.set(`${s.contestId}-${s.index}`, s.solvedCount);
  });

  CF_CACHE.set(tag, { problems, stats, ts: Date.now() });
  return { problems, stats };
}

// ─── Topic → primary CF query tag ────────────────────────────────────────────

const TOPIC_QUERY_TAG: Record<string, string> = {
  dp: "dp",
  graphs: "graphs",
  greedy: "greedy",
  math: "math",
  ds: "data structures",
  binsearch: "binary search",
  strings: "strings",
  impl: "implementation",
  geometry: "geometry",
  games: "game theory",
};

function makeCFUrl(contestId?: number, index?: string): string {
  if (contestId && index)
    return `https://codeforces.com/contest/${contestId}/problem/${index}`;
  return "https://codeforces.com/problemset";
}

function makeProblemKey(contestId?: number, index?: string): string {
  return contestId ? `${contestId}-${index}` : `gym-${index}`;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    skillProfile: SkillProfile;
    userRating: number;
    solvedKeys?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { skillProfile, userRating, solvedKeys = [] } = body;

  if (!skillProfile || !userRating) {
    return NextResponse.json(
      { error: "Missing skillProfile or userRating" },
      { status: 400 }
    );
  }

  // ── Pick top 4 weakest topics with meaningful data ──────────────────────────
  const weakTopics = skillProfile.weakestTopics.filter((t) => t.attempted >= 3).slice(0, 4);

  if (weakTopics.length === 0) {
    return NextResponse.json(
      { error: "Not enough submission data to generate recommendations. Solve at least 10 problems across multiple topics first." },
      { status: 422 }
    );
  }

  const solvedSet = new Set(solvedKeys);

  // ── Fetch candidate problems from CF for each weak topic ────────────────────
  const candidateMap = new Map<
    string,
    CFProblemRaw & { topicId: string; topicLabel: string; solvedCount: number }
  >();

  await Promise.allSettled(
    weakTopics.map(async (topic) => {
      const primaryTag = TOPIC_QUERY_TAG[topic.topicId] ?? topic.topicId;

      // If we know where the student fails, target that range tightly
      const ratingMin = topic.failureThreshold
        ? Math.max(800, topic.failureThreshold - 100)
        : Math.max(800, userRating - 200);
      const ratingMax = topic.failureThreshold
        ? topic.failureThreshold + 500
        : userRating + 400;

      try {
        const { problems, stats } = await fetchCFProblemsForTag(primaryTag);

        problems
          .filter(
            (p) =>
              p.rating != null &&
              p.rating >= ratingMin &&
              p.rating <= ratingMax &&
              p.contestId != null && // exclude gym
              !solvedSet.has(makeProblemKey(p.contestId, p.index))
          )
          .slice(0, 25)
          .forEach((p) => {
            const key = makeProblemKey(p.contestId, p.index);
            if (!candidateMap.has(key)) {
              const fullTopic = skillProfile.topics.find(
                (t) => t.topicId === topic.topicId
              );
              candidateMap.set(key, {
                ...p,
                topicId: topic.topicId,
                topicLabel: fullTopic?.label ?? topic.label,
                solvedCount: stats.get(key) ?? 0,
              });
            }
          });
      } catch (err) {
        console.error(`[recommend] CF fetch failed for tag "${primaryTag}":`, err);
      }
    })
  );

  if (candidateMap.size === 0) {
    return NextResponse.json(
      { error: "Could not fetch problems from Codeforces. Try again shortly." },
      { status: 502 }
    );
  }

  // Sort by solve count descending (popular = well-tested, accessible)
  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => b.solvedCount - a.solvedCount)
    .slice(0, 45);

  // ── Build AI prompt ─────────────────────────────────────────────────────────
  const weakSummary = weakTopics
    .map((t) => {
      const full = skillProfile.topics.find((x) => x.topicId === t.topicId);
      const solveRatePct = full ? Math.round(full.solveRate * 100) : "?";
      const expPct = full ? Math.round(full.expectedSolveRate * 100) : "?";
      const threshold = t.failureThreshold ? `, performance degrades above rating ${t.failureThreshold}` : "";
      return `• ${t.label}: skill score ${t.skillScore}/100, ${solveRatePct}% actual vs ${expPct}% expected${threshold}`;
    })
    .join("\n");

  const candidateList = candidates
    .map(
      (p, i) =>
        `[${i}] "${p.name}" | rating ${p.rating} | tags: ${p.tags.filter((t) => !t.startsWith("*")).slice(0, 5).join(", ")} | solved by ${p.solvedCount.toLocaleString()} users | topic bucket: ${p.topicId}`
    )
    .join("\n");

  let aiRaw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert competitive programming coach. Select and explain practice problems for a specific student based on their measured weaknesses. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: `Student Codeforces rating: ${userRating}
Overall skill score: ${skillProfile.overallScore}/100

WEAKNESSES TO TARGET:
${weakSummary}

CANDIDATE PROBLEMS (pre-filtered to the student's difficulty range):
${candidateList}

Select exactly 8 problems from the candidates above. Choose problems that will most effectively help this student improve their weakest areas.

Respond with a JSON object in this exact format:
{
  "recommendations": [
    { "index": <candidate array index 0-${candidates.length - 1}>, "reason": "<specific 1-2 sentence reason>" },
    ...8 items total
  ]
}

RULES for selection:
- Cover at least 3 different topic buckets from the weak list
- Mix difficulty: a few problems just at their level + a few slightly above (their challenge zone)
- Prefer higher solve counts when difficulty is similar (better-tested problems)
- Vary the specific sub-skill being practiced

RULES for reason text:
- Be SPECIFIC: name the topic weakness, the rating relative to the student, and what skill it trains
- Example good reason: "At rating 1500, this DP problem uses prefix-sum optimization — right at the threshold where your DP solve rate drops below expected, and a technique pattern you've likely not seen yet."
- Example bad reason: "Good DP practice problem." (too generic)
- Keep it to 1-2 sentences`,
        },
      ],
      max_tokens: 900,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    aiRaw = completion.choices[0]?.message?.content ?? "{}";
  } catch (err) {
    console.error("[recommend] OpenAI error:", err);
    return NextResponse.json(
      {
        error: `AI ranking failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }

  // ── Parse AI response ───────────────────────────────────────────────────────
  let selected: Array<{ index: number; reason: string }> = [];
  try {
    const parsed = JSON.parse(aiRaw);
    const arr = parsed.recommendations ?? parsed.problems ?? parsed;
    selected = Array.isArray(arr) ? arr : [];
  } catch {
    console.error("[recommend] JSON parse failed:", aiRaw);
    selected = candidates
      .slice(0, 8)
      .map((_, i) => ({ index: i, reason: "Recommended based on your skill profile." }));
  }

  const recommendations: Recommendation[] = selected
    .filter((s) => typeof s.index === "number" && s.index >= 0 && s.index < candidates.length)
    .slice(0, 10)
    .map((s) => {
      const p = candidates[s.index];
      return {
        problemKey: makeProblemKey(p.contestId, p.index),
        contestId: p.contestId,
        index: p.index,
        name: p.name,
        rating: p.rating,
        tags: p.tags.filter((t) => !t.startsWith("*")).slice(0, 6),
        topicId: p.topicId,
        topicLabel: p.topicLabel,
        reason: s.reason,
        cfUrl: makeCFUrl(p.contestId, p.index),
        solvedCount: p.solvedCount,
      };
    });

  return NextResponse.json({ recommendations });
}
