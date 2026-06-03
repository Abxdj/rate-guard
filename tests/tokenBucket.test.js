/**
 * Token Bucket Tests
 *
 * Redis is mocked — tests run without a live Redis instance.
 * The Lua script can't execute in the mock, so we test the
 * algorithm logic by controlling what Redis returns.
 */

jest.mock("../src/redis", () => {
  const evalMock = jest.fn();
  return {
    getRedisClient: () => ({ eval: evalMock }),
    __evalMock: evalMock,
  };
});

const { tokenBucket } = require("../src/algorithms/tokenBucket");
const { getRedisClient } = require("../src/redis");

describe("Token Bucket", () => {
  let evalMock;

  beforeEach(() => {
    evalMock = getRedisClient().eval;
    evalMock.mockReset();
    process.env.TOKEN_BUCKET_CAPACITY = "10";
    process.env.TOKEN_BUCKET_REFILL_RATE = "5";
  });

  test("allows request when tokens are available", async () => {
    evalMock.mockResolvedValue([1, 9, 0]); // allowed, 9 remaining, no retry

    const result = await tokenBucket("192.168.1.1");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.retryAfter).toBe(0);
    expect(result.algorithm).toBe("token_bucket");
  });

  test("blocks request when bucket is empty", async () => {
    evalMock.mockResolvedValue([0, 0, 1]); // blocked, 0 remaining, retry in 1s

    const result = await tokenBucket("192.168.1.1");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(1);
  });

  test("uses identifier as part of Redis key", async () => {
    evalMock.mockResolvedValue([1, 5, 0]);

    await tokenBucket("user-abc-123");

    const calledKey = evalMock.mock.calls[0][2]; // KEYS[1]
    expect(calledKey).toBe("rate:tb:user-abc-123");
  });

  test("passes correct capacity and refill rate to Lua", async () => {
    evalMock.mockResolvedValue([1, 4, 0]);
    process.env.TOKEN_BUCKET_CAPACITY = "20";
    process.env.TOKEN_BUCKET_REFILL_RATE = "2";

    await tokenBucket("test-key");

    const args = evalMock.mock.calls[0];
    expect(args[3]).toBe(20); // capacity
    expect(args[4]).toBe(2);  // refill rate
  });
});
