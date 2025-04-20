export interface StoshOptions {
  priority?: Array<"idb" | "local" | "session" | "cookie" | "memory">;
  type?: "local" | "session" | "cookie" | "idb";
  namespace?: string;
  serialize?: (data: any) => string;
  deserialize?: (raw: string) => any;
}

export interface SetOptions {
  expire?: number;
}

export type MiddlewareContext<T = any> = {
  key: string;
  value?: T;
  options?: SetOptions;
  result?: any;
};

export type Middleware<T = any> = (
  ctx: MiddlewareContext<T>,
  next: () => Promise<void> | void
) => Promise<void> | void;
