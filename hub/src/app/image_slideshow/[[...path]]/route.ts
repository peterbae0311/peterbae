import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * 로컬 개발 전용 헬퍼 — image_slideshow(정적 사이트, 자체 dev 서버 없음)를 hub와
 * 같은 포트(npm run dev)에서 http://localhost:3000/image_slideshow 로 테스트하기 위함.
 *
 * 파일을 복사/링크해두지 않고 실제 소스 디렉터리를 요청마다 그대로 읽어서 돌려준다 —
 * 심볼릭 링크/하드링크는 에디터가 "임시파일에 쓰고 교체"하는 저장 방식 때문에 첫 편집만에
 * 끊어지는 문제가 있어서(실제로 겪음), 링크 대신 이 방식을 쓴다. 항상 최신 소스를 반영한다.
 *
 * 운영 배포에서는 nginx가 /image_slideshow를 hub에 도달하기 전에 정적 파일로 직접
 * 서빙하므로 이 라우트는 절대 호출되지 않지만, 혹시 모를 상황에 대비해 production에서는
 * 명시적으로 404 처리한다. oracle/ 하위(지갑·API 개인키)는 항상 차단한다.
 */

const SOURCE_DIR = path.resolve(process.cwd(), '..', 'image_slideshow');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function resolveFile(segments: string[]): Promise<string | null> {
  if (segments.some((s) => s === 'oracle' || s.includes('..'))) return null;

  const relPath = segments.join('/');
  let filePath = path.join(SOURCE_DIR, relPath);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    if (!path.extname(filePath)) filePath = path.join(SOURCE_DIR, relPath, 'index.html');
  }

  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  const { path: pathSegments } = await params;
  const filePath = await resolveFile(pathSegments ?? []);
  if (!filePath) return new NextResponse(null, { status: 404 });

  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' },
  });
}
