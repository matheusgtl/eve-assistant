// mente.test.js — a rede neural (rede.js), os sentidos (sentidos.js) e as
// travas da iniciativa (iniciativa.js). Sem Electron, sem rede, relógio falso.
// A rede tem ruído: os cenários comparam médias com folga, não valores exatos.
// Rode com: node test/mente.test.js

const assert = require("node:assert");
const { Rede, DECISOES, SENSORIAL, CONEXOES, INTER, MOTORES, APRENDE_MAX, APRENDE_MIN } = require("../rede.js");
const { Sentidos, categoria, madrugada } = require("../sentidos.js");
const { Mente, Iniciativa, frase, DISPENSA, AGRADECE, MAX_POR_DIA } = require("../iniciativa.js");

let ok = 0;
const teste = (nome, fn) => {
  fn();
  ok++;
  console.log("  ✓", nome);
};

const hora = (h, m = 0) => new Date(2026, 10, 26, h, m).getTime();

// ------------------------------------------------------------------ rede
console.log("rede");

teste("toda conexão liga populações que existem", () => {
  const nomes = new Set([...Object.keys(SENSORIAL), ...INTER.map((i) => i[0]), ...MOTORES.map((m) => m[0])]);
  for (const [pre, pos] of CONEXOES) {
    assert.ok(nomes.has(pre), `pré desconhecido: ${pre}`);
    assert.ok(nomes.has(pos), `pós desconhecido: ${pos}`);
  }
  const r = new Rede();
  assert.ok(r.N > 300 && r.nSinapses > 5000, r.descrever());
});

teste("a estrutura é a mesma toda vez (semente)", () => {
  const a = new Rede();
  const b = new Rede();
  assert.strictEqual(a.nSinapses, b.nSinapses);
  assert.deepStrictEqual(Array.from(a.Wbase.subarray(0, 500)), Array.from(b.Wbase.subarray(0, 500)));
});

function media(estimulo, segundos = 14) {
  const r = new Rede();
  r.estimular({});
  r.passo(1000);
  r.estimular(estimulo);
  const soma = {};
  const n = segundos * 2;
  for (let i = 0; i < n; i++) {
    r.passo(500);
    if (i < n / 2) continue;
    for (const [m, hz] of Object.entries(r.motores())) soma[m] = (soma[m] || 0) + hz / (n / 2);
  }
  return soma;
}
const decisaoMaisForte = (m) => [...DECISOES].sort((a, b) => m[b] - m[a])[0];

// Cada cenário: o que deve vencer entre as iniciativas, e acima do limiar.
const CENARIOS = [
  ["trabalho longo", { TRABALHO: 1, ATIVIDADE: 0.8, CANSACO: 1 }, "PAUSA"],
  ["madrugada acordado", { WEB: 1, ATIVIDADE: 0.8, MADRUGADA: 1 }, "DORMIR"],
  ["de volta", { VOLTA: 1, ATIVIDADE: 0.6 }, "SAUDAR"],
  ["primeiro uso do dia", { MANHA: 1, ATIVIDADE: 0.6 }, "SAUDAR"],
  ["bateria acabando", { BATERIA: 1, WEB: 1, ATIVIDADE: 0.6 }, "AVISAR"],
  ["dois dias sem conversar", { SAUDADE: 1, WEB: 1, ATIVIDADE: 0.5 }, "PAPO"],
];
for (const [nome, estimulo, esperado] of CENARIOS) {
  teste(`cenário "${nome}" decide ${esperado}`, () => {
    const m = media(estimulo);
    assert.strictEqual(decisaoMaisForte(m), esperado, JSON.stringify(m));
    assert.ok(m[esperado] >= 10, `${esperado} fraco demais: ${m[esperado].toFixed(1)} Hz`);
  });
}

// E onde ela tem que ficar quieta: nenhuma iniciativa chega ao limiar.
const QUIETOS = [
  ["repouso", {}],
  ["só trabalhando", { TRABALHO: 1, ATIVIDADE: 0.8 }],
  ["cansado, mas longe", { AUSENCIA: 1, CANSACO: 1 }],
  ["cansado, mas conversando com ela", { CONVERSA: 1, CANSACO: 1, ATIVIDADE: 0.8 }],
  ["com saudade, mas trabalhando", { SAUDADE: 1, TRABALHO: 1, ATIVIDADE: 0.8 }],
  ["jogando", { LAZER: 1, ATIVIDADE: 0.6 }],
];
for (const [nome, estimulo] of QUIETOS) {
  teste(`cenário "${nome}" não decide nada`, () => {
    const m = media(estimulo);
    for (const d of DECISOES) assert.ok(m[d] < 9, `${d} = ${m[d].toFixed(1)} Hz em "${nome}"`);
  });
}

teste("dispensar segura a vontade de pausa", () => {
  const sem = media({ TRABALHO: 1, ATIVIDADE: 0.8, CANSACO: 1 });
  const com = media({ TRABALHO: 1, ATIVIDADE: 0.8, CANSACO: 1, DISPENSA: 1 });
  assert.ok(com.PAUSA < sem.PAUSA - 2, `sem ${sem.PAUSA.toFixed(1)} com ${com.PAUSA.toFixed(1)}`);
});

teste("o humor sai dos motores de expressão", () => {
  const r = new Rede();
  r.estimular({ TRABALHO: 1, ATIVIDADE: 1 });
  for (let i = 0; i < 12; i++) r.passo(500);
  assert.strictEqual(r.humor(), "concentrada");
  assert.strictEqual(new Rede().humor(), "tranquila");
});

teste("habituação: estímulo repetido perde força e o tempo devolve", () => {
  const r = new Rede();
  r.estimular({ VOLTA: 1 });
  for (let i = 0; i < 60; i++) r.passo(1000);
  const gasta = r.eficacia().VOLTA;
  assert.ok(gasta < 0.95, `VOLTA não habituou: ${gasta}`);
  const dados = r.salvar(hora(10));
  const outra = new Rede();
  assert.ok(outra.carregar(dados, hora(10, 1)));
  // tau_rec do VOLTA é 900 s: um minuto devolve só 1 − e^(−60/900) ≈ 6% do que faltava
  const esperado = 1 - (1 - gasta) * Math.exp(-60 / 900);
  assert.ok(Math.abs(outra.eficacia().VOLTA - esperado) < 0.001, `${outra.eficacia().VOLTA} ≠ ${esperado}`);
  assert.ok(outra.eficacia().VOLTA < 0.97, "um minuto não recupera tudo");
  const depois = new Rede();
  depois.carregar(dados, hora(16));
  assert.ok(depois.eficacia().VOLTA > 0.99, "seis horas recuperam");
});

teste("aprender: reforço sobe, dispensa desce, com teto", () => {
  const r = new Rede();
  r.aprender(1, "PAUSA", { TRABALHO: 1 });
  assert.ok(r.aprendido["TRABALHO>PAUSA"] > 0);
  for (let i = 0; i < 200; i++) r.aprender(1, "PAUSA", { TRABALHO: 1 });
  assert.strictEqual(r.aprendido["TRABALHO>PAUSA"], APRENDE_MAX);
  for (let i = 0; i < 400; i++) r.aprender(-1, "PAUSA", { TRABALHO: 1 });
  assert.strictEqual(r.aprendido["TRABALHO>PAUSA"], APRENDE_MIN);
  r.aprender(1, "ATENTA", { TRABALHO: 1 }); // humor não aprende
  assert.strictEqual(r.aprendido["TRABALHO>ATENTA"], undefined);
});

teste("aprender muda a rede de verdade", () => {
  const r = new Rede();
  const antes = r.W.reduce((s, x) => s + x, 0);
  r.aprender(-1, "PAUSA", { TRABALHO: 1, CANSACO: 1 });
  assert.ok(r.W.reduce((s, x) => s + x, 0) < antes);
});

teste("salvar e carregar mantém o aprendido; dado podre não muda nada", () => {
  const r = new Rede();
  r.aprender(1, "DORMIR", { MADRUGADA: 1 });
  const dados = JSON.parse(JSON.stringify(r.salvar()));
  const nova = new Rede();
  assert.ok(nova.carregar(dados));
  assert.strictEqual(nova.aprendido["MADRUGADA>DORMIR"], r.aprendido["MADRUGADA>DORMIR"]);

  const intacta = new Rede();
  intacta.aprender(1, "PAUSA", { TRABALHO: 1 });
  const guardado = intacta.aprendido["TRABALHO>PAUSA"];
  for (const podre of [
    null, "x", { ...dados, versao: 99 }, { ...dados, semente: 1 },
    { ...dados, eficacia: { VOLTA: [2, 2, 2, 2, 2, 2] } }, { ...dados, eficacia: { VOLTA: [1] } },
    { ...dados, aprendido: { "MADRUGADA>DORMIR": "abc" } }, { ...dados, salvoEm: "ontem" },
  ]) {
    assert.strictEqual(intacta.carregar(podre), false, JSON.stringify(podre)?.slice(0, 80));
    assert.strictEqual(intacta.aprendido["TRABALHO>PAUSA"], guardado);
  }
});

teste("um segundo de rede custa pouco", () => {
  const r = new Rede();
  r.estimular({ TRABALHO: 1, ATIVIDADE: 1, CANSACO: 1 });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 10; i++) r.passo(1000);
  const msPorSegundo = Number(process.hrtime.bigint() - t0) / 1e6 / 10;
  assert.ok(msPorSegundo < 60, `${msPorSegundo.toFixed(1)} ms por segundo simulado`);
});

// ------------------------------------------------------------------ sentidos
console.log("sentidos");

teste("categoria pelo nome do app", () => {
  assert.strictEqual(categoria("Code"), "TRABALHO");
  assert.strictEqual(categoria("Google Chrome"), "WEB");
  assert.strictEqual(categoria("WhatsApp"), "SOCIAL");
  assert.strictEqual(categoria("Spotify"), "LAZER");
  assert.strictEqual(categoria("zoom.us"), "CHAMADA");
  assert.strictEqual(categoria("Sexta-Feira"), "ELA");
  assert.strictEqual(categoria("Calculadora"), null);
  assert.strictEqual(categoria(null), null);
});

teste("madrugada: 23h começa, 2h é cheia, 15h é zero", () => {
  assert.ok(madrugada(hora(23, 0)) > 0.3 && madrugada(hora(23, 0)) < 0.6);
  assert.strictEqual(madrugada(hora(2)), 1);
  assert.strictEqual(madrugada(hora(15)), 0);
});

teste("uso contínuo vira cansaço; cinco minutos parado zera", () => {
  const s = new Sentidos();
  const t0 = hora(14);
  s.ler({ idleS: 1, app: "Code" }, t0);
  assert.strictEqual(s.ler({ idleS: 1, app: "Code" }, t0 + 60 * 60_000).CANSACO, 0);
  assert.ok(s.ler({ idleS: 1, app: "Code" }, t0 + 120 * 60_000).CANSACO > 0.7);
  const c = s.ler({ idleS: 1, app: "Code" }, t0 + 150 * 60_000);
  assert.strictEqual(c.CANSACO, 1);
  assert.strictEqual(c.TRABALHO, 1);
  assert.ok(Math.abs(s.fatos.sessaoMin - 150) < 0.1);
  s.ler({ idleS: 400 }, t0 + 157 * 60_000);
  assert.strictEqual(s.ler({ idleS: 1, app: "Code" }, t0 + 158 * 60_000).CANSACO, 0);
});

teste("voltar depois de 20 min longe acende VOLTA por um minuto e meio", () => {
  const s = new Sentidos();
  const t0 = hora(10);
  s.ler({ idleS: 1 }, t0);
  s.ler({ idleS: 1800 }, t0 + 30 * 60_000);
  const c = s.ler({ idleS: 2 }, t0 + 31 * 60_000);
  assert.ok(c.VOLTA > 0.4, `VOLTA ${c.VOLTA}`);
  assert.ok(s.fatos.voltou);
  assert.strictEqual(s.ler({ idleS: 2 }, t0 + 33 * 60_000).VOLTA, 0);
});

teste("primeiro uso do dia acende MANHA (o dia vira às 5h)", () => {
  const s = new Sentidos({ ultimoDia: null });
  s.ler({ idleS: 1 }, hora(1)); // madrugada do dia 26 ainda é o dia 25
  assert.strictEqual(s.ler({ idleS: 1 }, hora(2)).MANHA, 0);
  assert.ok(s.ler({ idleS: 1 }, hora(9)).MANHA > 0.9);
  assert.strictEqual(s.ler({ idleS: 1 }, hora(9, 5)).MANHA, 0);
});

teste("bateria só conta fora da tomada e abaixo de 25%", () => {
  const s = new Sentidos();
  assert.strictEqual(s.ler({ idleS: 1, bateria: { porcento: 12, estado: "carregando" } }, hora(10)).BATERIA, 0);
  assert.strictEqual(s.ler({ idleS: 1, bateria: { porcento: 60, estado: "bateria" } }, hora(10)).BATERIA, 0);
  assert.ok(s.ler({ idleS: 1, bateria: { porcento: 12, estado: "bateria" } }, hora(10)).BATERIA > 0.8);
  assert.strictEqual(s.ler({ idleS: 1, bateria: null }, hora(10)).BATERIA, 0);
});

teste("saudade só depois de um dia sem conversa; conversar apaga", () => {
  const s = new Sentidos({ ultimaConversa: hora(10) - 48 * 3_600_000 });
  assert.strictEqual(s.ler({ idleS: 1 }, hora(10)).SAUDADE, 1);
  s.conversou(hora(10));
  const c = s.ler({ idleS: 1 }, hora(10, 1));
  assert.strictEqual(c.SAUDADE, 0);
  assert.strictEqual(c.CONVERSA, 1);
  // instalação nova: não inventa saudade
  assert.strictEqual(new Sentidos().ler({ idleS: 1 }, hora(10)).SAUDADE, 0);
});

teste("trocar muito de app acende TROCAS", () => {
  const s = new Sentidos();
  let c;
  for (let i = 0; i < 14; i++) c = s.ler({ idleS: 1, app: i % 2 ? "Code" : "Safari" }, hora(10) + i * 5000);
  assert.ok(c.TROCAS > 0.5, `TROCAS ${c.TROCAS}`);
});

// ------------------------------------------------------------------ iniciativa
console.log("iniciativa");

const fatosPausa = (extra = {}) => ({
  agora: hora(15), idleS: 2, app: "Code", categoria: "TRABALHO", sessaoMin: 130, semConversaH: 3,
  bateria: 80, naBateria: false, voltou: null, primeiroDoDia: false, ...extra,
});
const vontade = (motor, hz = 20) => ({ PAUSA: 0, DORMIR: 0, SAUDAR: 0, AVISAR: 0, PAPO: 0, [motor]: hz });

function decidir(ini, f, opcoes = {}, motor = "PAUSA", segundos = 10) {
  let d = null;
  for (let i = 0; i < segundos && !d; i++) d = ini.avaliar(vontade(motor), {}, { ...f, agora: f.agora + i * 1000 }, opcoes);
  return d;
}

teste("vontade sustentada vira mensagem com os números de verdade", () => {
  const ini = new Iniciativa();
  const d = decidir(ini, fatosPausa());
  assert.ok(d, JSON.stringify(ini.ultimaDecisao));
  assert.strictEqual(d.motor, "PAUSA");
  assert.match(d.texto, /duas horas e 10 minutos/i);
});

teste("um pico não basta", () => {
  const ini = new Iniciativa();
  assert.strictEqual(ini.avaliar(vontade("PAUSA", 40), {}, fatosPausa()), null);
});

const BLOQUEIOS = [
  ["desligada", fatosPausa(), { ligada: false }],
  ["ocupada", fatosPausa(), { ocupada: true }],
  ["chamada", fatosPausa({ categoria: "CHAMADA", app: "zoom.us" }), {}],
  ["longe", fatosPausa({ idleS: 600 }), {}],
  ["conversando", fatosPausa(), { ultimaConversa: hora(15) - 60_000 }],
  ["fato", fatosPausa({ sessaoMin: 50 }), {}],
];
for (const [motivo, f, opcoes] of BLOQUEIOS) {
  teste(`trava: ${motivo}`, () => {
    const ini = new Iniciativa();
    assert.strictEqual(decidir(ini, f, opcoes), null);
    assert.strictEqual(ini.ultimaDecisao.motivo, motivo);
  });
}

teste("trava: fatos de cada iniciativa", () => {
  const casos = [
    ["DORMIR", fatosPausa({ agora: hora(15) }), false],
    ["DORMIR", fatosPausa({ agora: hora(1, 30) }), true],
    ["AVISAR", fatosPausa({ bateria: 15, naBateria: false }), false],
    ["AVISAR", fatosPausa({ bateria: 15, naBateria: true }), true],
    ["SAUDAR", fatosPausa(), false],
    ["SAUDAR", fatosPausa({ voltou: { longeS: 3600 } }), true],
    ["PAPO", fatosPausa({ semConversaH: 5 }), false],
    ["PAPO", fatosPausa({ semConversaH: 30 }), true],
  ];
  for (const [motor, f, pode] of casos) {
    const d = decidir(new Iniciativa(), f, {}, motor);
    assert.strictEqual(!!d, pode, `${motor} ${JSON.stringify(f).slice(0, 60)}`);
  }
});

teste("intervalo geral e por tipo", () => {
  const ini = new Iniciativa();
  assert.ok(decidir(ini, fatosPausa()));
  assert.strictEqual(decidir(ini, fatosPausa({ agora: hora(15, 10), voltou: {} }), {}, "SAUDAR"), null);
  assert.strictEqual(ini.ultimaDecisao.motivo, "intervalo");
  assert.strictEqual(decidir(ini, fatosPausa({ agora: hora(15, 40) })), null);
  assert.strictEqual(ini.ultimaDecisao.motivo, "intervalo do tipo");
  assert.ok(decidir(ini, fatosPausa({ agora: hora(15, 40), voltou: {} }), {}, "SAUDAR"));
});

teste(`no máximo ${MAX_POR_DIA} por dia`, () => {
  const ini = new Iniciativa();
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const motor = ["PAUSA", "SAUDAR", "AVISAR"][i % 3];
    const f = fatosPausa({ agora: hora(8) + i * 100 * 60_000 / 1.0 / 1, voltou: {}, naBateria: true, bateria: 10 });
    f.agora = hora(6) + i * 95 * 60_000;
    if (new Date(f.agora).getDate() !== 26) break;
    if (decidir(ini, f, {}, motor)) n++;
  }
  assert.ok(n <= MAX_POR_DIA, `${n} mensagens no dia`);
  assert.ok(n >= 6, `travou demais: ${n}`);
});

teste("respostas: dispensa, agradecimento e resposta comum", () => {
  for (const t of ["para de me mandar isso", "agora não", "não precisa", "Chega"]) assert.ok(DISPENSA.test(t), t);
  for (const t of ["valeu!", "obrigado, vou sim", "boa ideia"]) assert.ok(AGRADECE.test(t), t);
  assert.ok(!DISPENSA.test("me lembra para comprar pão"), "'para' no meio da frase não é dispensa");

  const ini = new Iniciativa();
  decidir(ini, fatosPausa());
  assert.strictEqual(ini.resposta("agora não", hora(15, 2)).recompensa, -1);
  assert.strictEqual(ini.resposta("valeu", hora(15, 3)), null, "a janela fecha depois da primeira resposta");

  const ini2 = new Iniciativa();
  decidir(ini2, fatosPausa());
  assert.strictEqual(ini2.resposta("valeu", hora(15, 1)).recompensa, 1);

  const ini3 = new Iniciativa();
  decidir(ini3, fatosPausa());
  assert.strictEqual(ini3.resposta("valeu", hora(15, 30)), null, "depois de 10 min não é resposta");
  assert.strictEqual(ini3.ignorada.recompensa, -0.1);
});

teste("frases: dono, lembretes e saudação pela hora", () => {
  const f = fatosPausa({ agora: hora(9), primeiroDoDia: true });
  assert.match(frase("SAUDAR", f, { dono: "Matheus", lembretesHoje: 2 }), /^Bom dia, Matheus!.*2 lembretes/);
  assert.match(frase("SAUDAR", fatosPausa({ agora: hora(20), voltou: {} })), /^Boa noite!/);
  assert.match(frase("AVISAR", fatosPausa({ bateria: 9 })), /9%/);
  assert.match(frase("DORMIR", fatosPausa({ agora: hora(1, 5) })), /1h05/);
  for (const m of ["PAUSA", "DORMIR", "SAUDAR", "AVISAR", "PAPO"]) assert.ok(frase(m, fatosPausa()));
});

// ------------------------------------------------------------------ mente
console.log("mente (rede + sentidos + travas)");

teste("de ponta a ponta: duas horas de código viram uma sugestão de pausa", () => {
  const mente = new Mente({ sentidos: { ultimaConversa: hora(9), ultimoDia: "2026-11-26" } });
  const t0 = hora(15);
  mente.sentidos.inicioSessao = t0 - 125 * 60_000;
  let d = null;
  for (let i = 0; i < 60 && !d; i++) d = mente.tique({ idleS: 1, app: "Code" }, {}, t0 + i * 1000);
  assert.ok(d, JSON.stringify(mente.iniciativa.ultimaDecisao));
  assert.strictEqual(d.motor, "PAUSA");
  assert.match(d.texto, /duas horas/i);

  // ele dispensa: a rede aprende e o receio aparece
  const r = mente.ouviu("agora não", t0 + 90_000);
  assert.strictEqual(r.recompensa, -1);
  assert.ok(mente.rede.aprendizados().some(([c, m, p]) => m === "PAUSA" && p < 0));
  assert.ok(mente.sentidos.ler({ idleS: 1, app: "Code" }, t0 + 100_000).DISPENSA > 0.5);
});

teste("de ponta a ponta: numa chamada ela não fala", () => {
  const mente = new Mente({ sentidos: { ultimaConversa: hora(9), ultimoDia: "2026-11-26" } });
  const t0 = hora(15);
  mente.sentidos.inicioSessao = t0 - 125 * 60_000;
  for (let i = 0; i < 60; i++) assert.strictEqual(mente.tique({ idleS: 1, app: "zoom.us" }, {}, t0 + i * 1000), null);
});

teste("estado para o painel e salvar/carregar da mente inteira", () => {
  const mente = new Mente();
  mente.tique({ idleS: 1, app: "Code" }, {}, hora(10));
  const e = mente.estado();
  assert.ok(e.humor && e.descricao && Array.isArray(e.motores) && e.motores.length === MOTORES.length);
  const dados = JSON.parse(JSON.stringify(mente.salvar(hora(10))));
  const outra = new Mente(dados);
  assert.strictEqual(outra.sentidos.ultimoDia, mente.sentidos.ultimoDia);
});

teste("aprender forte faz a rede crescer, avisar o diário e manter tudo ao reabrir", () => {
  const eventos = [];
  const mente = new Mente({}, { aoEvento: (e) => eventos.push(e) });
  const antes = mente.rede.N;
  for (let i = 0; i < 5; i++) mente.aprender({ motor: "DORMIR", recompensa: -1, contexto: { MADRUGADA: 1 } }, hora(1));
  assert.strictEqual(mente.rede.N, antes + 6, "uma assembleia = seis neurônios novos");
  const a = mente.rede.assembleias[0];
  assert.deepStrictEqual([a.canal, a.motor, a.sinal], ["MADRUGADA", "DORMIR", -1], "dispensa forte nasce inibitória");
  assert.strictEqual(eventos.filter((e) => e.tipo === "cresceu").length, 1, "nasce uma vez só");
  assert.ok(mente.rede.aprendido["MADRUGADA>DORMIR"] < 0, "o aprendido sobrevive à reconstrução");
  const reaberta = new Mente(JSON.parse(JSON.stringify(mente.salvar())));
  assert.strictEqual(reaberta.rede.N, mente.rede.N);
  assert.strictEqual(reaberta.rede.topologia().versao, mente.rede.topologia().versao);
});

teste("assembleia inválida no arquivo é descartada", () => {
  const r = new Rede({ assembleias: [{ canal: "NADA", motor: "PAUSA" }, { canal: "TRABALHO", motor: "ATENTA" }, { canal: "TRABALHO", motor: "PAUSA", sinal: 1 }, { canal: "TRABALHO", motor: "PAUSA", sinal: 1 }] });
  assert.strictEqual(r.assembleias.length, 1);
});

console.log(`\nmente: ${ok} verificações passaram`);
