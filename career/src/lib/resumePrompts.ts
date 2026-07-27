// {{context}} 는 서버에서 기본정보/경력/프로젝트/학력/스킬 요약으로 치환됩니다.

export const DEFAULT_SELF_INTRO_PROMPT = `다음 정보를 바탕으로 채용 담당자에게 어필할 수 있는 자기소개서를 작성하세요.

## 입력 데이터
{{context}}

## 작성 조건
- 총 50줄 내외의 분량으로 작성합니다.
- 지원자의 성장 과정, 강점, 직무 역량, 프로젝트 경험, 입사 후 포부가 자연스럽게 드러나도록 구성합니다.
- 과장이나 추상적인 표현 대신 입력된 경력·프로젝트·학력·스킬 정보에 기반한 구체적인 사례를 활용합니다.
- 오직 한국어로 작성하고, 자기소개서 본문 텍스트만 출력합니다 (제목·설명·머리말 없이).`;

export const DEFAULT_COMPETENCY_PROMPT = `다음 정보를 바탕으로 지원자의 핵심역량을 도출하세요.

## 입력 데이터
{{context}}

## 작성 조건
- 경력·프로젝트·학력·스킬 정보에 근거하여 실제로 뒷받침되는 핵심역량만 도출합니다.
- 역량은 3~6개 정도로, 서로 중복되지 않게 구성합니다.
- 각 역량 설명은 2~3문장으로, 구체적인 경험이나 기술을 근거로 작성합니다.
- 오직 한국어로만 작성합니다.

## 출력 형식 (JSON 배열만, 마크다운·코드블록·설명 없이)
[
  { "title": "역량명", "description": "역량에 대한 구체적인 설명 (2~3문장)" }
]`;

interface ResumeContextInput {
  profile?: { name?: string | null; career_type?: string | null; desired_job?: string | null } | null;
  educations?: { school_type?: string | null; school_name: string; department?: string | null; major?: string | null; status?: string | null }[];
  careers?: { company_name: string; department?: string | null; position?: string | null; start_date?: string | null; end_date?: string | null; responsibilities?: string | null }[];
  projects?: { project_name: string; start_date?: string | null; end_date?: string | null; description?: string | null; role?: string | null; client_name?: string | null }[];
  skills?: { skill_name: string }[];
}

export function buildResumeContext(input: ResumeContextInput): string {
  const parts: string[] = [];

  if (input.profile?.name || input.profile?.career_type || input.profile?.desired_job) {
    const lines: string[] = [];
    if (input.profile.name)        lines.push(`이름: ${input.profile.name}`);
    if (input.profile.career_type) lines.push(`구분: ${input.profile.career_type}`);
    if (input.profile.desired_job) lines.push(`희망 직무: ${input.profile.desired_job}`);
    parts.push(`## 기본정보\n${lines.join('\n')}`);
  }

  if (input.careers?.length) {
    parts.push(`## 경력\n${input.careers.map(c =>
      `- ${c.company_name}${c.position ? ` (${c.position})` : ''}${c.department ? ` / ${c.department}` : ''} [${c.start_date ?? '?'} ~ ${c.end_date ?? '현재'}]${c.responsibilities ? `\n  담당업무: ${c.responsibilities}` : ''}`
    ).join('\n')}`);
  }

  if (input.projects?.length) {
    parts.push(`## 프로젝트 이력\n${input.projects.map(p =>
      `- ${p.project_name} [${p.start_date ?? '?'} ~ ${p.end_date ?? '?'}]${p.role ? ` / 담당: ${p.role}` : ''}${p.client_name ? ` / 발주처: ${p.client_name}` : ''}${p.description ? `\n  설명: ${p.description}` : ''}`
    ).join('\n')}`);
  }

  if (input.educations?.length) {
    parts.push(`## 학력\n${input.educations.map(e =>
      `- ${[e.school_type, e.school_name, e.department, e.major ? `(${e.major})` : null, e.status].filter(Boolean).join(' ')}`
    ).join('\n')}`);
  }

  if (input.skills?.length) {
    parts.push(`## 스킬\n${input.skills.map(s => s.skill_name).join(', ')}`);
  }

  return parts.join('\n\n');
}
