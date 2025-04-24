import { Middleware, MiddlewareContext } from "./types";

export class MiddlewareChain<T = any> {
  private chain: Middleware<T>[] = [];
  use(mw: Middleware<T>) {
    this.chain.push(mw);
  }
  runSync(
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => void
  ) {
    let i = -1;
    let called = false;
    const next = () => {
      if (called) throw new Error("next() called multiple times in middleware");
      called = true;
      i++;
      if (i < this.chain.length) {
        called = false;
        this.chain[i](ctx, next);
      } else {
        last(ctx);
      }
    };
    next();
  }
  async run(
    ctx: MiddlewareContext<T>,
    last: (ctx: MiddlewareContext<T>) => Promise<void> | void
  ) {
    let i = 0;
    let called = false;
    const next = async () => {
      if (called) throw new Error("next() called multiple times in middleware");
      called = true;
      if (i < this.chain.length) {
        called = false;
        const mw = this.chain[i++];
        await mw(ctx, next);
      } else {
        await last(ctx);
      }
    };
    await next();
  }
}
