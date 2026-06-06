"""
BossQuest — FastAPI backend (DeepSeek edition).

Uses DeepSeek's OpenAI-compatible API to generate quizzes.

Routes:
  GET  /        -> serves templates/index.html
  GET  /health  -> {"status": "ok"}
  POST /upload  -> accepts a .txt/.md file, asks DeepSeek for a 5-question quiz,
                   returns {status, filename, quiz, char_count}
"""

import os
import re
import sys
import json
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import openai
from openai import OpenAI

# --------------------------------------------------------------------------- #
# Setup
# --------------------------------------------------------------------------- #
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"

# Frontend assets live in ./frontend (older layout used ./static). Use whichever
# exists so the project works either way.
FRONTEND_DIR = BASE_DIR / "frontend"
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = BASE_DIR / "static"

# DeepSeek config -----------------------------------------------------------
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MODEL = "deepseek-chat"          # DeepSeek-V3. Use "deepseek-reasoner" for R1.
MAX_CHARS = 6000
MIN_CHARS = 50

app = FastAPI(title="BossQuest", version="0.2.0")

# Hackathon mode: no auth yet, allow everything.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve assets at BOTH /frontend and /static so index.html works whichever
# path its <link>/<script> tags use.
if FRONTEND_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url=DEEPSEEK_BASE_URL,
)

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


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def strip_fences(text: str) -> str:
    """Remove accidental ```json ... ``` (or plain ```) fences around a response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


def extract_quiz(parsed) -> list:
    """Accept either a bare array or an object like {"questions": [...]}."""
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("questions", "quiz", "items", "data"):
            if isinstance(parsed.get(key), list):
                return parsed[key]
        # fall back to the first list value found
        for value in parsed.values():
            if isinstance(value, list):
                return value
    raise ValueError("response did not contain a list of questions")


def pretty_print_quiz(filename: str, quiz: list) -> None:
    """Dump the generated quiz to the terminal for debugging."""
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
# Routes
# --------------------------------------------------------------------------- #
@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    index_path = TEMPLATES_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=500, detail="index.html not found")
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    # --- validate file type -------------------------------------------------
    filename = file.filename or "lesson.txt"
    if not filename.lower().endswith((".txt", ".md")):
        raise HTTPException(status_code=400, detail="Only .txt or .md files are supported.")

    # --- read + decode ------------------------------------------------------
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
    lesson_text = text[:MAX_CHARS]  # trim to avoid token overload
    prompt = QUIZ_PROMPT.replace("{lesson_text}", lesson_text)

    # --- ask DeepSeek -------------------------------------------------------
    try:
        completion = client.chat.completions.create(
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

    # --- parse JSON ---------------------------------------------------------
    try:
        parsed = json.loads(response_text)
        quiz = extract_quiz(parsed)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse quiz JSON: {exc}")

    pretty_print_quiz(filename, quiz)

    return {
        "status": "ok",
        "filename": filename,
        "quiz": quiz,
        "char_count": char_count,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)