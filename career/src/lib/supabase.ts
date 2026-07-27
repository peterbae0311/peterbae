import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from './env.client';

// 쿠키 기반 세션 저장소 사용 — 미들웨어(서버)와 브라우저가 동일한 세션을 공유하기 위함.
export const supabase = createBrowserClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey);

// ── 타입 정의 ──────────────────────────────────────────────

export type NavTabBuiltinKey = 'resume' | 'coverletter' | 'jobs';

export interface NavTab {
  id: string;
  user_id: string;
  kind: 'builtin' | 'custom';
  builtin_key: NavTabBuiltinKey | null;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CoverLetterRef {
  id: string;
  user_id: string;
  company_name: string;
  recruitment_notice: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoverLetterRefUrl {
  id: string;
  user_id: string;
  ref_id: string;
  title: string;
  url: string;
  sort_order: number;
  created_at: string;
}

export interface CoverLetterQuestion {
  id: string;
  user_id: string;
  ref_id: string;
  question: string;
  char_limit: number | null;
  answer: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── 이력서 ─────────────────────────────────────────────────

export interface ResumeProfile {
  id: string;
  user_id: string;
  name: string | null;
  career_type: string | null;
  birth_date: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  address_detail: string | null;
  military_service: string | null;
  photo_url: string | null;
  photo_filename: string | null;
  photo_size: number | null;
  self_introduction: string | null;
  desired_job: string | null;
  desired_location: string | null;
  desired_salary: string | null;
  desired_employment_type: string | null;
  available_start_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumeEducation {
  id: string;
  user_id: string;
  school_type: string | null;
  school_name: string;
  department: string | null;
  major: string | null;
  degree: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeCareer {
  id: string;
  user_id: string;
  company_name: string;
  department: string | null;
  position: string | null;
  employment_type: string | null;
  is_current: boolean;
  start_date: string | null;
  end_date: string | null;
  responsibilities: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeProject {
  id: string;
  user_id: string;
  project_name: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  role: string | null;
  client_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeSkill {
  id: string;
  user_id: string;
  skill_name: string;
  level: string | null;
  sort_order: number;
  created_at: string;
}

export interface ResumeCompetency {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
