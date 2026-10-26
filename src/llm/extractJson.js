// Models usually return clean JSON in JSON mode, but sometimes wrap it in
// ```json fences or add a sentence around it. This recovers the object.

class LlmError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (raw === '') {
    throw new LlmError('The examiner sent back an empty reply. Please retry.');
  }

  const withoutFences = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(withoutFences);
  } catch (firstError) {
    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(withoutFences.slice(start, end + 1));
      } catch (secondError) {
        // fall through to the error below
      }
    }
  }
  throw new LlmError("The examiner's reply could not be read. Please retry.");
}

module.exports = { extractJson, LlmError };
