import { getPublicSource } from '../services/source.service.js';

export async function getSource(req, res) {
  const source = await getPublicSource(req.validated.params.sourceId);
  res.json(source);
}
