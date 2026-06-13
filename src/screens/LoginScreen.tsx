import type { AuthConfig } from '../auth';
import { isDevAuthEnabled, startHostedUiLogin } from '../auth';

interface LoginScreenProps {
  authConfig: AuthConfig | null;
  error: string | null;
  onDevLogin: () => void;
}

export default function LoginScreen({ authConfig, error, onDevLogin }: LoginScreenProps) {
  const disabled = authConfig == null;
  const devAuth = isDevAuthEnabled();

  return (
    <div className="kit-login">
      <div className="kit-login__brand">
        <span className="kit-login__mark" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 108 108" fill="none">
            <path fill="var(--fg)" fillRule="evenodd"
              d="M54,6 L68,45 L102,54 L63,68 L54,102 L40,63 L6,54 L45,40 Z
                 M64,54 a10,10 0 1,0 -20,0 a10,10 0 1,0 20,0" />
          </svg>
        </span>
        <div className="kit-login__name">NINJA <span>HABITS</span></div>
        <div className="kit-login__tag">静かに、続ける。</div>
      </div>

      <div className="nh-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Web版にログイン</div>
        <p className="nh-muted" style={{ fontSize: 13, lineHeight: 1.7, marginTop: 0 }}>
          Web版のデータはアカウントに紐づけてDBへ保存します。
        </p>
        <button
          className="nh-btn nh-btn--primary nh-btn--block"
          disabled={disabled}
          onClick={() => authConfig && void startHostedUiLogin(authConfig)}>
          Cognito でログイン
        </button>
        {devAuth && (
          <button
            className="nh-btn nh-btn--block"
            style={{ marginTop: 10 }}
            onClick={onDevLogin}>
            開発用ログイン
          </button>
        )}
      </div>

      {disabled && !devAuth && (
        <div className="nh-feedback" style={{ marginTop: 12 }}>
          Cognito 設定が未投入です。`VITE_COGNITO_CLIENT_ID` と `VITE_COGNITO_DOMAIN` を設定してください。
        </div>
      )}

      {error && (
        <div className="nh-feedback nh-feedback--danger" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
