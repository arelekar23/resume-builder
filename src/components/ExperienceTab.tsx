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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Drag <span style={{ color: "#94a3b8" }}>⋮⋮</span> to reorder. Click any
        text to edit. All experience is always included.
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
        + Add Experience
      </button>
    </div>
  );
}

interface SortableWorkCardProps {
  work: WorkEntry;
  onUpdate: (updated: WorkEntry) => void;
  onDelete: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
}

function SortableWorkCard({
  work: j,
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
    display: "flex",
    gap: 4,
    alignItems: "flex-start",
    marginBottom: 8,
  } as const;

  return (
    <div ref={setNodeRef} style={style}>
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
          paddingTop: 14,
        }}
      >
        ⋮⋮
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <EntryEditor
          entry={j}
          onChange={(updated) => onUpdate(updated as WorkEntry)}
          onDelete={onDelete}
          excludedBullets={excludedBullets}
          toggleBulletExcluded={toggleBulletExcluded}
        />
      </div>
    </div>
  );
}
