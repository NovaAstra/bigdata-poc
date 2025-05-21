import { type Task } from "./types"

export class Queue<P, R> {
  private list: Task<P, R>[] = [];
  private readonly idMap: Map<string, Task<P, R>> = new Map();

  public get size(): number {
    return this.list.length;
  }

  public isEmpty(): boolean {
    return this.size === 0
  }

  public push(...items: Task<P, R>[]): void {
    for (const item of items) {
      this.idMap.set(item.id, item);
    }
    this.list.push(...items);
  }

  public shift(): Task<P, R> | undefined {
    const item = this.list.shift();
    if (item) {
      this.idMap.delete(item.id);
    }
    return item;
  }

  public peek(): Task<P, R> | undefined {
    return this.list[0]
  }

  public unshift(...items: Task<P, R>[]): void {
    for (const item of items) {
      this.idMap.set(item.id, item);
    }
    this.list.unshift(...items);
  }

  public remove(id: string) {
    const item = this.idMap.get(id);
    if (!item) return false;

    this.idMap.delete(id);
    const index = this.list.indexOf(item);
    if (index !== -1) {
      this.list.splice(index, 1);
      return true;
    }
    return false;
  }

  public find(id: string): Task<P, R> | undefined {
    return this.idMap.get(id);
  }
  public clear() {
    this.list = [];
    this.idMap.clear();
  }

  public toArray(): Task<P, R>[] {
    return [...this.list];
  }
}
