"use client";

import {
  ArrowUpRight, Bookmark, BriefcaseBusiness, Check, ChevronRight, CircleAlert, Bot,
  Database, ExternalLink, FilePenLine, FileText, GraduationCap, LayoutDashboard,
  MapPin, Mail, Clock3, CalendarDays, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, Sparkles, Upload, UserRound, WandSparkles, X,
} from "lucide-react";
import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  requiresSponsorship: string; achievements: string;
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
  achievements: "", preferredLocations: ["remote"], excludedCompanies: [], skills: [], resumeText: "", answers: [],
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

function reviewScore(review: LocalReview) {
  return Math.round((review.jdFit + review.experienceFit + review.qualificationFit + review.locationFit) / 4);
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
  const [coverLetter, setCoverLetter] = useState<Job | null>(null);
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState(0);
  const [locationFilter, setLocationFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [employmentFilter, setEmploymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [filterTimestamp] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState("");
  const [qwenReviews, setQwenReviews] = useState<Record<number, LocalReview>>({});
  const [qwenRunning, setQwenRunning] = useState(false);
  const [qwenProgress, setQwenProgress] = useState({ done: 0, total: 0 });

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
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / 25));
  const pagedJobs = visibleJobs.slice((page - 1) * 25, page * 25);
  useEffect(() => { setPage(1); }, [query, scoreFilter, locationFilter, levelFilter, employmentFilter, dateFilter, view]);

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

  async function runQwenForPage() {
    if (qwenRunning || !pagedJobs.length) return;
    const queue = [...pagedJobs];
    let next = 0;
    setQwenRunning(true); setQwenProgress({ done: 0, total: queue.length });
    const worker = async () => {
      while (next < queue.length) {
        const job = queue[next++];
        try {
          const result = await api<{ review: LocalReview }>(`/jobs/${job.id}/local-review`, { method: "POST" });
          setQwenReviews((current) => ({ ...current, [job.id]: result.review }));
        } catch (error) {
          setNotice(error instanceof Error ? `Qwen review failed for ${job.company}: ${error.message}` : `Qwen review failed for ${job.company}`);
        } finally { setQwenProgress((current) => ({ ...current, done: current.done + 1 })); }
      }
    };
    await Promise.all([worker(), worker()]);
    setQwenRunning(false);
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
                <div><h2>Recommended roles</h2><span>{visibleJobs.length ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, visibleJobs.length)} of ${visibleJobs.length}` : "0 shown"}</span></div>
                <div className="list-heading-actions"><button className="button secondary qwen-page-button" onClick={() => void runQwenForPage()} disabled={qwenRunning || !pagedJobs.length}><Bot size={15} />{qwenRunning ? `Reviewing ${qwenProgress.done}/${qwenProgress.total}` : `Run Qwen for ${pagedJobs.length} roles`}</button><div className="score-filter" aria-label="Match score filter">
                  {[0, 55, 72].map((value) => <button key={value} className={scoreFilter === value ? "active" : ""} onClick={() => setScoreFilter(value)}>{value === 0 ? "All" : value === 55 ? "55+" : "72+"}</button>)}
                </div></div>
              </div>
              <div className="job-list job-card-list">
                {loading ? <LoadingRows /> : pagedJobs.length ? pagedJobs.map((job) => (
                  <article className="job-card" key={job.id} onClick={() => setSelected(job)}>
                    <div className="job-card-main"><span className="company-logo card-logo">{initials(job.company)}</span><div className="job-card-copy"><div className="job-card-tags"><span>{relativeDate(job.published_at || job.updated_at)}</span>{job.score >= 70 && <span>High-potential role</span>}{qwenReviews[job.id] && <span className="qwen-result-badge">Qwen {reviewScore(qwenReviews[job.id])}%</span>}</div><h3>{job.title}</h3><p>{job.company}</p><div className="job-card-meta"><span><MapPin size={15} />{job.location}</span><span><Clock3 size={15} />Full-time</span><span><CalendarDays size={15} />{job.match.experienceNeeded ? `${job.match.experienceNeeded}+ years exp` : "Experience flexible"}</span></div><div className="job-card-actions"><button className="mini-button" onClick={(event) => { event.stopPropagation(); void updateStatus(job, job.status === "saved" ? "new" : "saved"); }}>{job.status === "saved" ? "Saved" : "Save"}</button><button className="button primary" onClick={(event) => { event.stopPropagation(); void openApplication(job); }}>Open application <ArrowUpRight size={15} /></button></div></div></div>
                    <aside className={`match-tile score-${job.verdict}`}><strong>{job.score}%</strong><span>{job.verdict === "strong" ? "Strong match" : job.verdict === "possible" ? "Good match" : "Review match"}</span><div>{(job.match.matchedSkills || []).slice(0, 3).map((skill) => <small key={skill}>✓ {skill}</small>)}</div></aside>
                  </article>
                )) : <EmptyJobs onSync={sync} onProfile={() => setView("profile")} />}
              </div>
              {visibleJobs.length > 25 && <div className="pagination"><button className="button secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</button><span>Page {page} of {pageCount}</span><button className="button secondary" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next</button></div>}
            </section>
          </>
        )}
      </main>

      {selected && <JobPanel job={selected} profile={profile} onClose={() => setSelected(null)} onSave={() => updateStatus(selected, selected.status === "saved" ? "new" : "saved")} onOpen={() => openApplication(selected)} onApplied={() => updateStatus(selected, "applied")} onTailor={() => setTailoring(selected)} onCoverLetter={() => setCoverLetter(selected)} />}
      {tailoring && <TailorResumeModal job={tailoring} onClose={() => setTailoring(null)} />}
      {coverLetter && <CoverLetterModal job={coverLetter} onClose={() => setCoverLetter(null)} />}
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

function JobPanel({ job, profile, onClose, onSave, onOpen, onApplied, onTailor, onCoverLetter }: { job: Job; profile: Profile; onClose: () => void; onSave: () => void; onOpen: () => void; onApplied: () => void; onTailor: () => void; onCoverLetter: () => void }) {
  const [aiReview, setAiReview] = useState<LocalReview | null>(null);
  const [qwenDuration, setQwenDuration] = useState<number | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewMessage, setAiReviewMessage] = useState("");
  const skillScore = Math.min(100, Math.round(((job.match.matchedSkills || []).length / Math.max(4, Math.min(profile.skills.length || 4, 8))) * 100));
  const experienceScore = job.match.experienceNeeded ? (profile.yearsExperience >= job.match.experienceNeeded ? 100 : Math.max(15, Math.round((profile.yearsExperience / job.match.experienceNeeded) * 100))) : 75;
  const roleScore = profile.preferredTitles.some((title) => job.title.toLowerCase().includes(title.toLowerCase())) ? 100 : 55;
  async function runLocalReview() {
    setAiReviewLoading(true); setAiReviewMessage("");
    try { const result = await api<{ model: string; review: LocalReview; durationMs: number }>(`/jobs/${job.id}/local-review`, { method: "POST" }); setAiReview(result.review); setQwenDuration(result.durationMs); }
    catch (error) { setAiReviewMessage(error instanceof Error ? error.message : "Could not run Qwen3"); }
    finally { setAiReviewLoading(false); }
  }
  const qwenDimensions = aiReview ? [["JD fit", aiReview.jdFit], ["Experience", aiReview.experienceFit], ["Qualifications", aiReview.qualificationFit], ["Location", aiReview.locationFit]] as [string, number][] : [];
  return <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <main className="job-detail" aria-label={`${job.title} details`}>
      <header className="detail-top"><button onClick={onClose} aria-label="Close details"><X size={21} /></button><div><span>{relativeDate(job.published_at || job.updated_at)}</span><span>{job.status === "saved" ? "Saved role" : "Ready to review"}</span></div><div className="detail-top-actions"><button onClick={onSave}><Bookmark size={16} />{job.status === "saved" ? "Saved" : "Save"}</button><button className="button primary" onClick={onOpen}>Open application <ArrowUpRight size={16} /></button></div></header>
      <section className="detail-hero"><div className="detail-company"><span className="company-logo large">{initials(job.company)}</span><span>{job.company}</span></div><h2>{job.title}</h2><div className="detail-layout"><div><div className="detail-meta"><span><MapPin size={17} />{job.location}</span><span><Clock3 size={17} />Full-time</span><span><CalendarDays size={17} />{job.match.experienceNeeded ? `${job.match.experienceNeeded}+ years experience` : "Experience flexible"}</span></div><p className="detail-description">{job.description || "Open the official application to read the full description."}</p><section className="detail-section"><h3>Relevant skills</h3><div className="drawer-skills">{(job.match.matchedSkills || []).length ? job.match.matchedSkills!.map((skill) => <span key={skill}>{skill}</span>) : <span className="muted">No direct skill overlap detected yet.</span>}</div></section></div><div className="score-panes"><aside className="breakdown-card deterministic-pane"><div className="pane-label">Deterministic matcher</div><div className="breakdown-score"><strong>{job.score}%</strong><span>{job.verdict === "strong" ? "Strong match" : job.verdict === "possible" ? "Good match" : "Review match"}</span></div><div className="breakdown-lines"><span>Experience fit <b>{experienceScore}%</b></span><i><em style={{ width: `${experienceScore}%` }} /></i><span>Skill alignment <b>{skillScore}%</b></span><i><em style={{ width: `${skillScore}%` }} /></i><span>Role focus <b>{roleScore}%</b></span><i><em style={{ width: `${roleScore}%` }} /></i></div><small className="pane-note">Fast, explainable score used for every job.</small></aside><aside className="breakdown-card qwen-pane"><div className="pane-label"><Bot size={14} /> Qwen3 local review</div>{!aiReview ? <><strong className="qwen-idle">Not run yet</strong><p>Optional second opinion using your résumé and this JD. It does not replace the deterministic score.</p>{aiReviewMessage && <div className="qwen-error">{aiReviewMessage}</div>}<button className="button secondary" onClick={runLocalReview} disabled={aiReviewLoading}>{aiReviewLoading ? "Running locally…" : "Run Qwen review"}</button></> : <><div className="qwen-summary"><strong>{Math.round(qwenDimensions.reduce((sum, [, value]) => sum + value, 0) / qwenDimensions.length)}%</strong><span>{aiReview.recommendation === "apply" ? "Worth applying" : aiReview.recommendation === "skip" ? "Skip" : "Review"}</span></div><div className="breakdown-lines">{qwenDimensions.map(([label, value]) => <Fragment key={label}><span>{label} <b>{value}%</b></span><i><em style={{ width: `${value}%` }} /></i></Fragment>)}</div><small className="pane-note">{aiReview.confidence} confidence · local only</small><button className="button secondary" onClick={runLocalReview} disabled={aiReviewLoading}>{aiReviewLoading ? "Running locally…" : "Run again"}</button></>}</aside></div></div></section>
      <section className="detail-reasons"><h3>Why this role is showing up</h3><ul>{(job.match.reasons || []).map((reason) => <li key={reason}><Check size={16} />{reason}</li>)}</ul></section>
      <section className="application-tools"><button onClick={onCoverLetter}><Mail size={20} /><span><b>Build cover letter</b><small>Use this role, skills, and your verified achievements</small></span><ChevronRight size={18} /></button><button onClick={onTailor}><WandSparkles size={20} /><span><b>Tailor résumé</b><small>Create a truthful job-specific résumé draft</small></span><ChevronRight size={18} /></button><button onClick={onApplied}><Check size={20} /><span><b>Mark as applied</b><small>Keep your application pipeline up to date</small></span><ChevronRight size={18} /></button></section>
    </main>
  </div>;
}

type LocalReview = { jdFit: number; experienceFit: number; qualificationFit: number; locationFit: number; confidence: "low" | "medium" | "high"; missingMustHaves: string[]; evidence: string[]; recommendation: "apply" | "review" | "skip" };

function LocalReviewModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [review, setReview] = useState<LocalReview | null>(null);
  const [model, setModel] = useState("qwen3:1.7b");
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<{ model: string; review: LocalReview }>(`/jobs/${job.id}/local-review`, { method: "POST" }).then((result) => { setModel(result.model); setReview(result.review); }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not run the local model"));
  }, [job.id]);
  const dimensions = review ? [["JD fit", review.jdFit], ["Experience", review.experienceFit], ["Qualifications", review.qualificationFit], ["Location", review.locationFit]] as [string, number][] : [];
  return <div className="tailor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="tailor-modal local-review-modal" role="dialog" aria-modal="true" aria-label="Local AI job review"><header><div><p className="eyebrow">Private local review · {model}</p><h2>Evidence check for this role</h2><p>{job.company} · {job.title}</p></div><button onClick={onClose} aria-label="Close"><X size={19} /></button></header>{message ? <div className="notice"><CircleAlert size={15} />{message}<span>Start Ollama with <code>brew services start ollama</code>.</span></div> : !review ? <div className="tailor-loading">Reading the job description and your verified profile locally…</div> : <><div className="local-review-summary"><strong>{Math.round(dimensions.reduce((sum, [, value]) => sum + value, 0) / dimensions.length)}%</strong><span>{review.recommendation === "apply" ? "Worth applying" : review.recommendation === "skip" ? "Skip this role" : "Review before applying"}</span><small>{review.confidence} confidence · no data leaves this Mac</small></div><div className="local-review-dimensions">{dimensions.map(([label, value]) => <div key={label}><span>{label}<b>{value}%</b></span><i><em style={{ width: `${value}%` }} /></i></div>)}</div><section className="local-review-columns"><div><h3>Missing must-haves</h3>{review.missingMustHaves.length ? <ul>{review.missingMustHaves.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">No explicit missing must-haves detected.</p>}</div><div><h3>Evidence from your profile</h3>{review.evidence.length ? <ul>{review.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">The model found no reliable evidence.</p>}</div></section><footer><span>Qwen3 is a second opinion; the explainable matcher remains primary.</span><button className="button secondary" onClick={onClose}>Done</button></footer></>}</section></div>;
}

type CoverLetter = { body: string; updated_at?: string | null };

function CoverLetterModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [body, setBody] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { api<CoverLetter>(`/jobs/${job.id}/cover-letter`).then((letter) => setBody(letter.body)).catch((error) => setMessage(error instanceof Error ? error.message : "Could not prepare a cover letter")).finally(() => setLoading(false)); }, [job.id]);
  async function save() { setSaving(true); try { const result = await api<{ file_path: string }>(`/jobs/${job.id}/cover-letter`, { method: "PUT", body: JSON.stringify({ body }) }); setMessage(`Saved to ${result.file_path}`); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this cover letter"); } finally { setSaving(false); } }
  return <div className="tailor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="tailor-modal cover-letter-modal" role="dialog" aria-modal="true" aria-label="Build cover letter"><header><div><p className="eyebrow">Role-specific application</p><h2>Build cover letter</h2><p>{job.company} · {job.title}</p></div><button onClick={onClose} aria-label="Close"><X size={19} /></button></header>{message && <div className="notice"><Check size={15} />{message}</div>}{loading ? <div className="tailor-loading">Building a truthful, job-specific draft…</div> : <><p className="cover-letter-help">This draft uses the role, skills detected in your résumé, and only the achievements you entered in your profile. Edit it freely before saving.</p><textarea className="cover-letter-editor" value={body} rows={18} onChange={(event) => setBody(event.target.value)} /><footer><span>Saved cover letters stay on this Mac.</span><div><button className="button secondary" onClick={onClose}>Done</button><button className="button primary" onClick={save} disabled={saving || !body}>{saving ? "Saving…" : "Save cover letter"}</button></div></footer></>}</section></div>;
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
      <section className="form-card"><div className="form-title"><Sparkles size={18} /><div><h2>Verified achievements</h2><p>One achievement per line. These are the only accomplishments JobPilot may use in cover-letter drafts.</p></div></div><label className="field wide"><span>Achievements with evidence or outcomes</span><textarea rows={7} value={draft.achievements} onChange={(event) => setDraft({ ...draft, achievements: event.target.value })} placeholder="Reduced API latency by 35% by improving caching and query performance.&#10;Built an internal workflow used by 4 teams." /></label></section>
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
  type Target = { id: number; company: string; career_url: string; enabled: number; source_id?: number; source_enabled?: number; provider?: string; job_count: number; last_error?: string };
  const [targets, setTargets] = useState<Target[]>([]);
  const [company, setCompany] = useState(""); const [careerUrl, setCareerUrl] = useState(""); const [token, setToken] = useState(""); const [provider, setProvider] = useState("greenhouse");
  const [query, setQuery] = useState(""); const [message, setMessage] = useState("");
  const reload = useCallback(() => api<Target[]>("/targets").then(setTargets).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  async function add(event: FormEvent) { event.preventDefault(); setMessage(""); try { await api("/targets", { method: "POST", body: JSON.stringify({ company, career_url: careerUrl, token, provider }) }); setCompany(""); setCareerUrl(""); setToken(""); setMessage("Company added to your watchlist."); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add company"); } }
  async function toggle(target: Target) { await api(`/targets/${target.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !target.enabled }) }); await reload(); }
  async function remove(target: Target) { await api(`/targets/${target.id}`, { method: "DELETE" }); setMessage(`${target.company} removed. Its feed will no longer sync.`); await reload(); }
  const visibleTargets = targets.filter((target) => target.company.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="settings-page watchlist-page"><header className="settings-header"><div><p className="eyebrow">Discovery settings</p><h1>Company watchlist</h1><p>Choose exactly which companies JobPilot should track. Turn a company off to pause its feed without losing it, or remove it completely.</p></div><button className="button primary" onClick={async () => { await onSync(); reload(); }} disabled={syncing}><RefreshCw size={16} className={syncing ? "spin" : ""} /> Sync selected feeds</button></header>
    {message && <div className="notice"><Check size={15} />{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={15} /></button></div>}
    <section className="watchlist-summary"><div><strong>{targets.filter((target) => target.enabled).length}</strong><span>active companies</span></div><div><strong>{targets.filter((target) => target.enabled && target.source_id).length}</strong><span>connected public feeds</span></div><div><strong>{targets.filter((target) => target.enabled).reduce((sum, target) => sum + Number(target.job_count || 0), 0).toLocaleString()}</strong><span>roles available to review</span></div></section>
    <section className="watchlist-controls"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a company" /></label><span>{visibleTargets.length} companies</span></section>
    <section className="watchlist-grid">{visibleTargets.map((target) => <article className={`watchlist-card ${target.enabled ? "" : "is-paused"}`} key={target.id}><label className="company-toggle"><input type="checkbox" checked={Boolean(target.enabled)} onChange={() => void toggle(target)} /><span /></label><span className="company-logo">{initials(target.company)}</span><div className="watchlist-copy"><strong>{target.company}</strong><span>{target.source_id ? `${target.job_count} indexed roles · ${target.provider === "lever" ? "Lever" : "Greenhouse"} feed` : "Official careers portal"}</span></div><div className="watchlist-actions"><button onClick={() => window.open(target.career_url, "_blank", "noopener,noreferrer")}>Portal <ExternalLink size={13} /></button><button className="remove-company" onClick={() => void remove(target)}>Remove</button></div></article>)}</section>
    <section className="add-company-card"><div><p className="eyebrow">Expand your watchlist</p><h2>Add a company</h2><p>Add an official careers page. A Greenhouse or Lever token is optional, but connects its public feed for automatic job discovery.</p></div><form className="watchlist-add-form" onSubmit={add}><Field label="Company" value={company} onChange={setCompany} placeholder="Acme" /><Field label="Careers page URL" value={careerUrl} onChange={setCareerUrl} placeholder="https://careers.example.com" /><label className="field"><span>Public feed provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select></label><Field label="Board token (optional)" value={token} onChange={setToken} placeholder="acme" /><button className="button primary"><Plus size={16} />Add company</button></form></section>
  </div>;
}

function ExtensionView() {
  return <div className="settings-page"><header className="settings-header"><div><p className="eyebrow">One-click applications</p><h1>JobPilot Autofill</h1><p>The included Chrome extension fills known fields on the official application page. You always review and submit.</p></div><span className="privacy-chip"><WandSparkles size={14} /> Manifest V3</span></header>
    <div className="extension-layout"><section className="form-card install-card"><div className="extension-graphic"><span><WandSparkles size={28} /></span><i>1</i><i>2</i><i>3</i></div><h2>Load the extension locally</h2><ol><li>Open <code>chrome://extensions</code> in Chrome.</li><li>Enable <strong>Developer mode</strong>.</li><li>Choose <strong>Load unpacked</strong> and select this repository’s <code>extension</code> folder.</li><li>Pin JobPilot Autofill. Open a Greenhouse application and click <strong>Fill application</strong>.</li></ol></section>
      <section className="safety-card"><CircleAlert size={18} /><div><h3>Designed to stop safely</h3><p>Unknown, demographic, legal, sponsorship, file-upload, and CAPTCHA fields are left for you. The extension never clicks Submit.</p></div></section></div>
  </div>;
}

function LocalReviewView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [review, setReview] = useState<LocalReview | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { api<Job[]>("/jobs?status=all&minScore=55&limit=25").then((next) => { setJobs(next); setSelectedId(next[0]?.id || null); }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not load review queue")).finally(() => setLoading(false)); }, []);
  const selected = jobs.find((job) => job.id === selectedId) || null;
  async function runReview() {
    if (!selected) return;
    setRunning(true); setMessage("");
    try { const result = await api<{ review: LocalReview; durationMs: number }>(`/jobs/${selected.id}/local-review`, { method: "POST" }); setReview(result.review); setDurationMs(result.durationMs); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not run Qwen3"); }
    finally { setRunning(false); }
  }
  useEffect(() => { setReview(null); setDurationMs(null); setMessage(""); }, [selectedId]);
  const dimensions = review ? [["JD fit", review.jdFit], ["Experience", review.experienceFit], ["Qualifications", review.qualificationFit], ["Location", review.locationFit]] as [string, number][] : [];
  return <div className="settings-page ai-review-page"><header className="settings-header"><div><p className="eyebrow">Local model workspace</p><h1>AI review queue</h1><p>Compare the explainable matcher with Qwen3 only when a role deserves a closer look. Nothing is sent to a cloud model.</p></div><span className="privacy-chip"><Bot size={14} /> Qwen3 · 1.7B</span></header>{message && <div className="notice"><CircleAlert size={15} />{message}</div>}<div className="review-workspace"><section className="review-queue"><div className="review-queue-heading"><div><h2>Review queue</h2><p>Top 25 roles scoring 55 or higher</p></div><span>{jobs.length} roles</span></div>{loading ? <LoadingRows /> : jobs.length ? jobs.map((job) => <button className={`review-queue-item ${job.id === selectedId ? "active" : ""}`} key={job.id} onClick={() => setSelectedId(job.id)}><span className="company-logo">{initials(job.company)}</span><span><strong>{job.title}</strong><small>{job.company} · {job.location}</small></span><b>{job.score}%</b></button>) : <p className="muted">No review candidates yet.</p>}</section><section className="review-focus">{selected ? <><div className="review-focus-heading"><div><p className="eyebrow">Selected role</p><h2>{selected.title}</h2><p>{selected.company} · {selected.location}</p></div><button className="button primary" onClick={runReview} disabled={running}><Bot size={16} />{running ? "Running locally…" : review ? "Run again" : "Run Qwen review"}</button></div><div className="review-panes"><article className="review-pane deterministic-review-pane"><div className="pane-label">Deterministic matcher</div><strong className="review-score">{selected.score}%</strong><span className="review-verdict">{selected.verdict === "strong" ? "Strong match" : selected.verdict === "possible" ? "Good match" : "Review match"}</span><div className="breakdown-lines"><span>Matched skills <b>{selected.match.matchedSkills?.length || 0}</b></span><span>Experience requirement <b>{selected.match.experienceNeeded ? `${selected.match.experienceNeeded}+ yrs` : "Flexible"}</b></span></div><ul className="review-reasons">{(selected.match.reasons || []).slice(0, 4).map((reason) => <li key={reason}><Check size={14} />{reason}</li>)}</ul><small>Fast and explainable. Runs during sync/rescore.</small></article><article className="review-pane qwen-review-pane"><div className="pane-label"><Bot size={14} /> Qwen3 local review</div>{!review ? <div className="review-empty"><strong>Not run for this role</strong><p>Use the button above to ask the local model for a second opinion across JD, experience, qualifications, and location.</p></div> : <><div className="review-score-row"><strong>{Math.round(dimensions.reduce((sum, [, value]) => sum + value, 0) / dimensions.length)}%</strong><span>{review.recommendation === "apply" ? "Worth applying" : review.recommendation === "skip" ? "Skip" : "Review"}</span></div><div className="breakdown-lines">{dimensions.map(([label, value]) => <Fragment key={label}><span>{label}<b>{value}%</b></span><i><em style={{ width: `${value}%` }} /></i></Fragment>)}</div><div className="review-columns"><div><h3>Missing must-haves</h3>{review.missingMustHaves.length ? <ul>{review.missingMustHaves.map((item) => <li key={item}>{item}</li>)}</ul> : <p>None detected.</p>}</div><div><h3>Evidence</h3>{review.evidence.length ? <ul>{review.evidence.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : <p>None returned.</p>}</div></div><small>{review.confidence} confidence · completed in {durationMs ? `${Math.round(durationMs / 100) / 10}s` : "—"}</small></>}</article></div></> : <div className="empty-state"><Bot size={28} /><h3>Select a role</h3><p>Choose a job from the review queue to compare both matchers.</p></div>}</section></div></div>;
}
