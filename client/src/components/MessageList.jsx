import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';

export default function MessageList({ messages, loading, demoMode, onRate }) {
  const endRef = useRef(null);

  useEffect(() => {
    // Keep the latest turn in view without moving keyboard focus.
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  return (
    <div className="message-list" role="log" aria-live="polite" aria-relevant="additions">
      {messages.map((message) => (
        <MessageBubble key={message.messageId} message={message} onRate={onRate} />
      ))}
      {loading ? <TypingIndicator demoMode={demoMode} /> : null}
      <div ref={endRef} />
    </div>
  );
}
