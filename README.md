# ClipForge AI — AI Video-to-Shorts Generator

Built by **rakeshhh.b**. Full-stack dark-mode creator platform inspired by ClipSon.io. Turns long YouTube videos or local MP4/MOV uploads into viral vertical 9:16 shorts with AI hook scoring, live 9:16 video sync, and animated word-by-word captions.

## Deploy to Vercel (Public HTTPS URL)

### Option A: One-Command Vercel CLI Deploy
Run inside the `clipforge-ai` folder:
```bash
npx vercel --prod
```
Follow the browser login prompt once, accept the defaults (Framework: **Next.js**), and Vercel will return your live `https://clipforge-ai-*.vercel.app` link.

### Option B: Deploy via GitHub + Vercel Dashboard
1. Push the `clipforge-ai/` folder to a GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. Keep Framework Preset as **Next.js** (if `clipforge-ai` is inside a parent repo, set **Root Directory** to `clipforge-ai`).
4. Optional Environment Variables in **Project Settings → Environment Variables**:
   - `GEMINI_API_KEY` — Enables Gemini Flash AI hook extraction on YouTube transcripts (works free without it using the built-in NLP Hook Scorer).
   - `NEXT_PUBLIC_API_URL` — Optional URL of your hosted Python FastAPI FFmpeg worker for server-side 1080p MP4 rendering.
5. Click **Deploy**.

---

## Run Locally

### 1. Next.js Web App + YouTube AI Engine
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

### 2. Optional Python FastAPI FFmpeg Worker (1080p MP4 Export)
Requires Python 3.10+ and `ffmpeg` installed on `PATH`.
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # Add GEMINI_API_KEY / GROQ_API_KEY if desired
uvicorn main:app --reload --port 8000
```
