// 認証メール（パスワード再設定）の送信手段。Better Authはトークン生成と再設定URLの組み立てを行い、
// 送信は`sendResetPassword`へ渡したこの関数が担う。文面は[reset-mail.ts](./reset-mail.ts)で組み立てる。
// 本番はResendのHTTP API（SDKは入れず、fetch 1本で済ませる）。開発・Compose・smoke testは外部へ送らずログへ出す。

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type Mailer = (message: MailMessage) => Promise<void>;

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type ResendMailerOptions = {
  apiKey: string;
  /** 送信元。`Future ROI <no-reply@example.com>` の形か、アドレスだけ。 */
  from: string;
  /** テスト用に差し替える。既定はglobal fetch。 */
  fetch?: typeof fetch;
};

export class MailDeliveryError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MailDeliveryError';
    this.status = status;
  }
}

// Resendの送信API（POST /emails）。応答本文はログ・例外に含めない（宛先等を含み得る）。
export function createResendMailer(o: ResendMailerOptions): Mailer {
  const doFetch = o.fetch ?? fetch;
  return async (message) => {
    let response: Response;
    try {
      response = await doFetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${o.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: o.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MailDeliveryError(`mail: request to Resend failed (${error instanceof Error ? error.name : 'unknown'})`);
    }
    if (!response.ok) throw new MailDeliveryError(`mail: Resend rejected the message (HTTP ${response.status})`, response.status);
    await response.arrayBuffer().catch(() => undefined); // 接続を使い切る。本文は使わない
  };
}

// 隔離したローカル確認用。外部へ送らず、再設定URLを含む本文をpino互換のJSON 1行で標準出力へ出す。
// 再設定URLは有効期間（1時間）中それだけでパスワードを変えられる秘密なので、ログを他人が読める環境では使わない。
export function createLogMailer(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Mailer {
  return async (message) => {
    write(JSON.stringify({ level: 30, time: Date.now(), msg: 'mail: not sent (MAIL_TRANSPORT=log)', to: message.to, subject: message.subject, text: message.text }));
  };
}
