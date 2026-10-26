// Checks the HTTP clients against a mocked fetch: request shape and error messages.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeminiClient } = require('../src/llm/gemini');
const { createOpenAiClient } = require('../src/llm/openaiCompatible');

const realFetch = global.fetch;
test.afterEach(() => {
  global.fetch = realFetch;
});

function mockFetch(status, body, seen) {
  global.fetch = async (url, options) => {
    seen.push({ url, options, body: JSON.parse(options.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test('Gemini: sends JSON mode with the key in a header and parses the reply', async () => {
  const seen = [];
  mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"question":"Why?"}' }] } }] }, seen);
  const client = createGeminiClient({ apiKey: 'test-key', model: 'gemini-3.1-flash-lite' });
  const result = await client.generateJson({ system: 'S', user: 'U' });

  assert.deepEqual(result, { question: 'Why?' });
  assert.match(seen[0].url, /models\/gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(seen[0].options.headers['x-goog-api-key'], 'test-key');
  assert.equal(seen[0].body.generationConfig.responseMimeType, 'application/json');
  assert.equal(seen[0].body.systemInstruction.parts[0].text, 'S');
  assert.ok(!seen[0].url.includes('test-key'), 'the key must not be in the URL');
});

test('Gemini: skips thought parts', async () => {
  const seen = [];
  mockFetch(200, { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":true}' }] } }] }, seen);
  const client = createGeminiClient({ apiKey: 'k', model: 'm' });
  assert.deepEqual(await client.generateJson({ system: 'S', user: 'U' }), { ok: true });
});

test('Gemini: readable errors for bad key, missing model and rate limit', async () => {
  const client = createGeminiClient({ apiKey: 'k', model: 'old-model' });

  mockFetch(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, []);
  await assert.rejects(client.generateJson({ system: 'S', user: 'U' }), /rejected the API key/);

  mockFetch(404, { error: { message: 'models/old-model is not found' } }, []);
  await assert.rejects(client.generateJson({ system: 'S', user: 'U' }), /"old-model" was not found/);

  mockFetch(429, { error: { message: 'Resource exhausted' } }, []);
  await assert.rejects(client.generateJson({ system: 'S', user: 'U' }), /rate limit/);
});

test('OpenAI-compatible: posts to base URL with a bearer token', async () => {
  const seen = [];
  mockFetch(200, { choices: [{ message: { content: '{"summary":"ok"}' } }] }, seen);
  const client = createOpenAiClient({ apiKey: 'sk-test', baseUrl: 'https://api.groq.com/openai/v1/', model: 'llama' });
  assert.deepEqual(await client.generateJson({ system: 'S', user: 'U' }), { summary: 'ok' });
  assert.equal(seen[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(seen[0].options.headers.Authorization, 'Bearer sk-test');
  assert.equal(seen[0].body.messages[0].role, 'system');
});
