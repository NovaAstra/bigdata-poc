import { nanoid } from "nanoid";

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

function sort(arrays: any[] = [], comparator = (a, b) => a > b) {
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

const isWorkerSupported = () =>
  typeof window !== 'undefined'
  && typeof Worker !== 'undefined';



class Turbo {
  static DEFAULT_OPTIONS = {
    minWorkers: 0,
    taskTimeout: 30000, // 30秒
    maxRetries: 1,
    idleTimeout: 60000, // 60秒
  }

  #_options
  #_logger
  #_queue
  #_workers = []
  #_activeWorker
  #_initialized = false

  constructor(options) {
    this.#_options = { ...Turbo.DEFAULT_OPTIONS, ...options }

    this.#_logger = new Logger()

    this.#_queue = new Queue(this.#_logger)

    this.#_logger.info('Worker管理器已创建', { options: this.#_options });
  }

  async bootstrap() {
    if (this.#_initialized) return

    if (!isWorkerSupported())
      throw new Error('当前环境不支持Web Worker');

    try {
      if (this.#_options.script) {

      }


      this.#_initialized = true;
      this.#_logger.info('Worker管理器已初始化');
    } catch (error) {
      throw error;
    }
  }
}

export enum MessageType {
  TASK = 'task',
  RESULT = 'result',
  ERROR = 'error',
  PROGRESS = 'progress',
  TERMINATE = 'terminate',
  PING = 'ping',
  PONG = 'pong'
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

export interface Task<P, R> {
  id: string;
  status: TaskStatus;
  payload: P;
  retries: number;
  transfer?: Transferable[];
  maxRetries: number;
  timeout: number;
  timeoutId?: number;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export interface WorkerMessage<P> {
  type: MessageType;
  id?: string;
  payload?: P;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class WorkerInstance<P, R> {
  public readonly id: string = nanoid();

  private isTerminated: boolean = false;

  private activeTarget: Task<P, R> | null = null;

  private create: number;
  private update: number;

  constructor(private readonly worker: Worker, private readonly logger: Logger) {
    this.create = Date.now();
    this.update = this.create;

    this.setupEvents()
  }

  public execute(task: Task<P, R>) {
    if (this.isTerminated)
      throw new Error(`Worker ${this.id} 已终止，无法执行任务`);

    if (this.activeTarget)
      throw new Error(`Worker ${this.id} 正在执行任务 ${this.activeTarget.id}，无法同时执行多个任务`);

    this.activeTarget = task;
    this.update = Date.now();

    const message: WorkerMessage<P> = {
      type: MessageType.TASK,
      id: task.id,
      payload: task.payload
    }

    try {
      if (task.transfer && task.transfer.length > 0) {
        this.worker.postMessage(message, task.transfer)
      } else {
        this.worker.postMessage(message)
      }

    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public terminate() {
    if (this.isTerminated) return;
  }

  private setupEvents() {
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener('error', this.onError);
    this.worker.addEventListener('messageerror', this.onMessageError);
  }

  private onMessage() { }

  private onError(event: ErrorEvent | Error) { }

  private onMessageError() { }
}

class Queue {
  constructor(logger) { }
}

export const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
}


class Logger {
  info(message, context) {
    return this.#_log(LOG_LEVEL.INFO, message, context)
  }

  #_log(level, message, context) {

  }
}