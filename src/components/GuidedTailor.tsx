import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Loader2,
  ClipboardCheck,
  UserSearch,
  Target,
  Wand2,
} from "lucide-react";

interface Fit {
  firstImpression: string;
  verdict: string;
  roleType: string;
  companyName?: string;
}
interface CreateResult {
  filterResult: { flagged: boolean; reason?: string };
  fitAssessment?: Fit;
  companyName?: string;
  hiringManagerRationale?: string[];
  projects?: unknown[];
  work?: unknown[];
  skills?: unknown[];
  atsScore?: number;
  keywordsPresent?: string[];
  keywordsMissing?: string[];
}
interface AtsResult {
  atsScore?: number;
  present: string[];
  missing: string[];
}
interface ReviewResult {
  score?: number;
  lookingFor: string[];
  strengths: string[];
  gaps: string[];
  summary?: string;
}

interface GuidedTailorProps {
  profileId: string;
  onApplyScreenPlan: (plan: unknown) => Promise<void>;
  getCurrentSelection: () => unknown;
  onApplyTailoredBullets: (bullets: { id: string; text: string }[]) => void;
  getResumeView: () => unknown;
}

async function postJson<T>(body: Record<string, unknown>): Promise<T> {
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
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    let msg = `Server responded ${res.status}`;
    try {
      const j = JSON.parse(raw);
      if (j?.error) msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
    } catch {
      if (raw) msg = raw.slice(0, 300);
    }
    throw new Error(msg);
  }
  return JSON.parse(raw) as T;
}

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

function ScoreRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={"text-3xl font-bold tabular-nums " + scoreColor(score)}>
        {score}
        <span className="text-base font-normal text-muted-foreground">/100</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={"h-full rounded-full " + barColor(score)}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ReviewPanel({
  title,
  icon,
  who,
  review,
}: {
  title: string;
  icon: React.ReactNode;
  who: string;
  review: ReviewResult;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      {typeof review.score === "number" && (
        <ScoreRing score={review.score} label={`${who}'s rating`} />
      )}
      {review.summary && <p className="text-sm text-foreground/90">{review.summary}</p>}
      {review.lookingFor.length > 0 && (
        <div>
          <div className="text-xs font-medium">What {who} looks for</div>
          <ul className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {review.lookingFor.map((x, i) => (
              <li key={i} className="flex gap-1.5">
                <span>•</span>
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}
      {review.strengths.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-emerald-700 dark:text-emerald-400">
          {review.strengths.map((x, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-emerald-500">+</span>
              {x}
            </li>
          ))}
        </ul>
      )}
      {review.gaps.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">
          {review.gaps.map((x, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-amber-500">−</span>
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GuidedTailor({
  profileId,
  onApplyScreenPlan,
  getCurrentSelection,
  onApplyTailoredBullets,
  getResumeView,
}: GuidedTailorProps) {
  const [jdText, setJdText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [flag, setFlag] = useState(""); // advisory filter concern; never blocks
  const [created, setCreated] = useState(false);
  const [company, setCompany] = useState("");
  const [ats, setAts] = useState<AtsResult | null>(null);
  const [recruiter, setRecruiter] = useState<ReviewResult | null>(null);
  const [hm, setHm] = useState<ReviewResult | null>(null);

  // Persist the panel (JD + review results) per user so a reload doesn't lose it.
  const storageKey = profileId ? `resumeBuilder.guidedTailor.${profileId}` : null;
  const restored = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as {
          jdText?: string;
          created?: boolean;
          company?: string;
          ats?: AtsResult | null;
          recruiter?: ReviewResult | null;
          hm?: ReviewResult | null;
        };
        if (s.jdText) setJdText(s.jdText);
        if (s.created) setCreated(true);
        if (s.company) setCompany(s.company);
        if (s.ats) setAts(s.ats);
        if (s.recruiter) setRecruiter(s.recruiter);
        if (s.hm) setHm(s.hm);
      }
    } catch {
      /* ignore corrupt/absent storage */
    }
    restored.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !restored.current) return;
    if (!created && !jdText.trim()) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ jdText, created, company, ats, recruiter, hm }),
      );
    } catch {
      /* ignore quota */
    }
  }, [storageKey, jdText, created, company, ats, recruiter, hm]);

  const jd = () => jdText.trim();

  async function runAction<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(name);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!jd()) return setError("Please paste a job description first.");
    setCreated(false);
    setFlag("");
    setAts(null);
    setRecruiter(null);
    setHm(null);
    await runAction("create", async () => {
      const r = await postJson<CreateResult>({ phase: "create", jdText: jd(), profileId });
      // Filter flag is advisory only — surface it but keep going.
      if (r.filterResult?.flagged && r.filterResult.reason) {
        setFlag(r.filterResult.reason);
      }
      await onApplyScreenPlan(r);
      setCompany(r.companyName ?? r.fitAssessment?.companyName ?? "");
      setAts({
        atsScore: r.atsScore,
        present: r.keywordsPresent ?? [],
        missing: r.keywordsMissing ?? [],
      });
      setCreated(true);
    });
  }

  async function recheckAts() {
    await runAction("ats", async () => {
      const r = await postJson<AtsResult>({
        phase: "ats",
        jdText: jd(),
        profileId,
        resume: getResumeView(),
      });
      setAts(r);
    });
  }

  async function autoTailor() {
    await runAction("tailor", async () => {
      const r = await postJson<{
        projects?: { bullets: { id: string; text: string }[] }[];
        work?: { bullets: { id: string; text: string }[] }[];
      }>({
        phase: "tailor",
        jdText: jd(),
        profileId,
        selection: getCurrentSelection(),
      });
      const bullets = [
        ...(r.projects ?? []).flatMap((p) => p.bullets),
        ...(r.work ?? []).flatMap((w) => w.bullets),
      ].map((b) => ({ id: b.id, text: b.text }));
      onApplyTailoredBullets(bullets);
    });
  }

  async function review(phase: "recruiterReview" | "hiringManagerReview") {
    await runAction(phase, async () => {
      const r = await postJson<ReviewResult>({
        phase,
        jdText: jd(),
        profileId,
        companyName: company,
        resume: getResumeView(),
      });
      if (phase === "recruiterReview") setRecruiter(r);
      else setHm(r);
    });
  }

  const who = company || "the company";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-3">
        <Textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste the full job description here…"
          className="h-32 resize-none overflow-y-auto field-sizing-fixed"
        />
        <Button onClick={create} disabled={!!busy} className="w-full" size="lg">
          {busy === "create" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {busy === "create" ? "Creating…" : "Create tailored version"}
        </Button>
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {flag && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Heads up: {flag} You can still apply — this is just a flag.
          </div>
        )}
      </div>

      {created && <Separator />}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {created && (
          <div className="flex flex-col gap-4">
            {/* ATS */}
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ClipboardCheck className="size-3.5" /> ATS
                </span>
                {company && <span className="text-xs font-medium">{company}</span>}
              </div>
              {ats && typeof ats.atsScore === "number" && (
                <ScoreRing score={ats.atsScore} label="ATS match" />
              )}
              {ats && ats.present.length > 0 && (
                <div>
                  <div className="text-xs font-medium">In your resume</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ats.present.map((k, i) => (
                      <Badge key={i} variant="success">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {ats && ats.missing.length > 0 && (
                <div>
                  <div className="text-xs font-medium">Missing from your resume</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ats.missing.map((k, i) => (
                      <Badge key={i} variant="warning">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={recheckAts}
                  disabled={!!busy}
                >
                  {busy === "ats" ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
                  Re-check ATS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={autoTailor}
                  disabled={!!busy}
                  title="Rewrite the selected bullets to match the JD"
                >
                  {busy === "tailor" ? <Loader2 className="animate-spin" /> : <Wand2 />}
                  Auto-tailor bullets
                </Button>
              </div>
            </div>

            <p className="px-1 text-xs text-muted-foreground">
              Edit your resume in the center (work in the missing keywords), then
              get reviews as {who}'s recruiter and hiring manager.
            </p>

            {/* Recruiter */}
            {recruiter ? (
              <ReviewPanel
                title="Recruiter review"
                icon={<UserSearch className="size-3.5" />}
                who={`${who}'s recruiter`}
                review={recruiter}
              />
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-start"
                onClick={() => review("recruiterReview")}
                disabled={!!busy}
              >
                {busy === "recruiterReview" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <UserSearch />
                )}
                Recruiter review (as {who})
              </Button>
            )}
            {recruiter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => review("recruiterReview")}
                disabled={!!busy}
              >
                Re-run recruiter review
              </Button>
            )}

            {/* Hiring manager */}
            {hm ? (
              <ReviewPanel
                title="Hiring manager review"
                icon={<Target className="size-3.5" />}
                who={`${who}'s hiring manager`}
                review={hm}
              />
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-start"
                onClick={() => review("hiringManagerReview")}
                disabled={!!busy}
              >
                {busy === "hiringManagerReview" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Target />
                )}
                Hiring manager review (as {who})
              </Button>
            )}
            {hm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => review("hiringManagerReview")}
                disabled={!!busy}
              >
                Re-run hiring manager review
              </Button>
            )}
          </div>
        )}

        {!created && !busy && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-muted-foreground">
            <Sparkles className="size-5 opacity-40" />
            Paste a JD and Create — you'll get a version with relevant content
            selected and an ATS score, then edit and get company-specific
            recruiter &amp; hiring-manager reviews.
          </div>
        )}
      </div>
    </div>
  );
}
