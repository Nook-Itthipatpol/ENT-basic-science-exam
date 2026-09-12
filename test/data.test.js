import test from "node:test";
import assert from "node:assert/strict";
import { SET_MANIFEST, loadSet } from "../js/sets.js";

const ANSWER_LABELS = ["A", "B", "C", "D", "E"];
const EARLIEST_YEAR = 2000;
const LATEST_YEAR = new Date().getUTCFullYear();

const nonblank = (value) => typeof value === "string" && value.trim().length > 0;

const activeSets = await Promise.all(
  SET_MANIFEST.filter((meta) => meta.status === "active").map(async (meta) => ({ meta, questions: (await loadSet(meta.id)).questions }))
);

for (const { meta, questions } of activeSets) {
  test(`${meta.id} has ${meta.questionCount} questions with sequential IDs`, () => {
    assert.equal(questions.length, meta.questionCount);
    assert.deepEqual(questions.map(({ id }) => id), Array.from({ length: meta.questionCount }, (_, index) => index + 1));
  });

  test(`each ${meta.id} question has five nonblank A–E options and a valid answer`, () => {
    for (const question of questions) {
      assert.ok(nonblank(question.topic), `question ${question.id} has a blank topic`);
      assert.ok(nonblank(question.question), `question ${question.id} has a blank question prompt`);
      assert.equal(question.choices.length, 5, `question ${question.id} must have five choices`);
      assert.deepEqual(
        question.choices.map(({ label }) => label),
        ANSWER_LABELS,
        `question ${question.id} choices must be labeled A through E`
      );
      assert.ok(question.choices.every(({ text }) => nonblank(text)), `question ${question.id} has a blank option`);
      assert.ok(ANSWER_LABELS.includes(question.correctAnswer), `question ${question.id} has an invalid correctAnswer`);
    }
  });

  test(`each ${meta.id} question includes a nonblank explanation and high-yield review`, () => {
    for (const question of questions) {
      assert.ok(nonblank(question.explanation), `question ${question.id} has a blank explanation`);
      assert.ok(nonblank(question.highYieldReview), `question ${question.id} has a blank high-yield review`);
    }
  });

  test(`${meta.id} source metadata has plausible years and unique source rows and eligible positions`, () => {
    const sourceRows = new Set();
    const eligiblePositions = new Set();

    for (const question of questions) {
      assert.ok(Array.isArray(question.examYears) && question.examYears.length > 0, `question ${question.id} needs examYears`);
      assert.ok(
        question.examYears.every((year) => year >= EARLIEST_YEAR && year <= LATEST_YEAR),
        `question ${question.id} has an exam year outside ${EARLIEST_YEAR}–${LATEST_YEAR}`
      );
      assert.ok(nonblank(question.sourceRow), `question ${question.id} has a blank sourceRow`);
      assert.ok(nonblank(question.eligiblePosition), `question ${question.id} has a blank eligiblePosition`);
      assert.ok(!sourceRows.has(question.sourceRow), `duplicate sourceRow: ${question.sourceRow}`);
      assert.ok(!eligiblePositions.has(question.eligiblePosition), `duplicate eligiblePosition: ${question.eligiblePosition}`);

      sourceRows.add(question.sourceRow);
      eligiblePositions.add(question.eligiblePosition);
    }
  });

  test(`the ${meta.id} high-yield review is the question's full explanation, untruncated`, () => {
    for (const question of questions) {
      assert.equal(
        question.highYieldReview,
        question.explanation,
        `question ${question.id} review text differs from its explanation`
      );
      assert.ok(
        question.explanation.length >= 120,
        `question ${question.id} explanation looks truncated (${question.explanation.length} characters)`
      );
      assert.ok(
        /[.!?)]$/.test(question.explanation.trim()),
        `question ${question.id} explanation does not end on a complete sentence`
      );
      assert.ok(
        !/(\.\.\.|…)\s*$/.test(question.explanation.trim()),
        `question ${question.id} explanation ends in an ellipsis`
      );
      assert.ok(
        question.explanation.trim().split(/(?<=[.!?])\s+/).length >= 2,
        `question ${question.id} explanation is a single sentence and is likely incomplete`
      );
    }
  });

  test(`${meta.id} questions stay in source-spreadsheet order with ascending provenance markers`, () => {
    const ascending = (values, field) => values.forEach((value, index) => {
      assert.ok(Number.isInteger(value) && value > 0, `question ${questions[index].id} has a non-numeric ${field}`);
      if (index > 0) {
        assert.ok(
          values[index - 1] < value,
          `question ${questions[index].id} breaks ascending ${field} order (${values[index - 1]} then ${value})`
        );
      }
    });

    ascending(questions.map((question) => Number(question.sourceRow)), "sourceRow");
    ascending(questions.map((question) => Number(question.eligiblePosition)), "eligiblePosition");
  });

  test(`${meta.id} exam years are whole years listed in ascending order without repeats`, () => {
    for (const question of questions) {
      question.examYears.forEach((year, index) => {
        assert.ok(Number.isInteger(year), `question ${question.id} has a non-integer exam year`);
        if (index > 0) {
          assert.ok(
            question.examYears[index - 1] < year,
            `question ${question.id} exam years are not ascending and unique`
          );
        }
      });
    }
  });
}

test("every announced set is covered by these data checks", () => {
  assert.deepEqual(activeSets.map(({ meta }) => meta.id), ["set-02", "set-03", "set-04"]);
});
