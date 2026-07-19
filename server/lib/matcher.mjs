const TECH_SKILLS = [
  "javascript", "typescript", "python", "java", "go", "rust", "c++", "c#",
  "react", "next.js", "node.js", "django", "fastapi", "spring", "aws", "gcp",
  "azure", "docker", "kubernetes", "postgresql", "mysql", "mongodb", "redis",
  "graphql", "rest", "terraform", "pytorch", "tensorflow", "machine learning",
];

export function stripHtml(value = "") {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTerms(profile) {
  const explicit = Array.isArray(profile.skills) ? profile.skills : [];
  const corpus = `${profile.resumeText || ""} ${explicit.join(" ")}`.toLowerCase();
  const detected = TECH_SKILLS.filter((skill) => corpus.includes(skill));
  return [...new Set([...explicit.map((skill) => skill.toLowerCase().trim()), ...detected])]
    .filter(Boolean);
}

function requiredYears(text) {
  const matches = [...text.matchAll(/(?:at least\s+)?(\d{1,2})\+?\s*(?:years?|yrs?)(?=[^.!?\n]{0,45}(?:experience|professional|software|developing|building|engineering))/gi)];
  if (!matches.length) return null;
  return Math.min(...matches.map((match) => Number(match[1])).filter((value) => value < 20));
}

const NON_ENGINEERING_ROLES = /\b(?:technical\s+)?(?:program|product|project|account|partner|operations|people|engineering|marketing|sales|recruiting|customer success|support|business|compliance|risk)\s+manager\b|\b(?:director|vice president|vp|recruiter|designer|analyst|consultant)\b/i;
const TOO_SENIOR = /\b(?:staff|principal|distinguished|architect|head of)\b/i;
const ENGINEERING_TERMS = /\b(?:software|backend|back-end|frontend|front-end|full[ -]?stack|platform|systems?|java|application|machine learning|ml|data|site reliability|sre|developer|sde)\b/i;

function targetRoleDecision(title) {
  if (NON_ENGINEERING_ROLES.test(title)) return "This is a management or non-engineering role";
  if (TOO_SENIOR.test(title)) return "Role seniority is above the SDE I–III range";
  if (!ENGINEERING_TERMS.test(title) || !/\b(engineer|developer|sde)\b/i.test(title)) return "This is outside your software-engineering target roles";
  return "";
}

export function scoreJob(job, profile = {}) {
  const text = `${job.title || ""} ${job.description || ""}`.toLowerCase();
  const skills = normalizedTerms(profile);
  const matchedSkills = skills.filter((skill) => text.includes(skill)).slice(0, 8);
  const wantedTitles = (profile.preferredTitles || []).map((title) => title.toLowerCase());
  const wantedLocations = (profile.preferredLocations || []).map((place) => place.toLowerCase());
  const excluded = (profile.excludedCompanies || []).map((company) => company.toLowerCase());
  const experienceNeeded = requiredYears(text);
  const experienceHave = Number(profile.yearsExperience || 0);
  const title = (job.title || "").toLowerCase();

  const targetRoleIssue = targetRoleDecision(job.title || "");
  if (targetRoleIssue) {
    return { score: 0, verdict: "skip", matchedSkills, reasons: [targetRoleIssue], experienceNeeded };
  }

  if (excluded.some((company) => (job.company || "").toLowerCase().includes(company))) {
    return { score: 0, verdict: "skip", matchedSkills, reasons: ["Company is on your exclusion list"], experienceNeeded };
  }

  let score = profile.resumeText || skills.length ? 26 : 35;
  const reasons = [];

  if (skills.length) {
    const ratio = matchedSkills.length / Math.max(4, Math.min(skills.length, 10));
    score += Math.round(Math.min(30, ratio * 38));
    reasons.push(matchedSkills.length ? `${matchedSkills.length} profile skills appear in the role` : "No clear skill overlap yet");
  } else {
    reasons.push("Add résumé text to improve this score");
  }

  if (wantedTitles.length) {
    const titleMatch = wantedTitles.some((title) => (job.title || "").toLowerCase().includes(title));
    score += titleMatch ? 22 : -18;
    reasons.push(titleMatch ? "Title matches your target roles" : "Title is outside your preferred role list");
  }

  if (wantedLocations.length) {
    const locationText = (job.location || "").toLowerCase();
    const foreignRemote = /remote/.test(locationText) && /usa|united states|canada|uk|europe|london/.test(locationText);
    const locationMatch = wantedLocations.some((place) => locationText.includes(place)) || (/remote/.test(locationText) && !foreignRemote);
    score += locationMatch ? 10 : -8;
    reasons.push(locationMatch ? "Location fits your preferences" : "Location may need review");
  }

  if (experienceNeeded !== null && experienceHave) {
    if (experienceNeeded <= experienceHave + 1) {
      score += 9;
      reasons.push(`Experience requirement (${experienceNeeded}+ years) is within range`);
    } else {
      score -= Math.min(28, (experienceNeeded - experienceHave) * 7);
      reasons.push(`Role asks for about ${experienceNeeded}+ years; profile has ${experienceHave}`);
    }
  }

  if (experienceHave && /\b(senior|lead|iii|3)\b/.test(title) && experienceHave < 3) {
    score -= 24;
    reasons.push("Senior/SDE III seniority is above your current 1.9 years of experience");
  }
  if (experienceHave >= 1 && /\bintern(?:ship)?\b/.test(title) && !wantedTitles.some((wanted) => /intern/.test(wanted))) {
    score -= 20;
    reasons.push("Internship seniority is below your current professional profile");
  }

  score = Math.max(0, Math.min(98, score));
  const verdict = score >= 72 ? "strong" : score >= 55 ? "possible" : "review";
  return { score, verdict, matchedSkills, reasons: reasons.slice(0, 5), experienceNeeded };
}
