import type { FigmaNode, FigmaRect } from "./types.js";

/**
 * Recalcula las cajas de los nodos con auto-layout a partir de sus propiedades.
 *
 * La REST API de Figma puede devolver `absoluteBoundingBox` desactualizados dentro de
 * instancias cuyo auto-layout se ha reajustado por overrides (capas ocultas, textos
 * cambiados): los datos llegan incoherentes, por ejemplo un hijo colocado 97 px más
 * abajo de lo que suman sus hermanos y el espaciado. El render de Figma sí es correcto,
 * así que sin esta normalización las marcas del informe no caen sobre su capa y el
 * motor puede ver coberturas de fondo parciales que no existen.
 *
 * Pasos:
 *   1. De abajo arriba: los contenedores "hug" toman el tamaño de sus hijos visibles
 *      (las capas ocultas y las de posición absoluta no ocupan sitio).
 *   2. De arriba abajo: dentro de cada contenedor con auto-layout se aplican stretch/fill
 *      en el eje secundario, grow/fill en el principal, y se recoloca a cada hijo según
 *      padding, espaciado y alineación. Al mover un hijo se traslada todo su subárbol.
 *
 * Límites: no se tocan contenedores con wrap, grid o SPACE_BETWEEN (se conservan las
 * cajas de la API), ni se recalcula el alto de un texto cuyo ancho cambie.
 *
 * @param root Nodo raíz; no se modifica.
 * @returns Copia del árbol con las cajas normalizadas.
 */
export function normalizeAutoLayout(root: FigmaNode): FigmaNode {
  const tree = structuredClone(root);
  hugPass(tree);
  placePass(tree);
  return tree;
}

type Axis = { pos: "x" | "y"; size: "width" | "height" };
const H: Axis = { pos: "x", size: "width" };
const V: Axis = { pos: "y", size: "height" };

function isFlow(n: FigmaNode): boolean {
  return (n.layoutMode === "HORIZONTAL" || n.layoutMode === "VERTICAL") && n.layoutWrap !== "WRAP";
}

function flowChildren(n: FigmaNode): FigmaNode[] {
  return (n.children ?? []).filter((c) => c.visible !== false && c.layoutPositioning !== "ABSOLUTE" && c.absoluteBoundingBox);
}

function axes(n: FigmaNode) {
  const vertical = n.layoutMode === "VERTICAL";
  const primary = vertical ? V : H;
  const counter = vertical ? H : V;
  const pad = {
    primaryStart: (vertical ? n.paddingTop : n.paddingLeft) ?? 0,
    primaryEnd: (vertical ? n.paddingBottom : n.paddingRight) ?? 0,
    counterStart: (vertical ? n.paddingLeft : n.paddingTop) ?? 0,
    counterEnd: (vertical ? n.paddingRight : n.paddingBottom) ?? 0,
  };
  return { vertical, primary, counter, pad };
}

function sizing(n: FigmaNode, axis: Axis) {
  return axis === H ? n.layoutSizingHorizontal : n.layoutSizingVertical;
}

function hugPass(n: FigmaNode): void {
  n.children?.forEach(hugPass);
  const box = n.absoluteBoundingBox;
  if (!box || !isFlow(n)) return;
  const kids = flowChildren(n);
  if (kids.length === 0) return;
  const { primary, counter, pad } = axes(n);
  const spacing = n.itemSpacing ?? 0;
  // Un eje FILL se mide también por su contenido: si el padre es "hug" en ese eje, el
  // tamaño final sale de aquí; si el padre es fijo, placePass lo sobrescribe después.
  if (fitsContent(n, primary) && n.primaryAxisAlignItems !== "SPACE_BETWEEN") {
    const content = kids.reduce((s, c) => s + c.absoluteBoundingBox![primary.size], 0) + spacing * (kids.length - 1);
    resize(n, primary, content + pad.primaryStart + pad.primaryEnd);
  }
  if (fitsContent(n, counter)) {
    const content = Math.max(...kids.map((c) => c.absoluteBoundingBox![counter.size]));
    resize(n, counter, content + pad.counterStart + pad.counterEnd);
  }
}

function fitsContent(n: FigmaNode, axis: Axis): boolean {
  const s = sizing(n, axis);
  return s === "HUG" || s === "FILL";
}

function stretches(c: FigmaNode, counter: Axis): boolean {
  return c.layoutAlign === "STRETCH" || sizing(c, counter) === "FILL";
}

function placePass(n: FigmaNode): void {
  const box = n.absoluteBoundingBox;
  if (box && isFlow(n) && n.primaryAxisAlignItems !== "SPACE_BETWEEN") {
    const kids = flowChildren(n);
    const { primary, counter, pad } = axes(n);
    const spacing = n.itemSpacing ?? 0;
    const innerPrimary = box[primary.size] - pad.primaryStart - pad.primaryEnd;
    const innerCounter = box[counter.size] - pad.counterStart - pad.counterEnd;

    // Eje secundario: stretch/fill ocupan todo el ancho (o alto) interior.
    for (const c of kids) if (stretches(c, counter)) resize(c, counter, innerCounter);

    // Eje principal: grow/fill reparten el espacio sobrante.
    const growers = kids.filter((c) => (c.layoutGrow ?? 0) > 0 || sizing(c, primary) === "FILL");
    const fixedLen = kids.filter((c) => !growers.includes(c)).reduce((s, c) => s + c.absoluteBoundingBox![primary.size], 0);
    const free = innerPrimary - fixedLen - spacing * Math.max(0, kids.length - 1);
    if (growers.length > 0 && free > 0) for (const c of growers) resize(c, primary, free / growers.length);

    const total = kids.reduce((s, c) => s + c.absoluteBoundingBox![primary.size], 0) + spacing * Math.max(0, kids.length - 1);
    const slack = Math.max(0, innerPrimary - total);
    const align = n.primaryAxisAlignItems ?? "MIN";
    let cursor = box[primary.pos] + pad.primaryStart + (align === "CENTER" ? slack / 2 : align === "MAX" ? slack : 0);

    for (const c of kids) {
      const cb = c.absoluteBoundingBox!;
      const counterAlign = stretches(c, counter) ? "MIN" : (n.counterAxisAlignItems ?? "MIN");
      const counterSlack = innerCounter - cb[counter.size];
      const counterPos =
        box[counter.pos] + pad.counterStart + (counterAlign === "CENTER" ? counterSlack / 2 : counterAlign === "MAX" ? counterSlack : 0);
      const dPrimary = cursor - cb[primary.pos];
      const dCounter = counterPos - cb[counter.pos];
      translate(c, primary === H ? dPrimary : dCounter, primary === H ? dCounter : dPrimary);
      cursor += cb[primary.size] + spacing;
    }
  }
  n.children?.forEach(placePass);
}

function resize(n: FigmaNode, axis: Axis, value: number): void {
  const box = n.absoluteBoundingBox;
  if (!box || !(value > 0)) return;
  const delta = value - box[axis.size];
  if (Math.abs(delta) < 0.01) return;
  box[axis.size] = value;
  if (n.absoluteRenderBounds) n.absoluteRenderBounds[axis.size] = Math.max(0, n.absoluteRenderBounds[axis.size] + delta);
}

function translate(n: FigmaNode, dx: number, dy: number): void {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  const move = (r: FigmaRect | null | undefined) => {
    if (r) {
      r.x += dx;
      r.y += dy;
    }
  };
  move(n.absoluteBoundingBox);
  move(n.absoluteRenderBounds);
  n.children?.forEach((c) => translate(c, dx, dy));
}
