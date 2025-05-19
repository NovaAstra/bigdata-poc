export enum TaskStatus {
  PENDING,
  RUNNING,
  COMPLETED,
  FAILED,
  TIMEOUT,
  CANCELLED
}

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

export enum LogLevel {

}

export enum MessageType {
  TASK,
  COMPLETED,
  ERROR,
  PROGRESS,
  TERMINATE,
  PING,
  PONG
}