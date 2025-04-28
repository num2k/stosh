// 동기 메서드에서 비동기 미들웨어 감지 및 경고를 위한 공통 함수
export function warnIfAsyncMiddleware(this: any, method: "set" | "get" | "remove") {
  const isAsyncFn = (fn: any) => typeof fn === "function" && (
    fn.constructor?.name === "AsyncFunction" ||
    /^async /.test(fn.toString())
  );
  const hasAsync = this.middleware?.[method]?.some(isAsyncFn);
  if (hasAsync) {
    console.warn("[stosh] An async middleware is registered to a sync method. Unexpected behavior may occur when using setSync/getSync/removeSync, etc.");
  }
}
