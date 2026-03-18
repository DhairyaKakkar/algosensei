"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, Zap } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase client picks up the auth tokens from the URL fragment automatically
    // via detectSessionInUrl. We just wait for the session to be established.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.push("/dashboard");
      } else {
        router.push("/auth");
      }
    });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
        <Zap className="h-6 w-6 text-primary-foreground" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Completing sign-in…</span>
      </div>
    </div>
  );
}
