/**
 * Cron: Regular Market close alert
 * Schedule (UTC): 5 20 * * 1-5  →  EDT 16:05 / EST 15:05
 *
 * Fires 5 minutes after Regular Market closes (16:00 EDT).
 */

import { NextResponse } from 'next/server';
import { handleCronSession } from '@/lib/marketUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await handleCronSession(request, 'regular');

  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
