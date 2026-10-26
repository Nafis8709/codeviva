// Picks which examiner answers the page's requests, based on .env settings.
//
//   DEMO_MODE=1                           -> scripted demo examiner (no AI)
//   AI_PROVIDER=openai + OPENAI_API_KEY   -> any OpenAI-compatible API
//   GEMINI_API_KEY                        -> Google Gemini (default)
//   nothing set                           -> demo examiner

const demoExaminer = require('./examiners/demoExaminer');

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function chooseExaminer() {
  if (readEnv('DEMO_MODE') === '1' || readEnv('DEMO_MODE').toLowerCase() === 'true') {
    return { examiner: demoExaminer, status: { mode: 'demo', model: null, label: 'Demo mode — scripted examiner, no AI' } };
  }

  // AI modules are loaded lazily so demo mode never needs them.
  if (readEnv('AI_PROVIDER').toLowerCase() === 'openai' && readEnv('OPENAI_API_KEY')) {
    const { createAiExaminer } = require('./examiners/aiExaminer');
    const { createOpenAiClient } = require('./llm/openaiCompatible');
    const model = readEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL;
    const client = createOpenAiClient({
      apiKey: readEnv('OPENAI_API_KEY'),
      baseUrl: readEnv('OPENAI_BASE_URL') || DEFAULT_OPENAI_BASE_URL,
      model,
    });
    return { examiner: createAiExaminer(client), status: { mode: 'openai', model, label: `AI examiner · ${model}` } };
  }

  if (readEnv('GEMINI_API_KEY')) {
    const { createAiExaminer } = require('./examiners/aiExaminer');
    const { createGeminiClient } = require('./llm/gemini');
    const model = readEnv('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const client = createGeminiClient({ apiKey: readEnv('GEMINI_API_KEY'), model });
    return { examiner: createAiExaminer(client), status: { mode: 'gemini', model, label: `AI examiner · ${model}` } };
  }

  return { examiner: demoExaminer, status: { mode: 'demo', model: null, label: 'Demo mode — no API key set, scripted examiner' } };
}

module.exports = { chooseExaminer, DEFAULT_GEMINI_MODEL };
