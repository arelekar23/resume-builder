import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  ShieldAlert,
  ClipboardCheck,
  UserSearch,
  Target,
  PencilRuler,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Circle,
} from "lucide-react";

// Agent nodes in graph order; keys match the SSE "progress" node names.
const PIPELINE: { key: string; label: string }[] = [
  { key: "filter", label: "Filter" },
  { key: "recruiter", label: "Recruiter" },
  { key: "baseline", label: "Baseline (master)" },
  { key: "hiringManager", label: "Hiring Manager" },
  { key: "ats", label: "ATS" },
  { key: "contentWriter", label: "Content Writer" },
  { key: "editor", label: "Editor" },
];

// Parse one SSE event block ("event: x\ndata: {...}").
function parseSSE(block: string): { event: string; data: unknown } {
  let event = "message";
  let dataStr = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  return { event, data: dataStr ? JSON.parse(dataStr) : null };
}

// Mirrors the /api/analyze response contract.
interface FilterResult {
  flagged: boolean;
  reason?: string;
}
interface FitAssessment {
  firstImpression: string;
  verdict: "apply" | "stretch-apply" | "skip";
  workingFor: string[];
  gaps: string[];
  roleType: string;
}
interface Usage {
  input_tokens?: number;
  output_tokens?: number;
}
// The graph returns per-entry usage; we just show a total token count.
interface TailoringPlan {
  filterResult: FilterResult;
  fitAssessment?: FitAssessment;
  companyName?: string;
  hiringManagerRationale?: string[] | string;
  atsKeywords?: string[];
  skills?: unknown[];
  projects?: unknown[];
  work?: unknown[];
  notes?: string[];
  editorNotes?: string[];
  iterations?: number;
  score?: number;
  scoreBreakdown?: string[];
  baselineScore?: number;
  baselineScoreBreakdown?: string[];
}
interface AnalyzeResponse {
  plan: TailoringPlan;
  usage?: Usage[];
}

interface JDAnalysisTabProps {
  profileId: string;
  onApplyPlan: (plan: TailoringPlan) => void | Promise<void>;
}

const VERDICT: Record<
  FitAssessment["verdict"],
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  apply: { label: "APPLY", variant: "success" },
  "stretch-apply": { label: "STRETCH", variant: "warning" },
  skip: { label: "SKIP", variant: "destructive" },
};

function scoreColor(n: number) {
  return n >= 75
    ? "text-emerald-600 dark:text-emerald-400"
    : n >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-destructive";
}
function barColor(n: number) {
  return n >= 75 ? "bg-emerald-500" : n >= 50 ? "bg-amber-500" : "bg-destructive";
}

// muted dims the "before" (master) row.
function ScoreRow({
  label,
  score,
  muted,
}: {
  label: string;
  score: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div
        className={
          "w-10 shrink-0 text-2xl font-bold tabular-nums " +
          (muted ? "opacity-70 " : "") +
          scoreColor(score)
        }
      >
        {score}
      </div>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={
              "h-full rounded-full " + barColor(score) + (muted ? " opacity-60" : "")
            }
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function AgentSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export default function JDAnalysisTab({
  profileId,
  onApplyPlan,
}: JDAnalysisTabProps) {
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<TailoringPlan | null>(null);
  const [tokenTotal, setTokenTotal] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  // Completed node keys, in arrival order.
  const [progress, setProgress] = useState<string[]>([]);

  // Persist the panel (JD + result) per user so a reload doesn't lose it.
  const storageKey = profileId ? `resumeBuilder.quickTailor.${profileId}` : null;
  const restored = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as {
          jdText?: string;
          plan?: TailoringPlan | null;
          tokenTotal?: number | null;
          applied?: boolean;
        };
        if (s.jdText) setJdText(s.jdText);
        if (s.plan) setPlan(s.plan);
        if (typeof s.tokenTotal === "number") setTokenTotal(s.tokenTotal);
        if (s.applied) setApplied(true);
      }
    } catch {
      /* ignore corrupt/absent storage */
    }
    restored.current = true;
  }, [storageKey]);

  useEffect(() => {
    // Wait for restore, and don't clobber saved data with an empty panel.
    if (!storageKey || !restored.current) return;
    if (!plan && !jdText.trim()) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ jdText, plan, tokenTotal, applied }),
      );
    } catch {
      /* ignore quota */
    }
  }, [storageKey, jdText, plan, tokenTotal, applied]);

  function sumTokens(usage?: Usage[]): number | null {
    if (!usage) return null;
    return usage.reduce(
      (t, u) => t + (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      0,
    );
  }

  async function previewJD() {
    const text = jdText.trim();
    if (!text) return setError("Please paste a job description first.");
    if (!profileId) return setError("Not signed in — cannot load your resume.");
    setError("");
    setApplied(false);
    setPlan(null);
    setProgress([]);
    setTokenTotal(null);
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");

      const res = await fetch(`/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        // stream: true → server streams live per-agent progress via SSE.
        body: JSON.stringify({
          jdText: text,
          profileId,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const raw = await res.text().catch(() => "");
        let msg = `Server responded ${res.status}`;
        try {
          const j = JSON.parse(raw);
          if (j?.error) msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
        } catch {
          if (raw) msg = raw.slice(0, 300);
        }
        if (!res.body)
          msg +=
            ' — if you\'re on "npm run dev" (Vite only), the API isn\'t served; use "vercel dev".';
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotResult = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          if (!block.trim()) continue;
          const { event, data } = parseSSE(block);
          if (event === "progress") {
            const node = (data as { node?: string })?.node;
            if (node) setProgress((p) => (p.includes(node) ? p : [...p, node]));
          } else if (event === "result") {
            const r = data as AnalyzeResponse;
            setPlan(r.plan);
            setTokenTotal(sumTokens(r.usage));
            gotResult = true;
          } else if (event === "error") {
            throw new Error((data as { error?: string })?.error || "Tailoring failed.");
          }
        }
      }
      if (!gotResult) throw new Error("No result received from the server.");
    } catch (e) {
      setError((e as Error).message || "Failed to analyze JD.");
    }
    setLoading(false);
  }

  async function applyChanges() {
    if (!plan) return;
    setError("");
    setApplying(true);
    try {
      // The editor turns this plan into a new resume version (Master untouched).
      await onApplyPlan(plan);
      setApplied(true);
    } catch (e) {
      setError((e as Error).message || "Failed to save version.");
    }
    setApplying(false);
  }

  const fit = plan?.fitAssessment;
  const flagged = plan?.filterResult?.flagged === true;
  const busy = loading || applying;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-3">
        <Textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste the full job description here…"
          // Fixed height + internal scroll: don't let a long JD grow the box
          // (overrides the base field-sizing-content auto-grow).
          className="h-40 resize-none overflow-y-auto field-sizing-fixed"
        />
        <Button onClick={previewJD} disabled={busy} className="w-full" size="lg">
          <Sparkles />
          {loading ? "Running agents…" : "Tailor from JD"}
        </Button>
        {tokenTotal !== null && (
          <div className="text-right text-[11px] text-muted-foreground">
            {plan?.iterations != null && (
              <>content-writer passes: {plan.iterations} · </>
            )}
            {tokenTotal.toLocaleString()} tokens
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {plan && <Separator />}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* Live agent pipeline (while running) */}
        {loading && (
          <div className="flex flex-col gap-1.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Running agents
            </div>
            {PIPELINE.map((stage) => {
              const done = progress.includes(stage.key);
              const active =
                !done &&
                PIPELINE.findIndex((s) => !progress.includes(s.key)) ===
                  PIPELINE.indexOf(stage);
              return (
                <div
                  key={stage.key}
                  className={
                    "flex items-center gap-2 text-sm " +
                    (done
                      ? "text-foreground"
                      : active
                        ? "text-foreground"
                        : "text-muted-foreground/50")
                  }
                >
                  {done ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                  {stage.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Advisory flag — never blocks; the full plan still renders below */}
        {plan && flagged && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <ShieldAlert className="size-4" />
              Heads up before applying
            </div>
            <p className="text-xs text-muted-foreground">
              {plan.filterResult.reason ?? "This posting was flagged."} You can
              still apply if you want.
            </p>
          </div>
        )}

        {plan && (
          <div className="flex flex-col gap-4">
            {/* Fit score: master (before) vs tailored (after) */}
            {(typeof plan.score === "number" ||
              typeof plan.baselineScore === "number") && (
              <div className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    JD fit
                    <span className="ml-1 font-normal normal-case">/ 100</span>
                  </span>
                  {typeof plan.baselineScore === "number" &&
                    typeof plan.score === "number" && (
                      <span
                        className={
                          "text-xs font-semibold tabular-nums " +
                          (plan.score - plan.baselineScore >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive")
                        }
                      >
                        {plan.score - plan.baselineScore >= 0 ? "+" : ""}
                        {plan.score - plan.baselineScore} from tailoring
                      </span>
                    )}
                </div>
                {typeof plan.baselineScore === "number" && (
                  <ScoreRow label="Master resume, as-is" score={plan.baselineScore} muted />
                )}
                {typeof plan.score === "number" && (
                  <ScoreRow label="Tailored to this JD" score={plan.score} />
                )}
                {plan.scoreBreakdown && plan.scoreBreakdown.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {plan.scoreBreakdown.map((s, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span>•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Recruiter */}
            {fit && (
              <AgentSection icon={<UserSearch className="size-3.5" />} title="Recruiter">
                <div className="flex items-center gap-2">
                  <Badge variant={VERDICT[fit.verdict].variant}>
                    {VERDICT[fit.verdict].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{fit.roleType}</span>
                  {plan.companyName && (
                    <span className="ml-auto truncate text-xs font-medium">
                      {plan.companyName}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/90">{fit.firstImpression}</p>
                {fit.workingFor.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                    {fit.workingFor.map((w, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-emerald-500">+</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
                {fit.gaps.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">
                    {fit.gaps.map((g, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500">−</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </AgentSection>
            )}

            {/* Hiring manager */}
            {(() => {
              const raw = plan.hiringManagerRationale;
              const points = Array.isArray(raw)
                ? raw
                : raw
                  ? String(raw)
                      .split(/\n+|(?<=\.)\s+/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];
              if (points.length === 0) return null;
              return (
                <AgentSection icon={<Target className="size-3.5" />} title="Hiring Manager">
                  <ul className="flex flex-col gap-1 text-sm text-foreground/90">
                    {points.map((pt, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-muted-foreground">•</span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                </AgentSection>
              );
            })()}

            {/* ATS */}
            {plan.atsKeywords && plan.atsKeywords.length > 0 && (
              <AgentSection icon={<ClipboardCheck className="size-3.5" />} title="ATS Keywords">
                <div className="flex flex-wrap gap-1">
                  {plan.atsKeywords.map((k, i) => (
                    <Badge key={i} variant="neutral">
                      {k}
                    </Badge>
                  ))}
                </div>
              </AgentSection>
            )}

            {/* Editor */}
            {plan.editorNotes && plan.editorNotes.length > 0 && (
              <AgentSection icon={<PencilRuler className="size-3.5" />} title="Editor">
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {plan.editorNotes.map((n, i) => (
                    <li key={i} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                      {n}
                    </li>
                  ))}
                </ul>
              </AgentSection>
            )}

            <Separator />

            {applied ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                Saved as a new version{plan.companyName ? ` for ${plan.companyName}` : ""}. Switched to it — your Master is untouched.
              </div>
            ) : (
              <Button
                onClick={applyChanges}
                disabled={busy}
                size="lg"
                className="w-full"
              >
                {applying ? "Saving…" : "Save as version"}
              </Button>
            )}
          </div>
        )}

        {!plan && !loading && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-muted-foreground">
            <Sparkles className="size-5 opacity-40" />
            Paste a job description and run the agents to see the recruiter,
            hiring-manager, ATS, and editor perspectives here.
          </div>
        )}
      </div>
    </div>
  );
}
