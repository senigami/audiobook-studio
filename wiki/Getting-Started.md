# Getting Started

This guide will walk you through setting up **Audiobook Studio** and creating your first project.

## 📋 Prerequisites

- **Python 3.9+**
- **Node.js 16+**
- **FFmpeg** (required for audio processing and stitching)
- **Coqui XTTS v2** (managed automatically by the backend)

## 🚀 Installation

### 1. Backend Setup

```bash
# Navigate to root
cd audiobook-factory

# Create a virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

## 🏃 Running the Application

### Start the Backend

```bash
# From root
python -m app.web
```

The API will be available at `http://localhost:8000`.

### Start the Frontend

```bash
# From frontend folder
npm run dev
```

Open your browser to `http://localhost:5173`.

## 📖 Your First Project

1. **Navigate to Library**: This is the default screen.
2. **Create Project**: Click the "New Project" button.
3. **Fill Details**: Enter a name (e.g., "My First Audiobook") and upload a cover if you have one.
4. **Enter Project**: Click on the project card to enter the **Project View**.

![Library view with the New Project button highlighted](images/new-project.jpg)

---

[[Home]] | [[Concepts]] | [[Library and Projects]]
