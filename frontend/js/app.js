/* ===================================================================== */
/*  BossQuest — app.js                                                    */
/* ===================================================================== */

const MAX_HP = 1000;
const LESSON_EMOJIS = ["📖", "🔬", "🧮", "🌍", "🎨", "📐", "🧬", "💡", "🏛️", "🚀"];

const state = {
  bossHp: MAX_HP,
  quiz: [],
  currentQ: 0,
  score: 0,        // correct answers in the current quiz
  xp: 0,           // cumulative
  quizzesTaken: 0,
  bestScore: null, // best score % seen so far
  cardsForged: 0,
  totalDamage: 0,
  currentFile: null,
  cards: {},       // filename -> card DOM element
  emojiIdx: 0,
};

/* ---------------------------- DOM refs ------------------------------- */
const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $("file-input"),
  chooseFileBtn: $("choose-file-btn"),
  uploadZone: $("upload-zone"),
  fileConfirm: $("file-confirm"),
  fileConfirmName: $("file-confirm-name"),
  startBtn: $("start-btn"),
  uploadStatus: $("upload-status"),
  uploadStatusText: $("upload-status-text"),
  uploadSpinner: $("upload-spinner"),
  lessonList: $("lesson-list"),
  lessonsEmpty: $("lessons-empty"),

  bossEntity: $("boss-entity"),
  bossSvgWrap: $("boss-svg-wrap"),
  bossName: $("boss-name"),
  speechBubble: $("speech-bubble"),
  hpFill: $("hp-fill"),
  hpCurrent: $("hp-current"),

  battleZone: $("battle-zone"),
  pips: $("pips"),
  qNumber: $("q-number"),
  qText: $("q-text"),
  options: $("options"),
  feedback: $("feedback"),
  continueBtn: $("continue-btn"),

  xpValue: $("xp-value"),
  statStreak: $("stat-streak"),
  statDamage: $("stat-damage"),
  statBest: $("stat-best"),
  statLessons: $("stat-lessons"),
  combatLog: $("combat-log"),

  overlay: $("results-overlay"),
  resultsEmoji: $("results-emoji"),
  resultsTitle: $("results-title"),
  resultsSub: $("results-sub"),
  scoreRing: $("score-ring"),
  scoreRingValue: $("score-ring-value"),
  chipDamage: $("chip-damage"),
  chipXp: $("chip-xp"),
  resultsClose: $("results-close"),
};

/* ===================================================================== */
/*  Helpers                                                               */
/* ===================================================================== */
function bossSay(text) {
  els.speechBubble.textContent = text;
}

function nextEmoji() {
  const e = LESSON_EMOJIS[state.emojiIdx % LESSON_EMOJIS.length];
  state.emojiIdx += 1;
  return e;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function log(message, type = "") {
  const entry = document.createElement("div");
  entry.className = "log-entry" + (type ? ` log-${type}` : "");
  entry.innerHTML = `<span class="log-time">${now()}</span>${message}`;
  els.combatLog.appendChild(entry);
  els.combatLog.scrollTop = els.combatLog.scrollHeight;
}

function calcDamage(scorePct) {
  if (scorePct >= 100) return 150;
  if (scorePct >= 80) return 100;
  if (scorePct >= 60) return 60;
  if (scorePct >= 40) return 20;
  return 0;
}

function updateXpDisplay() {
  els.xpValue.textContent = `${state.xp} XP`;
}

/* ===================================================================== */
/*  Upload flow                                                          */
/* ===================================================================== */
function handleFileSelect(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith(".txt") && !name.endsWith(".md")) {
    showUploadStatus("Only .txt or .md files are allowed.", true);
    setTimeout(hideUploadStatus, 3000);
    return;
  }
  state.currentFile = file;
  els.fileConfirmName.textContent = file.name;
  els.fileConfirm.hidden = false;
  hideUploadStatus();
  bossSay("Pfft, you think THAT lesson will beat me? Bring it on! 😈");
}

function showUploadStatus(text, isError = false) {
  els.uploadStatus.hidden = false;
  els.uploadStatus.classList.toggle("is-error", isError);
  els.uploadSpinner.style.display = isError ? "none" : "";
  els.uploadStatusText.textContent = text;
}
function hideUploadStatus() {
  els.uploadStatus.hidden = true;
  els.uploadStatus.classList.remove("is-error");
  els.uploadSpinner.style.display = "";
}

async function uploadFile() {
  if (!state.currentFile) return;

  els.fileConfirm.hidden = true;
  showUploadStatus("Generating quiz…");

  const fd = new FormData();
  fd.append("file", state.currentFile);

  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    if (!res.ok) {
      let detail = `Upload failed (${res.status})`;
      try {
        const err = await res.json();
        if (err.detail) detail = err.detail;
      } catch (_) { /* ignore */ }
      throw new Error(detail);
    }

    const data = await res.json();
    log(`Uploaded <b>${data.filename}</b> (${data.char_count} chars)`, "upload");

    const card = forgeLessonCard(data.filename);
    hideUploadStatus();

    setTimeout(() => {
      els.fileConfirm.hidden = true;
      state.currentFile = null;
      els.fileInput.value = "";
      startQuiz(data.quiz, data.filename, card);
    }, 700);

  } catch (err) {
    showUploadStatus(err.message || "Something went wrong.", true);
    setTimeout(hideUploadStatus, 3000);
  }
}

/* ===================================================================== */
/*  Lesson cards                                                          */
/* ===================================================================== */
function forgeLessonCard(filename) {
  if (els.lessonsEmpty) els.lessonsEmpty.remove();

  const card = document.createElement("div");
  card.className = "lesson-card";
  const display = filename.replace(/\.(txt|md)$/i, "");
  card.innerHTML = `
    <span class="lesson-emoji">${nextEmoji()}</span>
    <div class="lesson-body">
      <div class="lesson-name" title="${filename}">${display}</div>
      <span class="lesson-badge badge-progress">In Progress</span>
      <div class="lesson-sub">No damage yet</div>
    </div>
  `;
  els.lessonList.appendChild(card);
  state.cards[filename] = card;
  state.cardsForged += 1;
  return card;
}

function updateCard(card, scorePct, damage) {
  if (!card) return;
  card.classList.add("is-done");
  const badge = card.querySelector(".lesson-badge");
  badge.className = "lesson-badge badge-done";
  badge.textContent = `${scorePct}%`;
  card.querySelector(".lesson-sub").textContent = `${damage} damage dealt`;
}

/* ===================================================================== */
/*  Quiz flow                                                            */
/* ===================================================================== */
function startQuiz(quiz, filename, card) {
  state.quiz = quiz;
  state.currentQ = 0;
  state.score = 0;
  state.activeCard = card;

  els.bossEntity.hidden = true;
  els.battleZone.hidden = false;

  // build pips
  els.pips.innerHTML = "";
  for (let i = 0; i < quiz.length; i++) {
    const pip = document.createElement("div");
    pip.className = "pip";
    els.pips.appendChild(pip);
  }

  log(`Battle started: <b>${filename}</b>`, "upload");
  renderQuestion();
}

function renderQuestion() {
  const q = state.quiz[state.currentQ];

  // pips
  [...els.pips.children].forEach((pip, i) => {
    pip.className = "pip";
    if (i < state.currentQ) pip.classList.add("is-done");
    else if (i === state.currentQ) pip.classList.add("is-current");
  });

  els.qNumber.textContent = `QUESTION ${state.currentQ + 1}`;
  els.qText.textContent = q.question;

  els.feedback.hidden = true;
  els.feedback.className = "feedback";
  els.continueBtn.hidden = true;

  els.options.innerHTML = "";
  ["A", "B", "C", "D"].forEach((letter) => {
    if (!(letter in q.options)) return;
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.innerHTML = `
      <span class="option-letter">${letter}</span>
      <span class="option-text">${q.options[letter]}</span>
    `;
    btn.addEventListener("click", () => answerQuestion(letter, btn));
    els.options.appendChild(btn);
  });
}

function answerQuestion(letter, btn) {
  const q = state.quiz[state.currentQ];
  const correct = q.correct;
  const buttons = [...els.options.children];

  // lock all options
  buttons.forEach((b) => (b.disabled = true));

  // mark correct answer (and the wrong pick, if any)
  buttons.forEach((b) => {
    const l = b.querySelector(".option-letter").textContent;
    if (l === correct) b.classList.add("is-correct");
  });

  const isCorrect = letter === correct;
  if (!isCorrect) btn.classList.add("is-wrong");

  // feedback strip
  els.feedback.hidden = false;
  if (isCorrect) {
    state.score += 1;
    els.feedback.className = "feedback is-correct";
    els.feedback.innerHTML =
      `<span class="feedback-icon">🎉</span><span>${q.explanation}</span>`;
    log(`Q${state.currentQ + 1}: correct ✅`, "correct");
  } else {
    els.feedback.className = "feedback is-wrong";
    els.feedback.innerHTML =
      `<span class="feedback-icon">💡</span><span>Not quite! The answer was ${correct}. ${q.explanation}</span>`;
    log(`Q${state.currentQ + 1}: wrong ❌`, "wrong");
  }

  els.continueBtn.hidden = false;
  els.continueBtn.textContent =
    state.currentQ === state.quiz.length - 1 ? "See Results →" : "Continue →";
}

function onContinue() {
  state.currentQ += 1;
  if (state.currentQ < state.quiz.length) {
    renderQuestion();
  } else {
    endQuiz();
  }
}

function endQuiz() {
  const total = state.quiz.length;
  const scorePct = Math.round((state.score / total) * 100);
  const damage = calcDamage(scorePct);
  const xpGained = state.score * 10 + (scorePct === 100 ? 25 : 0);

  // update cumulative state
  state.quizzesTaken += 1;
  state.totalDamage += damage;
  state.xp += xpGained;
  if (state.bestScore === null || scorePct > state.bestScore) state.bestScore = scorePct;

  state.bossHp = Math.max(0, state.bossHp - damage);

  // back to idle boss view
  els.battleZone.hidden = true;
  els.bossEntity.hidden = false;

  updateBossHp(damage);
  updateCard(state.activeCard, scorePct, damage);
  updateStats();
  setBossReaction(scorePct, damage);

  // log
  if (damage > 0) log(`Dealt <b>${damage}</b> damage to the boss!`, "damage");
  log(`Quiz complete: ${state.score}/${total} (${scorePct}%) · +${xpGained} XP`, "");

  showResults(scorePct, damage, xpGained);
}

/* ===================================================================== */
/*  Boss HP + reactions                                                  */
/* ===================================================================== */
function updateBossHp(damage) {
  const pct = (state.bossHp / MAX_HP) * 100;
  els.hpFill.style.width = `${pct}%`;
  els.hpCurrent.textContent = state.bossHp;

  if (damage > 0) {
    els.bossSvgWrap.classList.remove("hit");
    void els.bossSvgWrap.offsetWidth; // force reflow to retrigger keyframe
    els.bossSvgWrap.classList.add("hit");
  }
}

function setBossReaction(scorePct, damage) {
  if (state.bossHp <= 0) {
    bossSay("NOOOO… You actually beat me! I'll be back though… 😭");
    return;
  }
  if (scorePct >= 100) {
    bossSay("PERFECT SCORE?! That's not fair!! 😤");
  } else if (scorePct >= 80) {
    bossSay(`Ow! ${damage} damage! You're pretty good… 😠`);
  } else if (scorePct >= 60) {
    bossSay(`Only ${damage} damage? You can do better! 😏`);
  } else {
    bossSay("Hehe, you need to study more! 😈");
  }
}

/* ===================================================================== */
/*  Stats                                                                 */
/* ===================================================================== */
function updateStats() {
  els.statStreak.textContent = state.quizzesTaken;
  els.statDamage.textContent = state.totalDamage;
  els.statBest.textContent = state.bestScore === null ? "—" : `${state.bestScore}%`;
  els.statLessons.textContent = state.quizzesTaken;
  updateXpDisplay();
}

/* ===================================================================== */
/*  Results overlay                                                       */
/* ===================================================================== */
function showResults(scorePct, damage, xpGained) {
  let emoji, title, ring;
  if (scorePct >= 100) { emoji = "🏆"; title = "PERFECT!";       ring = "ring-green"; }
  else if (scorePct >= 80) { emoji = "⭐"; title = "Great job!";  ring = "ring-green"; }
  else if (scorePct >= 60) { emoji = "👏"; title = "Good work!";  ring = "ring-yellow"; }
  else { emoji = "📚"; title = "Keep studying!"; ring = "ring-red"; }

  els.resultsEmoji.textContent = emoji;
  els.resultsTitle.textContent = title;
  els.resultsSub.textContent = `${state.score} out of ${state.quiz.length} correct`;
  els.scoreRing.className = `score-ring ${ring}`;
  els.scoreRingValue.textContent = `${scorePct}%`;
  els.chipDamage.textContent = `+${damage}`;
  els.chipXp.textContent = `+${xpGained}`;

  els.overlay.hidden = false;

  if (scorePct >= 80) launchConfetti();
}

function closeResults() {
  els.overlay.hidden = true;
}

/* ===================================================================== */
/*  Confetti                                                              */
/* ===================================================================== */
function launchConfetti() {
  const colors = ["#58cc02", "#1cb0f6", "#ce82ff", "#ffc800", "#ff4b4b", "#ff9600"];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const c = document.createElement("div");
      c.className = "confetti";
      const size = 6 + Math.random() * 8;
      c.style.left = `${Math.random() * 100}vw`;
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      c.style.animationDuration = `${1.5 + Math.random() * 2}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }, i * 30);
  }
}

/* ===================================================================== */
/*  Event wiring                                                          */
/* ===================================================================== */
els.chooseFileBtn.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (e) => handleFileSelect(e.target.files[0]));
els.startBtn.addEventListener("click", uploadFile);
els.continueBtn.addEventListener("click", onContinue);
els.resultsClose.addEventListener("click", closeResults);

// drag & drop
["dragenter", "dragover"].forEach((evt) =>
  els.uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.uploadZone.classList.add("is-drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  els.uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.uploadZone.classList.remove("is-drag");
  })
);
els.uploadZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  handleFileSelect(file);
});

// nav tabs (cosmetic for now)
document.querySelectorAll(".nav-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
  });
});

// init
updateStats();
