const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const DEFAULT_TIMEOUT_MS = 35_000;

export class ApiError extends Error {
  constructor(message, { code = 'request_failed', status = 0, requestId = null, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, sessionToken, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(payload?.error?.message || 'The request could not be completed.', {
        code: payload?.error?.code || 'request_failed',
        status: response.status,
        requestId: payload?.error?.requestId || response.headers.get('x-request-id'),
        details: payload?.error?.details,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError('The request timed out. Please try again.', { code: 'timeout' });
    }
    throw new ApiError('The server could not be reached. Check that it is running.', {
      code: 'network_error',
    });
  } finally {
    clearTimeout(timer);
  }
}

export const chatApi = {
  health: () => request('/health'),

  sendMessage: ({ message, sessionId, language, sessionToken }) =>
    request('/chat', {
      method: 'POST',
      body: { message, sessionId: sessionId || null, language },
      sessionToken,
    }),

  getMessages: ({ sessionId, sessionToken }) =>
    request(`/sessions/${sessionId}/messages`, { sessionToken }),

  sendFeedback: ({ messageId, rating, reason, sessionToken }) =>
    request('/feedback', {
      method: 'POST',
      body: { messageId, rating, reason },
      sessionToken,
    }),

  getSource: (sourceId) => request(`/sources/${sourceId}`),
};
