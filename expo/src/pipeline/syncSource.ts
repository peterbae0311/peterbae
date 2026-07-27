import { supabase } from '../lib/supabaseClient.js';
import { getAdapter } from '../adapters/registry.js';
import type { SourceRow, SyncResult, SyncStatus } from '../lib/types.js';

async function getSourceByCode(code: string): Promise<SourceRow> {
  const { data, error } = await supabase.from('exh_sources').select('*').eq('code', code).single();
  if (error || !data) {
    throw new Error(`exh_sources에서 소스를 찾을 수 없습니다: ${code} (${error?.message ?? 'not found'})`);
  }
  return data as SourceRow;
}

/** KOPIS 등 'YYYY.MM.DD' 형식 날짜를 Postgres date 컴럼용 'YYYY-MM-DD'로 정규화 */
function toIsoDate(raw: string): string {
  return raw.trim().replaceAll('.', '-');
}

/**
 * 원본 카테고리 값을 공통 코드로 변환한다.
 * 매핑이 없으면 fallback으로 임시 분류하고 운영자 확인 큐(is_confirmed=false)에 적재한다.
 */
async function resolveCategoryCode(sourceId: string, rawValue: string | null, fallback: string): Promise<string> {
  if (!rawValue) return fallback;

  const { data: existing } = await supabase
    .from('exh_category_mappings')
    .select('mapped_category_code')
    .eq('source_id', sourceId)
    .eq('raw_value', rawValue)
    .maybeSingle();

  if (existing?.mapped_category_code) {
    return existing.mapped_category_code;
  }

  await supabase
    .from('exh_category_mappings')
    .upsert(
      { source_id: sourceId, raw_value: rawValue, mapped_category_code: fallback, is_confirmed: false },
      { onConflict: 'source_id,raw_value', ignoreDuplicates: true }
    );

  return fallback;
}

async function resolveVenueId(
  sourceId: string,
  venueName: string | null,
  regionSido: string | null,
  regionSigungu: string | null
): Promise<string | null> {
  if (!venueName) return null;

  const { data, error } = await supabase
    .from('exh_venues')
    .upsert(
      { source_id: sourceId, external_id: venueName, name: venueName, region_sido: regionSido, region_sigungu: regionSigungu },
      { onConflict: 'source_id,external_id' }
    )
    .select('id')
    .single();

  if (error) return null;
  return data?.id ?? null;
}

export async function syncSource(code: string): Promise<SyncResult> {
  const source = await getSourceByCode(code);
  const adapter = getAdapter(code);
  const startedAt = new Date().toISOString();

  let processed = 0;
  let failed = 0;
  let status: SyncStatus = 'success';
  let errorMessage: string | null = null;

  try {
    const rawItems = await adapter.fetchRaw(source);

    for (const raw of rawItems) {
      const { error: rawError } = await supabase
        .from('exh_raw_items')
        .upsert(
          { source_id: source.id, external_id: raw.externalId, payload: raw.payload, collected_at: new Date().toISOString() },
          { onConflict: 'source_id,external_id' }
        );

      if (rawError) {
        failed += 1;
        continue;
      }

      try {
        const normalized = adapter.normalize(raw);
        if (!normalized) {
          failed += 1;
          continue;
        }

        const categoryCode = await resolveCategoryCode(source.id, normalized.rawCategoryValue, adapter.defaultCategoryCode);
        const venueId = await resolveVenueId(
          source.id,
          normalized.venueName ?? null,
          normalized.regionSido ?? null,
          normalized.regionSigungu ?? null
        );

        const { error: eventError } = await supabase.from('exh_events').upsert(
          {
            source_id: source.id,
            external_id: normalized.externalId,
            title: normalized.title,
            category_code: categoryCode,
            region_sido: normalized.regionSido ?? null,
            region_sigungu: normalized.regionSigungu ?? null,
            start_date: toIsoDate(normalized.startDate),
            end_date: normalized.endDate ? toIsoDate(normalized.endDate) : null,
            event_time: normalized.eventTime ?? null,
            venue_id: venueId,
            is_overseas: adapter.isOverseas ?? false,
            price_info: normalized.priceInfo ?? null,
            image_url: normalized.imageUrl ?? null,
            source_url: normalized.sourceUrl ?? null,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'source_id,external_id' }
        );

        if (eventError) {
          failed += 1;
        } else {
          processed += 1;
        }
      } catch {
        // normalize() 미구현/실패 — 원본은 이미 저장됐으므로 이벤트만 건너뛴다
        failed += 1;
      }
    }

    status = failed === 0 ? 'success' : processed > 0 ? 'partial' : 'failed';
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await supabase.from('exh_sync_logs').insert({
    source_id: source.id,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    processed_count: processed,
    failed_count: failed,
    error_message: errorMessage,
  });

  return { code, status, processed, failed, errorMessage };
}
