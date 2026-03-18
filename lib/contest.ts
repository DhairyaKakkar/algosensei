// ─── Shared Contest Types ─────────────────────────────────────────────────────

export interface ContestProblem {
  problemKey: string;
  contestId: number;
  index: string;
  name: string;
  rating: number;
  tags: string[];
  cfUrl: string;
  /** 1–5, ordered easy → hard */
  slot: number;
  /** Human-readable slot name */
  slotLabel: string;
  /** True if this problem was selected to target a user weakness */
  isWeakTopic: boolean;
  weakTopicId?: string;
  weakTopicLabel?: string;
  /** Codeforces solve count at time of generation */
  solvedCount: number;
  /** Maximum points available for this problem */
  maxScore: number;
}

export type ProblemVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "SKIP";

export interface ProblemResult {
  problemKey: string;
  verdict: ProblemVerdict;
  /** Number of wrong/error submissions before final verdict */
  wrongAttempts: number;
  /** Minutes from contest start to AC, or null if not solved */
  solveTimeMinutes: number | null;
  /** Points awarded (0 if not solved) */
  score: number;
}

export interface ContestResults {
  problems: ProblemResult[];
  totalScore: number;
  solvedCount: number;
  /** GPT-4o generated post-contest analysis */
  analysis: string;
}

export interface VirtualContest {
  id: string;
  userId: string | null;
  problems: ContestProblem[];
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  results: ContestResults | null;
  score: number | null;
}

// ─── Score calculation ────────────────────────────────────────────────────────

/**
 * Codeforces-style scoring per problem.
 * Max score decreases with time and wrong attempts.
 * Floor is 30% of max score (for solve with no penalty).
 */
export function calcProblemScore(
  maxScore: number,
  solveTimeMinutes: number,
  wrongAttempts: number
): number {
  const timePenalty = Math.floor(solveTimeMinutes) * 10;
  const attemptPenalty = wrongAttempts * 50;
  const raw = maxScore - timePenalty - attemptPenalty;
  return Math.max(Math.round(maxScore * 0.3), raw);
}

// ─── Max scores per slot (500 / 750 / 1000 / 1250 / 1500) ──────────────────

export const SLOT_MAX_SCORES = [500, 750, 1000, 1250, 1500] as const;

export const SLOT_LABELS = [
  "Warm-up",
  "Practice",
  "Challenge",
  "Stretch",
  "Peak",
] as const;

// ─── Topic → primary CF query tag ────────────────────────────────────────────

export const TOPIC_CF_TAG: Record<string, string> = {
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

/** Fallback general topics used for non-weak-topic slots */
export const GENERAL_TOPIC_TAGS = [
  "greedy",
  "implementation",
  "math",
  "binary search",
  "constructive algorithms",
];
