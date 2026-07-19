export function sectionResumeText(text) {
  const clean = String(text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const headings = [...clean.matchAll(/^(education|technical skills|experience|projects|additional)\s*$/gim)];
  const sections = { headline: headings.length ? clean.slice(0, headings[0].index).trim() : "", education: "", skills: "", experience: "", projects: "", additional: "" };
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? clean.length;
    const headingName = heading[1].toLowerCase();
    const key = headingName === "technical skills" ? "skills" : headingName;
    sections[key] = clean.slice(start, end).trim();
  }
  // Some PDF extractors place the contact header at the end under “Additional”.
  // Keep it editable in the header field, where the application profile expects it.
  if (!sections.headline && /@|\blinkedin\b|\bgithub\b/i.test(sections.additional)) {
    sections.headline = sections.additional;
    sections.additional = "";
  }
  if (!headings.length) sections.additional = clean;
  return sections;
}

export function joinedResumeText(sections) {
  const labels = { headline: "", education: "EDUCATION", skills: "TECHNICAL SKILLS", experience: "EXPERIENCE", projects: "PROJECTS", additional: "ADDITIONAL" };
  return Object.entries(labels).map(([key, label]) => {
    const value = String(sections[key] || "").trim();
    return value ? `${label ? `${label}\n` : ""}${value}` : "";
  }).filter(Boolean).join("\n\n");
}
