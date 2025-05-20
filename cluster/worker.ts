import { type Task } from "./types";
import { type Cluster } from "./cluster";
import { MessageType } from "./enums";

export const timeoutExecute = async <T>(millis: number, promise: Promise<T>): Promise<T> => {
  let timeout: number | undefined;

  const result = await Promise.race([
    (async () => {
      await new Promise((resolve) => {
        timeout = setTimeout(resolve, millis);
      });
      throw new Error(`Timeout hit: ${millis}`);
    })(),
    (async () => {
      try {
        return await promise;
      } catch (error: any) {
        // Cancel timeout in error case
        clearTimeout(timeout);
        throw error;
      }
    })(),
  ]);
  clearTimeout(timeout); // is there a better way?
  return result;
}

export type WebWorker = globalThis.Worker

export interface WorkerOptions {
  id: string;
  cluster: Cluster;
  worker: WebWorker;
}

export interface WorkerMessage<P, R> {
  id: string;
  type: MessageType;
  payload?: P | R;
  error?: Error;
  progress?: number;
}

export class Worker<P, R> implements WorkerOptions {
  public readonly id: string;
  public readonly worker: WebWorker;
  public readonly cluster: Cluster;

  public closed: boolean = false

  private currentTask: Task<P, R> | null = null;

  private startTime: number;
  private lastUsed: number;

  private idleTimeoutId: number | null = null;

  public constructor({ id, cluster, worker }: WorkerOptions) {
    this.id = id;
    this.cluster = cluster;
    this.worker = worker;

    this.startTime = Date.now();
    this.lastUsed = this.startTime;

    this.setupEventListeners()
  }

  public async handle(task: Task<P, R>) {
    if (this.closed)
      throw new Error(`Worker ${this.id} is terminated and cannot process tasks`);

    if (this.currentTask)
      throw new Error(`Worker ${this.id} is currently executing task ${this.currentTask.id} and cannot process multiple tasks simultaneously`);

    return new Promise((resolve, reject) => {
      this.currentTask = {
        ...task,

        resolve: (value: R) => {
          task.resolve(value);
          resolve(value);
        },
        reject: (error: any) => {
          task.reject(error);
          reject(error);
        }
      };
      this.lastUsed = Date.now();

      const message: WorkerMessage<P, R> = {
        id: task.id,
        type: MessageType.TASK,
        payload: task.payload
      }

      try {
        if (task.transferables && task.transferables.length > 0) {
          this.worker.postMessage(message, task.transferables);
        } else {
          this.worker.postMessage(message);
        }
      } catch (error) {
        this.onError(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  public async terminate(): Promise<void> {
    if (this.closed) return;

    this.worker.postMessage({ type: MessageType.TERMINATE });
    this.worker.terminate();
    this.clearIdleTimeout()
    this.closed = true;

    if (this.currentTask) {
      this.currentTask.reject(new Error(`Worker ${this.id} has been terminated. Task ${this.currentTask.id} has been cancelled.`));
      this.currentTask = null;
    }
  }

  public async ping(): Promise<boolean> {
    return new Promise(resolve => {
      const timeoutId = setTimeout(() => resolve(false), 1000);

      const listener = (e: MessageEvent<WorkerMessage<P, R>>) => {
        try {
          const message = e.data as WorkerMessage<P, R>;
          if (message.type === MessageType.PONG) {
            clearTimeout(timeoutId);
            this.worker.removeEventListener('message', listener);
            resolve(true);
          }
        } catch (error) { }
      }

      this.worker.addEventListener("message", listener)
      this.worker.postMessage({ type: MessageType.PING });
    })
  }

  public isBusy(): boolean {
    return this.currentTask !== null;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public getId(): string {
    return this.id
  }

  public getIdleTime(): number {
    const now = Date.now();
    return this.isBusy() ? 0 : now - this.lastUsed;
  }

  private setupIdleTimeout() {
    this.clearIdleTimeout()
    if (this.cluster.options.idleTimeout > 0) {
      this.idleTimeoutId = setTimeout(() => {
        this.terminate();
      }, this.cluster.options.idleTimeout);
    }
  }

  private clearIdleTimeout() {
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
  }

  private setupEventListeners(): void {
    this.worker.addEventListener("message", this.onMessage.bind(this))
    this.worker.addEventListener("error", this.onError.bind(this))
    this.worker.addEventListener("messageerror", this.onMessageError.bind(this))
  }

  private onMessage(e: MessageEvent<WorkerMessage<P, R>>) {
    const message = e.data as WorkerMessage<P, R>;
    console.log(e)
    if (!this.currentTask && message.type !== MessageType.PONG) {
      return
    }

    switch (message.type) {
      case MessageType.COMPLETED:
        if (this.currentTask && message.id === this.currentTask.id) {
          this.completedTask(message.payload as R);
        }
        break;
      case MessageType.ERROR:
        if (this.currentTask && message.id === this.currentTask.id) {
          const error = new Error(message.error?.message || 'unknown error');
          if (message.error?.stack) {
            error.stack = message.error.stack;
          }
          this.failTask(error);
        }
        break;
      case MessageType.PROGRESS:
        break;
      case MessageType.PONG:
        break;
    }
  }

  private onError(e: ErrorEvent | Error) {
    let error: Error;

    if (e instanceof ErrorEvent) {
      error = new Error(e.message);
      error.stack = `at ${e.filename}:${e.lineno}:${e.colno}`;
    } else {
      error = e;
    }

    if (this.currentTask) {
      this.failTask(error);
    }
  }

  private onMessageError(_e: MessageEvent) {
    const error = new Error('Worker message could not be parsed');

    if (this.currentTask) {
      this.failTask(error);
    }
  }

  private completedTask(result: R) {
    if (!this.currentTask) return;

    const task = this.currentTask;

    this.currentTask = undefined;
    this.lastUsed = Date.now();
    task.resolve(result)
  }

  private failTask(error: Error) {
    if (!this.currentTask) return;

    const task = this.currentTask;

    this.currentTask = undefined;
    this.lastUsed = Date.now();

    task.reject(error)
  }
}