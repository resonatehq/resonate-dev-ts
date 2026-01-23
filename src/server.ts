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

type HandlerRes<T extends Res> = {
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
  constructor(private x: number = 5000) {}

  next({ at }: { at: number }): number | undefined {
    let timeout: number | undefined;

    for (const promise of Object.values(this.promises)) {
      if (promise.state === "pending") {
        timeout = Math.min(promise.timeoutAt, timeout ?? promise.timeoutAt);
      }
    }

    for (const schedule of Object.values(this.schedules)) {
      timeout = Math.min(schedule.nextRunAt, timeout ?? schedule.nextRunAt);
    }

    for (const task of Object.values(this.tasks)) {
      if (isNotCompleted(task.state)) {
        timeout = Math.min(task.expiry, timeout ?? task.expiry);
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

    for (const promise of Object.values(this.promises)) {
      if (promise.state === "pending" && at >= promise.timeoutAt) {
        const { applied } = this.transitionPromise({
          at,
          id: promise.id,
          to: "rejected_timedout",
        });
        assert(applied);
      }
    }

    for (const task of Object.values(this.tasks)) {
      if (isActiveState(task.state)) {
        if (at >= task.expiry) {
          const { applied } = this.transitionTask({
            at,
            id: task.id,
            to: "init",
            force: true,
          });
          assert(applied);
        }
      }
    }

    const inFlightAwaiters = new Set<string>();

    for (const task of Object.values(this.tasks)) {
      if (isActiveState(task.state)) {
        inFlightAwaiters.add(task.awaiter);
      }
    }

    const mesgs: { mesg: Message; recv: string }[] = [];
    for (const task of Object.values(this.tasks)) {
      if (
        task.state !== "init" ||
        task.expiry > at ||
        inFlightAwaiters.has(task.awaiter)
      ) {
        continue;
      }

      let mesg: { mesg: Message; recv: string };
      switch (task.type) {
        case "notify": {
          mesg = {
            mesg: {
              kind: task.type,
              head: {},
              data: { promise: this.getPromiseRecord(task.awaiter) },
            },
            recv: task.recv,
          };
          const { applied } = this.transitionTask({
            at,
            id: task.id,
            to: "completed",
          });
          assert(applied);
          break;
        }

        default: {
          mesg = {
            mesg: {
              kind: task.type,
              head: {},
              data: {
                task,
              },
            },
            recv: task.recv,
          };
          const { applied } = this.transitionTask({
            at,
            id: task.id,
            to: "enqueued",
          });
          assert(applied);
          break;
        }
      }

      mesgs.push(mesg);
      inFlightAwaiters.add(task.awaiter);
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
          return this.buildOkRes({
            kind: req.kind,
            corrId: req.head.corrId,
            ...this.taskFulfill({ at, req }),
          });
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
  }): HandlerRes<PromiseCreateRes> & { task?: TaskRecord } {
    const { promise, task, applied } = this.transitionPromiseAndTask({
      at,
      id: req.data.id,
      to: "pending",
      payload: req.data.param,
      tags: req.data.tags,
      timeoutAt: req.data.timeoutAt,
    });
    if (!applied) {
      assert(task === undefined);
      return { status: 200, data: { promise }, task };
    }

    assert(promise.createdAt <= at);
    return { status: 200, data: { promise }, task };
  }
  private promiseGet({
    req,
  }: {
    req: PromiseGetReq;
  }): HandlerRes<PromiseGetRes> {
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
  }): HandlerRes<PromiseRegisterRes> & { created: boolean } {
    // Get both promises involved in the dependency relationship:
    // - awaiter: the promise that is waiting (the parent/caller)
    // - awaited: the promise being waited on (the child/dependency)
    const promiseAwaiter = this.getPromiseRecord(req.data.awaiter);
    const promiseAwaited = this.getPromiseRecord(req.data.awaited);

    // Create a unique callback ID for this dependency relationship
    const cbId = `__resume:${req.data.awaiter}:${req.data.awaited}`;

    // Early return if callback registration is not needed:
    // 1. Awaited promise is already settled (no need to register callback on completed promises)
    // 2. Callback already exists (avoid duplicate registrations)
    if (
      promiseAwaited.state !== "pending" ||
      promiseAwaited.callbacks[cbId] !== undefined
    ) {
      return { status: 200, data: { promise: promiseAwaited }, created: false };
    }

    // Determine the target receiver/handler for the awaiter promise
    // This is where the resume task will be sent when the awaited promise completes
    const recv = this.router.route(promiseAwaiter);
    if (!recv) {
      throw new ServerError(500, "recv must be set");
    }

    // Register the callback on the awaited promise (not the awaiter!)
    // When the awaited promise settles, this callback will be initialized as a resume task
    // in transitionPromiseAndTask, which will continue execution of the awaiter promise
    promiseAwaited.callbacks[cbId] = {
      id: cbId,
      type: "resume",
      awaited: req.data.awaited,
      awaiter: req.data.awaiter,
      recv,
      timeoutAt: promiseAwaiter.timeoutAt,
      createdAt: at,
    };
    return { status: 200, data: { promise: promiseAwaited }, created: true };
  }
  private promiseSettle({
    at,
    req,
  }: {
    at: number;
    req: PromiseSettleReq;
  }): HandlerRes<PromiseSettleRes> {
    const { promise, task } = this.transitionPromiseAndTask({
      at,
      id: req.data.id,
      to: req.data.state,
      payload: req.data.value,
    });
    assert(task === undefined);
    assert(promise.state !== "pending");
    return { status: 200, data: { promise } };
  }
  private promiseSubscribe({
    at,
    req,
  }: {
    at: number;
    req: PromiseSubscribeReq;
  }): HandlerRes<PromiseSubscribeRes> {
    // Get the promise that the subscriber wants to be notified about
    const promise = this.getPromiseRecord(req.data.awaited);

    // Create a unique callback ID based on the promise and destination address
    // This ensures one callback per address per promise
    const cbId = `__notify:${req.data.awaited}:${req.data.address}`;

    // Early return if subscription is not needed:
    // 1. Promise is already settled (no need to subscribe to completed promises)
    // 2. Callback already exists (avoid duplicate subscriptions)
    if (promise.state !== "pending" || promise.callbacks[cbId] !== undefined) {
      return { status: 200, data: { promise } };
    }

    // Determine the target receiver/handler for this promise's notifications
    const recv = this.router.route(promise);
    if (!recv) {
      throw new ServerError(500, "recv must be set");
    }

    // Register the callback on the promise
    // When the promise settles, this callback will be initialized as a notify task
    // in transitionPromiseAndTask, which will send the notification
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
  }): HandlerRes<ScheduleCreateRes> {
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
  }): HandlerRes<ScheduleDeleteRes> {
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
  }): HandlerRes<ScheduleGetRes> {
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
  }): HandlerRes<TaskAcquireRes> {
    const { task, applied } = this.transitionTask({
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
        data: {
          promise: this.getPromiseRecord(task.awaiter),
          preload: Object.values(this.promises).filter(
            (p) => p.state !== "pending",
          ),
        },
      },
    };
  }
  private taskCreate({
    at,
    req,
  }: {
    at: number;
    req: TaskCreateReq;
  }): HandlerRes<TaskCreateRes> {
    const {
      data: { promise },
      task,
    } = this.promiseCreate({ at, req: req.data.action });

    if (task !== undefined && task.state !== "claimed") {
      const { task: claimed, applied } = this.transitionTask({
        at,
        id: task.id,
        to: "claimed",
        version: 1,
        pid: req.data.pid,
        ttl: req.data.ttl,
      });
      assert(applied);
      return { status: 200, data: { task: claimed, promise } };
    }
    return { status: 200, data: { promise } };
  }
  private taskFulfill({
    at,
    req,
  }: {
    at: number;
    req: TaskFulfillReq;
  }): HandlerRes<TaskFulfillRes> {
    const {
      data: { promise },
    } = this.promiseSettle({ at, req: req.data.action });

    assert(promise.state !== "pending");
    assertDefined(promise.settledAt);
    if (promise.settledAt === at) {
      const { applied } = this.transitionTask({
        at,
        id: req.data.id,
        to: "completed",
        version: req.data.version,
      });
      assert(applied);
    }

    return { status: 200, data: { promise } };
  }
  private taskGet({ req }: { req: TaskGetReq }): HandlerRes<TaskGetRes> {
    return { status: 200, data: { task: this.getTaskRecord(req.data.id) } };
  }
  private taskHeartbeat({
    at,
    req,
  }: {
    at: number;
    req: TaskHeartbeatReq;
  }): HandlerRes<TaskHeartbeatRes> {
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
  }): HandlerRes<TaskReleaseRes> {
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
  }): HandlerRes<TaskSuspendRes> {
    let status: 200 | 300 = 200;
    for (const action of req.data.actions) {
      const { created } = this.promiseRegister({ at, req: action });
      if (!created) {
        status = 300;
        break;
      }
    }
    const { applied } = this.transitionTask({
      at,
      id: req.data.id,
      to: "completed",
      version: req.data.version,
    });
    if (applied) {
      // this is expected to be an invariant once we move the tasks to waiting
    }
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
  }): { promise: PromiseRecord; applied: boolean } {
    let promise: PromiseRecord | undefined = this.promises[id];

    if (promise === undefined && to === "pending") {
      assertDefined(timeoutAt);
      promise = {
        id,
        state: to,
        timeoutAt,
        param: payload ?? { headers: {}, data: "" },
        value: { headers: {}, data: "" },
        tags: tags ?? {},
        createdAt: at,
        callbacks: {},
      };
      this.promises[id] = promise;
      return { promise, applied: true };
    }

    if (promise === undefined && isTerminalState(to)) {
      throw new ServerError(404, "promise not found");
    }

    if (promise.state === "pending" && to === "pending") {
      if (at < promise.timeoutAt) {
        return { promise, applied: false };
      } else {
        return this.transitionPromise({ at, id, to: "rejected_timedout" });
      }
    }

    if (promise.state === "pending" && isTerminalState(to)) {
      if (at < promise.timeoutAt) {
        promise = {
          ...promise,
          state: to,
          value: payload ?? { headers: {}, data: "" },
          settledAt: at,
        };
        this.promises[id] = promise;
        return { promise, applied: true };
      } else {
        return this.transitionPromise({ at, id, to: "rejected_timedout" });
      }
    }

    if (promise.state === "pending" && to === "rejected_timedout") {
      assert(at >= promise.timeoutAt);

      promise = {
        ...promise,
        state: promise.tags["resonate:timeout"] === "true" ? "resolved" : to,
        settledAt: at,
      };

      this.promises[id] = promise;
      return { promise, applied: true };
    }

    if (promise.state !== "pending" && to === "pending") {
      return { promise, applied: false };
    }

    if (isTerminalState(promise.state) && isTerminalState(to)) {
      return { promise, applied: false };
    }

    if (promise.state === "rejected_timedout" && isTerminalState(to)) {
      return { promise, applied: false };
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
  }): { task: TaskRecord; applied: boolean } {
    let task: TaskRecord | undefined = this.tasks[id];

    if (task === undefined && to === "init") {
      assertDefined(type);
      assertDefined(recv);
      assertDefined(awaited);
      assertDefined(awaiter);
      assertDefined(timeoutAt);

      task = {
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
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (task.state === "init" && to === "enqueued") {
      task = { ...task, state: to, expiry: at + this.x };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (
      isClaimableState(task.state) &&
      to === "claimed" &&
      task.version === version
    ) {
      assertDefined(pid);
      assertDefined(ttl);

      task = { ...task, state: to, pid, ttl, expiry: at + ttl };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (
      isClaimableState(task.state) &&
      task.type === "notify" &&
      to === "completed"
    ) {
      task = { ...task, state: to, completedAt: at };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (task.state === "claimed" && task.version === version && to === "init") {
      task = {
        ...task,
        version: task.version + 1,
        state: to,
        pid: undefined,
        ttl: undefined,
        expiry: 0,
      };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (isActiveState(task.state) && to === "init") {
      task = {
        ...task,
        version: task.version + 1,
        state: to,
        pid: undefined,
        ttl: undefined,
        expiry: 0,
      };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (task.state === "claimed" && to === "claimed" && force) {
      assertDefined(task.ttl);
      task = { ...task, expiry: at + task.ttl };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (
      task.state === "claimed" &&
      to === "completed" &&
      task.version === version &&
      task.expiry >= at
    ) {
      task = { ...task, state: to, completedAt: at };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (isNotCompleted(task.state) && to === "completed" && force) {
      task = { ...task, state: to, completedAt: at };
      this.tasks[id] = task;
      return { task, applied: true };
    }

    if (task.state === "completed" && to === "completed") {
      return { task, applied: false };
    }

    if (task === undefined) {
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
    promise: PromiseRecord;
    task?: TaskRecord;
    applied: boolean;
  } {
    // Attempt to transition the promise to the new state
    const { promise, applied } = this.transitionPromise({
      at,
      id,
      to,
      timeoutAt,
      payload,
      tags,
    });

    // If the transition wasn't applied (e.g., invalid state change), return early
    if (!applied) {
      return { promise, applied };
    }

    // Handle newly created pending promises by creating an associated invoke task
    if (promise.state === "pending") {
      const recv = this.router.route(promise);
      if (recv !== undefined) {
        // Create an invoke task to execute the promise
        const { task, applied } = this.transitionTask({
          at,
          id: invokeId(promise.id),
          to: "init",
          type: "invoke",
          recv: this.targets[recv] ?? recv,
          awaited: promise.id,
          awaiter: promise.id,
          timeoutAt: promise.timeoutAt,
        });
        assert(applied);
        assert(task.awaited === promise.id);
        assert(task.awaiter === promise.id);
        return { promise, task, applied };
      }
    }

    // Handle completed promises (resolved, rejected, canceled, or timed out)
    if (promise.state !== "pending") {
      assertDefined(promise.settledAt);
      assert(promise.settledAt >= promise.createdAt);

      // Complete all tasks that were awaiting this promise
      for (const task of Object.values(this.tasks)) {
        if (task.awaiter === promise.id && isNotCompleted(task.state)) {
          const { applied } = this.transitionTask({
            at,
            id: task.id,
            to: "completed",
            force: true,
          });
          assert(applied);
        }
      }

      // Initialize all registered callbacks for this promise
      for (const callback of Object.values(promise.callbacks)) {
        const { applied } = this.transitionTask({
          ...callback,
          at,
          to: "init",
          awaited: callback.awaited,
        });
        assert(applied);
      }
      // Clear callbacks after initializing them
      promise.callbacks = {};
    }

    return { promise, applied };
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
    let schedule: ScheduleRecord | undefined = this.schedules[id];
    if (schedule === undefined && to === "created") {
      assertDefined(cron);
      assertDefined(promiseId);
      assertDefined(promiseTimeout);
      assertDefined(promiseParam);
      assertDefined(promiseTags);
      schedule = {
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
      this.schedules[id] = schedule;
      return { schedule, applied: true };
    }

    if (schedule !== undefined && to === "created" && updating) {
      schedule = {
        ...schedule,
        lastRunAt: schedule.nextRunAt,
        nextRunAt: CronExpressionParser.parse(schedule.cron, {
          currentDate: at,
        })
          .next()
          .getTime(),
      };
      this.schedules[id] = schedule;
      return { schedule, applied: true };
    }

    if (schedule !== undefined && to === "created") {
      return { schedule, applied: false };
    }

    if (schedule === undefined && to === "deleted") {
      throw new ServerError(404, "schedule not found");
    }

    if (schedule !== undefined && to === "deleted") {
      delete this.schedules[id];
      return { schedule, applied: true };
    }

    throw new ServerError(500, "invalid schedule transition");
  }
  private getPromiseRecord(id: string): PromiseRecord {
    const promise: PromiseRecord | undefined = this.promises[id];
    if (!promise) {
      throw new ServerError(404, "promise not found");
    }
    return promise;
  }
  private getTaskRecord(id: string): TaskRecord {
    const task: TaskRecord | undefined = this.tasks[id];
    if (!task) {
      throw new ServerError(404, "task not found");
    }
    return task;
  }
  private getScheduleRecord(id: string): ScheduleRecord {
    const schedule: ScheduleRecord | undefined = this.schedules[id];
    if (!schedule) {
      throw new ServerError(404, "task not found");
    }
    return schedule;
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
  state: PromiseState,
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
