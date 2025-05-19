import { type Task } from "./types";
import { type Cluster } from "./cluster";

export const timeoutExecute = async <T>(millis: number, promise: Promise<T>): Promise<T> => {
  let timeout: number | undefined;

  const result = await Promise.race([
    (async () => {
      await new Promise((resolve) => {
        timeout = setTimeout(resolve, millis);
      });
      throw new Error(`Timeout hit: ${millis}`);
    })(),
    (async () => {
      try {
        return await promise;
      } catch (error: any) {
        // Cancel timeout in error case
        clearTimeout(timeout);
        throw error;
      }
    })(),
  ]);
  clearTimeout(timeout); // is there a better way?
  return result;
}

export interface BotOptions {
  id: number;
  cluster: Cluster;
  worker: Worker;
}

export class Bot<P, R> implements BotOptions {
  public readonly id: number;

  public readonly worker: Worker;
  public readonly cluster: Cluster;

  public async handle(task: Task<P, R>) {
    let tries = 0;

    try {
   
    } catch (error) {

    }
  }

  public async close() {
    this.worker.terminate()
  }


  private createTaskFunction<P>(payload: P, worker: Worker) {
    return new Promise((resolve, reject) => {
      worker.postMessage(payload);

      worker.onmessage = (e: MessageEvent) => {
        resolve(e)
      }

      worker.onerror = (e: ErrorEvent) => {
        reject(e)
      }

      worker.onmessageerror = (e: MessageEvent) => {

      }
    })
  }
}