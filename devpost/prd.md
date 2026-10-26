---
doc: prd
status: approved
---

> **Process note.** Product decisions below were proposed by the agent under the learner's explicit delegation (see `scope.md`), following the `3-prd` structure. "Product Decisions" marks them as agent-proposed rather than attributing them to the learner.

# CodeViva — Product Requirements

An AI viva examiner for students who need to defend code they shipped, starting with Bangladeshi software engineering students preparing for project vivas.
Source: `scope.md > Who It's For`, `scope.md > The Unique Kernel`.

## The Core Journey
1. The student opens CodeViva and lands on the **Setup screen**.
2. They load code: drag files onto the drop zone, pick files, paste a snippet, or click **Try the sample project**. Loaded files appear as a list with line counts.
3. They choose examiner language (English / বাংলা), style (Friendly TA / Strict external), and length (3 or 5 questions), then press **Start viva**.
4. The **Viva screen** opens: code on the left, examiner conversation on the right. The examiner's first question appears, and the code panel switches to the referenced file and highlights the referenced lines.
5. The student answers by typing or by holding the mic button and speaking, then presses **Submit answer**. Or presses **I don't know — teach me**.
6. The examiner marks the answer **Solid**, **Partial**, or **Gap**, shows one or two lines of feedback, and the gutter next to the examined lines takes that colour.
7. If the answer was partial and this question hasn't had a follow-up yet, the examiner asks a **follow-up** on the same lines. Otherwise it moves to the next question on a different part of the code.
8. After the last question, the **Report screen** shows: ownership score out of 100, a one-paragraph verdict, the code heatmap, what the student clearly owns, what they couldn't defend (with line references), and 3 things to revise before the real viva.
9. The student can copy the report as Markdown or start a new viva.

Success = the student knows, line by line, what they can't yet explain.

## Screens and Layout
- **Setup screen** — centred "exam paper" card: title, one-line promise, drop zone + paste box, loaded-file list, three settings, Start button, and a small status pill (AI provider or Demo mode).
- **Viva screen** — two columns on desktop (code ~55%, conversation ~45%); stacked on mobile (conversation first, code collapsible). Top: question progress ("Question 2 of 5"), Quit button.
- **Report screen** — score "marked in red pen", verdict, heatmap code view (same viewer as viva), three lists, Copy as Markdown, New viva.

## Look and Feel
- Exam-hall paper: warm off-white paper background, deep ink-navy text, ruled-line accents.
- The examiner's **red pen** is the accent colour (gaps, score circle); amber for partial; green for solid.
- Serif headings (academic, a little old-fashioned), clean sans for UI text, monospace for code. Bangla text uses a proper Bengali font.
- Calm, serious, minimal. No purple gradients, no emoji confetti, no chatbot bubbles with avatars — examiner turns look like margin notes on an exam script.
- Copy tone: direct, examiner-like, never mocking ("Partial — you named the loop, but not why it stops at `n-1`.").

## Features and Behavior

### Loading Code
- Accepts multiple text/code files (`.c .cpp .h .java .py .js .ts .cs .go .rb .php .kt .swift .sql .html .css` and similar) via picker or drag-drop, plus a paste box (named "pasted-code").
- **Try the sample project** loads a bundled two-file C project (a bank token queue) that students would recognise from SPL.
- Shows each file with its line count; a file can be removed.
- [ ] Dropping two `.c` files lists both with correct line counts.
- [ ] Clicking the sample button lists the sample files immediately.

### Asking Line-Anchored Questions
- Every examiner question names a file and a line range; the code panel scrolls to and highlights it.
- Questions target things an examiner would ask: why a design choice, what happens on an edge case, what a line does, complexity, memory/resource handling, what would break if something changed.
- Questions cover different regions; the same lines aren't asked twice except for follow-ups.
- [ ] When a question appears, the referenced lines are highlighted and visible without manual scrolling.

### Answering
- Text box answer; **Submit answer** (also Ctrl/Cmd+Enter).
- Optional mic button using the browser's built-in speech recognition, in the chosen language; the transcript fills the text box for editing before submit. Hidden if the browser doesn't support it.
- **I don't know — teach me** records a Gap and shows a short explanation of the correct answer.
- [ ] An empty answer cannot be submitted.

### Grading and Follow-ups
- Each answer gets a verdict (Solid / Partial / Gap), a score 0–10, feedback naming what was right and what was missing, and — for Partial/Gap — a short model answer.
- Partial answers get at most one follow-up question on the same lines before moving on.
- Gutter colour of the examined lines updates immediately.
- [ ] A clearly wrong answer to the sample's first question gets Gap or Partial, not Solid.

### Viva Report
- Ownership score = average of the main questions' scores × 10. A question with a follow-up counts the better of its two attempts (see Product Decisions).
- One-paragraph verdict in the chosen language; strengths; gaps with file:line; three revision items.
- Heatmap: the code viewer with every examined region coloured by its final verdict; clicking a list item jumps to its lines.
- **Copy as Markdown** puts the full report on the clipboard.
- [ ] After the last answer, the report appears with a score and a coloured heatmap.

### Examiner Language and Style
- English or বাংলা for questions, feedback, and report (code identifiers stay in English).
- Friendly TA = encouraging, hints allowed; Strict external = terse, no hints, harsher partial credit.

## States and Boundaries
- **First use / no code** — Start is disabled; drop zone says what to do; sample button is prominent.
- **Too much code** — above ~60,000 characters total, a message asks the student to load only the files the viva will cover.
- **Binary / unsupported file** — skipped with a short notice.
- **Waiting for the examiner** — "The examiner is reading your code…" with the input disabled.
- **AI error / rate limit / bad key** — a readable message with a Retry button; the session is not lost.
- **No API key** — app runs in **Demo mode**: a scripted examiner, clearly labelled in the status pill and on the setup screen. Demo mode is fully scripted for the sample project and uses simple pattern-based questions for other code.
- **Persistence** — nothing is stored on a server; a session lives in the tab. Refreshing ends the session.
- **Privacy** — code is sent only to the configured AI provider for this session.

## Product Decisions
All agent-proposed under delegation; learner to confirm.
- Line-anchored questions + adaptive follow-ups are the kernel — they're what make this different from a generic quiz.
- Bangla support from day one — vivas in Bangladesh are bilingual; also signals a real audience.
- Follow-ups limited to one per question — keeps sessions short enough to demo and avoids frustration loops.
- Score for a question with a follow-up = the better of the two attempts — rewards recovering under questioning, as real examiners do.
- Demo mode is honest and labelled — judges and students without a key can still see the full journey.

## What We're Building
Setup screen with all loading options and settings; viva screen with highlighted line-anchored questions, typed/voice answers, verdicts, follow-ups, "teach me"; report with score, heatmap, lists, Markdown copy; Gemini provider, OpenAI-compatible provider, and labelled demo mode.

## Deferred From the POC
- **GitHub URL import** — needs repo fetching, file filtering, size limits; paste/drop proves the kernel.
- **Session history / progress over time** — needs storage and accounts.
- **Teacher/supervisor mode** — a different user with different needs.

## Possible Later Enhancements
- Voice examiner (text-to-speech questions) for a fully spoken mock viva.
- "Explain this commit" mode: viva on only the lines changed by an AI agent in the last commit.
- Export the report as a PDF study sheet.

## Non-Goals
- Not a code reviewer or linter — it never rewrites the student's code.
- Not a cheating tool — it doesn't write viva answers for the student to memorise before they've tried.
- Doesn't execute uploaded code.

## Open Questions
- Exact free-tier model availability changes often; spec makes the model configurable. (Can wait — handled in `4-spec`.)
