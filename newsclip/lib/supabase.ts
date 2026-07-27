import { createClient } from "@supabase/supabase-js";

// ── 서버 전용 클라이언트 (API Route에서 사용) ──────────────
// 환경변수는 NEXT_PUBLIC_ 없는 버전 우선 사용 (서버 전용 보장)
export function createServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
  return createClient(url, key);
}

// ── 브라우저 클라이언트 (클라이언트 컴포넌트에서 사용) ────
// typeof window 체크로 SSR 환경에서 싱글턴 캐시가 서버 메모리에
// 남지 않도록 방어 처리
let browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserClient() {
  // SSR 환경에서는 캐싱하지 않고 매번 신규 클라이언트 반환
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Supabase 공개 환경변수가 설정되지 않았습니다.");
    }
    return createClient(url, key);
  }

  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase 공개 환경변수가 설정되지 않았습니다.");
  }

  browserClient = createClient(url, key);
  return browserClient;
}

// ── 타입 정의 ─────────────────────────────────────────────
export type Category = {
  id: string;
  name: string;
  order_num: number;
  created_at: string;
};

export type Subcategory = {
  id: string;
  category_id: string;
  name: string;
  tags: string[] | null;
  description: string | null;
  rss_sources: string[] | null;
  order_num: number;
  created_at: string;
};

export type Source = {
  id: string;
  category_id: string;
  classification: string | null;
  name: string;
  description: string | null;
  url: string | null;
  weight: number;
  priority: number;
  created_at: string;
};

export type Article = {
  id: string;
  subcategory_id: string;
  title: string;
  url: string;
  source: string | null;
  author: string | null;
  published_at: string | null;
  summary: string | null;
  summary_ko: string | null;
  full_content: string | null;
  full_content_ko: string | null;
  is_translated: boolean;
  fetched_at: string;
  created_at: string;
};
