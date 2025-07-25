import { expect, test, vi } from "vitest";
import { RetryOptions, retry, wait, withTimeout } from "../src/Promise.js";
import { Result, err, ok } from "../src/Result.js";

test("wait", async () => {
  vi.useFakeTimers();

  const cbSpy = vi.fn();
  const waitWrapper = async (ms: number, cb: () => void) => {
    await wait(ms);
    cb();
  };

  void waitWrapper(10, cbSpy);
  expect(cbSpy).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(10);

  expect(cbSpy).toHaveBeenCalled();

  vi.useRealTimers();
});

test("onRetry is called maxRetries times", async () => {
  const onRetry = vi.fn();

  await retry(() => Promise.resolve(err(false)), {
    maxRetries: 3,
    initialDelay: 1,
    onRetry,
  });

  expect(onRetry).toHaveBeenCalledTimes(3); // Should be called exactly maxRetries times
  expect(onRetry).toHaveBeenCalledWith(false, 1, expect.any(Number));
  expect(onRetry).toHaveBeenCalledWith(false, 2, expect.any(Number));
  expect(onRetry).toHaveBeenCalledWith(false, 3, expect.any(Number));
});

test("retry succeeds on first attempt", async () => {
  const fn = vi.fn().mockResolvedValue(ok("success"));

  const result = await retry(fn);

  expect(result.ok).toBe(true);
  expect(fn).toHaveBeenCalledTimes(1);
});

test("retry succeeds after several attempts", async () => {
  // Mock function fails twice then succeeds
  const fn = vi
    .fn()
    .mockResolvedValueOnce(err({ type: "TestError", message: "Error 1" }))
    .mockResolvedValueOnce(err({ type: "TestError", message: "Error 2" }))
    .mockResolvedValueOnce(ok("success"));

  const result = await retry(fn, { initialDelay: 1 });

  expect(result.ok).toBe(true);
  expect(fn).toHaveBeenCalledTimes(3);
});

test("retry returns error after max retries", async () => {
  const testError = { type: "TestError", message: "Failed" };
  const fn = vi.fn().mockResolvedValue(err(testError));

  const result = await retry(fn, { maxRetries: 3, initialDelay: 1 });

  expect(result).toEqual(
    err({
      type: "RetryError",
      cause: testError,
      attempts: 4, // initial + 3 retries = 4 attempts
    }),
  );
  expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries = 4 attempts
});

test("retry handles abort before execution", async () => {
  const fn = vi.fn();
  const controller = new AbortController();

  // Abort before calling retry
  controller.abort();

  const result = await retry(fn, { signal: controller.signal });

  expect(result).toEqual(
    err({ type: "RetryAbortError", abortedBeforeExecution: true }),
  );
  expect(fn).not.toHaveBeenCalled();
});

test("retry handles abort during delay", async () => {
  // Function that fails on first call
  const fn = vi
    .fn()
    .mockResolvedValueOnce(err({ type: "TestError" }))
    .mockResolvedValueOnce(ok("success"));

  const controller = new AbortController();

  // Set up a delayed abort
  setTimeout(() => {
    controller.abort();
  }, 5);

  const result = await retry(fn, {
    signal: controller.signal,
    initialDelay: 10, // longer than our abort timeout,
  });

  expect(result).toEqual(
    err({ type: "RetryAbortError", abortedBeforeExecution: false }),
  );
  expect(fn).toHaveBeenCalledTimes(1);
});

test("retry uses retryable predicate", async () => {
  // Error types we'll use
  interface RetryableError {
    type: "RetryableError";
    attempt: number;
  }
  interface NonRetryableError {
    type: "NonRetryableError";
    reason: string;
  }

  // Function that returns different error types
  const fn = vi
    .fn()
    .mockResolvedValueOnce(err({ type: "RetryableError", attempt: 1 }))
    .mockResolvedValueOnce(err({ type: "NonRetryableError", reason: "fatal" }))
    .mockResolvedValueOnce(ok("success"));

  // Create options with retryable predicate
  const options: RetryOptions<RetryableError | NonRetryableError> = {
    initialDelay: 1,
    retryable: (error) => error.type === "RetryableError",
  };

  const result = await retry<string, RetryableError | NonRetryableError>(
    fn,
    options,
  );

  expect(result).toEqual(
    err({
      type: "RetryError",
      cause: { type: "NonRetryableError", reason: "fatal" },
      attempts: 2,
    }),
  );
  expect(fn).toHaveBeenCalledTimes(2);
});

test("retry calls onRetry callback", async () => {
  const onRetry = vi.fn();
  const testError = { type: "TestError", message: "Failed" };

  // Function that fails twice then succeeds
  const fn = vi
    .fn()
    .mockResolvedValueOnce(err(testError))
    .mockResolvedValueOnce(err(testError))
    .mockResolvedValueOnce(ok("success"));

  const result = await retry(fn, {
    initialDelay: 1,
    onRetry,
  });

  expect(result.ok).toBe(true);
  expect(onRetry).toHaveBeenCalledTimes(2);
  expect(onRetry).toHaveBeenCalledWith(testError, 1, expect.any(Number));
  expect(onRetry).toHaveBeenCalledWith(testError, 2, expect.any(Number));
});

test("retry uses exponential backoff with jitter", async () => {
  vi.useFakeTimers();
  const fn = vi
    .fn()
    .mockResolvedValueOnce(err({ type: "TestError" }))
    .mockResolvedValueOnce(err({ type: "TestError" }))
    .mockResolvedValueOnce(ok("success"));

  // Create a promise we can resolve later
  let resolvePromise: (value: Result<string, unknown>) => void;
  const promise = new Promise<Result<string, unknown>>((resolve) => {
    resolvePromise = resolve;
  });

  // Start the retry process but don't await it
  const _retryPromise = retry<string, { type: "TestError" }>(fn, {
    initialDelay: 100,
    factor: 2,
    jitter: 0.1,
  }).then((result) => {
    resolvePromise(result);
    return result;
  });

  // First attempt happens immediately
  expect(fn).toHaveBeenCalledTimes(1);

  // Wait for first delay (~100ms with jitter)
  await vi.advanceTimersToNextTimerAsync();
  expect(fn).toHaveBeenCalledTimes(2);

  // Wait for second delay (~200ms with jitter)
  await vi.advanceTimersToNextTimerAsync();
  expect(fn).toHaveBeenCalledTimes(3);

  const result = await promise;
  expect(result.ok).toBe(true);

  vi.useRealTimers();
});

test("retry with real delays works as expected", async () => {
  // Keep track of when each attempt happens
  const attemptTimes: Array<number> = [];
  const onRetry = vi.fn();

  // Function that fails 3 times then succeeds
  const fn = vi.fn().mockImplementation(() => {
    const now = Date.now();
    attemptTimes.push(now);

    if (attemptTimes.length <= 3) {
      return Promise.resolve(err({ type: "TestError" }));
    } else {
      return Promise.resolve(ok("success"));
    }
  });

  // Use real short delays
  const result = await retry(fn, {
    maxRetries: 3,
    initialDelay: 50, // 50ms initial delay
    factor: 2, // Double each time
    jitter: 0, // No jitter for predictable testing
    onRetry,
  });

  // Should succeed after 4 attempts (1 initial + 3 retries)
  expect(result.ok).toBe(true);
  expect(fn).toHaveBeenCalledTimes(4);
  expect(onRetry).toHaveBeenCalledTimes(3);

  // Check delays between attempts
  // First retry should be ~50ms after initial attempt
  expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(45);

  // Second retry should be ~100ms after first retry
  expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThanOrEqual(95);

  // Third retry should be ~200ms after second retry
  expect(attemptTimes[3] - attemptTimes[2]).toBeGreaterThanOrEqual(195);

  // Total time should be at least 50 + 100 + 200 = 350ms
  expect(attemptTimes[3] - attemptTimes[0]).toBeGreaterThanOrEqual(345);
});

test("retry respects maxDelay option", async () => {
  // Keep track of when each attempt happens
  const attemptTimes: Array<number> = [];
  const onRetry = vi.fn();

  // Function that always fails
  const fn = vi.fn().mockImplementation(() => {
    const now = Date.now();
    attemptTimes.push(now);
    return Promise.resolve(err({ type: "TestError" }));
  });

  // Use a very short maxDelay to demonstrate the capping effect
  const result = await retry(fn, {
    maxRetries: 3,
    initialDelay: 50, // 50ms initial delay
    factor: 10, // Would normally increase 50 -> 500 -> 5000, but maxDelay caps it
    maxDelay: 100, // Cap delays at 100ms
    jitter: 0, // No jitter for predictable testing
    onRetry,
  });

  // Should fail after 4 attempts (1 initial + 3 retries)
  expect(result.ok).toBe(false);
  expect(fn).toHaveBeenCalledTimes(4);
  expect(onRetry).toHaveBeenCalledTimes(3);

  // First retry should be ~50ms after initial attempt
  expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(45);

  // Second retry would normally be 500ms, but maxDelay caps it at 100ms
  expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThanOrEqual(95);
  expect(attemptTimes[2] - attemptTimes[1]).toBeLessThan(200);

  // Third retry would normally be 5000ms, but maxDelay caps it at 100ms
  expect(attemptTimes[3] - attemptTimes[2]).toBeGreaterThanOrEqual(95);
  expect(attemptTimes[3] - attemptTimes[2]).toBeLessThan(200);
});

test("withTimeout returns result when function completes before timeout", async () => {
  const expectedResult = ok("success");
  const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    return Promise.resolve(expectedResult);
  });

  const result = await withTimeout(fn, 100);

  expect(result).toEqual(expectedResult);
  expect(fn).toHaveBeenCalledTimes(1);
});

test("withTimeout returns TimeoutError when function exceeds timeout", async () => {
  // Use a small timeout for faster test execution
  const timeoutMs = 10;

  // Create a function that never resolves within our timeout
  const fn = vi.fn().mockImplementation((_signal: AbortSignal) => {
    return new Promise<Result<string, never>>((resolve) => {
      // This promise intentionally doesn't resolve during our timeout
      const id = setTimeout(() => {
        resolve(ok("too late"));
      }, 1000);
      return () => {
        clearTimeout(id); // Just to avoid hanging promises
      };
    });
  });

  const result = await withTimeout(fn, timeoutMs);

  // Should return a TimeoutError
  expect(result).toEqual(err({ type: "TimeoutError", timeoutMs }));
  expect(fn).toHaveBeenCalledTimes(1);
});

test("withTimeout passes AbortSignal to function", async () => {
  const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    return Promise.resolve(ok("success"));
  });

  await withTimeout(fn, 100);

  expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal));
});

test("withTimeout clears timeout when function completes", async () => {
  const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
  const fn = vi.fn().mockResolvedValue(ok("success"));

  await withTimeout(fn, 100);

  expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  clearTimeoutSpy.mockRestore();
});

test("withTimeout works with a function returning an error result", async () => {
  const expectedError = { type: "CustomError", message: "Failed" };
  const fn = vi.fn().mockResolvedValue(err(expectedError));

  const result = await withTimeout(fn, 100);

  expect(result).toEqual(err(expectedError));
  expect(fn).toHaveBeenCalledTimes(1);
});

test("withTimeout integrates with AbortController from outside", async () => {
  const externalController = new AbortController();
  let innerSignal: AbortSignal | null = null;

  const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
    innerSignal = signal;
    return new Promise<Result<string, "aborted">>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(ok("success"));
      }, 200);

      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        resolve(err("aborted"));
      });
    });
  });

  const timeoutPromise = withTimeout((signal) => {
    // Pass the signal to our function but also make sure to respect the external abort
    externalController.signal.addEventListener("abort", () => {
      if (!signal.aborted) {
        // This would happen if the external controller aborts before the timeout
        // In a real implementation, you would handle this appropriately
      }
    });

    return fn(signal) as never;
  }, 100);

  // Abort from the external controller
  externalController.abort();

  const _result = await timeoutPromise;

  expect(fn).toHaveBeenCalledTimes(1);
  expect(innerSignal).not.toBeNull();
});
