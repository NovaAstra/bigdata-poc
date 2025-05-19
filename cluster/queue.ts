import { type Task } from "./types"

export class Queue<P, R> {
  private list: Task<P, R>[] = [];

  public get size(): number {
    return this.list.length;
  }

  public push(...items: Task<P, R>[]): void {
    this.list.push(...items);
  }

  public shift(): Task<P, R> | undefined {
    return this.list.shift();
  }

  public remove(id: string) {
    const index = this.list.findIndex(t => t.id === id);
    if (index !== -1) {
      this.list.splice(index, 1);
      return true;
    }
    return false;
  }

  public find(id: string): Task<P, R> | undefined {
    return this.list.find(item => item.id === id)
  }
}
