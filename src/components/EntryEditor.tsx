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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import InlineText from "./InlineText";
import type { ProjectEntry, WorkEntry, Bullet } from "../data/resumeData";

type Entry = ProjectEntry | WorkEntry;

interface EntryEditorProps {
  entry: Entry;
  onChange: (updated: Entry) => void;
  onDelete: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
}

export default function EntryEditor({
  entry,
  onChange,
  onDelete,
  excludedBullets,
  toggleBulletExcluded,
}: EntryEditorProps) {
  // Require ~5px movement before drag starts so clicks in the bullet text
  // don't accidentally start a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function updateBullet(i: number, v: string) {
    const b = entry.bullets.map((bullet, j) =>
      j === i ? { ...bullet, text: v } : bullet,
    );
    onChange({ ...entry, bullets: b });
  }

  function addBullet() {
    onChange({
      ...entry,
      bullets: [
        ...entry.bullets,
        { id: crypto.randomUUID(), text: "", original_text: "" },
      ],
    });
  }

  function removeBullet(i: number) {
    onChange({ ...entry, bullets: entry.bullets.filter((_, j) => j !== i) });
  }

  function restoreBullet(i: number) {
    const b = entry.bullets.map((bullet, j) =>
      j === i ? { ...bullet, text: bullet.original_text } : bullet,
    );
    onChange({ ...entry, bullets: b });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entry.bullets.findIndex((b) => b.id === active.id);
    const newIndex = entry.bullets.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange({
      ...entry,
      bullets: arrayMove(entry.bullets, oldIndex, newIndex),
    });
  }

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>
            Title
          </div>
          <InlineText
            value={entry.title}
            onChange={(v) => onChange({ ...entry, title: v })}
            bold
          />
        </div>
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>
            Date
          </div>
          <InlineText
            value={entry.date}
            onChange={(v) => onChange({ ...entry, date: v })}
          />
        </div>
      </div>
      <div
        style={{ fontSize: 11, color: "#888", marginBottom: 4, marginTop: 6 }}
      >
        Bullets
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={entry.bullets.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {entry.bullets.map((b, i) => (
            <SortableBullet
              key={b.id}
              bullet={b}
              index={i}
              isExcluded={excludedBullets.has(b.id)}
              onToggleExclude={() => toggleBulletExcluded(b.id)}
              onUpdate={(v) => updateBullet(i, v)}
              onRestore={() => restoreBullet(i)}
              onRemove={() => removeBullet(i)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          onClick={addBullet}
          style={{
            flex: 1,
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            padding: "5px 0",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          + Add Bullet
        </button>
        <button
          onClick={onDelete}
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 4,
            padding: "5px 10px",
            fontSize: 12,
            cursor: "pointer",
            color: "#dc2626",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

interface SortableBulletProps {
  bullet: Bullet;
  index: number;
  isExcluded: boolean;
  onToggleExclude: () => void;
  onUpdate: (v: string) => void;
  onRestore: () => void;
  onRemove: () => void;
}

function SortableBullet({
  bullet,
  isExcluded,
  onToggleExclude,
  onUpdate,
  onRestore,
  onRemove,
}: SortableBulletProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bullet.id });

  const canRestore =
    bullet.original_text !== "" && bullet.text !== bullet.original_text;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isExcluded ? 0.4 : 1,
    background: isDragging ? "#f8fafc" : "transparent",
    display: "flex",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 4,
  } as const;

  return (
    <div ref={setNodeRef} style={style}>
      <span
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        style={{
          cursor: "grab",
          color: "#cbd5e1",
          paddingTop: 4,
          fontSize: 12,
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        ⋮⋮
      </span>
      <input
        type="checkbox"
        checked={!isExcluded}
        onChange={onToggleExclude}
        title={
          isExcluded ? "Include in this resume" : "Exclude from this resume"
        }
        style={{ marginTop: 5, cursor: "pointer", flexShrink: 0 }}
      />
      <span style={{ color: "#94a3b8", marginTop: 4, fontSize: 14 }}>•</span>
      <div style={{ flex: 1 }}>
        <InlineText
          value={bullet.text}
          onChange={onUpdate}
          placeholder="Type bullet here..."
        />
      </div>
      {canRestore && (
        <button
          onClick={onRestore}
          title={`Restore original: "${bullet.original_text}"`}
          style={{
            background: "none",
            border: "none",
            color: "#6366f1",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
      )}
      <button
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          color: "#f87171",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          paddingTop: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}
