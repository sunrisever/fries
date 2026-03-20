import type { AccountRecord, LocaleMode } from "../types";

type ProvidersPageProps = {
  observerAccounts: AccountRecord[];
  apiAccounts: AccountRecord[];
  selectedId: string;
  locale: LocaleMode;
  uiText: (zh: string, en: string) => string;
  statusLabel: (status: AccountRecord["status"], locale: LocaleMode) => string;
  getDisplayTitle: (account: AccountRecord) => string;
  compactNumber: (value?: number) => string;
  onSelect: (id: string) => void;
};

export default function ProvidersPage({
  observerAccounts,
  apiAccounts,
  selectedId,
  locale,
  uiText,
  statusLabel,
  getDisplayTitle,
  compactNumber,
  onSelect,
}: ProvidersPageProps) {
  return (
    <div className="page">
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">OBSERVE</span>
            <h3>{uiText("观察位", "Observer")}</h3>
          </div>
        </div>
        <div className="cards-grid">
          {observerAccounts.map((account) => (
            <button
              key={account.id}
              className={`account-card ${selectedId === account.id ? "is-selected" : ""}`}
              onClick={() => onSelect(account.id)}
              type="button"
            >
              <div className="card-topline">
                <span className={`status-pill ${account.status}`}>{statusLabel(account.status, locale)}</span>
                <span className="usage-text">{account.provider}</span>
              </div>
              <h4>{getDisplayTitle(account)}</h4>
              <p>{account.plan}</p>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${account.usagePercent}%` }} />
              </div>
              <small>{account.usageLabel}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">EXACT</span>
            <h3>{uiText("精确额度源", "Exact quota sources")}</h3>
          </div>
        </div>
        <div className="cards-grid">
          {apiAccounts.map((account) => (
            <button
              key={account.id}
              className={`account-card ${selectedId === account.id ? "is-selected" : ""}`}
              onClick={() => onSelect(account.id)}
              type="button"
            >
              <div className="card-topline">
                <span className={`status-pill ${account.status}`}>{statusLabel(account.status, locale)}</span>
                <span className="usage-text">{account.provider}</span>
              </div>
              <h4>{getDisplayTitle(account)}</h4>
              <p>{account.plan}</p>
              <dl>
                <div>
                  <dt>{uiText("已用", "Used")}</dt>
                  <dd>{compactNumber(account.tokensUsed)}</dd>
                </div>
                <div>
                  <dt>{uiText("剩余", "Remaining")}</dt>
                  <dd>{compactNumber(account.tokensRemaining)}</dd>
                </div>
                <div>
                  <dt>{uiText("来源", "Source")}</dt>
                  <dd>{account.sourceLabel}</dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
