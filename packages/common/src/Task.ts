/**
 * ⚡ Lazy, cancellable Promise that returns Result instead of throwing
 *
 * @module
 */

import { isNonEmptyArray, shiftArray } from "./Array.js";
import { Result, err, ok } from "./Result.js";
import { Duration, durationToNonNegativeInt } from "./Time.js";
import { NonNegativeInt, PositiveInt } from "./Type.js";
import { Predicate } from "./Types.js";

/**
 * `Task` is a lazy, cancellable Promise that returns {@link Result} instead of
 * throwing.
 *
 * In other words, Task is a function that creates a Promise when it's called.
 * This laziness allows safe composition, e.g. retry logic because it prevents
 * eager execution.
 *
 * ### Cancellation
 *
 * Tasks support optional cancellation via signal in {@link TaskContext}. When a
 * Task is called without a signal, it cannot be cancelled and {@link AbortError}
 * will never be returned. When called with a signal, the Task can be cancelled
 * and AbortError is added to the error union with precise type safety.
 *
 * When composing Tasks, we typically have context and want to abort ASAP by
 * passing it through. However, there are valid cases where we don't want to
 * abort because we need some atomic unit to complete. For simple scripts and
 * tests, omitting context is fine.
 *
 * ### Task Helpers
 *
 * - {@link toTask} - Convert async function to Task
 * - {@link wait} - Delay execution for a specified {@link Duration}
 * - {@link timeout} - Add timeout to any Task
 * - {@link retry} - Retry failed Tasks with configurable backoff
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * // Add timeout to prevent hanging
 * const fetchWithTimeout = (url: string) => timeout("30s", fetch(url));
 *
 * fetchWithTimeout satisfies (
 *   url: string,
 * ) => Task<Response, TimeoutError | FetchError>;
 *
 * // Add retry for resilience
 * const fetchWithRetry = (url: string) =>
 *   retry(
 *     {
 *       retries: PositiveInt.orThrow(3),
 *       initialDelay: "100ms",
 *       retryable: (error) => error.type === "FetchError",
 *     },
 *     fetchWithTimeout(url),
 *   );
 *
 * fetchWithRetry satisfies (
 *   url: string,
 * ) => Task<
 *   Response,
 *   TimeoutError | FetchError | RetryError<TimeoutError | FetchError>
 * >;
 *
 * const semaphore = createSemaphore(PositiveInt.orThrow(2));
 *
 * // Control concurrency with semaphore
 * const fetchWithPermit = (url: string) =>
 *   semaphore.withPermit(fetchWithRetry(url));
 *
 * fetchWithPermit satisfies (url: string) => Task<
 *   Response,
 *   | TimeoutError
 *   | FetchError
 *   | AbortError // Semaphore dispose aborts Tasks
 *   | RetryError<TimeoutError | FetchError>
 * >;
 *
 * // Usage
 * const results = await Promise.all(
 *   [
 *     "https://api.example.com/users",
 *     "https://api.example.com/posts",
 *     "https://api.example.com/comments",
 *   ]
 *     .map(fetchWithPermit)
 *     .map((task) => task()),
 * );
 *
 * results satisfies Array<
 *   Result<
 *     Response,
 *     | AbortError
 *     | TimeoutError
 *     | FetchError
 *     | RetryError<TimeoutError | FetchError>
 *   >
 * >;
 *
 * // Handle results
 * for (const result of results) {
 *   if (result.ok) {
 *     // Process successful response
 *     const response = result.value;
 *     expect(response).toBeInstanceOf(Response);
 *   } else {
 *     // Handle error (TimeoutError, FetchError, RetryError, or AbortError)
 *     expect(result.error).toBeDefined();
 *   }
 * }
 *
 * // Cancellation support
 * const controller = new AbortController();
 * const cancelableTask = fetchWithPermit("https://api.example.com/data");
 *
 * // Start task
 * const promise = cancelableTask(controller);
 *
 * // Cancel after some time
 * setTimeout(() => {
 *   controller.abort("User cancelled");
 * }, 1000);
 *
 * const _result = await promise;
 * // Result will be AbortError if cancelled
 * ```
 *
 * ### Dependency Injection Integration
 *
 * Tasks integrate naturally with Evolu's DI pattern. Use `deps` for static
 * dependencies and `TaskContext` for execution context like cancellation. Usage
 * follows the pattern: deps → arguments → execution context.
 */
export interface Task<T, E> {
  /**
   * Invoke the Task.
   *
   * Provide a context with an AbortSignal to enable cancellation. When called
   * without a signal, {@link AbortError} cannot occur and the error type narrows
   * accordingly.
   *
   * ### Example
   *
   * ```ts
   * interface FetchError {
   *   readonly type: "FetchError";
   *   readonly error: unknown;
   * }
   *
   * // Task version of fetch with proper error handling and cancellation support.
   * const fetch = (url: string) =>
   *   toTask((context) =>
   *     tryAsync(
   *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
   *       (error): FetchError => ({ type: "FetchError", error }),
   *     ),
   *   );
   *
   * // `satisfies` shows the expected type signature.
   * fetch satisfies (url: string) => Task<Response, FetchError>;
   *
   * const result1 = await fetch("https://api.example.com/data")();
   * expectTypeOf(result1).toEqualTypeOf<Result<Response, FetchError>>();
   *
   * // With AbortController
   * const controller = new AbortController();
   * const result2 = await fetch("https://api.example.com/data")(
   *   controller,
   * );
   * expectTypeOf(result2).toEqualTypeOf<
   *   Result<Response, FetchError | AbortError>
   * >();
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/prefer-function-type
  <TContext extends TaskContext | undefined = undefined>(
    context?: TContext,
  ): Promise<
    Result<T, TContext extends { signal: AbortSignal } ? E | AbortError : E>
  >;
}

/** Context passed to {@link Task}s for cancellation. */
export interface TaskContext {
  /** Signal for cancellation */
  readonly signal?: AbortSignal;
}

/** Error returned when a {@link Task} is cancelled via AbortSignal. */
export interface AbortError {
  readonly type: "AbortError";
  readonly reason?: unknown;
}

/**
 * Combines user signal from context with an internal signal.
 *
 * If the context has a signal, combines both signals using AbortSignal.any().
 * Otherwise, returns just the internal signal.
 */
const combineSignal = (
  context: TaskContext | undefined,
  internalSignal: AbortSignal,
): AbortSignal =>
  context?.signal
    ? AbortSignal.any([context.signal, internalSignal])
    : internalSignal;

/**
 * Converts async function returning {@link Result} to a {@link Task}.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * const result1 = await fetch("https://api.example.com/data")();
 * result1 satisfies Result<Response, FetchError>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetch("https://api.example.com/data")(controller);
 * result2 satisfies Result<Response, FetchError | AbortError>;
 * ```
 */
export const toTask = <T, E>(
  fn: (context?: TaskContext) => Promise<Result<T, E>>,
): Task<T, E> =>
  // Note: Not using async to avoid Promise wrapper overhead in fast path
  ((context) => {
    const signal = context?.signal;

    // Fast path when no signal - return promise directly
    if (!signal) {
      return fn();
    }

    if (signal.aborted) {
      return Promise.resolve(
        err({ type: "AbortError", reason: signal.reason as unknown }),
      );
    }

    // Use Promise.withResolvers for clean abort handling and cleanup
    const { promise: abortPromise, resolve: resolveAbort } =
      Promise.withResolvers<Result<never, AbortError>>();

    const handleAbort = () => {
      resolveAbort(
        err({ type: "AbortError", reason: signal.reason as unknown }),
      );
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    return Promise.race([
      abortPromise,
      fn(context).then((result) => {
        signal.removeEventListener("abort", handleAbort);
        return result;
      }),
    ]);
  }) as Task<T, E>;

/**
 * Creates a {@link Task} that waits for the specified duration.
 *
 * ### Example
 *
 * ```ts
 * const result1 = await wait("10ms")();
 * result1 satisfies Result<void, never>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await wait("10ms")(controller);
 * result2 satisfies Result<void, AbortError>;
 * ```
 */
export const wait = (duration: Duration): Task<void, never> =>
  toTask(
    (context) =>
      new Promise<Result<void, never>>((resolve) => {
        const ms = durationToNonNegativeInt(duration);
        const timeoutSignal = AbortSignal.timeout(ms);

        const signal = combineSignal(context, timeoutSignal);

        // Listen for abort - either from timeout completion or external abort
        signal.addEventListener(
          "abort",
          () => {
            resolve(ok());
          },
          { once: true },
        );
      }),
  );

/** Error returned when {@link timeout} exceeds the specified duration. */
export interface TimeoutError {
  readonly type: "TimeoutError";
  readonly timeoutMs: number;
}

/**
 * Adds timeout behavior to a {@link Task}.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * const fetchWithTimeout = (url: string) => timeout("2m", fetch(url));
 *
 * const result1 = await fetchWithTimeout("https://api.example.com/data")();
 * result1 satisfies Result<Response, FetchError | TimeoutError>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchWithTimeout("https://api.example.com/data")(
 *   controller,
 * );
 * result2 satisfies Result<
 *   Response,
 *   FetchError | TimeoutError | AbortError
 * >;
 * ```
 */
export const timeout = <T, E>(
  duration: Duration,
  task: Task<T, E>,
): Task<T, E | TimeoutError> =>
  toTask(async (context) => {
    const timeoutMs = durationToNonNegativeInt(duration);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    const signal = combineSignal(context, timeoutSignal);

    const result = await task({ signal });

    if (!result.ok && timeoutSignal.aborted) {
      return err({ type: "TimeoutError", timeoutMs });
    }

    return result as Result<T, E | TimeoutError>;
  });

/** Options for configuring {@link retry} behavior. */
export interface RetryOptions<E> {
  /** Number of retry attempts after the initial failure. */
  readonly retries: PositiveInt;

  /**
   * Initial delay for exponential backoff (1st retry uses this, 2nd uses
   * this×factor, 3rd uses this×factor², etc.). Actual delays are randomized by
   * {@link RetryOptions.jitter}.
   */
  readonly initialDelay?: Duration;

  /** Maximum delay between retries. */
  readonly maxDelay?: Duration;

  /** Exponential backoff multiplier. */
  readonly factor?: number;

  /** Random jitter factor (0-1) to prevent thundering herd. */
  readonly jitter?: number;

  /** {@link Predicate} to determine if error should trigger retry. */
  readonly retryable?: Predicate<E>;

  /** Callback invoked before each retry attempt. */
  readonly onRetry?: (error: E, attempt: number, delay: number) => void;
}

/** Error returned when {@link retry} exhausts all retry attempts. */
export interface RetryError<E> {
  readonly type: "RetryError";
  readonly cause: E;
  readonly attempts: number;
}

/**
 * Adds retry logic with exponential backoff and jitter to a {@link Task}.
 *
 * ### Example
 *
 * ```ts
 * interface FetchError {
 *   readonly type: "FetchError";
 *   readonly error: unknown;
 * }
 *
 * // Task version of fetch with proper error handling and cancellation support.
 * const fetch = (url: string) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => globalThis.fetch(url, { signal: context?.signal ?? null }),
 *       (error): FetchError => ({ type: "FetchError", error }),
 *     ),
 *   );
 *
 * // `satisfies` shows the expected type signature.
 * fetch satisfies (url: string) => Task<Response, FetchError>;
 *
 * const fetchWithRetry = (url: string) =>
 *   retry({ retries: PositiveInt.orThrow(3) }, fetch(url));
 *
 * const result1 = await fetchWithRetry("https://api.example.com/data")();
 * result1 satisfies Result<Response, FetchError | RetryError<FetchError>>;
 *
 * // With AbortController
 * const controller = new AbortController();
 * const result2 = await fetchWithRetry("https://api.example.com/data")(
 *   controller,
 * );
 * result2 satisfies Result<
 *   Response,
 *   FetchError | RetryError<FetchError> | AbortError
 * >;
 * ```
 */
export const retry = <T, E>(
  {
    retries,
    initialDelay = "100ms",
    maxDelay = "10s",
    factor = 2,
    jitter = 0.1,
    retryable = () => true,
    onRetry,
  }: RetryOptions<E>,
  task: Task<T, E>,
): Task<T, E | RetryError<E>> =>
  toTask(async (context): Promise<Result<T, E | RetryError<E>>> => {
    const initialDelayMs = durationToNonNegativeInt(initialDelay);
    const maxDelayMs = durationToNonNegativeInt(maxDelay);
    const maxRetries = PositiveInt.orThrow(retries);

    let attempt = 0;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const result = await task(context);

      if (result.ok) {
        return result;
      }

      attempt += 1;

      if (attempt > maxRetries || !retryable(result.error)) {
        return err({
          type: "RetryError",
          cause: result.error,
          attempts: attempt,
        });
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = initialDelayMs * Math.pow(factor, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

      // Apply jitter to prevent thundering herd problem
      const randomFactor = 1 - jitter + Math.random() * jitter * 2;
      const delay = Math.floor(cappedDelay * randomFactor);

      if (onRetry) {
        onRetry(result.error, attempt, delay);
      }

      // Wait before retry
      const delayResult = await wait(delay as NonNegativeInt)(context);
      if (!delayResult.ok) {
        // If delay was aborted, return AbortError (will be handled by toTask)
        return delayResult;
      }
    }
  });

/**
 * A semaphore that limits the number of concurrent async Tasks.
 *
 * For mutual exclusion (limiting to exactly one Task), consider using
 * {@link Mutex} instead.
 *
 * @see {@link createSemaphore} to create a semaphore instance.
 */
export interface Semaphore extends Disposable {
  /**
   * Executes a Task while holding a semaphore permit.
   *
   * The Task will wait until a permit is available before executing. Supports
   * cancellation via AbortSignal - if the signal is aborted while waiting for a
   * permit or during execution, the Task is cancelled and permits are properly
   * released.
   */
  readonly withPermit: <T, E>(task: Task<T, E>) => Task<T, E | AbortError>;
}

/**
 * Creates a semaphore that limits concurrent async Tasks to the specified
 * count.
 *
 * A semaphore controls access to a resource by maintaining a count of available
 * permits. Tasks acquire a permit before executing and release it when
 * complete.
 *
 * For mutual exclusion (exactly one Task at a time), consider using
 * {@link createMutex} instead.
 *
 * ### Example
 *
 * ```ts
 * // Allow maximum 3 concurrent Tasks
 * const semaphore = createSemaphore(PositiveInt.orThrow(3));
 *
 * let currentConcurrent = 0;
 * const events: Array<string> = [];
 *
 * const fetchData = (id: number) =>
 *   toTask<number, never>(async (context) => {
 *     currentConcurrent++;
 *     events.push(`start ${id} (concurrent: ${currentConcurrent})`);
 *
 *     await wait("10ms")(context);
 *
 *     currentConcurrent--;
 *     events.push(`end ${id} (concurrent: ${currentConcurrent})`);
 *     return ok(id * 10);
 *   });
 *
 * // These will execute with at most 3 running concurrently
 * const results = await Promise.all([
 *   semaphore.withPermit(fetchData(1))(),
 *   semaphore.withPermit(fetchData(2))(),
 *   semaphore.withPermit(fetchData(3))(),
 *   semaphore.withPermit(fetchData(4))(), // waits for one above to complete
 *   semaphore.withPermit(fetchData(5))(), // waits for permit
 * ]);
 *
 * expect(results.map(getOrThrow)).toEqual([10, 20, 30, 40, 50]);
 * expect(events).toMatchInlineSnapshot(`
 *   [
 *     "start 1 (concurrent: 1)",
 *     "start 2 (concurrent: 2)",
 *     "start 3 (concurrent: 3)",
 *     "end 1 (concurrent: 2)",
 *     "start 4 (concurrent: 3)",
 *     "end 2 (concurrent: 2)",
 *     "start 5 (concurrent: 3)",
 *     "end 3 (concurrent: 2)",
 *     "end 4 (concurrent: 1)",
 *     "end 5 (concurrent: 0)",
 *   ]
 * `);
 * ```
 */
export const createSemaphore = (maxConcurrent: PositiveInt): Semaphore => {
  let isDisposed = false;
  let availablePermits = maxConcurrent;
  const waitingQueue: Array<() => void> = [];
  const semaphoreController = new AbortController();

  const acquire = (): Promise<void> => {
    if (availablePermits > 0) {
      availablePermits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      waitingQueue.push(resolve);
    });
  };

  const release = (): void => {
    if (isNonEmptyArray(waitingQueue)) {
      shiftArray(waitingQueue)();
    } else {
      availablePermits++;
    }
  };

  return {
    withPermit: <T, E>(task: Task<T, E>): Task<T, E | AbortError> =>
      toTask(async (context): Promise<Result<T, E | AbortError>> => {
        await acquire();

        // Check if semaphore was disposed while waiting
        if (isDisposed) {
          return err({
            type: "AbortError",
            reason: "Semaphore disposed",
          });
        }

        const signal = combineSignal(context, semaphoreController.signal);

        const result = await task({ signal });

        release();

        return result;
      }),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;

      // Cancel all running and waiting tasks
      semaphoreController.abort("Semaphore disposed");

      // Release all waiting tasks so they can continue and check isDisposed
      while (isNonEmptyArray(waitingQueue)) {
        shiftArray(waitingQueue)();
      }
    },
  };
};

/**
 * A mutex (mutual exclusion) that ensures only one Task runs at a time.
 *
 * This is a specialized version of a {@link Semaphore} with a permit count of 1.
 *
 * @see {@link createMutex} to create a mutex instance.
 */
export interface Mutex extends Disposable {
  /**
   * Executes a Task while holding the mutex lock.
   *
   * Only one Task can hold the lock at a time. Other Tasks will wait until the
   * lock is released. Supports cancellation via AbortSignal.
   */
  readonly withLock: <T, E>(task: Task<T, E>) => Task<T, E | AbortError>;
}

/**
 * Creates a new mutex for ensuring mutual exclusion.
 *
 * A mutex is a {@link createSemaphore} with exactly one permit, ensuring that
 * only one Task can execute at a time.
 *
 * ### Example
 *
 * ```ts
 * const mutex = createMutex();
 *
 * const updateTask = (id: number) =>
 *   toTask((context) =>
 *     tryAsync(
 *       () => updateSharedResource(id, context),
 *       (error): UpdateError => ({ type: "UpdateError", error }),
 *     ),
 *   );
 *
 * // These Tasks will execute one at a time
 * const results = await Promise.all([
 *   mutex.withLock(updateTask(1))(),
 *   mutex.withLock(updateTask(2))(),
 *   mutex.withLock(updateTask(3))(),
 * ]);
 * ```
 */
export const createMutex = (): Mutex => {
  const mutex = createSemaphore(1 as PositiveInt);

  return {
    withLock: mutex.withPermit,
    [Symbol.dispose]: mutex[Symbol.dispose],
  };
};

// TODO: Add tracing support
// - Extend TaskContext with optional tracing field
// - Add traced(name, task) helper that wraps Task execution
// - Collect span data (name, timing, parent-child relationships, status)
// - Support OpenTelemetry export format with proper traceId/spanId generation
// - Automatic parent-child span relationships through context propagation
