import { useEffect, useRef } from 'react';

export default function ChatInput({ value, onChange, onSend, disabled, maxLength = 4000 }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [value]);

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) onSend(value);
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && value.trim()) onSend(value);
      }}
    >
      <label className="sr-only" htmlFor="chat-input">
        Your question
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        className="composer__input"
        rows={1}
        value={value}
        maxLength={maxLength}
        placeholder="Ask about public IRCTC information…  (Enter to send, Shift+Enter for a new line)"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-describedby="composer-hint"
      />
      <div className="composer__actions">
        <span id="composer-hint" className="composer__hint">
          {value.length}/{maxLength}
        </span>
        <button type="submit" className="button button--primary" disabled={disabled || !value.trim()}>
          {disabled ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
