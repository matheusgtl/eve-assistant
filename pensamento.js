// pensamento.js — a rede de linguagem: o que ela já responde sem os agentes.
//
// O "desmame" dos agentes (26/11/2026). Toda fala passa primeiro por uma rede
// neural pequena, dela, que roda aqui sem internet: texto → traços (palavras
// e pares de palavras) → camada oculta → uma INTENÇÃO. Se a intenção é uma que
// ela sabe resolver em código (hora, data, bateria, sistema, lembretes,
// agenda, cumprimentos, como ela está, o que a rede sente, mudo) e a confiança
// passa do limiar daquela intenção, ela responde sozinha. Senão, os agentes.
//
// O que impede isso de virar o erro medido em 02/11 (rotear antes e a
// conversa "fazer" o que não fez): a resposta local NUNCA é texto inventado.
// Cada intenção é uma função que lê o dado de verdade e o põe em frase. Não há
// intenção local que aja no mundo além de ligar e desligar a voz — pedir,
// criar, mandar, pesquisar, calcular: tudo isso é "outro" e vai para os agentes.
//
// Como ela se aperfeiçoa:
//   • aprende com o agente — quando um agente resolve a pergunta com uma
//     ferramenta só de leitura que ela tem (system_status, list_reminders,
//     listar_eventos), aquela frase vira exemplo da intenção;
//   • aprende o que NÃO é dela — se ela ia responder sozinha e o agente
//     precisou de outra ferramenta, a frase vira exemplo de "outro";
//   • aprende com você — "não era isso" logo depois de uma resposta local
//     manda a pergunta para os agentes, sobe o limiar daquela intenção e
//     guarda a frase como "outro". Cada acerto sem correção desce o limiar;
//   • cresce — se a rede não consegue mais separar os exemplos (acerto de
//     treino abaixo de 97%), ganha 8 neurônios ocultos, até 96.

"use strict";

const VERSAO = 1;
const DIM = 2048; // traços por hash
const OCULTOS_INICIO = 24;
const OCULTOS_MAX = 96;
const OCULTOS_PASSO = 8;
const LIMIAR_INICIO = 0.75;
const LIMIAR_MIN = 0.6;
const LIMIAR_MAX = 0.95;
const MARGEM = 0.3;
const MAX_EXEMPLOS = 1500;
const JANELA_CORRECAO = 2 * 60_000;
// Cobertura: das palavras que importam, quantas ela já viu NAQUELA intenção.
// "que horas são em Tóquio" acerta a intenção (hora) com 93% de confiança —
// e responder a hora daqui seria errado. A palavra que ela nunca viu ali
// ("tóquio") é o sinal de que a pergunta é outra: vai para os agentes.
const COBERTURA_MIN = 0.75;
const VAZIAS = new Set(
  "a o as os e de da do das dos em no na nos nas um uma uns umas que me te se pra pro para por favor voce vc ta esta estao eh e ai sexta feira oi ola ne ja agora so com sobre aqui la isso isto esse essa meu minha meus minhas".split(" ")
);

// ------------------------------------------------------------------ exemplos
// As frases de partida. "outro" é tão importante quanto as intenções: é o que
// ensina a rede a mandar para os agentes tudo que ela não resolve.
const SEMENTES = {
  saudacao: [
    "oi", "ola", "oi sexta", "ola sexta-feira", "bom dia", "boa tarde", "boa noite", "e ai", "eai sexta", "ei",
    "opa", "salve", "fala sexta", "oi tudo certo", "bom dia sexta", "boa tarde sexta", "oie", "hey", "alo",
    "oi oi", "fala ai", "ola tudo bem por ai", "e ai beleza", "beleza", "oi beleza", "fala beleza",
  ],
  agradecimento: [
    "obrigado", "obrigada", "valeu", "brigado", "muito obrigado", "obrigado sexta", "valeu demais", "agradeco",
    "obrigadao", "valeu sexta", "brigadao", "obrigado pela ajuda", "valeu pela ajuda", "show obrigado", "perfeito obrigado",
  ],
  despedida: [
    "tchau", "ate mais", "ate logo", "ate amanha", "vou dormir", "falou", "fui", "tchau sexta", "ate depois",
    "boa noite vou dormir", "vou sair", "depois a gente se fala", "ate ja", "vou nessa",
  ],
  como_esta: [
    "como voce esta", "tudo bem", "como vai", "como voce ta", "tudo bom", "ta bem", "como esta se sentindo",
    "como voce esta hoje", "tudo bem com voce", "e voce como esta", "como vai voce", "beleza com voce", "tudo certo com voce",
  ],
  rede: [
    "o que voce esta sentindo", "o que voce aprendeu", "como esta sua rede neural", "quantos neuronios voce tem",
    "o que sua rede esta fazendo", "qual seu humor", "como esta seu humor", "sua rede neural cresceu",
    "o que seus neuronios estao fazendo", "me fala da sua rede", "o que voce sente agora", "voce aprendeu alguma coisa",
  ],
  hora: [
    "que horas sao", "que hora e agora", "me diz a hora", "horas", "sabe que horas sao", "qual a hora",
    "que horas sao agora", "hora certa", "me fala as horas", "ja e que horas",
  ],
  data: [
    "que dia e hoje", "qual a data de hoje", "hoje e que dia", "que dia da semana e hoje", "em que dia estamos",
    "qual o dia de hoje", "data de hoje", "estamos em que mes", "hoje e dia quanto", "que dia e",
  ],
  bateria: [
    "como esta a bateria", "quanto de bateria", "bateria", "quanto tem de bateria", "a bateria ta boa",
    "quanto de bateria tem", "nivel da bateria", "como ta a bateria do mac", "ta carregando", "a bateria esta acabando",
  ],
  sistema: [
    "como esta meu computador", "como ta o mac", "uso de cpu", "quanto de memoria esta usando", "o computador ta pesado",
    "status do sistema", "como esta o sistema", "o mac ta lento", "quanto de ram", "uso da cpu agora",
    "como esta o desempenho", "quanto de disco livre", "espaco em disco",
  ],
  lembretes: [
    "quais sao meus lembretes", "tenho algum lembrete", "lista meus lembretes", "o que eu tenho pra lembrar",
    "meus lembretes", "quais lembretes tenho", "tem lembrete pendente", "mostra os lembretes", "lembretes pendentes",
  ],
  agenda: [
    "o que eu tenho hoje na agenda", "meus compromissos", "tenho reuniao hoje", "o que tem no calendario",
    "minha agenda", "o que tenho essa semana", "tenho algum evento", "compromissos de hoje", "o que tem na agenda",
    "minha agenda da semana",
  ],
  silenciar: [
    "fica muda", "para de falar em voz alta", "silencia a voz", "modo silencioso", "nao fala so escreve",
    "fica em silencio", "desliga a voz", "so escreve", "mudo", "ativa o mudo",
  ],
  voz: [
    "volta a falar", "pode falar de novo", "liga a voz", "tira o mudo", "desativa o mudo", "fala comigo de novo",
    "quero ouvir sua voz", "pode falar em voz alta",
  ],
  outro: [
    "me lembra de comprar pao amanha", "me lembra de ligar pro joao as 15h", "cria um lembrete para segunda",
    "pesquisa sobre buracos negros", "procura o preco do iphone", "quem ganhou o jogo ontem", "o que e fotossintese",
    "abre o spotify", "abre o chrome", "fecha o safari", "cria um pdf com isso", "le esse pdf", "resume esse arquivo",
    "quanto eu gastei esse mes", "registra um gasto de 50 reais no mercado", "calcula 15 por cento de 340",
    "manda uma mensagem pro pedro", "escreve um email para o chefe", "traduz isso para ingles", "explica esse codigo",
    "organiza minha pasta de downloads", "apaga esse arquivo", "cria uma pasta chamada projetos",
    "marca uma reuniao amanha as 10", "cria um evento sexta", "anota que a senha do wifi esta no caderno",
    "qual a previsao do tempo", "vai chover amanha", "me conta uma piada", "escreve um poema", "faz um resumo do livro",
    "qual a capital da australia", "como faco um bolo de cenoura", "me ajuda com matematica", "toca uma musica",
    "copia isso", "roda o backup", "instala o node", "quanto e o dolar hoje", "lembra que eu gosto de cafe",
    "salva essa conversa", "cria uma skill", "usa a skill de backup", "por que o ceu e azul", "me explica a bateria de litio",
    "quanto custa uma bateria nova", "que horas abre o mercado", "qual o melhor horario para dormir",
    "como voce funciona", "quem te criou", "o que voce consegue fazer", "faz uma lista de compras", "me da uma ideia",
  ],
};

// Quais ferramentas de LEITURA equivalem a uma intenção dela.
const FERRAMENTA_INTENCAO = {
  system_status: "sistema",
  list_reminders: "lembretes",
  listar_eventos: "agenda",
};

const CORRECAO = /\b(n[aã]o (foi|era|e|é) isso|n[aã]o perguntei|n[aã]o foi o que (eu )?(pedi|perguntei)|voc[eê] errou|errou|n[aã]o entendeu|entendeu errado|n[aã]o era essa|resposta errada)\b/i;

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0) % DIM;
}

/// Palavras, pares de palavras e o tamanho da frase, como índices esparsos.
function tracos(texto) {
  const palavras = normalizar(texto).split(" ").filter(Boolean);
  const idx = new Set();
  for (let i = 0; i < palavras.length; i++) {
    idx.add(hash("w:" + palavras[i]));
    if (i + 1 < palavras.length) idx.add(hash("b:" + palavras[i] + " " + palavras[i + 1]));
  }
  idx.add(hash("len:" + Math.min(8, palavras.length)));
  return [...idx];
}

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

// ------------------------------------------------------------------ a rede
/// Perceptron de uma camada oculta (tanh) com saída softmax, treinado por
/// descida de gradiente. Pequeno de propósito: cabe, treina em milissegundos
/// e dá para crescer sem perder o que já sabe.
class RedeDeLinguagem {
  constructor({ ocultos = OCULTOS_INICIO, intencoes = [], semente = 41 } = {}) {
    this.rng = semeado(semente);
    this.H = 0;
    this.intencoes = [];
    this.W1 = []; // H linhas de DIM
    this.b1 = [];
    this.W2 = []; // K linhas de H
    this.b2 = [];
    this.crescerOcultos(ocultos);
    for (const k of intencoes) this.garantirIntencao(k);
  }

  aleatorio(escala) {
    return (this.rng() * 2 - 1) * escala;
  }

  crescerOcultos(quantos) {
    for (let h = 0; h < quantos; h++) {
      const linha = new Float32Array(DIM);
      for (let d = 0; d < DIM; d++) linha[d] = this.aleatorio(0.1);
      this.W1.push(linha);
      this.b1.push(0);
      for (const w of this.W2) w.push(this.aleatorio(0.05));
    }
    this.H += quantos;
  }

  /// Intenção nova = um neurônio de saída novo.
  garantirIntencao(nome) {
    if (this.intencoes.includes(nome)) return;
    this.intencoes.push(nome);
    this.W2.push(Array.from({ length: this.H }, () => this.aleatorio(0.1)));
    this.b2.push(0);
  }

  _frente(idx) {
    const escala = 1 / Math.sqrt(idx.length || 1);
    const h = new Float64Array(this.H);
    for (let j = 0; j < this.H; j++) {
      let s = this.b1[j];
      const w = this.W1[j];
      for (const d of idx) s += w[d] * escala;
      h[j] = Math.tanh(s);
    }
    const z = this.W2.map((w, k) => {
      let s = this.b2[k];
      for (let j = 0; j < this.H; j++) s += w[j] * h[j];
      return s;
    });
    const max = Math.max(...z);
    const e = z.map((v) => Math.exp(v - max));
    const soma = e.reduce((a, b) => a + b, 0);
    return { h, p: e.map((v) => v / soma), escala };
  }

  prever(texto) {
    const idx = tracos(texto);
    const { p } = this._frente(idx);
    const ordem = p.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]);
    return {
      intencao: this.intencoes[ordem[0][1]],
      confianca: ordem[0][0],
      segunda: ordem[1] ? ordem[1][0] : 0,
      probabilidades: Object.fromEntries(this.intencoes.map((k, i) => [k, p[i]])),
    };
  }

  _passo(idx, alvo, taxa) {
    const { h, p, escala } = this._frente(idx);
    const dz = p.slice();
    dz[alvo] -= 1;
    const dh = new Float64Array(this.H);
    for (let k = 0; k < this.W2.length; k++) {
      const w = this.W2[k];
      for (let j = 0; j < this.H; j++) {
        dh[j] += w[j] * dz[k];
        w[j] -= taxa * dz[k] * h[j];
      }
      this.b2[k] -= taxa * dz[k];
    }
    for (let j = 0; j < this.H; j++) {
      const g = dh[j] * (1 - h[j] * h[j]);
      if (g === 0) continue;
      const w = this.W1[j];
      for (const d of idx) w[d] -= taxa * g * escala;
      this.b1[j] -= taxa * g;
    }
  }

  /// exemplos: [[texto, intencao]]. Devolve o acerto no próprio treino.
  treinar(exemplos, { epocas = 30, taxa = 0.08 } = {}) {
    for (const [, k] of exemplos) this.garantirIntencao(k);
    const dados = exemplos.map(([t, k]) => [tracos(t), this.intencoes.indexOf(k)]);
    const ordem = dados.map((_, i) => i);
    for (let ep = 0; ep < epocas; ep++) {
      for (let i = ordem.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      }
      for (const i of ordem) this._passo(dados[i][0], dados[i][1], taxa);
    }
    return this.acerto(exemplos);
  }

  acerto(exemplos) {
    if (!exemplos.length) return 1;
    let certos = 0;
    for (const [t, k] of exemplos) if (this.prever(t).intencao === k) certos++;
    return certos / exemplos.length;
  }
}

// ------------------------------------------------------------------ respostas
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const saudacaoDaHora = (h) => (h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite");

/// Cada intenção é código que lê o dado de verdade. `c` vem do main.js:
/// { agora, dono, nome, rede(), sistema(), bateria(), lembretes(), agenda(), mudo(bool) }.
const RESPOSTAS = {
  async saudacao(c) {
    const h = new Date(c.agora).getHours();
    return `${saudacaoDaHora(h)}${c.dono ? `, ${c.dono}` : ""}! Estou aqui. O que vamos fazer?`;
  },
  async agradecimento() {
    return "De nada! É só chamar.";
  },
  async despedida(c) {
    const h = new Date(c.agora).getHours();
    return h >= 21 || h < 5 ? "Boa noite! Descansa bem." : "Até já! Fico por aqui no olho lá em cima.";
  },
  async como_esta(c) {
    const r = c.rede();
    if (!r) return "Tudo certo por aqui.";
    return `Estou ${r.humor}. Minha rede está com ${r.neuronios} neurônios${r.assembleias?.length ? `, ${r.assembleias.length} que nasceram do que aprendi com você` : ""}. E você?`;
  },
  async rede(c) {
    const r = c.rede();
    if (!r) return null;
    const partes = [`Estou ${r.humor}, com ${r.neuronios} neurônios.`];
    const sentidos = (r.sentidos || []).filter((s) => s.nivel >= 0.3).map((s) => s.nome.toLowerCase());
    if (sentidos.length) partes.push(`Agora eu sinto: ${sentidos.join(", ")}.`);
    if (r.aprendizados?.length) {
      const [canal, motor, peso] = r.aprendizados[0];
      partes.push(`O que mais aprendi: ${canal.toLowerCase()} ${peso > 0 ? "me faz querer" : "me segura de"} ${motor.toLowerCase()}.`);
    } else partes.push("Ainda não aprendi nada forte com as suas respostas.");
    if (c.linguagem) partes.push(`Respondi sozinha ${c.linguagem.locais} vezes, sem chamar os agentes.`);
    return partes.join(" ");
  },
  async hora(c) {
    const d = new Date(c.agora);
    return `São ${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}.`;
  },
  async data(c) {
    const d = new Date(c.agora);
    return `Hoje é ${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}.`;
  },
  async bateria(c) {
    const b = await c.bateria();
    if (!b) return "Este Mac não tem bateria, está sempre na tomada.";
    if (!Number.isFinite(b.porcento)) return null;
    const estado = b.estado === "bateria" ? "fora da tomada" : b.estado === "carregada" ? "carregada, na tomada" : "carregando";
    return `A bateria está em ${b.porcento}%, ${estado}${b.restante ? `, com ${b.restante} restantes` : ""}.`;
  },
  async sistema(c) {
    const a = await c.sistema();
    if (!a) return null;
    const partes = [`CPU em ${a.cpu}%`, `memória em ${a.memoria.porcento}% (${a.memoria.usadaGB} de ${a.memoria.totalGB} GB)`];
    if (a.disco) partes.push(`${a.disco.livreGB} GB livres no disco`);
    if (a.bateria && Number.isFinite(a.bateria.porcento)) partes.push(`bateria em ${a.bateria.porcento}%`);
    const pesado = a.cpu >= 80 || a.memoria.porcento >= 90;
    return `${partes.join(", ")}.${pesado ? " Está puxado agora." : " Está tranquilo."}`;
  },
  async lembretes(c) {
    const lista = c.lembretes();
    if (!lista) return null;
    if (!lista.length) return "Você não tem lembretes pendentes.";
    const primeiros = lista.slice(0, 4).map((l) => `${l.texto} (${l.quando})`);
    const resto = lista.length > 4 ? ` e mais ${lista.length - 4}` : "";
    return `Você tem ${lista.length === 1 ? "um lembrete" : `${lista.length} lembretes`}: ${primeiros.join("; ")}${resto}.`;
  },
  async agenda(c) {
    const r = await c.agenda();
    if (!r || r.error) return null; // sem permissão ou erro: o agente explica
    const eventos = r.eventos || r.itens || (Array.isArray(r) ? r : null);
    if (!eventos) return null;
    if (!eventos.length) return "Nada na agenda nos próximos sete dias.";
    const quando = (iso) => {
      const d = new Date(iso);
      if (!iso || Number.isNaN(d.getTime())) return "";
      const dia = d.toDateString() === new Date(c.agora).toDateString() ? "hoje" : `${DIAS[d.getDay()].split("-")[0]} ${d.getDate()}`;
      return /T\d/.test(String(iso)) ? `${dia}, ${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}` : dia;
    };
    const lista = eventos.slice(0, 4).map((e) => {
      const q = quando(e.inicio || e.start);
      return q ? `${e.titulo || e.title} (${q})` : e.titulo || e.title;
    });
    return `Nos próximos dias: ${lista.join("; ")}${eventos.length > 4 ? ` e mais ${eventos.length - 4}` : ""}.`;
  },
  async silenciar(c) {
    c.mudo(true);
    return "Certo, fico só no texto. Para voltar a falar, é só pedir.";
  },
  async voz(c) {
    c.mudo(false);
    return "Voltei a falar.";
  },
};

// ------------------------------------------------------------------ o pensamento
class Pensamento {
  constructor(salvo = {}, { log = () => {}, aoEvento = () => {} } = {}) {
    this.log = log;
    this.aoEvento = aoEvento;
    const valido = salvo && salvo.versao === VERSAO;
    this.aprendidos = valido && Array.isArray(salvo.exemplos)
      ? salvo.exemplos.filter((e) => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string" && (e[1] in SEMENTES))
      : [];
    this.limiares = {};
    for (const k of Object.keys(RESPOSTAS)) {
      const v = Number(valido ? salvo.limiares?.[k] : NaN);
      this.limiares[k] = Number.isFinite(v) ? Math.min(LIMIAR_MAX, Math.max(LIMIAR_MIN, v)) : LIMIAR_INICIO;
    }
    const st = (valido && salvo.estatisticas) || {};
    this.estatisticas = {
      locais: Number(st.locais) || 0,
      agentes: Number(st.agentes) || 0,
      corrigidas: Number(st.corrigidas) || 0,
      aprendidasComAgente: Number(st.aprendidasComAgente) || 0,
      porIntencao: st.porIntencao && typeof st.porIntencao === "object" ? st.porIntencao : {},
    };
    this.dia = valido ? salvo.dia || null : null;
    this.hoje = valido ? { locais: Number(salvo.hoje?.locais) || 0, agentes: Number(salvo.hoje?.agentes) || 0 } : { locais: 0, agentes: 0 };
    const ocultos = valido ? Math.min(OCULTOS_MAX, Math.max(OCULTOS_INICIO, Number(salvo.ocultos) || OCULTOS_INICIO)) : OCULTOS_INICIO;
    this.rede = new RedeDeLinguagem({ ocultos, intencoes: Object.keys(SEMENTES) });
    this.vocabulario = {};
    this.ultimaLocal = null; // {texto, intencao, em}
    this.ultimaPrevisao = null;
    this.treinarTudo();
  }

  /// Palavras que ela já viu em cada intenção (sementes + aprendidas).
  montarVocabulario() {
    this.vocabulario = {};
    for (const [t, k] of this.exemplos()) {
      const v = (this.vocabulario[k] ||= new Set());
      for (const w of normalizar(t).split(" ")) if (w) v.add(w);
    }
  }

  cobertura(texto, intencao) {
    const palavras = normalizar(texto).split(" ").filter((w) => w && !VAZIAS.has(w));
    if (!palavras.length) return 1;
    const v = this.vocabulario[intencao] || new Set();
    return palavras.filter((w) => v.has(w)).length / palavras.length;
  }

  exemplos() {
    const base = [];
    for (const [k, lista] of Object.entries(SEMENTES)) for (const t of lista) base.push([t, k]);
    return base.concat(this.aprendidos.map(([t, k]) => [t, k]));
  }

  /// Treina do zero (na partida) e cresce enquanto não separar os exemplos.
  treinarTudo() {
    const ex = this.exemplos();
    this.montarVocabulario();
    let acerto = this.rede.treinar(ex, { epocas: 30 });
    while (acerto < 0.97 && this.rede.H < OCULTOS_MAX) {
      const antes = this.rede.H;
      this.rede.crescerOcultos(OCULTOS_PASSO);
      acerto = this.rede.treinar(ex, { epocas: 15 });
      this.log(`linguagem cresceu: ${antes} → ${this.rede.H} ocultos (acerto ${Math.round(acerto * 100)}%)`);
      this.aoEvento({ tipo: "linguagem-cresceu", antes, ocultos: this.rede.H, em: Date.now() });
    }
    this.acertoDeTreino = acerto;
    return acerto;
  }

  /// Um exemplo novo: guarda e reforça, sem retreinar tudo (barato).
  aprenderExemplo(texto, intencao, origem) {
    const norm = normalizar(texto);
    if (!norm || norm.length > 120 || !(intencao in SEMENTES)) return false;
    const i = this.aprendidos.findIndex(([t]) => normalizar(t) === norm);
    if (i >= 0) {
      if (this.aprendidos[i][1] === intencao) return false;
      this.aprendidos.splice(i, 1); // mudou de ideia: vale o mais recente
    }
    this.aprendidos.push([norm, intencao, origem]);
    if (this.aprendidos.length > MAX_EXEMPLOS) this.aprendidos.shift();
    this.montarVocabulario();
    // Reforço local: o exemplo novo algumas vezes, misturado com uma amostra do
    // que ela já sabe (sem isso, aprender um esquece o resto).
    const ex = this.exemplos();
    const amostra = [[norm, intencao], [norm, intencao], [norm, intencao]];
    for (let k = 0; k < 40; k++) amostra.push(ex[Math.floor(this.rede.rng() * ex.length)]);
    this.rede.treinar(amostra, { epocas: 4 });
    return true;
  }

  contar(onde, agora) {
    const dia = new Date(agora).toDateString();
    if (this.dia !== dia) {
      this.dia = dia;
      this.hoje = { locais: 0, agentes: 0 };
    }
    this.hoje[onde]++;
    this.estatisticas[onde]++;
  }

  /// Decide quem responde. Devolve:
  ///   {acao: "local", intencao, confianca}
  ///   {acao: "agente", motivo, pergunta?}  (pergunta = a anterior, se foi correção)
  avaliar(texto, { bloqueado = false } = {}, agora = Date.now()) {
    const t = String(texto || "").trim();
    // Correção logo depois de uma resposta local: a pergunta original vai para os agentes.
    if (this.ultimaLocal && agora - this.ultimaLocal.em < JANELA_CORRECAO && CORRECAO.test(t)) {
      const anterior = this.ultimaLocal;
      this.ultimaLocal = null;
      this.limiares[anterior.intencao] = Math.min(LIMIAR_MAX, this.limiares[anterior.intencao] + 0.08);
      this.estatisticas.corrigidas++;
      const p = (this.estatisticas.porIntencao[anterior.intencao] ||= { locais: 0, corrigidas: 0 });
      p.corrigidas++;
      this.aprenderExemplo(anterior.texto, "outro", "correção");
      this.aoEvento({ tipo: "corrigida", intencao: anterior.intencao, pergunta: anterior.texto, em: agora });
      this.contar("agentes", agora);
      return { acao: "agente", motivo: "correção", pergunta: anterior.texto };
    }
    // A resposta local anterior não foi corrigida: um acerto, o limiar desce.
    if (this.ultimaLocal) {
      const k = this.ultimaLocal.intencao;
      this.limiares[k] = Math.max(LIMIAR_MIN, this.limiares[k] - 0.01);
      this.ultimaLocal = null;
    }

    const previsao = this.rede.prever(t);
    this.ultimaPrevisao = { texto: t, ...previsao };
    const { intencao, confianca, segunda } = previsao;
    const palavras = normalizar(t).split(" ").filter(Boolean).length;
    let motivo = null;
    if (bloqueado) motivo = "esperando resposta a uma pergunta dela";
    else if (!palavras) motivo = "vazio";
    else if (palavras > 14 || t.length > 100) motivo = "longo demais";
    else if (intencao === "outro" || !RESPOSTAS[intencao]) motivo = "não é dela";
    else if (confianca < this.limiares[intencao]) motivo = "pouca confiança";
    else if (confianca - segunda < MARGEM) motivo = "dúvida entre duas";
    else if (this.cobertura(t, intencao) < COBERTURA_MIN) motivo = "palavra que ela não conhece ali";
    if (motivo) {
      this.contar("agentes", agora);
      return { acao: "agente", motivo, intencao, confianca };
    }
    return { acao: "local", intencao, confianca };
  }

  /// Executa a intenção. null = não deu (sem dado, sem permissão): vai para os agentes.
  async responder(decisao, texto, contexto, agora = Date.now()) {
    let resposta = null;
    try {
      resposta = await RESPOSTAS[decisao.intencao]({ ...contexto, agora, linguagem: this.estado() });
    } catch (err) {
      this.log(`linguagem: ${decisao.intencao} falhou: ${err.message}`);
    }
    if (!resposta) {
      // a decisão já contou "local"? não: só conta depois de responder.
      this.contar("agentes", agora);
      return null;
    }
    this.contar("locais", agora);
    const p = (this.estatisticas.porIntencao[decisao.intencao] ||= { locais: 0, corrigidas: 0 });
    p.locais++;
    this.ultimaLocal = { texto: String(texto).trim(), intencao: decisao.intencao, em: agora };
    this.aoEvento({ tipo: "pensou", intencao: decisao.intencao, confianca: decisao.confianca, pergunta: String(texto).slice(0, 120), em: agora });
    return resposta;
  }

  /// Depois que um agente respondeu: o que dá para aprender com o que ele fez.
  aposAgente(texto, ferramentas = [], agora = Date.now()) {
    const t = String(texto || "").trim();
    const usadas = [...new Set(ferramentas)];
    if (!t || !usadas.length) return null;
    const intencoes = new Set(usadas.map((f) => FERRAMENTA_INTENCAO[f]));
    let rotulo = null;
    if (intencoes.size === 1 && !intencoes.has(undefined)) {
      rotulo = [...intencoes][0];
      // A bateria vem do mesmo system_status: a rede já sabia que era bateria.
      if (rotulo === "sistema" && this.ultimaPrevisao?.texto === t && this.ultimaPrevisao.intencao === "bateria") rotulo = "bateria";
    } else if (this.ultimaPrevisao?.texto === t && this.ultimaPrevisao.intencao !== "outro" && this.ultimaPrevisao.confianca >= 0.4) {
      rotulo = "outro"; // ela achou que era dela, mas precisou de outra ferramenta
    }
    if (!rotulo) return null;
    if (this.aprenderExemplo(t, rotulo, "agente")) {
      this.estatisticas.aprendidasComAgente++;
      this.aoEvento({ tipo: "aprendeu-com-agente", intencao: rotulo, pergunta: t.slice(0, 120), em: agora });
      return rotulo;
    }
    return null;
  }

  estado() {
    return {
      ocultos: this.rede.H,
      intencoes: this.rede.intencoes.length,
      exemplos: this.exemplos().length,
      aprendidos: this.aprendidos.length,
      acerto: Math.round((this.acertoDeTreino || 0) * 100),
      locais: this.estatisticas.locais,
      agentes: this.estatisticas.agentes,
      corrigidas: this.estatisticas.corrigidas,
      aprendidasComAgente: this.estatisticas.aprendidasComAgente,
      hoje: { ...this.hoje },
      limiares: { ...this.limiares },
    };
  }

  salvar() {
    return {
      versao: VERSAO,
      ocultos: this.rede.H,
      exemplos: this.aprendidos,
      limiares: this.limiares,
      estatisticas: this.estatisticas,
      dia: this.dia,
      hoje: this.hoje,
    };
  }

  /// A nota rede/linguagem.md do Obsidian.
  nota(nome = "Sexta-Feira") {
    const e = this.estado();
    const linhas = [
      "---",
      "quando: nunca — este arquivo é gerado automaticamente",
      "tags: [rede, linguagem]",
      "---",
      "",
      `# O que a ${nome} já responde sozinha`,
      "",
      `Rede de linguagem: ${e.ocultos} neurônios ocultos, ${e.intencoes} intenções, ${e.exemplos} exemplos (${e.aprendidos} aprendidos com o uso), acerto de treino ${e.acerto}%.`,
      "",
      `Respondeu sozinha ${e.locais} vezes; ${e.agentes} foram para os agentes; ${e.corrigidas} correções; ${e.aprendidasComAgente} frases aprendidas observando os agentes.`,
      "",
      "| Intenção | Limiar | Sozinha | Corrigida |",
      "|---|---:|---:|---:|",
    ];
    for (const k of Object.keys(RESPOSTAS)) {
      const p = this.estatisticas.porIntencao[k] || { locais: 0, corrigidas: 0 };
      linhas.push(`| ${k} | ${Math.round(this.limiares[k] * 100)}% | ${p.locais} | ${p.corrigidas} |`);
    }
    linhas.push("", "Limiar menor = ela confia mais em si. Cada acerto desce 1 ponto; cada correção sobe 8.", "");
    const recentes = this.aprendidos.slice(-15).reverse();
    if (recentes.length) {
      linhas.push("## Frases aprendidas por último", "");
      for (const [t, k, origem] of recentes) linhas.push(`- “${t}” → ${k}${origem ? ` (${origem})` : ""}`);
      linhas.push("");
    }
    linhas.push("Ver também: [[REDE]] · [[CEREBRO]]", "");
    return linhas.join("\n");
  }
}

module.exports = {
  Pensamento, RedeDeLinguagem, SEMENTES, RESPOSTAS, FERRAMENTA_INTENCAO, CORRECAO,
  normalizar, tracos, LIMIAR_INICIO, LIMIAR_MIN, OCULTOS_INICIO, OCULTOS_MAX,
};
