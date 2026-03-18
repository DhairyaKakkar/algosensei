import { NextRequest, NextResponse } from "next/server";
import {
  CFApiError,
  analyzeSubmissions,
  fetchAllSubmissions,
  fetchUserInfo,
  processSubmissions,
} from "@/lib/codeforces";
import { buildSkillProfile } from "@/lib/analysis";

export const runtime = "nodejs";
// CF API can be slow for users with many submissions; give it room.
export const maxDuration = 60;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle")?.trim();

  if (!handle) {
    return errorResponse("Missing required query parameter: handle", 400);
  }

  // CF handles: 3–24 chars, letters/digits/underscore/hyphen/dot
  if (!/^[a-zA-Z0-9_\-.]{3,24}$/.test(handle)) {
    return errorResponse(
      "Invalid handle format. Codeforces handles are 3–24 characters (letters, digits, _, -, or .).",
      400
    );
  }

  try {
    // Fetch user info and submissions in parallel to save time
    const [user, { submissions, capped }] = await Promise.all([
      fetchUserInfo(handle),
      fetchAllSubmissions(handle),
    ]);

    const analysis = analyzeSubmissions(user, submissions, capped);
    const allProcessed = processSubmissions(submissions);
    const skillProfile = buildSkillProfile(allProcessed, user.rating);

    return NextResponse.json({ ...analysis, skillProfile }, {
      headers: {
        // Cache for 5 minutes so repeated loads don't hammer the CF API
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    if (err instanceof CFApiError) {
      switch (err.code) {
        case "NOT_FOUND":
          return errorResponse(
            `Codeforces handle "${handle}" not found. Check the spelling and try again.`,
            404
          );
        case "RATE_LIMIT":
          return errorResponse(
            "Codeforces API rate limit reached. Please wait a few seconds and try again.",
            429
          );
        case "TIMEOUT":
          return errorResponse(
            "Request to Codeforces timed out. Their servers may be slow — try again shortly.",
            504
          );
        default:
          return errorResponse(`Codeforces API error: ${err.message}`, 502);
      }
    }

    console.error("[codeforces/sync] Unexpected error:", err);
    return errorResponse("An unexpected error occurred. Please try again.", 500);
  }
}
