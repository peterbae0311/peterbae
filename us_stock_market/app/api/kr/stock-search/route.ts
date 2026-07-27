import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface NaverSearchItem {
  code: string;
  name: string;
  typeCode?: string;
  category?: string;
}

interface SearchResult {
  code: string;
  name: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const res = await fetch(
      `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
          Referer: 'https://finance.naver.com/',
        },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) return NextResponse.json({ results: [] });

    // 실제 응답 형식: { query: string, items: [{ code, name, typeCode, ... }] }
    const data = (await res.json()) as {
      items?: NaverSearchItem[];
    };

    const results: SearchResult[] = (data?.items ?? [])
      .filter(item => /^\d{6}$/.test(item.code))
      .slice(0, 10)
      .map(item => ({ code: item.code, name: item.name }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
