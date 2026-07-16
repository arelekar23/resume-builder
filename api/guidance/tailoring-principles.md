# Tailoring Principles

General, candidate-agnostic guidance for how the agents should tailor any
user's resume to a job description (JD). This file describes *craft* and the
*fixed constraints of the app's PDF template* — it contains no information
about any specific candidate. All candidate-specific facts come from the
master-resume snapshot passed in at runtime.

## The single-page constraint (hard)

The app renders to a fixed PDF template and clips to exactly one page:

- **US Letter** (8.5" × 11"), `0.3"` padding on all sides → usable text width
  ≈ **7.9"**, which is roughly **95–105 characters per full line**.
- **Calibri 11pt**, line-height 1.2, **justified** text.
- Content that overflows the single page is **cut off** (`overflow: hidden`),
  not pushed to a second page. Never let the tailored output overflow.

Because of this, keep the total volume tight. As a rule of thumb, the total
number of shown bullets across work + selected projects should stay small
enough to fit one page for the candidate's content density — prefer fewer,
higher-impact bullets over exhaustive coverage.

## Section order (fixed by the template)

1. Header (name + contact)
2. Education
3. Technical Skills
4. Work Experience
5. Relevant Projects

The skills table has a fixed label column (~1.6"); keep category labels short
so they don't wrap.

## Tailoring approach

- **Lead with the JD's core domain.** Order projects and skills rows so the
  most JD-relevant content appears first. A backend/infra JD should lead with
  backend work; a frontend JD with frontend work.
- **Select, don't dump.** Include only the projects, bullets, and skills rows
  the JD actually calls for. Deselect the rest. Relevance beats completeness.
- **Weave JD keywords naturally.** Incorporate the JD's must-have hard skills
  and tools into existing bullets so the resume reads coherently — never
  bolt on a keyword that isn't supported by real experience, and never invent
  experience the candidate doesn't have.
- **Quantify impact** where the master resume supports it (scale, latency,
  users, %, $). Do not fabricate numbers.
- **Strong action verbs, past tense, no first person.** No "I"/"my".
- **No em dashes.** Use commas, colons, or restructure the sentence.

## Bolding

Bullets support inline `<b>` bolding in the tailored output. Use it sparingly
to draw the eye to the terms that match the JD's must-haves — typically the
key tool/skill/metric in a bullet, not whole sentences. Plain text everywhere
else (skills lists, keywords) — no markdown asterisks, no stray tags.

## Skills rows

Return every master skill row (plus any JD-relevant skills worth adding), each
flagged selected/not-selected. Select only the rows the JD calls for, ordered
with the most JD-relevant category first. Keep each row's items readable on a
single line where possible given the width budget above.
