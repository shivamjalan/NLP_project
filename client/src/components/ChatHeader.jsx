import LanguageSelector from './LanguageSelector.jsx';

export default function ChatHeader({ language, onLanguageChange, onNewConversation, demoMode, retrievalDegraded }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            BS
          </span>
          <div>
            <h1 className="brand__name">BharatSeva AI</h1>
            <p className="brand__tagline">Independent information assistant</p>
          </div>
        </div>

        <div className="header-controls">
          {demoMode ? (
            <span className="badge badge--demo" title="Deterministic demo responses, not official guidance">
              Demo mode
            </span>
          ) : null}
          {retrievalDegraded ? (
            <span className="badge badge--warn" title="Semantic vector search is unavailable; keyword fallback in use">
              Keyword fallback
            </span>
          ) : null}
          <LanguageSelector value={language} onChange={onLanguageChange} />
          <button type="button" className="button button--ghost" onClick={onNewConversation}>
            New chat
          </button>
        </div>
      </div>
    </header>
  );
}
