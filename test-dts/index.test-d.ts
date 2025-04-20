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
