import { Server } from "./src";

/**
 * Comprehensive example demonstrating all features of @resonatehq/dev
 * This script showcases:
 * - Promise management (create, get, settle, register, subscribe)
 * - Task orchestration (create, acquire, suspend, fulfill, release, heartbeat)
 * - Schedule management (create, get, delete)
 * - Time-based operations (next, step)
 * - State inspection
 */

console.log("=".repeat(80));
console.log("@resonatehq/dev - Comprehensive Example");
console.log("=".repeat(80));
console.log();

// Create a new server instance
const server = new Server();
console.log(`✓ Server created (version: ${server.version})`);
console.log();

// Helper function to display results
function logResult(operation: string, result: any) {
  console.log(`📋 ${operation}`);
  console.log(JSON.stringify(result, null, 2));
  console.log();
}

// ============================================================================
// SECTION 1: Promise Management
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 1: Promise Management");
console.log("─".repeat(80));
console.log();

// 1.1 Create a promise
const createPromiseRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-1", version: server.version },
    data: {
      id: "user-signup-promise",
      param: {
        headers: { "content-type": "application/json" },
        data: JSON.stringify({ email: "user@example.com", plan: "pro" }),
      },
      tags: { service: "auth", env: "dev" },
      timeoutAt: Date.now() + 60000, // 1 minute timeout
    },
  },
});
logResult("1.1 Create Promise", createPromiseRes);

// 1.2 Get promise status
const getPromiseRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.get",
    head: { corrId: "corr-2", version: server.version },
    data: { id: "user-signup-promise" },
  },
});
logResult("1.2 Get Promise", getPromiseRes);

// 1.3 Create another promise that will be used for task creation
const createPromise2Res = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-3", version: server.version },
    data: {
      id: "email-verification-promise",
      param: { headers: {}, data: JSON.stringify({ userId: "123" }) },
      tags: { service: "email" },
      timeoutAt: Date.now() + 120000,
    },
  },
});
logResult("1.3 Create Second Promise", createPromise2Res);

// 1.4 Settle a promise with resolved state
const settlePromiseRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-4", version: server.version },
    data: {
      id: "email-verification-promise",
      state: "resolved",
      value: {
        headers: {},
        data: JSON.stringify({ verified: true, timestamp: Date.now() }),
      },
    },
  },
});
logResult("1.4 Settle Promise (resolve)", settlePromiseRes);

// 1.5 Create a promise with rejection
const createPromise3Res = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-5", version: server.version },
    data: {
      id: "payment-promise",
      param: { headers: {}, data: JSON.stringify({ amount: 100 }) },
      tags: { service: "payment" },
      timeoutAt: Date.now() + 30000,
    },
  },
});
logResult("1.5 Create Payment Promise", createPromise3Res);

// 1.6 Settle promise with rejected state
const rejectPromiseRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-6", version: server.version },
    data: {
      id: "payment-promise",
      state: "rejected",
      value: {
        headers: {},
        data: JSON.stringify({ error: "Insufficient funds" }),
      },
    },
  },
});
logResult("1.6 Settle Promise (reject)", rejectPromiseRes);

// ============================================================================
// SECTION 2: Task Orchestration with Invoke Tag
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 2: Task Orchestration");
console.log("─".repeat(80));
console.log();

// 2.1 Create a promise with the special invoke tag to create a task
const createTaskPromiseRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-7", version: server.version },
    data: {
      id: "data-processing-task",
      param: {
        headers: {},
        data: JSON.stringify({ operation: "aggregate", dataset: "users" }),
      },
      tags: { "resonate:invoke": "default" }, // This tag creates a task
      timeoutAt: Date.now() + 300000, // 5 minutes
    },
  },
});
logResult(
  "2.1 Create Promise with Invoke Tag (creates task)",
  createTaskPromiseRes,
);

// 2.2 Step to get the invoke message
const now1 = Date.now();
const messages1 = server.step({ at: now1 });
console.log(`📋 2.2 Step to Get Invoke Message`);
console.log(`Generated ${messages1.length} message(s):`);
if (messages1.length > 0) {
  const { mesg, recv } = messages1[0];
  console.log(`  → Message to ${recv}:`);
  console.log(`    Kind: ${mesg.kind}`);
  if (mesg.kind === "invoke") {
    console.log(`    Task: ${mesg.data.task.id} (v${mesg.data.task.version})`);

    const taskId = mesg.data.task.id;
    const taskVersion = mesg.data.task.version;

    // 2.3 Acquire the task
    const acquireTaskRes = server.process({
      at: now1,
      req: {
        kind: "task.acquire",
        head: { corrId: "corr-8", version: server.version },
        data: {
          id: taskId,
          version: taskVersion,
          pid: "worker-process-1",
          ttl: 30000,
        },
      },
    });
    console.log();
    logResult("2.3 Acquire Task", acquireTaskRes);

    // 2.4 Get task status
    const getTaskRes = server.process({
      at: now1,
      req: {
        kind: "task.get",
        head: { corrId: "corr-9", version: server.version },
        data: { id: taskId },
      },
    });
    logResult("2.4 Get Task Status", getTaskRes);

    // 2.5 Send heartbeat
    const heartbeatRes = server.process({
      at: now1,
      req: {
        kind: "task.heartbeat",
        head: { corrId: "corr-10", version: server.version },
        data: {
          pid: "worker-process-1",
          tasks: [{ id: taskId, version: taskVersion + 1 }],
        },
      },
    });
    logResult("2.5 Task Heartbeat", heartbeatRes);

    // 2.6 Fulfill the task (complete it successfully)
    const fulfillTaskRes = server.process({
      at: now1,
      req: {
        kind: "task.fulfill",
        head: { corrId: "corr-11", version: server.version },
        data: {
          id: taskId,
          version: taskVersion + 1,
          action: {
            kind: "promise.settle",
            head: { corrId: "corr-12", version: server.version },
            data: {
              id: "data-processing-task",
              state: "resolved",
              value: {
                headers: {},
                data: JSON.stringify({
                  status: "completed",
                  recordsProcessed: 1000,
                }),
              },
            },
          },
        },
      },
    });
    logResult("2.6 Fulfill Task", fulfillTaskRes);
  }
} else {
  console.log("  No messages generated");
}
console.log();

// 2.7 Create another task example with suspend
const createTask2PromiseRes = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-13", version: server.version },
    data: {
      id: "multi-step-task",
      param: {
        headers: {},
        data: JSON.stringify({ steps: ["init", "process", "finalize"] }),
      },
      tags: { "resonate:invoke": "default" },
      timeoutAt: Date.now() + 180000,
    },
  },
});
logResult("2.7 Create Multi-step Task", createTask2PromiseRes);

// Step and acquire second task
const now2 = Date.now();
const messages2 = server.step({ at: now2 });
if (messages2.length > 0 && messages2[0].mesg.kind === "invoke") {
  const taskId2 = messages2[0].mesg.data.task.id;
  const taskVersion2 = messages2[0].mesg.data.task.version;

  const acquireTask2Res = server.process({
    at: now2,
    req: {
      kind: "task.acquire",
      head: { corrId: "corr-14", version: server.version },
      data: {
        id: taskId2,
        version: taskVersion2,
        pid: "worker-process-2",
        ttl: 30000,
      },
    },
  });
  logResult("2.8 Acquire Second Task", acquireTask2Res);

  // Create a dependency promise
  const depPromiseRes = server.process({
    at: now2,
    req: {
      kind: "promise.create",
      head: { corrId: "corr-15", version: server.version },
      data: {
        id: "dependency-promise",
        param: { headers: {}, data: "" },
        tags: {},
        timeoutAt: Date.now() + 60000,
      },
    },
  });
  logResult("2.9 Create Dependency Promise", depPromiseRes);

  // Suspend task with promise registration
  const suspendTaskRes = server.process({
    at: now2,
    req: {
      kind: "task.suspend",
      head: { corrId: "corr-16", version: server.version },
      data: {
        id: taskId2,
        version: taskVersion2 + 1,
        actions: [
          {
            kind: "promise.register",
            head: { corrId: "corr-17", version: server.version },
            data: {
              awaiter: "multi-step-task",
              awaited: "dependency-promise",
            },
          },
        ],
      },
    },
  });
  logResult("2.10 Suspend Task (waiting for dependency)", suspendTaskRes);

  // Settle the dependency to resume the task
  const settleDependencyRes = server.process({
    at: now2,
    req: {
      kind: "promise.settle",
      head: { corrId: "corr-18", version: server.version },
      data: {
        id: "dependency-promise",
        state: "resolved",
        value: { headers: {}, data: JSON.stringify({ ready: true }) },
      },
    },
  });
  logResult("2.11 Settle Dependency (triggers resume)", settleDependencyRes);

  // Check for resume message
  const messages3 = server.step({ at: now2 });
  console.log(`📋 2.12 Check for Resume Message`);
  console.log(`Generated ${messages3.length} message(s):`);
  for (const { mesg, recv } of messages3) {
    console.log(`  → Message to ${recv}: ${mesg.kind}`);
    if (mesg.kind === "resume") {
      console.log(
        `    Task: ${mesg.data.task.id} (v${mesg.data.task.version})`,
      );
    }
  }
  console.log();
}

// ============================================================================
// SECTION 3: Schedule Management
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 3: Schedule Management");
console.log("─".repeat(80));
console.log();

// 3.1 Create a daily schedule
const createScheduleRes = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.create",
    head: { corrId: "corr-19", version: server.version },
    data: {
      id: "daily-report-job",
      cron: "0 0 * * *", // Daily at midnight
      promiseId: "daily-report",
      promiseTimeout: 3600000, // 1 hour
      promiseParam: {
        headers: {},
        data: JSON.stringify({ reportType: "summary", format: "pdf" }),
      },
      promiseTags: { type: "scheduled", priority: "high" },
    },
  },
});
logResult("3.1 Create Daily Schedule", createScheduleRes);

// 3.2 Get schedule
const getScheduleRes = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.get",
    head: { corrId: "corr-20", version: server.version },
    data: { id: "daily-report-job" },
  },
});
logResult("3.2 Get Schedule", getScheduleRes);

// 3.3 Create an hourly schedule
const createSchedule2Res = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.create",
    head: { corrId: "corr-21", version: server.version },
    data: {
      id: "hourly-cleanup-job",
      cron: "0 * * * *", // Every hour
      promiseId: "cleanup-temp-files",
      promiseTimeout: 600000, // 10 minutes
      promiseParam: { headers: {}, data: JSON.stringify({ path: "/tmp" }) },
      promiseTags: { type: "maintenance" },
    },
  },
});
logResult("3.3 Create Hourly Schedule", createSchedule2Res);

// 3.4 Create a schedule with invoke tag for task creation
const createSchedule3Res = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.create",
    head: { corrId: "corr-22", version: server.version },
    data: {
      id: "weekly-backup-job",
      cron: "0 2 * * 0", // Every Sunday at 2 AM
      promiseId: "backup-database",
      promiseTimeout: 7200000, // 2 hours
      promiseParam: { headers: {}, data: JSON.stringify({ database: "main" }) },
      promiseTags: { "resonate:invoke": "default", type: "backup" },
    },
  },
});
logResult("3.4 Create Weekly Schedule with Task", createSchedule3Res);

// 3.5 Delete a schedule
const deleteScheduleRes = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.delete",
    head: { corrId: "corr-23", version: server.version },
    data: { id: "hourly-cleanup-job" },
  },
});
logResult("3.5 Delete Schedule", deleteScheduleRes);

// ============================================================================
// SECTION 4: Time-based Operations
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 4: Time-based Operations");
console.log("─".repeat(80));
console.log();

// 4.1 Get next timeout
const now = Date.now();
const nextTimeout = server.next({ at: now });
console.log(`📋 4.1 Next Timeout`);
if (nextTimeout !== undefined) {
  console.log(
    `Next event in ${nextTimeout}ms (${(nextTimeout / 1000).toFixed(2)}s)`,
  );
  const nextEventTime = new Date(now + nextTimeout);
  console.log(`Next event at: ${nextEventTime.toISOString()}`);
} else {
  console.log("No upcoming timeouts");
}
console.log();

// 4.2 Fast-forward time to test timeout
console.log(`📋 4.2 Create Promise with Short Timeout`);
const shortTimeoutPromise = server.process({
  at: now,
  req: {
    kind: "promise.create",
    head: { corrId: "corr-24", version: server.version },
    data: {
      id: "timeout-test-promise",
      param: { headers: {}, data: "" },
      tags: {},
      timeoutAt: now + 5000, // 5 seconds
    },
  },
});
console.log(`Created promise with 5s timeout: ${shortTimeoutPromise.kind}`);
console.log();

// Fast forward past timeout
const futureTime = now + 10000;
console.log(`📋 4.3 Step Forward to Future (${futureTime - now}ms ahead)`);
const futureMessages = server.step({ at: futureTime });
console.log(`Generated ${futureMessages.length} message(s)`);
console.log();

// Check promise state after timeout
const timeoutCheckRes = server.process({
  at: futureTime,
  req: {
    kind: "promise.get",
    head: { corrId: "corr-25", version: server.version },
    data: { id: "timeout-test-promise" },
  },
});
logResult("4.4 Check Timed-out Promise", timeoutCheckRes);

// ============================================================================
// SECTION 5: State Inspection
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 5: State Inspection");
console.log("─".repeat(80));
console.log();

const state = server.getState();

console.log("📊 System Statistics:");
console.log(`  Total Promises: ${state.stats.promiseCount}`);
console.log(`    ├─ Pending:  ${state.stats.pendingPromises}`);
console.log(`    ├─ Resolved: ${state.stats.resolvedPromises}`);
console.log(`    ├─ Rejected: ${state.stats.rejectedPromises}`);
console.log(`    ├─ Canceled: ${state.stats.canceledPromises}`);
console.log(`    └─ Timedout: ${state.stats.timedoutPromises}`);
console.log();
console.log(`  Total Tasks: ${state.stats.taskCount}`);
console.log(`    ├─ Init:      ${state.stats.initTasks}`);
console.log(`    ├─ Enqueued:  ${state.stats.enqueuedTasks}`);
console.log(`    ├─ Claimed:   ${state.stats.claimedTasks}`);
console.log(`    └─ Completed: ${state.stats.completedTasks}`);
console.log();
console.log(`  Total Schedules: ${state.stats.scheduleCount}`);
console.log();

console.log("📋 Promise Summary:");
const promisesByState: { [key: string]: string[] } = {};
for (const [id, promise] of Object.entries(state.promises)) {
  if (!promisesByState[promise.state]) {
    promisesByState[promise.state] = [];
  }
  promisesByState[promise.state].push(id);
}
for (const [stateType, ids] of Object.entries(promisesByState)) {
  console.log(`  ${stateType}: ${ids.length} promise(s)`);
  for (const id of ids.slice(0, 3)) {
    // Show first 3
    console.log(`    - ${id}`);
  }
  if (ids.length > 3) {
    console.log(`    ... and ${ids.length - 3} more`);
  }
}
console.log();

console.log("📋 Schedule Summary:");
for (const [id, schedule] of Object.entries(state.schedules)) {
  console.log(`  ${id}:`);
  console.log(`    Cron: ${schedule.cron}`);
  console.log(`    Next Run: ${new Date(schedule.nextRunAt).toISOString()}`);
  if (schedule.lastRunAt) {
    console.log(`    Last Run: ${new Date(schedule.lastRunAt).toISOString()}`);
  }
}
console.log();

// ============================================================================
// SECTION 6: Error Handling
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 6: Error Handling");
console.log("─".repeat(80));
console.log();

// 6.1 Try to get non-existent promise
const errorRes1 = server.process({
  at: Date.now(),
  req: {
    kind: "promise.get",
    head: { corrId: "corr-26", version: server.version },
    data: { id: "non-existent-promise" },
  },
});
logResult("6.1 Get Non-existent Promise (404 Error)", errorRes1);

// 6.2 Try to settle non-existent promise
const errorRes2 = server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-27", version: server.version },
    data: {
      id: "another-non-existent-promise",
      state: "resolved",
      value: { headers: {}, data: "" },
    },
  },
});
logResult("6.2 Settle Non-existent Promise (404 Error)", errorRes2);

// 6.3 Try to delete non-existent schedule
const errorRes3 = server.process({
  at: Date.now(),
  req: {
    kind: "schedule.delete",
    head: { corrId: "corr-28", version: server.version },
    data: { id: "non-existent-schedule" },
  },
});
logResult("6.3 Delete Non-existent Schedule (404 Error)", errorRes3);

// 6.4 Try to settle an already settled promise
const errorRes4 = server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-29", version: server.version },
    data: {
      id: "email-verification-promise", // Already resolved earlier
      state: "resolved",
      value: { headers: {}, data: "" },
    },
  },
});
logResult("6.4 Settle Already-Settled Promise (409 Error)", errorRes4);

// ============================================================================
// SECTION 7: Advanced Patterns
// ============================================================================
console.log("─".repeat(80));
console.log("SECTION 7: Advanced Patterns");
console.log("─".repeat(80));
console.log();

// 7.1 Chain of promises with dependencies
console.log("📋 7.1 Create Promise Chain");
const step1Promise = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-30", version: server.version },
    data: {
      id: "step-1-fetch-data",
      param: { headers: {}, data: JSON.stringify({ source: "api" }) },
      tags: { chain: "data-pipeline" },
      timeoutAt: Date.now() + 60000,
    },
  },
});
console.log(`  Step 1 created: ${step1Promise.kind}`);

const step2Promise = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-31", version: server.version },
    data: {
      id: "step-2-transform-data",
      param: { headers: {}, data: JSON.stringify({ format: "json" }) },
      tags: { chain: "data-pipeline" },
      timeoutAt: Date.now() + 60000,
    },
  },
});
console.log(`  Step 2 created: ${step2Promise.kind}`);

const step3Promise = server.process({
  at: Date.now(),
  req: {
    kind: "promise.create",
    head: { corrId: "corr-32", version: server.version },
    data: {
      id: "step-3-store-data",
      param: { headers: {}, data: JSON.stringify({ destination: "db" }) },
      tags: { chain: "data-pipeline" },
      timeoutAt: Date.now() + 60000,
    },
  },
});
console.log(`  Step 3 created: ${step3Promise.kind}`);
console.log();

// 7.2 Execute pipeline
console.log("📋 7.2 Execute Pipeline");
server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-33", version: server.version },
    data: {
      id: "step-1-fetch-data",
      state: "resolved",
      value: { headers: {}, data: JSON.stringify({ records: 100 }) },
    },
  },
});
console.log("  ✓ Step 1 completed");

server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-34", version: server.version },
    data: {
      id: "step-2-transform-data",
      state: "resolved",
      value: { headers: {}, data: JSON.stringify({ transformed: true }) },
    },
  },
});
console.log("  ✓ Step 2 completed");

server.process({
  at: Date.now(),
  req: {
    kind: "promise.settle",
    head: { corrId: "corr-35", version: server.version },
    data: {
      id: "step-3-store-data",
      state: "resolved",
      value: { headers: {}, data: JSON.stringify({ stored: true }) },
    },
  },
});
console.log("  ✓ Step 3 completed");
console.log();

// ============================================================================
// Summary
// ============================================================================
console.log("=".repeat(80));
console.log("Example Complete!");
console.log("=".repeat(80));
console.log();

const finalState = server.getState();
console.log("Final System State:");
console.log(`  ✓ ${finalState.stats.promiseCount} promises created`);
console.log(`  ✓ ${finalState.stats.taskCount} tasks orchestrated`);
console.log(`  ✓ ${finalState.stats.scheduleCount} schedules configured`);
console.log(`  ✓ ${finalState.stats.resolvedPromises} promises resolved`);
console.log(`  ✓ ${finalState.stats.rejectedPromises} promises rejected`);
console.log(`  ✓ ${finalState.stats.timedoutPromises} promises timed out`);
console.log();

console.log("This example demonstrated:");
console.log("  ✓ Promise lifecycle (create → settle → get)");
console.log("  ✓ Task orchestration with invoke messages");
console.log("  ✓ Task suspension and resumption with dependencies");
console.log("  ✓ Schedule management with cron expressions");
console.log("  ✓ Time-based operations and timeout handling");
console.log("  ✓ Complete state inspection with statistics");
console.log("  ✓ Error handling for invalid operations");
console.log("  ✓ Advanced patterns like promise chains");
console.log();
console.log("Run this script with: bun run app.ts");
console.log("=".repeat(80));
