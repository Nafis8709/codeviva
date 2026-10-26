# Shipping CodeViva — Build With AI: Basics

**Deadline: Monday Oct 26, 2026, 5:00 PM ET = Tuesday Oct 27, 3:00 AM Dhaka time.**
Submit a saved, complete entry at least an hour early — Devpost gets slow near the deadline.

## 0. Before anything: read the plan

Open `devpost/scope.md`, `prd.md`, `spec.md`. They describe what was built and why. Change anything that doesn't match what you want — it's your project and your submission. (Each starts with a process note about how it was produced; keep it accurate.)

## 1. Run it with a real key (10 min)

1. Install Node.js 18.17+ if needed: https://nodejs.org
2. Get a free Gemini key: https://aistudio.google.com/apikey
3. In the project folder:
   ```bash
   npm install
   copy .env.example .env      # macOS/Linux: cp .env.example .env
   ```
   Put the key after `GEMINI_API_KEY=` in `.env`.
4. `npm start` → open http://localhost:3000. The pill in the top-right should say **AI examiner · gemini-3.1-flash-lite**.
5. Do one full viva on the sample project and one on a file from any project of your own.

If you see *"model was not found"*, set `GEMINI_MODEL=gemini-3-flash-preview` (or another current model from https://ai.google.dev/gemini-api/docs/models) in `.env` and restart. If you hit the free-tier rate limit, wait a few seconds and press **Retry** — the session is kept.

`npm test` should print `pass 29`.

## 2. Record the demo video (under 3 minutes — judges stop at 3:00)

Judging criterion "Presentation": *does the video show it working end-to-end, and say what problem it solves, for whom, and why it matters?*

Record the browser at 1080p (OBS, Xbox Game Bar `Win+Alt+R`, or macOS `Cmd+Shift+5`). Close other tabs; make sure `.env` and your key are never on screen. No copyrighted music.

| Time | Show on screen | Say (in your own words) |
|---|---|---|
| 0:00–0:20 | Setup screen | The problem: everyone eventually has to explain their code out loud (viva, project defense, code review, job interview), and AI agents now write code people can't explain. |
| 0:20–0:35 | Click **Try the sample project**, pick settings, **Start viva** | What CodeViva is in one sentence. |
| 0:35–1:20 | First question: point at the highlighted lines. Give a **half-right** answer → Partial stamp → the follow-up appears. Answer it well. | The kernel: questions anchored to *your* lines, and it pushes back like a real examiner. |
| 1:20–1:45 | Answer one question **by voice** (Speak button), and press **I don't know — teach me** on another | Voice like a real viva; it teaches instead of just failing you. |
| 1:45–2:15 | Report: red-pen score, **heatmap**, click a gap to jump to its lines, revision list | The "aha": you now know exactly which lines you can't defend. |
| 2:15–2:40 | New viva → drop in one of **your own** files (any language: Python, Java, JS…) → one question | Works on any code, not just the sample. Optionally mention the examiner-language option for non-native speakers. |
| 2:40–2:55 | Quick look at `devpost/` docs in the repo | Built with the Devpost Learn Skill Pack: scope → PRD → spec → build. |

Upload to **YouTube as Public or Unlisted** (Unlisted is fine if anyone with the link can view it). Open the link in a private window to check it plays without login.

Tip: do one rehearsal run first so the examiner's questions don't surprise you on camera; with the AI examiner the questions vary per run, which is fine — that's the point.

## 3. Publish the repository

Create an **empty public** repo on GitHub named `codeviva` (no README/license — the project has them). Then in the project folder:

```bash
git status            # should be clean; devpost/learner-profile.md and .env must NOT be listed as tracked
git remote add origin https://github.com/<your-username>/codeviva.git
git push -u origin main
```

Then on the repo page:
- Check the **About** section on the right shows **MIT license** (required by the rules). Add the description and topics (`hackathon`, `education`, `gemini`, `viva`).
- Open the repo in a private window to confirm it's public.
- Make sure **no API key** appears anywhere: `git log -p | grep -i "AIza"` should print nothing.

The folder is already a git repository with the build history (one commit per verified slice), which shows the Skill Pack's build process.

## 4. Fill in the Devpost form

The Skill Pack's `6-ship` step asks that the project name, description and form answers be **written by you**, and judges read a lot of AI-written copy — your own voice is an advantage. Below are the **facts** to draw from, not text to paste.

### Required links
- **Try it out / code:** your public GitHub URL
- **Video:** your YouTube URL
- **Built with:** Node.js, Express, JavaScript, HTML, CSS, Google Gemini API, Web Speech API, Devpost Learn Skill Pack, Claude (coding agent)

### Facts for "What it does"
- Oral-exam (viva) practice for the student's own code; questions name a file and line range, which are highlighted.
- Marks each answer Solid / Partial / Gap with feedback and model answer; one adaptive follow-up for partial answers; "I don't know — teach me".
- Report: ownership score /100 computed deterministically (best of original + follow-up per question), heatmap over the code, strengths, gaps with line links, 3 revision tasks, copy as Markdown.
- Friendly or strict examiner; 3 or 5 questions; voice answers; English by default with an optional examiner language for non-native speakers.
- Runs locally; no key → clearly labelled scripted demo mode.

### Facts for "How it was built"
- Planned with the Skill Pack sequence: `scope.md` → `prd.md` → `spec.md` → `checklist.md` (5 slices, each verified and committed) → `app-map.html`.
- Model output is validated: numbered code in, fixed JSON shape out, `clampRange` repairs bad file names / line numbers, score determines verdict.
- 29 automated tests (Node's built-in runner), including a fake model and a mocked Gemini API; headless-browser walkthroughs at desktop and phone width.

### Facts for "Challenges / what was learned"
- Real bug found by the browser run: the highlight scrolled to the wrong lines at phone width (offset measured from the wrong element).
- Real bug found by the browser run: demo grading counted "150" as the answer "0"; short keywords now match whole words only.
- Gemini 2.5 models were shut down on Oct 16, 2026, so the default model had to be a current one and made configurable.
- Design decision: the AI never decides the score or the lists in the report — only words — so the numbers are reproducible.

### The two newer required questions
- **"Describe the actual use of the Devpost Learn Skill Pack."** Answer truthfully. What actually happened: the Skill Pack was installed into the project folder with `npx skills add challengepost/learn-ai-basics --all -y`; Claude (as the coding agent) followed its six skills' structure and templates to produce `learner-profile.md` (kept private), `scope.md`, `prd.md`, `spec.md`, the slice checklist with per-slice verification and commits, and `app-map.html`. Because you delegated the decisions to the agent instead of doing the pack's flipped-interaction interview, the planning docs say so in their process notes — describe it the same way, plus whatever you yourself did (reviewing/editing the docs, testing with your key, recording the video).
- **Age of majority:** you must be at least the age of majority where you live to enter.

### New projects only
The rules require the project to be created during the submission period (Sept 22 – Oct 26, 2026) and to disclose pre-existing code. Everything here was created on Oct 26, 2026; third-party code is limited to the npm packages `express` and `dotenv` and the Skill Pack itself.

## 5. Final checklist

- [ ] App runs with your key; one full viva done on your own code
- [ ] Planning docs reviewed (and edited where they don't match you)
- [ ] Video < 3 min, public/unlisted on YouTube, plays in a private window
- [ ] Repo public, MIT license visible in About, no secrets in history
- [ ] Devpost form: your own name/description/answers, Skill Pack usage question, age question, links saved
- [ ] **Submit** (not just save draft) before 3:00 AM Dhaka
