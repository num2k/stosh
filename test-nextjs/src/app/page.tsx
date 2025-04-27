"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { stosh } from "stosh";

export default function Home() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const logs: string[] = [];
    // [생성/조회 테스트] (삭제/만료/clear 없음)
    const storage = stosh({ namespace: "test" });

    storage.use("set", async (ctx, next) => {
      if (ctx.isSync) {
        // 동기 전용 미들웨어 로직
        // console.log("Sync set middleware");
      } else {
        // 비동기 전용 미들웨어 로직
        console.log("Async set middleware");
        if (ctx.value) {
          console.log("set===?", ctx.key, ctx.value);
        }
      }

      await next();
    });

    storage.use("get", async (ctx, next) => {
      await next();
      if (ctx.result !== null && !ctx.isSync) {
        console.log("get===?", ctx.key, ctx.result);
      }
    });
    // 동기 저장/조회
    storage.setSync("syncKey", "syncValue", {
      expire: 1000 * 5,
    });
    logs.push(
      "[동기 set/get] sync get: (기대값: syncValue) → " +
        storage.getSync("syncKey")
    );

    // 비동기 저장/조회
    storage.set("asyncKey", "asyncValue").then(() => {
      storage
        .get("asyncKey")
        .then((v) =>
          logs.push("[비동기 get] async get: (기대값: asyncValue) → " + v)
        );
      setLog([...logs]);
    });
    // 타입 안전성
    const typed = stosh<{ name: string }>();
    typed.setSync("user", { name: "홍길동" });
    const user = typed.getSync("user");
    logs.push(
      "[타입 안전성] typed get: (기대값: 홍길동) → " + (user && user.name)
    );

    // 비동기 저장/조회
    const asyncStorage = stosh({ namespace: "async-storage" });
    asyncStorage
      .set("user-async", { name: "비동기 홍길동" })
      .then(() => {
        const v = asyncStorage.get("user-async");
        return v;
      })
      .then((v) => {
        logs.push(
          "[비동기 저장/조회] typed get: (기대값: 비동기 홍길동) → " +
            (v && v.name)
        );
      })
      .catch((e) => {
        console.error("타입 안전성 오류:", e);
      });

    // 비동기 배치 저장/조회 (persist는 삭제/만료 없음)
    (async () => {
      let batchVals;
      try {
        await storage.batchSet([
          { key: "a", value: 1 },
          { key: "b", value: 2 },
          {
            key: "persist",
            value: "indexeddb",
            // options: { expire: 1000 * 5 },
          },
          {
            key: "c",
            value: 3,
            options: { expire: 1000 * 5 },
          },
        ]);
        batchVals = await storage.batchGet(["a", "b", "persist", "c"]);
      } catch (error) {
        console.error("Batch set error:", error);
      }
      logs.push(
        "[비동기 배치 get] batch get: (기대값: [1,2,'indexeddb',3 ]) → " +
          JSON.stringify(batchVals)
      );
      setLog([...logs]);
    })();
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>stosh 생성/조회 테스트</h1>
      <ol style={{ fontFamily: "monospace", fontSize: 16 }}>
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      <div style={{ marginTop: 32 }}>
        <Link href="/remove-test">삭제/만료 테스트</Link> |{" "}
        <Link href="/namespace-test">네임스페이스 테스트</Link> |{" "}
        <Link href="/cookie-test">쿠키/옵션 테스트</Link>
      </div>
    </main>
  );
}
