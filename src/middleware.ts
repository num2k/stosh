import { Middleware, MiddlewareContext } from "./types";

export function runMiddlewareSync<T = any>(
  mws: Middleware<T>[],
  ctx: MiddlewareContext<T>,
  last: (ctx: MiddlewareContext<T>) => void
) {
  let i = -1;
  const next = () => {
    i++;
    if (i < mws.length) mws[i](ctx, next);
    else last(ctx);
  };
  next();
}

export async function runMiddleware<T = any>(
  mws: Middleware<T>[],
  ctx: MiddlewareContext<T>,
  last: (ctx: MiddlewareContext<T>) => Promise<void> | void
) {
  let i = 0;
  async function next() {
    if (i < mws.length) {
      const mw = mws[i++];
      await mw(ctx, next);
    } else {
      await last(ctx);
    }
  }
  await next();
}
