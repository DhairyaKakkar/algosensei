// LeetCode GraphQL API — all requests are server-side only (avoids CORS)

const LC_GQL = "https://leetcode.com/graphql";
const TIMEOUT_MS = 15_000;

// ─── Tag mapping: LC slug → canonical topic ID (matches lib/analysis.ts) ──────

export const LC_TAG_TO_TOPIC: Record<string, string> = {
  // Dynamic Programming
  "dynamic-programming": "dp",
  memoization: "dp",

  // Graphs & Trees
  graph: "graphs",
  "depth-first-search": "graphs",
  "breadth-first-search": "graphs",
  "topological-sort": "graphs",
  "union-find": "graphs",
  "shortest-path": "graphs",
  "minimum-spanning-tree": "graphs",
  "biconnected-component": "graphs",
  "strongly-connected-component": "graphs",
  "euler-circuit": "graphs",

  // Greedy
  greedy: "greedy",
  sorting: "greedy",
  counting: "greedy",

  // Math & Number Theory
  math: "math",
  "number-theory": "math",
  combinatorics: "math",
  "probability-and-statistics": "math",
  matrix: "math",

  // Data Structures
  stack: "ds",
  queue: "ds",
  "heap-priority-queue": "ds",
  "hash-table": "ds",
  tree: "ds",
  "binary-tree": "ds",
  "binary-search-tree": "ds",
  "segment-tree": "ds",
  "binary-indexed-tree": "ds",
  trie: "ds",
  "monotonic-stack": "ds",
  "monotonic-queue": "ds",
  "doubly-linked-list": "ds",
  "linked-list": "ds",

  // Binary Search / Two Pointers
  "binary-search": "binsearch",
  "two-pointers": "binsearch",
  "sliding-window": "binsearch",

  // Strings
  string: "strings",
  "string-matching": "strings",
  "suffix-array": "strings",

  // Implementation
  simulation: "impl",
  "brute-force": "impl",
  enumeration: "impl",
  recursion: "impl",

  // Geometry
  geometry: "geometry",

  // Games & Interactive
  "game-theory": "games",
  interactive: "games",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LCTagCount {
  tagName: string;
  tagSlug: string;
  problemsSolved: number;
}

export interface LCContestEntry {
  contestTitle: string;
  startTime: number; // unix seconds
  rating: number;
  ranking: number;
  problemsSolved: number;
  totalProblems: number;
  attended: boolean;
}

export interface LCProfile {
  username: string;
  realName: string;
  // Solved stats
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalSubmissions: number;
  // Contest
  contestRating: number; // 0 if unrated
  contestGlobalRanking: number | null;
  attendedContests: number;
  // Tags (all difficulty groups combined)
  tagCounts: LCTagCount[];
  // Recent accepted submissions
  recentAC: { title: string; titleSlug: string; timestamp: number }[];
  // Contest history (last 20 entries)
  contestHistory: LCContestEntry[];
}

export class LCApiError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "TIMEOUT" | "HTTP_ERROR" | "API_ERROR"
  ) {
    super(message);
    this.name = "LCApiError";
  }
}

// ─── Low-level fetch ──────────────────────────────────────────────────────────

async function lcGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(LC_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new LCApiError("LeetCode API timed out.", "TIMEOUT");
    }
    throw err;
  }

  if (!res.ok) {
    throw new LCApiError(`LeetCode API returned HTTP ${res.status}`, "HTTP_ERROR");
  }

  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors[0]?.message ?? "Unknown GraphQL error";
    throw new LCApiError(`LeetCode GraphQL error: ${msg}`, "API_ERROR");
  }
  return json.data as T;
}

// ─── Profile + tag counts + recent ACs ───────────────────────────────────────

const PROFILE_QUERY = /* graphql */ `
  query lcProfile($username: String!) {
    matchedUser(username: $username) {
      username
      profile {
        realName
        ranking
      }
      submitStats: submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
      }
      tagProblemCounts {
        advanced   { tagName tagSlug problemsSolved }
        intermediate { tagName tagSlug problemsSolved }
        fundamental  { tagName tagSlug problemsSolved }
      }
    }
    recentAcSubmissionList(username: $username, limit: 20) {
      id
      title
      titleSlug
      timestamp
    }
  }
`;

// ─── Contest ranking ──────────────────────────────────────────────────────────

const CONTEST_QUERY = /* graphql */ `
  query lcContest($username: String!) {
    userContestRanking(username: $username) {
      attendedContestsCount
      rating
      globalRanking
    }
    userContestRankingHistory(username: $username) {
      attended
      problemsSolved
      totalProblems
      rating
      ranking
      contest { title startTime }
    }
  }
`;

// ─── Aggregate tag counts across difficulty groups ────────────────────────────

function mergeTagGroups(
  advanced: LCTagCount[],
  intermediate: LCTagCount[],
  fundamental: LCTagCount[]
): LCTagCount[] {
  const map = new Map<string, LCTagCount>();
  for (const tag of [...advanced, ...intermediate, ...fundamental]) {
    const existing = map.get(tag.tagSlug);
    if (!existing) {
      map.set(tag.tagSlug, { ...tag });
    } else {
      existing.problemsSolved += tag.problemsSolved;
    }
  }
  return Array.from(map.values());
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchLCProfile(username: string): Promise<LCProfile> {
  // Parallel fetch: profile + contest history
  const [profileData, contestData] = await Promise.all([
    lcGraphQL<{
      matchedUser: {
        username: string;
        profile: { realName: string; ranking: number };
        submitStats: { acSubmissionNum: { difficulty: string; count: number; submissions: number }[] };
        tagProblemCounts: {
          advanced: LCTagCount[];
          intermediate: LCTagCount[];
          fundamental: LCTagCount[];
        };
      } | null;
      recentAcSubmissionList: { id: string; title: string; titleSlug: string; timestamp: string }[];
    }>(PROFILE_QUERY, { username }),
    lcGraphQL<{
      userContestRanking: {
        attendedContestsCount: number;
        rating: number;
        globalRanking: number;
      } | null;
      userContestRankingHistory: {
        attended: boolean;
        problemsSolved: number;
        totalProblems: number;
        rating: number;
        ranking: number;
        contest: { title: string; startTime: number };
      }[];
    }>(CONTEST_QUERY, { username }),
  ]);

  if (!profileData.matchedUser) {
    throw new LCApiError(`LeetCode user "${username}" not found.`, "NOT_FOUND");
  }

  const mu = profileData.matchedUser;

  // Parse submit stats
  let totalSolved = 0, easySolved = 0, mediumSolved = 0, hardSolved = 0, totalSubmissions = 0;
  for (const s of mu.submitStats.acSubmissionNum) {
    if (s.difficulty === "All") { totalSolved = s.count; totalSubmissions = s.submissions; }
    else if (s.difficulty === "Easy") easySolved = s.count;
    else if (s.difficulty === "Medium") mediumSolved = s.count;
    else if (s.difficulty === "Hard") hardSolved = s.count;
  }

  // Merge tag groups
  const tagCounts = mergeTagGroups(
    mu.tagProblemCounts.advanced,
    mu.tagProblemCounts.intermediate,
    mu.tagProblemCounts.fundamental
  ).filter((t) => t.problemsSolved > 0);

  // Recent ACs
  const recentAC = (profileData.recentAcSubmissionList ?? []).map((s) => ({
    title: s.title,
    titleSlug: s.titleSlug,
    timestamp: parseInt(s.timestamp, 10),
  }));

  // Contest history
  const cr = contestData.userContestRanking;
  const contestHistory: LCContestEntry[] = (contestData.userContestRankingHistory ?? [])
    .filter((e) => e.attended)
    .slice(0, 20)
    .map((e) => ({
      contestTitle: e.contest.title,
      startTime: e.contest.startTime,
      rating: e.rating,
      ranking: e.ranking,
      problemsSolved: e.problemsSolved,
      totalProblems: e.totalProblems,
      attended: e.attended,
    }));

  return {
    username: mu.username,
    realName: mu.profile.realName ?? "",
    totalSolved,
    easySolved,
    mediumSolved,
    hardSolved,
    totalSubmissions,
    contestRating: cr ? Math.round(cr.rating) : 0,
    contestGlobalRanking: cr?.globalRanking ?? null,
    attendedContests: cr?.attendedContestsCount ?? 0,
    tagCounts,
    recentAC,
    contestHistory,
  };
}
