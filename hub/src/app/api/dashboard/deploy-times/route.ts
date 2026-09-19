import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

/**
 * 대시보드 카드의 "최종 배포일시"를 GitHub 커밋 히스토리에서 직접 조회한다.
 *
 * 원래는 GitHub Actions가 배포 완료 시 hub에 웹훅(POST /api/dashboard/record-deploy)을
 * 쏴서 DB에 기록하는 방식이었는데, hub 전체가 nginx auth_request로 SSO 게이트를 타고 있어서
 * 세션이 없는 CI 호출이 전부 /login으로 302 리다이렉트되어 막혔다(실측 확인, 2026-09-19) —
 * 이걸 뚫으려면 nginx.conf에 이 경로만 SSO를 우회하는 location 블록과 서버 전용 시크릿이
 * 추가로 필요해서 복잡도가 컸다. repo(peterbae0311/peterbae)가 public이라 GitHub REST API로
 * 각 앱 폴더의 마지막 커밋 시각을 인증 없이 바로 읽을 수 있어, 훨씬 단순한 이 방식으로 교체.
 * (record-deploy 웹훅/app_deployments 테이블은 더 이상 안 씀 — route.ts 삭제, 테이블은 굳이
 * DROP까지 안 하고 방치)
 */
const REPO = 'peterbae0311/peterbae';

// 대시보드 카드(app_key) → 그 앱의 실제 소스가 있는 저장소 경로.
// good-words/refine_objectives는 hub 내부 라우트라 hub 전체가 아니라 해당 서브폴더만 봐야
// "이 앱 코드가 마지막으로 바뀐 시점"을 정확히 반영한다(hub의 다른 파일 변경엔 안 움직임).
const APP_PATHS: Record<string, string> = {
  career: 'career',
  lottery: 'lottery',
  newsclip: 'newsclip',
  us_stock_market: 'us_stock_market',
  expo: 'expo',
  image_studio: 'image_studio',
  image_slideshow: 'image_slideshow',
  audio_translate: 'audio_translate',
  course_planning: 'course_planning',
  manage_instructor: 'manage_instructor',
  outside_instructor: 'outside_instructor',
  manage_token: 'manage_token',
  'My-Claude': 'My-Claude',
  'good-words': 'hub/src/app/good-words',
  refine_objectives: 'hub/src/app/refine_objectives',
};

// GitHub API는 미인증 시 IP당 60req/시간 제한이라, 대시보드를 열 때마다 15개를 다 부르면
// 금방 소진된다 — 서버 프로세스 메모리에 잠깐 캐시해서 실제 호출 빈도를 크게 줄인다.
const CACHE_TTL_MS = 15 * 60_000;
let cache: { data: Record<string, string>; fetchedAt: number } | null = null;

async function fetchLatestCommitDate(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=1`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    const commits = await res.json();
    const date = commits?.[0]?.commit?.committer?.date;
    return typeof date === 'string' ? date : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ deployTimes: cache.data });
  }

  const entries = await Promise.all(
    Object.entries(APP_PATHS).map(async ([appKey, path]) => [appKey, await fetchLatestCommitDate(path)] as const)
  );

  const deployTimes: Record<string, string> = {};
  for (const [appKey, date] of entries) {
    if (date) deployTimes[appKey] = date;
  }

  cache = { data: deployTimes, fetchedAt: Date.now() };
  return NextResponse.json({ deployTimes });
}
