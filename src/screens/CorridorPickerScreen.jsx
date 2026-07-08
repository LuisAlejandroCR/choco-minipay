import { useTranslation } from "react-i18next";
import { Globe, Landmark, PlusCircle, Wallet } from "lucide-react";

export function CorridorPickerScreen({
  onSendToAfrica,
  onWithdrawToBank = null,
  onKeepAsUsdc,
  onFundWallet = null,
  hasUsdc = true,
}) {
  const { t } = useTranslation();
  const showFundNotice = onFundWallet && !hasUsdc;

  return (
    <div className="screen corridor-picker-screen">
      <div className="corridor-picker-inner">
        <div className="corridor-picker-header">
          <span className="corridor-kicker">{t("corridor.kicker")}</span>
          <h2>{t("corridor.title")}</h2>
        </div>

        {showFundNotice && (
          <div className="corridor-fund-notice">
            <span className="corridor-fund-notice-text">{t("corridor.no_usdc")}</span>
            <button className="corridor-fund-btn" type="button" onClick={onFundWallet}>
              <PlusCircle size={15} /> {t("corridor.fund_wallet")}
            </button>
          </div>
        )}

        <div className="corridor-options">
          <button className="corridor-card primary" type="button" onClick={onSendToAfrica}>
            <div className="corridor-card-icon"><Globe size={24} /></div>
            <div className="corridor-card-body">
              <strong>{t("corridor.send_africa")}</strong>
              <span>{t("corridor.send_africa_countries")}</span>
            </div>
            <span className="corridor-card-arrow">→</span>
          </button>

          <button
            className={`corridor-card${!onWithdrawToBank ? " corridor-card-soon" : ""}`}
            type="button"
            onClick={onWithdrawToBank ?? undefined}
            disabled={!onWithdrawToBank}
          >
            <div className="corridor-card-icon"><Landmark size={24} /></div>
            <div className="corridor-card-body">
              <strong>{t("corridor.withdraw_bank")}</strong>
              <span>{t("corridor.withdraw_bank_countries")}</span>
            </div>
            {!onWithdrawToBank
              ? <span className="corridor-soon-badge">{t("corridor.soon")}</span>
              : <span className="corridor-card-arrow">→</span>
            }
          </button>

          <button className="corridor-card" type="button" onClick={onKeepAsUsdc}>
            <div className="corridor-card-icon"><Wallet size={24} /></div>
            <div className="corridor-card-body">
              <strong>{t("corridor.keep_usdc")}</strong>
              <span>{t("corridor.keep_usdc_sub")}</span>
            </div>
            <span className="corridor-card-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
