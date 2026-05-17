import type { ProjectEntry, WorkEntry, SkillsMap } from "../data/resumeData";

export default function generateResumeHTML(
    selectedProjects: string[],
    allProjects: ProjectEntry[],
    skills: SkillsMap,
    workExp: WorkEntry[]
): string {
    const selObjs = allProjects.filter((p) => selectedProjects.includes(p.id));

    const projectsHTML = selObjs
        .map(
            (p) =>
                `<div class="project-entry"><div class="project-row"><span class="project-title">${p.title}</span><span class="project-date">${p.date}</span></div><ul class="project-bullets">${p.bullets.map((b) => `<li>${b}</li>`).join("")}</ul></div>`
        )
        .join("");

    const skillsHTML = Object.entries(skills)
        .map(([k, v]) => `<tr><td>${k}:</td><td>${v}</td></tr>`)
        .join("");

    const workHTML = workExp
        .map(
            (j) =>
                `<div class="job-entry"><div class="job-row"><span class="job-title">${j.title}</span><span class="job-date">${j.date}</span></div><ul class="job-bullets">${j.bullets.map((b) => `<li>${b}</li>`).join("")}</ul></div>`
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
  <title>Adwait Pradip Relekar</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Carlito','Calibri',sans-serif; font-size: 11pt; line-height: 1.2; color: #000; background: #fff; text-align: justify; }
    .page { width: 8.5in; height: 11in; max-height: 11in; overflow: hidden; margin: 0 auto; padding: 0.3in 0.3in 0.56in 0.3in; }
    .header { text-align: center; margin-bottom: 3px; }
    .header h1 { font-size: 12pt; font-weight: 700; letter-spacing: 0.5px; }
    .header .contact { font-size: 11pt; margin-top: 1px; }
    .header .contact a { color: #000; text-decoration: none; }
    .section { margin-top: 4px; }
    .section-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; padding-bottom: 1px; margin-bottom: 3px; letter-spacing: 0.3px; display: inline-block; border-bottom: 1px solid #000; }
    .edu-entry { margin-bottom: 2px; }
    .edu-row, .job-row, .project-row { display: flex; justify-content: space-between; align-items: baseline; }
    .edu-school, .job-title, .project-title { font-weight: 700; }
    .edu-date, .job-date, .project-date { font-weight: 700; white-space: nowrap; }
    .skills-table { width: 100%; border-collapse: collapse; }
    .skills-table td { padding: 0 4px 0 0; vertical-align: top; font-size: 11pt; }
    .skills-table td:first-child { font-weight: 700; white-space: nowrap; width: 1.6in; min-width: 1.6in; padding-right: 8px; }
    .job-entry, .project-entry { margin-bottom: 3px; }
    .job-bullets, .project-bullets { margin-top: 1px; padding-left: 14px; }
    .job-bullets li, .project-bullets li { margin-bottom: 1px; list-style-type: disc; }
    @media print {
      body { background: #fff; }
      .page { width: 100%; margin: 0; padding: 0.3in 0.3in 0.56in 0.3in; }
      @page { size: letter; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Adwait Pradip Relekar</h1>
      <div class="contact">
        Redmond, WA &nbsp;|&nbsp; <a href="mailto:adrelekar25@gmail.com">adrelekar25@gmail.com</a> &nbsp;|&nbsp; (206) 670-6509 &nbsp;|&nbsp; <a href="https://www.linkedin.com/in/relekaradwait/">linkedin.com/in/relekaradwait/</a>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Education:</div>
      <div class="edu-entry">
        <div class="edu-row">
          <span class="edu-school">Northeastern University, Boston, MA</span>
          <span class="edu-date">Dec 2025</span>
        </div>
        <div>Master of Science, Computer Software Engineering, 3.84/4.0</div>
        <div>Relevant Courses: Mobile &amp; Web Development, Web Tools, Data Structures &amp; Algorithms, DB Design, UI/UX, Big Data Indexing</div>
      </div>
      <div class="edu-entry">
        <div class="edu-row">
          <span class="edu-school">MIT College of Engineering, Pune University, India</span>
          <span class="edu-date">May 2019</span>
        </div>
        <div>Bachelor of Engineering, Electronics &amp; Telecommunications</div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Technical Skills:</div>
      <table class="skills-table">${skillsHTML}</table>
    </div>
    <div class="section">
      <div class="section-title">Work Experience:</div>
      ${workHTML}
    </div>
    <div class="section">
      <div class="section-title">Relevant Projects:</div>
      ${projectsHTML}
    </div>
  </div>
</body>
</html>`;
}