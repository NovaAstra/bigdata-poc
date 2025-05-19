
export class Queue<T> {
  private list: T[] = [];

  public get size(): number {
    return this.list.length;
  }

  public push(item: T): void {
    this.list.push(item);
  }

  public shift(): T | undefined {
    return this.list.shift();
  }

}
