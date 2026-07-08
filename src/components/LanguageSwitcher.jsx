import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt-BR", label: "PT" },
];

export function LanguageSwitcher({ className = "" }) {
  const { i18n } = useTranslation();
  const active = i18n.resolvedLanguage || i18n.language;

  function pick(code) {
    i18n.changeLanguage(code);
  }

  return (
    <div className={`lang-switcher ${className}`.trim()} role="group" aria-label="Language">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={active === code || active?.startsWith(code.split("-")[0]) ? "active" : ""}
          onClick={() => pick(code)}
          aria-pressed={active === code}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
