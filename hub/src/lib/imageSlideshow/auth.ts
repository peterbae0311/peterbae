/**
 * image_slideshow 자체 Supabase 프로젝트가 발급한 access_token(JWT)을 검증한다.
 * hub 자신의 SSO 세션(쿠키)과는 별개 — image_slideshow는 도메인 전체 SSO 게이트를
 * 통과한 뒤에도 자기 프로젝트의 이메일/비밀번호 로그인을 한 번 더 거치므로,
 * 그 로그인에서 나온 토큰을 여기서 서명 검증한다.
 *
 * 이 프로젝트는 이미 비대칭 서명 키(ECC P-256)로 전환되어 있어 고정 공유비밀키가 아니라
 * Supabase의 JWKS 엔드포인트(/auth/v1/.well-known/jwks.json)에서 공개키를 가져와 검증한다.
 * jose의 createRemoteJWKSet이 kid별 키 캐싱과 주기적 갱신을 알아서 처리한다.
 */
import 'server-only';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { imageSlideshowEnv } from './env';

export interface ImageSlideshowUser {
  id: string;
  email: string | null;
}

const jwks = createRemoteJWKSet(
  new URL('/auth/v1/.well-known/jwks.json', imageSlideshowEnv.supabaseUrl)
);

export async function verifyImageSlideshowRequest(request: Request): Promise<ImageSlideshowUser | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, jwks);

    // Supabase가 발급하는 access_token은 로그인된 사용자에 한해 aud가 'authenticated'.
    if (payload.aud !== 'authenticated' || !payload.sub) return null;

    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  } catch {
    return null;
  }
}
