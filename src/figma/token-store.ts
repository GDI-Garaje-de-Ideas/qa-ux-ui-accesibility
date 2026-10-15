import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Almacén local del token de Figma, para que el skill funcione sin configurar variables
 * de entorno: el usuario ejecuta una vez `configurar.mjs`, que guarda el token aquí, y el
 * resto de programas lo leen.
 *
 * Ruta: `$XDG_CONFIG_HOME/figma-a11y/token`, o `~/.config/figma-a11y/token` si no está
 * definida. La carpeta se crea con permisos 700 y el archivo con 600 (solo lectura y
 * escritura para el usuario), igual que guardan sus credenciales otras herramientas de
 * terminal. Está fuera de cualquier proyecto, así que nunca acaba en un repositorio.
 */
export function tokenFilePath(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
  return path.join(base, "figma-a11y", "token");
}

/** Devuelve el token guardado, o undefined si no hay archivo o está vacío. */
export function readStoredToken(): string | undefined {
  const file = tokenFilePath();
  if (!existsSync(file)) return undefined;
  const token = readFileSync(file, "utf8").trim();
  return token || undefined;
}

/** Guarda el token con permisos restringidos y devuelve la ruta del archivo. */
export function saveToken(token: string): string {
  const file = tokenFilePath();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${token.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(file, 0o600); // por si el archivo ya existía con otros permisos
  return file;
}

/** Borra el token guardado. Devuelve true si existía. */
export function deleteStoredToken(): boolean {
  const file = tokenFilePath();
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}
