"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContestProblem, ContestResults, ProblemVerdict } from "@/lib/contest";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Flag,
  Loader2,
  MinusCircle,
  Play,
  RefreshCw,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "setup" | "generating" | "preview" | "active" | "submitting" | "results";
type Difficulty = "easy" | "medium" | "hard";

interface ProblemState {
  problem: ContestProblem;
  status: "unsolved" | "solved" | "skipped";
  wrongAttempts: number;
  solveTimeMinutes: number | null;
}

interface SavedContest {
  contestId: string | null;
  problems: ContestProblem[];
  durationMinutes: number;
  startedAt: number;
  problemStates: ProblemState[];
}

const DIFFICULTY_OFFSET: Record<Difficulty, number> = {
  easy: -200,
  medium: 0,
  hard: +200,
};

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; color: string }> = {
  easy: { label: "Easy", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  medium: { label: "Medium", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  hard: { label: "Hard", color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const SLOT_COLORS = [
  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "bg-red-500/10 text-red-400 border-red-500/20",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ratingBadgeColor(r: number) {
  if (r >= 2100) return "bg-orange-500/10 text-orange-400";
  if (r >= 1900) return "bg-violet-500/10 text-violet-400";
  if (r >= 1600) return "bg-blue-500/10 text-blue-400";
  if (r >= 1400) return "bg-cyan-500/10 text-cyan-400";
  if (r >= 1200) return "bg-emerald-500/10 text-emerald-400";
  return "bg-muted/50 text-muted-foreground";
}

function ratingImpact(solved: number, total: number, userRating: number): string {
  const fraction = solved / total;
  if (fraction === 1) return `+${Math.round(25 + userRating * 0.02)} (estimated)`;
  if (fraction >= 0.8) return `+${Math.round(10 + userRating * 0.01)} (estimated)`;
  if (fraction >= 0.6) return `+${Math.round(5)} (estimated)`;
  if (fraction >= 0.4) return `−0 to −10 (estimated)`;
  return `−${Math.round(15 + (1 - fraction) * 20)} (estimated)`;
}

// ─── Markdown renderer (for GPT-4o analysis) ─────────────────────────────────

function renderAnalysis(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let ulBuffer: string[] = [];

  function flushList() {
    if (ulBuffer.length === 0) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 space-y-1 pl-4">
        {ulBuffer.map((item, i) => (
          <li key={i} className="list-disc text-sm text-muted-foreground">
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
    ulBuffer = [];
  }

  lines.forEach((line, i) => {
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const text = line.replace(/^#+\s/, "");
      nodes.push(
        <h4 key={i} className="mt-5 mb-1.5 text-sm font-semibold text-foreground">
          {renderInline(text)}
        </h4>
      );
    } else if (/^[-*]\s/.test(line)) {
      ulBuffer.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      flushList();
      nodes.push(
        <p key={i} className="text-sm leading-relaxed text-muted-foreground">
          {renderInline(line)}
        </p>
      );
    }
  });
  flushList();
  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

// ─── Timer ───────────────────────────────────────────────────────────────────

function ContestTimer({
  timeLeftSeconds,
}: {
  timeLeftSeconds: number;
}) {
  const urgent = timeLeftSeconds < 15 * 60;
  const warning = timeLeftSeconds < 30 * 60;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-2xl font-bold tabular-nums transition-colors",
        urgent
          ? "animate-pulse border-red-500/40 bg-red-500/10 text-red-400"
          : warning
          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
          : "border-border/50 bg-card/60 text-foreground"
      )}
    >
      <Clock className={cn("h-5 w-5", urgent ? "text-red-400" : warning ? "text-amber-400" : "text-muted-foreground")} />
      {formatTime(timeLeftSeconds)}
    </div>
  );
}

// ─── Problem status badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProblemState["status"] }) {
  if (status === "solved")
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (status === "skipped")
    return <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />;
  return <div className="h-4 w-4 shrink-0 rounded-full border-2 border-border/60" />;
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({
  onGenerate,
}: {
  onGenerate: (handle: string, rating: number, weakTopicIds: string[], difficulty: Difficulty, contestId: string | null, problems: ContestProblem[]) => void;
}) {
  const [handle, setHandle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "syncing" | "generating">("idle");
  const [error, setError] = useState("");

  async function generate() {
    if (!handle.trim()) return;
    setError("");
    setLoading(true);
    setStep("syncing");

    try {
      // 1. Sync CF profile to get rating + weak topics
      const syncRes = await fetch(
        `/api/codeforces/sync?handle=${encodeURIComponent(handle.trim())}`
      );
      const syncData = await syncRes.json();
      if (!syncRes.ok) throw new Error(syncData.error ?? "Failed to load profile");

      const userRating: number = syncData.user?.rating ?? 1200;
      const weakTopicIds: string[] =
        (syncData.skillProfile?.weakestTopics ?? [])
          .slice(0, 2)
          .map((t: { topicId: string }) => t.topicId);
      const solvedKeys: string[] = (syncData.recentSubmissions ?? [])
        .filter((s: { verdict: string }) => s.verdict === "OK")
        .map((s: { problemKey: string }) => s.problemKey);

      // 2. Generate contest problems
      setStep("generating");
      const effectiveRating = Math.max(
        800,
        Math.min(3200, userRating + DIFFICULTY_OFFSET[difficulty])
      );

      const genRes = await fetch("/api/contest/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRating: effectiveRating,
          weakTopicIds,
          solvedKeys,
          durationMinutes: 120,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error ?? "Failed to generate contest");

      onGenerate(
        handle.trim(),
        userRating,
        weakTopicIds,
        difficulty,
        genData.contestId ?? null,
        genData.problems ?? []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate contest");
    } finally {
      setLoading(false);
      setStep("idle");
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 py-16 text-center">
      {/* Icon */}
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
          <Zap className="h-3 w-3 text-primary-foreground" />
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Contest Simulator</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          5 handpicked problems · 2-hour timer · GPT-4o post-contest analysis
        </p>
      </div>

      {/* Form */}
      <div className="w-full max-w-sm space-y-4">
        {/* Handle input */}
        <div>
          <label className="mb-1.5 block text-left text-sm font-medium text-foreground/80">
            Codeforces Handle
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. tourist"
            disabled={loading}
            className="w-full rounded-lg border border-border/50 bg-background/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50"
          />
        </div>

        {/* Difficulty selector */}
        <div>
          <label className="mb-1.5 block text-left text-sm font-medium text-foreground/80">
            Difficulty
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                disabled={loading}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                  difficulty === d
                    ? DIFFICULTY_LABELS[d].color
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {DIFFICULTY_LABELS[d].label}
                <div className="mt-0.5 text-xs font-normal opacity-70">
                  {d === "easy" ? "−200" : d === "medium" ? "±0" : "+200"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Button
          onClick={generate}
          disabled={loading || !handle.trim()}
          className="w-full gap-2 bg-primary font-semibold shadow-sm shadow-primary/20"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {step === "syncing" ? "Fetching profile…" : "Generating contest…"}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate Contest
            </>
          )}
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid w-full max-w-lg gap-3 sm:grid-cols-3 text-left">
        {[
          { icon: <Trophy className="h-4 w-4 text-amber-400" />, title: "5 Problems", desc: "Staggered difficulty tailored to your rating" },
          { icon: <Clock className="h-4 w-4 text-primary" />, title: "2 Hours", desc: "Real contest pressure with a live countdown" },
          { icon: <Sparkles className="h-4 w-4 text-violet-400" />, title: "AI Analysis", desc: "GPT-4o debrief on your performance" },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-border/40 bg-card/60 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              {card.icon}
              <span className="text-xs font-semibold text-foreground">{card.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Preview Screen ───────────────────────────────────────────────────────────

function PreviewScreen({
  problems,
  difficulty,
  userRating,
  onStart,
  onRegenerate,
  generating,
}: {
  problems: ContestProblem[];
  difficulty: Difficulty;
  userRating: number;
  onStart: () => void;
  onRegenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Your Contest</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Rating {userRating} ·{" "}
            <span className={cn("font-medium", DIFFICULTY_LABELS[difficulty].color.split(" ")[0])}>
              {DIFFICULTY_LABELS[difficulty].label}
            </span>{" "}
            · 2 hours
          </p>
        </div>
        <button
          onClick={onRegenerate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-lg p-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
          Regenerate
        </button>
      </div>

      {/* Problem list */}
      <div className="space-y-2">
        {problems.map((p, i) => (
          <div
            key={p.problemKey}
            className="relative overflow-hidden rounded-xl border border-border/50 bg-card/60 p-4"
          >
            <div className="flex items-start gap-3">
              <span className={cn("inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium", SLOT_COLORS[i])}>
                {p.slotLabel}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground text-sm">{p.name}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", ratingBadgeColor(p.rating))}>
                    {p.rating}
                  </span>
                  {p.isWeakTopic && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <Zap className="h-2.5 w-2.5" />
                      Weak topic
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.tags.slice(0, 4).map((t) => (
                    <span key={t} className="rounded bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                {p.maxScore}pts
              </span>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={onStart}
        className="w-full gap-2 bg-primary py-3 text-base font-semibold shadow-md shadow-primary/20"
      >
        <Play className="h-5 w-5" />
        Start Contest
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Timer starts immediately. Problems open in a new tab.
      </p>
    </div>
  );
}

// ─── Active Contest ───────────────────────────────────────────────────────────

function ActiveContest({
  problemStates,
  timeLeftSeconds,
  onMarkSolved,
  onMarkSkipped,
  onWrongAttempt,
  onEndContest,
  submitting,
}: {
  problemStates: ProblemState[];
  timeLeftSeconds: number;
  onMarkSolved: (idx: number) => void;
  onMarkSkipped: (idx: number) => void;
  onWrongAttempt: (idx: number) => void;
  onEndContest: () => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const ps = problemStates[selected];

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col overflow-hidden">
      {/* Contest header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card/40 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 sm:flex text-sm text-muted-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">Virtual Contest</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {problemStates.filter((p) => p.status === "solved").length}/{problemStates.length} solved
          </div>
        </div>

        <ContestTimer timeLeftSeconds={timeLeftSeconds} />

        <Button
          variant="outline"
          size="sm"
          onClick={onEndContest}
          disabled={submitting}
          className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Flag className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">End Contest</span>
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-48 shrink-0 flex-col border-r border-border/50 bg-card/30 overflow-y-auto sm:w-56">
          {problemStates.map((ps, i) => (
            <button
              key={ps.problem.problemKey}
              onClick={() => setSelected(i)}
              className={cn(
                "flex items-center gap-2.5 border-b border-border/30 px-3 py-3 text-left transition-colors",
                selected === i
                  ? "bg-primary/8 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <StatusBadge status={ps.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-xs font-medium", SLOT_COLORS[i].split(" ")[1])}>
                    P{i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground">{ps.problem.rating}</span>
                </div>
                <div className="truncate text-xs font-medium">{ps.problem.name}</div>
              </div>
              {selected === i && <ChevronRight className="h-3 w-3 shrink-0 text-primary" />}
            </button>
          ))}
        </aside>

        {/* Problem panel */}
        <main className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-2xl space-y-5">
            {/* Problem header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", SLOT_COLORS[selected])}>
                    {ps.problem.slotLabel}
                  </span>
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", ratingBadgeColor(ps.problem.rating))}>
                    {ps.problem.rating}
                  </span>
                  {ps.problem.isWeakTopic && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <Zap className="h-2.5 w-2.5" />
                      {ps.problem.weakTopicLabel ?? "Weak topic"}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-xl font-bold text-foreground">{ps.problem.name}</h2>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ps.problem.tags.map((t) => (
                    <span key={t} className="rounded bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <a
                href={ps.problem.cfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                Open in CF
              </a>
            </div>

            {/* Status / score info */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <StatusBadge status={ps.status} />
                  <span className="font-medium text-foreground capitalize">{ps.status}</span>
                  {ps.wrongAttempts > 0 && (
                    <span className="text-xs text-red-400">
                      {ps.wrongAttempts} wrong attempt{ps.wrongAttempts !== 1 ? "s" : ""} (−{ps.wrongAttempts * 50} pts)
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Max: <span className="font-semibold text-foreground">{ps.problem.maxScore}</span> pts
                  {ps.status === "solved" && ps.solveTimeMinutes != null && (
                    <span className="ml-2 text-emerald-400">
                      solved at {ps.solveTimeMinutes.toFixed(0)}m
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {ps.status === "unsolved" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => onMarkSolved(selected)}
                  className="flex-1 gap-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20"
                  variant="outline"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark as Solved
                </Button>
                <Button
                  onClick={() => onWrongAttempt(selected)}
                  variant="outline"
                  className="flex-1 gap-2 border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                >
                  <AlertCircle className="h-4 w-4" />
                  Wrong Attempt (−50 pts)
                </Button>
                <Button
                  onClick={() => onMarkSkipped(selected)}
                  variant="outline"
                  className="gap-2 border-border/50 text-muted-foreground hover:text-foreground"
                >
                  <MinusCircle className="h-4 w-4" />
                  Skip
                </Button>
              </div>
            ) : ps.status === "solved" ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Solved — great work! Move to the next problem.
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <MinusCircle className="h-4 w-4" />
                Skipped — you can still come back to this.
                <button
                  onClick={() => {
                    const idx = selected;
                    onMarkSolved(idx);
                  }}
                  className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
                >
                  Mark solved
                </button>
              </div>
            )}

            {/* Quick nav */}
            <div className="flex gap-2 border-t border-border/30 pt-4">
              {problemStates.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                    i === selected
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : s.status === "solved"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : s.status === "skipped"
                      ? "border-border/30 text-muted-foreground/50"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  P{i + 1}
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  results,
  problems,
  userRating,
  difficulty,
  onPlayAgain,
}: {
  results: ContestResults;
  problems: ContestProblem[];
  userRating: number;
  difficulty: Difficulty;
  onPlayAgain: () => void;
}) {
  const maxTotal = problems.reduce((sum, p) => sum + p.maxScore, 0);
  const pct = Math.round((results.totalScore / maxTotal) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Contest Complete</h2>
        <p className="mt-1 text-sm text-muted-foreground capitalize">
          {DIFFICULTY_LABELS[difficulty].label} · Rating {userRating}
        </p>
      </div>

      {/* Score overview */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
          <div className="text-3xl font-bold tabular-nums text-foreground">{results.solvedCount}/{problems.length}</div>
          <div className="mt-1 text-sm text-muted-foreground">Problems Solved</div>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
          <div className="text-3xl font-bold tabular-nums text-primary">{results.totalScore}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            / {maxTotal} pts ({pct}%)
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {ratingImpact(results.solvedCount, problems.length, userRating)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Rating Impact</div>
        </div>
      </div>

      {/* Per-problem breakdown */}
      <div className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
        <div className="border-b border-border/50 px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">Problem Breakdown</h3>
        </div>
        <div className="divide-y divide-border/30">
          {problems.map((p, i) => {
            const r = results.problems[i];
            const solved = r?.verdict === "AC";
            return (
              <div key={p.problemKey} className="flex items-center gap-3 px-5 py-3.5">
                <StatusBadge status={solved ? "solved" : r?.verdict === "SKIP" ? "skipped" : "unsolved"} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold", ratingBadgeColor(p.rating))}>
                      {p.rating}
                    </span>
                    {p.isWeakTopic && (
                      <span className="text-xs text-primary">weak topic</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {solved
                      ? `Solved in ${r.solveTimeMinutes?.toFixed(0)}m${r.wrongAttempts > 0 ? ` · ${r.wrongAttempts} WA` : ""}`
                      : r?.verdict === "SKIP"
                      ? "Skipped"
                      : `Not solved${r?.wrongAttempts ? ` · ${r.wrongAttempts} attempts` : ""}`}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums">
                  <span className={solved ? "text-emerald-400" : "text-muted-foreground/50"}>
                    {r?.score ?? 0}
                  </span>
                  <span className="text-muted-foreground/40">/{p.maxScore}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GPT-4o analysis */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-6 shadow-lg shadow-primary/5">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-violet-500/5" />
        <div className="absolute inset-0 -z-10 bg-card/80" />
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <BrainCircuit className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">AI Coach Analysis</h3>
          <span className="ml-auto rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
            GPT-4o
          </span>
        </div>
        <div className="prose-sm">{renderAnalysis(results.analysis)}</div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          onClick={onPlayAgain}
          className="flex-1 gap-2 bg-primary font-semibold shadow-sm shadow-primary/20"
        >
          <RefreshCw className="h-4 w-4" />
          New Contest
        </Button>
        <Link href="/problems" className="flex-1">
          <Button variant="outline" className="w-full gap-2 border-border/50">
            <Trophy className="h-4 w-4" />
            Practice Problems
          </Button>
        </Link>
        <Link href="/coach" className="flex-1">
          <Button variant="outline" className="w-full gap-2 border-border/50">
            <BrainCircuit className="h-4 w-4" />
            AI Coach
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DURATION_MINUTES = 120;
const STORAGE_KEY = "active_contest_v1";

export default function ContestPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [contestId, setContestId] = useState<string | null>(null);
  const [problems, setProblems] = useState<ContestProblem[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [userRating, setUserRating] = useState(1200);
  const [cfHandle, setCfHandle] = useState("");
  const [weakTopicIds, setWeakTopicIds] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(DURATION_MINUTES * 60);
  const [problemStates, setProblemStates] = useState<ProblemState[]>([]);
  const [results, setResults] = useState<ContestResults | null>(null);

  // Use ref so timer callback always has fresh submit fn
  const submitRef = useRef<(() => void) | null>(null);

  // ── Restore active contest from sessionStorage on mount ───────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const data: SavedContest = JSON.parse(saved);
      const elapsed = (Date.now() - data.startedAt) / 1000;
      if (elapsed < data.durationMinutes * 60) {
        setContestId(data.contestId);
        setProblems(data.problems);
        setStartedAt(data.startedAt);
        setProblemStates(data.problemStates);
        setPhase("active");
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "active" || !startedAt) return;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, DURATION_MINUTES * 60 - elapsed);
      setTimeLeftSeconds(left);
      if (left === 0 && submitRef.current) {
        submitRef.current();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  // ── Persist problem states to sessionStorage during active contest ─────────
  useEffect(() => {
    if (phase !== "active" || !startedAt) return;
    try {
      const data: SavedContest = {
        contestId,
        problems,
        durationMinutes: DURATION_MINUTES,
        startedAt,
        problemStates,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [phase, problemStates, contestId, problems, startedAt]);

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (phase === "submitting" || phase === "results") return;
    setPhase("submitting");
    sessionStorage.removeItem(STORAGE_KEY);

    const rawResults = problemStates.map((ps) => ({
      problemKey: ps.problem.problemKey,
      verdict: (ps.status === "solved" ? "AC" : ps.status === "skipped" ? "SKIP" : "WA") as ProblemVerdict,
      wrongAttempts: ps.wrongAttempts,
      solveTimeMinutes: ps.solveTimeMinutes,
    }));

    try {
      const res = await fetch("/api/contest/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestId,
          userRating,
          cfHandle,
          problems,
          durationMinutes: DURATION_MINUTES,
          rawResults,
        }),
      });
      const data = await res.json();
      setResults(data.results ?? null);
    } catch {
      // Fallback: show basic results without analysis
      const totalScore = problemStates.reduce((sum, ps) => {
        if (ps.status !== "solved") return sum;
        const maxScore = ps.problem.maxScore;
        const timePenalty = Math.floor(ps.solveTimeMinutes ?? 0) * 10;
        const attemptPenalty = ps.wrongAttempts * 50;
        return sum + Math.max(Math.round(maxScore * 0.3), maxScore - timePenalty - attemptPenalty);
      }, 0);
      setResults({
        problems: problemStates.map((ps) => ({
          problemKey: ps.problem.problemKey,
          verdict: (ps.status === "solved" ? "AC" : ps.status === "skipped" ? "SKIP" : "WA") as ProblemVerdict,
          wrongAttempts: ps.wrongAttempts,
          solveTimeMinutes: ps.solveTimeMinutes,
          score: 0,
        })),
        totalScore,
        solvedCount: problemStates.filter((ps) => ps.status === "solved").length,
        analysis: "Analysis unavailable — network error.",
      });
    }
    setPhase("results");
  }, [phase, problemStates, contestId, userRating, cfHandle, problems]);

  // Keep submitRef in sync
  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

  // ── Problem state mutators ────────────────────────────────────────────────
  function markSolved(idx: number) {
    if (!startedAt) return;
    const elapsed = (Date.now() - startedAt) / 1000 / 60;
    setProblemStates((prev) =>
      prev.map((ps, i) =>
        i === idx && ps.status !== "solved"
          ? { ...ps, status: "solved", solveTimeMinutes: parseFloat(elapsed.toFixed(1)) }
          : ps
      )
    );
  }

  function markSkipped(idx: number) {
    setProblemStates((prev) =>
      prev.map((ps, i) =>
        i === idx && ps.status === "unsolved" ? { ...ps, status: "skipped" } : ps
      )
    );
  }

  function addWrongAttempt(idx: number) {
    setProblemStates((prev) =>
      prev.map((ps, i) =>
        i === idx && ps.status === "unsolved"
          ? { ...ps, wrongAttempts: ps.wrongAttempts + 1 }
          : ps
      )
    );
  }

  // ── Phase transitions ─────────────────────────────────────────────────────
  function handleGenerated(
    handle: string,
    rating: number,
    topicIds: string[],
    diff: Difficulty,
    cid: string | null,
    probs: ContestProblem[]
  ) {
    setCfHandle(handle);
    setUserRating(rating);
    setWeakTopicIds(topicIds);
    setDifficulty(diff);
    setContestId(cid);
    setProblems(probs);
    setProblemStates(
      probs.map((p) => ({ problem: p, status: "unsolved", wrongAttempts: 0, solveTimeMinutes: null }))
    );
    setPhase("preview");
  }

  function handleStart() {
    const now = Date.now();
    setStartedAt(now);
    setTimeLeftSeconds(DURATION_MINUTES * 60);
    setPhase("active");
  }

  async function handleRegenerate() {
    if (!cfHandle) return;
    setPhase("generating");
    try {
      const syncRes = await fetch(`/api/codeforces/sync?handle=${encodeURIComponent(cfHandle)}`);
      const syncData = await syncRes.json();
      const effectiveRating = Math.max(800, Math.min(3200, userRating + DIFFICULTY_OFFSET[difficulty]));
      const solvedKeys = (syncData.recentSubmissions ?? [])
        .filter((s: { verdict: string }) => s.verdict === "OK")
        .map((s: { problemKey: string }) => s.problemKey);

      const genRes = await fetch("/api/contest/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userRating: effectiveRating,
          weakTopicIds,
          solvedKeys,
          durationMinutes: 120,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error);
      setContestId(genData.contestId ?? null);
      setProblems(genData.problems ?? []);
      setProblemStates(
        (genData.problems ?? []).map((p: ContestProblem) => ({
          problem: p,
          status: "unsolved",
          wrongAttempts: 0,
          solveTimeMinutes: null,
        }))
      );
      setPhase("preview");
    } catch {
      setPhase("preview"); // stay on preview with old problems
    }
  }

  function handlePlayAgain() {
    setPhase("setup");
    setContestId(null);
    setProblems([]);
    setProblemStates([]);
    setResults(null);
    setStartedAt(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const showNav = phase !== "active";

  return (
    <div className="min-h-screen bg-background">
      {showNav && <AppNav />}

      {phase === "setup" && (
        <main className="mx-auto max-w-7xl px-6">
          <SetupScreen onGenerate={handleGenerated} />
        </main>
      )}

      {phase === "generating" && (
        <main className="flex min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Generating new contest…</span>
          </div>
        </main>
      )}

      {phase === "preview" && problems.length > 0 && (
        <main className="mx-auto max-w-7xl px-6">
          <PreviewScreen
            problems={problems}
            difficulty={difficulty}
            userRating={userRating}
            onStart={handleStart}
            onRegenerate={handleRegenerate}
            generating={false}
          />
        </main>
      )}

      {phase === "active" && (
        <ActiveContest
          problemStates={problemStates}
          timeLeftSeconds={timeLeftSeconds}
          onMarkSolved={markSolved}
          onMarkSkipped={markSkipped}
          onWrongAttempt={addWrongAttempt}
          onEndContest={handleSubmit}
          submitting={false}
        />
      )}

      {phase === "submitting" && (
        <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="font-semibold text-foreground">Analyzing your performance…</p>
            <p className="mt-1 text-sm text-muted-foreground">GPT-4o is reviewing your contest</p>
          </div>
        </main>
      )}

      {phase === "results" && results && (
        <main className="mx-auto max-w-7xl px-6">
          <ResultsScreen
            results={results}
            problems={problems}
            userRating={userRating}
            difficulty={difficulty}
            onPlayAgain={handlePlayAgain}
          />
        </main>
      )}
    </div>
  );
}
