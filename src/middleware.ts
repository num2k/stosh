import { Middleware, MiddlewareContext } from "./types";
import { MiddlewareMethod } from "./constants"; // Import from constants

export function runMiddlewareSync<T = any>(
  mws: Middleware<T>[],
  ctx: MiddlewareContext<T>,
  last: (ctx: MiddlewareContext<T>) => void
) {
  let i = -1;
  let called = false;
  const next = () => {
    if (called) throw new Error("next() called multiple times in middleware");
    called = true;
    i++;
    if (i < mws.length) {
      called = false;
      mws[i](ctx, next);
    } else {
      last(ctx);
    }
  };
  next();
}

export async function runMiddleware<T = any>(
  mws: Middleware<T>[],
  ctx: MiddlewareContext<T>,
  last: (ctx: MiddlewareContext<T>) => Promise<void> | void
) {
  let i = 0;
  let called = false;
  async function next() {
    if (called) throw new Error("next() called multiple times in middleware");
    called = true;
    if (i < mws.length) {
      called = false;
      const mw = mws[i++];
      await mw(ctx, next);
    } else {
      await last(ctx);
    }
  }
  await next();
}
