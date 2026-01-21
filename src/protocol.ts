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
type Req<K extends string, T> = {
  kind: K;
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: T;
};

type Res<K extends string, S extends number, T> = {
  kind: K;
  head: {
    corrId: string;
    status: S;
    version: string;
  };
  data: T;
};

export type ErrorCode = 400 | 404 | 409 | 429 | 500;
export type ErrorRes = Res<"error", ErrorCode, string>;

export type PromiseGetReq = Req<"promise.get", { id: "string" }>;
export type PromiseGetRes = Res<"promise.get", 200, { promise: Promise }>;

export type PromiseCreateReq = Req<
  "promise.create",
  {
    id: string;
    param: { headers: { [key: string]: string }; data: string };
    tags: { [key: string]: string };
    timeoutAt: number;
  }
>;
export type PromiseCreateRes = Res<"promise.create", 200, { promise: Promise }>;

export type PromiseSettleReq = Req<
  "promise.settle",
  {
    id: string;
    state: "resolved" | "rejected" | "rejected_canceled";
    value: { headers: { [key: string]: string }; data: string };
  }
>;
export type PromiseSettleRes = Res<"promise.settle", 200, { promise: Promise }>;

export type PromiseRegisterReq = Req<
  "promise.register",
  { awaiter: string; awaited: string }
>;
export type PromiseRegisterRes = Res<
  "promise.register",
  200,
  { promise: Promise }
>;

export type PromiseSubscribeReq = Req<
  "promise.subscribe",
  { awaited: string; address: string }
>;
export type PromiseSubscribeRes = Res<
  "promise.subscribe",
  200,
  { promise: Promise }
>;

export type TaskGetReq = Req<"task.get", { id: string }>;
export type TaskGetRes = Res<"task.get", 200, { task: Task }>;

export type TaskCreateReq = Req<
  "task.create",
  { pid: string; ttl: number; action: PromiseCreateReq }
>;
export type TaskCreateRes = Res<
  "task.create",
  200,
  { task?: Task; promise: Promise }
>;

export type TaskAcquireReq = Req<
  "task.acquire",
  { id: string; version: number; pid: string; ttl: number }
>;
export type TaskAcquireRes = Res<
  "task.acquire",
  200,
  | { kind: "invoke"; data: { invoked: Promise } }
  | { kind: "resume"; data: { invoked: Promise; awaited: Promise } }
>;

export type TaskSuspendReq = Req<
  "task.suspend",
  {
    id: string;
    version: number;
    actions: PromiseRegisterReq[];
  }
>;
export type TaskSuspendRes = Res<"task.suspend", 200 | 300, undefined>;

export type TaskFulfillReq = Req<
  "task.fulfill",
  {
    id: string;
    version: number;
    action: PromiseSettleReq;
  }
>;
export type TaskFulfillRes = Res<"task.fulfill", 200, { promise: Promise }>;

export type TaskReleaseReq = Req<
  "task.release",
  { id: string; version: number }
>;
export type TaskReleaseRes = Res<"task.release", 200, undefined>;

export type TaskFenceReq = Req<
  "task.fence",
  {
    id: string;
    version: number;
    action: PromiseCreateReq | PromiseSettleReq;
  }
>;
export type TaskFenceRes = Res<
  "task.fence",
  200,
  { action: PromiseCreateRes | PromiseSettleRes }
>;

export type TaskHeartbeatReq = Req<
  "task.heartbeat",
  { pid: string; tasks: Task[] }
>;
export type TaskHeartbeatRes = Res<"task.heartbeat", 200, undefined>;

export type ScheduleGetReq = Req<"schedule.get", { id: string }>;
export type ScheduleGetRes = Res<"schedule.get", 200, { schedule: Schedule }>;

export type ScheduleCreateReq = Req<
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
export type ScheduleCreateRes = Res<
  "schedule.create",
  200,
  { schedule: Schedule }
>;

export type ScheduleDeleteReq = Req<"schedule.delete", { id: string }>;
export type ScheduleDeleteRes = Res<"schedule.delete", 200, undefined>;
