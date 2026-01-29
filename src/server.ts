import CronExpressionParser from "cron-parser";
import type {
  ErrorCode,
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
import type { Message, Promise, Schedule, Task } from "./entities";
import { assert, assertDefined, isStatus } from "./utils";

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

export class Server {
  readonly version = "2025-01-15";

  private promises: { [key: string]: PromiseRecord } = {};
  private tasks: { [key: string]: TaskRecord } = {};
  private schedules: { [key: string]: ScheduleRecord } = {};
  private router: Router = new DefaultRouter();
  private targets: { [key: string]: string } = {
    default: "local://any@default",
  };
  constructor(private taskExpiryMs: number = 5000) {}

  step({ at }: { at: number }): { mesg: Message; recv: string }[] {}

  process({ at, req }: { at: number; req: Req }): Res {}

  private invokeId(promiseId: string): string {
    return `__invoke:${promiseId}`;
  }

  private resumeId(awaiterId: string, awaitedId: string): string {
    return `__resume:${awaiterId}:${awaitedId}`;
  }

  private notifyId(awaitedId: string, address: string): string {
    return `__notify:${awaitedId}:${address}`;
  }
  private getPromiseRecord(id: string): PromiseRecord {
    const promise = this.promises[id];
    if (!promise) {
      throw new ServerError(404, "promise not found");
    }
    return promise;
  }

  private getTaskRecord(id: string): TaskRecord {
    const task = this.tasks[id];
    if (!task) {
      throw new ServerError(404, "task not found");
    }
    return task;
  }

  private getScheduleRecord(id: string): ScheduleRecord {
    const schedule = this.schedules[id];
    if (!schedule) {
      throw new ServerError(404, "schedule not found");
    }
    return schedule;
  }

  private toError(e: unknown): { status: ErrorCode; message: string } {
    if (e instanceof ServerError) {
      return { status: e.code, message: e.message };
    }
    return { status: 500, message: String(e) };
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
