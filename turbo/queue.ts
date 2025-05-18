import { TaskStatus } from "./enums";
import { type Task } from "./types";

export class Queue<P = any, R = any> {
  private list: Task<P, R>[] = [];

  public get length() {
    return this.list.length
  }

  public push(...items: Task<P, R>[]) {
    this.list.push(...items)
    this.sort()
  }

  public poll() {
    const item = this.list.shift()

    if (item) {
      item.status = TaskStatus.RUNNING;
      item.startTime = Date.now();
    }

    return item;
  }

  public peek(): Task<P, R> | undefined {
    return this.list[0]
  }

  public remove(id: string) {
    const length = this.length
    this.list = this.list.filter(item => item.id !== id);
    const removed = length > this.length;

    return removed;
  }

  public find(id: string): Task<P, R> | undefined {
    return this.list.find(item => item.id === id);
  }

  public clear() {
    return this.list = []
  }

  public cancel(reason) {
    this.list.forEach(task => {
      task.status = TaskStatus.CANCELLED;
      task.reject(new Error(reason));
    });
    this.clear();
  }

  private sort(): Task<P, R>[] {
    return this.list.sort((a, b) => {
      return a.priority !== b.priority
        ? b.priority - a.priority
        : a.createTime - b.createTime;

    });
  }
}