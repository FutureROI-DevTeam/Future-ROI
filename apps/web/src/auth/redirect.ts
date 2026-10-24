/** ログイン画面を開いた理由。expired は「ログインの有効期限が切れました」を出す（デザイン A5）。 */
export type AuthReason = 'expired';

export type AuthSearch = { redirect: string; reason?: AuthReason };

/** アプリ内の戻り先か（外部URL・`//host`・先頭のスラッシュ＋バックスラッシュを除く）。 */
function isAppPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.startsWith('/\\');
}

/**
 * 認証に成功した後の移動先（#249）。ログインは戻り先へ戻す。
 * 新規登録は、新しいアカウントがGoalを1つも持たず、引き継いだ戻り先（例：別の人のGoalのURL）を開けないため、いつもGoal一覧へ進む。
 */
export function afterAuthTarget(mode: 'login' | 'register', redirect: string): string {
  return mode === 'register' ? '/goals' : redirect;
}

/** 明示されたアプリ内の戻り先を保ち、指定がなければGoal一覧を開く。理由は既知の値だけを残す。 */
export function authSearch(search: Record<string, unknown>): AuthSearch {
  const redirect = isAppPath(search.redirect) ? search.redirect : '/goals';
  return search.reason === 'expired' ? { redirect, reason: 'expired' } : { redirect };
}
