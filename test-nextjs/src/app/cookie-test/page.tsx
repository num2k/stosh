"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { stosh } from "stosh";

export default function CookieTest() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      const logs: string[] = [];
      // [TEST 1] 쿠키 스토리지 기본 사용 (기대값: cookie get = bar, cookie removed = true)
      const cookieStorage = stosh({ type: "cookie", namespace: "ck" });
      cookieStorage.setSync("foo", "bar");
      logs.push(
        "[쿠키 기본] cookie get: (기대값: bar) → " +
          cookieStorage.getSync("foo")
      );
      cookieStorage.removeSync("foo", {});
      logs.push(
        "[쿠키 기본] cookie removed: (기대값: true) → " +
          (cookieStorage.getSync("foo") === null)
      );
      // [TEST 2] 쿠키 옵션(path, secure 등) (기대값: adv user = Alice, adv session = xyz, adv user removed = true)
      const adv = stosh({
        type: "cookie",
        namespace: "adv",
        path: "/",
        secure: true,
      });
      adv.setSync("user", "Alice");
      adv.setSync("expired-test", "value:test", {
        expire: 1000 * 5,
        path: "/cookie-test",
      });
      adv.setSync("session", "xyz", { expire: 1000 * 60 });

      adv
        .set("expired-test-async", "value:test-async", {
          expire: 1000 * 7,
          path: "/cookie-test",
        })
        .then(async () => {
          setTimeout(async () => {
            logs.push(
              "[쿠키 옵션] adv expired-test-async expire 7초 후 쿠키 자동 제거: (기대값: true) → " +
                ((await adv.get("expired-test-async")) === null)
            );
            console.log(
              "expired-test-async 쿠키 제거 됨:",
              (await adv.get("expired-test-async")) === null
            );
            setLog([...logs]);
          }, 7000);
        });

      // 쿠키 제거 실패 예상: path 일치 하지 않을시 (path: '/')
      adv.remove("expired-test-async");

      console.log(await adv.get("expired-test-async"));

      logs.push(
        "[쿠키 옵션] adv user: (기대값: Alice) → " + adv.getSync("user")
      );
      logs.push(
        "[쿠키 옵션] adv session: (기대값: xyz, 1분 후 쿠키 제거) → " +
          adv.getSync("session")
      );
      setTimeout(() => {
        logs.push(
          "[쿠키 옵션] adv expired-test expire 5초 후 쿠키 자동 제거: (기대값: true) → " +
            (adv.getSync("expired-test") === null)
        );
        setLog([...logs]);
      }, 5000);
      setLog([...logs]);
    };
    run();
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <h1>쿠키/옵션 테스트</h1>
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
