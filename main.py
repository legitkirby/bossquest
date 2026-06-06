"""
BossQuest — FastAPI backend (DeepSeek + simple auth edition).

Auth is intentionally minimal for now: a hardcoded user dict and signed-cookie
sessions. No database. When you add a DB later, only `USERS`, `authenticate()`,
and `create_user()` need to change.

Page routes:
  GET  /            -> Arena (requires login, else -> /login)
  GET  /login       -> login page
  POST /login       -> validate creds, start session
  GET  /register    -> create-account page
  POST /register    -> create user (in memory), start session
  GET  /logout      -> end session
  GET  /profile     -> profile page (requires login)
  GET  /collection  -> collection page (requires login)

API routes:
  GET  /health      -> {"status": "ok"}
  GET  /api/me      -> current user JSON (or 401)
  POST /upload      -> file -> DeepSeek -> quiz JSON (requires login)
"""

import os
import re
import sys
import json
from html import escape as esc
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv
import openai
from openai import OpenAI

# --------------------------------------------------------------------------- #
# Setup
# --------------------------------------------------------------------------- #
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"

# Frontend assets live in ./frontend (older layout used ./static).
FRONTEND_DIR = BASE_DIR / "frontend"
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = BASE_DIR / "static"

# DeepSeek config -----------------------------------------------------------
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MODEL = "deepseek-chat"          # DeepSeek-V3. Use "deepseek-reasoner" for R1.
MAX_CHARS = 6000
MIN_CHARS = 50

# Session secret. Override in .env for anything beyond local testing.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

app = FastAPI(title="BossQuest", version="0.3.0")

app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

_client = None


def get_client() -> OpenAI:
    """Build the DeepSeek client on first use, so the app still boots (login,
    pages) even if no key is configured yet — only /upload needs it."""
    global _client
    if _client is None:
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="DEEPSEEK_API_KEY is not set. Add it to your .env file.",
            )
        _client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
    return _client

# --------------------------------------------------------------------------- #
# "Database" — hardcoded users (no DB yet)
# --------------------------------------------------------------------------- #
# NOTE: plaintext passwords + in-memory store are for local testing ONLY.
# Replace with a real DB + hashed passwords before this goes anywhere real.
USERS = {
    "admin": {
        "username": "admin",
        "password": "admin",
        "display_name": "Admin",
        "title": "Boss Slayer",
        "joined": "2025",
    }
}


def authenticate(username: str, password: str):
    user = USERS.get(username)
    if user and user["password"] == password:
        return user
    return None


def create_user(username: str, password: str, display_name: str):
    """Add a user to the in-memory store. Resets on server restart (no DB)."""
    USERS[username] = {
        "username": username,
        "password": password,
        "display_name": display_name or username,
        "title": "Apprentice",
        "joined": "2025",
    }
    return USERS[username]


def current_user(request: Request):
    username = request.session.get("user")
    return USERS.get(username) if username else None


# --------------------------------------------------------------------------- #
# Uploaded lessons — in-memory store (no DB yet)
# --------------------------------------------------------------------------- #
# Maps username -> list of upload records. Replace this with a DB table +
# query later; only add_upload() and get_uploads() need to change.
UPLOADS = {
    "admin": [
        {"filename": "photosynthesis.md", "char_count": 3120, "num_questions": 5, "uploaded_at": "Jun 02, 2025 · 10:14 AM"},
        {"filename": "world-war-2.txt", "char_count": 5840, "num_questions": 5, "uploaded_at": "Jun 03, 2025 · 04:47 PM"},
        {"filename": "algebra-basics.md", "char_count": 2210, "num_questions": 5, "uploaded_at": "Jun 05, 2025 · 09:02 AM"},
    ]
}


def add_upload(username: str, filename: str, char_count: int, num_questions: int):
    UPLOADS.setdefault(username, []).append({
        "filename": filename,
        "char_count": char_count,
        "num_questions": num_questions,
        "uploaded_at": datetime.now().strftime("%b %d, %Y · %I:%M %p"),
    })


def get_uploads(username: str) -> list:
    return UPLOADS.get(username, [])


def render_uploads(username: str) -> str:
    """Build the Collection list HTML for the str-replace renderer."""
    items = get_uploads(username)
    if not items:
        return (
            '<div class="empty-state">📭 No lessons uploaded yet. '
            'Head to the <a href="/">Arena</a> and upload one!</div>'
        )
    rows = []
    for u in reversed(items):  # newest first
        ext = u["filename"].rsplit(".", 1)[-1].lower() if "." in u["filename"] else "txt"
        emoji = "📝" if ext == "md" else "📄"
        rows.append(
            f'<div class="file-card">'
            f'<div class="file-emoji">{emoji}</div>'
            f'<div class="file-body">'
            f'<div class="file-name">{esc(u["filename"])}</div>'
            f'<div class="file-meta">{esc(str(u["uploaded_at"]))} · '
            f'{u["char_count"]:,} chars · {u["num_questions"]} questions</div>'
            f'</div>'
            f'<span class="file-badge">.{esc(ext)}</span>'
            f'</div>'
        )
    return "\n".join(rows)


# --------------------------------------------------------------------------- #
# Tiny template renderer (str replace — no Jinja needed)
# --------------------------------------------------------------------------- #
def render(filename: str, **ctx) -> HTMLResponse:
    path = TEMPLATES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"{filename} not found")
    html = path.read_text(encoding="utf-8")
    for key, value in ctx.items():
        html = html.replace("{{" + key + "}}", str(value))
    # blank out any placeholders the caller didn't supply
    html = re.sub(r"\{\{[a-zA-Z_]+\}\}", "", html)
    return HTMLResponse(content=html)


def error_box(message: str) -> str:
    return f'<div class="auth-error">⚠️ {message}</div>'


# --------------------------------------------------------------------------- #
# DeepSeek helpers
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = (
    "You are a quiz generator for a gamified learning app. "
    "You always respond with valid json and nothing else."
)

QUIZ_PROMPT = """Given the following lesson text, generate exactly 5 multiple-choice questions.
Rules:
- Each question must have exactly 4 options (A, B, C, D)
- Exactly one option must be correct
- Questions should test understanding, not just memorization
- Vary difficulty: 2 easy, 2 medium, 1 hard
Return ONLY valid json, no markdown, no preamble. Use this exact shape:
{
  "questions": [
    {
      "question": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correct": "A",
      "explanation": "..."
    }
  ]
}
Lesson text:
---
{lesson_text}
---"""


def strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


def extract_quiz(parsed) -> list:
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("questions", "quiz", "items", "data"):
            if isinstance(parsed.get(key), list):
                return parsed[key]
        for value in parsed.values():
            if isinstance(value, list):
                return value
    raise ValueError("response did not contain a list of questions")


def pretty_print_quiz(filename: str, quiz: list) -> None:
    line = "=" * 64
    print(f"\n{line}\n  QUIZ GENERATED FROM: {filename}\n{line}")
    for i, q in enumerate(quiz, 1):
        print(f"\nQ{i}. {q.get('question', '')}")
        options = q.get("options", {})
        correct = q.get("correct", "")
        for letter in ("A", "B", "C", "D"):
            if letter in options:
                mark = "  \u2713" if letter == correct else ""
                print(f"   {letter}) {options[letter]}{mark}")
        explanation = q.get("explanation", "")
        if explanation:
            print(f"   \u2192 {explanation}")
    print(f"\n{line}\n")
    sys.stdout.flush()


# --------------------------------------------------------------------------- #
# Auth routes
# --------------------------------------------------------------------------- #
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if current_user(request):
        return RedirectResponse("/", status_code=303)
    return render("login.html", error="")


@app.post("/login")
async def login_submit(request: Request, username: str = Form(...), password: str = Form(...)):
    user = authenticate(username.strip(), password)
    if not user:
        return render("login.html", error=error_box("Wrong username or password."))
    request.session["user"] = user["username"]
    return RedirectResponse("/", status_code=303)


@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    if current_user(request):
        return RedirectResponse("/", status_code=303)
    return render("register.html", error="")


@app.post("/register")
async def register_submit(
    request: Request,
    display_name: str = Form(""),
    username: str = Form(...),
    password: str = Form(...),
    confirm: str = Form(...),
):
    username = username.strip()
    if not username or not password:
        return render("register.html", error=error_box("Username and password are required."))
    if username in USERS:
        return render("register.html", error=error_box("That username is taken."))
    if password != confirm:
        return render("register.html", error=error_box("Passwords don't match."))

    user = create_user(username, password, display_name.strip())
    request.session["user"] = user["username"]
    return RedirectResponse("/", status_code=303)


@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


# --------------------------------------------------------------------------- #
# Page routes
# --------------------------------------------------------------------------- #
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    return render("index.html", display_name=user["display_name"])


@app.get("/profile", response_class=HTMLResponse)
async def profile(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    return render(
        "profile.html",
        display_name=user["display_name"],
        username=user["username"],
        title=user["title"],
        joined=user["joined"],
    )


@app.get("/collection", response_class=HTMLResponse)
async def collection(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    return render(
        "collection.html",
        display_name=user["display_name"],
        uploads=render_uploads(user["username"]),
    )


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/me")
async def api_me(request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {"username": user["username"], "display_name": user["display_name"], "title": user["title"]}


@app.get("/api/uploads")
async def api_uploads(request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {"uploads": get_uploads(user["username"])}


@app.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)) -> dict:
    if not current_user(request):
        raise HTTPException(status_code=401, detail="Please log in first.")

    filename = file.filename or "lesson.txt"
    if not filename.lower().endswith((".txt", ".md")):
        raise HTTPException(status_code=400, detail="Only .txt or .md files are supported.")

    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be valid UTF-8 text.")

    text = text.strip()
    if len(text) < MIN_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Lesson text too short (minimum {MIN_CHARS} characters).",
        )

    char_count = len(text)
    lesson_text = text[:MAX_CHARS]
    prompt = QUIZ_PROMPT.replace("{lesson_text}", lesson_text)

    try:
        completion = get_client().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
            response_format={"type": "json_object"},
            stream=False,
        )
    except openai.APIError as exc:
        raise HTTPException(status_code=502, detail=f"DeepSeek API error: {exc}")

    response_text = strip_fences(completion.choices[0].message.content or "")

    try:
        parsed = json.loads(response_text)
        quiz = extract_quiz(parsed)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse quiz JSON: {exc}")

    pretty_print_quiz(filename, quiz)

    # remember it for this user's Collection (in-memory until DB exists)
    add_upload(current_user(request)["username"], filename, char_count, len(quiz))

    return {"status": "ok", "filename": filename, "quiz": quiz, "char_count": char_count}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
