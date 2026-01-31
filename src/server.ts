import CronExpressionParser from "cron-parser";
import type {
  PromiseCreateReq,
  PromiseCreateRes,
  PromiseGetReq,
  PromiseGetRes,
  PromiseRegisterReq,
  PromiseRegisterRes,
  PromiseSettleReq,
  PromiseSettleRes,
  PromiseSubscribeReq,
  PromiseSubscribeRes,
  Req,
  Res,
  ScheduleCreateReq,
  ScheduleCreateRes,
  ScheduleDeleteReq,
  ScheduleDeleteRes,
  ScheduleGetReq,
  ScheduleGetRes,
  TaskAcquireReq,
  TaskAcquireRes,
  TaskCreateReq,
  TaskCreateRes,
  TaskFenceReq,
  TaskFenceRes,
  TaskFulfillReq,
  TaskFulfillRes,
  TaskGetReq,
  TaskGetRes,
  TaskHeartbeatReq,
  TaskHeartbeatRes,
  TaskReleaseReq,
  TaskReleaseRes,
  TaskSuspendReq,
  TaskSuspendRes,
} from "./api";
import type {
  Message,
  Promise,
  PromiseState,
  Schedule,
  Task,
} from "./entities";
import { assert, assertDefined, isStatus } from "./utils";

type Result<T> =
  | { kind: "value"; data: T }
  | { kind: "error"; status: number; message: string };

type PromiseRecord = Promise & {
  callbacks: {
    [key: string]: {
      id: string;
      type: "resume" | "notify";
      awaited: string;
      awaiter: string;
      recv: string;
      timeoutAt: number;
      createdAt: number;
    };
  };
};

type TaskState = "init" | "enqueued" | "claimed" | "completed";
type TaskRecord = Task & {
  state: TaskState;
  type: "invoke" | "resume" | "notify";
  recv: string;
  awaiter: string;
  awaited: string;
  timeoutAt: number;
  pid?: string;
  ttl?: number;
  expiry: number;
  createdAt: number;
  completedAt?: number;
};

type ScheduleRecord = Schedule;

type Subscription = {
  id: string;
  awaited: string;
  recv: string;
  createdAt: number;
};

interface Router {
  route(promise: PromiseRecord): string | undefined;
}

class DefaultRouter {
  private tag = "resonate:invoke";
  route(promise: PromiseRecord): string | undefined {
    return promise.tags[this.tag];
  }
}

export class Server {
  readonly version = "2025-01-15";

  private promises: { [key: string]: PromiseRecord } = {};
  private tasks: { [key: string]: TaskRecord } = {};
  private schedules: { [key: string]: ScheduleRecord } = {};
  private subscriptions: { [key: string]: Subscription } = {};
  private pendingMessages: { mesg: Message; recv: string }[] = [];
  private router: Router = new DefaultRouter();
  private targets: { [key: string]: string } = {
    default: "local://any@default",
  };
  constructor(private taskExpiryMs: number = 5000) {}

  getState(): {
    promises: { [key: string]: PromiseRecord };
    tasks: { [key: string]: TaskRecord };
    schedules: { [key: string]: ScheduleRecord };
  } {
    return {
      promises: this.promises,
      tasks: this.tasks,
      schedules: this.schedules,
    };
  }
  step({ at }: { at: number }): { mesg: Message; recv: string }[] {
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const task of Object.values(this.tasks)) {
      if (task.expiry <= at) {
        const promise = this.promises[task.awaited];
        if (task.state === "init") {
          if (task.type === "invoke") {
            messages.push({
              mesg: {
                kind: "invoke",
                head: {},
                data: { task: this.toTask(task) },
              },
              recv: task.recv,
            });
            task.state = "enqueued";
            task.expiry = at + this.taskExpiryMs;
          } else if (task.type === "resume") {
            messages.push({
              mesg: {
                kind: "resume",
                head: {},
                data: { task: this.toTask(task) },
              },
              recv: task.recv,
            });
            task.state = "enqueued";
            task.expiry = at + this.taskExpiryMs;
          } else if (task.type === "notify") {
            messages.push({
              mesg: {
                kind: "notify",
                head: {},
                data: { promise: this.toPromise(promise) },
              },
              recv: task.recv,
            });
            task.state = "completed";
            task.completedAt = at;
          }
        } else if (task.state === "enqueued") {
          if (task.type === "invoke") {
            messages.push({
              mesg: {
                kind: "invoke",
                head: {},
                data: { task: this.toTask(task) },
              },
              recv: task.recv,
            });
            task.expiry = at + this.taskExpiryMs;
          } else if (task.type === "resume") {
            messages.push({
              mesg: {
                kind: "resume",
                head: {},
                data: { task: this.toTask(task) },
              },
              recv: task.recv,
            });
            task.expiry = at + this.taskExpiryMs;
          }
        } else if (task.state === "claimed") {
          task.version += 1;
          task.pid = undefined;
          task.ttl = undefined;
          if (task.type === "invoke") {
            messages.push({
              mesg: {
                kind: "invoke",
                head: {},
                data: { task: this.toTask(task) },
              },
              recv: task.recv,
            });
            task.state = "enqueued";
            task.expiry = at + this.taskExpiryMs;
          } else if (task.type === "resume") {
            messages.push({
              mesg: {
                kind: "resume",
                head: {},
                data: { task: this.toTask(task) },
              },
              recv: task.recv,
            });
            task.state = "enqueued";
            task.expiry = at + this.taskExpiryMs;
          }
        }
      }
    }

    return messages;
  }

  process({ at, req }: { at: number; req: Req }): Res {
    switch (req.kind) {
      case "promise.get": {
        return this.promiseGet({ req });
      }
      case "promise.create": {
        return this.promiseCreate({ at, req });
      }
      case "promise.settle": {
        return this.promiseSettle({ at, req });
      }
      case "promise.register": {
        return this.promiseRegister({ at, req });
      }
      case "promise.subscribe": {
        return this.promiseSubscribe({ at, req });
      }
      case "task.get": {
        return this.taskGet({ req });
      }
      case "task.create": {
        return this.taskCreate({ at, req });
      }
      case "task.acquire": {
        return this.taskAcquire({ at, req });
      }
      case "task.suspend": {
        return this.taskSuspend({ at, req });
      }
      case "task.fulfill": {
        return this.taskFulfill({ at, req });
      }
      case "task.release": {
        return this.taskRelease({ at, req });
      }
      case "task.fence": {
        return this.taskFence({ at, req });
      }
      case "task.heartbeat": {
        return this.taskHeartbeat({ at, req });
      }
    }
    throw new Error(`Unknown request kind: ${(req as Req).kind}`);
  }

  private promiseGet({ req }: { req: PromiseGetReq }): PromiseGetRes {
    const result = this.getPromiseRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { promise: this.toPromise(result.data) },
        };
      }
    }
  }

  private promiseCreate({
    at,
    req,
  }: {
    at: number;
    req: PromiseCreateReq;
  }): PromiseCreateRes {
    const existing = this.promises[req.data.id];
    const hasTimeoutTag = existing?.tags["resonate:timeout"] === "true";
    const timedOut = existing && at >= existing.timeoutAt;

    if (existing) {
      if (existing.state === "pending") {
        if (timedOut) {
          this.settlePromiseRecord(
            existing,
            at,
            hasTimeoutTag ? "resolved" : "rejected_timedout",
          );
        }
      }
      return {
        kind: req.kind,
        head: { corrId: req.head.corrId, status: 200, version: this.version },
        data: { promise: this.toPromise(existing) },
      };
    }

    const promise: PromiseRecord = {
      id: req.data.id,
      state: "pending",
      param: req.data.param,
      value: { headers: {}, data: "" },
      tags: req.data.tags,
      timeoutAt: req.data.timeoutAt,
      createdAt: at,
      callbacks: {},
    };

    const recv = this.router.route(promise);

    const newHasTimeoutTag = req.data.tags["resonate:timeout"] === "true";
    const newTimedOut = at >= req.data.timeoutAt;

    this.promises[req.data.id] = promise;

    if (newTimedOut) {
      promise.state = newHasTimeoutTag ? "resolved" : "rejected_timedout";
      promise.settledAt = at;
    } else if (recv) {
      const targetRecv = this.targets[recv] ?? recv;
      const taskId = this.invokeId(req.data.id);
      this.tasks[taskId] = {
        id: taskId,
        version: 0,
        state: "init",
        type: "invoke",
        recv: targetRecv,
        awaiter: req.data.id,
        awaited: req.data.id,
        timeoutAt: req.data.timeoutAt,
        expiry: at,
        createdAt: at,
      };
    }

    return {
      kind: req.kind,
      head: { corrId: req.head.corrId, status: 200, version: this.version },
      data: { promise: this.toPromise(promise) },
    };
  }

  private promiseSettle({
    at,
    req,
  }: {
    at: number;
    req: PromiseSettleReq;
  }): PromiseSettleRes {
    const result = this.getPromiseRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const promise = result.data;
        if (promise.state === "pending") {
          const hasTimeoutTag = promise.tags["resonate:timeout"] === "true";
          const timedOut = at >= promise.timeoutAt;

          let finalState: PromiseState;
          if (timedOut) {
            finalState = hasTimeoutTag ? "resolved" : "rejected_timedout";
          } else {
            finalState = req.data.state;
          }
          this.settlePromiseRecord(promise, at, finalState, req.data.value);
        }
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { promise: this.toPromise(promise) },
        };
      }
    }
  }

  private promiseRegister({
    at,
    req,
  }: {
    at: number;
    req: PromiseRegisterReq;
  }): PromiseRegisterRes {
    const result = this.getPromiseRecord(req.data.awaited);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const awaited = result.data;
        const awaiterResult = this.getPromiseRecord(req.data.awaiter);
        if (awaiterResult.kind === "value") {
          const awaiter = awaiterResult.data;
          const recv = this.router.route(awaiter);
          if (recv && awaited.state === "pending") {
            const targetRecv = this.targets[recv] ?? recv;
            const callbackId = this.resumeId(
              req.data.awaiter,
              req.data.awaited,
            );
            awaited.callbacks[callbackId] = {
              id: callbackId,
              type: "resume",
              awaited: req.data.awaited,
              awaiter: req.data.awaiter,
              recv: targetRecv,
              timeoutAt: awaiter.timeoutAt,
              createdAt: at,
            };
          }
        }
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { promise: this.toPromise(awaited) },
        };
      }
    }
  }

  private promiseSubscribe({
    at,
    req,
  }: {
    at: number;
    req: PromiseSubscribeReq;
  }): PromiseSubscribeRes {
    const result = this.getPromiseRecord(req.data.awaited);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const promise = result.data;
        const subId = this.notifyId(req.data.awaited, req.data.address);

        if (promise.state !== "pending") {
          this.pendingMessages.push({
            mesg: {
              kind: "notify",
              head: {},
              data: { promise: this.toPromise(promise) },
            },
            recv: req.data.address,
          });
        } else {
          this.subscriptions[subId] = {
            id: subId,
            awaited: req.data.awaited,
            recv: req.data.address,
            createdAt: at,
          };
        }

        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { promise: this.toPromise(promise) },
        };
      }
    }
  }

  private taskGet({ req }: { req: TaskGetReq }): TaskGetRes {
    const result = this.getTaskRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { task: this.toTask(result.data) },
        };
      }
    }
  }

  private taskCreate({
    at,
    req,
  }: {
    at: number;
    req: TaskCreateReq;
  }): TaskCreateRes {
    const taskId = this.invokeId(req.data.action.data.id);
    const existingTask = this.tasks[taskId];

    if (existingTask) {
      const promiseRes = this.promiseCreate({ at, req: req.data.action });
      assert(isStatus(promiseRes, 200));
      assert(typeof promiseRes.data !== "string");
      const promise = promiseRes.data.promise;
      return {
        kind: req.kind,
        head: { corrId: req.head.corrId, status: 200, version: this.version },
        data: { task: undefined, promise },
      };
    }

    const promiseRes = this.promiseCreate({ at, req: req.data.action });
    assert(isStatus(promiseRes, 200));
    assert(typeof promiseRes.data !== "string");
    const promise = promiseRes.data.promise;

    const recv = this.router.route(this.promises[promise.id]);
    if (!recv) {
      return {
        kind: req.kind,
        head: { corrId: req.head.corrId, status: 200, version: this.version },
        data: { task: undefined, promise },
      };
    }

    const task = this.tasks[taskId];
    if (task && task.state === "init") {
      task.state = "claimed";
      task.pid = req.data.pid;
      task.ttl = req.data.ttl;
      task.expiry = at + req.data.ttl;
      return {
        kind: req.kind,
        head: { corrId: req.head.corrId, status: 200, version: this.version },
        data: { task: this.toTask(task), promise },
      };
    }

    return {
      kind: req.kind,
      head: { corrId: req.head.corrId, status: 200, version: this.version },
      data: { task: undefined, promise },
    };
  }

  private taskAcquire({
    at,
    req,
  }: {
    at: number;
    req: TaskAcquireReq;
  }): TaskAcquireRes {
    const result = this.getTaskRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const task = result.data;
        if (task.state !== "enqueued" || task.version !== req.data.version) {
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 409,
              version: this.version,
            },
            data: "task cannot be acquired",
          };
        }
        task.state = "claimed";
        task.pid = req.data.pid;
        task.ttl = req.data.ttl;
        task.expiry = at + this.taskExpiryMs;

        const awaiterPromise = this.promises[task.awaiter];
        assertDefined(awaiterPromise);
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: {
            kind: task.type === "invoke" ? "invoke" : "resume",
            data: { promise: this.toPromise(awaiterPromise), preload: [] },
          },
        };
      }
    }
  }

  private taskSuspend({
    at,
    req,
  }: {
    at: number;
    req: TaskSuspendReq;
  }): TaskSuspendRes {
    const result = this.getTaskRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const task = result.data;
        if (task.state !== "claimed" || task.version !== req.data.version) {
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 409,
              version: this.version,
            },
            data: "task cannot be suspended",
          };
        }

        for (const action of req.data.actions) {
          this.promiseRegister({ at, req: action });
        }

        let anySettled = false;
        for (const action of req.data.actions) {
          const awaitedResult = this.getPromiseRecord(action.data.awaited);
          if (
            awaitedResult.kind === "value" &&
            awaitedResult.data.state !== "pending"
          ) {
            anySettled = true;
            break;
          }
        }

        if (anySettled) {
          task.type = "resume";
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 300,
              version: this.version,
            },
            data: undefined,
          };
        }

        task.state = "completed";
        task.completedAt = at;
        task.pid = undefined;
        task.ttl = undefined;
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: undefined,
        };
      }
    }
  }

  private taskFulfill({
    at,
    req,
  }: {
    at: number;
    req: TaskFulfillReq;
  }): TaskFulfillRes {
    const result = this.getTaskRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const task = result.data;
        if (task.state !== "claimed" || task.version !== req.data.version) {
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 409,
              version: this.version,
            },
            data: "task cannot be fulfilled",
          };
        }

        const settleRes = this.promiseSettle({ at, req: req.data.action });
        assert(isStatus(settleRes, 200) || isStatus(settleRes, 404));
        if (isStatus(settleRes, 404)) {
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 404,
              version: this.version,
            },
            data: "promise not found",
          };
        }
        assert(typeof settleRes.data !== "string");

        task.state = "completed";
        task.completedAt = at;
        task.pid = undefined;
        task.ttl = undefined;
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { promise: settleRes.data.promise },
        };
      }
    }
  }

  private taskRelease({
    at,
    req,
  }: {
    at: number;
    req: TaskReleaseReq;
  }): TaskReleaseRes {
    const result = this.getTaskRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const task = result.data;
        if (task.state !== "claimed" || task.version !== req.data.version) {
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 409,
              version: this.version,
            },
            data: "task cannot be released",
          };
        }

        task.state = "init";
        task.version += 1;
        task.expiry = at;
        task.pid = undefined;
        task.ttl = undefined;
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: undefined,
        };
      }
    }
  }

  private taskFence({
    at,
    req,
  }: {
    at: number;
    req: TaskFenceReq;
  }): TaskFenceRes {
    const result = this.getTaskRecord(req.data.id);
    switch (result.kind) {
      case "error": {
        assert(result.status === 404);
        return {
          kind: req.kind,
          head: {
            corrId: req.head.corrId,
            status: result.status,
            version: this.version,
          },
          data: result.message,
        };
      }
      case "value": {
        const task = result.data;
        if (task.state !== "claimed" || task.version !== req.data.version) {
          return {
            kind: req.kind,
            head: {
              corrId: req.head.corrId,
              status: 409,
              version: this.version,
            },
            data: "task fence failed",
          };
        }

        let actionRes: PromiseCreateRes | PromiseSettleRes;
        if (req.data.action.kind === "promise.create") {
          actionRes = this.promiseCreate({ at, req: req.data.action });
        } else {
          actionRes = this.promiseSettle({ at, req: req.data.action });
        }
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status: 200, version: this.version },
          data: { action: actionRes },
        };
      }
    }
  }

  private taskHeartbeat({
    at,
    req,
  }: {
    at: number;
    req: TaskHeartbeatReq;
  }): TaskHeartbeatRes {
    let status: number | 200 = 200;
    let message: string | undefined;
    for (const taskRef of req.data.tasks) {
      const result = this.getTaskRecord(taskRef.id);
      switch (result.kind) {
        case "value": {
          const task = result.data;
          if (
            task.state === "claimed" &&
            task.version === taskRef.version &&
            task.ttl !== undefined
          ) {
            task.expiry = at + task.ttl;
            this.tasks[task.id] = task;
          }
          break;
        }
        case "error": {
          status = result.status;
          message = result.message;
          break;
        }
      }
    }
    switch (status) {
      case 200: {
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status, version: this.version },
          data: undefined,
        };
      }
      default: {
        assertDefined(message);
        assert(status === 404);
        return {
          kind: req.kind,
          head: { corrId: req.head.corrId, status, version: this.version },
          data: message,
        };
      }
    }
  }

  private settlePromiseRecord(
    promise: PromiseRecord,
    at: number,
    state: PromiseState,
    value?: { headers: { [key: string]: string }; data: string },
  ): void {
    promise.state = state;
    promise.settledAt = at;
    if (value) {
      promise.value = value;
    }

    for (const callback of Object.values(promise.callbacks)) {
      if (callback.type === "resume") {
        const invokeTaskId = this.invokeId(callback.awaiter);
        const existingInvokeTask = this.tasks[invokeTaskId];
        const resumeTaskId = this.resumeId(callback.awaiter, callback.awaited);
        const existingResumeTask = this.tasks[resumeTaskId];

        // Check if there's already an active resume task for this awaiter
        let hasActiveResumeTask = false;
        for (const t of Object.values(this.tasks)) {
          if (
            t.id.startsWith("__resume:" + callback.awaiter + ":") &&
            t.state !== "completed"
          ) {
            hasActiveResumeTask = true;
            break;
          }
        }

        if (!hasActiveResumeTask) {
          if (existingInvokeTask && existingInvokeTask.state === "completed") {
            // Create a new resume task with incremented version from completed invoke task
            if (!existingResumeTask) {
              this.tasks[resumeTaskId] = {
                id: resumeTaskId,
                version: 0,
                state: "init",
                type: "resume",
                recv: callback.recv,
                awaiter: callback.awaiter,
                awaited: callback.awaited,
                timeoutAt: callback.timeoutAt,
                expiry: at,
                createdAt: at,
              };
            }
          } else if (
            !existingInvokeTask ||
            existingInvokeTask.type !== "resume"
          ) {
            if (!existingResumeTask) {
              this.tasks[resumeTaskId] = {
                id: resumeTaskId,
                version: 0,
                state: "init",
                type: "resume",
                recv: callback.recv,
                awaiter: callback.awaiter,
                awaited: callback.awaited,
                timeoutAt: callback.timeoutAt,
                expiry: at,
                createdAt: at,
              };
            }
          }
        }
      }
    }
    promise.callbacks = {};

    for (const sub of Object.values(this.subscriptions)) {
      if (sub.awaited === promise.id) {
        const taskId = this.notifyId(promise.id, sub.recv);
        this.tasks[taskId] = {
          id: taskId,
          version: 0,
          state: "init",
          type: "notify",
          recv: sub.recv,
          awaiter: promise.id,
          awaited: promise.id,
          timeoutAt: promise.timeoutAt,
          expiry: at,
          createdAt: at,
        };
        delete this.subscriptions[sub.id];
      }
    }
  }

  private invokeId(promiseId: string): string {
    return `__invoke:${promiseId}`;
  }

  private resumeId(awaiterId: string, awaitedId: string): string {
    return `__resume:${awaiterId}:${awaitedId}`;
  }

  private notifyId(awaitedId: string, address: string): string {
    return `__notify:${awaitedId}:${address}`;
  }
  private getPromiseRecord(id: string): Result<PromiseRecord> {
    const promise = this.promises[id];
    if (!promise) {
      return { kind: "error", status: 404, message: "promise not found" };
    }
    return { kind: "value", data: promise };
  }

  private getTaskRecord(id: string): Result<TaskRecord> {
    const task = this.tasks[id];

    if (task) {
      // If the task exists and is not completed, return it directly
      if (task.state !== "completed") {
        return { kind: "value", data: task };
      }

      // If it's an invoke task and is completed, look for an active resume task
      if (id.startsWith("__invoke:")) {
        const awaiterId = id.replace("__invoke:", "");
        for (const t of Object.values(this.tasks)) {
          if (
            t.id.startsWith("__resume:" + awaiterId + ":") &&
            t.state !== "completed"
          ) {
            return { kind: "value", data: t };
          }
        }
      }

      // Return the completed task if no active resume found
      return { kind: "value", data: task };
    }

    return { kind: "error", status: 404, message: "task not found" };
  }

  private getScheduleRecord(id: string): Result<ScheduleRecord> {
    const schedule = this.schedules[id];
    if (!schedule) {
      return { kind: "error", status: 404, message: "schedule not found" };
    }
    return { kind: "value", data: schedule };
  }

  private toPromise(record: PromiseRecord): Promise {
    return {
      id: record.id,
      state: record.state,
      param: record.param,
      value: record.value,
      tags: record.tags,
      timeoutAt: record.timeoutAt,
      createdAt: record.createdAt,
      settledAt: record.settledAt,
    };
  }

  private toTask(record: TaskRecord): Task {
    return {
      id: record.id,
      version: record.version,
    };
  }

  private toSchedule(record: ScheduleRecord): Schedule {
    return {
      id: record.id,
      cron: record.cron,
      promiseId: record.promiseId,
      promiseTimeout: record.promiseTimeout,
      promiseParam: record.promiseParam,
      promiseTags: record.promiseTags,
      createdAt: record.createdAt,
      nextRunAt: record.nextRunAt,
      lastRunAt: record.lastRunAt,
    };
  }
}
