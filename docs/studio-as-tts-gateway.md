# Studio as a Local TTS Gateway

Audiobook Studio can be used as a high-performance, local-first TTS gateway for other applications (e.g., Home Assistant, automation scripts, or local AI tools). 

This guide explains how to configure and use the public Studio TTS API.

## 🚀 Getting Started

The TTS API is disabled by default. To enable it:
1. Open Audiobook Studio.
2. Go to **Settings > TTS API**.
3. Toggle **Enable External TTS API** to ON.

### OpenAPI Documentation
Studio generates interactive documentation for the API:
- **Swagger UI**: [http://localhost:8000/api/v1/tts/docs](http://localhost:8000/api/v1/tts/docs)
- **OpenAPI JSON**: [http://localhost:8000/api/v1/tts/openapi](http://localhost:8000/api/v1/tts/openapi)

---

## 🔒 Security and Access

### Authentication
If you are running Studio on your local machine and only accessing it from that same machine, you can leave the **API Key** empty for open access.

To secure the gateway (especially when using LAN binding):
1. Enter a strong secret in **Settings > TTS API Key**.
2. Include it in your requests as a Bearer token: `Authorization: Bearer <your-key>`.

### LAN Binding
By default, the API only accepts requests from the loopback address (`127.0.0.1` or `localhost`). 

To allow other devices on your network to use the gateway:
1. Enable **Allow LAN Binding** in Settings.
2. Ensure your firewall allows traffic on the Studio port (default 8000).

### Rate Limiting
The API includes a basic sliding-window rate limiter (default: 30 requests per minute) to prevent resource flooding. This can be adjusted in Settings.

---

## 🛠️ Usage Examples

### 1. Discover Engines
List all installed and verified TTS engines available for use.

```bash
curl http://localhost:8000/api/v1/tts/engines \
  -H "Authorization: Bearer your-api-key"
```

### 2. Synthesize Audio
Submit text for synthesis. 
- **Inline**: Short requests (< 500 characters) return the audio file directly in the response.
- **Queued**: Longer requests return a `job_id` for polling.

#### Example (Inline)
```bash
curl -X POST http://localhost:8000/api/v1/tts/synthesize \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "engine_id": "xtts",
    "text": "Hello, this is Audiobook Studio.",
    "output_format": "wav"
  }' --output output.wav
```

### 3. Polling for Long Requests
For long text, you will receive a `job_id`. Poll the status until it is `completed`.

```python
import requests
import time

API_URL = "http://localhost:8000/api/v1/tts"
HEADERS = {"Authorization": "Bearer your-api-key"}

# 1. Submit
res = requests.post(f"{API_URL}/synthesize", json={
    "engine_id": "xtts",
    "text": "A very long text that requires background processing..."
}, headers=HEADERS).json()

job_id = res["job_id"]

# 2. Poll
while True:
    status = requests.get(f"{API_URL}/jobs/{job_id}", headers=HEADERS).json()
    if status["status"] == "completed":
        print("Done!")
        # 3. Download
        audio = requests.get(f"{API_URL}/jobs/{job_id}/audio", headers=HEADERS)
        with open("result.wav", "wb") as f:
            f.write(audio.content)
        break
    elif status["status"] == "failed":
        print(f"Error: {status.get('message')}")
        break
    time.sleep(1)
```

---

## ⚖️ Priority Policies
API synthesis tasks participate in the same scheduling queue as Studio UI tasks. You can configure the priority in **Settings > API Priority Mode**:
- **Studio First**: Studio UI tasks take precedence (default).
- **Equal**: First-come, first-served.
- **API First**: API requests jump to the front of the queue.
