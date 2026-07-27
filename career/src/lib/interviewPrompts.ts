export type Difficulty = 'high' | 'medium' | 'low';

export const DIFF_LABEL: Record<Difficulty, string> = {
  high:   '상(고급) — 심층 직무·기술·전략 질문',
  medium: '중(중급) — 경험·역량·직무이해 질문',
  low:    '하(기초) — 자기소개·지원동기·기본인성 질문',
};

// {{context}}, {{difficulty}} 는 서버에서 실제 값으로 치환됩니다.
export const DEFAULT_INTERVIEW_PROMPT = `다음 정보를 바탕으로 난이도 "{{difficulty}}" 면접 예상 질문 10개를 생성하세요.

## 회사/기관 정보
{{context}}

## 질문 유형 (균형 있게 포함)
자기소개, 지원동기, 인성, 직무, 기술, 상황(Situational), 행동(Behavioral), STAR기반, 문제해결, 리더십, 협업, 갈등해결, 커뮤니케이션, 실패경험, 성과경험, 가치관, 기업이해, 최신산업이슈, 압박면접

## 수행 원칙
- 실제 면접관이 사용할 법한 자연스러운 표현을 사용합니다.
- 추상적이거나 중복되는 질문은 피합니다.
- 입력 정보와 관련성이 높은 질문을 우선합니다.
- 단순 암기형보다 사고력·경험을 평가하는 질문을 우선합니다.
- sample_answer는 반드시 4문장 이상으로 작성하며, STAR 기법(상황·과제·행동·결과)을 자연스럽게 녹여 구체적이고 진정성 있게 작성합니다.

## 출력 형식 (JSON 배열만)
[
  {
    "question": "질문 내용",
    "follow_ups": ["꼬리질문1", "꼬리질문2", "꼬리질문3"],
    "purpose": "이 질문의 목적",
    "competency": "평가 역량",
    "intent": "면접관의 의도",
    "good_points": ["좋은 답변 포인트1", "좋은 답변 포인트2"],
    "avoid": ["피해야 할 답변1"],
    "mistakes": ["자주 하는 실수1"],
    "sample_answer": "모범 답변 예시 (최소 4문장 이상, STAR 기법 포함)"
  }
]`;

export const DEFAULT_INTERVIEW_PROMPTS: Record<Difficulty, string> = {
  high:   DEFAULT_INTERVIEW_PROMPT,
  medium: DEFAULT_INTERVIEW_PROMPT,
  low:    DEFAULT_INTERVIEW_PROMPT,
};

// {{context}}, {{question}} 는 서버에서 실제 값으로 치환됩니다.
export const DEFAULT_REGEN_PROMPT = `다음 면접 질문에 대한 모범 답변을 새롭게 작성해주세요.

## 회사/기관 정보
{{context}}

## 면접 질문
{{question}}

## 작성 조건
- 4~6문장으로 구체적이고 진정성 있게 작성합니다.
- STAR 기법(상황·과제·행동·결과)을 자연스럽게 녹여냅니다.
- 지원자의 강점과 역량이 드러나도록 작성합니다.
- 답변 내용만 출력합니다.`;
