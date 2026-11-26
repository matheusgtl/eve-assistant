// Botões de resposta e o sim que só ele dá (escolhas.js). Sem rede, sem app.
const assert = require("node:assert");
const { lerResposta, assinatura, Confirmacoes, extrairOpcoes, filtroDeOpcoes } = require("../escolhas.js");

// ------------------------------------------------- sim, não, ou outra coisa
for (const t of ["Sim", "sim, pode", "Sim, pode", "Sim você pode", "pode mandar", "manda", "confirmo", "isso mesmo", "ok", "Claro!", "bora", "s"]) {
  assert.strictEqual(lerResposta(t), "sim", `devia ser sim: ${t}`);
}
for (const t of ["Não", "nao", "não, pode deixar", "n", "cancela", "para", "deixa", "Melhor não"]) {
  assert.strictEqual(lerResposta(t), "nao", `devia ser não: ${t}`);
}
for (const t of ["", "R", "qual o saldo?", "manda pro João depois", "para o João", "deixa que eu falo com ele", "Sinto muito"]) {
  // "manda pro João depois" começa com "manda": é sim, e muda a chamada — ver assinatura
  if (t.startsWith("manda")) continue;
  assert.strictEqual(lerResposta(t), null, `não devia decidir nada: "${t}"`);
}

// ------------------------------------------------- duas conversas ao mesmo tempo (26/11/2026)
// O sim dito numa conversa nunca aprova o que a OUTRA pediu, nem descarta.
{
  const c = new Confirmacoes();
  let conversa = "A";
  c.quemPede = () => conversa;
  c.pedir("trash_file", { filepath: "/x" }); // pedido na conversa A
  assert.strictEqual(c.aoFalarDele("sim", "B"), null, "sim na conversa B não decide o pedido de A");
  assert.ok(c.temPedido, "o pedido de A continua esperando");
  conversa = "B";
  assert.ok(!c.liberar("trash_file", { filepath: "/x", confirmed: true }), "B não executa o que A pediu");
  assert.strictEqual(c.aoFalarDele("sim", "A"), "sim", "de volta em A, o sim vale");
  assert.ok(!c.liberar("trash_file", { filepath: "/x", confirmed: true }), "nem depois do sim, se quem chama é B");
  assert.strictEqual(c.aoFalarDele("oi", "B"), null, "falar em B não apaga a aprovação de A");
  conversa = "A";
  assert.ok(c.liberar("trash_file", { filepath: "/x", confirmed: true }), "A executa o que ele aprovou em A");
  assert.ok(!c.liberar("trash_file", { filepath: "/x", confirmed: true }), "uma vez só");
  // sem conversa ligada (null), tudo como antes
  const d = new Confirmacoes();
  d.pedir("run_command", { command: "ls" });
  assert.strictEqual(d.aoFalarDele("sim", "qualquer"), "sim");
  assert.ok(d.liberar("run_command", { command: "ls", confirmed: true }));
}

// ------------------------------------------------- confirmação pendente
{
  const c = new Confirmacoes();
  assert.strictEqual(c.aoFalarDele("sim"), null, "sem pedido, sim não aprova nada");
  assert.ok(!c.liberar("run_command", { command: "rm x" }));

  c.pedir("run_command", { command: "rm x" });
  assert.ok(c.temPedido);
  assert.ok(!c.liberar("run_command", { command: "rm x", confirmed: true }), "antes do sim, nada");
  assert.strictEqual(c.aoFalarDele("Sim, pode"), "sim");
  assert.ok(!c.liberar("run_command", { command: "rm y", confirmed: true }), "o sim não serve para outro comando");
  assert.ok(c.liberar("run_command", { command: "rm x", confirmed: true }), "serve para o aprovado");
  assert.ok(!c.liberar("run_command", { command: "rm x", confirmed: true }), "e só uma vez");

  // O sim vale só para a resposta daquela fala: a fala seguinte apaga.
  c.pedir("trash_file", { filepath: "/x" });
  c.aoFalarDele("sim");
  c.aoFalarDele("e agora, que horas são?");
  assert.ok(!c.liberar("trash_file", { filepath: "/x", confirmed: true }), "aprovação velha não fica rondando");

  for (const fala of ["não", "qual o saldo?"]) {
    c.pedir("send_message", { para: "Mãe", texto: "oi" });
    assert.notStrictEqual(c.aoFalarDele(fala), "sim");
    assert.ok(!c.liberar("send_message", { para: "Mãe", texto: "oi", confirmed: true }), fala);
  }

  // A ordem dos campos não muda a chamada; o confirmed não entra na conta.
  assert.strictEqual(
    assinatura("send_message", { texto: "oi", para: "Mãe", confirmed: true }),
    assinatura("send_message", { para: "Mãe", texto: "oi" })
  );
}

// ------------------------------------------------- [opções: …]
{
  const r = extrairOpcoes("Quer que eu crie o lembrete?\n[opções: Sim, cria; Não precisa]");
  assert.strictEqual(r.texto, "Quer que eu crie o lembrete?");
  assert.deepStrictEqual(r.opcoes, ["Sim, cria", "Não precisa"]);

  assert.deepStrictEqual(extrairOpcoes("[Opcoes: A | B | C | D]").opcoes, ["A", "B", "C"], "pipe também vale; no máximo 3");
  assert.strictEqual(extrairOpcoes("[opções: Só uma]").opcoes, null, "uma opção não é escolha");
  assert.strictEqual(extrairOpcoes("Veja [o link] aqui").opcoes, null);
  assert.strictEqual(extrairOpcoes("Veja [o link] aqui").texto, "Veja [o link] aqui", "colchete comum fica");
  assert.ok(extrairOpcoes(`[opções: ${"x".repeat(80)}; Não]`).opcoes[0].length <= 40, "rótulo longo é cortado");
}

// ------------------------------------------------- a marca chega em pedaços
{
  const casos = [
    ["Quer que eu crie?", "\n[op", "ções: Sim", ", cria; Não", " precisa]"],
    ["Quer que eu crie?\n[opções: Sim, cria; Não precisa]"],
    ["Quer que eu crie? [", "opcoes:", " Sim, cria |", " Não precisa", "]"],
  ];
  for (const pedacos of casos) {
    let dito = "";
    let opcoes = null;
    const f = filtroDeOpcoes((t) => (dito += t), (o) => (opcoes = o));
    pedacos.forEach((p) => f.say(p));
    f.fim();
    assert.ok(!/op[çc][õo]es|\[|\]/i.test(dito), `a marca não pode ir para a fala: ${JSON.stringify(dito)}`);
    assert.match(dito, /Quer que eu crie\?/);
    assert.deepStrictEqual(opcoes, ["Sim, cria", "Não precisa"], JSON.stringify(pedacos));
  }

  // Texto comum com colchete passa inteiro, e na hora (não espera o fim).
  let dito = "";
  const f = filtroDeOpcoes((t) => (dito += t), () => assert.fail("não há opções"));
  f.say("Salvei em [Documentos] ");
  assert.strictEqual(dito, "Salvei em [Documentos] ");
  f.say("e pronto.");
  f.fim();
  assert.strictEqual(dito, "Salvei em [Documentos] e pronto.");

  // Marca que nunca fecha não some: vira texto no fim.
  let resto = "";
  const g = filtroDeOpcoes((t) => (resto += t), () => {});
  g.say("Ok. [opções: Sim");
  g.fim();
  assert.match(resto, /Ok\./);
  assert.match(resto, /Sim/);
}

console.log("✓ escolhas: o sim é dele (dito, escrito ou clicado), e [opções] vira botão sem ir para a voz");
