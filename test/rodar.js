// Roda TODOS os test/*.test.js, um por vez (não há lista para esquecer de atualizar),
// e mostra no fim quais falharam. `npm test memoria pdf` roda só os que casam.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const filtros = process.argv.slice(2);
const arquivos = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js") && (!filtros.length || filtros.some((x) => f.includes(x))))
  .sort();

if (!arquivos.length) {
  console.error("✗ nenhum teste encontrado");
  process.exit(1);
}

const falhas = arquivos.filter((f) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    timeout: 180_000,
  });
  return r.status !== 0;
});

console.log(`\n${arquivos.length - falhas.length} de ${arquivos.length} arquivos de teste passaram`);
if (falhas.length) {
  console.error(`✗ falharam: ${falhas.join(", ")}`);
  process.exit(1);
}
