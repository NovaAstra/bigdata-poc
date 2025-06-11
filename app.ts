export class Node<P = unknown> {
  public constructor(
    public readonly id: string,
    public readonly metadata?: P
  ) { }
}

export enum Dirty {
  None = 0,
  Topo = 1 << 0,
  Cycle = 1 << 1,
  Reach = 1 << 2,
}

export enum Direction {
  In,
  Out
}

export type Comparator<T> = (a: T, b: T) => number;

export interface Edge<T> {
  source: T,
  target: T,
  weight?: number;
}

export class DAG<P, T extends Node<P>> {
  private static readonly EMPTY_SET = new Set<string>();

  private readonly nodes: Map<string, T> = new Map();

  private readonly outEdges: Map<string, Set<string>> = new Map();
  private readonly inEdges: Map<string, Set<string>> = new Map();

  private readonly inDegree: Map<string, number> = new Map();

  private readonly outReachs: Map<string, Set<string>> = new Map();
  private readonly inReachs: Map<string, Set<string>> = new Map();

  private readonly subgraphs: Map<string, DAG<P, T>> = new Map();

  private readonly edgeWeights: Map<string, Map<string, number>> = new Map();

  private readonly orders: Map<string, T[]> = new Map();

  private cycle: boolean;

  private dirty: Dirty = Dirty.None;

  public get size(): number {
    return this.nodes.size;
  }

  public addNodes(...nodes: (string | T)[]): this {
    for (const node of nodes) this.addNode(node);
    return this;
  }

  public addNode(node: string | T): this {
    const n = this.createNode(node);
    if (!this.nodes.has(n.id)) {
      this.nodes.set(n.id, n);

      this.outEdges.set(n.id, new Set());
      this.inEdges.set(n.id, new Set());

      this.inDegree.set(n.id, 0);

      this.markDirty(Dirty.Topo | Dirty.Cycle | Dirty.Reach);
    }
    return this;
  }

  public addEdges(...edges: Edge<string | T>[]): this {
    for (const { source, target } of edges) {
      this.addEdge(source, target);
    }
    return this;
  }

  public addEdge(source: string | T, target: string | T, weight: number = 1): this {
    const srcId = this.resolveId(source);
    const tgtId = this.resolveId(target);
    this.addNodes(srcId, tgtId);

    if (this.outEdges.get(srcId)!.has(tgtId)) return this;

    if (this.isReachable(tgtId, srcId)) {
      throw new Error(`Adding edge ${srcId} -> ${tgtId} would create a cycle`);
    }

    this.outEdges.get(srcId)!.add(tgtId);
    this.inEdges.get(tgtId)!.add(srcId);

    this.inDegree.set(tgtId, (this.inDegree.get(tgtId) ?? 0) + 1);

    if (!this.edgeWeights.has(srcId)) this.edgeWeights.set(srcId, new Map());
    this.edgeWeights.get(srcId)!.set(tgtId, weight);

    this.markDirty(Dirty.Topo | Dirty.Cycle | Dirty.Reach);
    return this;
  }

  public removeNodes(...nodes: (string | T)[]): this {
    for (const node of nodes) {
      this.removeNode(node);
    }
    return this;
  }

  public removeNode(node: string | T): this {
    const id = this.resolveId(node);
    if (!this.nodes.has(id)) return this;

    for (const source of this.outEdges.get(id) ?? []) {
      this.inEdges.get(source)?.delete(id);
      this.inDegree.set(id, (this.inDegree.get(id) ?? 1) - 1);
    }

    for (const target of this.inEdges.get(id) ?? []) {
      this.outEdges.get(target)?.delete(id);
      this.inDegree.set(target, this.inDegree.get(target)! - 1);
      this.edgeWeights.get(target)?.delete(id);
    }

    this.inEdges.delete(id);
    this.outEdges.delete(id);
    this.inDegree.delete(id);
    this.nodes.delete(id);
    this.edgeWeights.delete(id);

    this.markDirty(Dirty.Topo | Dirty.Cycle | Dirty.Reach);
    this.inReachs.clear();
    this.outReachs.clear();
    return this
  }

  public removeEdges(...edges: Edge<string | T>[]): this {
    for (const { source, target } of edges) this.removeEdge(source, target);
    return this
  }

  public removeEdge(source: string | T, target: string | T): this {
    const srcId = this.resolveId(source);
    const tgtId = this.resolveId(target);

    if (this.outEdges.get(srcId)?.delete(tgtId)) {
      this.inEdges.get(tgtId)?.delete(srcId);
      this.inDegree.set(tgtId, this.inDegree.get(tgtId)! - 1);
      this.edgeWeights.get(srcId)?.delete(tgtId);
      this.markDirty(Dirty.Topo | Dirty.Cycle | Dirty.Reach);
    }
    return this;
  }

  public getNode(node: string | T): T {
    return this.nodes.get(this.resolveId(node))!;
  }

  public hasNode(node: string | T): boolean {
    return this.nodes.has(this.resolveId(node));
  }

  public getOutEdges(node: string | T): ReadonlySet<string> {
    return this.outEdges.get(this.resolveId(node)) ?? DAG.EMPTY_SET;
  }

  public getInEdges(node: string | T): ReadonlySet<string> {
    return this.inEdges.get(this.resolveId(node)) ?? DAG.EMPTY_SET;
  }

  public getEdges(node: string | T, direction: Direction = Direction.Out) {
    return direction === Direction.In ? this.getInEdges(node) : this.getOutEdges(node)
  }

  public isReachable(source: string | T, target: string | T): boolean {
    const srcId = this.resolveId(source);
    const tgtId = this.resolveId(target);
    if (srcId === tgtId) return true;
    return this.getReachs(srcId, Direction.Out).has(tgtId);
  }

  public getReachs(id: string, direction: Direction = Direction.Out): Set<string> {
    const reachs = this.resolveReachs(direction);
    if (!reachs.has(id)) {
      const visited = this.traverse(id, direction);
      reachs.set(id, visited);
    }
    return reachs.get(id)!;
  }

  protected order(node: string | T, direction: Direction = Direction.Out) {
    const rootId = this.resolveId(node);
    const key = this.createKey(rootId, direction);
    if (this.orders.has(key)) {
      return this.orders.get(key)!;
    }

    const subdag = this.subgraph(node, direction);
    const inDegree = new Map(subdag.inDegree);
    const stack: string[] = [];

    for (const [id, deg] of inDegree) {
      if (deg === 0) stack.push(id);
    }

    const result: T[] = [];
    while (stack.length > 0) {
      const id = stack.shift()!;
      const node = subdag.getNode(id);
      result.push(node);

      for (const neighbor of subdag.getOutEdges(id)) {
        const deg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) stack.push(neighbor);
      }
    }

    if (result.length !== subdag.size) {
      throw new Error("Cycle detected in subgraph");
    }

    this.orders.set(key, result);
    return result;
  }

  protected subgraph(
    node: string | T,
    direction: Direction = Direction.Out
  ) {
    const rootId = this.resolveId(node);
    if (!this.hasNode(rootId)) return new DAG();

    const key = this.createKey(rootId, direction);
    if (this.subgraphs.has(key)) return this.subgraphs.get(key)!;

    const reachs = this.getReachs(rootId, direction)
    const subdag = new DAG<P, T>();

    for (const nodeId of reachs) {
      subdag.addNode(this.nodes.get(nodeId)!);
    }

    for (const nodeId of reachs) {
      for (const targetId of this.outEdges.get(nodeId) ?? []) {
        if (reachs.has(targetId)) {
          const weight = this.edgeWeights.get(nodeId)?.get(targetId) ?? 1;
          subdag.addEdge(nodeId, targetId, weight);
        }
      }
    }

    this.subgraphs.set(key, subdag);
    return subdag;
  }

  protected traverse(
    node: string | T,
    direction: Direction = Direction.Out,
    callback?: (id: string) => boolean | void
  ): Set<string> {
    const rootId = this.resolveId(node);

    const visited = new Set<string>();
    const stack = [rootId];

    const edges = this.resolveEdges(direction);

    while (stack.length > 0) {
      const id = stack.pop()!;

      if (!this.hasNode(id)) continue
      if (visited.has(id)) continue
      visited.add(id)

      if (typeof callback === 'function') {
        const stop = callback(id)
        if (stop === false) break
      }

      for (const next of edges.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    return visited;
  }

  private createNode(input: string | T): T {
    return typeof input === 'string' ? new Node(input) as T : input
  }

  private createKey(id: string, direction: Direction) {
    return `${direction}:${id}`;
  }

  private resolveId(input: string | T): string {
    return typeof input === 'string' ? input : input.id;
  }

  private resolveEdges(direction: Direction): Map<string, Set<string>> {
    return direction === Direction.In ? this.inEdges : this.outEdges
  }

  private resolveReachs(direction: Direction): Map<string, Set<string>> {
    if (this.isDirty(Dirty.Reach)) {
      this.inReachs.clear();
      this.outReachs.clear();
      this.clearDirty(Dirty.Reach);
    }
    return direction === Direction.Out ? this.outReachs : this.inReachs;
  }

  private markDirty(flags: Dirty) {
    this.dirty |= flags;

    if (flags & Dirty.Reach) {
      this.inReachs.clear();
      this.outReachs.clear();
      this.subgraphs.clear();
    }

    if (flags & Dirty.Topo) {
      this.orders.clear();
    }
  }

  private isDirty(flag: Dirty): boolean {
    return (this.dirty & flag) !== 0;
  }

  private clearDirty(flag: Dirty) {
    this.dirty &= ~flag;
  }
}