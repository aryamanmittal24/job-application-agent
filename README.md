# JobPilot

JobPilot is a private, local-first job discovery and application-assistance workspace. It reads public Greenhouse job boards, scores roles against your verified profile and résumé text, tracks your application status in SQLite, and includes a Chrome extension for one-click form filling.

The extension never submits an application. Unknown, legal, demographic, sponsorship, CAPTCHA, and file-upload fields are deliberately left for review.

## Included in this first working slice

- Greenhouse public Job Board API ingestion
- Starter sources for Figma, Stripe, Cloudflare, and Datadog
- Local, deterministic résumé/job scoring with visible evidence
- Search, score filters, saved roles, and application tracking
- Locally stored profile and preferences
- PDF résumé import with local text extraction
- Editable résumé sections used as the matching source
- Automatic extraction of contact, employment, education, experience, and skills
- Greenhouse question-schema endpoint for future preflight checks
- Manifest V3 extension supporting Greenhouse, Lever, Workday, Ashby, and Workable pages
- SQLite duplicate prevention by source and external job ID
- Optional local Qwen3 1.7B review for borderline matches (via Ollama)

## Requirements

- Node.js 22.13 or newer
- Chrome or Chromium for the extension
- Ollama (optional, only needed for local model review)

## Run locally

```bash
npm install
npm run dev:all
```

Open `http://localhost:3000`. The local API runs on `http://127.0.0.1:4010`, and the SQLite file is created at `data/job-agent.sqlite`.

## Optional local model review

JobPilot's primary score stays deterministic and explainable. For a second opinion on a specific role, install Ollama and pull the compact Qwen3 model:

```bash
brew install ollama
brew services start ollama
ollama pull qwen3:1.7b
```

The model is stored by Ollama (not inside this repository) and is about 1.4 GB. Check it with `curl http://127.0.0.1:4010/api/llm/status`, then request a review for a stored job with `POST /api/jobs/<id>/local-review`. Résumé and job text stay on this machine. Set `JOB_AGENT_OLLAMA_MODEL` or `JOB_AGENT_OLLAMA_URL` if you want to use a different local model/server. The app continues to work when Ollama is unavailable.

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `extension` folder.
5. Pin **JobPilot Autofill**.
6. Import your résumé and verify the extracted profile, then open a supported application and click **Fill application**.

## Add another Greenhouse company

Open **Job sources** in the dashboard. The board token is normally the final path segment in a URL such as `https://boards.greenhouse.io/acme`, where the token is `acme`.

## Tests

```bash
npm test
```

## Résumé and profile behavior

- Importing or replacing a PDF extracts its sections and updates résumé-derived profile fields.
- Editing résumé sections and saving them immediately rescores every stored job.
- The original selected PDF is retained locally for résumé upload fields in supported application forms.
- Direct section edits affect matching text but do not rewrite the layout of the original PDF. Replace the PDF when you want applications to upload a newly formatted version.

## Current boundaries

- PDF import is supported; DOCX import and visual résumé regeneration are not included yet.
- The first discovery connector is Greenhouse. Lever and Ashby discovery are planned next.
- Autofill uses conservative field-label mappings and a saved-answer vault. It does not bypass anti-bot controls or click Submit.
- Node's built-in SQLite module is still marked experimental in Node 22, but keeps this personal MVP dependency-light. It can be replaced with `better-sqlite3` without changing the data model.
