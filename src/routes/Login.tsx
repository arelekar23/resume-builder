import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  Sparkles,
  Layers3,
  Target,
  ShieldCheck,
  FileUp,
  ClipboardList,
  Download,
  ArrowRight,
  Bot,
  ScanSearch,
  Users,
  PenLine,
} from "lucide-react";

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) {
    console.error("Sign-in error:", error);
    alert("Sign-in failed. Please try again.");
  }
}

const FEATURES = [
  {
    icon: Users,
    title: "A hiring panel, not a template",
    body: "Six specialized agents — recruiter, hiring manager, ATS, and a content editor — read the job and rebuild your resume the way a real screening team would.",
  },
  {
    icon: Layers3,
    title: "One master, many versions",
    body: "Keep a single source-of-truth resume. Every job gets its own saved, named version — your master is never overwritten.",
  },
  {
    icon: Target,
    title: "Beats the ATS",
    body: "Keyword-gap analysis surfaces exactly what a job asks for, then weaves the missing terms into your real experience with a before/after score.",
  },
  {
    icon: ShieldCheck,
    title: "Bring your own AI, privately",
    body: "Use your own Anthropic or OpenAI-compatible key. It's encrypted server-side and never stored in your browser. No resume data trains anyone's model.",
  },
];

const PIPELINE = [
  { icon: ScanSearch, label: "Filter" },
  { icon: Users, label: "Recruiter" },
  { icon: ClipboardList, label: "Hiring Manager" },
  { icon: Target, label: "ATS" },
  { icon: PenLine, label: "Content Writer" },
  { icon: Bot, label: "Editor" },
];

const STEPS = [
  {
    icon: FileUp,
    title: "Import your resume",
    body: "Drop in your existing PDF. AI extracts your experience, projects, and skills into an editable master.",
  },
  {
    icon: ClipboardList,
    title: "Paste a job description",
    body: "The agent panel scores your fit, re-selects the strongest bullets, and rewrites them to match the role.",
  },
  {
    icon: Download,
    title: "Export a one-page PDF",
    body: "A live preview guarantees a clean single page. Save the version per company and download instantly.",
  },
];

export default function Login() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            Resume Builder
          </div>
          <Button variant="outline" size="sm" onClick={signInWithGoogle}>
            <GoogleIcon />
            Sign in
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        {/* soft brand backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 0%, color-mix(in oklch, var(--primary) 14%, transparent) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage:
              "radial-gradient(70% 60% at 50% 0%, black 0%, transparent 75%)",
          }}
        />

        <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:py-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            AI resume tailoring · bring your own key
          </div>

          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Tailor your resume to every job,
            <br className="hidden sm:block" />{" "}
            <span className="text-primary">with a team of AI experts.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Keep one master resume. For every application, a six-agent pipeline
            re-selects and rewrites it to match the role, optimizes for the ATS,
            and exports a polished one-page PDF.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={signInWithGoogle} className="h-11 px-5 text-sm">
              <GoogleIcon />
              Continue with Google
              <ArrowRight />
            </Button>
            <span className="text-xs text-muted-foreground">
              Free to use · you supply your own AI key
            </span>
          </div>

          {/* Pipeline visual */}
          <div className="mx-auto mt-16 max-w-2xl">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Your resume runs through
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
              {PIPELINE.map((s, i) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium shadow-xs">
                    <s.icon className="size-3.5 text-primary" />
                    {s.label}
                  </span>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            More than a formatter
          </h2>
          <p className="mt-3 text-muted-foreground">
            It reasons about the job like a hiring team — then rewrites your
            resume to win the six-second read.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-4.5" />
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-5 py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Three steps to a tailored resume
            </h2>
            <p className="mt-3 text-muted-foreground">
              From existing PDF to job-ready in about a minute.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <s.icon className="size-4.5 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Stop sending the same resume everywhere
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Sign in and build your master resume in minutes. Every application
            after that is one paste away.
          </p>
          <div className="mt-8">
            <Button size="lg" onClick={signInWithGoogle} className="h-11 px-5 text-sm">
              <GoogleIcon />
              Continue with Google
              <ArrowRight />
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            Resume Builder
          </div>
          <span>Your data stays yours. Keys encrypted, never in the browser.</span>
        </div>
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
