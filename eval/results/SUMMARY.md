# CodeViva evaluation results

Generated 2026-11-28T19:25:07.553Z by `npm run eval` (real model calls).
Evaluation set: 30 answers to 5 questions on real student code (C, Python, Java; English, Bangla and Banglish answers). Reference labels: 30 (written by Claude, the AI assistant used to build this project, and not checked by a person; see eval/README.md).

## 1. Agreement with the reference labels

Verdict = the majority over the repeated runs. "Severe" = the AI said *solid* where the reference label is *gap*, or the reverse.

| Model | Grading | Labelled answers | Exact agreement | Within one step | Severe disagreements |
|---|---|---|---|---|---|
| gemini-3.1-flash-lite | answer key (new) | 30 | 80% | 100% | 0 |
| gemini-3.1-flash-lite | holistic (old) | 30 | 80% | 100% | 0 |

## 2. Consistency when the same answer is graded again

Each answer graded 3 times with the same question (and, for the answer key, the same key).

| Model | Grading | Answers | Same verdict every time | Mean score spread (0-10) | Largest spread |
|---|---|---|---|---|---|
| gemini-3.1-flash-lite | answer key (new) | 30 | 100% | 0.07 | 2 |
| gemini-3.1-flash-lite | holistic (old) | 30 | 100% | 0.17 | 1 |

## 3. Line checker (grounding)

Questions asked in short vivas on each code bundle. "Correct first time" means the model's own file and lines already matched what the question talks about.

| Model | Questions | Correct first time | Repaired by the checker | Re-asked once | Left unverified | Verified in the end |
|---|---|---|---|---|---|---|
| gemini-3.1-flash-lite | 12 | 11 (91.7%) | 0 | 0 | 1 | 91.7% |

## 4. Cost and speed

| Model | Model calls | Retries | Failed calls | Median call time |
|---|---|---|---|---|
| gemini-3.1-flash-lite | 216 | 18 | 0 | 1878 ms |

## 5. Every answer

### gemini-3.1-flash-lite

| Answer | Reference | Answer key (runs) | Holistic (runs) |
|---|---|---|---|
| queue-1 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| queue-2 | partial | **gap** (3, 3, 3) | **partial** (6, 6, 6) |
| queue-3 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| queue-4 | gap | **gap** (0, 0, 0) | **gap** (2, 3, 3) |
| queue-5 | gap | **gap** (0, 0, 0) | **gap** (2, 3, 3) |
| queue-6 | partial | **gap** (3, 3, 3) | **partial** (6, 6, 6) |
| sms-1 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| sms-2 | partial | **solid** (8, 8, 8) | **partial** (6, 6, 6) |
| sms-3 | gap | **gap** (0, 0, 0) | **gap** (3, 3, 3) |
| sms-4 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| sms-5 | gap | **gap** (0, 0, 0) | **partial** (5, 5, 5) |
| sms-6 | gap | **gap** (0, 0, 0) | **gap** (3, 2, 2) |
| order-1 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| order-2 | gap | **gap** (0, 0, 0) | **partial** (5, 5, 5) |
| order-3 | partial | **gap** (3, 3, 3) | **solid** (10, 10, 10) |
| order-4 | gap | **gap** (0, 0, 0) | **gap** (2, 2, 2) |
| order-5 | gap | **gap** (0, 0, 0) | **partial** (5, 5, 5) |
| order-6 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| relief-1 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| relief-2 | partial | **solid** (8, 10, 10) | **partial** (5, 5, 5) |
| relief-3 | gap | **gap** (0, 0, 0) | **gap** (2, 2, 2) |
| relief-4 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| relief-5 | gap | **gap** (0, 0, 0) | **partial** (5, 5, 5) |
| relief-6 | gap | **gap** (0, 0, 0) | **gap** (2, 3, 2) |
| chain-1 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| chain-2 | partial | **gap** (3, 3, 3) | **partial** (5, 5, 6) |
| chain-3 | gap | **gap** (0, 0, 0) | **gap** (2, 2, 2) |
| chain-4 | solid | **solid** (10, 10, 10) | **solid** (10, 10, 10) |
| chain-5 | gap | **gap** (0, 0, 0) | **partial** (5, 5, 5) |
| chain-6 | gap | **gap** (0, 0, 0) | **gap** (3, 3, 3) |

