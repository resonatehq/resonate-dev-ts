import CronExpressionParser from "cron-parser";
import type {
  ErrorCode,
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
import { assert, assertDefined } from "./utils";

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
  private tag = "resonate:invoke";
  route(promise: PromiseRecord): string | undefined {
    return promise.tags[this.tag];
  }
}

type Handler<T extends Res> = {
  status: T["head"]["status"];
  data: T["data"];
};

export class Server {
  readonly version = "2025-01-15";
  private promises: { [key: string]: PromiseRecord } = {};
  private tasks: { [key: string]: TaskRecord } = {};
  private schedules: { [key: string]: ScheduleRecord } = {};
  private router: Router = new DefaultRouter();
  private targets: { [key: string]: string } = {
    default: "local://any@default",
  };
  private x: number;

  constructor(x: number = 5000) {
    this.x = x;
  }

  next({ at }: { at: number }): number | undefined {
    let timeout: number | undefined;

    for (const promiseRecord of Object.values(this.promises)) {
      if (promiseRecord.state === "pending") {
        timeout = Math.min(
          promiseRecord.timeoutAt,
          timeout ?? promiseRecord.timeoutAt,
        );
      }
    }

    for (const schedule of Object.values(this.schedules)) {
      timeout = Math.min(schedule.nextRunAt, timeout ?? schedule.nextRunAt);
    }

    for (const taskRecord of Object.values(this.tasks)) {
      if (isNotCompleted(taskRecord.state)) {
        timeout = Math.min(taskRecord.expiry, timeout ?? taskRecord.expiry);
      }
    }

    return timeout !== undefined
      ? Math.min(Math.max(0, timeout - at), 2147483647)
      : timeout;
  }

  step({ at }: { at: number }): { mesg: Message; recv: string }[] {
    for (const schedule of Object.values(this.schedules)) {
      if (at < schedule.nextRunAt) {
        continue;
      }

      try {
        this.promiseCreate({
          at,
          req: {
            kind: "promise.create",
            head: { corrId: "", version: this.version },
            data: {
              id: schedule.promiseId.replace("{{.timestamp}}", at.toString()),
              param: schedule.promiseParam,
              tags: schedule.promiseTags,
              timeoutAt: at + schedule.promiseTimeout,
            },
          },
        });
      } catch {}

      const { applied } = this.transitionSchedule({
        at,
        id: schedule.id,
        to: "created",
        updating: true,
      });
      assert(applied);
    }

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
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.promiseCreate({ at, req }),
          });
        }
        case "promise.get": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.promiseGet({ req }),
          });
        }
        case "promise.register": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.promiseRegister({ at, req }),
          });
        }
        case "promise.settle": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.promiseSettle({ at, req }),
          });
        }
        case "promise.subscribe": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.promiseSubscribe({ at, req }),
          });
        }
        case "schedule.create": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.scheduleCreate({ at, req }),
          });
        }
        case "schedule.delete": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.scheduleDelete({ at, req }),
          });
        }
        case "schedule.get": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.scheduleGet({ req }),
          });
        }
        case "task.acquire": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskAcquire({ at, req }),
          });
        }
        case "task.create": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskCreate({ at, req }),
          });
        }
        case "task.fence": {
          assert(false, "not implemented");
          break;
        }
        case "task.fulfill": {
          assert(false, "not implemented");
          break;
        }
        case "task.get": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskGet({ req }),
          });
        }
        case "task.heartbeat": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskHeartbeat({ at, req }),
          });
        }
        case "task.release": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskRelease({ at, req }),
          });
        }
        case "task.suspend": {
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskSuspend({ at, req }),
          });
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
  }): Handler<PromiseCreateRes> {
    const { promiseRecord: promise, applied } = this.transitionPromiseAndTask({
      at,
      id: req.data.id,
      to: "pending",
      payload: req.data.param,
      tags: req.data.tags,
      timeoutAt: req.data.timeoutAt,
    });
    assert(
      !applied ||
        promise.state === "pending" ||
        promise.state === "rejected_timedout",
    );
    return { status: 200, data: { promise } };
  }
  private promiseGet({
    req,
  }: {
    req: PromiseGetReq;
  }): Handler<PromiseGetRes> {
    return {
      status: 200,
      data: { promise: this.getPromiseRecord(req.data.id) },
    };
  }
  private promiseRegister({
    at,
    req,
  }: {
    at: number;
    req: PromiseRegisterReq;
  }): Handler<PromiseRegisterRes> & { created: boolean } {
    const promise = this.getPromiseRecord(req.data.awaited);
    if (
      promise.state === "pending" ||
      promise.callbacks[req.data.awaited] !== undefined
    ) {
      return { status: 200, data: { promise }, created: false };
    }
    const cbId = `__resume:${req.data.awaiter}:${req.data.awaited}`;
    const recv = this.router.route(promise);
    if (!recv) {
      throw new ServerError(500, "recv must be set");
    }
    promise.callbacks[cbId] = {
      id: cbId,
      type: "resume",
      awaited: req.data.awaited,
      awaiter: req.data.awaiter,
      recv,
      timeoutAt: promise.timeoutAt,
      createdAt: at,
    };
    return { status: 200, data: { promise }, created: true };
  }
  private promiseSettle({
    at,
    req,
  }: {
    at: number;
    req: PromiseSettleReq;
  }): Handler<PromiseSettleRes> {
    const { promiseRecord: promise, applied } = this.transitionPromiseAndTask({
      at,
      id: req.data.id,
      to: req.data.state,
      payload: req.data.value,
    });
    assert(
      !applied ||
        promise.state === req.data.state ||
        promise.state === "rejected_timedout",
    );
    return { status: 200, data: { promise } };
  }
  private promiseSubscribe({
    at,
    req,
  }: {
    at: number;
    req: PromiseSubscribeReq;
  }): Handler<PromiseSubscribeRes> {
    const promise = this.getPromiseRecord(req.data.awaited);

    if (
      promise.state !== "pending" ||
      promise.callbacks[req.data.awaited] !== undefined
    ) {
      return { status: 200, data: { promise } };
    }
    const recv = this.router.route(promise);
    if (!recv) {
      throw new ServerError(500, "recv must be set");
    }
    const cbId = `__notify:${req.data.address}:${req.data.awaited}`;
    promise.callbacks[cbId] = {
      id: cbId,
      type: "notify",
      awaited: req.data.awaited,
      awaiter: req.data.awaited,
      recv,
      timeoutAt: promise.timeoutAt,
      createdAt: at,
    };
    return { status: 200, data: { promise } };
  }
  private scheduleCreate({
    at,
    req,
  }: {
    at: number;
    req: ScheduleCreateReq;
  }): Handler<ScheduleCreateRes> {
    return {
      status: 200,
      data: {
        schedule: this.transitionSchedule({
          at,
          id: req.data.id,
          to: "created",
          cron: req.data.cron,
          promiseId: req.data.promiseId,
          promiseTimeout: req.data.promiseTimeout,
          promiseParam: req.data.promiseParam,
          promiseTags: req.data.promiseTags,
        }).schedule,
      },
    };
  }
  private scheduleDelete({
    at,
    req,
  }: {
    at: number;
    req: ScheduleDeleteReq;
  }): Handler<ScheduleDeleteRes> {
    const { applied } = this.transitionSchedule({
      at,
      id: req.data.id,
      to: "deleted",
    });
    assert(applied);
    return { status: 200, data: undefined };
  }
  private scheduleGet({
    req,
  }: {
    req: ScheduleGetReq;
  }): Handler<ScheduleGetRes> {
    return {
      status: 200,
      data: { schedule: this.getScheduleRecord(req.data.id) },
    };
  }
  private taskAcquire({
    at,
    req,
  }: {
    at: number;
    req: TaskAcquireReq;
  }): Handler<TaskAcquireRes> {
    const { record: task, applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "claimed",
      version: req.data.version,
      pid: req.data.pid,
      ttl: req.data.ttl,
    });
    assert(applied);
    assert(task.type !== "notify");
    return {
      status: 200,
      data: {
        kind: task.type,
        data: { promise: this.getPromiseRecord(task.awaiter), preload: [] },
      },
    };
  }
  private taskCreate({
    at,
    req,
  }: {
    at: number;
    req: TaskCreateReq;
  }): Handler<TaskCreateRes> {
    const {
      promiseRecord: promise,
      taskRecord: task,
      applied,
    } = this.transitionPromiseAndTask({
      at,
      id: req.data.action.data.id,
      to: "pending",
      payload: req.data.action.data.param,
      tags: req.data.action.data.tags,
      timeoutAt: req.data.action.data.timeoutAt,
    });
    assert(
      !applied ||
        promise.state === "pending" ||
        promise.state === "rejected_timedout",
    );
    if (applied && task !== undefined) {
      const { record: claimedTask, applied } = this.transitionTask({
        at,
        id: task.id,
        to: "claimed",
        version: 1,
        pid: req.data.pid,
        ttl: req.data.ttl,
      });
      assert(applied);
      assert(claimedTask.state === "claimed");
      return { status: 200, data: { task: claimedTask, promise } };
    }
    return { status: 200, data: { promise, task } };
  }
  private taskGet({ req }: { req: TaskGetReq }): Handler<TaskGetRes> {
    return { status: 200, data: { task: this.getTaskRecord(req.data.id) } };
  }
  private taskHeartbeat({
    at,
    req,
  }: {
    at: number;
    req: TaskHeartbeatReq;
  }): Handler<TaskHeartbeatRes> {
    for (const task of Object.values(this.tasks)) {
      if (task.state !== "claimed" || task.pid !== req.data.pid) {
        continue;
      }
      const { applied } = this.transitionTask({
        at,
        id: task.id,
        to: "claimed",
        force: true,
      });
      assert(applied);
    }

    return { status: 200, data: undefined };
  }

  private taskRelease({
    at,
    req,
  }: {
    at: number;
    req: TaskReleaseReq;
  }): Handler<TaskReleaseRes> {
    const { applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "init",
      version: req.data.version,
    });
    assert(applied);
    return { status: 200, data: undefined };
  }

  private taskSuspend({
    at,
    req,
  }: {
    at: number;
    req: TaskSuspendReq;
  }): Handler<TaskSuspendRes> {
    let status: 200 | 300 = 200;
    for (const action of req.data.actions) {
      const { created } = this.promiseRegister({ at, req: action });
      if (!created) {
        status = 300;
      }
    }
    this.transitionTask({
      at,
      id: req.data.id,
      to: "completed",
      version: req.data.version,
    });
    return { status, data: undefined };
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

    assert(false, "unexpected promise transition");
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
          id: invokeId(id),
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
          awaited: callbackRecord.awaited,
        });
        assert(applied);
      }
      promiseRecord.callbacks = {};
    }

    return { promiseRecord, applied };
  }
  private transitionSchedule({
    at,
    id,
    to,
    cron,
    promiseId,
    promiseTimeout,
    promiseParam,
    promiseTags,
    updating,
  }: {
    at: number;
    id: string;
    to: "created" | "deleted";
    cron?: string;
    promiseId?: string;
    promiseTimeout?: number;
    promiseParam?: { headers: { [key: string]: string }; data: string };
    promiseTags?: { [key: string]: string };
    updating?: boolean;
  }): { schedule: Schedule; applied: boolean } {
    let record: ScheduleRecord | undefined = this.schedules[id];
    if (record === undefined && to === "created") {
      assertDefined(cron);
      assertDefined(promiseId);
      assertDefined(promiseTimeout);
      assertDefined(promiseParam);
      assertDefined(promiseTags);
      record = {
        id,
        cron,
        promiseId,
        promiseTimeout,
        promiseParam,
        promiseTags,
        createdAt: at,
        nextRunAt: CronExpressionParser.parse(cron, { currentDate: at })
          .next()
          .getTime(),
      };
      this.schedules[id] = record;
      return { schedule: record, applied: true };
    }

    if (record !== undefined && to === "created" && updating) {
      record = {
        ...record,
        lastRunAt: record.nextRunAt,
        nextRunAt: CronExpressionParser.parse(record.cron, { currentDate: at })
          .next()
          .getTime(),
      };
      this.schedules[id] = record;
      return { schedule: record, applied: true };
    }

    if (record !== undefined && to === "created") {
      return { schedule: record, applied: false };
    }

    if (record === undefined && to === "deleted") {
      throw new ServerError(404, "schedule not found");
    }

    if (record !== undefined && to === "deleted") {
      delete this.schedules[id];
      return { schedule: record, applied: true };
    }

    throw new ServerError(500, "invalid schedule transition");
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
  private getScheduleRecord(id: string): ScheduleRecord {
    const record: ScheduleRecord | undefined = this.schedules[id];
    if (!record) {
      throw new ServerError(404, "task not found");
    }
    return record;
  }
  private buildOkRes<K extends string, S extends number, D>({
    kind,
    corrId,
    status,
    data,
  }: {
    kind: K;
    corrId: string;
    status: S;
    data: D;
  }): {
    kind: K;
    head: {
      corrId: string;
      status: S;
      version: string;
    };
    data: D;
  } {
    return {
      kind: kind,
      head: {
        corrId: corrId,
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
function invokeId(id: string): string {
  return `__invoke:${id}`;
}
