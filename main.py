"""
BossQuest — FastAPI backend (DeepSeek + SQLite edition).
"""

import os
import re
import sys
import json
import sqlite3
from html import escape as esc
from pathlib import Path
from datetime import datetime
from contextlib import asynccontextmanager

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
DB_PATH = BASE_DIR / "bossquest.db"

FRONTEND_DIR = BASE_DIR / "frontend"
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = BASE_DIR / "static"

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MODEL = "deepseek-chat"          
MAX_CHARS = 6000
MIN_CHARS = 5

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    """Create tables cleanly with quiz data retention fields."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            username     TEXT    UNIQUE NOT NULL,
            password     TEXT    NOT NULL,
            display_name TEXT    NOT NULL,
            title        TEXT    NOT NULL,
            joined       TEXT    NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS uploads (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL,
            filename      TEXT    NOT NULL,
            char_count    INTEGER NOT NULL,
            num_questions INTEGER NOT NULL,
            uploaded_at   TEXT    NOT NULL,
            quiz_json     TEXT    NOT NULL,
            score_pct     INTEGER DEFAULT NULL
        )
        """
    )

    cur.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        seed_users = [("admin", "admin", "Admin", "Boss Slayer", "2025")]
        cur.execute(
            "INSERT INTO users (username, password, display_name, title, joined) VALUES (?, ?, ?, ?, ?)",
            seed_users[0]
        )
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="BossQuest", version="0.4.0", lifespan=lifespan)

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
    global _client
    if _client is None:
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY is not set.")
        _client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
    return _client


# --------------------------------------------------------------------------- #
# Database Storage Accessors
# --------------------------------------------------------------------------- #
def get_user(username: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None

def authenticate(username: str, password: str):
    user = get_user(username)
    if user and user["password"] == password:
        return user
    return None

def create_user(username: str, password: str, display_name: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO users (username, password, display_name, title, joined) VALUES (?, ?, ?, ?, ?)",
        (username, password, display_name or username, "Apprentice", "2025"),
    )
    conn.commit()
    conn.close()
    return get_user(username)

def current_user(request: Request):
    username = request.session.get("user")
    return get_user(username) if username else None

def add_upload(username: str, filename: str, char_count: int, num_questions: int, quiz_json: str):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO uploads (username, filename, char_count, num_questions, uploaded_at, quiz_json) 
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            username,
            filename,
            char_count,
            num_questions,
            datetime.now().strftime("%b %d, %Y · %I:%M %p"),
            quiz_json
        ),
    )
    inserted_id = cur.lastrowid
    conn.commit()
    conn.close()
    return inserted_id

def get_uploads(username: str) -> list:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM uploads WHERE username = ? ORDER BY id DESC", (username,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def render_collection_html(username: str) -> str:
    items = get_uploads(username)
    if not items:
        return (
            '<div class="empty-state">📝 No lessons uploaded yet. '
            'Head to the <a href="/">Arena</a> and upload one!</div>'
        )
    cards = []
    for u in items:
        status_text = f"Completed ({u['score_pct']}%)" if u["score_pct"] is not None else "Not Started Yet"
        cards.append(
            f'<div class="file-card" style="margin-bottom: 12px; padding: 14px; background: #fff; border: 2px solid #e5e5e5; border-radius: 12px;">'
            f'<div style="display: flex; justify-content: space-between; align-items: center;">'
            f'<div>'
            f'<div style="font-weight: 800; font-size: 16px; color: #3c3c3c;">{esc(u["filename"])}</div>'
            f'<div style="font-size: 13px; color: #777; margin-top: 4px;">{esc(u["uploaded_at"])} · {u["char_count"]} chars</div>'
            f'</div>'
            f'<span style="background: #ddf4ff; color: #0a91d0; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 12px;">{status_text}</span>'
            f'</div>'
            f'</div>'
        )
    return "\n".join(cards)

def render(filename: str, **ctx) -> HTMLResponse:
    path = TEMPLATES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=500, detail=f"{filename} not found")
    html = path.read_text(encoding="utf-8")
    for key, value in ctx.items():
        html = html.replace("{{" + key + "}}", str(value))
    html = re.sub(r"\{\{[a-zA-Z_]+\}\}", "", html)
    return HTMLResponse(content=html)


# --------------------------------------------------------------------------- #
# Auth Routes
# --------------------------------------------------------------------------- #
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return render("login.html", error="")

@app.post("/login")
async def login_submit(request: Request, username: str = Form(...), password: str = Form(...)):
    user = authenticate(username.strip(), password)
    if not user:
        return render("login.html", error=f'<div class="auth-error">⚠️ Invalid credentials</div>')
    request.session["user"] = user["username"]
    return RedirectResponse("/", status_code=303)

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return render("register.html", error="")

@app.post("/register")
async def register_submit(
    request: Request,
    display_name: str = Form(""),
    username: str = Form(...),
    password: str = Form(...),
    confirm: str = Form(...),
):
    if password != confirm:
        return render("register.html", error=f'<div class="auth-error">⚠️ Passwords do not match</div>')
    if get_user(username.strip()):
        return render("register.html", error=f'<div class="auth-error">⚠️ Username taken</div>')
    
    user = create_user(username.strip(), password, display_name.strip())
    request.session["user"] = user["username"]
    return RedirectResponse("/", status_code=303)

@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


# --------------------------------------------------------------------------- #
# Core Views
# --------------------------------------------------------------------------- #
@app.get("/api/lessons")
async def get_user_lessons(request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    uploads = get_uploads(user["username"])
    return {"status": "ok", "lessons": uploads}

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    
    # Clean and simple: just pass the user profile info
    return render("index.html", display_name=user["display_name"])

@app.get("/profile", response_class=HTMLResponse)
async def profile(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    return render("profile.html", display_name=user["display_name"], username=user["username"], title=user["title"], joined=user["joined"])

@app.get("/collection", response_class=HTMLResponse)
async def collection(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=303)
    return render("collection.html", display_name=user["display_name"], file_list=render_collection_html(user["username"]))


# --------------------------------------------------------------------------- #
# Quiz Engine Actions
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = "You are a quiz generator for a gamified learning app. You always respond with valid JSON and nothing else."
QUIZ_PROMPT = """Given the following lesson text, generate exactly 5 multiple-choice questions.
Return ONLY valid JSON shape:
{{
  "questions": [
    {{
      "question": "...",
      "options": {{ "A": "...", "B": "...", "C": "...", "D": "..." }},
      "correct": "A",
      "explanation": "..."
    }}
  ]
}}
Lesson text: {lesson_text}"""

def strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()

@app.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)) -> dict:
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    filename = file.filename or "lesson.txt"
    raw = await file.read()
    text = raw.decode("utf-8").strip()

    if len(text) < MIN_CHARS:
        raise HTTPException(status_code=400, detail="Lesson text too short.")

    prompt = QUIZ_PROMPT.format(lesson_text=text[:MAX_CHARS])
    completion = get_client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    response_text = strip_fences(completion.choices[0].message.content or "")
    parsed = json.loads(response_text)
    quiz = parsed.get("questions", parsed.get("quiz", []))

    # IMMEDIATELY save into database with generated quiz
    db_id = add_upload(user["username"], filename, len(text), len(quiz), json.dumps(quiz))

    return {"status": "ok", "db_id": db_id, "filename": filename, "char_count": len(text), "quiz": quiz}

@app.post("/api/quiz/{upload_id}/score")
async def save_score(upload_id: int, request: Request, payload: dict):
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    score_pct = payload.get("score_pct")
    conn = get_db()
    conn.execute("UPDATE uploads SET score_pct = ? WHERE id = ? AND username = ?", (score_pct, upload_id, user["username"]))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.post("/api/quiz/{upload_id}/delete")
async def delete_lesson(upload_id: int, request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    conn = get_db()
    conn.execute("DELETE FROM uploads WHERE id = ? AND username = ?", (upload_id, user["username"]))
    conn.commit()
    conn.close()
    return {"status": "ok"}