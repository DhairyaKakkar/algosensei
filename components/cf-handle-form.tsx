"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  TrendingDown,
} from "lucide-react";
import type {
  ProfileAnalysis,
  ProcessedSubmission,
  TagStat,
  RatingBucket,
  WeakProblem,
} from "@/lib/codeforces";
import type { SkillProfile } from "@/lib/analysis";
import { SkillRadarChart } from "@/components/skill-radar-chart";

// ─── Rank color ───────────────────────────────────────────────────────────────

const RANK_COLORS: Record<string, string> = {
  newbie: "text-gray-400",
  pupil: "text-green-400",
  specialist: "text-cyan-400",
  expert: "text-blue-400",
  "candidate master": "text-violet-400",
  master: "text-orange-400",
  "international master": "text-orange-300",
  grandmaster: "text-red-400",
  "international grandmaster": "text-red-300",
  "legendary grandmaster": "text-red-200",
};

function rankColor(rank: string) {
  return RANK_COLORS[rank.toLowerCase()] ?? "text-muted-foreground";
}

// ─── Verdict abbreviation ─────────────────────────────────────────────────────

const VERDICT_SHORT: Record<string, string> = {
  OK: "AC",
  WRONG_ANSWER: "WA",
  TIME_LIMIT_EXCEEDED: "TLE",
  MEMORY_LIMIT_EXCEEDED: "MLE",
  RUNTIME_ERROR: "RE",
  COMPILATION_ERROR: "CE",
  PARTIAL: "PT",
  PRESENTATION_ERROR: "PE",
  IDLENESS_LIMIT_EXCEEDED: "ILE",
  CHALLENGED: "HACK",
  SKIPPED: "SKIP",
  SECURITY_VIOLATED: "SV",
  FAILED: "FAIL",
  UNKNOWN: "?",
};

const VERDICT_COLOR: Record<string, string> = {
  AC: "bg-emerald-500/10 text-emerald-400",
  WA: "bg-red-500/10 text-red-400",
  TLE: "bg-yellow-500/10 text-yellow-400",
  MLE: "bg-yellow-500/10 text-yellow-400",
  RE: "bg-orange-500/10 text-orange-400",
  CE: "bg-orange-500/10 text-orange-400",
  PT: "bg-blue-500/10 text-blue-400",
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const short = VERDICT_SHORT[verdict] ?? verdict;
  const isAC = short === "AC";
  const colorClass = VERDICT_COLOR[short] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${colorClass}`}
    >
      {isAC ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <AlertCircle className="h-3 w-3 shrink-0" />
      )}
      {short}
    </span>
  );
}

// ─── Language abbreviation ────────────────────────────────────────────────────

function shortLang(lang: string): string {
  return lang
    .replace(/^GNU /, "")            // "GNU C++17" → "C++17"
    .replace(/ \([^)]*\)$/, "")      // strip trailing parens: "(64)", "(GCC 14-64, msys2)"
    .replace(/-64$/, "")             // "PyPy 3-64" → "PyPy 3"
    .replace(/ 64bit$/, "")          // "Java 21 64bit" → "Java 21"
    .replace(/^Microsoft Visual C\+\+.*/, "MSVC")
    .trim();
}

// ─── Solve-rate bar ───────────────────────────────────────────────────────────

function SolveBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground leading-none">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Enriched type ────────────────────────────────────────────────────────────

type EnrichedProfileAnalysis = ProfileAnalysis & { skillProfile?: SkillProfile };

// ─── Main component ───────────────────────────────────────────────────────────

export function CFHandleForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EnrichedProfileAnalysis | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll results into view whenever data arrives
  useEffect(() => {
    if (data && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  // Mirror the server-side regex — avoids a round-trip on clearly invalid input
  const HANDLE_RE = /^[a-zA-Z0-9_\-.]{3,24}$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = handle.trim();
    if (!trimmed) return;

    if (!HANDLE_RE.test(trimmed)) {
      setError(
        "Invalid handle format. Codeforces handles are 3–24 characters (letters, digits, _, -, or .)."
      );
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/codeforces/sync?handle=${encodeURIComponent(trimmed)}`
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }

      setData(json as EnrichedProfileAnalysis);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {/* Search form — stays narrow and centred */}
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-lg gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="tourist"
            aria-label="Codeforces handle"
            disabled={loading}
            className="h-11 w-full rounded-lg border border-border/60 bg-card/60 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !handle.trim()}
          className="h-11 gap-2 bg-primary px-5 font-semibold shadow-md shadow-primary/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing…
            </>
          ) : (
            "Analyze"
          )}
        </Button>
      </form>

      {/* Error */}
      {error && (
        <div className="mx-auto mt-4 flex max-w-lg items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mx-auto mt-6 max-w-lg space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-card/60" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-card/60" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-48 animate-pulse rounded-xl bg-card/60" />
            <div className="h-48 animate-pulse rounded-xl bg-card/60 opacity-75" />
          </div>
          <p className="text-center text-xs text-muted-foreground/60">
            Fetching submissions from Codeforces — may take a moment for large histories…
          </p>
        </div>
      )}

      {/* Results — full width of its container (wider than the form) */}
      {data && !loading && (
        <div ref={resultsRef} className="mt-8 scroll-mt-8">
          <AnalysisView data={data} skillProfile={data.skillProfile} />
        </div>
      )}
    </div>
  );
}

// ─── Analysis view ────────────────────────────────────────────────────────────

function AnalysisView({
  data,
  skillProfile,
}: {
  data: ProfileAnalysis;
  skillProfile?: SkillProfile;
}) {
  const { user, stats, tagAnalysis, ratingBuckets, weakProblems, recentSubmissions, submissionsCapped } = data;

  return (
    <div className="space-y-5">
      {/* Cap warning — shown for users with >40 000 submissions */}
      {submissionsCapped && (
        <div className="flex items-start gap-2.5 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Analysis based on the most recent 40 000 submissions. Older history was not fetched.
        </div>
      )}
      {/* User card */}
      <div className="flex items-center gap-4 rounded-xl border border-border/50 bg-card/60 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatar}
          alt={user.handle}
          className="h-14 w-14 shrink-0 rounded-full border-2 border-border/60 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a
              href={`https://codeforces.com/profile/${user.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-lg font-bold text-foreground transition-colors hover:text-primary"
            >
              {user.handle}
            </a>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
          <p className={`text-sm font-medium capitalize ${rankColor(user.rank)}`}>
            {user.rank}
            {user.organization && (
              <span className="ml-2 font-normal text-muted-foreground">
                · {user.organization}
              </span>
            )}
          </p>
          {(user.country || user.city) && (
            <p className="text-xs text-muted-foreground/70">
              {[user.city, user.country].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-3xl font-bold tabular-nums ${rankColor(user.rank)}`}>
            {user.rating}
          </p>
          <p className="text-xs text-muted-foreground">peak {user.maxRating}</p>
        </div>
      </div>

      {/* Stats grid — 4 columns at sm+ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Submissions"
          value={stats.totalSubmissions.toLocaleString()}
          sub="total across all"
        />
        <StatCard
          label="Solved"
          value={stats.uniqueSolved.toLocaleString()}
          sub="unique problems"
        />
        <StatCard
          label="Attempted"
          value={stats.uniqueAttempted.toLocaleString()}
          sub="unique problems"
        />
        <StatCard
          label="Solve Rate"
          value={`${Math.round(stats.successRate * 100)}%`}
          sub={`${stats.uniqueSolved} / ${stats.uniqueAttempted}`}
        />
      </div>

      {/* Skill Radar */}
      {skillProfile && <SkillRadarChart profile={skillProfile} />}

      {/* Tag + Rating side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TagAnalysis tags={tagAnalysis} />
        <RatingAnalysis buckets={ratingBuckets} />
      </div>

      {weakProblems.length > 0 && <WeakProblems problems={weakProblems} />}

      <RecentSubmissions submissions={recentSubmissions} />
    </div>
  );
}

// ─── Tag analysis ─────────────────────────────────────────────────────────────

function TagAnalysis({ tags }: { tags: TagStat[] }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 10;
  const visible = expanded ? tags : tags.slice(0, LIMIT);

  return (
    <section className="rounded-xl border border-border/50 bg-card/40">
      <div className="border-b border-border/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Tag Breakdown</h3>
        <p className="text-xs text-muted-foreground">Sorted by unsolved count — shows weakest tags first</p>
      </div>
      {tags.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No tag data available.</p>
      ) : (
        <div className="divide-y divide-border/30">
          {visible.map((t) => (
            <div key={t.tag} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm capitalize text-foreground">
                {t.tag}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {t.solved}/{t.attempted}
              </span>
              <SolveBar rate={t.solveRate} />
            </div>
          ))}
        </div>
      )}
      {tags.length > LIMIT && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 border-t border-border/40 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
          ) : (
            <>Show all {tags.length} tags <ChevronDown className="h-3.5 w-3.5" /></>
          )}
        </button>
      )}
    </section>
  );
}

// ─── Rating analysis ──────────────────────────────────────────────────────────

function RatingAnalysis({ buckets }: { buckets: RatingBucket[] }) {
  return (
    <section className="rounded-xl border border-border/50 bg-card/40">
      <div className="border-b border-border/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Difficulty Breakdown</h3>
        <p className="text-xs text-muted-foreground">
          Solve rate per rating bucket (min 2 problems)
        </p>
      </div>
      <div className="divide-y divide-border/30">
        {buckets.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No rated problems found.
          </p>
        ) : (
          buckets.map((b) => (
            <div key={b.rating} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-12 shrink-0 font-mono text-sm text-foreground">
                {b.rating}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {b.solved}/{b.attempted}
              </span>
              <div className="ml-auto">
                <SolveBar rate={b.solveRate} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ─── Weak problems ────────────────────────────────────────────────────────────

function WeakProblems({ problems }: { problems: WeakProblem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? problems : problems.slice(0, 5);

  return (
    <section className="rounded-xl border border-red-500/20 bg-red-500/[0.03]">
      <div className="flex items-center gap-2 border-b border-red-500/20 px-4 py-3">
        <TrendingDown className="h-4 w-4 shrink-0 text-red-400" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Persistent Weaknesses</h3>
          <p className="text-xs text-muted-foreground">
            Tried ≥2× and never solved — prime targets for focused practice
          </p>
        </div>
      </div>
      <div className="divide-y divide-border/30">
        {visible.map((p) => (
          <div key={p.problemKey} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <a
                href={
                  p.contestId
                    ? `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`
                    : "https://codeforces.com/problemset"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                {p.problemName}
              </a>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.tags.filter((t) => !t.startsWith("*")).slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-muted/50 px-1.5 py-0.5 text-xs capitalize text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {p.rating != null && (
                <span className="block text-sm font-semibold tabular-nums text-foreground">
                  {p.rating}
                </span>
              )}
              <span className="text-xs text-red-400">{p.attempts}× tried</span>
              <span className="ml-1.5 inline-block">
                <VerdictBadge verdict={p.bestVerdict} />
              </span>
            </div>
          </div>
        ))}
      </div>
      {problems.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 border-t border-red-500/20 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
          ) : (
            <>Show all {problems.length} weak problems <ChevronDown className="h-3.5 w-3.5" /></>
          )}
        </button>
      )}
    </section>
  );
}

// ─── Recent submissions ───────────────────────────────────────────────────────

function RecentSubmissions({ submissions }: { submissions: ProcessedSubmission[] }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 15;
  const visible = expanded ? submissions : submissions.slice(0, LIMIT);

  function formatDate(unix: number) {
    return new Date(unix * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <section className="rounded-xl border border-border/50 bg-card/40">
      <div className="border-b border-border/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Submissions</h3>
        <p className="text-xs text-muted-foreground">Last {submissions.length} submissions fetched</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Problem</th>
              <th className="px-4 py-2 font-medium">Rating</th>
              <th className="px-4 py-2 font-medium">Verdict</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Language</th>
              <th className="hidden px-4 py-2 font-medium md:table-cell">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {visible.map((s) => (
              <tr key={s.id} className="transition-colors hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <a
                    href={
                      s.contestId
                        ? `https://codeforces.com/contest/${s.contestId}/problem/${s.index}`
                        : "https://codeforces.com/problemset"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-1 block max-w-[180px] font-medium text-foreground transition-colors hover:text-primary sm:max-w-xs"
                  >
                    {s.problemName}
                  </a>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {s.rating ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <VerdictBadge verdict={s.verdict} />
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                  {shortLang(s.language)}
                </td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                  {formatDate(s.submittedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {submissions.length > LIMIT && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 border-t border-border/40 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
          ) : (
            <>Show all {submissions.length} submissions <ChevronDown className="h-3.5 w-3.5" /></>
          )}
        </button>
      )}
    </section>
  );
}
