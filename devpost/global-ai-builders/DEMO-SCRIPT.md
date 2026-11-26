# CodeViva — demo video script (target 3:00, limit 2–4 min)

Record with the **real AI examiner** (status pill shows "AI examiner · gemini-…"), not demo
mode. Use Chrome, 1280×800 or larger, and a fresh browser profile (no saved session).
Rehearse once; keep answers short. Narrate in English; one answer in Bangla or Banglish.

| Time | Screen | Say (roughly) | Shows |
|---|---|---|---|
| 0:00–0:15 | Setup screen | "In a viva, the examiner points at a line and asks why it's there. Half my class builds with AI and can't answer. CodeViva is a mock viva on your own code." | Problem |
| 0:15–0:35 | Paste `https://github.com/Nafis8709/reliefsync` → **Load repo** → picker | "I paste my project's GitHub link. Source files are preselected to fit; tests, config and dependencies are left out." Untick one file, show the budget meter, **Add files**. | GitHub loading, D3 |
| 0:35–1:20 | **Start viva** (Strict external, 3 questions) | Read the first question. Point at the highlighted lines and "✓ lines checked". Give a **half-right** answer. | Line checker, grounding |
| | Grade appears | "It marked me against an answer key it wrote before I answered: covered, half, missed. The score is computed from this, not made up by the model." Show the follow-up question on related lines. | Answer key, D4b |
| 1:20–1:50 | Follow-up and question 2 | Answer the follow-up **in Bangla or Banglish**. "It judges meaning, not English." Answer question 2 badly or press *I don't know — teach me*. | Multilingual |
| 1:50–2:05 | Press **F5** mid-viva → **Resume** | "If the tab closes, nothing is lost." | Reliability, R3 |
| 2:05–2:30 | Report | Score, heatmap — click a red gap to jump to its lines. "These are the lines I can't defend yet." | Heatmap |
| 2:30–2:50 | **Re-test my gaps** → answer well → re-test report | "It re-asks only what I missed, from a different angle." Show **GAP → SOLID** and the score on those lines. | Before → after, D4b |
| 2:50–3:00 | `eval/results/SUMMARY.md` (optional quick cut) | "On 30 labelled answers, the answer key agreed with me ⟨X⟩% of the time, versus ⟨Y⟩% when the model picks the score." | Evaluation |

Failure moments to capture separately as screenshots for the description (not needed in the video):

1. Paste `https://github.com/Nafis8709/this-does-not-exist` → *not found or private* message, loaded files untouched.
2. Mid-viva, switch Wi-Fi off and submit an answer → error with **Retry**, answer and earlier questions kept; switch Wi-Fi on, press Retry.

Before uploading: the video plays without signing in, is 2–4 minutes, and the repository link in the submission works.
