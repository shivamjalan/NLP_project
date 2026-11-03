import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPage from '../pages/ChatPage.jsx';

const SESSION_ID = 'a'.repeat(24);
const SESSION_TOKEN = 'session-token-value-that-is-long-enough';
const MESSAGE_ID = 'b'.repeat(24);

function responseJson(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(),
  };
}

const HEALTH = {
  status: 'ok',
  agent: { provider: 'mock', demoMode: true },
  retrieval: { provider: 'mongodb-text', semantic: false, degraded: false },
  supportedLanguages: ['en', 'hi', 'kn'],
};

const CHAT_RESPONSE = {
  sessionId: SESSION_ID,
  sessionToken: SESSION_TOKEN,
  messageId: MESSAGE_ID,
  answer:
    'Demo mode (please note): synthetic fixtures are used for this answer. They are not official policy.',
  language: 'en',
  citations: [
    {
      sourceId: 'c'.repeat(24),
      title: 'Demo fixture - Tatkal booking (synthetic, not official)',
      authority: 'Synthetic demo fixture (not an official source)',
      url: 'https://demo.invalid/irctc/tatkal-demo',
      publishedAt: null,
      lastVerifiedAt: '2026-11-01T00:00:00.000Z',
      snippet: 'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY.',
      trustLevel: 'fixture',
      sourceType: 'fixture',
    },
  ],
  needsClarification: false,
  followUpQuestion: null,
  confidence: 'medium',
  answerType: 'grounded',
  agentStatus: 'completed',
  demoMode: true,
  disclaimer: 'Independent information assistant.',
  retrieval: { mode: 'keyword', degraded: false, evidenceCount: 1, store: 'mongodb-text' },
  sensitiveDataDetected: false,
  safetyCategory: null,
};

function installFetch(handler) {
  const mock = vi.fn(handler);
  vi.stubGlobal('fetch', mock);
  return mock;
}

function standardHandler(overrides = {}) {
  return async (url, options = {}) => {
    if (String(url).endsWith('/health')) return responseJson(HEALTH);
    if (String(url).endsWith('/chat') && options.method === 'POST') {
      if (overrides.chat) return overrides.chat(url, options);
      return responseJson(CHAT_RESPONSE, 201);
    }
    if (String(url).endsWith('/feedback')) {
      if (overrides.feedback) return overrides.feedback(url, options);
      return responseJson({ feedbackId: 'd'.repeat(24), messageId: MESSAGE_ID, rating: 'helpful' }, 201);
    }
    if (String(url).includes('/sessions/')) {
      if (overrides.history) return overrides.history(url, options);
      return responseJson({ sessionId: SESSION_ID, messages: [] });
    }
    throw new Error(`Unexpected fetch: ${options.method || 'GET'} ${url}`);
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ChatPage', () => {
  it('shows the independent-service disclaimer and demo mode', async () => {
    installFetch(standardHandler());
    render(<ChatPage />);

    expect(screen.getByText(/Not a government service\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Namaste\. How can I help\?/ })).toBeInTheDocument();
    expect(await screen.findByText('Demo mode')).toBeInTheDocument();
    expect(screen.getByText(/synthetic fixtures/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /What is the difference between Tatkal and general booking\?/ })).toBeInTheDocument();
  });

  it('sends a message, renders citations with a fixture badge and stores the session', async () => {
    const fetchMock = installFetch(standardHandler());
    const user = userEvent.setup();
    render(<ChatPage />);

    const input = screen.getByLabelText(/Your question/i);
    await user.type(input, 'What are the public rules for Tatkal booking?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/synthetic fixtures are used for this answer/)).toBeInTheDocument();
    expect(screen.getByText('Demo fixture - Tatkal booking (synthetic, not official)')).toBeInTheDocument();
    expect(screen.getByText('Demo fixture — not official')).toBeInTheDocument();
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0);

    const chatCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/chat') && options?.method === 'POST');
    expect(JSON.parse(chatCall[1].body)).toMatchObject({
      message: 'What are the public rules for Tatkal booking?',
      sessionId: null,
      language: 'auto',
    });

    const stored = JSON.parse(window.localStorage.getItem('bharatseva.session.v1'));
    expect(stored).toEqual({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN });
  });

  it('records helpful feedback for an assistant answer', async () => {
    const fetchMock = installFetch(standardHandler());
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.type(screen.getByLabelText(/Your question/i), 'Tatkal rules');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/synthetic fixtures are used for this answer/);

    await user.click(screen.getByRole('button', { name: /Mark this answer as helpful/i }));
    expect(await screen.findByText(/your feedback was recorded as/i)).toBeInTheDocument();

    const feedbackCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/feedback'));
    expect(feedbackCall[1].method).toBe('POST');
    expect(feedbackCall[1].headers['x-session-token']).toBe(SESSION_TOKEN);
    expect(JSON.parse(feedbackCall[1].body)).toMatchObject({ messageId: MESSAGE_ID, rating: 'helpful' });
  });

  it('shows an error and retries with the same text', async () => {
    let attempts = 0;
    installFetch(
      standardHandler({
        chat: async () => {
          attempts += 1;
          if (attempts === 1) {
            return responseJson({ error: { code: 'temporarily_unavailable', message: 'Try again shortly.' } }, 503);
          }
          return responseJson(CHAT_RESPONSE, 201);
        },
      }),
    );
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.type(screen.getByLabelText(/Your question/i), 'Tatkal rules');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Try again shortly.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Your question/i)).toHaveValue('Tatkal rules');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/synthetic fixtures are used for this answer/)).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('sends the selected language with the message', async () => {
    const fetchMock = installFetch(standardHandler());
    const user = userEvent.setup();
    render(<ChatPage />);

    await user.selectOptions(screen.getByLabelText('Language'), 'hi');
    await user.type(screen.getByLabelText(/Your question/i), 'टिकट रिफंड की प्रक्रिया');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/synthetic fixtures are used for this answer/);

    const chatCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/chat') && options?.method === 'POST');
    expect(JSON.parse(chatCall[1].body).language).toBe('hi');
  });

  it('loads an existing conversation from localStorage', async () => {
    window.localStorage.setItem(
      'bharatseva.session.v1',
      JSON.stringify({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN }),
    );
    installFetch(
      standardHandler({
        history: async () =>
          responseJson({
            sessionId: SESSION_ID,
            messages: [
              {
                messageId: 'e'.repeat(24),
                role: 'user',
                content: 'Earlier question',
                language: 'en',
                createdAt: '2026-11-01T10:00:00.000Z',
                citations: [],
              },
              {
                messageId: 'f'.repeat(24),
                role: 'assistant',
                content: 'Earlier answer',
                language: 'en',
                confidence: 'low',
                answerType: 'general',
                createdAt: '2026-11-01T10:00:01.000Z',
                citations: [],
              },
            ],
          }),
      }),
    );

    render(<ChatPage />);
    expect(await screen.findByText('Earlier question')).toBeInTheDocument();
    expect(screen.getByText('Earlier answer')).toBeInTheDocument();
  });

  it('clears the conversation with New chat', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      'bharatseva.session.v1',
      JSON.stringify({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN }),
    );
    installFetch(standardHandler());
    render(<ChatPage />);

    await waitFor(() => expect(screen.queryByText(/Loading your conversation/)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(window.localStorage.getItem('bharatseva.session.v1')).toBeNull();
    expect(screen.getByRole('heading', { name: /Namaste\. How can I help\?/ })).toBeInTheDocument();
  });
});
