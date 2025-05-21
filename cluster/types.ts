import { TaskPriority } from "./enums";

export type ScriptURL = string | URL | ((input: any) => any);

export interface Job<P, R> {
  id: string;
  payload: P;
  retries: number;
  scriptURL: URL;
  abortController?: AbortController;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  transferables?: Transferable[];
  timeout?: number;
  onProgress?: (progress: number) => void;
}

export interface JobOptions {
  id?: string;
  scriptURL?: ScriptURL;
  priority?: TaskPriority;
  retries?: number;
  timeout?: number;
  transferables?: Transferable[];
  abortSignal?: AbortSignal;
}