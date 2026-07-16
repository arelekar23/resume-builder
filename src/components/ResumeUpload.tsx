import { useRef, useState } from "react";
import { UploadCloud, FileText, Loader2, CheckCircle2 } from "lucide-react";

import { supabase } from "../lib/supabase";
import { isConfigured } from "../utils/keyVault";
import { overwriteMasterResume, type ParsedResume } from "../utils/masterResume";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 6 * 1024 * 1024; // Vercel body limit headroom after base64.

type Status = "idle" | "reading" | "parsing" | "writing" | "done" | "error";

const STATUS_TEXT: Record<Exclude<Status, "idle" | "error">, string> = {
  reading: "Reading file…",
  parsing: "Extracting your resume with AI…",
  writing: "Saving to your profile…",
  done: "Done — your resume is populated.",
};

// File -> base64 (no data: prefix); chunked to avoid a call-stack blowup.
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

interface ResumeUploadProps {
  onDone: () => void | Promise<void>;
  // Confirm before overwriting (re-upload in Profile; skipped for empty onboarding).
  confirmOverwrite?: boolean;
}

export default function ResumeUpload({ onDone, confirmOverwrite }: ResumeUploadProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = status === "reading" || status === "parsing" || status === "writing";

  async function handleFile(file: File) {
    setError("");
    if (!isConfigured()) {
      setError("Set up your LLM in API settings (top bar) before importing a resume.");
      setStatus("error");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      setStatus("error");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That PDF is too large (max 6 MB).");
      setStatus("error");
      return;
    }
    if (
      confirmOverwrite &&
      !window.confirm(
        "This replaces your current profile, experience, projects, and skills " +
          "with the uploaded resume. Saved company versions are kept. Continue?",
      )
    ) {
      return;
    }

    try {
      setStatus("reading");
      const fileBase64 = await fileToBase64(file);

      setStatus("parsing");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fileBase64,
          mediaType: "application/pdf",
        }),
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
        if (!res.body)
          msg +=
            ' — if you are on "npm run dev" (Vite only), the API is not served; use "vercel dev".';
        throw new Error(msg);
      }
      const { parsed } = JSON.parse(raw) as { parsed: ParsedResume };

      setStatus("writing");
      const result = await overwriteMasterResume(parsed);
      if (!result.ok) throw new Error(result.error || "Failed to save your resume.");

      setStatus("done");
      await onDone();
    } catch (e) {
      setError((e as Error).message || "Failed to import resume.");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) handleFile(file);
        }}
        className={
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors " +
          (dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50") +
          (busy ? " cursor-not-allowed opacity-70" : " cursor-pointer")
        }
      >
        {status === "done" ? (
          <CheckCircle2 className="size-7 text-emerald-500" />
        ) : busy ? (
          <Loader2 className="size-7 animate-spin text-primary" />
        ) : (
          <UploadCloud className="size-7 text-muted-foreground" />
        )}
        <div className="text-sm font-medium">
          {busy || status === "done"
            ? STATUS_TEXT[status as keyof typeof STATUS_TEXT]
            : "Drop your resume PDF here, or click to browse"}
        </div>
        {!busy && status !== "done" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="size-3" /> PDF only, up to 6 MB
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />

      {status === "error" && error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {status === "done" && (
        <Button variant="outline" size="sm" onClick={() => setStatus("idle")}>
          Upload another
        </Button>
      )}
    </div>
  );
}
