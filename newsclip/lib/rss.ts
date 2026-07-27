/**
 * RSS 피드 파싱 유틸리티
 * 서버 전용 — 클라이언트에서 직접 호출 불가 (CORS)
 */

export type RssItem = {
  title: string;
  link: string;
  pubDate: string | null;
  summary: string;
  source: string;
  author: string | null;
};

// 권위 있는 기관 기본 RSS 소스 (카테고리별)
export const DEFAULT_RSS_SOURCES: Record<string, string[]> = {
  반도체: [
    "https://spectrum.ieee.org/feeds/topic/semiconductors.rss",
    "https://semiengineering.com/feed/",
    "https://www.eetimes.com/feed/",
    "https://www.anandtech.com/rss/",
  ],
  AI: [
    "https://feeds.feedburner.com/venturebeat/SZYF",
    "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
    "https://www.technologyreview.com/feed/",
    "https://arxiv.org/rss/cs.AI",
  ],
  금융: [
    "https://feeds.bloomberg.com/markets/news.rss",
    "https://www.ft.com/?format=rss",
    "https://feeds.reuters.com/reuters/businessNews",
  ],
  바이오: [
    "https://www.nature.com/nature.rss",
    "https://feeds.sciencedaily.com/sciencedaily/health_medicine/biotechnology",
    "https://www.biospace.com/rss/articles/",
  ],
  에너지: [
    "https://www.renewableenergyworld.com/feed/",
    "https://feeds.reuters.com/reuters/environment",
    "https://spectrum.ieee.org/feeds/topic/energy.rss",
  ],
};

/**
 * Google News RSS 검색 URL 생성
 * keywords 배열을 AND 검색 쿼리로 조합
 */
export function buildGoogleNewsUrl(keywords: string[], lang = "ko", country = "KR"): string {
  const query = keywords.filter(Boolean).join(" ").trim();
  if (!query) return "";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${country}&ceid=${country}:${lang}`;
}

/** Google News <source url="...">Name</source> 에서 출처명 추출 */
function extractGoogleNewsSource(block: string): string {
  const m = block.match(/<source[^>]+url=["']([^"']+)["'][^>]*>([^<]*)<\/source>/i);
  if (!m) return "";
  const name = m[2].trim();
  if (name) return name;
  try { return new URL(m[1]).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** Google News 제목 끝의 " - 출처명" 제거 */
function stripSourceSuffix(title: string, source: string): string {
  if (source && title.endsWith(` - ${source}`)) return title.slice(0, -(source.length + 3)).trim();
  return title.replace(/\s+[-–]\s+\S.{0,40}$/, "").trim();
}

/**
 * Google News description 정리.
 * GN은 description을 `<a href="...news.google.com...">Title</a> <font>Source</font>` 형식으로 제공함.
 * CDATA(raw HTML)와 엔티티 인코딩(&lt;a ...) 양쪽 모두 감지해 빈 문자열 반환.
 */
function extractGoogleNewsSummary(description: string): string {
  const d = description.trim();
  if (!d) return "";
  // 엔티티 디코딩 후 패턴 검사 (CDATA·인코딩 양쪽 대응)
  const decoded = d
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  if (/^<a\s[^>]*news\.google\.com/i.test(decoded)) return "";
  return cleanHtml(d).slice(0, 500);
}

// RSS XML을 파싱하는 간단한 파서 (RSS 2.0 + Atom 1.0 + Google News 지원)
function parseRssXml(xml: string, sourceUrl: string): RssItem[] {
  const items: RssItem[] = [];
  const isGoogleNews = sourceUrl.includes("news.google.com");
  const defaultSource = extractDomain(sourceUrl);

  // RSS 2.0: <item>, Atom 1.0: <entry>
  const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const rawTitle = extractTag(block, "title");

    // Atom: <link href="..."/> 또는 <link>...</link>, RSS: <link>
    const link =
      extractAtomLink(block) ||
      extractTag(block, "link") ||
      extractTag(block, "guid");

    // Atom: <updated> / <published>, RSS: <pubDate> / <dc:date>
    const pubDateRaw =
      extractTag(block, "pubDate") ||
      extractTag(block, "dc:date") ||
      extractTag(block, "published") ||
      extractTag(block, "updated");

    const description =
      extractTag(block, "description") ||
      extractTag(block, "summary") ||
      extractTag(block, "content");

    const author =
      extractTag(block, "author") ||
      extractTag(block, "dc:creator") ||
      null;

    if (!rawTitle || !link) continue;

    // pubDate 파싱 — Invalid Date 방지
    const pubDate = parseDateSafe(pubDateRaw);

    // Google News: <source url="...">Name</source> 에서 실제 출처 추출
    const source = isGoogleNews
      ? (extractGoogleNewsSource(block) || defaultSource)
      : defaultSource;

    const title = isGoogleNews
      ? stripSourceSuffix(cleanHtml(rawTitle), source)
      : cleanHtml(rawTitle);

    items.push({
      title,
      link: link.trim(),
      pubDate,
      summary: isGoogleNews
        ? extractGoogleNewsSummary(description || "")
        : cleanHtml(description || "").slice(0, 500),
      source,
      author: author ? cleanHtml(author) : null,
    });
  }

  return items;
}

/**
 * Atom <link href="..."/> 형식 추출
 * RSS의 <link>text</link>와 구분하기 위해 별도 처리
 */
function extractAtomLink(block: string): string {
  // <link rel="alternate" href="..."/> or <link href="..."/>
  const m = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1].trim() : "";
}

/**
 * 날짜 문자열을 ISO 8601로 변환. 파싱 실패 시 null 반환.
 */
function parseDateSafe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  // Invalid Date 체크 — getTime()이 NaN이면 invalid
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * XML 태그 내용 추출 (CDATA 포함)
 * 네임스페이스 포함 태그명 지원 (dc:creator 등)
 */
function extractTag(xml: string, tag: string): string {
  // 태그명에 콜론이 있을 경우 정규식 이스케이프
  const escapedTag = tag.replace(":", ":");
  const regex = new RegExp(
    `<${escapedTag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escapedTag}>|<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`,
    "i"
  );
  const match = xml.match(regex);
  if (!match) return "";
  return (match[1] ?? match[2] ?? "").trim();
}

function cleanHtml(html: string): string {
  return html
    // 엔티티 디코딩을 먼저 해야 &lt;a&gt; 같은 인코딩된 태그도 제거됨
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "")   // 실제 태그 제거 (원본 + 디코딩된 것 포함)
    .replace(/&amp;/g, "&")    // &amp;는 마지막에 (이중 디코딩 방지)
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// RSS 피드 fetch
export async function fetchRssFeed(url: string): Promise<RssItem[]> {
  // URL 유효성 사전 검사
  try {
    new URL(url);
  } catch {
    console.warn(`RSS fetch 건너뜀 (잘못된 URL): ${url}`);
    return [];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (NewsAnalyzer/1.0)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      next: { revalidate: 1800 }, // 30분 캐시
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`RSS fetch HTTP 오류: ${res.status} — ${url}`);
      return [];
    }

    const xml = await res.text();
    if (!xml.trim()) {
      console.warn(`RSS fetch 빈 응답: ${url}`);
      return [];
    }

    return parseRssXml(xml, url);
  } catch (err) {
    // AbortError(타임아웃) 또는 네트워크 오류 — 개별 피드 실패가 전체 배치를 막지 않도록 빈 배열 반환
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`RSS fetch 실패: ${url} — ${reason}`);
    return [];
  }
}

// 여러 RSS를 병렬 fetch
export async function fetchMultipleRss(urls: string[]): Promise<RssItem[]> {
  if (!urls.length) return [];

  // Promise.allSettled: 개별 피드 실패가 나머지에 영향 없음
  const results = await Promise.allSettled(urls.map(fetchRssFeed));

  const all: RssItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // 발행일 기준 내림차순, 중복 URL 제거
  const seen = new Set<string>();
  return all
    .filter((item) => {
      if (seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    })
    .slice(0, 30); // 최대 30개
}
