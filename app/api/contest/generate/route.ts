import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import {
  TOPIC_CF_TAG,
  GENERAL_TOPIC_TAGS,
  SLOT_MAX_SCORES,
  SLOT_LABELS,
  type ContestProblem,
} from "@/lib/contest";
import { TOPICS } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CFProblemRaw {
  contestId?: number;
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

// ─── In-process cache (per CF tag, 30-min TTL) ────────────────────────────────

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
  if (!res.ok) throw new Error(`CF API returned HTTP ${res.status} for tag "${tag}"`);

  const json = await res.json();
  if (json.status !== "OK")
    throw new Error(`CF API error for tag "${tag}": ${json.comment ?? "unknown"}`);

  const problems: CFProblemRaw[] = json.result.problems ?? [];
  const rawStats: CFProblemStat[] = json.result.problemStatistics ?? [];

  const stats = new Map<string, number>();
  rawStats.forEach((s) => {
    if (s.contestId) stats.set(`${s.contestId}-${s.index}`, s.solvedCount);
  });

  CF_CACHE.set(tag, { problems, stats, ts: Date.now() });
  return { problems, stats };
}

function makeCFUrl(contestId: number, index: string): string {
  return `https://codeforces.com/contest/${contestId}/problem/${index}`;
}

function makeProblemKey(contestId: number, index: string): string {
  return `${contestId}-${index}`;
}

// ─── Pick one problem at a target rating ─────────────────────────────────────

interface CandidateEntry {
  problem: CFProblemRaw;
  solvedCount: number;
}

function pickProblem(
  candidates: CandidateEntry[],
  targetRating: number,
  usedKeys: Set<string>,
  solvedKeys: Set<string>,
  tolerance = 100
): CandidateEntry | null {
  const eligible = candidates.filter((c) => {
    if (!c.problem.contestId) return false; // skip gym problems
    if (c.problem.rating == null) return false;
    if (Math.abs(c.problem.rating - targetRating) > tolerance) return false;
    const key = makeProblemKey(c.problem.contestId, c.problem.index);
    if (usedKeys.has(key)) return false;
    if (solvedKeys.has(key)) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Prefer highly-solved problems (well-tested, less likely to be broken)
  // but add randomness so repeated calls return different sets
  eligible.sort((a, b) => b.solvedCount - a.solvedCount);
  const top = eligible.slice(0, Math.min(10, eligible.length));
  return top[Math.floor(Math.random() * top.length)];
}

// ─── POST /api/contest/generate ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    userRating: number;
    weakTopicIds: string[];
    solvedKeys?: string[];
    userId?: string;
    durationMinutes?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    userRating,
    weakTopicIds = [],
    solvedKeys: solvedArr = [],
    userId,
    durationMinutes = 90,
  } = body;

  if (!userRating || typeof userRating !== "number") {
    return NextResponse.json({ error: "Missing or invalid userRating" }, { status: 400 });
  }

  const rating = Math.max(800, Math.min(3200, userRating));

  // ── Difficulty targets for 5 slots ────────────────────────────────────────
  // Clamp each target to [800, 3500]
  const targets = [-200, -100, 0, +100, +200].map((delta) =>
    Math.max(800, Math.min(3500, rating + delta))
  );

  // Round to nearest 100 (CF ratings are multiples of 100)
  const roundedTargets = targets.map((t) => Math.round(t / 100) * 100);

  // ── Determine tags to fetch ────────────────────────────────────────────────
  // Top 2 weak topic tags + 3 general tags for variety
  const weakCFTags = weakTopicIds
    .slice(0, 2)
    .map((id) => TOPIC_CF_TAG[id])
    .filter(Boolean) as string[];

  // Fill with general tags if fewer than 2 weak topics provided
  const generalFill = GENERAL_TOPIC_TAGS.filter((t) => !weakCFTags.includes(t));
  const generalTags = generalFill.slice(0, Math.max(3, 5 - weakCFTags.length));

  const allTags = Array.from(new Set([...weakCFTags, ...generalTags]));

  // ── Fetch candidates in parallel ──────────────────────────────────────────
  const tagCandidates = new Map<string, CandidateEntry[]>();

  await Promise.allSettled(
    allTags.map(async (tag) => {
      try {
        const { problems, stats } = await fetchCFProblemsForTag(tag);
        const entries: CandidateEntry[] = problems
          .filter((p) => p.contestId != null && p.rating != null)
          .map((p) => ({
            problem: p,
            solvedCount: stats.get(makeProblemKey(p.contestId!, p.index)) ?? 0,
          }));
        tagCandidates.set(tag, entries);
      } catch (err) {
        console.error(`[contest/generate] CF fetch failed for tag "${tag}":`, err);
      }
    })
  );

  if (tagCandidates.size === 0) {
    return NextResponse.json(
      { error: "Failed to fetch problems from Codeforces. Try again shortly." },
      { status: 502 }
    );
  }

  // ── Assign problems to slots ───────────────────────────────────────────────
  const solvedSet = new Set(solvedArr);
  const usedKeys = new Set<string>();
  const problems: ContestProblem[] = [];

  for (let slot = 0; slot < 5; slot++) {
    const targetRating = roundedTargets[slot];
    const isWeakSlot = slot < weakCFTags.length;
    const preferTag = isWeakSlot ? weakCFTags[slot] : null;

    let picked: CandidateEntry | null = null;
    let usedWeakTopic = false;

    // First try preferred tag (weak topic for slots 0-1)
    if (preferTag && tagCandidates.has(preferTag)) {
      picked = pickProblem(tagCandidates.get(preferTag)!, targetRating, usedKeys, solvedSet);
      if (picked) usedWeakTopic = true;
    }

    // Fall back to general tags if preferred tag had no match
    if (!picked) {
      for (const tag of generalTags) {
        if (!tagCandidates.has(tag)) continue;
        picked = pickProblem(tagCandidates.get(tag)!, targetRating, usedKeys, solvedSet);
        if (picked) break;
      }
    }

    // Widen tolerance to ±200 as last resort
    if (!picked) {
      for (const [, entries] of Array.from(tagCandidates)) {
        picked = pickProblem(entries, targetRating, usedKeys, solvedSet, 200);
        if (picked) break;
      }
    }

    if (!picked) {
      return NextResponse.json(
        { error: `Could not find a problem for slot ${slot + 1} (target rating ${targetRating}). Try again.` },
        { status: 422 }
      );
    }

    const p = picked.problem;
    const key = makeProblemKey(p.contestId!, p.index);
    usedKeys.add(key);

    // Resolve weak topic label
    let weakTopicId: string | undefined;
    let weakTopicLabel: string | undefined;
    if (usedWeakTopic && isWeakSlot) {
      weakTopicId = weakTopicIds[slot];
      const topicDef = TOPICS.find((t) => t.id === weakTopicId);
      weakTopicLabel = topicDef?.label;
    }

    problems.push({
      problemKey: key,
      contestId: p.contestId!,
      index: p.index,
      name: p.name,
      rating: p.rating!,
      tags: p.tags.filter((t) => !t.startsWith("*")).slice(0, 6),
      cfUrl: makeCFUrl(p.contestId!, p.index),
      slot: slot + 1,
      slotLabel: SLOT_LABELS[slot],
      isWeakTopic: usedWeakTopic,
      weakTopicId,
      weakTopicLabel,
      solvedCount: picked.solvedCount,
      maxScore: SLOT_MAX_SCORES[slot],
    });
  }

  // ── Verify we have ≥2 problems from weak topics ────────────────────────────
  const weakCount = problems.filter((p) => p.isWeakTopic).length;
  // Log for debugging; not a hard failure (best-effort given CF data availability)
  if (weakCount < 2) {
    console.warn(
      `[contest/generate] Only ${weakCount}/2 weak topic problems placed (rating ${rating}, topics ${weakTopicIds.join(",")})`
    );
  }

  // ── Persist contest to Supabase ───────────────────────────────────────────
  let contestId: string | null = null;
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("virtual_contests")
      .insert({
        user_id: userId ?? null,
        problems,
        started_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
      })
      .select("id")
      .single();

    if (error) throw error;
    contestId = data.id as string;
  } catch (err) {
    // Non-fatal: return contest data even if DB write fails
    console.error("[contest/generate] Supabase insert failed:", err);
  }

  return NextResponse.json({
    contestId,
    problems,
    durationMinutes,
    startedAt: new Date().toISOString(),
    weakTopicsPlaced: weakCount,
  });
}
