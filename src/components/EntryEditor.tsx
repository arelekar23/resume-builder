import InlineText from "./InlineText";
import type { ProjectEntry, WorkEntry } from "../data/resumeData";

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
      {entry.bullets.map((b, i) => {
        const canRestore = b.original_text !== "" && b.text !== b.original_text;
        const isExcluded = excludedBullets.has(b.id);
        return (
          <div
            key={b.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 4,
              marginBottom: 4,
              opacity: isExcluded ? 0.4 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={!isExcluded}
              onChange={() => toggleBulletExcluded(b.id)}
              title={
                isExcluded
                  ? "Include in this resume"
                  : "Exclude from this resume"
              }
              style={{ marginTop: 5, cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ color: "#94a3b8", marginTop: 4, fontSize: 14 }}>
              •
            </span>
            <div style={{ flex: 1 }}>
              <InlineText
                value={b.text}
                onChange={(v) => updateBullet(i, v)}
                placeholder="Type bullet here..."
              />
            </div>
            {canRestore && (
              <button
                onClick={() => restoreBullet(i)}
                title={`Restore original: "${b.original_text}"`}
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
              onClick={() => removeBullet(i)}
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
      })}
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
