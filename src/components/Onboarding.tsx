import { useEffect, useState } from "react";
import {
  Sparkles,
  Check,
  Loader2,
  KeyRound,
  FileUp,
  Rocket,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  LayoutTemplate,
  Wand2,
  Layers3,
  CheckCircle2,
  Lock,
  PenLine,
} from "lucide-react";

import {
  getCachedStatus,
  fetchKeyStatus,
  saveKey,
} from "../utils/keyVault";
import { supabase } from "../lib/supabase";
import ResumeUpload from "./ResumeUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Onboarding completion is stored per-account in Supabase user metadata
// (`user_metadata.onboarded`), so it follows the user across browsers/devices.
// Accounts created before this timestamp are treated as existing users and
// never see onboarding; every signup from here on sees it once.
export const ONBOARDING_CUTOFF = Date.parse("2026-07-17T00:00:00Z");

const STEPS = [
  { key: "welcome", label: "Welcome", icon: Sparkles },
  { key: "connect", label: "Connect AI", icon: KeyRound },
  { key: "import", label: "Import resume", icon: FileUp },
  { key: "ready", label: "You're set", icon: Rocket },
] as const;

interface OnboardingProps {
  email?: string;
  /** Persist completion + close the wizard. */
  onComplete: () => void;
  /** Reload editor state after a successful import. */
  onImported: () => void | Promise<void>;
}

export default function Onboarding({
  email,
  onComplete,
  onImported,
}: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [configured, setConfigured] = useState(getCachedStatus().configured);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    fetchKeyStatus().then((s) => setConfigured(s.configured));
  }, []);

  function finish() {
    // Close immediately; persist the per-account flag in the background so the
    // wizard never reappears for this account on any device.
    onComplete();
    void supabase.auth
      .updateUser({ data: { onboarded: true } })
      .catch(() => {
        /* best-effort; the account-age cutoff still bounds re-shows */
      });
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background/95 backdrop-blur-sm">
      {/* soft brand backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 0%, color-mix(in oklch, var(--primary) 12%, transparent) 0%, transparent 70%)",
        }}
      />

      {/* Top bar */}
      <div className="relative flex shrink-0 items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Resume Builder
        </div>
        <button
          type="button"
          onClick={finish}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip setup
        </button>
      </div>

      {/* Centered card */}
      <div className="relative flex flex-1 items-center justify-center px-5 pb-10">
        <div className="w-full max-w-2xl">
          <Stepper current={step} />

          <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
            {step === 0 && <WelcomeStep email={email} />}
            {step === 1 && (
              <ConnectStep
                configured={configured}
                onConfigured={() => setConfigured(true)}
              />
            )}
            {step === 2 && (
              <ImportStep
                configured={configured}
                goConnect={() => setStep(1)}
                onImported={async () => {
                  await onImported();
                  setImported(true);
                  next();
                }}
                onSkip={next}
              />
            )}
            {step === 3 && <ReadyStep imported={imported} />}
          </div>

          {/* Footer nav */}
          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="ghost"
              size="lg"
              onClick={back}
              className={cn(step === 0 && "invisible")}
            >
              <ArrowLeft />
              Back
            </Button>

            {step === 0 && (
              <Button size="lg" onClick={next}>
                Get started
                <ArrowRight />
              </Button>
            )}
            {step === 1 && (
              <div className="flex items-center gap-2">
                {!configured && (
                  <Button variant="ghost" size="lg" onClick={next}>
                    Skip for now
                  </Button>
                )}
                <Button size="lg" onClick={next} disabled={!configured}>
                  Continue
                  <ArrowRight />
                </Button>
              </div>
            )}
            {step === 2 && (
              <Button variant="ghost" size="lg" onClick={next}>
                Start from scratch
                <ArrowRight />
              </Button>
            )}
            {step === 3 && (
              <Button size="lg" onClick={finish}>
                Enter workspace
                <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Stepper ---------- */

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-primary/10 text-primary",
                    !done && !active && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" /> : <s.icon className="size-4" />}
                </div>
                <span
                  className={cn(
                    "hidden text-[11px] font-medium sm:block",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-1.5 h-px w-8 sm:w-16 -translate-y-2.5 transition-colors",
                    i < current ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        Step {current + 1} of {STEPS.length}
      </span>
    </div>
  );
}

/* ---------- Step 1: Welcome ---------- */

const WELCOME_POINTS = [
  {
    icon: Layers3,
    title: "One master resume",
    body: "Your single source of truth. We'll help you build it in the next step.",
  },
  {
    icon: Wand2,
    title: "Tailored per job",
    body: "Paste any job description and a panel of AI agents rewrites it to fit.",
  },
  {
    icon: FileUp,
    title: "One-page PDFs",
    body: "Every application gets its own saved version, exported clean and single-page.",
  },
];

function WelcomeStep({ email }: { email?: string }) {
  return (
    <div>
      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Sparkles className="size-3.5" />
        Welcome{email ? `, ${email.split("@")[0]}` : ""}
      </div>
      <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
        Let's set up your resume workspace
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Two quick steps — connect your AI, then import an existing resume — and
        you'll be tailoring to jobs in about a minute.
      </p>

      <div className="mt-6 grid gap-3">
        {WELCOME_POINTS.map((p) => (
          <div
            key={p.title}
            className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3.5"
          >
            <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <p.icon className="size-4" />
            </div>
            <div>
              <div className="text-sm font-medium">{p.title}</div>
              <div className="text-xs text-muted-foreground">{p.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Step 2: Connect AI ---------- */

function ConnectStep({
  configured,
  onConfigured,
}: {
  configured: boolean;
  onConfigured: () => void;
}) {
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.cerebras.ai/v1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveKey({
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        baseUrl: provider === "anthropic" ? undefined : baseUrl.trim(),
      });
      setSavedOk(true);
      setApiKey("");
      onConfigured();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Connect your AI
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This app runs on your own model — there's no shared server key. It
            powers both resume import and tailoring.
          </p>
        </div>
        {configured && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Connected
          </span>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          Your key is sent once over HTTPS, encrypted server-side, and never
          stored in this browser or shown again.
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["anthropic", "Anthropic (Claude)"],
                ["openai", "OpenAI-compatible"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setProvider(val)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors",
                  provider === val
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {provider === val && <Check className="size-3.5 text-primary" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ob-key">API key</Label>
          <Input
            id="ob-key"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSavedOk(false);
            }}
            placeholder={
              configured
                ? "•••••••• (stored) — enter to replace"
                : provider === "anthropic"
                  ? "sk-ant-…"
                  : "csk-… / sk-…"
            }
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ob-model">Model</Label>
          <Input
            id="ob-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              provider === "anthropic" ? "claude-sonnet-4-6" : "llama-3.3-70b"
            }
          />
        </div>

        {provider !== "anthropic" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-base">Base URL</Label>
            <Input
              id="ob-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.cerebras.ai/v1"
            />
            <span className="text-xs text-muted-foreground">
              Any OpenAI-compatible endpoint (Cerebras, OpenAI, Gemini, Ollama).
              Must include the version path.
            </span>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={save}
          disabled={busy || !apiKey.trim() || !model.trim()}
          className="mt-1"
        >
          {busy && <Loader2 className="animate-spin" />}
          {savedOk ? (
            <>
              <Check /> Saved
            </>
          ) : configured ? (
            "Update key"
          ) : (
            "Save & connect"
          )}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Step 3: Import resume ---------- */

function ImportStep({
  configured,
  goConnect,
  onImported,
  onSkip,
}: {
  configured: boolean;
  goConnect: () => void;
  onImported: () => void | Promise<void>;
  onSkip: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
        Import your resume
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Drop in your existing resume PDF — AI extracts your experience, projects,
        and skills into an editable master. You can fix anything afterward.
      </p>

      {configured ? (
        <div className="mt-5">
          <ResumeUpload onDone={onImported} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            No resume handy?{" "}
            <button
              type="button"
              onClick={onSkip}
              className="font-medium text-primary hover:underline"
            >
              Start from scratch instead
            </button>
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background/60 p-6 text-center">
          <ShieldCheck className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Connect your AI first — importing reads your PDF with your model.
          </p>
          <Button variant="outline" size="sm" onClick={goConnect}>
            <ArrowLeft />
            Back to Connect AI
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- Step 4: Ready / tour ---------- */

const TOUR = [
  {
    icon: LayoutTemplate,
    title: "Edit + live preview",
    body: "Tweak skills, experience, and projects in the center. The right-hand preview shows your exact one-page PDF and flags overflow.",
  },
  {
    icon: Wand2,
    title: "Tailor from a job description",
    body: "Paste a JD in the right panel. Quick mode runs the full agent pipeline automatically; Guided mode lets you drive each phase.",
  },
  {
    icon: Layers3,
    title: "Versions & export",
    body: "Each tailored resume is saved as a named version in the left sidebar. Switch between them and export a PDF anytime.",
  },
];

function ReadyStep({ imported }: { imported: boolean }) {
  return (
    <div>
      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        You're all set
      </div>
      <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
        Here's your workspace
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {imported
          ? "Your master resume is populated. Here's where everything lives."
          : "A quick tour of where everything lives before you dive in."}
      </p>

      <div className="mt-6 grid gap-3">
        {TOUR.map((t, i) => (
          <div
            key={t.title}
            className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3.5"
          >
            <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <t.icon className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-muted-foreground">{i + 1}.</span>
                {t.title}
              </div>
              <div className="text-xs text-muted-foreground">{t.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
        <PenLine className="size-3.5 shrink-0 text-primary" />
        <span>
          Tip: you can re-open AI settings anytime from the <b>API</b> button in
          the top bar.
        </span>
      </div>
    </div>
  );
}
