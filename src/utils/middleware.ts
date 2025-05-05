import { MiddlewareFn, MiddlewareContext } from "../types";

export function runMiddlewareChain<T>(
  middlewares: MiddlewareFn<T>[],
  ctx: MiddlewareContext<T>,
  last: (ctx: MiddlewareContext<T>) => Promise<void> | void
): Promise<void> | void {
  let i = -1;
  function dispatch(index: number): Promise<void> | void {
    if (index <= i) throw new Error("next() called multiple times");
    i = index;
    const fn = middlewares[index] || last;
    if (!fn) return;
    try {
      return Promise.resolve(fn(ctx, () => dispatch(index + 1))).catch(
        (err) => {
          console.error("[stosh] Middleware error:", err);
          throw err;
        }
      );
    } catch (err) {
      console.error("[stosh] Middleware error:", err);
      throw err;
    }
  }
  return dispatch(0);
}

export function runMiddlewareChainSync<T>(
  middlewares: MiddlewareFn<T>[],
  ctx: MiddlewareContext<T>,
  last: (ctx: MiddlewareContext<T>) => void
): void {
  let i = -1;
  function dispatch(index: number): void {
    if (index <= i) throw new Error("next() called multiple times");
    i = index;
    const fn = middlewares[index] || last;
    if (!fn) return;
    try {
      fn(ctx, () => dispatch(index + 1));
    } catch (err) {
      console.error("[stosh] Middleware error:", err);
      throw err;
    }
  }
  dispatch(0);
}
