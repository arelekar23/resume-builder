import { useState } from "react";
import type { ResumeVersion } from "../utils/versions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronsUpDown,
  Plus,
  Check,
  Pencil,
  Copy,
  Trash2,
  Layers,
  FileText,
} from "lucide-react";

interface VersionBarProps {
  versions: ResumeVersion[];
  activeVersionId: string | null;
  onSwitch: (id: string | null) => void | Promise<void>;
  onSaveNew: (name: string, company: string | null) => Promise<void>;
  onRename: (id: string, name: string, company: string | null) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function VersionBar({
  versions,
  activeVersionId,
  onSwitch,
  onSaveNew,
  onRename,
  onDuplicate,
  onDelete,
}: VersionBarProps) {
  const [busy, setBusy] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [saveError, setSaveError] = useState("");

  const [renameTarget, setRenameTarget] = useState<ResumeVersion | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameCompany, setRenameCompany] = useState("");

  const active = versions.find((v) => v.id === activeVersionId) ?? null;
  const activeLabel = activeVersionId ? active?.name ?? "Version" : "Master";

  async function handleSaveNew() {
    if (!newName.trim()) return;
    setBusy(true);
    setSaveError("");
    try {
      await onSaveNew(newName.trim(), newCompany.trim() || null);
      setSaveOpen(false);
      setNewName("");
      setNewCompany("");
    } catch (e) {
      setSaveError((e as Error).message || "Failed to save version.");
    } finally {
      setBusy(false);
    }
  }

  function openRename(v: ResumeVersion) {
    setRenameTarget(v);
    setRenameName(v.name);
    setRenameCompany(v.company_name ?? "");
  }

  async function handleRename() {
    if (!renameTarget || !renameName.trim()) return;
    setBusy(true);
    await onRename(
      renameTarget.id,
      renameName.trim(),
      renameCompany.trim() || null,
    );
    setBusy(false);
    setRenameTarget(null);
  }

  async function handleDelete(v: ResumeVersion) {
    if (!window.confirm(`Delete version "${v.name}"? This cannot be undone.`))
      return;
    setBusy(true);
    await onDelete(v.id);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Resume
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" className="w-full justify-between">
            <span className="flex min-w-0 items-center gap-2">
              {activeVersionId ? (
                <Layers className="text-muted-foreground" />
              ) : (
                <FileText className="text-muted-foreground" />
              )}
              <span className="truncate">{activeLabel}</span>
            </span>
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[16rem] overflow-y-auto"
        >
          {/* Master */}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onSwitch(null);
            }}
          >
            {activeVersionId === null ? (
              <Check className="text-primary" />
            ) : (
              <span className="inline-block size-4 shrink-0" />
            )}
            <span className="font-medium">Master</span>
            <span className="ml-auto text-xs text-muted-foreground">base</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            Versions {versions.length > 0 && `(${versions.length})`}
          </DropdownMenuLabel>
          {versions.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No versions yet. Tailor a JD or save one below.
            </div>
          )}
          {versions.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onSelect={(e) => {
                e.preventDefault();
                onSwitch(v.id);
              }}
              className="group/item flex-col items-stretch gap-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  {activeVersionId === v.id ? (
                    <Check className="text-primary" />
                  ) : (
                    <span className="inline-block size-4 shrink-0" />
                  )}
                  <span className="truncate font-medium">{v.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                  <button
                    className="rounded p-1 hover:bg-background"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRename(v);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-background"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(v.id);
                    }}
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    className="rounded p-1 text-destructive hover:bg-background"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(v);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
              {v.company_name && (
                <span className="pl-[22px] text-xs text-muted-foreground">
                  {v.company_name}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSaveError("");
              setSaveOpen(true);
            }}
          >
            <Plus />
            Save current as new version…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="lg"
        className="w-full justify-start"
        onClick={() => {
          setSaveError("");
          setSaveOpen(true);
        }}
        disabled={busy}
      >
        <Plus />
        New version
      </Button>

      {/* Save-as-new dialog */}
      <Dialog
        open={saveOpen}
        onOpenChange={(o) => {
          setSaveOpen(o);
          if (o) setSaveError("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as new version</DialogTitle>
            <DialogDescription>
              Snapshots the current resume as a named, tailored copy. Your Master
              is unaffected.
            </DialogDescription>
          </DialogHeader>
          {saveError && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {saveError}
              {/relation|does not exist|schema cache/i.test(saveError) && (
                <span className="mt-1 block text-muted-foreground">
                  The resume_versions table may be missing — apply the migration.
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-name">Version name</Label>
              <Input
                id="v-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Simple AI - Founding Engineer"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-company">Company (used for the PDF filename)</Label>
              <Input
                id="v-company"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Simple AI"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="lg" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={handleSaveNew}
              disabled={busy || !newName.trim()}
            >
              {busy ? "Saving…" : "Save version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename version</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-name">Version name</Label>
              <Input
                id="r-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-company">Company</Label>
              <Input
                id="r-company"
                value={renameCompany}
                onChange={(e) => setRenameCompany(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={handleRename}
              disabled={busy || !renameName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
