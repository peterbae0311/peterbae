/**
 * Cron: Pre-Market close alert
 * Schedule (UTC): 35 13 * * 1-5  →  EDT 09:35 / EST 08:35
 *
 * Fires right after Pre-Market closes (09:30 EDT) and Regular opens.
 */

import { NextResponse } from 'next/server';
import { handleCronSession } from '@/lib/marketUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await handleCronSession(request, 'premarket');

  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
