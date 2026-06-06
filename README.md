# rate-guard

A production-style rate limiting service built with Node.js, Express, and Redis. Implements three algorithms switchable via config. Protects a Django REST API via custom middleware. Includes a real-time monitoring dashboard.

## Architecture

```
Client → Node.js (rate-guard) → Redis (counters)
                ↓ (if allowed)
           Django REST API
                ↓
         Streamlit Dashboard
```

## Algorithms

| Algorithm | Avg Latency | Req/Sec | Best for | Trade-off |
|---|---|---|---|---|
| Token Bucket | 10.13ms | ~4,744 | Burst-tolerant APIs | Allows bursts up to capacity |
| Leaky Bucket | 10.06ms | ~4,751 | Smooth, constant throughput | Too strict for bursty clients |
| Sliding Window | 12.19ms | ~3,936 | Strict per-minute limits | ~20% slower — stores one Redis entry per request |

> Tested with autocannon: 50 concurrent connections over 10 seconds on localhost.

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/Abxdj/rate-guard.git
cd rate-guard

# 2. Install Node dependencies
npm install

# 3. Copy env config
copy env.example .env

# 4. Start Memurai (Redis for Windows) — runs as a service automatically

# 5. Start the rate limiter
npm run dev

# 6. Start the Django API (separate terminal)
cd protected_api
pip install django djangorestframework requests
python manage.py migrate
python manage.py runserver 8000

# 7. Start the dashboard (separate terminal)
cd ..
pip install streamlit redis
streamlit run dashboard/app.py
```

## Endpoints

### Node.js (port 3000)
| Method | Path | Description |
|---|---|---|
| GET | /health | Health check, no rate limiting |
| GET | /api/data | Protected — returns sample data |
| GET | /api/status | Protected — returns uptime |
| POST | /check | Used by Django middleware to pre-check requests |

### Django (port 8000)
| Method | Path | Description |
|---|---|---|
| GET | /api/data/ | Protected data endpoint |
| GET | /api/status/ | Service status |
| GET | /api/search/?q= | Search endpoint |

## Response Headers

Every rate-limited response includes:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Algorithm: token_bucket
```

On a 429:
```
Retry-After: 3
```

## Switching Algorithms

Edit `.env`:
```
ALGORITHM=sliding_window   # or token_bucket, leaky_bucket
```

## Running Tests

```bash
npm test
```

## Stress Testing 

```bash
npx autocannon -c 50 -d 10 http://localhost:3000/api/data
```

## Key Design Decisions

**Why Lua scripts in Redis?** The check-and-update must be atomic. Without it, two concurrent requests can both read "1 token left" before either writes back — allowing both through. Redis executes Lua scripts with no interruption, making race conditions impossible.

**Why fail open when Redis is down?** If the rate limiter itself goes down, requests pass through rather than blocking all traffic. In a production system this would be configurable per route.

**Why sliding window is slower?** It stores one entry per request in a sorted set vs token bucket's two-field hash. More accurate, more memory, ~20% more latency.

---
## Stack
Node.js · Express · Redis (ioredis) · Django · Django REST Framework · Streamlit · Jest
