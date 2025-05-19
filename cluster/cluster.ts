import { type ScriptURL, type Task, TaskOptions } from "./types"
import { Bot } from "./bot";
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
}

export type ClusterOptionsArgument = Partial<ClusterOptions>;

export const isWorkerSupported = () =>
  typeof window !== 'undefined'
  && typeof Worker !== 'undefined';

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

const CHECK_FOR_WORK_INTERVAL = 100;
const WORK_CALL_INTERVAL_LIMIT = 10;

const DEFAULT_OPTIONS: ClusterOptions = {
  scriptURL: 'worker.js',
  maxConcurrency: 4,
  workerCreationDelay: 0,
  debug: false,
  workerOptions: {},
  timeout: 30 * 1000,
  retryLimit: 0,
  retryDelay: 0,
}

export class Cluster<P = any, R = any> {
  public static async launch(options: ClusterOptionsArgument) {
    const cluster = new Cluster(options);
    await cluster.bootstrap();

    return cluster;
  }

  private readonly options: ClusterOptions;

  private initialized: boolean = false;
  private allTargetCount: number = 0
  private readonly jobQueue: Queue<any, any> = new Queue()

  private workers: Bot<P, R>[] = [];
  private workersAvail: Bot<P, R>[] = [];
  private workersBusy: Bot<P, R>[] = [];
  private workersStarting: number = 0;

  private nextWorkCall: number = 0;
  private workCallTimeout: number | null = null;

  private checkForWorkInterval?: number;

  private lastLaunchedWorkerTime: number = 0;

  public constructor(options: ClusterOptionsArgument) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  public async queue<P, R>(payload: P, options: TaskOptions = {}) {
    if (!this.initialized) await this.bootstrap()

    return new Promise<R>((resolve, reject) => {
      const task: Task<P, R> = {
        id: options?.id ?? nanoid(),
        payload,
        retries: 0,
        resolve,
        reject,
        transferables: options?.transferables,
        timeout: options?.timeout ?? this.options.timeout,
      }

      this.jobQueue.push(task);
      this.allTargetCount += 1;

      this.work()
    })
  }

  private async bootstrap() {
    if (this.initialized) return;

    if (!isWorkerSupported()) {
      throw new Error('Web Workers are not supported in this environment.');
    }

    if (typeof this.options.maxConcurrency !== 'number') {
      throw new Error('maxConcurrency must be of number type');
    }

    this.checkForWorkInterval = setInterval(() => this.work(), CHECK_FOR_WORK_INTERVAL);

    this.initialized = true
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
          this.workCallTimeout = undefined;
          this.doWork();
        },
        timeUntilNextWorkCall,
      );
    }
  }

  private async doWork() {
    if (this.jobQueue.size === 0) {
      if (this.workersBusy.length === 0) {
      }
      return;
    }

    if (this.workersAvail.length === 0) {
      if (this.allowedToStartWorker()) {
        await this.launchWorker();
        this.work()
      }
      return;
    }

    const job = this.jobQueue.shift();
    if (job === undefined) {
      // skip, there are items in the queue but they are all delayed
      return;
    }

    const worker = this.workersAvail.shift()!;
    this.workersBusy.push(worker);

    const result = await worker.handle(job);

    // add worker to available workers again
    const workerIndex = this.workersBusy.indexOf(worker);
    this.workersBusy.splice(workerIndex, 1);

    this.workersAvail.push(worker);

    this.work()
  }

  private async launchWorker() {
    this.workersStarting += 1
    this.lastLaunchedWorkerTime = Date.now();

    const bot = new Bot<P, R>({ id: nanoid(), cluster: this, worker: new Worker(this.options.scriptURL as string) });

    this.workersAvail.push(bot);
    this.workers.push(bot);

    this.workersStarting -= 1;
  }

  private allowedToStartWorker() {
    const workerCount = this.workers.length + this.workersStarting;
    return (
      this.options.maxConcurrency === 0
      || workerCount < this.options.maxConcurrency)
      && (
        this.options.workerCreationDelay === 0
        || this.lastLaunchedWorkerTime + this.options.workerCreationDelay < Date.now()
      )
  }
}