import { Document, Page, View, Text, Image, Font, StyleSheet } from '@react-pdf/renderer';
import type { ResumeCareer, ResumeProject, ResumeEducation, ResumeSkill, ResumeCompetency } from './supabase';

Font.register({
  family: 'Pretendard',
  fonts: [
    { src: '/fonts/Pretendard-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Pretendard-Bold.ttf', fontWeight: 'bold' },
  ],
});

function fmtYMD(d: string | null): string {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${y} / ${m} / ${day}`;
}
function fmtYM(d: string | null): string {
  if (!d) return '-';
  const [y, m] = d.split('-');
  return `${y}.${m}`;
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Pretendard', fontSize: 9, padding: 32, color: '#262626' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, borderBottom: '2pt solid #171717', paddingBottom: 8 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 6, color: '#171717' },
  grid2: { flexDirection: 'row', flexWrap: 'wrap' },
  fieldRow: { flexDirection: 'row', width: '50%', marginBottom: 4, paddingRight: 8 },
  fieldLabel: { width: 68, textAlign: 'right', marginRight: 8, color: '#404040', fontWeight: 'bold' },
  fieldValue: { flex: 1, color: '#262626' },
  table: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 2 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  th: { padding: 4, fontSize: 8, fontWeight: 'bold', textAlign: 'center', borderRightWidth: 1, borderRightColor: '#e5e5e5' },
  td: { padding: 4, fontSize: 8, borderRightWidth: 1, borderRightColor: '#f0f0f0' },
  photo: { width: 72, height: 92, objectFit: 'cover', marginRight: 16, borderRadius: 2, borderWidth: 1, borderColor: '#e5e5e5' },
  chip: { fontSize: 8, paddingVertical: 3, paddingHorizontal: 7, backgroundColor: '#f5f5f5', borderRadius: 10, marginRight: 4, marginBottom: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { fontSize: 8, color: '#a3a3a3', textAlign: 'center', padding: 8 },
  bodyText: { fontSize: 9, lineHeight: 1.5 },
  competencyTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 2 },
  competencyBlock: { marginBottom: 8 },
});

interface PdfColumn {
  label: string;
  width: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || '-'}</Text>
    </View>
  );
}

function PdfTable({ columns, rows }: { columns: PdfColumn[]; rows: string[][] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {columns.map((c, i) => (
          <Text key={i} style={[styles.th, { width: c.width }, ...(i === columns.length - 1 ? [{ borderRightWidth: 0 }] : [])]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>등록된 항목이 없습니다</Text>
      ) : (
        rows.map((row, ri) => (
          <View key={ri} style={styles.tableRow} wrap={false}>
            {row.map((cell, ci) => (
              <Text key={ci} style={[styles.td, { width: columns[ci].width }, ...(ci === columns.length - 1 ? [{ borderRightWidth: 0 }] : [])]}>
                {cell || '-'}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

export interface ResumePdfProfile {
  name: string;
  career_type: string;
  birth_date: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  military_service: string;
  photo_url: string;
  self_introduction: string;
  desired_job: string;
  desired_location: string;
  desired_salary: string;
  desired_employment_type: string;
  available_start_date: string;
}

export interface ResumePdfDocumentProps {
  profile: ResumePdfProfile;
  careers: ResumeCareer[];
  projects: ResumeProject[];
  educations: ResumeEducation[];
  skills: ResumeSkill[];
  competencies: ResumeCompetency[];
  years: number;
}

export function ResumePdfDocument({ profile, careers, projects, educations, skills, competencies, years }: ResumePdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>이력서</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>기본정보</Text>
          <View style={{ flexDirection: 'row' }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image는 PDF 렌더링 전용, alt 미지원 */}
            {profile.photo_url && <Image src={profile.photo_url} style={styles.photo} />}
            <View style={[styles.grid2, { flex: 1 }]}>
              <Field label="성명" value={profile.name} />
              <Field label="신입/경력" value={`${profile.career_type}${profile.career_type === '경력' && years > 0 ? ` (${years}년차)` : ''}`} />
              <Field label="생년월일" value={fmtYMD(profile.birth_date)} />
              <Field label="성별" value={profile.gender} />
              <Field label="이메일" value={profile.email} />
              <Field label="휴대전화" value={profile.phone} />
              <Field label="주소" value={profile.address} />
              <Field label="병역" value={profile.military_service} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>회사 경력</Text>
          <PdfTable
            columns={[
              { label: '회사', width: '22%' },
              { label: '입사 년월', width: '12%' },
              { label: '퇴직 년월', width: '12%' },
              { label: '부서', width: '14%' },
              { label: '직급', width: '14%' },
              { label: '담당 직무', width: '26%' },
            ]}
            rows={careers.map(c => [
              c.company_name, fmtYM(c.start_date), c.end_date ? fmtYM(c.end_date) : '현재',
              c.department ?? '', c.position ?? '', c.responsibilities ?? '',
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>프로젝트 이력</Text>
          <PdfTable
            columns={[
              { label: '프로젝트 명', width: '18%' },
              { label: '시작 년월', width: '11%' },
              { label: '종료 년월', width: '11%' },
              { label: '프로젝트 설명', width: '28%' },
              { label: '담당 직무', width: '16%' },
              { label: '발주처', width: '16%' },
            ]}
            rows={projects.map(p => [
              p.project_name, fmtYM(p.start_date), p.end_date ? fmtYM(p.end_date) : '현재',
              p.description ?? '', p.role ?? '', p.client_name ?? '',
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>학력</Text>
          <PdfTable
            columns={[
              { label: '구분', width: '10%' },
              { label: '학교명', width: '20%' },
              { label: '학과', width: '18%' },
              { label: '전공', width: '18%' },
              { label: '입학 년월', width: '12%' },
              { label: '졸업 년월', width: '12%' },
              { label: '졸업 상태', width: '10%' },
            ]}
            rows={educations.map(e => [
              e.school_type ?? '', e.school_name, e.department ?? '', e.major ?? '',
              fmtYM(e.start_date), fmtYM(e.end_date), e.status ?? '',
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>스킬</Text>
          {skills.length === 0 ? (
            <Text style={styles.empty}>등록된 스킬이 없습니다</Text>
          ) : (
            <View style={styles.chipsRow}>
              {skills.map(s => <Text key={s.id} style={styles.chip}>{s.skill_name}</Text>)}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>자기소개서</Text>
          <Text style={styles.bodyText}>{profile.self_introduction || '작성된 자기소개서가 없습니다.'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>핵심역량</Text>
          {competencies.length === 0 ? (
            <Text style={styles.empty}>등록된 핵심역량이 없습니다</Text>
          ) : (
            competencies.map(c => (
              <View key={c.id} style={styles.competencyBlock} wrap={false}>
                <Text style={styles.competencyTitle}>{c.title}</Text>
                <Text style={styles.bodyText}>{c.description}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>희망직무</Text>
          <View style={styles.grid2}>
            <Field label="희망 직무" value={profile.desired_job} />
            <Field label="희망 근무지역" value={profile.desired_location} />
            <Field label="희망 연봉" value={profile.desired_salary} />
            <Field label="희망 고용형태" value={profile.desired_employment_type || '무관'} />
            <Field label="입사 가능일" value={profile.available_start_date} />
          </View>
        </View>
      </Page>
    </Document>
  );
}
