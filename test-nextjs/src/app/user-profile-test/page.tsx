"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { stosh } from "stosh";

// stosh를 활용한 로그인 사용자 정보(프로필) 저장/조회/삭제 예시
export default function UserProfileTest() {
  const [profile, setProfile] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [input, setInput] = useState({ name: "", email: "" });
  const storage = stosh<{ name: string; email: string }>({
    namespace: "user-profile",
  });

  useEffect(() => {
    // 페이지 진입 시 저장된 프로필 불러오기
    const fetchProfile = async () => {
      const saved = await storage.get("profile1");
      if (saved) setProfile(saved);
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    try {
      await storage.set("profile1", input);
      setProfile(input);
    } catch (e) {
      alert("저장 실패: " + (e as Error).message);
    }
  };

  const handleRemove = async () => {
    try {
      await storage.remove("profile1");
      setProfile(null);
    } catch (e) {
      alert("삭제 실패: " + (e as Error).message);
    }
  };

  return (
    <main style={{ padding: 32 }}>
      <h1>사용자 프로필 저장/조회 예시</h1>
      <div style={{ marginBottom: 24 }}>
        <input
          placeholder="이름"
          value={input.name}
          onChange={(e) => setInput({ ...input, name: e.target.value })}
          style={{ marginRight: 8 }}
        />
        <input
          placeholder="이메일"
          value={input.email}
          onChange={(e) => setInput({ ...input, email: e.target.value })}
          style={{ marginRight: 8 }}
        />
        <button onClick={handleSave}>저장</button>
        <button onClick={handleRemove} style={{ marginLeft: 8 }}>
          삭제
        </button>
      </div>
      <div>
        <strong>저장된 프로필:</strong>
        <pre style={{ background: "#f5f5f5", padding: 12, borderRadius: 6 }}>
          {profile ? JSON.stringify(profile, null, 2) : "(없음)"}
        </pre>
      </div>
      <div style={{ marginTop: 32 }}>
        <Link href="/">← 메인으로</Link>
      </div>
    </main>
  );
}
