import { useEffect, useState } from "react";
import {
  ScanSearch,
  Users,
  Gauge,
  ClipboardList,
  Target,
  PenLine,
  Bot,
  RotateCcw,
  Zap,
  Pencil,
  Wand2,
  MessageSquare,
  MousePointerClick,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Animated explainer for the two tailoring modes:
 *  - Quick: one autonomous run; the Editor loops work back until the score clears the bar.
 *  - Guided: the user triggers discrete phases and edits in between.
 * Pure CSS transitions driven by a stepping index; respects reduced-motion.
 */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Auto-advancing step index. Parks on the final frame when motion is reduced. */
function useStep(length: number, intervalMs: number, reduced: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced || length <= 1) {
      setStep(length - 1);
      return;
    }
    const id = setInterval(
      () => setStep((s) => (s + 1) % length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [length, intervalMs, reduced]);
  return step;
}

export default function PipelineShowcase() {
  const [mode, setMode] = useState<"quick" | "guided">("quick");
  const reduced = usePrefersReducedMotion();

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Mode toggle */}
      <div className="mx-auto mb-5 grid w-full max-w-xs grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1">
        {(
          [
            ["quick", "Quick", Zap],
            ["guided", "Guided", MousePointerClick],
          ] as const
        ).map(([val, label, Icon]) => (
          <button
            key={val}
            type="button"
            onClick={() => setMode(val)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              mode === val
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        {/* key remounts the view on mode switch → animation restarts cleanly */}
        {mode === "quick" ? (
          <QuickView key="quick" reduced={reduced} />
        ) : (
          <GuidedView key="guided" reduced={reduced} />
        )}
      </div>
    </div>
  );
}

/* ---------------- Quick mode ---------------- */

const QUICK_NODES = [
  { icon: ScanSearch, label: "Filter" },
  { icon: Users, label: "Recruiter" },
  { icon: Gauge, label: "Baseline" },
  { icon: ClipboardList, label: "Hiring Mgr" },
  { icon: Target, label: "ATS" },
  { icon: PenLine, label: "Writer" },
  { icon: Bot, label: "Editor" },
];

// Frames: 0..6 sweep each node · 7 loop-back · 8 done. Then repeats.
const QUICK_FRAMES = QUICK_NODES.length + 2;
const TAILORED_SCORE = [
  null,
  null,
  41,
  46,
  55,
  64,
  72,
  76,
  84,
] as (number | null)[];

function QuickView({ reduced }: { reduced: boolean }) {
  const step = useStep(QUICK_FRAMES, 720, reduced);
  const looping = step === QUICK_NODES.length; // frame 7
  const done = step === QUICK_NODES.length + 1; // frame 8
  const active = step < QUICK_NODES.length ? step : -1;
  const tailored = TAILORED_SCORE[step];
  const baselineShown = step >= 2;

  return (
    <div>
      <Heading
        icon={Zap}
        title="Quick — one autonomous run"
        sub="You paste the job; the agents run the full loop for you."
      />

      {/* Node sweep */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
        {QUICK_NODES.map((n, i) => {
          const isActive = i === active;
          const isDone = done || looping || i < active;
          return (
            <div key={n.label} className="flex items-center">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-500",
                  isActive &&
                    "-translate-y-0.5 border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25",
                  !isActive &&
                    isDone &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  !isActive &&
                    !isDone &&
                    "border-border bg-background text-muted-foreground",
                )}
              >
                <n.icon className="size-3.5" />
                {n.label}
              </div>
              {i < QUICK_NODES.length - 1 && (
                <ArrowRight
                  className={cn(
                    "mx-0.5 size-3 shrink-0 transition-colors duration-500",
                    i < active || isDone
                      ? "text-primary"
                      : "text-muted-foreground/40",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Loop-back indicator */}
      <div className="mt-4 flex items-center justify-center">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-500",
            looping
              ? "border-primary bg-primary/10 text-primary opacity-100"
              : "border-dashed border-border text-muted-foreground opacity-60",
          )}
        >
          <RotateCcw
            className={cn("size-3.5", looping && "animate-spin-slow")}
          />
          Editor → Hiring Mgr · re-select &amp; rewrite until it clears the bar
        </div>
      </div>

      {/* Score readout */}
      <div className="mt-5 flex items-center justify-center gap-3">
        <ScoreChip
          label="Baseline"
          value={baselineShown ? 41 : null}
          tone="neutral"
        />
        <ArrowRight className="size-4 text-muted-foreground/50" />
        <ScoreChip
          label={done ? "Cleared" : "Tailored"}
          value={tailored}
          tone={done ? "success" : "primary"}
          check={done}
        />
      </div>
    </div>
  );
}

/* ---------------- Guided mode ---------------- */

const GUIDED_PHASES = [
  {
    icon: ClipboardList,
    label: "Create version",
    sub: "Filter · Recruiter · Hiring Mgr · ATS gap-check",
    user: true,
  },
  {
    icon: Pencil,
    label: "You edit by hand",
    sub: "Tweak bullets, selection, and ordering",
    user: false,
    editing: true,
  },
  {
    icon: Wand2,
    label: "Auto-tailor",
    sub: "ATS · Content Writer · Editor — a single pass",
    user: true,
  },
  {
    icon: MessageSquare,
    label: "Reviews on demand",
    sub: "Recruiter & Hiring Mgr replay the company",
    user: true,
  },
];

function GuidedView({ reduced }: { reduced: boolean }) {
  const active = useStep(GUIDED_PHASES.length, 1150, reduced);

  return (
    <div>
      <Heading
        icon={MousePointerClick}
        title="Guided — you drive each phase"
        sub="Trigger agents step by step and edit in between for full control."
      />

      <div className="mt-5 grid gap-2.5">
        {GUIDED_PHASES.map((p, i) => {
          const isActive = i === active;
          return (
            <div
              key={p.label}
              className={cn(
                "relative flex items-center gap-3 rounded-xl border p-3 transition-all duration-500",
                isActive
                  ? "border-primary bg-primary/[0.06] shadow-sm"
                  : "border-border bg-background/60 opacity-70",
                p.editing && "border-dashed",
              )}
            >
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-500",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <p.icon
                  className={cn(
                    "size-4",
                    isActive && p.editing && "animate-bounce-subtle",
                  )}
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {p.label}
                  {p.user ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      <MousePointerClick className="size-2.5" />
                      you trigger
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      you
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.sub}
                </div>
              </div>

              {/* moving cursor lands on the active phase */}
              <MousePointerClick
                className={cn(
                  "ml-auto size-4 shrink-0 text-primary transition-opacity duration-300",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- shared bits ---------------- */

function Heading({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ElementType;
  title: string;
  sub: string;
}) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Icon className="size-3.5" />
        {title}
      </div>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function ScoreChip({
  label,
  value,
  tone,
  check,
}: {
  label: string;
  value: number | null;
  tone: "neutral" | "primary" | "success";
  check?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-[92px] flex-col items-center rounded-xl border px-3 py-2 transition-colors duration-500",
        tone === "success" && "border-emerald-500/40 bg-emerald-500/10",
        tone === "primary" && "border-primary/40 bg-primary/10",
        tone === "neutral" && "border-border bg-background/60",
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 flex items-center gap-1 text-lg font-semibold tabular-nums",
          tone === "success" && "text-emerald-700 dark:text-emerald-400",
          tone === "primary" && "text-primary",
          tone === "neutral" && "text-foreground",
        )}
      >
        {check && <CheckCircle2 className="size-4" />}
        {value == null ? "—" : `${value}%`}
      </span>
    </div>
  );
}
