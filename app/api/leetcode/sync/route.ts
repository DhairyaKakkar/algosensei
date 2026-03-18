import { NextRequest, NextResponse } from "next/server";
import { LCApiError, fetchLCProfile } from "@/lib/leetcode";
import { buildLCSkillProfile } from "@/lib/analysis";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();

  if (!username) {
    return NextResponse.json({ error: "Missing required parameter: username" }, { status: 400 });
  }

  // LeetCode usernames: 3–25 chars, letters/digits/underscore/hyphen
  if (!/^[a-zA-Z0-9_-]{2,25}$/.test(username)) {
    return NextResponse.json({ error: "Invalid LeetCode username format." }, { status: 400 });
  }

  try {
    const profile = await fetchLCProfile(username);
    const skillProfile = buildLCSkillProfile(profile.tagCounts, profile.totalSolved);

    return NextResponse.json(
      { profile, skillProfile },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    if (err instanceof LCApiError) {
      if (err.code === "NOT_FOUND") {
        return NextResponse.json(
          { error: `LeetCode user "${username}" not found.` },
          { status: 404 }
        );
      }
      if (err.code === "TIMEOUT") {
        return NextResponse.json({ error: "LeetCode API timed out. Try again." }, { status: 504 });
      }
    }
    console.error("[leetcode/sync] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load LeetCode profile" },
      { status: 502 }
    );
  }
}
