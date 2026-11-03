import { Message } from '../models/Message.js';
import { AgentRun } from '../models/AgentRun.js';
import { Source } from '../models/Source.js';
import { createSession, authorizeSession, touchSession, listMessagesForClient } from './session.service.js';
import { buildConversationContext, maybeSummarizeSession } from './conversationMemory.service.js';
import { runAgentTurn } from './agentOrchestrator.service.js';
import { resolveLanguage } from '../utils/language.js';
import { detectSensitiveData, redactSensitiveData } from '../utils/sanitize.js';
import { retrievalStoreLabel } from './retrieval.service.js';
import { isDemoMode } from '../config/env.js';

export const DISCLAIMER =
  'Independent information assistant; verify important details with the official source.';

const SENSITIVE_NOTE = {
  en: 'For your safety, any OTP, PIN, password, card or identity number you typed was masked and is not stored. Never share these with anyone.',
  hi: 'आपकी सुरक्षा के लिए, आपके द्वारा लिखा गया OTP, PIN, पासवर्ड, कार्ड या पहचान नंबर छिपाया गया है और संग्रहीत नहीं किया गया। इन्हें कभी किसी के साथ साझा न करें।',
  kn: 'ನಿಮ್ಮ ಸುರಕ್ಷತೆಗಾಗಿ, ನೀವು ಟೈಪ್ ಮಾಡಿದ OTP, PIN, ಪಾಸ್‌ವರ್ಡ್, ಕಾರ್ಡ್ ಅಥವಾ ಗುರುತಿನ ಸಂಖ್ಯೆಯನ್ನು ಮರೆಮಾಡಲಾಗಿದ್ದು ಸಂಗ್ರಹಿಸಿಲ್ಲ. ಇವನ್ನು ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.',
};

export async function handleChat({ message, sessionId, language: languagePreference = 'auto', sessionToken, requestId }) {
  let session;
  let issuedToken = null;

  if (sessionId) {
    session = await authorizeSession(sessionId, sessionToken);
  } else {
    const created = await createSession('en');
    session = created.session;
    issuedToken = created.token;
  }

  const resolved = resolveLanguage(languagePreference, message);
  const language = resolved.language;
  const sensitive = detectSensitiveData(message);
  const storedContent = redactSensitiveData(message);

  await touchSession(session, { language });

  await Message.create({
    sessionId: session._id,
    role: 'user',
    content: storedContent,
    language,
  });

  await maybeSummarizeSession(session._id);
  const context = await buildConversationContext(session._id);

  const agentResult = await runAgentTurn({
    sessionId: session._id,
    messages: context.messages,
    // Use the redacted text so a typed OTP/PIN can never be echoed back by the
    // model or copied into a fallback/abstention answer.
    latestUserMessage: storedContent,
    language,
    requestId,
  });

  const finalAnswer = sensitive.hasSensitiveData
    ? `${agentResult.answer}\n\n${SENSITIVE_NOTE[language] || SENSITIVE_NOTE.en}`
    : agentResult.answer;

  const assistantMessage = await Message.create({
    sessionId: session._id,
    role: 'assistant',
    content: finalAnswer,
    citations: agentResult.citations.map((citation) => citation.sourceId),
    confidence: agentResult.confidence,
    language,
    answerType: agentResult.answerType,
    agentStatus: agentResult.agentStatus,
    demoMode: agentResult.demoMode,
  });

  await AgentRun.updateOne({ _id: agentResult.runId }, { $set: { messageId: assistantMessage._id } }).catch(
    () => {},
  );

  const store = retrievalStoreLabel();
  const retrieval = {
    mode: agentResult.retrieval?.semanticUsed ? 'semantic+keyword' : store.semantic ? 'keyword_fallback' : 'keyword',
    degraded: Boolean(agentResult.retrieval?.degraded || store.degraded),
    evidenceCount: agentResult.evidenceCount,
    store: agentResult.retrieval?.store || store.provider,
  };

  return {
    sessionId: String(session._id),
    messageId: String(assistantMessage._id),
    answer: finalAnswer,
    language,
    citations: agentResult.citations.map((citation) => ({
      sourceId: citation.sourceId,
      title: citation.title,
      authority: citation.authority,
      url: citation.url,
      publishedAt: citation.publishedAt,
      lastVerifiedAt: citation.lastVerifiedAt,
      snippet: citation.snippet,
      trustLevel: citation.trustLevel,
      sourceType: citation.sourceType,
    })),
    needsClarification: agentResult.needsClarification,
    followUpQuestion: agentResult.followUpQuestion,
    confidence: agentResult.confidence,
    answerType: agentResult.answerType,
    agentStatus: agentResult.agentStatus,
    demoMode: agentResult.demoMode,
    disclaimer: DISCLAIMER,
    retrieval,
    sensitiveDataDetected: sensitive.hasSensitiveData,
    safetyCategory: agentResult.safetyCategory,
    ...(issuedToken ? { sessionToken: issuedToken } : {}),
  };
}

export async function getSessionHistory({ sessionId, sessionToken, limit = 100 }) {
  await authorizeSession(sessionId, sessionToken);
  const messages = await listMessagesForClient(sessionId, limit);

  const sourceIds = [...new Set(messages.flatMap((message) => (message.citations || []).map(String)))];
  const sources = sourceIds.length ? await Source.find({ _id: { $in: sourceIds } }).lean() : [];
  const sourceMap = new Map(sources.map((source) => [String(source._id), source]));

  return {
    sessionId,
    messages: messages.map((message) => ({
      messageId: String(message._id),
      role: message.role,
      content: message.content,
      language: message.language,
      confidence: message.confidence,
      answerType: message.answerType,
      agentStatus: message.agentStatus,
      demoMode: Boolean(message.demoMode),
      createdAt: message.createdAt,
      citations: (message.citations || [])
        .map((id) => sourceMap.get(String(id)))
        .filter(Boolean)
        .map((source) => ({
          sourceId: String(source._id),
          title: source.title,
          authority: source.authority,
          url: source.canonicalUrl,
          publishedAt: source.publishedAt,
          lastVerifiedAt: source.lastVerifiedAt,
          snippet: '',
          trustLevel: source.trustLevel,
          sourceType: source.sourceType,
        })),
    })),
  };
}

export async function checkSessionExists({ sessionId, sessionToken }) {
  await authorizeSession(sessionId, sessionToken);
  return true;
}

export { isDemoMode };
