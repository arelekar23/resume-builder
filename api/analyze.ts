import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const prompt = req.body?.prompt;
    if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "prompt is required" });
    }

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.ANTHROPIC_API_KEY!,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        const text = await response.text();
        if (!response.ok) {
            return res.status(response.status).json({
                error: text,
                upstream_status: response.status,
            });
        }

        const data = JSON.parse(text) as {
            content: { type: string; text: string }[];
        };
        const out = data.content.find((b) => b.type === "text")?.text ?? "";

        return res.status(200).json({ result: out });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
}

export const config = {
    maxDuration: 30,
};