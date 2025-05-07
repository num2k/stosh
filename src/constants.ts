export const STORAGE_TYPE_IDB = "idb";
export const STORAGE_TYPE_LOCAL = "local";
export const STORAGE_TYPE_SESSION = "session";
export const STORAGE_TYPE_COOKIE = "cookie";
export const STORAGE_TYPE_MEMORY = "memory";

export type StorageType =
  | typeof STORAGE_TYPE_IDB
  | typeof STORAGE_TYPE_LOCAL
  | typeof STORAGE_TYPE_SESSION
  | typeof STORAGE_TYPE_COOKIE
  | typeof STORAGE_TYPE_MEMORY

// Default priority for async APIs
export const DEFAULT_PRIORITY: StorageType[] = [
  STORAGE_TYPE_IDB,
  STORAGE_TYPE_LOCAL,
  STORAGE_TYPE_SESSION,
  STORAGE_TYPE_COOKIE,
  STORAGE_TYPE_MEMORY,
];

// Default priority for sync APIs (excludes idb)
export const DEFAULT_PRIORITY_SYNC: StorageType[] = [
  STORAGE_TYPE_LOCAL,
  STORAGE_TYPE_SESSION,
  STORAGE_TYPE_COOKIE,
  STORAGE_TYPE_MEMORY,
];

// Middleware methods
export const MIDDLEWARE_METHOD_GET = "get";
export const MIDDLEWARE_METHOD_SET = "set";
export const MIDDLEWARE_METHOD_REMOVE = "remove";

export type MiddlewareMethod =
  | typeof MIDDLEWARE_METHOD_GET
  | typeof MIDDLEWARE_METHOD_SET
  | typeof MIDDLEWARE_METHOD_REMOVE
