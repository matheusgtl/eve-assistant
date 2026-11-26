// rede.js — a rede neural pulsada da Sexta-Feira.
//
// Adaptada do Pestinha (github.com/mille-okws/pestinha, core/nervous_system.py):
// a mesma MÁQUINA — neurônios de integração e disparo com vazamento (LIF),
// ruído de membrana, adaptação de limiar, inibição lateral entre motores,
// habituação dos receptores e aprendizado por recompensa de três fatores —
// com OUTRO desenho. Lá a rede decide o que um bichinho de tela sente e faz;
// aqui ela decide QUANDO a assistente deve falar com você por conta própria.
//
// Ela não pensa nem escreve: isso continua com os modelos (brains.js). A rede
// só sente o Mac e o seu ritmo (sentidos.js), e os motores de decisão viram
// iniciativa — sugerir uma pausa, mandar dormir, cumprimentar quando você
// volta — sempre passando pelas travas de iniciativa.js. Sem rede, sem
// tokens: roda inteira aqui, sem internet.
//
// Licença: o Pestinha é GPL-3.0 e este arquivo é derivado dele. Para uso
// próprio não muda nada; se o app um dia for distribuído, o código dele
// precisa ir junto sob a GPL-3.0.
//
// Interface:
//   estimular({canal: 0..1})   o que está acontecendo agora
//   passo(ms)                  avança a simulação (passos de 1 ms)
//   motores() -> {motor: Hz}   o que ela "quer" fazer
//   aprender(recompensa, motor, contexto)   você gostou (+) ou não (−)
//   salvar() / carregar(dados)              habituação e aprendizado

"use strict";

// ============================================================
// CANAIS SENSORIAIS: [neurônios, taxa máx. Hz, d, tau_rec s]
//   d       = fração da sinapse perdida a cada disparo (habituação)
//   tau_rec = tempo para recuperar (s)
// ============================================================
const SENSORIAL = {
  TRABALHO:  [6, 40, 0.00007, 1200, "programando, escrevendo, projetando"],
  LAZER:     [6, 50, 0.0001, 900, "jogo, vídeo, música"],
  SOCIAL:    [6, 50, 0.00008, 900, "conversando em chats"],
  WEB:       [6, 50, 0.00008, 900, "no navegador"],
  ATIVIDADE: [6, 60, 0.00007, 1200, "teclado e mouse em uso"],
  AUSENCIA:  [6, 40, 0, 1, "longe do computador (não habitua)"],
  VOLTA:     [6, 100, 0.0004, 900, "você voltou depois de um tempo"],
  TROCAS:    [6, 80, 0.0004, 600, "trocando muito de janela"],
  MADRUGADA: [6, 40, 0, 1, "tarde da noite (não habitua)"],
  MANHA:     [6, 80, 0, 1, "primeiro uso do dia"],
  BATERIA:   [6, 60, 0.0002, 600, "bateria baixa fora da tomada"],
  CONVERSA:  [6, 60, 0, 1, "você está falando com ela agora"],
  AGRADECE:  [6, 80, 0, 1, "você gostou do que ela disse"],
  DISPENSA:  [6, 80, 0.00005, 1800, "você pediu para ela não insistir"],
  // interocepção (necessidades de iniciativa.js/sentidos.js; não habituam)
  CANSACO:   [6, 40, 0, 1, "horas seguidas no computador"],
  SAUDADE:   [6, 40, 0, 1, "muito tempo sem vocês conversarem"],
};

// ============================================================
// INTERNEURÔNIOS: [nome, tipo, n, tau_m ms, adapt_b, adapt_tau s]
// ============================================================
const INTER = [
  ["ALERTA", "exc", 16, 20, 0.03, 1.5],
  ["FOCO", "exc", 16, 120, 0.02, 2.0],
  ["CUIDADO", "exc", 14, 300, 0.01, 3.0],
  ["CURIOSA", "exc", 12, 80, 0.02, 2.0],
  ["SAUDOSA", "exc", 12, 400, 0.01, 4.0],
  ["CALMA", "exc", 12, 300, 0.01, 3.0],
  ["RECEIO", "exc", 12, 400, 0.01, 4.0],
  ["RESPEITO", "inh", 14, 60, 0, 1.0], // não interromper: foco, conversa, ausência
  ["INIB", "inh", 20, 10, 0, 1.0],
];

// ============================================================
// MOTORES: [nome, n, tau_m ms, adapt_b, adapt_tau s]
// Expressão = humor (o que aparece no painel e no ícone);
// decisão = iniciativa (vira mensagem, depois das travas).
// ============================================================
const MOTORES = [
  ["ATENTA", 10, 25, 0.06, 1.0],
  ["CONCENTRADA", 10, 50, 0.04, 3.0],
  ["ANIMADA", 10, 50, 0.04, 3.0],
  ["SERENA", 10, 60, 0.03, 4.0],
  ["PREOCUPADA", 10, 60, 0.03, 4.0],
  ["SAUDOSA_M", 10, 80, 0.02, 5.0],
  ["PAUSA", 10, 60, 0.03, 4.0], //    sugerir uma pausa
  ["DORMIR", 10, 80, 0.02, 5.0], //   lembrar de ir dormir
  ["SAUDAR", 10, 40, 0.03, 3.0], //   cumprimentar quando você volta
  ["AVISAR", 10, 50, 0.03, 4.0], //   avisar do Mac (bateria)
  ["PAPO", 10, 80, 0.02, 5.0], //     puxar conversa depois de muito tempo
];
const DECISOES = new Set(["PAUSA", "DORMIR", "SAUDAR", "AVISAR", "PAPO"]);

const ROTULOS = {
  ATENTA: "atenta", CONCENTRADA: "concentrada", ANIMADA: "animada", SERENA: "serena",
  PREOCUPADA: "preocupada", SAUDOSA_M: "com saudade",
  PAUSA: "sugerir pausa", DORMIR: "mandar dormir", SAUDAR: "cumprimentar",
  AVISAR: "avisar do Mac", PAPO: "puxar conversa",
  ALERTA: "alerta", FOCO: "foco", CUIDADO: "cuidado", CURIOSA: "curiosidade",
  SAUDOSA: "saudade", CALMA: "calma", RECEIO: "receio", RESPEITO: "respeito", INIB: "inibição",
};

// ============================================================
// CONEXÕES: [pré, pós, peso, densidade]. Peso = salto de tensão como
// fração do limiar (1,0). Ajustadas em test/rede.test.js, que roda os
// cenários e confere quem dispara.
// ============================================================
const CONEXOES = [
  // sentidos -> interneurônios
  ["TRABALHO", "FOCO", 0.14, 0.6],
  ["ATIVIDADE", "FOCO", 0.05, 0.6],
  ["TRABALHO", "CALMA", 0.02, 0.6],
  ["LAZER", "CALMA", 0.06, 0.6],
  ["LAZER", "CURIOSA", 0.03, 0.6],
  ["WEB", "CURIOSA", 0.06, 0.6],
  ["SOCIAL", "CURIOSA", 0.04, 0.6],
  ["VOLTA", "ALERTA", 0.14, 0.6],
  ["VOLTA", "CURIOSA", 0.08, 0.6],
  ["MANHA", "ALERTA", 0.10, 0.6],
  ["MANHA", "CURIOSA", 0.06, 0.6],
  ["TROCAS", "ALERTA", 0.06, 0.6],
  ["BATERIA", "ALERTA", 0.10, 0.6],
  ["BATERIA", "CUIDADO", 0.08, 0.6],
  ["CANSACO", "CUIDADO", 0.12, 0.6],
  ["MADRUGADA", "CUIDADO", 0.10, 0.6],
  ["SAUDADE", "SAUDOSA", 0.12, 0.6],
  ["CONVERSA", "CALMA", 0.08, 0.6],
  ["CONVERSA", "RESPEITO", 0.14, 0.6],
  ["AGRADECE", "CALMA", 0.10, 0.6],
  ["DISPENSA", "RECEIO", 0.14, 0.6],
  ["AUSENCIA", "RESPEITO", 0.14, 0.6],

  // interneurônios entre si
  ["FOCO", "RESPEITO", 0.05, 0.5],
  ["RECEIO", "RESPEITO", 0.06, 0.5],
  ["CALMA", "ALERTA", -0.06, 0.5],
  ["CALMA", "SAUDOSA", -0.06, 0.5],
  ["CALMA", "CUIDADO", -0.02, 0.5],
  ["ALERTA", "INIB", 0.10, 0.5],
  ["FOCO", "INIB", 0.04, 0.5],
  ["CURIOSA", "INIB", 0.04, 0.5],
  ["CUIDADO", "INIB", 0.03, 0.5],
  ["INIB", "ALERTA", -0.04, 0.5],
  ["INIB", "CURIOSA", -0.03, 0.5],
  ["INIB", "FOCO", -0.03, 0.5],
  ["RECEIO", "CURIOSA", -0.04, 0.5],

  // interneurônios -> humor
  ["ALERTA", "ATENTA", 0.50, 0.6],
  ["FOCO", "CONCENTRADA", 0.35, 0.6],
  ["CURIOSA", "ANIMADA", 0.40, 0.6],
  ["CALMA", "SERENA", 0.50, 0.6],
  ["CUIDADO", "PREOCUPADA", 0.40, 0.6],
  ["SAUDOSA", "SAUDOSA_M", 0.40, 0.6],
  ["INIB", "ATENTA", -0.08, 0.5],
  ["INIB", "ANIMADA", -0.08, 0.5],

  // interneurônios -> decisões (iniciativa)
  ["CUIDADO", "PAUSA", 0.30, 0.6],
  ["CANSACO", "PAUSA", 0.25, 0.6], //      horas seguidas: a vontade sobe direto
  ["FOCO", "PAUSA", 0.06, 0.6], //          trabalhando há muito: pausa, não papo
  ["MADRUGADA", "PAUSA", -0.30, 0.6], //    de madrugada o assunto é outro
  ["CUIDADO", "DORMIR", 0.15, 0.6],
  ["MADRUGADA", "DORMIR", 0.40, 0.6],
  ["ATIVIDADE", "DORMIR", 0.04, 0.6], //    acordado e mexendo
  ["ALERTA", "SAUDAR", 0.25, 0.6],
  ["VOLTA", "SAUDAR", 0.35, 0.6],
  ["MANHA", "SAUDAR", 0.30, 0.6],
  ["MADRUGADA", "SAUDAR", -0.25, 0.6],
  ["BATERIA", "AVISAR", 0.55, 0.6],
  ["ALERTA", "AVISAR", 0.05, 0.6],
  ["SAUDOSA", "PAPO", 0.45, 0.6],
  ["SAUDADE", "PAPO", 0.15, 0.6],
  ["CURIOSA", "PAPO", 0.06, 0.6],
  ["FOCO", "PAPO", -0.55, 0.6], //          trabalhando: não puxa assunto
  ["CALMA", "PAPO", -0.15, 0.6],
  // respeito e receio seguram qualquer iniciativa
  ["RESPEITO", "PAUSA", -0.25, 0.6],
  ["RESPEITO", "DORMIR", -0.25, 0.6],
  ["RESPEITO", "SAUDAR", -0.15, 0.6],
  ["RESPEITO", "AVISAR", -0.10, 0.6],
  ["RESPEITO", "PAPO", -0.40, 0.6],
  ["RECEIO", "PAPO", -0.30, 0.6],
  ["RECEIO", "PAUSA", -0.35, 0.6],
  ["RECEIO", "DORMIR", -0.25, 0.6],
  // longe do computador ou conversando com ela: não é hora de puxar assunto
  ["AUSENCIA", "PAUSA", -0.45, 0.6],
  ["AUSENCIA", "DORMIR", -0.45, 0.6],
  ["AUSENCIA", "PAPO", -0.45, 0.6],
  ["AUSENCIA", "AVISAR", -0.30, 0.6],
  ["CONVERSA", "PAUSA", -0.25, 0.6],
  ["CONVERSA", "PAPO", -0.45, 0.6],
  ["CONVERSA", "DORMIR", -0.15, 0.6],
];

// Aprendizado: o que estava acontecendo quando ela tomou a iniciativa passa a
// puxar (você gostou) ou a segurar (você dispensou) AQUELE motor.
const APRENDE_MIN = -0.15;
const APRENDE_MAX = 0.08;
const DENSIDADE_PLASTICA = 0.5;
const VERSAO = 1;

const INIBICAO_LATERAL = 0.05;
const INIBICAO_ATENTA = 0.1;
const T_REF = 3; // período refratário (passos de 1 ms)
const RUIDO = 0.025;
const TAU_LEITURA = 0.5; // s: suavização da taxa
const SEMENTE = 23; // outra semente = outra "pessoa"

// CRESCIMENTO (26/11/2026). Uma associação aprendida que ficou forte ganha
// neurônios próprios: uma ASSEMBLEIA de 6 neurônios entre aquele sentido e
// aquela iniciativa — excitatória se você gostou, inibitória se dispensou.
// É o que faz a rede crescer com o uso em vez de só mexer em pesos; a
// assembleia nasce uma vez, fica salva e aparece na esfera e no Obsidian.
const LIMIAR_CRESCER = 0.04; // metade do teto do aprendizado
const MAX_ASSEMBLEIAS = 24;
const NEURONIOS_ASSEMBLEIA = 6;
const nomeAssembleia = (canal, motor) => `A:${canal}>${motor}`;

/// Semente estável a partir de um texto: a mesma assembleia nasce igual sempre.
function sementeDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Gerador com semente (mulberry32): a ESTRUTURA da rede é sempre a mesma; o
// ruído usa Math.random e muda a cada vez, como lá.
function semeado(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal padrão (Box-Muller). Guarda o segundo valor para a próxima chamada.
function normal(rand) {
  let guardado = null;
  return () => {
    if (guardado !== null) {
      const g = guardado;
      guardado = null;
      return g;
    }
    let u = 0;
    while (u === 0) u = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    const t = 2 * Math.PI * rand();
    guardado = r * Math.sin(t);
    return r * Math.cos(t);
  };
}

const limitar = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

class Rede {
  constructor({ semente = SEMENTE, aleatorio = Math.random, assembleias = [] } = {}) {
    const rng = semeado(semente);
    this.assembleias = Rede.assembleiasValidas(assembleias);
    const gauss = normal(rng);
    this.semente = semente;
    this.aleatorio = aleatorio;
    this.gaussRuido = normal(aleatorio);

    // ---------------- populações ----------------
    this.pools = [];
    this.indice = {};
    let cursor = 0;
    const add = (nome, grupo, n, tipo) => {
      this.indice[nome] = this.pools.length;
      this.pools.push({ nome, grupo, tipo, inicio: cursor, n });
      cursor += n;
    };
    for (const [nome, [n]] of Object.entries(SENSORIAL)) add(nome, "sentido", n, "sens");
    for (const [nome, tipo, n] of INTER) add(nome, "inter", n, tipo);
    for (const [nome, n] of MOTORES) add(nome, "motor", n, "exc");
    // Assembleias crescidas: sempre no FIM, para não mudar a rede de base.
    for (const a of this.assembleias) {
      add(nomeAssembleia(a.canal, a.motor), "assembleia", NEURONIOS_ASSEMBLEIA, a.sinal > 0 ? "exc" : "inh");
    }

    this.N = cursor;
    this.Ns = this.pools.filter((p) => p.grupo === "sentido").reduce((s, p) => s + p.n, 0);
    this.Nl = this.N - this.Ns;
    this.canais = Object.keys(SENSORIAL);
    this.nomesMotores = MOTORES.map((m) => m[0]);

    // ---------------- parâmetros por neurônio ----------------
    const Ns = this.Ns;
    const Nl = this.Nl;
    this.decai = new Float64Array(Nl);
    this.adaptB = new Float64Array(Nl);
    this.adaptDecai = new Float64Array(Nl);
    const porNeuronio = (nome, tau, b, bt) => {
      const p = this.pool(nome);
      for (let i = p.inicio; i < p.inicio + p.n; i++) {
        const tauVar = tau * (0.9 + 0.2 * rng()); // heterogeneidade
        this.decai[i - Ns] = Math.exp(-1 / tauVar);
        this.adaptB[i - Ns] = b;
        this.adaptDecai[i - Ns] = Math.exp(-1 / (bt * 1000));
      }
    };
    for (const [nome, , , tau, b, bt] of INTER) porNeuronio(nome, tau, b, bt);
    for (const [nome, , tau, b, bt] of MOTORES) porNeuronio(nome, tau, b, bt);
    for (const a of this.assembleias) porNeuronio(nomeAssembleia(a.canal, a.motor), 150, 0.01, 3.0);

    this.sTaxa = new Float64Array(Ns);
    this.sD = new Float64Array(Ns);
    this.sRec = new Float64Array(Ns);
    this.sTauRec = new Float64Array(Ns);
    this.sProb = new Float64Array(Ns);
    for (const [nome, [n, taxa, d, rec]] of Object.entries(SENSORIAL)) {
      const p = this.pool(nome);
      for (let i = p.inicio; i < p.inicio + n; i++) {
        this.sTaxa[i] = taxa;
        this.sD[i] = d;
        this.sTauRec[i] = rec;
        this.sRec[i] = 0.001 / rec; // dt = 1 ms
      }
    }

    // ---------------- sinapses ----------------
    // Matriz densa N × Nl (pré × pós-LIF): ~350 × 250, cabe folgado. O passo
    // só percorre as linhas de quem disparou, então o custo é baixo.
    this.Wbase = new Float64Array(this.N * Nl);
    const ligar = (pre, pos, peso, densidade) => {
      const a = this.pool(pre);
      const b = this.pool(pos);
      for (let i = 0; i < a.n; i++) {
        for (let j = 0; j < b.n; j++) {
          // sorteia sempre os dois números: a máscara não muda o resto da sequência
          const dentro = rng() < densidade;
          const forca = Math.exp(0.25 * gauss()) / Math.exp(0.25 ** 2 / 2); // lognormal, média 1
          if (dentro) this.Wbase[(a.inicio + i) * Nl + (b.inicio + j - Ns)] += peso * forca;
        }
      }
    };
    for (const [pre, pos, peso, dens] of CONEXOES) ligar(pre, pos, peso, dens);
    // Cada assembleia com seu próprio sorteio: crescer uma não mexe nas outras.
    for (const a of this.assembleias) {
      const nome = nomeAssembleia(a.canal, a.motor);
      const rngA = semeado(sementeDe(nome));
      const gaussA = normal(rngA);
      const ligarA = (pre, pos, peso) => {
        const x = this.pool(pre);
        const y = this.pool(pos);
        for (let i = 0; i < x.n; i++) {
          for (let j = 0; j < y.n; j++) {
            const dentro = rngA() < 0.6;
            const forca = Math.exp(0.25 * gaussA()) / Math.exp(0.25 ** 2 / 2);
            if (dentro) this.Wbase[(x.inicio + i) * Nl + (y.inicio + j - Ns)] += peso * forca;
          }
        }
      };
      ligarA(a.canal, nome, 0.12);
      ligarA(nome, a.motor, a.sinal > 0 ? 0.3 : -0.3);
    }
    for (const a of this.nomesMotores) {
      for (const b of this.nomesMotores) {
        // humor compete com humor, decisão com decisão
        if (a !== b && DECISOES.has(a) === DECISOES.has(b)) {
          ligar(a, b, -(a === "ATENTA" ? INIBICAO_ATENTA : INIBICAO_LATERAL), 0.7);
        }
      }
    }

    // sinapses plásticas sentido -> motor de decisão (rng próprio)
    const rngP = semeado(semente + 1);
    const gaussP = normal(rngP);
    this.decisoes = this.nomesMotores.filter((m) => DECISOES.has(m));
    this.mascaras = {};
    for (const c of this.canais) {
      const a = this.pool(c);
      for (const m of this.decisoes) {
        const b = this.pool(m);
        const mascara = new Float64Array(a.n * b.n);
        for (let k = 0; k < mascara.length; k++) {
          const dentro = rngP() < DENSIDADE_PLASTICA;
          const forca = Math.exp(0.25 * gaussP()) / Math.exp(0.25 ** 2 / 2);
          mascara[k] = dentro ? forca : 0;
        }
        this.mascaras[`${c}>${m}`] = mascara;
      }
    }
    this.aprendido = {}; // "CANAL>MOTOR" -> peso
    this.W = Float64Array.from(this.Wbase);
    this.nSinapses = 0;
    for (let k = 0; k < this.Wbase.length; k++) if (this.Wbase[k] !== 0) this.nSinapses++;

    // ---------------- estado ----------------
    this.v = new Float64Array(Nl);
    this.a = new Float64Array(Nl);
    this.ref = new Int32Array(Nl);
    this.disparou = new Uint8Array(this.N);
    this.ganho = new Float64Array(Ns).fill(1); // eficácia dos receptores (habituação)
    this.contagem = new Float64Array(this.pools.length);
    this.disparos = new Uint16Array(this.N); // por neurônio, até alguém ler (a esfera)
    this.taxa = new Float64Array(this.pools.length);
    this.poolDe = new Int32Array(this.N);
    this.pools.forEach((p, k) => this.poolDe.fill(k, p.inicio, p.inicio + p.n));
    this.niveis = {};
    this.tempoMs = 0;
    this.drive = new Float64Array(Nl);
  }

  pool(nome) {
    const k = this.indice[nome];
    if (k === undefined) throw new Error(`população desconhecida: ${nome}`);
    return this.pools[k];
  }

  /// Intensidade (0..1) de cada canal. Canal ausente vale 0.
  estimular(intensidades = {}) {
    this.niveis = {};
    for (const nome of this.canais) {
      const nivel = limitar(Number(intensidades[nome]) || 0);
      this.niveis[nome] = nivel;
      const p = this.pool(nome);
      for (let i = p.inicio; i < p.inicio + p.n; i++) this.sProb[i] = this.sTaxa[i] * nivel * 0.001;
    }
  }

  /// Um passo de 1 ms: integra, dispara, adapta e habitua.
  _subpasso() {
    const { Ns, Nl, W, v, a, ref, disparou, drive, ganho } = this;
    drive.fill(0);
    for (let i = 0; i < this.N; i++) {
      if (!disparou[i]) continue;
      const g = i < Ns ? ganho[i] : 1;
      const linha = i * Nl;
      for (let j = 0; j < Nl; j++) drive[j] += W[linha + j] * g;
    }

    for (let j = 0; j < Nl; j++) {
      let vj = v[j] * this.decai[j] + drive[j] + RUIDO * this.gaussRuido();
      if (ref[j] > 0) {
        vj = 0;
        ref[j]--;
      }
      if (vj < -0.5) vj = -0.5;
      a[j] *= this.adaptDecai[j];
      if (vj >= 1 + a[j]) {
        vj = 0;
        ref[j] = T_REF;
        a[j] += this.adaptB[j];
        disparou[Ns + j] = 1;
        this.contagem[this.poolDe[Ns + j]]++;
        if (this.disparos[Ns + j] < 65535) this.disparos[Ns + j]++;
      } else {
        disparou[Ns + j] = 0;
      }
      v[j] = vj;
    }

    for (let i = 0; i < Ns; i++) {
      const fogo = this.sProb[i] > 0 && this.aleatorio() < this.sProb[i];
      disparou[i] = fogo ? 1 : 0;
      // HABITUAÇÃO: cada disparo gasta um pouco; o tempo devolve
      if (fogo) {
        ganho[i] *= 1 - this.sD[i];
        this.contagem[this.poolDe[i]]++;
        if (this.disparos[i] < 65535) this.disparos[i]++;
      }
      ganho[i] += (1 - ganho[i]) * this.sRec[i];
    }
  }

  /// Avança `ms` milissegundos (no máximo 2000 por chamada).
  passo(ms) {
    const n = Math.max(1, Math.min(2000, Math.round(ms)));
    for (let k = 0; k < n; k++) this._subpasso();
    const dt = n * 0.001;
    const alfa = 1 - Math.exp(-dt / TAU_LEITURA);
    this.pools.forEach((p, k) => {
      const hz = this.contagem[k] / (dt * p.n);
      this.taxa[k] += alfa * (hz - this.taxa[k]);
      this.contagem[k] = 0;
    });
    this.tempoMs += n;
  }

  /// {motor: Hz} — o que a rede está "querendo" agora.
  motores() {
    const out = {};
    for (const m of this.nomesMotores) out[m] = this.taxa[this.indice[m]];
    return out;
  }

  /// {população: Hz} de todas, para o painel.
  taxas() {
    const out = {};
    this.pools.forEach((p, k) => (out[p.nome] = this.taxa[k]));
    return out;
  }

  /// Eficácia média por canal (1 = sem habituação).
  eficacia() {
    const out = {};
    for (const c of this.canais) {
      const p = this.pool(c);
      let s = 0;
      for (let i = p.inicio; i < p.inicio + p.n; i++) s += this.ganho[i];
      out[c] = s / p.n;
    }
    return out;
  }

  /// Disparos de cada neurônio desde a última leitura (e zera). É o que a
  /// esfera acende: um ponto por neurônio, aceso pelos disparos de verdade.
  lerDisparos() {
    const copia = Array.from(this.disparos);
    this.disparos.fill(0);
    return copia;
  }

  /// A forma da rede para desenhar: populações e ligações entre elas.
  topologia() {
    const idx = this.indice;
    const ligacoes = [];
    for (const [pre, pos, peso] of CONEXOES) ligacoes.push([idx[pre], idx[pos], peso]);
    for (const a of this.assembleias) {
      const nome = nomeAssembleia(a.canal, a.motor);
      ligacoes.push([idx[a.canal], idx[nome], 0.12], [idx[nome], idx[a.motor], a.sinal > 0 ? 0.3 : -0.3]);
    }
    for (const [chave, peso] of Object.entries(this.aprendido)) {
      if (Math.abs(peso) < 0.005) continue;
      const [c, m] = chave.split(">");
      ligacoes.push([idx[c], idx[m], peso]);
    }
    return {
      versao: `${this.N}:${this.assembleias.length}`,
      pools: this.pools.map((p) => ({ nome: p.nome, grupo: p.grupo, tipo: p.tipo, n: p.n })),
      ligacoes,
    };
  }

  /// Associações que já merecem neurônios próprios (e ainda não têm).
  /// Não muda nada: quem reconstrói a rede é a Mente (iniciativa.js).
  paraCrescer() {
    const tem = new Set(this.assembleias.map((a) => `${a.canal}>${a.motor}`));
    const novas = [];
    for (const [chave, peso] of Object.entries(this.aprendido)) {
      if (tem.has(chave) || Math.abs(peso) < LIMIAR_CRESCER) continue;
      if (this.assembleias.length + novas.length >= MAX_ASSEMBLEIAS) break;
      const [canal, motor] = chave.split(">");
      novas.push({ canal, motor, sinal: peso > 0 ? 1 : -1 });
    }
    return novas;
  }

  static assembleiasValidas(lista) {
    if (!Array.isArray(lista)) return [];
    const vistas = new Set();
    const out = [];
    for (const a of lista) {
      if (!a || !(a.canal in SENSORIAL) || !DECISOES.has(a.motor)) continue;
      const chave = `${a.canal}>${a.motor}`;
      if (vistas.has(chave) || out.length >= MAX_ASSEMBLEIAS) continue;
      vistas.add(chave);
      out.push({ canal: a.canal, motor: a.motor, sinal: Number(a.sinal) < 0 ? -1 : 1, nasceuEm: Number(a.nasceuEm) || null });
    }
    return out;
  }

  /// O humor de agora: o motor de expressão mais ativo (ou "tranquila").
  humor() {
    let melhor = null;
    let hz = 4; // abaixo disso, repouso
    for (const [nome] of MOTORES) {
      if (DECISOES.has(nome)) continue;
      const t = this.taxa[this.indice[nome]];
      if (t > hz) {
        hz = t;
        melhor = nome;
      }
    }
    return melhor ? ROTULOS[melhor] : "tranquila";
  }

  // ---------------- aprendizado (três fatores) ----------------
  /// recompensa: +1 você gostou, −1 você dispensou. motor: qual iniciativa.
  /// contexto: {canal: 0..1} do momento em que ela falou (a elegibilidade).
  aprender(recompensa, motor, contexto = {}, taxa = 0.03) {
    if (!DECISOES.has(motor) || !Number.isFinite(recompensa) || recompensa === 0) return;
    for (const c of this.canais) {
      const e = limitar(Number(contexto[c]) || 0);
      if (!e) continue;
      const chave = `${c}>${motor}`;
      this.aprendido[chave] = limitar((this.aprendido[chave] || 0) + taxa * recompensa * e, APRENDE_MIN, APRENDE_MAX);
    }
    this._aplicarAprendizado();
  }

  _aplicarAprendizado() {
    this.W.set(this.Wbase);
    const Nl = this.Nl;
    const Ns = this.Ns;
    for (const [chave, peso] of Object.entries(this.aprendido)) {
      if (!peso) continue;
      const [c, m] = chave.split(">");
      const mascara = this.mascaras[chave];
      if (!mascara) continue;
      const a = this.pool(c);
      const b = this.pool(m);
      for (let i = 0; i < a.n; i++) {
        for (let j = 0; j < b.n; j++) {
          this.W[(a.inicio + i) * Nl + (b.inicio + j - Ns)] += peso * mascara[i * b.n + j];
        }
      }
    }
  }

  /// As associações mais fortes que ela aprendeu: [[canal, motor, peso]].
  aprendizados(top = 5) {
    return Object.entries(this.aprendido)
      .filter(([, p]) => Math.abs(p) > 1e-4)
      .map(([k, p]) => [...k.split(">"), p])
      .sort((x, y) => Math.abs(y[2]) - Math.abs(x[2]))
      .slice(0, top);
  }

  // ---------------- persistência ----------------
  salvar(agora = Date.now()) {
    const eficacia = {};
    for (const c of this.canais) {
      const p = this.pool(c);
      eficacia[c] = Array.from(this.ganho.subarray(p.inicio, p.inicio + p.n), (x) => Math.round(x * 1e5) / 1e5);
    }
    const aprendido = {};
    for (const [k, p] of Object.entries(this.aprendido)) if (p) aprendido[k] = Math.round(p * 1e6) / 1e6;
    return { versao: VERSAO, semente: this.semente, salvoEm: agora, eficacia, aprendido, assembleias: this.assembleias };
  }

  /// Valida tudo antes de aplicar: se algo não fecha, nada muda e ela segue
  /// do zero (como no Pestinha). O tempo fechado conta como recuperação da
  /// habituação.
  carregar(dados, agora = Date.now()) {
    if (!dados || typeof dados !== "object") return false;
    if (dados.versao !== VERSAO || dados.semente !== this.semente) return false;
    const salvoEm = Number(dados.salvoEm);
    if (!Number.isFinite(salvoEm)) return false;
    const passou = Math.max(0, (agora - salvoEm) / 1000);

    const aprendido = {};
    const fonte = dados.aprendido && typeof dados.aprendido === "object" ? dados.aprendido : {};
    for (const [k, p] of Object.entries(fonte)) {
      if (!this.mascaras[k]) continue; // ligação que não existe mais
      const n = Number(p);
      if (!Number.isFinite(n)) return false;
      aprendido[k] = limitar(n, APRENDE_MIN, APRENDE_MAX);
    }

    const recuperado = {};
    const ef = dados.eficacia && typeof dados.eficacia === "object" ? dados.eficacia : {};
    for (const c of this.canais) {
      if (!(c in ef)) continue; // canal novo: começa sem habituação
      const p = this.pool(c);
      const lista = ef[c];
      if (!Array.isArray(lista) || lista.length !== p.n) return false;
      const vals = [];
      for (let k = 0; k < p.n; k++) {
        const x = Number(lista[k]);
        if (!Number.isFinite(x) || x < 0 || x > 1) return false;
        vals.push(limitar(1 - (1 - x) * Math.exp(-passou / this.sTauRec[p.inicio + k])));
      }
      recuperado[c] = vals;
    }

    this.aprendido = aprendido;
    this._aplicarAprendizado();
    for (const [c, vals] of Object.entries(recuperado)) this.ganho.set(vals, this.pool(c).inicio);
    return true;
  }

  descrever() {
    const cresceu = this.assembleias.length ? `, ${this.assembleias.length} assembleias crescidas` : "";
    return `LIF ${this.N} neurônios, ${this.nSinapses} sinapses, ${this.canais.length} sentidos, ${this.decisoes.length} iniciativas${cresceu}`;
  }
}

module.exports = {
  Rede, SENSORIAL, INTER, MOTORES, CONEXOES, DECISOES, ROTULOS, APRENDE_MIN, APRENDE_MAX,
  LIMIAR_CRESCER, MAX_ASSEMBLEIAS, nomeAssembleia,
};
