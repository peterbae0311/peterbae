/**
 * peterbae.duckdns.org에 배포된 모노레포 목록.
 * key는 nginx location의 첫 path segment와 반드시 일치해야 함
 * (verify/route.ts가 요청 경로의 첫 segment로 app_key를 판별하므로).
 */
export interface AppEntry {
  key: string;
  label: string;
  path: string;
}

export const APPS: AppEntry[] = [
  { key: 'career',            label: '경력 관리',              path: '/career' },
  { key: 'lottery',           label: '로또 번호 관리',          path: '/lottery' },
  { key: 'newsclip',          label: '뉴스 분석',              path: '/newsclip' },
  { key: 'us_stock_market',   label: '미국 주식 시장',          path: '/us_stock_market' },
  { key: 'expo',              label: '전시·공연 정보',          path: '/expo' },
  { key: 'image_studio',      label: 'AI 이미지 스튜디오',      path: '/image_studio' },
  { key: 'image_slideshow',   label: '이미지 슬라이드쇼',        path: '/image_slideshow' },
  { key: 'good-words',        label: '좋은글',                path: '/good-words' },
  { key: 'audio_translate',   label: '오디오 번역/요약',        path: '/audio_translate' },
  { key: 'course_planning',   label: '과정 기획 자동화',        path: '/course_planning' },
  { key: 'manage_instructor', label: '사내 강사 전문성 확보',    path: '/manage_instructor' },
  { key: 'outside_instructor',label: '사외 강사 관리',          path: '/outside_instructor' },
  { key: 'manage_token',      label: '토큰 관리',              path: '/manage_token' },
  { key: 'refine_objectives', label: '학습목표 개선',          path: '/refine_objectives' },
  { key: 'My-Claude',         label: '퀴즈 마스터',            path: '/My-Claude' },
];

export const SUPER_ADMIN_EMAIL = 'peter.bae0311@gmail.com';

export function fullUrl(path: string): string {
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return `http://peterbae.duckdns.org${path}`;
}
