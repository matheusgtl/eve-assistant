// iniciativa.js — quando a rede quer falar, e as travas que decidem se pode.
//
// A rede (rede.js) diz QUANTO ela quer sugerir uma pausa, mandar dormir,
// cumprimentar, avisar da bateria ou puxar papo. Quem decide se a mensagem
// SAI é este arquivo, com regras em código (não no prompt, não na rede):
//
//   1. a vontade tem que durar — um pico não basta (como a fuga do Pestinha);
//   2. o fato tem que ser verdade — "pausa" só com 90 min de uso contínuo de
//      verdade, "dormir" só de madrugada, "bateria" só com a leitura do pmset;
//   3. respeito — nunca numa chamada, nunca com você longe, nunca enquanto
//      ela fala, ouve ou pensa, nunca logo depois de vocês conversarem;
//   4. intervalo — no mínimo 20 min entre iniciativas, um intervalo próprio
//      por tipo e no máximo 8 por dia.
//
// Depois que ela fala, a sua resposta ensina a rede: agradecer ou responder
// reforça aquele contexto; "agora não", "para de" e afins enfraquecem e dão
// receio. Ignorar pesa pouco (a notificação pode nem ter sido vista).

"use strict";

const { Rede } = require("./rede.js");
const { Sentidos } = require("./sentidos.js");

const MIN = 60_000;
// 26/11/2026, "quero que ela interaja melhor e com menos travas": as travas
// de RITMO afrouxaram (vontade, intervalos, limite do dia). As de RESPEITO e de
// VERDADE ficam como estavam: nunca em chamada, nunca com ele longe, nunca
// enquanto ela trabalha, e só o que é verdade (FATO) — essas não são travas
// de timidez, são o que faz a iniciativa não virar incômodo nem mentira.
// Antes: limiar 10 Hz, acúmulo 40, intervalo 20 min, 8 por dia, 5 min depois
// de uma conversa; PAUSA 90/90 min, DORMIR 3 h, SAUDAR 4 h, AVISAR 60 min,
// PAPO 24/24 h.
const LIMIAR_HZ = 8; // vontade mínima
const ACUMULO = 34; // Hz·s acima do limiar (~3 s a 20 Hz); um pico de 1 s a 40 Hz (32) ainda não basta
const INTERVALO_GERAL = 10 * MIN;
const MAX_POR_DIA = 14;
const DEPOIS_DE_CONVERSAR = 2 * MIN;
const JANELA_RESPOSTA = 10 * MIN;
const INTERVALO = {
  PAUSA: 60 * MIN,
  DORMIR: 90 * MIN,
  SAUDAR: 3 * 60 * MIN,
  AVISAR: 30 * MIN,
  PAPO: 8 * 60 * MIN,
};

// As condições de VERDADE de cada iniciativa (trava 2).
const FATO = {
  PAUSA: (f) => f.sessaoMin >= 75,
  DORMIR: (f) => {
    const h = new Date(f.agora).getHours();
    return (h >= 23 || h < 5) && f.idleS < 60;
  },
  SAUDAR: (f) => !!(f.voltou || f.primeiroDoDia),
  AVISAR: (f) => f.naBateria && Number.isFinite(f.bateria) && f.bateria <= 20,
  PAPO: (f) => f.semConversaH >= 8,
};

// Escolha determinística por instante (testável); varia ao longo do dia.
const escolher = (lista, agora) => lista[Math.floor(agora / 997) % lista.length];

function duracao(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} minutos`;
  const hs = h === 1 ? "uma hora" : h === 2 ? "duas horas" : `${h} horas`;
  return m >= 10 ? `${hs} e ${m} minutos` : hs;
}

function saudacao(agora) {
  const h = new Date(agora).getHours();
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}

/// O texto de cada iniciativa, com os números dos fatos — nunca da rede.
function frase(motor, f, { dono = "", lembretesHoje = 0 } = {}) {
  const voce = dono ? `, ${dono}` : "";
  const agora = f.agora;
  switch (motor) {
    case "PAUSA":
      return escolher([
        `Você está há ${duracao(f.sessaoMin)} no computador sem parar${voce}. Que tal levantar, beber uma água e voltar em cinco minutos?`,
        `Já são ${duracao(f.sessaoMin)} direto. Uma pausa curta agora rende mais do que forçar mais meia hora.`,
        `${duracao(f.sessaoMin)} seguidas na frente da tela. Alonga um pouco e descansa a vista, eu seguro as pontas.`.replace(/^./, (c) => c.toUpperCase()),
      ], agora);
    case "DORMIR": {
      const d = new Date(agora);
      const hora = `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
      return escolher([
        `Já são ${hora}${voce}. Amanhã você agradece se for dormir agora.`,
        `${hora} e você ainda acordado. O que faltar, eu te lembro amanhã. Vai descansar?`,
      ], agora);
    }
    case "SAUDAR": {
      const oi = `${saudacao(agora)}${voce}!`;
      const extra = lembretesHoje
        ? ` Você tem ${lembretesHoje === 1 ? "um lembrete" : `${lembretesHoje} lembretes`} para as próximas horas.`
        : "";
      if (f.primeiroDoDia) return `${oi} Estou aqui se precisar de alguma coisa hoje.${extra}`;
      return `${oi} Bem-vindo de volta.${extra}`;
    }
    case "AVISAR":
      return `A bateria está em ${f.bateria}% e o Mac não está na tomada. Melhor ligar o carregador.`;
    case "PAPO":
      return escolher([
        `Faz tempo que a gente não conversa${voce}. Quer que eu organize alguma coisa para você?`,
        `Sumido${voce}! Se tiver algo para eu pesquisar, lembrar ou resolver, é só chamar.`,
      ], agora);
    default:
      return null;
  }
}

// Respostas que contam como "não gostei" e "gostei".
const DISPENSA = /^(para|pare|chega|shh|xiu)\b|\b(para de|pare de|agora n[aã]o|n[aã]o precisa|me deixa|n[aã]o enche|n[aã]o quero|sem (essas )?mensage|desliga isso|depois)\b/i;
const AGRADECE = /\b(obrigad[oa]|valeu|brigad[oa]|boa ideia|verdade|vou sim|bem lembrado|tem raz[aã]o|ok|beleza|t[aá] bom)\b/i;

class Iniciativa {
  constructor(salvo = {}) {
    this.acumulo = {};
    this.ultimaPor = { ...(salvo.ultimaPor || {}) };
    this.ultima = Number(salvo.ultima) || 0;
    this.dia = salvo.dia || null;
    this.hojeN = Number(salvo.hojeN) || 0;
    this.pendente = null; // {motor, em, contexto}
    this.ultimaDecisao = null;
  }

  salvar() {
    return { ultimaPor: this.ultimaPor, ultima: this.ultima, dia: this.dia, hojeN: this.hojeN };
  }

  /// Por que ela NÃO pode falar agora (ou null se pode). Trava 3 e 4.
  bloqueio(motor, f, { ligada = true, ocupada = false } = {}, agora = f.agora) {
    if (!ligada) return "desligada";
    if (ocupada) return "ocupada";
    if (f.categoria === "CHAMADA") return "chamada";
    if (f.idleS >= 120 && motor !== "SAUDAR") return "longe";
    if (agora - (this.ultimaConversaEm || 0) < DEPOIS_DE_CONVERSAR) return "conversando";
    if (agora - this.ultima < INTERVALO_GERAL) return "intervalo";
    if (agora - (this.ultimaPor[motor] || 0) < INTERVALO[motor]) return "intervalo do tipo";
    const dia = new Date(agora).toDateString();
    if (this.dia === dia && this.hojeN >= MAX_POR_DIA) return "limite do dia";
    if (!FATO[motor](f)) return "fato";
    return null;
  }

  /// Um tique: acumula a vontade e devolve {motor, texto} quando ela fala.
  avaliar(motores, canais, f, opcoes = {}, dtS = 1) {
    const agora = f.agora;
    this.ultimaConversaEm = opcoes.ultimaConversa || 0;
    this.expirar(agora);

    let melhor = null;
    for (const motor of Object.keys(INTERVALO)) {
      const hz = motores[motor] || 0;
      const a = (this.acumulo[motor] || 0) * Math.exp(-dtS / 30) + Math.max(0, hz - LIMIAR_HZ) * dtS;
      this.acumulo[motor] = a;
      if (a >= ACUMULO && (!melhor || a > this.acumulo[melhor])) melhor = motor;
    }
    if (!melhor) return null;

    const motivo = this.bloqueio(melhor, f, opcoes, agora);
    this.ultimaDecisao = { motor: melhor, em: agora, motivo };
    if (motivo) return null;

    const texto = frase(melhor, f, opcoes);
    if (!texto) return null;
    const dia = new Date(agora).toDateString();
    if (this.dia !== dia) {
      this.dia = dia;
      this.hojeN = 0;
    }
    this.hojeN++;
    this.ultima = agora;
    this.ultimaPor[melhor] = agora;
    this.acumulo[melhor] = 0;
    this.pendente = { motor: melhor, em: agora, contexto: { ...canais } };
    return { motor: melhor, texto };
  }

  /// Sua fala depois de uma iniciativa: devolve a recompensa (ou null).
  resposta(texto, agora = Date.now()) {
    this.expirar(agora);
    if (!this.pendente) return null;
    const t = String(texto || "").trim();
    const recompensa = DISPENSA.test(t) ? -1 : AGRADECE.test(t) ? 1 : 0.3;
    const p = this.pendente;
    this.pendente = null;
    return { motor: p.motor, recompensa, contexto: p.contexto };
  }

  /// Clicou na notificação: um pouco de reforço.
  abriu(agora = Date.now()) {
    if (!this.pendente || agora - this.pendente.em > JANELA_RESPOSTA) return null;
    return { motor: this.pendente.motor, recompensa: 0.2, contexto: this.pendente.contexto };
  }

  /// Sem resposta em 10 min: leve desconto, e a janela fecha.
  expirar(agora) {
    if (this.pendente && agora - this.pendente.em > JANELA_RESPOSTA) {
      const p = this.pendente;
      this.pendente = null;
      this.ignorada = { motor: p.motor, recompensa: -0.1, contexto: p.contexto };
    }
  }
}

const ativos = (canais) =>
  Object.fromEntries(Object.entries(canais || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.round(v * 100) / 100]));

/// Junta rede, sentidos e iniciativa. Sem Electron: main.js passa as leituras.
class Mente {
  constructor(salvo = {}, { log = () => {}, aoEvento = () => {} } = {}) {
    this.log = log;
    this.aoEvento = aoEvento;
    this.rede = new Rede({ assembleias: salvo.rede?.assembleias });
    if (salvo.rede && !this.rede.carregar(salvo.rede)) log("rede: estado salvo inválido; começando do zero");
    this.sentidos = new Sentidos(salvo.sentidos || {});
    this.iniciativa = new Iniciativa(salvo.iniciativa || {});
    this.canais = {};
  }

  salvar(agora = Date.now()) {
    return {
      rede: this.rede.salvar(agora),
      sentidos: this.sentidos.salvar(),
      iniciativa: this.iniciativa.salvar(),
    };
  }

  /// Um segundo de vida. leitura: {idleS, app, bateria}. opcoes: {ligada,
  /// ocupada, dono, lembretesHoje}. Devolve {motor, texto} ou null.
  tique(leitura, opcoes = {}, agora = Date.now(), ms = 1000) {
    this.canais = this.sentidos.ler(leitura, agora);
    this.rede.estimular(this.canais);
    this.rede.passo(ms);
    const decisao = this.iniciativa.avaliar(
      this.rede.motores(),
      this.canais,
      this.sentidos.fatos,
      { ...opcoes, ultimaConversa: this.sentidos.ultimaConversa },
      ms / 1000
    );
    const ignorada = this.iniciativa.ignorada;
    if (ignorada) {
      this.iniciativa.ignorada = null;
      this.evento({ tipo: "ignorada", motor: ignorada.motor, recompensa: ignorada.recompensa }, agora);
      this.aprender(ignorada, agora);
    }
    if (decisao) this.evento({ tipo: "iniciativa", motor: decisao.motor, texto: decisao.texto, canais: ativos(this.canais) }, agora);
    return decisao;
  }

  /// Você falou com ela. Se foi resposta a uma iniciativa, a rede aprende.
  ouviu(texto, agora = Date.now()) {
    const r = this.iniciativa.resposta(texto, agora);
    this.sentidos.conversou(agora);
    if (r) {
      this.evento({ tipo: "resposta", motor: r.motor, recompensa: r.recompensa, texto: String(texto).slice(0, 160) }, agora);
      this.aprender(r, agora);
      if (r.recompensa < 0) this.sentidos.pulsar("DISPENSA", agora, 10 * MIN);
      else if (r.recompensa >= 1) this.sentidos.pulsar("AGRADECE", agora, 2 * MIN);
    }
    return r;
  }

  abriuNotificacao(agora = Date.now()) {
    const r = this.iniciativa.abriu(agora);
    if (r) {
      this.evento({ tipo: "notificacao", motor: r.motor, recompensa: r.recompensa }, agora);
      this.aprender(r, agora);
    }
    return r;
  }

  aprender({ motor, recompensa, contexto }, agora = Date.now()) {
    this.rede.aprender(recompensa, motor, contexto);
    this.log(`rede aprendeu: ${motor} ${recompensa > 0 ? "+" : ""}${recompensa}`);
    this.crescer(agora);
  }

  /// Associação forte vira neurônios novos: reconstrói a rede com as
  /// assembleias a mais e devolve o que ela já sabia (aprendido e habituação).
  crescer(agora = Date.now()) {
    const novas = this.rede.paraCrescer().map((a) => ({ ...a, nasceuEm: agora }));
    if (!novas.length) return [];
    const estado = this.rede.salvar(agora);
    const maior = new Rede({ assembleias: [...this.rede.assembleias, ...novas] });
    maior.carregar(estado, agora);
    const antes = this.rede.N;
    this.rede = maior;
    for (const a of novas) {
      this.log(`rede cresceu: assembleia ${a.canal}>${a.motor} (${a.sinal > 0 ? "excitatória" : "inibitória"})`);
      this.evento({ tipo: "cresceu", assembleia: a, neuronios: maior.N, antes }, agora);
    }
    return novas;
  }

  evento(e, agora = Date.now()) {
    try {
      this.aoEvento({ ...e, em: agora });
    } catch (err) {
      this.log("rede: evento não registrado:", err.message);
    }
  }

  /// Para o painel e o menu do ícone.
  estado() {
    const taxas = this.rede.taxas();
    const r = (n) => Math.round(n * 10) / 10;
    const grupo = (g) =>
      this.rede.pools.filter((p) => p.grupo === g).map((p) => ({ nome: p.nome, hz: r(taxas[p.nome]) }));
    return {
      humor: this.rede.humor(),
      descricao: this.rede.descrever(),
      sentidos: Object.entries(this.canais).filter(([, v]) => v > 0).map(([nome, v]) => ({ nome, nivel: r(v) })),
      inter: grupo("inter"),
      motores: grupo("motor"),
      ultimaDecisao: this.iniciativa.ultimaDecisao,
      aprendizados: this.rede.aprendizados(5),
      assembleias: this.rede.assembleias,
      neuronios: this.rede.N,
      hoje: this.iniciativa.hojeN,
    };
  }

  /// Para a esfera: a forma da rede e os disparos desde a última leitura.
  paraEsfera() {
    return { topologia: this.rede.topologia(), disparos: this.rede.lerDisparos() };
  }
}

module.exports = { Mente, Iniciativa, frase, duracao, DISPENSA, AGRADECE, INTERVALO, LIMIAR_HZ, ACUMULO, MAX_POR_DIA };
