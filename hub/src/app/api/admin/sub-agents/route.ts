import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { SUPER_ADMIN_EMAIL } from '@/lib/apps';

/**
 * 최고관리자 전용 — Admin "Sub Agents" 탭의 데이터 소스(public.sub_agents).
 * accounts 라우트와 동일 패턴: 조회/쓰기 전부 서비스롤로 처리하고 RLS는 활성화만 해둔다.
 */

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== SUPER_ADMIN_EMAIL) return null;
  return user;
}

interface SubAgentInput {
  sortOrder: number;
  nameEn: string;
  nameKo: string;
  color: string;
  coreResponsibility: string;
  keyDeliverables: string;
  priorityNote: string;
}

function parseInput(body: unknown): { input?: SubAgentInput; error?: string } {
  const b = body as Record<string, unknown> | null;
  const nameEn = typeof b?.nameEn === 'string' ? b.nameEn.trim() : '';
  const nameKo = typeof b?.nameKo === 'string' ? b.nameKo.trim() : '';
  const sortOrder = Number(b?.sortOrder);

  if (!nameEn) return { error: '에이전트(EN)를 입력해주세요.' };
  if (!nameKo) return { error: '에이전트(KO)를 입력해주세요.' };
  if (!Number.isInteger(sortOrder)) return { error: 'No.는 정수로 입력해주세요.' };

  return {
    input: {
      sortOrder,
      nameEn,
      nameKo,
      color: typeof b?.color === 'string' ? b.color.trim() : '',
      coreResponsibility: typeof b?.coreResponsibility === 'string' ? b.coreResponsibility.trim() : '',
      keyDeliverables: typeof b?.keyDeliverables === 'string' ? b.keyDeliverables.trim() : '',
      priorityNote: typeof b?.priorityNote === 'string' ? b.priorityNote.trim() : '',
    },
  };
}

export async function GET() {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sub_agents')
    .select('id, sort_order, name_en, name_ko, color, core_responsibility, key_deliverables, priority_note')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const agents = (data ?? []).map(row => ({
    id: row.id as string,
    sortOrder: row.sort_order as number,
    nameEn: row.name_en as string,
    nameKo: row.name_ko as string,
    color: (row.color as string | null) ?? '',
    coreResponsibility: (row.core_responsibility as string | null) ?? '',
    keyDeliverables: (row.key_deliverables as string | null) ?? '',
    priorityNote: (row.priority_note as string | null) ?? '',
  }));

  return NextResponse.json({ agents });
}

export async function POST(request: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const { input, error } = parseInput(body);
  if (!input) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error: insertError } = await admin
    .from('sub_agents')
    .insert({
      sort_order: input.sortOrder,
      name_en: input.nameEn,
      name_ko: input.nameKo,
      color: input.color || null,
      core_responsibility: input.coreResponsibility || null,
      key_deliverables: input.keyDeliverables || null,
      priority_note: input.priorityNote || null,
    })
    .select('id')
    .single();

  if (insertError) {
    const status = insertError.code === '23505' ? 409 : 500;
    const message = insertError.code === '23505' ? '이미 등록된 에이전트(EN)입니다.' : insertError.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof (body as Record<string, unknown> | null)?.id === 'string' ? (body as Record<string, string>).id : '';
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const { input, error } = parseInput(body);
  if (!input) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('sub_agents')
    .update({
      sort_order: input.sortOrder,
      name_en: input.nameEn,
      name_ko: input.nameKo,
      color: input.color || null,
      core_responsibility: input.coreResponsibility || null,
      key_deliverables: input.keyDeliverables || null,
      priority_note: input.priorityNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    const status = updateError.code === '23505' ? 409 : 500;
    const message = updateError.code === '23505' ? '이미 등록된 에이전트(EN)입니다.' : updateError.message;
    return NextResponse.json({ error: message }, { status });
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
  const { error } = await admin.from('sub_agents').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
