import re
import json
import time
import uuid
import queue
import shlex
import threading
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, BaseLoader

from app.utils.text_processing import (
    split_sentences_with_spans,
    approx_line_col,
    make_context,
    safe_split_long_sentences,
    sanitize_for_xtts,
    pack_text_to_limit
)
from app.dashboard_templates import INDEX_HTML, JOB_HTML
from app.pathing import safe_join_flat

# =======================
# CONFIG (edit these once)
# =======================
BASE_DIR = Path(__file__).parent.resolve()
CHAPTER_DIR = BASE_DIR / "chapters_out"
REPORTS_DIR = BASE_DIR / "reports"
XTTS_OUT_DIR = BASE_DIR / "xtts_audio"
VOICES_DIR = BASE_DIR / "voices"

NARRATOR_WAV = BASE_DIR / "narrator_clean.wav"  # your reference voice for XTTS
XTTS_ENV_ACTIVATE = Path.home() / "xtts-env" / "bin" / "activate"  # your existing env
# XTTS “sentence too long” safety
SENT_CHAR_LIMIT = 250
SAFE_SPLIT_TARGET = 200  # auto-split long sentences to be <= this when safe_mode enabled

# Output format options
DEFAULT_MAKE_MP3 = True
MP3_QUALITY = "2"  # ffmpeg -q:a 2 (good audiobook quality)

# =======================
# END CONFIG
# =======================

for p in [REPORTS_DIR, XTTS_OUT_DIR, VOICES_DIR]:
    p.mkdir(parents=True, exist_ok=True)

STATE_FILE = BASE_DIR / "state.json"
job_queue: "queue.Queue[str]" = queue.Queue()
stop_flags: Dict[str, threading.Event] = {}
pause_flag = threading.Event()  # when set => paused

app = FastAPI()
templates = Environment(loader=BaseLoader())

# -------------------------
# Helpers: persistent state
# -------------------------
def load_state() -> Dict[str, Any]:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"jobs": {}, "settings": {"make_mp3": DEFAULT_MAKE_MP3, "safe_mode": True}}

def save_state(state: Dict[str, Any]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")

def get_jobs() -> Dict[str, Any]:
    return load_state().get("jobs", {})

def put_job(job: Dict[str, Any]) -> None:
    state = load_state()
    state.setdefault("jobs", {})
    state["jobs"][job["id"]] = job
    save_state(state)

def update_job(jid: str, **updates) -> None:
    state = load_state()
    j = state["jobs"].get(jid)
    if not j:
        return
    j.update(updates)
    state["jobs"][jid] = j
    save_state(state)

def get_settings() -> Dict[str, Any]:
    return load_state().get("settings", {})

def update_settings(**updates) -> None:
    state = load_state()
    state.setdefault("settings", {})
    state["settings"].update(updates)
    save_state(state)


# ----------------
# Chapter handling
# ----------------
def list_chapters() -> List[Path]:
    return sorted(CHAPTER_DIR.glob("*.txt")) if CHAPTER_DIR.exists() else []

def output_exists(engine: str, chapter_file: str) -> bool:
    stem = Path(chapter_file).stem
    if engine == "xtts":
        return (XTTS_OUT_DIR / f"{stem}.mp3").exists() or (XTTS_OUT_DIR / f"{stem}.wav").exists()
    return False

# -----------------
# Running commands
# -----------------
def run_cmd_capture(cmd: str, cancel_event: threading.Event) -> tuple[int, str]:
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out_lines = []
    try:
        while True:
            while pause_flag.is_set():
                time.sleep(0.2)
                if cancel_event.is_set():
                    break

            if cancel_event.is_set():
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                out_lines.append("\n[CANCELLED]\n")
                return 1, "".join(out_lines)

            line = proc.stdout.readline() if proc.stdout else ""
            if line:
                out_lines.append(line)
            if proc.poll() is not None:
                if proc.stdout:
                    rest = proc.stdout.read()
                    if rest:
                        out_lines.append(rest)
                break
        return proc.returncode or 0, "".join(out_lines)
    finally:
        try:
            if proc.stdout:
                proc.stdout.close()
        except Exception:
            pass

def ffmpeg_wav_to_mp3(in_wav: Path, out_mp3: Path) -> tuple[int, str]:
    cmd = f'ffmpeg -y -i {shlex.quote(str(in_wav))} -codec:a libmp3lame -q:a {shlex.quote(MP3_QUALITY)} {shlex.quote(str(out_mp3))}'
    return subprocess.getstatusoutput(cmd)

def xtts_generate(chapter_path: Path, out_wav: Path, safe_mode: bool, cancel_event: threading.Event) -> tuple[int, str]:
    if not NARRATOR_WAV.exists():
        return 1, f"Missing narrator wav: {NARRATOR_WAV}"
    if not chapter_path.exists():
        return 1, f"Missing chapter file: {chapter_path}"
    if not XTTS_ENV_ACTIVATE.exists():
        return 1, f"XTTS env activate not found: {XTTS_ENV_ACTIVATE}"

    text = chapter_path.read_text(encoding="utf-8", errors="replace").strip()
    if safe_mode:
        text = safe_split_long_sentences(text, target=SAFE_SPLIT_TARGET)

    # Apply advanced sanitization for XTTS stability
    text = sanitize_for_xtts(text)

    # Pack sentences to the limit to maximize context and stability
    text = pack_text_to_limit(text, limit=SENT_CHAR_LIMIT)

    cmd = (
        f"source {shlex.quote(str(XTTS_ENV_ACTIVATE))} && "
        f"python3 {shlex.quote(str(BASE_DIR / 'app' / 'xtts_inference.py'))} "
        f"--text {shlex.quote(text)} "
        f"--speaker_wav {shlex.quote(str(NARRATOR_WAV))} "
        f"--language en "
        f"--repetition_penalty 2.0 "
        f"--out_path {shlex.quote(str(out_wav))}"
    )
    return run_cmd_capture(cmd, cancel_event)

# ----------------
# Analyzer / report
# ----------------
def analyze_long_sentences() -> str:
    files = list_chapters()
    hits = []
    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        sent_idx = 0
        for sent, start, end in split_sentences_with_spans(text):
            sent_idx += 1
            s = sent.strip()
            if len(s) > SENT_CHAR_LIMIT:
                line, col = approx_line_col(text, start)
                ctx = make_context(text, start, end, 140)
                hits.append({
                    "file": f.name,
                    "sentence_index": sent_idx,
                    "len": len(s),
                    "line": line,
                    "col": col,
                    "context": ctx,
                    "sentence": s[:2000] + ("\n...[TRUNCATED]...\n" if len(s) > 2000 else "")
                })

    ts = time.strftime("%Y%m%d-%H%M%S")
    report_path = REPORTS_DIR / f"long_sentence_report_{ts}.txt"

    lines = []
    lines.append("Long sentence report")
    lines.append(f"Folder: {CHAPTER_DIR.resolve()}")
    lines.append(f"Char limit: {SENT_CHAR_LIMIT}")
    lines.append(f"Files scanned: {len(files)}")
    lines.append(f"Hits: {len(hits)}")
    lines.append("")
    by_file = {}
    for h in hits:
        by_file.setdefault(h["file"], []).append(h)
    lines.append("=== SUMMARY (hits per file) ===")
    for fname in sorted(by_file):
        longest = max(x["len"] for x in by_file[fname])
        lines.append(f"{fname}: {len(by_file[fname])} hits (longest {longest} chars)")
    lines.append("")
    lines.append("=== DETAILS ===")
    for i, h in enumerate(hits, 1):
        lines.append("")
        lines.append(f"--- HIT {i} ---")
        lines.append(f"File: {h['file']}")
        lines.append(f"Sentence #: {h['sentence_index']}")
        lines.append(f"Length: {h['len']} chars")
        lines.append(f"Approx location: line {h['line']}, col {h['col']}")
        lines.append("")
        lines.append("Context (around it):")
        lines.append(h["context"])
        lines.append("")
        lines.append("Sentence (full / capped):")
        lines.append(h["sentence"])

    report = "\n".join(lines)
    report_path.write_text(report, encoding="utf-8")
    return report_path.name

# -----------
# Job worker
# -----------
def worker_loop():
    while True:
        jid = job_queue.get()
        if jid is None:
            break

        j = get_jobs().get(jid)
        if not j:
            job_queue.task_done()
            continue

        cancel_event = stop_flags.get(jid) or threading.Event()
        stop_flags[jid] = cancel_event
        update_job(jid, status="running", started_at=time.time())

        try:
            chapter_path = safe_join_flat(CHAPTER_DIR, j["chapter_file"])
        except ValueError:
            update_job(jid, status="failed", finished_at=time.time(), log="", error="Invalid chapter path.")
            job_queue.task_done()
            continue
        stem = Path(chapter_path.name).stem
        settings = get_settings()
        make_mp3 = bool(j.get("make_mp3", settings.get("make_mp3", DEFAULT_MAKE_MP3)))
        safe_mode = bool(j.get("safe_mode", settings.get("safe_mode", True)))

        if j["engine"] == "xtts":
            out_wav = XTTS_OUT_DIR / f"{stem}.wav"
            rc, log = xtts_generate(chapter_path, out_wav, safe_mode=safe_mode, cancel_event=cancel_event)
            out_mp3 = XTTS_OUT_DIR / f"{stem}.mp3"
        else:
            update_job(jid, status="failed", finished_at=time.time(), log="", error=f"Unknown engine: {j['engine']}")
            job_queue.task_done()
            continue

        if cancel_event.is_set():
            update_job(jid, status="cancelled", finished_at=time.time(), log=log, error="Cancelled by user.")
            job_queue.task_done()
            continue

        if rc == 0 and out_wav.exists():
            # optional mp3
            if make_mp3:
                frc, fout = ffmpeg_wav_to_mp3(out_wav, out_mp3)
                log += f"\n\n[ffmpeg] rc={frc}\n{fout}\n"
                if frc == 0 and out_mp3.exists():
                    update_job(jid, status="done", finished_at=time.time(), log=log,
                               output_wav=str(out_wav.name), output_mp3=str(out_mp3.name))
                else:
                    update_job(jid, status="done", finished_at=time.time(), log=log,
                               output_wav=str(out_wav.name), output_mp3=None,
                               error="MP3 conversion failed (WAV still generated).")
            else:
                update_job(jid, status="done", finished_at=time.time(), log=log, output_wav=str(out_wav.name))
        else:
            update_job(jid, status="failed", finished_at=time.time(), log=log, error=f"Generation failed (rc={rc}).")

        job_queue.task_done()

worker_thread = threading.Thread(target=worker_loop, daemon=True)
worker_thread.start()

@app.get("/", response_class=HTMLResponse)
def index():
    chapters = [p.name for p in list_chapters()]
    jobs = list(get_jobs().values())
    jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)

    settings = get_settings()
    settings_obj = type("S", (), settings)

    done_xtts = set()
    for c in chapters:
        if output_exists("xtts", c): done_xtts.add(c)

    latest_report = None
    reports = sorted(REPORTS_DIR.glob("long_sentence_report_*.txt"))
    if reports:
        latest_report = reports[-1].name

    html = templates.from_string(INDEX_HTML).render(
        chapters=chapters[:300],
        chapter_count=len(chapters),
        jobs=jobs[:200],
        paused=pause_flag.is_set(),
        narrator_ok=NARRATOR_WAV.exists(),
        latest_report=latest_report,
        settings=settings_obj,
        sent_limit=SENT_CHAR_LIMIT,
        done_xtts=done_xtts
    )
    return HTMLResponse(html)

@app.post("/settings")
def settings_save(safe_mode: Optional[str] = Form(None), make_mp3: Optional[str] = Form(None)):
    update_settings(
        safe_mode=bool(safe_mode),
        make_mp3=bool(make_mp3)
    )
    return RedirectResponse("/", status_code=303)

@app.post("/enqueue")
def enqueue(chapter_file: str = Form(...), engine: str = Form(...)):
    try:
        chapter_path = safe_join_flat(CHAPTER_DIR, chapter_file)
    except ValueError:
        return JSONResponse({"error": "chapter not found"}, status_code=404)
    if not chapter_path.exists():
        return JSONResponse({"error": "chapter not found"}, status_code=404)
    safe_chapter_file = chapter_path.name

    settings = get_settings()
    jid = uuid.uuid4().hex[:12]
    job = {
        "id": jid,
        "chapter_file": safe_chapter_file,
        "engine": engine,
        "status": "queued",
        "created_at": time.time(),
        "safe_mode": bool(settings.get("safe_mode", True)),
        "make_mp3": bool(settings.get("make_mp3", DEFAULT_MAKE_MP3)),
        "output_mp3": None,
    }
    put_job(job)
    stop_flags[jid] = threading.Event()
    job_queue.put(jid)
    return RedirectResponse("/", status_code=303)

@app.post("/enqueue_missing")
def enqueue_missing():
    settings = get_settings()
    for p in list_chapters():
        if output_exists("xtts", p.name):
            continue
        jid = uuid.uuid4().hex[:12]
        put_job({
            "id": jid, "chapter_file": p.name, "engine": "xtts", "status": "queued",
            "created_at": time.time(), "safe_mode": bool(settings.get("safe_mode", True)),
            "make_mp3": bool(settings.get("make_mp3", DEFAULT_MAKE_MP3)),
            "log": "", "error": None, "output_wav": None, "output_mp3": None,
        })
        stop_flags[jid] = threading.Event()
        job_queue.put(jid)
    return RedirectResponse("/", status_code=303)

@app.post("/enqueue_next")
def enqueue_next():
    chapters = [p.name for p in list_chapters()]
    for c in chapters:
        if not output_exists("xtts", c):
            return enqueue(chapter_file=c, engine="xtts")
    return RedirectResponse("/", status_code=303)

@app.post("/pause")
def pause():
    if pause_flag.is_set():
        pause_flag.clear()
    else:
        pause_flag.set()
    return RedirectResponse("/", status_code=303)

@app.post("/cancel")
def cancel(job_id: str = Form(...)):
    ev = stop_flags.get(job_id)
    if ev:
        ev.set()
    return RedirectResponse("/", status_code=303)

@app.post("/clear_failed")
def clear_failed():
    state = load_state()
    jobs = state.get("jobs", {})
    to_del = [jid for jid, j in jobs.items() if j.get("status") == "failed"]
    for jid in to_del:
        jobs.pop(jid, None)
    state["jobs"] = jobs
    save_state(state)
    return RedirectResponse("/", status_code=303)

@app.post("/analyze")
def analyze():
    report_name = analyze_long_sentences()
    return RedirectResponse(f"/report/{report_name}", status_code=303)

@app.get("/report/{name}", response_class=PlainTextResponse)
def report(name: str):
    try:
        p = safe_join_flat(REPORTS_DIR, name)
    except ValueError:
        return PlainTextResponse("Report not found.", status_code=404)
    if not p.exists():
        return PlainTextResponse("Report not found.", status_code=404)
    return PlainTextResponse(p.read_text(encoding="utf-8", errors="replace"))

@app.get("/job/{job_id}", response_class=HTMLResponse)
def job_page(job_id: str):
    job = get_jobs().get(job_id)
    if not job:
        return PlainTextResponse("Job not found", status_code=404)
    html = templates.from_string(JOB_HTML).render(job=job)
    return HTMLResponse(html)

@app.get("/state")
def state():
    return JSONResponse(load_state())

# static mounts for output files
app.mount("/out/xtts", StaticFiles(directory=str(XTTS_OUT_DIR)), name="out_xtts")

# Start worker thread at import time
worker_thread = threading.Thread(target=worker_loop, daemon=True)
worker_thread.start()
