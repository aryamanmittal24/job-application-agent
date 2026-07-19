import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { scoreJob, stripHtml } from "./lib/matcher.mjs";

const PORT = Number(process.env.JOB_AGENT_API_PORT || 4010);
const DB_PATH = resolve(process.env.JOB_AGENT_DB || "data/job-agent.sqlite");
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'greenhouse',
  token TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  last_error TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  url TEXT NOT NULL,
  description TEXT,
  published_at TEXT,
  updated_at TEXT,
  discovered_at TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'review',
  match_data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new',
  applied_at TEXT,
  UNIQUE(source_id, external_id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
)`);
db.exec("CREATE INDEX IF NOT EXISTS jobs_score_idx ON jobs(score DESC)");
db.exec("CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status)");

const DEFAULT_PROFILE = {
  firstName: "", lastName: "", email: "", phone: "", location: "",
  linkedin: "", github: "", portfolio: "", yearsExperience: 0,
  preferredTitles: ["software engineer"], preferredLocations: ["remote"],
  excludedCompanies: [], skills: [], resumeText: "", answers: [],
};
const DEFAULT_SOURCES = [
  ["Figma", "figma"], ["Stripe", "stripe"],
  ["Cloudflare", "cloudflare"], ["Datadog", "datadog"],
];

db.prepare("INSERT OR IGNORE INTO profile (id, data, updated_at) VALUES (1, ?, ?)").run(JSON.stringify(DEFAULT_PROFILE), new Date().toISOString());
const insertSource = db.prepare("INSERT OR IGNORE INTO sources (company, provider, token) VALUES (?, 'greenhouse', ?)");
for (const [company, token] of DEFAULT_SOURCES) insertSource.run(company, token);

function getProfile() {
  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  return { ...DEFAULT_PROFILE, ...JSON.parse(row.data) };
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function cors(req, res) {
  const origin = req.headers.origin || "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.startsWith("chrome-extension://")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicJob(row) {
  return {
    ...row,
    match: JSON.parse(row.match_data || "{}"),
    match_data: undefined,
  };
}

function rescoreAll(profile) {
  const rows = db.prepare("SELECT * FROM jobs").all();
  const update = db.prepare("UPDATE jobs SET score = ?, verdict = ?, match_data = ? WHERE id = ?");
  for (const job of rows) {
    const match = scoreJob(job, profile);
    update.run(match.score, match.verdict, JSON.stringify(match), job.id);
  }
}

async function syncSource(source, profile) {
  try {
    const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.token)}/jobs?content=true`);
    if (!response.ok) throw new Error(`Greenhouse returned ${response.status}`);
    const payload = await response.json();
    const upsert = db.prepare(`INSERT INTO jobs (
      source_id, external_id, company, title, location, url, description,
      published_at, updated_at, discovered_at, score, verdict, match_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id, external_id) DO UPDATE SET
      title=excluded.title, location=excluded.location, url=excluded.url,
      description=excluded.description, published_at=excluded.published_at,
      updated_at=excluded.updated_at, score=excluded.score,
      verdict=excluded.verdict, match_data=excluded.match_data`);
    let imported = 0;
    for (const item of payload.jobs || []) {
      const job = {
        company: source.company,
        title: item.title || "Untitled role",
        location: item.location?.name || "Not specified",
        description: stripHtml(item.content || ""),
      };
      const match = scoreJob(job, profile);
      upsert.run(
        source.id, String(item.id), source.company, job.title, job.location,
        item.absolute_url, job.description, item.first_published || null,
        item.updated_at || null, new Date().toISOString(), match.score,
        match.verdict, JSON.stringify(match),
      );
      imported += 1;
    }
    db.prepare("UPDATE sources SET last_synced_at = ?, last_error = NULL WHERE id = ?").run(new Date().toISOString(), source.id);
    return { company: source.company, imported };
  } catch (error) {
    db.prepare("UPDATE sources SET last_error = ? WHERE id = ?").run(error.message, source.id);
    return { company: source.company, imported: 0, error: error.message };
  }
}

async function syncAll() {
  const sources = db.prepare("SELECT * FROM sources WHERE enabled = 1").all();
  const profile = getProfile();
  return Promise.all(sources.map((source) => syncSource(source, profile)));
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true, database: DB_PATH });
    }
    if (req.method === "GET" && url.pathname === "/api/profile") {
      return json(res, 200, getProfile());
    }
    if (req.method === "PUT" && url.pathname === "/api/profile") {
      const incoming = await body(req);
      const profile = { ...getProfile(), ...incoming };
      db.prepare("UPDATE profile SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(profile), new Date().toISOString());
      rescoreAll(profile);
      return json(res, 200, profile);
    }
    if (req.method === "GET" && url.pathname === "/api/sources") {
      return json(res, 200, db.prepare("SELECT * FROM sources ORDER BY company").all());
    }
    if (req.method === "POST" && url.pathname === "/api/sources") {
      const incoming = await body(req);
      const token = String(incoming.token || "").trim().toLowerCase();
      const company = String(incoming.company || token).trim();
      if (!token || !company) return json(res, 400, { error: "Company and board token are required" });
      db.prepare("INSERT OR IGNORE INTO sources (company, provider, token) VALUES (?, 'greenhouse', ?)").run(company, token);
      return json(res, 201, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/sync") {
      return json(res, 200, { results: await syncAll() });
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const q = `%${(url.searchParams.get("q") || "").trim()}%`;
      const status = url.searchParams.get("status") || "all";
      const minScore = Number(url.searchParams.get("minScore") || 0);
      const limit = Math.min(200, Number(url.searchParams.get("limit") || 80));
      const rows = db.prepare(`SELECT * FROM jobs
        WHERE score >= ? AND (? = 'all' OR status = ?)
          AND (title LIKE ? OR company LIKE ? OR location LIKE ? OR description LIKE ?)
        ORDER BY score DESC, COALESCE(published_at, updated_at, discovered_at) DESC
        LIMIT ?`).all(minScore, status, status, q, q, q, q, limit);
      return json(res, 200, rows.map(publicJob));
    }
    if (req.method === "GET" && url.pathname === "/api/stats") {
      const row = db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN score >= 72 THEN 1 ELSE 0 END) AS strong,
        SUM(CASE WHEN status = 'saved' THEN 1 ELSE 0 END) AS saved,
        SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) AS applied
        FROM jobs`).get();
      return json(res, 200, row);
    }
    const statusMatch = url.pathname.match(/^\/api\/jobs\/(\d+)\/status$/);
    if (req.method === "PATCH" && statusMatch) {
      const incoming = await body(req);
      const allowed = new Set(["new", "saved", "opened", "applied", "skipped", "interview", "rejected"]);
      if (!allowed.has(incoming.status)) return json(res, 400, { error: "Invalid status" });
      db.prepare("UPDATE jobs SET status = ?, applied_at = CASE WHEN ? = 'applied' THEN ? ELSE applied_at END WHERE id = ?")
        .run(incoming.status, incoming.status, new Date().toISOString(), Number(statusMatch[1]));
      return json(res, 200, { ok: true });
    }
    const questionsMatch = url.pathname.match(/^\/api\/jobs\/(\d+)\/questions$/);
    if (req.method === "GET" && questionsMatch) {
      const job = db.prepare(`SELECT jobs.external_id, sources.token FROM jobs
        JOIN sources ON sources.id = jobs.source_id WHERE jobs.id = ?`).get(Number(questionsMatch[1]));
      if (!job) return json(res, 404, { error: "Job not found" });
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.token)}/jobs/${encodeURIComponent(job.external_id)}?questions=true`);
      if (!response.ok) return json(res, response.status, { error: "Could not load application questions" });
      const payload = await response.json();
      return json(res, 200, { questions: payload.questions || [], locationQuestions: payload.location_questions || [], compliance: payload.compliance || [] });
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Unexpected error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Job Agent API: http://127.0.0.1:${PORT}`);
  const count = db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count;
  if (!count) syncAll().then((results) => console.log("Initial Greenhouse sync complete", results));
});
