export type MiddlewareFn<T> = (
  ctx: T,
  next: () => Promise<void> | void
) => Promise<void> | void;

export function runMiddlewareChain<T>(
  middlewares: MiddlewareFn<T>[],
  ctx: T,
  last: (ctx: T) => Promise<void> | void
) {
  let i = -1;
  function dispatch(index: number): Promise<void> | void {
    if (index <= i) throw new Error("next() called multiple times");
    i = index;
    const fn = middlewares[index] || last;
    if (!fn) return;
    return Promise.resolve(fn(ctx, () => dispatch(index + 1)));
  }
  return dispatch(0);
}

export function runMiddlewareChainSync<T>(
  middlewares: MiddlewareFn<T>[],
  ctx: T,
  last: (ctx: T) => void
) {
  let i = -1;
  function dispatch(index: number): void {
    if (index <= i) throw new Error("next() called multiple times");
    i = index;
    const fn = middlewares[index] || last;
    if (!fn) return;
    fn(ctx, () => dispatch(index + 1));
  }
  dispatch(0);
}
