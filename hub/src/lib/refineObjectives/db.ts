/**
 * 학습목표 다듬기의 과정/과목/학습목표 CRUD — Supabase(hub 자체 프로젝트) 테이블 접근.
 * RLS는 로그인 여부만 확인하므로(마이그레이션 참고), 실제 인가는 호출하는 라우트가
 * supabase.auth.getUser()로 먼저 확인한 뒤 이 함수들을 호출해야 한다.
 */
import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface LearningObjective {
  id: string;
  subject_id: string;
  confirmed_text: string;
  refined_text: string | null;
  status: 'confirmed' | 'reviewing';
  sort_order: number;
}

export interface Subject {
  id: string;
  course_id: string;
  name: string;
  sort_order: number;
  objectives: LearningObjective[];
}

export interface Course {
  id: string;
  name: string;
  prompt: string | null;
  sort_order: number;
  subjects: Subject[];
}

const OBJECTIVE_COLUMNS = 'id, subject_id, confirmed_text, refined_text, status, sort_order';

/** 절차1 "학습목표 조회" — 현재 시점 기준 전체 과정>과목>학습목표 트리를 다시 조회한다. */
export async function fetchTree(supabase: SupabaseServerClient): Promise<Course[]> {
  const [coursesRes, subjectsRes, objectivesRes] = await Promise.all([
    supabase.from('refine_objectives_courses').select('id, name, prompt, sort_order').order('sort_order'),
    supabase.from('refine_objectives_subjects').select('id, course_id, name, sort_order').order('sort_order'),
    supabase.from('refine_objectives_learning_objectives').select(OBJECTIVE_COLUMNS).order('sort_order'),
  ]);
  if (coursesRes.error) throw new Error(coursesRes.error.message);
  if (subjectsRes.error) throw new Error(subjectsRes.error.message);
  if (objectivesRes.error) throw new Error(objectivesRes.error.message);

  const objectives = (objectivesRes.data ?? []) as LearningObjective[];
  const subjects = (subjectsRes.data ?? []).map((s) => ({
    ...s,
    objectives: objectives.filter((o) => o.subject_id === s.id),
  }));
  const courses = (coursesRes.data ?? []).map((c) => ({
    ...c,
    subjects: subjects.filter((s) => s.course_id === c.id),
  }));

  return courses;
}

async function nextSortOrder(
  supabase: SupabaseServerClient,
  table: string,
  filterColumn: string | null,
  filterValue: string | null,
): Promise<number> {
  let query = supabase.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1);
  if (filterColumn && filterValue) query = query.eq(filterColumn, filterValue);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1;
}

export async function createCourse(supabase: SupabaseServerClient, name: string) {
  const sort_order = await nextSortOrder(supabase, 'refine_objectives_courses', null, null);
  const { data, error } = await supabase
    .from('refine_objectives_courses')
    .insert({ name, sort_order })
    .select('id, name, prompt, sort_order')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** name/prompt 중 전달된 필드만 갱신한다 — "학습목표 프롬프트" 팝업과 과정명 수정 팝업이 서로 다른 필드만 보낸다. */
export async function updateCourse(
  supabase: SupabaseServerClient,
  id: string,
  fields: { name?: string; prompt?: string | null },
) {
  const { error } = await supabase
    .from('refine_objectives_courses')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCourse(supabase: SupabaseServerClient, id: string) {
  const { error } = await supabase.from('refine_objectives_courses').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createSubject(supabase: SupabaseServerClient, courseId: string, name: string) {
  const sort_order = await nextSortOrder(supabase, 'refine_objectives_subjects', 'course_id', courseId);
  const { data, error } = await supabase
    .from('refine_objectives_subjects')
    .insert({ course_id: courseId, name, sort_order })
    .select('id, course_id, name, sort_order')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSubject(supabase: SupabaseServerClient, id: string, name: string) {
  const { error } = await supabase
    .from('refine_objectives_subjects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSubject(supabase: SupabaseServerClient, id: string) {
  const { error } = await supabase.from('refine_objectives_subjects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createObjective(supabase: SupabaseServerClient, subjectId: string, confirmedText: string) {
  const sort_order = await nextSortOrder(supabase, 'refine_objectives_learning_objectives', 'subject_id', subjectId);
  const { data, error } = await supabase
    .from('refine_objectives_learning_objectives')
    .insert({ subject_id: subjectId, confirmed_text: confirmedText, sort_order })
    .select(OBJECTIVE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as LearningObjective;
}

/** 원문(confirmed_text) 직접 수정 — AI를 거치지 않은 운영자의 즉시 수정용. */
export async function updateObjectiveText(supabase: SupabaseServerClient, id: string, confirmedText: string) {
  const { error } = await supabase
    .from('refine_objectives_learning_objectives')
    .update({ confirmed_text: confirmedText, refined_text: null, status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteObjective(supabase: SupabaseServerClient, id: string) {
  const { error } = await supabase.from('refine_objectives_learning_objectives').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getObjective(supabase: SupabaseServerClient, id: string): Promise<LearningObjective | null> {
  const { data, error } = await supabase
    .from('refine_objectives_learning_objectives')
    .select(OBJECTIVE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LearningObjective | null;
}

/** 절차2 결과 저장 — AI 초안은 refined_text에만 넣고 confirmed_text는 그대로 둔다(검토 전). */
export async function saveRefinedDraft(supabase: SupabaseServerClient, id: string, refinedText: string) {
  const { error } = await supabase
    .from('refine_objectives_learning_objectives')
    .update({ refined_text: refinedText, status: 'reviewing', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** 절차3 '반영' — 검토 확정된 문장으로 confirmed_text를 덮어쓰고 초안은 비운다(이력 미보관, 결정 반영). */
export async function confirmObjective(supabase: SupabaseServerClient, id: string, finalText: string) {
  const { error } = await supabase
    .from('refine_objectives_learning_objectives')
    .update({ confirmed_text: finalText, refined_text: null, status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
