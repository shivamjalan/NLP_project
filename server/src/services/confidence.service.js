const FRESHNESS_WINDOW_DAYS = 365;

function freshnessBoost(evidence) {
  const dates = evidence
    .map((item) => (item.lastVerifiedAt ? new Date(item.lastVerifiedAt).getTime() : null))
    .filter(Boolean);
  if (!dates.length) return -0.05;
  const newest = Math.max(...dates);
  const ageDays = (Date.now() - newest) / (1000 * 60 * 60 * 24);
  if (ageDays <= FRESHNESS_WINDOW_DAYS) return 0.06;
  if (ageDays <= FRESHNESS_WINDOW_DAYS * 2) return 0;
  return -0.08;
}

/**
 * Display confidence is computed by the application, not copied from the
 * model. Inputs are retrieval coverage, source authority, freshness, citation
 * validity and the bounded verification pass.
 */
export function computeConfidence({ evidence = [], answerType, verification, coverage = 0, citationCount = 0 }) {
  if (answerType === 'clarification') return 'low';
  if (answerType === 'abstention') return 'low';
  if (answerType === 'general') return evidence.length ? 'medium' : 'medium';

  let score = 0.18;
  if (evidence.length >= 1) score += 0.2;
  if (evidence.length >= 2) score += 0.12;
  if (evidence.length >= 3) score += 0.08;

  const official = evidence.filter((item) => item.trustLevel === 'official').length;
  const fixtures = evidence.filter((item) => item.trustLevel === 'fixture').length;
  if (official > 0) score += 0.15;
  if (fixtures > 0) score -= 0.18;

  const distinctSources = new Set(evidence.map((item) => item.sourceId)).size;
  if (distinctSources >= 2) score += 0.08;

  score += Math.min(Math.max(coverage, 0), 1) * 0.2;
  score += freshnessBoost(evidence);

  if (citationCount === 0) score -= 0.2;
  if (verification?.verdict === 'issues') score -= 0.15;
  if (verification?.verdict === 'ok' && evidence.length > 0) score += 0.08;

  // A grounded answer with no valid citation, or evidence made only of
  // synthetic fixtures, must never display as high confidence.
  if (citationCount === 0) score = Math.min(score, 0.44);
  if (fixtures > 0 && official === 0) score = Math.min(score, 0.71);

  score = Math.max(0, Math.min(score, 0.97));
  if (score >= 0.72) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}
