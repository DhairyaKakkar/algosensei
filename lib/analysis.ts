// ─── Rating Brackets ─────────────────────────────────────────────────────────

export interface RatingBracketDef {
  label: string;
  min: number;
  max: number;
  midpoint: number;
}

export const RATING_BRACKETS: RatingBracketDef[] = [
  { label: "800–1000",  min: 800,  max: 999,  midpoint: 900  },
  { label: "1000–1200", min: 1000, max: 1199, midpoint: 1100 },
  { label: "1200–1400", min: 1200, max: 1399, midpoint: 1300 },
  { label: "1400–1600", min: 1400, max: 1599, midpoint: 1500 },
  { label: "1600–1800", min: 1600, max: 1799, midpoint: 1700 },
  { label: "1800+",     min: 1800, max: 9999, midpoint: 2000 },
];

// ─── Canonical Topic Groups ───────────────────────────────────────────────────

export interface TopicDef {
  id: string;
  label: string;
  shortLabel: string;
  tags: string[]; // CF tags that belong to this topic
}

export const TOPICS: TopicDef[] = [
  {
    id: "dp",
    label: "Dynamic Programming",
    shortLabel: "DP",
    tags: [
      "dp",
      "bitmask dp",
      "digit dp",
      "tree dp",
      "broken profile dp",
      "knapsack dp",
    ],
  },
  {
    id: "graphs",
    label: "Graphs & Trees",
    shortLabel: "Graphs",
    tags: [
      "graphs",
      "trees",
      "dfs and similar",
      "shortest paths",
      "minimum spanning tree",
      "flows",
      "bipartite graphs",
      "topological sort",
      "lca",
      "bridge",
      "2-sat",
      "strongly connected components",
      "euler path",
      "graph matchings",
    ],
  },
  {
    id: "greedy",
    label: "Greedy",
    shortLabel: "Greedy",
    tags: ["greedy", "constructive algorithms", "sortings"],
  },
  {
    id: "math",
    label: "Math & Number Theory",
    shortLabel: "Math",
    tags: [
      "math",
      "number theory",
      "combinatorics",
      "geometry",
      "probabilities",
      "matrices",
      "fft",
      "chinese remainder theorem",
    ],
  },
  {
    id: "ds",
    label: "Data Structures",
    shortLabel: "DS",
    tags: [
      "data structures",
      "segment tree",
      "fenwick tree",
      "binary indexed tree",
      "sqrt decomposition",
      "disjoint set union",
      "heap",
      "hashing",
      "treap",
      "persistent data structures",
      "link cut tree",
    ],
  },
  {
    id: "binsearch",
    label: "Binary Search",
    shortLabel: "BinSearch",
    tags: ["binary search", "two pointers", "ternary search"],
  },
  {
    id: "strings",
    label: "Strings",
    shortLabel: "Strings",
    tags: [
      "strings",
      "string suffix structures",
      "palindromes",
      "kmp",
      "z-function",
      "aho-corasick",
      "suffix array",
      "suffix automaton",
    ],
  },
  {
    id: "impl",
    label: "Implementation",
    shortLabel: "Impl",
    tags: ["implementation", "brute force", "simulation"],
  },
  {
    id: "geometry",
    label: "Geometry",
    shortLabel: "Geo",
    tags: ["geometry", "convex hull", "line sweep"],
  },
  {
    id: "games",
    label: "Games & Interactive",
    shortLabel: "Games",
    tags: ["games", "game theory", "interactive"],
  },
];

// Build reverse-lookup: CF tag → topic id
const TAG_TO_TOPIC = new Map<string, string>();
TOPICS.forEach((topic) => {
  topic.tags.forEach((tag) => TAG_TO_TOPIC.set(tag.toLowerCase(), topic.id));
});

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface BracketStat {
  bracketLabel: string;
  midpoint: number;
  attempted: number;
  solved: number;
  solveRate: number;
  expectedSolveRate: number;
  delta: number; // solveRate - expectedSolveRate
}

export interface TopicSkill {
  topicId: string;
  label: string;
  shortLabel: string;
  skillScore: number; // 0–100
  solveRate: number;
  expectedSolveRate: number;
  attempted: number;
  solved: number;
  brackets: BracketStat[];
  /** Rating threshold where the user's solve rate starts falling below expected */
  failureThreshold: number | null;
}

export interface WeakTopicInsight {
  topicId: string;
  label: string;
  shortLabel: string;
  skillScore: number;
  failureThreshold: number | null;
  recommendation: string;
  attempted: number;
}

export interface RadarPoint {
  topic: string;   // shortLabel
  score: number;   // 0–100
  fullMark: number; // always 100
}

export interface SkillProfile {
  overallScore: number; // weighted average skill score, 0–100
  topics: TopicSkill[];
  weakestTopics: WeakTopicInsight[]; // top 5
  strongestTopics: WeakTopicInsight[]; // top 5
  radarData: RadarPoint[];
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Logistic model for expected solve rate.
 * No offset — at same rating the expected solve rate is 50%.
 * Scale 300 gives a moderate curve:
 *   user +400 above problem → ~80% expected
 *   user at problem rating  → 50%
 *   user -400 below problem → ~26%
 */
function expectedSolveRate(userRating: number, problemMidpoint: number): number {
  return 1 / (1 + Math.exp(-(userRating - problemMidpoint) / 300));
}

/**
 * Skill score for a topic (0–100).
 *
 * Scoring is piecewise relative to expectations:
 *   ratio < 1 (below expected):  score = ratio × 40         → 0–40
 *   ratio ≥ 1 (above expected):  score = 40 + (ratio-1)/(MAX_RATIO-1) × 60 → 40–100
 *
 * This means:
 *   • Exactly meeting expectations (ratio = 1) → 40 (below average)
 *   • 1.5× expected → 60  |  2× expected → 73  |  2.5× expected → 100
 *
 * The high cap (MAX_RATIO = 2.5) means you need to significantly exceed expectations
 * to score in the 80–100 range — resisting the selection-bias inflation where
 * practice submissions have artificially high solve rates.
 *
 * Confidence blends toward 50 when sample size is small (threshold 30 problems).
 */
const MAX_RATIO = 2.5;

function computeSkillScore(
  solveRate: number,
  expRate: number,
  attempted: number
): number {
  if (attempted === 0) return 50;
  const confidence = Math.min(attempted / 30, 1);
  const ratio = expRate > 0 ? Math.min(solveRate / expRate, MAX_RATIO) : 1;

  let raw: number;
  if (ratio <= 1) {
    raw = ratio * 40;
  } else {
    raw = 40 + ((ratio - 1) / (MAX_RATIO - 1)) * 60;
  }

  const score = raw * confidence + 50 * (1 - confidence);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Find the lowest rating bracket where the user's solve rate drops below expected.
 * Returns null if it never drops below expected (or not enough data).
 */
function findFailureThreshold(brackets: BracketStat[]): number | null {
  for (const b of brackets) {
    if (b.attempted >= 3 && b.delta < -0.1) return b.midpoint;
  }
  return null;
}

export function generateRecommendation(topic: TopicSkill): string {
  const { skillScore, failureThreshold, attempted } = topic;

  if (attempted < 3) {
    return `Barely any ${topic.label} problems attempted — try 5–10 to calibrate your baseline.`;
  }

  if (skillScore < 40) {
    if (failureThreshold !== null) {
      return `Your ${topic.label} starts breaking down around rating ${failureThreshold}. Grind targeted ${failureThreshold}-rated problems until you can solve them comfortably.`;
    }
    return `${topic.label} is a significant weakness. Start with rating 800–1200 problems in this tag to build fundamentals.`;
  }

  if (skillScore < 55) {
    if (failureThreshold !== null) {
      return `${topic.label} is inconsistent above rating ${failureThreshold}. Focus timed practice at that difficulty.`;
    }
    return `${topic.label} is below average. Review core patterns and solve 10+ problems across different subtypes.`;
  }

  if (skillScore >= 70) {
    return `Strong ${topic.label} skills. Push harder difficulty (${
      failureThreshold ?? "1800+"
    }) for continued growth.`;
  }

  return `${topic.label} is solid. Maintain volume and occasionally attempt problems 200+ above your comfort zone.`;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

import type { ProcessedSubmission } from "@/lib/codeforces";

export function buildSkillProfile(
  allSubmissions: ProcessedSubmission[],
  userRating: number
): SkillProfile {
  // ── Step 1: Group submissions by problem key (de-duplicate) ──────────────────
  const byProblem = new Map<
    string,
    { sub: ProcessedSubmission; solved: boolean; attempts: number }
  >();

  allSubmissions.forEach((s) => {
    const existing = byProblem.get(s.problemKey);
    const isSolved = s.verdict === "OK";
    if (!existing) {
      byProblem.set(s.problemKey, { sub: s, solved: isSolved, attempts: 1 });
    } else {
      existing.attempts += 1;
      if (isSolved) existing.solved = true;
    }
  });

  // ── Step 2: Map each problem to its canonical topic(s) ───────────────────────
  // topic id → bracket midpoint → { attempted: Set<key>, solved: Set<key> }
  const topicBracketMap = new Map<
    string,
    Map<number, { attempted: Set<string>; solved: Set<string> }>
  >();

  TOPICS.forEach((t) => topicBracketMap.set(t.id, new Map()));

  byProblem.forEach(({ sub, solved }, key) => {
    const matchedTopics = new Set<string>();
    sub.tags.forEach((rawTag) => {
      const topicId = TAG_TO_TOPIC.get(rawTag.toLowerCase());
      if (topicId) matchedTopics.add(topicId);
    });

    matchedTopics.forEach((topicId) => {
      const bracketMap = topicBracketMap.get(topicId)!;

      // Find which bracket this problem belongs to
      const rating = sub.rating;
      if (rating == null) return;

      const bracket = RATING_BRACKETS.find(
        (b) => rating >= b.min && rating <= b.max
      );
      if (!bracket) return;

      if (!bracketMap.has(bracket.midpoint)) {
        bracketMap.set(bracket.midpoint, {
          attempted: new Set(),
          solved: new Set(),
        });
      }
      const bs = bracketMap.get(bracket.midpoint)!;
      bs.attempted.add(key);
      if (solved) bs.solved.add(key);
    });
  });

  // ── Step 3: Build TopicSkill for each topic ──────────────────────────────────
  const topics: TopicSkill[] = TOPICS.map((topicDef) => {
    const bracketMap = topicBracketMap.get(topicDef.id)!;

    const brackets: BracketStat[] = RATING_BRACKETS.map((bDef) => {
      const data = bracketMap.get(bDef.midpoint);
      const attempted = data ? data.attempted.size : 0;
      const solved = data ? data.solved.size : 0;
      const solveRate = attempted > 0 ? solved / attempted : 0;
      const exp = expectedSolveRate(userRating, bDef.midpoint);
      return {
        bracketLabel: bDef.label,
        midpoint: bDef.midpoint,
        attempted,
        solved,
        solveRate,
        expectedSolveRate: exp,
        delta: solveRate - exp,
      };
    }).filter((b) => b.attempted >= 1); // only include brackets with data

    // Aggregate across all brackets
    let totalAttempted = 0;
    let totalSolved = 0;
    let weightedExpected = 0;

    brackets.forEach((b) => {
      totalAttempted += b.attempted;
      totalSolved += b.solved;
      weightedExpected += b.expectedSolveRate * b.attempted;
    });

    const overallSolveRate =
      totalAttempted > 0 ? totalSolved / totalAttempted : 0;
    const overallExpected =
      totalAttempted > 0 ? weightedExpected / totalAttempted : expectedSolveRate(userRating, 1300);

    const skillScore = computeSkillScore(
      overallSolveRate,
      overallExpected,
      totalAttempted
    );
    const failureThreshold = findFailureThreshold(
      brackets.sort((a, b) => a.midpoint - b.midpoint)
    );

    const topicSkill: TopicSkill = {
      topicId: topicDef.id,
      label: topicDef.label,
      shortLabel: topicDef.shortLabel,
      skillScore,
      solveRate: overallSolveRate,
      expectedSolveRate: overallExpected,
      attempted: totalAttempted,
      solved: totalSolved,
      brackets,
      failureThreshold,
    };

    return topicSkill;
  });

  // ── Step 4: Radar data — only topics with ≥5 problems (max 8) ───────────────
  const radarTopics = topics
    .filter((t) => t.attempted >= 5)
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 8);

  const radarData: RadarPoint[] = radarTopics.map((t) => ({
    topic: t.shortLabel,
    score: t.skillScore,
    fullMark: 100,
  }));

  // ── Step 5: Weak / strong lists — topics with ≥3 problems ───────────────────
  // Explicitly exclude zero-attempt topics; they have no signal and should
  // never appear in weakness lists regardless of their default skill score.
  const rankedTopics = topics
    .filter((t) => t.attempted >= 3)
    .sort((a, b) => a.skillScore - b.skillScore);

  function toInsight(t: TopicSkill): WeakTopicInsight {
    return {
      topicId: t.topicId,
      label: t.label,
      shortLabel: t.shortLabel,
      skillScore: t.skillScore,
      failureThreshold: t.failureThreshold,
      recommendation: generateRecommendation(t),
      attempted: t.attempted,
    };
  }

  const weakestTopics = rankedTopics.slice(0, 5).map(toInsight);
  const strongestTopics = rankedTopics
    .slice(-5)
    .reverse()
    .map(toInsight);

  // ── Step 6: Overall score — weighted by attempt volume ───────────────────────
  const scoredTopics = topics.filter((t) => t.attempted >= 3);
  const totalWeight = scoredTopics.reduce((sum, t) => sum + t.attempted, 0);
  const overallScore =
    totalWeight > 0
      ? Math.round(
          scoredTopics.reduce(
            (sum, t) => sum + t.skillScore * t.attempted,
            0
          ) / totalWeight
        )
      : 50;

  return {
    overallScore,
    topics,
    weakestTopics,
    strongestTopics,
    radarData,
  };
}

// ─── LeetCode skill profile ───────────────────────────────────────────────────

import type { LCTagCount } from "@/lib/leetcode";
import { LC_TAG_TO_TOPIC } from "@/lib/leetcode";

/**
 * Build a SkillProfile from LeetCode tag-level solved counts.
 * Since LC doesn't expose per-topic attempt counts, we estimate:
 *   attempted ≈ solved / 0.65 (typical ~65% topic solve rate)
 * Score is volume-based: score = 25 + 65 * (1 - exp(-solved/20)), capped at 90.
 */
export function buildLCSkillProfile(
  tagCounts: LCTagCount[],
  totalSolved: number
): SkillProfile {
  // Aggregate solved counts per canonical topic
  const topicSolved = new Map<string, number>();
  for (const { tagSlug, problemsSolved } of tagCounts) {
    const topicId = LC_TAG_TO_TOPIC[tagSlug];
    if (!topicId) continue;
    topicSolved.set(topicId, (topicSolved.get(topicId) ?? 0) + problemsSolved);
  }

  const topics: TopicSkill[] = TOPICS.map((topicDef) => {
    const solved = topicSolved.get(topicDef.id) ?? 0;
    // Estimated attempts (65% solve rate approximation)
    const attempted = solved > 0 ? Math.round(solved / 0.65) : 0;
    // Volume-based skill score, max 90 (acknowledging we lack solve-rate data)
    const rawScore = solved > 0 ? 25 + 65 * (1 - Math.exp(-solved / 20)) : 0;
    const skillScore = Math.round(Math.max(0, Math.min(90, rawScore)));

    return {
      topicId: topicDef.id,
      label: topicDef.label,
      shortLabel: topicDef.shortLabel,
      skillScore,
      solveRate: solved > 0 ? 0.65 : 0,
      expectedSolveRate: 0.5,
      attempted,
      solved,
      brackets: [],
      failureThreshold: null,
    };
  });

  const radarTopics = topics
    .filter((t) => t.solved >= 3)
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 8);

  const radarData: RadarPoint[] = radarTopics.map((t) => ({
    topic: t.shortLabel,
    score: t.skillScore,
    fullMark: 100,
  }));

  const rankedTopics = topics
    .filter((t) => t.solved >= 3)
    .sort((a, b) => a.skillScore - b.skillScore);

  const weakestTopics = rankedTopics.slice(0, 5).map(toInsightFn);
  const strongestTopics = rankedTopics.slice(-5).reverse().map(toInsightFn);

  const scoredTopics = topics.filter((t) => t.solved >= 3);
  const totalWeight = scoredTopics.reduce((s, t) => s + t.attempted, 0);
  const overallScore =
    totalWeight > 0
      ? Math.round(
          scoredTopics.reduce((s, t) => s + t.skillScore * t.attempted, 0) /
            totalWeight
        )
      : totalSolved > 0 ? 40 : 0;

  return { overallScore, topics, weakestTopics, strongestTopics, radarData };
}

// Shared insight builder (extracted for reuse)
function toInsightFn(t: TopicSkill): WeakTopicInsight {
  return {
    topicId: t.topicId,
    label: t.label,
    shortLabel: t.shortLabel,
    skillScore: t.skillScore,
    failureThreshold: t.failureThreshold,
    recommendation: generateRecommendation(t),
    attempted: t.attempted,
  };
}

// ─── Merge CF + LC skill profiles ────────────────────────────────────────────

/**
 * Merge two SkillProfiles (CF + LC) into a combined view.
 * For each topic, weighted average score by attempt count.
 * Returns whichever profile is non-null if only one is available.
 */
export function mergeSkillProfiles(
  cf: SkillProfile | null,
  lc: SkillProfile | null
): SkillProfile | null {
  if (!cf && !lc) return null;
  if (!cf) return lc;
  if (!lc) return cf;

  const topics: TopicSkill[] = TOPICS.map((topicDef) => {
    const cfT = cf.topics.find((t) => t.topicId === topicDef.id);
    const lcT = lc.topics.find((t) => t.topicId === topicDef.id);

    const cfAttempted = cfT?.attempted ?? 0;
    const lcAttempted = lcT?.attempted ?? 0;

    // Need data from at least one platform
    if (cfAttempted === 0 && lcAttempted === 0) {
      // No data on either platform
      return cfT ?? lcT ?? {
        topicId: topicDef.id,
        label: topicDef.label,
        shortLabel: topicDef.shortLabel,
        skillScore: 50,
        solveRate: 0,
        expectedSolveRate: 0.5,
        attempted: 0,
        solved: 0,
        brackets: [],
        failureThreshold: null,
      };
    }

    const totalAttempted = cfAttempted + lcAttempted;
    const cfScore = cfT?.skillScore ?? 50;
    const lcScore = lcT?.skillScore ?? 50;
    const mergedScore =
      cfAttempted === 0
        ? lcScore
        : lcAttempted === 0
        ? cfScore
        : Math.round(
            (cfScore * cfAttempted + lcScore * lcAttempted) / totalAttempted
          );

    return {
      topicId: topicDef.id,
      label: topicDef.label,
      shortLabel: topicDef.shortLabel,
      skillScore: mergedScore,
      solveRate: cfT?.solveRate ?? lcT?.solveRate ?? 0,
      expectedSolveRate: cfT?.expectedSolveRate ?? 0.5,
      attempted: totalAttempted,
      solved: (cfT?.solved ?? 0) + (lcT?.solved ?? 0),
      brackets: cfT?.brackets ?? [],
      failureThreshold: cfT?.failureThreshold ?? null,
    };
  });

  const radarTopics = topics
    .filter((t) => t.attempted >= 5)
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 8);

  const radarData: RadarPoint[] = radarTopics.map((t) => ({
    topic: t.shortLabel,
    score: t.skillScore,
    fullMark: 100,
  }));

  const rankedTopics = topics
    .filter((t) => t.attempted >= 3)
    .sort((a, b) => a.skillScore - b.skillScore);

  const weakestTopics = rankedTopics.slice(0, 5).map(toInsightFn);
  const strongestTopics = rankedTopics.slice(-5).reverse().map(toInsightFn);

  const scoredTopics = topics.filter((t) => t.attempted >= 3);
  const totalWeight = scoredTopics.reduce((s, t) => s + t.attempted, 0);
  const overallScore =
    totalWeight > 0
      ? Math.round(
          scoredTopics.reduce((s, t) => s + t.skillScore * t.attempted, 0) /
            totalWeight
        )
      : 50;

  return { overallScore, topics, weakestTopics, strongestTopics, radarData };
}
