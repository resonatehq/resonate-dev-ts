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
