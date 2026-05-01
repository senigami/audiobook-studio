# HTML Templates for the legacy dashboard

INDEX_HTML = r"""
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>TTS Dashboard</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 18px; }
  .row { display: flex; gap: 18px; align-items: flex-start; }
  .panel { border: 1px solid #ddd; border-radius: 12px; padding: 14px; flex: 1; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border-bottom: 1px solid #eee; padding: 6px 8px; text-align: left; vertical-align: top; }
  .tag { padding: 2px 8px; border-radius: 999px; border: 1px solid #ccc; font-size: 12px; }
  .btnrow form { display:inline; margin-right: 8px; }
  .small { color:#444; font-size: 13px; }
  .warn { color:#b00020; }
  .ok { color:#0b6; }
</style>
</head>
<body>

<h2>TTS Dashboard</h2>

<div class="panel">
  <h3>Quick Start (for Future You)</h3>
  <div class="small">
    <ol>
      <li>Put chapter text files in <span class="mono">chapters_out/</span> (one chapter per .txt).</li>
      <li>Put your reference voice in <span class="mono">narrator_clean.wav</span> (same folder as this app).</li>
      <li>Run the server:
        <div class="mono">cd ~/tts-dashboard
source venv/bin/activate
uvicorn app:app --reload --port 8123</div>
      </li>
      <li>Open: <span class="mono">http://127.0.0.1:8123</span></li>
      <li>Recommended: click <b>Analyze long sentences</b> before generating audio.</li>
          <li>Outputs: <span class="mono">{{ audio_output_dir }}/</span></li>
    </ol>
    <p><b>Why Safe Mode?</b> Some engines may truncate “sentences” longer than {{ sent_limit }} chars. Safe Mode auto-split long sentences before synthesis.</p>
  </div>
</div>

<div class="row">
  <div class="panel">
    <h3>Chapters</h3>
    <p class="small">Found <b>{{ chapter_count }}</b> files in <span class="mono">chapters_out/</span></p>

    <div class="btnrow">
      <form method="post" action="/analyze"><button type="submit">Analyze long sentences</button></form>
      <form method="post" action="/enqueue_missing"><button type="submit">Enqueue missing</button></form>
      <form method="post" action="/enqueue_next"><button type="submit">Generate next chapter</button></form>
    </div>

    <hr/>
    <p class="small">
      Default settings:
      <b>Safe Mode:</b> {{ "ON" if settings.safe_mode else "OFF" }}
    </p>

    <form method="post" action="/settings" class="small">
      <label><input type="checkbox" name="safe_mode" value="1" {% if settings.safe_mode %}checked{% endif %}/> Safe Mode (split long sentences)</label><br/>
      <button type="submit">Save settings</button>
    </form>

    <hr/>
    <table>
      <tr><th>File</th><th>Actions</th></tr>
      {% for c in chapters %}
      <tr>
        <td>
          {{ c }}
          {% if c in done_chapters %}<span class="tag ok">Done</span>{% endif %}
        </td>
        <td>
          <form method="post" action="/enqueue" style="display:inline">
            <input type="hidden" name="chapter_file" value="{{ c }}"/>
            <input type="hidden" name="engine" value="{{ settings.default_engine if settings.default_engine is defined else default_engine }}"/>
            <button type="submit">Enqueue</button>
          </form>
        </td>
      </tr>
      {% endfor %}
    </table>
  </div>

  <div class="panel">
    <h3>Queue + Jobs</h3>

    <div class="btnrow">
      <form method="post" action="/pause"><button type="submit">{{ "Resume" if paused else "Pause" }}</button></form>
      <form method="post" action="/clear_failed"><button type="submit">Clear failed jobs</button></form>
    </div>

    <p class="small">
      <b>Narrator wav:</b>
      {% if narrator_ok %}<span class="ok">Found</span>{% else %}<span class="warn">Missing (narrator_clean.wav)</span>{% endif %}
      <br/>
      <b>Latest report:</b> {% if latest_report %}<a href="/report/{{ latest_report }}">{{ latest_report }}</a>{% else %}—{% endif %}
    </p>

    <table>
      <tr><th>Status</th><th>Engine</th><th>Chapter</th><th>Output</th><th>Actions</th></tr>
      {% for j in jobs %}
      <tr>
        <td><span class="tag">{{ j.status }}</span></td>
        <td>{{ j.engine }}</td>
        <td>{{ j.chapter_file }}</td>
        <td>
          {% if j.output_mp3 %}
            <a href="/out/{{ j.engine }}/{{ j.output_mp3 }}">mp3</a>
          {% endif %}
          {% if j.output_wav %}
            | <a href="/out/{{ j.engine }}/{{ j.output_wav }}">wav</a>
          {% endif %}
        </td>
        <td>
          <a href="/job/{{ j.id }}">View</a>
          {% if j.status in ["queued","running"] %}
            | <form method="post" action="/cancel" style="display:inline">
                <input type="hidden" name="job_id" value="{{ j.id }}"/>
                <button type="submit">Cancel</button>
              </form>
          {% endif %}
        </td>
      </tr>
      {% endfor %}
    </table>

    <p class="small"><a href="/state">Raw state JSON</a></p>
  </div>
</div>

</body>
</html>
"""

JOB_HTML = r"""
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Job {{ job.id }}</title>
<style>
body { font-family: -apple-system, system-ui, sans-serif; margin: 18px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; font-size: 12px; border:1px solid #ddd; padding:10px; border-radius: 10px;}
.tag { padding: 2px 8px; border-radius: 999px; border: 1px solid #ccc; font-size: 12px; }
.warn { color:#b00020; }
</style>
</head>
<body>
  <p><a href="/">← Back</a></p>
  <h2>Job {{ job.id }}</h2>
  <p><b>Status:</b> <span class="tag">{{ job.status }}</span></p>
  <p><b>Engine:</b> {{ job.engine }}</p>
  <p><b>Chapter:</b> {{ job.chapter_file }}</p>
  <p><b>Safe Mode:</b> {{ job.safe_mode }}</p>
  <p><b>MP3:</b> {{ job.make_mp3 }}</p>
  <p><b>Output:</b>
    {% if job.output_mp3 %}<a href="/out/{{ job.engine }}/{{ job.output_mp3 }}">mp3</a>{% endif %}
    {% if job.output_wav %} | <a href="/out/{{ job.engine }}/{{ job.output_wav }}">wav</a>{% endif %}
  </p>
  {% if job.error %}<p class="warn"><b>Error:</b> {{ job.error }}</p>{% endif %}
  <h3>Log</h3>
  <div class="mono">{{ job.log }}</div>
</body>
</html>
"""
