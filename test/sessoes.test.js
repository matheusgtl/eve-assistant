// Conversas simultâneas (sessoes.js): trocar de conversa no meio de um pedido
// não cancela nada, e a resposta de cada uma cai NA conversa dela.
// Sem rede, sem Electron. Rode com: node test/sessoes.test.js
//
// O caso real: 26/11/2026, 17:03. Ele perguntou as notícias, a nvidia demorou,
// ele abriu outra conversa e o pedido morreu ("pedido cancelado pelo usuário").
const assert = require("node:assert");
const { Sessoes } = require("../sessoes.js");

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let criadas = 0;
const fabrica = (id) => ({ id, brain: null, ocupada: 0, n: ++criadas });

(async () => {
  const S = new Sessoes({ criarSessao: fabrica, maxParadas: 2 });
  S.identificarAberta("A");
  S.aberta.brain = { nome: "cérebro de A" };

  // O "anotar" do main.js: escreve na conversa do turno, não na da tela.
  const escrito = { A: [], B: [] };
  const falado = [];
  const anotar = (texto) => escrito[S.doTurno().id].push(texto);
  const falar = (texto) => { if (S.naTela()) falado.push(texto); };

  // Um "cérebro" lento: responde em pedaços, com espera entre eles (como o
  // stream da nvidia), e chama ferramenta no meio.
  const turno = async (resposta) => {
    await esperar(15);
    anotar(resposta + " (parte 1)");
    falar(resposta + " (parte 1)");
    await Promise.resolve().then(() => esperar(15));
    anotar(resposta + " (parte 2)");
    falar(resposta + " (parte 2)");
    return S.doTurno().id;
  };

  const a = S.aberta;
  const pedidoA = S.rodar(a, () => turno("notícias"));
  assert.strictEqual(a.ocupada, 1, "a conversa A está trabalhando");
  assert.ok(S.ocupada("A"));

  // Ele troca para B no meio do pedido de A.
  await esperar(20);
  const { s: b, saiu, voltou } = S.trocar("B", (nova) => (nova.brain = { nome: "cérebro de B" }));
  assert.strictEqual(saiu, a);
  assert.strictEqual(voltou, false, "B é nova: ganha cérebro próprio");
  assert.notStrictEqual(b.brain, a.brain, "cada conversa tem o seu cérebro");
  assert.ok(!S.naTela(a) && S.naTela(b));

  // E pergunta outra coisa em B, enquanto A ainda trabalha.
  const pedidoB = S.rodar(b, () => turno("receita"));
  const [fimA, fimB] = await Promise.all([pedidoA, pedidoB]);

  assert.strictEqual(fimA, "A", "o turno de A continuou sendo de A até o fim");
  assert.strictEqual(fimB, "B");
  assert.deepStrictEqual(escrito.A, ["notícias (parte 1)", "notícias (parte 2)"], "A recebeu a resposta inteira, nada cancelado");
  assert.deepStrictEqual(escrito.B, ["receita (parte 1)", "receita (parte 2)"], "B não recebeu nada de A");
  assert.ok(falado.includes("notícias (parte 1)"), "A falou enquanto estava na tela");
  assert.ok(!falado.includes("notícias (parte 2)"), "e calou depois que saiu da tela");
  assert.ok(falado.includes("receita (parte 2)"), "B fala: é a da tela");
  assert.strictEqual(a.ocupada, 0);
  assert.strictEqual(b.ocupada, 0);

  // Fora de um turno vale a da tela; `fora` tira do turno (a fila da fala).
  assert.strictEqual(S.doTurno(), b);
  await S.rodar(a, async () => {
    assert.strictEqual(S.doTurno(), a);
    S.fora(() => assert.strictEqual(S.doTurno(), b, "fora do turno, a sessão é a da tela"));
  });

  // Voltar para A traz a MESMA sessão, com o cérebro e o histórico dele.
  const volta = S.trocar("A", () => assert.fail("A ainda existe: não devia criar outra"));
  assert.strictEqual(volta.s, a);
  assert.strictEqual(volta.voltou, true);

  // As paradas mais antigas esquecem o cérebro; a que trabalha, nunca.
  const lenta = S.rodar(b, () => esperar(30));
  for (const id of ["C", "D", "E", "F"]) S.trocar(id, (n) => (n.brain = {}));
  assert.ok(S.mapa.has("B"), "B está trabalhando: não sai, por mais conversas que ele abra");
  const paradas = [...S.mapa.values()].filter((x) => x !== S.aberta && !x.ocupada);
  assert.ok(paradas.length <= 2, `no máximo 2 paradas guardadas (eram ${paradas.length})`);
  await lenta;

  // Chave trocada: as paradas esquecem o cérebro velho.
  S.esquecerParadas();
  assert.deepStrictEqual([...S.mapa.keys()], ["F"], "só a aberta sobra");

  console.log("✓ sessoes: trocar de conversa não cancela, cada resposta cai na sua conversa, só a da tela fala");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
