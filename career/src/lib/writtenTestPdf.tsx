import { Document, Page, View, Text, Font, StyleSheet } from '@react-pdf/renderer';
import type { WrittenTestCategory, WrittenTestQuestion } from './supabase';

Font.register({
  family: 'Pretendard',
  fonts: [
    { src: '/career/fonts/Pretendard-Regular.ttf', fontWeight: 'normal' },
    { src: '/career/fonts/Pretendard-Bold.ttf', fontWeight: 'bold' },
  ],
});

const styles = StyleSheet.create({
  page: { fontFamily: 'Pretendard', fontSize: 9, padding: 32, color: '#262626' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, borderBottom: '2pt solid #171717', paddingBottom: 8 },
  categoryTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 10, marginTop: 4, color: '#171717' },
  categoryScore: { fontSize: 9, fontWeight: 'normal', color: '#525252' },
  question: { marginBottom: 12 },
  qText: { fontSize: 10, fontWeight: 'bold', marginBottom: 4, lineHeight: 1.4 },
  choice: { fontSize: 9, marginLeft: 12, marginBottom: 2, lineHeight: 1.4 },
  choiceCorrect: { color: '#15803d', fontWeight: 'bold' },
  choiceWrong: { color: '#dc2626', fontWeight: 'bold' },
  meta: { fontSize: 9, marginLeft: 12, marginTop: 2, lineHeight: 1.4 },
  answerLine: { fontSize: 9, marginLeft: 12, marginTop: 2, color: '#404040' },
  explanation: { fontSize: 8.5, marginLeft: 12, marginTop: 2, color: '#737373', lineHeight: 1.4 },
  correctMark: { color: '#15803d', fontWeight: 'bold' },
  wrongMark: { color: '#dc2626', fontWeight: 'bold' },
});

const CIRCLED = ['①', '②', '③', '④', '⑤'];
const TYPE_LABEL: Record<WrittenTestQuestion['type'], string> = {
  choice4: '4지선다', choice5: '5지선다', short: '단답형',
};

export function WrittenTestPdfDocument({
  companyName, categories, questionsByCat, answers, graded,
}: {
  companyName: string;
  categories: WrittenTestCategory[];
  questionsByCat: Record<string, WrittenTestQuestion[]>;
  answers: Record<string, string>;
  graded: boolean;
}) {
  const cats = categories.filter(c => (questionsByCat[c.id]?.length ?? 0) > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{companyName || '필기 예상 문제'}</Text>

        {cats.map(cat => {
          const qs = questionsByCat[cat.id] ?? [];
          const correctCount = graded
            ? qs.filter(q => isCorrectAnswer(q, answers[q.id])).length
            : 0;

          return (
            <View key={cat.id} wrap>
              <Text style={styles.categoryTitle}>
                {cat.name}
                {graded && <Text style={styles.categoryScore}>  ({correctCount} / {qs.length} 정답)</Text>}
              </Text>

              {qs.map((q, i) => {
                const userAnswer = answers[q.id];
                const correct = graded ? isCorrectAnswer(q, userAnswer) : null;

                return (
                  <View key={q.id} style={styles.question} wrap={false}>
                    <Text style={styles.qText}>
                      {i + 1}. [{TYPE_LABEL[q.type]}] {q.question}
                      {graded && (correct ? <Text style={styles.correctMark}>  ✓</Text> : <Text style={styles.wrongMark}>  ✗</Text>)}
                    </Text>

                    {q.choices?.map((c, ci) => (
                      <Text
                        key={ci}
                        style={[
                          styles.choice,
                          c === q.answer ? styles.choiceCorrect : {},
                          graded && !correct && c === userAnswer && c !== q.answer ? styles.choiceWrong : {},
                        ]}
                      >
                        {CIRCLED[ci]} {c}
                      </Text>
                    ))}

                    {q.type === 'short' && (
                      <Text style={styles.answerLine}>정답: {q.answer}</Text>
                    )}

                    {graded && (
                      <Text style={styles.answerLine}>
                        내 답변: {userAnswer || '(미응답)'}
                      </Text>
                    )}

                    {q.explanation && (
                      <Text style={styles.explanation}>해설: {q.explanation}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

export function isCorrectAnswer(q: WrittenTestQuestion, userAnswer: string | undefined): boolean {
  if (!userAnswer) return false;
  if (q.type === 'short') return normalize(userAnswer) === normalize(q.answer);
  return userAnswer === q.answer;
}
