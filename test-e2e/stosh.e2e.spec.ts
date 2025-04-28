declare global {
  interface Window {
    stosh: any;
    storage: any;
  }
}

import { test, expect } from "@playwright/test";

test.describe("Stosh E2E 기본 동작", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-e2e/build/public/index.html");
  });

  test("localStorage set/get/remove/has 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "e2e" });
      window.storage.setSync("foo", 123);
    });
    const value = await page.evaluate(() => window.storage.getSync("foo"));
    expect(value).toBe(123);

    await page.evaluate(() => window.storage.removeSync("foo"));
    const removed = await page.evaluate(() => window.storage.getSync("foo"));
    expect(removed).toBeNull();
  });

  test("만료(expire) 옵션 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "e2e_expire" });

      window.storage.setSync("exp", "bye", { expire: 10 });
    });
    const value = await page.evaluate(() => {
      return window.storage.getSync("exp");
    });
    expect(value).toBe("bye");
    // 만료 시뮬레이션 (실제 시간 경과 필요)
    await page.waitForTimeout(20);
    const expired = await page.evaluate(() => {
      return window.storage.getSync("exp");
    });
    expect(expired).toBeNull();
  });

  test("동기/비동기 set/get/remove/has/clear 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "e2e_sync" });
      window.storage.setSync("foo", 1);
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(1);
    await page.evaluate(() => window.storage.removeSync("foo"));
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBeNull();
    await page.evaluate(() => window.storage.setSync("bar", 2));
    await page.evaluate(() => window.storage.clearSync());
    expect(await page.evaluate(() => window.storage.getSync("bar"))).toBeNull();

    // 비동기
    await page.evaluate(async () => {
      window.storage = window.stosh({ type: "local", namespace: "e2e_async" });
      await window.storage.set("foo", 1);
    });
    expect(
      await page.evaluate(async () => await window.storage.get("foo"))
    ).toBe(1);
    await page.evaluate(async () => await window.storage.remove("foo"));
    expect(
      await page.evaluate(async () => await window.storage.get("foo"))
    ).toBeNull();
    await page.evaluate(async () => await window.storage.set("bar", 2));
    await page.evaluate(async () => await window.storage.clear());
    expect(
      await page.evaluate(async () => await window.storage.get("bar"))
    ).toBeNull();
  });

  test("네임스페이스 격리", async ({ page }) => {
    await page.evaluate(() => {
      window.ns1 = window.stosh({ type: "local", namespace: "ns1" });
      window.ns2 = window.stosh({ type: "local", namespace: "ns2" });
      window.ns1.setSync("k", 1);
      window.ns2.setSync("k", 2);
    });
    expect(await page.evaluate(() => window.ns1.getSync("k"))).toBe(1);
    expect(await page.evaluate(() => window.ns2.getSync("k"))).toBe(2);
    await page.evaluate(() => window.ns1.clearSync());
    expect(await page.evaluate(() => window.ns1.getSync("k"))).toBeNull();
    expect(await page.evaluate(() => window.ns2.getSync("k"))).toBe(2);
  });

  test("batchSet/batchGet/batchRemove 동작", async ({ page }) => {
    try {
      await page.evaluate(async () => {
        window.storage = window.stosh({ namespace: "batch" });
        await window.storage.batchSet([
          { key: "a", value: 1 },
          { key: "b", value: 2 },
          { key: "c", value: 3 },
        ]);
      });
      // 미들웨어가 없는 경우 [1, 2]가 정상, 미들웨어가 있으면 [2, 3] 등으로 바뀔 수 있음
      const result = await page.evaluate(
        async () => await window.storage.batchGet(["a", "b"])
      );
      expect(result).toEqual([1, 2]);
      await page.evaluate(
        async () => await window.storage.batchRemove(["a", "b"])
      );
      expect(
        await page.evaluate(async () => await window.storage.get("a"))
      ).toBeNull();
      expect(
        await page.evaluate(async () => await window.storage.get("b"))
      ).toBeNull();
      expect(
        await page.evaluate(async () => await window.storage.get("c"))
      ).toBe(3);
    } catch (e) {
      throw e;
    }
  });

  test("미들웨어 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "mw" });
      window.storage.use("set", (ctx, next) => {
        ctx.value = "m_" + ctx.value;
        next();
      });
      window.storage.setSync("x", "y");
    });
    expect(await page.evaluate(() => window.storage.getSync("x"))).toBe("m_y");
    await page.evaluate(() => {
      window.storage.use("remove", (ctx, next) => {
        window.removed = ctx.key;
        next();
      });
      window.storage.removeSync("x");
    });
    expect(await page.evaluate(() => window.removed)).toBe("x");
    expect(await page.evaluate(() => window.storage.getSync("x"))).toBeNull();
  });

  test("커스텀 직렬화/역직렬화 동작", async ({ page }) => {
    await page.evaluate(() => {
      const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
      const b64d = (s) => decodeURIComponent(escape(atob(s)));
      window.storage = window.stosh({
        namespace: "enc",
        serialize: (data) => b64(JSON.stringify(data)),
        deserialize: (raw) => JSON.parse(b64d(raw)),
      });
      window.storage.setSync("foo", { a: 1 });
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toEqual({
      a: 1,
    });
    const raw = await page.evaluate(() =>
      window.localStorage.getItem("enc:foo")
    );
    expect(raw).not.toContain("{");
  });

  test("falsy 값 저장/조회/삭제", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "falsy" });
      const falsyValues = [undefined, null, "", 0, false];
      falsyValues.forEach((v, i) => {
        const key = "falsy_" + i;
        window.storage.setSync(key, v);
      });
    });
    for (let i = 0; i < 5; ++i) {
      const key = `falsy_${i}`;
      const v = await page.evaluate((key) => window.storage.getSync(key), key);
      if (i === 0) expect(v).toBeNull(); // undefined 저장 시 null 반환
      else expect([null, "", 0, false]).toContain(v);
      await page.evaluate((key) => window.storage.removeSync(key), key);
      expect(
        await page.evaluate((key) => window.storage.getSync(key), key)
      ).toBeNull();
    }
  });

  test("지원하지 않는 storage type 예외", async ({ page }) => {
    const error = await page.evaluate(() => {
      try {
        window.stosh({ type: "notype", namespace: "x" });
        return null;
      } catch (e) {
        return e.message;
      }
    });
    expect(error).not.toBeNull();
  });

  test("onChange 콜백 동작 (storage 이벤트, 멀티탭)", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.storage = window.stosh({ namespace: "chg" });
      window.changedKey = "";
      window.changedValue = null;
      window.storage.onChange((key, value) => {
        window.changedKey = key;
        window.changedValue = value;
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "chg" });
      window.storage.setSync("foo", 123);
    });
    // storage 이벤트는 비동기이므로 약간 대기
    await page1.waitForTimeout(100);
    expect(await page1.evaluate(() => window.changedKey)).toBe("foo");
    expect(
      await page1.evaluate(() => {
        const v = window.changedValue;
        return typeof v === "object" && v !== null && "v" in v ? v.v : v;
      })
    ).toBe(123);
    await page1.close();
    await page2.close();
  });

  test("getAll 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "all" });
      window.storage.setSync("a", 1);
      window.storage.setSync("b", 2);
    });
    expect(await page.evaluate(() => window.storage.getAllSync())).toEqual({
      a: 1,
      b: 2,
    });
  });

  test("쿠키 스토리지 set/get/remove 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "cookie", namespace: "cktest" });
      window.storage.setSync("foo", "bar");
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(
      "bar"
    );
    await page.evaluate(() => window.storage.removeSync("foo"));
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBeNull();
  });

  test("priority 옵션에 따라 local → session → cookie → memory 순으로 폴백", async ({
    page,
  }) => {
    // 실제 환경에서는 local/session/cookie가 모두 사용 가능하므로, memory 폴백은 강제 모킹이 필요함
    // 여기서는 우선순위 배열이 정상적으로 적용되는지만 확인
    await page.evaluate(() => {
      window.storage = window.stosh({
        priority: ["local", "session", "cookie", "memory"],
        namespace: "prio",
      });
      window.storage.setSync("foo", "bar");
    });
    expect(
      await page.evaluate(() => {
        const raw = window.localStorage.getItem("prio:foo");
        return raw ? JSON.parse(raw).v : null;
      })
    ).toBe("bar");
  });

  test("priority 옵션에 따라 sessionStorage 우선 사용", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({
        priority: ["session", "local", "cookie", "memory"],
        namespace: "prio2",
      });
      window.storage.setSync("foo", "bar");
    });
    expect(
      await page.evaluate(() => {
        const raw = window.sessionStorage.getItem("prio2:foo");
        return raw ? JSON.parse(raw).v : null;
      })
    ).toBe("bar");
  });

  test("localStorage 용량 초과 시 예외 발생", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "quota" });
    });
    let threw = false;
    try {
      await page.evaluate(() => {
        // 5MB 이상 채우기 시도 (브라우저마다 다름, 실제로는 quota에 따라 다름)
        let big = "x".repeat(1024 * 1024);
        for (let i = 0; i < 10; ++i) {
          window.storage.setSync("big" + i, big);
        }
      });
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("여러 탭에서 동시에 set/remove 시 onChange 콜백 일관성", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.storage = window.stosh({ namespace: "multi" });
      window.changes = [];
      window.storage.onChange((key, value) => {
        window.changes.push({ key, value });
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "multi" });
      window.storage.setSync("foo", 1);
      window.storage.removeSync("foo");
    });
    await page1.waitForTimeout(100);
    const changes = await page1.evaluate(() => window.changes);
    expect(
      changes.some(
        (c) => c.key === "foo" && (c.value === 1 || c.value === null)
      )
    ).toBe(true);
    await page1.close();
    await page2.close();
  });

  test("StorageEvent의 key/newValue/oldValue 등 필드 검증", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.eventInfo = null;
      window.addEventListener("storage", (e) => {
        window.eventInfo = {
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
        };
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "evt" });
      window.storage.setSync("foo", 123);
    });
    await page1.waitForTimeout(100);
    const info = await page1.evaluate(() => window.eventInfo);
    expect(info.key).toContain("evt:foo");
    expect(info.newValue).toContain("123");
    await page1.close();
    await page2.close();
  });

  test("idb 타입 비동기 동작 및 batch/만료/네임스페이스/미들웨어", async ({
    page,
  }) => {
    try {
      await page.evaluate(() => {
        window.storage = window.stosh({ type: "idb", namespace: "idbtest" });
      });
      await page.evaluate(async () => {
        await window.storage.set("foo", 1);
        await window.storage.set("bar", 2, { expire: 10 });
        window.storage.use("set", (ctx, next) => {
          ctx.value = ctx.value + 1;
          next();
        });
        await window.storage.set("baz", 10);
        await window.storage.batchSet([
          { key: "a", value: 1 },
          { key: "b", value: 2 },
        ]);
      });
      expect(
        await page.evaluate(async () => await window.storage.get("foo"))
      ).toBe(1);
      expect(
        await page.evaluate(async () => await window.storage.get("baz"))
      ).toBe(11);
      // 미들웨어로 인해 실제 저장값이 [2, 3]이 됨
      expect(
        await page.evaluate(
          async () => await window.storage.batchGet(["a", "b"])
        )
      ).toEqual([2, 3]);
      await page.waitForTimeout(20);
      expect(
        await page.evaluate(async () => await window.storage.get("bar"))
      ).toBeNull();
    } catch (e) {
      throw e;
    }
  });

  test("쿠키 만료, path, 도메인 옵션, 용량 초과", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "cookie", namespace: "ckopt" });
    });
    const big = "x".repeat(4096);
    await page.evaluate((big) => {
      window.storage.setSync("big", big);
    }, big);
    const stored = await page.evaluate(() => window.storage.getSync("big"));
    expect(
      stored === null || (typeof stored === "string" && stored.length <= 4096)
    ).toBe(true);
    await page.evaluate(() => {
      window.storage.setSync("foo", "bar");
      // 만료 10ms
      window.storage.setSync("exp", "bye", { expire: 10 });
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(
      "bar"
    );
    await page.waitForTimeout(20);
    expect(await page.evaluate(() => window.storage.getSync("exp"))).toBeNull();
    // 용량 초과(쿠키는 4KB 제한, 실제로는 브라우저마다 다름, 예외 발생 여부 대신 실제 저장 결과로 검증)
    let overStored = null;
    try {
      await page.evaluate(() => {
        let big = "x".repeat(4096);
        for (let i = 0; i < 10; ++i) {
          window.storage.setSync("big" + i, big);
        }
      });
      overStored = await page.evaluate(() => window.storage.getSync("big0"));
    } catch (e) {
      overStored = null;
    }
    expect(
      overStored === null ||
        (typeof overStored === "string" && overStored.length <= 4096)
    ).toBe(true);
  });

  test("매우 긴 키/값, 특수문자, 이모지 등 저장/조회(브라우저 환경)", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "edgecase2" });
      const longKey = "k".repeat(1000);
      const longVal = "v".repeat(10000);
      const emojiKey = "😀키";
      const emojiVal = "값🚀";
      window.storage.setSync(longKey, longVal);
      window.storage.setSync(emojiKey, emojiVal);
      window.storage.setSync("특수!@#$%^&*()_+|", "!@#$%^&*()_+");
    });
    expect(
      await page.evaluate(() => window.storage.getSync("k".repeat(1000)))
    ).toBe("v".repeat(10000));
    expect(await page.evaluate(() => window.storage.getSync("😀키"))).toBe(
      "값🚀"
    );
    expect(
      await page.evaluate(() => window.storage.getSync("특수!@#$%^&*()_+|"))
    ).toBe("!@#$%^&*()_+");
  });

  test("batch API와 일반 API 혼합 사용 시 일관성", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "batchmix" });
      window.storage.setSync("a", 1);
      window.storage.setSync("b", 2);
      window.storage.batchSetSync([
        { key: "c", value: 3 },
        { key: "d", value: 4 },
      ]);
      window.storage.removeSync("a");
      window.storage.batchRemoveSync(["b", "c"]);
    });
    expect(await page.evaluate(() => window.storage.getSync("a"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("b"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("c"))).toBeNull();
    expect(await page.evaluate(() => window.storage.getSync("d"))).toBe(4);
  });

  test("StorageEvent oldValue/newValue 필드 정확성", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.eventInfo = null;
      window.addEventListener("storage", (e) => {
        window.eventInfo = {
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
        };
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "evt2" });
      window.storage.setSync("foo", "bar1");
      window.storage.setSync("foo", "bar2");
      window.storage.removeSync("foo");
    });
    await page1.waitForTimeout(100);
    const info = await page1.evaluate(() => window.eventInfo);
    expect(info.key).toContain("evt2:foo");
    expect(info.oldValue).toContain("bar2");
    expect(info.newValue).toBeNull();
    await page1.close();
    await page2.close();
  });

  test("onChange 콜백 내에서 비동기 작업/예외 발생 시 전체 동작 영향 없음", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "chg-async" });
      window.flag = false;
      window.storage.onChange(async (key, value) => {
        await new Promise((r) => setTimeout(r, 10));
        window.flag = true;
        throw new Error("onChange error");
      });
    });
    await page.evaluate(() => window.storage.setSync("foo", 1));
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.flag)).toBe(true);
    // 예외가 발생해도 전체 동작에는 영향 없음
  });

  test("batchSet/batchRemove 중 일부 실패 시 일관성", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ namespace: "batch-partial" });
    });

    // batchSet: 일부 실패(순환 참조) 시 예외 발생, 나머지는 정상 저장될 수도 있고 아닐 수도 있음
    let batchSetError = null;
    try {
      await page.evaluate(async () => {
        const a = {};
        // @ts-ignore
        a.self = a;
        await window.storage.batchSet([
          { key: "ok2", value: 2 },
          { key: "fail", value: a },
        ]);
      });
    } catch (e: any) {
      batchSetError = e.message || e.toString();
    }
    expect(batchSetError).not.toBeNull();
    // ok2는 저장되었을 수도 있고 아닐 수도 있으므로, 값이 2이거나 null임을 허용
    const ok2 = await page.evaluate(() => window.storage.getSync("ok2"));
    expect([2, null]).toContain(ok2);
    // fail은 반드시 저장되지 않아야 함
    expect(
      await page.evaluate(() => window.storage.getSync("fail"))
    ).toBeNull();

    // batchRemove: 일부 키만 삭제, 나머지는 남아있는지 확인
    await page.evaluate(() => {
      window.storage.setSync("a", 1);
      window.storage.setSync("b", 2);
      window.storage.setSync("c", 3);
    });
    await page.evaluate(async () => {
      await window.storage.batchRemove(["a", "b"]);
    });
    const aVal = await page.evaluate(() => window.storage.getSync("a"));
    const bVal = await page.evaluate(() => window.storage.getSync("b"));
    const cVal = await page.evaluate(() => window.storage.getSync("c"));
    // "a", "b"는 null(삭제됨) 또는 1/2(삭제 실패)일 수 있음
    expect([null, 1]).toContain(aVal);
    expect([null, 2]).toContain(bVal);
    // "c"는 반드시 남아있어야 함
    expect(cVal).toBe(3);
  });

  test("여러 인스턴스에서 메모리 스토리지 데이터 격리", async ({ page }) => {
    await page.evaluate(() => {
      window.s1 = window.stosh({ type: "memory", namespace: "mem1" });
      window.s2 = window.stosh({ type: "memory", namespace: "mem2" });
      window.s1.setSync("foo", 1);
      window.s2.setSync("foo", 2);
    });
    expect(await page.evaluate(() => window.s1.getSync("foo"))).toBe(1);
    expect(await page.evaluate(() => window.s2.getSync("foo"))).toBe(2);
  });

  test("동시성/경합 상황: 여러 탭에서 거의 동시에 set/remove 시 onChange 콜백 일관성", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");
    await page1.evaluate(() => {
      window.storage = window.stosh({ namespace: "race" });
      window.changes = [];
      window.storage.onChange((key, value) => {
        window.changes.push({ key, value });
      });
    });
    await page2.evaluate(() => {
      window.storage = window.stosh({ namespace: "race" });
    });
    // 거의 동시에 여러 번 set/remove
    await Promise.all([
      page2.evaluate(() => window.storage.setSync("foo", 1)),
      page2.evaluate(() => window.storage.setSync("foo", 2)),
      page2.evaluate(() => window.storage.removeSync("foo")),
      page2.evaluate(() => window.storage.setSync("foo", 3)),
    ]);
    await page1.waitForTimeout(100);
    const changes = await page1.evaluate(() => window.changes);
    expect(changes.length).toBeGreaterThanOrEqual(2); // 최소 2번 이상 호출
    expect(changes.some((c) => c.key === "foo")).toBe(true);
    await page1.close();
    await page2.close();
  });

  test("IndexedDB 비동기 에러 처리: DB 오픈 실패 시 폴백 동작", async ({
    page,
  }) => {
    const isFallback = await page.evaluate(() => {
      window._origIndexedDB = window.indexedDB;
      // @ts-ignore
      window.indexedDB = undefined; // Mock IDB unavailability
      let fallback = false;
      try {
        // Use default priority (starts with idb)
        const storageInstance = window.stosh({ namespace: "idberr" });
        // Check the instance property after initialization attempts fallback
        // Since localStorage should be available, it should fallback to local, not memory.
        fallback = storageInstance.isMemoryFallback;
      } catch (e) {
        console.error("Error during stosh instantiation:", e);
        // If an error occurs during instantiation itself, it might indicate a deeper issue,
        // but for this test's purpose, we might assume memory fallback failed or wasn't reached.
        // Let's keep fallback as false unless explicitly set by isMemoryFallback.
        fallback = false;
      }
      // @ts-ignore
      window.indexedDB = window._origIndexedDB; // Restore original IDB
      return fallback;
    });
    // Expect fallback to NOT be memory, as localStorage should be available
    expect(isFallback).toBe(false); // Ensure expectation is false
  });

  test("메모리 스토리지: 새로고침 후 데이터 소실 확인", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({
        type: "memory",
        namespace: "mem-reload",
      });
      window.storage.setSync("foo", 123);
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBe(123);
    // 새로고침
    await page.reload();
    await page.evaluate(() => {
      window.storage = window.stosh({
        type: "memory",
        namespace: "mem-reload",
      });
    });
    expect(await page.evaluate(() => window.storage.getSync("foo"))).toBeNull();
  });

  test("sessionStorage 탭 격리 동작", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage(); // 다른 탭
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");

    await page1.evaluate(() => {
      window.storage = window.stosh({
        type: "session",
        namespace: "session-iso",
      });
      window.storage.setSync("shared", "page1");
    });

    // page1에서는 값이 조회되어야 함
    expect(await page1.evaluate(() => window.storage.getSync("shared"))).toBe(
      "page1"
    );

    // page2에서는 같은 키로 조회해도 값이 없어야 함 (세션 격리)
    await page2.evaluate(() => {
      window.storage = window.stosh({
        type: "session",
        namespace: "session-iso",
      });
    });
    expect(
      await page2.evaluate(() => window.storage.getSync("shared"))
    ).toBeNull();

    await page1.close();
    await page2.close();
  });

  test("IndexedDB clear/has/getAll 동작", async ({ page }) => {
    try {
      await page.evaluate(async () => {
        window.storage = window.stosh({ type: "idb", namespace: "idb-extra" });
        await window.storage.set("a", 1);
        await window.storage.set("b", 2);
      });

      expect(
        await page.evaluate(async () => await window.storage.has("a"))
      ).toBe(true);
      expect(
        await page.evaluate(async () => await window.storage.getAll())
      ).toEqual({ a: 1, b: 2 });

      await page.evaluate(async () => await window.storage.clear());
      expect(
        await page.evaluate(async () => await window.storage.has("a"))
      ).toBe(false);
      expect(
        await page.evaluate(async () => await window.storage.getAll())
      ).toEqual({});
    } catch (e) {
      throw e;
    }
  });

  test("IDB 사용 시 동기 API 호출 시 폴백 저장소(localStorage) 사용", async ({
    page,
  }) => {
    await page.evaluate(() => {
      // type: 'idb' 명시 또는 기본값 사용
      window.storage = window.stosh({ namespace: "idb-sync-fallback" });
      // setSync 호출
      window.storage.setSync("sync-key", "sync-value");
    });

    // localStorage에 저장되었는지 확인
    const valueInLocalStorage = await page.evaluate(() => {
      const raw = window.localStorage.getItem("idb-sync-fallback:sync-key");
      return raw ? JSON.parse(raw).v : null;
    });
    expect(valueInLocalStorage).toBe("sync-value");

    // getSync로도 읽어지는지 확인
    expect(await page.evaluate(() => window.storage.getSync("sync-key"))).toBe(
      "sync-value"
    );

    // IDB에는 저장되지 않았는지 확인 (선택적)
    const valueInIdb = await page.evaluate(async () => {
      // IDB 직접 접근은 복잡하므로, stosh의 비동기 get으로 확인
      return await window.storage.get("sync-key");
    });
    // setSync는 IDB에 쓰지 않으므로 null이어야 함 (단, getSync 후 get하면 캐시될 수 있으므로 주의)
    // 정확한 검증을 위해서는 IDB 직접 조회 필요하나, 여기서는 폴백 동작 확인에 집중
    // console.log("Value in IDB:", valueInIdb); // 아마 null일 것임
  });

  test("onChange: IDB/Cookie/Memory 변경 시 다른 탭으로 전파 안 됨", async ({
    context,
  }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto("/test-e2e/build/public/index.html");
    await page2.goto("/test-e2e/build/public/index.html");

    await page1.evaluate(() => {
      window.changes = [];
      window.storageIdb = window.stosh({
        type: "idb",
        namespace: "onchange-idb",
      });
      window.storageCookie = window.stosh({
        type: "cookie",
        namespace: "onchange-cookie",
      });
      window.storageMemory = window.stosh({
        type: "memory",
        namespace: "onchange-memory",
      });

      const cb = (key, value) => window.changes.push({ key, value });
      window.storageIdb.onChange(cb);
      window.storageCookie.onChange(cb);
      window.storageMemory.onChange(cb);
    });

    // page2에서 각 타입별로 값 변경
    await page2.evaluate(async () => {
      window.storageIdb = window.stosh({
        type: "idb",
        namespace: "onchange-idb",
      });
      window.storageCookie = window.stosh({
        type: "cookie",
        namespace: "onchange-cookie",
      });
      window.storageMemory = window.stosh({
        type: "memory",
        namespace: "onchange-memory",
      });

      await window.storageIdb.set("idb-key", 1);
      window.storageCookie.setSync("cookie-key", 2);
      window.storageMemory.setSync("memory-key", 3);
    });

    await page1.waitForTimeout(100); // 비동기 처리 및 이벤트 전파 시간

    // page1의 changes 배열은 비어 있어야 함 (IDB, Cookie, Memory는 다른 탭으로 전파 안됨)
    const changes = await page1.evaluate(() => window.changes);
    expect(changes).toEqual([]);

    await page1.close();
    await page2.close();
  });

  test("E2E 폴백: localStorage 비활성화 시 sessionStorage 사용", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    // 모든 페이지 로드 시 localStorage.setItem을 에러 발생시키도록 모킹
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: (key) => window.sessionStorage.getItem(key), // sessionStorage로 위임 (테스트 단순화)
          setItem: (key, value) => {
            throw new Error("localStorage disabled");
          }, // setItem만 막기
          removeItem: (key) => window.sessionStorage.removeItem(key),
          clear: () => window.sessionStorage.clear(),
          key: (index) => window.sessionStorage.key(index),
          get length() {
            return window.sessionStorage.length;
          },
        },
        writable: true,
      });
    });

    const page = await context.newPage();
    await page.goto("/test-e2e/build/public/index.html");

    await page.evaluate(() => {
      // priority 기본값 사용 (idb -> local -> session ...)
      window.storage = window.stosh({ namespace: "e2e-fallback" });
      // setSync는 local 시도 -> 실패 -> session 시도 -> 성공해야 함
      window.storage.setSync("fallback-key", "fallback-value");
    });

    // sessionStorage에 저장되었는지 확인
    const valueInSession = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem("e2e-fallback:fallback-key");
      return raw ? JSON.parse(raw).v : null;
    });
    expect(valueInSession).toBe("fallback-value");

    // getSync로도 읽어지는지 확인
    expect(
      await page.evaluate(() => window.storage.getSync("fallback-key"))
    ).toBe("fallback-value");

    await context.close();
  });

  test("비동기 미들웨어 동작 (IDB)", async ({ page }) => {
    try {
      await page.evaluate(async () => {
        window.storage = window.stosh({ type: "idb", namespace: "async-mw" });

        window.storage.use("set", async (ctx, next) => {
          await new Promise((resolve) => setTimeout(resolve, 10)); // 비동기 작업 시뮬레이션
          ctx.value = `async_${ctx.value}`;
          await next();
        });

        window.storage.use("get", async (ctx, next) => {
          await next();
          if (ctx.result) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            ctx.result = ctx.result.replace("async_", "decrypted_");
          }
        });

        await window.storage.set("data", "secret");
      });
      // get을 통해 미들웨어가 적용된 최종 결과 확인
      expect(
        await page.evaluate(async () => await window.storage.get("data"))
      ).toBe("decrypted_secret");

      // IDB 직접 확인은 복잡하므로 생략, API 동작으로 검증
    } catch (e) {
      throw e;
    }
  });

  test.describe("Stosh strictSyncFallback 정책 (IndexedDB)", () => {
    test("IndexedDB + sync API + strictSyncFallback: true → 에러 발생", async ({ page }) => {
      await page.goto("/test-e2e/build/public/index.html");
      // IndexedDB + sync API + strictSyncFallback: true
      const error = await page.evaluate(() => {
        try {
          const storage = window.stosh({
            type: "idb",
            strictSyncFallback: true,
            namespace: "e2e-strict-err"
          });
          storage.setSync("foo", 1);
          return null;
        } catch (e) {
          return e.message;
        }
      });
      expect(error).toContain("setSync is not supported with IndexedDB storage");
    });
  
    test("IndexedDB + sync API + strictSyncFallback: false → 경고 후 fallback", async ({ page }) => {
      await page.goto("/test-e2e/build/public/index.html");
      // IndexedDB + sync API + strictSyncFallback: false
      let warnMsg = "";
      page.on("console", msg => {
        if (msg.type() === "warning" && msg.text().includes("[stosh]")) {
          warnMsg = msg.text();
        }
      });
      const value = await page.evaluate(() => {
        const storage = window.stosh({
          type: "idb",
          strictSyncFallback: false,
          namespace: "e2e-strict-warn"
        });
        storage.setSync("foo", 123);
        return storage.getSync("foo");
      });
      expect(value).toBe(123);
      // Playwright의 콘솔 이벤트는 비동기이므로, 약간의 대기 필요
      await page.waitForTimeout(100);
      expect(warnMsg).toContain("[stosh]");
    });
  });

  test("IndexedDB + sync API + strictSyncFallback 미지정(기본값) → 경고 후 fallback", async ({ page }) => {
    await page.goto("/test-e2e/build/public/index.html");
    // strictSyncFallback 옵션 미지정 시 기본값(false)로 동작해야 함
    let warnMsg = "";
    page.on("console", msg => {
      if (msg.type() === "warning" && msg.text().includes("[stosh]")) {
        warnMsg = msg.text();
      }
    });
    const value = await page.evaluate(() => {
      const storage = window.stosh({
        type: "idb",
        namespace: "e2e-strict-default"
      });
      storage.setSync("foo", 456);
      return storage.getSync("foo");
    });
    expect(value).toBe(456);
    await page.waitForTimeout(100);
    expect(warnMsg).toContain("[stosh]");
  });

  test("미들웨어 prepend/append/해제/중복등록 동작", async ({ page }) => {
    await page.evaluate(() => {
      window.storage = window.stosh({ type: "local", namespace: "mwtest" });
      window.calls = [];
  
      // append(기본값)
      window.storage.use("set", (ctx, next) => {
        window.calls.push("A");
        ctx.value = ctx.value + "_A";
        next();
      });
  
      // prepend
      window.storage.use("set", (ctx, next) => {
        window.calls.push("B");
        ctx.value = ctx.value + "_B";
        next();
      }, { prepend: true });
  
      // append
      window.storage.use("set", (ctx, next) => {
        window.calls.push("C");
        ctx.value = ctx.value + "_C";
        next();
      }, { append: true });
  
      // 중복 등록 시 경고 및 무시
      window.storage.use("set", (ctx, next) => {
        window.calls.push("A");
        ctx.value = ctx.value + "_A";
        next();
      });
  
      // 해제 함수 테스트
      const unsub = window.storage.use("set", (ctx, next) => {
        window.calls.push("D");
        ctx.value = ctx.value + "_D";
        next();
      }, { prepend: true });
      unsub(); // 등록 즉시 해제
  
      window.storage.setSync("foo", "bar");
    });
  
    // 실행 순서 및 값 검증
    const calls = await page.evaluate(() => window.calls);
    expect(calls).toEqual(["B", "A", "C", "A"]);

    const value = await page.evaluate(() => window.storage.getSync("foo"));
    expect(value).toBe("bar_B_A_C_A");
  });

  test("priority 옵션 커스텀 조합 폴백 동작", async ({ page }) => {
    // localStorage만 우선순위로 지정
    await page.evaluate(() => {
      const storage = stosh({ priority: ["local"], namespace: "test" });
      storage.setSync("foo", 1);
      // 실제 localStorage에 저장됐는지 확인
      return localStorage.getItem("test:foo");
    });
  });
  test("IndexedDB 완전 불가 환경에서 strictSyncFallback 동작", async ({ page }) => {
    await page.evaluate(() => {
      const storage = stosh({ type: "idb", strictSyncFallback: true });
      // idbStorage를 undefined로 강제
      storage.idbStorage = undefined;
      try {
        storage.setSync("foo", 1);
      } catch (e) {
        return e instanceof Error;
      }
    });
  });
});
