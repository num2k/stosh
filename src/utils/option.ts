export function mergeOptions<T extends object>(common?: T, entry?: T): T {
  if (!common && !entry) {
    return {} as T;
  }
  if (!common) {
    return { ...entry } as T;
  }
  if (!entry) {
    return { ...common } as T;
  }
  return { ...common, ...entry } as T
}
