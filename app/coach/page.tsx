"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  BrainCircuit,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCFUrl } from "@/lib/coach";
import type { ProblemMeta, ChatMessage } from "@/lib/coach";

// ─── Markdown renderer (lightweight) ─────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  let key = 0;

  parts.forEach((part) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      nodes.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100"
        >
          <code>{code}</code>
        </pre>
      );
      return;
    }

    // Inline: bold, inline code, newlines
    const lines = part.split("\n");
    lines.forEach((line, li) => {
      if (li > 0) nodes.push(<br key={key++} />);
      if (!line) return;

      // Bold **text** and inline `code`
      const segments = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      const inlineNodes = segments.map((seg, si) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          return <strong key={si}>{seg.slice(2, -2)}</strong>;
        }
        if (seg.startsWith("`") && seg.endsWith("`")) {
          return (
            <code
              key={si}
              className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs text-violet-300"
            >
              {seg.slice(1, -1)}
            </code>
          );
        }
        return seg;
      });
      nodes.push(<span key={key++}>{inlineNodes}</span>);
    });
  });

  return nodes;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage & { id: string };
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
          <BrainCircuit className="h-3.5 w-3.5 text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "rounded-tl-sm border border-border/50 bg-card/80 text-foreground"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="whitespace-pre-wrap">
            {renderMarkdown(message.content)}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary/60 align-middle" />
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground ring-1 ring-border/40">
          U
        </div>
      )}
    </div>
  );
}

// ─── Problem panel ────────────────────────────────────────────────────────────

const RANK_COLOR: Record<string, string> = {
  "800":  "text-gray-400",
  "900":  "text-gray-400",
  "1000": "text-green-400",
  "1100": "text-green-400",
  "1200": "text-cyan-400",
  "1300": "text-cyan-400",
  "1400": "text-blue-400",
  "1500": "text-blue-400",
  "1600": "text-violet-400",
  "1700": "text-violet-400",
  "1800": "text-orange-400",
  "1900": "text-orange-400",
  "2000": "text-red-400",
  "2100": "text-red-400",
  "2200": "text-red-300",
  "2300": "text-red-200",
};

function ratingColor(rating?: number) {
  if (!rating) return "text-muted-foreground";
  const bucket = String(Math.floor(rating / 100) * 100);
  return RANK_COLOR[bucket] ?? "text-red-200";
}

function ProblemPanel({ problem }: { problem: ProblemMeta }) {
  const [expanded, setExpanded] = useState(false);
  const cfUrl = `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`;

  return (
    <div className="rounded-xl border border-border/50 bg-card/60">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a
              href={cfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
            >
              {problem.contestId}{problem.index}. {problem.title}
            </a>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {problem.rating && (
              <span className={cn("text-xs font-bold tabular-nums", ratingColor(problem.rating))}>
                ★ {problem.rating}
              </span>
            )}
            {problem.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] capitalize text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Expandable statement preview */}
      {problem.statement && problem.statement.length > 20 && (
        <>
          <div
            className={cn(
              "overflow-hidden border-t border-border/30 px-3.5 text-xs leading-relaxed text-muted-foreground transition-all",
              expanded ? "max-h-80 overflow-y-auto py-3" : "max-h-0 py-0"
            )}
          >
            <pre className="whitespace-pre-wrap font-sans">{problem.statement.slice(0, 1200)}{problem.statement.length > 1200 ? "…" : ""}</pre>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-1 border-t border-border/30 py-1.5 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Hide statement</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show statement</>
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Token usage badge ────────────────────────────────────────────────────────

function TokenBadge({ prompt, completion }: { prompt: number; completion: number }) {
  const total = prompt + completion;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
      <Zap className="h-3 w-3 text-yellow-500/80" />
      <span className="tabular-nums">{total.toLocaleString()} tokens</span>
      <span className="text-muted-foreground/40">({prompt.toLocaleString()} in / {completion.toLocaleString()} out)</span>
    </div>
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <BrainCircuit className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">AI Coding Coach</h2>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Paste a Codeforces problem URL above, then type your first thoughts. The coach will guide you — not just give you the answer.
        </p>
      </div>
      <div className="mt-2 space-y-1.5 text-left text-xs text-muted-foreground/60">
        <p className="rounded-lg border border-border/30 bg-muted/30 px-3 py-1.5 font-mono">
          codeforces.com/contest/1234/problem/B
        </p>
        <p className="rounded-lg border border-border/30 bg-muted/30 px-3 py-1.5 font-mono">
          codeforces.com/problemset/problem/1234/B
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const [problemUrl, setProblemUrl] = useState("");
  const [problem, setProblem] = useState<ProblemMeta | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(false);
  const [problemError, setProblemError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Array<ChatMessage & { id: string }>>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  const [promptTokens, setPromptTokens] = useState(0);
  const [completionTokens, setCompletionTokens] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Load problem ────────────────────────────────────────────────────────────
  const loadProblem = useCallback(async (url: string) => {
    const parsed = parseCFUrl(url);
    if (!parsed) {
      setProblemError("Couldn't parse that URL. Try: codeforces.com/contest/1234/problem/B");
      return;
    }

    setLoadingProblem(true);
    setProblemError(null);
    setProblem(null);
    setMessages([]);
    setPromptTokens(0);
    setCompletionTokens(0);

    try {
      const res = await fetch(
        `/api/coach?contestId=${parsed.contestId}&index=${parsed.index}`
      );
      const json = await res.json();
      if (!res.ok) {
        setProblemError(json.error ?? "Failed to load problem");
        return;
      }
      setProblem(json as ProblemMeta);
    } catch {
      setProblemError("Network error loading problem.");
    } finally {
      setLoadingProblem(false);
    }
  }, []);

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") loadProblem(problemUrl);
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !problem || sending) return;

    // Abort any in-flight stream
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg: ChatMessage & { id: string } = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantMsg: ChatMessage & { id: string } = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, assistantMsg]);
    setInputText("");
    setSending(true);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestId: problem.contestId,
          index: problem.index,
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = { ...last, content: `⚠️ ${err.error ?? "Something went wrong."}` };
          }
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "delta") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + data.content,
                  };
                }
                return copy;
              });
            }

            if (data.type === "usage") {
              setPromptTokens((p) => p + (data.promptTokens ?? 0));
              setCompletionTokens((c) => c + (data.completionTokens ?? 0));
            }

            if (data.type === "error") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: (last.content ? last.content + "\n\n" : "") + `⚠️ ${data.message}`,
                  };
                }
                return copy;
              });
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant" && !last.content) {
            copy[copy.length - 1] = { ...last, content: "Connection lost. Try again." };
          }
          return copy;
        });
      }
    } finally {
      setSending(false);
    }
  }, [inputText, problem, messages, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const isStreaming = sending && messages[messages.length - 1]?.role === "assistant";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-border/50 bg-card/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {/* Back link */}
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>

          <div className="mx-2 h-4 w-px shrink-0 bg-border/60" />

          {/* Problem URL input */}
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={problemUrl}
              onChange={(e) => {
                setProblemUrl(e.target.value);
                setProblemError(null);
              }}
              onKeyDown={handleUrlKeyDown}
              placeholder="Paste a Codeforces problem URL and press Enter…"
              className="h-9 w-full rounded-lg border border-border/60 bg-background/50 px-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <button
            onClick={() => loadProblem(problemUrl)}
            disabled={!problemUrl.trim() || loadingProblem}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingProblem ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Load"
            )}
          </button>

          {/* Token counter */}
          <div className="hidden shrink-0 sm:block">
            <TokenBadge prompt={promptTokens} completion={completionTokens} />
          </div>
        </div>

        {/* URL error */}
        {problemError && (
          <div className="border-t border-red-500/10 bg-red-500/5 px-4 py-2 text-center text-xs text-red-400">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            {problemError}
          </div>
        )}
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 overflow-hidden">
        {/* ── Left: problem panel (desktop) ────────────────────────────────── */}
        {problem && (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border/30 p-3 lg:block">
            <ProblemPanel problem={problem} />

            {/* Token counter (desktop sidebar) */}
            <div className="mt-3 lg:hidden">
              <TokenBadge prompt={promptTokens} completion={completionTokens} />
            </div>
          </aside>
        )}

        {/* ── Right: chat area ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Problem panel — mobile only */}
          {problem && (
            <div className="shrink-0 border-b border-border/30 p-3 lg:hidden">
              <ProblemPanel problem={problem} />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <WelcomeScreen />
            ) : (
              <div className="mx-auto max-w-2xl space-y-4">
                {messages.map((msg, i) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming && i === messages.length - 1}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border/30 bg-card/30 p-3">
            <div className="mx-auto max-w-2xl">
              {!problem && (
                <p className="mb-2 text-center text-xs text-muted-foreground/50">
                  Load a problem first to start coaching
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    problem
                      ? "Share your thoughts, approach, or code… (Enter to send, Shift+Enter for new line)"
                      : "Load a problem to start…"
                  }
                  disabled={!problem || sending}
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-border/60 bg-card/60 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                  style={{ minHeight: "42px", maxHeight: "160px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim() || !problem || sending}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
                AlgoSensei guides with questions — it won&apos;t just hand you the answer.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
