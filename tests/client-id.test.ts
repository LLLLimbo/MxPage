import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { createClientId } from "../lib/utils/client-id";

test("secure contexts use the native UUID generator", t => {
  const id = "4f2dbf8a-f63c-4bae-9a48-3d09f5485bb8";
  const native = t.mock.method(globalThis.crypto, "randomUUID", () => id);
  assert.equal(createClientId(), id);
  assert.equal(native.mock.callCount(), 1);
});

test("HTTP contexts without randomUUID generate distinct valid UUID v4 identifiers", t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } });
  t.after(() => Object.defineProperty(globalThis, "crypto", original));
  const ids = Array.from({ length: 1000 }, () => createClientId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});
