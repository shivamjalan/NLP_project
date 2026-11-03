import { normalizeText } from '../../utils/text.js';

const GREETING_RE =
  /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|नमस्ते|नमस्कार|ನಮಸ್ಕಾರ|ನಮಸ್ತೆ)[!.,\s]*$/i;

const AMBIGUOUS_RE =
  /\b(refund|cancellation|cancel|tatkal|rule|rules|charges?|fees?|process|procedure|policy|booking|concession|baggage|luggage)\b/i;

const NO_RETRIEVAL_RE =
  /^(thanks|thank you|ok|okay|got it|bye|goodbye|dhanyavad|धन्यवाद|ಧನ್ಯವಾದ)[!.,\s]*$/i;

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const wrap = (result) => ({ result, usage: { ...ZERO_USAGE } });

/**
 * Deterministic demo agent. It exercises the same decision contract as a real
 * LLM provider (respond / clarify / call tools) using documented rules. It
 * never claims that a fixture is an official source.
 */
export class MockLLMProvider {
  constructor() {
    this.provider = 'mock';
    this.model = 'bharatseva-demo-agent-v1';
  }

  get metadata() {
    return { provider: this.provider, model: this.model };
  }

  async planTurn({ messages, language = 'en' }) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const message = normalizeText(lastUser?.content || '');

    if (!message) {
      return wrap({
        action: 'ask_clarification',
        question: clarificationText(language),
        reason: 'empty_message',
      });
    }

    if (GREETING_RE.test(message)) {
      return wrap({ action: 'respond', text: greetingText(language) });
    }

    if (NO_RETRIEVAL_RE.test(message)) {
      return wrap({ action: 'respond', text: closingText(language) });
    }

    const words = message.split(/\s+/).filter(Boolean);
    if (words.length <= 4 && AMBIGUOUS_RE.test(message)) {
      return wrap({
        action: 'ask_clarification',
        question: clarificationText(language, message),
        reason: 'underspecified_request',
      });
    }

    // Follow-ups that only add a detail ("what about for Tatkal?") are merged
    // with the previous user question so retrieval stays resolvable.
    const previousUser = [...messages]
      .reverse()
      .filter((m) => m.role === 'user')
      .slice(1)
      .find((m) => m.content && m.content.length > 0);
    const needsContext =
      words.length <= 8 && /^(what about|and|how about|what if|और|उसके बारे में|ಮತ್ತು)\b/i.test(message);
    const query =
      needsContext && previousUser
        ? `${normalizeText(previousUser.content)} ${message}`.slice(0, 500)
        : message.slice(0, 500);

    return wrap({
      action: 'call_tools',
      reason: 'demo_policy_requires_evidence',
      toolCalls: [
        {
          id: 'mock_call_1',
          name: 'searchKnowledgeBase',
          arguments: { query, service: 'irctc', language, limit: 5 },
        },
      ],
    });
  }

  async continueTurn({ toolResults = [] }) {
    const hasEvidence = toolResults.some(
      (result) => result.status === 'ok' && Array.isArray(result.evidence) && result.evidence.length > 0,
    );
    if (!hasEvidence) {
      return wrap({ action: 'respond', reason: 'no_evidence_after_retrieval' });
    }
    return wrap({ action: 'respond', reason: 'evidence_sufficient' });
  }

  async generateFinalAnswer({ evidence = [], language = 'en', latestUserMessage = '' }) {
    if (!evidence.length) {
      return wrap({
        answer: abstentionText(language, latestUserMessage),
        evidenceIds: [],
        needsClarification: false,
        followUpQuestion: null,
        confidence: 'low',
        answerType: 'abstention',
      });
    }

    const selected = evidence.slice(0, 2);
    const passages = selected.map((item, index) => `${index + 1}. ${item.text}`).join('\n\n');

    return wrap({
      answer: `${demoAnswerIntro(language)}\n\n${passages}\n\n${demoAnswerOutro(language)}`,
      evidenceIds: selected.map((item) => item.evidenceId),
      needsClarification: false,
      followUpQuestion: null,
      confidence: 'medium',
      answerType: 'grounded',
    });
  }

  async verifyAnswer() {
    // Fixture answers copy fixture passages; structural citation checks still
    // run in the application layer.
    return wrap({ verdict: 'ok', unsupportedClaims: [], missingCitations: [], notes: [] });
  }
}

function greetingText(language) {
  if (language === 'hi') {
    return 'नमस्ते! मैं BharatSeva AI हूँ — एक स्वतंत्र सूचना सहायक, सरकारी सेवा नहीं। आप IRCTC से जुड़ी सार्वजनिक जानकारी पूछ सकते हैं। (डेमो मोड: कोई आधिकारिक स्रोत नहीं जाँचा गया।)';
  }
  if (language === 'kn') {
    return 'ನಮಸ್ಕಾರ! ನಾನು BharatSeva AI — ಸ್ವತಂತ್ರ ಮಾಹಿತಿ ಸಹಾಯಕ, ಸರ್ಕಾರಿ ಸೇವೆ ಅಲ್ಲ. IRCTC ಗೆ ಸಂಬಂಧಿಸಿದ ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿಯನ್ನು ಕೇಳಬಹುದು. (ಡೆಮೊ ಮೋಡ್: ಯಾವುದೇ ಅಧಿಕೃತ ಮೂಲವನ್ನು ಪರಿಶೀಲಿಸಿಲ್ಲ.)';
  }
  return 'Hello! I am BharatSeva AI — an independent information assistant, not a government service. You can ask me about public IRCTC information. (Demo mode: no official source was checked.)';
}

function closingText(language) {
  if (language === 'hi') return 'ठीक है। ध्यान रखें, महत्वपूर्ण जानकारी आधिकारिक वेबसाइट पर जाँचें।';
  if (language === 'kn') return 'ಸರಿ. ಮುಖ್ಯ ಮಾಹಿತಿಯನ್ನು ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.';
  return 'Sure. Please verify anything important on the official website.';
}

function clarificationText(language, topic = '') {
  const quoted = topic ? `“${topic}”` : '';
  if (language === 'hi') {
    return `${quoted} के बारे में कृपया थोड़ा स्पष्ट करें: आप किस सेवा, स्थिति या प्रक्रिया के बारे में जानना चाहते हैं? (डेमो मोड)`;
  }
  if (language === 'kn') {
    return `${quoted} ಬಗ್ಗೆ ಸ್ವಲ್ಪ ಸ್ಪಷ್ಟಪಡಿಸಿ: ಯಾವ ಸೇವೆ, ಪರಿಸ್ಥಿತಿ ಅಥವಾ ಪ್ರಕ್ರಿಯೆ ಬಗ್ಗೆ ತಿಳಿಯಲು ಬಯಸುತ್ತೀರಿ? (ಡೆಮೊ ಮೋಡ್)`;
  }
  return `Could you clarify what you mean by ${quoted || 'that'}? Which service, situation, or process do you want to understand? (Demo mode)`;
}

function abstentionText(language, question) {
  if (language === 'hi') {
    return `डेमो मोड में मुझे इस प्रश्न (“${question}”) के लिए कोई सत्यापित जानकारी नहीं मिली। मैं आधिकारिक नियम का अनुमान नहीं लगाऊँगा; कृपया IRCTC की आधिकारिक वेबसाइट देखें।`;
  }
  if (language === 'kn') {
    return `ಡೆಮೊ ಮೋಡ್‌ನಲ್ಲಿ ಈ ಪ್ರಶ್ನೆಗೆ (“${question}”) ಪರಿಶೀಲಿತ ಮಾಹಿತಿ ಸಿಗಲಿಲ್ಲ. ನಾನು ಅಧಿಕೃತ ನಿಯಮವನ್ನು ಊಹಿಸುವುದಿಲ್ಲ; ದಯವಿಟ್ಟು IRCTC ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್ ನೋಡಿ.`;
  }
  return `In demo mode I could not find any verified information for “${question}”. I will not guess an official rule; please check the official IRCTC website.`;
}

function demoAnswerIntro(language) {
  if (language === 'hi') {
    return 'डेमो मोड (कृपया ध्यान दें): नीचे केवल सिंथेटिक डेमो अंश दिखाए गए हैं, ये आधिकारिक नीति नहीं हैं।';
  }
  if (language === 'kn') {
    return 'ಡೆಮೊ ಮೋಡ್ (ಗಮನಿಸಿ): ಕೆಳಗಿನ ಅಂಶಗಳು ಕೇವಲ ಸಿಂಥೆಟಿಕ್ ಡೆಮೊ ವಿವರಣೆಗಳು, ಅಧಿಕೃತ ನೀತಿ ಅಲ್ಲ.';
  }
  return 'Demo mode (please note): the passages below are synthetic fixtures used to demonstrate retrieval and citations. They are not official policy.';
}

function demoAnswerOutro(language) {
  if (language === 'hi') return 'वास्तविक जानकारी के लिए कृपया IRCTC की आधिकारिक वेबसाइट देखें।';
  if (language === 'kn') return 'ನಿಜವಾದ ಮಾಹಿತಿಗಾಗಿ ದಯವಿಟ್ಟು IRCTC ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್ ನೋಡಿ.';
  return 'For real rules and current details, please check the official IRCTC website.';
}
