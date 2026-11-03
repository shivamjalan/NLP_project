const STARTERS = [
  {
    text: 'How do I understand the rules for changing a train ticket?',
    hint: 'English',
  },
  {
    text: 'What documents are usually needed for a concession at the booking counter?',
    hint: 'English',
  },
  {
    text: 'What is the difference between Tatkal and general booking?',
    hint: 'English',
  },
  {
    text: 'Where should I verify the latest cancellation charges?',
    hint: 'English',
  },
  {
    text: 'टिकट रिफंड की प्रक्रिया समझाइए।',
    hint: 'हिन्दी',
  },
  {
    text: 'ಟಿಕೆಟ್ ಬುಕ್ಕಿಂಗ್ ಬಗ್ಗೆ ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿ ಹೇಳಿ.',
    hint: 'ಕನ್ನಡ',
  },
];

export default function StarterQuestions({ onSelect }) {
  return (
    <section className="starters" aria-labelledby="starters-heading">
      <h2 id="starters-heading" className="starters__heading">
        Ask anything about public IRCTC information
      </h2>
      <p className="starters__intro">
        These are examples, not a fixed menu. Ask in English, Hindi, Kannada, or a mix of languages, in your own words.
      </p>
      <ul className="starters__list">
        {STARTERS.map((starter) => (
          <li key={starter.text}>
            <button
              type="button"
              className="starter-button"
              onClick={() => onSelect(starter.text)}
              lang={starter.hint === 'हिन्दी' ? 'hi' : starter.hint === 'ಕನ್ನಡ' ? 'kn' : 'en'}
            >
              <span>{starter.text}</span>
              <span className="starter-button__hint">{starter.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
