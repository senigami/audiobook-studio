<p align="center">
  <img src="docs/assets/logo.png" alt="Audiobook Studio Hero Banner" width="50%">
  <img src="docs/assets/audiobook-studio.png" alt="Audiobook Studio Hero Banner" width="50%">
</p>

# Audiobook Studio

### Professional AI Production Pipeline for Long-Form Narration

[![Build Status](https://github.com/senigami/audiobook-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/senigami/audiobook-studio/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)

**Audiobook Studio** is a high-performance **AI Voice Production Studio** and **Narration Engine** designed for turning manuscripts into professional audiobooks using local AI speech synthesis.

[**Full Documentation (Wiki)**](https://github.com/senigami/audiobook-studio/wiki) | [**Live Showcase**](https://senigami.github.io/audiobook-studio/)

---

## 🎙️ Overview

Audiobook Studio provides a professional production pipeline with granular control over every word:

- **Multi-Voice Scripting**: Assign unique studio voices to characters or paragraphs.
- **Segment Regeneration**: Fine-tune specific segments without re-generating entire chapters.
- **Incremental Assembly**: Fast, lossless M4B compilation using cached chapter encodes.
- **Local Voice Cloning**: Clone voices locally from 60-second samples via XTTS-v2.
- **Hardware-Aware**: Precise ETAs calculated from your actual GPU/CPU throughput.

> [!NOTE]
> For detailed guides on project management, voice cloning, and production workflows, please visit our **[GitHub Wiki](https://github.com/senigami/audiobook-studio/wiki)**.

---

## 🧩 Feature Suite

| 🎙️ Multi-Voice Scripting                                 | 📚 Long-Form Support                                      | ⚙️ Pipeline Automation                            |
| :------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------ |
| Assign unique voices to specific dialogue or paragraphs. | Designed for 100k+ word manuscripts with stable batching. | Automatic splitting, normalization, and assembly. |

| 🧪 Segment Regeneration                                      | 🚀 Batch Processing                                            | 📊 Real-Time Feedback                                         |
| :----------------------------------------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------ |
| Fine-tune and regenerate segments without re-doing chapters. | Queue dozens of chapters and track them with auto-tuning ETAs. | Integrated console for live engine logs and hardware metrics. |

---

## 🛠️ System Requirements

- **OS**: macOS, Linux, or Windows
- **Python**: 3.11+ (Strictly required for XTTS)
- **Node.js**: 18+ (For frontend dashboard)
- **Hardare**: NVIDIA GPU (8GB+ VRAM) highly recommended for synthesis speed.
- **System Tools**: `ffmpeg` (Required for MP3 and M4B generation)

---

## 📦 Installation

### 1️⃣ Clone the Studio

```bash
git clone https://github.com/senigami/audiobook-studio.git
cd audiobook-studio
```

### 2️⃣ Configure the Environment

```bash
# Setup Backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup XTTS Engine
python3.11 -m venv ~/xtts-env
source ~/xtts-env/bin/activate
pip install -r requirements-xtts.txt
```

### 3️⃣ Add Voice Profiles

Place 60-second `.wav` samples in `voices/`:

```text
voices/
  Narrator-A/
    speaker.wav
  Narrator-B/
    speaker.wav
```

---

## ▶ Running the Studio

1. **Start the Engine**:

```bash
source venv/bin/activate
uvicorn run:app --port 8123
```

2. **Access the Lab**:
   Navigate to `http://127.0.0.1:8123` to enter the production dashboard.

---

## 🧪 Quality Control

Audiobook Studio maintains a rigorous automated testing suite ensuring every narration is technically perfect.

```bash
# Run full test suite
pytest -v
npm test --prefix frontend
```

---

## 🔐 Privacy & Security

Designed for **local-first production**. Audiobook Studio never uploads your manuscripts or voice clones to external servers. Your creative IP stays on your machine.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<p align="center">
  <i>"Professional AI Production Pipeline for Long-Form Narration"</i>
</p>
