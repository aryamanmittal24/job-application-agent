import { createHash } from "node:crypto";
import { stripHtml } from "./matcher.mjs";

export const JOB_FEATURES_VERSION = 1;

const SKILLS = [
  "javascript", "typescript", "python", "java", "go", "rust", "c++", "c#", "kotlin", "scala",
  "react", "next.js", "node.js", "django", "fastapi", "spring", "spring boot", "aws", "gcp", "azure",
  "docker", "kubernetes", "postgresql", "mysql", "mongodb", "redis", "graphql", "rest", "rest apis",
  "terraform", "pytorch", "tensorflow", "machine learning", "microservices", "kafka", "spark", "sql",
];
const DEGREE_TERMS = ["bachelor", "b.tech", "btech", "master", "m.tech", "mtech", "phd", "computer science", "engineering", "technology"];

const unique = (items) => [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];

function years(text) {
  const matches = [...text.matchAll(/(?:at least|minimum of|more than)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)(?=[^.!?\n]{0,70}(?:experience|professional|software|engineering|development|building|working))/gi)]
    .map((match) => Number(match[1])).filter((value) => value < 20);
  return matches.length ? Math.min(...matches) : null;
}

function seniority(title, text) {
  const value = `${title} ${text}`.toLowerCase();
  if (/\b(intern|internship|graduate|new grad)\b/.test(value)) return "intern";
  if (/\b(principal|staff|distinguished|architect|director|head|vp|vice president)\b/.test(value)) return "staff_plus";
  if (/\b(senior|sr\.?|iii|3)\b/.test(value)) return "senior";
  if (/\b(ii|2|mid[- ]level)\b/.test(value)) return "sde2";
  if (/\b(junior|associate|i|1|entry[- ]level)\b/.test(value)) return "sde1";
  return "unspecified";
}

function roleFamily(title) {
  const value = title.toLowerCase();
  if (/\b(data scientist|data science)\b/.test(value)) return "data_science";
  if (/\b(machine learning|ml|ai)\b/.test(value)) return "machine_learning";
  if (/\b(devops|sre|site reliability|platform)\b/.test(value)) return "platform_devops";
  if (/\b(frontend|front-end|react|ui)\b/.test(value)) return "frontend_engineering";
  if (/\b(backend|back-end|java|api)\b/.test(value)) return "backend_engineering";
  if (/\b(engineer|developer|sde|software)\b/.test(value)) return "software_engineering";
  return "other";
}

function locationFeatures(raw) {
  const value = String(raw || "").trim();
  const lower = value.toLowerCase();
  const cities = unique(["bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "delhi", "noida", "gurugram", "chennai", "amsterdam", "london", "new york", "seattle"]
    .filter((city) => lower.includes(city)));
  const countries = unique(["india", "united states", "usa", "canada", "uk", "netherlands", "germany", "france", "europe"]
    .filter((country) => lower.includes(country)));
  const workMode = /hybrid/.test(lower) ? "hybrid" : /remote/.test(lower) ? "remote" : /onsite|on-site|office/.test(lower) ? "onsite" : "unspecified";
  return { raw: value, cities, countries, workMode };
}

export function extractJobFeatures(job = {}) {
  const title = stripHtml(job.title || "").trim();
  const description = stripHtml(job.description || "");
  const text = `${title} ${description}`;
  const lower = text.toLowerCase();
  const required = unique(SKILLS.filter((skill) => lower.includes(skill)));
  const minYearsExperience = years(text);
  const degreeMatches = unique(DEGREE_TERMS.filter((term) => lower.includes(term)));
  const mustHave = required.filter((skill) => new RegExp(`(?:required|must have|experience with|proficient|strong).*${skill.replace(/[.+]/g, "\\$&")}`, "i").test(text));
  const disqualifiers = [];
  if (/security clearance required|must be eligible to work/i.test(text)) disqualifiers.push("work_authorization_may_be_required");
  return {
    version: JOB_FEATURES_VERSION,
    title,
    roleFamily: roleFamily(title),
    seniority: seniority(title, description),
    minYearsExperience,
    maxYearsExperience: minYearsExperience === null ? null : minYearsExperience + 4,
    location: locationFeatures(job.location),
    skills: { all: required, mustHave: mustHave.length ? mustHave : required.slice(0, 8), niceToHave: required.slice(mustHave.length ? mustHave.length : 8, 16) },
    qualifications: { degreeRequired: /bachelor|b\.tech|btech|master|m\.tech|mtech|phd|degree required/i.test(text), degrees: degreeMatches },
    disqualifiers,
    descriptionChars: description.length,
  };
}

export function hashJobFeatures(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
