/**
 * Cron: After-Market close alert
 * Schedule (UTC): 5 0 * * 2-6  →  EDT 20:05 (prev day) / EST 19:05
 *
 * Fires 5 minutes after After-Hours closes (20:00 EDT).
 * Note: runs Tuesday–Saturday UTC to cover Monday–Friday EDT.
 */

import { NextResponse } from 'next/server';
import { handleCronSession } from '@/lib/marketUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await handleCronSession(request, 'aftermarket');

  const status = result.success ? 200 : 500;
  return NextResponse.json(result, { status });
}
