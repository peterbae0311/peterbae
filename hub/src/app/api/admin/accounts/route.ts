import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { APPS, SUPER_ADMIN_EMAIL } from '@/lib/apps';

/**
 * 최고관리자 전용 — "시스템 접속 가능 계정 관리" 탭의 데이터 소스.
 * 계정(성명/이메일/비고)은 auth.users의 user_metadata에 저장하고,
 * 접근 가능 모노레포는 기존 app_access 테이블을 그대로 재사용한다
 * (별도 계정 테이블을 만들지 않아 두 소스 간 동기화 문제가 없음).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) return null;
  return user;
}

function validAppKeys(appKeys: unknown): string[] {
  if (!Array.isArray(appKeys)) return [];
  const known = new Set(APPS.map(a => a.key));
  return appKeys.filter((k): k is string => typeof k === 'string' && known.has(k));
}

export async function GET() {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const { data: accessRows, error: accessError } = await admin.from('app_access').select('email, app_key');
  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  const appKeysByEmail = new Map<string, string[]>();
  (accessRows ?? []).forEach(row => {
    const list = appKeysByEmail.get(row.email) ?? [];
    list.push(row.app_key);
    appKeysByEmail.set(row.email, list);
  });

  const accounts = usersData.users
    .filter(u => u.email && u.email !== SUPER_ADMIN_EMAIL)
    .map(u => ({
      id: u.id,
      email: u.email as string,
      name: typeof u.user_metadata?.name === 'string' ? u.user_metadata.name : '',
      note: typeof u.user_metadata?.note === 'string' ? u.user_metadata.note : '',
      createdAt: u.created_at,
      appKeys: appKeysByEmail.get(u.email as string) ?? [],
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const appKeys = validAppKeys(body?.appKeys);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: '유효한 이메일이 필요합니다.' }, { status: 400 });
  }
  if (email === SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '최고관리자 계정은 별도로 관리할 수 없습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: name || null, note: note || null },
  });
  if (createError) {
    const status = createError.code === 'email_exists' ? 409 : 500;
    return NextResponse.json({ error: createError.message }, { status });
  }

  if (appKeys.length > 0) {
    const { error: accessError } = await admin
      .from('app_access')
      .upsert(appKeys.map(app_key => ({ email, app_key })), { onConflict: 'email,app_key' });
    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const appKeys = validAppKeys(body?.appKeys);

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: '유효한 이메일이 필요합니다.' }, { status: 400 });
  }
  if (email === SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '최고관리자 계정은 별도로 관리할 수 없습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: getError } = await admin.auth.admin.getUserById(id);
  if (getError || !existing?.user) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });
  }
  const oldEmail = existing.user.email ?? null;

  const { error: updateError } = await admin.auth.admin.updateUserById(id, {
    email,
    email_confirm: true,
    user_metadata: { name: name || null, note: note || null },
  });
  if (updateError) {
    const status = updateError.code === 'email_exists' ? 409 : 500;
    return NextResponse.json({ error: updateError.message }, { status });
  }

  // 이메일이 바뀌었으면 app_access의 기존 행도 새 이메일로 이전.
  if (oldEmail && oldEmail !== email) {
    await admin.from('app_access').update({ email }).eq('email', oldEmail);
  }

  // 접근권한 재설정 — 전체 삭제 후 다시 삽입(간단하고 확실함).
  await admin.from('app_access').delete().eq('email', email);
  if (appKeys.length > 0) {
    const { error: accessError } = await admin
      .from('app_access')
      .insert(appKeys.map(app_key => ({ email, app_key })));
    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.getUserById(id);
  const email = existing?.user?.email ?? null;

  if (email === SUPER_ADMIN_EMAIL) {
    return NextResponse.json({ error: '최고관리자 계정은 삭제할 수 없습니다.' }, { status: 400 });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // 계정 자체를 지웠으니 부여된 모노레포 접근권한도 전부 정리.
  if (email) {
    await admin.from('app_access').delete().eq('email', email);
  }

  return NextResponse.json({ ok: true });
}
