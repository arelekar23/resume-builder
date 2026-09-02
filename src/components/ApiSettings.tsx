import { useEffect, useState } from "react";
import {
  getCachedStatus,
  fetchKeyStatus,
  saveKey,
  deleteKey,
} from "../utils/keyVault";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Settings, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ApiSettings() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(getCachedStatus().configured);
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.cerebras.ai/v1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchKeyStatus().then((s) => setConfigured(s.configured));
  }, []);

  // Re-seed the form from server status on open. The API key is never returned
  // by the server, so that field always starts empty (must re-enter to save).
  async function openDialog() {
    setError("");
    setApiKey("");
    const cached = getCachedStatus();
    setProvider(cached.provider === "openai" ? "openai" : "anthropic");
    setModel(cached.model ?? "");
    setBaseUrl(cached.baseUrl ?? "https://api.cerebras.ai/v1");
    setOpen(true);
    const s = await fetchKeyStatus();
    setConfigured(s.configured);
    setProvider(s.provider === "openai" ? "openai" : "anthropic");
    setModel(s.model ?? "");
    setBaseUrl(s.baseUrl ?? "https://api.cerebras.ai/v1");
  }

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
      setConfigured(true);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearConfig() {
    setBusy(true);
    setError("");
    try {
      await deleteKey();
      setConfigured(false);
      setApiKey("");
      setModel("");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog} title="API settings">
        <Settings />
        API
        {configured && <span className="ml-1 size-1.5 rounded-full bg-emerald-500" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API settings</DialogTitle>
            <DialogDescription>
              Provide your own LLM. Your API key is sent once, encrypted, and
              stored on our server tied to your account — it is never kept in
              this browser and never shown again. Required — there is no server
              default. Enter your key to save any change; use Clear to revoke it
              instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
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
              <Label htmlFor="api-key">API key</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
              <Label htmlFor="api-model">Model</Label>
              <Input
                id="api-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  provider === "anthropic" ? "claude-sonnet-4-6" : "llama-3.3-70b"
                }
              />
            </div>

            {provider !== "anthropic" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="api-base">Base URL</Label>
                <Input
                  id="api-base"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.cerebras.ai/v1"
                />
                <span className="text-xs text-muted-foreground">
                  Any OpenAI-compatible endpoint; must include the version path.
                  Cerebras: <code>https://api.cerebras.ai/v1</code> · OpenAI:{" "}
                  <code>https://api.openai.com/v1</code> · Gemini:{" "}
                  <code>https://generativelanguage.googleapis.com/v1beta/openai</code>{" "}
                  · Ollama: <code>http://localhost:11434/v1</code> (local only —
                  reachable only from where the API runs, i.e. `vercel dev`).
                </span>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="justify-between">
            <Button variant="ghost" size="lg" onClick={clearConfig} disabled={busy || !configured}>
              Clear
            </Button>
            <Button
              size="lg"
              onClick={save}
              disabled={busy || !apiKey.trim() || !model.trim()}
            >
              {busy && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
