import { betterAuth, type BetterAuthOptions } from 'better-auth';
import type { Pool } from 'pg';
import type { Mailer } from './mailer.ts';
import { resetPasswordMail } from './reset-mail.ts';
import { createAuthBeforeHook } from './sign-out.ts';
import { PASSWORD_RESET_ENABLED } from './password-reset-policy.ts';

// 認証テーブルの形を決めるBetter Authの設定。migration（db:migrate:auth）と実行時の認証設定が
// 同じ関数を使うことで、作成されるテーブルと実際に使う機能のずれを防ぐ。
// 回数制限はDBへ保存する（再起動・複数instanceをまたいで効かせる。Architecture「実装時に必要な対策」）。
// 版はpackage.jsonとlockfileで固定する。`@latest`のCLIは使わない。
export function authSchemaOptions(pool: Pool) {
  return {
    database: pool,
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
  } satisfies BetterAuthOptions;
}

// Fastify側が信頼できるclient IPを1つだけ入れて渡すheader。client送信分はbridgeで必ず上書きする。
export const TRUSTED_IP_HEADER = 'x-futureroi-client-ip';

// 再設定トークンの有効期間。メール本文の「1時間で無効」と同じ値を使う。
export const RESET_TOKEN_TTL_SECONDS = 3600;

export type AuthSettings = {
  pool: Pool;
  secret: string;
  /** 公開base URL。Cookieの`Secure`はこのURLのschemeで決まる。 */
  baseURL: string;
  /** baseURL以外に認証endpointへの要求を許すorigin（開発時のViteなど）。 */
  trustedOrigins?: string[];
  /** 1 IPあたり60秒の試行上限。 */
  signInMax: number;
  signUpMax: number;
  /** パスワード再設定の要求・実行の、1 IPあたり60秒の上限。 */
  resetMax: number;
  /** 合成テストで既存の再設定を検査するための明示指定。実行entryは共通の停止方針を使う。 */
  passwordResetEnabled?: boolean;
  /** パスワード再設定メールの送信手段（[mailer.ts](./mailer.ts)）。 */
  mailer: Mailer;
  /**
   * 応答の後も完了まで走らせる処理（再設定メールの送信）を預かる。常駐serverは終了時に待つ追跡、
   * VercelはFunctionを送信完了まで生かす`waitUntil`を渡す（[background.ts](./background.ts)）。
   */
  background: (task: Promise<unknown>) => void;
};

export function createAuth(s: AuthSettings) {
  const schema = authSchemaOptions(s.pool);
  const passwordResetEnabled = s.passwordResetEnabled ?? PASSWORD_RESET_ENABLED;
  return betterAuth({
    ...schema,
    emailAndPassword: {
      ...schema.emailAndPassword,
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
      // SDKの既定に依存せず、再設定した利用者の既存セッションをすべて失効させる。
      // 不正利用からの復旧で、旧パスワードでログインしていた端末の操作を残さない。
      revokeSessionsOnPasswordReset: true,
      // この関数が無いと`/request-password-reset`を400 RESET_PASSWORD_DISABLEDで拒否する。
      // SDKのrunInBackgroundOrAwaitは下のbackgroundTasks.handlerへ送信を預けて待たずに応答する。
      // 未登録の分岐は送信が無いため、送信を待つと外部APIの応答時間だけ登録済みが遅くなり、登録の有無を推測できてしまう。
      // 例外はSDKが自身のloggerへERRORで記録し、応答は200のまま（送信失敗は利用者へは見えず、サーバーログで気付く）。
      ...(passwordResetEnabled ? { sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await s.mailer({ to: user.email, ...resetPasswordMail({ url, expiresInMinutes: RESET_TOKEN_TTL_SECONDS / 60 }) });
      } } : {}),
    },
    secret: s.secret,
    baseURL: s.baseURL,
    basePath: '/api/auth',
    trustedOrigins: [s.baseURL, ...(s.trustedOrigins ?? [])],
    rateLimit: {
      ...schema.rateLimit,
      customRules: {
        '/sign-in/email': { window: 60, max: s.signInMax },
        '/sign-up/email': { window: 60, max: s.signUpMax },
        '/request-password-reset': { window: 60, max: s.resetMax },
        '/reset-password': { window: 60, max: s.resetMax },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: [TRUSTED_IP_HEADER] },
      // runInBackgroundOrAwaitを使う処理（再設定メール送信、回数制限の期限切れ行の削除）を応答から切り離す。
      backgroundTasks: { handler: s.background },
    },
    hooks: { before: createAuthBeforeHook(passwordResetEnabled) },
  });
}

export type Auth = ReturnType<typeof createAuth>;
