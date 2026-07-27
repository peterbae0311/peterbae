import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";
import type { CategoryRow, EventRow, FilterStatus } from "./types";

const EVENT_SELECT =
  "id,title,category_code,region_sido,region_sigungu,start_date,end_date,event_time,price_info,image_url,source_url,is_overseas,exh_venues(name,region_sido,region_sigungu),exh_categories(code,name,parent_code)";

export async function getCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("exh_categories")
    .select("code,parent_code,name,level,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`카테고리 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 대분류(문화/산업) 코드로 그 아래 중분류 코드 목록을 구한다 */
export function subCategoryCodes(categories: CategoryRow[], parentCode: string): CategoryRow[] {
  return categories.filter((c) => c.parent_code === parentCode);
}

export interface EventFilters {
  domain?: string; // 대분류 코드 (CULTURE | IND)
  categoryCodes?: string[]; // 중분류 코드 목록
  sido?: string;
  status?: FilterStatus;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface EventsResult {
  rows: EventRow[];
  total: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getEvents(filters: EventFilters): Promise<EventsResult> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 12;
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = supabase
    .from("exh_events")
    .select(EVENT_SELECT, { count: "exact" })
    .order("start_date", { ascending: true })
    .range(rangeFrom, rangeTo);

  if (filters.categoryCodes && filters.categoryCodes.length > 0) {
    query = query.in("category_code", filters.categoryCodes);
  }
  if (filters.sido) {
    query = query.eq("region_sido", filters.sido);
  }
  if (filters.q) {
    query = query.ilike("title", `%${filters.q}%`);
  }
  if (filters.from) {
    // end_date가 없으면 start_date를 종료일로 간주한다 (computeStatus와 동일한 규칙)
    query = query.or(`end_date.gte.${filters.from},and(end_date.is.null,start_date.gte.${filters.from})`);
  }
  if (filters.to) {
    query = query.lte("start_date", filters.to);
  }

  const today = todayIso();
  if (filters.status === "upcoming") {
    query = query.gt("start_date", today);
  } else if (filters.status === "ongoing") {
    query = query.or(`and(start_date.lte.${today},end_date.gte.${today}),and(end_date.is.null,start_date.eq.${today})`);
  } else if (filters.status === "ended") {
    query = query.or(`end_date.lt.${today},and(end_date.is.null,start_date.lt.${today})`);
  } else if (filters.status !== "all") {
    // 기본값: 종료된 이벤트는 숨긴다 (진행중 + 예정만) — end_date 없으면 start_date를 종료일로 간주
    query = query.or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`이벤트 조회 실패: ${error.message}`);
  return { rows: (data ?? []) as unknown as EventRow[], total: count ?? 0 };
}

export async function getEventById(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from("exh_events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`이벤트 상세 조회 실패: ${error.message}`);
  return (data as unknown as EventRow) ?? null;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  count: number;
  domains: Set<string>;
}

export async function getCalendarMonth(
  year: number,
  month: number, // 1-12
  filters: EventFilters
): Promise<{ events: EventRow[] }> {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  let query = supabase
    .from("exh_events")
    .select(EVENT_SELECT)
    .lte("start_date", monthEnd)
    .or(`end_date.gte.${monthStart},and(end_date.is.null,start_date.gte.${monthStart})`)
    .order("start_date", { ascending: true })
    .limit(1000);

  if (filters.categoryCodes && filters.categoryCodes.length > 0) {
    query = query.in("category_code", filters.categoryCodes);
  }
  if (filters.sido) {
    query = query.eq("region_sido", filters.sido);
  }

  const { data, error } = await query;
  if (error) throw new Error(`캘린더 조회 실패: ${error.message}`);
  return { events: (data ?? []) as unknown as EventRow[] };
}

export interface SourceStatusRow {
  code: string;
  name: string;
  domain: string;
  is_active: boolean;
  event_count: number;
  last_sync_status: string | null;
  last_sync_at: string | null;
  last_processed: number | null;
  last_failed: number | null;
}

export async function getAdminSourceStatus(): Promise<SourceStatusRow[]> {
  const { data: sources, error: srcErr } = await supabaseAdmin
    .from("exh_sources")
    .select("id,code,name,domain,is_active")
    .order("domain", { ascending: true });
  if (srcErr) throw new Error(`소스 조회 실패: ${srcErr.message}`);

  const rows: SourceStatusRow[] = [];
  for (const src of sources ?? []) {
    const [{ count: eventCount }, { data: logs }] = await Promise.all([
      supabase.from("exh_events").select("id", { count: "exact", head: true }).eq("source_id", src.id),
      supabaseAdmin
        .from("exh_sync_logs")
        .select("status,processed_count,failed_count,started_at")
        .eq("source_id", src.id)
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    const lastLog = logs?.[0];
    rows.push({
      code: src.code,
      name: src.name,
      domain: src.domain,
      is_active: src.is_active,
      event_count: eventCount ?? 0,
      last_sync_status: lastLog?.status ?? null,
      last_sync_at: lastLog?.started_at ?? null,
      last_processed: lastLog?.processed_count ?? null,
      last_failed: lastLog?.failed_count ?? null,
    });
  }
  return rows;
}

export interface PendingMapping {
  raw_value: string;
  mapped_category_code: string;
  source_code: string;
}

export async function getPendingMappings(): Promise<PendingMapping[]> {
  const { data, error } = await supabaseAdmin
    .from("exh_category_mappings")
    .select("raw_value,mapped_category_code,exh_sources(code)")
    .eq("is_confirmed", false)
    .limit(50);
  if (error) throw new Error(`매핑 큐 조회 실패: ${error.message}`);
  return (data ?? []).map((row) => {
    const sourceRel = row.exh_sources as unknown as { code: string } | { code: string }[] | null;
    const sourceCode = Array.isArray(sourceRel) ? sourceRel[0]?.code : sourceRel?.code;
    return {
      raw_value: row.raw_value,
      mapped_category_code: row.mapped_category_code,
      source_code: sourceCode ?? "?",
    };
  });
}
