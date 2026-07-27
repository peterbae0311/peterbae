import { syncSource } from '../pipeline/syncSource.js';
import { listAdapterCodes } from '../adapters/registry.js';

async function main() {
  const arg = process.argv[2];
  const implemented = listAdapterCodes();

  if (!arg) {
    console.error(`사용법: npm run sync -- <source_code|all>\n구현된 소스: ${implemented.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const codes = arg === 'all' ? implemented : [arg];

  for (const code of codes) {
    console.log(`[${code}] 수집 시작`);
    try {
      const result = await syncSource(code);
      console.log(
        `[${code}] 완료 — status=${result.status}, processed=${result.processed}, failed=${result.failed}` +
          (result.errorMessage ? `, error=${result.errorMessage}` : '')
      );
      if (result.status === 'failed') process.exitCode = 1;
    } catch (err) {
      console.error(`[${code}] 실패:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
}

main();
