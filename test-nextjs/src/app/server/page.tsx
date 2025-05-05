import React from "react";
import Link from "next/link";
import { stosh } from "stosh";

export default function ServerPage() {
  if (stosh.isSSR) {
    // 서버에서만 실행되는 코드
    console.log("서버에서 실행 중입니다.");
  }

  const storage = stosh({ namespace: "server-test" });
  if (storage.isMemoryFallback) {
    console.log("Memory fallback is being used.");
  } else {
    console.log("IndexedDB is being used.");
  }

  return (
    <div>
      <h1>서버 컴포넌트</h1>
      <p>이 컴포넌트는 서버에서 렌더링됩니다.</p>
      <br />
      <Link href="/">홈으로 돌아가기</Link>
    </div>
  );
}
