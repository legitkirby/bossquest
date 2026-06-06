import os
import json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import anthropic
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="BossQuest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend/css/static"), name="static")

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

QUIZ_PROMPT = """You are a quiz generator for a gamified learning app.

Given the following lesson text, generate exactly 5 multiple-choice questions.

Rules:
- Each question must have exactly 4 options (A, B, C, D)
- Exactly one option must be correct
- Questions should test understanding, not just memorization
- Vary difficulty: 2 easy, 2 medium, 1 hard

Return ONLY a valid JSON array, no markdown, no preamble. Format:
[
  {{
    "question": "Question text here?",
    "options": {{
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    }},
    "correct": "A",
    "explanation": "Brief explanation of why this is correct."
  }}
]

Lesson text:
---
{lesson_text}
---"""


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("templates/index.html", "r") as f:
        return f.read()


@app.post("/upload")
async def upload_lesson(file: UploadFile = File(...)):
    # Validate file type
    if not file.filename.endswith((".txt", ".md")):
        raise HTTPException(status_code=400, detail="Only .txt and .md files are supported.")

    content = await file.read()
    try:
        lesson_text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded text.")

    if len(lesson_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Lesson text is too short (minimum 50 characters).")

    # Trim to avoid token overload
    lesson_text = lesson_text[:6000]

    print("\n" + "="*60)
    print(f"📄 FILE RECEIVED: {file.filename}")
    print(f"   Length: {len(lesson_text)} characters")
    print("="*60)
    print("🤖 Sending to Claude for quiz generation...")

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": QUIZ_PROMPT.format(lesson_text=lesson_text)
                }
            ]
        )

        raw = message.content[0].text.strip()

        # Strip accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        quiz = json.loads(raw)

        print("\n✅ QUIZ GENERATED SUCCESSFULLY")
        print("-"*60)
        for i, q in enumerate(quiz, 1):
            print(f"\nQ{i}: {q['question']}")
            for letter, opt in q['options'].items():
                marker = "✓" if letter == q['correct'] else " "
                print(f"  [{marker}] {letter}) {opt}")
            print(f"  → {q['explanation']}")
        print("\n" + "="*60 + "\n")

        return {
            "status": "success",
            "filename": file.filename,
            "quiz": quiz,
            "char_count": len(lesson_text)
        }

    except json.JSONDecodeError as e:
        print(f"\n❌ JSON PARSE ERROR: {e}")
        print(f"Raw response: {raw[:500]}")
        raise HTTPException(status_code=500, detail="AI returned malformed JSON. Try again.")
    except anthropic.APIError as e:
        print(f"\n❌ ANTHROPIC API ERROR: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")


@app.get("/health")
async def health():
    return {"status": "ok", "message": "BossQuest API is running"}
