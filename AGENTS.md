# AGENTS.md

## Commands
- **Build**: `bun run build` (runs tsc)
- **Typecheck**: `bun run type-check`
- **Lint/Format check**: `bun run check`
- **Format fix**: `bun run format`
- **Test all**: `bun test`
- **Test single file**: `bun test tests/**/<file>.ts`
- **Test single case**: `bun test --test-name-pattern "<test name>"`

## Architecture
Resonate dev server: in-memory implementation of the Resonate durable execution platform for testing.
- `src/server.ts` - Main Server class handling promises, tasks, and schedules state machines
- `src/api.ts` - Request/response type definitions (Req, Res, and per-operation types)
- `src/entities.ts` - Core domain types (Promise, Task, Schedule, Message)
- `tests/` - Bun test files testing state transitions. See @doc/*.md

## After TypeScript Changes
After every code change to TypeScript files, run:
1. `bun run format` - Fix formatting
2. `bun run check` - Lint/format check
3. `bun run type-check` - Type checking
4. `bun run test` - Code test

## Exports
- **src/index.ts**: Must only export the `Server` class. Do not add other exports to this file.

## Code Style
- **Runtime**: Bun (ES modules)
- **Formatting**: Biome (2-space indent, double quotes, LF line endings)
- **Types**: Strict TypeScript; use `type` imports for type-only imports
- **Assertions**: Use `assert()` and `assertDefined()` from `src/utils.ts` to check invariants
- **Naming**: camelCase for variables/functions, PascalCase for types/classes

## Public API (Do Not Change)
The Server class exposes exactly three public methods (plus `getState()` for debugging):
- **`next({ at })`**: Returns ms until next timeout (promise/schedule/task expiry). Returns `undefined` if nothing pending.
- **`step({ at })`**: Advances time—triggers scheduled promises, times out pending promises, resets expired tasks, dispatches ready tasks. Returns `{ mesg, recv }[]` for messages to deliver.
- **`process({ at, req })`**: Handles all Req types (promise.*, task.*, schedule.*) and returns corresponding Res.

## Key State Machine Logic (Preserve in Refactor)

### Task States: `init` → `enqueued` → `claimed` → `completed`
- `init → enqueued`: Task becomes visible for acquisition (expiry = at + taskExpiryMs)
- `enqueued/init → claimed`: On task.acquire (version increments, pid/ttl/expiry set)
- `claimed/enqueued → completed`: On task.fulfill, task.suspend, or notify dispatch
- **Force reset to init**: On expiry timeout (version increments, pid/ttl cleared)

### step() Message Dispatch Logic
1. Only dispatch tasks where `state === "init"` AND `expiry <= at`
2. Track `inFlightAwaiters` set to prevent multiple tasks for same awaiter
3. **notify tasks**: Dispatch message, transition directly to `completed`
4. **invoke/resume tasks**: Dispatch message, transition to `enqueued`

### Promise Tags and Routing
- **`resonate:invoke`**: When a promise is created with `tags["resonate:invoke"]`, the `DefaultRouter` extracts this value as the `recv` (destination address) and creates an invoke task. Without this tag, no task is created and the promise must be settled externally.
- **`resonate:timeout`**: When set to `"true"`, a timed-out promise transitions to `resolved` instead of `rejected_timedout`. This allows "fire-and-forget" semantics where timeout is a success condition.
- The router is pluggable via the `Router` interface: `route(promise) → recv | undefined`

### Promise-Task Relationships
- `promiseCreate` with `resonate:invoke` tag → creates invoke task (awaiter = awaited = promiseId, recv = tag value)
- `promiseRegister` → adds resume callback to awaited promise
- `promiseSubscribe` → adds notify callback to awaited promise (recv = provided address)
- When promise settles → `completeCallbacks()` creates resume/notify tasks for all callbacks

### Version Fencing
- Task version starts at 0, increments on claim and force-reset
- All task operations (acquire, suspend, fulfill, release, heartbeat, fence) validate version match
