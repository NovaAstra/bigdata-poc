import { type ScriptURL, type Job, type JobOptions } from "./types"
import { nanoid } from "nanoid";
import { MessageType } from "./enums";
import { Worker } from "./Worker";
import { Queue } from "./Queue";
import { WorkerPool } from "./WorkerPool";

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

export const createScriptCode = <P, R>(
  callback: (payload: P) => R | Promise<R>,
  { transferable = false, id }: WorkerOptions = {}
): string => {
  const callbackFunction = callback.toString();
  const messageTypeString = JSON.stringify(MessageType);

  return `
    (function() {
      'use strict';
      
      const callback = ${callbackFunction};
      const MessageType = ${messageTypeString};

      self.onmessage = async function(ev) {
        try {
          const result = await Promise.resolve(callback(ev.data));

          self.postMessage({
            type: MessageType.COMPLETED,
            payload: result,
            id: ev.data.id
          }, ${transferable} && result instanceof ArrayBuffer ? [result] : []);
        } catch (error) {
          self.postMessage({
            type: MessageType.ERROR,
            error: error,
            id: ev.data.id
          });
        }
      };
    })();
  `;
};

export const createScriptURL = (scriptURL: ScriptURL): URL => {
  if (typeof scriptURL === 'string')
    return new URL(scriptURL, window.location.href);

  if (scriptURL instanceof URL)
    return scriptURL;

  if (typeof scriptURL === 'function') {
    const code = createScriptCode(scriptURL);
    const blob = new Blob([code], { type: 'application/javascript' });
    return URL.createObjectURL(blob) as unknown as URL;
  }

  throw new TypeError(`Invalid script format. Expected string, URL or function, but got: ${typeof scriptURL}`);
}

interface WorkerOptions {
  transferable?: boolean;
  id?: string;
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
  public static launch(options: ClusterOptionsArgument = {}): Cluster {
    const cluster = new Cluster(options);
    cluster.bootstrap();
    return cluster;
  }

  public readonly options: ClusterOptions;
  private readonly jobQueue: Queue<P, R> = new Queue()

  private allTargetCount: number = 0

  private readonly workers: WorkerPool<URL, Worker<P, R>> = new WorkerPool();
  private readonly workersAvail: WorkerPool<URL, Worker<P, R>> = new WorkerPool();
  private readonly workersBusy: WorkerPool<URL, Worker<P, R>> = new WorkerPool();

  private workersStarting: number = 0;

  private nextWorkCall: number = 0;
  private workCallTimeout: number | null = null;

  private checkForWorkInterval: number | null = null;

  private lastLaunchedWorkerTime: number = 0;

  private closed: boolean = false;

  private idleResolvers: (() => void)[] = [];
  private waitForOneResolvers: ((payload: any) => void)[] = [];

  public constructor(options: ClusterOptionsArgument = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  public async queue<TP = P, TR = R>(payload: TP, options: JobOptions = {}): Promise<TR> {
    const {
      scriptURL = this.options.scriptURL,
      transferables = this.options.transferables,
      timeout = this.options.timeout,
    } = options

    return new Promise<TR>((resolve, reject) => {
      const job: Job<TP, TR> = {
        id: options?.id ?? nanoid(),
        payload,
        retries: 0,
        scriptURL: createScriptURL(scriptURL),
        resolve,
        reject,
        transferables,
        timeout,
      }

      this.allTargetCount += 1;
      this.jobQueue.push(job as unknown as Job<P, R>);

      this.work()
    })
  }

  public idle(): Promise<void> {
    return new Promise(resolve => this.idleResolvers.push(resolve));
  }

  public waitForOne(): Promise<any> {
    return new Promise(resolve => this.waitForOneResolvers.push(resolve));
  }

  public async close() {
    if (this.closed) return;
    this.closed = true;

    clearInterval(this.checkForWorkInterval);
    clearTimeout(this.workCallTimeout);

    // close workers
    await Promise.all([
      this.workers.clear(),
      this.workersAvail.clear(),
      this.workersBusy.clear(),
    ]);
  }

  private bootstrap() {
    if (!isWorkerSupported()) {
      throw new Error('Web Workers are not supported in this environment.');
    }

    if (typeof this.options.maxConcurrency !== 'number' || this.options.maxConcurrency < 0) {
      throw new Error('maxConcurrency must be of number type');
    }

    // needed in case resources are getting free (like CPU/memory) to check if
    // can launch workers
    this.checkForWorkInterval = setInterval(() => this.work(), CHECK_FOR_WORK_INTERVAL);
  }

  // check for new work soon (wait if there will be put more data into the queue, first)
  private async work(job?: Job<P, R>): Promise<void> {
    // make sure, we only call work once every WORK_CALL_INTERVAL_LIMIT (currently: 10ms)
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
          this.doWork(job);
        },
        timeUntilNextWorkCall,
      );
    }
  }

  private async doWork(job?: Job<P, R>): Promise<void> {
    if (this.jobQueue.size === 0 && !job) { // no jobs available
      if (this.workersBusy.length === 0) {
        this.idleResolvers.forEach(resolve => resolve());
        this.idleResolvers = []
      }
      return;
    }

    job = job ?? this.jobQueue.shift();
    if (!job) {
      // skip, there are items in the queue but they are all delayed
      return;
    }

    if (this.workersAvail.size(job.scriptURL) === 0) { // no workers available
      if (this.workersAvail.length >= this.options.maxConcurrency) {
        const idleWorker = await this.workersAvail.removeLongestIdle()
        if (idleWorker) this.workers.remove(idleWorker)
      }

      if (this.allowedToStartWorker()) {
        await this.launchWorker(job);
        this.work(job);
      }
      return;
    }

    const worker = this.workersAvail.shift(job.scriptURL) as Worker<P, R>;
    this.workersBusy.push(job.scriptURL, worker);

    if (this.workersAvail.length !== 0 || this.allowedToStartWorker()) {
      // we can execute more work in parallel
      this.work()
    }

    const result = await worker.handle(job);

    this.waitForOneResolvers.forEach(resolve => resolve(result));
    this.waitForOneResolvers = [];

    // add worker to available bots again
    this.workersBusy.remove(worker);
    this.workersAvail.push(job.scriptURL, worker);

    this.work()
  }

  private async launchWorker(job: Job<P, R>): Promise<Worker<P, R>> {
    this.workersStarting += 1
    this.lastLaunchedWorkerTime = Date.now();

    try {
      const worker = new Worker<P, R>({
        id: nanoid(),
        cluster: this,
        worker: new window.Worker(job.scriptURL)
      });

      this.workersAvail.push(job.scriptURL, worker);
      this.workers.push(job.scriptURL, worker);
      return worker
    } finally {
      this.workersStarting -= 1;
    }
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