# JobPilot

JobPilot is a private, local-first job discovery and application-assistance workspace. It reads public Greenhouse job boards, scores roles against your verified profile and résumé text, tracks your application status in SQLite, and includes a Chrome extension for one-click form filling.

The extension never submits an application. Unknown, legal, demographic, sponsorship, CAPTCHA, and file-upload fields are deliberately left for review.

## Included in this first working slice

- Greenhouse public Job Board API ingestion
- Starter sources for Figma, Stripe, Cloudflare, and Datadog
- Local, deterministic résumé/job scoring with visible evidence
- Search, score filters, saved roles, and application tracking
- Locally stored profile and preferences
- Greenhouse question-schema endpoint for future preflight checks
- Manifest V3 extension supporting Greenhouse, Lever, Workday, Ashby, and Workable pages
- SQLite duplicate prevention by source and external job ID

## Requirements

- Node.js 22.13 or newer
- Chrome or Chromium for the extension

## Run locally

```bash
npm install
npm run dev:all
```

Open `http://localhost:3000`. The local API runs on `http://127.0.0.1:4010`, and the SQLite file is created at `data/job-agent.sqlite`.

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `extension` folder.
5. Pin **JobPilot Autofill**.
6. Complete your JobPilot profile, open a supported application, and click **Fill application**.

## Add another Greenhouse company

Open **Job sources** in the dashboard. The board token is normally the final path segment in a URL such as `https://boards.greenhouse.io/acme`, where the token is `acme`.

## Tests

```bash
npm test
```

## Current boundaries

- Résumé text is pasted into the profile; local PDF/DOCX upload is planned next.
- The first discovery connector is Greenhouse. Lever and Ashby discovery are planned next.
- Autofill uses conservative field-label mappings and a saved-answer vault. It does not bypass anti-bot controls or click Submit.
- Node's built-in SQLite module is still marked experimental in Node 22, but keeps this personal MVP dependency-light. It can be replaced with `better-sqlite3` without changing the data model.
