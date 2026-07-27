/**
 * Telegram Bot API client
 * Sends formatted market alert messages.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;

function getCredentials(): { token: string; chatId: string } {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set. Add it to your .env file.');
  }
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID is not set. Add it to your .env file.');
  }

  return { token, chatId };
}

export interface TelegramSendResult {
  ok: boolean;
  message_id: number | null;
  error?: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

/**
 * Sends a single message chunk via Telegram Bot API.
 * Uses Markdown parse mode.
 */
async function sendChunk(
  token: string,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });

  const body = (await res.json()) as TelegramApiResponse;

  if (!body.ok) {
    return {
      ok: false,
      message_id: null,
      error: body.description ?? 'Unknown Telegram error',
    };
  }

  return {
    ok: true,
    message_id: body.result?.message_id ?? null,
  };
}

/**
 * Splits a long message into chunks of MAX_MESSAGE_LENGTH characters,
 * preserving line boundaries where possible.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    const addition = current ? '\n' + line : line;

    if ((current + addition).length > MAX_MESSAGE_LENGTH) {
      if (current) chunks.push(current);
      // If a single line itself exceeds limit, hard-cut it
      if (line.length > MAX_MESSAGE_LENGTH) {
        let remaining = line;
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, MAX_MESSAGE_LENGTH));
          remaining = remaining.slice(MAX_MESSAGE_LENGTH);
        }
        current = '';
      } else {
        current = line;
      }
    } else {
      current += addition;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Sends a PNG image buffer via Telegram Bot API sendPhoto endpoint.
 * Returns the message_id of the sent photo message.
 */
export async function sendTelegramPhoto(
  imageBuffer: Buffer,
  caption?: string,
): Promise<TelegramSendResult> {
  const { token, chatId } = getCredentials();
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendPhoto`;

  // Build a multipart/form-data body using FormData
  const formData = new FormData();
  formData.append('chat_id', chatId);
  // Buffer → ArrayBuffer 변환 (TypeScript strict 환경에서 Blob 생성 시 타입 호환)
  const arrayBuffer = imageBuffer.buffer.slice(
    imageBuffer.byteOffset,
    imageBuffer.byteOffset + imageBuffer.byteLength,
  ) as ArrayBuffer;
  formData.append(
    'photo',
    new Blob([arrayBuffer], { type: 'image/png' }),
    'dashboard.png',
  );
  if (caption) {
    formData.append('caption', caption.slice(0, 1024)); // Telegram caption limit
    formData.append('parse_mode', 'Markdown');
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const body = (await res.json()) as TelegramApiResponse;

    if (!body.ok) {
      return {
        ok: false,
        message_id: null,
        error: body.description ?? 'Unknown Telegram sendPhoto error',
      };
    }

    return {
      ok: true,
      message_id: body.result?.message_id ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message_id: null, error: `sendPhoto fetch failed: ${msg}` };
  }
}

/**
 * Sends a Telegram message, automatically splitting if over 4096 chars.
 * Returns the message_id of the first sent chunk.
 */
export async function sendTelegramMessage(
  text: string,
): Promise<TelegramSendResult> {
  const { token, chatId } = getCredentials();
  const chunks = splitMessage(text);

  let firstMessageId: number | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const result = await sendChunk(token, chatId, chunks[i]);

    if (!result.ok) {
      return {
        ok: false,
        message_id: firstMessageId,
        error: `Failed on chunk ${i + 1}/${chunks.length}: ${result.error}`,
      };
    }

    if (i === 0) firstMessageId = result.message_id;
  }

  return { ok: true, message_id: firstMessageId };
}

// ── Message formatter ─────────────────────────────────────────────────────────

import type { SectorWithStocks } from './fmp';

const SECTOR_NAME_KR: Record<string, string> = {
  Technology: '기술',
  'Healthcare': '헬스케어',
  'Financial Services': '금융',
  'Consumer Cyclical': '소비재(경기)',
  'Consumer Defensive': '소비재(필수)',
  'Communication Services': '통신',
  Energy: '에너지',
  Utilities: '유틸리티',
  'Real Estate': '부동산',
  'Basic Materials': '소재',
  Industrials: '산업재',
};

function sectorLabel(name: string): string {
  const kr = SECTOR_NAME_KR[name];
  return kr ? `${kr} (${name})` : name;
}

function formatSign(value: number, decimals = 2): string {
  return value >= 0 ? `+${value.toFixed(decimals)}` : value.toFixed(decimals);
}

/**
 * Builds the Telegram message string from sector + stock data.
 * 정규장 마감 전용: 전체 섹터 + 섹터별 상위 5개 종목, 원화 종가 표시.
 */
export function buildMarketMessage(
  tradeDateLabel: string,
  sectors: SectorWithStocks[],
  kstTimeLabel: string,
  exchangeRate?: number,
): string {
  const rate = exchangeRate ?? 1380;

  let msg = `🔔 미국 정규장 마감 | ${tradeDateLabel}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const sector of sectors) {
    const arrow = sector.changePct >= 0 ? '📈' : '📉';
    msg += `*${sectorLabel(sector.sectorName)}*  ${formatSign(sector.changePct)}% ${arrow}\n`;

    const top5 = sector.stocks.slice(0, 5);
    for (const stock of top5) {
      const krw = Math.round(stock.closePrice * rate).toLocaleString('ko-KR');
      msg += `  ㄴ \`${stock.ticker}\`  ${formatSign(stock.changePct)}%  ₩${krw}\n`;
    }
    msg += '\n';
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚡ ${kstTimeLabel}`;

  return msg;
}
