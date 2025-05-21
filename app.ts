// @ts-nocheck
import { Cluster } from "./cluster"


async function bootstrap() {
  const cluster = Cluster.launch()

  const data: { id: number; score: number; name: string }[] = Array.from(
    { length: 1_000_000 },
    (_, i) => ({
      id: i,
      score: Math.floor(Math.random() * 1_000_000),
      name: `name-${i}`,
    })
  );

  // console.time("parallel sort (5 chunks)");
  // const result = await Promise.all([
  //   cluster.queue(data.slice(0, 200_000), { scriptURL: (data) => data.sort((a, b) => a - b) }),
  //   cluster.queue(data.slice(200_000, 400_000), { scriptURL: (data) => data.sort((a, b) => a - b) }),
  //   cluster.queue(data.slice(400_000, 600_000), { scriptURL: (data) => data.sort((a, b) => a - b) }),
  //   cluster.queue(data.slice(600_000, 800_000), { scriptURL: (data) => data.sort((a, b) => a - b) }),
  //   cluster.queue(data.slice(800_000, 1_000_000), { scriptURL: (data) => data.sort((a, b) => a - b) }),
  // ]);

  // const output = await cluster.queue(result, {
  //   scriptURL: (data) => {
  //     class Heap {
  //       constructor(comparator) {
  //         this.heap = [];
  //         this.comparator = comparator;
  //       }

  //       get length() {
  //         return this.heap.length;
  //       }

  //       peak() {
  //         this.validate();
  //         return this.heap[0];
  //       }

  //       poll() {
  //         this.validate();

  //         const result = this.heap[0];
  //         const last = this.heap.pop();

  //         if (this.length > 0) {
  //           this.heap[0] = last;
  //           this.heapifyDown();
  //         }

  //         return result;
  //       }

  //       push(node) {
  //         this.heap.push(node);
  //         this.heapifyUp();
  //         return this;
  //       }

  //       toArray() {
  //         return [...this.heap];
  //       }

  //       heapifyUp() {
  //         let index = this.length - 1;

  //         while (
  //           this.hasParent(index) &&
  //           this.comparator(this.heap[index], this.getParent(index)) < 0
  //         ) {
  //           const parentIdx = this.getParentIndex(index);
  //           this.swap(index, parentIdx);
  //           index = parentIdx;
  //         }
  //       }

  //       heapifyDown() {
  //         let index = 0;

  //         while (this.hasLeftChild(index)) {
  //           let smallestChildIndex = this.getLeftChildIndex(index);

  //           if (
  //             this.hasRightChild(index) &&
  //             this.comparator(this.heap[this.getRightChildIndex(index)], this.heap[smallestChildIndex]) < 0
  //           ) {
  //             smallestChildIndex = this.getRightChildIndex(index);
  //           }

  //           if (this.comparator(this.heap[index], this.heap[smallestChildIndex]) <= 0) break;

  //           this.swap(index, smallestChildIndex);
  //           index = smallestChildIndex;
  //         }
  //       }

  //       getParent(index) {
  //         return this.heap[this.getParentIndex(index)];
  //       }

  //       getLeftChild(index) {
  //         return this.heap[this.getLeftChildIndex(index)];
  //       }

  //       getRightChild(index) {
  //         return this.heap[this.getRightChildIndex(index)];
  //       }

  //       getParentIndex(index) {
  //         return Math.floor((index - 1) / 2);
  //       }

  //       getLeftChildIndex(index) {
  //         return 2 * index + 1;
  //       }

  //       getRightChildIndex(index) {
  //         return 2 * index + 2;
  //       }

  //       hasParent(index) {
  //         return this.getParentIndex(index) >= 0;
  //       }

  //       hasLeftChild(index) {
  //         return this.getLeftChildIndex(index) < this.length;
  //       }

  //       hasRightChild(index) {
  //         return this.getRightChildIndex(index) < this.length;
  //       }

  //       validate() {
  //         if (this.length === 0) {
  //           throw new Error('Invalid Operation. Heap is Empty');
  //         }
  //       }

  //       swap(i, j) {
  //         [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  //       }
  //     }

  //     const defaultCompare = (a, b) => {
  //       if (a < b) return -1;
  //       if (a > b) return 1;
  //       return 0;
  //     };

  //     class MinHeap extends Heap {
  //       constructor(comparator = defaultCompare) {
  //         super(comparator);
  //       }
  //     }

  //     class MaxHeap extends Heap {
  //       constructor(comparator = (a, b) => -defaultCompare(a, b)) {
  //         super(comparator);
  //       }
  //     }

  //     function sort(arrays = [], options = {}) {
  //       const order = options.order ?? 'asc';
  //       const compare = options.comparator ?? defaultCompare;

  //       const heap = new MinHeap((a, b) => compare(a.value, b.value));
  //       const result = [];

  //       for (let id = 0; id < arrays.length; id++) {
  //         if (arrays[id].length > 0) {
  //           heap.push({
  //             value: arrays[id][0],
  //             id,
  //             index: 0,
  //           });
  //         }
  //       }

  //       while (heap.length > 0) {
  //         const { value, id, index } = heap.poll();
  //         result.push(value);

  //         if (index + 1 < arrays[id].length) {
  //           heap.push({
  //             value: arrays[id][index + 1],
  //             id,
  //             index: index + 1,
  //           });
  //         }
  //       }

  //       return order === 'asc' ? result : result.reverse();
  //     }

  //     return sort(data, { order: 'asc' })
  //   }
  // })
  // console.timeEnd("parallel sort (5 chunks)");
  // console.log(output)

  const clone1 = [...data];
  console.time("native sort (single-thread)");
  clone1.sort((a, b) => a.score - b.score);
  console.timeEnd("native sort (single-thread)");
}

bootstrap()