import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import type { ProblemMeta, ChatMessage } from "@/lib/coach";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Simple in-process problem cache ─────────────────────────────────────────

const problemCache = new Map<string, ProblemMeta>();

// ─── Problem HTML → clean text ────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBetween(html: string, open: string): string {
  const start = html.indexOf(open);
  if (start === -1) return "";
  let depth = 0;
  let i = start;
  while (i < html.length) {
    if (html.startsWith("<div", i)) depth++;
    if (html.startsWith("</div>", i)) {
      depth--;
      if (depth === 0) return html.slice(start, i + 6);
    }
    i++;
  }
  return html.slice(start, Math.min(start + 60000, html.length));
}

function parseLimit(html: string, cls: string): string {
  const m = html.match(
    new RegExp(`class="${cls}"[^>]*>[^<]*<div[^>]*>[^<]*<\\/div>([^<]+)`)
  );
  return m ? m[1].trim() : "";
}

async function fetchProblemFromCF(
  contestId: number,
  index: string
): Promise<ProblemMeta> {
  const cacheKey = `${contestId}-${index}`;
  if (problemCache.has(cacheKey)) return problemCache.get(cacheKey)!;

  // Fetch HTML page and CF API metadata in parallel
  const [htmlRes, apiRes] = await Promise.allSettled([
    fetch(`https://codeforces.com/contest/${contestId}/problem/${index}`, {
      headers: { "User-Agent": "Mozilla/5.0 AlgoSensei/1.0" },
      signal: AbortSignal.timeout(12_000),
    }),
    fetch(
      `https://codeforces.com/api/contest.standings?contestId=${contestId}&from=1&count=1&showUnofficial=false`,
      { signal: AbortSignal.timeout(10_000) }
    ),
  ]);

  // ── Extract statement from HTML ──────────────────────────────────────────
  let statement = "";
  let titleFromPage = "";
  let timeLimit = "";
  let memoryLimit = "";

  if (htmlRes.status === "fulfilled" && htmlRes.value.ok) {
    const html = await htmlRes.value.text();
    const problemBlock = extractBetween(html, '<div class="problem-statement">');

    if (problemBlock) {
      // Title
      const titleMatch = problemBlock.match(/<div class="title">([^<]+)<\/div>/);
      if (titleMatch) titleFromPage = titleMatch[1].replace(/^[A-Z\d]+\.\s*/, "").trim();

      // Limits
      timeLimit = parseLimit(problemBlock, "time-limit");
      memoryLimit = parseLimit(problemBlock, "memory-limit");

      // Statement (remove header div first)
      const noHeader = problemBlock.replace(/<div class="header">[\s\S]*?<\/div>\s*/, "");
      statement = htmlToText(noHeader).slice(0, 5000);
    }
  }

  // ── Extract metadata from CF API ─────────────────────────────────────────
  let title = titleFromPage || `Problem ${index}`;
  let rating: number | undefined;
  let tags: string[] = [];

  if (apiRes.status === "fulfilled" && apiRes.value.ok) {
    try {
      const json = await apiRes.value.json();
      if (json.status === "OK") {
        const problem = (json.result.problems as Array<{ index: string; name: string; rating?: number; tags: string[] }>)
          .find((p) => p.index.toUpperCase() === index.toUpperCase());
        if (problem) {
          title = problem.name;
          rating = problem.rating;
          tags = problem.tags.filter((t: string) => !t.startsWith("*"));
        }
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  const meta: ProblemMeta = {
    contestId,
    index,
    title,
    rating,
    tags,
    timeLimit: timeLimit || "2 seconds",
    memoryLimit: memoryLimit || "256 megabytes",
    statement: statement || "(Problem statement could not be fetched. The student will describe the problem.)",
  };

  problemCache.set(cacheKey, meta);
  return meta;
}

// ─── Socratic system prompt ───────────────────────────────────────────────────

function buildSystemPrompt(p: ProblemMeta): string {
  return `You are AlgoSensei — a patient, expert competitive programming coach specializing in Codeforces problems.
Your teaching philosophy is Socratic: guide students to the answer through targeted questions and small nudges, never by revealing the solution directly.

━━━ PROBLEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${p.title} (Codeforces ${p.contestId}${p.index})
Rating: ${p.rating ?? "unrated"}
Tags: ${p.tags.length ? p.tags.join(", ") : "not disclosed"}
Limits: ${p.timeLimit} / ${p.memoryLimit}

${p.statement}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COACHING RULES — follow these strictly:
1. NEVER reveal the core algorithm or key insight without the student earning it through dialogue.
2. NEVER write complete solution code. You MAY show small illustrative snippets (≤10 lines) to clarify a specific concept.
3. When the student shares an idea: validate what's correct, then push further with "How would you handle X?" or "What if the input were Y?".
4. When the student is stuck: give ONE small nudge — a question, a simpler sub-problem, or a concrete example to test their thinking.
5. When the student asks "just tell me the answer": respond warmly but firmly — "Let's try one more angle. What happens when…?"
6. For implementation bugs the student shows you: you MAY point out the specific bug and how to fix it.
7. Celebrate genuine breakthroughs. Be warm but intellectually honest about misconceptions.
8. Keep each response focused: 2–4 short paragraphs maximum.
9. End every response with either a question or a small challenge to keep the student thinking.
10. If this is the very first message in the conversation (student says "hi" or similar), greet briefly, mention the problem, and ask: "What's your first intuition about how to approach this?"

TONE: Like a senior ICPC coach tutoring a student one-on-one — patient, sharp, and genuinely invested in their growth.`;
}

// ─── GET: fetch problem metadata ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const contestId = parseInt(req.nextUrl.searchParams.get("contestId") ?? "");
  const index = (req.nextUrl.searchParams.get("index") ?? "").toUpperCase();

  if (!contestId || !index) {
    return NextResponse.json({ error: "Missing contestId or index" }, { status: 400 });
  }

  try {
    const meta = await fetchProblemFromCF(contestId, index);
    return NextResponse.json(meta);
  } catch (err) {
    console.error("[coach/GET]", err);
    return NextResponse.json({ error: "Failed to fetch problem" }, { status: 502 });
  }
}

// ─── POST: streaming chat ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { contestId: number; index: string; messages: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contestId, index, messages } = body;

  if (!contestId || !index) {
    return NextResponse.json({ error: "Missing contestId or index" }, { status: 400 });
  }
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  }

  let problem: ProblemMeta;
  try {
    problem = await fetchProblemFromCF(contestId, index);
  } catch (err) {
    console.error("[coach/POST] problem fetch failed:", err);
    // Fallback: create a minimal meta
    problem = {
      contestId,
      index,
      title: `Problem ${index}`,
      tags: [],
      timeLimit: "unknown",
      memoryLimit: "unknown",
      statement: "(Problem statement unavailable. Ask the student to describe it.)",
    };
  }

  const systemPrompt = buildSystemPrompt(problem);

  // Create the stream — catch synchronous OpenAI errors before we commit to SSE
  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    });
  } catch (err) {
    console.error("[coach/POST] OpenAI error:", err);
    return NextResponse.json(
      { error: `OpenAI error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let promptTokens = 0;
      let completionTokens = 0;
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
            );
          }
          // usage comes on the final chunk when stream_options.include_usage is set
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
        }
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "usage", promptTokens, completionTokens })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[coach/POST] stream error:", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
