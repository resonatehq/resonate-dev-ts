import type {
  ErrorCode,
  ErrorRes,
  Message,
  Promise,
  PromiseCreateReq,
  PromiseCreateRes,
  PromiseGetReq,
  PromiseGetRes,
  PromiseRegisterReq,
  PromiseRegisterRes,
  PromiseSettleReq,
  PromiseSettleRes,
  PromiseState,
  PromiseSubscribeReq,
  PromiseSubscribeRes,
  Req,
  Res,
  Schedule,
  Task,
  TaskAcquireReq,
  TaskAcquireRes,
  TaskCreateReq,
  TaskCreateRes,
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

export function assert(cond: boolean, msg?: string): asserts cond {
  if (cond) return; // Early return if assertion passes

  console.assert(cond, "Assertion Failed: %s", msg);
  console.trace();

  if (typeof process !== "undefined" && process.versions.node) {
    process.exit(1);
  }
}

export function assertDefined<T>(val: T | undefined | null): asserts val is T {
  assert(val !== null && val !== undefined, "value must not be null");
}

class ServerError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

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

export class Server {
  private version = "2025-01-15";
  private promises: { [key: string]: PromiseRecord } = {};
  private tasks: { [key: string]: TaskRecord } = {};
  private schedules: { [key: string]: ScheduleRecord } = {};
  private routers: Router[] = [new DefaultRouter()];
  private targets: { [key: string]: string } = {
    default: "local://any@default",
  };

  private x: number;
  constructor(x: number = 5000) {
    this.x = x;
  }

  next({ time }: { time: number }): number | undefined {
    let timeout: number | undefined;

    for (const promiseRecord of Object.values(this.promises)) {
      if (promiseRecord.state === "pending") {
        timeout = Math.min(
          promiseRecord.timeoutAt,
          timeout ?? promiseRecord.timeoutAt,
        );
      }
    }

    for (const taskRecord of Object.values(this.tasks)) {
      if (isNotCompleted(taskRecord.state)) {
        timeout = Math.min(taskRecord.expiry, timeout ?? taskRecord.expiry);
      }
    }

    return timeout !== undefined
      ? Math.min(Math.max(0, timeout - time), 2147483647)
      : timeout;
  }

  step({ at }: { at: number }): { mesg: Message; recv: string }[] {
    for (const promiseRecord of Object.values(this.promises)) {
      if (promiseRecord.state === "pending" && at >= promiseRecord.timeoutAt) {
        const { applied } = this.transitionPromise({
          at,
          id: promiseRecord.id,
          to: "rejected_timedout",
        });
        assert(applied);
      }
    }

    for (const taskRecord of Object.values(this.tasks)) {
      if (isActiveState(taskRecord.state)) {
        assertDefined(taskRecord.expiry);

        if (at >= taskRecord.expiry) {
          const { applied } = this.transitionTask({
            at,
            id: taskRecord.id,
            to: "init",
            force: true,
          });
          assert(applied);
        }
      }
    }

    const inFlightAwaiters = new Set<string>();

    for (const taskRecord of Object.values(this.tasks)) {
      if (isActiveState(taskRecord.state)) {
        inFlightAwaiters.add(taskRecord.awaiter);
      }
    }

    const mesgs: { mesg: Message; recv: string }[] = [];
    for (const taskRecord of Object.values(this.tasks)) {
      if (
        taskRecord.state !== "init" ||
        taskRecord.expiry > at ||
        inFlightAwaiters.has(taskRecord.awaiter)
      ) {
        continue;
      }

      let mesg: { mesg: Message; recv: string };
      switch (taskRecord.type) {
        case "notify": {
          mesg = {
            mesg: {
              kind: taskRecord.type,
              head: {},
              data: { promise: this.getPromiseRecord(taskRecord.awaiter) },
            },
            recv: taskRecord.recv,
          };
          const { applied } = this.transitionTask({
            at,
            id: taskRecord.id,
            to: "completed",
          });
          assert(applied);
          break;
        }

        default: {
          mesg = {
            mesg: {
              kind: taskRecord.type,
              head: {},
              data: {
                task: taskRecord,
              },
            },
            recv: taskRecord.recv,
          };
          const { applied } = this.transitionTask({
            at,
            id: taskRecord.id,
            to: "enqueued",
          });
          assert(applied);
          break;
        }
      }

      mesgs.push(mesg);
      inFlightAwaiters.add(taskRecord.awaiter);
    }
    return mesgs;
  }
  process({ at, req }: { at: number; req: Req }): Res {
    this.ensureVersion(req);

    try {
      switch (req.kind) {
        case "promise.create": {
          return this.promiseCreate({ at, req });
        }
        case "promise.get": {
          return this.promiseGet({ req });
        }
        case "promise.register": {
          return this.promiseRegister({ at, req });
        }
        case "promise.settle": {
          return this.promiseSettle({ at, req });
        }
        case "promise.subscribe": {
          return this.promiseSubscribe({ at, req });
        }
        case "schedule.create": {
          throw new ServerError(500, "not implemented");
        }
        case "schedule.delete": {
          throw new ServerError(500, "not implemented");
        }
        case "schedule.get": {
          throw new ServerError(500, "not implemented");
        }
        case "task.acquire": {
          return this.taskAcquire({ at, req });
        }
        case "task.create": {
          return this.taskCreate({ at, req });
        }
        case "task.fence": {
          throw new ServerError(500, "not implemented");
        }
        case "task.fulfill": {
          return this.taskFulFill({ at, req });
        }
        case "task.get": {
          return this.taskGet({ req });
        }
        case "task.heartbeat": {
          return this.taskHeartbeat({ at, req });
        }
        case "task.release": {
          return this.taskRelease({ at, req });
        }
        case "task.suspend": {
          return this.taskSuspend({ at, req });
        }
      }
    } catch (err) {
      if (err instanceof ServerError) {
        return this.buildErrorRes(req, err);
      }
      throw err;
    }
  }

  private promiseCreate({
    at,
    req,
  }: {
    at: number;
    req: PromiseCreateReq;
  }): PromiseCreateRes {

    const { promiseRecord, taskRecord } = this.promiseAndTaskCreate({
      at,
      id: req.data.id,
      timeoutAt: req.data.timeoutAt,
      payload: req.data.param,
      tags: req.data.tags,
    });

    assert(taskRecord === undefined || taskRecord.state !== "claimed");

    return this.buildOkRes(req, 200, { promise: promiseRecord });
  }
  private promiseGet({ req }: { req: PromiseGetReq }): PromiseGetRes {
    const record = this.getPromiseRecord(req.data.id);
    return this.buildOkRes(req, 200, { promise: record });
  }
  private promiseRegister({
    at,
    req,
  }: {
    at: number;
    req: PromiseRegisterReq;
  }): PromiseRegisterRes {
    const { record } = this.promiseTryToRegister({
      at,
      awaited: req.data.awaited,
      awaiter: req.data.awaiter,
    });
    return this.buildOkRes(req, 200, { promise: record });
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
    return this.buildOkRes(req, 200, { promise: promiseRecord });
  }
  private promiseSubscribe({
    at,
    req,
  }: {
    at: number;
    req: PromiseSubscribeReq;
  }): PromiseSubscribeRes {
    const record = this.getPromiseRecord(req.data.awaited);
    const callbackId = `__resume:${req.data.address}:${req.data.awaited}`;

    if (
      record.state !== "pending" ||
      record.callbacks[req.data.awaited] !== undefined
    ) {
      return this.buildOkRes(req, 200, { promise: record });
    }

    const recv = this.getFirstRouterMatch(record);
    assertDefined(recv);
    record.callbacks[callbackId] = {
      id: callbackId,
      type: "notify",
      awaited: req.data.awaited,
      awaiter: req.data.address,
      recv,
      timeoutAt: record.timeoutAt,
      createdAt: at,
    };
    return this.buildOkRes(req, 200, { promise: record });
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
        return this.buildOkRes(req, 200, {
          kind: "invoke",
          data: { invoked: this.getPromiseRecord(record.awaiter) },
        });
      }
      case "resume": {
        return this.buildOkRes(req, 200, {
          kind: "resume",
          data: {
            invoked: this.getPromiseRecord(record.awaiter),
            awaited: this.getPromiseRecord(record.awaited),
          },
        });
      }
      case "notify": {
        throw new ServerError(500, "unexpected task type");
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
    const { promiseRecord, taskRecord } = this.promiseAndTaskCreate({
      at,
      id: req.data.action.data.id,
      timeoutAt: req.data.action.data.timeoutAt,
      payload: req.data.action.data.param,
      tags: req.data.action.data.tags,
      ttl: req.data.ttl,
      pid: req.data.pid,
    });

    return this.buildOkRes(req, 200, {
      promise: promiseRecord,
      task: taskRecord,
    });
  }
  private taskFulFill({
    at,
    req,
  }: {
    at: number;
    req: TaskFulfillReq;
  }): TaskFulfillRes {
    const res = this.promiseSettle({ at, req: req.data.action });
    const { applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "completed",
      version: req.data.version,
    });
    assert(applied);

    return this.buildOkRes(req, 200, res.data);
  }
  private taskGet({ req }: { req: TaskGetReq }): TaskGetRes {
    const record = this.getTaskRecord(req.data.id);
    return this.buildOkRes(req, 200, { task: record });
  }
  private taskHeartbeat({
    at,
    req,
  }: {
    at: number;
    req: TaskHeartbeatReq;
  }): TaskHeartbeatRes {
    for (const taskRecord of Object.values(this.tasks)) {
      if (taskRecord.state !== "claimed" || taskRecord.pid !== req.data.pid) {
        continue;
      }

      const { applied } = this.transitionTask({
        at,
        id: taskRecord.id,
        to: "claimed",
        force: true,
      });
      assert(applied);
    }

    return this.buildOkRes(req, 200, undefined);
  }

  private taskRelease({
    at,
    req,
  }: {
    at: number;
    req: TaskReleaseReq;
  }): TaskReleaseRes {
    const { applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "init",
      version: req.data.version,
    });
    assert(applied);
    return this.buildOkRes(req, 200, undefined);
  }

  private taskSuspend({
    at,
    req,
  }: {
    at: number;
    req: TaskSuspendReq;
  }): TaskSuspendRes {
    let status: 200 | 300 = 200;
    for (const action of req.data.actions) {
      const { applied } = this.promiseTryToRegister({
        at,
        awaited: action.data.awaited,
        awaiter: action.data.awaiter,
      });
      if (!applied) {
        status = 300;
      }
    }
    const { applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "completed",
      version: req.data.version,
    });
    assert(applied);
    return this.buildOkRes(req, status, undefined);
  }




  private promiseTryToRegister({
    at,
    awaiter,
    awaited,
  }: {
    at: number;
    awaiter: string;
    awaited: string;
  }): { record: PromiseRecord; applied: boolean } {
    const record = this.getPromiseRecord(awaited);

    if (record.state !== "pending" || record.callbacks[awaited] !== undefined) {
      return { record, applied: false };
    }
    const callbackId = `__resume:${awaiter}:${awaited}`;

    const recv = this.getFirstRouterMatch(record);
    assertDefined(recv);
    record.callbacks[callbackId] = {
      id: callbackId,
      type: "resume",
      awaited: awaited,
      awaiter: awaiter,
      recv,
      timeoutAt: record.timeoutAt,
      createdAt: at,
    };

    return { record, applied: true };
  }

  private promiseAndTaskCreate({
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
    payload: {
      headers: {
        [key: string]: string;
      };
      data: string;
    };
    tags: {
      [key: string]: string;
    };
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

    if (
      applied &&
      taskRecord !== undefined &&
      pid !== undefined &&
      ttl !== undefined
    ) {
      const { record: newTaskRecord, applied } = this.transitionTask({
        at,
        id: taskRecord.id,
        to: "claimed",
        version: 1,
        pid,
        ttl,
      });
      assert(applied);
      return { promiseRecord, taskRecord: newTaskRecord };
    }

    return { promiseRecord, taskRecord };
  }

  private buildOkRes<K extends string, S extends number, D>(
    req: {
      kind: K;
      head: {
        auth?: string;
        corrId: string;
        version: string;
      };
    },
    status: S,
    data: D,
  ): {
    kind: K;
    head: {
      corrId: string;
      status: S;
      version: string;
    };
    data: D;
  } {
    return {
      kind: req.kind,
      head: {
        corrId: req.head.corrId,
        status,
        version: this.version,
      },
      data,
    };
  }

  private buildErrorRes(req: Req, err: ServerError): ErrorRes {
    return {
      kind: "error",
      head: {
        corrId: req.head.corrId,
        status: err.code,
        version: this.version,
      },
      data: err.message,
    };
  }
  private ensureVersion(req: Req) {
    if (req.head.version !== this.version) {
      throw new ServerError(409, "version mismatch");
    }
  }

  private getPromiseRecord(id: string): PromiseRecord {
    const record: PromiseRecord | undefined = this.promises[id];
    if (!record) {
      throw new ServerError(404, "promise not found");
    }
    return record;
  }
  private getTaskRecord(id: string): TaskRecord {
    const record: TaskRecord | undefined = this.tasks[id];
    if (!record) {
      throw new ServerError(404, "task not found");
    }
    return record;
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
    to: PromiseState;
    timeoutAt?: number;
    payload?: { headers: { [key: string]: string }; data: string };
    tags?: { [key: string]: string };
  }): {
    promiseRecord: PromiseRecord;
    taskRecord?: TaskRecord;
    applied: boolean;
  } {
    let taskRecord: TaskRecord | undefined;
    const { record: promiseRecord, applied } = this.transitionPromise({
      at,
      id,
      to,
      timeoutAt,
      payload,
      tags,
    });

    if (applied && promiseRecord.state === "pending") {
      const recv = this.getFirstRouterMatch(promiseRecord);
      if (recv !== undefined) {
        const { record: taskRecord, applied } = this.transitionTask({
          at,
          id: `__invoke:${id}`,
          to: "init",
          type: "invoke",
          recv: this.targets[recv] ?? recv,
          awaited: promiseRecord.id,
          awaiter: promiseRecord.id,
          timeoutAt: promiseRecord.timeoutAt,
        });
        assert(applied);
        return { promiseRecord, taskRecord, applied };
      }
    }

    if (applied && promiseRecord.state !== "pending") {
      for (const taskRecord of Object.values(this.tasks)) {
        if (taskRecord.awaiter === id && isNotCompleted(taskRecord.state)) {
          const { applied } = this.transitionTask({
            at,
            id: taskRecord.id,
            to: "completed",
            force: true,
          });
          assert(applied);
        }
      }

      for (const callbackRecord of Object.values(promiseRecord.callbacks)) {
        const { applied } = this.transitionTask({
          ...callbackRecord,
          at,
          to: "init",
        });
        assert(applied);
      }
      promiseRecord.callbacks = {};
    }

    return { promiseRecord, taskRecord, applied };
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
    to: PromiseState;
    timeoutAt?: number;
    payload?: { headers: { [key: string]: string }; data: string };
    tags?: { [key: string]: string };
  }): { record: PromiseRecord; applied: boolean } {
    let record: PromiseRecord | undefined = this.promises[id];

    if (record === undefined && to === "pending") {
      assertDefined(timeoutAt);
      record = {
        id,
        state: to,
        timeoutAt,
        param: payload ?? { headers: {}, data: "" },
        value: { headers: {}, data: "" },
        tags: tags ?? {},
        createdAt: at,
        callbacks: {},
      };
      this.promises[id] = record;
      return { record, applied: true };
    }

    if (record === undefined && isTerminalState(to)) {
      throw new ServerError(404, "promise not found");
    }

    if (record.state === "pending" && to === "pending") {
      if (at < record.timeoutAt) {
        return { record, applied: false };
      } else {
        return this.transitionPromise({ at, id, to: "rejected_timedout" });
      }
    }

    if (record.state === "pending" && isTerminalState(to)) {
      if (at < record.timeoutAt) {
        record = {
          ...record,
          state: to,
          value: payload ?? { headers: {}, data: "" },
          settledAt: at,
        };
        this.promises[id] = record;
        return { record, applied: true };
      } else {
        return this.transitionPromise({ at, id, to: "rejected_timedout" });
      }
    }

    if (record.state === "pending" && to === "rejected_timedout") {
      assert(at >= record.timeoutAt);

      record = {
        ...record,
        state: record.tags["resonate:timeout"] === "true" ? "resolved" : to,
      };

      this.promises[id] = record;
      return { record, applied: true };
    }

    if (record.state !== "pending" && to === "pending") {
      return { record, applied: false };
    }

    if (isTerminalState(record.state) && isTerminalState(to)) {
      return { record, applied: false };
    }

    if (record.state === "rejected_timedout" && isTerminalState(to)) {
      return { record, applied: false };
    }

    throw new ServerError(500, "unexpected promise transition");
  }

  private transitionTask({
    at,
    id,
    to,
    type,
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
    to: TaskState;
    type?: "invoke" | "resume" | "notify";
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

    if (record === undefined && to === "init") {
      assertDefined(type);
      assertDefined(recv);
      assertDefined(awaited);
      assertDefined(awaiter);
      assertDefined(timeoutAt);

      record = {
        id,
        version: 1,
        state: to,
        type,
        recv,
        awaited,
        awaiter,
        timeoutAt,
        pid,
        ttl,
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
      isClaimableState(record.state) &&
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
      isClaimableState(record.state) &&
      record.type === "notify" &&
      to === "completed"
    ) {
      record = { ...record, state: to, completedAt: at };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (
      record.state === "claimed" &&
      record.version === version &&
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

    if (isActiveState(record.state) && to === "init") {
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

    if (isNotCompleted(record.state) && to === "completed" && force) {
      record = { ...record, state: to, completedAt: at };
      this.tasks[id] = record;
      return { record, applied: true };
    }

    if (record.state === "completed" && to === "completed") {
      return { record, applied: false };
    }

    if (record === undefined) {
      throw new ServerError(404, "task not found");
    }

    throw new ServerError(500, "invalid task transition");
  }

  private getFirstRouterMatch(promise: PromiseRecord): string | undefined {
    for (const router of this.routers) {
      const recv = router.route(promise);
      if (recv !== undefined) {
        return recv;
      }
    }
  }
}

function isTerminalState(
  state: string,
): state is "resolved" | "rejected" | "rejected_canceled" {
  return (
    state === "resolved" ||
    state === "rejected" ||
    state === "rejected_canceled"
  );
}

function isClaimableState(state: string): state is "init" | "enqueued" {
  return state === "init" || state === "enqueued";
}
function isActiveState(state: string): state is "enqueued" | "claimed" {
  return state === "enqueued" || state === "claimed";
}
function isNotCompleted(
  state: string,
): state is "init" | "enqueued" | "claimed" {
  return state === "init" || state === "enqueued" || state === "claimed";
}
