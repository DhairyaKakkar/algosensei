// Shared types and helpers for the coach feature (used by both API route and page)

export interface ProblemMeta {
  contestId: number;
  index: string;
  title: string;
  rating?: number;
  tags: string[];
  timeLimit: string;
  memoryLimit: string;
  statement: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function parseCFUrl(
  raw: string
): { contestId: number; index: string } | null {
  const s = raw.trim();

  // https://codeforces.com/contest/1234/problem/B
  let m = s.match(/contest\/(\d+)\/problem\/([A-Za-z]\d*)/i);
  if (m) return { contestId: parseInt(m[1]), index: m[2].toUpperCase() };

  // https://codeforces.com/problemset/problem/1234/B
  m = s.match(/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/i);
  if (m) return { contestId: parseInt(m[1]), index: m[2].toUpperCase() };

  // Bare "1234B" or "1234/B"
  m = s.match(/^(\d+)\/?([A-Za-z]\d*)$/);
  if (m) return { contestId: parseInt(m[1]), index: m[2].toUpperCase() };

  return null;
}
