export function mergeOptions<T extends object>(common?: T, entry?: T): T {
  return { ...(common || {}), ...(entry || {}) } as T;
}
