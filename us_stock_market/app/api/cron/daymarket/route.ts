/**
 * Cron: Day Market close alert
 * Schedule (UTC): 5 8 * * 1-5  →  EDT 04:05 / EST 03:05
 *
 * Fires after Day Market (pre-open extended session) closes.
 */

import { NextResponse } from 'next/server';
import { handleCronSession } from '@/lib/marketUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await handleCronSession(request, 'daymarket');

  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
