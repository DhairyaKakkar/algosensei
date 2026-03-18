"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SkillProfile, WeakTopicInsight } from "@/lib/analysis";

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  profile,
}: {
  active?: boolean;
  payload?: Array<{ payload: { topic: string; score: number } }>;
  profile: SkillProfile;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const topicSkill = profile.topics.find((t) => t.shortLabel === point.topic);

  return (
    <div className="rounded-lg border border-border/60 bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur-sm text-sm">
      <p className="font-semibold text-foreground">{topicSkill?.label ?? point.topic}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-indigo-400">
        {point.score}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">/100</span>
      </p>
      {topicSkill && topicSkill.attempted > 0 && (
        <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          <p>
            Solved {topicSkill.solved}/{topicSkill.attempted} problems
          </p>
          <p>
            Solve rate:{" "}
            <span className="tabular-nums text-foreground">
              {Math.round(topicSkill.solveRate * 100)}%
            </span>{" "}
            vs expected{" "}
            <span className="tabular-nums text-foreground">
              {Math.round(topicSkill.expectedSolveRate * 100)}%
            </span>
          </p>
          {topicSkill.failureThreshold && (
            <p>
              Drops off at:{" "}
              <span className="font-medium text-yellow-400">
                {topicSkill.failureThreshold}+
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const stroke = 7;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const dashOffset = circumference - (score / 100) * circumference;

  const color =
    score >= 70
      ? "#34d399" // emerald
      : score >= 45
      ? "#818cf8" // indigo
      : "#f87171"; // red

  return (
    <div className="relative flex h-[88px] w-[88px] items-center justify-center">
      <svg width={88} height={88} className="-rotate-90">
        {/* Track */}
        <circle
          cx={44}
          cy={44}
          r={normalizedRadius}
          fill="none"
          stroke="currentColor"
          className="text-border/40"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={44}
          cy={44}
          r={normalizedRadius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ color }}
        >
          {score}
        </span>
        <span className="mt-0.5 text-[10px] text-muted-foreground">score</span>
      </div>
    </div>
  );
}

// ─── Topic Insight Card ───────────────────────────────────────────────────────

function InsightCard({
  insight,
  variant,
}: {
  insight: WeakTopicInsight;
  variant: "weak" | "strong";
}) {
  const isWeak = variant === "weak";
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        isWeak
          ? "border-red-500/20 bg-red-500/[0.04]"
          : "border-emerald-500/20 bg-emerald-500/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground text-sm">{insight.label}</span>
        <span
          className={`shrink-0 text-xs font-bold tabular-nums ${
            isWeak ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {insight.skillScore}
        </span>
      </div>
      {isWeak && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {insight.recommendation}
        </p>
      )}
      {!isWeak && insight.failureThreshold && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Consistent up to{" "}
          <span className="font-medium text-emerald-400">
            {insight.failureThreshold}
          </span>
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SkillRadarChart({ profile }: { profile: SkillProfile }) {
  const { radarData, overallScore, weakestTopics, strongestTopics } = profile;

  if (radarData.length < 3) {
    return (
      <section className="rounded-xl border border-border/50 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Not enough problem variety to build a skill radar. Solve problems across
        more topic categories to unlock this chart.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border/50 bg-card/40">
      <div className="border-b border-border/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Skill Radar</h3>
        <p className="text-xs text-muted-foreground">
          AI-computed skill scores per topic relative to your rating level
        </p>
      </div>

      <div className="p-4">
        {/* Radar + score ring row */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* Score ring */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreRing score={overallScore} />
            <p className="text-xs text-muted-foreground">Overall</p>
          </div>

          {/* Radar chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <PolarAngleAxis
                  dataKey="topic"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                  tickCount={4}
                  stroke="transparent"
                />
                <Radar
                  name="Skill Score"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#818cf8"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                />
                <Tooltip
                  content={<ChartTooltip profile={profile} />}
                  cursor={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weak / Strong panels */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Weakest topics */}
          {weakestTopics.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-red-400/80">
                Weakest Topics
              </h4>
              {weakestTopics.map((t) => (
                <InsightCard key={t.topicId} insight={t} variant="weak" />
              ))}
            </div>
          )}

          {/* Strongest topics */}
          {strongestTopics.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                Strongest Topics
              </h4>
              {strongestTopics.map((t) => (
                <InsightCard key={t.topicId} insight={t} variant="strong" />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
