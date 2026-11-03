/**
 * Synthetic demo fixtures.
 *
 * These documents exist ONLY to exercise the UI, retrieval, citation rendering
 * and agent lifecycle without any API key. They are not official sources and
 * deliberately contain no real IRCTC rules, fees, timings or eligibility
 * conditions. Every passage says so. Demo answers must never be presented as
 * verified official guidance.
 */
export const DEMO_FIXTURES = [
  {
    url: 'https://demo.invalid/irctc/tatkal-demo',
    title: 'Demo fixture - Tatkal booking (synthetic, not official)',
    authority: 'Synthetic demo fixture (not an official source)',
    language: 'en',
    sourceType: 'fixture',
    texts: [
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. This passage is a placeholder used to demonstrate how BharatSeva AI retrieves and cites a passage about Tatkal booking. It contains no real IRCTC rule, fee, timing, quota or eligibility condition. In a configured deployment this would be replaced by a verified official IRCTC source.',
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. A second Tatkal-related placeholder passage. It exists so the demo can show a multi-passage answer and a source card. Do not rely on it for travel decisions; always check the official IRCTC website or app.',
    ],
  },
  {
    url: 'https://demo.invalid/irctc/refund-demo',
    title: 'Demo fixture - Refund process (synthetic, not official)',
    authority: 'Synthetic demo fixture (not an official source)',
    language: 'en',
    sourceType: 'fixture',
    texts: [
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. This placeholder passage demonstrates retrieval for questions about ticket refunds and cancellation. No actual refund rule, percentage, timeline or fee is described here. Use the official IRCTC website or app for current rules.',
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. Another refund-related placeholder passage used to show how conflicting-looking evidence would be presented. It is not evidence of any real policy about a cancelled ticket.',
    ],
  },
  {
    url: 'https://demo.invalid/irctc/pnr-status-demo',
    title: 'Demo fixture - PNR and booking status (synthetic, not official)',
    authority: 'Synthetic demo fixture (not an official source)',
    language: 'en',
    sourceType: 'fixture',
    texts: [
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. This placeholder describes how a source card about PNR status would appear. BharatSeva AI cannot check any personal PNR, ticket booking, refund or payment status, in this demo or in production.',
    ],
  },
  {
    url: 'https://demo.invalid/irctc/baggage-demo',
    title: 'Demo fixture - Baggage rules (synthetic, not official)',
    authority: 'Synthetic demo fixture (not an official source)',
    language: 'en',
    sourceType: 'fixture',
    texts: [
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. This placeholder passage stands in for a page about baggage and luggage allowances. It intentionally states no weight limits, dimensions or charges. Consult the official Indian Railways or IRCTC sources for real allowances.',
    ],
  },
  {
    url: 'https://demo.invalid/irctc/concession-demo',
    title: 'Demo fixture - Concessions (synthetic, not official)',
    authority: 'Synthetic demo fixture (not an official source)',
    language: 'en',
    sourceType: 'fixture',
    texts: [
      'SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY. This placeholder passage stands in for a page about travel concessions. It contains no categories, documents or entitlements. Verify any concession with the official railway authorities.',
    ],
  },
  {
    url: 'https://demo.invalid/irctc/hindi-demo',
    title: 'डेमो फ़िक्सचर - टिकट प्रक्रिया (सिंथेटिक, आधिकारिक नहीं)',
    authority: 'सिंथेटिक डेमो फ़िक्सचर (आधिकारिक स्रोत नहीं)',
    language: 'hi',
    sourceType: 'fixture',
    texts: [
      'सिंथेटिक डेमो फ़िक्सचर, आधिकारिक नीति नहीं। यह अंश केवल यह दिखाने के लिए है कि BharatSeva AI हिन्दी प्रश्नों के लिए स्रोत कैसे दिखाता है। इसमें कोई वास्तविक IRCTC नियम, शुल्क, समय या पात्रता नहीं दी गई है। वास्तविक जानकारी के लिए आधिकारिक IRCTC वेबसाइट देखें।',
    ],
  },
  {
    url: 'https://demo.invalid/irctc/kannada-demo',
    title: 'ಡೆಮೊ ಫಿಕ್ಸ್ಚರ್ - ಟಿಕೆಟ್ ಪ್ರಕ್ರಿಯೆ (ಸಿಂಥೆಟಿಕ್, ಅಧಿಕೃತವಲ್ಲ)',
    authority: 'ಸಿಂಥೆಟಿಕ್ ಡೆಮೊ ಫಿಕ್ಸ್ಚರ್ (ಅಧಿಕೃತ ಮೂಲವಲ್ಲ)',
    language: 'kn',
    sourceType: 'fixture',
    texts: [
      'ಸಿಂಥೆಟಿಕ್ ಡೆಮೊ ಫಿಕ್ಸ್ಚರ್, ಅಧಿಕೃತ ನೀತಿ ಅಲ್ಲ. BharatSeva AI ಕನ್ನಡ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮೂಲವನ್ನು ಹೇಗೆ ತೋರಿಸುತ್ತದೆ ಎಂಬುದನ್ನು ಪ್ರದರ್ಶಿಸಲು ಈ ಅಂಶವಿದೆ. ಇದರಲ್ಲಿ ನಿಜವಾದ IRCTC ನಿಯಮ, ಶುಲ್ಕ, ಸಮಯ ಅಥವಾ ಅರ್ಹತೆ ಇಲ್ಲ. ನಿಜವಾದ ಮಾಹಿತಿಗಾಗಿ ಅಧಿಕೃತ IRCTC ವೆಬ್‌ಸೈಟ್ ನೋಡಿ.',
    ],
  },
];
