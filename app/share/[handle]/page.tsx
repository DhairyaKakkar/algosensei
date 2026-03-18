import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrigin(): string {
  // Works in both local dev and production
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = headers().get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

async function fetchCFUser(
  handle: string
): Promise<{ rating: number; rank: string; maxRating: number } | null> {
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`,
      { next: { revalidate: 3600 } }
    );
    const json = await res.json();
    if (json.status === "OK" && json.result?.[0]) {
      const u = json.result[0];
      return { rating: u.rating ?? 0, rank: u.rank ?? "unrated", maxRating: u.maxRating ?? 0 };
    }
  } catch {}
  return null;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { handle: string };
}): Promise<Metadata> {
  const { handle } = params;
  const origin = getOrigin();
  const cardUrl = `${origin}/api/share/card?handle=${encodeURIComponent(handle)}`;
  const shareUrl = `${origin}/share/${encodeURIComponent(handle)}`;

  const user = await fetchCFUser(handle);
  const title = user
    ? `${handle} — ${user.rank} (${user.rating}) · AlgoSensei`
    : `${handle} · AlgoSensei`;
  const description = user
    ? `${handle} is rated ${user.rating} on Codeforces (peak ${user.maxRating}). See their full skill breakdown on AlgoSensei.`
    : `${handle}'s competitive programming skill profile on AlgoSensei.`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: shareUrl,
      siteName: "AlgoSensei",
      images: [
        {
          url: cardUrl,
          width: 1200,
          height: 630,
          alt: `${handle}'s AlgoSensei skill card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [cardUrl],
      site: "@algosensei",
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharePage({
  params,
}: {
  params: { handle: string };
}) {
  const { handle } = params;
  const origin = getOrigin();
  const cardUrl = `${origin}/api/share/card?handle=${encodeURIComponent(handle)}`;
  const shareUrl = `${origin}/share/${encodeURIComponent(handle)}`;

  const user = await fetchCFUser(handle);

  const tweetText = user
    ? `Check out my Codeforces skill breakdown on AlgoSensei! Rated ${user.rating} (${user.rank}). Analyzed by @algosensei 🚀`
    : `My Codeforces skill breakdown on AlgoSensei 🚀`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offpage?url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm text-white">⚡</span>
            </div>
            <span className="text-base font-semibold tracking-tight">AlgoSensei</span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-opacity hover:opacity-90"
          >
            Get your card →
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Handle header */}
        <div className="mb-8 text-center">
          <p className="text-sm text-muted-foreground">Codeforces skill card for</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {handle}
          </h1>
          {user && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {user.rank} · rating {user.rating}
              {user.maxRating > user.rating && ` · peak ${user.maxRating}`}
            </p>
          )}
        </div>

        {/* Card preview */}
        <div className="relative overflow-hidden rounded-2xl border border-border/50 shadow-2xl shadow-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardUrl}
            alt={`${handle}'s AlgoSensei skill card`}
            width={1200}
            height={630}
            className="w-full"
          />
        </div>

        {/* Share actions */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* Copy link (client island below) */}
          <CopyLinkButton url={shareUrl} />

          {/* Twitter */}
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </a>

          {/* LinkedIn */}
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            Share on LinkedIn
          </a>

          {/* Download link */}
          <a
            href={cardUrl}
            download={`${handle}-algosensei.png`}
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
              <path d="M12 15V3M12 15l-3-3M12 15l3-3M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download PNG
          </a>
        </div>

        {/* CTA */}
        <div className="mt-14 rounded-2xl border border-primary/20 bg-card/60 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
            ⚡
          </div>
          <h2 className="text-lg font-bold text-foreground">Get your own skill card</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Load your Codeforces handle on AlgoSensei to generate a personalized skill breakdown card with your radar chart, strengths, and focus areas.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/20 transition-opacity hover:opacity-90"
          >
            Analyze my profile →
          </Link>
        </div>
      </main>
    </div>
  );
}

// ─── Copy link client island ──────────────────────────────────────────────────
// Tiny "use client" component isolated so the rest of the page stays as a
// Server Component (needed for generateMetadata to work with headers()).

import { CopyLinkButton } from "@/components/copy-link-button";
