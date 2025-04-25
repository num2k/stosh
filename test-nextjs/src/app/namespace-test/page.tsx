"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { stosh } from "stosh";

export default function NamespaceTest() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const logs: string[] = [];
    // [TEST 1] 네임스페이스 분리 (기대값: user profile = {name: "Alice"}, cache temp = 123)
    const userStorage = stosh({ namespace: "user" });
    const cacheStorage = stosh({ namespace: "cache" });
    userStorage.setSync("profile", { name: "Alice" });
    cacheStorage.setSync("temp", 123);
    logs.push(
      "[네임스페이스 분리] user profile: (기대값: {name: 'Alice'}) → " +
        JSON.stringify(userStorage.getSync("profile"))
    );
    logs.push(
      "[네임스페이스 분리] cache temp: (기대값: 123) → " +
        cacheStorage.getSync("temp")
    );
    // [TEST 2] 네임스페이스 충돌 (기대값: ns2 get x = 1)
    const ns1 = stosh({ namespace: "ns" });
    const ns2 = stosh({ namespace: "ns" });
    ns1.setSync("x", 1);
    logs.push(
      "[네임스페이스 충돌] ns2 get x: (기대값: 1) → " + ns2.getSync("x")
    );
    setLog([...logs]);
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>네임스페이스/다중 인스턴스 테스트</h1>
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
