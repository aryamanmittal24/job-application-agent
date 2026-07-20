import { createHash } from "node:crypto";

export const PROFILE_COMPACT_VERSION = 1;

const list = (value) => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
  : [];

export function buildProfileCompact(profile = {}) {
  return {
    version: PROFILE_COMPACT_VERSION,
    yearsExperience: Number(profile.yearsExperience || 0),
    currentTitle: String(profile.currentTitle || "").trim(),
    currentCompany: String(profile.currentCompany || "").trim(),
    targetRoles: list(profile.preferredTitles),
    preferredLocations: list(profile.preferredLocations),
    skills: list(profile.skills),
    education: {
      degree: String(profile.degree || "").trim(),
      school: String(profile.school || "").trim(),
      graduationYear: String(profile.graduationYear || "").trim(),
    },
    workAuthorization: String(profile.workAuthorization || "").trim(),
    requiresSponsorship: String(profile.requiresSponsorship || "").trim(),
    achievements: String(profile.achievements || "").trim().slice(0, 4000),
  };
}

export function hashCompact(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
