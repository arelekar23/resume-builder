import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractText, getDocumentProxy } from "unpdf";

import {
    resolveLLM,
    isLLMUsable,
    callAnthropic,
    callOpenAICompatible,
    setRequestDeadline,
} from "./tailoring-graph.js";
import { getUserId, loadUserKey } from "./keyVault.js";

// Extracts an uploaded resume PDF into the master-resume schema. Uses unpdf for
// text extraction (serverless-friendly, no worker setup); the client writes the
// result. Provider-agnostic — uses whatever LLM the user configured.

export interface ParsedResume {
    profile: {
        full_name: string;
        email: string;
        phone: string;
        location: string;
        linkedin_url: string;
        github_url: string;
    };
    education: { school: string; degree: string; details: string; date: string }[];
    work: { title: string; date: string; bullets: string[] }[];
    projects: { title: string; date: string; bullets: string[] }[];
    skills: { category: string; items: string }[];
    summary: string;
}

// One bullet (or the summary) checked against the text actually extracted from
// the PDF. "altered" means the words are mostly the candidate's but the
// sentence was rewritten; "absent" means it isn't in the PDF at all.
export type Verdict = "verbatim" | "altered" | "absent";

export interface ContentCheck {
    section: "work" | "projects" | "summary";
    entry: string;
    entryIndex: number;
    bulletIndex: number;
    text: string;
    verdict: Verdict;
}

export interface ParseVerification {
    checked: number;
    flagged: ContentCheck[];
}

// Fold away everything PDF extraction legitimately changes — ligatures, smart
// quotes, dashes, soft hyphens, bullet glyphs, runs of whitespace — so a real
// copy still compares equal and only genuine rewrites stand out.
function normalize(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[‘’‛′]/g, "'")
        .replace(/[“”″]/g, '"')
        .replace(/[‐-―−]/g, "-")
        .replace(/­/g, "")
        .replace(/[•▪◦·⁃]/g, " ")
        .replace(/[^\p{L}\p{N}\s'"%$.,/+#&()-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

const SHINGLE = 5;

// Verbatim text survives as contiguous word runs; a rewrite reuses the same
// vocabulary but breaks nearly every run. Word-level overlap alone can't tell
// those apart ("cut latency 40%" vs "reduced latency by 40%" share every
// meaningful word), so compare consecutive 5-word shingles instead. A
// hyphenation artifact costs a couple of shingles; a reworded sentence costs
// almost all of them.
function verdictFor(candidate: string, haystack: string): Verdict {
    const text = normalize(candidate);
    if (!text) return "absent";
    if (haystack.includes(text)) return "verbatim";

    const words = text.split(" ");
    if (words.length < SHINGLE) {
        // Too short to shingle: a substring miss is all the signal there is.
        return "absent";
    }
    let found = 0;
    const total = words.length - SHINGLE + 1;
    for (let i = 0; i < total; i++) {
        if (haystack.includes(words.slice(i, i + SHINGLE).join(" "))) found++;
    }
    const ratio = found / total;
    if (ratio === 1) return "verbatim";
    return ratio >= 0.6 ? "altered" : "absent";
}

// Check every bullet the model emitted against the PDF's own text. Titles and
// education rows are deliberately skipped: the prompt tells the model to
// COMPOSE those (role + company, degree + field + GPA), so they are expected
// not to appear verbatim and flagging them would be noise.
export function verifyParsed(parsed: ParsedResume, resumeText: string): ParseVerification {
    const haystack = normalize(resumeText);
    const flagged: ContentCheck[] = [];
    let checked = 0;

    const sections = [
        { name: "work" as const, entries: parsed.work ?? [] },
        { name: "projects" as const, entries: parsed.projects ?? [] },
    ];
    for (const { name, entries } of sections) {
        entries.forEach((entry, entryIndex) => {
            (entry.bullets ?? []).forEach((text, bulletIndex) => {
                if (!text || !text.trim()) return;
                checked++;
                const verdict = verdictFor(text, haystack);
                if (verdict !== "verbatim") {
                    flagged.push({
                        section: name,
                        entry: entry.title ?? "",
                        entryIndex,
                        bulletIndex,
                        text,
                        verdict,
                    });
                }
            });
        });
    }

    // The summary is prose the model is told to copy verbatim or leave empty,
    // so an invented one is the same failure as an invented bullet.
    if (parsed.summary && parsed.summary.trim()) {
        checked++;
        const verdict = verdictFor(parsed.summary, haystack);
        if (verdict !== "verbatim") {
            flagged.push({
                section: "summary",
                entry: "Summary",
                entryIndex: 0,
                bulletIndex: 0,
                text: parsed.summary,
                verdict,
            });
        }
    }

    return { checked, flagged };
}

const SYSTEM =
    "You extract structured data from resume text. Return ONLY the requested " +
    "JSON. Copy content VERBATIM from the resume; never invent, embellish, or " +
    "add skills/experience/metrics that are not present. Use empty strings and " +
    "empty arrays for anything not found. Never use em dashes.";

const INSTRUCTION =
    "Extract the resume text below into JSON with EXACTLY this shape:\n" +
    "{\n" +
    '  "profile": { "full_name": string, "email": string, "phone": string, "location": string, "linkedin_url": string, "github_url": string },\n' +
    '  "summary": string,\n' +
    '  "education": [{ "school": string, "degree": string, "details": string, "date": string }],\n' +
    '  "work": [{ "title": string, "date": string, "bullets": string[] }],\n' +
    '  "projects": [{ "title": string, "date": string, "bullets": string[] }],\n' +
    '  "skills": [{ "category": string, "items": string }]\n' +
    "}\n" +
    "Rules:\n" +
    "- summary: the professional summary / objective / profile section VERBATIM if " +
    "the resume has one (the prose blurb near the top, not the skills list); else " +
    'empty string "". Never fabricate one.\n' +
    "- profile.full_name: the person's name from the header. location: city/state.\n" +
    "- linkedin_url / github_url: the full URL if present, else empty string.\n" +
    "- education.degree: degree + field + GPA if shown (e.g. 'Master of Science, " +
    "Computer Science, 3.8/4.0'). details: relevant courses/honors, else empty.\n" +
    "- work.title: combine role and company (e.g. 'Software Engineer, Acme'). " +
    "date: the range exactly as written (e.g. 'Jan 2024 - Present').\n" +
    "- projects.title: the project name EXACTLY as written, INCLUDING any tech " +
    "stack / tools shown in parentheses or after the name (e.g. 'AI Resume " +
    "Builder (React, TypeScript, LangGraph.js, Supabase)'). NEVER drop the " +
    "parenthetical technologies. date: any date shown, else empty.\n" +
    "- bullets: each bullet as a separate string, verbatim, WITHOUT the leading " +
    "bullet character. Preserve wording.\n" +
    "- skills: group by the resume's own categories (e.g. 'Languages', " +
    "'Frameworks'). items is ONE comma-separated string (e.g. 'Python, Go, " +
    "TypeScript'). If skills are listed without categories, use a single row " +
    "with category 'Skills'.\n" +
    "Return ONLY the JSON object, no prose.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Bounds the shared call layer's 429 backoff; text extraction eats into the
    // same 60s, so leave more headroom here than the graph does.
    setRequestDeadline(Date.now() + 45_000);

    const fileBase64 = req.body?.fileBase64 as string | undefined;
    const mediaType = (req.body?.mediaType as string | undefined) ?? "application/pdf";
    if (!fileBase64 || typeof fileBase64 !== "string") {
        return res.status(400).json({ error: "fileBase64 is required" });
    }
    if (mediaType !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF uploads are supported." });
    }

    const authHeader = req.headers.authorization ?? "";
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing Authorization bearer token" });
    }

    try {
        const userId = await getUserId(authHeader);
        if (!userId) {
            return res.status(401).json({ error: "Invalid or expired session." });
        }
        // Key comes from the vault via the verified user id, never the request body.
        const llm = resolveLLM((await loadUserKey(userId)) ?? undefined);
        if (!isLLMUsable(llm)) {
            return res.status(400).json({
                error: "Configure your LLM (provider, API key, model) in API settings to import a resume.",
            });
        }
        const buf = Buffer.from(fileBase64, "base64");
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await extractText(pdf, { mergePages: true });
        const resumeText = (Array.isArray(text) ? text.join("\n") : text).trim();
        if (!resumeText) {
            return res.status(422).json({
                error: "Could not read any text from that PDF. If it's a scanned image, use a text-based PDF.",
            });
        }

        const userPrompt = `${INSTRUCTION}\n\n# Resume text\n\n${resumeText}`;
        const { data } = llm.isAnthropic
            ? await callAnthropic<ParsedResume>(
                  "parse-resume",
                  llm.model,
                  [SYSTEM],
                  userPrompt,
                  8192,
                  llm.apiKey,
              )
            : await callOpenAICompatible<ParsedResume>(
                  "parse-resume",
                  llm.model,
                  [SYSTEM],
                  userPrompt,
                  8192,
                  llm,
              );

        // Checked here, not on the client: this is the only place that still
        // holds the PDF's own text to compare against.
        return res.status(200).json({
            parsed: data,
            verification: verifyParsed(data, resumeText),
        });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
}

export const config = {
    maxDuration: 60,
};
