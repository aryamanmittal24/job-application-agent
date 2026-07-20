"use client";

import {
  ArrowUpRight, Bookmark, BriefcaseBusiness, Check, ChevronRight, CircleAlert,
  Database, ExternalLink, FilePenLine, FileText, GraduationCap, LayoutDashboard,
  MapPin, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, Sparkles, Upload, UserRound, WandSparkles, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const API = "http://127.0.0.1:4010/api";

type Job = {
  id: number; company: string; title: string; location: string; url: string;
  description: string; score: number; verdict: string; status: string;
  published_at?: string; updated_at?: string;
  match: { matchedSkills?: string[]; reasons?: string[]; experienceNeeded?: number | null };
};

type Profile = {
  firstName: string; lastName: string; email: string; phone: string; location: string;
  linkedin: string; github: string; portfolio: string; yearsExperience: number;
  country: string; postalCode: string; currentCompany: string; currentTitle: string;
  school: string; degree: string; graduationYear: string; workAuthorization: string;
  requiresSponsorship: string;
  preferredTitles: string[]; preferredLocations: string[]; excludedCompanies: string[];
  skills: string[]; resumeText: string; answers: { question: string; answer: string }[];
};

type Stats = { total: number; strong: number; saved: number; applied: number };
type View = "jobs" | "saved" | "applications" | "resume" | "profile" | "sources" | "extension";

const emptyProfile: Profile = {
  firstName: "", lastName: "", email: "", phone: "", location: "", linkedin: "",
  github: "", portfolio: "", yearsExperience: 0, preferredTitles: ["software engineer"],
  country: "", postalCode: "", currentCompany: "", currentTitle: "", school: "",
  degree: "", graduationYear: "", workAuthorization: "", requiresSponsorship: "",
  preferredLocations: ["remote"], excludedCompanies: [], skills: [], resumeText: "", answers: [],
};

function relativeDate(value?: string) {
  if (!value) return "Recently";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function initials(company: string) {
  return company.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed: ${response.status}`);
  return response.json();
}

export function JobDashboard() {
  const [view, setView] = useState<View>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, strong: 0, saved: 0, applied: 0 });
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [selected, setSelected] = useState<Job | null>(null);
  const [tailoring, setTailoring] = useState<Job | null>(null);
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState(0);
  const [locationFilter, setLocationFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [employmentFilter, setEmploymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [filterTimestamp] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const status = view === "saved" ? "saved" : view === "applications" ? "applied" : "all";
      const sourceLocation = locationFilter === "all" ? "" : locationFilter === "remote" ? "remote" : locationFilter;
      const [jobRows, nextStats, nextProfile] = await Promise.all([
        api<Job[]>(`/jobs?status=${status}&minScore=${scoreFilter}&location=${encodeURIComponent(sourceLocation)}&limit=200`),
        api<Stats>("/stats"), api<Profile>("/profile"),
      ]);
      setJobs(jobRows); setStats(nextStats); setProfile(nextProfile); setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [view, scoreFilter, locationFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleJobs = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return jobs.filter((job) => {
      const text = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
      const age = job.published_at || job.updated_at;
      const days = age ? (filterTimestamp - new Date(age).getTime()) / 86_400_000 : Infinity;
      const isEntry = /intern|junior|associate|new grad|graduate|engineer i\b/.test(text);
      const isSenior = /senior|staff|principal|lead/.test(text);
      const locationOK = locationFilter === "all" || (locationFilter === "remote" ? /remote|hybrid/.test(text) : locationFilter === "bengaluru" ? /bengaluru|bangalore/.test(text) : text.includes(locationFilter));
      const levelOK = levelFilter === "all" || (levelFilter === "entry" ? isEntry : levelFilter === "senior" ? isSenior : !isEntry && !isSenior);
      const employmentOK = employmentFilter === "all" || /full.?time/.test(text);
      const dateOK = dateFilter === "all" || (dateFilter === "7d" ? days <= 7 : days <= 30);
      return (!needle || text.includes(needle)) && locationOK && levelOK && employmentOK && dateOK;
    });
  }, [jobs, query, locationFilter, levelFilter, employmentFilter, dateFilter, filterTimestamp]);

  async function sync() {
    setSyncing(true); setNotice("");
    try {
      const result = await api<{ results: { imported: number }[] }>("/sync", { method: "POST" });
      const count = result.results.reduce((sum, source) => sum + source.imported, 0);
      setNotice(`Synced ${count.toLocaleString()} roles from your company boards.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sync failed");
    } finally { setSyncing(false); }
  }

  async function updateStatus(job: Job, status: string) {
    await api(`/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    setJobs((rows) => rows.map((row) => row.id === job.id ? { ...row, status } : row));
    setSelected((current) => current?.id === job.id ? { ...current, status } : current);
    const nextStats = await api<Stats>("/stats"); setStats(nextStats);
  }

  async function openApplication(job: Job) {
    await updateStatus(job, "opened");
    window.open(job.url, "_blank", "noopener,noreferrer");
  }

  const title = view === "saved" ? "Saved roles" : view === "applications" ? "Applications" : "Your best matches";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("jobs")} aria-label="JobPilot home">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>JobPilot</span>
        </button>
        <nav className="nav-block" aria-label="Main navigation">
          <NavButton active={view === "jobs"} icon={<LayoutDashboard size={17} />} label="Discover" onClick={() => setView("jobs")} />
          <NavButton active={view === "saved"} icon={<Bookmark size={17} />} label="Saved" count={stats.saved} onClick={() => setView("saved")} />
          <NavButton active={view === "applications"} icon={<BriefcaseBusiness size={17} />} label="Applications" count={stats.applied} onClick={() => setView("applications")} />
        </nav>
        <div className="nav-label">Workspace</div>
        <nav className="nav-block" aria-label="Workspace navigation">
          <NavButton active={view === "resume"} icon={<FilePenLine size={17} />} label="My résumé" onClick={() => setView("resume")} />
          <NavButton active={view === "profile"} icon={<UserRound size={17} />} label="My profile" onClick={() => setView("profile")} />
          <NavButton active={view === "sources"} icon={<Database size={17} />} label="Job sources" onClick={() => setView("sources")} />
          <NavButton active={view === "extension"} icon={<WandSparkles size={17} />} label="Autofill extension" onClick={() => setView("extension")} />
        </nav>
        <div className="sidebar-foot">
          <span className={`status-dot ${online ? "is-online" : ""}`} />
          <div><strong>{online ? "Local and private" : "Local service offline"}</strong><small>{online ? "Data stays on this Mac" : "Start the local service"}</small></div>
        </div>
      </aside>

      <main className="main">
        {!online && (
          <div className="offline-banner"><CircleAlert size={17} /><span>The local data service is not running. Start the app with <code>npm run dev:all</code>.</span></div>
        )}
        {(view === "resume") ? (
          <ResumeView onProfile={() => setView("profile")} onImported={(nextProfile) => { setProfile(nextProfile); setNotice("Résumé imported. Your profile was extracted and every job was rescored."); }} />
        ) : (view === "profile") ? (
          <ProfileView profile={profile} onSaved={(saved) => { setProfile(saved); setNotice("Profile saved. All jobs were rescored."); }} />
        ) : view === "sources" ? (
          <SourcesView onSync={sync} syncing={syncing} />
        ) : view === "extension" ? (
          <ExtensionView />
        ) : (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">Sunday, July 19</p>
                <h1>{title}</h1>
              </div>
              <div className="top-actions">
                <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles or companies" /></label>
                <button className="button secondary" onClick={sync} disabled={syncing}><RefreshCw size={16} className={syncing ? "spin" : ""} />{syncing ? "Syncing" : "Sync jobs"}</button>
              </div>
            </header>

            {notice && <div className="notice"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}

            <section className="hero-strip">
              <div>
                <span className="hero-icon"><Sparkles size={18} /></span>
                <p><strong>{stats.strong.toLocaleString()} strong matches</strong> found across your company boards.</p>
                <span>Scores use your target roles, experience, skills, and location preferences.</span>
              </div>
              <button onClick={() => setView("profile")}>Improve my matches <ChevronRight size={15} /></button>
            </section>

            <section className="metrics" aria-label="Job search summary">
              <Metric label="Roles tracked" value={stats.total} detail="Greenhouse sources" />
              <Metric label="Strong matches" value={stats.strong} detail="Score 72 or higher" accent />
              <Metric label="Saved" value={stats.saved} detail="Ready to review" />
              <Metric label="Applied" value={stats.applied} detail="Marked by you" />
            </section>

            <section className="job-filters" aria-label="Job filters">
              <FilterSelect label="Location" value={locationFilter} onChange={setLocationFilter} options={[["all", "Any location"], ["bengaluru", "Bengaluru"], ["india", "India"], ["remote", "Remote / hybrid"]]} />
              <FilterSelect label="Seniority" value={levelFilter} onChange={setLevelFilter} options={[["all", "Any level"], ["entry", "Entry level"], ["mid", "Mid level"], ["senior", "Senior+"]]} />
              <FilterSelect label="Type" value={employmentFilter} onChange={setEmploymentFilter} options={[["all", "Any type"], ["full-time", "Full-time"]]} />
              <FilterSelect label="Date posted" value={dateFilter} onChange={setDateFilter} options={[["all", "Any time"], ["7d", "Past 7 days"], ["30d", "Past 30 days"]]} />
              <button className="filter-reset" onClick={() => { setLocationFilter("all"); setLevelFilter("all"); setEmploymentFilter("all"); setDateFilter("all"); }}><SlidersHorizontal size={15} /> Reset filters</button>
            </section>

            <section className="list-section">
              <div className="list-heading">
                <div><h2>Recommended roles</h2><span>{visibleJobs.length} shown</span></div>
                <div className="score-filter" aria-label="Match score filter">
                  {[0, 55, 72].map((value) => <button key={value} className={scoreFilter === value ? "active" : ""} onClick={() => setScoreFilter(value)}>{value === 0 ? "All" : value === 55 ? "55+" : "72+"}</button>)}
                </div>
              </div>
              <div className="job-list">
                {loading ? <LoadingRows /> : visibleJobs.length ? visibleJobs.map((job) => (
                  <button className="job-row" key={job.id} onClick={() => setSelected(job)}>
                    <span className="company-logo">{initials(job.company)}</span>
                    <span className="job-main"><strong>{job.title}</strong><span>{job.company} · <MapPin size={13} /> {job.location}</span></span>
                    <span className="skill-list">{(job.match.matchedSkills || []).slice(0, 2).map((skill) => <em key={skill}>{skill}</em>)}</span>
                    <span className={`match-score score-${job.verdict}`}><b>{job.score}%</b><small>{job.verdict === "strong" ? "Strong match" : job.verdict === "possible" ? "Good match" : "Review"}</small></span>
                    <span className="job-date">{relativeDate(job.published_at || job.updated_at)}</span>
                    <ChevronRight size={17} className="row-arrow" />
                  </button>
                )) : <EmptyJobs onSync={sync} onProfile={() => setView("profile")} />}
              </div>
            </section>
          </>
        )}
      </main>

      {selected && <JobPanel job={selected} onClose={() => setSelected(null)} onSave={() => updateStatus(selected, selected.status === "saved" ? "new" : "saved")} onOpen={() => openApplication(selected)} onApplied={() => updateStatus(selected, "applied")} onTailor={() => setTailoring(selected)} />}
      {tailoring && <TailorResumeModal job={tailoring} onClose={() => setTailoring(null)} />}
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count ? <small>{count}</small> : null}</button>;
}

function Metric({ label, value, detail, accent = false }: { label: string; value: number; detail: string; accent?: boolean }) {
  return <article className={`metric ${accent ? "accent" : ""}`}><span>{label}</span><strong>{Number(value || 0).toLocaleString()}</strong><small>{detail}</small></article>;
}

function LoadingRows() {
  return <div className="loading-rows" aria-label="Loading jobs">{[1, 2, 3, 4].map((row) => <div key={row}><span /><span /><span /></div>)}</div>;
}

function EmptyJobs({ onSync, onProfile }: { onSync: () => void; onProfile: () => void }) {
  return <div className="empty-state"><BriefcaseBusiness size={28} /><h3>No roles in this view yet</h3><p>Sync your boards or complete your profile to begin matching.</p><div><button className="button secondary" onClick={onProfile}>Complete profile</button><button className="button primary" onClick={onSync}>Sync jobs</button></div></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function JobPanel({ job, onClose, onSave, onOpen, onApplied, onTailor }: { job: Job; onClose: () => void; onSave: () => void; onOpen: () => void; onApplied: () => void; onTailor: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="job-drawer" aria-label={`${job.title} details`}>
      <div className="drawer-head"><button onClick={onClose} aria-label="Close details"><X size={19} /></button><button className={job.status === "saved" ? "is-saved" : ""} onClick={onSave}><Bookmark size={17} />{job.status === "saved" ? "Saved" : "Save"}</button></div>
      <div className="drawer-company"><span className="company-logo large">{initials(job.company)}</span><span>{job.company}</span></div>
      <h2>{job.title}</h2>
      <p className="drawer-location"><MapPin size={15} />{job.location}</p>
      <div className={`drawer-score score-${job.verdict}`}><strong>{job.score}%</strong><div><b>{job.verdict === "strong" ? "Strong résumé match" : "Needs a closer look"}</b><span>Evidence-based local score</span></div></div>
      <section className="drawer-section"><h3>Why it matches</h3><ul>{(job.match.reasons || []).map((reason) => <li key={reason}><Check size={15} />{reason}</li>)}</ul></section>
      {(job.match.matchedSkills || []).length > 0 && <section className="drawer-section"><h3>Skills found</h3><div className="drawer-skills">{job.match.matchedSkills!.map((skill) => <span key={skill}>{skill}</span>)}</div></section>}
      <section className="drawer-section"><h3>About the role</h3><p className="description">{job.description || "Open the official application to read the full description."}</p></section>
      <div className="drawer-actions">{job.score >= 55 && job.verdict !== "skip" ? <button className="button secondary" onClick={onTailor}><WandSparkles size={16} />Tailor résumé</button> : <span className="tailor-disabled">Tailoring is available for 55%+ engineering matches.</span>}<button className="button secondary" onClick={onApplied}><Check size={16} />Mark applied</button><button className="button primary" onClick={onOpen}>Open application <ArrowUpRight size={16} /></button></div>
    </aside>
  </div>;
}

type TailoredResume = { matched: string[]; suggested: string[]; keywords: string[]; draft: string; updated_at?: string | null; file_path?: string };

function TailorResumeModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [data, setData] = useState<TailoredResume | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { api<TailoredResume>(`/jobs/${job.id}/tailored-resume`).then((next) => { setData(next); setKeywords(next.keywords); setDraft(next.draft); }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not prepare this résumé")); }, [job.id]);
  function toggle(keyword: string) { setKeywords((current) => current.includes(keyword) ? current.filter((item) => item !== keyword) : [...current, keyword]); }
  async function save() { setSaving(true); try { const result = await api<{ file_path: string }>(`/jobs/${job.id}/tailored-resume`, { method: "PUT", body: JSON.stringify({ keywords, draft }) }); setMessage(`Saved to ${result.file_path}`); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this version"); } finally { setSaving(false); } }
  function download() { const url = URL.createObjectURL(new Blob([draft], { type: "text/plain" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${job.company}-${job.title}-tailored-resume.txt`.replace(/[^a-z0-9.-]+/gi, "-"); anchor.click(); URL.revokeObjectURL(url); }
  return <div className="tailor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="tailor-modal" role="dialog" aria-modal="true" aria-label="Tailor résumé"><header><div><p className="eyebrow">Truthful tailoring</p><h2>Customize for this role</h2><p>{job.company} · {job.title}</p></div><button onClick={onClose} aria-label="Close"><X size={19} /></button></header>{message && <div className="notice"><Check size={15} />{message}</div>}{!data ? <div className="tailor-loading">Preparing keyword comparison…</div> : <><div className="tailor-score"><div><strong>{job.score}%</strong><span>current match</span></div><p>Choose only terms you can genuinely support. JobPilot never invents experience or silently changes your base résumé.</p></div><section className="tailor-section"><h3>Already supported</h3><div className="keyword-list">{data.matched.length ? data.matched.map((keyword) => <span className="keyword matched" key={keyword}><Check size={12} />{keyword}</span>) : <span className="muted">No direct keyword overlap detected.</span>}</div></section><section className="tailor-section"><h3>Review before adding</h3><p>These terms occur in the job description but not your base résumé. Select only what is accurate.</p><div className="keyword-list">{data.suggested.length ? data.suggested.map((keyword) => <button className={`keyword ${keywords.includes(keyword) ? "selected" : ""}`} onClick={() => toggle(keyword)} key={keyword}>{keywords.includes(keyword) && <Check size={12} />}{keyword}</button>) : <span className="muted">Your résumé already covers the notable role keywords.</span>}</div></section><section className="tailor-section"><h3>Tailored draft</h3><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} /></section><footer><span>Base PDF remains unchanged.</span><div><button className="button secondary" onClick={download} disabled={!draft}>Download text</button><button className="button primary" onClick={save} disabled={saving || !draft}>{saving ? "Saving…" : "Save this version"}</button></div></footer></>}</section></div>;
}

type ResumeRecord = {
  id: number; filename: string; raw_text: string; uploaded_at: string; updated_at: string;
  sections: Record<"headline" | "education" | "skills" | "experience" | "projects" | "additional", string>;
};

function ResumeView({ onProfile, onImported }: { onProfile: () => void; onImported: (profile: Profile) => void }) {
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<ResumeRecord | null>("/resume").then(setResume).catch(() => setResume(null));
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setMessage("Choose a PDF résumé."); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage("Choose a PDF smaller than 10 MB."); return; }
    setBusy(true); setMessage("Reading and structuring your résumé…");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const result = await api<{ resume: ResumeRecord; profile: Profile }>("/resume/import", {
        method: "POST", body: JSON.stringify({ filename: file.name, base64: dataUrl.split(",")[1] }),
      });
      setResume(result.resume); onImported(result.profile); setMessage("Résumé imported and job matches updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this résumé"); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!resume) return;
    setBusy(true); setMessage("Saving and rescoring jobs…");
    try {
      const result = await api<{ resume: ResumeRecord; profile: Profile }>("/resume", { method: "PUT", body: JSON.stringify({ sections: resume.sections }) });
      setResume(result.resume); onImported(result.profile); setMessage("Edits saved. All job matches now use this version.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save résumé"); }
    finally { setBusy(false); }
  }

  const wordCount = resume?.raw_text.trim().split(/\s+/).filter(Boolean).length || 0;
  const sectionMeta = [
    ["headline", "Header and links", "Your name and visible contact header"],
    ["experience", "Experience", "Roles, dates, impact, and achievements"],
    ["skills", "Technical skills", "Languages, systems, cloud, and AI tooling"],
    ["projects", "Projects", "Personal, academic, and open-source work"],
    ["education", "Education", "Schools, degrees, and graduation dates"],
    ["additional", "Additional", "Anything that does not fit another section"],
  ] as const;

  return <div className="settings-page resume-page">
    <header className="settings-header"><div><p className="eyebrow">Matching source</p><h1>Your editable résumé</h1><p>This is the résumé JobPilot screens against every role. Replace the PDF anytime or edit the extracted sections directly.</p></div><span className="privacy-chip"><Check size={14} /> Used for all matches</span></header>
    <section className="resume-toolbar">
      <div className="resume-file-icon"><FileText size={22} /></div>
      <div className="resume-file-copy"><strong>{resume?.filename || "No résumé imported"}</strong><span>{resume ? `${wordCount.toLocaleString()} words · Updated ${relativeDate(resume.updated_at)}` : "Import a PDF to start résumé-based matching"}</span></div>
      <label className={`button secondary upload-button ${busy ? "disabled" : ""}`}><Upload size={16} />{resume ? "Replace PDF" : "Import PDF"}<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
    </section>
    {message && <div className="notice"><Sparkles size={16} />{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={15} /></button></div>}
    {!resume ? <label className="resume-dropzone"><Upload size={30} /><h2>Add your base résumé</h2><p>JobPilot extracts the text, skills, experience, education, and basic details locally.</p><span className="button primary">Choose PDF</span><input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => void importFile(event.target.files?.[0])} /></label> : <>
      <div className="resume-summary"><div><span>Matching input</span><strong>{wordCount.toLocaleString()} words</strong></div><div><span>Editable sections</span><strong>{sectionMeta.filter(([key]) => resume.sections[key]?.trim()).length}</strong></div><div><span>Job database</span><strong>Rescores on save</strong></div><button onClick={onProfile}>Review extracted profile <ChevronRight size={15} /></button></div>
      <div className="resume-editor">
        {sectionMeta.map(([key, label, help]) => <section className="resume-section" key={key}><div><h2>{label}</h2><p>{help}</p></div><textarea rows={key === "experience" ? 16 : key === "headline" ? 3 : 8} value={resume.sections[key] || ""} onChange={(event) => setResume({ ...resume, sections: { ...resume.sections, [key]: event.target.value } })} placeholder={`Add ${label.toLowerCase()}…`} /></section>)}
      </div>
      <div className="resume-savebar"><div><Check size={15} /><span>Saving replaces the text used by the matcher; it does not alter your original PDF.</span></div><button className="button primary" onClick={save} disabled={busy}>{busy ? "Working…" : "Save résumé and rescore"}</button></div>
    </>}
  </div>;
}

function ProfileView({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  function list(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { onSaved(await api<Profile>("/profile", { method: "PUT", body: JSON.stringify(draft) })); }
    finally { setSaving(false); }
  }
  return <div className="settings-page">
    <header className="settings-header"><div><p className="eyebrow">Matching foundation</p><h1>Your application profile</h1><p>Only verified information entered here is available to the autofill extension.</p></div><span className="privacy-chip"><Check size={14} /> Stored locally</span></header>
    <form className="profile-form" onSubmit={submit}>
      <section className="form-card"><div className="form-title"><UserRound size={18} /><div><h2>Personal details</h2><p>Used to fill standard contact fields.</p></div></div><div className="field-grid">
        <Field label="First name" value={draft.firstName} onChange={(value) => setDraft({ ...draft, firstName: value })} />
        <Field label="Last name" value={draft.lastName} onChange={(value) => setDraft({ ...draft, lastName: value })} />
        <Field label="Email" type="email" value={draft.email} onChange={(value) => setDraft({ ...draft, email: value })} />
        <Field label="Phone" value={draft.phone} onChange={(value) => setDraft({ ...draft, phone: value })} />
        <Field label="Current location" value={draft.location} onChange={(value) => setDraft({ ...draft, location: value })} />
        <Field label="Country" value={draft.country} onChange={(value) => setDraft({ ...draft, country: value })} />
        <Field label="Postal code" value={draft.postalCode} onChange={(value) => setDraft({ ...draft, postalCode: value })} />
        <Field label="Years of experience" type="number" value={String(draft.yearsExperience)} onChange={(value) => setDraft({ ...draft, yearsExperience: Number(value) })} />
        <Field label="LinkedIn URL" value={draft.linkedin} onChange={(value) => setDraft({ ...draft, linkedin: value })} />
        <Field label="GitHub URL" value={draft.github} onChange={(value) => setDraft({ ...draft, github: value })} />
        <Field label="Portfolio URL" value={draft.portfolio} onChange={(value) => setDraft({ ...draft, portfolio: value })} />
      </div></section>
      <section className="form-card"><div className="form-title"><BriefcaseBusiness size={18} /><div><h2>Employment and eligibility</h2><p>Extracted where possible; verify before using autofill.</p></div></div><div className="field-grid">
        <Field label="Current company" value={draft.currentCompany} onChange={(value) => setDraft({ ...draft, currentCompany: value })} />
        <Field label="Current job title" value={draft.currentTitle} onChange={(value) => setDraft({ ...draft, currentTitle: value })} />
        <Field label="Work authorization" value={draft.workAuthorization} onChange={(value) => setDraft({ ...draft, workAuthorization: value })} placeholder="e.g. India; requires permit in EU" />
        <Field label="Requires sponsorship?" value={draft.requiresSponsorship} onChange={(value) => setDraft({ ...draft, requiresSponsorship: value })} placeholder="Yes / No / Depends on country" />
      </div></section>
      <section className="form-card"><div className="form-title"><GraduationCap size={18} /><div><h2>Education</h2><p>Used only when an application asks for education details.</p></div></div><div className="field-grid">
        <Field label="School" value={draft.school} onChange={(value) => setDraft({ ...draft, school: value })} />
        <Field label="Degree" value={draft.degree} onChange={(value) => setDraft({ ...draft, degree: value })} />
        <Field label="Graduation year" value={draft.graduationYear} onChange={(value) => setDraft({ ...draft, graduationYear: value })} />
      </div></section>
      <section className="form-card"><div className="form-title"><Settings2 size={18} /><div><h2>Job preferences</h2><p>Comma-separate multiple values.</p></div></div><div className="field-grid">
        <Field label="Target titles" value={draft.preferredTitles.join(", ")} onChange={(value) => setDraft({ ...draft, preferredTitles: list(value) })} />
        <Field label="Preferred locations" value={draft.preferredLocations.join(", ")} onChange={(value) => setDraft({ ...draft, preferredLocations: list(value) })} />
        <Field label="Skills" wide value={draft.skills.join(", ")} onChange={(value) => setDraft({ ...draft, skills: list(value) })} placeholder="TypeScript, React, Python, AWS" />
        <Field label="Excluded companies" wide value={draft.excludedCompanies.join(", ")} onChange={(value) => setDraft({ ...draft, excludedCompanies: list(value) })} />
      </div></section>
      <div className="form-actions"><span>Saving recalculates every job match.</span><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save and rescore"}</button></div>
    </form>
  </div>;
}

function Field({ label, value, onChange, type = "text", wide = false, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean; placeholder?: string }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span><input type={type} step={type === "number" ? "0.1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function SourcesView({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const [sources, setSources] = useState<{ id: number; company: string; token: string; provider: string; last_synced_at?: string; last_error?: string }[]>([]);
  const [targets, setTargets] = useState<{ id: number; company: string; tier: string; compensation_band: string; career_url: string; source_id?: number; job_count: number; last_error?: string; notes?: string }[]>([]);
  const [company, setCompany] = useState(""); const [token, setToken] = useState(""); const [provider, setProvider] = useState("greenhouse");
  const reload = useCallback(() => Promise.all([api<typeof sources>("/sources"), api<typeof targets>("/targets")]).then(([nextSources, nextTargets]) => { setSources(nextSources); setTargets(nextTargets); }).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  async function add(event: FormEvent) { event.preventDefault(); await api("/sources", { method: "POST", body: JSON.stringify({ company, token, provider }) }); setCompany(""); setToken(""); reload(); }
  const tiers = [...new Set(targets.map((target) => target.tier))];
  return <div className="settings-page"><header className="settings-header"><div><p className="eyebrow">Discovery</p><h1>Your target companies</h1><p>All 30 target portals are here. Where a public feed is available, its live roles are included when you sync.</p></div><button className="button primary" onClick={async () => { await onSync(); reload(); }} disabled={syncing}><RefreshCw size={16} className={syncing ? "spin" : ""} /> Sync live feeds</button></header>
    <section className="target-overview"><div><strong>{targets.length}</strong><span>target portals</span></div><div><strong>{targets.filter((target) => target.source_id).length}</strong><span>live Greenhouse feeds</span></div><div><strong>{targets.reduce((sum, target) => sum + Number(target.job_count || 0), 0).toLocaleString()}</strong><span>roles indexed</span></div></section>
    {tiers.map((tier) => <section className="tier-section" key={tier}><div className="tier-heading"><h2>{tier}</h2><span>{targets.filter((target) => target.tier === tier).length} companies</span></div><div className="target-grid">{targets.filter((target) => target.tier === tier).map((target) => <article className="target-card" key={target.id}><div className="target-card-top"><span className="company-logo">{initials(target.company)}</span><div><strong>{target.company}</strong><span>{target.compensation_band}</span>{target.notes && <small className="target-note">{target.notes}</small>}</div></div><div className="target-card-bottom"><small className={target.source_id ? "feed-live" : "feed-portal"}>{target.source_id ? `${target.job_count} live roles` : "Official portal"}</small><button onClick={() => window.open(target.career_url, "_blank", "noopener,noreferrer")}>Open portal <ExternalLink size={13} /></button></div></article>)}</div></section>)}
    <section className="custom-source-section"><div><h2>Connect another public board</h2><p>Greenhouse and Lever publish free job feeds. Paste the board name from their public careers URL.</p></div>
    <form className="add-source" onSubmit={add}><Field label="Company" value={company} onChange={setCompany} placeholder="Acme" /><label className="field"><span>Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select></label><Field label="Board token" value={token} onChange={setToken} placeholder={provider === "lever" ? "acme" : "acme"} /><button className="button primary"><Plus size={16} />Connect</button></form>
    <div className="source-list">{sources.map((source) => <div className="source-row" key={source.id}><span className="company-logo">{initials(source.company)}</span><div><strong>{source.company}</strong><span>{source.provider === "lever" ? `jobs.lever.co/${source.token}` : `boards.greenhouse.io/${source.token}`}</span></div><small className={source.last_error ? "error" : ""}>{source.last_error || (source.last_synced_at ? `Synced ${relativeDate(source.last_synced_at)}` : "Ready to sync")}</small></div>)}</div></section>
  </div>;
}

function ExtensionView() {
  return <div className="settings-page"><header className="settings-header"><div><p className="eyebrow">One-click applications</p><h1>JobPilot Autofill</h1><p>The included Chrome extension fills known fields on the official application page. You always review and submit.</p></div><span className="privacy-chip"><WandSparkles size={14} /> Manifest V3</span></header>
    <div className="extension-layout"><section className="form-card install-card"><div className="extension-graphic"><span><WandSparkles size={28} /></span><i>1</i><i>2</i><i>3</i></div><h2>Load the extension locally</h2><ol><li>Open <code>chrome://extensions</code> in Chrome.</li><li>Enable <strong>Developer mode</strong>.</li><li>Choose <strong>Load unpacked</strong> and select this repository’s <code>extension</code> folder.</li><li>Pin JobPilot Autofill. Open a Greenhouse application and click <strong>Fill application</strong>.</li></ol></section>
      <section className="safety-card"><CircleAlert size={18} /><div><h3>Designed to stop safely</h3><p>Unknown, demographic, legal, sponsorship, file-upload, and CAPTCHA fields are left for you. The extension never clicks Submit.</p></div></section></div>
  </div>;
}
