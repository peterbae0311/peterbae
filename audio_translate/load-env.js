/**
 * load-env.js
 * Node.js로 실행: node load-env.js
 * .env 파일의 키를 읽어 LocalStorage 초기화 스크립트를 출력합니다.
 * 브라우저 콘솔에서 붙여 넣어 한 번만 실행하면 됩니다.
 */
const fs   = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('.env 파일을 찾을 수 없습니다.');
  process.exit(1);
}

const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env   = {};
for (const line of lines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const orKey     = env['OPENROUTER_API_KEY'] || '';
const groqKey   = env['GROQ_API_KEY']       || '';
const hfKey     = env['HF_TOKEN']           || '';
const gladiaKey = env['GLADIA_API_KEY']     || '';

if (!orKey && !groqKey && !hfKey && !gladiaKey) {
  console.error('.env 에서 API 키를 찾을 수 없습니다.');
  process.exit(1);
}

console.log('\n다음 코드를 브라우저 개발자 도구 콘솔(F12)에 붙여 넣으세요:\n');
console.log('────────────────────────────────────────');
if (orKey)     console.log(`localStorage.setItem('OR_KEY',     '${orKey}');`);
if (groqKey)   console.log(`localStorage.setItem('GROQ_KEY',   '${groqKey}');`);
if (gladiaKey) console.log(`localStorage.setItem('GLADIA_KEY', '${gladiaKey}');`);
if (hfKey)     console.log(`localStorage.setItem('HF_KEY',     '${hfKey}');`);
console.log('────────────────────────────────────────');
console.log('\n완료 후 페이지를 새로고침(F5) 하세요.\n');
