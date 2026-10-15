#!/usr/bin/env node
/**
 * Describe qué hay detrás de un enlace de Figma para decidir qué auditar. Solo lectura.
 *
 * Uso:
 *   node flujos.mjs "<enlace>"                  → tipo de nodo y flujos (o páginas si no hay node-id)
 *   node flujos.mjs "<enlace>" --flujo <id>     → pantallas de un flujo concreto
 *   node flujos.mjs "<enlace>" --json           → salida JSON completa
 *
 * Token: FIGMA_TOKEN o el guardado con bin/configurar.mjs (~/.config/figma-a11y/token). Tipos de resultado:
 *   archivo: el enlace no tiene node-id; se listan las páginas.
 *   frame:   el enlace apunta a una pantalla; se audita directamente.
 *   page / section: se listan los flujos (secciones, también anidadas) con sus pantallas.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.figma.com/v1";
const SCREEN_TYPES = new Set(["FRAME", "COMPONENT", "INSTANCE"]);
const CONTAINER_TYPES = new Set(["SECTION", "GROUP"]);
const MIN_W = 320;
const MIN_H = 400;
const DOC_RE = /\b(nota|notas|note|notes|descripci[oó]n|documentaci[oó]n|documentation|leyenda|instrucciones|readme|changelog|anotaci[oó]n)\b/i;

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--flujo");
const asJson = args.includes("--json");
const flowArg = args.includes("--flujo") ? args[args.indexOf("--flujo") + 1].replace("-", ":") : null;

if (!url) fail('Uso: node flujos.mjs "<enlace de Figma>" [--flujo <id>] [--json]', 2);
const token = [process.env.FIGMA_TOKEN, process.env.FIGMA_API_KEY, storedToken()].find((t) => t && t.trim())?.trim();
if (!token) fail("Falta el token de Figma. Ejecuta en tu terminal: node <carpeta del skill>/bin/configurar.mjs", 2);

const m = /figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9]+)/.exec(url);
if (!m) fail(`No reconozco "${url}" como un enlace de Figma.`, 2);
const fileKey = m[1];
let nodeId;
try {
  const raw = new URL(url).searchParams.get("node-id");
  if (raw) nodeId = decodeURIComponent(raw).replace(/-/g, ":");
} catch {}

const result = nodeId ? await describeNode(fileKey, nodeId) : await describeFile(fileKey);
if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  print(result);
}

// ---------------------------------------------------------------------------

/** Token guardado por bin/configurar.mjs (misma ruta que src/figma/token-store.ts). */
function storedToken() {
  const file = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "figma-a11y", "token");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : undefined;
}

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    const hint = { 403: "Token inválido o sin acceso al archivo.", 404: "Archivo o nodo no encontrado.", 429: "Límite de peticiones: espera un minuto." }[res.status] ?? "";
    fail(`Figma API ${res.status}. ${hint}`, 1);
  }
  return res.json();
}

async function describeFile(key) {
  const data = await get(`/files/${key}?depth=1`);
  return { kind: "archivo", fileKey: key, fileName: data.name, pages: (data.document.children ?? []).map((p) => ({ id: p.id, name: p.name })) };
}

async function describeNode(key, id) {
  const data = await get(`/files/${key}/nodes?ids=${encodeURIComponent(id)}&depth=5`);
  const root = data.nodes[id]?.document;
  if (!root) fail(`El nodo ${id} no existe en el archivo.`, 1);
  const base = { fileKey: key, fileName: data.name };
  const box = root.absoluteBoundingBox;
  if (SCREEN_TYPES.has(root.type)) {
    return { ...base, kind: "frame", id: root.id, name: root.name, width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
  }
  const flows = [];
  if (root.type === "SECTION") {
    collectSection(root, [], flows);
  } else {
    const loose = [];
    for (const c of visible(root)) {
      if (c.type === "SECTION") collectSection(c, [], flows);
      else if (CONTAINER_TYPES.has(c.type)) collectScreens(c, [c.name], loose, flows, []);
      else if (isScreen(c)) loose.push(screenOf(c, []));
    }
    if (loose.length) flows.push({ id: root.id, name: "Pantallas sueltas", path: [], screens: dedupe(loose) });
  }
  // Las secciones sin pantallas (p. ej. "DESCRIPCIÓN DE TAREA") no son flujos auditables.
  const auditable = flows.filter((f) => f.screens.length > 0);
  return { ...base, kind: root.type === "SECTION" ? "section" : "page", id: root.id, name: root.name, flows: auditable };
}

function collectSection(section, path, flows) {
  const flow = { id: section.id, name: section.name, path, screens: [] };
  flows.push(flow);
  collectScreens(section, [], flow.screens, flows, [...path, section.name]);
  flow.screens = dedupe(flow.screens);
  return flow;
}

function collectScreens(node, group, out, flows, sectionPath) {
  for (const c of visible(node)) {
    if (c.type === "SECTION") {
      const sub = collectSection(c, sectionPath, flows);
      out.push(...sub.screens.map((s) => ({ ...s, group: [c.name, ...s.group], duplicateOf: undefined })));
    } else if (CONTAINER_TYPES.has(c.type)) {
      collectScreens(c, [...group, c.name], out, flows, sectionPath);
    } else if (isScreen(c)) {
      out.push(screenOf(c, group));
    }
  }
}

function visible(n) {
  return (n.children ?? []).filter((c) => c.visible !== false);
}

function isScreen(n) {
  const b = n.absoluteBoundingBox;
  return SCREEN_TYPES.has(n.type) && b && b.width >= MIN_W && b.height >= MIN_H;
}

function screenOf(n, group) {
  const b = n.absoluteBoundingBox;
  return { id: n.id, name: n.name, width: Math.round(b.width), height: Math.round(b.height), group, likelyDoc: DOC_RE.test(n.name) };
}

/** Marca como duplicada la pantalla con el mismo nombre y tamaño que una anterior. */
function dedupe(screens) {
  const first = new Map();
  return screens.map((s) => {
    const k = `${s.name.trim().toLowerCase()}|${s.width}x${s.height}`;
    if (first.has(k)) return { ...s, duplicateOf: first.get(k) };
    first.set(k, s.id);
    return { ...s, duplicateOf: undefined };
  });
}

function print(r) {
  console.log(`Archivo: ${r.fileName} (${r.fileKey})`);
  if (r.kind === "archivo") {
    console.log("TIPO: archivo sin node-id. Páginas:");
    r.pages.forEach((p, i) => console.log(`  ${i + 1}. [${p.id}] ${p.name}`));
    return;
  }
  if (r.kind === "frame") {
    console.log(`TIPO: frame · "${r.name}" [${r.id}] ${r.width}x${r.height}`);
    return;
  }
  console.log(`TIPO: ${r.kind === "page" ? "página" : "sección"} · "${r.name}" [${r.id}]`);
  if (flowArg) {
    const f = r.flows.find((x) => x.id === flowArg);
    if (!f) fail(`No hay ningún flujo con id ${flowArg} en este nodo.`, 1);
    const uniq = f.screens.filter((s) => !s.duplicateOf);
    console.log(`FLUJO "${f.name}" [${f.id}]: ${f.screens.length} pantallas, ${uniq.length} únicas`);
    f.screens.forEach((s, i) => {
      const tags = [s.duplicateOf ? `duplicada de ${s.duplicateOf}` : "", s.likelyDoc ? "parece documentación" : ""].filter(Boolean).join(", ");
      const grp = s.group.length ? `${s.group.join(" > ")} > ` : "";
      console.log(`  ${String(i + 1).padStart(3)}. [${s.id}] ${grp}${s.name} · ${s.width}x${s.height}${tags ? `  (${tags})` : ""}`);
    });
    return;
  }
  if (r.flows.length === 0) {
    console.log("No se han encontrado pantallas (frames de al menos 320x400) en este nodo.");
    return;
  }
  r.flows.forEach((f, i) => {
    const uniq = f.screens.filter((s) => !s.duplicateOf).length;
    const ind = "  ".repeat(f.path.length + 1);
    const sizes = [...new Set(f.screens.map((s) => s.width))].join("/");
    console.log(`${ind}${i + 1}. [${f.id}] ${f.name} · ${f.screens.length} pantallas, ${uniq} únicas · ancho ${sizes} px`);
  });
}

function fail(msg, code) {
  console.error(msg);
  process.exit(code);
}
