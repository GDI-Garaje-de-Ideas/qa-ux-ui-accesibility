/**
 * Empaqueta el programa en archivos autónomos dentro de la carpeta del skill, para que
 * quien la copie a otro proyecto no necesite `npm install` ni compilar: cada salida
 * incluye sus dependencias (zod…). Solo hace falta Node.js 20 o superior.
 *
 * Uso: npm run build:skill
 * Salida: .claude/skills/a11y-audit/bin/{audit,report,contraste,configurar}.mjs
 *
 * El servidor MCP (src/server.ts) no se empaqueta: el skill no lo necesita, porque usa
 * estos programas de terminal, que dan el mismo resultado sin registrar nada.
 */
import { build } from "esbuild";

const out = ".claude/skills/a11y-audit/bin";
const entries = {
  audit: "src/cli.ts",
  report: "src/report/cli.ts",
  contraste: "src/contrast-cli.ts",
  configurar: "src/configure-cli.ts",
};

await build({
  entryPoints: entries,
  outdir: out,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: false,
  legalComments: "none",
  logLevel: "info",
  // Algunas dependencias CommonJS usan require(); en ESM hay que recrearlo.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
