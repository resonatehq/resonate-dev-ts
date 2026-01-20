export type ErrorRes = {
  kind: string;
  head: {
    corrId: string;
    status: 400 | 404 | 429 | 500;
  };
  data: string;
};
export type Promise = {
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
};

export type Task = {
  id: string;
  version: number;
};

export type Schedule = {
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

export type Message = InvokeMessage | ResumeMessage;

export type InvokeMessage = {
  kind: "invoke";
  head: Record<string, string>;
  data: {
    task: Task;
  };
};

export type ResumeMessage = {
  kind: "resume";
  head: Record<string, string>;
  data: {
    task: Task;
  };
};

export type PromiseGetReq = {
  kind: "promise.get";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
  };
};

export type PromiseGetRes = {
  kind: "promise.get";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
  };
};

export type PromiseCreateReq = {
  kind: "promise.create";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    param?: { headers: Record<string, string>; data: string };
    tags?: Record<string, string>;
    timeoutAt: number;
  };
};

export type PromiseCreateRes = {
  kind: "promise.create";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
  };
};

export type PromiseSettleReq = {
  kind: "promise.settle";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    state: "resolved" | "rejected" | "rejected_canceled";
    value?: { headers: Record<string, string>; data: string };
  };
};

export type PromiseSettleRes = {
  kind: "promise.settle";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
  };
};

export type PromiseRegisterReq = {
  kind: "promise.register";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    awaiter: string;
    awaited: string;
  };
};

export type PromiseRegisterRes = {
  kind: "promise.register";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
  };
};

export type PromiseSubscribeReq = {
  kind: "promise.subscribe";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    address: string;
  };
};

export type PromiseSubscribeRes = {
  kind: "promise.subscribe";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
  };
};

export type TaskGetReq = {
  kind: "task.get";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
  };
};

export type TaskGetRes = {
  kind: "task.get";
  head: {
    status: 200;
  };
  data: {
    task: Task;
  };
};

export type TaskCreateReq = {
  kind: "task.create";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    pid: string;
    ttl: number;
    action: PromiseCreateReq;
  };
};

export type TaskCreateRes = {
  kind: "task.create";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
    task?: Task;
  };
};

export type TaskAcquireReq = {
  kind: "task.acquire";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    version: number;
    pid: string;
    ttl: number;
  };
};

export type TaskAcquireRes = {
  kind: "task.acquire";
  head: {
    status: 200;
  };
  data:
    | { kind: "invoke"; data: { invoked: Promise } }
    | { kind: "resume"; data: { invoked: Promise; awaited: Promise } };
};

export type TaskSuspendReq = {
  kind: "task.suspend";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    version: number;
    actions: PromiseRegisterReq[];
  };
};

export type TaskSuspendRes = {
  kind: "task.suspend";
  head: {
    status: 200 | 300;
  };
};

export type TaskFulfillReq = {
  kind: "task.fulfill";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    version: number;
    action: PromiseSettleReq;
  };
};

export type TaskFulfillRes = {
  kind: "task.fulfill";
  head: {
    status: 200;
  };
  data: {
    promise: Promise;
  };
};

export type TaskReleaseReq = {
  kind: "task.release";
  head: {
    auth?: string;
    corrId: string;
  };
};

export type TaskReleaseRes = {
  kind: "task.release";
  head: {
    status: 200;
  };
};

export type TaskFenceReq = {
  kind: "task.fence";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    version: number;
    action: PromiseCreateReq | PromiseSettleReq;
  };
};

export type TaskFenceRes = {
  kind: "task.fence";
  head: {
    status: 200;
  };
  data: {
    action: PromiseCreateRes | PromiseSettleRes;
  };
};

export type TaskHeartbeatReq = {
  kind: "task.heartbeat";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    pid: string;
    tasks: Task[];
  };
};

export type TaskHeartbeatRes = {
  kind: "task.heartbeat";
  head: {
    status: 200;
  };
};

export type ScheduleGetReq = {
  kind: "schedule.get";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
  };
};

export type ScheduleGetRes = {
  kind: "schedule.get";
  head: {
    status: 200;
  };
  data: {
    schedule: Schedule;
  };
};

export type ScheduleCreateReq = {
  kind: "schedule.create";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
    cron: string;
    promiseId: string;
    promiseTimeout: number;
    promiseParam?: { headers: Record<string, string>; data: string };
    promiseTags?: Record<string, string>;
  };
};

export type ScheduleCreateRes = {
  kind: "schedule.create";
  head: {
    status: 200;
  };
  data: {
    schedule: Schedule;
  };
};

export type ScheduleDeleteReq = {
  kind: "schedule.delete";
  head: {
    auth?: string;
    corrId: string;
  };
  data: {
    id: string;
  };
};

export type ScheduleDeleteRes = {
  kind: "schedule.delete";
  head: {
    status: 200;
  };
};
