/* ═══════════════════════════════════════════════
   BOSSQUEST — Frontend App Logic (Friendly Edition)
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

// ── DOM refs ──────────────────────────────────
const $ = id => document.getElementById(id);
const fileInput        = $('file-input');
const uploadZone       = $('upload-zone');
const uploadBtn        = $('upload-btn');
const fileSelected     = $('file-selected');
const fileNameDisplay  = $('file-name-display');
const castBtn          = $('cast-btn');
const uploadStatus     = $('upload-status');
const statusText       = $('status-text');

const bossEntity       = $('boss-entity');
const bossSprite       = $('boss-sprite');
const bossName         = $('boss-name');
const bossSpeech       = $('boss-speech');
const hpFill           = $('hp-fill');
const hpNumbers        = $('hp-numbers');

const battleZone       = $('battle-zone');
const battleProgressWrap = $('battle-progress-wrap');
const questionNum      = $('question-num');
const questionText     = $('question-text');
const optionsGrid      = $('options-grid');
const questionFeedback = $('question-feedback');
const fbIcon           = $('fb-icon');
const fbText           = $('fb-text');
const nextBtn          = $('next-btn');

const cardGrid         = $('card-grid');
const cardEmpty        = $('card-empty');
const combatLog        = $('combat-log');
const xpDisplay        = $('xp-display');

const resultsOverlay   = $('results-overlay');
const resultsMascot    = $('results-mascot');
const resultsHeader    = $('results-header');
const resultsSub       = $('results-sub');
const resultsScore     = $('results-score');
const resultsDamage    = $('results-damage');
const resultsXp        = $('results-xp');
const closeResultsBtn  = $('close-results-btn');

const totalDamageEl    = $('total-damage');
const bestScoreEl      = $('best-score');
const cardsForgedEl    = $('cards-forged');

// ── FILE UPLOAD ───────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
uploadBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFileSelect(fileInput.files[0]); });

function handleFileSelect(file) {
  if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
    addLog('⚠️ Only .txt and .md files are supported!');
    return;
  }
  state.currentFile = file;
  fileNameDisplay.textContent = file.name;
  fileSelected.style.display = 'flex';
  bossSpeech.textContent = `"${file.name}"? Ooh, sounds interesting… if you DARE quiz me! 😤`;
}

castBtn.addEventListener('click', uploadFile);

async function uploadFile() {
  if (!state.currentFile) return;

  uploadStatus.style.display = 'flex';
  statusText.textContent = 'Cooking up your quiz… 🍳';
  castBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', state.currentFile);

  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');

    statusText.textContent = 'Quiz ready! Let\'s go! 🚀';
    addLog(`📤 Uploaded: "${state.currentFile.name}"`, 'log-upload');
    addLog(`🤖 ${data.quiz.length} questions generated!`, 'log-upload');

    forgeCard(state.currentFile.name);

    setTimeout(() => {
      uploadStatus.style.display = 'none';
      fileSelected.style.display = 'none';
      fileInput.value = '';
      castBtn.disabled = false;
      state.currentFile = null;
      startQuiz(data.quiz, data.filename);
    }, 700);

  } catch (err) {
    statusText.textContent = `Oops! ${err.message}`;
    addLog(`❌ ${err.message}`);
    castBtn.disabled = false;
    setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);
  }
}

// ── CARD FORGE ────────────────────────────────
function forgeCard(filename) {
  state.cardsForged++;
  cardsForgedEl.textContent = state.cardsForged;
  cardEmpty.style.display = 'none';

  const name = filename.replace(/\.(txt|md)$/, '');
  const emojis = ['📖','🔬','🧮','🌍','🎨','📐','🧬','💡','🏛️','🚀'];
  const emoji = emojis[(state.cardsForged - 1) % emojis.length];

  const card = document.createElement('div');
  card.className = 'lesson-card';
  card.id = `card-${state.cardsForged}`;
  card.innerHTML = `
    <div class="lc-top">
      <span class="lc-emoji">${emoji}</span>
      <span class="lc-name" title="${name}">${name}</span>
      <span class="lc-badge" id="badge-${state.cardsForged}">In Progress</span>
    </div>
    <div class="lc-sub" id="lc-sub-${state.cardsForged}">Quiz in progress…</div>
  `;
  cardGrid.appendChild(card);
}

function updateCard(idx, damage, score) {
  const badge = $(`badge-${idx}`);
  const sub   = $(`lc-sub-${idx}`);
  const card  = $(`card-${idx}`);
  if (badge) { badge.textContent = score + '%'; badge.className = 'lc-badge done'; }
  if (sub)   sub.textContent = `⚔️ ${damage} damage dealt`;
  if (card)  card.classList.add('active');
}

// ── QUIZ ──────────────────────────────────────
function startQuiz(quiz, filename) {
  state.quiz = quiz;
  state.currentQ = 0;
  state.score = 0;

  bossEntity.style.display = 'none';
  battleZone.style.display = 'block';
  bossSpeech.textContent = 'Ok ok, let\'s see how much you really know… 🤔';
  addLog(`⚔️ Battle started: "${filename}"`, 'log-upload');

  buildProgressPips();
  renderQuestion();
}

function buildProgressPips() {
  battleProgressWrap.innerHTML = '';
  state.quiz.forEach((_, i) => {
    const pip = document.createElement('div');
    pip.className = 'progress-pip' + (i === 0 ? ' current' : '');
    pip.id = `pip-${i}`;
    battleProgressWrap.appendChild(pip);
  });
}

function renderQuestion() {
  const q = state.quiz[state.currentQ];
  questionNum.textContent = `Question ${state.currentQ + 1} of ${state.quiz.length}`;
  questionText.textContent = q.question;
  questionFeedback.style.display = 'none';
  nextBtn.style.display = 'none';

  // Update pips
  state.quiz.forEach((_, i) => {
    const pip = $(`pip-${i}`);
    if (!pip) return;
    pip.className = 'progress-pip' + (i < state.currentQ ? ' done' : i === state.currentQ ? ' current' : '');
  });

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

  optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    const letter = btn.querySelector('.opt-letter').textContent;
    if (letter === correct) btn.classList.add('correct');
    else if (letter === chosen && !isCorrect) btn.classList.add('wrong');
  });

  questionFeedback.style.display = 'flex';
  if (isCorrect) {
    state.score++;
    questionFeedback.className = 'question-feedback correct-fb';
    fbIcon.textContent = '🎉';
    fbText.textContent = `Correct! ${q.explanation}`;
    addLog(`✅ Q${state.currentQ + 1}: Correct!`, 'log-correct');
  } else {
    questionFeedback.className = 'question-feedback wrong-fb';
    fbIcon.textContent = '💡';
    fbText.textContent = `Not quite! The answer was ${correct}. ${q.explanation}`;
    addLog(`❌ Q${state.currentQ + 1}: Wrong (was ${correct})`, 'log-wrong');
  }

  nextBtn.style.display = 'block';
}

nextBtn.addEventListener('click', () => {
  state.currentQ++;
  if (state.currentQ < state.quiz.length) renderQuestion();
  else endQuiz();
});

function endQuiz() {
  const total  = state.quiz.length;
  const pct    = Math.round((state.score / total) * 100);
  const damage = calcDamage(pct);

  state.bossHp     = Math.max(0, state.bossHp - damage);
  state.totalDamage += damage;
  state.quizzesTaken++;
  state.xp         += pct;
  if (state.bestScore === null || pct > state.bestScore) state.bestScore = pct;

  totalDamageEl.textContent = state.totalDamage;
  bestScoreEl.textContent   = state.bestScore + '%';
  xpDisplay.textContent     = state.xp + ' XP';

  updateCard(state.cardsForged, damage, pct);
  updateBossHp(pct, damage);

  addLog(`🏁 Done! Score: ${pct}% → ⚔️ ${damage} damage`, 'log-damage');

  showResults(pct, damage, total);

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

// ── BOSS HP ───────────────────────────────────
function updateBossHp(pct, damage) {
  const hpPct = (state.bossHp / BOSS_MAX_HP) * 100;
  hpFill.style.width = hpPct + '%';
  hpNumbers.textContent = `${state.bossHp} / ${BOSS_MAX_HP}`;

  bossSprite.classList.remove('hit');
  void bossSprite.offsetWidth;
  if (damage > 0) bossSprite.classList.add('hit');

  if (state.bossHp <= 0) {
    bossSpeech.textContent = "NOOOO… You actually beat me! I'll be back though… 😭";
    bossName.textContent   = '💀 Grumble (Defeated!)';
  } else if (pct === 100) {
    bossSpeech.textContent = "PERFECT SCORE?! That's not fair!! 😤";
  } else if (pct >= 80) {
    bossSpeech.textContent = `Ow! ${damage} damage! You're pretty good… 😠`;
  } else if (pct >= 60) {
    bossSpeech.textContent = `Only ${damage} damage? You can do better! 😏`;
  } else {
    bossSpeech.textContent = 'Hehe, you need to study more! 😈';
  }
}

// ── RESULTS ───────────────────────────────────
function showResults(pct, damage, total) {
  const perfect = pct === 100;
  const great   = pct >= 80;

  resultsMascot.textContent  = perfect ? '🏆' : great ? '⭐' : pct >= 60 ? '👏' : '📚';
  resultsHeader.textContent  = perfect ? 'PERFECT!' : great ? 'Great job!' : pct >= 60 ? 'Good work!' : 'Keep studying!';
  resultsSub.textContent     = `${state.score} out of ${total} correct`;
  resultsScore.textContent   = pct + '%';
  resultsScore.style.color   = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--yellow-dark)' : 'var(--red)';
  resultsDamage.textContent  = damage;
  resultsXp.textContent      = '+' + pct;

  resultsOverlay.style.display = 'flex';
  if (pct >= 80) launchConfetti();
}

closeResultsBtn.addEventListener('click', () => {
  resultsOverlay.style.display = 'none';
});

// ── CONFETTI ──────────────────────────────────
function launchConfetti() {
  const colors = ['#58cc02','#1cb0f6','#ffc800','#ff4b4b','#ce82ff','#ff9600'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: -10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${6 + Math.random() * 8}px;
        height: ${6 + Math.random() * 8}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-duration: ${1.5 + Math.random() * 2}s;
        animation-delay: ${Math.random() * 0.5}s;
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 30);
  }
}

// ── COMBAT LOG ────────────────────────────────
function addLog(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'log-entry ' + cls;
  el.textContent = msg;
  combatLog.appendChild(el);
  combatLog.scrollTop = combatLog.scrollHeight;
}