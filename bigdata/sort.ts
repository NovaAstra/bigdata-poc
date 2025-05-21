export type Comparator<T> = (a: T, b: T) => number;

export class Heap<T> {
  private heap: T[] = [];

  public constructor(private readonly comparator: Comparator<T>) { }

  public get length(): number {
    return this.heap.length
  }

  public peak(): T {
    this.validate();
    return this.heap[0]
  }

  public poll(): T {
    this.validate()

    const result = this.heap[0];
    const last = this.heap.pop()!;

    if (this.length > 0) {
      this.heap[0] = last;
      this.heapifyDown();
    }

    return result;
  }

  public push(node: T): this {
    this.heap.push(node);
    this.heapifyUp();
    return this;
  }

  public toArray(): T[] {
    return [...this.heap];
  }

  private heapifyUp(): void {
    let index = this.length - 1;

    while (
      this.hasParent(index) &&
      this.comparator(this.heap[index], this.getParent(index)) < 0
    ) {
      const parentIdx = this.getParentIndex(index);
      this.swap(index, parentIdx);
      index = parentIdx;
    }
  }

  private heapifyDown(): void {
    let index = 0

    while (this.hasLeftChild(index)) {
      let smallestChildIndex = this.getLeftChildIndex(index);

      if (
        this.hasRightChild(index)
        && this.comparator(this.heap[this.getRightChildIndex(index)], this.heap[smallestChildIndex]) < 0
      ) {
        smallestChildIndex = this.getRightChildIndex(index);
      }

      if (this.comparator(this.heap[index], this.heap[smallestChildIndex]) <= 0) break;

      this.swap(index, smallestChildIndex);
      index = smallestChildIndex;
    }
  }

  private getParent(index: number): T {
    return this.heap[this.getParentIndex(index)]
  }

  private getLeftChild(index: number) {
    return this.heap[this.getLeftChildIndex(index)];
  }

  private getRightChild(index: number) {
    return this.heap[this.getRightChildIndex(index)];
  }

  private getParentIndex(index: number): number {
    return Math.floor((index - 1) / 2);
  }


  private getLeftChildIndex(index: number): number {
    return 2 * index + 1;
  }

  private getRightChildIndex(index: number): number {
    return 2 * index + 2;
  }

  private hasParent(index: number): boolean {
    return this.getParentIndex(index) >= 0;
  }

  private hasLeftChild(index: number): boolean {
    return this.getLeftChildIndex(index) < this.length;
  }

  private hasRightChild(index: number): boolean {
    return this.getRightChildIndex(index) < this.length;
  }

  private validate() {
    if (this.length === 0) {
      throw new Error('Invalid Operation. Heap is Empty');
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }
}



export class MinHeap<T> extends Heap<T> {
  constructor(comparator: Comparator<T> = (a, b) => (a > b ? 1 : a < b ? -1 : 0)) {
    super(comparator);
  }
}

export class MaxHeap<T> extends Heap<T> {
  constructor(comparator: Comparator<T> = (a, b) => (a < b ? 1 : a > b ? -1 : 0)) {
    super(comparator);
  }
}

type MergeItem<T> = {
  value: T;
  id: number;
  index: number;
};

export const defaultCompare = <T>(a: T, b: T): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}


export function sort<T>(
  arrays: T[][] = [],
  options: {
    comparator?: Comparator<T>;
    order?: 'asc' | 'desc';
  } = {}
) {
  const order = options.order ?? 'asc';
  const compare = options.comparator ?? defaultCompare;

  const operators = order === 'asc' ? 'unshift' : 'push';

  const heap = new MinHeap<MergeItem<T>>((a, b) => compare(a.value, b.value));
  const result: T[] = [];

  for (let id = 0; id < arrays.length; id++) {
    if (arrays[id].length > 0) {
      heap.push({
        value: arrays[id][0],
        id,
        index: 0,
      })
    }
  }

  while (heap.length > 0) {
    const { value, id, index } = heap.poll();
    result[operators](value);

    if (index + 1 < arrays[id].length) {
      heap.push({
        value: arrays[id][index + 1],
        id,
        index: index + 1
      })
    }
  }

  return result;
}