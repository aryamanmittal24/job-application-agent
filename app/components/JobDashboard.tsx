"use client";

import {
  ArrowUpRight, Bookmark, BriefcaseBusiness, Check, ChevronRight, CircleAlert,
  Database, FileText, LayoutDashboard, MapPin, Plus, RefreshCw, Search,
  Settings2, Sparkles, UserRound, WandSparkles, X,
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
  preferredTitles: string[]; preferredLocations: string[]; excludedCompanies: string[];
  skills: string[]; resumeText: string; answers: { question: string; answer: string }[];
};

type Stats = { total: number; strong: number; saved: number; applied: number };
type View = "jobs" | "saved" | "applications" | "profile" | "sources" | "extension";

const emptyProfile: Profile = {
  firstName: "", lastName: "", email: "", phone: "", location: "", linkedin: "",
  github: "", portfolio: "", yearsExperience: 0, preferredTitles: ["software engineer"],
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
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const status = view === "saved" ? "saved" : view === "applications" ? "applied" : "all";
      const [jobRows, nextStats, nextProfile] = await Promise.all([
        api<Job[]>(`/jobs?status=${status}&minScore=${scoreFilter}&limit=100`),
        api<Stats>("/stats"), api<Profile>("/profile"),
      ]);
      setJobs(jobRows); setStats(nextStats); setProfile(nextProfile); setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [view, scoreFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleJobs = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) return jobs;
    return jobs.filter((job) => `${job.title} ${job.company} ${job.location}`.toLowerCase().includes(needle));
  }, [jobs, query]);

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
        {(view === "profile") ? (
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

      {selected && <JobPanel job={selected} onClose={() => setSelected(null)} onSave={() => updateStatus(selected, selected.status === "saved" ? "new" : "saved")} onOpen={() => openApplication(selected)} onApplied={() => updateStatus(selected, "applied")} />}
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

function JobPanel({ job, onClose, onSave, onOpen, onApplied }: { job: Job; onClose: () => void; onSave: () => void; onOpen: () => void; onApplied: () => void }) {
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
      <div className="drawer-actions"><button className="button secondary" onClick={onApplied}><Check size={16} />Mark applied</button><button className="button primary" onClick={onOpen}>Open application <ArrowUpRight size={16} /></button></div>
    </aside>
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
        <Field label="Years of experience" type="number" value={String(draft.yearsExperience)} onChange={(value) => setDraft({ ...draft, yearsExperience: Number(value) })} />
        <Field label="LinkedIn URL" value={draft.linkedin} onChange={(value) => setDraft({ ...draft, linkedin: value })} />
        <Field label="GitHub URL" value={draft.github} onChange={(value) => setDraft({ ...draft, github: value })} />
      </div></section>
      <section className="form-card"><div className="form-title"><Settings2 size={18} /><div><h2>Job preferences</h2><p>Comma-separate multiple values.</p></div></div><div className="field-grid">
        <Field label="Target titles" value={draft.preferredTitles.join(", ")} onChange={(value) => setDraft({ ...draft, preferredTitles: list(value) })} />
        <Field label="Preferred locations" value={draft.preferredLocations.join(", ")} onChange={(value) => setDraft({ ...draft, preferredLocations: list(value) })} />
        <Field label="Skills" wide value={draft.skills.join(", ")} onChange={(value) => setDraft({ ...draft, skills: list(value) })} placeholder="TypeScript, React, Python, AWS" />
        <Field label="Excluded companies" wide value={draft.excludedCompanies.join(", ")} onChange={(value) => setDraft({ ...draft, excludedCompanies: list(value) })} />
      </div></section>
      <section className="form-card"><div className="form-title"><FileText size={18} /><div><h2>Résumé text</h2><p>Paste the text from your résumé. File upload comes in the next slice.</p></div></div><label className="field"><span>Résumé content</span><textarea rows={12} value={draft.resumeText} onChange={(event) => setDraft({ ...draft, resumeText: event.target.value })} placeholder="Paste your résumé text here…" /></label></section>
      <div className="form-actions"><span>Saving recalculates every job match.</span><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save and rescore"}</button></div>
    </form>
  </div>;
}

function Field({ label, value, onChange, type = "text", wide = false, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean; placeholder?: string }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function SourcesView({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const [sources, setSources] = useState<{ id: number; company: string; token: string; last_synced_at?: string; last_error?: string }[]>([]);
  const [company, setCompany] = useState(""); const [token, setToken] = useState("");
  const reload = useCallback(() => api<typeof sources>("/sources").then(setSources).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  async function add(event: FormEvent) { event.preventDefault(); await api("/sources", { method: "POST", body: JSON.stringify({ company, token }) }); setCompany(""); setToken(""); reload(); }
  return <div className="settings-page"><header className="settings-header"><div><p className="eyebrow">Discovery</p><h1>Greenhouse sources</h1><p>Add a company’s Greenhouse board token and JobPilot will track its public roles.</p></div><button className="button primary" onClick={onSync} disabled={syncing}><RefreshCw size={16} className={syncing ? "spin" : ""} /> Sync all</button></header>
    <form className="add-source" onSubmit={add}><Field label="Company" value={company} onChange={setCompany} placeholder="Acme" /><Field label="Board token" value={token} onChange={setToken} placeholder="acme" /><button className="button primary"><Plus size={16} />Add board</button></form>
    <div className="source-list">{sources.map((source) => <div className="source-row" key={source.id}><span className="company-logo">{initials(source.company)}</span><div><strong>{source.company}</strong><span>boards.greenhouse.io/{source.token}</span></div><small className={source.last_error ? "error" : ""}>{source.last_error || (source.last_synced_at ? `Synced ${relativeDate(source.last_synced_at)}` : "Ready to sync")}</small></div>)}</div>
  </div>;
}

function ExtensionView() {
  return <div className="settings-page"><header className="settings-header"><div><p className="eyebrow">One-click applications</p><h1>JobPilot Autofill</h1><p>The included Chrome extension fills known fields on the official application page. You always review and submit.</p></div><span className="privacy-chip"><WandSparkles size={14} /> Manifest V3</span></header>
    <div className="extension-layout"><section className="form-card install-card"><div className="extension-graphic"><span><WandSparkles size={28} /></span><i>1</i><i>2</i><i>3</i></div><h2>Load the extension locally</h2><ol><li>Open <code>chrome://extensions</code> in Chrome.</li><li>Enable <strong>Developer mode</strong>.</li><li>Choose <strong>Load unpacked</strong> and select this repository’s <code>extension</code> folder.</li><li>Pin JobPilot Autofill. Open a Greenhouse application and click <strong>Fill application</strong>.</li></ol></section>
      <section className="safety-card"><CircleAlert size={18} /><div><h3>Designed to stop safely</h3><p>Unknown, demographic, legal, sponsorship, file-upload, and CAPTCHA fields are left for you. The extension never clicks Submit.</p></div></section></div>
  </div>;
}
