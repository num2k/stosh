export function stripNamespace(key: string, namespace: string): string {
  return key.startsWith(namespace) ? key.slice(namespace.length) : key;
}

export function getNamespaceKeys(
  storage: Storage,
  namespace: string
): string[] {
  return Array.from({ length: storage.length })
    .map((_, i) => storage.key(i))
    .filter((k): k is string => !!k && k.startsWith(namespace));
}
