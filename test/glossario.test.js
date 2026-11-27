// O glossário do cérebro (glossario.js): toda palavra que o cofre usa tem
// explicação, os números vêm do código, e a nota fica fora do contexto dela.
// Sem rede, sem app. Rode com: node test/glossario.test.js
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gerarGlossario, textoDoGlossario, secoes } = require("../glossario.js");
const { LIMIAR_INICIO, OCULTOS_MAX } = require("../pensamento.js");
const { MAX } = require("../lembrancas.js");
const { MAX_POR_DIA } = require("../iniciativa.js");

(async () => {
  const texto = textoDoGlossario({ nome: "Sexta-Feira" });
  assert.match(texto, /^---\nquando: nunca/, "fora do índice que viaja nas perguntas");
  assert.match(texto, /# Glossário do cérebro da Sexta-Feira/);

  // As palavras que aparecem nas notas geradas precisam estar aqui.
  const termos = secoes("Sexta-Feira").flatMap(([, t]) => t.map(([termo]) => termo.toLowerCase()));
  for (const palavra of ["cérebro", "fato", "processo", "aprendizado", "conversa", "skill", "neurônio", "sinapse", "assembleia", "iniciativa", "humor", "intenção", "lembrança", "agente", "provedor", "trava"]) {
    assert.ok(termos.some((t) => t.includes(palavra)), `falta "${palavra}" no glossário`);
  }
  assert.strictEqual(new Set(termos).size, termos.length, "sem termo repetido");

  // Os números são os do código, não um texto que envelhece.
  assert.ok(texto.includes(`${Math.round(LIMIAR_INICIO * 100)}%`));
  assert.ok(texto.includes(`até ${OCULTOS_MAX}`));
  assert.ok(texto.includes(`Até ${MAX} lembranças`));
  assert.ok(texto.includes(`${MAX_POR_DIA} por dia`));

  // Só aponta para notas que o código gera.
  for (const [, link] of texto.matchAll(/\[\[([A-Za-z][^\]|]*)/g)) {
    assert.ok(["CEREBRO", "MEMORIA", "APRENDIZADOS", "CONVERSAS", "REDE", "linguagem"].includes(link), `link para nota que não existe: ${link}`);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "glossario-"));
  await gerarGlossario(pasta, { nome: "Teste" });
  assert.match(fs.readFileSync(path.join(pasta, "GLOSSARIO.md"), "utf8"), /# Glossário do cérebro da Teste/);
  await gerarGlossario(null); // sem cofre, nada quebra
  fs.rmSync(pasta, { recursive: true, force: true });

  console.log(`✓ glossário: ${termos.length} termos, números do código, fora do contexto`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
