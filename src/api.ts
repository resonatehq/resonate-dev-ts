import type { Promise, Schedule, Task } from "./entities";

type ReqResKind =
  | "promise.get"
  | "promise.create"
  | "promise.settle"
  | "promise.register"
  | "promise.subscribe"
  | "task.get"
  | "task.create"
  | "task.acquire"
  | "task.suspend"
  | "task.fulfill"
  | "task.release"
  | "task.fence"
  | "task.heartbeat"
  | "schedule.get"
  | "schedule.create"
  | "schedule.delete";

type ReqSchema<K extends ReqResKind, T> = {
  kind: K;
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: T;
};

type ResSchema<K extends ReqResKind, Ok extends number, T, Ko extends number> =
  | {
      kind: K;
      head: {
        corrId: string;
        status: Ok;
        version: string;
      };
      data: T;
    }
  | {
      kind: K;
      head: { corrId: string; status: Ko | 500; version: string };
      data: string;
    };

export type ErrorCode = 404 | 409 | 500;

export type PromiseGetReq = ReqSchema<"promise.get", { id: string }>;
export type PromiseGetRes = ResSchema<
  "promise.get",
  200,
  { promise: Promise },
  404
>;

export type PromiseCreateReq = ReqSchema<
  "promise.create",
  {
    id: string;
    param: { headers: { [key: string]: string }; data: string };
    tags: { [key: string]: string };
    timeoutAt: number;
  }
>;
export type PromiseCreateRes = ResSchema<
  "promise.create",
  200,
  { promise: Promise },
  never
>;

export type PromiseSettleReq = ReqSchema<
  "promise.settle",
  {
    id: string;
    state: "resolved" | "rejected" | "rejected_canceled";
    value: { headers: { [key: string]: string }; data: string };
  }
>;
export type PromiseSettleRes = ResSchema<
  "promise.settle",
  200,
  { promise: Promise },
  404
>;

export type PromiseRegisterReq = ReqSchema<
  "promise.register",
  { awaiter: string; awaited: string }
>;
export type PromiseRegisterRes = ResSchema<
  "promise.register",
  200,
  { promise: Promise },
  404
>;

export type PromiseSubscribeReq = ReqSchema<
  "promise.subscribe",
  { awaited: string; address: string }
>;
export type PromiseSubscribeRes = ResSchema<
  "promise.subscribe",
  200,
  { promise: Promise },
  404
>;

export type TaskGetReq = ReqSchema<"task.get", { id: string }>;
export type TaskGetRes = ResSchema<"task.get", 200, { task: Task }, 404>;

export type TaskCreateReq = ReqSchema<
  "task.create",
  { pid: string; ttl: number; action: PromiseCreateReq }
>;
export type TaskCreateRes = ResSchema<
  "task.create",
  200,
  { task?: Task; promise: Promise },
  never
>;

export type TaskAcquireReq = ReqSchema<
  "task.acquire",
  { id: string; version: number; pid: string; ttl: number }
>;
export type TaskAcquireRes = ResSchema<
  "task.acquire",
  200,
  { kind: "invoke" | "resume"; data: { promise: Promise; preload: Promise[] } },
  404 | 409
>;

export type TaskSuspendReq = ReqSchema<
  "task.suspend",
  {
    id: string;
    version: number;
    actions: PromiseRegisterReq[];
  }
>;
export type TaskSuspendRes = ResSchema<
  "task.suspend",
  200 | 300,
  undefined,
  404 | 409
>;

export type TaskFulfillReq = ReqSchema<
  "task.fulfill",
  {
    id: string;
    version: number;
    action: PromiseSettleReq;
  }
>;
export type TaskFulfillRes = ResSchema<
  "task.fulfill",
  200,
  { promise: Promise },
  404 | 409
>;

export type TaskReleaseReq = ReqSchema<
  "task.release",
  { id: string; version: number }
>;
export type TaskReleaseRes = ResSchema<
  "task.release",
  200,
  undefined,
  404 | 409
>;

export type TaskFenceReq = ReqSchema<
  "task.fence",
  {
    id: string;
    version: number;
    action: PromiseCreateReq | PromiseSettleReq;
  }
>;
export type TaskFenceRes = ResSchema<
  "task.fence",
  200,
  { action: PromiseCreateRes | PromiseSettleRes },
  404 | 409
>;

export type TaskHeartbeatReq = ReqSchema<
  "task.heartbeat",
  { pid: string; tasks: Task[] }
>;
export type TaskHeartbeatRes = ResSchema<
  "task.heartbeat",
  200,
  undefined,
  never
>;

export type ScheduleGetReq = ReqSchema<"schedule.get", { id: string }>;
export type ScheduleGetRes = ResSchema<
  "schedule.get",
  200,
  { schedule: Schedule },
  404
>;

export type ScheduleCreateReq = ReqSchema<
  "schedule.create",
  {
    id: string;
    cron: string;
    promiseId: string;
    promiseTimeout: number;
    promiseParam: { headers: { [key: string]: string }; data: string };
    promiseTags: { [key: string]: string };
  }
>;
export type ScheduleCreateRes = ResSchema<
  "schedule.create",
  200,
  { schedule: Schedule },
  never
>;

export type ScheduleDeleteReq = ReqSchema<"schedule.delete", { id: string }>;
export type ScheduleDeleteRes = ResSchema<
  "schedule.delete",
  200,
  undefined,
  404
>;

export type Req =
  | PromiseGetReq
  | PromiseCreateReq
  | PromiseSettleReq
  | PromiseRegisterReq
  | PromiseSubscribeReq
  | TaskGetReq
  | TaskCreateReq
  | TaskAcquireReq
  | TaskSuspendReq
  | TaskFulfillReq
  | TaskReleaseReq
  | TaskFenceReq
  | TaskHeartbeatReq
  | ScheduleGetReq
  | ScheduleCreateReq
  | ScheduleDeleteReq;

export type Res =
  | PromiseGetRes
  | PromiseCreateRes
  | PromiseSettleRes
  | PromiseRegisterRes
  | PromiseSubscribeRes
  | TaskGetRes
  | TaskCreateRes
  | TaskAcquireRes
  | TaskSuspendRes
  | TaskFulfillRes
  | TaskReleaseRes
  | TaskFenceRes
  | TaskHeartbeatRes
  | ScheduleGetRes
  | ScheduleCreateRes
  | ScheduleDeleteRes;
