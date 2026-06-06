/* ===================================================================== */
/* BossQuest — app.js                                                    */
/* ===================================================================== */

const MAX_HP = 100; // Boss HP updated to 100
const LESSON_EMOJIS = ["📖", "🔬", "🧮", "🌍", "🎨", "📐", "🧬", "💡", "🏛️", "🚀"];

const savedHp = localStorage.getItem("boss_hp");

const state = {
  bossHp: savedHp !== null ? Math.min(MAX_HP, parseInt(savedHp, 10)) : MAX_HP,
  quiz: [],
  currentQ: 0,
  score: 0,        
  xp: parseInt(localStorage.getItem("bq_xp") || "0", 10),           
  quizzesTaken: parseInt(localStorage.getItem("bq_quizzes_taken") || "0", 10),
  bestScore: localStorage.getItem("bq_best_score") !== null ? parseInt(localStorage.getItem("bq_best_score"), 10) : null, 
  cardsForged: 0,
  totalDamage: parseInt(localStorage.getItem("bq_total_damage") || "0", 10),
  currentFile: null,
  cards: {},       
  emojiIdx: 0,
  activeDbId: null
};

function updateBossHp() {
  if (els.hpCurrent) els.hpCurrent.textContent = state.bossHp;
  if (els.hpFill) {
    const pct = (state.bossHp / MAX_HP) * 100;
    els.hpFill.style.width = `${pct}%`;
  }
  localStorage.setItem("boss_hp", state.bossHp);
}

function updateStatsUI() {
  if (els.xpValue) els.xpValue.textContent = `${state.xp} XP`;
  if (els.statDamage) els.statDamage.textContent = state.totalDamage;
  if (els.statLessons) els.statLessons.textContent = state.quizzesTaken;
  if (els.statBest) els.statBest.textContent = state.bestScore !== null ? `${state.bestScore}%` : "0%";
}

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

function handleFileSelect(file) {
  if (!file) return;
  state.currentFile = file;
  els.fileConfirmName.textContent = file.name;
  els.fileConfirm.hidden = false;
  hideUploadStatus();
}

function showUploadStatus(text, isError = false) {
  els.uploadStatus.hidden = false;
  els.uploadStatus.classList.toggle("is-error", isError);
  els.uploadSpinner.style.display = isError ? "none" : "";
  els.uploadStatusText.textContent = text;
}

function hideUploadStatus() {
  els.uploadStatus.hidden = true;
}

async function uploadFile() {
  if (!state.currentFile) return;

  els.fileConfirm.hidden = true;
  showUploadStatus("Generating quiz…");

  const fd = new FormData();
  fd.append("file", state.currentFile);

  try {
    const res = await fetch("/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Upload processing error");

    const data = await res.json();
    log(`Uploaded <b>${data.filename}</b> and saved to database!`, "upload");

    // Instantly insert into side list without kicking you out of the view
    forgeLessonCard(data.db_id, data.filename, data.quiz, null);

    hideUploadStatus();
    state.currentFile = null;
    els.fileInput.value = "";
    bossSay("New lesson forged in the records! Click 'Fight' whenever you're ready! ⚔️");

  } catch (err) {
    showUploadStatus("Upload failed.", true);
    setTimeout(hideUploadStatus, 3000);
  }
}

function forgeLessonCard(dbId, filename, quizData, scorePct) {
  const emptyHint = document.getElementById("lessons-empty");
  if (emptyHint) {
    emptyHint.remove();
  }

  const card = document.createElement("div");
  card.className = "lesson-card";
  card.style.display = "flex";
  card.style.alignItems = "center";
  card.style.justifyContent = "space-between";
  card.style.padding = "10px";
  card.style.border = "1px solid #e5e5e5";
  card.style.borderRadius = "8px";
  card.style.marginBottom = "8px";
  card.style.background = "#fff";

  const display = filename.replace(/\.(txt|md)$/i, "");
  const hasScore = scorePct !== null && scorePct !== undefined;
  const isCompleted = scorePct === 100;
  
  let statusLabel = "Not Started";
  if (hasScore) {
    statusLabel = isCompleted ? "Completed (100%)" : `Attempted (${scorePct}%)`;
  }

  if (isCompleted) {
    card.classList.add("is-done");
  }

  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
      <span class="lesson-emoji">${nextEmoji()}</span>
      <div style="min-width: 0; flex: 1;">
        <div class="lesson-name" style="font-weight: 800; color: #3c3c3c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${filename}">${display}</div>
        <div class="lesson-sub" style="font-size: 11px; color: #777;">${statusLabel}</div>
      </div>
    </div>
    <div class="lesson-actions" style="display: flex; align-items: center; gap: 8px;">
      ${!isCompleted ? `<button class="btn btn-blue btn-sm fight-btn" type="button" style="padding: 4px 10px; font-size:12px;">Fight ⚔️</button>` : ''}
      ${isCompleted ? `<button class="delete-btn" type="button" style="background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px;" title="Delete Lesson">🗑️</button>` : ''}
    </div>
  `;

  if (!isCompleted) {
    card.querySelector(".fight-btn").addEventListener("click", () => {
      startQuiz(dbId, quizData, filename, card);
    });
  }

  if (isCompleted) {
    card.querySelector(".delete-btn").addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/quiz/${dbId}/delete`, { method: "POST" });
        if (res.ok) {
          card.remove();
          log(`Deleted <b>${filename}</b> from records.`, "delete");
          if (els.lessonList.children.length === 0) {
            els.lessonList.innerHTML = `<p class="empty-hint" id="lessons-empty">No lessons yet. Upload one to begin!</p>`;
          }
        }
      } catch (e) {
        console.error("Failed to delete lesson:", e);
      }
    });
  }

  els.lessonList.appendChild(card);
  state.cards[dbId] = card;
  return card;
}

function startQuiz(dbId, quiz, filename, card) {
  state.quiz = quiz;
  state.currentQ = 0;
  state.score = 0;
  state.activeCard = card;
  state.activeDbId = dbId;

  els.bossEntity.hidden = true;
  els.battleZone.hidden = false;

  els.pips.innerHTML = "";
  for (let i = 0; i < quiz.length; i++) {
    const pip = document.createElement("div");
    pip.className = "pip";
    els.pips.appendChild(pip);
  }
  renderQuestion();
}

function renderQuestion() {
  const q = state.quiz[state.currentQ];
  [...els.pips.children].forEach((pip, i) => {
    pip.className = "pip";
    if (i < state.currentQ) pip.classList.add("is-done");
    else if (i === state.currentQ) pip.classList.add("is-current");
  });

  els.qNumber.textContent = `QUESTION ${state.currentQ + 1}`;
  els.qText.textContent = q.question;
  els.feedback.hidden = true;
  els.continueBtn.hidden = true;

  els.options.innerHTML = "";
  ["A", "B", "C", "D"].forEach((letter) => {
    if (!(letter in q.options)) return;
    const btn = document.createElement("button");
    btn.className = "option";
    btn.type = "button";
    btn.innerHTML = `<span class="option-letter">${letter}</span><span class="option-text">${q.options[letter]}</span>`;
    btn.addEventListener("click", () => answerQuestion(letter, btn));
    els.options.appendChild(btn);
  });
}

function answerQuestion(letter, btn) {
  const q = state.quiz[state.currentQ];
  const correct = q.correct;
  const buttons = [...els.options.children];

  buttons.forEach((b) => (b.disabled = true));
  buttons.forEach((b) => {
    if (b.querySelector(".option-letter").textContent === correct) b.classList.add("is-correct");
  });

  const isCorrect = letter === correct;
  if (!isCorrect) btn.classList.add("is-wrong");

  els.feedback.hidden = false;
  if (isCorrect) {
    state.score += 1;
    els.feedback.className = "feedback is-correct";
    els.feedback.innerHTML = `<span>🎉 Correct! ${q.explanation}</span>`;
  } else {
    els.feedback.className = "feedback is-wrong";
    els.feedback.innerHTML = `<span>💡 Incorrect. Target answer was ${correct}. ${q.explanation}</span>`;
  }
  els.continueBtn.hidden = false;
}

function onContinue() {
  state.currentQ += 1;
  if (state.currentQ < state.quiz.length) {
    renderQuestion();
  } else {
    endQuiz();
  }
}

async function endQuiz() {
  const total = state.quiz.length;
  const scorePct = Math.round((state.score / total) * 100);
  const damage = calcDamage(scorePct);

  // Apply damage and update UI
  state.bossHp = Math.max(0, state.bossHp - damage);
  updateBossHp();

  els.battleZone.hidden = true;
  els.bossEntity.hidden = false;
  
  const isCompleted = scorePct === 100;

  // Update card UI according to finish score
  if (state.activeCard) {
    const subLabel = state.activeCard.querySelector(".lesson-sub");
    const actionBtn = state.activeCard.querySelector(".fight-btn");
    const actionsDiv = state.activeCard.querySelector(".lesson-actions");

    if (isCompleted) {
      state.activeCard.classList.add("is-done");
      if (subLabel) subLabel.textContent = `Completed (100%)`;
      if (actionBtn) actionBtn.remove();

      // Since they finished the lesson completely, render the delete button now
      if (actionsDiv && !actionsDiv.querySelector(".delete-btn")) {
        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.type = "button";
        delBtn.style.background = "none";
        delBtn.style.border = "none";
        delBtn.style.cursor = "pointer";
        delBtn.style.fontSize = "16px";
        delBtn.style.padding = "4px";
        delBtn.title = "Delete Lesson";
        delBtn.textContent = "🗑️";
        
        const dbId = state.activeDbId;
        delBtn.addEventListener("click", async () => {
          try {
            const res = await fetch(`/api/quiz/${dbId}/delete`, { method: "POST" });
            if (res.ok) {
              state.activeCard.remove();
              if (els.lessonList.children.length === 0) {
                els.lessonList.innerHTML = `<p class="empty-hint" id="lessons-empty">No lessons yet. Upload one to begin!</p>`;
              }
            }
          } catch (e) {
            console.error("Failed to delete lesson:", e);
          }
        });
        actionsDiv.appendChild(delBtn);
      }
    } else {
      if (subLabel) subLabel.textContent = `Attempted (${scorePct}%)`;
    }
  }

  // Update stats and save to localStorage
  state.xp += state.score * 20;
  state.totalDamage += damage;
  state.quizzesTaken += 1;
  if (state.bestScore === null || scorePct > state.bestScore) {
    state.bestScore = scorePct;
  }
  localStorage.setItem("bq_xp", state.xp);
  localStorage.setItem("bq_total_damage", state.totalDamage);
  localStorage.setItem("bq_quizzes_taken", state.quizzesTaken);
  localStorage.setItem("bq_best_score", state.bestScore);
  updateStatsUI();

  // Sync back to database
  try {
    await fetch(`/api/quiz/${state.activeDbId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score_pct: scorePct })
    });
  } catch (e) { console.error(e); }

  showResults(scorePct, damage);
}

function showResults(scorePct, damage) {
  els.resultsEmoji.textContent = scorePct >= 80 ? "🏆" : "📚";
  els.resultsTitle.textContent = scorePct >= 80 ? "Great job!" : "Keep learning!";
  els.resultsSub.textContent = `${state.score} out of ${state.quiz.length} correct`;
  els.scoreRingValue.textContent = `${scorePct}%`;
  els.chipDamage.textContent = `+${damage}`;
  els.overlay.hidden = false;
}

function closeResults() { 
  els.overlay.hidden = true; 
  if (state.bossHp === 0) {
    state.bossHp = MAX_HP;
    updateBossHp();
    bossSay("A new boss challenger has appeared! Let's see what you've got! ⚔️");
  }
}

els.chooseFileBtn.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (e) => handleFileSelect(e.target.files[0]));
els.startBtn.addEventListener("click", uploadFile);
els.continueBtn.addEventListener("click", onContinue);
els.resultsClose.addEventListener("click", closeResults);

// Load database contents cleanly on page initialization via API
async function loadLessons() {
  try {
    const res = await fetch("/api/lessons");
    if (!res.ok) return;
    
    const data = await res.json();
    if (data.lessons && data.lessons.length > 0) {
      data.lessons.forEach(item => {
        let qData = item.quiz_json;
        if (typeof qData === 'string') qData = JSON.parse(qData);
        forgeLessonCard(item.id, item.filename, qData, item.score_pct);
      });
    }
  } catch (e) {
    console.error("Failed to restore lessons from database:", e);
  }
}

// Automatically populate the list on page boot
updateBossHp();
updateStatsUI();
loadLessons();