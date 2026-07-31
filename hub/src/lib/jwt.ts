/**
 * Supabase Auth access_token(JWT)에서 session_id 클레임만 꺼낸다.
 * 서명 검증은 하지 않음 — 로그인 이력을 같은 세션으로 짝짓는 상관관계 키로만 쓰고,
 * 실제 인가 판단(누가 로그인했는가)에는 절대 쓰지 않는다.
 */
export function decodeSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof window !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('utf-8');
    const claims = JSON.parse(json) as { session_id?: string };
    return claims.session_id ?? null;
  } catch {
    return null;
  }
}
