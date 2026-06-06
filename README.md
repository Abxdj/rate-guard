# rate-guard

A production-style rate limiting service built with Node.js, Express, and Redis. Implements three algorithms that can be swapped via config. Designed to sit in front of any backend service (includes a Django integration in Week 2).

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
# 1. Copy env config
cp .env.example .env

# 2. Start Redis (Docker)
docker run -p 6379:6379 redis:alpine

# 3. Install and run
npm install
npm run dev
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check, no rate limiting |
| GET | /api/data | Protected — returns sample data |
| GET | /api/status | Protected — returns uptime |
| POST | /check | Used by Django middleware to pre-check a request |

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

---

**Stack:** Node.js · Express · Redis (ioredis) · Jest · Django  · Streamlit 
