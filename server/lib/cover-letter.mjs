function firstSentence(value = "") {
  return String(value).replace(/\s+/g, " ").trim().replace(/^[-•]\s*/, "").slice(0, 320);
}

function achievementsFor(profile = {}) {
  return String(profile.achievements || "")
    .split(/\n+/)
    .map(firstSentence)
    .filter(Boolean)
    .slice(0, 2);
}

export function buildCoverLetter(job = {}, profile = {}, match = {}) {
  const name = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Applicant";
  const role = String(job.title || "this role").trim();
  const company = String(job.company || "your company").trim();
  const skills = (match.matchedSkills || profile.skills || []).slice(0, 4);
  const skillPhrase = skills.length ? skills.join(", ") : "reliable software engineering";
  const achievements = achievementsFor(profile);
  const experience = Number(profile.yearsExperience || 0);
  const currentRole = profile.currentTitle ? ` as a ${profile.currentTitle}` : "";
  const currentCompany = profile.currentCompany ? ` at ${profile.currentCompany}` : "";
  const evidence = achievements.length
    ? achievements.map((achievement) => `• ${achievement}`).join("\n")
    : "• I would be glad to discuss the projects and outcomes most relevant to this role.";

  return `Dear Hiring Team,\n\nI am excited to apply for the ${role} position at ${company}. With ${experience ? `${experience} years of experience` : "hands-on experience"}${currentRole}${currentCompany}, I am especially interested in the role's focus on ${skillPhrase}.\n\nMy background aligns with the technical needs described for this position. I would bring a practical, evidence-based approach to building dependable software, collaborating closely with teammates, and learning the systems that matter most to ${company}.\n\nSelected achievements relevant to this application:\n${evidence}\n\nI would welcome the opportunity to explain how my experience with ${skillPhrase} can contribute to the ${role} team. Thank you for your time and consideration.\n\nSincerely,\n${name}`;
}
