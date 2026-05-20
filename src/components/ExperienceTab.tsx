import EntryEditor from "./EntryEditor";
import type { WorkEntry } from "../data/resumeData";

interface ExperienceTabProps {
  work: WorkEntry[];
  updateWork: (id: string, updated: WorkEntry) => void;
  deleteWork: (id: string) => void;
  addWork: () => void;
  excludedBullets: Set<string>;
  toggleBulletExcluded: (id: string) => void;
}

export default function ExperienceTab({
  work,
  updateWork,
  deleteWork,
  addWork,
  excludedBullets,
  toggleBulletExcluded,
}: ExperienceTabProps) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
        Click any text to edit inline. All experience is always included.
      </div>
      {work.map((j) => (
        <EntryEditor
          key={j.id}
          entry={j}
          onChange={(updated) => updateWork(j.id, updated as WorkEntry)}
          onDelete={() => deleteWork(j.id)}
          excludedBullets={excludedBullets}
          toggleBulletExcluded={toggleBulletExcluded}
        />
      ))}
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
