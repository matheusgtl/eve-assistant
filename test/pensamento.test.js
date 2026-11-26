// pensamento.test.js — a rede de linguagem (pensamento.js) e o diário da rede
// no Obsidian (cerebroRede.js). Sem rede, sem Electron, em pasta temporária.
//
// A regra que mais importa aqui: ela NUNCA responde sozinha a um pedido de
// ação. Responder local um "me lembra de…" seria dizer que fez o que não fez —
// o erro que o roteamento antigo cometeu em 02/11 (ver README, Provedores).
// Rode com: node test/pensamento.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Pensamento, RedeDeLinguagem, RESPOSTAS, SEMENTES, LIMIAR_INICIO, LIMIAR_AJUSTE, OCULTOS_INICIO, OCULTOS_MAX } = require("../pensamento.js");
const { CerebroRede, linhaDoEvento } = require("../cerebroRede.js");
const { Mente } = require("../iniciativa.js");

let ok = 0;
const teste = async (nome, fn) => {
  await fn();
  ok++;
  console.log("  ✓", nome);
};
const hora = (h, m = 0) => new Date(2026, 10, 26, h, m).getTime();

(async () => {
  console.log("rede de linguagem");
  const p = new Pensamento();

  await teste("treina e separa as frases de partida", () => {
    assert.ok(p.estado().acerto >= 97, `acerto ${p.estado().acerto}%`);
    assert.strictEqual(p.estado().intencoes, Object.keys(SEMENTES).length);
  });

  const LOCAIS = [
    ["oi sexta", "saudacao"], ["bom dia!", "saudacao"], ["que horas são?", "hora"], ["que dia é hoje", "data"],
    ["como tá a bateria", "bateria"], ["tudo bem?", "como_esta"], ["quais meus lembretes", "lembretes"],
    ["valeu!", "agradecimento"], ["o que você aprendeu", "rede"], ["fica muda", "silenciar"],
    ["abre junto com o mac", "login_ligar"], ["não abre mais com o mac", "login_desligar"],
    // o pedido exato de 26/11, 00:29, que o agente tentou resolver com sudo launchctl
    ["ligue a funçao nas configs para vc abrir assim que o mac é iniciado por favor", "login_ligar"],
    // 26/11/2026: o que ela passou a responder sozinha
    ["o que você consegue fazer?", "capacidades"], ["sobre o que a gente conversou", "conversas"],
    ["você ainda está trabalhando?", "trabalhando"], ["já terminou?", "trabalhando"],
  ];
  for (const [frase, intencao] of LOCAIS) {
    await teste(`"${frase}" ela responde sozinha (${intencao})`, () => {
      const d = new Pensamento().avaliar(frase);
      assert.strictEqual(d.acao, "local", JSON.stringify(d));
      assert.strictEqual(d.intencao, intencao);
    });
  }

  await teste("o que ela sabe responder sobre as conversas vem dos dados de verdade", async () => {
    const lista = [
      { titulo: "Notícias de hoje", mensagens: 2, ocupada: true, atual: false },
      { titulo: "Python básico", mensagens: 6, ocupada: false, atual: true },
      { titulo: "Nova conversa", mensagens: 0, ocupada: false, atual: false },
    ];
    const c = { conversas: () => lista, agora: hora(18) };
    assert.match(await RESPOSTAS.trabalhando(c), /“Notícias de hoje”/);
    assert.doesNotMatch(await RESPOSTAS.trabalhando(c), /Python/, "a da tela não é 'outra conversa'");
    assert.match(await RESPOSTAS.trabalhando({ conversas: () => lista.map((x) => ({ ...x, ocupada: false })) }), /nenhuma outra/);
    const r = await RESPOSTAS.conversas(c);
    assert.match(r, /Notícias de hoje.*ainda trabalhando/);
    assert.doesNotMatch(r, /Nova conversa/, "conversa vazia não conta");
    assert.strictEqual(await RESPOSTAS.conversas({}), null, "sem dado, vai para os agentes");
  });

  await teste("quem tinha o limiar antigo (75%) desce para o novo; correção dele continua valendo", () => {
    const salvo = new Pensamento().salvar();
    salvo.limiares = { ...salvo.limiares, hora: 0.75, data: 0.83, login_ligar: 0.85 };
    const pe = new Pensamento(salvo);
    assert.strictEqual(pe.limiares.hora, LIMIAR_INICIO);
    assert.strictEqual(pe.limiares.data, 0.83, "o que subiu por correção não desce");
    assert.strictEqual(pe.limiares.login_ligar, LIMIAR_AJUSTE, "ajuste continua em 85%");
  });

  // Pedidos de AÇÃO e perguntas que só parecem dela: sempre para os agentes.
  const DOS_AGENTES = [
    "me lembra de comprar leite amanhã", "cria um lembrete pra amanhã às 9", "me lembra de tomar remédio às 22h",
    "manda oi pro joão", "manda uma mensagem pra minha mãe", "abre o spotify", "oi, abre o spotify",
    "apaga esse arquivo", "pesquisa o preço do ps5", "quanto é 20% de 300", "registra 30 reais de uber",
    "marca reunião amanhã às 10", "que horas são em tóquio", "bateria de carro boa",
    "quanto de bateria tem o iphone 15", "como está o mac do joão", "cancela o lembrete do pão",
    "desliga o computador", "escreve um email pro chefe dizendo que vou atrasar", "qual o horário do jogo do flamengo",
    // ajuste dela só com TODAS as palavras conhecidas: na dúvida, agente
    "abre o mac", "abre o finder junto com o mac", "fica muda e abre o spotify",
  ];
  for (const frase of DOS_AGENTES) {
    await teste(`"${frase}" vai para os agentes`, () => {
      const d = new Pensamento().avaliar(frase);
      assert.strictEqual(d.acao, "agente", `respondeu sozinha (${d.intencao} ${d.confianca})`);
    });
  }

  await teste("esperando um sim/não ou com anexo, nada é local", () => {
    assert.strictEqual(new Pensamento().avaliar("oi", { bloqueado: true }).acao, "agente");
  });

  await teste("frase longa vai para os agentes", () => {
    const d = new Pensamento().avaliar("que horas são agora e me diz também se vai chover amanhã de manhã porque vou sair cedo");
    assert.strictEqual(d.acao, "agente");
  });

  console.log("respostas (dados de verdade)");
  const ctx = {
    dono: "Matheus",
    rede: () => ({ humor: "concentrada", neuronios: 346, assembleias: [{}, {}], sentidos: [{ nome: "TRABALHO", nivel: 1 }], aprendizados: [["TRABALHO", "PAUSA", 0.05]] }),
    sistema: async () => ({ cpu: 12, memoria: { porcento: 61, usadaGB: 9.8, totalGB: 16 }, disco: { livreGB: 120 }, bateria: { porcento: 80 } }),
    bateria: async () => ({ porcento: 42, estado: "bateria", restante: "3:10" }),
    lembretes: () => [{ texto: "comprar pão", quando: "amanhã às 9h" }],
    agenda: async () => ({ total: 1, eventos: [{ titulo: "Dentista", inicio: "2026-11-26T15:30:00" }] }),
    mudo: (v) => (ctx.mudoFoi = v),
  };
  await teste("hora, data e saudação pelo relógio", async () => {
    assert.strictEqual(await RESPOSTAS.hora({ ...ctx, agora: hora(9, 5) }), "São 9h05.");
    assert.strictEqual(await RESPOSTAS.data({ ...ctx, agora: hora(9) }), "Hoje é quinta-feira, 26 de novembro de 2026.");
    assert.match(await RESPOSTAS.saudacao({ ...ctx, agora: hora(20) }), /^Boa noite, Matheus!/);
  });
  await teste("bateria, sistema, lembretes e agenda leem o dado", async () => {
    assert.strictEqual(await RESPOSTAS.bateria({ ...ctx }), "A bateria está em 42%, fora da tomada, com 3:10 restantes.");
    assert.match(await RESPOSTAS.sistema({ ...ctx }), /CPU em 12%.*61%.*120 GB livres.*tranquilo/);
    assert.strictEqual(await RESPOSTAS.lembretes({ ...ctx }), "Você tem um lembrete: comprar pão (amanhã às 9h).");
    assert.match(await RESPOSTAS.agenda({ ...ctx, agora: hora(9) }), /Dentista \(hoje, 15h30\)/);
    assert.strictEqual(await RESPOSTAS.lembretes({ ...ctx, lembretes: () => [] }), "Você não tem lembretes pendentes.");
  });
  await teste("sem dado ela não inventa: devolve null e o agente assume", async () => {
    assert.strictEqual(await RESPOSTAS.agenda({ ...ctx, agenda: async () => ({ error: "sem permissão" }) }), null);
    assert.strictEqual(await RESPOSTAS.sistema({ ...ctx, sistema: async () => null }), null);
    const pe = new Pensamento();
    const d = pe.avaliar("minha agenda");
    const r = await pe.responder({ ...d, acao: "local", intencao: "agenda" }, "minha agenda", { ...ctx, agenda: async () => ({ error: "x" }) });
    assert.strictEqual(r, null);
  });
  await teste("como ela está vem da rede pulsada", async () => {
    assert.match(await RESPOSTAS.como_esta({ ...ctx }), /concentrada.*346 neurônios.*2 que nasceram/);
    assert.match(await RESPOSTAS.rede({ ...ctx }), /trabalho me faz querer pausa/);
  });
  await teste("abrir junto com o Mac liga e desliga a opção do app", async () => {
    const chamado = [];
    const c2 = { ...ctx, abrirNoLogin: (v) => chamado.push(v) };
    assert.match(await RESPOSTAS.login_ligar(c2), /liguei "Abrir junto com o Mac"/);
    assert.match(await RESPOSTAS.login_desligar(c2), /Desliguei/);
    assert.deepStrictEqual(chamado, [true, false]);
    assert.strictEqual(await RESPOSTAS.login_ligar({ ...ctx }), null, "sem a função do app, não finge que ligou");
  });
  await teste("ajustes dela nunca ficam tão confiantes quanto ler a hora", async () => {
    const pe = new Pensamento();
    assert.strictEqual(pe.limiares.login_ligar, LIMIAR_AJUSTE);
    for (let i = 0; i < 40; i++) {
      const d = pe.avaliar("abre junto com o mac", {}, hora(10, i));
      if (d.acao === "local") await pe.responder(d, "abre junto com o mac", { ...ctx, abrirNoLogin: () => {} }, hora(10, i));
    }
    pe.avaliar("ok", {}, hora(11));
    assert.strictEqual(pe.limiares.login_ligar, LIMIAR_AJUSTE, "acertos não descem o limiar de um ajuste abaixo de 85%");
    const salvo = new Pensamento({ ...pe.salvar(), limiares: { login_ligar: 0.6 } });
    assert.strictEqual(salvo.limiares.login_ligar, LIMIAR_AJUSTE, "nem pelo arquivo");
  });
  await teste("silenciar e voz mexem no mudo de verdade", async () => {
    await RESPOSTAS.silenciar(ctx);
    assert.strictEqual(ctx.mudoFoi, true);
    await RESPOSTAS.voz(ctx);
    assert.strictEqual(ctx.mudoFoi, false);
  });

  console.log("aprendendo");
  await teste("correção: a pergunta volta para os agentes, o limiar sobe e a frase vira 'outro'", async () => {
    const pe = new Pensamento();
    const d = pe.avaliar("como tá a bateria", {}, hora(10));
    assert.strictEqual(d.acao, "local");
    await pe.responder(d, "como tá a bateria", ctx, hora(10));
    const c = pe.avaliar("não era isso", {}, hora(10, 1));
    assert.strictEqual(c.acao, "agente");
    assert.strictEqual(c.pergunta, "como tá a bateria");
    assert.ok(pe.limiares.bateria > LIMIAR_INICIO);
    assert.strictEqual(pe.estatisticas.corrigidas, 1);
    assert.strictEqual(pe.avaliar("como tá a bateria", {}, hora(10, 2)).acao, "agente", "aprendeu que essa frase não é dela");
  });
  await teste("acerto sem correção desce o limiar daquela intenção", async () => {
    const pe = new Pensamento();
    const d = pe.avaliar("que horas são", {}, hora(10));
    await pe.responder(d, "que horas são", ctx, hora(10));
    pe.avaliar("valeu", {}, hora(10, 1));
    assert.ok(pe.limiares.hora < LIMIAR_INICIO);
  });
  await teste("aprende com o agente: system_status ensina 'sistema'", () => {
    const pe = new Pensamento();
    const frase = "o processador ta sofrendo";
    assert.strictEqual(pe.avaliar(frase).acao, "agente");
    assert.strictEqual(pe.aposAgente(frase, ["system_status"]), "sistema");
    for (let i = 0; i < 3; i++) pe.aposAgente(frase + " " + ["agora", "hoje", "muito"][i], ["system_status"]);
    const d = pe.avaliar(frase);
    assert.strictEqual(d.intencao, "sistema", JSON.stringify(d));
    assert.strictEqual(pe.estatisticas.aprendidasComAgente >= 1, true);
  });
  await teste("aprende o que não é dela: ia responder e o agente precisou de outra ferramenta", () => {
    const pe = new Pensamento();
    pe.avaliar("como tá a bateria do fone");
    pe.ultimaPrevisao = { texto: "como tá a bateria do fone", intencao: "bateria", confianca: 0.8 };
    assert.strictEqual(pe.aposAgente("como tá a bateria do fone", ["run_command"]), "outro");
  });
  await teste("ferramenta de ação nunca vira intenção local", () => {
    const pe = new Pensamento();
    for (const f of ["create_reminder", "send_message", "trash_file", "web_search", "run_command"]) {
      pe.avaliar("faz isso");
      assert.notStrictEqual(pe.aposAgente("faz isso pra mim " + f, [f]), "lembretes");
    }
  });
  await teste("salvar e carregar mantém o que aprendeu; arquivo podre é ignorado", () => {
    const pe = new Pensamento();
    pe.aposAgente("o processador ta sofrendo", ["system_status"]);
    pe.limiares.hora = 0.62;
    const dados = JSON.parse(JSON.stringify(pe.salvar()));
    const outra = new Pensamento(dados);
    assert.strictEqual(outra.aprendidos.length, pe.aprendidos.length);
    assert.strictEqual(outra.limiares.hora, 0.62);
    for (const podre of [null, { versao: 99, exemplos: [["x", "hora"]] }, { versao: 1, exemplos: "x", limiares: { hora: "a" } }]) {
      const n = new Pensamento(podre);
      assert.strictEqual(n.limiares.hora, LIMIAR_INICIO);
    }
    const intrusa = new Pensamento({ versao: 1, exemplos: [["apaga tudo", "intencao_inventada"]] });
    assert.strictEqual(intrusa.aprendidos.length, 0, "intenção que não existe no código não entra");
  });
  await teste("a rede de linguagem cresce quando não consegue separar os exemplos, até o teto", () => {
    // Com 24 ocultos e 2048 traços ela decora até rótulos sorteados: crescer
    // só acontece quando os exemplos não cabem. Aqui não cabem de propósito —
    // pares com os mesmos traços (só muda a pontuação) e rótulos diferentes.
    const eventos = [];
    const palavras = "azul verde roxo pedra rio mar sol lua vento fogo terra ceu nuvem chuva neve gelo".split(" ");
    const exemplos = [];
    for (let i = 0; i < 30; i++) {
      const t = `${palavras[i % 16]} ${palavras[(i * 7 + 3) % 16]} ${i}`;
      exemplos.push([t, "hora", "teste"], [t + "!", "data", "teste"]);
    }
    const pe = new Pensamento({ versao: 1, exemplos }, { aoEvento: (e) => eventos.push(e) });
    assert.ok(pe.rede.H > OCULTOS_INICIO, `não cresceu: ${pe.rede.H}`);
    assert.strictEqual(pe.rede.H, OCULTOS_MAX, "o que não cabe nunca cabe: para no teto");
    assert.ok(eventos.some((e) => e.tipo === "linguagem-cresceu"));
  });
  await teste("crescer neurônios ocultos não apaga o que ela já sabia", () => {
    const r = new RedeDeLinguagem({ intencoes: ["a", "b"] });
    const ex = [["oi oi", "a"], ["tchau tchau", "b"], ["ola", "a"], ["adeus", "b"]];
    r.treinar(ex, { epocas: 40 });
    const antes = r.prever("oi oi").intencao;
    r.crescerOcultos(8);
    assert.strictEqual(r.prever("oi oi").intencao, antes);
  });

  console.log("cérebro no Obsidian");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rede-cerebro-"));
  try {
    const c = new CerebroRede({ pasta: tmp, nome: "Sexta-Feira" });
    await teste("diário do dia recebe cada evento, em ordem", async () => {
      c.registrar({ tipo: "despertar", descricao: "LIF 334 neurônios", em: hora(9) });
      c.registrar({ tipo: "iniciativa", motor: "PAUSA", texto: "Pausa?", canais: { TRABALHO: 1 }, em: hora(11) });
      c.registrar({ tipo: "resposta", motor: "PAUSA", recompensa: 1, texto: "valeu", em: hora(11, 1) });
      c.registrar({ tipo: "pensou", intencao: "hora", confianca: 0.97, pergunta: "que horas são", em: hora(11, 2) });
      await c.registrar({ tipo: "cresceu", assembleia: { canal: "TRABALHO", motor: "PAUSA", sinal: 1, nasceuEm: hora(11, 3) }, antes: 334, neuronios: 340, em: hora(11, 3) });
      const dia = fs.readFileSync(path.join(tmp, "rede", "dias", "2026-11-26.md"), "utf8");
      assert.match(dia, /quando: nunca/);
      assert.match(dia, /\[\[REDE\]\]/);
      const ordem = ["acordou", "falou por conta própria", "você respondeu", "respondeu sozinha", "a rede cresceu"].map((t) => dia.indexOf(t));
      assert.ok(ordem.every((v, i) => v > 0 && (i === 0 || v > ordem[i - 1])), dia);
      assert.match(dia, /\[\[trabalho-pausa\]\]/);
    });
    await teste("cada assembleia ganha uma nota, escrita uma vez só", async () => {
      const nota = path.join(tmp, "rede", "assembleias", "trabalho-pausa.md");
      assert.match(fs.readFileSync(nota, "utf8"), /# Assembleia trabalho → sugerir pausa/);
      fs.appendFileSync(nota, "\nnota minha\n");
      await c.registrar({ tipo: "cresceu", assembleia: { canal: "TRABALHO", motor: "PAUSA", sinal: 1 }, antes: 340, neuronios: 340, em: hora(12) });
      assert.match(fs.readFileSync(nota, "utf8"), /nota minha/, "não pode sobrescrever o que você escreveu");
    });
    await teste("REDE.md e linguagem.md são gerados a partir do estado real", async () => {
      const m = new Mente();
      const pe = new Pensamento();
      await c.atualizarIndice(m.estado(), pe.estado(), pe.nota());
      const rede = fs.readFileSync(path.join(tmp, "rede", "REDE.md"), "utf8");
      assert.match(rede, /# A rede neural da Sexta-Feira/);
      assert.match(rede, /\[\[linguagem\]\]/);
      const ling = fs.readFileSync(path.join(tmp, "rede", "linguagem.md"), "utf8");
      assert.ok(ling.includes(`| hora | ${Math.round(LIMIAR_INICIO * 100)}% |`), "a nota mostra o limiar de partida de verdade");
    });
    await teste("a pasta rede/ fica fora do índice da memória", async () => {
      const { Memoria } = require("../memoria.js");
      fs.mkdirSync(path.join(tmp, "fatos"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "fatos", "x.md"), "# Um fato\n");
      const itens = await new Memoria({ pasta: tmp }).indice();
      assert.ok(itens.some((i) => i.nome.includes("x")));
      assert.ok(!itens.some((i) => i.nome.startsWith("rede")), JSON.stringify(itens));
    });
    await teste("evento desconhecido não escreve nada", () => {
      assert.strictEqual(linhaDoEvento({ tipo: "qualquer", em: hora(9) }), null);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\npensamento: ${ok} verificações passaram`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
