# CodeViva evaluation

How well does CodeViva grade spoken/typed viva answers, and does its line checker
keep questions on the right code? This folder answers that with real model calls.

## The set

`cases.json` — 5 viva questions on real student code, 6 answers each (30 answers):

| Case | Code | Language |
|---|---|---|
| `queue-dequeue` | bundled C sample, `dequeue` resetting `tail` | C |
| `sms-enroll-race` | author's Flask course project, last-seat race in `enroll` | Python |
| `sms-check-order` | same project, order of business rules in `check_can_enroll` | Python |
| `relief-handle-skip` | author's ReliefSync project, chain-of-responsibility `handle` | Java |
| `relief-chain-normal` | ReliefSync, chain built for a NORMAL-tier request | Java |

Answers range from complete to shallow, vague, confidently wrong and off-target,
and include Bangla and Banglish answers (CodeViva grades meaning, not English).

`labels.json` — the human verdict (solid / partial / gap) for each answer, made with
`npm run label` **before** running the evaluation and without seeing the AI's output.

## Running it

```bash
npm run label                    # ~20 minutes: label all 30 answers
npm run eval                     # default model, answer-key vs holistic grading, 3 repeats each
npm run eval -- --models gemini-3.1-flash-lite,gemini-3-flash-preview --repeats 2
```

A full run of one model is about 200 calls (≈15 minutes with the free-tier pause of
4 s between calls; change it with `--delay`). Rate-limit errors are retried.

Results: `results/<model>.json` (every call's verdict, score, marked key points) and
`results/SUMMARY.md` (the tables quoted in the README and the Devpost description).

`npm run eval -- --fake` is an offline dry run of the script with a fake model; it
writes to `results/fake/` (git-ignored) and its numbers mean nothing.

## What is compared

- **answer key (new)** — the examiner writes the key points first; the model only
  marks them covered / partial / missing; the server computes the score.
- **holistic (old)** — the pre-hackathon behaviour: the model reads the answer and
  picks a 0–10 score.

Both use the same model, prompts for the same question, and the same answers.
