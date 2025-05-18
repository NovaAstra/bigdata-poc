import { type Task } from "./types";
import { nanoid } from "nanoid";
import { Logger } from "./logger"

export enum MessageType {
  TASK,
  RESULT,
  ERROR,
  PROGRESS,
  TERMINATE,
  PING,
  PONG
}

export interface WorkerMessage<P> {
  type: MessageType;
  id?: string;
  payload?: P;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}


export class Agent<P = any, R= any> {
  public readonly id: string = nanoid()

  private isTerminated: boolean = false;

  private activeTarget: Task<P, R> | null = null;

  private startTime: number;
  private lastUpdateTime: number;

  constructor(private readonly worker: Worker) {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;

    this.setupEvents()
  }

  public execute(task: Task<P, R>) {
    if (this.isTerminated)
      throw new Error(`Worker ${this.id} 已终止，无法执行任务`);

    if (this.activeTarget)
      throw new Error(`Worker ${this.id} 正在执行任务 ${this.activeTarget.id}，无法同时执行多个任务`);

    this.activeTarget = task;
    this.lastUpdateTime = Date.now();

    const message: WorkerMessage<P> = {
      type: MessageType.TASK,
      id: task.id,
      payload: task.payload
    }

    try {
      if (task.transfer && task.transfer.length > 0) {
        this.worker.postMessage(message, task.transfer)
      } else {
        this.worker.postMessage(message)
      }

    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public terminate() {
    if (this.isTerminated) return;

    try {
      this.worker.postMessage({ type: MessageType.TERMINATE });
      this.worker.terminate();
      this.isTerminated = true


      if (this.activeTarget) {
        this.activeTarget.reject(new Error(`Worker ${this.id} 已终止，任务 ${this.activeTarget.id} 已取消`));
        this.activeTarget = null;
      }
    } catch (error) {
    }
  }

  private setupEvents() {
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener('error', this.onError);
    this.worker.addEventListener('messageerror', this.onMessageError);
  }

  private onMessage(event: MessageEvent) {
    try {
      const message = event.data as WorkerMessage<P>;

      if (!this.activeTarget && message.type !== MessageType.PONG) {
        return;
      }

      switch (message.type) {
        case MessageType.RESULT:
          if (this.activeTarget && message.id === this.activeTarget.id) {
            this.completeTask(message.payload);
          }
          break;
      }
    } catch (error) {

    }
  }

  private onError(event: ErrorEvent | Error) { }

  private onMessageError() { }

  private completeTask(payload?: P) {
    if (!this.activeTarget) return;

    const task = this.activeTarget;

    this.activeTarget = null;
    this.lastUpdateTime = Date.now();
    task.resolve(payload as R);
  }
}