// Private drafting tags on bullets (e.g. "QA", "iOS"). They only help the user
// pick bullets for a given kind of role — they are never rendered on the resume.
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ec } from "../lib/editorTheme";
import type { Bullet } from "../data/resumeData";
import { TagContext, useBulletTags } from "./bulletTagContext";

const MAX_TAG_LEN = 24;

export function BulletTagProvider({
  bullets,
  children,
}: {
  bullets: Bullet[];
  children: ReactNode;
}) {
  const [focusTag, setFocusTag] = useState<string | null>(null);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bullets)
      for (const t of b.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [bullets]);
  // Drop focus if the focused tag no longer exists anywhere.
  const effectiveFocus =
    focusTag && tagCounts.some(([t]) => t === focusTag) ? focusTag : null;
  return (
    <TagContext.Provider
      value={{ tagCounts, focusTag: effectiveFocus, setFocusTag }}
    >
      {children}
    </TagContext.Provider>
  );
}

// Stable per-tag hue so the same tag always reads as the same color.
function tagHue(tag: string): number {
  let h = 0;
  for (const c of tag.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function chipStyle(tag: string, active: boolean) {
  const color = `hsl(${tagHue(tag)} 65% 45%)`;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10,
    lineHeight: "14px",
    padding: "0 6px",
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${color} ${active ? 90 : 45}%, transparent)`,
    background: `color-mix(in srgb, ${color} ${active ? 30 : 12}%, transparent)`,
    color: ec.fg,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  };
}

export function TagChip({
  tag,
  count,
  onRemove,
}: {
  tag: string;
  count?: number;
  onRemove?: () => void;
}) {
  const { focusTag, setFocusTag } = useBulletTags();
  const active = focusTag === tag;
  return (
    <span
      role="button"
      tabIndex={0}
      title={active ? "Clear highlight" : `Highlight bullets tagged ${tag}`}
      onClick={() => setFocusTag(active ? null : tag)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFocusTag(active ? null : tag);
        }
      }}
      style={chipStyle(tag, active)}
    >
      {tag}
      {count !== undefined && <span style={{ color: ec.faint }}>{count}</span>}
      {onRemove && (
        <span
          role="button"
          aria-label={`Remove tag ${tag}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{ color: ec.faint, fontSize: 11, marginLeft: 1 }}
        >
          ×
        </span>
      )}
    </span>
  );
}

// Chips + "+ tag" input shown under a bullet.
export function BulletTagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const { tagCounts } = useBulletTags();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useMemo(() => `bullet-tags-${crypto.randomUUID()}`, []);

  function commit(raw: string) {
    const next = [...tags];
    for (const part of raw.split(",")) {
      const t = part.trim().slice(0, MAX_TAG_LEN);
      if (!t) continue;
      if (next.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
      // Reuse the existing spelling so "ios" joins "iOS".
      const existing = tagCounts.find(
        ([x]) => x.toLowerCase() === t.toLowerCase(),
      );
      next.push(existing ? existing[0] : t);
    }
    if (next.length !== tags.length) onChange(next);
    setDraft("");
  }

  const suggestions = tagCounts
    .map(([t]) => t)
    .filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <div
      className={
        tags.length === 0 && !adding
          ? "opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          : undefined
      }
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 2,
        alignItems: "center",
      }}
    >
      {tags.map((t) => (
        <TagChip
          key={t}
          tag={t}
          onRemove={() => onChange(tags.filter((x) => x !== t))}
        />
      ))}
      {adding ? (
        <>
          <input
            ref={inputRef}
            autoFocus
            list={listId}
            value={draft}
            maxLength={MAX_TAG_LEN * 4}
            placeholder="tag, e.g. QA"
            onChange={(e) => {
              const v = e.target.value;
              if (v.endsWith(",")) commit(v);
              else setDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(draft);
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              } else if (e.key === "Backspace" && draft === "" && tags.length) {
                onChange(tags.slice(0, -1));
              }
            }}
            onBlur={() => {
              commit(draft);
              setAdding(false);
            }}
            style={{
              fontSize: 10,
              lineHeight: "14px",
              width: 90,
              padding: "0 6px",
              borderRadius: 999,
              border: `1px solid ${ec.border}`,
              background: ec.bg,
              color: ec.fg,
              outline: "none",
            }}
          />
          <datalist id={listId}>
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Add a private tag (not shown on the resume)"
          style={{
            fontSize: 10,
            lineHeight: "14px",
            padding: "0 6px",
            borderRadius: 999,
            border: `1px dashed ${ec.border}`,
            background: "transparent",
            color: ec.faint,
            cursor: "pointer",
          }}
        >
          + tag
        </button>
      )}
    </div>
  );
}

// Top-of-tab legend: every tag with its count; click one to highlight its
// bullets across all entries.
export function TagFilterBar() {
  const { tagCounts, focusTag, setFocusTag } = useBulletTags();
  if (tagCounts.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        alignItems: "center",
        padding: "6px 8px",
        marginBottom: 8,
        border: `1px solid ${ec.border}`,
        borderRadius: 6,
        background: ec.card,
        fontSize: 11,
      }}
    >
      <span style={{ color: ec.faint, marginRight: 2 }}>Highlight tag:</span>
      {tagCounts.map(([t, n]) => (
        <TagChip key={t} tag={t} count={n} />
      ))}
      {focusTag && (
        <button
          type="button"
          onClick={() => setFocusTag(null)}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            background: "none",
            border: "none",
            color: ec.primary,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
