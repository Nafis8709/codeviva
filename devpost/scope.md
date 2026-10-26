---
doc: scope
status: approved
---

> **Process note (honest provenance).** The learner delegated idea selection and planning decisions to the agent ("i fully trust you… build a winnable project") with ~10 hours left before the deadline. The agent followed the `2-scope` structure but proposed the idea itself instead of running the flipped-interaction interview. Approval below is by that explicit delegation. After reviewing the first version, the learner asked for an international audience rather than one tied to their own university course and to Bangla; this version reflects that.

# CodeViva

An AI viva examiner that questions you about the exact lines of code you shipped — so you find out what you can't defend before a real examiner does.

## The Unique Kernel
Every question is **anchored to specific lines of your own code** (they light up as the examiner asks), and the examiner **probes deeper when an answer is shallow**, like a real external examiner. The session ends with an **ownership heatmap**: your code, with each examined region coloured by how well you defended it.

Generic quiz apps ask textbook questions. CodeViva asks "Line 42 — why `<=` and not `<`? What breaks if the queue is empty?"

## Who It's For
A computer-science student, anywhere, the week before they have to defend their project out loud — a viva or oral exam in much of Europe and Asia, a project demo or code walkthrough elsewhere. Their project works, but parts were written with an AI coding agent or adapted from tutorials, and they're not sure they can explain them. Today they re-read their code and hope; a friend might quiz them, but friends don't know the code.

The same moment comes for bootcamp graduates and junior developers: "walk me through this code" in a job interview or a code review. Anyone who ships AI-assisted code has working code and unverified understanding.

## The Core Loop
1. Load your project files (or a sample).
2. The examiner asks one question about a highlighted region.
3. You answer (typed or spoken).
4. You get a verdict (solid / partial / gap) and either a sharper follow-up or the next question.
5. Repeat for a few questions → report with the heatmap and what to revise.

People come back the night before each viva, and after each big AI-assisted change to their code.

## Inspiration & Identity
The feel of a real exam: paper, ink, an examiner's red pen. Calm and serious, not a gamified chatbot. English by default; non-native English speakers can choose to be examined in their own language.

## Why This Matters to the Learner
The learner is a software engineering student who has had to defend project code in person. Using AI agents to build — exactly what this hackathon teaches — makes "can you explain your own code?" the question that matters most, for every student and junior developer, not just in one country.

## What "Working" Looks Like
Open the app → click "Try sample project" (or drop in your own files) → Start viva → the examiner highlights lines and asks a question → you give a half-right answer → it catches the gap and asks a pointed follow-up → after the last question, the report shows a score like **64/100**, and the code view turns into a heatmap with red on the lines you couldn't explain.

**"Oh, that's cool" beat:** the code panel jumping to and highlighting the exact lines as the examiner asks, and the red-pen heatmap at the end.

## The POC Boundary
- Load code by paste, file picker / drag-drop (text files), or bundled sample.
- 3 or 5 question sessions, at most one follow-up per question.
- Line-anchored questions, verdict + feedback per answer, "I don't know — teach me" option.
- Examiner in English by default, with a language choice for non-native speakers; friendly or strict style.
- Optional voice answers via the browser's speech recognition.
- Final report with score, heatmap, strengths, gaps, and a short revision list; copy as Markdown.
- Works with a free Gemini API key; a clearly labelled demo mode (scripted examiner, no AI) when no key is set.

## Later
- Load a whole GitHub repo by URL.
- Saved history across sessions to see understanding improve.
- Teacher mode: a supervisor generates a viva for a student's submission.

## Explicitly Cut
- **Accounts / login** — nothing to protect in a PoC; adds hours.
- **Running or executing the student's code** — security risk and not needed to test understanding.
- **Grading code quality** — that's a linter's job; CodeViva grades the student, not the code.
- **Database** — sessions live in the browser tab; nothing needs to persist for the demo.
