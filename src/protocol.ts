// Entities

export type PromiseState =
  | "pending"
  | "resolved"
  | "rejected"
  | "rejected_canceled"
  | "rejected_timedout";
export type Promise = {
  id: string;
  state: PromiseState;
  param: { headers: { [key: string]: string }; data: string };
  value: { headers: { [key: string]: string }; data: string };
  tags: { [key: string]: string };
  timeoutAt: number;
  createdAt: number;
  settledAt?: number;
};

export type Task = {
  id: string;
  version: number;
};

export type InvokeMessage = {
  kind: "invoke";
  head: { [key: string]: string };
  data: {
    task: Task;
  };
};
export type ResumeMessage = {
  kind: "resume";
  head: { [key: string]: string };
  data: {
    task: Task;
  };
};
export type NotifyMessage = {
  kind: "notify";
  head: { [key: string]: string };
  data: {
    promise: Promise;
  };
};

export type Message = InvokeMessage | ResumeMessage | NotifyMessage;

export type Schedule = {
  id: string;
  cron: string;
  promiseId: string;
  promiseTimeout: number;
  promiseParam: { headers: { [key: string]: string }; data: string };
  promiseTags: { [key: string]: string };
  createdAt: number;
  nextRunAt: number;
  lastRunAt?: number;
};

// Request & Response
type ReqSchema<K extends string, T> = {
  kind: K;
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: T;
};

type ResSchema<K extends string, S extends number, T> = {
  kind: K;
  head: {
    corrId: string;
    status: S;
    version: string;
  };
  data: T;
};

export type ErrorCode = 400 | 404 | 409 | 429 | 500;
export type ErrorRes = ResSchema<"error", ErrorCode, string>;

export type PromiseGetReq = ReqSchema<"promise.get", { id: string }>;
export type PromiseGetRes = ResSchema<"promise.get", 200, { promise: Promise }>;

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
  { promise: Promise }
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
  { promise: Promise }
>;

export type PromiseRegisterReq = ReqSchema<
  "promise.register",
  { awaiter: string; awaited: string }
>;
export type PromiseRegisterRes = ResSchema<
  "promise.register",
  200,
  { promise: Promise }
>;

export type PromiseSubscribeReq = ReqSchema<
  "promise.subscribe",
  { awaited: string; address: string }
>;
export type PromiseSubscribeRes = ResSchema<
  "promise.subscribe",
  200,
  { promise: Promise }
>;

export type TaskGetReq = ReqSchema<"task.get", { id: string }>;
export type TaskGetRes = ResSchema<"task.get", 200, { task: Task }>;

export type TaskCreateReq = ReqSchema<
  "task.create",
  { pid: string; ttl: number; action: PromiseCreateReq }
>;
export type TaskCreateRes = ResSchema<
  "task.create",
  200,
  { task?: Task; promise: Promise }
>;

export type TaskAcquireReq = ReqSchema<
  "task.acquire",
  { id: string; version: number; pid: string; ttl: number }
>;
export type TaskAcquireRes = ResSchema<
  "task.acquire",
  200,
  | { kind: "invoke"; data: { invoked: Promise } }
  | { kind: "resume"; data: { invoked: Promise; awaited: Promise } }
>;

export type TaskSuspendReq = ReqSchema<
  "task.suspend",
  {
    id: string;
    version: number;
    actions: PromiseRegisterReq[];
  }
>;
export type TaskSuspendRes = ResSchema<"task.suspend", 200 | 300, undefined>;

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
  { promise: Promise }
>;

export type TaskReleaseReq = ReqSchema<
  "task.release",
  { id: string; version: number }
>;
export type TaskReleaseRes = ResSchema<"task.release", 200, undefined>;

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
  { action: PromiseCreateRes | PromiseSettleRes }
>;

export type TaskHeartbeatReq = ReqSchema<
  "task.heartbeat",
  { pid: string; tasks: Task[] }
>;
export type TaskHeartbeatRes = ResSchema<"task.heartbeat", 200, undefined>;

export type ScheduleGetReq = ReqSchema<"schedule.get", { id: string }>;
export type ScheduleGetRes = ResSchema<
  "schedule.get",
  200,
  { schedule: Schedule }
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
  { schedule: Schedule }
>;

export type ScheduleDeleteReq = ReqSchema<"schedule.delete", { id: string }>;
export type ScheduleDeleteRes = ResSchema<"schedule.delete", 200, undefined>;

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
  | ScheduleDeleteRes
  | ErrorRes;
