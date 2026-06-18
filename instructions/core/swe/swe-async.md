# #swe-async Async and concurrency hygiene

**Never** perform synchronous blocking I/O (file reads, DNS, database) on an async or event-loop thread -- push it to a worker or use the async API.
Every `Promise` or async operation has an error handler: no fire-and-forget without a `.catch()` or `try/catch` boundary that at minimum logs.
Avoid unbounded in-memory accumulation: stream, paginate, or apply back-pressure instead of loading an entire result set into memory.
Scope locks and mutexes to the shortest critical section that preserves correctness.
