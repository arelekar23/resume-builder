import { useState, useRef, useCallback, useEffect } from "react";
import {
  INIT_PROJECTS,
  INIT_SKILLS,
  INIT_WORK,
  type ProjectEntry,
  type WorkEntry,
  type SkillsMap,
} from "./../data/resumeData";
import generateResumeHTML from "./../utils/generateResumeHTML";
import { sortByDateDesc } from "./../utils/sortByDate";
import { loadState, saveState } from "./../utils/api";
import JDAnalysisTab from "./../components/JDAnalysisTab";
import ProjectsTab from "./../components/ProjectsTab";
import ExperienceTab from "./../components/ExperienceTab";
import SkillsTab from "./../components/SkillsTab";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type Tab = "jd" | "projects" | "experience" | "skills";

export default function Editor() {
  const [tab, setTab] = useState<Tab>("jd");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([
    "mealmind",
    "shiftbot",
    "credify",
  ]);
  const [projects, setProjects] = useState<ProjectEntry[]>(INIT_PROJECTS);
  const [skills, setSkills] = useState<SkillsMap>(INIT_SKILLS);
  const [work, setWork] = useState<WorkEntry[]>(INIT_WORK);
  const [overflowWarning, setOverflowWarning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const { user, signOut } = useAuth();
  // --- Load persisted state on mount ---
  useEffect(() => {
    loadState().then((state) => {
      if (state) {
        setSelectedProjects(state.selected_projects);
        setProjects(state.projects);
        setSkills(state.skills);
        setWork(state.work);
      }
      setLoaded(true);
    });
  }, []);

  // --- Auto-save with debounce ---
  useEffect(() => {
    if (!loaded) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState({
        selected_projects: selectedProjects,
        projects,
        skills,
        work,
      });
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [selectedProjects, projects, skills, work, loaded]);

  const sortedProjects = sortByDateDesc(projects);
  const resumeHTML = generateResumeHTML(
    selectedProjects,
    sortedProjects,
    skills,
    work,
  );

  const checkOverflow = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return false;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const page = doc?.querySelector(".page");
      if (!page) return false;
      const isOver = page.scrollHeight > page.clientHeight;
      setOverflowWarning(isOver);
      return isOver;
    } catch {
      return false;
    }
  }, []);

  function exportPDF() {
    if (checkOverflow()) {
      if (
        !window.confirm(
          "⚠️ Content overflows the page and will be cut off. Export anyway?",
        )
      )
        return;
    }
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }

  function toggleProject(id: string) {
    setSelectedProjects((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
    setTimeout(checkOverflow, 300);
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
    const id = "proj_" + Date.now();
    setProjects((prev) => [
      ...prev,
      {
        id,
        title: "New Project (Tech Stack)",
        date: "Jan 2026",
        bullets: ["Describe what you built and the impact"],
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

  function addWork() {
    const id = "work_" + Date.now();
    setWork((prev) => [
      ...prev,
      {
        id,
        title: "Job Title, Company, Location",
        date: "Jan 2024 – Present",
        bullets: ["Describe your responsibilities and impact"],
      },
    ]);
  }

  const tabStyle = (t: Tab) => ({
    padding: "8px 12px",
    cursor: "pointer" as const,
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? "#2563eb" : "#555",
    background: "none",
    border: "none",
    borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
    fontSize: 13,
  });

  const TAB_LABELS: Record<Tab, string> = {
    jd: "JD Analysis",
    projects: "Projects",
    experience: "Experience",
    skills: "Skills",
  };

  if (!loaded) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#64748b",
          fontSize: 15,
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        minHeight: "100vh",
        background: "#f8fafc",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#1e293b",
          color: "#fff",
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          Resume Builder — Adwait Relekar
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#cbd5e1" }}>{user?.email}</span>
          <button
            onClick={exportPDF}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 18px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Export PDF
          </button>
          <button
            onClick={signOut}
            style={{
              background: "transparent",
              color: "#cbd5e1",
              border: "1px solid #475569",
              borderRadius: 6,
              padding: "8px 14px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 440,
            minWidth: 400,
            background: "#fff",
            borderRight: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #e2e8f0",
              padding: "0 8px",
            }}
          >
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          <div style={{ padding: 14, flex: 1 }}>
            {tab === "jd" && (
              <JDAnalysisTab
                projects={sortedProjects}
                skills={skills}
                setSelectedProjects={(ids) => {
                  setSelectedProjects(ids);
                  setTimeout(checkOverflow, 300);
                }}
              />
            )}
            {tab === "projects" && (
              <ProjectsTab
                projects={sortedProjects}
                selectedProjects={selectedProjects}
                toggleProject={toggleProject}
                updateProject={updateProject}
                deleteProject={deleteProject}
                addProject={addProject}
              />
            )}
            {tab === "experience" && (
              <ExperienceTab
                work={work}
                updateWork={updateWork}
                deleteWork={deleteWork}
                addWork={addWork}
              />
            )}
            {tab === "skills" && (
              <SkillsTab skills={skills} setSkills={setSkills} />
            )}
          </div>
        </div>

        {/* Preview */}
        <div
          style={{
            flex: 1,
            background: "#e2e8f0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "20px 0",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            Live Preview
          </div>
          {overflowWarning && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: 6,
                padding: "8px 14px",
                marginBottom: 10,
                fontSize: 13,
                color: "#dc2626",
                fontWeight: 600,
                maxWidth: "90%",
              }}
            >
              ⚠️ Content overflows the page. Remove a project or bullet to fit
              within one page.
            </div>
          )}
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              overflowX: "auto",
            }}
          >
            <div
              style={{
                transform: "scale(0.75)",
                transformOrigin: "top center",
                width: "8.5in",
                minHeight: "11in",
                marginBottom: "-25%",
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={resumeHTML}
                onLoad={checkOverflow}
                style={{
                  width: "8.5in",
                  minHeight: "11in",
                  border: "none",
                  background: "#fff",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
                }}
                title="Resume Preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
