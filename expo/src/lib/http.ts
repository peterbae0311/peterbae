const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 2000;

/**
 * api.kcisa.kr 등 일부 정부 API가 간헐적으로 커넥션 자체를 끊어(Node fetch가 응답 없이
 * "fetch failed" 예외만 던짐) 첫 페이지 요청 단계에서 전체 동기화가 실패하는 경우가 있다.
 * 응답을 받은 뒤의 HTTP 에러(4xx/5xx)는 호출부에서 별도 처리하므로, 여기서는 fetch() 자체가
 * 던지는 네트워크 레벨 예외만 지수 백오프로 재시도한다.
 */
export async function fetchWithRetry(url: string, retries = DEFAULT_RETRIES, delayMs = DEFAULT_DELAY_MS): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}
