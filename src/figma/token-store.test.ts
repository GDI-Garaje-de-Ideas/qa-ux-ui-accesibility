import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deleteStoredToken, readStoredToken, saveToken, tokenFilePath } from "./token-store.js";
import { findToken, resolveToken } from "./client.js";

const TOKEN_VARS = ["FIGMA_TOKEN", "FIGMA_API_KEY"];

/** Ejecuta fn con un XDG_CONFIG_HOME temporal y sin variables de token, y lo restaura después. */
function withCleanEnv(fn: () => void) {
  const saved: Record<string, string | undefined> = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
  for (const v of TOKEN_VARS) saved[v] = process.env[v];
  process.env.XDG_CONFIG_HOME = mkdtempSync(path.join(tmpdir(), "figma-a11y-"));
  for (const v of TOKEN_VARS) delete process.env[v];
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("guarda el token fuera del proyecto, con permisos 600, y lo vuelve a leer", () => {
  withCleanEnv(() => {
    assert.equal(readStoredToken(), undefined);
    const file = saveToken("  figd_prueba  ");
    assert.equal(file, tokenFilePath());
    assert.ok(file.endsWith(path.join("figma-a11y", "token")));
    assert.equal(readStoredToken(), "figd_prueba");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(deleteStoredToken(), true);
    assert.equal(readStoredToken(), undefined);
    assert.equal(deleteStoredToken(), false);
  });
});

test("resolveToken usa el archivo si no hay variables, y las variables tienen prioridad", () => {
  withCleanEnv(() => {
    assert.throws(() => resolveToken(), /configurar\.mjs/);
    saveToken("figd_archivo");
    assert.deepEqual(findToken(), { token: "figd_archivo", source: "archivo" });
    process.env.FIGMA_API_KEY = "figd_api_key";
    assert.deepEqual(findToken(), { token: "figd_api_key", source: "FIGMA_API_KEY" });
    process.env.FIGMA_TOKEN = "   ";
    assert.equal(findToken()?.source, "FIGMA_API_KEY", "una variable vacía se ignora");
    process.env.FIGMA_TOKEN = "figd_env";
    assert.equal(resolveToken(), "figd_env");
    assert.equal(resolveToken("figd_explicito"), "figd_explicito");
  });
});
