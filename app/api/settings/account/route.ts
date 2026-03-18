import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// DELETE /api/settings/account
// Permanently deletes the authenticated user's account.
// Requires Bearer token in Authorization header.
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  // Verify the session with an anon client
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  try {
    const service = createServiceClient();
    // Delete the auth user (cascades to all user-owned rows via FK)
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settings/account] Delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete account." },
      { status: 500 }
    );
  }
}
