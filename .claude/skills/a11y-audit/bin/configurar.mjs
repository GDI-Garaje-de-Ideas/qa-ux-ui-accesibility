#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// src/configure-cli.ts
import { createInterface } from "node:readline";

// src/figma/token-store.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
function tokenFilePath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(base, "figma-a11y", "token");
}
function readStoredToken() {
  const file = tokenFilePath();
  if (!existsSync(file)) return void 0;
  const token2 = readFileSync(file, "utf8").trim();
  return token2 || void 0;
}
function saveToken(token2) {
  const file = tokenFilePath();
  mkdirSync(path.dirname(file), { recursive: true, mode: 448 });
  writeFileSync(file, `${token2.trim()}
`, { encoding: "utf8", mode: 384 });
  chmodSync(file, 384);
  return file;
}
function deleteStoredToken() {
  const file = tokenFilePath();
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

// src/figma/client.ts
var API = "https://api.figma.com/v1";
var FigmaApiError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "FigmaApiError";
  }
  status;
};
function findToken(explicit) {
  const candidates = [
    [explicit, "argumento"],
    [process.env.FIGMA_TOKEN, "FIGMA_TOKEN"],
    [process.env.FIGMA_API_KEY, "FIGMA_API_KEY"]
  ];
  for (const [token2, source] of candidates) if (token2?.trim()) return { token: token2.trim(), source };
  const stored = readStoredToken();
  return stored ? { token: stored, source: "archivo" } : void 0;
}
async function figmaGet(path2, token2) {
  const res = await fetch(`${API}${path2}`, { headers: { "X-Figma-Token": token2 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint = res.status === 401 ? "Token inv\xE1lido o caducado: vuelve a configurarlo con configurar.mjs." : res.status === 403 ? "Token inv\xE1lido o sin permiso sobre el archivo." : res.status === 404 ? "Archivo o nodo no encontrado. Comprueba la clave del archivo y el node-id." : res.status === 429 ? "L\xEDmite de peticiones de la API de Figma alcanzado. Espera un momento y reintenta." : "";
    throw new FigmaApiError(`Figma API ${res.status} en ${path2}. ${hint} ${body.slice(0, 200)}`.trim(), res.status);
  }
  return await res.json();
}
async function fetchMe(token2) {
  return figmaGet("/me", token2);
}

// src/configure-cli.ts
var args = process.argv.slice(2);
if (args.includes("--estado")) {
  const found = findToken();
  if (!found) {
    console.log(`SIN TOKEN \xB7 Ejecuta este mismo programa sin opciones en tu terminal para configurarlo.`);
    process.exit(3);
  }
  const origen = found.source === "archivo" ? `archivo ${tokenFilePath()}` : `variable ${found.source}`;
  try {
    const me = await fetchMe(found.token);
    console.log(`OK \xB7 Token v\xE1lido de ${me.handle} (${me.email}) \xB7 origen: ${origen}`);
    process.exit(0);
  } catch (err) {
    if (err instanceof FigmaApiError && (err.status === 401 || err.status === 403)) {
      console.log(`TOKEN INV\xC1LIDO \xB7 Figma lo rechaza (origen: ${origen}). Genera otro y vuelve a configurarlo.`);
      process.exit(4);
    }
    console.log(`ERROR \xB7 No se pudo comprobar el token: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
if (args.includes("--borrar")) {
  console.log(deleteStoredToken() ? `Token borrado de ${tokenFilePath()}.` : "No hab\xEDa ning\xFAn token guardado.");
  process.exit(0);
}
if (!process.stdin.isTTY) {
  console.error("Este programa pide el token de forma interactiva: ejec\xFAtalo t\xFA en una terminal (no desde el chat).");
  process.exit(2);
}
console.log("Configuraci\xF3n del token de Figma para /a11y-audit");
console.log("1. En Figma: Settings > Security > Personal access tokens > Generate new token.");
console.log("2. Permiso necesario: solo \xABFile content: Read\xBB.");
console.log("3. Pega el token aqu\xED. No se mostrar\xE1 mientras lo escribes.\n");
var token = (await askHidden("Token de Figma: ")).trim();
if (!token) {
  console.error("No se ha introducido ning\xFAn token.");
  process.exit(2);
}
try {
  const me = await fetchMe(token);
  const file = saveToken(token);
  console.log(`
\u2714 Token v\xE1lido de ${me.handle} (${me.email}).`);
  console.log(`  Guardado en ${file} (solo tu usuario puede leerlo).`);
  console.log("  Ya puedes volver a Claude Code y continuar con /a11y-audit.");
} catch (err) {
  if (err instanceof FigmaApiError && (err.status === 401 || err.status === 403)) {
    console.error("\n\u2716 Figma rechaza ese token. Comprueba que lo has copiado entero y que tiene el permiso \xABFile content: Read\xBB.");
  } else {
    console.error(`
\u2716 No se pudo validar el token: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.error("  No se ha guardado nada.");
  process.exit(1);
}
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const rlAny = rl;
    let muted = false;
    let answered = false;
    rlAny._writeToOutput = (s) => {
      if (!muted) rlAny.output.write(s);
    };
    rl.on("close", () => {
      if (!answered) resolve("");
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}
