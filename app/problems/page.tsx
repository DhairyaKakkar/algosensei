"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Loader2,
  ExternalLink,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Clock,
  SkipForward,
  AlertCircle,
  BrainCircuit,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/app/api/recommend/route";
import type { ProfileAnalysis } from "@/lib/codeforces";
import type { SkillProfile } from "@/lib/analysis";

// ─── Status types ─────────────────────────────────────────────────────────────

type ProblemStatus = "pending" | "attempted" | "solved" | "skipped";

const STATUS_META: Record<
  ProblemStatus,
  { label: string; icon: React.ReactNode; classes: string; bg: string }
> = {
  pending: {
    label: "To Do",
    icon: <Clock className="h-3.5 w-3.5" />,
    classes: "text-muted-foreground border-border/50",
    bg: "bg-muted/30",
  },
  attempted: {
    label: "Attempted",
    icon: <BookOpen className="h-3.5 w-3.5" />,
    classes: "text-yellow-400 border-yellow-500/30",
    bg: "bg-yellow-500/5",
  },
  solved: {
    label: "Solved",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    classes: "text-emerald-400 border-emerald-500/30",
    bg: "bg-emerald-500/5",
  },
  skipped: {
    label: "Skipped",
    icon: <SkipForward className="h-3.5 w-3.5" />,
    classes: "text-zinc-500 border-zinc-700/50",
    bg: "bg-zinc-800/20",
  },
};

const STATUS_ORDER: ProblemStatus[] = ["pending", "attempted", "solved", "skipped"];

// ─── Rating color ─────────────────────────────────────────────────────────────

function ratingColor(rating?: number): string {
  if (!rating) return "text-muted-foreground bg-muted/40 border-border/40";
  if (rating < 1200) return "text-gray-300 bg-gray-500/10 border-gray-500/30";
  if (rating < 1400) return "text-green-400 bg-green-500/10 border-green-500/30";
  if (rating < 1600) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
  if (rating < 1800) return "text-blue-400 bg-blue-500/10 border-blue-500/30";
  if (rating < 2000) return "text-violet-400 bg-violet-500/10 border-violet-500/30";
  if (rating < 2200) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  if (rating < 2400) return "text-red-400 bg-red-500/10 border-red-500/30";
  return "text-red-300 bg-red-400/10 border-red-400/30";
}

function topicColor(topicId: string): string {
  const map: Record<string, string> = {
    dp: "text-indigo-400 bg-indigo-500/10",
    graphs: "text-emerald-400 bg-emerald-500/10",
    greedy: "text-yellow-400 bg-yellow-500/10",
    math: "text-blue-400 bg-blue-500/10",
    ds: "text-purple-400 bg-purple-500/10",
    binsearch: "text-cyan-400 bg-cyan-500/10",
    strings: "text-pink-400 bg-pink-500/10",
    impl: "text-orange-400 bg-orange-500/10",
    geometry: "text-teal-400 bg-teal-500/10",
    games: "text-rose-400 bg-rose-500/10",
  };
  return map[topicId] ?? "text-primary bg-primary/10";
}

// ─── Status toggle ────────────────────────────────────────────────────────────

function StatusToggle({
  problemKey,
  status,
  onChange,
}: {
  problemKey: string;
  status: ProblemStatus;
  onChange: (key: string, s: ProblemStatus) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {STATUS_ORDER.map((s) => {
        const m = STATUS_META[s];
        const active = s === status;
        return (
          <button
            key={s}
            onClick={() => onChange(problemKey, s)}
            title={m.label}
            className={cn(
              "flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-all",
              active
                ? `${m.classes} ${m.bg} shadow-sm`
                : "border-border/30 text-muted-foreground/40 hover:border-border/60 hover:text-muted-foreground"
            )}
          >
            {m.icon}
            {active && <span>{m.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Problem card ─────────────────────────────────────────────────────────────

function ProblemCard({
  rec,
  status,
  onStatusChange,
}: {
  rec: Recommendation;
  status: ProblemStatus;
  onStatusChange: (key: string, s: ProblemStatus) => void;
}) {
  const coachUrl = `/coach?problem=${encodeURIComponent(rec.cfUrl)}`;

  return (
    <div
      className={cn(
        "group flex flex-col rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        status === "solved"
          ? "border-emerald-500/20 bg-emerald-500/[0.02] hover:border-emerald-500/30 hover:shadow-emerald-500/5"
          : status === "skipped"
          ? "border-border/30 bg-card/20 opacity-60"
          : "border-border/50 bg-card/60 hover:border-border hover:shadow-black/20"
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          {/* Topic badge */}
          <span
            className={cn(
              "mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              topicColor(rec.topicId)
            )}
          >
            <TrendingUp className="h-2.5 w-2.5" />
            {rec.topicLabel}
          </span>

          {/* Problem name */}
          <a
            href={rec.cfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1.5 group/link"
          >
            <h3 className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover/link:text-primary">
              {rec.contestId}{rec.index}. {rec.name}
            </h3>
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40 group-hover/link:text-primary/60" />
          </a>
        </div>

        {/* Rating badge */}
        <span
          className={cn(
            "shrink-0 rounded-lg border px-2 py-1 text-sm font-bold tabular-nums",
            ratingColor(rec.rating)
          )}
        >
          {rec.rating ?? "—"}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 px-4 pb-3">
        {rec.tags.slice(0, 5).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] capitalize text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        {rec.solvedCount != null && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">
            {rec.solvedCount.toLocaleString()} solves
          </span>
        )}
      </div>

      {/* AI reason */}
      <div className="mx-4 mb-3 flex gap-2 rounded-xl border border-primary/10 bg-primary/[0.04] px-3 py-2.5">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {rec.reason}
        </p>
      </div>

      {/* Footer: status + links */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/30 px-4 py-2.5">
        <StatusToggle
          problemKey={rec.problemKey}
          status={status}
          onChange={onStatusChange}
        />
        <div className="flex items-center gap-1.5">
          <a
            href={rec.cfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 items-center gap-1 rounded-full border border-border/50 px-2.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Solve
            <ExternalLink className="h-3 w-3" />
          </a>
          <Link
            href={coachUrl}
            className="flex h-7 items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
          >
            <BrainCircuit className="h-3 w-3" />
            Coach
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Loading steps ────────────────────────────────────────────────────────────

const STEPS = [
  { id: "sync", label: "Fetching submission history from Codeforces…" },
  { id: "analyze", label: "Analyzing skill profile and weaknesses…" },
  { id: "recommend", label: "AI selecting and explaining best practice problems…" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function LoadingSteps({ current }: { current: StepId }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="mx-auto max-w-sm space-y-3 text-sm">
      {STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step.id} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-all",
                done
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/30 text-muted-foreground/30"
              )}
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "transition-colors",
                done
                  ? "text-muted-foreground line-through"
                  : active
                  ? "text-foreground"
                  : "text-muted-foreground/40"
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

type FilterStatus = "all" | ProblemStatus;

function FilterBar({
  active,
  counts,
  onChange,
}: {
  active: FilterStatus;
  counts: Record<FilterStatus, number>;
  onChange: (f: FilterStatus) => void;
}) {
  const options: Array<{ key: FilterStatus; label: string }> = [
    { key: "all", label: "All" },
    { key: "pending", label: "To Do" },
    { key: "attempted", label: "Attempted" },
    { key: "solved", label: "Solved" },
    { key: "skipped", label: "Skipped" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
            active === o.key
              ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
              : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
          )}
        >
          {o.label}
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
              active === o.key ? "bg-primary/20" : "bg-muted/50"
            )}
          >
            {counts[o.key]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const LS_KEY = "algosensei_problem_statuses";

function loadStatuses(): Record<string, ProblemStatus> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveStatuses(s: Record<string, ProblemStatus>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

export default function ProblemsPage() {
  const [handle, setHandle] = useState("");
  const [loadingStep, setLoadingStep] = useState<StepId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ProblemStatus>>({});
  const [filter, setFilter] = useState<FilterStatus>("all");

  // Load persisted statuses on mount
  useEffect(() => {
    setStatuses(loadStatuses());
  }, []);

  const handleStatusChange = useCallback(
    (problemKey: string, newStatus: ProblemStatus) => {
      setStatuses((prev) => {
        const next = { ...prev, [problemKey]: newStatus };
        saveStatuses(next);
        return next;
      });
    },
    []
  );

  // ── Fetch flow ──────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    const trimmed = handle.trim();
    if (!trimmed) return;

    setError(null);
    setRecommendations([]);
    setFilter("all");

    // Step 1: sync CF profile
    setLoadingStep("sync");
    let profileData: ProfileAnalysis & { skillProfile?: SkillProfile };
    try {
      const res = await fetch(
        `/api/codeforces/sync?handle=${encodeURIComponent(trimmed)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Codeforces error ${res.status}`);
        setLoadingStep(null);
        return;
      }
      profileData = json;
    } catch {
      setError("Network error fetching Codeforces data. Check your connection.");
      setLoadingStep(null);
      return;
    }

    if (!profileData.skillProfile) {
      setError("Skill profile could not be computed. Not enough submissions.");
      setLoadingStep(null);
      return;
    }

    setUserRating(profileData.user.rating);

    // Step 2: analyze (just a visual step — already done above)
    setLoadingStep("analyze");
    await new Promise((r) => setTimeout(r, 600)); // brief pause for UX

    // Step 3: AI recommendations
    setLoadingStep("recommend");
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillProfile: profileData.skillProfile,
          userRating: profileData.user.rating,
          // pass recent solved keys to avoid re-recommending obvious ones
          solvedKeys: profileData.recentSubmissions
            .filter((s) => s.verdict === "OK")
            .map((s) => s.problemKey),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Recommendation error ${res.status}`);
        setLoadingStep(null);
        return;
      }
      setRecommendations(json.recommendations ?? []);
    } catch {
      setError("Network error generating recommendations.");
      setLoadingStep(null);
      return;
    } finally {
      setLoadingStep(null);
    }
  }, [handle]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") generate();
  };

  // ── Filtered recs ───────────────────────────────────────────────────────────
  const filtered = recommendations.filter((r) => {
    const s = statuses[r.problemKey] ?? "pending";
    return filter === "all" || s === filter;
  });

  const counts: Record<FilterStatus, number> = {
    all: recommendations.length,
    pending: recommendations.filter(
      (r) => (statuses[r.problemKey] ?? "pending") === "pending"
    ).length,
    attempted: recommendations.filter(
      (r) => (statuses[r.problemKey] ?? "pending") === "attempted"
    ).length,
    solved: recommendations.filter(
      (r) => (statuses[r.problemKey] ?? "pending") === "solved"
    ).length,
    skipped: recommendations.filter(
      (r) => (statuses[r.problemKey] ?? "pending") === "skipped"
    ).length,
  };

  const isLoading = loadingStep !== null;

  return (
    <div className="relative min-h-screen bg-background">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>

          <div className="mx-2 hidden h-4 w-px bg-border/60 sm:block" />

          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="CF handle (e.g. tourist)"
                disabled={isLoading}
                className="h-9 w-full rounded-lg border border-border/60 bg-card/60 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>
            <button
              onClick={generate}
              disabled={!handle.trim() || isLoading}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {recommendations.length > 0 ? "Refresh" : "Generate"}
            </button>
          </div>

          {userRating && !isLoading && (
            <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs text-muted-foreground sm:flex">
              Rating: <span className="font-semibold text-foreground">{userRating}</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="py-20 text-center">
            <div className="mb-8 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <Sparkles className="h-7 w-7 animate-pulse text-primary" />
              </div>
            </div>
            <LoadingSteps current={loadingStep!} />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && recommendations.length === 0 && !error && (
          <div className="py-20 text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-card/60">
                <Sparkles className="h-7 w-7 text-muted-foreground/40" />
              </div>
            </div>
            <h2 className="text-base font-semibold text-foreground">
              AI-Powered Problem Recommendations
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Enter your Codeforces handle to get 8 problems hand-picked by AI to target your exact weaknesses — with a specific reason for each one.
            </p>
            <div className="mx-auto mt-6 grid max-w-lg gap-3 text-left text-xs text-muted-foreground">
              {[
                "Analyzes your solve rate per topic vs expected for your rating",
                "Targets the exact difficulty bracket where your performance drops",
                "Explains why each problem will help you improve",
              ].map((text) => (
                <div
                  key={text}
                  className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-card/40 px-3.5 py-2.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {!isLoading && recommendations.length > 0 && (
          <>
            {/* Results header */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {recommendations.length} Recommended Problems
                </h2>
                <p className="text-sm text-muted-foreground">
                  Personalized for{" "}
                  <span className="font-medium text-foreground">{handle.trim()}</span>
                  {userRating && ` · Rating ${userRating}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={generate}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="mb-5">
              <FilterBar
                active={filter}
                counts={counts}
                onChange={setFilter}
              />
            </div>

            {/* Cards grid */}
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No problems with status &ldquo;{filter}&rdquo;.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {filtered.map((rec) => (
                  <ProblemCard
                    key={rec.problemKey}
                    rec={rec}
                    status={statuses[rec.problemKey] ?? "pending"}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            )}

            {/* Progress summary */}
            {counts.solved > 0 && (
              <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                {counts.solved} of {recommendations.length} problems solved!
                {counts.solved === recommendations.length && (
                  <span className="ml-2 font-semibold">
                    🎉 All done — regenerate for fresh recommendations!
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
