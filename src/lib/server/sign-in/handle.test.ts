// handle.ts: what a visitor types becomes a handle as backend takes it, or nothing.
import { expect, test } from "vitest";
import { typedHandle } from "./handle.ts";

test("a_typed_handle_is_trimmed_lowercased_and_checked", () => {
  expect(typedHandle("  @Alice.Example.COM ")).toBe("alice.example.com");
  expect(typedHandle("alice.bsky.social")).toBe("alice.bsky.social");
  for (const bad of ["", "alice", "alice..example.com", "-alice.example.com", "alice.example.1com", "a b.com"]) {
    expect(typedHandle(bad), bad).toBeNull();
  }
  expect(typedHandle(`${"a".repeat(63)}.`.repeat(4) + "com")).toBeNull();
});
