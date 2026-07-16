import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

import { tailoringPrinciples } from "./guidance-files.js";

import {
    runTailoringGraph,
    runTailoringGraphStreaming,
    runScreenPhase,
    runTailorPhase,
    runCreatePhase,
    runAtsPhase,
    runRecruiterReview,
    runHiringManagerReview,
    resolveLLM,
    isLLMUsable,
    type MasterResume,
    type Selection,
    type ResumeView,
} from "./tailoring-graph.js";
import { getUserId, loadUserKey } from "./keyVault.js";

// Master is never mutated by tailoring: returns a plan, doesn't write to the DB.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const jdText = req.body?.jdText;
    const profileId = req.body?.profileId;

    if (!profileId || typeof profileId !== "string") {
        return res.status(400).json({ error: "profileId is required" });
    }
    if (!jdText || typeof jdText !== "string") {
        return res.status(400).json({ error: "jdText is required" });
    }

    try {
        // Forward the caller's session token so RLS applies server-side.
        const authHeader = req.headers.authorization ?? "";
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Missing Authorization bearer token" });
        }
        const userId = await getUserId(authHeader);
        if (!userId) {
            return res.status(401).json({ error: "Invalid or expired session." });
        }
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL!,
            process.env.VITE_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: authHeader } } },
        );

        const guidance = { tailoringPrinciples };
        // Key comes from the vault via the verified user id, never the request body.
        const llm = resolveLLM((await loadUserKey(userId)) ?? undefined);
        if (!isLLMUsable(llm)) {
            return res.status(400).json({
                error: "Configure your LLM (provider, API key, model) in API settings first.",
            });
        }
        const phase = req.body?.phase as string | undefined;

        // Reviews / ATS re-check run on the client-provided view, no DB read.
        if (phase === "ats" || phase === "recruiterReview" || phase === "hiringManagerReview") {
            const resume = req.body?.resume as ResumeView | undefined;
            if (!resume) {
                return res.status(400).json({ error: "resume is required for this phase" });
            }
            const companyName = req.body?.companyName as string | undefined;
            if (phase === "ats") {
                return res.status(200).json(await runAtsPhase({ jdText, resume, guidance, llm }));
            }
            if (phase === "recruiterReview") {
                return res
                    .status(200)
                    .json(await runRecruiterReview({ jdText, resume, companyName, guidance, llm }));
            }
            return res
                .status(200)
                .json(await runHiringManagerReview({ jdText, resume, companyName, guidance, llm }));
        }

        const [
            { data: projectRows, error: projectsError },
            { data: projectBulletRows, error: projectBulletsError },
            { data: workRows, error: workError },
            { data: workBulletRows, error: workBulletsError },
            { data: skillRows, error: skillsError },
            { data: eduRows },
        ] = await Promise.all([
            supabase
                .from("projects")
                .select("id, title, date, position, is_selected")
                .eq("profile_id", profileId)
                .order("position"),
            supabase
                .from("project_bullets")
                .select("id, project_id, original_text, text, position")
                .order("position"),
            supabase
                .from("work")
                .select("id, title, date, position")
                .eq("profile_id", profileId)
                .order("position"),
            supabase
                .from("work_bullets")
                .select("id, work_id, original_text, text, position")
                .order("position"),
            supabase
                .from("skills")
                .select("category, items, position, is_selected")
                .eq("profile_id", profileId)
                .order("position"),
            supabase
                .from("education")
                .select("school, degree, details, date, position")
                .eq("profile_id", profileId)
                .order("position"),
        ]);

        const dbError =
            projectsError || projectBulletsError || workError || workBulletsError || skillsError;
        if (dbError) {
            return res.status(500).json({
                error: "Failed to load resume data",
                detail: dbError.message,
            });
        }

        // Self-heal to original_text only if a bullet's text is blank.
        const masterText = (b: { original_text?: string; text?: string }): string =>
            b.text && b.text.trim() ? b.text : (b.original_text ?? "");

        const masterResume: MasterResume = {
            work: (workRows ?? []).map((w) => ({
                id: w.id,
                title: w.title,
                date: w.date,
                position: w.position,
                bullets: (workBulletRows ?? [])
                    .filter((b) => b.work_id === w.id)
                    .sort((a, b) => a.position - b.position)
                    .map((b) => ({ id: b.id, text: masterText(b) })),
            })),
            projects: (projectRows ?? []).map((p) => ({
                id: p.id,
                title: p.title,
                date: p.date,
                position: p.position,
                is_selected: p.is_selected,
                bullets: (projectBulletRows ?? [])
                    .filter((b) => b.project_id === p.id)
                    .sort((a, b) => a.position - b.position)
                    .map((b) => ({ id: b.id, text: masterText(b) })),
            })),
            skills: (skillRows ?? []).map((s) => ({
                category: s.category,
                items: s.items,
                position: s.position,
                is_selected: s.is_selected,
            })),
            education: (eduRows ?? []).map((e) => ({
                school: e.school,
                degree: e.details ? `${e.degree}, ${e.details}` : e.degree,
                date: e.date,
            })),
        };

        if (phase === "create") {
            const result = await runCreatePhase({ jdText, masterResume, guidance, llm });
            return res.status(200).json(result);
        }
        if (phase === "screen") {
            const result = await runScreenPhase({ jdText, masterResume, guidance, llm });
            return res.status(200).json(result);
        }
        if (phase === "tailor") {
            const selection = req.body?.selection as Selection | undefined;
            if (!selection) {
                return res.status(400).json({ error: "selection is required for the tailor phase" });
            }
            const result = await runTailorPhase({ jdText, masterResume, guidance, selection, llm });
            return res.status(200).json(result);
        }

        if (req.body?.stream === true) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("Connection", "keep-alive");
            (res as { flushHeaders?: () => void }).flushHeaders?.();
            const send = (event: string, data: unknown) =>
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            try {
                const { plan, usage } = await runTailoringGraphStreaming(
                    { jdText, masterResume, guidance, llm },
                    (node) => send("progress", { node }),
                );
                send("result", { plan, usage });
            } catch (e) {
                send("error", { error: (e as Error).message });
            }
            res.end();
            return;
        }

        const { plan, usage } = await runTailoringGraph({ jdText, masterResume, guidance, llm });
        return res.status(200).json({ plan, usage });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
}

export const config = {
    maxDuration: 60,
};
