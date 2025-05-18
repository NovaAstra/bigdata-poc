import { TaskStatus } from "./enums";

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

export interface Task<P, R> {
  id: string;
  status: TaskStatus;
  payload: P;
  priority: TaskPriority;
  retries: number;
  transfer?: Transferable[];
  maxRetries: number;
  timeout: number;
  timeoutId?: number;
  resolve: (result: R) => void;
  reject: (error: Error) => void;

  createTime: number;
  startTime?: number;
  completeTime?: number;
}
