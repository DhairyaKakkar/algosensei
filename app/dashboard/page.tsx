"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { SkillRadarChart } from "@/components/skill-radar-chart";
import { Button } from "@/components/ui/button";
import type { SkillProfile } from "@/lib/analysis";
import { mergeSkillProfiles } from "@/lib/analysis";
import type { Recommendation } from "@/app/api/recommend/route";
import { supabase } from "@/lib/supabase";
import {
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlatformView = "cf" | "lc" | "combined";

interface DashboardData {
  // CF
  handle: string;
  rating: number;
  maxRating: number;
  rank: string;
  cfSkillProfile: SkillProfile | null;
  // LC
  lcUsername: string | null;
  lcContestRating: number;
  lcSkillProfile: SkillProfile | null;
  // Merged
  combinedSkillProfile: SkillProfile | null;
  // Convenience alias used by downstream components (set to combined/cf/lc based on toggle)
  skillProfile: SkillProfile | null;
  // Stats (CF-sourced)
  problemsThisWeek: number;
  currentStreak: number;
  ratingPrediction: number;
  solvedKeys: string[];
}

// ── Rating colour helper ──────────────────────────────────────────────────────

function ratingColor(rating: number): string {
  if (rating >= 3000) return "text-[#ff0000]";
  if (rating >= 2600) return "text-[#ff3333]";
  if (rating >= 2400) return "text-[#ff7777]";
  if (rating >= 2100) return "text-[#ff8c00]";
  if (rating >= 1900) return "text-[#ff8c00]";
  if (rating >= 1600) return "text-[#aa00aa]";
  if (rating >= 1400) return "text-[#0000ff]";
  if (rating >= 1200) return "text-[#03a89e]";
  return "text-[#808080]";
}

// ── Handle form (CF + LC) ─────────────────────────────────────────────────────

function HandleForm({ onLoad }: { onLoad: (data: DashboardData) => void }) {
  const [cfHandle, setCfHandle] = useState("");
  const [lcUsername, setLcUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = cfHandle.trim() || lcUsername.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      // Fetch CF and LC in parallel (skip whichever wasn't provided)
      const [cfRes, lcRes] = await Promise.all([
        cfHandle.trim()
          ? fetch(`/api/codeforces/sync?handle=${encodeURIComponent(cfHandle.trim())}`)
          : null,
        lcUsername.trim()
          ? fetch(`/api/leetcode/sync?username=${encodeURIComponent(lcUsername.trim())}`)
          : null,
      ]);

      // Parse CF
      let cfData: { user: { handle: string; rating: number; maxRating: number; rank: string }; recentSubmissions: { verdict: string; submittedAt: number; problemKey: string }[]; skillProfile: SkillProfile | null } | null = null;
      if (cfRes) {
        const d = await cfRes.json();
        if (!cfRes.ok) throw new Error(d.error ?? "Failed to load Codeforces profile");
        cfData = d;
      }

      // Parse LC
      let lcData: { profile: { contestRating: number }; skillProfile: SkillProfile | null } | null = null;
      if (lcRes) {
        const d = await lcRes.json();
        if (!lcRes.ok) throw new Error(d.error ?? "Failed to load LeetCode profile");
        lcData = d;
      }

      const cfUser = cfData?.user;
      const recentSubs = cfData?.recentSubmissions ?? [];
      const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
      const problemsThisWeek = recentSubs.filter(
        (s) => s.verdict === "OK" && s.submittedAt >= oneWeekAgo
      ).length;
      const daySet = new Set<string>();
      recentSubs.forEach((s) => {
        if (s.verdict === "OK") {
          const d = new Date(s.submittedAt * 1000);
          daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }
      });
      const solvedKeys = recentSubs.filter((s) => s.verdict === "OK").map((s) => s.problemKey);

      const cfSkillProfile = cfData?.skillProfile ?? null;
      const lcSkillProfile = lcData?.skillProfile ?? null;
      const combinedSkillProfile = mergeSkillProfiles(cfSkillProfile, lcSkillProfile);

      const rating = cfUser?.rating ?? 0;
      const ratingDelta = combinedSkillProfile
        ? Math.round((combinedSkillProfile.overallScore - 50) * 4)
        : 0;

      onLoad({
        handle: cfUser?.handle ?? (cfHandle.trim() || lcUsername.trim()),
        rating,
        maxRating: cfUser?.maxRating ?? 0,
        rank: cfUser?.rank ?? "unrated",
        cfSkillProfile,
        lcUsername: lcUsername.trim() || null,
        lcContestRating: lcData?.profile?.contestRating ?? 0,
        lcSkillProfile,
        combinedSkillProfile,
        skillProfile: combinedSkillProfile,
        problemsThisWeek,
        currentStreak: daySet.size,
        ratingPrediction: rating + ratingDelta,
        solvedKeys,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border/50 bg-background/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors";

  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Target className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">Load your profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your Codeforces handle and/or LeetCode username
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-medium text-muted-foreground">Codeforces handle</label>
          <input
            value={cfHandle}
            onChange={(e) => setCfHandle(e.target.value)}
            placeholder="e.g. tourist"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-medium text-muted-foreground">LeetCode username</label>
          <input
            value={lcUsername}
            onChange={(e) => setLcUsername(e.target.value)}
            placeholder="e.g. neal_wu"
            className={inputClass}
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !canSubmit}
          className="gap-1.5 bg-primary font-semibold shadow-sm shadow-primary/20"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Load
        </Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ── Platform toggle ────────────────────────────────────────────────────────────

function PlatformToggle({
  data,
  platform,
  onChange,
}: {
  data: DashboardData;
  platform: PlatformView;
  onChange: (p: PlatformView) => void;
}) {
  const hasCF = !!data.cfSkillProfile;
  const hasLC = !!data.lcSkillProfile;
  if (!hasCF || !hasLC) return null;

  const options: { key: PlatformView; label: string }[] = [
    { key: "cf", label: "Codeforces" },
    { key: "lc", label: "LeetCode" },
    { key: "combined", label: "Combined" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-card/60 p-1">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            platform === key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── AI Summary card ───────────────────────────────────────────────────────────

function AISummaryCard({
  skillProfile,
  userRating,
  handle,
}: {
  skillProfile: SkillProfile;
  userRating: number;
  handle: string;
}) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setSummary("");
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillProfile, userRating, handle }),
      });
      const data = await res.json();
      setSummary(data.summary ?? data.error ?? "Failed to generate summary.");
      setGenerated(true);
    } catch {
      setSummary("Failed to generate summary. Please try again.");
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, [skillProfile, userRating, handle]);

  useEffect(() => {
    if (!generated) generate();
  }, [generated, generate]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-6 shadow-lg shadow-primary/5">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-violet-500/5 opacity-60" />
      <div className="absolute inset-0 -z-10 bg-card/80" />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">AI Coaching Summary</h3>
        </div>
        {generated && !loading && (
          <button
            onClick={generate}
            className="flex items-center gap-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Regenerate"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-3.5 animate-pulse rounded bg-muted/50"
              style={{ width: `${85 - i * 8}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {summary.split("\n\n").filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick stats ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 p-5">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-sm font-medium text-foreground/80">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────────

const TOPIC_COLORS: Record<string, string> = {
  dp: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  graphs: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  greedy: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  math: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  ds: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  binsearch: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  strings: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  impl: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  geometry: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  games: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

function ratingBadgeColor(r?: number) {
  if (!r) return "bg-muted/50 text-muted-foreground";
  if (r >= 2100) return "bg-orange-500/10 text-orange-400";
  if (r >= 1900) return "bg-violet-500/10 text-violet-400";
  if (r >= 1600) return "bg-blue-500/10 text-blue-400";
  if (r >= 1400) return "bg-cyan-500/10 text-cyan-400";
  if (r >= 1200) return "bg-emerald-500/10 text-emerald-400";
  return "bg-muted/50 text-muted-foreground";
}

function MiniProblemCard({ rec }: { rec: Recommendation }) {
  const topicColor = TOPIC_COLORS[rec.topicId] ?? "bg-muted/50 text-muted-foreground border-muted/20";

  return (
    <a
      href={rec.cfUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/50 bg-card/60 p-4 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${topicColor}`}>
            {rec.topicLabel}
          </span>
          {rec.rating && (
            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${ratingBadgeColor(rec.rating)}`}>
              {rec.rating}
            </span>
          )}
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
      </div>

      <div className="font-medium leading-snug text-foreground">{rec.name}</div>

      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{rec.reason}</p>
    </a>
  );
}

// ── Recommended problems section ──────────────────────────────────────────────

function RecommendedSection({
  skillProfile,
  userRating,
  solvedKeys,
}: {
  skillProfile: SkillProfile;
  userRating: number;
  solvedKeys: string[];
}) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillProfile, userRating, solvedKeys }),
      });
      const data = await res.json();
      setRecs((data.recommendations ?? []).slice(0, 3));
      setDone(true);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [skillProfile, userRating, solvedKeys]);

  useEffect(() => {
    if (!done) load();
  }, [done, load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Trophy className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="font-semibold text-foreground">Recommended Next</h3>
        </div>
        <Link
          href="/problems"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
        >
          See all →
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      ) : recs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {recs.map((rec) => (
            <MiniProblemCard key={rec.problemKey} rec={rec} />
          ))}
        </div>
      ) : done ? (
        <div className="rounded-xl border border-border/50 bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Not enough data to generate recommendations yet. Solve more problems first.
        </div>
      ) : null}
    </div>
  );
}

// ── Contest History ───────────────────────────────────────────────────────────

interface ContestRow {
  id: string;
  started_at: string;
  duration_minutes: number;
  score: number | null;
  results: { solvedCount: number; problems: { verdict: string }[] } | null;
  problems: { rating: number }[];
}

function ContestHistoryCard() {
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      const { data: rows } = await supabase
        .from("virtual_contests")
        .select("id, started_at, duration_minutes, score, results, problems")
        .eq("user_id", data.user.id)
        .not("results", "is", null)
        .order("started_at", { ascending: false })
        .limit(5);
      setContests((rows as ContestRow[]) ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="h-32 animate-pulse rounded-2xl bg-muted/20" />
  );
  if (contests.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Trophy className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="font-semibold text-foreground">Recent Contests</h3>
        </div>
        <Link
          href="/contest"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline transition-colors"
        >
          Play →
        </Link>
      </div>

      <div className="space-y-2">
        {contests.map((c) => {
          const solved = c.results?.solvedCount ?? 0;
          const total = c.problems?.length ?? 5;
          const ratings = c.problems?.map((p) => p.rating).filter(Boolean) ?? [];
          const ratingRange = ratings.length
            ? `${Math.min(...ratings)}–${Math.max(...ratings)}`
            : "—";
          const date = new Date(c.started_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/50 px-4 py-3"
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                solved === total ? "bg-emerald-500/10" : solved >= total / 2 ? "bg-amber-500/10" : "bg-muted/30"
              }`}>
                <CheckCircle2 className={`h-4 w-4 ${
                  solved === total ? "text-emerald-400" : solved >= total / 2 ? "text-amber-400" : "text-muted-foreground/50"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {solved}/{total} solved
                  </span>
                  <span className="text-xs text-muted-foreground">· {ratingRange}</span>
                </div>
                <div className="text-xs text-muted-foreground">{date}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {c.score ?? 0} pts
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [platform, setPlatform] = useState<PlatformView>("combined");

  // Restore from sessionStorage so page refresh doesn't lose state
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("dashboard_data");
      if (saved) setData(JSON.parse(saved));
    } catch {}
  }, []);

  function handleLoad(d: DashboardData) {
    setData(d);
    // Default view: combined if both available, else whichever is present
    setPlatform(d.cfSkillProfile && d.lcSkillProfile ? "combined" : d.lcSkillProfile ? "lc" : "cf");
    try {
      sessionStorage.setItem("dashboard_data", JSON.stringify(d));
    } catch {}
  }

  // Derive active skill profile from toggle state
  const activeSkillProfile = data
    ? platform === "cf"
      ? data.cfSkillProfile
      : platform === "lc"
      ? data.lcSkillProfile
      : data.combinedSkillProfile
    : null;

  const displayHandle =
    data && platform === "lc" && data.lcUsername
      ? data.lcUsername
      : data?.handle ?? "";

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {!data ? (
          <HandleForm onLoad={handleLoad} />
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Welcome header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Hey,{" "}
                  {platform === "lc" && data.lcUsername ? (
                    <a
                      href={`https://leetcode.com/${data.lcUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-opacity hover:opacity-80"
                    >
                      <span className="text-amber-400">{data.lcUsername}</span>
                    </a>
                  ) : (
                    <a
                      href={`https://codeforces.com/profile/${data.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-opacity hover:opacity-80"
                    >
                      <span className={ratingColor(data.rating)}>{data.handle}</span>
                    </a>
                  )}{" "}
                  👋
                </h1>
                <p className="mt-1 text-sm text-muted-foreground capitalize">
                  {platform === "lc" && !data.cfSkillProfile ? (
                    <>
                      LeetCode · Contest rating:{" "}
                      <span className="font-semibold text-amber-400">
                        {data.lcContestRating || "unrated"}
                      </span>
                    </>
                  ) : (
                    <>
                      {data.rank} · CF rating:{" "}
                      <span className={`font-semibold ${ratingColor(data.rating)}`}>
                        {data.rating}
                      </span>
                      {data.maxRating > data.rating && (
                        <span className="ml-1 text-muted-foreground/60">(max {data.maxRating})</span>
                      )}
                      {data.lcUsername && platform !== "cf" && data.lcContestRating > 0 && (
                        <span className="ml-2 text-muted-foreground/60">
                          · LC {data.lcContestRating}
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <PlatformToggle data={data} platform={platform} onChange={setPlatform} />
                <div className="flex gap-2">
                  <Link href="/problems">
                    <Button variant="outline" size="sm" className="gap-1.5 border-border/50">
                      <Trophy className="h-4 w-4" />
                      Practice
                    </Button>
                  </Link>
                  <Link href="/coach">
                    <Button size="sm" className="gap-1.5 bg-primary font-semibold shadow-sm shadow-primary/20">
                      <BrainCircuit className="h-4 w-4" />
                      Start coaching
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<TrendingUp className="h-4 w-4 text-primary" />}
                label="Overall Score"
                value={`${activeSkillProfile?.overallScore ?? "—"}/100`}
                sub="Skill index across all topics"
                color="bg-primary/10"
              />
              <StatCard
                icon={<Zap className="h-4 w-4 text-amber-400" />}
                label="This Week"
                value={data.problemsThisWeek}
                sub="Problems solved (last 7 days)"
                color="bg-amber-500/10"
              />
              <StatCard
                icon={<Flame className="h-4 w-4 text-orange-400" />}
                label="Active Days"
                value={data.currentStreak}
                sub="Days with accepted submissions"
                color="bg-orange-500/10"
              />
              <StatCard
                icon={<Target className="h-4 w-4 text-emerald-400" />}
                label="Rating Outlook"
                value={data.ratingPrediction > 0 ? `+${data.ratingPrediction - data.rating}` : data.rating}
                sub={`Projected: ${data.ratingPrediction}`}
                color="bg-emerald-500/10"
              />
            </div>

            {/* Main grid: radar + AI summary */}
            <div className="grid gap-6 lg:grid-cols-5">
              {/* Radar chart */}
              <div className="lg:col-span-3">
                <div className="rounded-2xl border border-border/50 bg-card/80 p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">Skill Radar</h3>
                  </div>
                  {activeSkillProfile ? (
                    <SkillRadarChart profile={activeSkillProfile} />
                  ) : (
                    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                      Not enough data for radar chart. Solve more rated problems.
                    </div>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              <div className="lg:col-span-2">
                {activeSkillProfile ? (
                  <AISummaryCard
                    skillProfile={activeSkillProfile}
                    userRating={data.rating}
                    handle={displayHandle}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-border/50 bg-card/80 p-6 text-sm text-muted-foreground">
                    Solve more problems to unlock AI coaching insights.
                  </div>
                )}
              </div>
            </div>

            {/* Recommendations (CF-only — needs CF problem links) */}
            {platform !== "lc" && data.cfSkillProfile && (
              <RecommendedSection
                skillProfile={activeSkillProfile ?? data.cfSkillProfile}
                userRating={data.rating}
                solvedKeys={data.solvedKeys}
              />
            )}

            {/* Contest history */}
            <ContestHistoryCard />

            {/* Contest CTA */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-card/80 p-6 shadow-lg shadow-amber-500/5">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500/5 to-orange-500/5" />
              <div className="absolute inset-0 -z-10 bg-card/60" />
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10">
                    <Trophy className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Test yourself in a virtual contest</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      5 problems · 2-hour timer · AI post-contest analysis targeting your weak topics
                    </p>
                  </div>
                </div>
                <Link href="/contest" className="shrink-0">
                  <Button className="gap-2 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/20 font-semibold" variant="outline">
                    <Trophy className="h-4 w-4" />
                    Start
                  </Button>
                </Link>
              </div>
            </div>

            {/* Coaching CTA */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-8 text-center shadow-lg shadow-primary/5">
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/8 to-violet-500/8" />
              <div className="absolute inset-0 -z-10 bg-card/60" />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <BrainCircuit className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Ready to level up?</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Start a Socratic coaching session. Paste any Codeforces problem URL and your AI coach
                will guide you to the solution — never giving it away directly.
              </p>
              <Link href="/coach" className="mt-5 inline-block">
                <Button className="gap-2 bg-primary px-6 font-semibold shadow-md shadow-primary/20 hover:shadow-primary/30 transition-shadow">
                  <BrainCircuit className="h-4 w-4" />
                  Open AI Coach
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
