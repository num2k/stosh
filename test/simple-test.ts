import { stosh } from "../src/index";

describe("Simple stosh test", () => {
  it("should store and retrieve a value", async () => {
    const storage = stosh({ namespace: "test-simple" });
    
    // Store a value
    await storage.set("testKey", "testValue");
    
    // Retrieve the value
    const value = await storage.get("testKey");
    
    // Verify the value
    expect(value).toBe("testValue");
    
    // Clean up
    await storage.remove("testKey");
  });
  
  it("should work with synchronous API", () => {
    const storage = stosh({ type: "local", namespace: "test-simple-sync" });
    
    // Store a value
    storage.setSync("testKeySync", "testValueSync");
    
    // Retrieve the value
    const value = storage.getSync("testKeySync");
    
    // Verify the value
    expect(value).toBe("testValueSync");
    
    // Clean up
    storage.removeSync("testKeySync");
  });
});