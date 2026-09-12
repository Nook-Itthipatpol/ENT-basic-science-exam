import { SET_MANIFEST, findSet, loadSet } from "./sets.js";
import { activeSetId, attemptStore, summaryStore } from "./storage.js";
import { answeredCount, calculateScore, createAttempt, formatCountdown, getReviewStatus, getTimeRemaining, isRevealed, navigateQuestion, pauseTimer, recordAnswer, resumeTimer, revealAnswer, sanitizeAttempt, unansweredIndices } from "./logic.js";
import { getSession, isSyncConfigured, onAuthChange, sendMagicLink, signOut } from "./sync.js";

const main = document.querySelector("#app-main");
const modalRoot = document.querySelector("#modal-root");
const syncBar = document.querySelector("#sync-bar");
let activeSet = null; // manifest metadata plus .questions for the set currently open
let attempt = null;
let setStates = {}; // { [setId]: { attempt, summary } } for every active set, feeds the home screen
let timer = null;
let modalOpener = null;
let isolatedBackground = [];
let syncSession = null;
let syncNotice = "";

const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const setLabel = (setId) => `Set ${setId.replace("set-", "")}`;
const setRoute = (route) => { location.hash = route; };
const progress = () => answeredCount(attempt?.answers || {});
// The label lives in assistive text only — on screen the years speak for themselves.
const formatExamYears = (examYears) => `<span class="sr-only">Exam year${examYears.length === 1 ? "" : "s"}: </span>${examYears.join(", ")}`;
// Always score against the questions actually loaded, and record that total on
// the summary so the home screen can report a score out of the same
// denominator without having to import the set's question module.
const percentOf = (score, total) => Math.round(score / total * 100);

function persist() {
  if (!activeSet) return;
  attemptStore.save(attempt, activeSet.id);
  setStates[activeSet.id] = { ...(setStates[activeSet.id] || {}), attempt };
}

async function loadSetStates() {
  const active = SET_MANIFEST.filter((set) => set.status === "active");
  const loaded = await Promise.all(active.map((set) => Promise.all([attemptStore.load(set.id), summaryStore.load(set.id)])));
  setStates = Object.fromEntries(active.map((set, index) => [set.id, { attempt: loaded[index][0], summary: loaded[index][1] }]));
}

async function openSet(setId, { fresh } = {}) {
  const loaded = await loadSet(setId);
  if (!loaded) return;
  activeSet = loaded;
  activeSetId.save(setId);
  const stored = fresh ? null : setStates[setId]?.attempt;
  attempt = stored
    ? sanitizeAttempt(stored, loaded.questionCount, Date.now(), loaded.id, loaded.durationSeconds)
    : createAttempt(Date.now(), loaded.id, loaded.durationSeconds);
  persist();
  setRoute("exam");
}

function stopTimer() { if (timer) window.clearInterval(timer); timer = null; }
function startTimer() {
  stopTimer();
  const update = () => {
    const target = document.querySelector("[data-countdown]");
    if (!target || !attempt || attempt.submittedAt) return;
    const remaining = getTimeRemaining(attempt);
    const paused = Boolean(attempt.pausedAt);
    target.textContent = formatCountdown(remaining);
    target.classList.toggle("overdue", remaining < 0);
    target.setAttribute("aria-label", `${paused ? "Timer paused, " : ""}${remaining < 0 ? "Time exceeded" : "Time remaining"}: ${formatCountdown(remaining)}`);
    const label = document.querySelector("[data-timer-label]");
    if (label) label.textContent = paused ? "Paused" : "";
    document.querySelector(".timer")?.classList.toggle("paused", paused);
  };
  update();
  timer = window.setInterval(update, 1000);
}

function renderSyncBar() {
  if (!syncBar || !isSyncConfigured()) return;
  syncBar.innerHTML = syncSession
    ? `<span>Synced as ${esc(syncSession.user.email)}</span><button class="text-button" data-action="sync-out">Sign out</button>`
    : `<details class="sync-details"${syncNotice ? " open" : ""}><summary>Sync</summary><form data-sync-form><label class="sr-only" for="sync-email">Email for sign-in link</label><input id="sync-email" type="email" name="email" placeholder="you@example.com" required/><button class="text-button" type="submit">Send link</button></form>${syncNotice ? `<p class="sync-notice">${esc(syncNotice)}</p>` : ""}</details>`;
}

function afterAuthChange(session) {
  syncSession = session;
  renderSyncBar();
  if (!session) return;
  loadSetStates().then(() => {
    const state = activeSet && setStates[activeSet.id];
    if (state) attempt = sanitizeAttempt(state.attempt, activeSet.questionCount, Date.now(), activeSet.id, activeSet.durationSeconds);
    render();
  });
}

function setCardMarkup(meta) {
  const state = setStates[meta.id] || {};
  const active = state.attempt && !state.attempt.submittedAt;
  const storedProgress = active ? answeredCount(state.attempt.answers || {}) : 0;
  const label = setLabel(meta.id);
  return `<article class="set-card active-card"><div class="set-card-top"><h2>${esc(label)}</h2>${active ? '<span class="status">In progress</span>' : ""}</div><p class="set-meta">${meta.questionCount} questions · ${Math.round(meta.durationSeconds / 60)} min</p>${active ? `<div class="card-progress"><div class="progress-track"><i style="width:${storedProgress / meta.questionCount * 100}%"></i></div><span>${storedProgress}/${meta.questionCount}</span></div>` : ""}${state.summary ? `<p class="latest-score">Last ${state.summary.score}/${state.summary.total ?? meta.questionCount} · ${state.summary.percent}%</p>` : ""}<button class="primary" data-action="${active ? "resume" : "start"}" data-set="${meta.id}" aria-label="${active ? "Resume" : "Start"} ${esc(label)}">${active ? "Resume" : "Start"}</button>${active ? `<button class="text-button" data-action="restart" data-set="${meta.id}">Restart</button>` : ""}</article>`;
}

function soonCardMarkup(meta) {
  const label = setLabel(meta.id);
  return `<article class="set-card disabled-card" aria-label="${esc(label)}, coming soon and unavailable"><div class="set-card-top"><h2>${esc(label)}</h2><span class="status muted">Soon</span></div><p class="set-meta">In preparation</p></article>`;
}

function home() {
  stopTimer();
  if (activeSet && attempt && !attempt.submittedAt && !attempt.pausedAt) { attempt = pauseTimer(attempt); persist(); }
  main.innerHTML = `
    <section class="hero"><p class="eyebrow">ENT R1 · Basic science</p><h1>Mock exams</h1></section>
    <section class="sets" aria-label="Available mock sets">${SET_MANIFEST.map((meta) => (meta.status === "active" ? setCardMarkup(meta) : soonCardMarkup(meta))).join("")}</section>`;
}

function syncTimerState() {
  if (!attempt || attempt.submittedAt) return;
  const next = isRevealed(attempt, attempt.currentQuestion) ? pauseTimer(attempt) : resumeTimer(attempt);
  if (next !== attempt) { attempt = next; persist(); }
}

function optionMarkup(question, selected, revealed) {
  return question.choices.map((choice) => {
    const isSelected = selected === choice.label;
    const isAnswer = question.correctAnswer === choice.label;
    const state = revealed ? (isAnswer ? " is-correct" : isSelected ? " is-wrong" : "") : "";
    const tag = revealed && isAnswer ? '<span class="option-tag">Correct answer</span>' : revealed && isSelected ? '<span class="option-tag">Your answer</span>' : "";
    return `<label class="option ${isSelected ? "selected" : ""}${state}"><input type="radio" name="answer" value="${choice.label}" ${isSelected ? "checked" : ""} ${revealed ? "disabled" : ""}/><span class="choice-letter">${choice.label}</span><span>${esc(choice.text)}</span>${tag}</label>`;
  }).join("");
}

// Selecting an option only changes four things on screen. Patching them beats
// rebuilding main.innerHTML — a full re-render threw away the 61-button
// navigator, restarted the countdown interval, and moved the scroll position
// out from under the reader on a long question.
function refreshAnswerState(answer) {
  const index = attempt.currentQuestion;
  const total = activeSet.questions.length;
  const complete = progress();
  main.querySelectorAll(".option").forEach((option) => {
    option.classList.toggle("selected", option.querySelector("input")?.value === answer);
  });
  const bar = main.querySelector("[data-exam-progress]");
  if (bar) bar.setAttribute("aria-label", `${complete} of ${total} questions answered`);
  const counter = main.querySelector("[data-answered-count]");
  if (counter) counter.textContent = `${complete} answered`;
  const reveal = main.querySelector('[data-action="reveal"]');
  if (reveal) reveal.disabled = false;
  const navButton = main.querySelector(`.nav-question[data-question="${index}"]`);
  if (navButton) {
    navButton.classList.add("answered");
    navButton.setAttribute("aria-label", navQuestionLabel(index, "answered", answer));
  }
}

function feedbackMarkup(question, selected) {
  const correct = selected === question.correctAnswer;
  const answerText = question.choices.find((item) => item.label === question.correctAnswer)?.text || "";
  return `<section class="feedback ${correct ? "correct" : "incorrect"}" data-feedback tabindex="-1" aria-label="Answer feedback">
      <div class="feedback-head"><strong>${correct ? "Correct" : "Incorrect"}</strong></div>
      ${correct ? "" : `<p class="feedback-answer">Correct answer: <strong>${esc(question.correctAnswer)}. ${esc(answerText)}</strong></p>`}
      <div class="review-note"><strong>Explanation</strong><p>${esc(question.explanation)}</p></div>
    </section>`;
}

const navQuestionLabel = (itemIndex, state, answer) =>
  `Question ${itemIndex + 1}${state === "correct" ? ", answered correctly" : state === "incorrect" ? ", answered incorrectly" : answer ? ", answer selected" : ", unanswered"}`;

function navigatorMarkup(index) {
  return activeSet.questions.map((question, itemIndex) => {
    const answer = attempt.answers[itemIndex];
    const revealed = isRevealed(attempt, itemIndex);
    const state = revealed ? (answer === question.correctAnswer ? "correct" : "incorrect") : answer ? "answered" : "";
    return `<button class="nav-question ${itemIndex === index ? "current" : ""} ${state}" aria-label="${navQuestionLabel(itemIndex, state, answer)}" aria-current="${itemIndex === index ? "step" : "false"}" data-question="${itemIndex}">${itemIndex + 1}</button>`;
  }).join("");
}

function exam({ focusFeedback } = {}) {
  if (!activeSet || !attempt) { setRoute("home"); return; }
  syncTimerState();
  const questions = activeSet.questions;
  const index = attempt.currentQuestion;
  const question = questions[index];
  const selected = attempt.answers[index];
  const revealed = isRevealed(attempt, index);
  const isLast = index === questions.length - 1;
  const complete = progress();
  const primary = revealed
    ? `<button class="primary" data-action="${isLast ? "submit" : "next"}">${isLast ? "Finish" : "Next →"}</button>`
    : `<button class="primary" data-action="reveal" ${selected ? "" : "disabled"}>Check answer</button>`;
  main.innerHTML = `
    <section class="exam-head"><button class="back-button" data-action="home" aria-label="Exit to home">← Exit</button><div class="timer"><span data-timer-label>Time</span><strong data-countdown></strong></div></section>
    <div class="exam-progress" data-exam-progress aria-label="${complete} of ${questions.length} questions answered"><div><span>${index + 1} / ${questions.length}</span><span data-answered-count>${complete} answered</span></div><div class="progress-track"><i style="width:${(index + 1) / questions.length * 100}%"></i></div></div>
    <article class="question-card ${revealed ? "revealed" : ""}"><div class="question-meta"><p class="topic">${esc(question.topic)}</p><p class="exam-years">${formatExamYears(question.examYears)}</p></div><h1>${esc(question.question)}</h1><fieldset ${revealed ? "disabled" : ""}><legend class="sr-only">Choose one answer</legend>${optionMarkup(question, selected, revealed)}</fieldset>${revealed ? feedbackMarkup(question, selected) : ""}</article>
    <nav class="exam-actions" aria-label="Question navigation"><button data-action="previous" ${index === 0 ? "disabled" : ""}>Previous</button>${primary}</nav>
    <section class="navigator"><div class="navigator-title"><h2 class="sr-only">Question navigator</h2><button class="text-button" data-action="submit">Submit exam</button></div><div class="question-grid">${navigatorMarkup(index)}</div></section>`;
  startTimer();
  if (focusFeedback) requestAnimationFrame(() => main.querySelector("[data-feedback]")?.focus());
}

function review() {
  if (!activeSet || !attempt) { setRoute("home"); return; }
  stopTimer();
  const questions = activeSet.questions;
  const score = calculateScore(questions, attempt.answers);
  if (attempt.score !== score) { attempt = { ...attempt, score }; persist(); }
  const percentage = percentOf(score, questions.length);
  main.innerHTML = `<section class="results-head"><p class="eyebrow">${esc(setLabel(activeSet.id))} completed</p><h1>${score} / ${questions.length}</h1><p>${percentage}% correct</p><button class="primary" data-action="home">Home</button><button class="text-button" data-action="restart" data-set="${activeSet.id}">Fresh attempt</button></section><section class="review-list" aria-label="Answer review">${questions.map((question, index) => {
    const answer = attempt.answers[index]; const status = getReviewStatus(question, answer); const correct = status === "correct";
    const choice = (letter) => question.choices.find((item) => item.label === letter)?.text || "Not answered";
    return `<article class="review-card ${correct ? "correct" : "incorrect"}"><div class="review-meta"><span>Question ${index + 1}</span><span>${formatExamYears(question.examYears)}</span><span>${status === "correct" ? "Correct" : status === "incorrect" ? "Incorrect" : "Unanswered"}</span></div><h2>${esc(question.question)}</h2><p><strong>Your answer:</strong> ${answer ? `${esc(answer)}. ${esc(choice(answer))}` : "Not answered"}</p><p><strong>Correct answer:</strong> ${esc(question.correctAnswer)}. ${esc(choice(question.correctAnswer))}</p><div class="review-note"><strong>High-yield review</strong><p>${esc(question.highYieldReview)}</p></div></article>`;
  }).join("")}</section>`;
}

function isolateBackground() {
  const background = [...document.body.children].filter((element) => element !== modalRoot);
  isolatedBackground = background.map((element) => ({ element, ariaHidden: element.getAttribute("aria-hidden"), inert: element.inert }));
  isolatedBackground.forEach(({ element }) => { element.inert = true; element.setAttribute("aria-hidden", "true"); });
}

function restoreBackground() {
  isolatedBackground.forEach(({ element, ariaHidden, inert }) => {
    element.inert = inert;
    if (ariaHidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", ariaHidden);
  });
  isolatedBackground = [];
}

function closeModal() {
  const opener = modalOpener;
  const dialog = modalRoot.querySelector("dialog");
  modalOpener = null;
  if (dialog?.open) dialog.close();
  restoreBackground();
  modalRoot.replaceChildren();
  if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
}

function confirmModal({ title, body, actionLabel, onConfirm }) {
  closeModal();
  modalOpener = document.activeElement;
  modalRoot.innerHTML = `<dialog class="modal" aria-labelledby="modal-title" aria-describedby="modal-body"><h2 id="modal-title">${esc(title)}</h2><p id="modal-body">${esc(body)}</p><div class="modal-actions"><button type="button" data-modal-cancel>Cancel</button><button class="danger" type="button" data-modal-confirm>${esc(actionLabel)}</button></div></dialog>`;
  const dialog = modalRoot.querySelector("dialog");
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeModal(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeModal(); });
  dialog.querySelector("[data-modal-cancel]").addEventListener("click", closeModal);
  dialog.querySelector("[data-modal-confirm]").addEventListener("click", () => { closeModal(); onConfirm(); });
  isolateBackground();
  dialog.showModal();
  dialog.querySelector("[data-modal-confirm]").focus();
}

function restart(setId) {
  const meta = findSet(setId);
  const minutes = Math.round((meta?.durationSeconds ?? activeSet?.durationSeconds ?? 0) / 60);
  confirmModal({ title: `Restart ${setLabel(setId)}?`, body: `This clears all current answers and resets the ${minutes}-minute timer. Your latest completed score stays on the home screen.`, actionLabel: "Restart", onConfirm: () => openSet(setId, { fresh: true }) });
}

function submit() {
  const missing = unansweredIndices(activeSet.questions, attempt.answers);
  const finish = () => {
    const total = activeSet.questions.length;
    attempt.score = calculateScore(activeSet.questions, attempt.answers); attempt.submittedAt = Date.now();
    const summary = { score: attempt.score, total, percent: percentOf(attempt.score, total), completedAt: attempt.submittedAt };
    persist(); summaryStore.save(summary, activeSet.id);
    setStates[activeSet.id] = { attempt, summary };
    setRoute("review");
  };
  if (missing.length) confirmModal({ title: "Submit with unanswered questions?", body: `${missing.length} question${missing.length === 1 ? " is" : "s are"} unanswered. You can still submit and review every answer.`, actionLabel: "Submit exam", onConfirm: finish }); else finish();
}

function reconcileSubmittedAttempt() {
  if (!activeSet || !attempt?.submittedAt) return;
  const total = activeSet.questions.length;
  const score = calculateScore(activeSet.questions, attempt.answers);
  const summary = { score, total, percent: percentOf(score, total), completedAt: attempt.submittedAt };
  if (attempt.score !== score) { attempt = { ...attempt, score }; persist(); }
  const state = setStates[activeSet.id] || {};
  if (!state.summary || state.summary.score !== summary.score || state.summary.total !== summary.total || state.summary.percent !== summary.percent || state.summary.completedAt !== summary.completedAt) {
    summaryStore.save(summary, activeSet.id);
    setStates[activeSet.id] = { ...state, summary };
  }
}

function render() {
  reconcileSubmittedAttempt();
  const route = location.hash.slice(1) || "home";
  // Browser Back from the review screen lands on #exam with a submitted
  // attempt: the timer is frozen and every option is inert, so send it on to
  // the review it belongs to instead of rendering a dead exam.
  if (route === "exam" && attempt?.submittedAt) { setRoute("review"); return; }
  if (route === "exam") exam(); else if (route === "review" && attempt?.submittedAt) review(); else home();
  requestAnimationFrame(() => main.focus({ preventScroll: true }));
}

document.addEventListener("change", (event) => {
  if (event.target.name !== "answer" || !attempt || attempt.submittedAt) return;
  const next = recordAnswer(attempt, attempt.currentQuestion, event.target.value);
  if (next === attempt) return;
  attempt = next;
  persist();
  refreshAnswerState(event.target.value);
});
document.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action], [data-question]"); if (!control) return;
  if (control.dataset.question !== undefined) { attempt = navigateQuestion(attempt, control.dataset.question, activeSet.questions.length); persist(); exam(); return; }
  const setId = control.dataset.set;
  switch (control.dataset.action) {
    case "start": openSet(setId, { fresh: true }); break;
    case "resume": openSet(setId, {}); break;
    case "home": setRoute("home"); break;
    case "restart": restart(setId); break;
    case "previous": attempt = navigateQuestion(attempt, attempt.currentQuestion - 1, activeSet.questions.length); persist(); exam(); break;
    case "reveal": attempt = revealAnswer(attempt, attempt.currentQuestion); persist(); exam({ focusFeedback: true }); break;
    case "next": if (attempt.currentQuestion < activeSet.questions.length - 1) { attempt = navigateQuestion(attempt, attempt.currentQuestion + 1, activeSet.questions.length); persist(); exam(); } break;
    case "submit": submit(); break;
    case "sync-out": signOut(); break;
  }
});
document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-sync-form]")) return;
  event.preventDefault();
  const email = new FormData(event.target).get("email");
  syncNotice = "Sending link…"; renderSyncBar();
  sendMagicLink(email)
    .then(() => { syncNotice = "Check your email for a sign-in link."; renderSyncBar(); })
    .catch(() => { syncNotice = "Could not send the link. Try again later."; renderSyncBar(); });
});
// The clock is only honest while the exam is actually on screen: a hidden or
// closing tab pauses it, and reopening the exam resumes it via syncTimerState.
function pauseForAbsence() {
  if (!attempt || attempt.submittedAt || attempt.pausedAt) return;
  attempt = pauseTimer(attempt);
  persist();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopTimer(); pauseForAbsence(); return; }
  if (activeSet && attempt && !attempt.submittedAt && (location.hash.slice(1) || "home") === "exam") exam();
});
window.addEventListener("pagehide", pauseForAbsence);
window.addEventListener("hashchange", render);

async function boot() {
  await loadSetStates();
  const route = location.hash.slice(1) || "home";
  const savedSetId = (route === "exam" || route === "review") && await activeSetId.load();
  const stored = savedSetId && setStates[savedSetId]?.attempt;
  if (stored) {
    const loaded = await loadSet(savedSetId);
    if (loaded) { activeSet = loaded; attempt = sanitizeAttempt(stored, loaded.questionCount, Date.now(), loaded.id, loaded.durationSeconds); }
  }
  render();
}
boot();
getSession().then(afterAuthChange);
onAuthChange(afterAuthChange);
