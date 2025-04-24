import { StorageType } from "./constants";

export interface CookieOptions {
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface StoshOptions extends CookieOptions {
  priority?: StorageType[];
  type?: StorageType;
  namespace?: string;
  serialize?: (data: any) => string;
  deserialize?: (raw: string) => any;
}

export interface SetOptions extends CookieOptions {
  expire?: number;
}

export interface RemoveOptions extends CookieOptions {}

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
