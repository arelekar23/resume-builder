import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import EntryEditor from "./EntryEditor";
import type { ProjectEntry } from "../data/resumeData";

interface ProjectsTabProps {
  projects: ProjectEntry[];
  selectedProjects: string[];
  toggleProject: (id: string) => void;
  updateProject: (id: string, updated: ProjectEntry) => void;
  deleteProject: (id: string) => void;
  addProject: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
  reorderProjects: (oldIndex: number, newIndex: number) => void;
}

export default function ProjectsTab({
  projects,
  selectedProjects,
  toggleProject,
  updateProject,
  deleteProject,
  addProject,
  excludedBullets,
  toggleBulletExcluded,
  reorderProjects,
}: ProjectsTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderProjects(oldIndex, newIndex);
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Drag <span style={{ color: "#94a3b8" }}>⋮⋮</span> to reorder. Click any
        text to edit. Check to include on resume.
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {projects.map((p) => (
            <SortableProjectCard
              key={p.id}
              project={p}
              isExpanded={expandedIds.has(p.id)}
              isSelected={selectedProjects.includes(p.id)}
              onToggleExpand={() => toggleExpand(p.id)}
              onToggleSelect={() => toggleProject(p.id)}
              onUpdate={(updated) => updateProject(p.id, updated)}
              onDelete={() => deleteProject(p.id)}
              excludedBullets={excludedBullets}
              toggleBulletExcluded={toggleBulletExcluded}
            />
          ))}
        </SortableContext>
      </DndContext>
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

interface SortableProjectCardProps {
  project: ProjectEntry;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onUpdate: (updated: ProjectEntry) => void;
  onDelete: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
}

function SortableProjectCard({
  project: p,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onUpdate,
  onDelete,
  excludedBullets,
  toggleBulletExcluded,
}: SortableProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: p.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: `1.5px solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
    borderRadius: 8,
    marginBottom: 10,
    overflow: "hidden",
    background: "#fff",
  } as const;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Top bar: drag handle + checkbox + included/excluded */}
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
        <span
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          style={{
            cursor: "grab",
            color: "#94a3b8",
            fontSize: 14,
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          ⋮⋮
        </span>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
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
        onClick={onToggleExpand}
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
            onChange={(updated) => onUpdate(updated as ProjectEntry)}
            onDelete={onDelete}
            excludedBullets={excludedBullets}
            toggleBulletExcluded={toggleBulletExcluded}
          />
        </div>
      )}
    </div>
  );
}
