# Lorri — Backend ↔ Frontend Integration Guide

> A comprehensive guide covering how the FastAPI backend and React frontend communicate, common integration issues, and their fixes.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Communication Layer](#2-api-communication-layer)
3. [Endpoint-by-Endpoint Integration Map](#3-endpoint-by-endpoint-integration-map)
4. [Environment & Configuration](#4-environment--configuration)
5. [CORS Configuration](#5-cors-configuration)
6. [Data Flow & State Management](#6-data-flow--state-management)
7. [Docker & Deployment Integration](#7-docker--deployment-integration)
8. [Common Integration Issues & Fixes](#8-common-integration-issues--fixes)
   - [8.1 Network & Connectivity](#81-network--connectivity)
   - [8.2 CORS Errors](#82-cors-errors)
   - [8.3 Data Shape Mismatches](#83-data-shape-mismatches)
   - [8.4 Environment Variable Issues](#84-environment-variable-issues)
   - [8.5 Database-Related Issues](#85-database-related-issues)
   - [8.6 Long-Running Request Timeouts](#86-long-running-request-timeouts)
   - [8.7 API Key & LLM Integration Issues](#87-api-key--llm-integration-issues)
   - [8.8 Docker Integration Issues](#88-docker-integration-issues)
   - [8.9 WebGL / Globe Component Issues](#89-webgl--globe-component-issues)
   - [8.10 State Management Issues](#810-state-management-issues)
   - [8.11 Production Deployment Issues](#811-production-deployment-issues)
   - [8.12 Security Concerns](#812-security-concerns)
9. [Testing Integration](#9-testing-integration)
10. [Quick Troubleshooting Checklist](#10-quick-troubleshooting-checklist)

---

## 1. Architecture Overview

```
┌────────────────────────┐       HTTP/REST        ┌───────────────────────────┐
│       FRONTEND         │ ──────────────────────► │         BACKEND           │
│   React 18 + Vite      │                         │     FastAPI + Uvicorn     │
│   Port 3000 (dev)      │                         │       Port 8000           │
│                        │ ◄────────────────────── │                           │
│  Axios → api.js        │       JSON responses    │  Pydantic schemas         │
│  AppContext (state)     │                         │  SQLAlchemy ORM           │
│  React Router v6       │                         │  LangGraph Pipeline       │
└────────────────────────┘                         └─────────┬─────────────────┘
                                                             │
                                                             ▼
                                                   ┌─────────────────┐
                                                   │    DATABASE      │
                                                   │  SQLite (dev)    │
                                                   │  Postgres (prod) │
                                                   └─────────────────┘
```

**Key technologies:**

| Layer    | Technology                          | Port  |
|----------|-------------------------------------|-------|
| Frontend | React 18, Vite, Tailwind, Recharts  | 3000  |
| Backend  | FastAPI, Uvicorn, SQLAlchemy, LangGraph | 8000  |
| Database | SQLite (dev) / PostgreSQL (prod)    | 5433  |
| Maps     | Leaflet, Globe.gl (WebGL)           | —     |

---

## 2. API Communication Layer

### Frontend HTTP Client (`frontend/src/services/api.js`)

The frontend uses **Axios** with a centralized configuration:

```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  timeout: 120_000,   // 2 minutes — needed for optimization runs
  headers: { 'Content-Type': 'application/json' },
});
```

**Response interceptor:** Extracts `.data` from Axios responses and re-throws errors with `detail` messages from the backend.

### Vite Dev Proxy (`frontend/vite.config.js`)

```javascript
server: {
  port: 3000,
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
}
```

> **Note:** The proxy rewrites `/api/shipments` → `/shipments`. This means the frontend can use either `VITE_API_URL` (direct) or the `/api` prefix (proxied). The codebase currently uses the direct `VITE_API_URL` approach.

---

## 3. Endpoint-by-Endpoint Integration Map

| Frontend Action               | Hook Method             | HTTP Method | Backend Endpoint                     | Backend Handler              |
|-------------------------------|-------------------------|-------------|--------------------------------------|------------------------------|
| Load shipments                | `loadShipments()`       | `GET`       | `/shipments?limit=&offset=&priority=` | `get_shipments()`            |
| Create shipment(s)            | `createShipment()`      | `POST`      | `/shipments`                         | `create_shipments()`         |
| Seed test data                | `seedData()`            | `POST`      | `/dev/seed?dataset=&shipment_count=` | `seed_data()`                |
| Run optimization pipeline     | `runFullOptimization()` | `POST`      | `/optimize?run_simulation=&run_llm=` | `optimize()`                 |
| Fetch a plan                  | `getPlan(planId)`       | `GET`       | `/plan/{plan_id}`                    | `get_plan()`                 |
| Run scenario simulations      | `runSimulation()`       | `POST`      | `/simulate?plan_id=`                 | `simulate()`                 |
| Get metrics                   | `getMetrics(planId)`    | `GET`       | `/metrics?plan_id=`                  | `get_metrics()`              |
| Health check                  | (not in UI)             | `GET`       | `/health`                            | `health_check()`             |

### Request-Response Shape Mapping

#### Shipments

**Frontend sends:**
```json
{
  "shipment_id": "S001",
  "origin": "Mumbai",
  "destination": "Delhi",
  "pickup_time": "2026-03-10T08:00:00",
  "delivery_time": "2026-03-11T18:00:00",
  "weight": 500.0,
  "volume": 2.5,
  "priority": "HIGH",
  "special_handling": "fragile",
  "status": "PENDING"
}
```

**Backend returns:**
```json
[
  {
    "shipment_id": "S001",
    "origin": "Mumbai",
    "destination": "Delhi",
    "pickup_time": "2026-03-10T08:00:00",
    "delivery_time": "2026-03-11T18:00:00",
    "weight": 500.0,
    "volume": 2.5,
    "priority": "HIGH",
    "special_handling": "fragile",
    "status": "PENDING"
  }
]
```

#### Optimization

**Frontend sends:**
```
POST /optimize?run_simulation=true&run_llm=true&cost_weight=0.4&sla_weight=0.35&carbon_weight=0.25
```

**Backend returns:**
```json
{
  "plan": {
    "id": 1,
    "status": "OPTIMIZED",
    "total_trucks": 5,
    "trips_baseline": 12,
    "avg_utilization": 78.5,
    "cost_saving_pct": 23.0,
    "carbon_saving_pct": 18.0,
    "assigned": [
      {
        "vehicle_id": "V001",
        "shipment_ids": "[\"S001\", \"S003\"]",   // ⚠️ JSON string, not array!
        "utilization_pct": 82.0,
        "route_detour_km": 15.3
      }
    ]
  },
  "scenarios": [...],
  "validation": {...},
  "insights": {...},
  "relaxation": {...},
  "scenario_analysis": {...}
}
```

**Frontend transforms** (`useOptimizer.transformPlan`): Converts `plan.assigned[]` → `plan.trucks[]` for UI consumption.

---

## 4. Environment & Configuration

### Backend Environment Variables

| Variable          | Default               | Description                              |
|-------------------|-----------------------|------------------------------------------|
| `DATABASE_URL`    | `sqlite:///./dev.db`  | Database connection string               |
| `OPENAI_API_KEY`  | `""`                  | OpenAI API key (for LLM-powered agents)  |
| `GOOGLE_API_KEY`  | `""`                  | Google Gemini API key (for insights)     |
| `PYTHONUNBUFFERED` | —                    | Set to `1` in Docker for live logging    |

### Frontend Environment Variables

| Variable        | Default                   | Description               |
|-----------------|---------------------------|---------------------------|
| `VITE_API_URL`  | `http://localhost:8000`   | Backend API base URL      |

### Setup Steps

```bash
# Backend
cd backend
cp .env.example .env   # If exists, otherwise create manually
# Add: DATABASE_URL=sqlite:///./dev.db
# Add: GOOGLE_API_KEY=your_key_here
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
cp env.example .env
# Verify: VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

---

## 5. CORS Configuration

**Current setup** (`backend/app/main.py`):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> **Warning:** This is a development-only configuration. In production, `allow_origins` must be restricted to the actual frontend domain.

**Production fix:**
```python
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "https://your-frontend.onrender.com").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

---

## 6. Data Flow & State Management

### Frontend State Architecture

```
AppProvider (context/AppContext.jsx)
  ├── useShipments()          → shipments[], total, loading, error
  │     ├── loadShipments()   → GET /shipments
  │     ├── createShipment()  → POST /shipments
  │     └── seedData()        → POST /dev/seed
  │
  └── useOptimizer()          → optimizationResult, loading, error
        ├── runOptimization() → POST /optimize
        ├── runSimulation()   → POST /simulate
        ├── getMetrics()      → GET /metrics
        └── getPlan()         → GET /plan/{id}
```

### Full Optimization Pipeline Flow

```
User clicks "Optimize" (Optimize page)
       │
       ▼
useOptimizer.runOptimization({ run_simulation: true, run_llm: true })
       │
       ▼
POST /optimize ────────────────────► Backend
                                       │
                                       ├── Load shipments & vehicles from DB
                                       ├── Run validation agent
                                       ├── Run heuristic solver
                                       ├── Run compatibility model
                                       ├── Run scenario agent (4 scenarios)
                                       ├── Run insight agent (LLM)
                                       ├── Run relaxation agent
                                       ├── Persist plan + assignments + scenarios to DB
                                       │
                                       ▼
                              Return full result JSON
       │
       ▼
useOptimizer.transformPlan(result)
       │
       ├── plan.assigned[] → plan.trucks[] (shape transform)
       ├── Merge scenarios, insights, validation into state
       │
       ▼
AppContext updated → All pages re-render with new data
       │
       ├── Optimize page: shows plan summary + truck assignments
       ├── Scenarios page: shows 4-scenario comparison cards
       └── Insights page: shows agent outputs (validation, insights, relaxation)
```

---

## 7. Docker & Deployment Integration

### Local Docker Compose

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:15-alpine
    ports: ["5433:5432"]       # ⚠️ External port is 5433, not 5432
    environment:
      POSTGRES_USER: lorri
      POSTGRES_PASSWORD: lorri
      POSTGRES_DB: lorri_db

  app:
    build:
      context: .               # ⚠️ Repo root (not backend/)
      dockerfile: backend/Dockerfile
    ports: ["8000:8000"]
    depends_on:
      db: { condition: service_healthy }
    env_file: backend/.env.docker
```

> **Note:** Only the backend is containerized. The frontend runs natively with `npm run dev` during development.

### Production (Render)

The `render.yaml` blueprint deploys:
- A **web service** for the backend (Docker)
- A **PostgreSQL database** (managed)
- Frontend must be deployed separately (e.g., Render static site, Vercel, Netlify)

---

## 8. Common Integration Issues & Fixes

### 8.1 Network & Connectivity

#### Issue: `ERR_CONNECTION_REFUSED` when frontend calls backend

**Symptoms:**
- Console shows `AxiosError: Network Error`
- Requests to `http://localhost:8000` fail

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Backend not running | Start backend: `cd backend && uvicorn app.main:app --reload --port 8000` |
| Wrong port | Verify backend port matches `VITE_API_URL` (default: 8000) |
| Backend crashed on startup | Check terminal for Python errors (missing deps, DB issues) |
| Firewall blocking | Ensure port 8000 is not blocked locally |

#### Issue: Frontend loads but API calls hang indefinitely

**Cause:** Backend is running but unresponsive (e.g., stuck in an LLM call without an API key).

**Fix:**
```bash
# Check backend logs for errors
# Ensure API keys are set if run_llm=true
curl http://localhost:8000/health   # Should return {"status":"ok"}
```

---

### 8.2 CORS Errors

#### Issue: `Access to XMLHttpRequest blocked by CORS policy`

**Symptoms:**
- Browser console shows CORS error
- Network tab shows request blocked (no response)
- Preflight `OPTIONS` request returns non-200

**Common Scenarios:**

| Scenario | Cause | Fix |
|----------|-------|-----|
| Dev — direct connection | CORS middleware not loaded | Ensure `CORSMiddleware` is added in `main.py` |
| Dev — mismatched URLs | Frontend at `localhost:3000`, API at `127.0.0.1:8000` | Use consistent host: both `localhost` or both `127.0.0.1` |
| Production | `allow_origins=["*"]` might be stripped by hosting | Set explicit allowed origin: `allow_origins=["https://your-app.com"]` |
| Credentials issue | `allow_credentials=True` with `allow_origins=["*"]` | Some browsers reject this combo — use explicit origin |

**Debug command:**
```bash
curl -v -X OPTIONS http://localhost:8000/shipments \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"
# Check for Access-Control-Allow-Origin in response headers
```

---

### 8.3 Data Shape Mismatches

#### Issue: `shipment_ids` is a string, not an array

**Problem:** The `PlanAssignment.shipment_ids` field is stored as a JSON-encoded string in the database (`'["S001","S003"]'`), not a native list.

**Symptoms:**
- Frontend renders `["S001","S003"]` as a literal string
- `.map()` on shipment_ids throws `TypeError: shipment_ids.map is not a function`

**Fix (Frontend):**
```javascript
// When consuming plan assignments, always parse shipment_ids
const shipmentIds = JSON.parse(assignment.shipment_ids);
```

**Better Fix (Backend):** Use a Pydantic validator to auto-parse:
```python
from pydantic import validator

class PlanAssignmentResponse(BaseModel):
    shipment_ids: list

    @validator('shipment_ids', pre=True)
    def parse_shipment_ids(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v
```

#### Issue: Datetime format mismatch

**Problem:** Backend returns ISO 8601 datetimes (`2026-03-10T08:00:00`), but frontend may expect different formats.

**Fix:**
```javascript
// Use consistent date parsing
const formatted = new Date(shipment.pickup_time).toLocaleString();
```

#### Issue: Frontend expects `plan.trucks[]` but backend sends `plan.assigned[]`

**Context:** The `useOptimizer` hook has a `transformPlan()` function that maps backend structure to frontend structure.

**Symptoms:**
- If the backend response shape changes, the transform function breaks silently
- Routes or truck cards show as empty

**Fix:** Ensure `transformPlan()` handles edge cases:
```javascript
function transformPlan(result) {
  if (!result?.plan?.assigned) {
    console.warn('No assignments in plan result');
    return { ...result, plan: { ...result.plan, trucks: [] } };
  }
  // ... rest of transform
}
```

#### Issue: Enum value case mismatch

**Problem:** Backend uses uppercase enums (`HIGH`, `PENDING`, `STRICT_SLA`), frontend must match exactly.

**Symptoms:**
- Filter dropdowns don't match backend values
- Priority badges show wrong colors

**Fix:** Always compare with consistent casing:
```javascript
// ✅ Correct
if (shipment.priority === 'HIGH') { ... }

// ❌ Wrong
if (shipment.priority === 'high') { ... }
```

---

### 8.4 Environment Variable Issues

#### Issue: `VITE_API_URL` not recognized

**Cause:** Vite requires environment variables to be prefixed with `VITE_` and the `.env` file must be in the `frontend/` directory.

**Symptoms:**
- `import.meta.env.VITE_API_URL` is `undefined`
- Falls back to `http://localhost:8000` (which may be correct for dev but wrong for prod)

**Fixes:**

| Cause | Fix |
|-------|-----|
| Missing `.env` file | `cp frontend/env.example frontend/.env` |
| Wrong prefix | Variable MUST start with `VITE_` |
| Not restarted | Vite requires restart after `.env` changes |
| `.env` in wrong directory | Must be in `frontend/`, not project root |

#### Issue: Backend `.env` not loaded

**Cause:** `python-dotenv` looks for `.env` in the working directory.

**Fixes:**
```bash
# Run from backend/ directory
cd backend && uvicorn app.main:app --reload

# OR set env vars explicitly
DATABASE_URL=sqlite:///./dev.db GOOGLE_API_KEY=xxx uvicorn app.main:app --reload
```

---

### 8.5 Database-Related Issues

#### Issue: `OperationalError: no such table` (SQLite)

**Cause:** Database tables haven't been created yet.

**Fix:** The backend auto-creates tables on startup via `Base.metadata.create_all()`. If the `dev.db` file is corrupted:
```bash
rm backend/dev.db
# Restart backend — tables will be recreated
uvicorn app.main:app --reload
```

#### Issue: `could not connect to server` (PostgreSQL in Docker)

**Symptoms:**
- Backend fails on startup inside Docker
- `psycopg2.OperationalError: connection refused`

**Fixes:**

| Cause | Fix |
|-------|-----|
| DB container not ready | Docker Compose `depends_on` with `service_healthy` should handle this. Ensure healthcheck is configured. |
| Wrong connection string | In `backend/.env.docker`, use: `DATABASE_URL=postgresql://lorri:lorri@db:5432/lorri_db` — hostname is `db` (service name), port is `5432` (internal). |
| Port mismatch | Docker exposes `5433` externally but internal is `5432`. Backend inside Docker must use `5432`. |

#### Issue: Empty shipments / no data after clean start

**Cause:** Database is empty. No seeding has been performed.

**Fix:**
```bash
# Via API
curl -X POST "http://localhost:8000/dev/seed?dataset=synthetic&shipment_count=25&vehicle_count=10"

# Or use the frontend "Seed Data" button on the Shipments page
```

#### Issue: SQLite → PostgreSQL migration problems

**Symptoms:**
- Queries work locally (SQLite) but fail in Docker/production (PostgreSQL)
- String comparisons behave differently
- `LIKE` operator case sensitivity differs

**Fixes:**
- SQLite is case-insensitive for `LIKE`; PostgreSQL is case-sensitive → use `ILIKE` or `func.lower()` in SQLAlchemy
- Test with PostgreSQL locally via Docker Compose before deploying
- Boolean handling differs: PostgreSQL uses `true`/`false`; SQLite uses `1`/`0`

---

### 8.6 Long-Running Request Timeouts

#### Issue: Optimization request times out

**Problem:** The `/optimize` endpoint can take 30–120+ seconds depending on data size and whether LLM calls are enabled.

**Symptoms:**
- Frontend shows timeout error after 2 minutes
- Axios throws `ECONNABORTED`
- Backend log shows the request is still processing

**Frontend is configured with a 120-second timeout**, but this may not be enough for large datasets.

**Fixes:**

| Approach | Implementation |
|----------|---------------|
| Increase timeout | In `api.js`: `timeout: 300_000` (5 min) |
| Disable LLM for testing | `POST /optimize?run_llm=false` — skips slow Gemini/OpenAI calls |
| Reduce dataset | Seed fewer shipments: `?shipment_count=10` |
| Add loading indicator | Already present in hooks (`loading` state), ensure UI shows it |

**Better long-term fix — Async job pattern:**
```
POST /optimize → Returns { job_id: "abc123" }
GET /optimize/status/abc123 → Returns { status: "running", progress: 60 }
GET /optimize/result/abc123 → Returns full result when done
```
(Not currently implemented; would require a task queue like Celery or background tasks.)

---

### 8.7 API Key & LLM Integration Issues

#### Issue: Insights/analysis returns generic/template text

**Cause:** `GOOGLE_API_KEY` or `OPENAI_API_KEY` not set. The insight agent falls back to hardcoded template responses.

**Symptoms:**
- Insights page shows placeholder text
- No scenario analysis narrative
- Backend logs show `API key not configured`

**Fix:**
```bash
# In backend/.env
GOOGLE_API_KEY=your_gemini_api_key
# OR
OPENAI_API_KEY=your_openai_key

# Restart backend
```

#### Issue: LLM rate limiting / quota exceeded

**Symptoms:**
- `429 Too Many Requests` from upstream API
- Intermittent failures in the optimization pipeline

**Fix:**
- Add retry logic with exponential backoff in the agent code
- Cache LLM responses for identical inputs
- Run with `run_llm=false` during development/testing

---

### 8.8 Docker Integration Issues

#### Issue: `ModuleNotFoundError: No module named 'backend'`

**Cause:** The Dockerfile sets `PYTHONPATH=/app`, and the app expects imports like `from backend.app.models import ...`. The build context must be the repo root (not `backend/`).

**Fixes:**
- Verify `docker-compose.yml` has `context: .` (repo root) and `dockerfile: backend/Dockerfile`
- Verify `Dockerfile` has `ENV PYTHONPATH=/app`
- Verify file copies use the correct paths relative to the build context

#### Issue: Docker build fails — missing `data/` or `dataset/` directories

**Cause:** The backend references data files at runtime (`data/synthetic/`, `dataset/C1/`, etc.), but these may not be copied into the image.

**Fix:** The `docker-compose.yml` mounts `./data:/app/data` as a volume. Ensure this volume is present:
```yaml
volumes:
  - ./data:/app/data
  - ./dataset:/app/dataset   # Add if needed for Solomon benchmarks
```

#### Issue: Hot reload not working in Docker

**Cause:** Uvicorn's `--reload` flag watches the filesystem, but Docker volumes may not propagate file change events on macOS.

**Fix:**
```yaml
# In docker-compose.yml, add to the app service:
volumes:
  - ./backend:/app/backend
environment:
  - WATCHFILES_FORCE_POLLING=true   # Force polling for file changes
```

---

### 8.9 WebGL / Globe Component Issues

#### Issue: Globe component causes memory leaks or crashes

**Cause:** The Globe.gl component (THREE.js-based) creates WebGL contexts that are not properly cleaned up on React component unmount.

**Symptoms:**
- Browser tab memory grows unbounded
- Console warns about "too many active WebGL contexts"
- Globe flickers or disappears after navigation

**Fix (already partially implemented in codebase):**
- Globe is lazy-loaded inside a `useEffect` to prevent remount on state changes
- Ensure proper cleanup in the unmount function:
```javascript
useEffect(() => {
  const globe = new Globe(containerRef.current);
  return () => {
    globe._destructor?.();     // Cleanup WebGL resources
    containerRef.current?.replaceChildren();
  };
}, []);
```

#### Issue: Globe doesn't render on server-side or in tests

**Fix:** Wrap Globe import in a dynamic import:
```javascript
const Globe = React.lazy(() => import('globe.gl'));
```

---

### 8.10 State Management Issues

#### Issue: Optimization data lost on page navigation

**Cause:** If the user navigates away and the component unmounts, the optimization result should persist in `AppContext`. However, if the AppProvider re-mounts (unlikely in SPA, but possible with route-level code splitting), state resets.

**Symptoms:**
- Switching from `/optimize` to `/scenarios` shows empty data
- Refreshing any page loses all state

**Fixes:**

| Approach | Implementation |
|----------|---------------|
| Persist to sessionStorage | `useEffect(() => sessionStorage.setItem('optimResult', JSON.stringify(result)), [result])` |
| Re-fetch from API | On mount, check if `planId` exists and call `getPlan(planId)` |
| URL-based state | Store `planId` in URL params: `/scenarios?plan_id=1` |

#### Issue: Stale shipment data after optimization

**Cause:** Optimization may change shipment statuses, but the frontend shipment list doesn't auto-refresh.

**Fix:**
```javascript
// In useOptimizer, after successful optimization:
const runOptimization = async (params) => {
  const result = await optimizeApi.run(params);
  setOptimizationResult(transformPlan(result));
  await loadShipments();  // ← Refresh shipment list
};
```

#### Issue: Multiple rapid API calls (race conditions)

**Cause:** User clicks "Optimize" multiple times before the first request completes.

**Fix:**
```javascript
// Disable button while loading
<button disabled={optimizerLoading} onClick={handleOptimize}>
  {optimizerLoading ? 'Optimizing...' : 'Run Optimization'}
</button>
```

Or use an abort controller:
```javascript
const controllerRef = useRef(null);

const runOptimization = async (params) => {
  controllerRef.current?.abort();
  controllerRef.current = new AbortController();
  const result = await optimizeApi.run(params, {
    signal: controllerRef.current.signal,
  });
};
```

---

### 8.11 Production Deployment Issues

#### Issue: Frontend can't reach backend on Render

**Cause:** Frontend is deployed to a different domain than the backend. The `VITE_API_URL` must point to the production backend URL.

**Fix:**
```bash
# In frontend deployment settings (Render / Vercel / Netlify):
VITE_API_URL=https://lorri-backend.onrender.com
```

> **Important:** This URL is baked into the frontend build at build time (Vite replaces `import.meta.env` during build). You must rebuild the frontend after changing it.

#### Issue: Render free tier cold starts

**Symptoms:**
- First request after idle period takes 30–60 seconds
- Health check may fail, causing Render to restart the service repeatedly

**Fix:**
- Use Render's health check path: `/health` (already configured in `render.yaml`)
- Consider upgrading from free tier for production use
- Implement a warm-up ping (external cron hitting `/health` every 10 minutes)

#### Issue: PostgreSQL connection string format on Render

**Cause:** Render provides `postgres://` URLs, but SQLAlchemy 2.x requires `postgresql://`.

**Fix (in backend config):**
```python
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
```

---

### 8.12 Security Concerns

#### Issue: No authentication on API endpoints

**Current state:** All endpoints are publicly accessible. Anyone can create shipments, run optimizations, or seed the database.

**Impact:** Data tampering, unauthorized access, abuse of LLM API keys (cost).

**Recommended fix — API key auth:**

Backend:
```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

API_KEY = os.getenv("API_KEY")
api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(key: str = Security(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")

# Apply to routes:
@router.post("/optimize", dependencies=[Depends(verify_api_key)])
```

Frontend:
```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': import.meta.env.VITE_API_KEY,
  },
});
```

#### Issue: `/dev/seed` endpoint exposed in production

**Fix:** Guard dev-only endpoints:
```python
import os

if os.getenv("ENV", "development") == "development":
    @router.post("/dev/seed")
    async def seed_data(...):
        ...
```

#### Issue: CORS `allow_origins=["*"]` in production

Already covered in [Section 5](#5-cors-configuration).

---

## 9. Testing Integration

### Running Backend Tests

```bash
cd backend
PYTHONPATH=.. pytest tests/ -v
```

Key test files:
- `tests/test_optimizer.py` — Tests the solver/heuristic
- `tests/test_e2e_pipeline.py` — End-to-end pipeline test

### Manual Integration Testing

```bash
# 1. Health check
curl http://localhost:8000/health

# 2. Seed data
curl -X POST "http://localhost:8000/dev/seed?dataset=synthetic&shipment_count=20&vehicle_count=8"

# 3. Verify shipments loaded
curl "http://localhost:8000/shipments?limit=5" | python -m json.tool

# 4. Run optimization (no LLM for speed)
curl -X POST "http://localhost:8000/optimize?run_simulation=true&run_llm=false" | python -m json.tool

# 5. Get metrics
curl "http://localhost:8000/metrics?plan_id=1" | python -m json.tool

# 6. Run scenarios
curl -X POST "http://localhost:8000/simulate?plan_id=1" | python -m json.tool
```

### Frontend-Backend Integration Test Checklist

- [ ] Frontend loads at `http://localhost:3000`
- [ ] Shipments page shows seeded data
- [ ] Creating a shipment via the form works
- [ ] Optimization completes without timeout
- [ ] Plan summary displays correct truck count and utilization
- [ ] Scenarios page shows 4 scenario comparison cards
- [ ] Insights page displays agent analysis text
- [ ] Map/Globe renders without WebGL errors
- [ ] Page navigation preserves optimization result
- [ ] Error toasts appear for failed API calls

---

## 10. Quick Troubleshooting Checklist

```
Frontend not connecting to backend?
  ├── Is backend running? → curl http://localhost:8000/health
  ├── CORS error? → Check browser console, verify allow_origins
  ├── Wrong URL? → Check VITE_API_URL in frontend/.env
  └── Proxy issue? → Check vite.config.js proxy rules

Backend crashes on startup?
  ├── Missing deps? → pip install -r requirements.txt
  ├── DB connection? → Check DATABASE_URL, ensure DB is running
  ├── Import error? → Check PYTHONPATH, run from correct directory
  └── Port in use? → lsof -i :8000

Optimization fails or times out?
  ├── No data? → Seed first: POST /dev/seed
  ├── LLM timeout? → Try with run_llm=false
  ├── Axios timeout? → Increase timeout in api.js
  └── Backend error? → Check terminal logs for Python traceback

Docker issues?
  ├── Build fails? → Ensure context is repo root, not backend/
  ├── DB connection? → Use service name "db" not "localhost"
  ├── Missing files? → Check volume mounts in docker-compose.yml
  └── No hot reload? → Enable WATCHFILES_FORCE_POLLING

Data looks wrong in UI?
  ├── shipment_ids is a string? → JSON.parse() it
  ├── Dates look wrong? → Parse ISO 8601 with new Date()
  ├── Enums don't match? → Use uppercase (HIGH, PENDING, etc.)
  └── Plan empty after optimization? → Check transformPlan() logic
```

---

*Last updated: March 2026*
