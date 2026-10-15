#!/usr/bin/env node
/**
 * Configura el token de Figma para el skill /a11y-audit sin que pase por el chat.
 *
 * Uso:
 *   configurar            pide el token (sin mostrarlo), lo valida con Figma y lo guarda
 *   configurar --estado   indica si hay token, de dónde sale y de qué cuenta es (nunca lo muestra)
 *   configurar --borrar   borra el token guardado
 *
 * Códigos de salida de --estado: 0 configurado y válido · 3 sin token · 4 token inválido · 1 error de red.
 * El skill los usa para decidir si pedir al usuario que configure el token.
 */
import { createInterface } from "node:readline";
import { FigmaApiError, fetchMe, findToken } from "./figma/client.js";
import { deleteStoredToken, saveToken, tokenFilePath } from "./figma/token-store.js";

const args = process.argv.slice(2);

if (args.includes("--estado")) {
  const found = findToken();
  if (!found) {
    console.log(`SIN TOKEN · Ejecuta este mismo programa sin opciones en tu terminal para configurarlo.`);
    process.exit(3);
  }
  const origen = found.source === "archivo" ? `archivo ${tokenFilePath()}` : `variable ${found.source}`;
  try {
    const me = await fetchMe(found.token);
    console.log(`OK · Token válido de ${me.handle} (${me.email}) · origen: ${origen}`);
    process.exit(0);
  } catch (err) {
    if (err instanceof FigmaApiError && (err.status === 401 || err.status === 403)) {
      console.log(`TOKEN INVÁLIDO · Figma lo rechaza (origen: ${origen}). Genera otro y vuelve a configurarlo.`);
      process.exit(4);
    }
    console.log(`ERROR · No se pudo comprobar el token: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

if (args.includes("--borrar")) {
  console.log(deleteStoredToken() ? `Token borrado de ${tokenFilePath()}.` : "No había ningún token guardado.");
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("Este programa pide el token de forma interactiva: ejecútalo tú en una terminal (no desde el chat).");
  process.exit(2);
}

console.log("Configuración del token de Figma para /a11y-audit");
console.log("1. En Figma: Settings > Security > Personal access tokens > Generate new token.");
console.log("2. Permiso necesario: solo «File content: Read».");
console.log("3. Pega el token aquí. No se mostrará mientras lo escribes.\n");

const token = (await askHidden("Token de Figma: ")).trim();
if (!token) {
  console.error("No se ha introducido ningún token.");
  process.exit(2);
}

try {
  const me = await fetchMe(token);
  const file = saveToken(token);
  console.log(`\n✔ Token válido de ${me.handle} (${me.email}).`);
  console.log(`  Guardado en ${file} (solo tu usuario puede leerlo).`);
  console.log("  Ya puedes volver a Claude Code y continuar con /a11y-audit.");
} catch (err) {
  if (err instanceof FigmaApiError && (err.status === 401 || err.status === 403)) {
    console.error("\n✖ Figma rechaza ese token. Comprueba que lo has copiado entero y que tiene el permiso «File content: Read».");
  } else {
    console.error(`\n✖ No se pudo validar el token: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.error("  No se ha guardado nada.");
  process.exit(1);
}

/**
 * Lee una línea de la terminal sin mostrar lo que se escribe. Desactiva el eco de
 * readline: sustituye su escritura por nada mientras se teclea y solo muestra el texto
 * de la pregunta.
 */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    let answered = false;
    rlAny._writeToOutput = (s: string) => {
      if (!muted) rlAny.output.write(s);
    };
    // Si la entrada se cierra sin respuesta (Ctrl+D), se devuelve vacío en vez de colgarse.
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
