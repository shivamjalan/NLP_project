const OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
];

export default function LanguageSelector({ value, onChange, id = 'language-select' }) {
  return (
    <div className="language-selector">
      <label className="language-selector__label" htmlFor={id}>
        Language
      </label>
      <select
        id={id}
        className="language-selector__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
