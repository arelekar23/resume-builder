import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractText, getDocumentProxy } from "unpdf";

import {
    resolveLLM,
    isLLMUsable,
    callAnthropic,
    callOpenAICompatible,
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
    '  "education": [{ "school": string, "degree": string, "details": string, "date": string }],\n' +
    '  "work": [{ "title": string, "date": string, "bullets": string[] }],\n' +
    '  "projects": [{ "title": string, "date": string, "bullets": string[] }],\n' +
    '  "skills": [{ "category": string, "items": string }]\n' +
    "}\n" +
    "Rules:\n" +
    "- profile.full_name: the person's name from the header. location: city/state.\n" +
    "- linkedin_url / github_url: the full URL if present, else empty string.\n" +
    "- education.degree: degree + field + GPA if shown (e.g. 'Master of Science, " +
    "Computer Science, 3.8/4.0'). details: relevant courses/honors, else empty.\n" +
    "- work.title: combine role and company (e.g. 'Software Engineer, Acme'). " +
    "date: the range exactly as written (e.g. 'Jan 2024 - Present').\n" +
    "- projects.title: the project name. date: any date shown, else empty.\n" +
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

        return res.status(200).json({ parsed: data });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
}

export const config = {
    maxDuration: 60,
};
