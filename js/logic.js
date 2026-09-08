export const EXAM_DURATION_SECONDS = 90 * 60;

export function createAttempt(now = Date.now()) {
  return { answers: {}, revealed: {}, currentQuestion: 0, startedAt: now, pausedMs: 0, pausedAt: null, submittedAt: null, score: null };
}

export function isRevealed(attempt, questionIndex) {
  return Boolean(attempt?.revealed?.[questionIndex]);
}

export function recordAnswer(attempt, questionIndex, answer) {
  if (isRevealed(attempt, questionIndex)) return attempt;
  return { ...attempt, answers: { ...attempt.answers, [questionIndex]: answer } };
}

export function pauseTimer(attempt, now = Date.now()) {
  if (attempt.pausedAt) return attempt;
  return { ...attempt, pausedAt: now };
}

export function resumeTimer(attempt, now = Date.now()) {
  if (!attempt.pausedAt) return attempt;
  return { ...attempt, pausedMs: (attempt.pausedMs || 0) + Math.max(0, now - attempt.pausedAt), pausedAt: null };
}

export function revealAnswer(attempt, questionIndex, now = Date.now()) {
  if (!attempt.answers[questionIndex] || isRevealed(attempt, questionIndex)) return attempt;
  return pauseTimer({ ...attempt, revealed: { ...attempt.revealed, [questionIndex]: true } }, now);
}

export function navigateQuestion(attempt, questionIndex, questionCount, now = Date.now()) {
  const lastIndex = Math.max(0, questionCount - 1);
  const currentQuestion = Math.min(Math.max(Number(questionIndex) || 0, 0), lastIndex);
  const moved = { ...attempt, currentQuestion };
  return isRevealed(moved, currentQuestion) ? pauseTimer(moved, now) : resumeTimer(moved, now);
}

export function getPausedMs(attempt, now = Date.now()) {
  return (attempt.pausedMs || 0) + (attempt.pausedAt ? Math.max(0, now - attempt.pausedAt) : 0);
}

export function getElapsedSeconds(attempt, now = Date.now()) {
  return Math.max(0, Math.floor((now - attempt.startedAt - getPausedMs(attempt, now)) / 1000));
}

export function getTimeRemaining(attempt, now = Date.now()) {
  return EXAM_DURATION_SECONDS - getElapsedSeconds(attempt, now);
}

export function formatCountdown(seconds) {
  const sign = seconds < 0 ? "−" : "";
  const total = Math.abs(seconds);
  return `${sign}${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function answeredCount(answers) { return Object.keys(answers).length; }

export function unansweredIndices(questions, answers) {
  return questions.map((_, index) => index).filter((index) => !answers[index]);
}

export function calculateScore(questions, answers) {
  return questions.reduce((total, question, index) => total + Number(answers[index] === question.correctAnswer), 0);
}

export function getReviewStatus(question, answer) {
  if (!answer) return "unanswered";
  return answer === question.correctAnswer ? "correct" : "incorrect";
}

export function sanitizeAttempt(value, questionCount, now = Date.now()) {
  const fresh = createAttempt(now);
  if (!value || typeof value !== "object") return fresh;
  const answers = {};
  Object.entries(value.answers || {}).forEach(([key, answer]) => {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < questionCount && /^[A-E]$/.test(answer)) answers[index] = answer;
  });
  const revealed = {};
  Object.entries(value.revealed || {}).forEach(([key, flag]) => {
    const index = Number(key);
    if (flag && answers[index]) revealed[index] = true;
  });
  return {
    answers,
    revealed,
    currentQuestion: Math.min(Math.max(Number(value.currentQuestion) || 0, 0), questionCount - 1),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : now,
    pausedMs: Number.isFinite(value.pausedMs) && value.pausedMs > 0 ? value.pausedMs : 0,
    pausedAt: Number.isFinite(value.pausedAt) ? value.pausedAt : null,
    submittedAt: Number.isFinite(value.submittedAt) ? value.submittedAt : null,
    score: Number.isFinite(value.score) ? value.score : null
  };
}
