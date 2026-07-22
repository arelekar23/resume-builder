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
import { GripVertical } from "lucide-react";
import type { SectionKey } from "@/utils/profile";
import { cn } from "@/lib/utils";

const LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  education: "Education",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
};

interface SectionOrderProps {
  order: SectionKey[];
  onReorder: (oldIndex: number, newIndex: number) => void;
}

// Drag to reorder the resume's sections (master-level, shared by all versions).
export default function SectionOrder({ order, onReorder }: SectionOrderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as SectionKey);
    const newIndex = order.indexOf(over.id as SectionKey);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Section order
      </span>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {order.map((key) => (
              <SortableSection key={key} id={key} label={LABELS[key]} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableSection({ id, label }: { id: SectionKey; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm",
        isDragging && "opacity-50 shadow-sm",
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${label}`}
      >
        <GripVertical className="size-3.5" />
      </span>
      {label}
    </div>
  );
}
