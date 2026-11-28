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
    assert.ok(["CEREBRO", "MEMORIA", "APRENDIZADOS", "CONVERSAS", "REDE", "linguagem", "TRAVAS"].includes(link), `link para nota que não existe: ${link}`);
  }

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "glossario-"));
  await gerarGlossario(pasta, { nome: "Teste" });
  assert.match(fs.readFileSync(path.join(pasta, "GLOSSARIO.md"), "utf8"), /# Glossário do cérebro da Teste/);
  await gerarGlossario(null); // sem cofre, nada quebra
  fs.rmSync(pasta, { recursive: true, force: true });

  // TRAVAS.md (27/11/2026): abre quando ele pergunta, e os números são os que travam.
  const { textoDasTravas, gerarTravas, QUANDO_TRAVAS } = require("../glossario.js");
  const { INTERVALO, INTERVALO_GERAL, DEPOIS_DE_CONVERSAR, FATO, LIMIAR_HZ, ACUMULO } = require("../iniciativa.js");
  const { LIMIAR_MIN, LIMIAR_AJUSTE } = require("../pensamento.js");
  const travas = textoDasTravas({ nome: "Sexta-Feira" });
  assert.match(travas, new RegExp(`^---\nquando: ${QUANDO_TRAVAS}`), "tem quando de verdade: abre quando ele pergunta");
  const min = (ms) => (ms >= 3_600_000 && ms % 3_600_000 === 0 ? `${ms / 3_600_000} h` : `${ms / 60_000} min`);
  for (const esperado of [
    `${LIMIAR_HZ} Hz`, `acúmulo de ${ACUMULO}`, `${MAX_POR_DIA} por dia`, `${min(INTERVALO_GERAL)} entre uma e outra`,
    `pausa ${min(INTERVALO.PAUSA)}`, `dormir ${min(INTERVALO.DORMIR)}`, `cumprimentar ${min(INTERVALO.SAUDAR)}`,
    `avisar do Mac ${min(INTERVALO.AVISAR)}`, `puxar conversa ${min(INTERVALO.PAPO)}`, `conversar:** ${min(DEPOIS_DE_CONVERSAR)}`,
    `${Math.round(LIMIAR_MIN * 100)}%`, `${Math.round(LIMIAR_AJUSTE * 100)}%`, `Até ${MAX}`,
  ]) assert.ok(travas.includes(esperado), `TRAVAS.md devia dizer "${esperado}"`);
  // As condições de verdade escritas em texto batem com as do código.
  assert.ok(travas.includes("75 min seguidos") && !FATO.PAUSA({ sessaoMin: 74 }) && FATO.PAUSA({ sessaoMin: 75 }));
  assert.ok(travas.includes("8 h sem conversar") && !FATO.PAPO({ semConversaH: 7.9 }) && FATO.PAPO({ semConversaH: 8 }));
  assert.ok(travas.includes("20% ou menos") && FATO.AVISAR({ naBateria: true, bateria: 20 }) && !FATO.AVISAR({ naBateria: true, bateria: 21 }));
  // O que pede o sim no código é o que a nota diz que pede.
  const { runTool } = require("../tools.js");
  for (const [nome, args] of [["run_command", { command: "rm -rf /tmp/nao-existe-glossario" }], ["send_message", { canal: "email", para: "x", texto: "y" }]]) {
    assert.strictEqual(JSON.parse(await runTool(nome, args)).needs_confirmation, true, `${nome} pede o sim, como a nota diz`);
  }
  assert.doesNotMatch(travas, /apagar[^.]*(evento|gasto)[^.]*esperam o sim/i, "apagar evento/gasto não pede o sim: a nota não pode dizer que pede");

  // E ela acha a nota quando ele pergunta.
  const { Memoria } = require("../memoria.js");
  const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "travas-"));
  await gerarTravas(cofre, { nome: "Sexta-Feira" });
  const m = new Memoria({ pasta: cofre });
  const abertas = await m.relevantes("quais as travas que você possui?");
  assert.ok(abertas.some((d) => /TRAVAS/.test(d.nome)), `a pergunta abre TRAVAS.md (${JSON.stringify(abertas.map((d) => d.nome))})`);
  fs.rmSync(cofre, { recursive: true, force: true });

  console.log(`✓ glossário: ${termos.length} termos, números do código, fora do contexto; travas com os números que travam`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
