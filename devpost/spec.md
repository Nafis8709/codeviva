---
doc: spec
status: approved
---

> **Process note.** Technical choices below were recommended by the agent and accepted under the learner's delegation (see `scope.md`). `4-spec` allows recommendations; consequential choices are listed under **Decisions and Open Issues** so the learner can change them.

# CodeViva — Technical Spec

## How This Works, In Plain Language
CodeViva is a small web app with two halves.

- **The page in your browser** shows the setup screen, the code with line numbers, the examiner conversation, and the report. It keeps the whole viva session (questions, your answers, verdicts) in memory while the tab is open.
- **A small Node.js server on your computer** serves that page and talks to the AI. The browser never sees the API key — it asks the server "give me the next question" or "grade this answer", and the server asks the AI.

The server sends the AI your code **with line numbers written in front of every line**, plus strict instructions to reply in a fixed JSON shape (which file, which lines, what question). The server then checks that reply — real file, real line numbers, a valid verdict — before passing it to the page. That checking step is what makes the line highlighting trustworthy.

If no API key is configured, the server uses a **demo examiner** instead of the AI: scripted questions for the bundled sample project and simple pattern-based questions for other code. The page labels this clearly.

Why this shape: one server file plus a few small modules, no database, no front-end framework, no build step. Anyone can run it with `npm install && npm start`.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Student loads files → the page reads them with the browser's FileReader (or fetches `/samples/...`) → stored in page state as `{ name, content }`.
2. Start viva → page `POST /api/viva/question` with files, settings, empty history → server numbers the code, builds the question prompt, calls the AI, validates `{file, startLine, endLine, topic, question}` → page shows the question and highlights the lines.
3. Student answers → page `POST /api/viva/grade` with files, settings, history, current question, answer, and whether a follow-up is still allowed → server builds the grading prompt, validates `{verdict, score, feedback, modelAnswer, followUp}`, drops the follow-up if not allowed → page colours the gutter, shows feedback.
4. Follow-up returned → shown as the next question (same lines). Otherwise, if questions remain → step 2 again with the updated history.
5. Last question done → page `POST /api/viva/report` → server computes the ownership score itself (deterministic, not the AI's opinion) and asks the AI for summary/strengths/gaps/revision list → page renders the report and heatmap from the history.

## Stack
- **Node.js ≥ 18** (built-in `fetch`, `node:test`). https://nodejs.org/docs/latest/api/
- **Express 4** — serves static files and four JSON routes. https://expressjs.com/
- **dotenv** — reads `.env` for the API key. https://github.com/motdotla/dotenv
- **Vanilla HTML/CSS/JS** in the browser — no framework, no bundler; matches the learner's preference for simple, readable code.
- **Google Gemini API** (default AI) — free tier with an API key from Google AI Studio. Default model `gemini-3.1-flash-lite` (stable free-tier model; Gemini 2.5 models were shut down Oct 16, 2026). Override with `GEMINI_MODEL`. https://ai.google.dev/gemini-api/docs
- **OpenAI-compatible chat completions** (optional alternative) — works with OpenAI, Groq, OpenRouter, or a local server via a base URL. https://platform.openai.com/docs/api-reference/chat
- **Web Speech API** (optional voice answers, browser built-in, best in Chrome/Edge). https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- Unverified until first live run: the exact free-tier model name on the learner's key. Mitigation: configurable model + readable error message naming the model.

## Where It Runs and How Someone Tries It
- Runs locally: `npm install`, copy `.env.example` to `.env`, add `GEMINI_API_KEY`, `npm start`, open http://localhost:3000.
- Without a key it starts in **Demo mode** (labelled) — the full journey works on the sample project.
- Tests: `npm test`.
- **Demo video:** record the browser at http://localhost:3000 with a real key, using the sample project and then one of the learner's own files. Under 3 minutes, uploaded publicly to YouTube.
- **Repository:** public GitHub repo with MIT license, including `devpost/` planning docs.
- Deployment is optional (Render/Railway free tier would work with `GEMINI_API_KEY` set as an environment variable); not required.

## Look and Feel
Carried from `prd.md > Look and Feel`.
- CSS custom properties: paper `#F5F0E6`, paper-raised `#FBF8F2`, ink `#1C2A3F`, muted ink `#5B6577`, rule line `#E2D9C8`, red pen `#C0392B`, partial amber `#C98A1B`, solid green `#2E7D4F`, highlight wash `#FFF1C9`.
- Fonts (Google Fonts with system fallbacks): **Fraunces** for headings, **IBM Plex Sans** for UI, **IBM Plex Mono** for code, **Hind Siliguri** for Bangla text.
- Examiner turns styled as margin notes with a thin red left rule; student answers as handwritten-feeling indented blocks (serif italic). Verdict stamps: small uppercase bordered labels.
- Score drawn as a hand-circled number in red (SVG circle with slight rotation).
- Spacious, calm. Works down to phone width (columns stack).

## Components

### Server (`server.js`)
Express app: static `public/`, JSON body limit 1 MB, routes:
- `GET /api/status` → `{ mode, model, label }`
- `POST /api/viva/question` → `{ question }`
- `POST /api/viva/grade` → `{ grade }`
- `POST /api/viva/report` → `{ report }`
Validates inputs with `src/code.js`, picks the examiner from `src/config.js`, maps errors to readable JSON `{ error }` with HTTP 4xx/5xx.
PRD ref: `prd.md > States and Boundaries`.

### Code utilities (`src/code.js`)
- `validateFiles(files)` — array of `{name, content}`, 1–20 files, total ≤ 60,000 chars, strings only.
- `numberCode(files)` — renders `=== FILE: name (N lines) ===` then `  12 | code` per line.
- `clampRange(files, file, start, end)` — snaps AI-provided file/lines to real values (unknown file → first file; lines clamped; span capped at 15 lines).
PRD ref: `prd.md > Asking Line-Anchored Questions`, `prd.md > Loading Code`.

### Prompts (`src/prompts.js`)
Builds the system + user prompt text for question, grade, and report, including language (en/bn), style (friendly/strict), history summary, already-covered line ranges, and the exact JSON shape required.
PRD ref: `prd.md > Examiner Language and Style`, `prd.md > Grading and Follow-ups`.

### AI clients (`src/llm/gemini.js`, `src/llm/openaiCompatible.js`)
Each exports `generateJson({ system, user })`: one HTTP call, 45 s timeout, JSON-mode response, returns parsed object via `extractJson` (tolerates code fences / stray text). Throws errors with a user-readable message (bad key, rate limit, model not found).

### AI examiner (`src/examiners/aiExaminer.js`)
`askQuestion`, `grade`, `report` — prompt → LLM → validate/normalise (`clampRange`, verdict whitelist, score 0–10 integer, follow-up only when allowed and verdict is partial).
PRD ref: `prd.md > Asking Line-Anchored Questions`, `prd.md > Grading and Follow-ups`, `prd.md > Viva Report`.

### Demo examiner (`src/examiners/demoExaminer.js`)
Same three functions without AI. For the sample project: five scripted questions located by **anchor text** (not hard-coded line numbers), keyword-group grading, scripted follow-ups and model answers, English + Bangla. For other code: finds functions/loops/conditions with simple regexes and asks templated questions; grades by answer length and whether it mentions identifiers from the examined lines. Every response carries `demo: true`.
PRD ref: `prd.md > States and Boundaries` (No API key).

### Scoring (`src/scoring.js`)
`computeScore(history)` — groups follow-ups with their parent, takes the better score per question, averages, × 10, rounds. `verdictForScore` thresholds: ≥ 8 solid, ≥ 4 partial, else gap.
PRD ref: `prd.md > Viva Report`, `prd.md > Product Decisions`.

### Config (`src/config.js`)
Chooses examiner from env: `DEMO_MODE=1` → demo; `AI_PROVIDER=openai` + `OPENAI_API_KEY` → OpenAI-compatible; `GEMINI_API_KEY` → Gemini; none → demo.

### Page (`public/index.html`, `public/styles.css`, `public/app.js`)
One HTML file with three `<section>` screens toggled by `hidden`. `app.js` holds a single `state` object and small named render functions (`renderFileList`, `renderCode`, `renderTurn`, `renderReport`, …). All AI text is inserted with `textContent` (never `innerHTML`) so model output can't inject HTML. Code viewer = one `<div>` per line with a gutter cell whose class (`heat-solid/partial/gap`) shows the verdict.
PRD ref: `prd.md > Screens and Layout`, all of `prd.md > Features and Behavior`.

### Sample project (`public/samples/`)
`token_queue.h` + `token_queue.c` — a bank token queue in C with priority customers, wait estimation, and cleanup: realistic SPL-style code with genuine viva-worthy spots (tail reset on empty dequeue, priority insertion loop, integer division, `scanf` validation, freeing remaining nodes).

## Data Model
All in the browser tab (`state` in `app.js`); nothing persists after refresh — by design (`prd.md > States and Boundaries`).
```
state = {
  files: [{ name, content }],
  settings: { language: 'en'|'bn', style: 'friendly'|'strict', totalQuestions: 3|5 },
  history: [{ id, text, file, startLine, endLine, topic, isFollowUp, parentId,
              answer, dontKnow, verdict, score, feedback, modelAnswer }],
  current: question | null,
  report: { score, summary, strengths[], gaps[{text,file,startLine,endLine}], revise[] } | null,
  status: { mode, model, label }
}
```
The server is stateless: every request carries files + history.

## File Structure
```
codeviva/
├── server.js                    # Express app + 4 API routes
├── src/
│   ├── config.js                # picks Gemini / OpenAI-compatible / demo from env
│   ├── code.js                  # validate files, number lines, clamp line ranges
│   ├── prompts.js               # examiner prompts + JSON shapes
│   ├── scoring.js               # deterministic ownership score
│   ├── llm/
│   │   ├── extractJson.js       # tolerant JSON parsing of model output
│   │   ├── gemini.js            # Gemini generateContent client
│   │   └── openaiCompatible.js  # /chat/completions client
│   └── examiners/
│       ├── aiExaminer.js        # prompt → LLM → validated question/grade/report
│       └── demoExaminer.js      # scripted, labelled, no-AI examiner
├── public/
│   ├── index.html               # setup, viva, report screens
│   ├── styles.css               # exam-paper look
│   ├── app.js                   # state + rendering + API calls
│   └── samples/                 # bundled C sample project
├── test/                        # node:test tests (no extra framework)
├── devpost/                     # Skill Pack planning docs + app map
├── docs/                        # demo-video plan, submission facts, screenshots
├── .agents/ .claude/ skills-lock.json   # installed Devpost Learn Skill Pack
├── .env.example  .gitignore  LICENSE  README.md  package.json
```

## External Services and Dependencies
- **Gemini** — `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, body `{ systemInstruction:{parts:[{text}]}, contents:[{role:'user',parts:[{text}]}], generationConfig:{ responseMimeType:'application/json', temperature:0.4 } }`; response text at `candidates[0].content.parts[].text`. Key: free from https://aistudio.google.com/apikey. Free-tier rate limits apply (a few requests per minute is plenty: ~2 calls per question). Cost: $0 on free tier.
- **OpenAI-compatible** — `POST {OPENAI_BASE_URL}/chat/completions`, `Authorization: Bearer`, `response_format: {type:'json_object'}`; response `choices[0].message.content`.
- **Google Fonts** — stylesheet only; system fonts used if offline.

## Important Failure Modes
- **Model returns invalid JSON or bad line numbers** → `extractJson` + `clampRange` repair it; if unrecoverable, the page shows "The examiner lost its place — Retry" and keeps the session.
- **Bad key / model not found / rate limit** → readable error naming the cause (e.g. "Model gemini-x not found — set GEMINI_MODEL"); Retry button.
- **Speech recognition unsupported** → mic button hidden; typing still works.

## What Was Simplified and Why
- **Browser-held session** instead of a database — nothing needs to outlive the tab for the PoC. The fuller version would add accounts and stored sessions.
- **Plain line-number gutter** instead of full syntax highlighting — keeps the viewer simple and highlighting exact. Fuller version: a code editor component.
- **Demo examiner is scripted** — it demonstrates the journey honestly without a key; it is labelled and never presented as AI.

## Decisions and Open Issues
- **Stateless server + client-held history** (agent recommendation, accepted by delegation) — simplest correct design; tradeoff: every request resends the code (fine at ≤ 60 KB).
- **Score computed on the server, not by the AI** — a number the student can trust and reproduce; the AI writes only the narrative.
- **Gemini default, OpenAI-compatible optional** — free tier available in Bangladesh; the alternative protects against model/region changes.
- **Genuine uncertainty:** will a small free-tier model reliably return correct line numbers? Clarified by design: the code is sent with explicit line numbers and every reply is clamped/validated by `clampRange`; checked in tests with deliberately wrong ranges, and in the first live run with a real key.
- Open: confirm the default model name works on the learner's key during the first live run; change `GEMINI_MODEL` if not.
