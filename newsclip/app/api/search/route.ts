import { NextRequest, NextResponse } from "next/server";
import { fetchMultipleRss, extractDomain } from "@/lib/rss";
import { createServerClient } from "@/lib/supabase";

function getBaseDomain(domain: string): string {
  const parts = domain.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : domain;
}

// POST /api/search — 키워드로 기사 검색 (DB 저장 없음, AI 없음)
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) return NextResponse.json({ articles: [] });

    const q = query.trim();

    // Google News RSS 검색 + sources 테이블 조회 병렬 실행
    const rssUrls = [
      `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`,
      `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`,
    ];

    const supabase = createServerClient();
    const [rssItems, { data: allSources }] = await Promise.all([
      fetchMultipleRss(rssUrls),
      supabase.from("sources").select("url, name, weight"),
    ]);

    // 도메인·이름 → weight 맵 (공신력 점수)
    const weightMap = new Map<string, number>();
    for (const src of allSources ?? []) {
      if (src.url) {
        const key = getBaseDomain(extractDomain(src.url));
        weightMap.set(key, Math.max(weightMap.get(key) ?? 0, src.weight ?? 0));
      }
      if (src.name) {
        const key = src.name.toLowerCase();
        weightMap.set(key, Math.max(weightMap.get(key) ?? 0, src.weight ?? 0));
      }
    }

    const getWeight = (source: string): number => {
      if (!source) return -1;
      return weightMap.get(getBaseDomain(source))
        ?? weightMap.get(source.toLowerCase())
        ?? -1;
    };

    const articles = rssItems.slice(0, 30).map((item) => ({
      id: item.link,
      subcategory_id: "",
      title: item.title,
      url: item.link,
      source: item.source,
      author: item.author,
      published_at: item.pubDate,
      summary: item.summary,
      summary_ko: null,
      full_content: null,
      full_content_ko: null,
      is_translated: false,
      fetched_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }));

    // 1순위: 공신력 출처(weight 높은 순) → 2순위: 발행일 최신순
    articles.sort((a, b) => {
      const wA = getWeight(a.source ?? "");
      const wB = getWeight(b.source ?? "");
      if (wA !== wB) return wB - wA;
      const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({ articles });
  } catch (err) {
    console.error("[POST /api/search]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
