import { type Job } from "./types";
import { type Cluster } from "./Cluster";
import { MessageType } from "./enums";

export const timeoutExecute = async <T>(millis: number, promise: Promise<T>): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout hit: ${millis}`)), millis);
      promise.finally(() => clearTimeout(timer));
    }),
  ]);
};

export type WebWorker = globalThis.Worker

export interface WorkerOptions {
  id: string;
  cluster: Cluster;
  worker: WebWorker;
}

export interface WorkerMessage<P, R> {
  id?: string;
  type: MessageType;
  payload?: P | R;
  error?: Error;
  progress?: number;
}

export enum WorkerState {
  IDLE,
  BUSY,
  TERMINATING,
  TERMINATED
}

export class Worker<P, R> implements WorkerOptions {
  public readonly id: string;
  public readonly worker: WebWorker;
  public readonly cluster: Cluster;

  private state: WorkerState = WorkerState.IDLE;

  private job: Job<P, R> | null = null;

  private startTime: number = Date.now();
  private lastUsed: number = this.startTime;

  private idleTimeoutId: number | null = null;
  private abortController: AbortController = new AbortController();

  public constructor({ id, cluster, worker }: WorkerOptions) {
    this.id = id;
    this.cluster = cluster;
    this.worker = worker;

    this.setupEventListeners()
  }

  public async handle(job: Job<P, R>): Promise<R> {
    if (this.state >= WorkerState.TERMINATING)
      throw new Error(`Worker ${this.id} is terminating or terminated`);

    if (this.isBusy())
      throw new Error(`Worker ${this.id} is already processing task ${this.job!.id}`);

    this.job = job;
    this.setState(WorkerState.BUSY);

    const message: WorkerMessage<P, R> = {
      id: this.job.id,
      type: MessageType.TASK,
      payload: job.payload
    }

    this.postMessage(message, job.transferables);

    return new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
  }

  public async terminate(): Promise<void> {
    if (this.state >= WorkerState.TERMINATING) return;

    this.setState(WorkerState.TERMINATING);
    this.abortController.abort();
    this.clearIdleTimeout()
    this.cleanupEventListeners()

    try {
      this.postMessage({
        type: MessageType.TERMINATE
      });
    } finally {
      this.worker.terminate();
      this.setState(WorkerState.TERMINATED);

      if (this.job) {
        this.job.reject(new Error(`Worker ${this.id} terminated during task ${this.job.id}`));
        this.job = null;
      }
    }
  }

  public async ping(timeout = 1000): Promise<boolean> {
    if (this.state >= WorkerState.TERMINATING) return false;

    return timeoutExecute(timeout, new Promise<boolean>((resolve) => {
      const listener = (e: MessageEvent<WorkerMessage<P, R>>) => {
        if (e.data?.type === MessageType.PONG) {
          this.worker.removeEventListener("message", listener);
          resolve(true);
        }
      };

      this.abortController.signal.addEventListener("abort", () => {
        this.worker.removeEventListener("message", listener);
        resolve(false);
      });

      this.worker.addEventListener("message", listener);
      this.postMessage({ type: MessageType.PING });
    })).catch(() => false);
  }

  public isAvailable(): boolean {
    return this.state === WorkerState.IDLE;
  }

  public isBusy(): boolean {
    return this.state === WorkerState.BUSY;
  }

  public isTerminated(): boolean {
    return this.state === WorkerState.TERMINATED;
  }

  public getIdleTime(): number {
    return this.isBusy() ? 0 : Date.now() - this.lastUsed;
  }

  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  public getId(): string {
    return this.id
  }

  private setState(newState: WorkerState) {
    this.state = newState;
    this.lastUsed = Date.now();
  }

  private setupIdleTimeout() {
    this.clearIdleTimeout();

    const timeout = this.cluster.options.idleTimeout;
    if (timeout > 0) {
      this.idleTimeoutId = setTimeout(() => this.terminate(), timeout);
    }
  }

  private clearIdleTimeout() {
    if (this.idleTimeoutId !== null) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
  }

  private setupEventListeners(): void {
    this.worker.addEventListener("message", this.onMessage)
    this.worker.addEventListener("error", this.onError)
    this.worker.addEventListener("messageerror", this.onMessageError)
  }

  private cleanupEventListeners() {
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.removeEventListener("messageerror", this.onMessageError);
  }

  private onMessage = (e: MessageEvent<WorkerMessage<P, R>>) => {
    const message = e.data as WorkerMessage<P, R>;
   
    if (!this.job && message.type === MessageType.PONG) return
    switch (message.type) {
      case MessageType.COMPLETED:
        if (this.job && message.id === this.job.id) {
          this.completedTask(message.payload as R);
        }
        break;
      case MessageType.ERROR:
        if (this.job && message.id === this.job.id) {
          const error = new Error(message.error?.message || 'unknown error');
          if (message.error?.stack) {
            error.stack = message.error.stack;
          }
          this.failTask(error);
        }
        break;
      case MessageType.PROGRESS:
        if (this.job && message.id === this.job.id && typeof message.progress === 'number') {
          this.job.onProgress?.(message.progress);
        }
        break;
      case MessageType.PONG:
        break;
    }
  }

  private onError = (e: ErrorEvent | Error) => {
    let error: Error;

    if (e instanceof ErrorEvent) {
      error = new Error(e.message);
      error.stack = `at ${e.filename}:${e.lineno}:${e.colno}`;
    } else {
      error = e;
    }

    if (this.job) {
      this.failTask(error);
    }
  }

  private onMessageError = (e: MessageEvent<WorkerMessage<P, R>>) => {
    const error = new Error('Worker message could not be parsed');

    if (this.job) {
      this.failTask(error);
    }
  }

  private completedTask(payload: R) {
    if (!this.job) return;

    const task = this.job;

    this.job = null;
    this.setState(WorkerState.IDLE);
    this.setupIdleTimeout();

    task.resolve(payload)
  }

  private failTask(error: Error) {
    if (!this.job) return;

    const task = this.job;

    this.job = null;
    this.state = WorkerState.IDLE;
    this.lastUsed = Date.now();
    this.setupIdleTimeout();

    task.reject(error)
  }

  private postMessage(message: WorkerMessage<P, R>, transferables?: Transferable[]): void {
    try {
      if (transferables?.length) {
        this.worker.postMessage(message, transferables);
      } else {
        this.worker.postMessage(message);
      }
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}