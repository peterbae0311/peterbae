import 'server-only';
import { createAdminClient } from './supabaseAdmin';

/**
 * manage_token(Key 관리)의 tokens.key_values(jsonb, [{name, value}, ...])에서
 * NAME으로 값을 찾는다. 서비스롤로 RLS(super_admin_only)를 우회해서 조회하므로,
 * 호출하는 라우트가 반드시 hub 로그인 여부를 먼저 확인할 것 — 이 함수 자체는 인가를 하지 않는다.
 */
export async function getTokenKeyValue(name: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('tokens').select('key_values');
  if (error || !data) return null;

  for (const row of data as { key_values: { name?: string; value?: string }[] | null }[]) {
    const match = (row.key_values ?? []).find((kv) => kv.name === name);
    if (match?.value) return match.value;
  }
  return null;
}
