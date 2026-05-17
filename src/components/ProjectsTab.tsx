import { useState } from "react";
import EntryEditor from "./EntryEditor";
import type { ProjectEntry } from "../data/resumeData";

interface ProjectsTabProps {
  projects: ProjectEntry[];
  selectedProjects: string[];
  toggleProject: (id: string) => void;
  updateProject: (id: string, updated: ProjectEntry) => void;
  deleteProject: (id: string) => void;
  addProject: () => void;
}

export default function ProjectsTab({
  projects,
  selectedProjects,
  toggleProject,
  updateProject,
  deleteProject,
  addProject,
}: ProjectsTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Click any text to edit. Check to include on resume.
      </div>
      {projects.map((p) => {
        const isExpanded = expandedIds.has(p.id);
        const isSelected = selectedProjects.includes(p.id);
        return (
          <div
            key={p.id}
            style={{
              border: `1.5px solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
              borderRadius: 8,
              marginBottom: 10,
              overflow: "hidden",
            }}
          >
            {/* Top bar: checkbox + included/excluded */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: isSelected ? "#eff6ff" : "#f8fafc",
                borderBottom: isExpanded ? "1px solid #e2e8f0" : "none",
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleProject(p.id)}
                style={{ cursor: "pointer" }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isSelected ? "#2563eb" : "#64748b",
                }}
              >
                {isSelected ? "Included" : "Excluded"}
              </span>
            </div>

            {/* Collapsed header: title + date + chevron */}
            <div
              onClick={() => toggleExpand(p.id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                cursor: "pointer",
                background: "#fff",
                borderBottom: isExpanded ? "1px solid #e2e8f0" : "none",
                userSelect: "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "#1e293b",
                  }}
                >
                  {p.title}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {p.date}
                </div>
              </div>
              <span style={{ fontSize: 14, color: "#94a3b8", marginLeft: 8 }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>

            {/* Expanded: full editor with bullets */}
            {isExpanded && (
              <div style={{ padding: 10 }}>
                <EntryEditor
                  entry={p}
                  onChange={(updated) =>
                    updateProject(p.id, updated as ProjectEntry)
                  }
                  onDelete={() => deleteProject(p.id)}
                />
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={addProject}
        style={{
          width: "100%",
          background: "#f1f5f9",
          border: "1px dashed #94a3b8",
          borderRadius: 6,
          padding: "10px 0",
          fontSize: 13,
          cursor: "pointer",
          fontWeight: 600,
          color: "#475569",
        }}
      >
        + Add Project
      </button>
    </div>
  );
}
