import { useState } from 'react';

export default function FeedbackControls({ messageId, value, onRate }) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(rating, reasonText = '') {
    setSubmitting(true);
    setError('');
    const result = await onRate(messageId, rating, reasonText);
    setSubmitting(false);
    if (!result.ok) {
      setError('Could not save feedback. Please try again.');
      return;
    }
    setShowReason(false);
    setReason('');
  }

  if (value) {
    return (
      <p className="feedback feedback--thanks" role="status">
        Thanks - your feedback was recorded as <strong>{value === 'helpful' ? 'helpful' : 'not helpful'}</strong>.
      </p>
    );
  }

  return (
    <div className="feedback">
      <span className="feedback__label">Was this answer helpful?</span>
      <div className="feedback__buttons">
        <button
          type="button"
          className="button button--small button--ghost"
          onClick={() => submit('helpful')}
          disabled={submitting}
          aria-label="Mark this answer as helpful"
        >
          Helpful
        </button>
        <button
          type="button"
          className="button button--small button--ghost"
          onClick={() => setShowReason((current) => !current)}
          disabled={submitting}
          aria-expanded={showReason}
          aria-label="Mark this answer as not helpful"
        >
          Not helpful
        </button>
      </div>

      {showReason ? (
        <div className="feedback__reason">
          <label className="sr-only" htmlFor={`reason-${messageId}`}>
            Optional reason
          </label>
          <textarea
            id={`reason-${messageId}`}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional: what was missing or wrong?"
          />
          <button
            type="button"
            className="button button--small button--primary"
            onClick={() => submit('not_helpful', reason)}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Send feedback'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="feedback__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
