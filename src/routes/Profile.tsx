import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, LogOut, AlertTriangle, Loader2 } from "lucide-react";

import ResumeUpload from "@/components/ResumeUpload";

import { useAuth } from "@/contexts/AuthContext";
import {
  getProfile,
  updateProfile,
  listEducation,
  saveEducation,
  deleteAccount,
  EMPTY_PERSONAL_INFO,
  type PersonalInfo,
  type EducationRow,
} from "@/utils/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type SaveState = "idle" | "saving" | "saved" | "error";

// A blank education row for the "Add" button (id="" => not yet in the DB).
const blankEducation = (): EducationRow => ({
  id: "",
  school: "",
  degree: "",
  details: "",
  date: "",
  position: 0,
});

const PERSONAL_FIELDS: {
  key: keyof PersonalInfo;
  label: string;
  placeholder: string;
  type?: string;
}[] = [
  { key: "full_name", label: "Full name", placeholder: "Jane Doe" },
  { key: "email", label: "Email", placeholder: "jane@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "(555) 123-4567" },
  { key: "location", label: "Location", placeholder: "San Francisco, CA" },
  {
    key: "linkedin_url",
    label: "LinkedIn URL",
    placeholder: "https://linkedin.com/in/username",
  },
  {
    key: "github_url",
    label: "GitHub URL",
    placeholder: "https://github.com/username",
  },
];

export default function Profile() {
  const { user, signOut } = useAuth();
  const [personal, setPersonal] = useState<PersonalInfo>(EMPTY_PERSONAL_INFO);
  const [education, setEducation] = useState<EducationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadAll = useCallback(async () => {
    const [info, edu] = await Promise.all([getProfile(), listEducation()]);
    setPersonal(info);
    setEducation(edu);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function setField(key: keyof PersonalInfo, value: string) {
    setPersonal((prev) => ({ ...prev, [key]: value }));
    setSaveState("idle");
  }

  function setEduField(index: number, key: keyof EducationRow, value: string) {
    setEducation((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [key]: value } : e)),
    );
    setSaveState("idle");
  }

  function addEducation() {
    setEducation((prev) => [...prev, blankEducation()]);
    setSaveState("idle");
  }

  function removeEducation(index: number) {
    setEducation((prev) => prev.filter((_, i) => i !== index));
    setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    setSaveError("");
    const [profileRes, eduRes] = await Promise.all([
      updateProfile(personal),
      saveEducation(education),
    ]);
    if (profileRes.ok && eduRes.ok) {
      // Reload education so newly-inserted rows get their real DB ids.
      setEducation(await listEducation());
      setSaveState("saved");
    } else {
      setSaveError(profileRes.error || eduRes.error || "Unknown error.");
      setSaveState("error");
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    const res = await deleteAccount();
    if (res.ok) {
      // Session is gone; signing out flips ProtectedRoute back to /login.
      await signOut();
    } else {
      setDeleteError(res.error || "Failed to delete account.");
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft />
              Editor
            </Link>
          </Button>
          <span className="text-sm font-semibold">Profile</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            This is your master resume. Personal info and education here appear
            on every resume you generate. Skills, experience, and projects are
            edited in the Editor.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Import from resume</CardTitle>
            <CardDescription>
              Upload a PDF to auto-fill your profile, experience, projects, and
              skills. This replaces your current master content; saved company
              versions are kept.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeUpload confirmOverwrite onDone={loadAll} />
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Personal info</CardTitle>
                <CardDescription>
                  Shown in the header of every generated resume.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PERSONAL_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <Input
                      id={f.key}
                      type={f.type ?? "text"}
                      value={personal[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Education</CardTitle>
                <CardDescription>
                  Listed on your resume in the order shown here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {education.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No education added yet.
                  </p>
                )}
                {education.map((e, i) => (
                  <div
                    key={e.id || `new-${i}`}
                    className="space-y-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Entry {i + 1}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEducation(i)}
                      >
                        <Trash2 />
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>School</Label>
                        <Input
                          value={e.school}
                          placeholder="University Name, City, State"
                          onChange={(ev) =>
                            setEduField(i, "school", ev.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Date</Label>
                        <Input
                          value={e.date}
                          placeholder="Dec 2025"
                          onChange={(ev) =>
                            setEduField(i, "date", ev.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Degree</Label>
                      <Input
                        value={e.degree}
                        placeholder="Master of Science, Computer Science, 3.8/4.0"
                        onChange={(ev) =>
                          setEduField(i, "degree", ev.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Details (optional)</Label>
                      <Textarea
                        value={e.details}
                        placeholder="Relevant Courses: …"
                        rows={2}
                        onChange={(ev) =>
                          setEduField(i, "details", ev.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addEducation}>
                  <Plus />
                  Add education
                </Button>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saveState === "saving"}>
                {saveState === "saving" ? "Saving…" : "Save changes"}
              </Button>
              {saveState === "saved" && (
                <span className="text-sm text-muted-foreground">Saved.</span>
              )}
              {saveState === "error" && (
                <span className="text-sm text-destructive">
                  {saveError || "Something went wrong. Try again."}
                </span>
              )}
            </div>
          </>
        )}

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete your account and everything in it — profile,
              experience, projects, skills, all saved versions, and your stored
              API key. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteError("");
                setConfirmText("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
              Delete account
            </Button>
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!deleting) setDeleteOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              Delete account
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your account and all associated data —
              profile, resume content, every saved version, and your encrypted
              API key. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-delete">
              Type <span className="font-semibold text-foreground">DELETE</span>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              autoFocus
            />
            {deleteError && (
              <p className="text-sm text-destructive">{deleteError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="lg"
              onClick={handleDeleteAccount}
              disabled={deleting || confirmText.trim() !== "DELETE"}
            >
              {deleting && <Loader2 className="animate-spin" />}
              Delete my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
