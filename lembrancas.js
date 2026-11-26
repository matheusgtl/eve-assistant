// lembrancas.js — o que ela aprendeu com os agentes e passa a responder sozinha.
//
// 26/11/2026: "quero que ela pense mais com a rede neural do que com os outros
// modelos, e que delegue quando precisar e aprenda com eles também". A rede de
// linguagem (pensamento.js) só sabia responder o que é código lendo dado
// (hora, bateria, lembretes). Tudo que era CONHECIMENTO — "o que é uma rede
// neural", "como funciona um transformer" — ia para o agente toda vez, mesmo
// que ele já tivesse respondido a mesma pergunta ontem.
//
// Agora, quando um agente responde uma pergunta de conhecimento SEM usar
// ferramenta nenhuma, a resposta fica guardada aqui. Na próxima vez que ele
// perguntar a mesma coisa (mesmas palavras que importam, mesmo tipo de
// pergunta), ela responde de memória, sem chamar ninguém, e a tela diz que foi
// "lembrou do que aprendeu com o agente". Se ele disser "não era isso", a
// lembrança é esquecida e a pergunta vai para o agente de novo.
//
// O que NUNCA vira lembrança (cada filtro tem um porquê):
//   • turno com ferramenta: o dado era da hora (pesquisa, arquivo, sistema), ou
//     ela agiu — repetir a resposta seria mentir que agiu de novo;
//   • pergunta sobre o tempo que passa (hoje, notícias, preço, jogo, previsão):
//     a resposta envelhece;
//   • pergunta que depende da conversa ("e isso?", "continua", "ele"): fora
//     dela, a resposta não faz sentido;
//   • pergunta sobre ele ou os dados dele (meu, minha, eu, saldo, agenda): a
//     resposta veio das notas e do estado do momento, não é conhecimento;
//   • pedido (abre, cria, escreve, faz...): é ação ou é para ser feito de novo;
//   • resposta que conta uma ação (anotei, criei, mandei...), que admite não
//     saber, que pergunta de volta, ou que fala de "hoje"/"agora".
//
// Isto não é o roteamento reprovado em 02/11: lá, uma voz de conversa decidia
// sozinha e dizia ter feito o que não fez. Aqui a resposta é, palavra por
// palavra, a que o agente já deu para a mesma pergunta, e só pergunta de
// conhecimento, sem ação, entra.

"use strict";

const VERSAO = 1;
const MAX = 300;
const VALIDADE = 60 * 24 * 3_600_000; // 60 dias: conhecimento também envelhece
const SIMILARIDADE_MIN = 0.8;

const tirarAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalizar = (t) => tirarAcento(t).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

// Palavras que não dizem do que a pergunta trata. Não estão aqui as palavras
// de pergunta (como, quem, quando...) — essas viram o TIPO, que precisa casar.
const VAZIAS = new Set(
  ("a o as os e de da do das dos em no na nos nas um uma uns umas que me te se pra pro para por favor voce vc " +
    "ta esta estao eh ai sexta feira oi ola ne ja so com sobre aqui la isso isto esse essa sabe saber pode " +
    "poderia consegue explica explique explicar fala fale falar diz diga dizer conta conte contar mim gostaria " +
    "queria quero entender ser sao seria significa significado").split(" ")
);

const TEMPORAL =
  /\b(hoje|agora|amanha|ontem|atual|atualmente|momento|semana|mes|ano que vem|noticia|noticias|preco|precos|cotacao|dolar|euro|bitcoin|clima|previsao|chover|chuva|temperatura|placar|jogo|resultado|eleicao|eleicoes|ultimo|ultima|ultimos|ultimas|recente|recentes|novidade|novidades|lancamento|versao|horas?|data|dia)\b/;
const CONTEXTUAL =
  /\b(isso|isto|esse|essa|esses|essas|aquilo|aquele|aquela|ele|ela|eles|elas|dele|dela|deles|continua|continue|continuar|de novo|tambem|mesmo|mesma|anterior|acima|antes|seguinte|resto|outra vez|disse|falou|falamos|conversamos|era|nao era)\b/;
const PESSOAL =
  /\b(eu|meu|minha|meus|minhas|comigo|mim|nosso|nossa|saldo|gasto|gastos|gastei|conta|agenda|compromisso|lembrete|lembretes|bateria|cpu|memoria|disco|computador|mac|arquivo|arquivos|pasta|nota|notas|obsidian|cofre)\b/;
const PEDIDO =
  /^(abre|abra|abrir|fecha|feche|cria|crie|criar|manda|mande|envia|envie|apaga|apague|deleta|remove|remova|move|mova|copia|copie|instala|instale|roda|rode|executa|execute|liga|ligue|desliga|desligue|anota|anote|salva|salve|registra|registre|marca|marque|agenda|agende|lembra|lembre|pesquisa|pesquise|procura|procure|busca|busque|toca|toque|baixa|baixe|organiza|organize|escreve|escreva|faz|faca|traduz|traduza|resume|resuma|le|leia|gera|gere|calcula|calcule|mostra|mostre|lista|liste|me da|me de|inventa|invente|cante|canta)\b/;
const RESPOSTA_DE_ACAO =
  /\b(anotei|criei|salvei|mandei|enviei|apaguei|removi|abri|liguei|desliguei|registrei|marquei|agendei|pesquisei|procurei|busquei|encontrei|instalei|movi|copiei|baixei|executei|rodei|li o|li a|olhei|verifiquei|conferi)\b/;
const RESPOSTA_FRACA =
  /\b(nao consegui|nao sei|nao tenho (acesso|como)|nao posso|nao encontrei|deu erro|ocorreu um erro|desculpa|desculpe|hoje|neste momento|no momento|atualmente)\b/;

/// O tipo da pergunta: "o que é X" e "por que X" com as mesmas palavras são
/// perguntas diferentes, e as palavras sozinhas não separam as duas.
function tipoDe(norm) {
  if (/\b(por que|porque|pq|por qual motivo)\b/.test(norm)) return "porque";
  if (/\b(qual a diferenca|diferenca entre|diferenca de)\b/.test(norm)) return "diferenca";
  if (/\b(como)\b/.test(norm)) return "como";
  if (/\b(quem)\b/.test(norm)) return "quem";
  if (/\b(quando)\b/.test(norm)) return "quando";
  if (/\b(onde)\b/.test(norm)) return "onde";
  if (/\b(quanto|quantos|quantas)\b/.test(norm)) return "quanto";
  if (/\b(qual|quais)\b/.test(norm)) return "qual";
  return "oque";
}

const radical = (w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
const PERGUNTA = new Set(["como", "quem", "quando", "onde", "quanto", "quantos", "quantas", "qual", "quais", "porque", "pq", "oque", "diferenca", "entre"]);

function palavrasDe(norm) {
  return [...new Set(norm.split(" ").filter((w) => w && !VAZIAS.has(w) && !PERGUNTA.has(w)).map(radical))];
}

function similaridade(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const comuns = a.filter((w) => B.has(w)).length;
  return comuns / (a.length + b.length - comuns); // Jaccard
}

/// A pergunta pode virar lembrança? Devolve o motivo de não poder, ou null.
function porQueNaoGuardar(pergunta, resposta) {
  const p = normalizar(pergunta);
  const r = normalizar(resposta);
  const palavras = palavrasDe(p);
  if (!palavras.length) return "pergunta sem assunto";
  if (palavras.length > 14 || String(pergunta).length > 200) return "pergunta longa demais";
  if (PEDIDO.test(p)) return "é pedido, não pergunta";
  if (TEMPORAL.test(p)) return "a resposta envelhece";
  if (CONTEXTUAL.test(p)) return "depende da conversa";
  if (PESSOAL.test(p)) return "é sobre ele ou os dados dele";
  const texto = String(resposta || "").trim();
  if (texto.length < 40) return "resposta curta demais";
  if (texto.length > 3000) return "resposta longa demais";
  if (/\?\s*$/.test(texto)) return "a resposta pergunta de volta";
  if (RESPOSTA_DE_ACAO.test(r)) return "a resposta conta uma ação";
  if (RESPOSTA_FRACA.test(r)) return "a resposta não é conhecimento firme";
  return null;
}

class Lembrancas {
  constructor(salvo = null, { agora = () => Date.now() } = {}) {
    this.agora = agora;
    const valido = salvo && salvo.versao === VERSAO && Array.isArray(salvo.itens);
    this.itens = valido
      ? salvo.itens.filter(
          (i) => i && typeof i.pergunta === "string" && typeof i.resposta === "string" && Number.isFinite(i.em) && !porQueNaoGuardar(i.pergunta, i.resposta)
        )
      : [];
    for (const i of this.itens) {
      const n = normalizar(i.pergunta);
      i.palavras = palavrasDe(n);
      i.tipo = tipoDe(n);
      i.usos = Number(i.usos) || 0;
    }
    this.descartar();
  }

  /// Tira as vencidas e, passando do teto, as menos usadas e mais velhas.
  descartar() {
    const agora = this.agora();
    this.itens = this.itens.filter((i) => agora - i.em < VALIDADE);
    if (this.itens.length > MAX) {
      this.itens.sort((a, b) => b.usos - a.usos || b.em - a.em);
      this.itens.length = MAX;
    }
  }

  /// A lembrança para esta pergunta, ou null. Mesmo tipo de pergunta e
  /// quase as mesmas palavras (Jaccard ≥ 0,8).
  lembrar(pergunta) {
    const n = normalizar(pergunta);
    if (porQueNaoGuardar(pergunta, "x".repeat(50)) !== null) return null; // a pergunta nem poderia ter sido guardada
    const palavras = palavrasDe(n);
    const tipo = tipoDe(n);
    let melhor = null;
    for (const i of this.itens) {
      if (i.tipo !== tipo) continue;
      const s = similaridade(palavras, i.palavras);
      if (s >= SIMILARIDADE_MIN && (!melhor || s > melhor.similaridade || (s === melhor.similaridade && i.em > melhor.item.em))) {
        melhor = { item: i, similaridade: s };
      }
    }
    return melhor ? { pergunta: melhor.item.pergunta, resposta: melhor.item.resposta, similaridade: melhor.similaridade, item: melhor.item } : null;
  }

  usou(lembranca) {
    if (lembranca?.item) lembranca.item.usos++;
  }

  /// Depois de um agente responder. Devolve true se guardou.
  aprender(pergunta, resposta, { ferramentas = [], escolhas = false, corrigida = false } = {}) {
    if (ferramentas.length || escolhas || corrigida) return false;
    if (porQueNaoGuardar(pergunta, resposta)) return false;
    const n = normalizar(pergunta);
    const palavras = palavrasDe(n);
    const tipo = tipoDe(n);
    // A mesma pergunta de novo: a resposta nova substitui a velha.
    this.itens = this.itens.filter((i) => !(i.tipo === tipo && similaridade(palavras, i.palavras) >= SIMILARIDADE_MIN));
    this.itens.push({ pergunta: String(pergunta).trim(), resposta: String(resposta).trim(), em: this.agora(), usos: 0, palavras, tipo });
    this.descartar();
    return true;
  }

  /// "Não era isso": a lembrança sai.
  esquecer(pergunta) {
    const n = normalizar(pergunta);
    const palavras = palavrasDe(n);
    const tipo = tipoDe(n);
    const antes = this.itens.length;
    this.itens = this.itens.filter((i) => !(i.tipo === tipo && similaridade(palavras, i.palavras) >= SIMILARIDADE_MIN));
    return this.itens.length < antes;
  }

  get tamanho() {
    return this.itens.length;
  }

  salvar() {
    return {
      versao: VERSAO,
      itens: this.itens.map(({ pergunta, resposta, em, usos }) => ({ pergunta, resposta, em, usos })),
    };
  }
}

module.exports = { Lembrancas, porQueNaoGuardar, tipoDe, palavrasDe, similaridade, SIMILARIDADE_MIN, MAX: MAX, VALIDADE };
