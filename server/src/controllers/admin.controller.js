import { ingestRegistry, getIngestionJob } from '../services/ingestion.service.js';
import { listSourcesForAdmin } from '../services/source.service.js';
import { notFound } from '../utils/errors.js';

export async function runIngestion(req, res) {
  const { sourceIds = [], dryRun = false } = req.validated.body;
  const result = await ingestRegistry({ sourceIds, trigger: 'admin', dryRun });
  res.status(202).json(result);
}

export async function getJob(req, res) {
  const job = await getIngestionJob(req.validated.params.jobId);
  if (!job) throw notFound('Ingestion job not found.');
  res.json(job);
}

export async function listSources(req, res) {
  const sources = await listSourcesForAdmin(req.validated.query || {});
  res.json({ sources });
}
