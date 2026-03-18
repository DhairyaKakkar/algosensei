import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import React from "react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Rating helpers ───────────────────────────────────────────────────────────

function ratingNeon(r: number): string {
  if (r >= 2600) return "#ff1744";
  if (r >= 2400) return "#ff1744";
  if (r >= 2100) return "#ff9100";
  if (r >= 1900) return "#e040fb";
  if (r >= 1600) return "#536dfe";
  if (r >= 1400) return "#00e5ff";
  if (r >= 1200) return "#00c853";
  return "#78909c";
}

function ratingRankLabel(r: number): string {
  if (r >= 3000) return "Legendary Grandmaster";
  if (r >= 2600) return "Intl. Grandmaster";
  if (r >= 2400) return "Grandmaster";
  if (r >= 2100) return "Intl. Master";
  if (r >= 1900) return "Master";
  if (r >= 1600) return "Candidate Master";
  if (r >= 1400) return "Expert";
  if (r >= 1200) return "Specialist";
  if (r >= 1000) return "Pupil";
  if (r > 0) return "Newbie";
  return "Unrated";
}

// ─── Topic label map ──────────────────────────────────────────────────────────

const TOPIC_SHORT: Record<string, string> = {
  dp: "DP",
  graphs: "Graphs",
  greedy: "Greedy",
  math: "Math",
  ds: "DS",
  binsearch: "BinSearch",
  strings: "Strings",
  impl: "Impl",
  geometry: "Geo",
  games: "Games",
};

// ─── Radar chart helpers ──────────────────────────────────────────────────────

function radarPolygonPoints(
  scores: number[],
  cx: number,
  cy: number,
  maxR: number
): string {
  return scores
    .map((s, i) => {
      const angle = (i / scores.length) * 2 * Math.PI - Math.PI / 2;
      const r = (s / 100) * maxR;
      return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
    })
    .join(" ");
}

function gridPolygonPoints(
  n: number,
  cx: number,
  cy: number,
  r: number
): string {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

function spokeEnd(i: number, n: number, cx: number, cy: number, maxR: number) {
  const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
  return {
    x2: (cx + maxR * Math.cos(angle)).toFixed(1),
    y2: (cy + maxR * Math.sin(angle)).toFixed(1),
  };
}

function labelPos(i: number, n: number, cx: number, cy: number, labelR: number) {
  const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
  return {
    x: cx + labelR * Math.cos(angle),
    y: cy + labelR * Math.sin(angle),
    anchor:
      Math.cos(angle) > 0.3 ? "start" : Math.cos(angle) < -0.3 ? "end" : "middle",
    baseline:
      Math.sin(angle) > 0.3 ? "hanging" : Math.sin(angle) < -0.3 ? "auto" : "middle",
  };
}

// ─── Font loader ──────────────────────────────────────────────────────────────

async function loadInterFont(): Promise<ArrayBuffer | undefined> {
  try {
    // Inter Bold woff2 subset
    const r = await fetch(
      "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI-fAZ9hiJ-Ek-_EeA.woff",
      { signal: AbortSignal.timeout(4000) }
    );
    if (!r.ok) return undefined;
    return r.arrayBuffer();
  } catch {
    return undefined;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle")?.trim();
  if (!handle || !/^[a-zA-Z0-9_\-.]{2,25}$/.test(handle)) {
    return new Response("Invalid handle", { status: 400 });
  }

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const [cfResult, fontData, snapshotResult] = await Promise.all([
    fetch(
      `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`,
      { signal: AbortSignal.timeout(8000) }
    )
      .then((r) => r.json())
      .catch(() => null),
    loadInterFont(),
    Promise.resolve(
      createServiceClient()
        .from("skill_snapshots")
        .select("topic_scores, overall_score")
        .eq("handle", handle)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single()
    )
      .then((r) => r.data)
      .catch(() => null),
  ]);

  const cfUser =
    cfResult?.status === "OK" ? (cfResult.result?.[0] ?? null) : null;
  const rating: number = cfUser?.rating ?? 0;
  const accentColor = ratingNeon(rating);
  const rankLabel = ratingRankLabel(rating);

  // Not found card
  if (!cfUser) {
    return new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: 1200,
            height: 630,
            background: "#050c17",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            fontFamily: "sans-serif",
          },
        },
        React.createElement(
          "div",
          { style: { fontSize: 32, color: "#78909c", fontWeight: 700 } },
          "Handle not found"
        ),
        React.createElement(
          "div",
          { style: { fontSize: 16, color: "#3a5570" } },
          handle
        )
      ),
      { width: 1200, height: 630 }
    );
  }

  // ── Skill data ─────────────────────────────────────────────────────────────
  const topicScores: Record<string, number> =
    (snapshotResult?.topic_scores as Record<string, number>) ?? {};
  const overallScore: number = snapshotResult?.overall_score ?? 0;
  const hasSkillData = Object.keys(topicScores).length >= 3;

  const sorted = Object.entries(topicScores)
    .map(([id, score]) => ({ id, label: TOPIC_SHORT[id] ?? id, score }))
    .sort((a, b) => b.score - a.score);

  const strengths = sorted.slice(0, 3);
  const weaknesses = [...sorted].sort((a, b) => a.score - b.score).slice(0, 3);

  // Radar uses top 8 topics for visual density
  const radarTopics = sorted.slice(0, 8);
  const n = radarTopics.length;
  const CX = 160, CY = 160, MAX_R = 118;

  // ── Build JSX ───────────────────────────────────────────────────────────────

  const glowBg = `radial-gradient(ellipse 700px 500px at 0% 0%, ${accentColor}18 0%, transparent 60%), radial-gradient(ellipse 600px 600px at 100% 100%, ${accentColor}08 0%, transparent 60%), #050c17`;

  const sectionTitle = (text: string) =>
    React.createElement(
      "div",
      {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: "#3d5870",
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          marginBottom: 10,
        },
      },
      text
    );

  const skillBar = (label: string, score: number, color: string) =>
    React.createElement(
      "div",
      {
        key: label,
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 9,
        },
      },
      React.createElement(
        "span",
        {
          style: {
            width: 58,
            fontSize: 12,
            color: "#6a8faa",
            fontWeight: 600,
            flexShrink: 0,
          },
        },
        label
      ),
      React.createElement(
        "div",
        {
          style: {
            flex: 1,
            height: 5,
            background: "#0d1e30",
            borderRadius: 4,
            overflow: "hidden",
            display: "flex",
          },
        },
        React.createElement("div", {
          style: {
            width: `${score}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
          },
        })
      ),
      React.createElement(
        "span",
        {
          style: {
            width: 28,
            fontSize: 12,
            fontWeight: 700,
            color: "#c8dff0",
            textAlign: "right" as const,
            flexShrink: 0,
          },
        },
        String(score)
      )
    );

  // Radar SVG element
  const radarSvg =
    hasSkillData && n >= 3
      ? React.createElement(
          "svg",
          {
            width: 320,
            height: 320,
            viewBox: "0 0 320 320",
          },
          // Grid rings (25%, 50%, 75%, 100%)
          ...[0.25, 0.5, 0.75, 1].map((frac) =>
            React.createElement("polygon", {
              key: `ring-${frac}`,
              points: gridPolygonPoints(n, CX, CY, MAX_R * frac),
              fill: "none",
              stroke: "#0d1e30",
              strokeWidth: frac === 1 ? 1.5 : 1,
            })
          ),
          // Spokes
          ...Array.from({ length: n }, (_, i) => {
            const s = spokeEnd(i, n, CX, CY, MAX_R);
            return React.createElement("line", {
              key: `spoke-${i}`,
              x1: CX,
              y1: CY,
              x2: s.x2,
              y2: s.y2,
              stroke: "#0d1e30",
              strokeWidth: 1,
            });
          }),
          // Data polygon fill
          React.createElement("polygon", {
            points: radarPolygonPoints(
              radarTopics.map((t) => t.score),
              CX,
              CY,
              MAX_R
            ),
            fill: `${accentColor}28`,
            stroke: accentColor,
            strokeWidth: 2,
            strokeLinejoin: "round",
          }),
          // Dot at each vertex
          ...radarTopics.map((t, i) => {
            const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
            const r = (t.score / 100) * MAX_R;
            return React.createElement("circle", {
              key: `dot-${i}`,
              cx: (CX + r * Math.cos(angle)).toFixed(1),
              cy: (CY + r * Math.sin(angle)).toFixed(1),
              r: 3.5,
              fill: accentColor,
            });
          }),
          // Labels
          ...radarTopics.map((t, i) => {
            const pos = labelPos(i, n, CX, CY, MAX_R + 22);
            return React.createElement(
              "text",
              {
                key: `label-${i}`,
                x: pos.x.toFixed(1),
                y: pos.y.toFixed(1),
                textAnchor: pos.anchor,
                dominantBaseline: pos.baseline,
                fontSize: "10.5",
                fill: "#5a7fa8",
                fontWeight: "600",
              },
              t.label
            );
          })
        )
      : null;

  const card = React.createElement(
    "div",
    {
      style: {
        width: 1200,
        height: 630,
        background: glowBg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        position: "relative",
        overflow: "hidden",
      },
    },

    // ── Subtle top-left corner accent ────────────────────────────────────────
    React.createElement("div", {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: 3,
        height: 630,
        background: `linear-gradient(to bottom, ${accentColor}, transparent 60%)`,
      },
    }),
    React.createElement("div", {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: 1200,
        height: 3,
        background: `linear-gradient(to right, ${accentColor}, transparent 40%)`,
      },
    }),

    // ── Header bar ───────────────────────────────────────────────────────────
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 52,
          paddingRight: 52,
          paddingTop: 36,
          paddingBottom: 0,
        },
      },
      // Logo
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
          },
        },
        React.createElement(
          "div",
          {
            style: {
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#536dfe22",
              border: "1px solid #536dfe44",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            },
          },
          "⚡"
        ),
        React.createElement(
          "span",
          {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: "#c8dff0",
              letterSpacing: "-0.01em",
            },
          },
          "AlgoSensei"
        )
      ),
      // Rating badge (top right)
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: `${accentColor}12`,
            border: `1px solid ${accentColor}30`,
            borderRadius: 12,
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 8,
            paddingBottom: 8,
          },
        },
        React.createElement(
          "span",
          {
            style: {
              fontSize: 36,
              fontWeight: 800,
              color: accentColor,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            },
          },
          String(rating || "—")
        ),
        React.createElement("div", {
          style: {
            width: 1,
            height: 28,
            background: `${accentColor}30`,
          },
        }),
        React.createElement(
          "span",
          {
            style: {
              fontSize: 13,
              fontWeight: 600,
              color: accentColor,
              opacity: 0.85,
            },
          },
          rankLabel
        )
      )
    ),

    // ── Main content ─────────────────────────────────────────────────────────
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flex: 1,
          paddingLeft: 52,
          paddingRight: 44,
          paddingTop: 24,
          paddingBottom: 0,
          gap: 36,
        },
      },

      // Left column: handle + skill breakdown
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            width: 440,
            flexShrink: 0,
          },
        },
        // Handle
        React.createElement(
          "div",
          {
            style: {
              fontSize: 52,
              fontWeight: 800,
              color: accentColor,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              marginBottom: 6,
            },
          },
          handle
        ),
        // Rank + overall score
        hasSkillData
          ? React.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 28,
                },
              },
              React.createElement(
                "span",
                {
                  style: {
                    fontSize: 14,
                    color: accentColor,
                    opacity: 0.7,
                    fontWeight: 600,
                  },
                },
                rankLabel
              ),
              React.createElement("div", {
                style: { width: 3, height: 3, borderRadius: 2, background: "#2a4060" },
              }),
              React.createElement(
                "span",
                {
                  style: {
                    fontSize: 13,
                    color: "#5a7fa8",
                    fontWeight: 600,
                  },
                },
                `Skill score: ${overallScore}/100`
              )
            )
          : React.createElement(
              "div",
              {
                style: {
                  fontSize: 14,
                  color: accentColor,
                  opacity: 0.7,
                  fontWeight: 600,
                  marginBottom: 28,
                },
              },
              rankLabel
            ),

        // Skill breakdown (if data available)
        ...(hasSkillData
          ? [
              // Divider
              React.createElement("div", {
                key: "div",
                style: {
                  width: "100%",
                  height: 1,
                  background: "#0d1e30",
                  marginBottom: 20,
                },
              }),
              // Strengths
              sectionTitle("Top Strengths"),
              ...strengths.map((s) => skillBar(s.label, s.score, accentColor)),
              // Gap
              React.createElement("div", {
                key: "gap",
                style: { height: 14 },
              }),
              // Weaknesses
              sectionTitle("Focus Areas"),
              ...weaknesses.map((s) =>
                skillBar(s.label, s.score, "#2a4060")
              ),
            ]
          : [
              React.createElement(
                "div",
                {
                  key: "no-data",
                  style: {
                    fontSize: 13,
                    color: "#3a5570",
                    lineHeight: 1.5,
                  },
                },
                "Visit algosensei.com to unlock\nyour full skill breakdown."
              ),
            ])
      ),

      // Right column: radar or placeholder
      React.createElement(
        "div",
        {
          style: {
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        },
        radarSvg ??
          // No skill data — show a big rating number
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              },
            },
            React.createElement(
              "div",
              {
                style: {
                  fontSize: 120,
                  fontWeight: 900,
                  color: accentColor,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  opacity: 0.15,
                },
              },
              String(rating || "?")
            )
          )
      )
    ),

    // ── Footer ────────────────────────────────────────────────────────────────
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 52,
          paddingRight: 52,
          paddingBottom: 28,
          paddingTop: 12,
          borderTop: "1px solid #0d1e30",
          marginTop: 12,
        },
      },
      React.createElement(
        "span",
        {
          style: {
            fontSize: 12,
            color: "#2a4060",
            fontWeight: 600,
            letterSpacing: "0.04em",
          },
        },
        "ANALYZED BY ALGOSENSEI"
      ),
      React.createElement(
        "span",
        {
          style: {
            fontSize: 12,
            color: "#1e3050",
          },
        },
        "algosensei.vercel.app"
      )
    )
  );

  const fonts = fontData
    ? [{ name: "Inter", data: fontData, weight: 700 as const, style: "normal" as const }]
    : [];

  return new ImageResponse(card, {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
