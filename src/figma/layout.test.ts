import { test } from "node:test";
import assert from "node:assert/strict";
import type { FigmaNode } from "./types.js";
import { normalizeAutoLayout } from "./layout.js";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

function find(n: FigmaNode, id: string): FigmaNode | undefined {
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const r = find(c, id);
    if (r) return r;
  }
}

// Reproduce el caso real: pila vertical "hug" cuyo segundo hijo llega de la API 97 px
// más abajo de lo que corresponde, con un hijo oculto que no debe ocupar sitio.
const stale: FigmaNode = {
  id: "1:1",
  name: "slot",
  type: "FRAME",
  layoutMode: "VERTICAL",
  layoutSizingVertical: "HUG",
  layoutSizingHorizontal: "FIXED",
  paddingTop: 24,
  paddingLeft: 16,
  paddingRight: 16,
  itemSpacing: 32,
  absoluteBoundingBox: box(0, 0, 390, 600),
  children: [
    { id: "2:1", name: "bloque", type: "FRAME", layoutAlign: "STRETCH", absoluteBoundingBox: box(16, 24, 358, 324) },
    { id: "2:2", name: "oculto", type: "FRAME", visible: false, absoluteBoundingBox: box(16, 380, 358, 60) },
    {
      id: "2:3",
      name: "checks",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      layoutAlign: "STRETCH",
      layoutSizingVertical: "HUG",
      itemSpacing: 8,
      absoluteBoundingBox: box(16, 477, 200, 24),
      children: [
        { id: "3:1", name: "icono", type: "FRAME", absoluteBoundingBox: box(16, 477, 24, 24) },
        { id: "3:2", name: "texto", type: "TEXT", layoutGrow: 1, absoluteBoundingBox: box(48, 477, 100, 48) },
      ],
    },
  ],
};

test("recoloca hijos de auto-layout, ignora capas ocultas y traslada el subárbol", () => {
  const out = normalizeAutoLayout(stale);
  const checks = find(out, "2:3")!.absoluteBoundingBox!;
  assert.equal(checks.y, 24 + 324 + 32);
  assert.equal(checks.width, 358, "stretch ocupa el ancho interior");
  assert.equal(checks.height, 48, "hug toma el alto del hijo más alto");
  assert.equal(find(out, "3:1")!.absoluteBoundingBox!.y, 380);
  const texto = find(out, "3:2")!.absoluteBoundingBox!;
  assert.equal(texto.x, 16 + 24 + 8);
  assert.equal(texto.width, 358 - 24 - 8, "grow reparte el espacio sobrante");
  assert.equal(find(out, "1:1")!.absoluteBoundingBox!.height, 24 + 324 + 32 + 48);
});

test("no modifica el árbol original ni los contenedores sin auto-layout", () => {
  const out = normalizeAutoLayout(stale);
  assert.equal(find(stale, "2:3")!.absoluteBoundingBox!.y, 477);
  const plain: FigmaNode = { id: "1:1", name: "libre", type: "FRAME", absoluteBoundingBox: box(0, 0, 100, 100), children: [{ id: "2:1", name: "a", type: "RECTANGLE", absoluteBoundingBox: box(70, 5, 10, 10) }] };
  assert.deepEqual(normalizeAutoLayout(plain), plain);
  assert.notEqual(out, stale);
});

test("respeta alineación centrada en el eje principal y SPACE_BETWEEN se deja como viene", () => {
  const centered: FigmaNode = {
    id: "1:1", name: "boton", type: "FRAME", layoutMode: "HORIZONTAL", primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
    absoluteBoundingBox: box(0, 0, 358, 56),
    children: [{ id: "2:1", name: "label", type: "TEXT", absoluteBoundingBox: box(30, 16, 85, 24) }],
  };
  const lbl = find(normalizeAutoLayout(centered), "2:1")!.absoluteBoundingBox!;
  assert.equal(lbl.x, (358 - 85) / 2);
  assert.equal(lbl.y, 16);
  const between = { ...centered, primaryAxisAlignItems: "SPACE_BETWEEN" as const };
  assert.equal(find(normalizeAutoLayout(between), "2:1")!.absoluteBoundingBox!.x, 30);
});
