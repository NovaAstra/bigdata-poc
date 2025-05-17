const arrays = [
  [1, 3, 5, 7],
  [2, 4, 6, 8],
  [0, 9, 10, 11]
];

class Heap {
  heap = [];
  #_comparator

  constructor(comparator) {
    this.#_comparator = comparator;
  }

  get sizes() {
    return this.sizes.length
  }

  peak() {
    this.#_validate();

    return this.heap[0]
  }

  poll() {
    this.#_validate()

    const min = this.heap.shift();
    this.items.unshift(this.heap.pop());

    this.#_heapifyDown();
    return min;
  }

  push(node) {
    this.heap.push(node)
    this.#_heapifyUp()
  }

  #_heapifyUp() {
    let index = this.sizes - 1

  }

  #_heapifyDown() {

  }

  #_getParentIndex(childIndex) {
    return Math.floor((childIndex - 1) / 2.0);
  }

  #_validate() {
    if (this.heap.length === 0) {
      throw new Error('Invalid Operation. Heap is Empty');
    }
  }

  #_swap(indexA, indexB) {
    [this.items[indexA], this.items[indexB]] = [this.items[indexB], this.items[indexA]];
  }

  #_print() {
    console.log('Printing Items as Array: ', this.items);
  }
}

class MinHeap extends Heap {
  constructor() {
    super((a, b) => a > b);
  }
}

export function sort(arrays = [], comparator = (a, b) => a > b) {
  const minHeap = new MinHeap(comparator);

  const result = []

  for (let index = 0; index < arrays.length; index++) {
    if (arrays[index].length > 0) {
      minHeap.push({
        value: arrays[index][0],
        id: index,
        index: 0,
      })
    }
  }

  while (minHeap.sizes > 0) {
    const { value, id, index } = minHeap.poll();
    result.push(value);

    if (index + 1 < arrays[id].length) {
      minHeap.push({
        value: arrays[id][index + 1],
        id: index,
        index: index + 1
      })
    }
  }

  return result;
}