export const EXAM_DURATION_SECONDS = 90 * 60;

export function createAttempt(now = Date.now()) {
  return { answers: {}, currentQuestion: 0, startedAt: now, submittedAt: null, score: null };
}

export function recordAnswer(attempt, questionIndex, answer) {
  return { ...attempt, answers: { ...attempt.answers, [questionIndex]: answer } };
}

export function navigateQuestion(attempt, questionIndex, questionCount) {
  const lastIndex = Math.max(0, questionCount - 1);
  const currentQuestion = Math.min(Math.max(Number(questionIndex) || 0, 0), lastIndex);
  return { ...attempt, currentQuestion };
}

export function getElapsedSeconds(attempt, now = Date.now()) {
  return Math.max(0, Math.floor((now - attempt.startedAt) / 1000));
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
  return {
    answers,
    currentQuestion: Math.min(Math.max(Number(value.currentQuestion) || 0, 0), questionCount - 1),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : now,
    submittedAt: Number.isFinite(value.submittedAt) ? value.submittedAt : null,
    score: Number.isFinite(value.score) ? value.score : null
  };
}
