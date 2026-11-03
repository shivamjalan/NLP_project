import { formatDate, isDemoUrl } from '../utils/formatDate.js';

export default function SourceCard({ citation, index }) {
  const demo = citation.trustLevel === 'fixture' || isDemoUrl(citation.url);
  const label = `Source ${index + 1}`;

  return (
    <li className="source-card">
      <div className="source-card__top">
        <span className="source-card__label">{label}</span>
        {demo ? <span className="badge badge--fixture">Demo fixture — not official</span> : null}
      </div>

      <h4 className="source-card__title">{citation.title}</h4>
      <p className="source-card__authority">{citation.authority}</p>

      {citation.snippet ? <p className="source-card__snippet">{citation.snippet}</p> : null}

      <div className="source-card__footer">
        {demo ? (
          <span className="source-card__url source-card__url--disabled" title="Synthetic demo URL is not a real source">
            {citation.url}
          </span>
        ) : (
          <a
            className="source-card__url"
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open official source: ${citation.title}`}
          >
            Open official source
          </a>
        )}
        <span className="source-card__dates">
          {citation.lastVerifiedAt ? `Verified ${formatDate(citation.lastVerifiedAt)}` : 'Verification date unavailable'}
        </span>
      </div>
    </li>
  );
}
