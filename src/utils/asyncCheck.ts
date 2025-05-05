export function warnIfAsyncMiddleware(
  this: any,
  method: "set" | "get" | "remove"
) {
  const isAsyncFn = (fn: Function) =>
    typeof fn === "function" &&
    (fn.constructor?.name === "AsyncFunction" || /^async /.test(fn.toString()));
  const hasAsync = this.middleware?.[method]?.some(isAsyncFn);
  if (hasAsync) {
    console.warn(
      "[stosh] An async middleware is registered to a sync method. Unexpected behavior may occur when using setSync/getSync/removeSync, etc."
    );
  }
}
