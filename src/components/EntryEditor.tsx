import InlineText from "./InlineText";
import type { ProjectEntry, WorkEntry } from "../data/resumeData";

type Entry = ProjectEntry | WorkEntry;

interface EntryEditorProps {
  entry: Entry;
  onChange: (updated: Entry) => void;
  onDelete: () => void;
}

export default function EntryEditor({
  entry,
  onChange,
  onDelete,
}: EntryEditorProps) {
  function updateBullet(i: number, v: string) {
    const b = [...entry.bullets];
    b[i] = v;
    onChange({ ...entry, bullets: b });
  }

  function addBullet() {
    onChange({ ...entry, bullets: [...entry.bullets, "New bullet point"] });
  }

  function removeBullet(i: number) {
    onChange({ ...entry, bullets: entry.bullets.filter((_, j) => j !== i) });
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
      {entry.bullets.map((b, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 4,
            marginBottom: 4,
          }}
        >
          <span style={{ color: "#94a3b8", marginTop: 4, fontSize: 14 }}>
            •
          </span>
          <div style={{ flex: 1 }}>
            <InlineText value={b} onChange={(v) => updateBullet(i, v)} />
          </div>
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
      ))}
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
