// ─── Codeforces API Types ────────────────────────────────────────────────────

export interface CFApiResponse<T> {
  status: "OK" | "FAILED";
  comment?: string;
  result: T;
}

export interface CFUser {
  handle: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  organization?: string;
  contribution: number;
  rank: string;
  rating: number;
  maxRank: string;
  maxRating: number;
  lastOnlineTimeSeconds: number;
  registrationTimeSeconds: number;
  friendOfCount: number;
  avatar: string;
  titlePhoto: string;
}

export interface CFProblem {
  contestId?: number;
  problemsetName?: string;
  index: string;
  name: string;
  type: "PROGRAMMING" | "QUESTION";
  rating?: number;
  tags: string[];
}

export interface CFMember {
  handle: string;
  name?: string;
}

export interface CFAuthor {
  contestId?: number;
  members: CFMember[];
  participantType:
    | "CONTESTANT"
    | "PRACTICE"
    | "VIRTUAL"
    | "MANAGER"
    | "OUT_OF_COMPETITION";
  ghost: boolean;
  startTimeSeconds?: number;
}

export type CFVerdict =
  | "FAILED"
  | "OK"
  | "PARTIAL"
  | "COMPILATION_ERROR"
  | "RUNTIME_ERROR"
  | "WRONG_ANSWER"
  | "PRESENTATION_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "IDLENESS_LIMIT_EXCEEDED"
  | "SECURITY_VIOLATED"
  | "CRASHED"
  | "INPUT_PREPARATION_CRASHED"
  | "CHALLENGED"
  | "SKIPPED"
  | "TESTING"
  | "REJECTED";

export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds: number;
  problem: CFProblem;
  author: CFAuthor;
  programmingLanguage: string;
  verdict?: CFVerdict;
  testset: string;
  passedTestCount: number;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
  points?: number;
}

// ─── Processed / Derived Types ────────────────────────────────────────────────

/** Stable key for a problem (handles gym problems without contestId) */
export function problemKey(p: CFProblem): string {
  return `${p.contestId ?? p.problemsetName ?? "gym"}-${p.index}`;
}

export interface ProcessedSubmission {
  id: number;
  problemKey: string;
  problemName: string;
  contestId?: number;
  index: string;
  rating?: number;
  tags: string[];
  verdict: CFVerdict | "UNKNOWN";
  language: string;
  timeMs: number;
  submittedAt: number; // unix seconds
  participantType: CFAuthor["participantType"];
}

export interface TagStat {
  tag: string;
  attempted: number; // unique problems attempted
  solved: number;    // unique problems solved
  solveRate: number; // 0–1
  /** Problems tried multiple times and never solved — pure weakness signal */
  neverSolved: number;
}

export interface RatingBucket {
  rating: number;   // lower bound of bucket (e.g. 800, 900, …)
  attempted: number;
  solved: number;
  solveRate: number;
}

export interface WeakProblem {
  problemKey: string;
  problemName: string;
  rating?: number;
  tags: string[];
  attempts: number;
  bestVerdict: CFVerdict;
  contestId?: number;
  index: string;
}

export interface ProfileAnalysis {
  user: CFUser;
  stats: {
    totalSubmissions: number;
    uniqueAttempted: number;
    uniqueSolved: number;
    successRate: number; // solved / attempted
  };
  tagAnalysis: TagStat[];
  ratingBuckets: RatingBucket[];
  weakProblems: WeakProblem[]; // attempted ≥2 times, never solved
  recentSubmissions: ProcessedSubmission[];
  /** True when the user has >40 000 submissions and older ones were not fetched */
  submissionsCapped: boolean;
}

// ─── API Fetch Helpers ────────────────────────────────────────────────────────

const CF_API = "https://codeforces.com/api";

/** Fetch with a timeout so we don't hang indefinitely on CF's slow API */
async function cfFetch<T>(
  endpoint: string,
  timeoutMs = 15_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${CF_API}${endpoint}`, { signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new CFApiError("Codeforces API timed out. Try again in a moment.", "TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new CFApiError("Codeforces API rate limit hit. Wait a few seconds and retry.", "RATE_LIMIT");
    }
    throw new CFApiError(`Codeforces API returned HTTP ${res.status}`, "HTTP_ERROR");
  }

  const json = (await res.json()) as CFApiResponse<T>;

  if (json.status !== "OK") {
    const msg = json.comment ?? "Unknown Codeforces API error";
    if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("handle")) {
      throw new CFApiError(`Handle not found on Codeforces: ${msg}`, "NOT_FOUND");
    }
    throw new CFApiError(msg, "API_ERROR");
  }

  return json.result;
}

export class CFApiError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "RATE_LIMIT" | "TIMEOUT" | "HTTP_ERROR" | "API_ERROR"
  ) {
    super(message);
    this.name = "CFApiError";
  }
}

/** Fetch a single user's profile */
export async function fetchUserInfo(handle: string): Promise<CFUser> {
  const users = await cfFetch<CFUser[]>(
    `/user.info?handles=${encodeURIComponent(handle)}`
  );
  if (!users[0]) {
    throw new CFApiError(`Handle "${handle}" not found on Codeforces.`, "NOT_FOUND");
  }
  return users[0];
}

/**
 * Fetch ALL submissions for a handle.
 * CF API caps each call at 10 000; we paginate up to MAX_PAGES to stay within
 * the route's maxDuration budget (each page is one ~15 s fetch, 4 pages ≈ 60 s).
 * Returns a `capped` flag if the user has more submissions than we fetched.
 */
export const SUBMISSION_PAGE_SIZE = 10_000;
const MAX_PAGES = 4; // 40 000 submissions max — covers ~99.9% of users

export async function fetchAllSubmissions(
  handle: string
): Promise<{ submissions: CFSubmission[]; capped: boolean }> {
  const all: CFSubmission[] = [];
  let from = 1;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const batch = await cfFetch<CFSubmission[]>(
      `/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${SUBMISSION_PAGE_SIZE}`
    );
    all.push(...batch);
    pages++;
    if (batch.length < SUBMISSION_PAGE_SIZE) return { submissions: all, capped: false };
    from += SUBMISSION_PAGE_SIZE;
  }

  // Reached the page cap — there may be older submissions we didn't fetch
  return { submissions: all, capped: true };
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

/** Verdict priority for "best attempt" ranking (higher index = better) */
const VERDICT_RANK: Partial<Record<CFVerdict, number>> = {
  WRONG_ANSWER: 1,
  RUNTIME_ERROR: 2,
  TIME_LIMIT_EXCEEDED: 3,
  MEMORY_LIMIT_EXCEEDED: 3,
  COMPILATION_ERROR: 0,
  PARTIAL: 4,
  OK: 5,
};

function betterVerdict(a: CFVerdict, b: CFVerdict): CFVerdict {
  return (VERDICT_RANK[a] ?? 0) >= (VERDICT_RANK[b] ?? 0) ? a : b;
}

export function processSubmissions(raw: CFSubmission[]): ProcessedSubmission[] {
  return raw.map((s) => ({
    id: s.id,
    problemKey: problemKey(s.problem),
    problemName: s.problem.name,
    contestId: s.problem.contestId ?? s.contestId,
    index: s.problem.index,
    rating: s.problem.rating,
    tags: s.problem.tags,
    verdict: s.verdict ?? "UNKNOWN",
    language: s.programmingLanguage,
    timeMs: s.timeConsumedMillis,
    submittedAt: s.creationTimeSeconds,
    participantType: s.author.participantType,
  }));
}

export function analyzeSubmissions(
  user: CFUser,
  raw: CFSubmission[],
  submissionsCapped = false
): ProfileAnalysis {
  const processed = processSubmissions(raw);

  // Only count non-practice/virtual submissions for clean stats? Actually we
  // want all attempts so practice submissions count toward weakness analysis.
  const byProblem = new Map<
    string,
    { sub: ProcessedSubmission; attempts: number; bestVerdict: CFVerdict }
  >();

  for (const s of processed) {
    const existing = byProblem.get(s.problemKey);
    const verdict = s.verdict === "UNKNOWN" ? "FAILED" : (s.verdict as CFVerdict);
    if (!existing) {
      byProblem.set(s.problemKey, { sub: s, attempts: 1, bestVerdict: verdict });
    } else {
      existing.attempts += 1;
      existing.bestVerdict = betterVerdict(existing.bestVerdict, verdict);
    }
  }

  const solvedKeys = new Set<string>();
  Array.from(byProblem.entries()).forEach(([key, { bestVerdict }]) => {
    if (bestVerdict === "OK") solvedKeys.add(key);
  });

  // ── Tag analysis ────────────────────────────────────────────────────────────
  const tagMap = new Map<string, { attempted: Set<string>; solved: Set<string> }>();

  Array.from(byProblem.entries()).forEach(([key, { sub, bestVerdict }]) => {
    sub.tags.forEach((tag) => {
      if (!tagMap.has(tag)) tagMap.set(tag, { attempted: new Set(), solved: new Set() });
      const t = tagMap.get(tag)!;
      t.attempted.add(key);
      if (bestVerdict === "OK") t.solved.add(key);
    });
  });

  const tagAnalysis: TagStat[] = Array.from(tagMap.entries())
    // Filter CF-internal meta-tags that start with '*' (e.g. "*special", "*extra")
    .filter(([tag]) => !tag.startsWith("*"))
    .map(([tag, { attempted, solved }]) => {
      const neverSolved = Array.from(attempted).filter((k) => !solved.has(k)).length;
      return {
        tag,
        attempted: attempted.size,
        solved: solved.size,
        solveRate: attempted.size > 0 ? solved.size / attempted.size : 0,
        neverSolved,
      };
    })
    .sort((a, b) => b.neverSolved - a.neverSolved || a.solveRate - b.solveRate);

  // ── Rating bucket analysis ───────────────────────────────────────────────────
  const ratingMap = new Map<number, { attempted: Set<string>; solved: Set<string> }>();

  Array.from(byProblem.entries()).forEach(([key, { sub, bestVerdict }]) => {
    if (sub.rating == null) return;
    const bucket = Math.floor(sub.rating / 100) * 100;
    if (!ratingMap.has(bucket)) ratingMap.set(bucket, { attempted: new Set(), solved: new Set() });
    const b = ratingMap.get(bucket)!;
    b.attempted.add(key);
    if (bestVerdict === "OK") b.solved.add(key);
  });

  const ratingBuckets: RatingBucket[] = Array.from(ratingMap.entries())
    // Require at least 2 unique problems so single-attempt outliers don't show a misleading 0%
    .filter(([, { attempted }]) => attempted.size >= 2)
    .map(([rating, { attempted, solved }]) => ({
      rating,
      attempted: attempted.size,
      solved: solved.size,
      solveRate: attempted.size > 0 ? solved.size / attempted.size : 0,
    }))
    .sort((a, b) => a.rating - b.rating);

  // ── Weak problems (≥2 attempts, never solved) ────────────────────────────────
  const weakProblems: WeakProblem[] = Array.from(byProblem.entries())
    .filter(([, { attempts, bestVerdict }]) => attempts >= 2 && bestVerdict !== "OK")
    .map(([, { sub, attempts, bestVerdict }]) => ({
      problemKey: sub.problemKey,
      problemName: sub.problemName,
      rating: sub.rating,
      tags: sub.tags,
      attempts,
      bestVerdict,
      contestId: sub.contestId,
      index: sub.index,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  return {
    user,
    stats: {
      totalSubmissions: processed.length,
      uniqueAttempted: byProblem.size,
      uniqueSolved: solvedKeys.size,
      successRate: byProblem.size > 0 ? solvedKeys.size / byProblem.size : 0,
    },
    tagAnalysis,
    ratingBuckets,
    weakProblems,
    recentSubmissions: processed.slice(0, 50),
    submissionsCapped,
  };
}
