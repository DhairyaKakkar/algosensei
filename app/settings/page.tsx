"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Globe,
  Loader2,
  Moon,
  Shield,
  Sliders,
  Sun,
  Target,
  Trash2,
  User as UserIcon,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserPreferences {
  user_id: string;
  cf_handle: string;
  lc_username: string;
  display_name: string;
  target_rating: number;
  preferred_language: string;
  daily_goal: number;
  notify_daily: boolean;
  notify_weekly: boolean;
  theme: "dark" | "light";
}

const DEFAULTS: Omit<UserPreferences, "user_id"> = {
  cf_handle: "",
  lc_username: "",
  display_name: "",
  target_rating: 1600,
  preferred_language: "cpp",
  daily_goal: 3,
  notify_daily: false,
  notify_weekly: true,
  theme: "dark",
};

const LANGUAGES = [
  { value: "cpp", label: "C++" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "c", label: "C" },
];

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "goals", label: "Goals", icon: Target },
  { id: "preferences", label: "Preferences", icon: Sliders },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "account", label: "Account", icon: Shield },
  { id: "pro", label: "Pro", icon: Crown },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function motivationalMessage(currentRating: number, target: number): string {
  if (currentRating >= target) return "You've already hit this target! Time to dream bigger. 🚀";
  const gap = target - currentRating;
  if (gap <= 100) return "You're almost there — one great contest performance away! ⚡";
  if (gap <= 300) return "A focused 2–3 month grind should close this gap. 💪";
  if (gap <= 500) return "Ambitious! Consistent daily practice for 6+ months will get you there. 🔥";
  if (gap <= 800) return "That's a big leap — achievable with dedicated effort over 1–2 years. 🏔️";
  return "Elite territory. Consider setting intermediate checkpoints along the way. 🌟";
}

function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }
  localStorage.setItem("algosensei_theme", theme);
}

// ─── Reusable UI pieces ───────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/80">
      <div className="px-6 py-5 border-b border-border/40">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-border/40 bg-muted/10">{footer}</div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-start">
      <div className="pt-2.5">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border/50 bg-background/50 px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-border/40 bg-card/40 px-4 py-3 transition-colors hover:bg-card/60"
    >
      <div className="text-left">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border-2 transition-colors",
          checked ? "border-primary bg-primary" : "border-border bg-muted/40"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
    </button>
  );
}

function SaveButton({
  loading,
  saved,
  onClick,
}: {
  loading: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      size="sm"
      className={cn(
        "gap-1.5 transition-colors",
        saved
          ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20"
          : "bg-primary font-semibold shadow-sm shadow-primary/20"
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : saved ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : null}
      {saved ? "Saved" : "Save changes"}
    </Button>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function ProfileSection({
  prefs,
  userId,
  onSaved,
}: {
  prefs: Omit<UserPreferences, "user_id">;
  userId: string;
  onSaved: (p: Partial<Omit<UserPreferences, "user_id">>) => void;
}) {
  const [cfHandle, setCfHandle] = useState(prefs.cf_handle);
  const [lcUsername, setLcUsername] = useState(prefs.lc_username);
  const [displayName, setDisplayName] = useState(prefs.display_name);
  const [cfAvatar, setCfAvatar] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Fetch CF avatar when handle is available
  const fetchAvatar = useCallback(async (handle: string) => {
    if (!handle.trim()) { setCfAvatar(null); return; }
    setAvatarLoading(true);
    try {
      const res = await fetch(
        `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle.trim())}`
      );
      const json = await res.json();
      if (json.status === "OK" && json.result?.[0]) {
        setCfAvatar(json.result[0].titlePhoto || json.result[0].avatar || null);
      } else {
        setCfAvatar(null);
      }
    } catch {
      setCfAvatar(null);
    } finally {
      setAvatarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (prefs.cf_handle) fetchAvatar(prefs.cf_handle);
  }, [prefs.cf_handle, fetchAvatar]);

  async function save() {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const update = {
        user_id: userId,
        cf_handle: cfHandle.trim(),
        lc_username: lcUsername.trim(),
        display_name: displayName.trim(),
        updated_at: new Date().toISOString(),
      };
      const { error: dbErr } = await supabase.from("user_preferences").upsert(update, {
        onConflict: "user_id",
      });
      if (dbErr) throw dbErr;
      // Fetch fresh avatar for the saved handle
      await fetchAvatar(cfHandle.trim());
      onSaved({ cf_handle: cfHandle.trim(), lc_username: lcUsername.trim(), display_name: displayName.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Profile"
      description="Your competitive programming identity across platforms."
      footer={
        <div className="flex items-center justify-between gap-4">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="ml-auto">
            <SaveButton loading={loading} saved={saved} onClick={save} />
          </div>
        </div>
      }
    >
      {/* Avatar */}
      <div className="flex items-center gap-4 pb-2">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-border/50 bg-muted/30">
          {avatarLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cfAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cfAvatar} alt="CF avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <UserIcon className="h-7 w-7 text-muted-foreground/40" />
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          Avatar synced from your Codeforces profile.
          {cfHandle && !cfAvatar && !avatarLoading && (
            <span className="ml-1 text-amber-400">Handle not found on CF.</span>
          )}
        </div>
      </div>

      <FieldRow label="Display name" hint="Shown in the app instead of your email.">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Alice"
          className={inputClass}
        />
      </FieldRow>

      <FieldRow label="Codeforces handle" hint="Used to fetch your submission history and rating.">
        <input
          value={cfHandle}
          onChange={(e) => setCfHandle(e.target.value)}
          placeholder="e.g. tourist"
          className={inputClass}
          onBlur={() => fetchAvatar(cfHandle)}
        />
      </FieldRow>

      <FieldRow label="LeetCode username" hint="Used to merge topic skill scores from LC.">
        <input
          value={lcUsername}
          onChange={(e) => setLcUsername(e.target.value)}
          placeholder="e.g. neal_wu"
          className={inputClass}
        />
      </FieldRow>
    </SectionCard>
  );
}

function GoalsSection({
  prefs,
  userId,
  cfRating,
  onSaved,
}: {
  prefs: Omit<UserPreferences, "user_id">;
  userId: string;
  cfRating: number;
  onSaved: (p: Partial<Omit<UserPreferences, "user_id">>) => void;
}) {
  const [targetRating, setTargetRating] = useState(prefs.target_rating);
  const [dailyGoal, setDailyGoal] = useState(prefs.daily_goal);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const motivation = motivationalMessage(cfRating, targetRating);

  async function save() {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const { error: dbErr } = await supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, target_rating: targetRating, daily_goal: dailyGoal, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (dbErr) throw dbErr;
      onSaved({ target_rating: targetRating, daily_goal: dailyGoal });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Goals"
      description="Define what you're working toward."
      footer={
        <div className="flex items-center justify-between gap-4">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="ml-auto">
            <SaveButton loading={loading} saved={saved} onClick={save} />
          </div>
        </div>
      }
    >
      <FieldRow
        label="Target rating"
        hint="Your Codeforces rating goal. The AI coach will calibrate recommendations to close this gap."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={800}
              max={4000}
              step={100}
              value={targetRating}
              onChange={(e) => setTargetRating(Number(e.target.value))}
              className={cn(inputClass, "w-28")}
            />
            <span className="text-xs text-muted-foreground">CF rating (800 – 4000)</span>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm text-foreground/80">{motivation}</p>
          </div>
          {/* Progress bar */}
          {cfRating > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Current: {cfRating}</span>
                <span>Target: {targetRating}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, (cfRating / Math.max(targetRating, 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </FieldRow>

      <FieldRow
        label="Daily goal"
        hint="How many problems you aim to solve per day. Tracked on your Progress page."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={dailyGoal}
              onChange={(e) => setDailyGoal(Number(e.target.value))}
              className="h-1.5 w-40 accent-primary cursor-pointer"
            />
            <div className="flex h-8 w-12 items-center justify-center rounded-lg border border-border/50 bg-background/50 text-sm font-semibold tabular-nums text-foreground">
              {dailyGoal}
            </div>
            <span className="text-xs text-muted-foreground">problems/day</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {dailyGoal === 1 && "Steady and sustainable — great for busy days."}
            {dailyGoal >= 2 && dailyGoal <= 3 && "A solid habit-building pace."}
            {dailyGoal >= 4 && dailyGoal <= 6 && "Consistent grinder mode. 💪"}
            {dailyGoal >= 7 && dailyGoal <= 10 && "Serious commitment — make sure to focus on quality too."}
            {dailyGoal > 10 && "Intense! Don't sacrifice understanding for volume. 🔥"}
          </p>
        </div>
      </FieldRow>
    </SectionCard>
  );
}

function PreferencesSection({
  prefs,
  userId,
  onSaved,
}: {
  prefs: Omit<UserPreferences, "user_id">;
  userId: string;
  onSaved: (p: Partial<Omit<UserPreferences, "user_id">>) => void;
}) {
  const [language, setLanguage] = useState(prefs.preferred_language);
  const [theme, setTheme] = useState<"dark" | "light">(prefs.theme);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function handleThemeChange(newTheme: "dark" | "light") {
    setTheme(newTheme);
    applyTheme(newTheme);
  }

  async function save() {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const { error: dbErr } = await supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, preferred_language: language, theme, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (dbErr) throw dbErr;
      onSaved({ preferred_language: language, theme });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Preferences"
      description="Customize how AlgoSensei works for you."
      footer={
        <div className="flex items-center justify-between gap-4">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="ml-auto">
            <SaveButton loading={loading} saved={saved} onClick={save} />
          </div>
        </div>
      }
    >
      <FieldRow
        label="Preferred language"
        hint="The AI coach will use this language when showing pseudocode and code hints."
      >
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              type="button"
              onClick={() => setLanguage(lang.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                language === lang.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </FieldRow>

      <FieldRow label="Theme" hint="Switch between dark and light mode.">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleThemeChange("dark")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              theme === "dark"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Moon className="h-4 w-4" />
            Dark
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange("light")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              theme === "light"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Sun className="h-4 w-4" />
            Light
          </button>
        </div>
      </FieldRow>
    </SectionCard>
  );
}

function NotificationsSection({
  prefs,
  userId,
  onSaved,
}: {
  prefs: Omit<UserPreferences, "user_id">;
  userId: string;
  onSaved: (p: Partial<Omit<UserPreferences, "user_id">>) => void;
}) {
  const [notifyDaily, setNotifyDaily] = useState(prefs.notify_daily);
  const [notifyWeekly, setNotifyWeekly] = useState(prefs.notify_weekly);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const { error: dbErr } = await supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, notify_daily: notifyDaily, notify_weekly: notifyWeekly, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (dbErr) throw dbErr;
      onSaved({ notify_daily: notifyDaily, notify_weekly: notifyWeekly });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Notifications"
      description="Control what AlgoSensei sends you. (Email delivery coming soon.)"
      footer={
        <div className="flex items-center justify-between gap-4">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="ml-auto">
            <SaveButton loading={loading} saved={saved} onClick={save} />
          </div>
        </div>
      }
    >
      <Toggle
        checked={notifyDaily}
        onChange={setNotifyDaily}
        label="Daily practice reminder"
        description="Get a nudge if you haven't hit your daily goal by 8 PM."
      />
      <Toggle
        checked={notifyWeekly}
        onChange={setNotifyWeekly}
        label="Weekly progress report"
        description="Every Monday: your solve count, streak, and skill changes for the week."
      />
    </SectionCard>
  );
}

function AccountSection({ user }: { user: User }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showDeleteZone, setShowDeleteZone] = useState(false);

  const isOAuthUser = !user.email?.includes("@") || user.app_metadata?.provider === "github";

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setPwError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    setPwLoading(true);
    setPwError("");
    setPwSaved(false);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPwLoading(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("No active session.");

      const res = await fetch("/api/settings/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete account.");

      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Email */}
      <SectionCard title="Account info">
        <FieldRow label="Email address" hint="Used for sign-in and notifications.">
          <div className="flex items-center gap-3">
            <input
              value={user.email ?? ""}
              disabled
              className={cn(inputClass, "cursor-not-allowed opacity-50")}
            />
          </div>
        </FieldRow>
        {user.app_metadata?.provider && (
          <FieldRow label="Sign-in method">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              {user.app_metadata.provider === "github"
                ? "GitHub OAuth"
                : user.app_metadata.provider}
            </div>
          </FieldRow>
        )}
      </SectionCard>

      {/* Password change */}
      {!isOAuthUser && (
        <SectionCard
          title="Change password"
          footer={
            <div className="flex items-center justify-between gap-4">
              {pwError && <p className="text-xs text-red-400">{pwError}</p>}
              <div className="ml-auto">
                <SaveButton
                  loading={pwLoading}
                  saved={pwSaved}
                  onClick={changePassword}
                />
              </div>
            </div>
          }
        >
          <FieldRow label="New password">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className={cn(inputClass, "pr-10")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FieldRow>
          <FieldRow label="Confirm password">
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className={inputClass}
            />
          </FieldRow>
        </SectionCard>
      )}

      {/* Danger zone */}
      <div className="overflow-hidden rounded-2xl border border-red-500/20 bg-card/80">
        <div className="px-6 py-5 border-b border-red-500/10">
          <h2 className="text-base font-semibold text-red-400">Danger zone</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Permanent, irreversible actions. Proceed with caution.
          </p>
        </div>
        <div className="px-6 py-5">
          {!showDeleteZone ? (
            <button
              type="button"
              onClick={() => setShowDeleteZone(true)}
              className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete my account
            </button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will permanently delete your account, all preferences, skill snapshots, and
                contest history. This <strong className="text-foreground">cannot</strong> be undone.
              </p>
              <FieldRow label='Type "DELETE" to confirm'>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className={cn(inputClass, "border-red-500/30 focus:border-red-500/50 focus:ring-red-500/20")}
                />
              </FieldRow>
              {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowDeleteZone(false); setDeleteConfirm(""); setDeleteError(""); }}
                  className="border-border/50"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={deleteConfirm !== "DELETE" || deleteLoading}
                  onClick={deleteAccount}
                  className="gap-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20"
                  variant="outline"
                >
                  {deleteLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete account
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProSection() {
  const features = [
    "Unlimited AI coaching sessions (currently capped at 20/day)",
    "GPT-4o post-contest deep analysis",
    "Weekly personalized study plans",
    "Priority problem recommendations",
    "Advanced skill heatmaps & trends",
    "Export progress reports as PDF",
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-card/80">
      <div className="relative overflow-hidden px-6 py-5 border-b border-amber-500/10">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 -z-10" />
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <Crown className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">AlgoSensei Pro</h2>
            <p className="text-xs text-amber-400/70">Coming in Month 6</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          We&apos;re building a Pro tier that supercharges your training. Join the waitlist to get
          50% off at launch.
        </p>
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              {f}
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4">
          <Flame className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Join the waitlist</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Early access + 50% discount for founding members
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            variant="outline"
            disabled
          >
            Coming soon
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Omit<UserPreferences, "user_id">>(DEFAULTS);
  const [cfRating, setCfRating] = useState(0);
  const [activeSection, setActiveSection] = useState<SectionId>("profile");
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push("/auth"); return; }
      setUser(u);

      // Load preferences
      const { data: row } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", u.id)
        .single();

      if (row) {
        setPrefs({
          cf_handle: row.cf_handle ?? "",
          lc_username: row.lc_username ?? "",
          display_name: row.display_name ?? "",
          target_rating: row.target_rating ?? 1600,
          preferred_language: row.preferred_language ?? "cpp",
          daily_goal: row.daily_goal ?? 3,
          notify_daily: row.notify_daily ?? false,
          notify_weekly: row.notify_weekly ?? true,
          theme: row.theme ?? "dark",
        });

        // Apply saved theme
        if (row.theme) applyTheme(row.theme);

        // Fetch CF rating if handle is saved
        if (row.cf_handle) {
          try {
            const res = await fetch(
              `https://codeforces.com/api/user.info?handles=${encodeURIComponent(row.cf_handle)}`
            );
            const json = await res.json();
            if (json.status === "OK" && json.result?.[0]) {
              setCfRating(json.result[0].rating ?? 0);
            }
          } catch {
            // ignore
          }
        }
      }
      setPageLoading(false);
    }
    load();
  }, [router]);

  function handleSaved(patch: Partial<Omit<UserPreferences, "user_id">>) {
    setPrefs((p) => ({ ...p, ...patch }));
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile, goals, and account preferences.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* Sidebar */}
          <aside className="lg:w-52 shrink-0">
            {/* Mobile: horizontal scrolling tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 lg:hidden">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                    activeSection === id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Desktop: vertical nav */}
            <nav className="hidden lg:flex lg:flex-col lg:gap-1 sticky top-24">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left",
                    activeSection === id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  {activeSection === id && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeSection === "profile" && (
              <ProfileSection prefs={prefs} userId={user.id} onSaved={handleSaved} />
            )}
            {activeSection === "goals" && (
              <GoalsSection
                prefs={prefs}
                userId={user.id}
                cfRating={cfRating}
                onSaved={handleSaved}
              />
            )}
            {activeSection === "preferences" && (
              <PreferencesSection prefs={prefs} userId={user.id} onSaved={handleSaved} />
            )}
            {activeSection === "notifications" && (
              <NotificationsSection prefs={prefs} userId={user.id} onSaved={handleSaved} />
            )}
            {activeSection === "account" && <AccountSection user={user} />}
            {activeSection === "pro" && <ProSection />}
          </div>
        </div>
      </main>
    </div>
  );
}
