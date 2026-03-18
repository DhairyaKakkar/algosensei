import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase-server";
import {
  calcProblemScore,
  type ContestProblem,
  type ProblemResult,
  type ProblemVerdict,
  type ContestResults,
} from "@/lib/contest";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── POST /api/contest/submit ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    contestId: string | null;
    userRating: number;
    cfHandle?: string;
    problems: ContestProblem[];
    durationMinutes: number;
    rawResults: Array<{
      problemKey: string;
      verdict: ProblemVerdict;
      wrongAttempts: number;
      solveTimeMinutes: number | null;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contestId, userRating, cfHandle, problems, durationMinutes, rawResults } = body;

  if (!problems?.length || !rawResults?.length) {
    return NextResponse.json({ error: "Missing problems or rawResults" }, { status: 400 });
  }

  // ── Compute per-problem scores ─────────────────────────────────────────────
  const problemResults: ProblemResult[] = rawResults.map((r) => {
    const problem = problems.find((p) => p.problemKey === r.problemKey);
    const maxScore = problem?.maxScore ?? 1000;
    const solved = r.verdict === "AC";

    const score = solved
      ? calcProblemScore(maxScore, r.solveTimeMinutes ?? 0, r.wrongAttempts)
      : 0;

    return {
      problemKey: r.problemKey,
      verdict: r.verdict,
      wrongAttempts: r.wrongAttempts,
      solveTimeMinutes: r.solveTimeMinutes,
      score,
    };
  });

  const totalScore = problemResults.reduce((sum, r) => sum + r.score, 0);
  const solvedCount = problemResults.filter((r) => r.verdict === "AC").length;

  // ── Build GPT-4o post-contest analysis prompt ──────────────────────────────
  const contestSummaryLines = problems.map((p, i) => {
    const r = problemResults[i];
    const solved = r.verdict === "AC";
    const timeStr = r.solveTimeMinutes != null ? `${r.solveTimeMinutes.toFixed(0)} min` : "—";
    const attempts = r.wrongAttempts > 0 ? ` (+${r.wrongAttempts} WA)` : "";
    const weakLabel = p.isWeakTopic ? ` [WEAK TOPIC: ${p.weakTopicLabel}]` : "";
    return (
      `Problem ${p.slot} (${p.slotLabel}, rating ${p.rating}${weakLabel}): ` +
      `"${p.name}" — ` +
      (solved
        ? `Solved in ${timeStr}${attempts} — ${r.score}/${p.maxScore} pts`
        : `${r.verdict}${attempts} — 0/${p.maxScore} pts`)
    );
  });

  const weakTopicsTargeted = problems
    .filter((p) => p.isWeakTopic)
    .map((p) => p.weakTopicLabel ?? p.weakTopicId ?? "unknown")
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const topicTagsEncountered = Array.from(
    new Set(problems.flatMap((p) => p.tags).slice(0, 15))
  ).join(", ");

  const analysisPrompt = `Post-contest report for ${cfHandle ?? "user"} (Codeforces rating: ${userRating}):

CONTEST SETUP:
- Duration: ${durationMinutes} minutes
- Problems: ${problems.length} (difficulty range: ${problems[0]?.rating ?? "?"} – ${problems[problems.length - 1]?.rating ?? "?"})
- Weak topics targeted: ${weakTopicsTargeted.join(", ") || "none"}

RESULTS:
${contestSummaryLines.join("\n")}

SUMMARY:
- Solved: ${solvedCount}/${problems.length}
- Total score: ${totalScore}/${problems.map((p) => p.maxScore).reduce((a, b) => a + b, 0)}
- Topics encountered: ${topicTagsEncountered}

Write a focused post-contest coaching analysis with these sections:

1. **Performance Overview** (2-3 sentences) — honest assessment of the overall result relative to their rating and the contest difficulty
2. **What Went Well** — bullet points for each solved problem: what skill it tested and why solving it was a good sign
3. **What to Improve** — for each unsolved or penalised problem: root cause diagnosis (time management? unfamiliar technique? implementation? read comprehension?) and a concrete action step
4. **Weak Topic Verdict** — specifically address the ${weakTopicsTargeted.length > 0 ? weakTopicsTargeted.join(" and ") : "targeted topics"}: did performance improve? What to study next?
5. **Next Steps** (3 bullet points max) — the highest-leverage practice actions for the next week

Be direct, specific, and constructive. No filler. Use exact problem names and ratings.`;

  let analysis = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an elite competitive programming coach. Write sharp, honest, technically specific post-contest analysis. Always use markdown formatting.",
        },
        { role: "user", content: analysisPrompt },
      ],
      max_tokens: 1000,
      temperature: 0.6,
    });
    analysis = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[contest/submit] OpenAI error:", err);
    analysis = "Post-contest analysis unavailable — AI service error. Review your results manually.";
  }

  const results: ContestResults = {
    problems: problemResults,
    totalScore,
    solvedCount,
    analysis,
  };

  // ── Persist results to Supabase ────────────────────────────────────────────
  if (contestId) {
    try {
      const db = createServiceClient();
      const { error } = await db
        .from("virtual_contests")
        .update({
          ended_at: new Date().toISOString(),
          results,
          score: totalScore,
        })
        .eq("id", contestId);

      if (error) {
        console.error("[contest/submit] Supabase update failed:", error);
      }
    } catch (err) {
      console.error("[contest/submit] Supabase error:", err);
    }
  }

  return NextResponse.json({ results });
}
