import 'server-only';

/**
 * IP → 대략적인 지역/국가 조회 (ipwho.is, 무료·키 불필요).
 * 로그인 이력에만 참고용으로 쓰는 정보라 실패해도 로그인 자체를 막지 않는다 — 항상 best-effort.
 */
export async function lookupRegionCountry(ip: string | null): Promise<string | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return null;

  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success?: boolean; city?: string; country?: string };
    if (!data.success) return null;
    return [data.city, data.country].filter(Boolean).join(' · ') || null;
  } catch {
    return null;
  }
}
