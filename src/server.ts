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

type Result<T> =
  | { kind: "value"; data: T }
  | { kind: "error"; status: ErrorCode; message: string };

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

  process({ at, req }: { at: number; req: Req }): Res {
    switch (req.kind) {
      case "promise.get": {
        return this.promiseGet({ req });
      }
    }
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
          data: { promise: result.data },
        };
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
    if (!task) {
      return { kind: "error", status: 404, message: "task not found" };
    }
    return { kind: "value", data: task };
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
