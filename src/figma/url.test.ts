import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFigmaUrl } from "./url.js";

test("enlace design con node-id con guion", () => {
  const p = parseFigmaUrl("https://www.figma.com/design/AbC123xyz/Mi-App?node-id=12-34&t=abc");
  assert.deepEqual(p, { fileKey: "AbC123xyz", nodeId: "12:34", kind: "design" });
});

test("enlace file antiguo con node-id codificado", () => {
  const p = parseFigmaUrl("https://www.figma.com/file/AbC123xyz/Mi-App?node-id=12%3A34");
  assert.equal(p.nodeId, "12:34");
  assert.equal(p.kind, "file");
});

test("enlace sin node-id", () => {
  const p = parseFigmaUrl("https://www.figma.com/design/AbC123xyz/Mi-App");
  assert.equal(p.nodeId, undefined);
});

test("enlace no válido lanza error", () => {
  assert.throws(() => parseFigmaUrl("https://example.com/x"));
});
