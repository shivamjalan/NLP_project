export default function TypingIndicator({ demoMode }) {
  return (
    <div className="typing" role="status" aria-live="polite">
      <span className="typing__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        {demoMode
          ? 'Demo mode is preparing a synthetic answer…'
          : 'BharatSeva AI is checking approved sources…'}
      </span>
    </div>
  );
}
