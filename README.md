# @resonatehq/dev

A TypeScript development server implementation for the Resonate distributed async/await framework. This package provides an in-memory server for local development and testing of durable execution patterns.

## Overview

`@resonatehq/dev` is a lightweight, in-memory implementation of the Resonate server that enables developers to build and test distributed applications locally without requiring external infrastructure. It implements the core Resonate protocol for managing promises, tasks, and schedules in a distributed system.

## What is Resonate?

Resonate is a distributed async/await framework that provides durable execution guarantees. It extends the familiar promise-based programming model to work reliably across distributed systems, network failures, and process restarts.

## Features

### Core Capabilities

- **Promise Management**: Create, settle, register, and subscribe to distributed promises with various states (pending, resolved, rejected, canceled, timedout)
- **Task Orchestration**: Acquire, suspend, fulfill, release, and manage distributed tasks with versioning and heartbeat support
- **Schedule Management**: Create and manage cron-based schedules for recurring promise execution
- **State Inspection**: Access complete system state including promises, tasks, schedules, and statistics
- **Message Routing**: Built-in router for distributing invoke, resume, and notify messages

### Key Features

- **In-Memory Storage**: Fast, ephemeral storage for development and testing
- **Time-based Simulation**: Control time flow for testing timeouts and schedules
- **Version Control**: Built-in versioning for optimistic concurrency control
- **Task Leasing**: TTL-based task claiming with heartbeat support
- **Callback Registration**: Subscribe to promise state changes
- **Statistics**: Real-time metrics on promise and task states

## Installation

```bash
npm install @resonatehq/dev
```

Or with Bun:

```bash
bun add @resonatehq/dev
```

## Usage

### Basic Server Setup

```typescript
import { Server } from "@resonatehq/dev";

// Create a new server instance
const server = new Server();

// Process a request
const response = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { 
      corrId: "correlation-id-1", 
      version: server.version 
    },
    data: {
      id: "my-promise",
      param: { headers: {}, data: JSON.stringify({ foo: "bar" }) },
      tags: { env: "dev" },
      timeoutAt: Date.now() + 60000, // 1 minute timeout
    },
  },
});

console.log(response);
```

### Working with Promises

```typescript
// Create a promise
const createRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "1", version: server.version },
    data: {
      id: "promise-1",
      param: { headers: {}, data: "" },
      tags: {},
      timeoutAt: Date.now() + 60000,
    },
  },
});

// Get promise status
const getRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.get",
    head: { corrId: "2", version: server.version },
    data: { id: "promise-1" },
  },
});

// Settle a promise
const settleRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "3", version: server.version },
    data: {
      id: "promise-1",
      state: "resolved",
      value: { headers: {}, data: JSON.stringify({ result: "success" }) },
    },
  },
});
```

### Working with Tasks

```typescript
// Create a task
const taskRes = server.process({
  at: Date.now(),
  req: {
    kind: "task.create",
    head: { corrId: "4", version: server.version },
    data: {
      pid: "process-1",
      ttl: 30000, // 30 seconds
      action: {
        kind: "promise.create",
        head: { corrId: "5", version: server.version },
        data: {
          id: "task-promise",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Date.now() + 60000,
        },
      },
    },
  },
});

// Acquire a task
const acquireRes = server.process({
  at: Date.now(),
  req: {
    kind: "task.acquire",
    head: { corrId: "6", version: server.version },
    data: {
      id: "task-id",
      version: 1,
      pid: "process-1",
      ttl: 30000,
    },
  },
});
```

### Working with Schedules

```typescript
// Create a schedule
const scheduleRes = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.create",
    head: { corrId: "7", version: server.version },
    data: {
      id: "daily-job",
      cron: "0 0 * * *", // Daily at midnight
      promiseId: "scheduled-promise",
      promiseTimeout: 3600000, // 1 hour
      promiseParam: { headers: {}, data: "" },
      promiseTags: { type: "scheduled" },
    },
  },
});
```

### Time-based Operations

```typescript
// Get next timeout
const timeout = server.next({ at: Date.now() });
console.log(`Next event in ${timeout}ms`);

// Step forward in time and get messages
const messages = server.step({ at: Date.now() + timeout });
for (const { mesg, recv } of messages) {
  console.log(`Message to ${recv}:`, mesg);
}
```

### Inspecting State

```typescript
const state = server.getState();

console.log(`Promises: ${state.stats.promiseCount}`);
console.log(`Tasks: ${state.stats.taskCount}`);
console.log(`Schedules: ${state.stats.scheduleCount}`);
console.log(`Pending promises: ${state.stats.pendingPromises}`);
console.log(`Claimed tasks: ${state.stats.claimedTasks}`);
```

## API Types

The package exports comprehensive TypeScript types for all requests and responses:

- **Promise Operations**: `PromiseCreateReq`, `PromiseGetReq`, `PromiseSettleReq`, `PromiseRegisterReq`, `PromiseSubscribeReq`
- **Task Operations**: `TaskCreateReq`, `TaskAcquireReq`, `TaskSuspendReq`, `TaskFulfillReq`, `TaskReleaseReq`, `TaskHeartbeatReq`
- **Schedule Operations**: `ScheduleCreateReq`, `ScheduleGetReq`, `ScheduleDeleteReq`
- **Entities**: `Promise`, `Task`, `Schedule`, `Message`
- **Utilities**: `assert`, `assertDefined`

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Format code
bun run format

# Type check
bun run type-check
```

## Use Cases

- **Local Development**: Test distributed applications without external dependencies
- **Integration Testing**: Simulate distributed promise execution in tests
- **Time Travel Testing**: Control time flow to test timeouts and schedules
- **Protocol Validation**: Verify correct implementation of the Resonate protocol
- **Learning**: Understand distributed async/await patterns

## License

See [LICENSE](LICENSE) file for details.

## Related Projects

- [Resonate](https://github.com/resonatehq/resonate) - The main Resonate project
- [Resonate SDK](https://github.com/resonatehq/resonate-sdk-ts) - TypeScript SDK for building Resonate applications
