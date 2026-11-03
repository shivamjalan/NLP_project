import { useEffect, useState } from 'react';
import ChatHeader from '../components/ChatHeader.jsx';
import ChatInput from '../components/ChatInput.jsx';
import DisclaimerBanner from '../components/DisclaimerBanner.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import MessageList from '../components/MessageList.jsx';
import StarterQuestions from '../components/StarterQuestions.jsx';
import { useChat } from '../hooks/useChat.js';
import { chatApi } from '../api/chatApi.js';

export default function ChatPage() {
  const {
    messages,
    language,
    setLanguage,
    status,
    error,
    historyLoading,
    submit,
    retryLast,
    newConversation,
    rateMessage,
    clearError,
  } = useChat();

  const [input, setInput] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let cancelled = false;
    chatApi
      .health()
      .then((result) => {
        if (!cancelled) setHealth(result);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = status === 'loading';
  const demoMode = health?.agent?.demoMode ?? messages.some((message) => message.demoMode);
  const retrievalDegraded = health?.retrieval?.degraded === true;

  async function handleSend(text) {
    const value = typeof text === 'string' ? text : input;
    if (!value.trim()) return;
    setInput('');
    const result = await submit(value);
    if (!result.ok && result.reason !== 'busy') {
      setInput(value);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to chat
      </a>

      <ChatHeader
        language={language}
        onLanguageChange={setLanguage}
        onNewConversation={newConversation}
        demoMode={demoMode}
        retrievalDegraded={retrievalDegraded}
      />

      <DisclaimerBanner />

      <main id="main-content" className="chat-main">
        <div className="chat-card">
          {historyLoading ? (
            <p className="history-loading" role="status">
              Loading your conversation…
            </p>
          ) : null}

          {!historyLoading && messages.length === 0 ? (
            <div className="welcome">
              <h2 className="welcome__heading">Namaste. How can I help?</h2>
              <p className="welcome__text">
                Ask about public IRCTC information - rules, procedures, documents, or where to verify details. I will
                search approved sources and show them with the answer. I cannot perform bookings or check personal
                status.
              </p>
              {demoMode ? (
                <p className="welcome__demo" role="note">
                  This instance is running in demo mode. Answers use synthetic fixtures and are not official guidance.
                </p>
              ) : null}
              <StarterQuestions onSelect={handleSend} />
            </div>
          ) : null}

          {!historyLoading && (messages.length > 0 || loading) ? (
            <MessageList messages={messages} loading={loading} demoMode={demoMode} onRate={rateMessage} />
          ) : null}

          {error ? (
            <div className="chat-card__error">
              <ErrorMessage message={error} onRetry={retryLast} onDismiss={clearError} />
            </div>
          ) : null}

          <ChatInput value={input} onChange={setInput} onSend={handleSend} disabled={loading} />

          <div className="sr-only" role="status" aria-live="polite">
            {loading ? 'BharatSeva AI is responding.' : ''}
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <p>
          <strong>Privacy:</strong> conversations are kept for this browser session only, expire automatically, and
          known secrets you type are masked. Do not share OTPs, PINs, passwords, Aadhaar or PAN numbers here.
        </p>
        <p>
          <strong>Sources:</strong> answers cite indexed public sources with a verification date. When evidence is
          missing or stale, the assistant says so. Never treat an AI answer as legal or official advice.
        </p>
      </footer>
    </div>
  );
}
