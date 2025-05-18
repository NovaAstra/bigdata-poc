export const isWorkerSupported = () =>
  typeof window !== 'undefined'
  && typeof Worker !== 'undefined';

export interface TurboOptions {

}


export class Turbo {
  public static DEFAULT_OPTIONS = {
    minWorkers: 0,
    taskTimeout: 30000,
    maxRetries: 1,
    idleTimeout: 60000,
  }

  public constructor() { }

  public bootstrap() { }
}