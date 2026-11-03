import { badRequest } from '../utils/errors.js';
import * as searchKnowledge from './searchKnowledge.tool.js';
import * as keywordSearch from './keywordSearch.tool.js';
import * as fetchSourcePassages from './fetchSourcePassages.tool.js';
import * as compareEvidence from './compareEvidence.tool.js';
import * as askClarification from './askClarification.tool.js';

const TOOLS = {
  [searchKnowledge.name]: searchKnowledge,
  [keywordSearch.name]: keywordSearch,
  [fetchSourcePassages.name]: fetchSourcePassages,
  [compareEvidence.name]: compareEvidence,
  [askClarification.name]: askClarification,
};

export const TOOL_DEFINITIONS = Object.values(TOOLS).map((tool) => tool.definition);
export const TOOL_NAMES = Object.keys(TOOLS);

export function isAllowedTool(name) {
  return Object.hasOwn(TOOLS, name);
}

export function isRetrievalTool(name) {
  return isAllowedTool(name) && TOOLS[name].isRetrieval;
}

export function validateToolArguments(name, rawArgs) {
  const tool = TOOLS[name];
  if (!tool) throw badRequest(`Tool "${name}" is not allowlisted.`, 'tool_not_allowed');
  const result = tool.schema.safeParse(rawArgs || {});
  if (!result.success) {
    throw badRequest(`Invalid arguments for tool "${name}".`, 'tool_argument_invalid', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

/**
 * Execute one allowlisted tool. Arguments are re-validated here even if the
 * model/provider already validated them.
 */
export async function executeTool(name, rawArgs, context) {
  const tool = TOOLS[name];
  if (!tool) {
    return {
      status: 'error',
      name,
      code: 'tool_not_allowed',
      message: 'That tool is not available.',
    };
  }
  const started = Date.now();
  try {
    const args = validateToolArguments(name, rawArgs);
    const result = await tool.execute(args, context);
    return { ...result, arguments: args, durationMs: Date.now() - started };
  } catch (error) {
    return {
      status: 'error',
      name,
      code: error.code || 'tool_failed',
      message: error.message || 'The tool could not complete.',
      durationMs: Date.now() - started,
    };
  }
}
