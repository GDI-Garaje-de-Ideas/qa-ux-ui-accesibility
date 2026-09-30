import { test } from "node:test";
import assert from "node:assert/strict";
import type { FigmaNode, FigmaPaint } from "../figma/types.js";
import { auditTree } from "./engine.js";

const solid = (hex: string, opacity = 1): FigmaPaint => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return { type: "SOLID", color: { r: n(1), g: n(3), b: n(5), a: 1 }, opacity };
};
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

function text(id: string, name: string, chars: string, hex: string, fontSize: number, fontWeight: number, rect = box(20, 20, 200, 20)): FigmaNode {
  return { id, name, type: "TEXT", characters: chars, fills: [solid(hex)], style: { fontSize, fontWeight, fontFamily: "Inter" }, absoluteBoundingBox: rect };
}

function run(children: FigmaNode[], level: "AA" | "AAA" = "AA") {
  const root: FigmaNode = { id: "1:1", name: "Pantalla", type: "FRAME", fills: [solid("#FFFFFF")], absoluteBoundingBox: box(0, 0, 400, 800), children };
  return auditTree(root, "Test", { level, fileKey: "KEY" });
}

test("texto gris claro sobre blanco falla 1.4.3 y texto oscuro pasa", () => {
  const r = run([
    text("2:1", "Subtítulo", "Hola", "#999999", 14, 400),
    text("2:2", "Cuerpo", "Texto legible", "#222222", 16, 400),
  ]);
  const errs = r.findings.filter((f) => f.rule === "text-contrast" && f.severity === "error");
  assert.equal(errs.length, 1);
  assert.equal(errs[0].nodeId, "2:1");
  assert.equal(errs[0].details?.required, 4.5);
  assert.equal(r.textLayers.find((t) => t.nodeId === "2:2")?.passes, true);
});

test("el fondo se toma del contenedor más cercano que cubre el texto (botón oscuro)", () => {
  const button: FigmaNode = {
    id: "3:1", name: "Card", type: "FRAME", fills: [solid("#1F2937")], absoluteBoundingBox: box(10, 10, 300, 60),
    children: [text("3:2", "Label", "Continuar", "#FFFFFF", 16, 600, box(20, 25, 100, 20))],
  };
  const r = run([button]);
  const layer = r.textLayers[0];
  assert.equal(layer.background, "#1F2937");
  assert.equal(layer.passes, true);
  assert.equal(r.findings.filter((f) => f.rule === "text-contrast").length, 0);
});

test("texto grande usa el umbral de 3:1", () => {
  const r = run([text("4:1", "Titular", "Gran titular", "#8A8A8A", 28, 400)]);
  // #8A8A8A sobre blanco ≈ 3.5:1 → pasa como texto grande, fallaría como normal.
  assert.equal(r.findings.filter((f) => f.rule === "text-contrast" && f.severity === "error").length, 0);
  const rAAA = run([text("4:1", "Titular", "Gran titular", "#8A8A8A", 28, 400)], "AAA");
  assert.equal(rAAA.findings.filter((f) => f.rule === "text-contrast" && f.severity === "error").length, 1);
});

test("texto semitransparente se compone sobre el fondo antes de medir", () => {
  const r = run([{ ...text("5:1", "Hint", "Pista", "#000000", 14, 400), fills: [solid("#000000", 0.4)] }]);
  const layer = r.textLayers[0];
  assert.equal(layer.foreground, "#999999");
  assert.equal(layer.passes, false);
});

test("un botón de 20x20 falla 2.5.8 y uno de 40x40 solo recibe nota AAA", () => {
  const small: FigmaNode = { id: "6:1", name: "Icon Button / Close", type: "INSTANCE", fills: [solid("#E5E7EB")], absoluteBoundingBox: box(300, 10, 20, 20) };
  const ok: FigmaNode = { id: "6:2", name: "Button / Primary", type: "INSTANCE", fills: [solid("#2563EB")], absoluteBoundingBox: box(20, 700, 40, 40) };
  const r = run([small, ok]);
  const target = r.findings.filter((f) => f.rule === "target-size");
  assert.equal(target.find((f) => f.nodeId === "6:1")?.severity, "error");
  assert.equal(target.find((f) => f.nodeId === "6:2")?.severity, "info");
  assert.equal(r.interactiveElements.length, 2);
});

test("componente con relleno casi igual al fondo incumple 1.4.11", () => {
  const ghost: FigmaNode = { id: "7:1", name: "Input / Email", type: "FRAME", fills: [solid("#F5F5F5")], absoluteBoundingBox: box(20, 100, 300, 44) };
  const bordered: FigmaNode = { id: "7:2", name: "Input / Password", type: "FRAME", fills: [solid("#F5F5F5")], strokes: [solid("#4B5563")], strokeWeight: 1, absoluteBoundingBox: box(20, 160, 300, 44) };
  const r = run([ghost, bordered]);
  const nt = r.findings.filter((f) => f.rule === "non-text-contrast");
  assert.equal(nt.length, 1);
  assert.equal(nt[0].nodeId, "7:1");
});

test("texto sobre imagen se marca como comprobación manual, no como error", () => {
  const hero: FigmaNode = {
    id: "8:1", name: "Hero", type: "FRAME", fills: [{ type: "IMAGE", imageRef: "abc" }], absoluteBoundingBox: box(0, 0, 400, 300),
    children: [text("8:2", "Claim", "Bienvenido", "#FFFFFF", 32, 700, box(20, 20, 200, 40))],
  };
  const r = run([hero]);
  assert.equal(r.findings.some((f) => f.rule === "background-uncertain" && f.nodeId === "8:2"), true);
  assert.equal(r.findings.some((f) => f.rule === "text-contrast" && f.severity === "error"), false);
  assert.equal(r.findings.some((f) => f.rule === "image-alt" && f.nodeId === "8:1"), true);
});

test("capas ocultas y texto pequeño", () => {
  const r = run([
    { ...text("9:1", "Oculto", "No visible", "#EEEEEE", 10, 400), visible: false },
    text("9:2", "Legal", "Letra pequeña", "#111111", 10, 400),
  ]);
  assert.equal(r.textLayers.length, 1);
  assert.equal(r.findings.filter((f) => f.rule === "text-size").length, 1);
});

test("elementos interactivos anidados solo se evalúan una vez", () => {
  const nested: FigmaNode = {
    id: "10:1", name: "Button / Primary", type: "INSTANCE", fills: [solid("#2563EB")], absoluteBoundingBox: box(20, 20, 120, 48),
    children: [{ id: "10:2", name: "Button Base", type: "FRAME", fills: [solid("#2563EB")], absoluteBoundingBox: box(20, 20, 120, 48) }],
  };
  const r = run([nested]);
  assert.equal(r.interactiveElements.length, 1);
});
