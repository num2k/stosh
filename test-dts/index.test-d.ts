import { stosh } from "../src";

stosh().setSync("foo", Symbol("x"));

// 올바른 타입 저장/조회
const s = stosh();
s.setSync("user", { name: "alice" });
const user = s.getSync("user");
// Expect any | null
user;

// batchGet/batchGetSync 타입 추론
const arr = s.batchGetSync(["user"]);
// Expect (any | null)[]
arr;

// 네임스페이스, 커스텀 직렬화 등 옵션 타입 안전성
const s2 = stosh({
  namespace: "test",
  serialize: (d) => JSON.stringify(d),
  deserialize: (r) => JSON.parse(r),
});
s2.setSync("foo", 1);
// Expect number | null
s2.getSync("foo");

// 1. 제네릭 타입 명시 시 타입 추론
const s3 = stosh<{ name: string }>();
s3.setSync("user", { name: "alice" });
const user3 = s3.getSync("user");
// Expect { name: string } | null
user3;

// 2. batchSet, batchSetSync, batchRemove, batchRemoveSync의 entry별 options, 공통 options 타입
s3.batchSetSync(
  [
    { key: "a", value: { name: "a" }, options: { expire: 1000 } },
    { key: "b", value: { name: "b" } },
  ],
  { path: "/app", secure: true }
);

s3.batchRemoveSync(["a", "b"], { path: "/app", secure: true });

// 3. 쿠키 옵션/일반 옵션 타입 구분
s3.setSync(
  "cookie",
  { name: "c" },
  { path: "/x", domain: "d", secure: true, sameSite: "Strict", expire: 1000 }
);
s3.removeSync("cookie", {
  path: "/x",
  domain: "d",
  secure: true,
  sameSite: "Strict",
});

// 4. use, onChange 미들웨어 타입
s3.use("set", (ctx, next) => {
  if (ctx.value) ctx.value.name;
  next();
});
s3.use("get", (ctx, next) => {
  next();
  if (ctx.result) ctx.result.name;
});
s3.use("remove", (ctx, next) => {
  ctx.key;
  next();
});
s3.onChange((key, value) => {
  if (value) value.name;
});

// 5. getAll, getAllSync, batchGet, batchGetSync 반환 타입
const all = s3.getAllSync();
// Expect Record<string, { name: string }>
all;
const arr2 = s3.batchGetSync(["a", "b"]);
// Expect ({ name: string } | null)[]
arr2;
