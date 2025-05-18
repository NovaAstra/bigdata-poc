import { type ScriptURL } from "./types"
import { Queue } from "./queue";
import { Agent } from "./agent";

export interface TurboOptions {
  scriptURL?: ScriptURL;
  maxConcurrency?: number;
  debug?: boolean;
  workerOptions?: WorkerOptions;
}

const CHECK_FOR_WORK_INTERVAL = 100;

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


export class Turbo {
  public static async launch(options: TurboOptions) {
    const turbo = new Turbo(options);
    await turbo.bootstrap();
    return turbo;
  }

  public static DEFAULT_OPTIONS: Required<TurboOptions> = {
    scriptURL: 'worker.js',
    maxConcurrency: 3,
    debug: false,
    workerOptions: {}
  }

  private readonly options: Required<Omit<TurboOptions, "scriptURL">> & {
    scriptURL: URL;
  };

  private initialized: boolean = false;
  private startTime: number = Date.now();
  private lastLaunchedWorkerTime: number = 0;

  private agents: Agent[] = []
  private agentsAvail: Agent[] = []
  private agentsBusy: Agent[] = []

  private idleResolvers: (() => void)[] = [];

  private workCallTimeout: number | null = null;
  private checkForWorkInterval: number | null = null;

  public readonly queue: Queue = new Queue();

  public constructor(options: TurboOptions) {
    this.options = Object.assign({}, Turbo.DEFAULT_OPTIONS, options, {
      scriptURL: createScriptURL(options.scriptURL || Turbo.DEFAULT_OPTIONS.scriptURL)
    })
  }

  public bootstrap() {
    if (this.initialized) return;

    if (!isWorkerSupported)
      throw new Error('Browser does not support Web Workers');

    this.checkForWorkInterval = setInterval(() => this.work(), CHECK_FOR_WORK_INTERVAL);
    this.initialized = true
  }

  private async work() {
    if (this.workCallTimeout === null) {

      this.workCallTimeout = window.setTimeout(() => {
        this.workCallTimeout = null;
        this.doWork();
      }, 0);
    }
  }

  private async doWork() {
    if (this.queue.length === 0) {
      if (this.agentsBusy.length === 0) {
        this.idleResolvers.forEach(resolve => resolve());
      }

      return
    }

    if (this.agentsAvail.length === 0) {
      if (this.allowedToStartAgent()) {
        await this.launchAgent();
        this.work();
      }
    }

    const job = this.queue.poll();

    if (job === undefined) {
      // skip, there are items in the queue but they are all delayed
      return;
    }

    const agent = this.agentsAvail.shift()!
    this.agentsBusy.push(agent);

    if (this.agentsAvail.length !== 0 || this.allowedToStartAgent()) {
      // we can execute more work in parallel
      this.work();
    }

    try {
      await agent.execute(job);
    } catch (error) {
      console.error('Error executing job:', error);
      // You might want to re-queue the job or handle the error differently
    } finally {
      // Return agent to available pool
      const agentIndex = this.agentsBusy.indexOf(agent);
      if (agentIndex !== -1) {
        this.agentsBusy.splice(agentIndex, 1);
      }
      this.agentsAvail.push(agent);
      this.work();
    }
  }

  public terminate(agent: Agent) {
    agent.terminate()

    const index = this.agents.findIndex(a => a.id === agent.id);
    if (index !== -1) {
      this.agents.splice(index, 1);
    }
  }

  private launchAgent() {
    if (!this.options.scriptURL)
      throw new Error('Worker script URL is not configured');

    const worker = new Worker(this.options.scriptURL, this.options.workerOptions);
    const agent = new Agent(worker);
    this.agents.push(agent)
    this.agentsAvail.push(agent);
    this.lastLaunchedWorkerTime = Date.now();

    return agent
  }

  private allowedToStartAgent() {
    return this.options.maxConcurrency === 0 ||
      this.agents.length < this.options.maxConcurrency;
  }

  public async idle() {
    if (this.queue.length === 0 && this.agentsBusy.length === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }


  private monitor(): void {

  }
}