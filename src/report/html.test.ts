import { test } from "node:test";
import assert from "node:assert/strict";
import type { FigmaNode, FigmaPaint } from "../figma/types.js";
import { auditTree } from "../rules/engine.js";
import { buildDisplayIssues, cropRegion, renderHtmlReport } from "./html.js";
import { pngSize, slug } from "./build.js";
import { reportReviewSchema } from "./schema.js";

const solid = (hex: string): FigmaPaint => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return { type: "SOLID", color: { r: n(1), g: n(3), b: n(5), a: 1 } };
};
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

// Frame desplazado en el lienzo (100, 200) para comprobar que las cajas se relativizan.
const root: FigmaNode = {
  id: "1:1",
  name: "Pantalla <Login>",
  type: "FRAME",
  fills: [solid("#FFFFFF")],
  absoluteBoundingBox: box(100, 200, 400, 800),
  children: [
    { id: "2:1", name: "Subtítulo", type: "TEXT", characters: "Hola", fills: [solid("#AAAAAA")], style: { fontSize: 14, fontWeight: 400 }, absoluteBoundingBox: box(120, 220, 200, 20) },
    { id: "2:2", name: "Icon button", type: "FRAME", fills: [solid("#222222")], absoluteBoundingBox: box(440, 900, 16, 16) },
    { id: "2:3", name: "Fuera", type: "RECTANGLE", fills: [solid("#000000")], absoluteBoundingBox: box(100, 1100, 50, 50) },
  ],
};
const audit = auditTree(root, "Archivo", { level: "AA", fileKey: "KEY" });

const review = reportReviewSchema.parse({
  url: "https://www.figma.com/design/KEY/x?node-id=1-1",
  verdict: "no-cumple",
  verdictText: "Hay un contraste insuficiente.",
  issues: [
    { title: "Subtítulo <gris>", severity: "error", source: "medido", wcag: "1.4.3", nodeIds: ["2:1"], problem: "Poco contraste.", fix: "Oscurecer." },
    { title: "Capa fuera de vista", severity: "info", status: "descartado", source: "semantico", wcag: "1.3.1", nodeIds: ["2:3", "9:9"], problem: "x", fix: "y" },
  ],
});

test("las incidencias revisadas se ordenan primero y los hallazgos no citados se añaden como sin revisar", () => {
  const issues = buildDisplayIssues(review, audit, root);
  assert.equal(issues[0].title, "Subtítulo <gris>");
  assert.equal(issues[0].number, 1);
  assert.ok(issues[0].findings.some((f) => f.rule === "text-contrast"));
  const unreviewed = issues.filter((i) => i.status === "sin-revisar");
  assert.ok(unreviewed.length > 0, "el target-size del icon button no citado debe aparecer");
  assert.ok(unreviewed.every((i) => !i.nodeIds.includes("2:1")));
  assert.equal(issues.at(-1)?.status, "descartado");
});

test("capas fuera del frame o inexistentes se señalan en lugar de dibujarse", () => {
  const issue = buildDisplayIssues(review, audit, root).find((i) => i.title === "Capa fuera de vista")!;
  assert.deepEqual(issue.rects, []);
  assert.deepEqual(issue.offscreenNodeIds, ["2:3"]);
  assert.deepEqual(issue.missingNodeIds, ["9:9"]);
});

test("la zona ampliada contiene la capa, respeta el tamaño mínimo y no sale del frame", () => {
  const frame = box(100, 200, 400, 800);
  const crop = cropRegion([box(440, 900, 16, 16)], frame)!;
  assert.ok(crop.width >= 240 && crop.height >= 140);
  assert.ok(crop.x >= frame.x && crop.x + crop.width <= frame.x + frame.width + 1e-9);
  assert.ok(crop.y >= frame.y && crop.y + crop.height <= frame.y + frame.height + 1e-9);
  assert.ok(crop.x <= 440 && crop.x + crop.width >= 456);
  assert.equal(cropRegion([], frame), null);
});

test("el HTML escapa los textos de Figma y de la revisión e incrusta la captura una sola vez", () => {
  const html = renderHtmlReport({ review, audit, root, image: { dataUri: "data:image/png;base64,AAAA", width: 800, height: 1600 }, generatedAt: new Date("2026-09-30T10:00:00Z") });
  assert.ok(html.includes("Pantalla &lt;Login&gt;"));
  assert.ok(html.includes("Subtítulo &lt;gris&gt;"));
  assert.ok(!html.includes("<Login>"));
  assert.equal(html.split("data:image/png;base64,AAAA").length - 1, 1);
  assert.ok(html.includes('id="inc-1"'));
  // Caja del subtítulo relativa al frame: (120-100)/400 = 5 %.
  assert.ok(html.includes("left:5%;top:2.5%;width:50%;height:2.5%"));
});

test("sin captura el informe se genera igualmente", () => {
  const html = renderHtmlReport({ review, audit, root, image: null, generatedAt: new Date() });
  assert.ok(html.includes("Figma no devolvió la captura"));
  assert.ok(html.includes("--shot: none"));
});

test("utilidades de archivo: tamaño PNG y slug", () => {
  const png = Buffer.alloc(24);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(780, 16);
  png.writeUInt32BE(1688, 20);
  assert.deepEqual(pngSize(png), { width: 780, height: 1688 });
  assert.throws(() => pngSize(Buffer.alloc(10)));
  assert.equal(slug("Elección registro MADRE"), "eleccion-registro-madre");
  assert.equal(slug("🤯"), "frame");
});

test("una incidencia con rules solo cubre y muestra los hallazgos de esas reglas", () => {
  const scoped = reportReviewSchema.parse({
    ...review,
    issues: [{ title: "Área táctil descartada", severity: "error", status: "descartado", source: "medido", wcag: "2.5.8", nodeIds: ["2:2"], rules: ["target-size"], problem: "p", fix: "f" }],
  });
  const issues = buildDisplayIssues(scoped, audit, root);
  const discarded = issues.find((i) => i.title === "Área táctil descartada")!;
  assert.ok(discarded.findings.length > 0);
  assert.ok(discarded.findings.every((f) => f.rule === "target-size"));
  const otherRulesOnSameNode = audit.findings.filter((f) => f.nodeId === "2:2" && f.rule !== "target-size");
  for (const f of otherRulesOnSameNode) assert.ok(issues.some((i) => i.status === "sin-revisar" && i.findings.includes(f)));
});
