import { useTranslation } from "react-i18next";
import { ChocoMark } from "../components/ChocoMark.jsx";

export function SplashScreen({ onStart }) {
  const { t } = useTranslation();
  return (
    <button className="screen splash-screen" type="button" onClick={onStart} aria-label="Open Choco">
      <ChocoMark />
      <div className="splash-footer">
        <b>{t("splash.built_by")}</b>
        <span>{t("splash.tagline")}</span>
      </div>
    </button>
  );
}
