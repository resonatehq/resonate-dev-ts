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
- `tests/` - Bun test files testing state transitions

## CI (.github/workflows/ci.yml)
Runs on push/PR to main across Windows, Ubuntu, macOS. Steps: `bun install` → `bun run check` → `bun run test`

## After TypeScript Changes
After every code change to TypeScript files, run:
1. `bun run format` - Fix formatting
2. `bun run check` - Lint/format check
3. `bun run type-check` - Type checking
4. `bun run test` - Code test

## Code Style
- **Runtime**: Bun (ES modules)
- **Formatting**: Biome (2-space indent, double quotes, LF line endings)
- **Types**: Strict TypeScript; use `type` imports for type-only imports
- **Assertions**: Use `assert()` and `assertDefined()` from `src/utils.ts`
- **Error handling**: Throw `ServerError` with HTTP-like status codes (404, 409, 500)
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
