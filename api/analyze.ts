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
        const response = await fetch(
            `${process.env.CEREBRAS_BASE_URL}/chat/completions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
                },
                body: JSON.stringify({
                    model: process.env.CEREBRAS_MODEL,
                    messages: [{ role: "user", content: prompt }],
                    response_format: { type: "json_object" },
                }),
            }
        );

        const text = await response.text();

        if (!response.ok) {
            return res.status(response.status).json({
                error: text,
                upstream_status: response.status,
            });
        }

        const data = JSON.parse(text) as {
            choices: { message: { content: string } }[];
        };

        return res.status(200).json({ result: data.choices[0].message.content });
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
}

export const config = {
    maxDuration: 30,
};