const OLLAMA_URL = process.env.JOB_AGENT_OLLAMA_URL || "http://127.0.0.1:11434";
export const LOCAL_MODEL = process.env.JOB_AGENT_OLLAMA_MODEL || "qwen3:1.7b";

async function ollama(path, options = {}) {
  const response = await fetch(`${OLLAMA_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  return response.json();
}

export async function localModelStatus() {
  try {
    const data = await ollama("/api/tags");
    const models = Array.isArray(data.models) ? data.models : [];
    const installed = models.some((model) => model.name === LOCAL_MODEL || model.name?.startsWith(`${LOCAL_MODEL}:`));
    return { available: true, installed, model: LOCAL_MODEL, url: OLLAMA_URL };
  } catch (error) {
    return { available: false, installed: false, model: LOCAL_MODEL, url: OLLAMA_URL, error: error.message };
  }
}

function extractJson(value) {
  const fenced = String(value || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || String(value || "");
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Local model did not return JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function reviewJobWithLocalModel({ job, profile, deterministicMatch }) {
  const prompt = [
    "You are a conservative job-match reviewer. Never invent experience, skills, degree, work authorization, or location eligibility.",
    "Use the deterministic score as an input, not as a fact. Return JSON only with this shape:",
    '{"jdFit":0,"experienceFit":0,"qualificationFit":0,"locationFit":0,"confidence":"low|medium|high","missingMustHaves":[],"evidence":[],"recommendation":"apply|review|skip"}',
    "Score each dimension from 0 to 100. Treat an explicit required qualification or seniority mismatch as more important than keyword overlap.",
    `Deterministic match: ${JSON.stringify(deterministicMatch)}`,
    `Profile: ${JSON.stringify({ yearsExperience: profile.yearsExperience, preferredTitles: profile.preferredTitles, preferredLocations: profile.preferredLocations, education: profile.education, skills: profile.skills, resumeText: profile.resumeText })}`,
    `Job: ${JSON.stringify({ title: job.title, company: job.company, location: job.location, description: job.description })}`,
  ].join("\n\n");
  const data = await ollama("/api/generate", {
    method: "POST",
    body: JSON.stringify({ model: LOCAL_MODEL, prompt, stream: false, format: "json", options: { temperature: 0, num_ctx: 8192 } }),
  });
  const parsed = extractJson(data.response);
  const score = (value, fallback = 50) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
  };
  return {
    jdFit: score(parsed.jdFit, score(deterministicMatch.score)),
    experienceFit: score(parsed.experienceFit),
    qualificationFit: score(parsed.qualificationFit),
    locationFit: score(parsed.locationFit),
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "low",
    missingMustHaves: Array.isArray(parsed.missingMustHaves) ? parsed.missingMustHaves.map(String).slice(0, 8) : [],
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(String).slice(0, 8) : [],
    recommendation: ["apply", "review", "skip"].includes(parsed.recommendation) ? parsed.recommendation : "review",
  };
}
