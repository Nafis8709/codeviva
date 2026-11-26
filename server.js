// CodeViva server: serves the page and answers four JSON routes.
// The server is stateless — every request carries the files and the history,
// and the browser tab holds the session.

require('dotenv').config();
const path = require('path');
const express = require('express');

const { validateFiles, InputError } = require('./src/code');
const { computeScore } = require('./src/scoring');
const { chooseExaminer } = require('./src/config');
const { LANGUAGE_NAMES } = require('./src/prompts');
const { createGitHubClient } = require('./src/github');

const MAX_TARGETS = 5;

// A re-test targets the regions the student could not defend last time.
function readTargets(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.slice(0, MAX_TARGETS).map((target) => ({
    file: String(target.file || ''),
    startLine: Number(target.startLine) || 1,
    endLine: Number(target.endLine) || Number(target.startLine) || 1,
    topic: String(target.topic || '').slice(0, 200),
    previousQuestion: String(target.previousQuestion || '').slice(0, 600),
  })).filter((target) => target.file !== '');
}

function readSettings(raw) {
  const settings = raw || {};
  const targets = readTargets(settings.targets);
  let totalQuestions = Number(settings.totalQuestions) === 3 ? 3 : 5;
  if (targets.length > 0) {
    totalQuestions = targets.length;
  }
  return {
    language: Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, settings.language) ? settings.language : 'en',
    style: settings.style === 'strict' ? 'strict' : 'friendly',
    totalQuestions,
    targets,
  };
}

function readHistory(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  // Keep only the fields the examiners use; cap length to stop abuse.
  return raw.slice(0, 40).map((turn) => ({
    id: String(turn.id || ''),
    text: String(turn.text || '').slice(0, 2000),
    topic: String(turn.topic || '').slice(0, 200),
    file: String(turn.file || ''),
    startLine: Number(turn.startLine) || 1,
    endLine: Number(turn.endLine) || Number(turn.startLine) || 1,
    isFollowUp: Boolean(turn.isFollowUp),
    parentId: turn.parentId ? String(turn.parentId) : null,
    answer: String(turn.answer || '').slice(0, 4000),
    dontKnow: Boolean(turn.dontKnow),
    verdict: ['solid', 'partial', 'gap'].includes(turn.verdict) ? turn.verdict : null,
    score: typeof turn.score === 'number' ? turn.score : null,
    feedback: String(turn.feedback || '').slice(0, 2000),
    // The answer key travels with the question (the server keeps no session).
    keyPoints: Array.isArray(turn.keyPoints) ? turn.keyPoints.slice(0, 4).map((point) => String(point).slice(0, 300)) : [],
  }));
}

function createApp(options = {}) {
  const chosen = options.examiner
    ? { examiner: options.examiner, status: options.status || { mode: 'custom', model: null, label: 'Custom examiner' } }
    : chooseExaminer();
  const examiner = chosen.examiner;
  const status = chosen.status;

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/status', (req, res) => {
    res.json(status);
  });

  // Load code from a public GitHub repository: list, then fetch the chosen files.
  const github = options.github || createGitHubClient();
  app.post('/api/repo/list', async (req, res, next) => {
    try {
      res.json(await github.listRepo(req.body.url));
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/repo/files', async (req, res, next) => {
    try {
      const { owner, repo, branch, paths } = req.body;
      res.json({ files: await github.fetchFiles({ owner, repo, branch, paths }) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/viva/question', async (req, res, next) => {
    try {
      const files = validateFiles(req.body.files);
      const settings = readSettings(req.body.settings);
      const history = readHistory(req.body.history);
      const question = await examiner.askQuestion({ files, settings, history });
      res.json({ question });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/viva/grade', async (req, res, next) => {
    try {
      const files = validateFiles(req.body.files);
      const settings = readSettings(req.body.settings);
      const history = readHistory(req.body.history);
      const question = readHistory([req.body.question])[0];
      const dontKnow = Boolean(req.body.dontKnow);
      const answer = String(req.body.answer || '').trim();
      if (!question || !question.id) {
        throw new InputError('Missing the question being answered.');
      }
      if (!dontKnow && answer === '') {
        throw new InputError('Write an answer first, or press "I don\'t know — teach me".');
      }
      // A question may get at most one follow-up, and a follow-up never gets another.
      const followUpAllowed = !question.isFollowUp;
      const grade = await examiner.grade({ files, settings, history, question, answer, dontKnow, followUpAllowed });
      if (!followUpAllowed || grade.verdict !== 'partial') {
        grade.followUp = null;
      }
      res.json({ grade });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/viva/report', async (req, res, next) => {
    try {
      const files = validateFiles(req.body.files);
      const settings = readSettings(req.body.settings);
      const history = readHistory(req.body.history);
      const narrative = await examiner.report({ files, settings, history });
      res.json({ report: { ...narrative, score: computeScore(history) } });
    } catch (error) {
      next(error);
    }
  });

  // One place that turns errors into readable JSON for the page.
  app.use((error, req, res, next) => {
    const statusCode = error.status || error.statusCode || 500;
    if (statusCode >= 500) {
      console.error('[CodeViva]', error.message);
    }
    const message = error.type === 'entity.too.large'
      ? 'That is too much code to send at once. Load only the files your viva covers.'
      : error.message || 'Something went wrong.';
    res.status(statusCode).json({ error: message });
  });

  return { app, status };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { app, status } = createApp();
  app.listen(port, () => {
    console.log(`CodeViva is running at http://localhost:${port}`);
    console.log(`Examiner: ${status.label}`);
  });
}

module.exports = { createApp };
