import { type Job } from "./types"

export class Queue<P, R> {
  private list: Job<P, R>[] = [];
  private readonly idMap: Map<string, Job<P, R>> = new Map();

  public get size(): number {
    return this.list.length;
  }

  public isEmpty(): boolean {
    return this.size === 0
  }

  public push(...items: Job<P, R>[]): void {
    for (const item of items) {
      this.idMap.set(item.id, item);
    }
    this.list.push(...items);
  }

  public shift(): Job<P, R> | undefined {
    const item = this.list.shift();
    item && this.idMap.delete(item.id);
    return item;
  }

  public peek(): Job<P, R> | undefined {
    return this.list[0]
  }

  public unshift(...items: Job<P, R>[]): void {
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

  public find(id: string): Job<P, R> | undefined {
    return this.idMap.get(id);
  }
  public clear() {
    this.list = [];
    this.idMap.clear();
  }

  public toArray(): Job<P, R>[] {
    return [...this.list];
  }

  [Symbol.iterator](): Iterator<Job<P, R>> {
    let pointer = 0;
    const list = this.list;

    return {
      next(): IteratorResult<Job<P, R>> {
        return pointer < list.length
          ? { value: list[pointer++], done: false }
          : { value: null, done: true };
      }
    };
  }
}
