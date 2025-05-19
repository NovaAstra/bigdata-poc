class Heap {
  heap: any[] = [];
  #_comparator

  constructor(comparator) {
    this.#_comparator = comparator;
  }

  get sizes() {
    return this.heap.length
  }

  peak() {
    this.#_validate();
    return this.heap[0]
  }

  poll() {
    this.#_validate()

    const min = this.heap.shift();
    if (this.sizes > 1) {
      this.heap.unshift(this.heap.pop()!);
      this.#_heapifyDown();
    }

    return min;
  }

  push(node) {
    this.heap.push(node)

    if (this.sizes > 1) {
      this.#_heapifyUp()
    }
  }

  #_heapifyUp() {
    let index = this.sizes - 1

    while (this.#_hasParent(index) && this.#_comparator(this.#_getParent(index), this.heap[index])) {
      this.#_swap(index, this.#_getParentIndex(index))
      index = this.#_getParentIndex(index)
    }
  }

  #_heapifyDown() {
    let index = 0

    while (this.#_hasLeftChild(index)) {
      let smallestChildIndex = this.#_getLeftChildIndex(index);
      if (
        this.#_hasRightChild(index)
        && this.#_comparator(this.#_getLeftChild(index), this.#_getRightChild(index))
      ) {
        smallestChildIndex = this.#_getRightChildIndex(index);
      }

      if (this.#_comparator(this.heap[smallestChildIndex], this.heap[index])) {
        break;
      }

      this.#_swap(index, smallestChildIndex);
      index = smallestChildIndex;
    }
  }

  #_getParent(index) {
    return this.heap[this.#_getParentIndex(index)]
  }

  #_hasParent(index) {
    const parentIndex = this.#_getParentIndex(index);
    return parentIndex < this.sizes && parentIndex >= 0;
  }

  #_getParentIndex(childIndex) {
    return Math.floor((childIndex - 1) / 2);
  }

  #_getLeftChildIndex(parentIndex) {
    return (2 * parentIndex) + 1;
  }

  #_hasLeftChild(index) {
    return this.#_getLeftChildIndex(index) < this.sizes
  }

  #_getLeftChild(index) {
    return this.heap[this.#_getLeftChildIndex(index)];
  }

  #_getRightChildIndex(parentIndex) {
    return (2 * parentIndex) + 2;
  }

  #_hasRightChild(index) {
    return this.#_getRightChildIndex(index) < this.sizes
  }

  #_getRightChild(index) {
    return this.heap[this.#_getRightChildIndex(index)];
  }

  #_validate() {
    if (this.sizes === 0) {
      throw new Error('Invalid Operation. Heap is Empty');
    }
  }

  #_swap(indexA, indexB) {
    [this.heap[indexA], this.heap[indexB]] = [this.heap[indexB], this.heap[indexA]];
  }

  #_print() {
    console.log('Printing Items as Array: ', this.heap);
  }
}

class MinHeap extends Heap {
  constructor(comparator = (a, b) => a > b) {
    super(comparator);
  }
}

export function sort(arrays: any[] = [], comparator = (a, b) => a > b) {
  const minHeap = new MinHeap((a, b) => comparator(a.value, b.value));

  const result: any[] = []

  for (let id = 0; id < arrays.length; id++) {
    if (arrays[id].length > 0) {
      minHeap.push({
        value: arrays[id][0],
        id,
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
        id,
        index: index + 1
      })
    }
  }

  return result;
}