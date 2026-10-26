// Client for any OpenAI-compatible /chat/completions API
// (OpenAI, Groq, OpenRouter, a local server, …).
// Docs: https://platform.openai.com/docs/api-reference/chat

const { extractJson, LlmError } = require('./extractJson');

const TIMEOUT_MS = 45000;

function createOpenAiClient({ apiKey, baseUrl, model }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  async function generateJson({ system, user }) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new LlmError(timedOut ? 'The examiner took too long to answer. Please retry.' : `Could not reach ${baseUrl}.`, 504);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (data.error && data.error.message) || `HTTP ${response.status}`;
      if (response.status === 401) {
        throw new LlmError('The AI provider rejected the API key. Check OPENAI_API_KEY in .env.', 401);
      }
      if (response.status === 429) {
        throw new LlmError('Rate limit reached. Wait a few seconds and press Retry.', 429);
      }
      throw new LlmError(`AI provider error: ${String(message).slice(0, 200)}`);
    }

    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return extractJson(text);
  }

  return { name: 'openai', model, generateJson };
}

module.exports = { createOpenAiClient };
