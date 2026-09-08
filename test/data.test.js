import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUESTION_COUNT, questions } from "../js/questions.js";

const ANSWER_LABELS = ["A", "B", "C", "D", "E"];
const ALLOWED_YEARS = new Set([2021, 2022, 2023]);

const nonblank = (value) => typeof value === "string" && value.trim().length > 0;

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...values] = rows;
  return values.map((value) => Object.fromEntries(headers.map((header, index) => [header, value[index] ?? ""])));
}

test("Set 02 has exactly 61 questions with sequential IDs", () => {
  assert.equal(QUESTION_COUNT, 61);
  assert.equal(questions.length, 61);
  assert.deepEqual(questions.map(({ id }) => id), Array.from({ length: 61 }, (_, index) => index + 1));
});

test("each Set 02 question has five nonblank A–E options and a valid answer", () => {
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

test("each Set 02 question includes a nonblank explanation and high-yield review", () => {
  for (const question of questions) {
    assert.ok(nonblank(question.explanation), `question ${question.id} has a blank explanation`);
    assert.ok(nonblank(question.highYieldReview), `question ${question.id} has a blank high-yield review`);
  }
});

test("Set 02 source metadata is from 2021–2023 with unique source rows and eligible positions", () => {
  const sourceRows = new Set();
  const eligiblePositions = new Set();

  for (const question of questions) {
    assert.ok(Array.isArray(question.examYears) && question.examYears.length > 0, `question ${question.id} needs examYears`);
    assert.ok(
      question.examYears.every((year) => ALLOWED_YEARS.has(year)),
      `question ${question.id} has an exam year outside 2021–2023`
    );
    assert.ok(nonblank(question.sourceRow), `question ${question.id} has a blank sourceRow`);
    assert.ok(nonblank(question.eligiblePosition), `question ${question.id} has a blank eligiblePosition`);
    assert.ok(!sourceRows.has(question.sourceRow), `duplicate sourceRow: ${question.sourceRow}`);
    assert.ok(!eligiblePositions.has(question.eligiblePosition), `duplicate eligiblePosition: ${question.eligiblePosition}`);

    sourceRows.add(question.sourceRow);
    eligiblePositions.add(question.eligiblePosition);
  }
});

test("generated questions retain the source CSV's complete high-yield review and provenance", () => {
  const source = parseCsv(readFileSync(new URL("../../work_set02/ENT_R1_Basic_Science_Mock_Set_02_refined.csv", import.meta.url), "utf8"));
  assert.equal(source.length, questions.length);

  source.forEach((record, index) => {
    const question = questions[index];
    assert.equal(question.highYieldReview, record.explanation, `question ${question.id} review differs from the source CSV`);
    assert.deepEqual(question.examYears, (record.exam_years.match(/\d{4}/g) || []).map(Number), `question ${question.id} exam years differ from the source CSV`);
    assert.equal(question.sourceRow, record.spreadsheet_row, `question ${question.id} source row differs from the source CSV`);
    assert.equal(question.eligiblePosition, record.eligible_position, `question ${question.id} eligible position differs from the source CSV`);
  });
});
