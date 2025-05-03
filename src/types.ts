import { StorageType } from "./constants";

export interface CookieOptions {
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export type StoredData<T> = { v: T; e?: number };

export interface StoshOptions<T = any> extends CookieOptions {
  priority?: StorageType[];
  type?: StorageType;
  namespace?: string;
  serialize?: (data: StoredData<T>) => string;
  deserialize?: (raw: string) => StoredData<T>;
  strictSyncFallback?: boolean;
}

export interface SetOptions extends CookieOptions {
  expire?: number;
}

export interface RemoveOptions extends CookieOptions {}

export interface MiddlewareOptions {
  prepend?: boolean;
  append?: boolean;
}

export type UnsubscribeFn = () => void;

export type MiddlewareContext<T = any> = {
  key: string;
  value?: T;
  options?: SetOptions;
  result?: T | null;
  isSync?: boolean;
};

export type MiddlewareFn<T = any> = (
  ctx: MiddlewareContext<T>,
  next: () => Promise<void> | void
) => Promise<void> | void;

export type MiddlewareEntry<T = any> = {
  fn: MiddlewareFn<T>;
  options?: MiddlewareOptions;
};