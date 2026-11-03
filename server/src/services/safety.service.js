import {
  detectSensitiveData,
  detectUnsupportedAction,
  isRequestingSecrets,
} from '../utils/sanitize.js';

const UNSUPPORTED_SERVICE_RE =
  /\b(epfo|pf balance|passport seva|passport application|parivahan|driving licen[cs]e|voter id|income tax|gst|ayushman bharat|pm kisan|ration card|aadhaar update|pan card application)\b/i;
const IRCTC_CONTEXT_RE = /\b(irctc|train|railway|rail|ticket|pnr|tatkal|coach|berth|station)\b/i;

const REFUSAL = {
  en: (topic) =>
    `I can explain public information about ${topic}, but I cannot perform that action. BharatSeva AI cannot book or cancel tickets, take payments, submit forms, log in, or check private booking, refund, payment, or account status. Please use the official IRCTC website or app for the transaction itself.`,
  hi: (topic) =>
    `मैं ${topic} के बारे में सार्वजनिक जानकारी समझा सकता हूँ, लेकिन यह कार्रवाई नहीं कर सकता। BharatSeva AI टिकट बुक/रद्द नहीं करता, भुगतान नहीं लेता, फ़ॉर्म जमा नहीं करता, लॉगिन नहीं करता और न ही निजी बुकिंग, रिफंड, भुगतान या खाते की स्थिति देखता है। कृपया वास्तविक कार्रवाई के लिए IRCTC की आधिकारिक वेबसाइट या ऐप का उपयोग करें।`,
  kn: (topic) =>
    `ನಾನು ${topic} ಬಗ್ಗೆ ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿಯನ್ನು ವಿವರಿಸಬಹುದು, ಆದರೆ ಆ ಕ್ರಿಯೆಯನ್ನು ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ. BharatSeva AI ಟಿಕೆಟ್ ಕಾಯ್ದಿರಿಸುವುದಿಲ್ಲ, ರದ್ದು ಮಾಡುವುದಿಲ್ಲ, ಪಾವತಿ ತೆಗೆದುಕೊಳ್ಳುವುದಿಲ್ಲ, ಅರ್ಜಿ ಸಲ್ಲಿಸುವುದಿಲ್ಲ, ಲಾಗಿನ್ ಮಾಡುವುದಿಲ್ಲ ಅಥವಾ ಖಾಸಗಿ ಬುಕ್ಕಿಂಗ್, ಮರುಪಾವತಿ, ಪಾವತಿ, ಖಾತೆ ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸುವುದಿಲ್ಲ. ನಿಜವಾದ ಕ್ರಿಯೆಗಾಗಿ ದಯವಿಟ್ಟು IRCTC ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್ ಅಥವಾ ಆ್ಯಪ್ ಬಳಸಿ.`,
};

const SECRET_REQUEST = {
  en: 'Please never share an OTP, password, PIN, CVV, Aadhaar number, PAN, or bank details with any assistant, including me. I do not need them. I can instead explain the public process or point you to the official IRCTC channel.',
  hi: 'कृपया OTP, पासवर्ड, PIN, CVV, आधार नंबर, PAN या बैंक विवरण किसी भी सहायक के साथ साझा न करें, मेरे साथ भी नहीं। मुझे इनकी आवश्यकता नहीं है। मैं इसके बजाय सार्वजनिक प्रक्रिया समझा सकता हूँ या आधिकारिक IRCTC चैनल बता सकता हूँ।',
  kn: 'ದಯವಿಟ್ಟು OTP, ಪಾಸ್‌ವರ್ಡ್, PIN, CVV, ಆಧಾರ್ ಸಂಖ್ಯೆ, PAN ಅಥವಾ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಯಾವುದೇ ಸಹಾಯಕರೊಂದಿಗೆ, ನನ್ನೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ. ನನಗೆ ಅವು ಬೇಕಿಲ್ಲ. ಬದಲಾಗಿ ಸಾರ್ವಜನಿಕ ಪ್ರಕ್ರಿಯೆಯನ್ನು ವಿವರಿಸಬಹುದು ಅಥವಾ ಅಧಿಕೃತ IRCTC ಚಾನೆಲ್ ತಿಳಿಸಬಹುದು.',
};

const OUT_OF_SCOPE = {
  en: (topic) =>
    `The current pilot only has reviewed public information sources for IRCTC. I do not have trusted, indexed sources for ${topic}, so I will not guess its rules or procedures. Please use that service's official website.`,
  hi: (topic) =>
    `इस पायलट में केवल IRCTC के लिए समीक्षित सार्वजनिक स्रोत हैं। ${topic} के लिए मेरे पास विश्वसनीय, अनुक्रमित स्रोत नहीं हैं, इसलिए मैं उसके नियमों या प्रक्रिया का अनुमान नहीं लगाऊँगा। कृपया उस सेवा की आधिकारिक वेबसाइट देखें।`,
  kn: (topic) =>
    `ಈ ಪೈಲಟ್‌ನಲ್ಲಿ IRCTC ಗಾಗಿ ಮಾತ್ರ ಪರಿಶೀಲಿತ ಸಾರ್ವಜನಿಕ ಮೂಲಗಳಿವೆ. ${topic} ಬಗ್ಗೆ ವಿಶ್ವಾಸಾರ್ಹ, ಸೂಚ್ಯಂಕಿತ ಮೂಲಗಳು ಇಲ್ಲ, ಆದ್ದರಿಂದ ನಿಯಮಗಳನ್ನು ಊಹಿಸುವುದಿಲ್ಲ. ದಯವಿಟ್ಟು ಆ ಸೇವೆಯ ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್ ನೋಡಿ.`,
};

const BASE_CONFIDENCE = { en: 'low', hi: 'low', kn: 'low' };

/**
 * Non-negotiable safety and capability gates. These run in backend code before
 * any model call; a prompt-level refusal alone is not considered sufficient.
 */
export function evaluateSafety({ message, language = 'en' }) {
  const text = String(message || '');
  const sensitive = detectSensitiveData(text);

  if (isRequestingSecrets(text)) {
    return {
      category: 'secret_request',
      answer: SECRET_REQUEST[language] || SECRET_REQUEST.en,
      answerType: 'abstention',
      confidence: BASE_CONFIDENCE[language] || 'low',
      needsClarification: false,
      followUpQuestion: null,
      sensitiveData: sensitive,
    };
  }

  if (detectUnsupportedAction(text)) {
    return {
      category: 'unsupported_action',
      answer: REFUSAL[language](IRCTC_CONTEXT_RE.test(text) ? 'IRCTC services' : 'this process'),
      answerType: 'abstention',
      confidence: BASE_CONFIDENCE[language] || 'low',
      needsClarification: false,
      followUpQuestion: null,
      sensitiveData: sensitive,
    };
  }

  if (UNSUPPORTED_SERVICE_RE.test(text) && !IRCTC_CONTEXT_RE.test(text)) {
    const match = text.match(UNSUPPORTED_SERVICE_RE);
    const topic = match ? match[0] : 'that service';
    return {
      category: 'out_of_scope',
      answer: OUT_OF_SCOPE[language](topic),
      answerType: 'abstention',
      confidence: 'low',
      needsClarification: false,
      followUpQuestion: null,
      sensitiveData: sensitive,
    };
  }

  return null;
}
