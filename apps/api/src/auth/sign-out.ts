import { APIError, createAuthMiddleware } from 'better-auth/api';
import { PASSWORD_RESET_UNAVAILABLE_MESSAGE } from './password-reset-policy.ts';

// Better AuthのsignOutは削除例外（削除前lookupの例外も）を捕捉してCookieを消す。
// HTTP routerのOrigin/CSRF検査後、SDK署名で確かめたtokenだけを先に削除する。
// 現設定はDB sessionのみ（secondary storage・session delete hooksなし）。追加時はこの境界を再検討する。
export const createAuthBeforeHook = (passwordResetEnabled: boolean) => createAuthMiddleware(async (ctx) => {
  // callback未設定だけでは旧tokenの保存は止まらない。HTTP/直api共通のbeforeで、
  // 検索・token発行/消費・保存・送信より前に全3経路を拒否する。他endpointは従来どおり。
  if (!passwordResetEnabled && (ctx.path === '/request-password-reset' || ctx.path === '/reset-password' || ctx.path?.startsWith('/reset-password/'))) {
    throw new APIError('SERVICE_UNAVAILABLE', { code: 'RESET_PASSWORD_DISABLED', message: PASSWORD_RESET_UNAVAILABLE_MESSAGE });
  }
  if (ctx.path !== '/sign-out') return;
  const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
  if (!token) return; // 未ログイン・不正署名のCookie処理はSDKに委ねる。
  try {
    // SDK内部の削除前lookupや例外処理に依存せず、削除結果を直接確認する。
    // tokenはunique。0行でも既に失効済みとして明示再試行を成功にできる。
    await ctx.context.adapter.delete({ model: 'session', where: [{ field: 'token', value: token }] });
  } catch {
    // DB削除結果が不明な場合もCookieを保持。失効保証ではなく、明示再試行のための失敗契約。
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'SIGN_OUT_UNCONFIRMED',
      message: 'Sign-out could not be confirmed. Please retry.',
    });
  }
});
