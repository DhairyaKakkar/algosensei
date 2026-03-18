import { NextRequest, NextResponse } from "next/server";
import {
  CFApiError,
  fetchAllSubmissions,
  fetchUserInfo,
  processSubmissions,
} from "@/lib/codeforces";
import { buildSkillProfile } from "@/lib/analysis";
import { createServiceClient } from "@/lib/supabase-server";
import type { ProcessedSubmission } from "@/lib/codeforces";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CFRatingChange {
  contestId: number;
  contestName: string;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

export interface DayActivity {
  count: number;
  problems: { name: string; rating?: number; contestId?: number; index: string }[];
}

export interface ProgressStats {
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
  avgSolveMins: number | null;
  weeklyTrend: number[]; // last 8 weeks, index 0 = oldest
  mostImprovedTopic: string | null;
  mostImprovedTopicLabel: string | null;
  mostImprovedTopicDelta: number | null;
}

export interface ProgressResponse {
  handle: string;
  rating: number;
  rank: string;
  ratingHistory: { date: string; rating: number; contestName: string; ratingChange: number }[];
  activityMap: Record<string, DayActivity>;
  currentSkillProfile: ReturnType<typeof buildSkillProfile>;
  snapshots: { date: string; topicScores: Record<string, number>; overallScore: number }[];
  stats: ProgressStats;
}

// ─── CF rating history fetch ──────────────────────────────────────────────────

async function fetchRatingHistory(handle: string): Promise<CFRatingChange[]> {
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.status === "OK" ? (json.result ?? []) : [];
  } catch {
    return [];
  }
}

// ─── Activity map (last 365 days, unique problems per day) ───────────────────

function buildActivityMap(
  submissions: ProcessedSubmission[]
): Record<string, DayActivity> {
  const cutoff = Math.floor(Date.now() / 1000) - 365 * 86400;
  const map: Record<string, DayActivity> = {};
  const seenPerDay = new Map<string, Set<string>>();

  for (const s of submissions) {
    if (s.verdict !== "OK" || s.submittedAt < cutoff) continue;

    const d = new Date(s.submittedAt * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

    if (!seenPerDay.has(key)) seenPerDay.set(key, new Set());
    const seen = seenPerDay.get(key)!;
    if (seen.has(s.problemKey)) continue;
    seen.add(s.problemKey);

    if (!map[key]) map[key] = { count: 0, problems: [] };
    map[key].count++;
    map[key].problems.push({
      name: s.problemName,
      rating: s.rating,
      contestId: s.contestId,
      index: s.index,
    });
  }

  return map;
}

// ─── Stats computation ────────────────────────────────────────────────────────

function computeStats(
  submissions: ProcessedSubmission[],
  activityMap: Record<string, DayActivity>
): Omit<ProgressStats, "mostImprovedTopic" | "mostImprovedTopicLabel" | "mostImprovedTopicDelta"> {
  // Total unique solved
  const solvedKeys = new Set<string>();
  submissions.filter((s) => s.verdict === "OK").forEach((s) => solvedKeys.add(s.problemKey));

  // Streak — build sorted set of active days
  const activeDays = Object.keys(activityMap).sort();
  const activeDaySet = new Set(activeDays);

  // Current streak: walk backwards from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let currentStreak = 0;
  const walker = new Date(today);
  while (true) {
    const key = `${walker.getFullYear()}-${String(walker.getMonth() + 1).padStart(2, "0")}-${String(
      walker.getDate()
    ).padStart(2, "0")}`;
    if (activeDaySet.has(key)) {
      currentStreak++;
      walker.setDate(walker.getDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak: iterate consecutive days
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;
  for (const dayStr of activeDays) {
    const [y, m, d] = dayStr.split("-").map(Number);
    const cur = new Date(y, m - 1, d);
    if (prevDate) {
      const diff = Math.round((cur.getTime() - prevDate.getTime()) / 86400000);
      tempStreak = diff === 1 ? tempStreak + 1 : 1;
    } else {
      tempStreak = 1;
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    prevDate = cur;
  }

  // Weekly trend (last 8 weeks, index 0 = 8 weeks ago)
  const weeklyTrend: number[] = [];
  for (let w = 7; w >= 0; w--) {
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);

    let count = 0;
    for (const dayStr of activeDays) {
      const [y, m, d] = dayStr.split("-").map(Number);
      const cur = new Date(y, m - 1, d);
      if (cur >= weekStart && cur <= weekEnd) count += activityMap[dayStr].count;
    }
    weeklyTrend.push(count);
  }

  // Avg solve time: for problems with multi-attempt history, time from first to AC
  const problemTimes = new Map<string, { first: number; ac: number | null }>();
  for (const s of submissions) {
    const entry = problemTimes.get(s.problemKey);
    if (!entry) {
      problemTimes.set(s.problemKey, { first: s.submittedAt, ac: null });
    } else {
      if (s.submittedAt < entry.first) entry.first = s.submittedAt;
      if (s.verdict === "OK" && entry.ac === null) entry.ac = s.submittedAt;
    }
  }

  const solveMins: number[] = [];
  Array.from(problemTimes.values()).forEach(({ first, ac }) => {
    if (ac !== null && ac > first + 60) {
      // Only count if gap > 1 min (filters same-submission noise)
      solveMins.push((ac - first) / 60);
    }
  });
  const avgSolveMins =
    solveMins.length > 5
      ? Math.round(solveMins.reduce((a, b) => a + b, 0) / solveMins.length)
      : null;

  return {
    totalSolved: solvedKeys.size,
    currentStreak,
    longestStreak,
    weeklyTrend,
    avgSolveMins,
  };
}

// ─── GET /api/progress ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle")?.trim();
  const userId = req.nextUrl.searchParams.get("userId");

  if (!handle) return NextResponse.json({ error: "Missing handle" }, { status: 400 });
  if (!/^[a-zA-Z0-9_\-.]{3,24}$/.test(handle))
    return NextResponse.json({ error: "Invalid handle format" }, { status: 400 });

  try {
    const [user, ratingChanges, { submissions }] = await Promise.all([
      fetchUserInfo(handle),
      fetchRatingHistory(handle),
      fetchAllSubmissions(handle),
    ]);

    const processed = processSubmissions(submissions);
    const skillProfile = buildSkillProfile(processed, user.rating);
    const activityMap = buildActivityMap(processed);
    const baseStats = computeStats(processed, activityMap);

    const ratingHistory = ratingChanges.map((r) => ({
      date: new Date(r.ratingUpdateTimeSeconds * 1000).toISOString().split("T")[0],
      rating: r.newRating,
      contestName: r.contestName,
      ratingChange: r.newRating - r.oldRating,
    }));

    // ── Supabase: snapshots ───────────────────────────────────────────────────
    let snapshots: ProgressResponse["snapshots"] = [];
    let mostImprovedTopic: string | null = null;
    let mostImprovedTopicLabel: string | null = null;
    let mostImprovedTopicDelta: number | null = null;

    if (userId) {
      try {
        const db = createServiceClient();
        const todayStr = new Date().toISOString().split("T")[0];

        // Build today's topic scores (only topics with enough data)
        const topicScores: Record<string, number> = {};
        skillProfile.topics.forEach((t) => {
          if (t.attempted >= 3) topicScores[t.topicId] = t.skillScore;
        });

        // Upsert today's snapshot
        await db.from("skill_snapshots").upsert(
          {
            user_id: userId,
            handle,
            topic_scores: topicScores,
            overall_score: skillProfile.overallScore,
            snapshot_date: todayStr,
          },
          { onConflict: "user_id,snapshot_date" }
        );

        const { data: rows } = await db
          .from("skill_snapshots")
          .select("snapshot_date, topic_scores, overall_score")
          .eq("user_id", userId)
          .order("snapshot_date", { ascending: true })
          .limit(52);

        snapshots = (rows ?? []).map((r) => ({
          date: r.snapshot_date as string,
          topicScores: r.topic_scores as Record<string, number>,
          overallScore: r.overall_score as number,
        }));

        // Most improved: compare oldest vs newest snapshot
        if (snapshots.length >= 2) {
          const oldest = snapshots[0].topicScores;
          const newest = snapshots[snapshots.length - 1].topicScores;
          let maxDelta = -Infinity;
          Object.keys(newest).forEach((topicId) => {
            if (oldest[topicId] != null) {
              const delta = newest[topicId] - oldest[topicId];
              if (delta > maxDelta) {
                maxDelta = delta;
                mostImprovedTopic = topicId;
                mostImprovedTopicDelta = delta;
              }
            }
          });
          if (mostImprovedTopic) {
            const td = skillProfile.topics.find((t) => t.topicId === mostImprovedTopic);
            mostImprovedTopicLabel = td?.label ?? mostImprovedTopic;
          }
        } else {
          // No history yet — surface strongest topic
          const strongest = skillProfile.strongestTopics[0];
          if (strongest) {
            mostImprovedTopic = strongest.topicId;
            mostImprovedTopicLabel = strongest.label;
            mostImprovedTopicDelta = null;
          }
        }
      } catch (err) {
        console.error("[progress] Supabase error:", err);
      }
    }

    const response: ProgressResponse = {
      handle: user.handle,
      rating: user.rating,
      rank: user.rank,
      ratingHistory,
      activityMap,
      currentSkillProfile: skillProfile,
      snapshots,
      stats: {
        ...baseStats,
        mostImprovedTopic,
        mostImprovedTopicLabel,
        mostImprovedTopicDelta,
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    if (err instanceof CFApiError && err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: `Handle "${handle}" not found on Codeforces.` },
        { status: 404 }
      );
    }
    console.error("[progress] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load progress" },
      { status: 502 }
    );
  }
}
