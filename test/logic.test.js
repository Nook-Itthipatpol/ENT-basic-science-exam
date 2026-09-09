import test from "node:test";
import assert from "node:assert/strict";
import {
  EXAM_DURATION_SECONDS,
  answeredCount,
  calculateScore,
  createAttempt,
  formatCountdown,
  getReviewStatus,
  getTimeRemaining,
  isRevealed,
  navigateQuestion,
  pauseTimer,
  recordAnswer,
  resumeTimer,
  revealAnswer,
  sanitizeAttempt,
  unansweredIndices
} from "../js/logic.js";

const questions = [
  { correctAnswer: "B" },
  { correctAnswer: "D" },
  { correctAnswer: "A" }
];

test("a new attempt starts cleanly at the first question", () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(createAttempt(now), {
    setId: null, durationSeconds: EXAM_DURATION_SECONDS, answers: {}, revealed: {}, currentQuestion: 0, startedAt: now, pausedMs: 0, pausedAt: null, submittedAt: null, score: null
  });
});

test("recording an answer updates only that answer and preserves the attempt", () => {
  const attempt = createAttempt(100);
  const updated = recordAnswer(attempt, 1, "D");
  assert.deepEqual(updated.answers, { 1: "D" });
  assert.equal(updated.startedAt, 100);
  assert.deepEqual(attempt.answers, {}, "the prior attempt is not mutated");
  assert.equal(answeredCount(updated.answers), 1);
});

test("scoring counts correct answers and leaves unanswered questions at zero", () => {
  const answers = { 0: "B", 1: "A" };
  assert.equal(calculateScore(questions, answers), 1);
  assert.deepEqual(unansweredIndices(questions, answers), [2]);
});

test("question navigation is clamped to the available question range", () => {
  const attempt = createAttempt();
  assert.equal(navigateQuestion(attempt, -10, questions.length).currentQuestion, 0);
  assert.equal(navigateQuestion(attempt, 99, questions.length).currentQuestion, 2);
  assert.equal(navigateQuestion(attempt, 1, questions.length).currentQuestion, 1);
});

test("countdown handles the 90-minute start and negative overtime", () => {
  const startedAt = 10_000;
  const attempt = createAttempt(startedAt);
  assert.equal(getTimeRemaining(attempt, startedAt), EXAM_DURATION_SECONDS);
  assert.equal(formatCountdown(EXAM_DURATION_SECONDS), "90:00");
  assert.equal(formatCountdown(-61), "−01:01");
});

test("creating a replacement attempt resets answers, score, submission, and timer", () => {
  const restarted = createAttempt(9_999);
  assert.deepEqual(restarted, {
    setId: null, durationSeconds: EXAM_DURATION_SECONDS, answers: {}, revealed: {}, currentQuestion: 0, startedAt: 9_999, pausedMs: 0, pausedAt: null, submittedAt: null, score: null
  });
});

test("review status distinguishes correct, incorrect, and unanswered responses", () => {
  const question = { correctAnswer: "C" };
  assert.equal(getReviewStatus(question, "C"), "correct");
  assert.equal(getReviewStatus(question, "A"), "incorrect");
  assert.equal(getReviewStatus(question, undefined), "unanswered");
});

test("submitting an answer reveals it and pauses the clock at that moment", () => {
  const startedAt = 0;
  const answered = recordAnswer(createAttempt(startedAt), 0, "B");
  const revealed = revealAnswer(answered, 0, 30_000);

  assert.ok(isRevealed(revealed, 0));
  assert.equal(revealed.pausedAt, 30_000);
  assert.equal(getTimeRemaining(revealed, 30_000), EXAM_DURATION_SECONDS - 30);
  assert.equal(
    getTimeRemaining(revealed, 90_000),
    EXAM_DURATION_SECONDS - 30,
    "time spent reading the explanation does not burn the clock"
  );
});

test("an unanswered question cannot be revealed", () => {
  const attempt = createAttempt(0);
  assert.equal(revealAnswer(attempt, 0, 1_000), attempt);
  assert.equal(isRevealed(attempt, 0), false);
});

test("a revealed answer is final and cannot be changed", () => {
  const revealed = revealAnswer(recordAnswer(createAttempt(0), 0, "B"), 0, 1_000);
  const retried = recordAnswer(revealed, 0, "A");

  assert.equal(retried, revealed);
  assert.equal(retried.answers[0], "B");
});

test("moving to the next question resumes the clock and banks the paused span", () => {
  const revealed = revealAnswer(recordAnswer(createAttempt(0), 0, "B"), 0, 30_000);
  const next = navigateQuestion(revealed, 1, questions.length, 50_000);

  assert.equal(next.currentQuestion, 1);
  assert.equal(next.pausedAt, null);
  assert.equal(next.pausedMs, 20_000, "the 20s spent reading is banked");
  assert.equal(getTimeRemaining(next, 60_000), EXAM_DURATION_SECONDS - 40);
});

test("returning to an already revealed question pauses the clock again", () => {
  const revealed = revealAnswer(recordAnswer(createAttempt(0), 0, "B"), 0, 30_000);
  const onSecond = navigateQuestion(revealed, 1, questions.length, 50_000);
  const back = navigateQuestion(onSecond, 0, questions.length, 60_000);

  assert.equal(back.pausedAt, 60_000);
  assert.equal(getTimeRemaining(back, 120_000), EXAM_DURATION_SECONDS - 40);
});

test("pause and resume are idempotent", () => {
  const attempt = createAttempt(0);
  assert.equal(resumeTimer(attempt, 10_000), attempt, "resuming a running clock changes nothing");
  const paused = pauseTimer(attempt, 10_000);
  assert.equal(pauseTimer(paused, 20_000), paused, "pausing a paused clock keeps the original pause start");
});

test("a restored attempt keeps its reveals and paused time", () => {
  const restored = sanitizeAttempt(
    { answers: { 0: "B", 1: "D" }, revealed: { 0: true, 2: true }, currentQuestion: 1, startedAt: 0, pausedMs: 5_000, pausedAt: 8_000 },
    questions.length
  );

  assert.deepEqual(restored.revealed, { 0: true }, "reveals without a stored answer are dropped");
  assert.equal(restored.pausedMs, 5_000);
  assert.equal(restored.pausedAt, 8_000);
});

test("an attempt saved before per-question explanations still loads", () => {
  const restored = sanitizeAttempt({ answers: { 0: "B" }, currentQuestion: 0, startedAt: 0 }, questions.length);

  assert.deepEqual(restored.revealed, {});
  assert.equal(restored.pausedMs, 0);
  assert.equal(restored.pausedAt, null);
  assert.equal(getTimeRemaining(restored, 60_000), EXAM_DURATION_SECONDS - 60);
});

test("an attempt carries the id and duration of the set it belongs to", () => {
  const attempt = createAttempt(0, "set-03", 45 * 60);
  assert.equal(attempt.setId, "set-03");
  assert.equal(attempt.durationSeconds, 45 * 60);
  assert.equal(getTimeRemaining(attempt, 0), 45 * 60, "the countdown uses the set's own duration, not the 90-minute default");
});

test("sanitizing a stored attempt reattaches the set id and duration passed in", () => {
  const restored = sanitizeAttempt({ answers: { 0: "B" }, currentQuestion: 0, startedAt: 0 }, questions.length, 0, "set-03", 45 * 60);
  assert.equal(restored.setId, "set-03");
  assert.equal(restored.durationSeconds, 45 * 60);
  assert.equal(getTimeRemaining(restored, 0), 45 * 60);
});
