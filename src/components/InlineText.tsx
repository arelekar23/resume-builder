import { useState, useRef, useEffect, type CSSProperties } from "react";

interface InlineTextProps {
  value: string;
  onChange: (v: string) => void;
  bold?: boolean;
  style?: CSSProperties;
  placeholder?: string;
}

export default function InlineText({
  value,
  onChange,
  bold = false,
  style = {},
  placeholder = "click to edit",
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.innerHTML = value || "";
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      ref.current.focus();
    }
  }, [editing]);

  function commit() {
    if (!ref.current) return;
    const html = ref.current.innerHTML
      .replace(/<strong>(.*?)<\/strong>/gi, "<b>$1</b>")
      .replace(
        /<span style="font-weight: ?(bold|700);?">(.*?)<\/span>/gi,
        "<b>$2</b>",
      )
      .replace(/&nbsp;/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .trim();
    setEditing(false);
    onChange(html);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (editing)
    return (
      <div
        style={{
          border: "1.5px solid #2563eb",
          borderRadius: 4,
          padding: "3px 6px",
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
          Select text +{" "}
          <kbd
            style={{
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 11,
            }}
          >
            ⌘B
          </kbd>{" "}
          /{" "}
          <kbd
            style={{
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 11,
            }}
          >
            Ctrl+B
          </kbd>{" "}
          to bold · Enter to save · Esc to cancel
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onBlur={commit}
          style={{
            minHeight: 32,
            outline: "none",
            fontSize: 12,
            fontWeight: bold ? 700 : 400,
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            ...style,
          }}
        />
      </div>
    );

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        cursor: "text",
        borderRadius: 3,
        padding: "1px 3px",
        fontWeight: bold ? 700 : 400,
        display: "block",
        wordBreak: "break-word",
        ...style,
      }}
      dangerouslySetInnerHTML={{
        __html:
          value ||
          `<span style="color:#aaa;font-style:italic">${placeholder}</span>`,
      }}
    />
  );
}
