import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CFHandleForm } from "@/components/cf-handle-form";
import {
  BarChart3,
  BrainCircuit,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-1/3 -left-32 h-[400px] w-[400px] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute top-1/2 -right-32 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            AlgoSensei
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/problems"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Problems
          </Link>
          <Link href="/coach">
            <Button size="sm" className="gap-1.5 bg-primary font-semibold shadow-sm shadow-primary/20">
              <BrainCircuit className="h-3.5 w-3.5" />
              AI Coach
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-24 pt-20 text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Powered by GPT-4o · Built for rated grinders</span>
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-3xl text-balance text-5xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          AlgoSensei
          <span className="block bg-gradient-to-r from-primary via-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Your AI Competitive Programming Coach
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-muted-foreground">
          Analyze your weaknesses. Get personalized practice.{" "}
          <span className="font-medium text-foreground/80">
            Level up your rating.
          </span>
        </p>

        {/* CTA form — form input itself is max-w-lg inside; results expand to max-w-4xl */}
        <div className="mx-auto mt-10 w-full max-w-4xl px-2">
          <CFHandleForm />
          <p className="mx-auto mt-4 max-w-lg text-xs text-muted-foreground/60">
            No account needed · Reads via Codeforces public API
          </p>
        </div>
      </section>

      {/* Feature Cards */}
      <section id="features" className="mx-auto max-w-7xl px-6 pb-32">
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Profile Analysis"
            description="Deep-dive into your submission history. Identify problem tags, difficulty ranges, and time patterns where you consistently struggle."
            gradient="from-blue-500/10 to-indigo-500/10"
            iconColor="text-blue-400"
            iconBg="bg-blue-500/10"
          />
          <Link href="/coach" className="block">
            <FeatureCard
              icon={<BrainCircuit className="h-5 w-5" />}
              title="AI Coach"
              description="Chat with an AI that knows your exact history. Get tailored explanations, hints, and guided walkthroughs — not generic tutorials."
              gradient="from-primary/10 to-violet-500/10"
              iconColor="text-primary"
              iconBg="bg-primary/10"
              featured
            />
          </Link>
          <Link href="/problems" className="block">
            <FeatureCard
              icon={<Trophy className="h-5 w-5" />}
              title="Smart Recommendations"
              description="Problems handpicked to sit just outside your comfort zone. Train the right skills at the right difficulty to maximize rating gain."
              gradient="from-emerald-500/10 to-teal-500/10"
              iconColor="text-emerald-400"
              iconBg="bg-emerald-500/10"
            />
          </Link>
        </div>
      </section>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  iconColor: string;
  iconBg: string;
  featured?: boolean;
}

function FeatureCard({
  icon,
  title,
  description,
  gradient,
  iconColor,
  iconBg,
  featured,
}: FeatureCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
        featured
          ? "border-primary/30 shadow-lg shadow-primary/10"
          : "border-border/50 hover:border-border"
      }`}
    >
      {/* Card background gradient */}
      <div
        className={`absolute inset-0 -z-10 bg-gradient-to-br ${gradient} opacity-60`}
      />
      <div className="absolute inset-0 -z-10 bg-card/80" />

      {/* Icon */}
      <div
        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}
      >
        {icon}
      </div>

      {featured && (
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            Core feature
          </span>
        </div>
      )}

      <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
