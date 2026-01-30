# Promise State Transitions

## States

| Symbol | Description |
| --- | --- |
| ⊥ | Promise does not exist |
| ⟨p, o, ⊥, ⊥, ∅, S⟩ | Pending |
| ⟨p, o, ⊥, a, C, S⟩ | Pending with target address |
| ⟨p, o, ⊤, ⊥, ∅, S⟩ | Pending (timer) |
| ⟨p, o, ⊤, a, C, S⟩ | Pending (timer) with target address |
| ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | Resolved |
| ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | Rejected |
| ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | Rejected (canceled) |
| ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | Rejected (timedout) |

## Symbols

| Symbol | Description |
| --- | --- |
| ⊤ | True |
| ⊥ | False |
| t | Current time |
| o | Timeout time |
| a | Target address |
| C | Set of callbacks |
| S | Set of subscriptions |

## Operations

```
PromiseGet()
PromiseCreate(t, o, ⊥, ⊥)
PromiseCreate(t, o, ⊤, ⊥)
PromiseCreate(t, o, ⊥, a)
PromiseCreate(t, o, ⊤, a)
PromiseSettle(t, r)
PromiseSettle(t, x)
PromiseSettle(t, c)
PromiseRegister(c)
PromiseSubscribe(s)

```

## Side Effects

| Side Effect | Description |
| --- | --- |
| Enqueue(Invoke) | Enqueue invoke |
| Enqueue(Resume) | Enqueue resume |
| Send(Notify) | Send notify |

---

## Transitions

| # | Operation | Current State | Next State | Result | Side Effect(s) | Description |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PromiseGet() | ⊥ | ⊥ | 404 |  | Attempt to retrieve a non-existent promise. |
| 2 | PromiseGet() | ⟨p, o, ⊥, ⊥, ∅, S⟩ | ⟨p, o, ⊥, ⊥, ∅, S⟩ | 200 |  | Retrieve a standard pending promise. |
| 3 | PromiseGet() | ⟨p, o, ⊥, a, C, S⟩ | ⟨p, o, ⊥, a, C, S⟩ | 200 |  | Retrieve a pending promise with a target address. |
| 4 | PromiseGet() | ⟨p, o, ⊤, ⊥, ∅, S⟩ | ⟨p, o, ⊤, ⊥, ∅, S⟩ | 200 |  | Retrieve a pending timer promise. |
| 5 | PromiseGet() | ⟨p, o, ⊤, a, C, S⟩ | ⟨p, o, ⊤, a, C, S⟩ | 200 |  | Retrieve a pending timer promise with a target address. |
| 6 | PromiseGet() | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Retrieve a successfully resolved promise. |
| 7 | PromiseGet() | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Retrieve a rejected promise. |
| 8 | PromiseGet() | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Retrieve a canceled promise. |
| 9 | PromiseGet() | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Retrieve a timed-out promise. |
| 10 | PromiseCreate(t, o, ⊥, ⊥) | ⊥ | ⟨p, o, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Initialize a new standard pending promise. |
| 11 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊥, ⊥, ∅, S⟩ | 200 |  | Idempotent creation check for an active pending promise. |
| 12 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Transition to timeout state during creation check. |
| 13 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨p, o, ⊥, a, C, S⟩ | 200 |  | Creation check for pending promise with address (active). |
| 14 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Transition to timeout; resume callbacks and notify subscribers. |
| 15 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊤, ⊥, ∅, S⟩ | 200 |  | Creation check for pending timer (active). |
| 16 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Auto-resolve timer promise upon expiration check. |
| 17 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨p, o, ⊤, a, C, S⟩ | 200 |  | Creation check for pending timer with address (active). |
| 18 | PromiseCreate(t, o, ⊥, ⊥) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Auto-resolve timer with address; resume and notify. |
| 19 | PromiseCreate(t, o, ⊥, ⊥) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Creation check on already resolved promise (no change). |
| 20 | PromiseCreate(t, o, ⊥, ⊥) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Creation check on already rejected promise (no change). |
| 21 | PromiseCreate(t, o, ⊥, ⊥) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Creation check on already canceled promise (no change). |
| 22 | PromiseCreate(t, o, ⊥, ⊥) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Creation check on already timed-out promise (no change). |
| 23 | PromiseCreate(t, o, ⊤, ⊥) | ⊥ | ⟨p, o, ⊤, ⊥, ∅, ∅⟩ | 200 |  | Initialize a new pending timer promise. |
| 24 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊥, ⊥, ∅, S⟩ | 200 |  | Timer creation check on active pending promise. |
| 25 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Expire to timeout state during timer creation check. |
| 26 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨p, o, ⊥, a, C, S⟩ | 200 |  | Timer creation check on pending promise with address. |
| 27 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Expire to timeout state; resume and notify. |
| 28 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊤, ⊥, ∅, S⟩ | 200 |  | Idempotent timer check (active). |
| 29 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Expire timer to resolved state. |
| 30 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨p, o, ⊤, a, C, S⟩ | 200 |  | Idempotent timer with address check (active). |
| 31 | PromiseCreate(t, o, ⊤, ⊥) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Expire timer with address to resolved state; resume and notify. |
| 32 | PromiseCreate(t, o, ⊤, ⊥) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer creation on resolved state (no change). |
| 33 | PromiseCreate(t, o, ⊤, ⊥) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer creation on rejected state (no change). |
| 34 | PromiseCreate(t, o, ⊤, ⊥) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer creation on canceled state (no change). |
| 35 | PromiseCreate(t, o, ⊤, ⊥) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer creation on timeout state (no change). |
| 36 | PromiseCreate(t, o, ⊥, a) | ⊥ | ⟨p, o, ⊥, a, ∅, ∅⟩ | 200 | Enqueue(Invoke) | Create new pending promise with address and trigger invocation. |
| 37 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊥, ⊥, ∅, S⟩ | 200 |  | Creation check for address-based promise on standard pending. |
| 38 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Expire to timeout during address promise creation check. |
| 39 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨p, o, ⊥, a, C, S⟩ | 200 |  | Idempotent address promise check (active). |
| 40 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Address promise check results in timeout expiration. |
| 41 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊤, ⊥, ∅, S⟩ | 200 |  | Address promise check on active timer. |
| 42 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Address promise check triggers timer resolution. |
| 43 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨p, o, ⊤, a, C, S⟩ | 200 |  | Address promise check on active timer with address. |
| 44 | PromiseCreate(t, o, ⊥, a) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Address promise check triggers timer+address resolution. |
| 45 | PromiseCreate(t, o, ⊥, a) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Address creation check on resolved state. |
| 46 | PromiseCreate(t, o, ⊥, a) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Address creation check on rejected state. |
| 47 | PromiseCreate(t, o, ⊥, a) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Address creation check on canceled state. |
| 48 | PromiseCreate(t, o, ⊥, a) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Address creation check on timeout state. |
| 49 | PromiseCreate(t, o, ⊤, a) | ⊥ | ⟨p, o, ⊤, a, ∅, ∅⟩ | 200 | Enqueue(Invoke) | Create new pending timer with address and trigger invocation. |
| 50 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊥, ⊥, ∅, S⟩ | 200 |  | Timer+address check on active standard pending. |
| 51 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Timer+address check triggers timeout expiration. |
| 52 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨p, o, ⊥, a, C, S⟩ | 200 |  | Timer+address check on active address pending. |
| 53 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Timer+address check results in timeout; resume callbacks. |
| 54 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨p, o, ⊤, ⊥, ∅, S⟩ | 200 |  | Timer+address check on active timer pending. |
| 55 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Timer+address check triggers auto-resolution. |
| 56 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨p, o, ⊤, a, C, S⟩ | 200 |  | Idempotent timer+address check (active). |
| 57 | PromiseCreate(t, o, ⊤, a) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Timer+address check triggers auto-resolution; resume callbacks. |
| 58 | PromiseCreate(t, o, ⊤, a) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer+address creation check on resolved state. |
| 59 | PromiseCreate(t, o, ⊤, a) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer+address creation check on rejected state. |
| 60 | PromiseCreate(t, o, ⊤, a) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer+address creation check on canceled state. |
| 61 | PromiseCreate(t, o, ⊤, a) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Timer+address creation check on timeout state. |
| 62 | PromiseSettle(t, r) | ⊥ | ⊥ | 404 |  | Settle attempt on non-existent promise. |
| 63 | PromiseSettle(t, r) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Manually resolve standard pending promise. |
| 64 | PromiseSettle(t, r) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Expire to timeout instead of resolving (time exceeded). |
| 65 | PromiseSettle(t, r) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Resolve promise with address; resume and notify. |
| 66 | PromiseSettle(t, r) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Expire to timeout; resume and notify. |
| 67 | PromiseSettle(t, r) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Manually resolve timer promise (before timeout). |
| 68 | PromiseSettle(t, r) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Manually resolve timer promise (at/after timeout). |
| 69 | PromiseSettle(t, r) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Resolve timer with address; resume and notify. |
| 70 | PromiseSettle(t, r) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Resolve timer with address; resume and notify. |
| 71 | PromiseSettle(t, r) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Settle on already resolved promise (no change). |
| 72 | PromiseSettle(t, r) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Settle on already rejected promise (no change). |
| 73 | PromiseSettle(t, r) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Settle on already canceled promise (no change). |
| 74 | PromiseSettle(t, r) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Settle on already timed-out promise (no change). |
| 75 | PromiseSettle(t, x) | ⊥ | ⊥ | 404 |  | Rejection attempt on non-existent promise. |
| 76 | PromiseSettle(t, x) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Reject standard pending promise. |
| 77 | PromiseSettle(t, x) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Expire to timeout instead of rejecting. |
| 78 | PromiseSettle(t, x) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Reject promise with address; resume and notify. |
| 79 | PromiseSettle(t, x) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Expire to timeout; resume and notify. |
| 80 | PromiseSettle(t, x) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Reject timer promise (before timeout). |
| 81 | PromiseSettle(t, x) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Reject timer after timeout results in auto-resolve. |
| 82 | PromiseSettle(t, x) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Reject timer with address; resume and notify. |
| 83 | PromiseSettle(t, x) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Reject expired timer with address results in auto-resolve. |
| 84 | PromiseSettle(t, x) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Rejection on already resolved promise. |
| 85 | PromiseSettle(t, x) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Rejection on already rejected promise. |
| 86 | PromiseSettle(t, x) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Rejection on already canceled promise. |
| 87 | PromiseSettle(t, x) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Rejection on already timed-out promise. |
| 88 | PromiseSettle(t, c) | ⊥ | ⊥ | 404 |  | Cancellation attempt on non-existent promise. |
| 89 | PromiseSettle(t, c) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Cancel standard pending promise. |
| 90 | PromiseSettle(t, c) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Expire to timeout instead of canceling. |
| 91 | PromiseSettle(t, c) | ⟨p, o, ⊥, a, C, S⟩ : t < o | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Cancel promise with address; resume and notify. |
| 92 | PromiseSettle(t, c) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Expire to timeout; resume and notify. |
| 93 | PromiseSettle(t, c) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Cancel timer promise (before timeout). |
| 94 | PromiseSettle(t, c) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Send(Notify) ∀s∈S | Cancel expired timer results in auto-resolve. |
| 95 | PromiseSettle(t, c) | ⟨p, o, ⊤, a, C, S⟩ : t < o | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Cancel timer with address; resume and notify. |
| 96 | PromiseSettle(t, c) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S | Cancel expired timer with address triggers auto-resolve. |
| 97 | PromiseSettle(t, c) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Cancellation on already resolved promise. |
| 98 | PromiseSettle(t, c) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Cancellation on already rejected promise. |
| 99 | PromiseSettle(t, c) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Cancellation on already canceled promise. |
| 100 | PromiseSettle(t, c) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Cancellation on already timed-out promise. |
| 101 | PromiseRegister(c) | ⊥ | ⊥ | 404 |  | Register callback on non-existent promise. |
| 102 | PromiseRegister(c) | ⟨p, o, ⊥, ⊥, ∅, S⟩ | ⟨p, o, ⊥, ⊥, ∅, S⟩ | 200 |  | Register attempt on standard pending (no storage for callbacks). |
| 103 | PromiseRegister(c) | ⟨p, o, ⊥, a, C, S⟩ | ⟨p, o, ⊥, a, C::c, S⟩ | 200 |  | Add callback to pending promise with address. |
| 104 | PromiseRegister(c) | ⟨p, o, ⊤, ⊥, ∅, S⟩ | ⟨p, o, ⊤, ⊥, ∅, S⟩ | 200 |  | Register attempt on timer pending (no storage for callbacks). |
| 105 | PromiseRegister(c) | ⟨p, o, ⊤, a, C, S⟩ | ⟨p, o, ⊤, a, C::c, S⟩ | 200 |  | Add callback to pending timer with address. |
| 106 | PromiseRegister(c) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Register attempt on resolved promise (terminal). |
| 107 | PromiseRegister(c) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Register attempt on rejected promise (terminal). |
| 108 | PromiseRegister(c) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Register attempt on canceled promise (terminal). |
| 109 | PromiseRegister(c) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Register attempt on timeout promise (terminal). |
| 110 | PromiseSubscribe(s) | ⊥ | ⊥ | 404 |  | Subscribe attempt on non-existent promise. |
| 111 | PromiseSubscribe(s) | ⟨p, o, ⊥, ⊥, ∅, S⟩ | ⟨p, o, ⊥, ⊥, ∅, S::s⟩ | 200 |  | Add subscriber to standard pending promise. |
| 112 | PromiseSubscribe(s) | ⟨p, o, ⊥, a, C, S⟩ | ⟨p, o, ⊥, a, C, S::s⟩ | 200 |  | Add subscriber to pending promise with address. |
| 113 | PromiseSubscribe(s) | ⟨p, o, ⊤, ⊥, ∅, S⟩ | ⟨p, o, ⊤, ⊥, ∅, S::s⟩ | 200 |  | Add subscriber to timer pending promise. |
| 114 | PromiseSubscribe(s) | ⟨p, o, ⊤, a, C, S⟩ | ⟨p, o, ⊤, a, C, S::s⟩ | 200 |  | Add subscriber to timer promise with address. |
| 115 | PromiseSubscribe(s) | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Subscribe attempt on resolved promise (terminal). |
| 116 | PromiseSubscribe(s) | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Subscribe attempt on rejected promise (terminal). |
| 117 | PromiseSubscribe(s) | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Subscribe attempt on canceled promise (terminal). |
| 118 | PromiseSubscribe(s) | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ | 200 |  | Subscribe attempt on timeout promise (terminal). |
