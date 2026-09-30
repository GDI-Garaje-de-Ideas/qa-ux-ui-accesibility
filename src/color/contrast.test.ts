import { test } from "node:test";
import assert from "node:assert/strict";
import { compositeOver, contrastRatio, isLargeText, parseHex, requiredTextContrast, round2, toHex } from "./contrast.js";

test("blanco sobre negro da 21:1", () => {
  assert.equal(round2(contrastRatio(parseHex("#FFFFFF"), parseHex("#000000"))), 21);
});

test("gris #767676 sobre blanco da ~4.54:1 (umbral clásico AA)", () => {
  assert.equal(round2(contrastRatio(parseHex("#767676"), parseHex("#FFFFFF"))), 4.54);
});

test("#777777 sobre blanco no llega a 4.5:1", () => {
  assert.ok(contrastRatio(parseHex("#777777"), parseHex("#FFFFFF")) < 4.5);
});

test("composición alfa: negro al 50% sobre blanco es gris medio", () => {
  assert.equal(toHex(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, parseHex("#FFFFFF"))), "#808080");
});

test("parseHex acepta formatos cortos y con alfa", () => {
  assert.deepEqual(parseHex("#fff"), { r: 1, g: 1, b: 1, a: 1 });
  assert.equal(parseHex("#00000080").a, 128 / 255);
  assert.throws(() => parseHex("rojo"));
});

test("texto grande según WCAG", () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(18.66, 700), true);
  assert.equal(isLargeText(18.66, 400), false);
  assert.equal(isLargeText(16, 700), false);
});

test("umbrales por nivel", () => {
  assert.equal(requiredTextContrast("AA", false), 4.5);
  assert.equal(requiredTextContrast("AA", true), 3);
  assert.equal(requiredTextContrast("AAA", false), 7);
  assert.equal(requiredTextContrast("AAA", true), 4.5);
});
