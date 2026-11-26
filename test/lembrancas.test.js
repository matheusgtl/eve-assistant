// O que ela aprende com os agentes e passa a responder sozinha (lembrancas.js),
// e a ligação com a rede de linguagem (pensamento.js). Sem rede, sem app.
// Rode com: node test/lembrancas.test.js
const assert = require("node:assert");
const { Lembrancas, porQueNaoGuardar, tipoDe } = require("../lembrancas.js");
const { Pensamento, LEMBRANCA } = require("../pensamento.js");

const EXPLICACAO =
  "Uma rede neural é um modelo feito de camadas de neurônios artificiais. Cada neurônio soma as entradas com pesos, " +
  "aplica uma função de ativação e passa o resultado adiante; no treino, os pesos são ajustados para errar menos.";

let ok = 0;
const teste = async (nome, fn) => {
  await fn();
  ok++;
  console.log("  ✓", nome);
};

(async () => {
  console.log("lembranças");

  await teste("conhecimento sem ferramenta vira lembrança, e a mesma pergunta volta dela", () => {
    const l = new Lembrancas();
    assert.ok(l.aprender("Sexta-feira, me explique sobre redes neurais em IA", EXPLICACAO));
    for (const parecida of ["me explica redes neurais em IA", "explique sobre redes neurais em ia por favor", "Redes neurais em IA?"]) {
      const r = l.lembrar(parecida);
      assert.ok(r, `devia lembrar: ${parecida}`);
      assert.strictEqual(r.resposta, EXPLICACAO);
    }
  });

  await teste("pergunta parecida mas diferente não pega a resposta errada", () => {
    const l = new Lembrancas();
    l.aprender("o que é uma rede neural", EXPLICACAO);
    for (const outra of [
      "por que a rede neural funciona", // outro tipo de pergunta
      "o que é uma rede elétrica", // outro assunto
      "o que é uma rede neural convolucional", // mais específica
      "como treinar uma rede neural",
    ]) {
      assert.strictEqual(l.lembrar(outra), null, `não devia lembrar: ${outra}`);
    }
    assert.notStrictEqual(tipoDe("por que o ceu e azul"), tipoDe("o que e o ceu"));
  });

  await teste("o que NUNCA vira lembrança", () => {
    const l = new Lembrancas();
    const resposta = EXPLICACAO;
    const casos = [
      ["quais as notícias de hoje", resposta, "envelhece"],
      ["qual o preço do dólar", resposta, "envelhece"],
      ["vai chover amanhã", resposta, "envelhece"],
      ["e isso funciona como?", resposta, "conversa"],
      ["continua", resposta, "conversa"],
      ["qual o meu saldo", resposta, "dele"],
      ["o que tem na minha agenda", resposta, "dele"],
      ["abre o spotify", resposta, "pedido"],
      ["escreve um poema sobre o mar", resposta, "pedido"],
      ["cria um lembrete para amanhã", resposta, "pedido"],
      ["o que é fotossíntese", "Anotei no seu cérebro: fotossíntese é como as plantas fazem açúcar com luz do sol.", "ação"],
      ["o que é fotossíntese", "Não consegui encontrar uma explicação boa sobre fotossíntese agora, desculpe.", "fraca"],
      ["o que é fotossíntese", "Você quer a explicação para criança ou a versão técnica, com as fases da fotossíntese?", "pergunta de volta"],
      ["o que é fotossíntese", "É a luz.", "curta"],
    ];
    for (const [p, r, porque] of casos) {
      assert.ok(porQueNaoGuardar(p, r), `devia recusar (${porque}): ${p}`);
      assert.strictEqual(l.aprender(p, r), false);
    }
    assert.strictEqual(l.aprender("o que é fotossíntese", resposta, { ferramentas: ["web_search"] }), false, "com ferramenta, nunca");
    assert.strictEqual(l.aprender("o que é fotossíntese", resposta, { escolhas: true }), false, "com botões esperando, nunca");
    assert.strictEqual(l.aprender("o que é fotossíntese", resposta, { corrigida: true }), false);
    assert.strictEqual(l.tamanho, 0);
  });

  await teste("a resposta nova substitui a velha; esquecer tira; salvar e carregar mantém", () => {
    let agora = Date.parse("2026-11-26T19:00:00Z");
    const l = new Lembrancas(null, { agora: () => agora });
    l.aprender("o que é uma rede neural", EXPLICACAO);
    l.aprender("o que é uma rede neural?", EXPLICACAO + " Nova versão da explicação.");
    assert.strictEqual(l.tamanho, 1);
    assert.match(l.lembrar("o que é uma rede neural").resposta, /Nova versão/);
    const salvo = JSON.parse(JSON.stringify(l.salvar()));
    const outra = new Lembrancas(salvo, { agora: () => agora });
    assert.strictEqual(outra.tamanho, 1);
    assert.ok(outra.esquecer("o que é uma rede neural"));
    assert.strictEqual(outra.lembrar("o que é uma rede neural"), null);
    // vence depois de 60 dias
    agora += 61 * 24 * 3_600_000;
    assert.strictEqual(new Lembrancas(salvo, { agora: () => agora }).tamanho, 0, "conhecimento também envelhece");
    // arquivo podre não quebra nada
    for (const podre of [null, "x", { versao: 9, itens: [] }, { versao: 1, itens: [{ pergunta: 1 }] }]) {
      assert.strictEqual(new Lembrancas(podre).tamanho, 0);
    }
  });

  console.log("pensamento com lembranças");

  await teste("o agente responde uma vez; na segunda ela responde sozinha", async () => {
    const pe = new Pensamento();
    const pergunta = "me explique sobre redes neurais em IA";
    const d1 = pe.avaliar(pergunta);
    assert.strictEqual(d1.acao, "agente", "na primeira vez é do agente");
    assert.strictEqual(pe.aposAgente(pergunta, [], Date.now(), { resposta: EXPLICACAO }), LEMBRANCA);
    const d2 = pe.avaliar("explica redes neurais em IA");
    assert.strictEqual(d2.acao, "local", JSON.stringify(d2));
    assert.strictEqual(d2.intencao, LEMBRANCA);
    assert.strictEqual(await pe.responder(d2, "explica redes neurais em IA", {}), EXPLICACAO);
    assert.strictEqual(pe.estado().lembradas, 1);
    // e sobrevive ao reinício
    const depois = new Pensamento(JSON.parse(JSON.stringify(pe.salvar())));
    assert.strictEqual(depois.avaliar(pergunta).intencao, LEMBRANCA);
  });

  await teste("'não era isso' depois de uma lembrança: ela esquece e o agente responde", async () => {
    const pe = new Pensamento();
    const pergunta = "o que é uma rede neural";
    pe.aposAgente(pergunta, [], Date.now(), { resposta: EXPLICACAO });
    const d = pe.avaliar(pergunta, {}, 1000);
    await pe.responder(d, pergunta, {}, 1000);
    const c = pe.avaliar("não era isso", {}, 2000);
    assert.strictEqual(c.acao, "agente");
    assert.strictEqual(c.pergunta, pergunta, "a pergunta original vai para o agente");
    assert.strictEqual(pe.avaliar(pergunta, {}, 3000).acao, "agente", "a lembrança errada saiu");
  });

  await teste("lembrança nunca passa por cima de uma pergunta de dado nem de um sim pendente", () => {
    const pe = new Pensamento();
    // uma resposta de agente com cara de dado não pode virar lembrança
    pe.avaliar("como está a bateria");
    assert.notStrictEqual(pe.aposAgente("como está a bateria", [], Date.now(), { resposta: "A bateria está em 40%, carregando, sem pressa nenhuma por enquanto." }), LEMBRANCA);
    pe.aposAgente("o que é uma rede neural", [], Date.now(), { resposta: EXPLICACAO });
    assert.strictEqual(pe.avaliar("o que é uma rede neural", { bloqueado: true }).acao, "agente", "esperando um sim, é do agente");
    // com ferramenta, aprende a intenção como antes, não a resposta
    assert.strictEqual(pe.aposAgente("quais meus lembretes de amanhã", ["list_reminders"], Date.now(), { resposta: EXPLICACAO }), "lembretes");
  });

  console.log(`\nlembranças: ${ok} verificações passaram`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
