const KEYWORDS = [
  "Java", "Spring Boot", "Microservices", "REST APIs", "Kafka", "GraphQL", "SQL",
  "Kubernetes", "Docker", "Terraform", "AWS", "Google Cloud Platform", "GCP", "Datadog",
  "Python", "TypeScript", "JavaScript", "React", "Node.js", "CI/CD", "Distributed systems",
  "System design", "Observability", "Machine learning", "Generative AI", "LLM", "AI agents",
  "MCP", "RAG", "Agile", "Data structures", "API integrations",
];

function includes(text, term) {
  const aliases = { "Google Cloud Platform": ["google cloud platform", "gcp"], "REST APIs": ["rest api", "restful"], "LLM": ["llm", "large language model"], "AI agents": ["ai agent", "agentic ai"], "CI/CD": ["ci/cd", "continuous integration"], "API integrations": ["api integration", "third-party api"] };
  return (aliases[term] || [term.toLowerCase()]).some((value) => text.includes(value));
}

export function tailorResume(job, resumeText = "") {
  const jobText = `${job.title || ""} ${job.description || ""}`.toLowerCase();
  const resume = resumeText.toLowerCase();
  const required = KEYWORDS.filter((term) => includes(jobText, term));
  const matched = required.filter((term) => includes(resume, term));
  const suggested = required.filter((term) => !includes(resume, term)).slice(0, 8);
  const draft = suggested.length
    ? `${resumeText.trim()}\n\nTAILORING NOTES — ${job.company} · ${job.title}\nOnly weave in a term below where it truthfully reflects your work. Do not claim unearned experience.\n${suggested.map((term) => `• ${term}`).join("\n")}`
    : resumeText.trim();
  return { matched, suggested, draft };
}
