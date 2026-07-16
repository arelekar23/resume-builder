import type { VercelRequest, VercelResponse } from "@vercel/node";

import {
    getUserId,
    saveUserKey,
    getUserKeyStatus,
    deleteUserKey,
} from "./keyVault";

// BYO-key management. POST encrypts the raw key server-side; it's never
// returned. GET reports non-secret status only. DELETE revokes the stored key.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const userId = await getUserId(req.headers.authorization);
    if (!userId) {
        return res.status(401).json({ error: "Sign in to manage your API key." });
    }

    try {
        if (req.method === "GET") {
            return res.status(200).json(await getUserKeyStatus(userId));
        }

        if (req.method === "POST") {
            const provider = String(req.body?.provider ?? "").trim().toLowerCase();
            const apiKey = String(req.body?.apiKey ?? "").trim();
            const model = String(req.body?.model ?? "").trim();
            const baseUrlRaw = req.body?.baseUrl;
            const baseUrl =
                typeof baseUrlRaw === "string" && baseUrlRaw.trim()
                    ? baseUrlRaw.trim()
                    : undefined;

            if (provider !== "anthropic" && provider !== "openai") {
                return res.status(400).json({ error: "provider must be 'anthropic' or 'openai'." });
            }
            if (!apiKey) return res.status(400).json({ error: "apiKey is required." });
            if (!model) return res.status(400).json({ error: "model is required." });
            if (provider === "openai" && !baseUrl) {
                return res
                    .status(400)
                    .json({ error: "baseUrl is required for OpenAI-compatible providers." });
            }

            await saveUserKey(userId, { provider, apiKey, model, baseUrl });
            return res.status(204).end();
        }

        if (req.method === "DELETE") {
            await deleteUserKey(userId);
            return res.status(204).end();
        }

        res.setHeader("Allow", "GET, POST, DELETE");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        // Never echo the request body here — it may contain the raw key.
        return res.status(500).json({ error: (err as Error).message });
    }
}
