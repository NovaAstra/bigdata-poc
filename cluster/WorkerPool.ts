export class WorkerPool<K, V> {
  private pool: Map<K, V[]> = new Map<K, V[]>();

  public get size(): number {
    return Array.from(this.pool.values())
      .reduce((total, resource) => total + resource.length, 0);
  }

  public push(key: K, resource: V): void {
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key)!.push(resource);
  }

  public shift(key: K): V | undefined {
    const workers = this.pool.get(key);
    return workers?.shift();
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

  public hasResource(resource: V): boolean {
    return Array.from(this.pool.values()).some(resources => resources.includes(resource));
  }

  public hasKey(key: K): boolean {
    return this.pool.has(key);
  }

  public getResources(key: K): V[] {
    return this.pool.get(key)
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

  public forEach(callback: (resource: V, key: K, pool: WorkerPool<K, V>) => void, thisArg?: any): void {
    for (const [key, resources] of this.pool.entries()) {
      resources.forEach(resource => callback.call(thisArg, resource, key, this));
    }
  }

  public toArray(): V[] {
    return Array.from(this.pool.values()).flat();
  }
}