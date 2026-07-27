'use strict';

// ==================== 게임 모드 설정 ====================
const GAME_MODES = {
  full:  { id: 'full',  label: '전체 도전',   icon: '📚', questions: null, timeLimit: null },
  speed: { id: 'speed', label: '스피드 퀴즈', icon: '⚡', questions: 20,   timeLimit: 15   }
};

// ==================== ScoreManager ====================
class ScoreManager {
  static getBase(difficulty) {
    return { easy: 10, medium: 20, hard: 30 }[difficulty] || 10;
  }

  static getTimeBonus(timeSpent, timeLimit) {
    if (!timeLimit) return 0;
    const ratio = timeSpent / timeLimit;
    if (ratio < 0.3) return 5;
    if (ratio < 0.6) return 3;
    if (ratio < 0.8) return 1;
    return 0;
  }

  static getComboBonus(combo) {
    if (combo >= 10) return 10;
    if (combo >= 7)  return 7;
    if (combo >= 5)  return 5;
    if (combo >= 3)  return 3;
    return 0;
  }

  static calculate({ difficulty, timeSpent, timeLimit, combo, hintUsed }) {
    const base   = ScoreManager.getBase(difficulty);
    const time   = ScoreManager.getTimeBonus(timeSpent, timeLimit);
    const noHint = hintUsed ? 0 : 2;
    const cb     = ScoreManager.getComboBonus(combo);
    return { base, time, noHint, combo: cb, total: base + time + noHint + cb };
  }
}

// ==================== 상태 ====================
const state = {
  questions:         [],
  currentIndex:      0,
  score:             0,
  correctCount:      0,
  selectedCategory:  'all',
  selectedMode:      'full',
  answered:          false,
  paused:            false,
  results:           [],
  // 타이머
  timeLeft:          0,
  timerInterval:     null,
  questionStartTime: 0,
  // 콤보
  combo:             0,
  maxCombo:          0,
  // 힌트
  hintsLeft:         3,
  hintUsed:          false,
  eliminatedOptions: [],
  // 통계
  responseTimes:     []
};

// ==================== DOM ====================
const screens = {
  start:  document.getElementById('screen-start'),
  quiz:   document.getElementById('screen-quiz'),
  result: document.getElementById('screen-result')
};

const el = {
  // 시작 화면
  categoryBtns:  document.querySelectorAll('.category-btn'),
  modeBtns:      document.querySelectorAll('.mode-btn'),
  startBtn:      document.getElementById('btn-start'),
  questionCount: document.getElementById('question-count'),
  modeDesc:      document.getElementById('mode-desc'),

  // 퀴즈 – 상단
  categoryBadge:   document.getElementById('category-badge'),
  difficultyBadge: document.getElementById('difficulty-badge'),
  scoreDisplay:    document.getElementById('score-display'),
  timerWrap:       document.getElementById('timer-wrap'),
  timerCircle:     document.getElementById('timer-circle'),
  timerText:       document.getElementById('timer-text'),
  btnPause:        document.getElementById('btn-pause'),

  // 퀴즈 – 진행
  progressBar:    document.getElementById('progress-bar'),
  progressText:   document.getElementById('progress-text'),
  questionNumber: document.getElementById('question-number'),
  questionText:   document.getElementById('question-text'),
  optionBtns:     document.querySelectorAll('.option-btn'),

  // 퀴즈 – 피드백/버튼
  btnHint:             document.getElementById('btn-hint'),
  hintCount:           document.getElementById('hint-count'),
  feedbackBox:         document.getElementById('feedback-box'),
  feedbackIcon:        document.getElementById('feedback-icon'),
  feedbackTitle:       document.getElementById('feedback-title'),
  feedbackPoints:      document.getElementById('feedback-points'),
  feedbackExplanation: document.getElementById('feedback-explanation'),
  nextBtn:             document.getElementById('btn-next'),

  // 퀴즈 – 콤보
  comboFlash: document.getElementById('combo-flash'),

  // 퀴즈 – 사이드패널
  sideMode:     document.getElementById('side-mode'),
  sideScore:    document.getElementById('side-score'),
  sideCombo:    document.getElementById('side-combo'),
  sideCorrect:  document.getElementById('side-correct'),
  sideWrong:    document.getElementById('side-wrong'),
  sideProgress: document.getElementById('side-progress'),
  hintChips:    document.getElementById('hint-chips'),
  miniList:     document.getElementById('mini-list'),

  // 일시정지
  pauseOverlay: document.getElementById('pause-overlay'),
  btnResume:    document.getElementById('btn-resume'),

  // 결과 화면
  resultEmoji:    document.getElementById('result-emoji'),
  resultTitle:    document.getElementById('result-title'),
  resultMessage:  document.getElementById('result-message'),
  finalScore:     document.getElementById('final-score'),
  correctCountEl: document.getElementById('correct-count'),
  totalCountEl:   document.getElementById('total-count'),
  accuracyEl:     document.getElementById('accuracy'),
  avgTimeEl:      document.getElementById('avg-time'),
  maxComboEl:     document.getElementById('max-combo'),
  hintsUsedEl:    document.getElementById('hints-used'),
  longestStreakEl: document.getElementById('longest-streak'),
  catResults:     document.getElementById('cat-results'),
  resultList:     document.getElementById('result-list'),
  restartBtn:     document.getElementById('btn-restart'),
  homeBtn:        document.getElementById('btn-home')
};

// ==================== 타이머 상수 ====================
const TIMER_R             = 36;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_R; // ≈ 226.2

// ==================== 화면 전환 ====================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ==================== 게임 초기화 ====================
function initGame() {
  const mode = GAME_MODES[state.selectedMode];

  let pool = state.selectedCategory === 'all'
    ? getAllQuestions()
    : getQuestionsByCategory(state.selectedCategory);
  pool = shuffleArray(pool);

  if (mode.questions && pool.length > mode.questions) {
    pool = pool.slice(0, mode.questions);
  }

  Object.assign(state, {
    questions:         pool,
    currentIndex:      0,
    score:             0,
    correctCount:      0,
    answered:          false,
    paused:            false,
    results:           [],
    combo:             0,
    maxCombo:          0,
    hintsLeft:         3,
    hintUsed:          false,
    eliminatedOptions: [],
    responseTimes:     []
  });

  el.sideMode.textContent    = `${mode.icon} ${mode.label}`;
  el.sideScore.textContent   = 0;
  el.sideCombo.textContent   = 0;
  el.sideCorrect.textContent = 0;
  el.sideWrong.textContent   = 0;

  updateHintChips();
  buildMiniList();
  showScreen('quiz');
  loadQuestion();
}

// ==================== 타이머 ====================
function startTimer() {
  const mode = GAME_MODES[state.selectedMode];
  clearInterval(state.timerInterval);
  state.questionStartTime = Date.now();

  if (!mode.timeLimit) {
    // 일반 모드 — 경과 시간 카운트업
    el.timerWrap.dataset.state = 'normal';
    el.timerText.textContent   = '0';
    setTimerArc(1);

    state.timerInterval = setInterval(() => {
      if (state.answered || state.paused) return;
      const elapsed = Math.floor((Date.now() - state.questionStartTime) / 1000);
      el.timerText.textContent = elapsed;
      // 30초 주기로 아크를 반복 시각화
      setTimerArc(1 - (elapsed % 30) / 30);
    }, 500);
    return;
  }

  // 스피드 모드 — 카운트다운
  state.timeLeft = mode.timeLimit;
  el.timerWrap.dataset.state = 'normal';
  el.timerText.textContent   = state.timeLeft;
  setTimerArc(1);

  state.timerInterval = setInterval(() => {
    if (state.paused || state.answered) return;
    const elapsed = Math.floor((Date.now() - state.questionStartTime) / 1000);
    state.timeLeft = Math.max(0, mode.timeLimit - elapsed);
    el.timerText.textContent = state.timeLeft;
    const ratio = state.timeLeft / mode.timeLimit;
    setTimerArc(ratio);

    if      (ratio <= 0.2) el.timerWrap.dataset.state = 'danger';
    else if (ratio <= 0.5) el.timerWrap.dataset.state = 'warn';
    else                   el.timerWrap.dataset.state = 'normal';

    if (state.timeLeft === 0) {
      clearInterval(state.timerInterval);
      handleTimeOut();
    }
  }, 200);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

function setTimerArc(ratio) {
  const offset = TIMER_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, ratio)));
  el.timerCircle.style.strokeDashoffset = offset;
}

function getTimeSpent() {
  return (Date.now() - state.questionStartTime) / 1000;
}

function handleTimeOut() {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.currentIndex];
  state.combo = 0;
  el.sideCombo.textContent = 0;

  state.results.push({
    question: q.question, selected: -1, correct: q.correctAnswer,
    isCorrect: false, category: q.category, difficulty: q.difficulty,
    timeSpent: GAME_MODES[state.selectedMode].timeLimit,
    hintUsed: state.hintUsed, points: 0, breakdown: null, timedOut: true
  });

  el.sideWrong.textContent = state.results.filter(r => !r.isCorrect).length;
  updateMiniDot(state.currentIndex, false);

  el.optionBtns.forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.add(i === q.correctAnswer ? 'correct' : 'dimmed');
  });

  el.feedbackBox.className    = 'feedback-box wrong';
  el.feedbackIcon.textContent = '⏰';
  el.feedbackTitle.textContent = '시간 초과!';
  el.feedbackPoints.textContent = '';
  el.feedbackExplanation.textContent = q.explanation;
  el.nextBtn.classList.remove('hidden');
  el.btnHint.disabled = true;
}

// ==================== 미니 목록 ====================
function buildMiniList() {
  el.miniList.innerHTML = '';
  state.questions.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'mini-dot pending';
    dot.id        = `dot-${i}`;
    el.miniList.appendChild(dot);
  });
}

function updateMiniDot(index, isCorrect) {
  const dot = document.getElementById(`dot-${index}`);
  if (dot) dot.className = `mini-dot ${isCorrect ? 'correct' : 'wrong'}`;
}

// ==================== 힌트 ====================
function updateHintChips() {
  el.hintChips.innerHTML = Array.from({ length: 3 }, (_, i) =>
    `<span class="hint-chip ${i < state.hintsLeft ? 'active' : 'used'}">💡</span>`
  ).join('');
  el.hintCount.textContent = state.hintsLeft;
  el.btnHint.disabled = state.hintsLeft <= 0 || state.hintUsed || state.answered;
}

function useHint() {
  if (state.hintsLeft <= 0 || state.hintUsed || state.answered) return;

  const q = state.questions[state.currentIndex];
  const wrongs = [0, 1, 2, 3].filter(
    i => i !== q.correctAnswer && !state.eliminatedOptions.includes(i)
  );
  const toElim = shuffleArray(wrongs).slice(0, 2);

  state.eliminatedOptions = [...state.eliminatedOptions, ...toElim];
  state.hintUsed  = true;
  state.hintsLeft--;

  toElim.forEach(i => {
    el.optionBtns[i].classList.add('eliminated');
    el.optionBtns[i].disabled = true;
  });

  updateHintChips();
}

// ==================== 일시정지 ====================
function togglePause() {
  state.paused = !state.paused;
  el.pauseOverlay.classList.toggle('hidden', !state.paused);
  el.btnPause.textContent = state.paused ? '▶' : '⏸';
}

// ==================== 문제 로드 ====================
function loadQuestion() {
  const q     = state.questions[state.currentIndex];
  const total = state.questions.length;
  const curr  = state.currentIndex + 1;
  const pct   = (state.currentIndex / total) * 100;

  el.categoryBadge.textContent   = q.category;
  el.difficultyBadge.textContent = difficultyLabel(q.difficulty);
  el.difficultyBadge.className   = `badge difficulty-${q.difficulty}`;

  el.progressBar.style.width    = `${pct}%`;
  el.progressText.textContent   = `${curr} / ${total}`;
  el.questionNumber.textContent = `Q${curr}`;
  el.sideProgress.textContent   = `${state.currentIndex} / ${total}`;

  document.querySelectorAll('.mini-dot').forEach((d, i) => {
    d.classList.toggle('current', i === state.currentIndex);
  });

  el.questionText.textContent = q.question;

  state.eliminatedOptions = [];
  state.hintUsed          = false;
  el.optionBtns.forEach((btn, i) => {
    btn.textContent = q.options[i];
    btn.className   = 'option-btn';
    btn.disabled    = false;
  });

  el.feedbackBox.className = 'feedback-box hidden';
  el.nextBtn.classList.add('hidden');
  el.scoreDisplay.textContent = `${state.score}점`;

  updateHintChips();
  state.answered = false;
  startTimer();
}

// ==================== 답변 처리 ====================
function handleAnswer(selectedIndex) {
  if (state.answered || state.paused) return;
  state.answered = true;
  stopTimer();

  const q         = state.questions[state.currentIndex];
  const isCorrect = selectedIndex === q.correctAnswer;
  const timeSpent = getTimeSpent();
  const timeLimit = GAME_MODES[state.selectedMode].timeLimit;

  if (isCorrect) {
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  } else {
    state.combo = 0;
  }

  const breakdown = isCorrect
    ? ScoreManager.calculate({
        difficulty: q.difficulty, timeSpent, timeLimit,
        combo: state.combo, hintUsed: state.hintUsed
      })
    : null;

  const points = breakdown ? breakdown.total : 0;
  if (isCorrect) { state.score += points; state.correctCount++; }

  state.responseTimes.push(timeSpent);
  state.results.push({
    question: q.question, selected: selectedIndex, correct: q.correctAnswer,
    isCorrect, category: q.category, difficulty: q.difficulty,
    timeSpent, hintUsed: state.hintUsed, points, breakdown, timedOut: false
  });

  // 사이드 갱신
  el.sideScore.textContent   = state.score;
  el.sideCombo.textContent   = state.combo;
  el.sideCorrect.textContent = state.correctCount;
  el.sideWrong.textContent   = state.results.filter(r => !r.isCorrect).length;

  updateMiniDot(state.currentIndex, isCorrect);

  el.optionBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correctAnswer)                              btn.classList.add('correct');
    else if (i === selectedIndex && !isCorrect)             btn.classList.add('wrong');
    else if (!btn.classList.contains('eliminated'))        btn.classList.add('dimmed');
  });

  if (isCorrect && state.combo >= 3) showComboFlash(state.combo);
  showFeedback(isCorrect, q.explanation, breakdown);
  el.btnHint.disabled = true;
  el.scoreDisplay.textContent = `${state.score}점`;
}

// ==================== 피드백 ====================
function showFeedback(isCorrect, explanation, breakdown) {
  el.feedbackBox.className    = `feedback-box ${isCorrect ? 'correct' : 'wrong'}`;
  el.feedbackIcon.textContent = isCorrect ? '✓' : '✗';
  el.feedbackTitle.textContent = isCorrect ? '정답!' : '오답';

  if (isCorrect && breakdown) {
    const parts = [`기본 +${breakdown.base}`];
    if (breakdown.time   > 0) parts.push(`⚡ 시간 +${breakdown.time}`);
    if (breakdown.noHint > 0) parts.push(`💡 노힌트 +${breakdown.noHint}`);
    if (breakdown.combo  > 0) parts.push(`🔥 콤보 +${breakdown.combo}`);
    el.feedbackPoints.textContent = `${parts.join('  |  ')}  =  +${breakdown.total}점`;
  } else {
    el.feedbackPoints.textContent = '';
  }

  el.feedbackExplanation.textContent = explanation;
  el.nextBtn.classList.remove('hidden');
}

// ==================== 콤보 플래시 ====================
function showComboFlash(combo) {
  const levels = [
    [10, '⚡ PERFECT!! ⚡'],
    [7,  '🔥🔥 EXCELLENT!!'],
    [5,  '🔥 GREAT!'],
    [3,  '👍 GOOD!']
  ];
  const found = levels.find(([k]) => combo >= k);
  if (!found) return;

  el.comboFlash.innerHTML =
    `<span class="cf-combo">${combo} 연속</span><span class="cf-label">${found[1]}</span>`;
  el.comboFlash.classList.add('visible');
  setTimeout(() => el.comboFlash.classList.remove('visible'), 2200);
}

// ==================== 다음 문제 ====================
function nextQuestion() {
  state.currentIndex++;
  if (state.currentIndex >= state.questions.length) endGame();
  else loadQuestion();
}

// ==================== 게임 종료 ====================
function endGame() {
  stopTimer();

  const total    = state.questions.length;
  const accuracy = Math.round((state.correctCount / total) * 100);
  const avgTime  = state.responseTimes.length
    ? (state.responseTimes.reduce((a, b) => a + b, 0) / state.responseTimes.length).toFixed(1)
    : '0.0';
  const hintsUsed     = 3 - state.hintsLeft;
  const longestStreak = calcLongestStreak(state.results);

  const { emoji, title, message } = getResultGrade(accuracy);
  el.resultEmoji.textContent   = emoji;
  el.resultTitle.textContent   = title;
  el.resultMessage.textContent = message;

  el.finalScore.textContent     = state.score;
  el.correctCountEl.textContent = state.correctCount;
  el.totalCountEl.textContent   = total;
  el.accuracyEl.textContent     = `${accuracy}%`;
  el.avgTimeEl.textContent      = `${avgTime}s`;
  el.maxComboEl.textContent     = `×${state.maxCombo}`;
  el.hintsUsedEl.textContent    = hintsUsed;
  el.longestStreakEl.textContent = longestStreak;

  // 카테고리별 성적
  el.catResults.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const catQs  = state.results.filter(r => r.category === cat);
    if (!catQs.length) return;
    const correct = catQs.filter(r => r.isCorrect).length;
    const pct     = Math.round((correct / catQs.length) * 100);
    const card    = document.createElement('div');
    card.className = 'cat-stat-card';
    card.innerHTML = `
      <div class="cat-stat-header">
        <span class="cat-stat-name">${cat}</span>
        <span class="cat-stat-score">${correct}/${catQs.length} · ${pct}%</span>
      </div>
      <div class="cat-stat-bar-wrap">
        <div class="cat-stat-bar" style="width:${pct}%"></div>
      </div>
    `;
    el.catResults.appendChild(card);
  });

  // 문제별 결과 목록
  el.resultList.innerHTML = '';
  state.results.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = `result-item ${r.isCorrect ? 'correct' : 'wrong'}`;
    const icon    = r.timedOut ? '⏰' : (r.isCorrect ? '✓' : '✗');
    const timeStr = r.timeSpent != null ? `${Number(r.timeSpent).toFixed(1)}s` : '-';
    item.innerHTML = `
      <span class="ri-num">${i + 1}</span>
      <span class="ri-icon">${icon}</span>
      <span class="ri-q">${r.question}</span>
      <span class="ri-pts">${r.isCorrect ? '+' + r.points : '0'}</span>
      <span class="ri-time">${timeStr}</span>
      <span class="ri-cat">${r.category}</span>
      <span class="ri-diff diff-${r.difficulty}">${difficultyLabel(r.difficulty)}</span>
    `;
    el.resultList.appendChild(item);
  });

  showScreen('result');
}

// ==================== 유틸리티 ====================
function difficultyLabel(d) {
  return { easy: '쉬움', medium: '보통', hard: '어려움' }[d] || d;
}

function getResultGrade(accuracy) {
  if (accuracy >= 90) return { emoji: '🏆', title: '완벽해요!',   message: '놀라운 실력입니다! 모든 분야에 해박하시네요.' };
  if (accuracy >= 70) return { emoji: '🥇', title: '훌륭해요!',   message: '대단한 실력! 조금만 더 하면 완벽해질 거예요.' };
  if (accuracy >= 50) return { emoji: '🥈', title: '잘했어요!',   message: '꽤 좋은 성적이에요. 틀린 문제를 복습해보세요!' };
  if (accuracy >= 30) return { emoji: '🥉', title: '분발하세요!', message: '조금 더 공부하면 더 좋은 성적을 낼 수 있어요.' };
  return               { emoji: '📚', title: '다시 도전!',  message: '괜찮아요! 다시 도전해서 점수를 올려보세요.' };
}

function calcLongestStreak(results) {
  let max = 0, cur = 0;
  results.forEach(r => {
    if (r.isCorrect) { cur++; max = Math.max(max, cur); }
    else cur = 0;
  });
  return max;
}

function updateStartInfo() {
  const mode = GAME_MODES[state.selectedMode];
  const pool = state.selectedCategory === 'all'
    ? getAllQuestions()
    : getQuestionsByCategory(state.selectedCategory);
  const count = mode.questions ? Math.min(mode.questions, pool.length) : pool.length;
  el.questionCount.textContent = `${count}문제`;
  el.modeDesc.textContent      = mode.timeLimit ? `문제당 ${mode.timeLimit}초 제한` : '시간제한 없음';
}

// ==================== 이벤트 바인딩 ====================
function bindEvents() {
  el.categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.categoryBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedCategory = btn.dataset.category;
      updateStartInfo();
    });
  });

  el.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      el.modeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedMode = btn.dataset.mode;
      updateStartInfo();
    });
  });

  el.startBtn.addEventListener('click', initGame);

  el.optionBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => handleAnswer(i));
  });

  el.nextBtn.addEventListener('click', nextQuestion);
  el.btnHint.addEventListener('click', useHint);
  el.btnPause.addEventListener('click', togglePause);
  el.btnResume.addEventListener('click', togglePause);
  el.restartBtn.addEventListener('click', initGame);
  el.homeBtn.addEventListener('click', () => showScreen('start'));

  // 키보드 단축키
  document.addEventListener('keydown', e => {
    if (!screens.quiz.classList.contains('active')) return;
    if (e.key === 'Escape') { togglePause(); return; }
    if (state.paused) return;
    if (!state.answered) {
      if (e.key === '1') handleAnswer(0);
      if (e.key === '2') handleAnswer(1);
      if (e.key === '3') handleAnswer(2);
      if (e.key === '4') handleAnswer(3);
      if (e.key === 'h' || e.key === 'H') useHint();
    }
    if (state.answered && (e.key === 'Enter' || e.key === ' ')) nextQuestion();
  });
}

// ==================== 부트스트랩 ====================
function bootstrap() {
  el.timerCircle.style.strokeDasharray  = TIMER_CIRCUMFERENCE;
  el.timerCircle.style.strokeDashoffset = 0;
  bindEvents();
  updateStartInfo();
  showScreen('start');
}

document.addEventListener('DOMContentLoaded', bootstrap);
