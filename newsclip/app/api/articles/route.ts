import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { fetchMultipleRss, DEFAULT_RSS_SOURCES, extractDomain, buildGoogleNewsUrl } from "@/lib/rss";

// 서브도메인 제거 — feeds.reuters.com → reuters.com (출처 매칭용)
function getBaseDomain(domain: string): string {
  const parts = domain.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : domain;
}

// 실제 RSS 피드 URL 여부 판별 (홈페이지 URL 제외)
function isRssUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.startsWith("feeds.")) return true;
    const path = u.pathname.toLowerCase();
    const query = u.search.toLowerCase();
    return (
      path.includes("/rss") || path.includes("/feed") || path.includes("/atom") ||
      path.endsWith(".rss") || path.endsWith(".xml") || path.endsWith(".atom") ||
      query.includes("format=rss") || query.includes("rss=") || query.includes("feed=")
    );
  } catch { return false; }
}

// GET /api/articles?subcategoryId=xxx&limit=10
// GET /api/articles?categoryId=xxx&limit=10
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const subcategoryId = searchParams.get("subcategoryId");
    const limitRaw = parseInt(searchParams.get("limit") || "10", 10);
    // limit 값 범위 검증 (1~100)
    const limit = Number.isNaN(limitRaw) ? 10 : Math.min(Math.max(limitRaw, 1), 100);

    if (!categoryId && !subcategoryId) {
      return NextResponse.json(
        { error: "categoryId 또는 subcategoryId 필요" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    let query = supabase
      .from("articles")
      .select(
        `
        *,
        subcategories!inner(id, name, category_id)
      `
      )
      .order("published_at", { ascending: false })
      .limit(limit);

    if (subcategoryId) {
      query = query.eq("subcategory_id", subcategoryId);
    } else if (categoryId) {
      // Supabase JS v2: !inner join 테이블 컬럼 필터 — eq("foreignTable.column", value) 문법 지원
      query = query.eq("subcategories.category_id", categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // 1순위: 공신력 있는 출처(sources 테이블 등록) → 2순위: 발행일 최신순
    const resolvedCategoryId = categoryId ?? (data?.[0] as { subcategories?: { category_id?: string } } | undefined)?.subcategories?.category_id;
    if (resolvedCategoryId && data?.length) {
      const [{ data: catSources }, { data: commonSources }] = await Promise.all([
        supabase.from("sources").select("url, name, weight").eq("category_id", resolvedCategoryId),
        supabase.from("sources").select("url, name, weight").is("category_id", null),
      ]);

      // tier 1 = 공통, tier 2 = 카테고리, tier 3 = 미등록 (낮을수록 우선)
      const sourceMap = new Map<string, { weight: number; tier: number }>();

      const addSource = (src: { url?: string | null; name?: string | null; weight?: number | null }, tier: number) => {
        const entry = { weight: src.weight ?? 0, tier };
        if (src.url) {
          const key = getBaseDomain(extractDomain(src.url));
          if (!sourceMap.has(key)) sourceMap.set(key, entry);
        }
        if (src.name) {
          const key = src.name.toLowerCase();
          if (!sourceMap.has(key)) sourceMap.set(key, entry);
        }
      };

      for (const src of commonSources ?? []) addSource(src, 1);
      for (const src of catSources ?? []) addSource(src, 2);

      // 도메인 또는 이름으로 출처 조회 (Google News는 이름으로 옴)
      const lookupSource = (source: string) =>
        sourceMap.get(getBaseDomain(source)) ?? sourceMap.get(source.toLowerCase());

      if (sourceMap.size) {
        data.sort((a, b) => {
          const sa = lookupSource(a.source ?? "");
          const sb = lookupSource(b.source ?? "");
          const tierA = sa?.tier ?? 3;
          const tierB = sb?.tier ?? 3;
          if (tierA !== tierB) return tierA - tierB;
          const wDiff = (sb?.weight ?? 0) - (sa?.weight ?? 0);
          if (wDiff !== 0) return wDiff;
          return (b.published_at ? new Date(b.published_at).getTime() : 0)
               - (a.published_at ? new Date(a.published_at).getTime() : 0);
        });
      } else {
        // sources 테이블 비어있으면 날짜순만 적용
        data.sort((a, b) =>
          (b.published_at ? new Date(b.published_at).getTime() : 0)
        - (a.published_at ? new Date(a.published_at).getTime() : 0)
        );
      }
    }

    return NextResponse.json({ articles: data ?? [] });
  } catch (err) {
    console.error("[GET /api/articles]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/articles — RSS에서 기사 수집 후 DB 저장
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { categoryId, categoryName } = body as {
      categoryId?: string;
      categoryName?: string;
    };

    if (!categoryId || !categoryName) {
      return NextResponse.json(
        { error: "categoryId, categoryName 필요" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // ── 카테고리 전용 출처 RSS 조회 (P2) ──
    // P1 공통 출처는 표시 순서(GET 정렬)에만 사용.
    // 전 분야 RSS를 카테고리 수집에 혼합하면 관련도·기사수 모두 저하되므로
    // 수집은 카테고리 전용 피드(P2) + 서브카테고리 피드 + DEFAULT 중심으로 유지.
    const { data: catSrcs } = await supabase
      .from("sources")
      .select("url")
      .eq("category_id", categoryId)
      .not("url", "is", null)
      .order("priority")
      .order("weight", { ascending: false });

    const p2Urls = (catSrcs ?? []).map((s) => s.url).filter((u): u is string => !!u && isRssUrl(u));

    // 해당 카테고리의 서브카테고리 조회
    const { data: subcategories, error: subErr } = await supabase
      .from("subcategories")
      .select("*")
      .eq("category_id", categoryId)
      .order("order_num");

    if (subErr) throw subErr;
    if (!subcategories?.length) {
      return NextResponse.json({ error: "서브카테고리 없음" }, { status: 404 });
    }

    const results: Record<string, number> = {};

    for (const sub of subcategories) {
      // Google News 검색 URL — 태그 + 서브카테고리명 + 카테고리명 조합
      const gnKeywords = [
        ...(sub.tags ?? []),
        sub.name,
        categoryName,
      ].filter(Boolean).slice(0, 5); // 너무 많으면 쿼리가 좁아짐
      const googleNewsUrl = buildGoogleNewsUrl(gnKeywords);

      // 수집 우선순위: Google News(가장 빠름) → P2 카테고리 전용 → 서브카테고리 피드 → DEFAULT
      const rssSources: string[] = [
        ...(googleNewsUrl ? [googleNewsUrl] : []),
        ...new Set([
          ...p2Urls,
          ...(sub.rss_sources ?? []),
          ...(DEFAULT_RSS_SOURCES[categoryName] ?? []),
        ]),
      ].slice(0, 10); // 최대 10개 소스

      if (!rssSources.length) {
        results[sub.name] = 0;
        continue;
      }

      // RSS 수집
      const rssItems = await fetchMultipleRss(rssSources);

      // 태그 키워드 필터링 → 매칭 없으면 카테고리/서브카테고리명으로 폴백
      const tags: string[] = sub.tags ?? [];
      const catKeywords = [categoryName, sub.name]
        .map((s) => s.toLowerCase())
        .filter(Boolean);

      const applyFilter = (keywords: string[]) =>
        rssItems.filter((item) => {
          const text = `${item.title} ${item.summary}`.toLowerCase();
          return keywords.some((kw) => text.includes(kw));
        });

      let filteredItems: typeof rssItems;
      if (tags.length > 0) {
        const lowerTags = tags.map((t: string) => t.toLowerCase());
        const tagMatched = applyFilter(lowerTags);
        if (tagMatched.length > 0) {
          filteredItems = tagMatched;
        } else {
          // 태그 매칭 0개 → 카테고리/서브카테고리명으로 폴백
          const catMatched = applyFilter(catKeywords);
          filteredItems = catMatched.length > 0 ? catMatched : [];
        }
      } else {
        // 태그 없음 → 카테고리/서브카테고리명 기본 필터
        const catMatched = applyFilter(catKeywords);
        filteredItems = catMatched.length > 0 ? catMatched : rssItems;
      }

      const itemsToProcess = filteredItems.slice(0, 30);

      // AI 없이 RSS 원문 그대로 일괄 저장 (번역은 팝업 on-demand)
      const rows = itemsToProcess.map((item) => ({
        subcategory_id: sub.id,
        title: item.title,
        url: item.link,
        source: item.source,
        author: item.author,
        published_at: item.pubDate,
        summary: item.summary,
        summary_ko: null,
        is_translated: false,
        fetched_at: new Date().toISOString(),
      }));

      const { data: upserted, error: upsertErr } = await supabase
        .from("articles")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
        .select("id");

      if (upsertErr) console.error("[articles] upsert 실패:", upsertErr);

      results[sub.name] = upserted?.length ?? 0;
    }

    return NextResponse.json({ ok: true, saved: results });
  } catch (err) {
    console.error("[POST /api/articles]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
