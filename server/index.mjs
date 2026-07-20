import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { joinedResumeText, sectionResumeText } from "./lib/resume-parser.mjs";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFParse } from "pdf-parse";
import { scoreJob, stripHtml } from "./lib/matcher.mjs";
import { tailorResume } from "./lib/resume-tailor.mjs";
import { buildCoverLetter } from "./lib/cover-letter.mjs";

const PORT = Number(process.env.JOB_AGENT_API_PORT || 4010);
const DB_PATH = resolve(process.env.JOB_AGENT_DB || "data/job-agent.sqlite");
const TAILORED_RESUME_DIR = resolve(process.env.JOB_AGENT_TAILORED_DIR || "data/tailored-resumes");
const COVER_LETTER_DIR = resolve(process.env.JOB_AGENT_COVER_LETTER_DIR || "data/cover-letters");
mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(TAILORED_RESUME_DIR, { recursive: true });
mkdirSync(COVER_LETTER_DIR, { recursive: true });
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
db.exec(`CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  filename TEXT NOT NULL,
  original_path TEXT,
  raw_text TEXT NOT NULL,
  sections TEXT NOT NULL DEFAULT '{}',
  uploaded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS target_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL,
  compensation_band TEXT NOT NULL,
  career_url TEXT NOT NULL,
  notes TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS tailored_resumes (
  job_id INTEGER PRIMARY KEY,
  keywords TEXT NOT NULL DEFAULT '[]',
  draft_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS cover_letters (
  job_id INTEGER PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
)`);

const DEFAULT_PROFILE = {
  firstName: "", lastName: "", email: "", phone: "", location: "",
  linkedin: "", github: "", portfolio: "", yearsExperience: 0,
  country: "", postalCode: "", currentCompany: "", currentTitle: "", currentStartMonth: "", currentStartYear: "",
  school: "", degree: "", graduationYear: "", workAuthorization: "",
  requiresSponsorship: "",
  achievements: "",
  preferredTitles: ["software engineer"], preferredLocations: ["remote"],
  excludedCompanies: [], skills: [], resumeText: "", answers: [],
};
const DEFAULT_SOURCES = [
  ["Figma", "greenhouse", "figma"], ["Stripe", "greenhouse", "stripe"],
  ["Cloudflare", "greenhouse", "cloudflare"], ["Datadog", "greenhouse", "datadog"],
  ["Airbnb", "greenhouse", "airbnb"], ["Coinbase", "greenhouse", "coinbase"], ["Databricks", "greenhouse", "databricks"],
  ["LinkedIn", "greenhouse", "linkedin"], ["Rubrik", "greenhouse", "rubrik"],
  ["CRED", "lever", "cred"], ["Meesho", "lever", "meesho"],
  ["Diligent", "greenhouse", "diligentcorporation"], ["Britive", "greenhouse", "britive"],
  ["KnowBe4", "greenhouse", "knowbe4"], ["Dialpad", "greenhouse", "dialpad"],
  ["Baya Systems", "greenhouse", "bayasystems"], ["Eudia", "greenhouse", "eudia"],
  ["Point72", "greenhouse", "point72"],
];
const DEFAULT_TARGETS = [
  ["Stripe", "Elite tier", "₹80L - ₹1Cr+ TC", "https://stripe.com/jobs/search?office_locations=Asia-Pacific--Bangalore"],
  ["Google (India)", "Elite tier", "₹65L - ₹95L TC", "https://www.google.com/about/careers/applications/jobs/results/?location=India"],
  ["Meta (Facebook India)", "Elite tier", "₹70L - ₹1Cr TC", "https://www.metacareers.com/jobs/"],
  ["Airbnb", "Elite tier", "₹70L - ₹90L TC", "https://careers.airbnb.com/positions/"],
  ["Rubrik", "Elite tier", "₹75L - ₹90L TC", "https://www.rubrik.com/company/careers"],
  ["Coinbase", "Elite tier", "₹70L - ₹90L TC", "https://www.coinbase.com/careers/positions"],
  ["Booking.com", "Elite tier", "₹60L - ₹85L TC", "https://careers.booking.com/careers"],
  ["Databricks", "Elite tier", "₹70L - ₹95L TC", "https://www.databricks.com/company/careers/open-positions"],
  ["Snowflake", "Elite tier", "₹70L - ₹95L TC", "https://careers.snowflake.com/us/en/search-results"],
  ["Tower Research Capital", "Elite tier", "₹80L - ₹1Cr+ TC", "https://www.tower-research.com/careers/"],
  ["Quadeye", "Elite tier", "₹80L - ₹1Cr+ TC", "https://www.quadeye.com/careers"],
  ["Uber", "Upper mid tier", "₹55L - ₹80L TC", "https://www.uber.com/global/en/careers/list/"],
  ["LinkedIn", "Upper mid tier", "₹55L - ₹75L TC", "https://careers.linkedin.com/"],
  ["Salesforce", "Upper mid tier", "₹50L - ₹75L TC", "https://careers.salesforce.com/en/jobs/"],
  ["ServiceNow", "Upper mid tier", "₹50L - ₹75L TC", "https://careers.servicenow.com/careers"],
  ["Microsoft (India)", "Upper mid tier", "₹50L - ₹75L TC", "https://jobs.careers.microsoft.com/global/en/search"],
  ["Intuit", "Upper mid tier", "₹50L - ₹70L TC", "https://jobs.intuit.com/"],
  ["Walmart Global Tech", "Upper mid tier", "₹45L - ₹65L TC", "https://walmart.wd5.myworkdayjobs.com/WalmartExternal"],
  ["Goldman Sachs", "Upper mid tier", "₹50L - ₹75L TC", "https://higher.gs.com/roles"],
  ["JPMorgan Chase", "Upper mid tier", "₹45L - ₹65L TC", "https://careers.jpmorgan.com/us/en/home"],
  ["American Express", "Upper mid tier", "₹45L - ₹65L TC", "https://aexp.eightfold.ai/careers"],
  ["Morgan Stanley", "Upper mid tier", "₹50L - ₹75L TC", "https://www.morganstanley.com/careers/career-opportunities-search"],
  ["Amazon (India)", "Product and growth tier", "₹45L - ₹65L TC", "https://www.amazon.jobs/en/"],
  ["Atlassian", "Product and growth tier", "₹45L - ₹65L TC", "https://www.atlassian.com/company/careers/all-jobs"],
  ["Adobe", "Product and growth tier", "₹45L - ₹65L TC", "https://careers.adobe.com/us/en"],
  ["Flipkart", "Product and growth tier", "₹40L - ₹65L TC", "https://www.flipkartcareers.com/jobslist"],
  ["Swiggy", "Product and growth tier", "₹40L - ₹65L TC", "https://careers.swiggy.com/"],
  ["Zomato", "Product and growth tier", "₹40L - ₹65L TC", "https://www.zomato.com/careers"],
  ["PayPal", "Product and growth tier", "₹45L - ₹65L TC", "https://careers.pypl.com/"],
  ["Razorpay", "Product and growth tier", "₹40L - ₹65L TC", "https://razorpay.com/jobs/"],
  ["CRED", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://careers.cred.club/"],
  ["Meesho", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://www.meesho.io/careers"],
  ["NVIDIA", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"],
  ["Qualcomm", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://www.qualcomm.com/company/careers"],
  ["Visa", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://corporate.visa.com/en/careers.html"],
  ["Mastercard", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://careers.mastercard.com/us/en"],
  ["Cisco", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://jobs.cisco.com/"],
  ["SAP Labs", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://www.sap.com/about/careers.html"],
  ["Oracle", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://careers.oracle.com/"],
  ["Nutanix", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://www.nutanix.com/careers"],
  ["Arista Networks", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://www.arista.com/en/careers"],
  ["Palo Alto Networks", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://jobs.paloaltonetworks.com/"],
  ["Apple", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://jobs.apple.com/en-in/search"],
  ["Broadcom", "SDE-II ₹40L+ watchlist", "Potential ₹40L+ TC", "https://careers.broadcom.com/"],
];

db.prepare("INSERT OR IGNORE INTO profile (id, data, updated_at) VALUES (1, ?, ?)").run(JSON.stringify(DEFAULT_PROFILE), new Date().toISOString());
const insertSource = db.prepare("INSERT OR IGNORE INTO sources (company, provider, token) VALUES (?, ?, ?)");
for (const [company, provider, token] of DEFAULT_SOURCES) insertSource.run(company, provider, token);
const insertTarget = db.prepare("INSERT OR IGNORE INTO target_companies (company, tier, compensation_band, career_url) VALUES (?, ?, ?, ?)");
for (const target of DEFAULT_TARGETS) insertTarget.run(...target);
db.prepare("UPDATE target_companies SET notes = 'Dream organization' WHERE company = 'JPMorgan Chase' AND (notes IS NULL OR notes = '')").run();
{
  const profile = getProfile();
  if (profile.preferredTitles.length === 1 && profile.preferredTitles[0] === "software engineer") {
    profile.preferredTitles = ["software engineer", "software development engineer", "backend engineer", "backend developer", "platform engineer", "java engineer", "sde"];
    profile.preferredLocations = ["bengaluru", "bangalore", "india"];
    db.prepare("UPDATE profile SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(profile), new Date().toISOString());
  }
}

function getProfile() {
  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  const profile = { ...DEFAULT_PROFILE, ...JSON.parse(row.data) };
  if ((!profile.currentStartMonth || !profile.currentStartYear) && profile.resumeText) {
    const experience = sectionResumeText(profile.resumeText).experience;
    const currentStart = experience.match(/\b([A-Z][a-z]{2,8})\s+(\d{4})\s*[–-]\s*Present/i);
    if (currentStart) {
      const monthNames = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
      profile.currentStartMonth = monthNames[currentStart[1]] || currentStart[1];
      profile.currentStartYear = currentStart[2];
    }
  }
  return profile;
}

function extractProfile(text, current) {
  const sections = sectionResumeText(text);
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean) || "";
  const nameParts = firstLine.split(/\s+/);
  const email = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  const phone = text.match(/(?:\+?\d[\d\s()-]{7,}\d)/)?.[0]?.replace(/\s+/g, "") || "";
  const currentCompany = sections.experience.split("\n").map((line) => line.trim()).find(Boolean)?.split("|")[0]?.trim() || "";
  const titleLine = sections.experience.split("\n").find((line) => /Engineer|Developer|Architect|Manager/i.test(line))?.trim() || "";
  const titleLocation = titleLine.match(/^(.*?(?:Engineer|Developer|Architect|Manager)(?:\s+(?:I{1,4}|V|\d+))?)\s+(.+,\s*(?:India|Netherlands|Germany|France|Europe|USA|United States|Canada|UK))$/i);
  const location = titleLocation?.[2]?.trim() || text.match(/([A-Z][A-Za-z .'-]+,\s*(?:India|Netherlands|Germany|France|Europe|USA|United States|Canada|UK))/)?.[1] || "";
  const currentTitle = titleLocation?.[1]?.trim() || titleLine;
  const country = location.includes(",") ? location.split(",").at(-1)?.trim() || "" : "";
  const dateMatch = sections.experience.match(/([A-Z][a-z]{2})\s+(\d{4})\s*-\s*Present/i);
  const currentStart = sections.experience.match(/\b([A-Z][a-z]{2,8})\s+(\d{4})\s*[–-]\s*Present/i);
  let yearsExperience = Number(current.yearsExperience || 0);
  if (dateMatch) {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const start = new Date(Number(dateMatch[2]), months[dateMatch[1]] ?? 0, 1);
    yearsExperience = Math.max(0, Math.round(((Date.now() - start.getTime()) / 31_556_952_000) * 10) / 10);
  }
  const skillLines = sections.skills.split("\n").filter((line) => line.includes(":"));
  const skills = [...new Set(skillLines.flatMap((line) => line.slice(line.indexOf(":") + 1).split(",").map((skill) => skill.trim())).filter(Boolean))];
  const degreeLine = sections.education.split("\n").find((line) => /engineering|science|technology|degree|bachelor|master/i.test(line) && /\d{4}/.test(line));
  const graduationYear = degreeLine?.match(/(?:19|20)\d{2}/)?.[0] || "";
  const degree = degreeLine?.replace(/\([^)]*\)/g, "").replace(/\s+\d+(?:\.\d+)?\s*(?:CGPA|GPA|Percent).*$/i, "").trim() || "";
  const schoolLine = sections.education.split("\n").find((line) => /university|institute|college/i.test(line))?.trim() || "";
  const school = schoolLine.replace(/\s+[A-Z][A-Za-z.'-]+,\s*[A-Z][A-Za-z .'-]+$/, "").trim();
  return {
    ...current,
    firstName: nameParts[0] || current.firstName,
    lastName: nameParts.slice(1).join(" ") || current.lastName,
    email: email || current.email,
    phone: phone || current.phone,
    location: location || current.location,
    country: country || current.country,
    currentCompany: currentCompany || current.currentCompany,
    currentTitle: currentTitle || current.currentTitle,
    currentStartMonth: currentStart ? ({ Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" }[currentStart[1]] || currentStart[1]) : current.currentStartMonth || "",
    currentStartYear: currentStart?.[2] || current.currentStartYear || "",
    school: school || current.school,
    degree: degree || current.degree,
    graduationYear: graduationYear || current.graduationYear,
    yearsExperience,
    skills: skills.length ? skills : current.skills,
    resumeText: text,
  };
}

function getResume() {
  const row = db.prepare("SELECT * FROM resumes WHERE id = 1").get();
  if (!row) return null;
  return { ...row, sections: JSON.parse(row.sections || "{}") };
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
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
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
    description: stripHtml(row.description || ""),
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

function safeFilename(value) {
  return String(value || "resume").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "resume";
}

function repairStoredResume() {
  const row = db.prepare("SELECT * FROM resumes WHERE id = 1").get();
  if (!row) return;
  const stored = JSON.parse(row.sections || "{}");
  const reparsed = sectionResumeText(row.raw_text || "");
  const storedCount = Object.values(stored).filter((value) => String(value || "").trim()).length;
  const reparsedCount = Object.values(reparsed).filter((value) => String(value || "").trim()).length;
  const hasRecoveredHeader = !String(stored.headline || "").trim() && String(reparsed.headline || "").trim();
  if (reparsedCount <= storedCount && !hasRecoveredHeader) return;
  const rawText = joinedResumeText(reparsed);
  const now = new Date().toISOString();
  db.prepare("UPDATE resumes SET raw_text = ?, sections = ?, updated_at = ? WHERE id = 1")
    .run(rawText, JSON.stringify(reparsed), now);
  const profile = extractProfile(rawText, getProfile());
  db.prepare("UPDATE profile SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(profile), now);
  rescoreAll(profile);
}

repairStoredResume();
rescoreAll(getProfile());

async function syncSource(source, profile) {
  try {
    let postings = [];
    if (source.provider === "greenhouse") {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.token)}/jobs?content=true`);
      if (!response.ok) throw new Error(`Greenhouse returned ${response.status}`);
      const payload = await response.json();
      postings = (payload.jobs || []).map((item) => ({
        id: item.id, title: item.title, location: item.location?.name, description: item.content,
        url: item.absolute_url, publishedAt: item.first_published, updatedAt: item.updated_at,
      }));
    } else if (source.provider === "lever") {
      const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(source.token)}?mode=json`);
      if (!response.ok) throw new Error(`Lever returned ${response.status}`);
      const payload = await response.json();
      postings = (payload || []).map((item) => ({
        id: item.id, title: item.text, location: item.categories?.location || item.categories?.allLocations?.join(", "),
        description: item.descriptionPlain || item.description || "", url: item.hostedUrl || item.applyUrl,
        publishedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
        updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
      }));
    } else {
      throw new Error(`Unsupported public provider: ${source.provider}`);
    }
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
    for (const item of postings) {
      const job = {
        company: source.company,
        title: item.title || "Untitled role",
        location: item.location || "Not specified",
        description: stripHtml(item.description || ""),
      };
      const match = scoreJob(job, profile);
      upsert.run(
        source.id, String(item.id), source.company, job.title, job.location,
        item.url, job.description, item.publishedAt || null,
        item.updatedAt || null, new Date().toISOString(), match.score,
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
    if (req.method === "GET" && url.pathname === "/api/resume") {
      return json(res, 200, getResume());
    }
    if (req.method === "GET" && url.pathname === "/api/resume/file") {
      const resume = getResume();
      if (!resume?.original_path) return json(res, 404, { error: "No original résumé file is available" });
      const file = await readFile(resume.original_path);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": file.length,
        "Content-Disposition": `inline; filename="${resume.filename.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "no-store",
      });
      return res.end(file);
    }
    if (req.method === "POST" && url.pathname === "/api/resume/import") {
      const incoming = await body(req);
      const filename = String(incoming.filename || "resume.pdf").replace(/[^a-zA-Z0-9._ -]/g, "_");
      const buffer = Buffer.from(String(incoming.base64 || ""), "base64");
      if (!buffer.length || buffer.length > 10 * 1024 * 1024) return json(res, 400, { error: "Choose a PDF smaller than 10 MB" });
      if (buffer.subarray(0, 4).toString() !== "%PDF") return json(res, 400, { error: "Only PDF résumés are supported in this version" });
      const parser = new PDFParse({ data: buffer });
      let parsed;
      try { parsed = await parser.getText(); } finally { await parser.destroy(); }
      const rawText = String(parsed.text || "").trim();
      if (!rawText) return json(res, 422, { error: "No readable text was found in this PDF" });
      const sections = sectionResumeText(rawText);
      const resumeDirectory = resolve("data/resumes");
      mkdirSync(resumeDirectory, { recursive: true });
      const originalPath = resolve(resumeDirectory, filename);
      await writeFile(originalPath, buffer);
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO resumes (id, filename, original_path, raw_text, sections, uploaded_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, original_path=excluded.original_path,
        raw_text=excluded.raw_text, sections=excluded.sections, uploaded_at=excluded.uploaded_at, updated_at=excluded.updated_at`)
        .run(filename, originalPath, rawText, JSON.stringify(sections), now, now);
      const profile = extractProfile(rawText, getProfile());
      db.prepare("UPDATE profile SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(profile), now);
      rescoreAll(profile);
      return json(res, 200, { resume: getResume(), profile });
    }
    if (req.method === "PUT" && url.pathname === "/api/resume") {
      const existing = getResume();
      if (!existing) return json(res, 404, { error: "Import a résumé first" });
      const incoming = await body(req);
      const sections = { ...existing.sections, ...(incoming.sections || {}) };
      const rawText = joinedResumeText(sections);
      const now = new Date().toISOString();
      db.prepare("UPDATE resumes SET raw_text = ?, sections = ?, updated_at = ? WHERE id = 1")
        .run(rawText, JSON.stringify(sections), now);
      const profile = { ...getProfile(), resumeText: rawText };
      db.prepare("UPDATE profile SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(profile), now);
      rescoreAll(profile);
      return json(res, 200, { resume: getResume(), profile });
    }
    if (req.method === "GET" && url.pathname === "/api/sources") {
      return json(res, 200, db.prepare("SELECT * FROM sources ORDER BY company").all());
    }
    if (req.method === "GET" && url.pathname === "/api/targets") {
      const rows = db.prepare(`SELECT target_companies.*, sources.id AS source_id,
        sources.provider, sources.last_synced_at, sources.last_error,
        COUNT(jobs.id) AS job_count
        FROM target_companies
        LEFT JOIN sources ON sources.company = target_companies.company AND sources.enabled = 1
        LEFT JOIN jobs ON jobs.source_id = sources.id
        GROUP BY target_companies.id
        ORDER BY CASE target_companies.tier
          WHEN 'Elite tier' THEN 1
          WHEN 'Upper mid tier' THEN 2
          ELSE 3 END, target_companies.company`).all();
      return json(res, 200, rows);
    }
    if (req.method === "POST" && url.pathname === "/api/sources") {
      const incoming = await body(req);
      const token = String(incoming.token || "").trim().toLowerCase();
      const company = String(incoming.company || token).trim();
      const provider = String(incoming.provider || "greenhouse").trim().toLowerCase();
      if (!token || !company) return json(res, 400, { error: "Company and board token are required" });
      if (!new Set(["greenhouse", "lever"]).has(provider)) return json(res, 400, { error: "Choose Greenhouse or Lever" });
      db.prepare("INSERT OR IGNORE INTO sources (company, provider, token) VALUES (?, ?, ?)").run(company, provider, token);
      return json(res, 201, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/sync") {
      return json(res, 200, { results: await syncAll() });
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const q = `%${(url.searchParams.get("q") || "").trim()}%`;
      const status = url.searchParams.get("status") || "all";
      const minScore = Number(url.searchParams.get("minScore") || 0);
      const location = (url.searchParams.get("location") || "").trim().toLowerCase();
      const locationAlias = location === "bengaluru" ? "bangalore" : location;
      const limit = Math.min(200, Number(url.searchParams.get("limit") || 80));
      const rows = db.prepare(`SELECT * FROM jobs
        WHERE score >= ? AND (? = 'all' OR status = ?)
          AND (? != 'all' OR verdict != 'skip')
          AND (? = '' OR LOWER(COALESCE(location, '')) LIKE ? OR LOWER(COALESCE(location, '')) LIKE ?)
          AND (title LIKE ? OR company LIKE ? OR location LIKE ? OR description LIKE ?)
        ORDER BY score DESC, COALESCE(published_at, updated_at, discovered_at) DESC
        LIMIT ?`).all(minScore, status, status, status, location, `%${location}%`, `%${locationAlias}%`, q, q, q, q, limit);
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
    const coverLetterMatch = url.pathname.match(/^\/api\/jobs\/(\d+)\/cover-letter$/);
    if (coverLetterMatch) {
      const jobId = Number(coverLetterMatch[1]);
      const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      if (!job) return json(res, 404, { error: "Job not found" });
      const profile = getProfile();
      const saved = db.prepare("SELECT body, updated_at FROM cover_letters WHERE job_id = ?").get(jobId);
      const match = JSON.parse(job.match_data || "{}");
      if (req.method === "GET") {
        return json(res, 200, { body: saved?.body || buildCoverLetter(job, profile, match), updated_at: saved?.updated_at || null });
      }
      if (req.method === "PUT") {
        const incoming = await body(req);
        const letter = String(incoming.body || "").trim();
        if (!letter) return json(res, 400, { error: "Your cover letter cannot be empty" });
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO cover_letters (job_id, body, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(job_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`).run(jobId, letter, now);
        const filename = `${jobId}-${safeFilename(job.company)}-${safeFilename(job.title)}-cover-letter.txt`;
        const filePath = resolve(COVER_LETTER_DIR, filename);
        await writeFile(filePath, letter, "utf8");
        return json(res, 200, { ok: true, updated_at: now, file_path: filePath });
      }
    }
    const tailorMatch = url.pathname.match(/^\/api\/jobs\/(\d+)\/tailored-resume$/);
    if (tailorMatch) {
      const jobId = Number(tailorMatch[1]);
      const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
      if (!job) return json(res, 404, { error: "Job not found" });
      const resume = db.prepare("SELECT raw_text FROM resumes WHERE id = 1").get();
      if (!resume) return json(res, 400, { error: "Import a base résumé before tailoring it" });
      const saved = db.prepare("SELECT keywords, draft_text, updated_at FROM tailored_resumes WHERE job_id = ?").get(jobId);
      if (req.method === "GET") {
        const analysis = tailorResume(job, resume.raw_text);
        return json(res, 200, { ...analysis, keywords: saved ? JSON.parse(saved.keywords) : analysis.suggested, draft: saved?.draft_text || analysis.draft, updated_at: saved?.updated_at || null });
      }
      if (req.method === "PUT") {
        const incoming = await body(req);
        const keywords = Array.isArray(incoming.keywords) ? incoming.keywords.map(String).slice(0, 12) : [];
        const draftText = String(incoming.draft || "").trim();
        if (!draftText) return json(res, 400, { error: "Your tailored résumé cannot be empty" });
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO tailored_resumes (job_id, keywords, draft_text, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(job_id) DO UPDATE SET keywords=excluded.keywords, draft_text=excluded.draft_text, updated_at=excluded.updated_at`)
          .run(jobId, JSON.stringify(keywords), draftText, now);
        const filename = `${jobId}-${safeFilename(job.company)}-${safeFilename(job.title)}-tailored-resume.txt`;
        const filePath = resolve(TAILORED_RESUME_DIR, filename);
        await writeFile(filePath, draftText, "utf8");
        return json(res, 200, { ok: true, updated_at: now, file_path: filePath });
      }
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
