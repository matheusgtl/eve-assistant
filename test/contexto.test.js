// contexto.test.js — o agente não se perde (25/11/2026).
// O fio da conversa, os aprendizados e o aviso de correção chegam no prompt.
// Rode com: node test/contexto.test.js
const assert = require("node:assert");
const { montarSystemPrompt } = require("../brains.js");

const base = { agora: new Date("2026-11-25T22:00:00-03:00") };

// 1. Nome novo por padrão.
const p0 = montarSystemPrompt(base);
assert.match(p0, /Você é Sexta-Feira/);
assert.doesNotMatch(p0, /O FIO DESTA CONVERSA|O QUE VOCÊ JÁ APRENDEU|TE CORRIGINDO/, "sem dados, nenhum bloco a mais");

// 2. O fio da conversa, com o título, para o agente que assumiu agora.
const p1 = montarSystemPrompt({
  ...base,
  tituloConversa: "Relatório de gastos",
  conversaAnterior: [
    { quem: "voce", texto: "faz o relatório de novembro em PDF", hora: "2026-11-25T21:50:00-03:00" },
    { quem: "eve", texto: "Comecei pelos lançamentos do cartão.", hora: "2026-11-25T21:50:30-03:00" },
  ],
});
assert.match(p1, /O FIO DESTA CONVERSA \("Relatório de gastos"\)/);
assert.match(p1, /Continue a tarefa de onde parou/);
assert.match(p1, /ele: faz o relatório de novembro em PDF/);
assert.match(p1, /você: Comecei pelos lançamentos do cartão\./);

// 3. Aprendizados e alertas de ferramenta.
const p2 = montarSystemPrompt({
  ...base,
  aprendizados: {
    linhas: ["- Evento sem hora: dia inteiro, sem inventar hora."],
    alertas: ["- criar_evento falhou 2×: acesso negado"],
  },
});
assert.match(p2, /O QUE VOCÊ JÁ APRENDEU/);
assert.match(p2, /Evento sem hora: dia inteiro/);
assert.match(p2, /criar_evento falhou 2×/);

// 4. Correção percebida pede o aprendizado gravado.
assert.match(montarSystemPrompt({ ...base, correcao: true }), /TE CORRIGINDO[\s\S]*pasta aprendizados/);

console.log("✓ contexto: fio da conversa, aprendizados e correção no prompt");
