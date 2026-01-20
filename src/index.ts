import type {
  ErrorRes,
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
} from "./protocol";

function assert(cond: boolean, msg?: string): asserts cond {
  if (cond) return; // Early return if assertion passes

  console.assert(cond, "Assertion Failed: %s", msg);
  console.trace();

  if (typeof process !== "undefined" && process.versions.node) {
    process.exit(1);
  }
}

function assertDefined<T>(val: T | undefined | null): asserts val is T {
  assert(val !== null && val !== undefined, "value must not be null");
}

class ServerError extends Error {
  readonly code: 400 | 404 | 429 | 500;
  constructor(code: 400 | 404 | 429 | 500, message: string) {
    super(message);
    this.code = code;
  }
}

type CallbackRecord = {
  id: string;
  type: "resume" | "notify";
  awaited: string;
  awaiter: string;
  recv: string;
  timeoutAt: number;
  createdAt: number;
};

type PromiseRecord = {
  id: string;
  state:
    | "pending"
    | "resolved"
    | "rejected"
    | "rejected_canceled"
    | "rejected_timedout";
  param?: { headers: Record<string, string>; data: string };
  value?: { headers: Record<string, string>; data: string };
  tags?: Record<string, string>;
  timeoutAt: number;
  createdAt: number;
  settledAt?: number;
  callbacks: Record<string, CallbackRecord>;
};

type TaskRecord = {
  id: string;
  version: number;
  state: "init" | "enqueued" | "claimed" | "completed";
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

type ScheduleRecord = {
  id: string;
  cron: string;
  promiseId: string;
  promiseTimeout: number;
  promiseParam?: { headers: Record<string, string>; data: string };
  promiseTags?: Record<string, string>;
  createdAt: number;
  nextRunAt: number;
  lastRunAt?: number;
};

interface Router {
  route(promise: PromiseRecord): string | undefined;
}

class DefaultRouter {
  private tag: "resonate:invoke" = "resonate:invoke";
  route(promise: PromiseRecord): string | undefined {
    if (promise.tags === undefined) {
      return undefined;
    }
    return promise.tags[this.tag];
  }
}

type Req =
  | PromiseCreateReq
  | PromiseGetReq
  | PromiseRegisterReq
  | PromiseSettleReq
  | PromiseSubscribeReq
  | TaskAcquireReq
  | TaskCreateReq
  | TaskFenceReq
  | TaskFulfillReq
  | TaskGetReq
  | TaskHeartbeatReq
  | TaskReleaseReq
  | TaskSuspendReq;

type Res =
  | ErrorRes
  | PromiseCreateRes
  | PromiseGetRes
  | PromiseRegisterRes
  | PromiseSettleRes
  | PromiseSubscribeRes
  | TaskAcquireRes
  | TaskCreateRes
  | TaskFenceRes
  | TaskFulfillRes
  | TaskGetRes
  | TaskHeartbeatRes
  | TaskReleaseRes
  | TaskSuspendRes;

export class Server {
  private promises: Record<string, PromiseRecord> = {};
  private tasks: Record<string, TaskRecord> = {};
  private schedules: Record<string, ScheduleRecord> = {};
  private router: Router = new DefaultRouter();
  private targets: Record<string, string> = { default: "local://any@default" };

  private x: number;
  constructor(x: number = 5000) {
    this.x = x;
  }
  process({ at, req }: { at: number; req: Req }): Res {
    switch (req.kind) {
      case "promise.create": {
        return this.promiseCreate({ at, req });
      }
      case "promise.get": {
        return this.promiseGet({ req });
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
  }

  private taskHeartbeat({
    at,
    req,
  }: {
    at: number;
    req: TaskHeartbeatReq;
  }): TaskHeartbeatRes {
    throw new ServerError(500, "not implemented");
  }
  private taskFence({
    at,
    req,
  }: {
    at: number;
    req: TaskFenceReq;
  }): TaskFenceRes {
    throw new ServerError(500, "not implemented");
  }
  private taskRelease({
    at,
    req,
  }: {
    at: number;
    req: TaskReleaseReq;
  }): TaskReleaseRes {
    throw new ServerError(500, "not implemented");
  }
  private taskFulfill({
    at,
    req,
  }: {
    at: number;
    req: TaskFulfillReq;
  }): TaskFulfillRes {
    throw new ServerError(500, "not implemented");
  }
  private taskSuspend({
    at,
    req,
  }: {
    at: number;
    req: TaskSuspendReq;
  }): TaskSuspendRes {
    throw new ServerError(500, "not implemented");
  }

  private taskAcquire({
    at,
    req,
  }: {
    at: number;
    req: TaskAcquireReq;
  }): TaskAcquireRes {
    const { record, applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "claimed",
      version: req.data.version,
      pid: req.data.pid,
      ttl: req.data.ttl,
    });
    assert(applied);

    switch (record.type) {
      case "invoke": {
        return {
          kind: "task.acquire",
          head: { status: 200 },
          data: {
            kind: "invoke",
            data: { invoked: this.getPromiseRecord(record.awaiter) },
          },
        };
      }
      case "resume": {
        return {
          kind: "task.acquire",
          head: { status: 200 },
          data: {
            kind: "resume",
            data: {
              invoked: this.getPromiseRecord(record.awaiter),
              awaited: this.getPromiseRecord(record.awaited),
            },
          },
        };
      }
      case "notify": {
        assert(false, "unreacheable codepath");
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
    const { promiseRecord, taskRecord } = this.promiseCreateAndTask({
      at,
      id: req.data.action.data.id,
      timeoutAt: req.data.action.data.timeoutAt,
      payload: req.data.action.data.param,
      tags: req.data.action.data.tags,
      pid: req.data.pid,
      ttl: req.data.ttl,
    });
    return {
      kind: "task.create",
      head: { status: 200 },
      data: { promise: promiseRecord, task: taskRecord },
    };
  }

  private taskGet({ req }: { req: TaskGetReq }): TaskGetRes | ErrorRes {
    const record: TaskRecord | undefined = this.tasks[req.data.id];
    if (!record) {
      return {
        kind: "error",
        head: { corrId: req.head.corrId, status: 404 },
        data: "Task not found",
      };
    }
    return { kind: "task.get", head: { status: 200 }, data: { task: record } };
  }
  private promiseSubscribe({
    at,
    req,
  }: {
    at: number;
    req: PromiseSubscribeReq;
  }): PromiseSubscribeRes {
    const record: PromiseRecord | undefined = this.getPromiseRecord(
      req.data.id,
    );

    const id = `__notify:${req.data.id}:${req.data.address}`;

    if (record.state === "pending" || record.callbacks[id] !== undefined) {
      return {
        kind: "promise.subscribe",
        head: { status: 200 },
        data: { promise: record },
      };
    }

    const recv = this.router.route(record);
    assertDefined(recv);

    const callback: CallbackRecord = {
      id,
      type: "notify",
      awaited: req.data.id,
      awaiter: req.data.id,
      recv,
      timeoutAt: record.timeoutAt,
      createdAt: at,
    };

    record.callbacks[id] = callback;
    return {
      kind: "promise.subscribe",
      head: { status: 200 },
      data: { promise: record },
    };
  }

  private promiseRegister({
    at,
    req,
  }: {
    at: number;
    req: PromiseRegisterReq;
  }): PromiseRegisterRes {
    const record = this.getPromiseRecord(req.data.awaited);

    if (
      record.state !== "pending" ||
      record.callbacks[req.data.awaited] === undefined
    ) {
      return {
        kind: "promise.register",
        head: { status: 200 },
        data: { promise: record },
      };
    }

    const recv = this.router.route(record);
    assertDefined(recv);
    const callback: CallbackRecord = {
      id: `__resume:${req.data.awaiter}:${req.data.awaited}`,
      type: "resume",
      awaited: req.data.awaited,
      awaiter: req.data.awaiter,
      recv,
      timeoutAt: record.timeoutAt,
      createdAt: at,
    };

    record.callbacks[callback.id] = callback;
    return {
      kind: "promise.register",
      head: { status: 200 },
      data: { promise: record },
    };
  }
  private promiseSettle({
    at,
    req,
  }: {
    at: number;
    req: PromiseSettleReq;
  }): PromiseSettleRes {
    const { promiseRecord, applied } = this.transitionPromiseAndTask({
      at,
      id: req.data.id,
      to: req.data.state,
      payload: req.data.value,
    });
    assert(
      !applied ||
        promiseRecord.state === "rejected_timedout" ||
        promiseRecord.state === req.data.state,
    );
    return {
      kind: "promise.settle",
      head: { status: 200 },
      data: { promise: promiseRecord },
    };
  }
  private promiseGet({ req }: { req: PromiseGetReq }): PromiseGetRes {
    return {
      kind: "promise.get",
      head: { status: 200 },
      data: { promise: this.getPromiseRecord(req.data.id) },
    };
  }

  private promiseCreate({
    at,
    req,
  }: {
    at: number;
    req: PromiseCreateReq;
  }): PromiseCreateRes {
    return {
      kind: "promise.create",
      head: { status: 200 },
      data: {
        promise: this.promiseCreateAndTask({
          at,
          id: req.data.id,
          timeoutAt: req.data.timeoutAt,
          payload: req.data.param,
          tags: req.data.tags,
        }).promiseRecord,
      },
    };
  }
  private promiseCreateAndTask({
    at,
    id,
    timeoutAt,
    payload,
    tags,
    pid,
    ttl,
  }: {
    at: number;
    id: string;
    timeoutAt: number;
    payload?: {
      headers: Record<string, string>;
      data: string;
    };
    tags?: Record<string, string>;
    pid?: string;
    ttl?: number;
  }): { promiseRecord: PromiseRecord; taskRecord?: TaskRecord } {
    const { promiseRecord, taskRecord, applied } =
      this.transitionPromiseAndTask({
        at,
        id,
        to: "pending",
        timeoutAt,
        payload,
        tags,
      });

    assert(
      !applied ||
        promiseRecord.state === "pending" ||
        promiseRecord.state === "rejected_timedout",
    );

    if (applied && taskRecord !== undefined && pid !== undefined) {
      const { record, applied } = this.transitionTask({
        at,
        id: taskRecord.id,
        to: "claimed",
        version: 1,
        pid,
        ttl,
      });

      assert(applied);
      return { promiseRecord, taskRecord: record };
    }

    return { promiseRecord, taskRecord };
  }

  private transitionPromiseAndTask({
    at,
    id,
    to,
    timeoutAt,
    payload,
    tags,
  }: {
    at: number;
    id: string;
    to:
      | "pending"
      | "resolved"
      | "rejected"
      | "rejected_canceled"
      | "rejected_timedout";
    timeoutAt?: number;
    payload?: { headers: Record<string, string>; data: string };
    tags?: Record<string, string>;
  }): {
    promiseRecord: PromiseRecord;
    taskRecord?: TaskRecord;
    applied: boolean;
  } {
    const { record: promiseRecord, applied } = this.transitionPromise({
      at,
      id,
      to,
      timeoutAt,
      payload,
      tags,
    });

    if (applied && promiseRecord.state === "pending") {
      const recv = this.router.route(promiseRecord);
      if (recv !== undefined) {
        const { record: taskRecord, applied } = this.transitionTask({
          at,
          id: `__invoke:${id}`,
          to: "init",
          recv: this.targets[recv] ?? recv,
          awaiter: promiseRecord.id,
          awaited: promiseRecord.id,
          timeoutAt: promiseRecord.timeoutAt,
        });
        assert(applied);
        return { promiseRecord, taskRecord, applied };
      }
    }

    if (applied && promiseRecord.state !== "pending") {
      for (const task of Object.values(this.tasks)) {
        if (task.awaiter === id && task.state !== "completed") {
          const { applied } = this.transitionTask({
            at,
            id: task.id,
            to: "completed",
            force: true,
          });
          assert(applied);
        }
      }

      for (const callback of Object.values(promiseRecord.callbacks)) {
        const { applied } = this.transitionTask({
          ...callback,
          to: "init",
          awaited: callback.awaited,
          at,
        });
        assert(applied);
      }
    }

    return { promiseRecord, applied };
  }

  private transitionPromise({
    at,
    id,
    to,
    timeoutAt,
    payload,
    tags,
  }: {
    at: number;
    id: string;
    to:
      | "pending"
      | "resolved"
      | "rejected"
      | "rejected_canceled"
      | "rejected_timedout";
    timeoutAt?: number;
    payload?: { headers: Record<string, string>; data: string };
    tags?: Record<string, string>;
  }): { record: PromiseRecord; applied: boolean } {
    let record: PromiseRecord | undefined = this.promises[id];

    if (record === undefined && to === "pending") {
      assertDefined(timeoutAt);
      record = {
        id,
        state: to,
        timeoutAt,
        param: payload,
        tags,
        createdAt: at,
        callbacks: {},
      };
      this.promises[id] = record;
      return { record, applied: true };
    }

    if (
      record === undefined &&
      (to === "resolved" || to === "rejected" || to === "rejected_canceled")
    ) {
      throw new ServerError(404, `Promise '${id}' not found`);
    }

    if (
      record.state === "pending" &&
      to === "pending" &&
      at < record.timeoutAt
    ) {
      return { record, applied: false };
    }

    if (
      record.state === "pending" &&
      to === "pending" &&
      at >= record.timeoutAt
    ) {
      return this.transitionPromise({ at, id, to: "rejected_timedout" });
    }

    if (
      record.state === "pending" &&
      (to === "resolved" || to === "rejected" || to === "rejected_canceled") &&
      at < record.timeoutAt
    ) {
      record = { ...record, state: to, value: payload, settledAt: at };
      this.promises[id] = record;
      return { record, applied: true };
    }

    if (
      record.state === "pending" &&
      (to === "resolved" || to === "rejected" || to === "rejected_canceled") &&
      at >= record.timeoutAt
    ) {
      return this.transitionPromise({ at, id, to: "rejected_timedout" });
    }

    if (record.state === "pending" && to === "rejected_timedout") {
      assert(at >= record.timeoutAt);
      record = {
        ...record,
        state: record.tags?.["resonate:timeout"] === "true" ? "resolved" : to,
      };
      this.promises[id] = record;
      return { record, applied: true };
    }

    if (record.state !== "pending" && to === "pending") {
      return { record, applied: false };
    }

    if (
      (record.state === "resolved" ||
        record.state === "rejected" ||
        record.state === "rejected_canceled") &&
      (to === "resolved" || to === "rejected" || to === "rejected_canceled")
    ) {
      return { record, applied: false };
    }

    if (
      record.state === "rejected_timedout" &&
      (to === "resolved" || to === "rejected" || to === "rejected_canceled")
    ) {
      return { record, applied: false };
    }

    throw new ServerError(
      500,
      `Unexpected promise transition ${record.state} -> ${to}`,
    );
  }

  private transitionTask({
    at,
    id,
    to,
    recv,
    awaiter,
    awaited,
    timeoutAt,
    version,
    pid,
    ttl,
    force,
  }: {
    at: number;
    id: string;
    to: "init" | "enqueued" | "claimed" | "completed";
    recv?: string;
    awaiter?: string;
    awaited?: string;
    timeoutAt?: number;
    version?: number;
    pid?: string;
    ttl?: number;
    force?: boolean;
  }): { record: TaskRecord; applied: boolean } {
    let record: TaskRecord | undefined = this.tasks[id];

    if (record !== undefined && to === "init") {
      assertDefined(recv);
      assert(id.startsWith("__invoke"));
      assertDefined(awaiter);
      assertDefined(awaited);
      assertDefined(timeoutAt);
      record = {
        id,
        version: 1,
        timeoutAt,
        state: to,
        type: "invoke",
        recv,
        awaiter,
        awaited,
        expiry: 0,
        createdAt: at,
      };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (record.state === "init" && to === "enqueued") {
      record = { ...record, state: to, expiry: at + this.x };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (
      (record.state === "init" || record.state === "enqueued") &&
      to === "claimed" &&
      record.version === version
    ) {
      assertDefined(pid);
      assertDefined(ttl);
      record = { ...record, state: to, pid, ttl, expiry: at + ttl };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (
      (record.state === "init" || record.state === "enqueued") &&
      record.type === "notify" &&
      to === "completed"
    ) {
      record = { ...record, state: to, completedAt: at };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (
      (record.state === "enqueued" || record.state === "claimed") &&
      to === "init"
    ) {
      record = {
        ...record,
        version: record.version + 1,
        state: to,
        pid: undefined,
        ttl: undefined,
        expiry: 0,
      };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (record.state === "claimed" && to === "claimed" && force) {
      assertDefined(record.ttl);

      record = { ...record, expiry: at + record.ttl };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (
      record.state === "claimed" &&
      to === "completed" &&
      record.version === version &&
      record.expiry >= at
    ) {
      record = { ...record, state: to, completedAt: at };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (
      (record.state === "init" ||
        record.state === "enqueued" ||
        record.state === "claimed") &&
      to === "completed" &&
      force
    ) {
      record = { ...record, state: to, completedAt: at };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (record.state === "completed" && to === "completed") {
      return { record, applied: false };
    }

    if (record === undefined) {
      throw new ServerError(404, `Task '${id}' not found`);
    }

    throw new ServerError(
      500,
      `Unexpected task transition ${record.state} -> ${to}`,
    );
  }
}
