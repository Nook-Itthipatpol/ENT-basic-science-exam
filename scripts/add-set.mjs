// Converts a refined mock-set CSV into a js/sets/<set-id>.js module and adds
// the set to the manifest in js/sets.js.
//
//   npm run add-set -- <path-to-csv> set-05
//
// Re-running for a set that already exists overwrites its module and leaves
// the manifest alone, so a corrected CSV can be re-imported safely.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_COLUMNS = [
  "eligible_position", "spreadsheet_row", "canonical_topic", "exam_years", "refined_question",
  "choice_a", "choice_b", "choice_c", "choice_d", "choice_e", "correct_answer", "explanation"
];
const CHOICE_LABELS = ["a", "b", "c", "d", "e"];
const DEFAULT_DURATION_MINUTES = 90;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fail = (message) => {
  console.error(`add-set: ${message}`);
  process.exit(1);
};

// A full CSV reader: quoted fields carry commas, newlines and doubled quotes,
// all of which appear in the refined question text.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') { field += '"'; index++; }
      else inQuotes = false;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows.filter((cells) => cells.some((cell) => cell.trim().length));
}

function toQuestions(rows, setId) {
  const header = rows[0].map((name) => name.trim());
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length) fail(`the CSV is missing required column(s): ${missing.join(", ")}`);

  return rows.slice(1).map((cells, index) => {
    const value = (name) => (cells[header.indexOf(name)] ?? "").trim();
    const questionNumber = index + 1;
    const require = (name) => {
      const found = value(name);
      if (!found) fail(`${setId} question ${questionNumber} has an empty ${name}`);
      return found;
    };

    const correctAnswer = require("correct_answer").toUpperCase();
    if (!CHOICE_LABELS.map((label) => label.toUpperCase()).includes(correctAnswer)) {
      fail(`${setId} question ${questionNumber} has correct_answer "${correctAnswer}", which is not A–E`);
    }

    const examYears = [...new Set(require("exam_years").split(",").map((year) => Number(year.trim())))].sort((a, b) => a - b);
    if (examYears.some((year) => !Number.isInteger(year))) fail(`${setId} question ${questionNumber} has a non-numeric exam year`);

    // The review shown after submitting is the whole explanation, never a
    // truncation of it — test/data.test.js enforces that they stay identical.
    const explanation = require("explanation");

    return {
      id: questionNumber,
      topic: require("canonical_topic"),
      question: require("refined_question"),
      choices: CHOICE_LABELS.map((label) => ({ label: label.toUpperCase(), text: require(`choice_${label}`) })),
      correctAnswer,
      explanation,
      highYieldReview: explanation,
      examYears,
      sourceRow: require("spreadsheet_row"),
      eligiblePosition: require("eligible_position")
    };
  });
}

function writeModule(setId, csvPath, questions) {
  const modulePath = path.join(repoRoot, "js", "sets", `${setId}.js`);
  const banner = `// Generated from ${path.basename(csvPath)} by scripts/add-set.mjs.`;
  fs.writeFileSync(modulePath, `${banner}\nexport const questions = ${JSON.stringify(questions, null, 2)};\n\nexport const QUESTION_COUNT = questions.length;\n`);
  return path.relative(repoRoot, modulePath);
}

function addToManifest(setId, questionCount) {
  const manifestPath = path.join(repoRoot, "js", "sets.js");
  const source = fs.readFileSync(manifestPath, "utf8");
  if (source.includes(`id: "${setId}"`)) return false;

  const entry = `  { id: "${setId}", title: "Basic Science Mock", questionCount: ${questionCount}, durationSeconds: ${DEFAULT_DURATION_MINUTES} * 60, status: "active", module: "./sets/${setId}.js" }`;
  const lastEntry = source.lastIndexOf('  { id: "set-');
  const endOfLastEntry = source.indexOf("\n", lastEntry);
  if (lastEntry === -1 || endOfLastEntry === -1) fail("could not find the SET_MANIFEST entries in js/sets.js — add the entry by hand");

  const updated = `${source.slice(0, endOfLastEntry)},\n${entry}${source.slice(endOfLastEntry)}`;
  fs.writeFileSync(manifestPath, updated);
  return true;
}

const [csvArg, setId] = process.argv.slice(2);
if (!csvArg || !setId) fail("usage: npm run add-set -- <path-to-csv> <set-id>, e.g. npm run add-set -- ~/Set_05.csv set-05");
if (!/^set-\d{2}$/.test(setId)) fail(`"${setId}" is not a valid set id — use the form set-05`);

const csvPath = path.resolve(csvArg);
if (!fs.existsSync(csvPath)) fail(`no CSV at ${csvPath}`);

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
if (rows.length < 2) fail("the CSV has a header but no question rows");

const questions = toQuestions(rows, setId);
const modulePath = writeModule(setId, csvPath, questions);
const added = addToManifest(setId, questions.length);

console.log(`Wrote ${modulePath} (${questions.length} questions).`);
console.log(added ? "Added the manifest entry in js/sets.js." : `js/sets.js already lists ${setId} — left the manifest alone.`);
console.log("Now run: npm run check && npm test");
