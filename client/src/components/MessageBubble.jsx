import { useState } from 'react';
import SourceCard from './SourceCard.jsx';
import FeedbackControls from './FeedbackControls.jsx';
import { formatTime } from '../utils/formatDate.js';

const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

const ANSWER_TYPE_LABEL = {
  grounded: 'Based on cited sources',
  mixed: 'Mixed: sources plus explanation',
  general: 'General explanation',
  clarification: 'Clarification needed',
  abstention: 'Could not verify',
};

export default function MessageBubble({ message, onRate }) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';
  const paragraphs = String(message.content || '')
    .split(/\n{2,}/)
    .filter(Boolean);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={`message message--${isAssistant ? 'assistant' : 'user'}`}>
      <div className="message__meta">
        <span className="message__author">{isAssistant ? 'BharatSeva AI' : 'You'}</span>
        {message.demoMode ? <span className="badge badge--demo">Demo</span> : null}
        <time className="message__time" dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>

      <div className="message__body">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      {isAssistant ? (
        <div className="message__status">
          <span className={`chip chip--${message.confidence || 'low'}`}>
            {CONFIDENCE_LABEL[message.confidence] || 'Confidence unavailable'}
          </span>
          <span className="chip chip--type">{ANSWER_TYPE_LABEL[message.answerType] || 'Answer'}</span>
          {message.needsClarification ? <span className="chip chip--type">Needs one detail</span> : null}
        </div>
      ) : null}

      {isAssistant && message.citations?.length ? (
        <section className="sources" aria-label="Sources for this answer">
          <h3 className="sources__heading">Sources</h3>
          <ul className="sources__list">
            {message.citations.map((citation, index) => (
              <SourceCard key={`${citation.sourceId}-${index}`} citation={citation} index={index} />
            ))}
          </ul>
        </section>
      ) : null}

      {isAssistant ? (
        <div className="message__footer">
          <button type="button" className="button button--small button--ghost" onClick={copyAnswer}>
            {copied ? 'Copied' : 'Copy answer'}
          </button>
          {message.messageId && !message.messageId.startsWith('pending') ? (
            <FeedbackControls messageId={message.messageId} value={message.feedback} onRate={onRate} />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
