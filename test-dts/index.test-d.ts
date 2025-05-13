import { stosh } from '../dist/index';

const s = stosh<{ name: string }>();
s.setSync('user', { name: 'alice' });
const user = s.getSync('user');
// Expect any | null
user;

// batchGet/batchGetSync 타입 추론
const arr = s.batchGetSync(['user']);
// Expect (any | null)[]
arr;

// ❌ 잘못된 타입: 반드시 타입 에러 발생해야 함
// @ts-expect-error
s.setSync('user', { age: 123 }); // name이 없으므로 타입 에러 기대

// ❌ key 없는 값
// @ts-expect-error
s.setSync(); // 인자 부족으로 에러

// batchSet 잘못된 값 타입(배열 value 타입 강제)
// @ts-expect-error
s.batchSetSync([{ key: 'x', value: 1 }]); // 타입 괜찮음(예시), 아래처럼 할 경우 타입 에러
// @ts-expect-error
s.batchSetSync([{ key: 'x', value: { foo: 1 } }]); // { name: string }이 아님

// async 사용 시 잘못된 타입
(async () => {
  // 정상 케이스
  await s.set('user', { name: 'bob' });
  // @ts-expect-error: value에 없는 프로퍼티
  await s.set('user', { value: 123 });
})();

// 네임스페이스, 커스텀 직렬화 등 옵션 타입 안전성
const s2 = stosh<unknown>({
  namespace: 'test',
  serialize: (d: unknown) => JSON.stringify(d),
  deserialize: (r: string) => JSON.parse(r),
});
s2.setSync('foo', 1);
// Expect number | null
s2.getSync('foo');

// 1. 제네릭 타입 명시 시 타입 추론
const s3 = stosh<{ name: string }>();
s3.setSync('user', { name: 'alice' });
const user3 = s3.getSync('user');
// Expect { name: string } | null
user3;

// 2. batchSet, batchSetSync, batchRemove, batchRemoveSync의 entry별 options, 공통 options 타입
s3.batchSetSync(
  [
    { key: 'a', value: { name: 'a' }, options: { expire: 1000 } },
    { key: 'b', value: { name: 'b' } },
  ],
  { path: '/app', secure: true },
);

s3.batchRemoveSync(['a', 'b'], { path: '/app', secure: true });

// 3. 쿠키 옵션/일반 옵션 타입 구분
s3.setSync(
  'cookie',
  { name: 'c' },
  { path: '/x', domain: 'd', secure: true, sameSite: 'Strict', expire: 1000 },
);
s3.removeSync('cookie', {
  path: '/x',
  domain: 'd',
  secure: true,
  sameSite: 'Strict',
});

// 4. use, onChange 미들웨어 타입
s3.use('set', (ctx: { value?: { name: string } }, next: () => void) => {
  if (ctx.value) {
    ctx.value.name;
  }
  next();
});
s3.use('get', (ctx: { result?: { name: string } | null }, next: () => void) => {
  next();
  if (ctx.result) {
    ctx.result.name;
  }
});
s3.use('remove', (ctx: { key: string }, next: () => void) => {
  ctx.key;
  next();
});
s3.onChange((key: string | null, value: { name: string } | null) => {
  if (value) {
    value.name;
  }
});

// 5. getAll, getAllSync, batchGet, batchGetSync 반환 타입
const all = s3.getAllSync();
// Expect Record<string, { name: string }>
all;
const arr2 = s3.batchGetSync(['a', 'b']);
// Expect ({ name: string } | null)[]
arr2;

// 비동기 타입테스트는 async 함수 내부에서 처리
(async () => {
  const st = stosh<{ foo: { a: number } }>({ type: 'memory' });
  st.batchSet([{ key: 'foo', value: { foo: { a: 1 } } }]);
  const result1 = await st.get('foo');
  // result1: { foo: { a: number } } | null

  const st1 = stosh({ type: 'memory' });
  st1.batchSet([{ key: 'foo', value: { a: 1 } }]);
  const result2 = await st1.get('foo');
  // result2: { a: number } | null
})();
