// Reads api/guidance/*.md once at cold start (Vercel bundles them with the
// function). Edit the .md and redeploy to update.

import { readFileSync } from "fs";
import { join } from "path";

const guidanceDir = join(process.cwd(), "api", "guidance");

function loadFile(filename: string): string {
    try {
        return readFileSync(join(guidanceDir, filename), "utf-8");
    } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
            // Non-fatal before the file is added; tailoring quality drops until then.
            console.warn(
                `[guidance] ${filename} not found in api/guidance/ — using empty placeholder.`,
            );
        } else {
            console.error(`Failed to load ${filename}:`, e);
        }
        return "";
    }
}

export const tailoringPrinciples = loadFile("tailoring-principles.md");
