// LangGraph 6-node tailoring workflow: Filter -> Recruiter -> HiringManager ->
// ATS -> ContentWriter -> Editor, with Editor looping back on issues.
// The guidance + master snapshot are a shared system prefix so agents 2..6 hit
// the anthropic prompt cache within the 5-min window (near single-call cost).

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

export interface Guidance {
    tailoringPrinciples: string;
}

const MAX_INCLUDED_BULLETS = 14;

export interface MasterBullet {
    id: string;
    text: string; // canonical original_text
}
export interface MasterProject {
    id: string;
    title: string;
    date: string;
    position: number;
    is_selected: boolean;
    bullets: MasterBullet[];
}
export interface MasterWork {
    id: string;
    title: string;
    date: string;
    position: number;
    bullets: MasterBullet[];
}
export interface MasterSkill {
    category: string;
    items: string; // comma-separated in DB
    position: number;
    is_selected: boolean;
}
export interface MasterResume {
    work: MasterWork[];
    projects: MasterProject[];
    skills: MasterSkill[];
    education?: { school: string; degree: string; date: string }[];
}

// plan returned to the frontend / applied to the DB
export interface TailoringPlan {
    filterResult: { flagged: boolean; reason?: string };
    fitAssessment?: {
        firstImpression: string;
        verdict: "apply" | "stretch-apply" | "skip";
        workingFor: string[];
        gaps: string[];
        roleType: string;
        companyName?: string;
    };
    companyName?: string;
    hiringManagerRationale?: string[];
    atsKeywords?: string[];
    skills?: { category: string; items: string[]; position: number; is_selected: boolean }[];
    projects?: {
        id: string;
        is_selected: boolean;
        position: number;
        bullets: { id: string; text: string; is_excluded: boolean; position: number }[];
    }[];
    work?: {
        id: string;
        bullets: { id: string; text: string; is_excluded: boolean; position: number }[];
    }[];
    notes?: string[];
    editorNotes?: string[];
    iterations?: number;
    score?: number; // 0-100 fit of the tailored resume to the JD
    scoreBreakdown?: string[];
    // 0-100 fit of the untailored master (the "before" number)
    baselineScore?: number;
    baselineScoreBreakdown?: string[];
    // JD-tailored professional summary (empty when the resume has no summary section)
    summary?: string;
}

export interface UsageEntry {
    agent: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

// "anthropic" uses the native Messages API with prompt caching; any other
// provider uses an OpenAI-compatible endpoint.
export interface LLMConfig {
    provider?: string; // "anthropic" | "cerebras" | "openai" | ...
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}

export interface ResolvedLLM {
    provider: string;
    isAnthropic: boolean;
    apiKey?: string;
    model: string;
    baseUrl: string;
}

// LLM is entirely user-provided; no server-side default or env fallback.
export function resolveLLM(cfg?: LLMConfig): ResolvedLLM {
    const provider = (cfg?.provider || "").toLowerCase();
    const isAnthropic = provider === "anthropic";
    const apiKey = cfg?.apiKey;
    const baseUrl = (cfg?.baseUrl || "https://api.cerebras.ai/v1").replace(/\/+$/, "");
    const model = cfg?.model || "";
    return { provider, isAnthropic, apiKey, model, baseUrl };
}

export function isLLMUsable(llm: ResolvedLLM): boolean {
    return !!llm.apiKey && !!llm.model;
}

function modelFor(_agent: string, llm: ResolvedLLM): string {
    return llm.model;
}

const MAX_EDITOR_ITERATIONS = 3;
const SCORE_THRESHOLD = 80;

// Shared context prefix, identical across every agent in a run. Per-agent
// instructions stay in the user message so this prefix stays cacheable.
const PREAMBLE =
    "You are one agent in a multi-agent resume-tailoring system for the " +
    "candidate's job search. Your specific role and task are in the user " +
    "message. The master resume is your STARTING POINT, not a hard limit. To " +
    "maximize JD fit and ATS score you SHOULD add relevant skills, tools, " +
    "technologies, and keywords drawn from the job description even when they " +
    "are not in the master, weaving them naturally into the existing " +
    "experience so the resume reads coherently. Never use em dashes.";

const GUIDANCE_TITLES: Record<keyof Guidance, string> = {
    tailoringPrinciples: "tailoring-principles.md",
};

function guidanceBlock(key: keyof Guidance, guidance: Guidance): string {
    return `# ${GUIDANCE_TITLES[key]}\n\n${guidance[key]}`;
}

function masterBlock(masterResume: MasterResume): string {
    return (
        "# master-resume (live snapshot; refer to projects and bullets by their " +
        "short `ref` tokens, e.g. p1, p1b2, w2b1 — never by full text)\n\n```json\n" +
        JSON.stringify(labeledMaster(masterResume), null, 2) +
        "\n```"
    );
}

// Agents pick projects/bullets by short tokens (p1, p1b2, w2b1) instead of
// UUIDs, which weaker models mangle. Tokens map to UUIDs by master order.
function refToId(master: MasterResume): Map<string, string> {
    const m = new Map<string, string>();
    master.projects.forEach((p, i) => {
        m.set(`p${i + 1}`, p.id);
        p.bullets.forEach((b, j) => m.set(`p${i + 1}b${j + 1}`, b.id));
    });
    master.work.forEach((w, i) => {
        m.set(`w${i + 1}`, w.id);
        w.bullets.forEach((b, j) => m.set(`w${i + 1}b${j + 1}`, b.id));
    });
    return m;
}

function idToRef(master: MasterResume): Map<string, string> {
    const out = new Map<string, string>();
    for (const [ref, id] of refToId(master)) out.set(id, ref);
    return out;
}

function allBulletIds(master: MasterResume): Set<string> {
    return new Set([
        ...master.work.flatMap((w) => w.bullets.map((b) => b.id)),
        ...master.projects.flatMap((p) => p.bullets.map((b) => b.id)),
    ]);
}

// Resolve ref tokens or raw UUIDs to UUIDs; drops anything unrecognized.
function resolveIds(
    values: string[] | undefined,
    refMap: Map<string, string>,
    idSet: Set<string>,
): string[] {
    const out: string[] = [];
    for (const v of values ?? []) {
        if (refMap.has(v)) out.push(refMap.get(v)!);
        else if (idSet.has(v)) out.push(v);
    }
    return out;
}

// master as agents see it: UUIDs replaced with short ref tokens
function labeledMaster(master: MasterResume): unknown {
    return {
        work: master.work.map((w, i) => ({
            ref: `w${i + 1}`,
            title: w.title,
            date: w.date,
            bullets: w.bullets.map((b, j) => ({ ref: `w${i + 1}b${j + 1}`, text: b.text })),
        })),
        projects: master.projects.map((p, i) => ({
            ref: `p${i + 1}`,
            title: p.title,
            date: p.date,
            is_selected: p.is_selected,
            bullets: p.bullets.map((b, j) => ({ ref: `p${i + 1}b${j + 1}`, text: b.text })),
        })),
        skills: master.skills,
        education: master.education,
    };
}

// translate a Hiring-Manager selection (ref tokens) to real UUIDs
function translateSelection(
    master: MasterResume,
    sel: Partial<Selection> | undefined,
): Partial<Selection> | undefined {
    if (!sel) return sel;
    const refMap = refToId(master);
    const projIds = new Set(master.projects.map((p) => p.id));
    const bulletIds = allBulletIds(master);
    return {
        selectedProjectIds: resolveIds(sel.selectedProjectIds, refMap, projIds),
        projectOrder: resolveIds(sel.projectOrder, refMap, projIds),
        includedBulletIds: resolveIds(sel.includedBulletIds, refMap, bulletIds),
        skills: sel.skills,
        rationale: sel.rationale,
    };
}

// Content-Writer output (ref -> text) -> tailored text keyed by UUID.
// Tolerates a raw UUID or `id` in place of `ref`.
function tailoredFromBullets(
    master: MasterResume,
    bullets: { ref?: string; id?: string; text: string }[] | undefined,
): Record<string, string> {
    const refMap = refToId(master);
    const idSet = allBulletIds(master);
    const tailored: Record<string, string> = {};
    for (const b of bullets ?? []) {
        const key = b.ref ?? b.id;
        const uuid = key ? refMap.get(key) ?? (idSet.has(key) ? key : undefined) : undefined;
        if (uuid) tailored[uuid] = b.text;
    }
    return tailored;
}

// full shared context (all guidance + master); cached across agents on Anthropic
function systemBlocks(guidance: Guidance, masterResume: MasterResume): string[] {
    return [
        PREAMBLE,
        guidanceBlock("tailoringPrinciples", guidance),
        masterBlock(masterResume),
    ];
}

// Per-agent context for OpenAI-compatible providers (no prompt caching): sending
// all guidance every call blows the tokens-per-minute quota, so each agent gets
// only what it needs.
const AGENT_CONTEXT: Record<
    string,
    { guidance: (keyof Guidance)[]; master: boolean }
> = {
    filter: { guidance: [], master: false },
    recruiter: { guidance: [], master: false },
    hiringmanager: { guidance: ["tailoringPrinciples"], master: true },
    baseline: { guidance: ["tailoringPrinciples"], master: false },
    ats: { guidance: [], master: false },
    contentwriter: { guidance: ["tailoringPrinciples"], master: false },
    editor: { guidance: ["tailoringPrinciples"], master: false },
    recruiterreview: { guidance: [], master: false },
    hiringmanagerreview: { guidance: [], master: false },
};

// resume as the ATS / reviewers see it: only included, selected content
export interface ResumeView {
    projects: { title: string; bullets: string[] }[];
    work: { title: string; bullets: string[] }[];
    skills: { category: string; items: string }[];
    education?: { school: string; degree: string; date: string }[];
}

const EMPTY_MASTER: MasterResume = { work: [], projects: [], skills: [] };

function minimalBlocks(
    agent: string,
    guidance: Guidance,
    masterResume: MasterResume,
): string[] {
    const profile = AGENT_CONTEXT[agent] ?? {
        guidance: ["tailoringPrinciples"] as (keyof Guidance)[],
        master: true,
    };
    const blocks = [
        PREAMBLE,
        ...profile.guidance.map((g) => guidanceBlock(g, guidance)),
    ];
    if (profile.master) blocks.push(masterBlock(masterResume));
    return blocks;
}

// retry 429 and 5xx with backoff, honoring Retry-After; capped to the
// serverless time budget
export async function fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries = 3,
): Promise<Response> {
    let attempt = 0;
    for (; ;) {
        const res = await fetch(url, init);
        if (res.status !== 429 && res.status < 500) return res;
        if (attempt >= maxRetries) return res;
        const ra = Number(res.headers.get("retry-after"));
        const waitMs =
            Number.isFinite(ra) && ra > 0
                ? Math.min(ra * 1000, 15000)
                : Math.min(1000 * 2 ** attempt, 8000);
        attempt++;
        await new Promise((r) => setTimeout(r, waitMs));
    }
}

function extractJsonObject(raw: string): string {
    const s = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) return s.slice(start, end + 1);
    // no closing brace -> likely truncated; let the repair pass balance it
    if (start !== -1) return s.slice(start);
    return s;
}

interface ClaudeResult<T> {
    data: T;
    usage: UsageEntry;
}

// best-effort repair of malformed model JSON: strip trailing commas, and if
// truncated, cut back to the last complete element and close open brackets
function repairJson(input: string): string {
    let s = input.replace(/,\s*([}\]])/g, "$1"); // trailing commas before }/]
    let inStr = false;
    let esc = false;
    const stack: string[] = [];
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === "\\") esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === "{") stack.push("}");
        else if (c === "[") stack.push("]");
        else if (c === "}" || c === "]") stack.pop();
    }
    if (inStr) {
        // truncated inside a string: drop back to the last comma/open bracket
        const cut = Math.max(s.lastIndexOf(","), s.lastIndexOf("["), s.lastIndexOf("{"));
        if (cut !== -1) s = s.slice(0, cut);
        // recompute the open-bracket stack after the cut
        stack.length = 0;
        inStr = false;
        esc = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (inStr) {
                if (esc) esc = false;
                else if (c === "\\") esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') inStr = true;
            else if (c === "{") stack.push("}");
            else if (c === "[") stack.push("]");
            else if (c === "}" || c === "]") stack.pop();
        }
    }
    s = s.replace(/,\s*$/, "");
    while (stack.length) s += stack.pop();
    return s;
}

export function parseAgentJson<T>(agent: string, raw: string): T {
    const cleaned = extractJsonObject(raw);
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        // second chance: repair truncated / trailing-comma JSON
        try {
            return JSON.parse(repairJson(cleaned)) as T;
        } catch {
            throw new Error(`[${agent}] returned invalid JSON: ${raw.slice(0, 500)}`);
        }
    }
}

// one agent call; dispatches to Anthropic (native, cached) or an
// OpenAI-compatible endpoint. throws on HTTP/parse error for the node to surface
async function callAgent<T>(
    agent: string,
    guidance: Guidance,
    masterResume: MasterResume,
    userPrompt: string,
    maxTokens: number,
    llm: ResolvedLLM,
): Promise<ClaudeResult<T>> {
    const model = modelFor(agent, llm);
    return llm.isAnthropic
        ? callAnthropic<T>(
            agent,
            model,
            systemBlocks(guidance, masterResume),
            userPrompt,
            maxTokens,
            llm.apiKey,
        )
        : callOpenAICompatible<T>(
            agent,
            model,
            minimalBlocks(agent, guidance, masterResume),
            userPrompt,
            maxTokens,
            llm,
        );
}

export async function callAnthropic<T>(
    agent: string,
    model: string,
    blocks: string[],
    userPrompt: string,
    maxTokens: number,
    apiKey: string | undefined,
): Promise<ClaudeResult<T>> {
    if (!apiKey) {
        throw new Error(
            `[${agent}] No Anthropic API key. Set one in API settings.`,
        );
    }
    // cache the two most-stable trailing blocks (guidance tail + master) so
    // agents 2..6 reuse the prefix within the 5-min window
    const system = blocks.map((text, i) =>
        i >= blocks.length - 2
            ? { type: "text", text, cache_control: { type: "ephemeral" as const } }
            : { type: "text", text },
    );
    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature: 0, // deterministic across runs on the same JD
            system,
            messages: [{ role: "user", content: userPrompt }],
        }),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`[${agent}] Claude API ${response.status}: ${text.slice(0, 500)}`);
    }
    const body = JSON.parse(text) as {
        content: { type: string; text?: string }[];
        usage?: {
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        };
    };
    const raw = body.content.find((b) => b.type === "text")?.text ?? "";
    return {
        data: parseAgentJson<T>(agent, raw),
        usage: {
            agent,
            model,
            input_tokens: body.usage?.input_tokens ?? 0,
            output_tokens: body.usage?.output_tokens ?? 0,
            cache_creation_input_tokens: body.usage?.cache_creation_input_tokens,
            cache_read_input_tokens: body.usage?.cache_read_input_tokens,
        },
    };
}

// OpenAI-compatible /chat/completions; no prompt caching on this path
export async function callOpenAICompatible<T>(
    agent: string,
    model: string,
    blocks: string[],
    userPrompt: string,
    maxTokens: number,
    llm: ResolvedLLM,
): Promise<ClaudeResult<T>> {
    if (!llm.apiKey) {
        throw new Error(
            `[${agent}] No API key for provider "${llm.provider}". Set one in API settings.`,
        );
    }
    if (!model) {
        throw new Error(
            `[${agent}] No model set for provider "${llm.provider}". Set one in API settings.`,
        );
    }
    const messages = [
        { role: "system", content: blocks.join("\n\n") },
        { role: "user", content: userPrompt },
    ];
    const post = (withResponseFormat: boolean) =>
        fetchWithRetry(`${llm.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${llm.apiKey}`,
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature: 0, // deterministic across runs on the same JD
                messages,
                ...(withResponseFormat
                    ? { response_format: { type: "json_object" } }
                    : {}),
            }),
        });

    // some providers reject response_format; retry once without it
    let response = await post(true);
    let text = await response.text();
    if (!response.ok && /response_format|json/i.test(text)) {
        response = await post(false);
        text = await response.text();
    }
    if (!response.ok) {
        throw new Error(`[${agent}] LLM ${response.status}: ${text.slice(0, 500)}`);
    }
    const body = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    return {
        data: parseAgentJson<T>(agent, raw),
        usage: {
            agent,
            model,
            input_tokens: body.usage?.prompt_tokens ?? 0,
            output_tokens: body.usage?.completion_tokens ?? 0,
        },
    };
}

export interface Selection {
    selectedProjectIds: string[];
    projectOrder: string[]; // selected project ids, most relevant first
    includedBulletIds: string[]; // work + project bullet ids to show
    skills: { category: string; items: string[]; position: number; is_selected: boolean }[];
    rationale: string[];
}

const GraphState = Annotation.Root({
    // inputs (stable across the run)
    jdText: Annotation<string>(),
    masterResume: Annotation<MasterResume>(),
    guidance: Annotation<Guidance>(),
    llm: Annotation<ResolvedLLM>(),
    // when true, the Content Writer also produces a JD-tailored summary
    hasSummary: Annotation<boolean>(),

    // per-agent outputs
    filterResult: Annotation<{ flagged: boolean; reason?: string } | undefined>(),
    fitAssessment: Annotation<TailoringPlan["fitAssessment"] | undefined>(),
    selection: Annotation<Selection | undefined>(),
    keywords: Annotation<string[]>({
        reducer: (_prev, next) => next,
        default: () => [],
    }),
    // tailored bullet text keyed by bullet id (overwrites on rewrite)
    tailoredText: Annotation<Record<string, string>>({
        reducer: (prev, next) => ({ ...prev, ...next }),
        default: () => ({}),
    }),
    // JD-tailored summary text (overwrites on rewrite; "" when not requested)
    tailoredSummary: Annotation<string>({
        reducer: (_prev, next) => next,
        default: () => "",
    }),
    editorFeedback: Annotation<string[]>({
        reducer: (_prev, next) => next,
        default: () => [],
    }),
    editorNotes: Annotation<string[]>({
        reducer: (_prev, next) => next,
        default: () => [],
    }),
    score: Annotation<number | undefined>({
        reducer: (_prev, next) => next,
        default: () => undefined,
    }),
    prevScore: Annotation<number | undefined>({
        reducer: (_prev, next) => next,
        default: () => undefined,
    }),
    scoreBreakdown: Annotation<string[]>({
        reducer: (_prev, next) => next,
        default: () => [],
    }),
    // score of the untailored master content (computed once, before the loop)
    baselineScore: Annotation<number | undefined>({
        reducer: (_prev, next) => next,
        default: () => undefined,
    }),
    baselineScoreBreakdown: Annotation<string[]>({
        reducer: (_prev, next) => next,
        default: () => [],
    }),
    approved: Annotation<boolean>({
        reducer: (_prev, next) => next,
        default: () => false,
    }),
    iterations: Annotation<number>({
        reducer: (_prev, next) => next,
        default: () => 0,
    }),

    // usage accumulates across every node
    usage: Annotation<UsageEntry[]>({
        reducer: (prev, next) => prev.concat(next),
        default: () => [],
    }),
});

type State = typeof GraphState.State;

// turn master + selection + tailored text into the plan's projects/work/skills
// arrays; mirrors exactly what analyze.ts writes
function assembleContent(
    master: MasterResume,
    selection: Selection,
    tailored: Record<string, string>,
): Pick<TailoringPlan, "projects" | "work" | "skills"> {
    const included = new Set(selection.includedBulletIds);
    const orderIndex = new Map(selection.projectOrder.map((id, i) => [id, i]));
    const selectedSet = new Set(selection.selectedProjectIds);

    const projects: NonNullable<TailoringPlan["projects"]> = master.projects.map(
        (p) => {
            const is_selected = selectedSet.has(p.id);
            return {
                id: p.id,
                is_selected,
                position: orderIndex.get(p.id) ?? 999,
                bullets: p.bullets.map((b, i) => ({
                    id: b.id,
                    // || not ?? — empty tailored text must fall back to master
                    text: tailored[b.id] || b.text,
                    is_excluded: !(is_selected && included.has(b.id)),
                    position: i,
                })),
            };
        },
    );

    const work: NonNullable<TailoringPlan["work"]> = master.work.map((w) => ({
        id: w.id,
        bullets: w.bullets.map((b, i) => ({
            id: b.id,
            text: tailored[b.id] ?? b.text,
            is_excluded: !included.has(b.id),
            position: i,
        })),
    }));

    return { projects, work, skills: selection.skills };
}

// validate/repair a Hiring Manager selection: drop hallucinated ids, and on an
// empty selection fall back to a master default so we never get 0 projects/bullets
function ensureValidSelection(
    master: MasterResume,
    sel?: Partial<Selection>,
): Selection {
    const projIds = new Set(master.projects.map((p) => p.id));
    const bulletIds = new Set([
        ...master.work.flatMap((w) => w.bullets.map((b) => b.id)),
        ...master.projects.flatMap((p) => p.bullets.map((b) => b.id)),
    ]);

    let selectedProjectIds = (sel?.selectedProjectIds ?? []).filter((id) =>
        projIds.has(id),
    );
    let includedBulletIds = (sel?.includedBulletIds ?? []).filter((id) =>
        bulletIds.has(id),
    );
    let projectOrder = (sel?.projectOrder ?? []).filter((id) => projIds.has(id));
    let skills = (sel?.skills ?? []).filter((s) => s && s.category);

    if (selectedProjectIds.length === 0 && includedBulletIds.length === 0) {
        // default to master's selected projects (or all) + all work bullets,
        // capped at the page-fit limit
        const defaults = master.projects.filter((p) => p.is_selected).map((p) => p.id);
        selectedProjectIds = defaults.length
            ? defaults
            : master.projects.map((p) => p.id);
        const projSet = new Set(selectedProjectIds);
        includedBulletIds = [
            ...master.work.flatMap((w) => w.bullets.map((b) => b.id)),
            ...master.projects
                .filter((p) => projSet.has(p.id))
                .flatMap((p) => p.bullets.map((b) => b.id)),
        ].slice(0, MAX_INCLUDED_BULLETS);
    }

    if (projectOrder.length === 0) projectOrder = selectedProjectIds;

    const masterSkillItems = (s: MasterSkill): string[] =>
        String(s.items)
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);

    if (skills.length === 0) {
        // no skills from the agent -> use the master's own selection
        skills = master.skills.map((s, i) => ({
            category: s.category,
            items: masterSkillItems(s),
            position: i,
            is_selected: s.is_selected,
        }));
    } else {
        // agent returned a subset; add back every omitted master category with
        // is_selected=false so the snapshot is self-contained. otherwise omitted
        // categories get silently re-added on reload via the overlay's master
        // fallback (master skills default to is_selected=true) — the "all skills
        // come back" bug. keep any new categories the agent added.
        const present = new Set(skills.map((s) => s.category.trim().toLowerCase()));
        const missing = master.skills
            .filter((s) => !present.has(s.category.trim().toLowerCase()))
            .map((s) => ({
                category: s.category,
                items: masterSkillItems(s),
                position: 0,
                is_selected: false, // agent chose not to include this row
            }));
        skills = [...skills, ...missing].map((s, i) => ({ ...s, position: i }));
    }

    return {
        selectedProjectIds,
        projectOrder,
        includedBulletIds,
        skills,
        rationale: sel?.rationale ?? [],
    };
}

// prompt builders (shared by the graph nodes and the guided phase runners)

const filterPrompt = (jdText: string) =>
    "ROLE: Filter Agent.\n" +
    "TASK: Flag the JD ONLY if it is structurally not worth applying to for " +
    "almost any applicant: an obvious scam, a training-and-placement scheme, a " +
    "body shop hiding the end client, or a corp-to-corp (C2C) only posting with " +
    "no W-2 or direct-hire option. Do NOT skip based on the applicant's personal " +
    "situation: work authorization, visa or sponsorship, security clearance, " +
    "citizenship, location or relocation, and years of experience are NOT hard " +
    "blockers here, because the app does not know the candidate's status. At " +
    "most note such requirements in reason.\n" +
    'OUTPUT: JSON only: {"flagged": boolean, "reason": string}. A flag is ' +
    "advisory and never blocks the user from applying. If nothing structural " +
    'matches, flagged=false and reason="".\n\n' +
    `# Job Description\n\n${jdText}`;

const recruiterPrompt = (jdText: string) =>
    "ROLE: Recruiter Agent (the 6-second scan).\n" +
    "TASK: Give a fast first-impression fit read on the JD. Be honest about " +
    "gaps but lean toward applying (stretches welcome).\n" +
    'OUTPUT: JSON only: {"firstImpression": string (1-2 sentences), ' +
    '"verdict": "apply"|"stretch-apply"|"skip", "workingFor": string[], ' +
    '"gaps": string[], "roleType": string (a short label for the ' +
    "role's primary discipline, inferred from the JD, e.g. Backend, " +
    "Frontend, Full-Stack, Mobile, Data, ML, DevOps, QA/SDET, Embedded), " +
    '"companyName": string (the hiring ' +
    'company name from the JD; "" if not stated)}.\n\n' +
    `# Job Description\n\n${jdText}`;

const hiringManagerPrompt = (jdText: string, fit: unknown, feedback: string[] = []) =>
    "ROLE: Hiring Manager Agent (technical depth match).\n" +
    "TASK: Using the JD, the master resume snapshot, and the recruiter's " +
    "assessment, decide which projects and bullets are most relevant and how " +
    "to order the skills rows. Be FOCUSED, not exhaustive: select only the " +
    "projects and bullets relevant to THIS JD and DESELECT the rest — do not " +
    "include everything. LEAD with the project and bullets that best match the " +
    "JD's CORE domain (an infra/backend JD leads with the backend/distributed " +
    "project, NOT iOS/frontend work), and never exclude a project that strongly " +
    "matches the JD's must-haves or bonus points; but drop projects that don't " +
    "match. Likewise select only skills rows the JD calls for. " +
    "Enforce the page-fit limit: the total number " +
    `of INCLUDED bullets across work + selected projects MUST be <= ${MAX_INCLUDED_BULLETS}. ` +
    "Every work entry in the master always appears; you choose which of their " +
    "bullets to include. Order skills rows per role type (tailoring-principles.md), " +
    "leading with what the JD asks for. In `skills`, return EVERY master skill " +
    "row (plus any JD skills worth adding), each with is_selected — true ONLY " +
    "for rows the JD calls for, false for the rest.\n" +
    "OUTPUT: JSON only. Refer to projects and bullets by the short `ref` tokens " +
    "shown in the master snapshot (projects like p1, p2; bullets like p1b2, " +
    "w1b3) — NOT the full text or any long id:\n" +
    "{\n" +
    '  "selectedProjectIds": string[]  // project refs to include, e.g. ["p1","p3"],\n' +
    '  "projectOrder": string[]  // the selected project refs, most relevant first,\n' +
    `  "includedBulletIds": string[]  // work + project bullet refs to SHOW (<=${MAX_INCLUDED_BULLETS}), e.g. ["w1b1","p1b2"],\n` +
    '  "skills": [{"category": string, "items": string[], "position": number, "is_selected": boolean}],\n' +
    '  "rationale": string[]  // 2-4 SHORT bullet points: why these projects/bullets were chosen and what was cut\n' +
    "}\n\n" +
    (feedback.length > 0
        ? "# Reviewer feedback to address — RE-SELECT and RE-ORDER projects/" +
        "bullets to fix these (do not just reword)\n\n" +
        feedback.map((f) => `- ${f}`).join("\n") +
        "\n\n"
        : "") +
    `# Recruiter assessment\n\n${JSON.stringify(fit)}\n\n` +
    `# Job Description\n\n${jdText}`;

const atsPrompt = (jdText: string, selection: unknown) =>
    "ROLE: ATS Agent (keyword coverage).\n" +
    "TASK: From the JD below, list the most important keywords/phrases the " +
    "Content Writer should emphasize and incorporate in the tailored bullets. " +
    "STRICTLY use terms that literally appear in the JD (or an obvious synonym " +
    "of a JD term) — NEVER invent keywords or pull them from general knowledge. " +
    "Prioritize the JD's must-have hard skills and tools, most important first. " +
    "Keep it tight (~8-12).\n" +
    'OUTPUT: JSON only: {"keywords": string[]}. Each keyword is PLAIN TEXT — ' +
    "no markdown, no ** asterisks, no <b> tags.\n\n" +
    `# Hiring manager selection\n\n${JSON.stringify(selection)}\n\n` +
    `# Job Description\n\n${jdText}`;

const contentWriterPrompt = (
    jdText: string,
    keywords: string[],
    bulletsToWrite: { ref: string; master: string }[],
    feedback: string[],
    hasSummary: boolean,
) =>
    "ROLE: Content Writer Agent.\n" +
    "TASK: Rewrite each included bullet's text for JD alignment, applying " +
    "role-type framing and inline HTML <b> bolding. RULES: reorder, reframe, " +
    "and reword the master content, AND weave in relevant tools, technologies, " +
    "and JD keywords to strengthen fit even when they are not in the master " +
    "bullet (keep it plausible within the existing experience); keep " +
    "each bullet <= 200 characters; NEVER use em dashes. Bold metrics and " +
    "credentials always, plus 1-2 JD-priority anchors; ~7-9 bold spots total " +
    "across the whole resume; never bold commodity terms or full sentences.\n" +
    (hasSummary
        ? "ALSO write a professional summary tailored to the JD: 2-3 sentences, " +
          "impersonal resume voice (e.g. 'Full-stack engineer with 5 years...'; " +
          "no 'I'/'my'), plain text with NO <b> tags and NO em dashes. Be honest: " +
          "NEVER invent facts, skills, titles, or metrics not supported by the " +
          "master resume; frame the candidate's real experience toward the JD and " +
          "weave in JD-relevant keywords only where plausibly true.\n"
        : "") +
    'OUTPUT: JSON only: ' +
    (hasSummary
        ? '{"bullets": [{"ref": string, "text": string}], "summary": string}. '
        : '{"bullets": [{"ref": string, "text": string}]}. ') +
    "Include every ref listed below, using the EXACT ref token.\n\n" +
    (feedback.length > 0
        ? "# Editor feedback to address (this is a rewrite)\n\n" +
        feedback.map((f) => `- ${f}`).join("\n") +
        "\n\n"
        : "") +
    `# Keywords to emphasize\n\n${JSON.stringify(keywords)}\n\n` +
    `# Bullets to rewrite (ref -> master text)\n\n${JSON.stringify(bulletsToWrite)}\n\n` +
    `# Job Description\n\n${jdText}`;

// convert the Writer's <b> tags to markdown ** for reviewers: raw tags made
// reviewers dock "readability" for HTML clutter, a ceiling the Writer couldn't
// clear without dropping its own bolding. ** stays countable for the restraint check.
function renderBoldAsMarkdown(text: string): string {
    return text.replace(/<\/?b>/gi, "**");
}

function draftForReview(
    content: Pick<TailoringPlan, "projects" | "work" | "skills">,
): Pick<TailoringPlan, "projects" | "work" | "skills"> {
    const conv = (
        bs: { id: string; text: string; is_excluded: boolean; position: number }[],
    ) => bs.map((b) => ({ ...b, text: renderBoldAsMarkdown(b.text) }));
    return {
        skills: content.skills,
        projects: (content.projects ?? []).map((p) => ({ ...p, bullets: conv(p.bullets) })),
        work: (content.work ?? []).map((w) => ({ ...w, bullets: conv(w.bullets) })),
    };
}

function renderViewBold(view: ResumeView): ResumeView {
    const conv = (bs: string[]) => bs.map(renderBoldAsMarkdown);
    return {
        projects: view.projects.map((p) => ({ ...p, bullets: conv(p.bullets) })),
        work: view.work.map((w) => ({ ...w, bullets: conv(w.bullets) })),
        skills: view.skills,
        education: view.education,
    };
}

const editorPrompt = (jdText: string, draft: unknown, includedCount: number) =>
    "ROLE: Reviewer panel (ATS + recruiter + hiring manager) evaluating the " +
    "ACTUAL tailored draft below against the JD.\n" +
    "TASK: Score the draft 0-100 and list concrete, prioritized fixes for the " +
    "Content Writer. The score measures how well the RESUME CONTENT matches " +
    "the JD (skills, keywords, relevance, depth) — do NOT lower it for factors " +
    "the resume cannot change (visa/sponsorship, work authorization, location " +
    "or relocation, total years of experience). Those belong to the recruiter's " +
    "verdict, not this score. Evaluate through all three lenses:\n" +
    "- ATS: does it cover the JD's key hard skills / keywords? Reward strong " +
    "coverage; name any missing target terms the Writer should still add.\n" +
    "- Recruiter (6-second scan): are the first/top bullets clearly aligned to " +
    "the role, readable, and free of generic fluff?\n" +
    "- Hiring Manager (depth): technical depth, ownership scope, and business " +
    "impact. Flag vague phrasing (e.g. 'responsible for writing code') and push " +
    "for proof of scale/metrics WHERE THE MASTER ALREADY SUPPORTS IT (never " +
    "invent numbers).\n" +
    "Adding JD skills/tools/keywords not in the master is ALLOWED and " +
    "encouraged for coverage — do NOT flag or penalize additions as " +
    "'hallucinated' or 'not in the master'. Enforce only these hard " +
    `constraints: total non-excluded bullets <= ${MAX_INCLUDED_BULLETS} ` +
    `(currently ${includedCount}); no em dashes; bolding restraint ` +
    "(~7-9 **markdown-bold** metric/anchor spots — bold is shown as **text**, " +
    "NOT raw HTML, so never penalize readability for markup); each bullet " +
    "<= 200 chars.\n" +
    "Set approved=true only if the draft is strong (score >= 80) AND every hard " +
    "constraint passes.\n" +
    'OUTPUT: JSON only: {"approved": boolean, "issues": string[]  // concrete ' +
    "rewrite instructions for the Content Writer, most impactful first (empty " +
    'if approved), "notes": string[]  // brief flags to surface to the user, ' +
    '"score": number  // 0-100, "scoreBreakdown": string[]  // one short line ' +
    'per lens, e.g. "ATS keyword coverage: strong", "Recruiter readability: ok", ' +
    '"HM depth: add scale on the caching bullet"}.\n\n' +
    "# Draft (tailored, exactly as it renders — bold shown as **markdown**, not " +
    `raw HTML)\n\n${JSON.stringify(draft)}\n\n` +
    `# Job Description\n\n${jdText}`;

// resume view (included/selected content) the ATS + reviewers see
function buildResumeView(
    master: MasterResume,
    selection: Selection,
    tailored: Record<string, string> = {},
): ResumeView {
    const included = new Set(selection.includedBulletIds);
    const selected = new Set(selection.selectedProjectIds);
    const text = (id: string, fallback: string) => tailored[id] || fallback;
    return {
        projects: master.projects
            .filter((p) => selected.has(p.id))
            .map((p) => ({
                title: p.title,
                bullets: p.bullets
                    .filter((b) => included.has(b.id))
                    .map((b) => text(b.id, b.text)),
            })),
        work: master.work.map((w) => ({
            title: w.title,
            bullets: w.bullets
                .filter((b) => included.has(b.id))
                .map((b) => text(b.id, b.text)),
        })),
        skills: selection.skills
            .filter((s) => s.is_selected)
            .map((s) => ({
                category: s.category,
                items: Array.isArray(s.items) ? s.items.join(", ") : s.items,
            })),
        education: master.education ?? [],
    };
}

const atsAnalysisPrompt = (jdText: string, resumeJson: string) =>
    "ROLE: ATS (applicant tracking system).\n" +
    "TASK: Compare the RESUME to the JOB DESCRIPTION. Pull the JD's key hard " +
    "skills, tools, and must-have terms. For each, mark it 'present' ONLY if it " +
    "(or a clear synonym) literally appears in the RESUME text below — do NOT " +
    "infer presence from the job description or from related/adjacent skills. " +
    "Everything else is 'missing'. Give an ats_score 0-100 for how well the " +
    "resume matches the JD (keyword coverage + relevance).\n" +
    'OUTPUT: JSON only: {"atsScore": number, "present": string[], "missing": string[]}.\n\n' +
    `# Resume\n\n${resumeJson}\n\n# Job Description\n\n${jdText}`;

const recruiterReviewPrompt = (jdText: string, resumeJson: string, company: string) =>
    `ROLE: You ARE a recruiter at ${company || "the hiring company"}. Evaluate ` +
    "this candidate's resume for the role in the JD exactly as that company's " +
    "recruiter would — a 6-second scan, then a closer screening read. Infer the " +
    "company's priorities from the JD; be specific to this company and role.\n" +
    'OUTPUT: JSON only: {"score": number (0-100 = how likely you advance this ' +
    'candidate), "lookingFor": string[] (what you, as ' +
    `${company || "this company"}'s recruiter, want to see for this role), ` +
    '"strengths": string[], "gaps": string[], "summary": string (1-2 sentences, ' +
    "first person as the recruiter)}.\n\n" +
    `# Resume\n\n${resumeJson}\n\n# Job Description\n\n${jdText}`;

const hiringManagerReviewPrompt = (jdText: string, resumeJson: string, company: string) =>
    `ROLE: You ARE the hiring manager at ${company || "the hiring company"} for ` +
    "the role in the JD. Evaluate the candidate's resume for technical depth, " +
    "ownership scope, business impact, and fit for YOUR team. Infer what your " +
    "team needs from the JD; be specific, demanding but fair.\n" +
    'OUTPUT: JSON only: {"score": number (0-100), "lookingFor": string[] (what ' +
    "you, as the hiring manager, need in this hire), \"strengths\": string[], " +
    '"gaps": string[], "summary": string (1-2 sentences, first person)}.\n\n' +
    `# Resume\n\n${resumeJson}\n\n# Job Description\n\n${jdText}`;

// included bullets (ref -> master text) for the content writer
function bulletsToWriteFor(
    master: MasterResume,
    includedBulletIds: string[],
): { ref: string; master: string }[] {
    const included = new Set(includedBulletIds);
    const ref = idToRef(master);
    const out: { ref: string; master: string }[] = [];
    for (const w of master.work)
        for (const b of w.bullets)
            if (included.has(b.id)) out.push({ ref: ref.get(b.id) ?? b.id, master: b.text });
    for (const p of master.projects)
        for (const b of p.bullets)
            if (included.has(b.id)) out.push({ ref: ref.get(b.id) ?? b.id, master: b.text });
    return out;
}

type EditorOut = {
    approved: boolean;
    issues?: string[];
    notes?: string[];
    score?: number;
    scoreBreakdown?: string[];
};

async function filterNode(state: State): Promise<Partial<State>> {
    const { data, usage } = await callAgent<{ flagged: boolean; reason?: string }>(
        "filter",
        state.guidance,
        state.masterResume,
        filterPrompt(state.jdText),
        1024,
        state.llm,
    );
    return { filterResult: { flagged: !!data.flagged, reason: data.reason }, usage: [usage] };
}

async function recruiterNode(state: State): Promise<Partial<State>> {
    const { data, usage } = await callAgent<NonNullable<TailoringPlan["fitAssessment"]>>(
        "recruiter",
        state.guidance,
        state.masterResume,
        recruiterPrompt(state.jdText),
        2048,
        state.llm,
    );
    return { fitAssessment: data, usage: [usage] };
}

// score the master resume as-is (default selection, no tailoring) for the
// before/after lift. runs once, before the loop, using the same editor rubric
// so baselineScore and the tailored score are comparable.
async function baselineNode(state: State): Promise<Partial<State>> {
    const selection = ensureValidSelection(state.masterResume, undefined);
    const draft = assembleContent(state.masterResume, selection, {});
    const includedCount =
        (draft.projects ?? []).flatMap((p) => p.bullets).filter((b) => !b.is_excluded).length +
        (draft.work ?? []).flatMap((w) => w.bullets).filter((b) => !b.is_excluded).length;
    try {
        const { data, usage } = await callAgent<EditorOut>(
            "baseline",
            state.guidance,
            state.masterResume,
            editorPrompt(state.jdText, draftForReview(draft), includedCount),
            4096,
            state.llm,
        );
        return {
            baselineScore: typeof data.score === "number" ? data.score : undefined,
            baselineScoreBreakdown: data.scoreBreakdown ?? [],
            usage: [usage],
        };
    } catch (e) {
        // non-fatal: the before/after just won't show a "before" number
        console.error("[baseline] scoring failed:", e);
        return { usage: [] };
    }
}

async function hiringManagerNode(state: State): Promise<Partial<State>> {
    try {
        const { data, usage } = await callAgent<Selection>(
            "hiringmanager",
            state.guidance,
            state.masterResume,
            hiringManagerPrompt(state.jdText, state.fitAssessment, state.editorFeedback),
            16384,
            state.llm,
        );
        return {
            selection: ensureValidSelection(
                state.masterResume,
                translateSelection(state.masterResume, data),
            ),
            usage: [usage],
        };
    } catch (e) {
        // bad/unparseable selection -> fall back to a default so we never crash
        console.error("[hiringmanager] failed, using default selection:", e);
        return { selection: ensureValidSelection(state.masterResume, undefined), usage: [] };
    }
}

async function atsNode(state: State): Promise<Partial<State>> {
    const { data, usage } = await callAgent<{ keywords: string[] }>(
        "ats",
        state.guidance,
        state.masterResume,
        atsPrompt(state.jdText, state.selection),
        2048,
        state.llm,
    );
    return { keywords: data.keywords ?? [], usage: [usage] };
}

async function contentWriterNode(state: State): Promise<Partial<State>> {
    const bulletsToWrite = bulletsToWriteFor(
        state.masterResume,
        state.selection?.includedBulletIds ?? [],
    );
    const { data, usage } = await callAgent<{
        bullets: { ref?: string; id?: string; text: string }[];
        summary?: string;
    }>(
        "contentwriter",
        state.guidance,
        state.masterResume,
        contentWriterPrompt(
            state.jdText,
            state.keywords,
            bulletsToWrite,
            state.editorFeedback,
            !!state.hasSummary,
        ),
        16384,
        state.llm,
    );

    const tailored = tailoredFromBullets(state.masterResume, data.bullets);

    return {
        tailoredText: tailored,
        tailoredSummary: (data.summary ?? "").trim(),
        iterations: state.iterations + 1,
        usage: [usage],
    };
}

async function editorNode(state: State): Promise<Partial<State>> {
    const draft = assembleContent(
        state.masterResume,
        state.selection!,
        state.tailoredText,
    );
    const includedCount =
        (draft.projects ?? []).flatMap((p) => p.bullets).filter((b) => !b.is_excluded).length +
        (draft.work ?? []).flatMap((w) => w.bullets).filter((b) => !b.is_excluded).length;

    const { data, usage } = await callAgent<EditorOut>(
        "editor",
        state.guidance,
        state.masterResume,
        editorPrompt(state.jdText, draftForReview(draft), includedCount),
        4096,
        state.llm,
    );

    return {
        approved: !!data.approved,
        editorFeedback: data.issues ?? [],
        editorNotes: data.notes ?? [],
        // keep the previous pass's score if the model omitted it — the reducer
        // overwrites, so undefined would wipe a valid earlier "after" number
        score: typeof data.score === "number" ? data.score : state.score,
        prevScore: state.score, // for plateau detection
        scoreBreakdown:
            data.scoreBreakdown && data.scoreBreakdown.length > 0
                ? data.scoreBreakdown
                : state.scoreBreakdown,
        usage: [usage],
    };
}

function routeAfterEditor(state: State): "rewrite" | "done" {
    const score = state.score ?? 0;
    if (score >= SCORE_THRESHOLD) return "done"; // cleared the bar
    if (state.iterations >= MAX_EDITOR_ITERATIONS) return "done"; // cap reached
    // plateau: last pass didn't improve, so another loop is unlikely to help
    if (state.prevScore != null && score <= state.prevScore) return "done";
    return "rewrite";
}

const workflow = new StateGraph(GraphState)
    .addNode("filter", filterNode)
    .addNode("recruiter", recruiterNode)
    .addNode("baseline", baselineNode)
    .addNode("hiringManager", hiringManagerNode)
    .addNode("ats", atsNode)
    .addNode("contentWriter", contentWriterNode)
    .addNode("editor", editorNode)
    .addEdge(START, "filter")
    // filter is advisory: always continue, carrying any flag through
    .addEdge("filter", "recruiter")
    .addEdge("recruiter", "baseline")
    .addEdge("baseline", "hiringManager")
    .addEdge("hiringManager", "ats")
    .addEdge("ats", "contentWriter")
    .addEdge("contentWriter", "editor")
    .addConditionalEdges("editor", routeAfterEditor, {
        // loop back to HM (not just the Writer) so selection/ordering feedback
        // can be acted on; the linear edges re-run HM -> ATS -> Writer -> Editor
        rewrite: "hiringManager",
        done: END,
    })
    .compile();

export interface RunResult {
    plan: TailoringPlan;
    usage: UsageEntry[];
}

// node key -> display label in the live pipeline
export const AGENT_LABELS: Record<string, string> = {
    filter: "Filter",
    recruiter: "Recruiter",
    baseline: "Baseline (master)",
    hiringManager: "Hiring Manager",
    ats: "ATS",
    contentWriter: "Content Writer",
    editor: "Editor",
};

function buildResult(final: State): RunResult {
    const content = assembleContent(
        final.masterResume,
        final.selection!,
        final.tailoredText,
    );

    const plan: TailoringPlan = {
        filterResult: final.filterResult ?? { flagged: false },
        fitAssessment: final.fitAssessment,
        companyName: final.fitAssessment?.companyName,
        hiringManagerRationale: final.selection?.rationale,
        atsKeywords: final.keywords,
        skills: content.skills,
        projects: content.projects,
        work: content.work,
        notes: final.selection?.rationale ?? [],
        editorNotes: final.editorNotes,
        iterations: final.iterations,
        score: final.score,
        scoreBreakdown: final.scoreBreakdown,
        baselineScore: final.baselineScore,
        baselineScoreBreakdown: final.baselineScoreBreakdown,
        summary: final.hasSummary ? final.tailoredSummary ?? "" : "",
    };

    return { plan, usage: final.usage };
}

export async function runTailoringGraph(input: {
    jdText: string;
    masterResume: MasterResume;
    guidance: Guidance;
    llm: ResolvedLLM;
    hasSummary?: boolean;
}): Promise<RunResult> {
    return buildResult(
        (await workflow.invoke({ ...input, hasSummary: !!input.hasSummary })) as State,
    );
}

// like runTailoringGraph but calls onProgress(nodeKey) as each node finishes.
// "updates" chunks name the node that just ran; "values" chunks carry the full
// accumulated state (the last is final).
export async function runTailoringGraphStreaming(
    input: {
        jdText: string;
        masterResume: MasterResume;
        guidance: Guidance;
        llm: ResolvedLLM;
        hasSummary?: boolean;
    },
    onProgress: (nodeKey: string) => void,
): Promise<RunResult> {
    let final: State | undefined;
    const stream = await workflow.stream(
        { ...input, hasSummary: !!input.hasSummary },
        {
            streamMode: ["updates", "values"],
        },
    );
    for await (const part of stream as AsyncIterable<[string, unknown]>) {
        const [mode, chunk] = part;
        if (mode === "updates") {
            const node = Object.keys(chunk as Record<string, unknown>)[0];
            if (node) onProgress(node);
        } else if (mode === "values") {
            final = chunk as State;
        }
    }
    if (!final) throw new Error("graph produced no final state");
    return buildResult(final);
}

// Guided mode: run the pipeline in phases with a human checkpoint between each.

type PhaseInput = {
    jdText: string;
    masterResume: MasterResume;
    guidance: Guidance;
    llm: ResolvedLLM;
};

export interface ScreenResult {
    filterResult: { flagged: boolean; reason?: string };
    fitAssessment?: NonNullable<TailoringPlan["fitAssessment"]>;
    companyName?: string;
    selection?: Selection;
    hiringManagerRationale?: string[];
    // selection applied over master text (not tailored yet) for the client
    projects?: TailoringPlan["projects"];
    work?: TailoringPlan["work"];
    skills?: TailoringPlan["skills"];
    usage: UsageEntry[];
}

// Phase 1: Filter -> Recruiter -> Hiring Manager (selection only, master text)
export async function runScreenPhase(input: PhaseInput): Promise<ScreenResult> {
    const { jdText, masterResume: m, guidance: g, llm } = input;
    const usage: UsageEntry[] = [];

    const filter = await callAgent<{ flagged: boolean; reason?: string }>(
        "filter", g, m, filterPrompt(jdText), 1024, llm);
    usage.push(filter.usage);
    // flag is advisory: carry it through but keep screening

    const rec = await callAgent<NonNullable<TailoringPlan["fitAssessment"]>>(
        "recruiter", g, m, recruiterPrompt(jdText), 2048, llm);
    usage.push(rec.usage);

    let hmData: Partial<Selection> | undefined;
    try {
        const hm = await callAgent<Selection>(
            "hiringmanager", g, m, hiringManagerPrompt(jdText, rec.data), 16384, llm);
        usage.push(hm.usage);
        hmData = hm.data;
    } catch (e) {
        console.error("[hiringmanager] failed, using default selection:", e);
    }
    const selection = ensureValidSelection(m, translateSelection(m, hmData));

    const content = assembleContent(m, selection, {});
    return {
        filterResult: { flagged: !!filter.data.flagged, reason: filter.data.reason },
        fitAssessment: rec.data,
        companyName: rec.data.companyName,
        selection,
        hiringManagerRationale: selection.rationale,
        projects: content.projects,
        work: content.work,
        skills: content.skills,
        usage,
    };
}

export interface TailorResult {
    atsKeywords: string[];
    projects?: TailoringPlan["projects"];
    work?: TailoringPlan["work"];
    skills?: TailoringPlan["skills"];
    score?: number;
    scoreBreakdown?: string[];
    editorNotes?: string[];
    approved?: boolean;
    summary?: string;
    usage: UsageEntry[];
}

// Phase 2: ATS -> Content Writer -> Editor; tailors + scores the phase-1 selection
export async function runTailorPhase(
    input: PhaseInput & { selection: Selection; hasSummary?: boolean },
): Promise<TailorResult> {
    const { jdText, masterResume: m, guidance: g, selection, llm } = input;
    const hasSummary = !!input.hasSummary;
    const usage: UsageEntry[] = [];

    const ats = await callAgent<{ keywords: string[] }>(
        "ats", g, m, atsPrompt(jdText, selection), 2048, llm);
    usage.push(ats.usage);

    const bulletsToWrite = bulletsToWriteFor(m, selection.includedBulletIds);
    const cw = await callAgent<{
        bullets: { ref?: string; id?: string; text: string }[];
        summary?: string;
    }>(
        "contentwriter",
        g,
        m,
        contentWriterPrompt(jdText, ats.data.keywords ?? [], bulletsToWrite, [], hasSummary),
        16384,
        llm,
    );
    usage.push(cw.usage);

    const tailored = tailoredFromBullets(m, cw.data.bullets);

    const content = assembleContent(m, selection, tailored);
    const includedCount =
        (content.projects ?? []).flatMap((p) => p.bullets).filter((b) => !b.is_excluded).length +
        (content.work ?? []).flatMap((w) => w.bullets).filter((b) => !b.is_excluded).length;

    const ed = await callAgent<EditorOut>(
        "editor", g, m, editorPrompt(jdText, draftForReview(content), includedCount), 4096, llm);
    usage.push(ed.usage);

    return {
        atsKeywords: ats.data.keywords ?? [],
        projects: content.projects,
        work: content.work,
        skills: content.skills,
        score: ed.data.score,
        scoreBreakdown: ed.data.scoreBreakdown,
        editorNotes: ed.data.notes,
        approved: ed.data.approved,
        summary: hasSummary ? (cw.data.summary ?? "").trim() : "",
        usage,
    };
}

// Guided flow: Create (select + ATS gap) -> reviews (company role-play).

export interface CreateResult extends ScreenResult {
    atsScore?: number;
    keywordsPresent?: string[];
    keywordsMissing?: string[];
}

// Create: screen phase + ATS gap analysis on the selected master content; no
// bullet rewriting. Returns the selection plan plus ATS score + present/missing.
export async function runCreatePhase(input: PhaseInput): Promise<CreateResult> {
    const screen = await runScreenPhase(input);
    if (!screen.selection) return screen;

    const view = buildResumeView(input.masterResume, screen.selection);
    const ats = await callAgent<{ atsScore?: number; present?: string[]; missing?: string[] }>(
        "ats",
        input.guidance,
        input.masterResume,
        atsAnalysisPrompt(input.jdText, JSON.stringify(view)),
        2048,
        input.llm,
    );
    return {
        ...screen,
        usage: [...screen.usage, ats.usage],
        atsScore: ats.data.atsScore,
        keywordsPresent: ats.data.present ?? [],
        keywordsMissing: ats.data.missing ?? [],
    };
}

export interface AtsResult {
    atsScore?: number;
    present: string[];
    missing: string[];
    usage: UsageEntry[];
}

// re-run ATS on a provided resume view (the current version) vs the JD
export async function runAtsPhase(input: {
    jdText: string;
    resume: ResumeView;
    guidance: Guidance;
    llm: ResolvedLLM;
}): Promise<AtsResult> {
    const { data, usage } = await callAgent<{
        atsScore?: number;
        present?: string[];
        missing?: string[];
    }>(
        "ats",
        input.guidance,
        EMPTY_MASTER,
        atsAnalysisPrompt(input.jdText, JSON.stringify(renderViewBold(input.resume))),
        2048,
        input.llm,
    );
    return {
        atsScore: data.atsScore,
        present: data.present ?? [],
        missing: data.missing ?? [],
        usage: [usage],
    };
}

export interface ReviewResult {
    score?: number;
    lookingFor: string[];
    strengths: string[];
    gaps: string[];
    summary?: string;
    usage: UsageEntry[];
}

type ReviewInput = {
    jdText: string;
    resume: ResumeView;
    companyName?: string;
    guidance: Guidance;
    llm: ResolvedLLM;
};

type ReviewAgentOut = {
    score?: number;
    lookingFor?: string[];
    strengths?: string[];
    gaps?: string[];
    summary?: string;
};

async function runReview(
    agent: "recruiterreview" | "hiringmanagerreview",
    promptFn: (jd: string, resume: string, company: string) => string,
    input: ReviewInput,
): Promise<ReviewResult> {
    const { data, usage } = await callAgent<ReviewAgentOut>(
        agent,
        input.guidance,
        EMPTY_MASTER,
        promptFn(input.jdText, JSON.stringify(renderViewBold(input.resume)), input.companyName ?? ""),
        4096,
        input.llm,
    );
    return {
        score: data.score,
        lookingFor: data.lookingFor ?? [],
        strengths: data.strengths ?? [],
        gaps: data.gaps ?? [],
        summary: data.summary,
        usage: [usage],
    };
}

export const runRecruiterReview = (input: ReviewInput) =>
    runReview("recruiterreview", recruiterReviewPrompt, input);

export const runHiringManagerReview = (input: ReviewInput) =>
    runReview("hiringmanagerreview", hiringManagerReviewPrompt, input);
