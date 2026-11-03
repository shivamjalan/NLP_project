import { useCallback, useEffect, useRef, useState } from 'react';
import { chatApi, ApiError } from '../api/chatApi.js';

const STORAGE_KEY = 'bharatseva.session.v1';

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId || !parsed?.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the chat still works for the
    // current page without persistence.
  }
}

function toUiMessage(message) {
  return {
    messageId: message.messageId,
    role: message.role,
    content: message.content,
    citations: message.citations || [],
    confidence: message.confidence,
    answerType: message.answerType,
    needsClarification: Boolean(message.needsClarification),
    demoMode: Boolean(message.demoMode),
    createdAt: message.createdAt || new Date().toISOString(),
    language: message.language,
    feedback: null,
  };
}

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [session, setSession] = useState(() => readStoredSession());
  const [language, setLanguage] = useState('auto');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(Boolean(readStoredSession()));
  const lastFailedRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredSession();
    if (!stored) {
      setHistoryLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSession(stored);
    chatApi
      .getMessages({ sessionId: stored.sessionId, sessionToken: stored.sessionToken })
      .then((history) => {
        if (cancelled) return;
        setMessages((history.messages || []).map(toUiMessage));
      })
      .catch((loadError) => {
        if (cancelled) return;
        // An expired or invalid session should start clean rather than trap the
        // user in a broken conversation.
        if (loadError instanceof ApiError && (loadError.status === 404 || loadError.status === 401)) {
          writeStoredSession(null);
          setSession(null);
        } else {
          setError(loadError.message);
          setStatus('error');
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(
    async (text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed) return { ok: false, reason: 'empty' };
      if (status === 'loading') return { ok: false, reason: 'busy' };

      const temporaryId = `pending-${Date.now()}`;
      setError(null);
      setStatus('loading');
      setMessages((current) => [
        ...current,
        {
          messageId: temporaryId,
          role: 'user',
          content: trimmed,
          citations: [],
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]);

      try {
        const response = await chatApi.sendMessage({
          message: trimmed,
          sessionId: session?.sessionId,
          language,
          sessionToken: session?.sessionToken,
        });

        if (response.sessionToken) {
          const nextSession = { sessionId: response.sessionId, sessionToken: response.sessionToken };
          writeStoredSession(nextSession);
          setSession(nextSession);
        } else if (!session) {
          setSession({ sessionId: response.sessionId, sessionToken: null });
        }

        setMessages((current) => [
          ...current.filter((item) => item.messageId !== temporaryId),
          {
            messageId: `${temporaryId}-user`,
            role: 'user',
            content: trimmed,
            citations: [],
            createdAt: new Date().toISOString(),
          },
          {
            messageId: response.messageId,
            role: 'assistant',
            content: response.answer,
            citations: response.citations || [],
            confidence: response.confidence,
            answerType: response.answerType,
            needsClarification: response.needsClarification,
            demoMode: response.demoMode,
            createdAt: new Date().toISOString(),
            language: response.language,
            feedback: null,
            retrieval: response.retrieval,
          },
        ]);
        setStatus('idle');
        lastFailedRef.current = null;
        return { ok: true };
      } catch (sendError) {
        setMessages((current) => current.filter((item) => item.messageId !== temporaryId));
        setError(sendError.message || 'Something went wrong.');
        setStatus('error');
        lastFailedRef.current = trimmed;
        return { ok: false, error: sendError };
      }
    },
    [language, session, status],
  );

  const retryLast = useCallback(async () => {
    const text = lastFailedRef.current;
    if (!text) return { ok: false };
    return submit(text);
  }, [submit]);

  const newConversation = useCallback(() => {
    writeStoredSession(null);
    setSession(null);
    setMessages([]);
    setError(null);
    setStatus('idle');
    lastFailedRef.current = null;
  }, []);

  const rateMessage = useCallback(
    async (messageId, rating, reason = '') => {
      if (!session?.sessionToken) {
        return { ok: false, error: new ApiError('This conversation is not available for feedback.') };
      }
      try {
        await chatApi.sendFeedback({
          messageId,
          rating,
          reason,
          sessionToken: session.sessionToken,
        });
        setMessages((current) =>
          current.map((message) => (message.messageId === messageId ? { ...message, feedback: rating } : message)),
        );
        return { ok: true };
      } catch (feedbackError) {
        return { ok: false, error: feedbackError };
      }
    },
    [session],
  );

  return {
    messages,
    session,
    language,
    setLanguage,
    status,
    error,
    historyLoading,
    submit,
    retryLast,
    newConversation,
    rateMessage,
    clearError: () => setError(null),
  };
}
