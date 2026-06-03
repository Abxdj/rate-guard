/**
 * Integration Tests — Express endpoints
 *
 * Mocks the entire rateLimiter middleware so we test routing
 * and response shapes, not the algorithm logic (that's in unit tests).
 */

jest.mock("../src/middleware/rateLimiter", () => ({
  rateLimiter: () => (req, res, next) => {
    res.setHeader("X-RateLimit-Limit", 10);
    res.setHeader("X-RateLimit-Remaining", 9);
    next();
  },
}));

const request = require("supertest");
const { app, server } = require("../src/index");

describe("GET /health", () => {
  test("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("GET /api/data", () => {
  test("returns data when rate limit allows", async () => {
    const res = await request(app).get("/api/data");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
    expect(res.body).toHaveProperty("timestamp");
  });

  test("returns rate limit headers", async () => {
    const res = await request(app).get("/api/data");
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
  });
});

describe("POST /check", () => {
  test("returns allowed: true when under limit", async () => {
    const res = await request(app).post("/check");
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
  });
});

afterAll((done) => {
  server.close(done);
});