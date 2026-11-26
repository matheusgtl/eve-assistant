// escolhas.js — os botões de resposta no chat e o "sim" que só ele pode dar.
//
// Duas coisas moram aqui, e as duas existem por causa do log de 25/11:
//
// 1. CONFIRMAÇÃO É DO CÓDIGO, NÃO DO MODELO. `confirmed=true` era um parâmetro
//    que o próprio modelo preenchia — às 20:45:43 ele chamou trash_file já com
//    confirmed="true" na PRIMEIRA tentativa, sem ninguém ter dito sim. A trava
//    dependia de o modelo se comportar, que é o que ela jurava não fazer.
//    Agora a ferramenta pede o sim (needs_confirmation), o pedido fica guardado
//    aqui, e confirmed=true só vale se a fala SEGUINTE dele for um sim — dito,
//    escrito ou clicado — para a MESMA chamada. Vale uma vez.
//
// 2. OPÇÕES NO FIM DA RESPOSTA. Das 75 respostas salvas até 25/11, 15 acabavam
//    em pergunta ("Se quiser, eu já crio o lembrete…") e em 12 ele respondeu
//    outra coisa: a oferta morria. Ela agora fecha uma pergunta de escolha com
//    `[opções: Sim, cria; Não precisa]`; a linha sai da fala e da tela e vira
//    botões. Clicar é o mesmo que dizer o rótulo.

const ROTULOS_CONFIRMACAO = ["Sim, pode", "Não"];

// ---------------------------------------------------------------------------
// Sim ou não, pela fala dele
// ---------------------------------------------------------------------------
const tirarAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpar = (t) => tirarAcento(t).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

// Só o COMEÇO da fala decide: "sim, mas manda pro João" é um sim — e se ela
// mudar o destinatário, a chamada muda e o sim não serve para ela (ver abaixo).
const SIM = /^(sim|pode|podes|manda|envia|confirmo|confirma|confirmado|claro|isso|isso mesmo|ok|okay|beleza|blz|bora|vai|faz|faca|fechado|positivo|com certeza|uhum|aham|s)\b/;
// "para"/"deixa"/"espera" só sozinhos: "para o João" e "deixa que eu falo com ele" não são recusa.
const NAO = /^(nao|n|negativo|cancela|cancelar|melhor nao|nem|nunca)\b|^(para|pare|deixa|espera)( ai| tudo| quieto)?$/;

/** "sim" | "nao" | null (qualquer outra coisa não decide nada) */
function lerResposta(texto) {
  const t = limpar(texto);
  if (!t) return null;
  if (NAO.test(t)) return "nao"; // antes do sim: "não, pode deixar" é não
  if (SIM.test(t)) return "sim";
  return null;
}

// ---------------------------------------------------------------------------
// Pedido de confirmação pendente
// ---------------------------------------------------------------------------
/// A chamada é identificada pelo nome e pelos argumentos, sem o `confirmed`.
/// Se ela repetir com OUTRO comando ou OUTRO destinatário, não é o que ele
/// aprovou — e volta a pedir.
function assinatura(nome, args = {}) {
  const { confirmed, ...resto } = args || {};
  const ordenado = Object.keys(resto)
    .sort()
    .map((k) => [k, resto[k]]);
  return `${nome}:${JSON.stringify(ordenado)}`;
}

class Confirmacoes {
  constructor() {
    this.pendente = null; // { nome, args, chave, dono }
    this.aprovada = null; // chave liberada para UMA execução
    this.aprovadaDono = null;
    // De qual conversa é o pedido em andamento (26/11/2026, conversas
    // simultâneas). O main.js liga isto à conversa do turno; sem ligação, null,
    // e tudo funciona como antes.
    this.quemPede = () => null;
  }

  /** A ferramenta pediu o sim: guarda o que precisa ser aprovado. */
  pedir(nome, args) {
    this.pendente = { nome, args, chave: assinatura(nome, args), dono: this.quemPede() };
    this.aprovada = null;
    this.aprovadaDono = null;
  }

  /**
   * Chamado a cada fala dele, antes de ela pensar. Sim aprova o pendente;
   * qualquer outra coisa (não, ou mudar de assunto) descarta. O sim vale só
   * para a resposta desta fala: aprovação velha não fica rondando.
   * Devolve "sim" | "nao" | "ignorado" | null (null = não havia pedido).
   *
   * `dono` é a conversa em que ele falou. Com duas conversas andando ao mesmo
   * tempo, o "sim" dito numa NUNCA aprova o que a outra pediu — nem descarta:
   * o pedido espera ele voltar para a conversa dele.
   */
  aoFalarDele(texto, dono = null) {
    const p = this.pendente;
    const outra = (d) => d != null && dono != null && d !== dono;
    if (p ? outra(p.dono) : outra(this.aprovadaDono)) return null;
    this.pendente = null;
    this.aprovada = null;
    this.aprovadaDono = null;
    if (!p) return null;
    const r = lerResposta(texto);
    if (r === "sim") {
      this.aprovada = p.chave;
      this.aprovadaDono = p.dono ?? dono;
      return "sim";
    }
    return r === "nao" ? "nao" : "ignorado";
  }

  /** confirmed=true vale? Consome a aprovação: um sim, uma execução — e só na conversa em que ele disse sim. */
  liberar(nome, args) {
    if (!this.aprovada || this.aprovada !== assinatura(nome, args)) return false;
    const quem = this.quemPede();
    if (this.aprovadaDono != null && quem != null && quem !== this.aprovadaDono) return false;
    this.aprovada = null;
    this.aprovadaDono = null;
    return true;
  }

  get temPedido() {
    return !!this.pendente;
  }
}

// ---------------------------------------------------------------------------
// [opções: A | B] no fim da resposta
// ---------------------------------------------------------------------------
const MARCA = /\[\s*op[çc][õo]es\s*:\s*([^\]\n]*)\]/i;
const PREFIXO = "[opções:";

/** Tira a marca do texto e devolve os rótulos (2 a 3, curtos) ou null. */
function extrairOpcoes(texto) {
  const s = String(texto ?? "");
  const m = s.match(MARCA);
  if (!m) return { texto: s, opcoes: null };
  const limpo = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).replace(/[ \t]+\n/g, "\n").trim();
  // ";" é o separador do prompt (pipe é proibido lá: vira tabela e é lido em voz alta);
  // "|" também vale, porque modelo escreve o que quer.
  const opcoes = [...new Set(m[1].split(/[;|]/).map((x) => x.trim().replace(/^["'`]|["'`]$/g, "")).filter(Boolean))]
    .map((x) => (x.length > 40 ? x.slice(0, 39).trimEnd() + "…" : x))
    .slice(0, 3);
  return { texto: limpo, opcoes: opcoes.length >= 2 ? opcoes : null };
}

/// A fala chega em pedaços (a voz de conversa manda quase palavra a palavra),
/// então a marca pode vir partida: "[op" + "ções: Sim" + " | Não]". Este filtro
/// solta o texto normal na hora e segura só o que PODE ser começo de marca,
/// até ela fechar — senão "colchete opções dois pontos" iria para a voz.
function filtroDeOpcoes(onSay, onOpcoes) {
  let segurado = "";
  const podeSerPrefixo = (t) => {
    const a = tirarAcento(t).toLowerCase().replace(/\s+/g, "");
    const p = tirarAcento(PREFIXO).toLowerCase();
    return a.length <= p.length ? p.startsWith(a) : a.startsWith(p);
  };
  const soltar = (t) => {
    if (t && /\S/.test(t)) onSay(t);
  };
  return {
    say(t) {
      segurado += String(t ?? "");
      for (;;) {
        const i = segurado.indexOf("[");
        if (i < 0) {
          soltar(segurado);
          segurado = "";
          return;
        }
        const resto = segurado.slice(i);
        if (!podeSerPrefixo(resto.split("]")[0])) {
          // Colchete comum ("[link]"): solta até ele e continua procurando.
          soltar(segurado.slice(0, i + 1));
          segurado = segurado.slice(i + 1);
          continue;
        }
        const fecha = resto.indexOf("]");
        if (fecha < 0) {
          // Ainda chegando: solta o que vem antes e espera o resto da marca.
          if (i > 0) {
            soltar(segurado.slice(0, i));
            segurado = resto;
          }
          return;
        }
        const { texto, opcoes } = extrairOpcoes(resto.slice(0, fecha + 1));
        soltar(segurado.slice(0, i) + texto);
        if (opcoes) onOpcoes(opcoes);
        segurado = resto.slice(fecha + 1);
      }
    },
    /** Fim da resposta: o que sobrou (marca que nunca fechou) sai como texto. */
    fim() {
      const { texto, opcoes } = extrairOpcoes(segurado);
      soltar(texto);
      if (opcoes) onOpcoes(opcoes);
      segurado = "";
    },
  };
}

module.exports = {
  ROTULOS_CONFIRMACAO,
  lerResposta,
  assinatura,
  Confirmacoes,
  extrairOpcoes,
  filtroDeOpcoes,
};
