"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { stosh } from "stosh";

export default function RemoveTest() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const logs: string[] = [];
    // [삭제/만료 테스트]
    const storage = stosh({ namespace: "test" });
    // 동기 삭제
    storage.removeSync("syncKey");
    logs.push(
      "[동기 remove] syncKey 삭제 후: (기대값: null) → " +
        storage.getSync("syncKey")
    );
    // 비동기 삭제
    storage.remove("asyncKey").then(() => {
      storage
        .get("asyncKey")
        .then((v) =>
          logs.push("[비동기 remove] asyncKey 삭제 후: (기대값: null) → " + v)
        );
      setLog([...logs]);
    });
    // 타입 안전성 삭제
    const typed = stosh<{ name: string }>();
    typed.removeSync("user");
    logs.push(
      "[타입 안전성 remove] user 삭제 후: (기대값: null) → " +
        typed.getSync("user")
    );
    // 비동기 배치 삭제 (persist는 남김)
    (async () => {
      await storage.batchRemove(["a", "b"]);
      const batchVals = await storage.batchGet(["a", "b", "persist"]);
      logs.push(
        '[비동기 배치 remove] batch removed: (기대값: [null, null, "indexeddb"]) → ' +
          JSON.stringify(batchVals)
      );
      setLog([...logs]);
    })();
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>stosh 삭제/만료 테스트</h1>
      <ol style={{ fontFamily: "monospace", fontSize: 16 }}>
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      <div style={{ marginTop: 32 }}>
        <Link href="/">← 메인으로</Link>
      </div>
    </main>
  );
}
