import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

import { getUserId } from "./keyVault.js";

// Account deletion. Deletes the profile row (cascades to all user-owned data
// incl. the encrypted LLM key), then the auth user itself.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "DELETE") {
        res.setHeader("Allow", "DELETE");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const userId = await getUserId(req.headers.authorization);
        if (!userId) {
            return res.status(401).json({ error: "Sign in to delete your account." });
        }

        const url = process.env.VITE_SUPABASE_URL;
        const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceRole) {
            return res.status(500).json({ error: "Server misconfigured for account deletion." });
        }

        const admin = createClient(url, serviceRole, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        // Delete app data first (cascades from profiles), then the auth user.
        const { error: profileErr } =await admin.from("profiles").delete().eq("id", userId);
        if (profileErr) throw new Error(profileErr.message);

        const { error: authErr } = await admin.auth.admin.deleteUser(userId);
        if (authErr) throw new Error(authErr.message);

        return res.status(204).end();
    } catch (err) {
        return res.status(500).json({ error: (err as Error).message });
    }
}
