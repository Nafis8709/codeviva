// Google Gemini client: one generateContent call in JSON mode.
// Docs: https://ai.google.dev/api/generate-content

const { extractJson, LlmError } = require('./extractJson');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 45000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readableError(status, message, model) {
  const text = String(message || '');
  if (status === 400 && /api key/i.test(text)) {
    return new LlmError('Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.', 401);
  }
  if (status === 403) {
    return new LlmError('Gemini refused the request (403). Check that your API key is enabled for the Gemini API.', 403);
  }
  if (status === 404) {
    return new LlmError(`Gemini model "${model}" was not found. Set GEMINI_MODEL in .env to a current model (see README).`, 502);
  }
  if (status === 429) {
    return new LlmError('Gemini rate limit reached (free tier). Wait a few seconds and press Retry.', 429);
  }
  return new LlmError(`Gemini error ${status}: ${text.slice(0, 200) || 'no details'}`, 502);
}

function createGeminiClient({ apiKey, model }) {
  async function callOnce(body) {
    let response;
    try {
      response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new LlmError(timedOut ? 'The examiner took too long to answer. Please retry.' : 'Could not reach Gemini. Check your internet connection.', 504);
    }
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function generateJson({ system, user }) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    };

    let { response, data } = await callOnce(body);
    // One retry for temporary server trouble.
    if (response.status === 500 || response.status === 503) {
      await wait(1500);
      ({ response, data } = await callOnce(body));
    }
    if (!response.ok) {
      throw readableError(response.status, data.error && data.error.message, model);
    }

    const candidate = data.candidates && data.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const text = parts.filter((part) => !part.thought).map((part) => part.text || '').join('');
    if (!text) {
      const reason = (candidate && candidate.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || 'unknown';
      throw new LlmError(`Gemini returned no answer (reason: ${reason}). Please retry.`);
    }
    return extractJson(text);
  }

  return { name: 'gemini', model, generateJson };
}

module.exports = { createGeminiClient };
