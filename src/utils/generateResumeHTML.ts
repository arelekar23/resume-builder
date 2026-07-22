import type { ProjectEntry, WorkEntry, SkillsMap } from "../data/resumeData";
import type { PersonalInfo, EducationRow, SectionKey } from "./profile";

export default function generateResumeHTML(
  selectedProjects: string[],
  selectedSkills: string[],
  allProjects: ProjectEntry[],
  skills: SkillsMap,
  workExp: WorkEntry[],
  excludedBullets: Set<string>,
  personal: PersonalInfo,
  education: EducationRow[],
  summary: string,
  sectionOrder: SectionKey[],
): string {
  const selObjs = allProjects.filter((p) => selectedProjects.includes(p.id));

  // Links get an href but display the bare URL.
  const displayUrl = (u: string) =>
    u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const contactHTML = [
    personal.location,
    personal.email ? `<a href="mailto:${personal.email}">${personal.email}</a>` : "",
    personal.phone,
    personal.linkedin_url
      ? `<a href="${personal.linkedin_url}">${displayUrl(personal.linkedin_url)}</a>`
      : "",
    personal.github_url
      ? `<a href="${personal.github_url}">${displayUrl(personal.github_url)}</a>`
      : "",
  ]
    .filter((part) => part && part.trim())
    .join(" | ");

  const educationHTML = education
    .map((e) => {
      const details = e.details && e.details.trim() ? `<div>${e.details}</div>` : "";
      return `<div class="edu-entry"><div class="edu-row"><span class="edu-school">${e.school}</span><span class="edu-date">${e.date}</span></div><div>${e.degree}</div>${details}</div>`;
    })
    .join("");

  const projectsHTML = selObjs
    .map((p) => {
      const bullets = p.bullets.filter((b) => !excludedBullets.has(b.id));
      return `<div class="project-entry"><div class="project-row"><span class="project-title">${p.title}</span><span class="project-date">${p.date}</span></div><ul class="project-bullets">${bullets.map((b) => `<li>${b.text}</li>`).join("")}</ul></div>`;
    })
    .join("")

  const skillsHTML = Object.entries(skills)
    .filter(([k]) => selectedSkills.includes(k))
    .map(([k, v]) => `<tr><td>${k}:</td><td>${v}</td></tr>`)
    .join("");

  const workHTML = workExp
    .map((j) => {
      const bullets = j.bullets.filter((b) => !excludedBullets.has(b.id));
      return `<div class="job-entry"><div class="job-row"><span class="job-title">${j.title}</span><span class="job-date">${j.date}</span></div><ul class="job-bullets">${bullets.map((b) => `<li>${b.text}</li>`).join("")}</ul></div>`;
    })
    .join("");

  // Assemble each section's body, then emit them in the user's chosen order,
  // skipping any that are empty.
  const SECTIONS: Record<SectionKey, { title: string; body: string }> = {
    summary: {
      title: "Summary:",
      body: summary.trim() ? `<div class="summary-body">${summary}</div>` : "",
    },
    education: { title: "Education:", body: educationHTML },
    skills: {
      title: "Technical Skills:",
      body: skillsHTML ? `<table class="skills-table">${skillsHTML}</table>` : "",
    },
    experience: { title: "Work Experience:", body: workHTML },
    projects: { title: "Relevant Projects:", body: projectsHTML },
  };
  const sectionsHTML = sectionOrder
    .map((key) => {
      const s = SECTIONS[key];
      if (!s || !s.body.trim()) return "";
      return `<div class="section"><div class="section-title">${s.title}</div>${s.body}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Resume</title>
  <style>
  /* Prefer the viewer's locally installed Calibri; fall back to the
     self-hosted, OFL-licensed Carlito (metric-compatible) when it's absent.
     Only Carlito is ever served — Calibri itself is never distributed. */
  @font-face {
    font-family: 'Calibri';
    font-style: normal;
    font-weight: 400;
    font-display: block;
    src: local('Calibri'), url('/fonts/calibri-regular.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Calibri';
    font-style: normal;
    font-weight: 700;
    font-display: block;
    src: local('Calibri Bold'), local('Calibri'), url('/fonts/calibri-bold.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Calibri';
    font-style: italic;
    font-weight: 400;
    font-display: block;
    src: local('Calibri Italic'), local('Calibri'), url('/fonts/calibri-italic.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Calibri';
    font-style: italic;
    font-weight: 700;
    font-display: block;
    src: local('Calibri Bold Italic'), local('Calibri'), url('/fonts/calibri-bold-italic.woff2') format('woff2');
  }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
    font-family: 'Calibri','Carlito',sans-serif; font-size: 11pt; line-height: 1.2; color: #000; background: #fff; text-align: justify;
text-justify: inter-word;
word-spacing: -0.01em;}
    .page { width: 8.5in; height: 11in; max-height: 11in; overflow: hidden; margin: 0 auto; padding: 0.3in; }
    .summary-body { font-size: 11pt; }
    .header { text-align: center; margin-bottom: 8px; }
    .header h1 { font-size: 12pt; font-weight: 700; letter-spacing: 0.5px; }
    .header .contact { font-size: 11pt; margin-top: 1px; }
    .header .contact a { color: #0563C1; text-decoration: underline; }
    .section { margin-top: 5px; }
    .section-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.3px; display: inline-block; border-bottom: 1px solid #000; line-height: 0.85; padding-bottom: 2px; }
    .edu-entry { margin-bottom: 2px; }
    .edu-row, .job-row, .project-row { display: flex; justify-content: space-between; align-items: baseline; }
    .edu-school, .job-title, .project-title { font-weight: 700; }
    .edu-date, .job-date, .project-date { font-weight: 700; white-space: nowrap; }
    .skills-table { width: 100%; border-collapse: collapse; }
    .skills-table td { padding: 0 4px 0 0; vertical-align: top; font-size: 11pt; }
    .skills-table td:first-child { font-weight: 700; white-space: nowrap; width: 1.6in; min-width: 1.6in; padding-right: 8px; }
    .job-entry, .project-entry { margin-bottom: 3px; }
    .job-bullets, .project-bullets { margin-top: 1px; padding-left: 18px; }
    .job-bullets li, .project-bullets li { margin-bottom: 1px; list-style-type: '•  '; padding-left: 2px; }
    @media print {
      body { background: #fff; }
      .page { width: 100%; margin: 0; padding: 0.3in; }
      @page { size: letter; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>${personal.full_name}</h1>
      <div class="contact">
        ${contactHTML}
      </div>
    </div>
    ${sectionsHTML}
  </div>
</body>
</html>`;
}