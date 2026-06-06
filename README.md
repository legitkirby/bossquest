# ⚔ BossQuest

> A gamified learning app where you defeat bosses by acing AI-generated quizzes.

## Setup (60 seconds)

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set your API key
```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
```

### 3. Run
```bash
uvicorn main:app --reload --port 8000
```

### 4. Open in browser
```
http://localhost:8000
```

## How it works

1. Upload a `.txt` or `.md` lesson file
2. FastAPI sends it to Claude (`claude-sonnet-4-6`)
3. Claude returns 5 MCQ questions as JSON (printed to terminal)
4. Frontend renders the quiz in "battle mode"
5. Your score determines how much damage you deal to the boss

## Damage formula

| Score | Damage |
|-------|--------|
| 100%  | 150    |
| ≥ 80% | 100    |
| ≥ 60% | 60     |
| ≥ 40% | 20     |
| < 40% | 0      |

## Project structure

```
bossquest/
├── main.py              ← FastAPI app + Claude integration
├── requirements.txt
├── .env.example
├── templates/
│   └── index.html       ← Single-page frontend
└── static/
    ├── css/style.css    ← Dark fantasy styles
    └── js/app.js        ← Upload + quiz + boss logic
```
