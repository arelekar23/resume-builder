import { Textarea } from "@/components/ui/textarea";

interface SummaryTabProps {
  summary: string;
  setSummary: (v: string) => void;
  isVersion: boolean;
}

// A short professional summary shown at the top of the resume. It's per-version:
// editing on Master sets the base; editing on a version sets that version's copy.
export default function SummaryTab({ summary, setSummary, isVersion }: SummaryTabProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        A short summary shown at the top of your resume.{" "}
        {isVersion
          ? "You're editing this version's summary — the AI can also rewrite it when you tailor to a job."
          : "This is your master summary; each tailored version can override it."}{" "}
        Add “Summary” in the section order (left) to show it.
      </p>
      <Textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Full-stack engineer with 5 years building React + Node products…"
        rows={7}
        className="resize-none leading-relaxed"
      />
      <span className="self-end text-[11px] text-muted-foreground">
        {summary.trim().length} characters
      </span>
    </div>
  );
}
