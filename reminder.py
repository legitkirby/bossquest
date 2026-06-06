from plyer import notification
import schedule
import time
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

STATE_FILE = Path(__file__).parent / ".reminder_state.json"

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"streak": 3, "last_login": None, "lessons_done": 2}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

def notify(title, message):
    notification.notify(
        title=title,
        message=message,
        app_name="BossQuest 🦉",
        app_icon=None,
        timeout=12
    )

def check_and_remind():
    state = load_state()
    streak = state.get("streak", 0)
    last_login = state.get("last_login")
    lessons_done = state.get("lessons_done", 0)
    hour = datetime.now().hour

    if last_login:
        last = datetime.fromisoformat(last_login)
        days_gone = (datetime.now() - last).days
    else:
        days_gone = 99

    # === STREAK AT RISK (evening, not logged in today) ===
    if hour >= 20 and days_gone >= 1 and streak > 0:
        messages = [
            f"🔥 Your {streak}-day streak ends at midnight. Don't let it die!",
            f"🦉 {streak} days of hard work... gone by midnight. Really?",
            f"😤 Blobbert is laughing at your dying {streak}-day streak. Prove him wrong.",
            f"⚠️ FINAL WARNING: {streak}-day streak vanishes in hours. LOGIN NOW.",
        ]
        import random
        notify("⚠️ Streak at Risk!", random.choice(messages))

    # === STREAK ALREADY LOST ===
    elif days_gone >= 2 and streak == 0:
        messages = [
            "💀 You lost your streak. Blobbert won. Start over.",
            "🦉 Disappointing. Your streak is gone. But it's not too late...",
            "😭 Streak = 0. The boss is undefeated. Come back and fight.",
        ]
        import random
        notify("😭 Streak Lost", random.choice(messages))

    # === HASN'T STUDIED IN A WHILE ===
    elif days_gone >= 3:
        messages = [
            f"📚 {days_gone} days without studying. Blobbert has fully recovered.",
            f"🧟 You've been gone {days_gone} days. Your brain is getting rusty.",
            f"😴 {days_gone} days off? Blobbert is literally laughing at you.",
            "🦉 Duolingo owl found a new student. Just saying.",
        ]
        import random
        notify("👻 Where have you been?", random.choice(messages))

    # === MORNING MOTIVATION ===
    elif hour < 12 and days_gone < 1:
        messages = [
            f"☀️ Good morning! {streak} day streak. Keep it alive today!",
            "🦉 New day, new boss fight. Ready to study?",
            f"⚡ {lessons_done} lessons done so far. Push harder today!",
        ]
        import random
        notify("🦉 BossQuest", random.choice(messages))

    # === AFTERNOON NUDGE ===
    elif 12 <= hour < 18 and days_gone < 1 and lessons_done == 0:
        messages = [
            "😏 Afternoon already and zero lessons? Blobbert is comfortable.",
            "📖 You haven't touched a lesson today. Don't wait till tonight.",
            "🎮 5 minutes is all it takes. Fight the boss. Go.",
        ]
        import random
        notify("📖 Lesson Reminder", random.choice(messages))

import random

schedule.every().day.at("08:00").do(check_and_remind)
schedule.every().day.at("15:56").do(check_and_remind)
schedule.every().day.at("20:00").do(check_and_remind)
schedule.every().day.at("22:00").do(check_and_remind)

print("🦉 BossQuest reminder running... Press Ctrl+C to stop.")
check_and_remind()

while True:
    schedule.run_pending()
    time.sleep(60)
