import { type Worker } from "./Worker"

export class WorkerPool<K, V extends Worker<any, any>> {
  private readonly pool: Map<K, V[]> = new Map<K, V[]>();

  public get length(): number {
    let count = 0;
    for (const list of this.pool.values()) count += list.length;
    return count;
  }

  public size(key: K) {
    return this.getWorkers(key).length
  }

  public push(key: K, worker: V): void {
    this.getOrCreateBucket(key).push(worker);
  }

  public shift(key: K): V | undefined {
    const workers = this.pool.get(key);
    return workers?.shift();
  }

  public async remove(worker: V): Promise<false | V> {
    for (const [key, workers] of this.pool) {
      const index = workers.indexOf(worker);
      if (index !== -1) {
        await worker.terminate();

        workers.splice(index, 1);
        if (workers.length === 0) this.pool.delete(key);
        return worker;
      }
    }
    return false;
  }

  public async removeLongestIdle(): Promise<false | V> {
    const idleWorkers = this.toArray().filter(worker => !worker.isBusy());
    if (idleWorkers.length === 0) return false;

    idleWorkers.sort((a, b) => a.getIdleTime() - b.getIdleTime());

    return this.remove(idleWorkers[0]);
  }

  public async clear(): Promise<void> {
    const allWorkers = this.toArray();
    this.pool.clear();
    await Promise.all(allWorkers.map(worker => worker.terminate()));
  }

  public hasWorker(worker: V): boolean {
    for (const list of this.pool.values()) {
      if (list.includes(worker)) return true;
    }
    return false;
  }

  public hasKey(key: K): boolean {
    return this.pool.has(key);
  }

  public getWorkers(key: K): V[] {
    return this.pool.get(key) ?? []
  }

  public map<U>(callback: (worker: V, key: K, pool: WorkerPool<K, V>) => U): U[] {
    const result: U[] = [];
    this.forEach((worker, key, pool) => result.push(callback(worker, key, pool)));
    return result;
  }

  public forEach(callback: (worker: V, key: K, pool: WorkerPool<K, V>) => void): void {
    for (const [key, list] of this.pool) {
      for (const worker of list) {
        callback(worker, key, this);
      }
    }
  }

  public toArray(): V[] {
    const result: V[] = [];
    for (const workers of this.pool.values()) {
      result.push(...workers);
    }
    return result;
  }

  private getOrCreateBucket(key: K): V[] {
    let bucket = this.pool.get(key);
    if (!bucket) {
      bucket = [];
      this.pool.set(key, bucket);
    }
    return bucket;
  }
}