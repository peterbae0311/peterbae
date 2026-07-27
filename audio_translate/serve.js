/**
 * serve.js — 로컬 HTTP 서버 (CORS 문제 해결용)
 * 실행: node serve.js
 * 브라우저에서 http://localhost:8080 으로 접속하세요.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(ROOT, urlPath.split('?')[0]);

  // 디렉토리 접근 차단 (보안)
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${urlPath}`);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  AudioAI 서버 시작됨');
  console.log('  ─────────────────────────────');
  console.log(`  브라우저 주소창에 입력하세요:`);
  console.log(`  ${url}`);
  console.log('  ─────────────────────────────');
  console.log('  종료: Ctrl + C');
  console.log('');

  // Windows 자동 브라우저 열기
  const { exec } = require('child_process');
  exec(`start ${url}`, err => {
    if (err) console.log(`  (브라우저를 수동으로 열어주세요: ${url})`);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`  오류: 포트 ${PORT}가 이미 사용 중입니다.`);
    console.error(`  다른 터미널에서 실행 중인 서버를 먼저 종료하세요.`);
  } else {
    console.error('  서버 오류:', err.message);
  }
  process.exit(1);
});
