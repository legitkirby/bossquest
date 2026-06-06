# BossQuest ⚔️

Gamified learning web app — upload a lesson, Claude generates a quiz, and correct
answers deal damage to a boss. Duolingo-meets-card-game.

## Setup

```bash
cd bossquest
python -m venv .venv && source .venv/bin/activate      # optional but recommended
pip install -r requirements.txt
cp .env.example .env                                    # then paste your real key
```

Add your Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Run

```bash
uvicorn main:app --reload
# or: python main.py
```

Then open http://127.0.0.1:8000

## How it works

1. Drag a `.txt` or `.md` lesson into the left panel (or use **Choose File**).
2. Hit **Start!** — the file is POSTed to `/upload`, which asks
   `claude-sonnet-4-6` for 5 multiple-choice questions and returns them as JSON.
3. Answer the questions. Your score determines the damage dealt:

   | Score | Damage |
   |-------|--------|
   | 100%  | 150    |
   | ≥ 80% | 100    |
   | ≥ 60% | 60     |
   | ≥ 40% | 20     |
   | < 40% | 0      |

4. Beat the boss down from 1000 HP. The full generated quiz is also pretty-printed
   to your terminal for debugging.

## Routes

- `GET /` — the app
- `POST /upload` — file → quiz JSON
- `GET /health` — `{"status": "ok"}`

## Not built yet

Auth, SQLite persistence, flashcards, AI summaries, boss tiers, leaderboard,
mobile-responsive layout. State currently lives in frontend JS variables only.
