import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import type { SkillProfile } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { skillProfile: SkillProfile; userRating: number; handle: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { skillProfile, userRating, handle } = body;

  if (!skillProfile || !userRating || !handle) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const weakTopics = skillProfile.weakestTopics.slice(0, 3);
  const strongTopics = skillProfile.strongestTopics.slice(0, 2);

  const topicDetails = skillProfile.topics
    .filter((t) => t.attempted >= 3)
    .map((t) => {
      const threshold = t.failureThreshold ? `, struggles above rating ${t.failureThreshold}` : "";
      return `${t.label}: score ${t.skillScore}/100, ${Math.round(t.solveRate * 100)}% actual vs ${Math.round(t.expectedSolveRate * 100)}% expected (${t.attempted} attempts)${threshold}`;
    })
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert competitive programming coach. Write a concise, insightful coaching summary for a student. Be encouraging but honest. Use specific numbers. Keep it to 3-4 short paragraphs.",
        },
        {
          role: "user",
          content: `Codeforces handle: ${handle}
Rating: ${userRating}
Overall skill score: ${skillProfile.overallScore}/100

TOPIC BREAKDOWN:
${topicDetails}

WEAKEST AREAS: ${weakTopics.map((t) => t.label).join(", ")}
STRONGEST AREAS: ${strongTopics.map((t) => t.label).join(", ")}

Write a personalized coaching summary that:
1. Briefly acknowledges their current level (1 sentence)
2. Identifies their top 3 specific weaknesses with concrete advice (2-3 sentences each)
3. Ends with one actionable focus recommendation for the next week

Be specific — mention actual topics, ratings, and what techniques they should study. Write in second person ("you").`,
        },
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    const summary = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("[ai-summary] OpenAI error:", err);
    return NextResponse.json(
      { error: `AI summary failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
