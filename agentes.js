// agentes.js — quanto cada provedor de IA foi usado, e quanto resta.
//
// Existe por uma razão prática: os planos gratuitos são medidos em TOKENS e
// PEDIDOS POR DIA, não em perguntas. Sem isto, a primeira notícia de que a
// cota acabou é a E.V.E parar de responder no meio de uma conversa.
//
// Três decisões que valem explicar:
//
// 1. O limite preferido é o que O PROVEDOR INFORMA, não um número que eu
//    escrevi aqui. Groq e companhia mandam o saldo em cabeçalhos HTTP a cada
//    resposta (`x-ratelimit-remaining-requests` e amigos). Isso é a conta DELE,
//    da chave DELE, atualizada agora. Tabela de plano gratuito copiada de blog
//    envelhece, varia por conta e por modelo, e erra calado.
//
// 2. A JANELA é deduzida do próprio cabeçalho de reset, não assumida. O mesmo
//    nome de cabeçalho significa coisas diferentes: no Groq, "requests" é por
//    DIA; na OpenAI, por minuto. Como todos mandam junto quanto falta para
//    zerar, a janela sai daí — reset em horas é cota do dia, reset em segundos
//    é cota do minuto. Deduzir é mais barato que manter uma tabela de quem
//    significa o quê.
//
// 3. Quando não há limite conhecido de jeito nenhum, a barra mostra a FATIA DO
//    DIA daquele provedor, dito com essas palavras. Antes, nesse caso não
//    aparecia barra nenhuma — o que na prática parecia painel quebrado, porque
//    o provedor que mais trabalhava era justamente o sem teto publicado.
//    Inventar um limite seria pior; mostrar quem carregou o dia é verdade.

const fs = require("node:fs");
const fsp = require("node:fs/promises");

// Tetos diários publicados, usados só quando o provedor não informa o saldo.
// Cada um traz a fonte: número sem procedência aqui vira mentira com barra.
const LIMITES = {
  groq: {
    pedidosDia: 1000,
    tokensDia: 200_000,
    fonte: "console.groq.com/docs/rate-limits (plano gratuito, por modelo)",
  },
  cerebras: {
    pedidosDia: 14_400,
    tokensDia: 1_000_000,
    fonte: "docs do Cerebras (plano gratuito)",
  },
  openrouter: {
    pedidosDia: 50,
    fonte: "openrouter.ai (modelos :free, sem crédito na conta)",
  },
  // gemini, nvidia, mistral e anthropic ficam de fora de propósito: ou o limite
  // é por modelo e por projeto (Gemini), ou as fontes se contradizem (NVIDIA),
  // ou é pago e não tem teto (Anthropic). Para esses vale o cabeçalho, e na
  // falta dele a fatia do dia.
};

// Nomes de cabeçalho que os provedores usam para o mesmo recado. A ordem é a
// preferência: o primeiro que existir vale.
const CABECALHOS = {
  pedidosLimite: ["x-ratelimit-limit-requests", "anthropic-ratelimit-requests-limit", "ratelimit-limit"],
  pedidosRestantes: [
    "x-ratelimit-remaining-requests",
    "anthropic-ratelimit-requests-remaining",
    "ratelimit-remaining",
  ],
  pedidosReset: ["x-ratelimit-reset-requests", "ratelimit-reset"],
  tokensLimite: ["x-ratelimit-limit-tokens", "anthropic-ratelimit-tokens-limit"],
  tokensRestantes: ["x-ratelimit-remaining-tokens", "anthropic-ratelimit-tokens-remaining"],
  tokensReset: ["x-ratelimit-reset-tokens"],
};

/// "2m59.56s", "1h", "24.9225s", "100ms" → segundos.
/// Os provedores escrevem esse campo em formatos diferentes e nenhum deles é
/// um número puro; um parser tolerante aqui evita barra errada por formatação.
function emSegundos(valor) {
  if (valor == null) return null;
  const t = String(valor).trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t); // já é número de segundos
  // Data absoluta (ISO), que alguns mandam no lugar da duração.
  if (/\d{4}-\d{2}-\d{2}T/.test(t)) {
    const ms = Date.parse(t) - Date.now();
    return Number.isFinite(ms) ? Math.max(0, ms / 1000) : null;
  }
  let total = 0;
  let achou = false;
  for (const [, num, unidade] of t.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g)) {
    const n = Number(num);
    total += unidade === "ms" ? n / 1000 : unidade === "s" ? n : unidade === "m" ? n * 60 : unidade === "h" ? n * 3600 : n * 86400;
    achou = true;
  }
  return achou ? total : null;
}

/// Quanto dura a janela de um limite, deduzida do cabeçalho de reset.
///
/// A primeira versão disto lia o reset como "tempo até a janela virar" — reset
/// em horas seria cota do dia. Está errado, e só os cabeçalhos de verdade
/// mostraram: com 999 de 1000 pedidos livres, o Groq respondeu
/// `x-ratelimit-reset-requests: 1m26.4s`. Se fosse tempo até virar o dia,
/// seriam horas.
///
/// O que esses contadores são é BALDE FURADO: o reset é o tempo de repor o que
/// foi GASTO, não o tamanho da janela. Daí a janela inteira sai por regra de
/// três — e a conta fecha exata nos dois limites medidos:
///
///   pedidos: 86,4s para repor 1 de 1000  → 86,4 × 1000       = 86.400s = 24h
///   tokens:  547ms para repor 73 de 8000 → 0,547 × 8000 / 73 = 59,9s   ≈ 1min
///
/// Sem nada gasto o reset é zero e não há o que deduzir: devolve null, e aí o
/// número não vira barra — barra de janela errada mente.
function janelaCheia(segundos, limite, restantes) {
  if (segundos == null || !(limite > 0) || restantes == null) return null;
  const gasto = limite - restantes;
  if (!(gasto > 0) || !(segundos > 0)) return null;
  return (segundos * limite) / gasto;
}

/// Classifica a janela já calculada. As faixas são largas de propósito: a
/// regra de três tem erro de arredondamento, e a diferença entre um minuto e
/// um dia é de três ordens de grandeza — não precisa de precisão nenhuma.
function janelaDe(segundos) {
  if (segundos == null) return null;
  if (segundos >= 6 * 3600) return "dia";
  if (segundos >= 30 * 60) return "hora";
  return "minuto";
}

/// Traduz os cabeçalhos de uma resposta HTTP no saldo que a interface entende.
/// Aceita um Headers do fetch, um objeto simples ou um Map.
function lerLimites(cabecalhos) {
  if (!cabecalhos) return null;
  const pegar = (nome) => {
    try {
      if (typeof cabecalhos.get === "function") return cabecalhos.get(nome);
      const chave = Object.keys(cabecalhos).find((k) => k.toLowerCase() === nome);
      return chave ? cabecalhos[chave] : null;
    } catch {
      return null;
    }
  };
  const primeiro = (nomes) => {
    for (const n of nomes) {
      const v = pegar(n);
      if (v != null && v !== "") return v;
    }
    return null;
  };

  // Ausente tem de virar null, não zero. Com zero, um provedor que não manda
  // cabeçalho nenhum passaria a dizer "limite 0, restam 0" — e, pior, esse
  // saldo falso sobrescreveria no disco um saldo verdadeiro lido antes.
  const num = (v) => {
    if (v == null || v === "") return null;
    const limpo = String(v).replace(/[^\d.]/g, "");
    if (!limpo) return null;
    const n = Number(limpo);
    return Number.isFinite(n) ? n : null;
  };

  const out = {
    pedidosLimite: num(primeiro(CABECALHOS.pedidosLimite)),
    pedidosRestantes: num(primeiro(CABECALHOS.pedidosRestantes)),
    tokensLimite: num(primeiro(CABECALHOS.tokensLimite)),
    tokensRestantes: num(primeiro(CABECALHOS.tokensRestantes)),
    janelaPedidos: null,
    janelaTokens: null,
  };
  out.janelaPedidos = janelaDe(
    janelaCheia(emSegundos(primeiro(CABECALHOS.pedidosReset)), out.pedidosLimite, out.pedidosRestantes)
  );
  out.janelaTokens = janelaDe(
    janelaCheia(emSegundos(primeiro(CABECALHOS.tokensReset)), out.tokensLimite, out.tokensRestantes)
  );

  const temAlgo = Object.values(out).some((v) => v != null);
  return temAlgo ? out : null;
}

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function zerado() {
  return { pedidos: 0, entrada: 0, saida: 0, erros: 0, estimado: false, ultimo: null, ultimoErro: null, cota: null };
}

class Agentes {
  constructor({ arquivo, onDebug } = {}) {
    this.arquivo = arquivo || null;
    this.onDebug = onDebug || (() => {});
    this.dia = hojeLocal();
    this.porProvedor = {};
    this.ativo = null;
    this.carregar();
  }

  carregar() {
    try {
      if (!this.arquivo || !fs.existsSync(this.arquivo)) return;
      const dados = JSON.parse(fs.readFileSync(this.arquivo, "utf8"));
      // Dado de ontem não serve para "hoje": vira zero em vez de mentir.
      if (dados.dia !== this.dia) return;
      this.porProvedor = dados.porProvedor || {};
    } catch (err) {
      this.onDebug("não consegui ler o uso anterior: " + err.message);
    }
  }

  async salvar() {
    if (!this.arquivo) return;
    try {
      await fsp.writeFile(
        this.arquivo,
        JSON.stringify({ dia: this.dia, porProvedor: this.porProvedor }, null, 2)
      );
    } catch (err) {
      this.onDebug("não consegui gravar o uso: " + err.message);
    }
  }

  /// Virou o dia enquanto o app estava aberto: zera tudo.
  conferirDia() {
    const agora = hojeLocal();
    if (agora === this.dia) return;
    this.dia = agora;
    this.porProvedor = {};
    this.onDebug("virou o dia; contadores de uso zerados");
  }

  de(provedor) {
    this.conferirDia();
    if (!this.porProvedor[provedor]) this.porProvedor[provedor] = zerado();
    return this.porProvedor[provedor];
  }

  /// Um pedido terminou. `entrada`/`saida` em tokens; `estimado` diz se o
  /// provedor informou ou se nós calculamos; `limites` é o saldo que ele mandou
  /// nos cabeçalhos, quando mandou.
  registrar({ provedor, modelo, entrada = 0, saida = 0, estimado = false, erro = null, limites = null }) {
    if (!provedor) return;
    const p = this.de(provedor);
    p.pedidos++;
    p.entrada += Math.max(0, Math.round(entrada));
    p.saida += Math.max(0, Math.round(saida));
    if (estimado) p.estimado = true;
    if (modelo) p.modelo = modelo;
    p.ultimo = Date.now();
    // O saldo de pedidos do dia só desce, então o mais recente é o que vale.
    // Guardo com a hora: saldo de ontem no arquivo não pode virar barra de hoje.
    if (limites) p.cota = { ...limites, visto: Date.now() };
    if (erro) {
      p.erros++;
      p.ultimoErro = String(erro).slice(0, 120);
    }
    this.ativo = provedor;
    this.salvar();
  }

  /// A barra de um provedor, na melhor fonte disponível — e dizendo qual é.
  ///
  /// `origem` não é enfeite: é o que separa "restam 973 de 1000 pedidos, o Groq
  /// acabou de me dizer" de "27% de um teto que eu li na documentação" de
  /// "metade do trabalho do dia passou por aqui". As três informam; confundir
  /// as três não.
  barraDe(p, tokens, maiorDoDia) {
    const cota = p.cota;
    const candidatos = [];

    // Todas as janelas entram como candidata, e no fim ganha A QUE APERTA
    // MAIS. Antes só a janela de DIA era lida, e por isso o aperto que de fato
    // interrompia ele era o único invisível: o Groq gratuito dá 8.000 tokens
    // por MINUTO, e em 31/10 o painel mostrava 5% do teto diário enquanto
    // restavam 208 tokens do minuto. A barra dizia folga no instante em que a
    // resposta ia morrer.
    const JANELAS = { minuto: "no minuto", hora: "na hora", dia: "hoje" };

    for (const [unidade, limite, restantes, janela] of [
      ["pedidos", cota?.pedidosLimite, cota?.pedidosRestantes, cota?.janelaPedidos],
      ["tokens", cota?.tokensLimite, cota?.tokensRestantes, cota?.janelaTokens],
    ]) {
      if (!(limite > 0) || restantes == null || !janela) continue;
      const usados = Math.max(0, limite - restantes);
      candidatos.push({
        fracao: Math.min(1, usados / limite),
        origem: "medido",
        unidade,
        janela,
        usado: usados,
        restante: Math.round(restantes),
        teto: limite,
        rotulo: `${Math.round(restantes)} de ${limite} ${unidade} restam ${JANELAS[janela] || janela}`,
      });
    }

    // Teto publicado. O que aperta primeiro é o que vale: no Groq são 1.000
    // pedidos e 200 mil tokens por dia, e qual chega antes depende da conversa.
    const pub = LIMITES[p.provedorNome];
    if (pub) {
      if (pub.pedidosDia) {
        candidatos.push({
          fracao: Math.min(1, p.pedidos / pub.pedidosDia),
          origem: "publicado",
          unidade: "pedidos",
          janela: "dia",
          usado: p.pedidos,
          restante: Math.max(0, pub.pedidosDia - p.pedidos),
          teto: pub.pedidosDia,
          fonte: pub.fonte,
          rotulo: `${p.pedidos} de ${pub.pedidosDia} pedidos do dia`,
        });
      }
      if (pub.tokensDia) {
        candidatos.push({
          fracao: Math.min(1, tokens / pub.tokensDia),
          origem: "publicado",
          unidade: "tokens",
          janela: "dia",
          usado: tokens,
          restante: Math.max(0, pub.tokensDia - tokens),
          teto: pub.tokensDia,
          fonte: pub.fonte,
          rotulo: `${Math.round((tokens / pub.tokensDia) * 100)}% dos tokens do dia`,
        });
      }
    }

    if (candidatos.length) {
      // Empate em fração: ganha o MEDIDO, que é o número que o provedor mandou.
      const peso = { medido: 0, publicado: 1, relativo: 2 };
      candidatos.sort((a, b) => b.fracao - a.fracao || peso[a.origem] - peso[b.origem]);
      return candidatos[0];
    }

    // Nada publicado e nada informado: a fatia do dia. É uma verdade menor,
    // mas é verdade — e mostra quem está carregando a conversa.
    if (tokens > 0 && maiorDoDia > 0) {
      return {
        fracao: Math.min(1, tokens / maiorDoDia),
        origem: "relativo",
        unidade: "tokens",
        janela: null,
        usado: tokens,
        restante: null,
        teto: null,
        rotulo: "sem teto publicado; barra = fatia do dia",
      };
    }
    return null;
  }

  /// O que a interface desenha. `configurados` vem do config (quem tem chave),
  /// na ordem da corrente, para o painel refletir quem socorre quem.
  resumo(configurados = []) {
    this.conferirDia();
    const nomes = [...new Set([...configurados, ...Object.keys(this.porProvedor)])];

    // O maior consumo do dia é a régua da barra relativa, então sai antes.
    const maiorDoDia = Math.max(
      0,
      ...nomes.map((n) => {
        const p = this.porProvedor[n];
        return p ? p.entrada + p.saida : 0;
      })
    );

    const linhas = [];
    for (const provedor of nomes) {
      const p = { ...(this.porProvedor[provedor] || zerado()), provedorNome: provedor };
      const tokens = p.entrada + p.saida;
      const barra = this.barraDe(p, tokens, maiorDoDia);
      linhas.push({
        provedor,
        modelo: p.modelo || null,
        pedidos: p.pedidos,
        tokens,
        entrada: p.entrada,
        saida: p.saida,
        estimado: p.estimado,
        erros: p.erros,
        ultimoErro: p.ultimoErro,
        ativo: provedor === this.ativo,
        configurado: configurados.includes(provedor),
        barra,
        // Mantidos para quem já lia esses dois campos.
        teto: barra?.teto ?? null,
        fracao: barra ? barra.fracao : null,
      });
    }
    return { dia: this.dia, linhas };
  }
}

module.exports = { Agentes, LIMITES, lerLimites, janelaDe, janelaCheia, emSegundos };
