# BossQuest ⚔️

A gamified learning web app. Upload a lesson file, an AI (DeepSeek) turns it into a
quiz, and every correct answer deals damage to a boss. Think Duolingo meets a card
game — you learn by fighting.

---

## How it works

1. A student drops a `.txt` or `.md` lesson into the app.
2. The backend sends the text to **DeepSeek** and asks for 5 multiple-choice questions.
3. The student answers; their score decides how much damage the boss takes.
4. Beat the boss down from 1000 HP.

---

## Tech stack

| Layer     | Choice                                              |
|-----------|-----------------------------------------------------|
| Backend   | Python · FastAPI · Uvicorn                          |
| AI        | DeepSeek (`deepseek-chat`) via the `openai` SDK     |
| Frontend  | One HTML page + vanilla CSS + vanilla JS (no build) |
| Database  | None yet — state lives in the browser               |

No React, no bundler, no TypeScript. Just open it and run.

---

## Project structure

```
bossquest/
├── main.py             # FastAPI app — routes + DeepSeek call
├── requirements.txt    # Python dependencies
├── .env                # YOUR secrets (never commit this)
├── .env.example        # template to copy from
├── .gitignore
├── docs.md             # sample lesson — drag it in to test
├── README.md           # you are here
├── templates/
│   └── index.html      # the entire frontend page
└── frontend/
    ├── css/
    │   └── style.css   # all styling
    └── js/
        └── app.js      # all game logic
```

---

## Prerequisites

- **Python 3.9 or newer** — check with `python --version`
- **A DeepSeek API key** — sign up at <https://platform.deepseek.com>, then create a
  key under **API keys**. (DeepSeek is pay-as-you-go and very cheap, but the account
  does need credit on it for the API to respond.)

---

## Setup

Run these once, from inside the `bossquest/` folder.

**1. Create and activate a virtual environment** (keeps deps isolated):

```bash
# macOS / Linux
python -m venv .venv
source .venv/bin/activate

# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**2. Install dependencies:**

```bash
pip install -r requirements.txt
```

**3. Add your API key.** Copy the template and edit it:

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and paste your real key:

```
DEEPSEEK_API_KEY=sk-your-real-key-here
```

> ⚠️ Never commit `.env`. It holds a secret. It's already in `.gitignore` — keep it there.

---

## Running it

```bash
uvicorn main:app --reload
```

(`--reload` auto-restarts when you edit code — great for development.)

Then open: **<http://127.0.0.1:8000>**

You can sanity-check the server is up with:

```bash
curl http://127.0.0.1:8000/health
# -> {"status":"ok"}
```

To stop the server, press `Ctrl + C`.

> **Important:** You must run it through Uvicorn, *not* by opening `index.html`
> directly or using a "Live Server" extension. The page can load that way, but
> uploads will fail — generating quizzes requires the Python backend.

---

## Using the app

1. Drag a `.txt`/`.md` file into the left panel (or click **Choose File**). Try
   `docs.md` to start.
2. Click **Start!** — the file is sent to the backend, DeepSeek writes a quiz.
3. Answer the 5 questions. Your score determines the damage:

   | Score   | Damage |
   |---------|--------|
   | 100%    | 150    |
   | ≥ 80%   | 100    |
   | ≥ 60%   | 60     |
   | ≥ 40%   | 20     |
   | < 40%   | 0      |

4. The full generated quiz is also printed to your terminal, so you can see exactly
   what DeepSeek produced (handy for debugging).

---

## API routes

| Method | Path       | Purpose                                              |
|--------|------------|------------------------------------------------------|
| GET    | `/`        | Serves the app (`templates/index.html`)              |
| GET    | `/health`  | Health check → `{"status": "ok"}`                    |
| POST   | `/upload`  | Takes a file, returns `{status, filename, quiz, char_count}` |

---

## Configuration

Most knobs live at the top of `main.py`:

- `MODEL` — `deepseek-chat` (DeepSeek-V3). Swap to `deepseek-reasoner` (R1) if you
  want slower, more deliberate reasoning.
- `MAX_CHARS` — lesson text is trimmed to 6000 chars before sending, to control cost.
- `MIN_CHARS` — uploads under 50 chars are rejected.

The DeepSeek base URL (`https://api.deepseek.com`) and JSON-mode handling are also in
`main.py`. The frontend folder is auto-detected (`frontend/`, falling back to
`static/`) and served at both `/frontend` and `/static`.

---

## Troubleshooting

**The page loads but uploads do nothing / show an error.**
You're probably opening the file directly or via Live Server. Run `uvicorn main:app
--reload` and use the `http://127.0.0.1:8000` URL instead.

**`401` / authentication errors, or a 502 "DeepSeek API error".**
Check that `.env` exists, the key is correct, and your DeepSeek account has credit.
Restart the server after editing `.env` (it's only read on startup).

**`500` "Failed to parse quiz JSON".**
Rare — DeepSeek returned something unparseable, usually because the response got cut
off. Increase `max_tokens` in `main.py` (it's 2000) and retry.

**`Address already in use` on startup.**
Something's already on port 8000. Use another: `uvicorn main:app --reload --port 8001`.

**CSS/JS not loading (page looks unstyled).**
Make sure the `frontend/css/style.css` and `frontend/js/app.js` files exist and that
`index.html`'s `<link>`/`<script>` tags point to `/frontend/...` (or `/static/...` —
both are served).

---

## Roadmap (not built yet)

- User auth (login / register)
- SQLite persistence for users, scores, progress
- Flashcard generator + AI lesson summaries
- Multiple boss tiers / progression
- Leaderboard
- Mobile-responsive layout

---

## Contributing

1. Create a branch off `main`.
2. Make your change; if you touch the backend, test with a real upload end-to-end.
3. Open a PR. Keep `.env` and `.venv/` out of commits.