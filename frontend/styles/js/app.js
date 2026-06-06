/* ═══════════════════════════════════════════════
   BOSSQUEST — Frontend App Logic
   Handles: upload, quiz flow, boss HP, combat log
═══════════════════════════════════════════════ */

const BOSS_MAX_HP = 1000;

const state = {
  bossHp: BOSS_MAX_HP,
  quiz: [],
  currentQ: 0,
  score: 0,
  xp: 0,
  quizzesTaken: 0,
  bestScore: null,
  cardsForged: 0,
  totalDamage: 0,
  currentFile: null,
};

// ── DOM Refs ──────────────────────────────────
const fileInput       = document.getElementById('file-input');
const uploadZone      = document.getElementById('upload-zone');
const uploadBtn       = document.getElementById('upload-btn');
const fileSelected    = document.getElementById('file-selected');
const fileNameDisplay = document.getElementById('file-name-display');
const castBtn         = document.getElementById('cast-btn');
const uploadStatus    = document.getElementById('upload-status');
const statusText      = document.getElementById('status-text');

const bossSprite      = document.getElementById('boss-sprite');
const bossName        = document.getElementById('boss-name');
const bossSpeech      = document.getElementById('boss-speech');
const hpFill          = document.getElementById('hp-fill');
const hpNumbers       = document.getElementById('hp-numbers');

const bossEntity      = document.getElementById('boss-entity');
const battleZone      = document.getElementById('battle-zone');
const battleProgress  = document.getElementById('battle-progress');
const questionText    = document.getElementById('question-text');
const optionsGrid     = document.getElementById('options-grid');
const questionFeedback= document.getElementById('question-feedback');
const nextBtn         = document.getElementById('next-btn');

const cardGrid        = document.getElementById('card-grid');
const cardEmpty       = document.getElementById('card-empty');

const combatLog       = document.getElementById('combat-log');
const xpDisplay       = document.getElementById('xp-display');

const resultsOverlay  = document.getElementById('results-overlay');
const resultsHeader   = document.getElementById('results-header');
const resultsScore    = document.getElementById('results-score');
const resultsDamage   = document.getElementById('results-damage');
const resultsBreakdown= document.getElementById('results-breakdown');
const closeResultsBtn = document.getElementById('close-results-btn');

const totalDamageEl   = document.getElementById('total-damage');
const quizCountEl     = document.getElementById('quiz-count');
const bestScoreEl     = document.getElementById('best-score');
const cardsForgedEl   = document.getElementById('cards-forged');

// ── File Upload Handling ──────────────────────

uploadZone.addEventListener('click', () => fileInput.click());
uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
    addLog('Only .txt and .md files are supported.', 'log-wrong');
    return;
  }
  state.currentFile = file;
  fileNameDisplay.textContent = file.name;
  fileSelected.style.display = 'flex';
  bossSpeech.innerHTML = `<em>"A scroll named <strong>${file.name}</strong>… Interesting. Cast the spell when ready."</em>`;
}

castBtn.addEventListener('click', uploadFile);

async function uploadFile() {
  if (!state.currentFile) return;

  // Show loading state
  uploadStatus.style.display = 'flex';
  statusText.textContent = 'Consulting the Oracle…';
  castBtn.disabled = true;
  castBtn.textContent = '⏳ Casting…';

  const formData = new FormData();
  formData.append('file', state.currentFile);

  try {
    statusText.textContent = 'Sending scroll to Claude AI…';
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Upload failed');
    }

    statusText.textContent = 'Quiz forged! Preparing battle…';
    addLog(`📄 Scroll uploaded: "${state.currentFile.name}"`, 'log-upload');
    addLog(`🤖 Claude generated ${data.quiz.length} questions.`, 'log-upload');

    // Forge a lesson card
    forgeCard(state.currentFile.name, data.quiz.length);

    // Hide upload UI, start quiz
    setTimeout(() => {
      uploadStatus.style.display = 'none';
      fileSelected.style.display = 'none';
      fileInput.value = '';
      castBtn.disabled = false;
      castBtn.textContent = '⚡ Cast Spell';
      state.currentFile = null;
      startQuiz(data.quiz, data.filename);
    }, 800);

  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
    addLog(`❌ ${err.message}`, 'log-wrong');
    castBtn.disabled = false;
    castBtn.textContent = '⚡ Cast Spell';
    setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);
  }
}

// ── Card Forging ──────────────────────────────

function forgeCard(filename, questionCount) {
  state.cardsForged++;
  cardsForgedEl.textContent = state.cardsForged;
  cardEmpty.style.display = 'none';

  const cardName = filename.replace(/\.(txt|md)$/, '');
  const card = document.createElement('div');
  card.className = 'lesson-card';
  card.innerHTML = `
    <div class="lc-top">
      <span class="lc-icon">📖</span>
      <span class="lc-name" title="${cardName}">${cardName}</span>
      <span class="lc-dmg">⚔ ?</span>
    </div>
    <div class="lc-status">Quiz in progress…</div>
  `;
  card.id = `card-${state.cardsForged}`;
  cardGrid.appendChild(card);
  return card;
}

function updateCard(cardIndex, damage, score) {
  const card = document.getElementById(`card-${cardIndex}`);
  if (!card) return;
  card.querySelector('.lc-dmg').textContent = `⚔ ${damage}`;
  card.querySelector('.lc-status').textContent = `Score: ${score}% · Done`;
  card.classList.add('active');
}

// ── Quiz Flow ─────────────────────────────────

function startQuiz(quiz, filename) {
  state.quiz = quiz;
  state.currentQ = 0;
  state.score = 0;

  // Show battle zone, collapse boss idle message
  bossEntity.style.display = 'none';
  battleZone.style.display = 'block';

  bossSpeech.innerHTML = `<em>"So the challenge begins. Answer wisely, scholar…"</em>`;
  addLog(`⚔ Battle started: "${filename}"`, 'log-upload');

  renderQuestion();
}

function renderQuestion() {
  const q = state.quiz[state.currentQ];
  battleProgress.textContent = `Question ${state.currentQ + 1} of ${state.quiz.length}`;
  questionText.textContent = q.question;
  questionFeedback.style.display = 'none';
  questionFeedback.className = 'question-feedback';
  nextBtn.style.display = 'none';

  optionsGrid.innerHTML = '';
  for (const [letter, text] of Object.entries(q.options)) {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `<span class="opt-letter">${letter}</span><span>${text}</span>`;
    btn.addEventListener('click', () => answerQuestion(letter, btn));
    optionsGrid.appendChild(btn);
  }
}

function answerQuestion(chosen, clickedBtn) {
  const q = state.quiz[state.currentQ];
  const correct = q.correct;
  const isCorrect = chosen === correct;

  // Disable all options
  optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    const letter = btn.querySelector('.opt-letter').textContent;
    if (letter === correct) btn.classList.add('correct');
    else if (letter === chosen && !isCorrect) btn.classList.add('wrong');
  });

  // Show feedback
  questionFeedback.style.display = 'block';
  if (isCorrect) {
    state.score++;
    questionFeedback.className = 'question-feedback correct-fb';
    questionFeedback.textContent = `✓ Correct! ${q.explanation}`;
    addLog(`✓ Q${state.currentQ + 1}: Correct`, 'log-correct');
  } else {
    questionFeedback.className = 'question-feedback wrong-fb';
    questionFeedback.textContent = `✗ Wrong. The answer was ${correct}. ${q.explanation}`;
    addLog(`✗ Q${state.currentQ + 1}: Wrong (was ${correct})`, 'log-wrong');
  }

  nextBtn.style.display = 'block';
}

nextBtn.addEventListener('click', () => {
  state.currentQ++;
  if (state.currentQ < state.quiz.length) {
    renderQuestion();
  } else {
    endQuiz();
  }
});

function endQuiz() {
  const total = state.quiz.length;
  const pct = Math.round((state.score / total) * 100);
  const damage = calcDamage(pct);

  // Update boss HP
  state.bossHp = Math.max(0, state.bossHp - damage);
  state.totalDamage += damage;
  state.quizzesTaken++;
  state.xp += pct;

  if (state.bestScore === null || pct > state.bestScore) state.bestScore = pct;

  // Update stats
  totalDamageEl.textContent = state.totalDamage;
  quizCountEl.textContent = state.quizzesTaken;
  bestScoreEl.textContent = state.bestScore + '%';
  xpDisplay.textContent = state.xp + ' XP';

  // Update card
  updateCard(state.cardsForged, damage, pct);

  // Animate boss
  updateBossHp(damage, pct);

  // Log
  addLog(`⚔ Battle complete! Score: ${pct}% → ${damage} damage dealt`, 'log-damage');

  // Show results overlay
  showResults(pct, damage, total);

  // Return to boss view
  battleZone.style.display = 'none';
  bossEntity.style.display = 'flex';
}

function calcDamage(pct) {
  if (pct === 100) return 150;
  if (pct >= 80)   return 100;
  if (pct >= 60)   return 60;
  if (pct >= 40)   return 20;
  return 0;
}

// ── Boss HP ───────────────────────────────────

function updateBossHp(damage, pct) {
  const hpPct = (state.bossHp / BOSS_MAX_HP) * 100;
  hpFill.style.width = hpPct + '%';
  hpNumbers.textContent = `${state.bossHp} / ${BOSS_MAX_HP}`;

  if (damage > 0) {
    // Shake animation
    bossSprite.classList.remove('hit');
    void bossSprite.offsetWidth; // reflow
    bossSprite.classList.add('hit');

    if (pct === 100) {
      bossSpeech.innerHTML = `<em>"PERFECT SCORE! You wound me deeply, scholar!"</em>`;
    } else if (pct >= 80) {
      bossSpeech.innerHTML = `<em>"${damage} damage… you are stronger than I expected."</em>`;
    } else {
      bossSpeech.innerHTML = `<em>"${damage} damage. A scratch. Study harder."</em>`;
    }
  } else {
    bossSpeech.innerHTML = `<em>"Ha! You could not even scratch me. Study more."</em>`;
  }

  if (state.bossHp <= 0) {
    bossName.textContent = '☠ The Ignorant Drake';
    bossSpeech.innerHTML = `<em>"Impossible… I have been… defeated by knowledge…"</em>`;
  }
}

// ── Results Overlay ───────────────────────────

function showResults(pct, damage, total) {
  const grade = pct === 100 ? '🏆 PERFECT!' : pct >= 80 ? '⭐ Great!' : pct >= 60 ? '👍 Good' : '📚 Keep studying';
  resultsHeader.textContent = grade;
  resultsScore.textContent = pct + '%';
  resultsDamage.innerHTML = damage > 0
    ? `<span style="color:#e87a7a">⚔ ${damage} damage dealt to boss</span>`
    : `<span style="color:#8a7a5a">No damage (score below 40%)</span>`;
  resultsBreakdown.innerHTML = `
    <div style="padding:8px 0;border-bottom:1px solid #c9a84c22">${state.score} / ${total} correct</div>
    <div style="padding:8px 0;border-bottom:1px solid #c9a84c22">Boss HP: ${state.bossHp} / ${BOSS_MAX_HP}</div>
    <div style="padding:8px 0">XP gained: +${pct}</div>
  `;
  resultsOverlay.style.display = 'flex';
}

closeResultsBtn.addEventListener('click', () => {
  resultsOverlay.style.display = 'none';
});

// ── Combat Log ────────────────────────────────

function addLog(msg, cls = 'log-system') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${cls}`;
  entry.textContent = msg;
  combatLog.appendChild(entry);
  combatLog.scrollTop = combatLog.scrollHeight;
}
