"use client";

import { useCallback, useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { TOPICS } from "@/lib/analysis";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ExternalLink,
  Flame,
  Loader2,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import type { ProgressResponse } from "@/app/api/progress/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function activityColor(count: number): string {
  if (count === 0) return "bg-muted/20 hover:bg-muted/40";
  if (count <= 2) return "bg-emerald-900/70 hover:bg-emerald-900";
  if (count <= 5) return "bg-emerald-700/80 hover:bg-emerald-700";
  if (count <= 9) return "bg-emerald-500 hover:bg-emerald-400";
  return "bg-emerald-400 hover:bg-emerald-300";
}

function ratingColor(rating: number): string {
  if (rating >= 2400) return "#ff8c00";
  if (rating >= 1900) return "#aa00aa";
  if (rating >= 1600) return "#0000ff";
  if (rating >= 1400) return "#03a89e";
  if (rating >= 1200) return "#008000";
  return "#808080";
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short" });
}

// ─── Heatmap calendar ─────────────────────────────────────────────────────────

function buildCalendar(): (string | null)[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from the Sunday 52 full weeks before today's Sunday
  const todaySunday = new Date(today);
  todaySunday.setDate(today.getDate() - today.getDay());
  const startSunday = new Date(todaySunday);
  startSunday.setDate(todaySunday.getDate() - 51 * 7);

  const weeks: (string | null)[][] = [];
  const cur = new Date(startSunday);

  while (cur <= today) {
    const week: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(cur);
      day.setDate(cur.getDate() + d);
      week.push(day > today ? null : toDateStr(day));
    }
    weeks.push(week);
    cur.setDate(cur.getDate() + 7);
  }

  return weeks; // columns=weeks, rows=Sun-Sat
}

interface HeatmapProps {
  activityMap: ProgressResponse["activityMap"];
  onDaySelect: (dateStr: string | null) => void;
  selectedDay: string | null;
}

function ActivityHeatmap({ activityMap, onDaySelect, selectedDay }: HeatmapProps) {
  const weeks = buildCalendar();

  // Month labels — find first week of each month
  const monthLabels: { weekIdx: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstDate = week.find((d) => d !== null);
    if (firstDate) {
      const m = new Date(firstDate + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ weekIdx: wi, label: shortMonth(firstDate) });
        lastMonth = m;
      }
    }
  });

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="overflow-x-auto">
      {/* Month labels */}
      <div className="mb-1 flex" style={{ paddingLeft: "2rem" }}>
        {weeks.map((_, wi) => {
          const label = monthLabels.find((ml) => ml.weekIdx === wi);
          return (
            <div key={wi} className="shrink-0" style={{ width: "14px", marginRight: "2px" }}>
              {label && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {label.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex gap-0">
        {/* Day-of-week labels */}
        <div className="flex flex-col justify-between pr-1.5" style={{ gap: "2px" }}>
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className="flex items-center justify-end"
              style={{ height: "14px", marginBottom: i < 6 ? "2px" : "0" }}
            >
              {i % 2 === 1 && (
                <span className="text-[9px] text-muted-foreground/60 w-6 text-right">{d}</span>
              )}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="flex gap-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((dateStr, di) => {
                const count = dateStr ? (activityMap[dateStr]?.count ?? 0) : 0;
                return (
                  <div
                    key={di}
                    onClick={() => dateStr && onDaySelect(selectedDay === dateStr ? null : dateStr)}
                    title={
                      dateStr
                        ? `${dateStr}: ${count} problem${count !== 1 ? "s" : ""}`
                        : undefined
                    }
                    className={cn(
                      "h-3.5 w-3.5 rounded-sm transition-all",
                      dateStr ? "cursor-pointer" : "opacity-0 pointer-events-none",
                      dateStr
                        ? selectedDay === dateStr
                          ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                          : activityColor(count)
                        : ""
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-1.5 justify-end">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {[0, 2, 4, 7, 10].map((n) => (
          <div key={n} className={cn("h-3 w-3 rounded-sm", activityColor(n))} />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  );
}

// ─── Stats cards ──────────────────────────────────────────────────────────────

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

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function RatingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { date: string; rating: number; contestName: string; ratingChange: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const positive = d.ratingChange >= 0;
  return (
    <div className="rounded-lg border border-border/60 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm text-xs">
      <p className="font-semibold text-foreground">{d.contestName}</p>
      <p className="mt-0.5 text-muted-foreground">{shortDate(d.date)}</p>
      <p className="mt-1 text-base font-bold text-foreground">{d.rating}</p>
      <p className={positive ? "text-emerald-400" : "text-red-400"}>
        {positive ? "+" : ""}{d.ratingChange}
      </p>
    </div>
  );
}

function WeekTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card/95 px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-foreground">{payload[0].value} solved</p>
    </div>
  );
}

// ─── Topic progress chart ─────────────────────────────────────────────────────

function TopicProgressChart({
  skillProfile,
  snapshots,
}: {
  skillProfile: ProgressResponse["currentSkillProfile"];
  snapshots: ProgressResponse["snapshots"];
}) {
  const hasHistory = snapshots.length >= 2;
  const oldest = hasHistory ? snapshots[0].topicScores : null;
  const data = TOPICS.filter((t) => {
    const score = skillProfile.topics.find((ts) => ts.topicId === t.id);
    return score && score.attempted >= 3;
  })
    .map((t) => {
      const score = skillProfile.topics.find((ts) => ts.topicId === t.id)!;
      return {
        topic: t.shortLabel,
        current: score.skillScore,
        previous: oldest?.[t.id] ?? null,
      };
    })
    .sort((a, b) => b.current - a.current);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Solve more problems to unlock topic breakdown.
      </div>
    );
  }

  return (
    <div>
      {!hasHistory && (
        <p className="mb-3 text-xs text-muted-foreground/70">
          Check back in a week to see improvement trends.
        </p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="topic" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          {hasHistory && (
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          )}
          {hasHistory && (
            <Bar dataKey="previous" name="Previous" fill="#4c1d95" radius={[0, 2, 2, 0]} maxBarSize={12} />
          )}
          <Bar dataKey="current" name="Current" fill="#8b5cf6" radius={[0, 2, 2, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Snapshot trend chart (overall score over time) ───────────────────────────

function OverallTrendChart({ snapshots }: { snapshots: ProgressResponse["snapshots"] }) {
  if (snapshots.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Need 2+ weekly snapshots to show trend.
      </div>
    );
  }

  const data = snapshots.map((s) => ({
    date: shortDate(s.date),
    score: s.overallScore,
  }));

  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Area type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} fill="url(#scoreGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

function ProgressDashboard({
  data,
  handle,
}: {
  data: ProgressResponse;
  handle: string;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weeklyData = data.stats.weeklyTrend.map((count, i) => {
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() - (7 - i) * 7);
    return { week: `W${i + 1}`, count };
  });

  const ratingChartData = data.ratingHistory.slice(-50);
  const currentRatingColor = ratingColor(data.rating);
  const selectedDayData = selectedDay ? data.activityMap[selectedDay] : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Progress —{" "}
            <a
              href={`https://codeforces.com/profile/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: currentRatingColor }}
              className="transition-opacity hover:opacity-80"
            >
              {handle}
            </a>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground capitalize">
            {data.rank} · Rating {data.rating}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Trophy className="h-4 w-4 text-amber-400" />}
          label="Total Solved"
          value={data.stats.totalSolved}
          sub="Unique problems AC'd"
          color="bg-amber-500/10"
        />
        <StatCard
          icon={<Flame className="h-4 w-4 text-orange-400" />}
          label="Current Streak"
          value={`${data.stats.currentStreak}d`}
          sub={`Longest: ${data.stats.longestStreak} days`}
          color="bg-orange-500/10"
        />
        <StatCard
          icon={<Target className="h-4 w-4 text-emerald-400" />}
          label="Avg Solve Time"
          value={data.stats.avgSolveMins ? `${data.stats.avgSolveMins}m` : "—"}
          sub="From first attempt to AC"
          color="bg-emerald-500/10"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          label={data.stats.mostImprovedTopicDelta ? "Most Improved" : "Strongest Topic"}
          value={data.stats.mostImprovedTopicLabel ?? "—"}
          sub={
            data.stats.mostImprovedTopicDelta
              ? `+${data.stats.mostImprovedTopicDelta} pts this period`
              : "Keep solving to see trends"
          }
          color="bg-primary/10"
        />
      </div>

      {/* Rating chart */}
      {ratingChartData.length > 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Rating History</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {ratingChartData.length} contest{ratingChartData.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ratingChartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="ratingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={shortDate}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<RatingTooltip />} />
              <ReferenceLine
                y={data.rating}
                stroke={currentRatingColor}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="rating"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#ratingGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#8b5cf6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6 text-center text-sm text-muted-foreground">
          No rated contest history yet. Participate in a Codeforces round to see your rating chart.
        </div>
      )}

      {/* Activity heatmap */}
      <div className="rounded-2xl border border-border/50 bg-card/80 p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <CalendarDays className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="font-semibold text-foreground">Solving Activity</h3>
          <span className="ml-auto text-xs text-muted-foreground">Last 52 weeks</span>
        </div>
        <ActivityHeatmap
          activityMap={data.activityMap}
          onDaySelect={setSelectedDay}
          selectedDay={selectedDay}
        />

        {/* Day detail popover */}
        {selectedDay && (
          <div className="mt-4 rounded-xl border border-border/40 bg-background/50 p-4 animate-in slide-in-from-top-1 duration-150">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                {new Date(selectedDay + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long", month: "long", day: "numeric", year: "numeric",
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {selectedDayData?.count ?? 0} problem{(selectedDayData?.count ?? 0) !== 1 ? "s" : ""} solved
              </span>
            </div>
            {selectedDayData && selectedDayData.problems.length > 0 ? (
              <div className="space-y-1.5">
                {selectedDayData.problems.slice(0, 10).map((p, i) => (
                  <a
                    key={i}
                    href={
                      p.contestId
                        ? `https://codeforces.com/contest/${p.contestId}/problem/${p.index}`
                        : "https://codeforces.com/problemset"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group"
                  >
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.rating && (
                      <span className="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-xs">
                        {p.rating}
                      </span>
                    )}
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
                {selectedDayData.problems.length > 10 && (
                  <p className="pl-2 text-xs text-muted-foreground">
                    +{selectedDayData.problems.length - 10} more
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No problems solved this day.</p>
            )}
          </div>
        )}
      </div>

      {/* Two-column: topic progress + weekly trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Topic progress */}
        <div className="rounded-2xl border border-border/50 bg-card/80 p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <BarChart3 className="h-4 w-4 text-violet-400" />
            </div>
            <h3 className="font-semibold text-foreground">Topic Scores</h3>
          </div>
          <TopicProgressChart
            skillProfile={data.currentSkillProfile}
            snapshots={data.snapshots}
          />
        </div>

        {/* Overall trend + weekly */}
        <div className="flex flex-col gap-4">
          {/* Overall score trend */}
          <div className="rounded-2xl border border-border/50 bg-card/80 p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Overall Score Trend</h3>
              <span className="ml-auto text-lg font-bold tabular-nums text-primary">
                {data.currentSkillProfile.overallScore}/100
              </span>
            </div>
            <OverallTrendChart snapshots={data.snapshots} />
          </div>

          {/* Weekly solved */}
          <div className="flex-1 rounded-2xl border border-border/50 bg-card/80 p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Weekly Problems Solved</h3>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={weeklyData} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <Tooltip content={<WeekTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Streak display */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-orange-500/20 bg-card/80 p-5">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-orange-500/5 to-red-500/5" />
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15">
              <Flame className="h-7 w-7 text-orange-400" />
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums text-foreground">
                {data.stats.currentStreak}
                <span className="ml-1 text-base font-normal text-muted-foreground">days</span>
              </div>
              <div className="text-sm text-orange-400 font-medium">Current Streak</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Keep it going — you&apos;re on a roll!
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/80 p-5">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-violet-500/5" />
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Trophy className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums text-foreground">
                {data.stats.longestStreak}
                <span className="ml-1 text-base font-normal text-muted-foreground">days</span>
              </div>
              <div className="text-sm text-primary font-medium">Longest Streak</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Personal best — beat it!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Handle form ──────────────────────────────────────────────────────────────

function HandleForm({ onLoad }: { onLoad: (handle: string, data: ProgressResponse) => void }) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (h: string) => {
      if (!h.trim()) return;
      setError("");
      setLoading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        const params = new URLSearchParams({ handle: h.trim() });
        if (userId) params.set("userId", userId);

        const res = await fetch(`/api/progress?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load progress");
        onLoad(h.trim(), data as ProgressResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load progress");
      } finally {
        setLoading(false);
      }
    },
    [onLoad]
  );

  // Restore from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("progress_handle");
      if (saved) {
        setHandle(saved);
        load(saved);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (handle.trim()) {
      try { sessionStorage.setItem("progress_handle", handle.trim()); } catch {}
      load(handle.trim());
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <BarChart3 className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">Progress Tracker</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rating history · solving activity · topic trends · streaks
        </p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-sm gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Your CF handle"
            className="w-full rounded-lg border border-border/50 bg-background/50 py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !handle.trim()}
          className="gap-1.5 bg-primary font-semibold shadow-sm shadow-primary/20"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Load
        </Button>
      </form>
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Fetching up to 40,000 submissions — this may take 15–30 seconds…
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const [handle, setHandle] = useState("");
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null);

  function handleLoad(h: string, data: ProgressResponse) {
    setHandle(h);
    setProgressData(data);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[300px] w-[300px] rounded-full bg-emerald-500/4 blur-[100px]" />
      </div>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {!progressData ? (
          <HandleForm onLoad={handleLoad} />
        ) : (
          <div>
            {/* Reload bar */}
            <div className="mb-6 flex items-center gap-2">
              <HandleForm
                onLoad={(h, d) => {
                  setHandle(h);
                  setProgressData(d);
                }}
              />
            </div>
            <ProgressDashboard data={progressData} handle={handle} />
          </div>
        )}
      </main>
    </div>
  );
}
