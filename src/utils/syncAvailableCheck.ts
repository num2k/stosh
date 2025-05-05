export function checkSyncAvailable(
  idbStorage: any,
  strictSyncFallback: boolean,
  methodName: string
) {
  if (idbStorage) {
    if (strictSyncFallback) {
      throw new Error(
        `[stosh] ${methodName} is not supported with IndexedDB storage.`
      );
    } else {
      console.warn(
        `[stosh] ${methodName} called when IndexedDB is the primary storage. Operation will use the synchronous fallback storage (e.g., localStorage, memory).`
      );
    }
  }
}
