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
        `<div class="project-entry"><div class="project-row"><span class="project-title">${p.title}</span><span class="project-date">${p.date}</span></div><ul class="project-bullets">${p.bullets.map((b) => `<li>${b.text}</li>`).join("")}</ul></div>`
    )
    .join("");

  const skillsHTML = Object.entries(skills)
    .map(([k, v]) => `<tr><td>${k}:</td><td>${v}</td></tr>`)
    .join("");

  const workHTML = workExp
    .map(
      (j) =>
        `<div class="job-entry"><div class="job-row"><span class="job-title">${j.title}</span><span class="job-date">${j.date}</span></div><ul class="job-bullets">${j.bullets.map((b) => `<li>${b.text}</li>`).join("")}</ul></div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AdwaitRelekar_Resume</title>
  <style>
  @font-face {
    font-family: 'Calibri';
    font-style: normal;
    font-weight: 400;
    font-display: block;
    src: url('/fonts/calibri-regular.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Calibri';
    font-style: normal;
    font-weight: 700;
    font-display: block;
    src: url('/fonts/calibri-bold.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Calibri';
    font-style: italic;
    font-weight: 400;
    font-display: block;
    src: url('/fonts/calibri-italic.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Calibri';
    font-style: italic;
    font-weight: 700;
    font-display: block;
    src: url('/fonts/calibri-bold-italic.woff2') format('woff2');
  }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
    font-family: 'Calibri','Carlito',sans-serif; font-size: 11pt; line-height: 1.2; color: #000; background: #fff; text-align: justify; text-align: justify;
text-justify: inter-word;
word-spacing: -0.01em;}
    .page { width: 8.5in; height: 11in; max-height: 11in; overflow: hidden; margin: 0 auto; padding: 0.3in 0.3in 0.56in 0.3in; }
    .header { text-align: center; margin-bottom: 8px; }
    .header h1 { font-size: 12pt; font-weight: 700; letter-spacing: 0.5px; }
    .header .contact { font-size: 11pt; margin-top: 1px; }
    .header .contact a { color: #0563C1; text-decoration: underline; }
    .section { margin-top: 5px; }
    .section-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.3px; display: inline-block; border-bottom: 1px solid #000; line-height: 0.8; }
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
        Redmond, WA | <a href="mailto:adrelekar25@gmail.com">adrelekar25@gmail.com</a> | (206) 670-6509 | <a href="https://www.linkedin.com/in/relekaradwait/">linkedin.com/in/relekaradwait/</a>
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