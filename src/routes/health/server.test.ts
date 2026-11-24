import { describe, expect, test } from "vitest";
import { GET } from "./+server.ts";

describe("GET /health", () => {
  test("answers 200 and is never cached", async () => {
    const response = await GET({} as Parameters<typeof GET>[0]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
