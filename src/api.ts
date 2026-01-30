import type { Promise, Schedule, Task } from "./entities";

export type PromiseGetReq = {
  kind: "promise.get";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { id: string };
};

export type PromiseGetRes =
  | {
      kind: "promise.get";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: { promise: Promise };
    }
  | {
      kind: "promise.get";
      head: { corrId: string; status: 404; version: string };
      data: string;
    };

export type PromiseCreateReq = {
  kind: "promise.create";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: {
    id: string;
    param: { headers: { [key: string]: string }; data: string };
    tags: { [key: string]: string };
    timeoutAt: number;
  };
};

export type PromiseCreateRes = {
  kind: "promise.create";
  head: {
    corrId: string;
    status: 200;
    version: string;
  };
  data: { promise: Promise };
};

export type PromiseSettleReq = {
  kind: "promise.settle";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: {
    id: string;
    state: "resolved" | "rejected" | "rejected_canceled";
    value: { headers: { [key: string]: string }; data: string };
  };
};

export type PromiseSettleRes =
  | {
      kind: "promise.settle";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: { promise: Promise };
    }
  | {
      kind: "promise.settle";
      head: { corrId: string; status: 404; version: string };
      data: string;
    };

export type PromiseRegisterReq = {
  kind: "promise.register";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { awaiter: string; awaited: string };
};

export type PromiseRegisterRes =
  | {
      kind: "promise.register";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: { promise: Promise };
    }
  | {
      kind: "promise.register";
      head: { corrId: string; status: 404; version: string };
      data: string;
    };

export type PromiseSubscribeReq = {
  kind: "promise.subscribe";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { awaited: string; address: string };
};

export type PromiseSubscribeRes =
  | {
      kind: "promise.subscribe";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: { promise: Promise };
    }
  | {
      kind: "promise.subscribe";
      head: { corrId: string; status: 404; version: string };
      data: string;
    };

export type TaskGetReq = {
  kind: "task.get";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { id: string };
};

export type TaskGetRes =
  | {
      kind: "task.get";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: { task: Task };
    }
  | {
      kind: "task.get";
      head: { corrId: string; status: 404; version: string };
      data: string;
    };

export type TaskCreateReq = {
  kind: "task.create";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { pid: string; ttl: number; action: PromiseCreateReq };
};

export type TaskCreateRes = {
  kind: "task.create";
  head: {
    corrId: string;
    status: 200;
    version: string;
  };
  data: { task?: Task; promise: Promise };
};

export type TaskAcquireReq = {
  kind: "task.acquire";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { id: string; version: number; pid: string; ttl: number };
};

export type TaskAcquireRes =
  | {
      kind: "task.acquire";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: {
        kind: "invoke" | "resume";
        data: { promise: Promise; preload: Promise[] };
      };
    }
  | {
      kind: "task.acquire";
      head: { corrId: string; status: 404; version: string };
      data: string;
    }
  | {
      kind: "task.acquire";
      head: { corrId: string; status: 409; version: string };
      data: string;
    };

export type TaskSuspendReq = {
  kind: "task.suspend";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: {
    id: string;
    version: number;
    actions: PromiseRegisterReq[];
  };
};

export type TaskSuspendRes =
  | {
      kind: "task.suspend";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: undefined;
    }
  | {
      kind: "task.suspend";
      head: {
        corrId: string;
        status: 300;
        version: string;
      };
      data: undefined;
    }
  | {
      kind: "task.suspend";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    }
  | {
      kind: "task.suspend";
      head: {
        corrId: string;
        status: 409;
        version: string;
      };
      data: string;
    };

export type TaskFulfillReq = {
  kind: "task.fulfill";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: {
    id: string;
    version: number;
    action: PromiseSettleReq;
  };
};

export type TaskFulfillRes =
  | {
      kind: "task.fulfill";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: {
        promise: Promise;
      };
    }
  | {
      kind: "task.fulfill";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    }
  | {
      kind: "task.fulfill";
      head: {
        corrId: string;
        status: 409;
        version: string;
      };
      data: string;
    };

export type TaskReleaseReq = {
  kind: "task.release";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { id: string; version: number };
};

export type TaskReleaseRes =
  | {
      kind: "task.release";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: undefined;
    }
  | {
      kind: "task.release";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    }
  | {
      kind: "task.release";
      head: {
        corrId: string;
        status: 409;
        version: string;
      };
      data: string;
    };

export type TaskFenceReq = {
  kind: "task.fence";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: {
    id: string;
    version: number;
    action: PromiseCreateReq | PromiseSettleReq;
  };
};

export type TaskFenceRes =
  | {
      kind: "task.fence";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: {
        action: PromiseCreateRes | PromiseSettleRes;
      };
    }
  | {
      kind: "task.fence";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    }
  | {
      kind: "task.fence";
      head: {
        corrId: string;
        status: 409;
        version: string;
      };
      data: string;
    };

export type TaskHeartbeatReq = {
  kind: "task.heartbeat";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { pid: string; tasks: Task[] };
};

export type TaskHeartbeatRes =
  | {
      kind: "task.heartbeat";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: undefined;
    }
  | {
      kind: "task.heartbeat";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    };

export type ScheduleGetReq = {
  kind: "schedule.get";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { id: string };
};

export type ScheduleGetRes =
  | {
      kind: "schedule.get";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: {
        schedule: Schedule;
      };
    }
  | {
      kind: "schedule.get";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    };

export type ScheduleCreateReq = {
  kind: "schedule.create";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: {
    id: string;
    cron: string;
    promiseId: string;
    promiseTimeout: number;
    promiseParam: { headers: { [key: string]: string }; data: string };
    promiseTags: { [key: string]: string };
  };
};

export type ScheduleCreateRes = {
  kind: "schedule.create";
  head: {
    corrId: string;
    status: 200;
    version: string;
  };
  data: { schedule: Schedule };
};

export type ScheduleDeleteReq = {
  kind: "schedule.delete";
  head: {
    auth?: string;
    corrId: string;
    version: string;
  };
  data: { id: string };
};

export type ScheduleDeleteRes =
  | {
      kind: "schedule.delete";
      head: {
        corrId: string;
        status: 200;
        version: string;
      };
      data: undefined;
    }
  | {
      kind: "schedule.delete";
      head: {
        corrId: string;
        status: 404;
        version: string;
      };
      data: string;
    };

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
