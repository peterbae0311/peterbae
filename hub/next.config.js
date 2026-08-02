/** @type {import('next').NextConfig} */
const nextConfig = {
  // oracledb는 image_slideshow의 여러 API 라우트(albums, albums/[id], photos, ...)에서
  // import된다. Next.js dev 모드는 Route Handler를 라우트별로 온디맨드 컴파일하는데,
  // oracledb가 기본 webpack 번들링 대상이면 라우트마다 별도 청크에 oracledb의 "다른 인스턴스"가
  // 각각 번들링된다. 그러면 route.ts에서 만든 oracledb.STRING/CLOB 같은 바인드 타입 상수 객체가,
  // globalThis에 캐싱해 재사용하는 커넥션 풀(oracleDb.ts, 최초 컴파일된 라우트의 청크 소속)의
  // oracledb 인스턴스 입장에서는 "낯선" 객체가 되어 NJS-012(invalid bind data type)로 거부당한다.
  // serverExternalPackages로 지정하면 webpack 번들링 대신 Node의 require() 캐시(진짜 프로세스
  // 전역 싱글턴)를 쓰게 되어, 모든 라우트가 항상 동일한 oracledb 인스턴스를 참조하게 된다.
  serverExternalPackages: ['oracledb'],
};

module.exports = nextConfig;
