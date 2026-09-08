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
  navigateQuestion,
  recordAnswer,
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
    answers: {}, currentQuestion: 0, startedAt: now, submittedAt: null, score: null
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
    answers: {}, currentQuestion: 0, startedAt: 9_999, submittedAt: null, score: null
  });
});

test("review status distinguishes correct, incorrect, and unanswered responses", () => {
  const question = { correctAnswer: "C" };
  assert.equal(getReviewStatus(question, "C"), "correct");
  assert.equal(getReviewStatus(question, "A"), "incorrect");
  assert.equal(getReviewStatus(question, undefined), "unanswered");
});
