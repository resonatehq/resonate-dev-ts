import { test } from "bun:test";
import {
  type Promise,
  type PromiseRegisterReq,
  type Req,
  Server,
  type Task,
} from "../src";

class Random {
  constructor(public seed: number = Date.now()) {}

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  bool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  choice<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  string(length: number = 10): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () => this.choice([...chars])).join("");
  }

  id(): string {
    return `id_${this.string(8)}`;
  }
}

class State {
  time = 0;
  promises: { [key: string]: Promise } = {};
  tasks: { [key: string]: Task } = {};

  addPromise({ id, promise }: { id: string; promise: Promise }) {
    this.promises[id] = promise;
  }

  addTask({ id, task }: { id: string; task: Task }) {
    this.tasks[id] = task;
  }

  getPromise(id: string): Promise | undefined {
    return this.promises[id];
  }

  getTask(id: string): Task | undefined {
    return this.tasks[id];
  }

  getRandomPromiseId(): string | undefined {
    const ids = Object.keys(this.promises);
    return ids.length > 0
      ? ids[Math.floor(Math.random() * ids.length)]
      : undefined;
  }

  getRandomTaskId(): string | undefined {
    const ids = Object.keys(this.tasks);
    return ids.length > 0
      ? ids[Math.floor(Math.random() * ids.length)]
      : undefined;
  }

  getPendingPromises(): Promise[] {
    return Object.values(this.promises).filter((p) => p.state === "pending");
  }

  getSettledPromises(): Promise[] {
    return Object.values(this.promises).filter((p) => p.state !== "pending");
  }

  getAllTasks(): Task[] {
    return Object.values(this.tasks);
  }

  clear() {
    this.time = 0;
    this.promises = {};
    this.tasks = {};
  }

  getPromiseCount(): number {
    return Object.keys(this.promises).length;
  }

  getTaskCount(): number {
    return Object.keys(this.tasks).length;
  }
}
class RequestGenerator {
  constructor(
    private rng: Random,
    private state: State,
  ) {}

  generatePromiseCreate(): Req {
    const id = this.rng.id();
    const timeoutAt = this.state.time + this.rng.int(100, 10000);

    // Optionally include the invoke tag (30% chance to omit it)
    const tags: { [key: string]: string } = {
      "resonate:timeout": this.rng.bool(0.1) ? "true" : "false",
    };

    if (this.rng.bool(0.7)) {
      tags["resonate:invoke"] = "default";
    }

    return {
      kind: "promise.create",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        id,
        param: {
          headers: {},
          data: this.rng.string(20),
        },
        tags,
        timeoutAt,
      },
    };
  }

  generatePromiseGet(): Req {
    const id = this.state.getRandomPromiseId() ?? this.rng.id();

    return {
      kind: "promise.get",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: { id },
    };
  }

  generatePromiseSettle(): Req | null {
    const id = this.state.getRandomPromiseId();
    if (!id) return null;

    return {
      kind: "promise.settle",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        id,
        state: this.rng.choice(["resolved", "rejected", "rejected_canceled"]),
        value: {
          headers: {},
          data: this.rng.string(15),
        },
      },
    };
  }

  generatePromiseRegister(): Req | null {
    const awaited = this.state.getRandomPromiseId();
    const awaiter = this.state.getRandomPromiseId();

    if (!awaited || !awaiter) return null;

    return {
      kind: "promise.register",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: { awaiter, awaited },
    };
  }

  generatePromiseSubscribe(): Req | null {
    const awaited = this.state.getRandomPromiseId();
    if (!awaited) return null;

    return {
      kind: "promise.subscribe",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        awaited,
        address: `addr_${this.rng.string(8)}`,
      },
    };
  }

  generateTaskCreate(): Req {
    const id = this.rng.id();
    const timeoutAt = this.state.time + this.rng.int(100, 10000);

    const tags: { [key: string]: string } = {};
    if (this.rng.bool(0.8)) {
      tags["resonate:invoke"] = "default";
    }

    return {
      kind: "task.create",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        pid: `pid_${this.rng.string(8)}`,
        ttl: this.rng.int(100, 5000),
        action: {
          kind: "promise.create",
          head: {
            corrId: this.rng.id(),
            version: "2025-01-15",
          },
          data: {
            id,
            param: {
              headers: {},
              data: this.rng.string(20),
            },
            tags,
            timeoutAt,
          },
        },
      },
    };
  }

  generateTaskAcquire(): Req | null {
    const id = this.state.getRandomTaskId();
    if (!id) return null;

    const task = this.state.getTask(id);
    if (!task) return null;

    return {
      kind: "task.acquire",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        id,
        version: task.version,
        pid: `pid_${this.rng.string(8)}`,
        ttl: this.rng.int(100, 5000),
      },
    };
  }

  generateTaskRelease(): Req | null {
    const id = this.state.getRandomTaskId();
    if (!id) return null;

    const task = this.state.getTask(id);
    if (!task) return null;

    return {
      kind: "task.release",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        id,
        version: this.rng.bool(0.8) ? task.version : this.rng.int(1, 10),
      },
    };
  }

  generateTaskHeartbeat(): Req {
    return {
      kind: "task.heartbeat",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        pid: `pid_${this.rng.string(8)}`,
        tasks: [],
      },
    };
  }

  generateTaskSuspend(): Req | null {
    const id = this.state.getRandomTaskId();
    if (!id) return null;

    const task = this.state.getTask(id);
    if (!task) return null;

    const actions: PromiseRegisterReq[] = [];
    const numActions = this.rng.int(0, 3);

    for (let i = 0; i < numActions; i++) {
      const awaited = this.state.getRandomPromiseId();
      const awaiter = this.state.getRandomPromiseId();

      if (awaited && awaiter) {
        actions.push({
          kind: "promise.register",
          head: {
            corrId: this.rng.id(),
            version: "2025-01-15",
          },
          data: { awaiter, awaited },
        });
      }
    }

    return {
      kind: "task.suspend",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: {
        id,
        version: task.version,
        actions,
      },
    };
  }

  generateTaskGet(): Req | null {
    const id = this.state.getRandomTaskId() ?? this.rng.id();

    return {
      kind: "task.get",
      head: {
        corrId: this.rng.id(),
        version: "2025-01-15",
      },
      data: { id },
    };
  }
}

class FuzzTester {
  private server: Server;
  private rng: Random;
  private state: State;
  private generator: RequestGenerator;
  private stats = {
    total: 0,
    errors: 0,
    successes: 0,
    crashes: 0,
  };

  constructor(seed?: number) {
    this.server = new Server();
    this.rng = new Random(seed);
    this.state = new State();
    this.generator = new RequestGenerator(this.rng, this.state);
  }

  private generateRequest(): Req | null {
    const operations = [
      { weight: 20, fn: () => this.generator.generatePromiseCreate() },
      { weight: 10, fn: () => this.generator.generatePromiseGet() },
      { weight: 15, fn: () => this.generator.generatePromiseSettle() },
      { weight: 10, fn: () => this.generator.generatePromiseRegister() },
      { weight: 5, fn: () => this.generator.generatePromiseSubscribe() },
      { weight: 20, fn: () => this.generator.generateTaskCreate() },
      { weight: 10, fn: () => this.generator.generateTaskAcquire() },
      { weight: 5, fn: () => this.generator.generateTaskRelease() },
      { weight: 3, fn: () => this.generator.generateTaskHeartbeat() },
      { weight: 5, fn: () => this.generator.generateTaskSuspend() },
      { weight: 7, fn: () => this.generator.generateTaskGet() },
    ];

    const totalWeight = operations.reduce((sum, op) => sum + op.weight, 0);
    let rand = this.rng.next() * totalWeight;

    for (const op of operations) {
      rand -= op.weight;
      if (rand <= 0) {
        return op.fn();
      }
    }

    return operations[0].fn();
  }

  runIteration(): void {
    try {
      this.stats.total++;

      // Generate and execute request
      const req = this.generateRequest();
      if (!req) {
        return;
      }

      const res = this.server.process({ at: this.state.time, req });

      // Update state based on response
      if (res.kind === "error") {
        this.stats.errors++;
      } else {
        this.stats.successes++;

        // Track promises and tasks from responses
        switch (res.kind) {
          case "promise.create":
          case "promise.get":
          case "promise.settle":
          case "promise.register":
          case "promise.subscribe":
            this.state.addPromise({
              id: res.data.promise.id,
              promise: res.data.promise,
            });
            break;
          case "task.create":
            this.state.addPromise({
              id: res.data.promise.id,
              promise: res.data.promise,
            });
            if (res.data.task) {
              this.state.addTask({ id: res.data.task.id, task: res.data.task });
            }
            break;
          case "task.get":
            this.state.addTask({ id: res.data.task.id, task: res.data.task });
            break;
        }
      }

      // Advance time randomly
      if (this.rng.bool(0.2)) {
        this.state.time += this.rng.int(1, 100);
      }

      // Run step processing
      if (this.rng.bool(0.3)) {
        this.server.step({ at: this.state.time });
      }

      // Get next timeout
      if (this.rng.bool(0.1)) {
        this.server.next({ at: this.state.time });
      }
    } catch (error) {
      this.stats.crashes++;
      console.error(`Crash at iteration ${this.stats.total}:`, error);
      throw error;
    }
  }

  run(iterations: number): void {
    console.log(
      `Starting fuzz test with ${iterations} iterations (seed: ${this.rng.seed})`,
    );

    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      this.runIteration();

      if ((i + 1) % 1000 === 0) {
        console.log(
          `Progress: ${i + 1}/${iterations} - Promises: ${this.state.getPromiseCount()}, Tasks: ${this.state.getTaskCount()}`,
        );
      }
    }

    const elapsed = Date.now() - startTime;

    console.log("\n=== Fuzz Test Results ===");
    console.log(`Total operations: ${this.stats.total}`);
    console.log(`Successes: ${this.stats.successes}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`Crashes: ${this.stats.crashes}`);
    console.log(
      `Final state - Promises: ${this.state.getPromiseCount()}, Tasks: ${this.state.getTaskCount()}`,
    );
    console.log(`Pending promises: ${this.state.getPendingPromises().length}`);
    console.log(`Settled promises: ${this.state.getSettledPromises().length}`);
    console.log(`Time elapsed: ${elapsed}ms`);
    console.log(`Ops/sec: ${Math.round((this.stats.total / elapsed) * 1000)}`);
    console.log(
      `Success rate: ${((this.stats.successes / this.stats.total) * 100).toFixed(2)}%`,
    );
  }
}

test("fuzz", () => {
  const seed = Date.now();
  console.log(seed);
  const tester = new FuzzTester(seed);
  tester.run(100_000);
});
