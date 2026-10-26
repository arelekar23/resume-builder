# Resume Builder

A resume-tailoring app. You keep one master resume (work, projects, bullets,
skills); the app tailors it to a job description through a multi-agent LangGraph
workflow, saves named versions per company, and exports a one-page PDF.

## Stack

- Frontend: Vite + React 19 SPA (`react-router-dom`), Tailwind v4 + shadcn-style
  components. Inter for the UI, Calibri in the resume preview.
- Backend: Vercel serverless functions in `/api` (`@vercel/node`), deployed with
  the static SPA.
- Data: Supabase Postgres with Row-Level Security; Google OAuth via Supabase Auth.
- Tailoring: LangGraph.js. The LLM is user-provided (any Anthropic or
  OpenAI-compatible provider); there is no server LLM.

Run locally with `vercel dev`, which serves the SPA and `/api` together. Plain
`npm run dev` (Vite only) does not serve the API routes.

## Data model

Normalized tables: `profiles`, `education`, `work`, `work_bullets`, `projects`,
`project_bullets`, `skills`, plus `resume_versions` and `user_llm_keys` (below).
Each bullet has:

- `original_text` — canonical master content.
- `text` — current/tailored content (may contain inline `<b>…</b>` bolding).

Selection state: `projects.is_selected`, `skills.is_selected`,
`*_bullets.is_excluded`, and `position` for ordering. RLS on every table:
`profile_id = auth.uid()` (bullets check ownership through their parent).

Migrations are in `supabase/migrations/`. Two of them (`20260701120000`,
`20260701120100`) add the drifted `is_selected`/`is_excluded` columns
idempotently and create `resume_versions`; `20260715120000` creates the
`user_llm_keys` vault.

### Data-safety guards

Tailoring reads a bullet's current `text` as the master, falling back to
`original_text` only when `text` is blank (`api/analyze.ts`). So the agents see
the master exactly as the user last left it, and `original_text` is purely the
restore point — per-bullet "restore original" (↺) resets `text` back to it.

A thin or truncated model response can't blank a bullet. `tailoredFromBullets`
drops any rewrite whose text is empty or whitespace, and `assembleContent` falls
back to the source text with `||` (not `??`) on both the project and work
branches, so a blank never reaches the DB.

## Version management

A resume version is a named snapshot of the tailored state, not the master.
`resume_versions` stores three JSONB columns keyed by row id/category:

- `projects_state` — `[{ id, is_selected, position }]`
- `bullets_state` — `[{ id, kind: 'work'|'project', text, is_excluded, position }]`
- `skills_state` — `[{ category, items, position, is_selected }]`

The data layer is `src/utils/versions.ts` (client-side supabase-js, RLS-scoped):
`listVersions`, `getVersion`, `saveVersion`, `loadVersion`, `renameVersion`,
`duplicateVersion`, `deleteVersion`. Loading a version overlays its tailored
state onto the master rows **in memory only** (`buildVersionEditorState`) — the
master rows are never written. While a version is active, the editor's autosave
routes to `saveVersionState` instead of `saveState`, so edits land on the version
and the master stays clean. Versions are manual-only — nothing is
auto-snapshotted on tailoring. UI is in
`src/components/VersionBar.tsx`.

## Agentic tailoring (`/api/analyze` + `api/tailoring-graph.ts`)

The tailoring endpoint is a 6-node LangGraph workflow exposed through two modes.
Each node is one focused LLM call.

- Filter — advisory check for structurally bad postings (scams, body shops,
  C2C-only). It never terminates the run and never blocks the user; the flag is
  carried through to the UI. It deliberately ignores the candidate's personal
  situation (visa, clearance, location, YOE), because the app does not know it.
- Recruiter — 6-second fit read (first impression, verdict, working-for, gaps, role type).
- Baseline — scores the untailored master (default selection, master text) against the JD, so the UI can show the before/after lift.
- Hiring Manager — selects projects/bullets (page-fit ≤14) and skills-row order.
- ATS — keyword coverage. Two prompt roles: keywords to emphasize (writer input)
  vs gap analysis (`atsScore` + present/missing), depending on the phase.
- Content Writer — rewrites included bullets with JD framing + `<b>` bolding.
- Editor — QA (page-fit, honesty, em dashes, bolding) that scores the draft 0–100.

### Quick mode — one autonomous run

`src/components/JDAnalysisTab.tsx` POSTs `{ stream: true }` (no `phase`) and the
server streams live per-agent progress over SSE (`runTailoringGraphStreaming` →
the compiled graph). The Editor loops back to the Hiring Manager (which then
re-runs ATS → Content Writer → Editor) so its feedback can fix selection and
ordering, not just wording, until the score clears the bar or the run
plateaus/caps out.

```mermaid
flowchart TD
    S([JD submitted]) --> F[Filter<br/>advisory flag only]
    F --> R[Recruiter]
    R --> B[Baseline<br/>score master as-is]
    B --> H[Hiring Manager<br/>select ≤14 bullets]
    H --> A[ATS<br/>keywords to emphasize]
    A --> C[Content Writer<br/>rewrite bullets]
    C --> ED[Editor<br/>score 0–100 + per-bullet fixes]
    ED -->|"reselect · structural feedback"| H
    ED -->|"reword · per-bullet fixes only"| C
    ED -->|"done · see stopReason"| E2([END])
```

**The loop refines; it does not resample.** Two things make that true:

- The Editor addresses fixes to a specific bullet by its `ref` token
  (`bulletIssues: [{ref, issue}]`), so feedback is *addressable*. `draftForReview`
  labels every bullet with its ref for exactly this reason — the Editor doesn't
  receive the master snapshot, so without labels it can only produce prose that
  names no bullet.
- On a rewrite pass the Content Writer sources from its **own previous draft**
  (`withCurrentText(master, tailoredText)`) and rewrites **only** the flagged
  bullets, plus any the Hiring Manager newly selected. Every other bullet is
  left byte-for-byte alone. True master rides along as `provenance` so refining
  a rewrite can't drift off the candidate's real facts.

Previously every pass regenerated all ~14 bullets from master, so a note like
"add scale to the caching bullet" re-rolled thirteen bullets that were already
fine. That is why passes plateaued: there was no memory of what already worked.

Routing follows the same logic. `editorFeedback` (structural: wrong bullets,
bad order, page overflow) routes to the Hiring Manager, because only it can
re-select. Wording-only feedback routes straight back to the Writer — two LLM
calls instead of four, and the accepted selection isn't reshuffled out from
under the fix. If the Editor scores below the bar but names no bullet, the
Writer falls back to a full rewrite rather than stalling.

Thresholds from `tailoring-graph.ts`: `SCORE_THRESHOLD = 80`,
`MAX_EDITOR_ITERATIONS = 3` (Content Writer runs up to 3 times, i.e. up to 2
rewrites).

`decideStop` is the single place that ends the loop, and it records **why** in
`plan.stopReason` so the UI can tell "good enough" apart from "gave up":

| `stopReason` | Meaning |
| --- | --- |
| `score-cleared` | Editor scored ≥ 80. The only success case. |
| `iteration-cap` | Hit `MAX_EDITOR_ITERATIONS` without clearing the bar. |
| `plateau` | The new score did not beat the previous one. |
| `time-budget` | Another pass wouldn't fit before `maxDuration`. |
| `editor-error` | The QA call failed; the draft is returned unreviewed. |

The summary, when the resume has one, is written on the **first pass only**.
`draftForReview` sends skills/projects/work, so the Editor never sees the
summary and has no feedback to offer on it; re-rolling it each pass would risk
a good summary for no signal.

Two subtleties worth keeping:

- **Plateau needs a fresh number.** If the Editor omits `score`, the previous
  pass's number is retained for display but is *not* treated as a plateau —
  a failed measurement is not convergence.
- **The loop is time-budgeted.** `/api/analyze` passes `deadlineAt`, and the
  loop stops once the last pass's measured duration wouldn't fit in the
  remaining time. Without this a 3-iteration run makes up to 15 sequential LLM
  calls, overruns `maxDuration: 60`, and the SSE stream dies before emitting
  `result` — so the user watches the pipeline run and gets nothing. Note this
  protects the *loop*, not the floor: if the prelude plus one pass alone exceeds
  the limit, the function is still killed. Raising `maxDuration` and
  `MAX_DURATION_S` in `api/analyze.ts` (together — Vercel parses the literal)
  to 300 requires a Pro plan.

### Guided mode — user-triggered phases

`src/components/GuidedTailor.tsx` drives the same agents as discrete phases the
user triggers by hand, editing the resume in between. The `tailor` phase does
not loop — it runs ATS → Content Writer → Editor once (the Editor score is
informational, not a gate). The two review agents role-play the named company.

**Every guided phase operates on the resume the user is currently looking at,
not on master.** The reviews and the ATS re-check get the rendered view
(`getCurrentResumeView`). The `tailor` phase gets `selection` plus
`currentText` (`getCurrentBulletText` — bullet id → on-screen text), which the
server overlays onto master (`withCurrentText`) before selecting bullets to
rewrite and before assembling the result. This matters twice over: hand edits
made between phases survive an Auto-tailor, and tailoring while a saved version
is active rewrites *that version's* text rather than reverting to master.

The Content Writer still receives the untouched `master` text alongside
`current` for each edited bullet, and is told to rewrite `current` while
treating `master` as the record of which facts are real — so respecting the
user's edit doesn't licence inventing on top of it.

```mermaid
flowchart TD
    subgraph P1["Phase: create — 'Create tailored version'"]
        F[Filter<br/>advisory flag only] --> R[Recruiter] --> H[Hiring Manager] --> A["ATS · gap analysis<br/>score + present/missing"]
    end
    P1 --> V{{User edits resume by hand}}
    V --> T["Phase: tailor — 'Auto-tailor bullets'<br/>ATS → Content Writer → Editor<br/>(single pass, no loop)"]
    V --> RC["Phase: ats — 'Re-check ATS'<br/>ATS only · score + present/missing"]
    V --> RR["Phase: recruiterReview<br/>Recruiter Review · role-plays company"]
    V --> HM["Phase: hiringManagerReview<br/>Hiring Manager Review · role-plays company"]
```

Master as starting point: the master resume is the base agents generate from,
not a ceiling. To maximize JD fit and ATS score, agents add relevant skills,
tools, and keywords from the JD — including ones not in the master — woven into
the existing experience. There is no separate "skills honesty" list.

Prompt caching: the guidance file + the master-resume snapshot form a shared,
cached system prefix across all agents (two `ephemeral` breakpoints); only
per-agent instructions + the JD vary, so agents 2–6 hit the cache. The snapshot
is always the true master, never the overlaid view, so the prefix stays stable
across phases.

### Endpoint contract

`POST /api/analyze` with `Authorization: Bearer <supabase jwt>`.

The endpoint is **read-only** — it runs agents and returns a plan, and never
writes to the DB. Applying is entirely client-side (see below).

```jsonc
// Quick mode (SSE: `progress` events per agent, then one `result`):
{ "jdText": "…", "profileId": "…", "stream": true, "includeSummary": false }

// Quick mode, non-streaming — same graph, single JSON response:
{ "jdText": "…", "profileId": "…" }

// Guided phases:
{ "phase": "create",  "jdText": "…", "profileId": "…" }
{ "phase": "tailor",  "jdText": "…", "profileId": "…",
  "selection": { /* … */ }, "currentText": { "<bulletId>": "on-screen text" } }
{ "phase": "ats" | "recruiterReview" | "hiringManagerReview",
  "jdText": "…", "profileId": "…", "resume": { /* rendered view */ },
  "companyName": "…" }
```

Response `{ plan, usage }` for the graph runs, or the phase result object for a
`phase` request. The `plan` (also the object the frontend renders) carries
per-agent reasoning:

```jsonc
{
  "filterResult": { "flagged": false, "reason": "…" },
  "fitAssessment": {
    "firstImpression": "…",
    "verdict": "apply",
    "workingFor": [],
    "gaps": [],
    "roleType": "…",
  },
  "hiringManagerRationale": "…",
  "atsKeywords": ["…"],
  "skills": [
    /* { category, items[], position, is_selected } */
  ],
  "projects": [
    /* { id, is_selected, position, bullets[] } */
  ],
  "work": [
    /* { id, bullets[] } */
  ],
  "notes": ["…"],
  "editorNotes": ["…"],
  "iterations": 1,
  "stopReason": "score-cleared",
}
```

Nothing is auto-applied, and `/api/analyze` has no apply mode. The user reviews
the plan and clicks Apply, which is handled on the client: `applyPlanToMaster`
(`src/utils/versionConversion.ts`) overlays the plan onto the loaded master and
`saveVersion` stores the result as a **new named version**, which the editor then
switches to. The master rows are untouched either way.

`filterResult.flagged` is advisory only — it is surfaced in the UI and never
short-circuits the run or blocks applying.

### LLM (user-provided — no server default)

There is no built-in LLM and no server API key. Each user supplies their own
provider, API key, and model in API settings (`ApiSettings.tsx`). The key is
saved once to the encrypted server vault (see below), not kept in the browser;
`/api/analyze` and `/api/parse-resume` load it server-side by verified user id.
With no key configured, both endpoints return `400` asking the user to set one
(`isLLMUsable`).

Both provider families work:

- Anthropic (`provider: "anthropic"`) — native Messages API with ephemeral
  prompt caching across agents.
- OpenAI-compatible (`provider: "openai"`) — any `/chat/completions` endpoint
  (Cerebras, OpenAI, Gemini, Ollama, …) via the user-supplied base URL.

All agents use the single user-provided model.

### Required env vars

Set in `.env` locally and in Vercel project settings (see `.env.example`). The
LLM is user-provided (no LLM env vars), but the key vault needs two server-only
secrets:

| Var                         | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`         | Supabase project URL (client and `/api`)                                      |
| `VITE_SUPABASE_ANON_KEY`    | Supabase anon key (also read server-side by `/api`)                           |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Used by `/api/keys` + `/api/account` to touch the locked-down key vault and delete accounts. Never `VITE_`-prefix it. |
| `LLM_KEY_ENC_SECRET`        | Server-only. 32-byte base64 master key (KEK) that wraps each user's per-key DEK. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Changing it makes stored keys undecryptable. |

### RLS / auth

RLS stays enforced. `/api/analyze` connects with the anon key but forwards the
signed-in user's session JWT (`global.headers.Authorization`), so `auth.uid()`
resolves server-side and `profile_id = auth.uid()` policies pass. Missing or
invalid bearer token → `401`.

`user_llm_keys` is the exception: RLS is enabled with no policies and privileges
are revoked from `anon`/`authenticated`, so the browser can never read the
encrypted key material. Only the service role touches it, from `/api/keys` and
`/api/account`, after verifying the caller's JWT.

### Key vault

User API keys never live in the browser:

1. The key is sent to `POST /api/keys` once, over HTTPS.
2. Envelope encryption (AES-256-GCM): a per-user data key (DEK) encrypts the API
   key, and the DEK is wrapped by the server-held master key (`LLM_KEY_ENC_SECRET`).
   Only the ciphertext and wrapped DEK are stored (`api/keyVault.ts`).
3. `/api/analyze` and `/api/parse-resume` load and decrypt the key server-side by
   verified user id; the request body is never trusted for credentials.
4. The key is never returned to the client (`GET /api/keys` reports only
   provider/model). `DELETE /api/keys` revokes it; `DELETE /api/account` cascades
   away all user data including the key.

The browser caches only non-secret status (`resumeBuilder.llmPrefs`) for UI
gating. With the CSP in `vercel.json`, there's no plaintext key in the browser
for an XSS payload to steal.

### Guidance directory (`api/guidance/`)

One hand-maintained markdown file, loaded at cold start
(`api/guidance-files.ts`) and cached in the prompt:

- `tailoring-principles.md` — formatting, bolding, length targets, skills ordering

It is deliberately candidate-agnostic: it describes craft and the fixed
constraints of the PDF template, and contains no facts about any specific
user. Every candidate-specific fact reaches the agents through the
master-resume snapshot instead. A missing file is non-fatal — the loader warns
and substitutes an empty string, so tailoring quality drops but nothing breaks.

Bundled via `vercel.json` (`functions["api/analyze.ts"].includeFiles`). Edit and
redeploy; changes apply on the next cold start.

## Resume import (`/api/parse-resume` + `src/utils/masterResume.ts`)

New users onboard by uploading an existing resume. `POST /api/parse-resume`
(Bearer JWT) takes a base64 PDF, extracts its text server-side with `unpdf`
(serverless-friendly, no worker setup), and sends that text to the user's
configured LLM — provider-agnostic. It returns `{ parsed }` in the master schema
(`profile`, `education`, `work[]`, `projects[]`, `skills[]`, bullets as verbatim
strings). It only extracts; the client writes.

`overwriteMasterResume(parsed)` (client, RLS-scoped) then clears and repopulates
`work`/`projects`/`skills`/`education` and updates the `profiles` row
(`original_text = text`, projects/skills `is_selected = true`). Saved company
versions are left intact. Personal fields only overwrite when the parse found a
value.

- Onboarding — `src/routes/Editor.tsx` shows an upload dialog when the master is
  empty (`work`/`projects`/`skills` all empty on Master, not a version);
  `ResumeUpload` handles read → parse → write, then refreshes.
- Re-upload — an "Import from resume" card in `src/routes/Profile.tsx` does the
  same with a confirm prompt (it's destructive to master content).
- Requires a configured LLM. The upload UI blocks with a "set up your LLM"
  message if none is set; the endpoint returns `400` likewise.
- Text-based PDFs only. A scanned/image PDF yields no text → `422`.

## PDF export

Browser-native `window.print()` on the preview iframe. The filename comes from
`document.title`, set to `Resume_{company}.pdf` where `company` is the active
version's `company_name` (spaces → underscores, special chars stripped, fallback
`General`).

## UI layout

Three columns (`src/routes/Editor.tsx`): left = version switcher + Export PDF;
center = editor (Projects/Experience/Skills, collapsible and drag-sortable)
side-by-side with a live auto-scaling preview and a fits/overflows badge; right =
JD input + per-agent reasoning panel (`src/components/JDAnalysisTab.tsx`). Editor
edits autosave via a diff-based writer (`src/utils/api.ts`).
