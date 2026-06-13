import { useState, type Dispatch, type SetStateAction } from "react";
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
import type { SkillsMap } from "../data/resumeData";

interface SkillsTabProps {
  skills: SkillsMap;
  setSkills: Dispatch<SetStateAction<SkillsMap>>;
  reorderSkills: (oldIndex: number, newIndex: number) => void;
  selectedSkills: string[];
  toggleSkill: (key: string) => void;
}

export default function SkillsTab({
  skills,
  setSkills,
  reorderSkills,
  selectedSkills,
  toggleSkill,
}: SkillsTabProps) {
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editingSkillValue, setEditingSkillValue] = useState("");
  const [newSkillKey, setNewSkillKey] = useState("");
  const [newSkillVal, setNewSkillVal] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const skillKeys = Object.keys(skills);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = skillKeys.indexOf(active.id as string);
    const newIndex = skillKeys.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderSkills(oldIndex, newIndex);
  }

  function startEditSkill(k: string) {
    setEditingSkill(k);
    setEditingSkillValue(skills[k]);
  }

  function saveSkill(k: string) {
    setSkills((prev) => ({ ...prev, [k]: editingSkillValue }));
    setEditingSkill(null);
  }

  function removeSkill(k: string) {
    setSkills((prev) => {
      const s = { ...prev };
      delete s[k];
      return s;
    });
  }

  function addSkill() {
    if (!newSkillKey.trim() || !newSkillVal.trim()) return;
    setSkills((prev) => ({
      ...prev,
      [newSkillKey.trim()]: newSkillVal.trim(),
    }));
    setNewSkillKey("");
    setNewSkillVal("");
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Drag <span style={{ color: "#94a3b8" }}>⋮⋮</span> to reorder. Check to
        include on resume.
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={skillKeys}
          strategy={verticalListSortingStrategy}
        >
          {skillKeys.map((k) => (
            <SortableSkillCard
              key={k}
              skillKey={k}
              skillValue={skills[k]}
              isSelected={selectedSkills.includes(k)}
              onToggleSelect={() => toggleSkill(k)}
              isEditing={editingSkill === k}
              editingValue={editingSkillValue}
              onEditingValueChange={setEditingSkillValue}
              onStartEdit={() => startEditSkill(k)}
              onSave={() => saveSkill(k)}
              onCancelEdit={() => setEditingSkill(null)}
              onRemove={() => removeSkill(k)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add new row */}
      <div
        style={{
          border: "1px dashed #94a3b8",
          borderRadius: 6,
          padding: 10,
          marginTop: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
          Add New Row
        </div>
        <input
          value={newSkillKey}
          onChange={(e) => setNewSkillKey(e.target.value)}
          placeholder="Category (e.g. Cloud Platforms)"
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            fontSize: 13,
            marginBottom: 6,
            boxSizing: "border-box",
          }}
        />
        <input
          value={newSkillVal}
          onChange={(e) => setNewSkillVal(e.target.value)}
          placeholder="Skills (e.g. AWS, Azure, GCP)"
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #e2e8f0",
            borderRadius: 4,
            fontSize: 13,
            marginBottom: 6,
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={addSkill}
          style={{
            width: "100%",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "7px 0",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Add Row
        </button>
      </div>
    </div>
  );
}

interface SortableSkillCardProps {
  skillKey: string;
  skillValue: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  isEditing: boolean;
  editingValue: string;
  onEditingValueChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onRemove: () => void;
}

function SortableSkillCard({
  skillKey,
  skillValue,
  isSelected,
  onToggleSelect,
  isEditing,
  editingValue,
  onEditingValueChange,
  onSave,
  onStartEdit,
  onCancelEdit,
  onRemove,
}: SortableSkillCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: skillKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    border: `1.5px solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
    borderRadius: 8,
    marginBottom: 8,
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
          borderBottom: "1px solid #e2e8f0",
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

      {/* Body */}
      <div style={{ padding: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
          {skillKey}
        </div>
        {isEditing ? (
          <div>
            <input
              value={editingValue}
              onChange={(e) => onEditingValueChange(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #93c5fd",
                borderRadius: 4,
                fontSize: 13,
                marginBottom: 6,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={onSave}
                style={{
                  flex: 1,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 0",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                style={{
                  flex: 1,
                  background: "#e2e8f0",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px 0",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: "#333", marginBottom: 6 }}>
              {skillValue}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={onStartEdit}
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
                Edit
              </button>
              <button
                onClick={onRemove}
                style={{
                  flex: 1,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 4,
                  padding: "5px 0",
                  fontSize: 12,
                  cursor: "pointer",
                  color: "#dc2626",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
