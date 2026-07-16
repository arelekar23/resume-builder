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
import { ec } from "../lib/editorTheme";
import type { WorkEntry } from "../data/resumeData";

interface ExperienceTabProps {
  work: WorkEntry[];
  updateWork: (id: string, updated: WorkEntry) => void;
  deleteWork: (id: string) => void;
  addWork: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
  reorderWork: (oldIndex: number, newIndex: number) => void;
}

export default function ExperienceTab({
  work,
  updateWork,
  deleteWork,
  addWork,
  excludedBullets,
  toggleBulletExcluded,
  reorderWork,
}: ExperienceTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = work.findIndex((w) => w.id === active.id);
    const newIndex = work.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderWork(oldIndex, newIndex);
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: ec.mutedFg, marginBottom: 10 }}>
        Drag <span style={{ color: ec.faint }}>⋮⋮</span> to reorder. Click a card
        to expand and edit. All experience is always included.
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={work.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          {work.map((j) => (
            <SortableWorkCard
              key={j.id}
              work={j}
              isExpanded={expandedIds.has(j.id)}
              onToggleExpand={() => toggleExpand(j.id)}
              onUpdate={(updated) => updateWork(j.id, updated)}
              onDelete={() => deleteWork(j.id)}
              excludedBullets={excludedBullets}
              toggleBulletExcluded={toggleBulletExcluded}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        onClick={addWork}
        style={{
          width: "100%",
          background: ec.muted,
          border: `1px dashed ${ec.border}`,
          borderRadius: 6,
          padding: "10px 0",
          fontSize: 13,
          cursor: "pointer",
          fontWeight: 600,
          color: ec.mutedFg,
        }}
      >
        + Add Experience
      </button>
    </div>
  );
}

interface SortableWorkCardProps {
  work: WorkEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updated: WorkEntry) => void;
  onDelete: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
}

function SortableWorkCard({
  work: j,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  excludedBullets,
  toggleBulletExcluded,
}: SortableWorkCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: j.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: `1.5px solid ${ec.border}`,
    borderRadius: 8,
    marginBottom: 10,
    overflow: "hidden",
    background: ec.card,
  } as const;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Collapsed header: drag handle + title + date + chevron */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: ec.card,
          borderBottom: isExpanded ? `1px solid ${ec.border}` : "none",
          userSelect: "none",
        }}
      >
        <span
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          style={{
            cursor: "grab",
            color: ec.faint,
            fontSize: 14,
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          ⋮⋮
        </span>
        <div
          onClick={onToggleExpand}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            cursor: "pointer",
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
                color: ec.fg,
              }}
            >
              {j.title}
            </div>
            <div style={{ fontSize: 11, color: ec.faint, marginTop: 2 }}>
              {j.date}
            </div>
          </div>
          <span style={{ fontSize: 14, color: ec.faint, marginLeft: 8 }}>
            {isExpanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded: full editor with bullets */}
      {isExpanded && (
        <div style={{ padding: 10 }}>
          <EntryEditor
            entry={j}
            onChange={(updated) => onUpdate(updated as WorkEntry)}
            onDelete={onDelete}
            excludedBullets={excludedBullets}
            toggleBulletExcluded={toggleBulletExcluded}
          />
        </div>
      )}
    </div>
  );
}
