export default function ErrorMessage({ message, onRetry, onDismiss }) {
  return (
    <div className="error-message" role="alert">
      <div>
        <strong>Could not complete the request.</strong>
        <p>{message}</p>
      </div>
      <div className="error-message__actions">
        {onRetry ? (
          <button type="button" className="button button--primary button--small" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" className="button button--ghost button--small" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
