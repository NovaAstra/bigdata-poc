import { type ScriptURL, type Task, TaskOptions } from "./types"
import { Worker } from "./worker";
import { Queue } from "./queue";
import { nanoid } from "nanoid";

export interface ClusterOptions {
  scriptURL: ScriptURL;
  maxConcurrency: number;
  workerCreationDelay: number;
  debug: boolean;
  workerOptions: WorkerOptions;
  timeout: number;
  retryLimit: number;
  retryDelay: number;
  idleTimeout: number;
  transferables: Transferable[];
}

export type ClusterOptionsArgument = Partial<ClusterOptions>;

export const isWorkerSupported = () =>
  typeof window !== 'undefined' && typeof Worker !== 'undefined';

export const createScriptURL = (scriptURL: ScriptURL): URL => {
  if (typeof scriptURL === 'string')
    return new URL(scriptURL, window.location.href);

  if (scriptURL instanceof URL)
    return scriptURL;

  if (typeof scriptURL === 'function') {
    const code = scriptURL();
    const blob = new Blob([code], { type: 'application/javascript' });
    return URL.createObjectURL(blob) as unknown as URL;
  }

  throw new TypeError(`Invalid script format. Expected string, URL or function, but got: ${typeof scriptURL}`);
}

export class WorkerPool<K, V> {
  private pool: Map<K, V[]> = new Map<K, V[]>();

  public get size(): number {
    return Array.from(this.pool.values())
      .reduce((total, resource) => total + resource.length, 0);
  }

  public push(key: K, resources: V): void {
    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }
    this.pool.get(key)!.push(resources);
  }

  public shift(key: K): V | undefined {
    const workers = this.pool.get(key);

    if (workers && workers.length > 0) {
      return workers.shift();
    }
    return undefined
  }

  public remove(resource: V): boolean {
    for (const [key, resources] of this.pool.entries()) {
      const index = resources.indexOf(resource);
      if (index !== -1) {
        resources.splice(index, 1);
        if (resources.length === 0) {
          this.pool.delete(key);
        }
        return true;
      }
    }
    return false;
  }

  public clear(): void {
    this.pool.clear();
  }

  public has(resource: V): boolean {
    for (const resources of this.pool.values()) {
      if (resources.includes(resource)) {
        return true;
      }
    }
    return false;
  }

  public map<U>(
    callback: (resource: V, key: K, pool: WorkerPool<K, V>) => U,
    thisArg?: any
  ): U[] {
    const result: U[] = [];
    this.forEach((resource, key) => {
      result.push(callback.call(thisArg, resource, key, this));
    });
    return result;
  }

  public forEach(
    callback: (resource: V, key: K, pool: WorkerPool<K, V>) => void,
    thisArg?: any
  ): void {
    for (const [key, resources] of this.pool.entries()) {
      for (const resource of resources) {
        callback.call(thisArg, resource, key, this);
      }
    }
  }

  public toArray(): V[] {
    const result: V[] = [];
    for (const resources of this.pool.values()) {
      result.push(...resources);
    }
    return result;
  }
}

const CHECK_FOR_WORK_INTERVAL = 100;
const WORK_CALL_INTERVAL_LIMIT = 10;

const DEFAULT_OPTIONS: ClusterOptions = {
  scriptURL: 'worker.js',
  maxConcurrency: 4,
  workerCreationDelay: 0,
  debug: false,
  workerOptions: {},
  timeout: 30 * 1000,
  idleTimeout: 3 * 1000,
  retryLimit: 0,
  retryDelay: 0,
  transferables: []
}

export class Cluster<P = any, R = any> {
  public static async launch(options: ClusterOptionsArgument = {}) {
    const cluster = new Cluster(options);
    await cluster.bootstrap();
    return cluster;
  }

  public readonly options: ClusterOptions;
  private readonly jobQueue: Queue<any, any> = new Queue()

  private allTargetCount: number = 0

  private readonly workerPool: WorkerPool<URL, Worker<P, R>> = new WorkerPool<URL, Worker<P, R>>();
  private readonly workerAvailPool: WorkerPool<URL, Worker<P, R>> = new WorkerPool<URL, Worker<P, R>>();
  private readonly workerBusyPool: WorkerPool<URL, Worker<P, R>> = new WorkerPool<URL, Worker<P, R>>();

  private workersStarting: number = 0;

  private nextWorkCall: number = 0;
  private workCallTimeout: number | null = null;

  private checkForWorkInterval?: number;

  private lastLaunchedWorkerTime: number = 0;

  private closed: boolean = false;

  public constructor(options: ClusterOptionsArgument = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  public async queue<P, R>(payload: P, options: TaskOptions = {}) {
    return new Promise<R>((resolve, reject) => {
      const scriptURL = createScriptURL(options.scriptURL || this.options.scriptURL);

      const task: Task<P, R> = {
        id: options?.id ?? nanoid(),
        payload,
        retries: 0,
        scriptURL,
        resolve,
        reject,
        transferables: options.transferables || this.options.transferables,
        timeout: options.timeout ?? this.options.timeout,
      }

      this.jobQueue.push(task);
      this.allTargetCount += 1;

      this.work()
    })
  }

  public async close() {
    this.closed = true;

    clearInterval(this.checkForWorkInterval);
    clearTimeout(this.workCallTimeout);

    // close workers
    await Promise.all(this.workerPool.map(worker => worker.terminate()));
  }

  private async bootstrap() {
    if (!isWorkerSupported()) {
      throw new Error('Web Workers are not supported in this environment.');
    }

    if (typeof this.options.maxConcurrency !== 'number' || this.options.maxConcurrency < 0) {
      throw new Error('maxConcurrency must be of number type');
    }

    this.checkForWorkInterval = setInterval(() => this.work(), CHECK_FOR_WORK_INTERVAL);
  }

  private async work() {
    if (this.workCallTimeout === null) {
      const now = Date.now();

      // calculate when the next work call should happen
      this.nextWorkCall = Math.max(
        this.nextWorkCall + WORK_CALL_INTERVAL_LIMIT,
        now,
      );

      const timeUntilNextWorkCall = this.nextWorkCall - now;
      this.workCallTimeout = setTimeout(
        () => {
          this.workCallTimeout = null;
          this.doWork();
        },
        timeUntilNextWorkCall,
      );
    }
  }

  private async doWork() {
    if (this.jobQueue.size === 0) { // no jobs available
      if (this.workerBusyPool.size === 0) {
      }
      return;
    }

    const job = this.jobQueue.shift();
    if (job === undefined) {
      // skip, there are items in the jobQueue but they are all delayed
      return;
    }


    if (this.workerAvailPool.size === 0) { // no workers available
      if (this.allowedToStartWorker()) {
        await this.launchWorker(job);
        this.jobQueue.unshift(job)
        console.log(this.workCallTimeout)
        this.work()
      }
      return;
    }


    const worker = this.workerAvailPool.shift(job.scriptURL)!;
    this.workerBusyPool.push(job.scriptURL, worker);

    if (this.workerAvailPool.size !== 0 || this.allowedToStartWorker()) {
      this.work()
    }



    const result = await worker.handle(job);

    // add worker to available bots again
    this.workerBusyPool.remove(worker);

    this.workerAvailPool.push(job.scriptURL, worker);

    this.work()
  }

  private async launchWorker(job: Task<any, any>) {
    this.workersStarting += 1
    this.lastLaunchedWorkerTime = Date.now();

    const worker = new Worker<P, R>({
      id: nanoid(),
      cluster: this,
      worker: new window.Worker(job.scriptURL,)
    });

    this.workerAvailPool.push(job.scriptURL, worker);
    this.workerPool.push(job.scriptURL, worker);

    console.log(this.workerPool)

    this.workersStarting -= 1;
  }

  private allowedToStartWorker() {
    const workerCount = this.workerPool.size + this.workersStarting;
    return (
      this.options.maxConcurrency === 0
      || workerCount < this.options.maxConcurrency)
      && (
        this.options.workerCreationDelay === 0
        || this.lastLaunchedWorkerTime + this.options.workerCreationDelay < Date.now()
      )
  }
}