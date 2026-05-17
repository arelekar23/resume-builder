import { useState } from "react";
import type { ProjectEntry, SkillsMap } from "../data/resumeData";

export interface AnalysisResult {
  recommended_projects: string[];
  reasoning: Record<string, string>;
  skills_to_add: string[];
  skills_to_remove: string[];
  summary: string;
}

interface JDAnalysisTabProps {
  projects: ProjectEntry[];
  skills: SkillsMap;
  setSelectedProjects: (ids: string[]) => void;
}

function buildPrompt(
  jd: string,
  projects: ProjectEntry[],
  skills: SkillsMap,
): string {
  const projectLines = projects
    .map((p) => `- ${p.id}: ${p.title}\n  Bullets: ${p.bullets.join(" | ")}`)
    .join("\n");

  const skillLines = Object.entries(skills)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return `You are a resume advisor. Given this job description and list of projects, recommend the best 2-3 projects to include on the resume and explain why briefly. Also suggest any skills to add or remove.

JOB DESCRIPTION:
${jd}

AVAILABLE PROJECTS:
${projectLines}

CURRENT SKILLS:
${skillLines}

Respond in JSON only, no markdown fences, no preamble. Use exactly this shape:
{"recommended_projects":["id1","id2"],"reasoning":{"id1":"reason"},"skills_to_add":["s1"],"skills_to_remove":["s2"],"summary":"one sentence"}`;
}

export default function JDAnalysisTab({
  projects,
  skills,
  setSelectedProjects,
}: JDAnalysisTabProps) {
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<AnalysisResult | null>(
    null,
  );
  const [error, setError] = useState("");

  async function analyzeJD() {
    const text = jdText.trim();
    if (!text) {
      setError("Please paste a job description first.");
      return;
    }
    setError("");
    setLoading(true);
    setRecommendations(null);

    try {
      const prompt = buildPrompt(text, projects, skills);

      const res = await fetch(`/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);

      const data = await res.json();

      // Backend returns { result: string } where result is JSON from Ollama
      const parsed: AnalysisResult =
        typeof data.result === "string" ? JSON.parse(data.result) : data.result;

      setRecommendations(parsed);
    } catch (e) {
      console.error(e);
      setError("Failed to analyze JD. Please try again.");
    }
    setLoading(false);
  }

  function applyRecommendations() {
    if (!recommendations) return;
    setSelectedProjects(recommendations.recommended_projects);
  }

  return (
    <div>
      <label
        style={{
          fontSize: 13,
          fontWeight: 600,
          display: "block",
          marginBottom: 4,
        }}
      >
        Paste Job Description
      </label>
      <textarea
        value={jdText}
        onChange={(e) => setJdText(e.target.value)}
        placeholder="Paste the full job description here..."
        style={{
          width: "100%",
          height: 150,
          padding: 10,
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          fontSize: 13,
          resize: "vertical",
          marginBottom: 10,
        }}
      />
      {error && (
        <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <button
        onClick={analyzeJD}
        disabled={loading}
        style={{
          width: "100%",
          background: loading ? "#94a3b8" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "10px 0",
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: 14,
          marginBottom: 14,
        }}
      >
        {loading ? "Analyzing..." : "Analyze with AI"}
      </button>

      {recommendations && (
        <div>
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 6,
              padding: 10,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            <b>Overall fit:</b> {recommendations.summary}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            Recommended Projects
          </div>
          {recommendations.recommended_projects.map((id) => {
            const p = projects.find((x) => x.id === id);
            return p ? (
              <div
                key={id}
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div style={{ color: "#555", marginTop: 2 }}>
                  {recommendations.reasoning[id]}
                </div>
              </div>
            ) : null;
          })}
          {recommendations.skills_to_add?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                Skills to Add
              </div>
              <div style={{ fontSize: 13, color: "#16a34a" }}>
                {recommendations.skills_to_add.join(", ")}
              </div>
            </div>
          )}
          {recommendations.skills_to_remove?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                Skills to Remove
              </div>
              <div style={{ fontSize: 13, color: "#dc2626" }}>
                {recommendations.skills_to_remove.join(", ")}
              </div>
            </div>
          )}
          <button
            onClick={applyRecommendations}
            style={{
              width: "100%",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 0",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Apply Recommended Projects
          </button>
        </div>
      )}
    </div>
  );
}
