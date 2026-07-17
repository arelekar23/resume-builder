import { useState, useRef, useCallback, useEffect } from "react";
import {
  type ProjectEntry,
  type WorkEntry,
  type SkillsMap,
} from "./../data/resumeData";
import generateResumeHTML from "./../utils/generateResumeHTML";
import { sortByDateDesc } from "./../utils/sortByDate";
import { loadState, saveState, type ResumeState } from "./../utils/api";
import {
  getProfile,
  listEducation,
  EMPTY_PERSONAL_INFO,
  type PersonalInfo,
  type EducationRow,
} from "./../utils/profile";
import {
  listVersions,
  saveVersion,
  saveVersionState,
  buildVersionEditorState,
  renameVersion,
  duplicateVersion,
  deleteVersion,
  type ResumeVersion,
} from "./../utils/versions";
import {
  applyPlanToMaster,
  type TailoringPlanOverlay,
} from "./../utils/versionConversion";
import JDAnalysisTab from "./../components/JDAnalysisTab";
import GuidedTailor from "./../components/GuidedTailor";
import ApiSettings from "./../components/ApiSettings";
import ProjectsTab from "./../components/ProjectsTab";
import ExperienceTab from "./../components/ExperienceTab";
import SkillsTab from "./../components/SkillsTab";
import VersionBar from "./../components/VersionBar";
import Onboarding, { ONBOARDING_CUTOFF } from "./../components/Onboarding";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  LogOut,
  FolderGit2,
  Briefcase,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  UserRound,
  PanelLeft,
  PanelRight,
  Menu,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  PencilLine,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Section = "projects" | "experience" | "skills";

// Persist active version across reloads (token refresh shouldn't drop to Master).
const ACTIVE_VERSION_KEY = "resumeBuilder.activeVersionId";

function sanitizeCompany(company: string | null): string {
  if (!company || !company.trim()) return "General";
  return (
    company
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_-]/g, "") || "General"
  );
}

function namePrefix(fullName: string): string {
  return fullName.replace(/[^A-Za-z0-9]/g, "") || "Resume";
}

export default function Editor() {
  const [section, setSection] = useState<Section>("skills");
  const [tailorMode, setTailorMode] = useState<"quick" | "guided">("quick");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [skills, setSkills] = useState<SkillsMap>({});
  const [work, setWork] = useState<WorkEntry[]>([]);
  // Personal info + education come from the DB (the Profile page edits them).
  const [personal, setPersonal] = useState<PersonalInfo>(EMPTY_PERSONAL_INFO);
  const [education, setEducation] = useState<EducationRow[]>([]);
  const [overflowWarning, setOverflowWarning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardCheckedRef = useRef(false);
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  // null = Master (edits go to tables); a version = edits go to its snapshot.
  const [activeVersionId, setActiveVersionId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_VERSION_KEY),
  );
  const activeVersionIdRef = useRef<string | null>(activeVersionId);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [excludedBullets, setExcludedBullets] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  // Letter page is 8.5in wide (816px @96dpi); scale preview to fit the pane.
  const PAGE_W = 8.5 * 96;
  const [previewScale, setPreviewScale] = useState(0.6);
  // Panel collapse (desktop), mobile view switch, and preview zoom override.
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileView, setMobileView] = useState<"edit" | "preview" | "tailor">(
    "edit",
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null); // null = auto-fit

  const { user, signOut } = useAuth();

  function toggleBulletExcluded(id: string) {
    setExcludedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setTimeout(checkOverflow, 300);
  }

  const applyState = useCallback((state: ResumeState) => {
    setSelectedProjects(state.selected_projects);
    setProjects(state.projects);
    setSkills(state.skills);
    setWork(state.work);
    setSelectedSkills(state.selected_skills ?? []);
    setExcludedBullets(new Set(state.excluded_bullets ?? []));
  }, []);

  // Reload the active source. Reads id from a ref to stay stable across changes.
  const refresh = useCallback(async () => {
    const master = await loadState();
    if (!master) {
      setLoaded(true);
      return;
    }
    const id = activeVersionIdRef.current;
    let state = master;
    if (id) {
      const v = await buildVersionEditorState(id, master);
      if (v) state = v;
      else {
        // version was deleted elsewhere — fall back to Master
        activeVersionIdRef.current = null;
        setActiveVersionId(null);
        setActiveCompany(null);
        localStorage.removeItem(ACTIVE_VERSION_KEY);
      }
    }
    applyState(state);
    setLoaded(true);
  }, [applyState]);

  const refreshVersions = useCallback(async () => {
    setVersions(await listVersions());
  }, []);

  useEffect(() => {
    refresh();
    refreshVersions();
  }, [refresh, refreshVersions]);

  // First-run onboarding: shown once per account, for every signup made after
  // this feature shipped, and never for pre-existing accounts. Completion is
  // stored in the account's Supabase user metadata, so it follows the user
  // across devices. Evaluated a single time once the user is known.
  useEffect(() => {
    if (!user || onboardCheckedRef.current) return;
    onboardCheckedRef.current = true;
    const meta = user.user_metadata as { onboarded?: boolean } | undefined;
    if (meta?.onboarded) return;
    const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
    if (!Number.isNaN(createdAt) && createdAt >= ONBOARDING_CUTOFF) {
      setShowOnboarding(true);
    }
  }, [user]);

  // Sync active company label once versions load.
  useEffect(() => {
    if (!activeVersionId || versions.length === 0) return;
    const v = versions.find((x) => x.id === activeVersionId);
    if (v) setActiveCompany(v.company_name ?? null);
  }, [activeVersionId, versions]);

  // Profile-level (shared across versions). Reload on focus to pick up Profile edits.
  const loadProfile = useCallback(async () => {
    const [info, edu] = await Promise.all([getProfile(), listEducation()]);
    setPersonal(info);
    setEducation(edu);
  }, []);

  useEffect(() => {
    loadProfile();
    window.addEventListener("focus", loadProfile);
    return () => window.removeEventListener("focus", loadProfile);
  }, [loadProfile]);

  useEffect(() => {
    const pane = previewPaneRef.current;
    if (!pane) return;
    const update = () => {
      const w = pane.clientWidth;
      // Ignore pre-layout / hidden reads — otherwise the fit locks to the floor.
      if (w < 50) return;
      const avail = w - 24;
      setPreviewScale(Math.max(0.5, Math.min(1, avail / PAGE_W)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(pane);
    return () => ro.disconnect();
  }, [PAGE_W, loaded]);

  const currentResumeState = useCallback(
    (): ResumeState => ({
      selected_projects: selectedProjects,
      selected_skills: selectedSkills,
      excluded_bullets: [...excludedBullets],
      projects,
      skills,
      work,
    }),
    [selectedProjects, selectedSkills, excludedBullets, projects, skills, work],
  );

  // Save to the active source only (Master tables, diff-based; or version snapshot).
  const persist = useCallback(async () => {
    const st = currentResumeState();
    if (activeVersionId) await saveVersionState(activeVersionId, st);
    else await saveState(st);
  }, [currentResumeState, activeVersionId]);

  // Debounced autosave.
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist();
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persist, loaded]);

  // Flush any pending autosave immediately — used before switching sources.
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist();
  }, [persist]);

  // Flush pending autosave on hide/close — otherwise a reload loses the last
  // edit (the "unchecked items come back" bug).
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void persist();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, [persist]);

  // Switch active source (null = Master); flush current first, load target in memory.
  const switchTo = useCallback(
    async (id: string | null) => {
      await flushSave();
      activeVersionIdRef.current = id;
      setActiveVersionId(id);
      if (id) localStorage.setItem(ACTIVE_VERSION_KEY, id);
      else localStorage.removeItem(ACTIVE_VERSION_KEY);
      const master = await loadState();
      let state = master ?? undefined;
      if (id && master) {
        const v = await buildVersionEditorState(id, master);
        if (v) state = v;
      }
      if (state) applyState(state);
      setActiveCompany(
        id ? versions.find((x) => x.id === id)?.company_name ?? null : null,
      );
    },
    [flushSave, applyState, versions],
  );

  const handleSaveNewVersion = useCallback(
    async (name: string, company: string | null) => {
      await flushSave();
      const v = await saveVersion(name, company, currentResumeState());
      if (v) {
        await refreshVersions();
        await switchTo(v.id);
      }
    },
    [flushSave, currentResumeState, refreshVersions, switchTo],
  );

  const handleRenameVersion = useCallback(
    async (id: string, name: string, company: string | null) => {
      await renameVersion(id, { name, company_name: company });
      await refreshVersions();
      if (id === activeVersionIdRef.current) setActiveCompany(company);
    },
    [refreshVersions],
  );

  const handleDuplicateVersion = useCallback(
    async (id: string) => {
      const src = versions.find((v) => v.id === id);
      await duplicateVersion(id, `${src?.name ?? "Version"} (copy)`);
      await refreshVersions();
    },
    [versions, refreshVersions],
  );

  const handleDeleteVersion = useCallback(
    async (id: string) => {
      await deleteVersion(id);
      if (id === activeVersionIdRef.current) await switchTo(null);
      await refreshVersions();
    },
    [switchTo, refreshVersions],
  );

  // Guided mode: current selection from live editor state (respects mid-flow tweaks).
  const getCurrentSelection = useCallback(() => {
    const st = currentResumeState();
    const excluded = new Set(st.excluded_bullets);
    const selectedSet = new Set(st.selected_projects);
    const includedBulletIds = [
      ...st.projects
        .filter((p) => selectedSet.has(p.id))
        .flatMap((p) => p.bullets.filter((b) => !excluded.has(b.id)).map((b) => b.id)),
      ...st.work.flatMap((w) =>
        w.bullets.filter((b) => !excluded.has(b.id)).map((b) => b.id),
      ),
    ];
    return {
      selectedProjectIds: st.selected_projects,
      projectOrder: st.selected_projects,
      includedBulletIds,
      skills: Object.keys(st.skills).map((c, i) => ({
        category: c,
        items: st.skills[c].split(",").map((s) => s.trim()).filter(Boolean),
        position: i,
        is_selected: st.selected_skills.includes(c),
      })),
      rationale: [] as string[],
    };
  }, [currentResumeState]);

  // Guided mode: resume as ATS/reviewers see it (selected only, HTML stripped).
  const getCurrentResumeView = useCallback(() => {
    const st = currentResumeState();
    const excluded = new Set(st.excluded_bullets);
    const selectedSet = new Set(st.selected_projects);
    const strip = (t: string) => t.replace(/<[^>]+>/g, "").trim();
    return {
      projects: st.projects
        .filter((p) => selectedSet.has(p.id))
        .map((p) => ({
          title: strip(p.title),
          bullets: p.bullets
            .filter((b) => !excluded.has(b.id))
            .map((b) => strip(b.text))
            .filter(Boolean),
        })),
      work: st.work.map((w) => ({
        title: strip(w.title),
        bullets: w.bullets
          .filter((b) => !excluded.has(b.id))
          .map((b) => strip(b.text))
          .filter(Boolean),
      })),
      skills: Object.keys(st.skills)
        .filter((c) => st.selected_skills.includes(c))
        .map((c) => ({ category: c, items: st.skills[c] })),
      // Education renders on the resume but isn't in editor state — add it explicitly.
      education: education.map((e) => ({
        school: e.school,
        degree: e.details ? `${e.degree}, ${e.details}` : e.degree,
        date: e.date,
      })),
    };
  }, [currentResumeState, education]);

  const applyTailoredBullets = useCallback(
    (bullets: { id: string; text: string }[]) => {
      const map = new Map(bullets.map((b) => [b.id, b.text]));
      const patch = (bs: { id: string; text: string }[]) =>
        bs.map((b) => (map.has(b.id) ? { ...b, text: map.get(b.id)! } : b));
      setProjects((prev) =>
        prev.map((p) => ({ ...p, bullets: patch(p.bullets) as typeof p.bullets })),
      );
      setWork((prev) =>
        prev.map((w) => ({ ...w, bullets: patch(w.bullets) as typeof w.bullets })),
      );
    },
    [],
  );

  // Turn a tailoring plan into a new version and switch to it (Master untouched).
  const applyTailoringPlan = useCallback(
    async (plan: unknown) => {
      const p = plan as TailoringPlanOverlay & {
        companyName?: string;
        fitAssessment?: { roleType?: string };
      };
      const master = await loadState();
      if (!master) return;
      const tailored = applyPlanToMaster(master, p);
      const company = p.companyName?.trim() || "";
      const role = p.fitAssessment?.roleType?.trim() || "";
      // Version name = role type; company lives in its own field.
      const name = role || company || "Tailored";
      const v = await saveVersion(name, company || null, tailored);
      if (v) {
        await refreshVersions();
        await switchTo(v.id);
      }
    },
    [refreshVersions, switchTo],
  );

  const sortedProjects = sortByDateDesc(projects);
  const resumeHTML = generateResumeHTML(
    selectedProjects,
    selectedSkills,
    sortedProjects,
    skills,
    work,
    excludedBullets,
    personal,
    education,
  );

  const checkOverflow = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return false;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const page = doc?.querySelector<HTMLElement>(".page");
      if (!page) return false;
      // scrollHeight counts the bottom padding (page margin); only flag when
      // content spills PAST the page box, so allow up to that padding.
      const cs = doc?.defaultView?.getComputedStyle(page);
      const padBottom = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
      const isOver = page.scrollHeight - page.clientHeight > padBottom + 2;
      setOverflowWarning(isOver);
      return isOver;
    } catch {
      return false;
    }
  }, []);

  // Measure only after the web font loads, else the badge sticks on fallback
  // metrics. Extra timeout covers browsers where fonts.ready beats layout.
  const handlePreviewLoad = useCallback(() => {
    const doc =
      iframeRef.current?.contentDocument ||
      iframeRef.current?.contentWindow?.document;
    const fonts = doc?.fonts as FontFaceSet | undefined;
    if (fonts?.ready) {
      fonts.ready.then(() => checkOverflow()).catch(() => checkOverflow());
    } else {
      checkOverflow();
    }
    setTimeout(checkOverflow, 250);
  }, [checkOverflow]);

  function exportPDF() {
    if (checkOverflow()) {
      if (
        !window.confirm(
          "⚠️ Content overflows the page and will be cut off. Export anyway?",
        )
      )
        return;
    }
    const originalTitle = document.title;
    document.title = `${namePrefix(personal.full_name)}_Resume_${sanitizeCompany(activeCompany)}`;
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
  }

  function toggleProject(id: string) {
    setSelectedProjects((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
    setTimeout(checkOverflow, 300);
  }
  function toggleSkill(key: string) {
    setSelectedSkills((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }
  function updateProject(id: string, updated: ProjectEntry) {
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    setTimeout(checkOverflow, 300);
  }
  function deleteProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedProjects((prev) => prev.filter((i) => i !== id));
  }
  function addProject() {
    const id = crypto.randomUUID();
    setProjects((prev) => [
      ...prev,
      {
        id,
        title: "New Project (Tech Stack)",
        date: "Jan 2026",
        bullets: [{ id: crypto.randomUUID(), text: "", original_text: "" }],
      },
    ]);
  }
  function addWork() {
    const id = crypto.randomUUID();
    setWork((prev) => [
      ...prev,
      {
        id,
        title: "Job Title, Company, Location",
        date: "Jan 2024 – Present",
        bullets: [{ id: crypto.randomUUID(), text: "", original_text: "" }],
      },
    ]);
  }
  function updateWork(id: string, updated: WorkEntry) {
    setWork((prev) => prev.map((j) => (j.id === id ? updated : j)));
    setTimeout(checkOverflow, 300);
  }
  function deleteWork(id: string) {
    setWork((prev) => prev.filter((j) => j.id !== id));
  }
  function reorderProjects(oldIndex: number, newIndex: number) {
    setProjects((prev) => {
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }
  function reorderWork(oldIndex: number, newIndex: number) {
    setWork((prev) => {
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }
  function reorderSkills(oldIndex: number, newIndex: number) {
    setSkills((prev) => {
      const entries = Object.entries(prev);
      const [moved] = entries.splice(oldIndex, 1);
      entries.splice(newIndex, 0, moved);
      return Object.fromEntries(entries);
    });
  }

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "skills", label: "Skills", icon: <Wrench /> },
    { key: "experience", label: "Experience", icon: <Briefcase /> },
    { key: "projects", label: "Projects", icon: <FolderGit2 /> },
  ];

  // Preview zoom: null = auto-fit to the pane; a number overrides it.
  const effectiveScale = zoom ?? previewScale;
  const zoomBy = (delta: number) =>
    setZoom((z) => Math.min(2, Math.max(0.3, (z ?? previewScale) + delta)));

  // Versions + export — shared by the desktop sidebar and the mobile sheet.
  const resumePanel = (
    <>
      <VersionBar
        versions={versions}
        activeVersionId={activeVersionId}
        onSwitch={(id) => {
          switchTo(id);
          setMobileMenuOpen(false);
        }}
        onSaveNew={handleSaveNewVersion}
        onRename={handleRenameVersion}
        onDuplicate={handleDuplicateVersion}
        onDelete={handleDeleteVersion}
      />
      <Separator />
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Actions
        </span>
        <Button
          variant="outline"
          size="lg"
          className="w-full justify-start"
          onClick={exportPDF}
        >
          <Download />
          Export PDF
        </Button>
      </div>
      <div className="px-1 text-[11px] text-muted-foreground">
        {`PDF: ${namePrefix(personal.full_name)}_Resume_${sanitizeCompany(activeCompany)}.pdf`}
      </div>
    </>
  );

  const MOBILE_VIEWS: { key: typeof mobileView; label: string; icon: React.ReactNode }[] =
    [
      { key: "edit", label: "Edit", icon: <PencilLine /> },
      { key: "preview", label: "Preview", icon: <Eye /> },
      { key: "tailor", label: "Tailor", icon: <Sparkles /> },
    ];

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          {/* Mobile: open versions/export drawer */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            title="Versions & export"
          >
            <Menu />
          </Button>
          {/* Desktop: collapse left sidebar */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={() => setLeftOpen((o) => !o)}
            title={leftOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <PanelLeft className={cn(leftOpen && "text-primary")} />
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="truncate">Resume Builder</span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden text-xs text-muted-foreground xl:inline">
            {user?.email}
          </span>
          {/* Desktop: collapse right (tailor) panel */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={() => setRightOpen((o) => !o)}
            title={rightOpen ? "Hide tailor panel" : "Show tailor panel"}
          >
            <PanelRight className={cn(rightOpen && "text-primary")} />
          </Button>
          <ApiSettings />
          <Button variant="ghost" size="sm" asChild className="hidden lg:inline-flex">
            <Link to="/profile">
              <UserRound />
              Profile
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="hidden lg:inline-flex"
          >
            <LogOut />
            Sign out
          </Button>
          {/* Mobile: account menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon-sm" title="Account">
                <UserRound />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <UserRound />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => signOut()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {/* Left sidebar — desktop only, collapsible */}
        <aside
          className={cn(
            "hidden shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-3",
            leftOpen ? "lg:flex lg:w-64" : "lg:hidden",
          )}
        >
          {resumePanel}
        </aside>

        {/* Center: edit + preview — grouped on desktop, split into
            separate mobile views via `display: contents`. */}
        <div className="contents lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1">
        {/* Edit pane */}
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col border-border bg-background",
            mobileView === "edit" ? "flex" : "hidden",
            "lg:flex lg:w-[44%] lg:min-w-[340px] lg:flex-none lg:border-r",
          )}
        >
          <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
            <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
              <TabsList>
                {SECTIONS.map((s) => (
                  <TabsTrigger key={s.key} value={s.key}>
                    {s.icon}
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {section === "projects" && (
              <ProjectsTab
                projects={sortedProjects}
                selectedProjects={selectedProjects}
                toggleProject={toggleProject}
                updateProject={updateProject}
                deleteProject={deleteProject}
                addProject={addProject}
                excludedBullets={excludedBullets}
                toggleBulletExcluded={toggleBulletExcluded}
                reorderProjects={reorderProjects}
              />
            )}
            {section === "experience" && (
              <ExperienceTab
                work={work}
                updateWork={updateWork}
                deleteWork={deleteWork}
                addWork={addWork}
                excludedBullets={excludedBullets}
                toggleBulletExcluded={toggleBulletExcluded}
                reorderWork={reorderWork}
              />
            )}
            {section === "skills" && (
              <SkillsTab
                skills={skills}
                setSkills={setSkills}
                reorderSkills={reorderSkills}
                selectedSkills={selectedSkills}
                toggleSkill={toggleSkill}
              />
            )}
          </div>
        </section>

        {/* Preview pane */}
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-muted/30",
            mobileView === "preview" ? "flex" : "hidden",
            "lg:flex",
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2 sm:px-3">
            {/* Zoom controls */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => zoomBy(-0.1)}
                title="Zoom out"
              >
                <ZoomOut />
              </Button>
              <button
                onClick={() => setZoom(null)}
                title="Reset to fit"
                className="min-w-[3rem] rounded-md px-1 py-0.5 text-center text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground"
              >
                {Math.round(effectiveScale * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => zoomBy(0.1)}
                title="Zoom in"
              >
                <ZoomIn />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoom(null)}
                title="Fit to width"
                className="hidden sm:inline-flex"
              >
                <Maximize2 />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {overflowWarning ? (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" />
                  <span className="hidden sm:inline">Overflows one page</span>
                  <span className="sm:hidden">Overflow</span>
                </Badge>
              ) : (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" />
                  <span className="hidden sm:inline">Fits one page</span>
                  <span className="sm:hidden">Fits</span>
                </Badge>
              )}
              {/* Always-available export, independent of the left sidebar. */}
              <Button
                variant="outline"
                size="sm"
                onClick={exportPDF}
                title="Export PDF"
              >
                <Download />
                <span className="hidden sm:inline">Export PDF</span>
              </Button>
            </div>
          </div>
          <div
            ref={previewPaneRef}
            className="flex min-h-0 flex-1 justify-center overflow-auto p-4"
          >
            <div
              style={{
                width: `${8.5 * effectiveScale}in`,
                height: `${11 * effectiveScale}in`,
                flexShrink: 0,
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={resumeHTML}
                onLoad={handlePreviewLoad}
                title="Resume Preview"
                style={{
                  width: "8.5in",
                  height: "11in",
                  transform: `scale(${effectiveScale})`,
                  transformOrigin: "top left",
                }}
                className="rounded-sm border-none bg-white shadow-[0_4px_24px_rgba(0,0,0,0.12)]"
              />
            </div>
          </div>
        </section>
        </div>

        {/* Right sidebar: Tailor from JD — collapsible (desktop) + mobile view */}
        <aside
          className={cn(
            "relative min-h-0 min-w-0 flex-1 flex-col border-border",
            mobileView === "tailor" ? "flex" : "hidden",
            rightOpen
              ? "lg:flex lg:w-[380px] lg:flex-none lg:border-l"
              : "lg:hidden",
          )}
        >
          {/* Floating grip on the divider — collapse the panel (desktop). */}
          {rightOpen && (
            <button
              onClick={() => setRightOpen(false)}
              title="Collapse panel"
              aria-label="Collapse tailor panel"
              className="absolute -left-3 top-1/2 z-10 hidden h-16 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:border-primary hover:bg-muted hover:text-foreground lg:flex"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 shrink-0 text-primary" />
              <span className="truncate">Tailor from JD</span>
            </span>
            <Tabs
              value={tailorMode}
              onValueChange={(v) => setTailorMode(v as "quick" | "guided")}
            >
              <TabsList className="h-7">
                <TabsTrigger value="quick" className="text-xs">
                  Quick
                </TabsTrigger>
                <TabsTrigger value="guided" className="text-xs">
                  Guided
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 flex-1">
            {tailorMode === "quick" ? (
              <JDAnalysisTab
                profileId={user?.id ?? ""}
                onApplyPlan={applyTailoringPlan}
              />
            ) : (
              <GuidedTailor
                profileId={user?.id ?? ""}
                onApplyScreenPlan={applyTailoringPlan}
                getCurrentSelection={getCurrentSelection}
                onApplyTailoredBullets={applyTailoredBullets}
                getResumeView={getCurrentResumeView}
              />
            )}
          </div>
        </aside>

        {/* Collapsed Tailor panel — clickable rail with a matching grip (desktop). */}
        {!rightOpen && (
          <div className="relative hidden shrink-0 border-l border-border lg:flex">
            {/* Floating grip on the divider — expand the panel. */}
            <button
              onClick={() => setRightOpen(true)}
              title="Show tailor panel"
              aria-label="Expand tailor panel"
              className="absolute -left-3 top-1/2 z-10 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:border-primary hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setRightOpen(true)}
              title="Show tailor panel"
              className="flex w-11 flex-col items-center gap-2 py-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Sparkles className="size-4 text-primary" />
              <span className="text-xs font-medium tracking-wide [writing-mode:vertical-rl]">
                Tailor from JD
              </span>
            </button>
          </div>
        )}
      </main>

      {/* Mobile: view switcher */}
      <nav className="flex shrink-0 border-t border-border lg:hidden">
        {MOBILE_VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setMobileView(v.key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors [&_svg]:size-5",
              mobileView === v.key
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
      </nav>

      {/* Mobile: versions + export drawer */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resume &amp; versions</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">{resumePanel}</div>
        </DialogContent>
      </Dialog>

      {/* First-run multi-step onboarding: connect AI, import a resume, tour. */}
      {showOnboarding && (
        <Onboarding
          email={user?.email ?? undefined}
          onComplete={() => setShowOnboarding(false)}
          onImported={async () => {
            await Promise.all([refresh(), refreshVersions(), loadProfile()]);
          }}
        />
      )}
    </div>
  );
}
