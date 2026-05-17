import { useState, type Dispatch, type SetStateAction } from "react";
import type { SkillsMap } from "../data/resumeData";

interface SkillsTabProps {
  skills: SkillsMap;
  setSkills: Dispatch<SetStateAction<SkillsMap>>;
}

export default function SkillsTab({ skills, setSkills }: SkillsTabProps) {
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editingSkillValue, setEditingSkillValue] = useState("");
  const [newSkillKey, setNewSkillKey] = useState("");
  const [newSkillVal, setNewSkillVal] = useState("");

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
        Edit, add or remove skill rows.
      </div>
      {Object.entries(skills).map(([k, v]) => (
        <div
          key={k}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            {k}
          </div>
          {editingSkill === k ? (
            <div>
              <input
                value={editingSkillValue}
                onChange={(e) => setEditingSkillValue(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #93c5fd",
                  borderRadius: 4,
                  fontSize: 13,
                  marginBottom: 6,
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => saveSkill(k)}
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
                  onClick={() => setEditingSkill(null)}
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
                {v}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => startEditSkill(k)}
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
                  onClick={() => removeSkill(k)}
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
      ))}
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
