import { questions } from "./questions.js";
import { attemptStore, summaryStore } from "./storage.js";
import { answeredCount, calculateScore, createAttempt, formatCountdown, getReviewStatus, getTimeRemaining, isRevealed, navigateQuestion, pauseTimer, recordAnswer, resumeTimer, revealAnswer, sanitizeAttempt, unansweredIndices } from "./logic.js";
import { getSession, isSyncConfigured, onAuthChange, sendMagicLink, signOut } from "./sync.js";

const main = document.querySelector("#app-main");
const modalRoot = document.querySelector("#modal-root");
const syncBar = document.querySelector("#sync-bar");
let attempt = null;
let latestSummary = null;
let timer = null;
let modalOpener = null;
let isolatedBackground = [];
let syncSession = null;
let syncNotice = "";

const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const persist = () => attemptStore.save(attempt);
const setRoute = (route) => { location.hash = route; };
const progress = () => answeredCount(attempt?.answers || {});
const formatExamYears = (examYears) => `Exam year${examYears.length === 1 ? "" : "s"}: ${examYears.join(", ")}`;

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
    if (label) label.textContent = paused ? "Paused" : "Time";
    document.querySelector(".timer")?.classList.toggle("paused", paused);
  };
  update();
  timer = window.setInterval(update, 1000);
}

function renderSyncBar() {
  if (!syncBar || !isSyncConfigured()) return;
  syncBar.innerHTML = syncSession
    ? `<span>Synced as ${esc(syncSession.user.email)}</span><button class="text-button" data-action="sync-out">Sign out</button>`
    : `<form data-sync-form><label class="sr-only" for="sync-email">Email for sign-in link</label><input id="sync-email" type="email" name="email" placeholder="you@example.com" required/><button class="text-button" type="submit">Sync across devices</button></form>${syncNotice ? `<p class="sync-notice">${esc(syncNotice)}</p>` : ""}`;
}

function afterAuthChange(session) {
  syncSession = session;
  renderSyncBar();
  if (!session) return;
  Promise.all([attemptStore.load(), summaryStore.load()]).then(([savedAttempt, summary]) => {
    attempt = savedAttempt ? sanitizeAttempt(savedAttempt, questions.length) : null;
    latestSummary = summary;
    render();
  });
}

function home() {
  stopTimer();
  if (attempt && !attempt.submittedAt && attempt.pausedAt) { attempt = resumeTimer(attempt); persist(); }
  const active = attempt && !attempt.submittedAt;
  const storedProgress = active ? progress() : 0;
  const last = latestSummary ? `${latestSummary.score}/${questions.length} (${latestSummary.percent}%)` : "No completed attempt yet";
  main.innerHTML = `
    <section class="hero"><p class="eyebrow">ENT R1 · Basic Science</p><h1>Mock examinations</h1><p>Focused single-best-answer practice in a calm, exam-like workspace.</p></section>
    <section class="sets" aria-label="Available mock sets">
      <article class="set-card active-card"><div class="set-card-top"><span class="set-label">Set 02</span><span class="status">Active</span></div><h2>Basic Science Mock</h2><p>61 questions · 90 minutes · fixed order</p>${active ? `<div class="card-progress"><span>${storedProgress} of ${questions.length} answered</span><div class="progress-track"><i style="width:${storedProgress / questions.length * 100}%"></i></div></div>` : ""}<p class="latest-score">Latest score: ${esc(last)}</p><button class="primary" data-action="${active ? "resume" : "start"}">${active ? "Resume attempt" : "Start Set 02"}</button>${active ? '<button class="text-button" data-action="restart">Restart attempt</button>' : ""}</article>
      ${["03", "04"].map((set) => `<article class="set-card disabled-card" aria-label="Set ${set}, coming soon and unavailable"><div class="set-card-top"><span class="set-label">Set ${set}</span><span class="status muted">Coming soon</span></div><h2>Basic Science Mock</h2><p>New question set in preparation.</p><button disabled>Coming soon — unavailable</button></article>`).join("")}
    </section>`;
}

function syncTimerState() {
  if (!attempt || attempt.submittedAt) return;
  const next = isRevealed(attempt, attempt.currentQuestion) ? pauseTimer(attempt) : resumeTimer(attempt);
  if (next !== attempt) { attempt = next; persist(); }
}

function optionMarkup(question, index, selected, revealed) {
  return question.choices.map((choice) => {
    const isSelected = selected === choice.label;
    const isAnswer = question.correctAnswer === choice.label;
    const state = revealed ? (isAnswer ? " is-correct" : isSelected ? " is-wrong" : "") : "";
    const tag = revealed && isAnswer ? '<span class="option-tag">Correct answer</span>' : revealed && isSelected ? '<span class="option-tag">Your answer</span>' : "";
    return `<label class="option ${isSelected ? "selected" : ""}${state}"><input type="radio" name="answer" value="${choice.label}" ${isSelected ? "checked" : ""} ${revealed ? "disabled" : ""}/><span class="choice-letter">${choice.label}</span><span>${esc(choice.text)}</span>${tag}</label>`;
  }).join("");
}

function feedbackMarkup(question, selected) {
  const correct = selected === question.correctAnswer;
  const answerText = question.choices.find((item) => item.label === question.correctAnswer)?.text || "";
  return `<section class="feedback ${correct ? "correct" : "incorrect"}" data-feedback tabindex="-1" aria-label="Answer feedback">
      <div class="feedback-head"><strong>${correct ? "Correct" : "Incorrect"}</strong><span class="feedback-paused">Timer paused</span></div>
      ${correct ? "" : `<p class="feedback-answer">Correct answer: <strong>${esc(question.correctAnswer)}. ${esc(answerText)}</strong></p>`}
      <div class="review-note"><strong>Explanation</strong><p>${esc(question.explanation)}</p></div>
    </section>`;
}

function navigatorMarkup(index) {
  return questions.map((question, itemIndex) => {
    const answer = attempt.answers[itemIndex];
    const revealed = isRevealed(attempt, itemIndex);
    const state = revealed ? (answer === question.correctAnswer ? "correct" : "incorrect") : answer ? "answered" : "";
    const label = revealed ? (state === "correct" ? ", answered correctly" : ", answered incorrectly") : answer ? ", answer selected" : ", unanswered";
    return `<button class="nav-question ${itemIndex === index ? "current" : ""} ${state}" aria-label="Question ${itemIndex + 1}${label}" aria-current="${itemIndex === index ? "step" : "false"}" data-question="${itemIndex}">${itemIndex + 1}</button>`;
  }).join("");
}

function exam({ focusAnswer, focusFeedback } = {}) {
  if (!attempt) attempt = createAttempt();
  syncTimerState();
  const index = attempt.currentQuestion;
  const question = questions[index];
  const selected = attempt.answers[index];
  const revealed = isRevealed(attempt, index);
  const isLast = index === questions.length - 1;
  const complete = progress();
  const primary = revealed
    ? `<button class="primary" data-action="${isLast ? "submit" : "next"}">${isLast ? "Finish exam" : "Next question →"}</button>`
    : `<button class="primary" data-action="reveal" ${selected ? "" : "disabled"}>Submit answer</button>`;
  main.innerHTML = `
    <section class="exam-head"><button class="back-button" data-action="home">← Exit to home</button><div class="timer"><span data-timer-label>Time</span><strong data-countdown></strong></div></section>
    <div class="exam-progress" aria-label="${complete} of ${questions.length} questions answered"><div><span>Question ${index + 1} of ${questions.length}</span><span>${complete} answered</span></div><div class="progress-track"><i style="width:${(index + 1) / questions.length * 100}%"></i></div></div>
    <article class="question-card ${revealed ? "revealed" : ""}"><div class="question-meta"><p class="topic">${esc(question.topic)}</p><p class="exam-years">${formatExamYears(question.examYears)}</p></div><h1>${esc(question.question)}</h1><fieldset ${revealed ? "disabled" : ""}><legend class="sr-only">Choose one answer</legend>${optionMarkup(question, index, selected, revealed)}</fieldset>${revealed ? feedbackMarkup(question, selected) : ""}</article>
    <nav class="exam-actions" aria-label="Question navigation"><button data-action="previous" ${index === 0 ? "disabled" : ""}>Previous</button>${primary}</nav>
    <section class="navigator"><div class="navigator-title"><h2>Question navigator</h2><button class="text-button" data-action="submit">Submit exam</button></div><div class="question-grid">${navigatorMarkup(index)}</div></section>`;
  startTimer();
  if (focusFeedback) requestAnimationFrame(() => main.querySelector("[data-feedback]")?.focus());
  else if (focusAnswer) requestAnimationFrame(() => main.querySelector(`input[name="answer"][value="${focusAnswer}"]`)?.focus());
}

function review() {
  stopTimer();
  const score = calculateScore(questions, attempt.answers);
  if (attempt.score !== score) { attempt = { ...attempt, score }; persist(); }
  const percentage = Math.round(score / questions.length * 100);
  main.innerHTML = `<section class="results-head"><p class="eyebrow">Set 02 completed</p><h1>${score} / ${questions.length}</h1><p>${percentage}% correct · Your full answer review is below.</p><button class="primary" data-action="home">Return home</button><button class="text-button" data-action="restart">Start a fresh attempt</button></section><section class="review-list" aria-label="Answer review">${questions.map((question, index) => {
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

function restart() {
  confirmModal({ title: "Restart Set 02?", body: "This clears all current answers and resets the 90-minute timer. Your latest completed score stays on the home screen.", actionLabel: "Restart", onConfirm: () => { attempt = createAttempt(); persist(); setRoute("exam"); } });
}

function submit() {
  const missing = unansweredIndices(questions, attempt.answers);
  const finish = () => {
    attempt.score = calculateScore(questions, attempt.answers); attempt.submittedAt = Date.now();
    latestSummary = { score: attempt.score, percent: Math.round(attempt.score / questions.length * 100), completedAt: attempt.submittedAt };
    persist(); summaryStore.save(latestSummary); setRoute("review");
  };
  if (missing.length) confirmModal({ title: "Submit with unanswered questions?", body: `${missing.length} question${missing.length === 1 ? " is" : "s are"} unanswered. You can still submit and review every answer.`, actionLabel: "Submit exam", onConfirm: finish }); else finish();
}

function reconcileSubmittedAttempt() {
  if (!attempt?.submittedAt) return;
  const score = calculateScore(questions, attempt.answers);
  const summary = { score, percent: Math.round(score / questions.length * 100), completedAt: attempt.submittedAt };
  if (attempt.score !== score) { attempt = { ...attempt, score }; persist(); }
  if (!latestSummary || latestSummary.score !== summary.score || latestSummary.percent !== summary.percent || latestSummary.completedAt !== summary.completedAt) {
    latestSummary = summary;
    summaryStore.save(summary);
  }
}

function render() {
  reconcileSubmittedAttempt();
  const route = location.hash.slice(1) || "home";
  if (route === "exam") exam(); else if (route === "review" && attempt?.submittedAt) review(); else home();
  requestAnimationFrame(() => main.focus());
}

document.addEventListener("change", (event) => {
  if (event.target.name === "answer" && attempt && !attempt.submittedAt) { attempt = recordAnswer(attempt, attempt.currentQuestion, event.target.value); persist(); exam({ focusAnswer: event.target.value }); }
});
document.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action], [data-question]"); if (!control) return;
  if (control.dataset.question !== undefined) { attempt = navigateQuestion(attempt, control.dataset.question, questions.length); persist(); exam(); return; }
  switch (control.dataset.action) {
    case "start": attempt = createAttempt(); persist(); setRoute("exam"); break;
    case "resume": setRoute("exam"); break;
    case "home": setRoute("home"); break;
    case "restart": restart(); break;
    case "previous": attempt = navigateQuestion(attempt, attempt.currentQuestion - 1, questions.length); persist(); exam(); break;
    case "reveal": attempt = revealAnswer(attempt, attempt.currentQuestion); persist(); exam({ focusFeedback: true }); break;
    case "next": if (attempt.currentQuestion < questions.length - 1) { attempt = navigateQuestion(attempt, attempt.currentQuestion + 1, questions.length); persist(); exam(); } break;
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
window.addEventListener("hashchange", render);

Promise.all([attemptStore.load(), summaryStore.load()]).then(([savedAttempt, summary]) => { attempt = sanitizeAttempt(savedAttempt, questions.length); latestSummary = summary; if (!savedAttempt) attempt = null; render(); });
getSession().then(afterAuthChange);
onAuthChange(afterAuthChange);
