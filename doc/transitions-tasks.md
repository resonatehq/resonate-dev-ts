# Task State Transitions

## States

| Symbol | Description |
| --- | --- |
| ⊥ | Task does not exist |
| ⟨p, e, l, v, c, R⟩ | Pending |
| ⟨a, e, l, v, c, R⟩ | Acquired |
| ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | Suspended |
| ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | Fulfilled |

## Symbols

| Symbol | Description |
| --- | --- |
| t | Current time |
| e | Expiry time |
| l | TTL (time to live) |
| v | Version |
| c | Current (Invoke or Resume) |
| R | Set of Resumes |
| P | Set of Promises |

## Operations

```
TaskGet()
TaskCreate(t, l)
TaskAcquire(t, l, v)
TaskRelease(t, l, v)
TaskSuspend(v, P)
TaskFence(v)
TaskHeartbeat(t, v)
TaskFulfill(v)
Enqueue(Invoke, t, l)
Enqueue(Resume, t, l)
Tick(t)

```

## Side Effects

| Side Effect | Description |
| --- | --- |
| Send(Invoke) | Send invoke message |
| Send(Resume) | Send resume message |

---

## Transitions

| # | Operation | Current State | Next State | Result | Side Effect(s) | Description |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | TaskGet() | ⊥ | ⊥ | 404 |  | Attempt to get a non-existent task. |
| 2 | TaskGet() | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 200 |  | Get a pending task. |
| 3 | TaskGet() | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 200 |  | Get an acquired task. |
| 4 | TaskGet() | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 200 |  | Get a suspended task. |
| 5 | TaskGet() | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 200 |  | Get a fulfilled task. |
| 6 | TaskCreate(t, l) | ⊥ | ⟨a, t+l, l, 0, Invoke, ∅⟩ | 200 |  | Create a new task and immediately acquire it. |
| 7 | TaskCreate(t, l) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 200 |  | Idempotent create on pending task. |
| 8 | TaskCreate(t, l) | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 200 |  | Idempotent create on acquired task. |
| 9 | TaskCreate(t, l) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 200 |  | Idempotent create on suspended task. |
| 10 | TaskCreate(t, l) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 200 |  | Idempotent create on fulfilled task. |
| 11 | TaskAcquire(t, l, v) | ⊥ | ⊥ | 404 |  | Attempt to acquire a non-existent task. |
| 12 | TaskAcquire(t, l, v) | ⟨p, e, l, v, c, R⟩ | ⟨a, t+l, l, v, c, R⟩ | 200 |  | Worker acquires a pending task with matching version. |
| 13 | TaskAcquire(t, l, v') | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Acquire failed due to version mismatch on pending task. |
| 14 | TaskAcquire(t, l, v) | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 409 |  | Task already acquired by another worker. |
| 15 | TaskAcquire(t, l, v') | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 409 |  | Version mismatch and already acquired. |
| 16 | TaskAcquire(t, l, v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Cannot acquire a suspended task. |
| 17 | TaskAcquire(t, l, v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Version mismatch on suspended task. |
| 18 | TaskAcquire(t, l, v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 409 |  | Cannot acquire a fulfilled task. |
| 19 | TaskRelease(t, l, v) | ⊥ | ⊥ | 404 |  | Attempt to release a non-existent task. |
| 20 | TaskRelease(t, l, v) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Cannot release a task that is already pending. |
| 21 | TaskRelease(t, l, v') | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Version mismatch on release of pending task. |
| 22 | TaskRelease(t, l, v) | ⟨a, e, l, v, Invoke, R⟩ | ⟨p, t+l, l, v+1, Invoke, R⟩ | 200 | Send(Invoke) | Release acquired task, bump version, and re-invoke. |
| 23 | TaskRelease(t, l, v) | ⟨a, e, l, v, Resume, R⟩ | ⟨p, t+l, l, v+1, Resume, R⟩ | 200 | Send(Resume) | Release acquired task, bump version, and re-resume. |
| 24 | TaskRelease(t, l, v') | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 409 |  | Release failed due to version mismatch. |
| 25 | TaskRelease(t, l, v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Cannot release a suspended task. |
| 26 | TaskRelease(t, l, v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Version mismatch on release of suspended task. |
| 27 | TaskRelease(t, l, v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 409 |  | Cannot release a finished task. |
| 28 | TaskSuspend(v, P) | ⊥ | ⊥ | 404 |  | Attempt to suspend a non-existent task. |
| 29 | TaskSuspend(v, P) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Cannot suspend a pending task. |
| 30 | TaskSuspend(v', P) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Version mismatch on suspension of pending task. |
| 31 | TaskSuspend(v, P) | ⟨a, e, l, v, c, ∅⟩ : Pend(p) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 200 |  | Suspend task while waiting for pending promises. |
| 32 | TaskSuspend(v, P) | ⟨a, e, l, v, c, ∅⟩ : Settled(p) | ⟨a, e, l, v, Resume, ∅⟩ | 300 |  | Promise settled during suspend; redirect to resume. |
| 33 | TaskSuspend(v, P) | ⟨a, e, l, v, c, c'::R'⟩ | ⟨a, e, l, v, c', R'⟩ | 300 |  | Resumes queued; pop next resume from stack. |
| 34 | TaskSuspend(v', P) | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 409 |  | Version mismatch during task suspension. |
| 35 | TaskSuspend(v, P) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Task is already suspended. |
| 36 | TaskSuspend(v', P) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Version mismatch on already suspended task. |
| 37 | TaskSuspend(v, P) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 409 |  | Cannot suspend a finished task. |
| 38 | TaskFence(v) | ⊥ | ⊥ | 404 |  | Fence check on non-existent task. |
| 39 | TaskFence(v) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Fence failed; task is in pending state. |
| 40 | TaskFence(v') | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Fence failed; version mismatch on pending task. |
| 41 | TaskFence(v) | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 200 |  | Fence successful; version matches acquired task. |
| 42 | TaskFence(v') | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 409 |  | Fence failed; version mismatch on acquired task. |
| 43 | TaskFence(v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Fence failed; task is suspended. |
| 44 | TaskFence(v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Fence failed; version mismatch on suspended task. |
| 45 | TaskFence(v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 409 |  | Fence failed; task is finished. |
| 46 | TaskHeartbeat(t, v) | ⊥ | ⊥ | 404 |  | Heartbeat on non-existent task. |
| 47 | TaskHeartbeat(t, v) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 200 |  | Heartbeat on pending task (no-op). |
| 48 | TaskHeartbeat(t, v') | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 200 |  | Heartbeat on pending task with version mismatch (no-op). |
| 49 | TaskHeartbeat(t, v) | ⟨a, e, l, v, c, R⟩ | ⟨a, t+l, l, v, c, R⟩ | 200 |  | Extend expiry time for acquired task. |
| 50 | TaskHeartbeat(t, v') | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 200 |  | Heartbeat ignored due to version mismatch. |
| 51 | TaskHeartbeat(t, v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 200 |  | Heartbeat on suspended task (no-op). |
| 52 | TaskHeartbeat(t, v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 200 |  | Heartbeat on suspended task version mismatch (no-op). |
| 53 | TaskHeartbeat(t, v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 200 |  | Heartbeat on finished task (no-op). |
| 54 | TaskFulfill(v) | ⊥ | ⊥ | 404 |  | Fulfill non-existent task. |
| 55 | TaskFulfill(v) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Cannot fulfill a pending task. |
| 56 | TaskFulfill(v') | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ | 409 |  | Version mismatch on fulfillment of pending task. |
| 57 | TaskFulfill(v) | ⟨a, e, l, v, c, R⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 200 |  | Successfully fulfill acquired task. |
| 58 | TaskFulfill(v') | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ | 409 |  | Fulfill failed due to version mismatch. |
| 59 | TaskFulfill(v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Cannot fulfill a suspended task. |
| 60 | TaskFulfill(v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 409 |  | Version mismatch on fulfill of suspended task. |
| 61 | TaskFulfill(v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 409 |  | Task is already fulfilled. |
| 62 | Enqueue(Invoke, t, l) | ⊥ | ⟨p, t+l, l, 0, Invoke, ∅⟩ |  | Send(Invoke) | Create task via enqueue and send invocation. |
| 63 | Enqueue(Invoke, t, l) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R⟩ |  |  | Enqueue Invoke on pending task (idempotent). |
| 64 | Enqueue(Invoke, t, l) | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R⟩ |  |  | Enqueue Invoke on acquired task (idempotent). |
| 65 | Enqueue(Invoke, t, l) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ |  |  | Enqueue Invoke on suspended task (idempotent). |
| 66 | Enqueue(Invoke, t, l) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ |  |  | Enqueue Invoke on finished task (idempotent). |
| 67 | ~~Enqueue(Resume, t, l)~~ | ~~⊥~~ | ~~⊥~~ |  |  | ~~Illegal operation: Cannot resume non-existent task.~~ |
| 68 | Enqueue(Resume, t, l) | ⟨p, e, l, v, c, R⟩ | ⟨p, e, l, v, c, R::Resume⟩ |  |  | Add Resume to the queue of a pending task. |
| 69 | Enqueue(Resume, t, l) | ⟨a, e, l, v, c, R⟩ | ⟨a, e, l, v, c, R::Resume⟩ |  |  | Add Resume to the queue of an acquired task. |
| 70 | Enqueue(Resume, t, l) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨p, t+l, l, v+1, Resume, ∅⟩ |  | Send(Resume) | Move suspended task to pending and send resume. |
| 71 | Enqueue(Resume, t, l) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ |  |  | Ignore resume on finished task. |
| 72 | Tick(t) | ⊥ | ⊥ |  |  | Time passes for non-existent task. |
| 73 | Tick(t) | ⟨p, e, l, v, c, R⟩ : t < e | ⟨p, e, l, v, c, R⟩ |  |  | Pending task has not yet expired. |
| 74 | Tick(t) | ⟨p, e, l, v, Invoke, R⟩ : t ≥ e | ⟨p, t+l, l, v, Invoke, R⟩ |  | Send(Invoke) | Retry invocation for expired pending task. |
| 75 | Tick(t) | ⟨p, e, l, v, Resume, R⟩ : t ≥ e | ⟨p, t+l, l, v, Resume, R⟩ |  | Send(Resume) | Retry resume for expired pending task. |
| 76 | Tick(t) | ⟨a, e, l, v, c, R⟩ : t < e | ⟨a, e, l, v, c, R⟩ |  |  | Acquired task lease is still valid. |
| 77 | Tick(t) | ⟨a, e, l, v, Invoke, R⟩ : t ≥ e | ⟨p, t+l, l, v+1, Invoke, R⟩ |  | Send(Invoke) | Acquired task timed out; revert to pending, bump version. |
| 78 | Tick(t) | ⟨a, e, l, v, Resume, R⟩ : t ≥ e | ⟨p, t+l, l, v+1, Resume, R⟩ |  | Send(Resume) | Acquired task timed out; revert to pending, bump version. |
| 79 | Tick(t) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ |  |  | Time passes for suspended task. |
| 80 | Tick(t) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ |  |  | Time passes for finished task. |
