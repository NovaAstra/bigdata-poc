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
    this.heap.unshift(this.heap.pop());

    this.#_heapifyDown();
    return min;
  }

  push(node) {
    this.heap.push(node)
    this.#_heapifyUp()
  }

  #_heapifyUp() {
    let index = this.sizes - 1

    while (this.#_comparator(this.#_getParent(index), this.heap[index])) {
      this.#_swap(index, this.#_getParentIndex(index))
      index = this.#_getParentIndex(index)
    }
  }

  #_heapifyDown() {
    let index = 0
  }

  #_getParent() {
    return this.heap[this.#_getParentIndex(index)]
  }

  #_hasParent() {
    const parentIndex = this.getParentIndex(index);
    return parentIndex < this.sizes && parentIndex !== -1;
  }

  #_getParentIndex(childIndex) {
    return Math.floor((childIndex - 1) / 2.0);
  }

  #_getLeftChildIndex(parentIndex) {
    return (2 * parentIndex) + 1;
  }

  #_hasLeftChild() {
    return this.#_getLeftChildIndex()
  }

  #_getLeftChild(index) {
    return this.heap[this.getLeftChildIndex(index)];
  }

  #_getRightChildIndex(parentIndex) {
    return (2 * parentIndex) + 2;
  }

  #_hasRightChild() {
    return this.#_getRightChildIndex()
  }

  #_getRightChild(index) {
    return this.heap[this.#_getRightChildIndex(index)];
  }

  #_validate() {
    if (this.heap.length === 0) {
      throw new Error('Invalid Operation. Heap is Empty');
    }
  }

  #_swap(indexA, indexB) {
    [this.heap[indexA], this.heap[indexB]] = [this.heap[indexB], this.heap[indexA]];
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