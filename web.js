// web.js — acesso à internet da E.V.E: pesquisa e leitura de páginas.
//
// RASPAR BUSCADOR NÃO FUNCIONA MAIS. Testei de novo em outubro de 2026, com
// curl: DuckDuckGo (html e lite) responde "Unfortunately, bots use DuckDuckGo
// too" com desafio anti-robô; Mojeek pede JavaScript para resolver um captcha;
// as instâncias públicas de SearXNG devolvem 429 ou página de verificação, e a
// saída `format=json` vem desligada nas que respondem. Startpage e Qwant já
// estavam assim antes. Não é questão de cabeçalho ou de User-Agent: é desafio
// no servidor. Raspar isso seria frágil e quebraria calado.
//
// Então a pesquisa é uma CORRENTE de buscadores, na mesma ideia da corrente de
// cérebros: tenta um, cai para o próximo. Cada um só entra se tiver chave.
//
//   1. Busca do Google pelo próprio Gemini ("grounding") — já vem na chave que
//      ela usa para pensar, sem cadastro novo. Tem cota diária: quando ela
//      acaba, acaba para a busca também, e era esse o buraco.
//   2. Tavily — feito para LLM, 1.000 buscas/mês grátis, sem cartão.
//   3. Serper — resultados do Google, 2.500 buscas grátis na criação da conta.
//   4. Brave Search — US$5 de crédito por mês (~1.000 buscas), pede cartão.
//   5. LangSearch — plano gratuito, medido em tokens por dia.
//   6. SearXNG próprio — se ele tiver uma instância, entra sem chave.
//   7. Reservas sem chave nenhuma: resposta instantânea do DuckDuckGo e
//      Wikipédia. Não cobrem tudo — e aí ela DIZ que não achou, em vez de
//      inventar.
//
// E tem cache. Isso não é otimização: o log mostrou a E.V.E chamando
// web_search quatro vezes com a mesma pergunta em seis segundos, porque a
// resposta fraca da reserva a fazia tentar de novo. Quatro buscas pagas para
// uma pergunta. Dez minutos de cache resolvem isso sem ela perceber.

const GEMINI_API = process.env.EV_GEMINI_API || "https://generativelanguage.googleapis.com/v1beta";
const DDG_API = process.env.EV_DDG_API || "https://api.duckduckgo.com";
const WIKI_API = process.env.EV_WIKI_API || "https://pt.wikipedia.org/w/api.php";

// Cada base é sobrescrevível para os testes apontarem a um servidor falso.
const TAVILY_API = process.env.EV_TAVILY_API || "https://api.tavily.com";
const SERPER_API = process.env.EV_SERPER_API || "https://google.serper.dev";
const BRAVE_API = process.env.EV_BRAVE_API || "https://api.search.brave.com/res/v1";
const LANGSEARCH_API = process.env.EV_LANGSEARCH_API || "https://api.langsearch.com/v1";
// Leitor de página que atravessa bloqueio e roda o JavaScript do site. Sem
// chave, e foi o único serviço desse tipo que respondeu 200 no teste.
const JINA_READER = process.env.EV_JINA_API || "https://r.jina.ai";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const LIMITE_PAGINA = 60_000; // caracteres de texto entregues ao cérebro

async function buscarComTempo(url, opcoes = {}, ms = 15_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, {
      ...opcoes,
      signal: ac.signal,
      headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.7", ...(opcoes.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ===========================================================================
// 1. Pesquisa com a Busca do Google, pelo próprio Gemini
// ===========================================================================
/// O nome da ferramenta embutida mudou entre gerações de modelo, então tentamos
/// as duas formas antes de desistir: "google_search" (2.0 em diante) e
/// "google_search_retrieval" (linha 1.5).
const FERRAMENTAS_BUSCA = [{ google_search: {} }, { google_search_retrieval: {} }];

async function pesquisarComGemini(pergunta, { apiKey, model, onDebug }) {
  if (!apiKey || !model) throw new Error("sem chave ou modelo do Gemini");

  let ultimo = null;
  for (const ferramenta of FERRAMENTAS_BUSCA) {
    try {
      const res = await buscarComTempo(
        `${GEMINI_API}/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: pergunta }] }],
            tools: [ferramenta],
            systemInstruction: {
              parts: [
                {
                  text:
                    "Pesquise na web e responda em português do Brasil, de forma curta e factual. " +
                    "Inclua datas e números quando existirem. Se não encontrar, diga que não encontrou.",
                },
              ],
            },
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
          }),
        },
        25_000
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error?.message || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      const candidato = data.candidates?.[0];
      const texto = (candidato?.content?.parts || [])
        .map((p) => p.text || "")
        .join(" ")
        .trim();

      if (!texto) throw new Error("resposta vazia da busca");

      return {
        fonte: "google",
        texto,
        consultas: candidato?.groundingMetadata?.webSearchQueries || [],
        links: extrairLinks(candidato?.groundingMetadata),
      };
    } catch (err) {
      ultimo = err;
      onDebug?.(`busca do Google via ${Object.keys(ferramenta)[0]} falhou: ${err.message}`);
    }
  }
  throw ultimo || new Error("busca indisponível");
}

/// Os links citados vêm em groundingChunks; o formato já mudou de nome algumas
/// vezes, por isso leio de forma tolerante em vez de assumir um caminho só.
function extrairLinks(meta) {
  const pedacos = meta?.groundingChunks || meta?.grounding_chunks || [];
  const links = [];
  for (const p of pedacos) {
    const w = p.web || p.retrievedContext || {};
    const url = w.uri || w.url;
    if (url) links.push({ titulo: w.title || w.domain || url, url });
  }
  return links.slice(0, 6);
}

// ===========================================================================
// ===========================================================================
// 2. Buscadores com chave — Tavily, Serper, Brave, LangSearch, SearXNG
// ===========================================================================
/// Todos devolvem lista de links com trecho; só o Tavily devolve resposta
/// pronta. Então o texto entregue ao cérebro é a lista numerada dos trechos —
/// ela sintetiza, que é o que ela faz bem, e com a fonte ao lado de cada
/// pedaço dá para citar sem inventar.
function montarTexto(itens, respostaPronta) {
  const linhas = [];
  // O resumo do Tavily costuma voltar EM INGLÊS, mesmo com a pergunta e as
  // fontes em português — o resumidor dele não tem opção de idioma. Sem este
  // rótulo, o jeito mais provável de ela usar um parágrafo pronto é repetir
  // como está, e aí ela responde em inglês sem motivo nenhum.
  if (respostaPronta) linhas.push(`Resumo do buscador (pode vir em inglês; reescreva em português): ${String(respostaPronta).trim()}`, "");
  itens.forEach((it, i) => {
    // 600 e não 700, com 5 fontes e não 6: o resultado de uma busca fica no
    // histórico e viaja em TODO pedido seguinte. Eram ~1.125 tokens por busca
    // acumulada; assim são ~790. Cinco fontes continuam sendo mais do que ela
    // cita numa resposta falada.
    const trecho = (it.trecho || "").replace(/\s+/g, " ").trim().slice(0, 600);
    linhas.push(`[${i + 1}] ${it.titulo}${trecho ? " — " + trecho : ""}`);
  });
  return linhas.join("\n").trim();
}

async function pedirJson(url, { metodo = "GET", corpo, cabecalhos = {}, ms = 15_000 } = {}) {
  const res = await buscarComTempo(
    url,
    {
      method: metodo,
      headers: {
        accept: "application/json",
        ...(corpo ? { "content-type": "application/json" } : {}),
        ...cabecalhos,
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    },
    ms
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(
      data?.error?.message || data?.detail?.error || data?.message || data?.detail || `HTTP ${res.status}`
    );
    err.status = res.status;
    throw err;
  }
  if (!data) throw new Error("resposta não era JSON");
  return data;
}

async function pesquisarTavily(pergunta, chave) {
  const d = await pedirJson(`${TAVILY_API}/search`, {
    metodo: "POST",
    cabecalhos: { authorization: `Bearer ${chave}` },
    // "basic" já resume e custa o mesmo 1 crédito da busca simples.
    corpo: { query: pergunta, max_results: 5, include_answer: "basic", topic: "general" },
  });
  const itens = (d.results || []).map((r) => ({ titulo: r.title || r.url, url: r.url, trecho: r.content }));
  if (!itens.length && !d.answer) return null;
  return {
    fonte: "tavily",
    texto: montarTexto(itens, d.answer),
    links: itens.map(({ titulo, url }) => ({ titulo, url })),
  };
}

async function pesquisarSerper(pergunta, chave) {
  const d = await pedirJson(`${SERPER_API}/search`, {
    metodo: "POST",
    cabecalhos: { "x-api-key": chave },
    // gl/hl em português do Brasil: sem isso vem o resultado dos Estados Unidos.
    corpo: { q: pergunta, gl: "br", hl: "pt-br", num: 5 },
  });
  const itens = (d.organic || []).map((r) => ({ titulo: r.title || r.link, url: r.link, trecho: r.snippet }));
  const pronta = d.answerBox?.answer || d.answerBox?.snippet || d.knowledgeGraph?.description || null;
  if (!itens.length && !pronta) return null;
  return {
    fonte: "serper",
    texto: montarTexto(itens, pronta),
    links: itens.map(({ titulo, url }) => ({ titulo, url })),
  };
}

async function pesquisarBrave(pergunta, chave) {
  const url =
    `${BRAVE_API}/web/search?q=${encodeURIComponent(pergunta)}` +
    `&count=5&country=BR&search_lang=pt&ui_lang=pt-BR`;
  const d = await pedirJson(url, { cabecalhos: { "x-subscription-token": chave } });
  const itens = (d.web?.results || []).map((r) => ({ titulo: r.title || r.url, url: r.url, trecho: r.description }));
  if (!itens.length) return null;
  return {
    fonte: "brave",
    texto: montarTexto(itens, null),
    links: itens.map(({ titulo, url }) => ({ titulo, url })),
  };
}

async function pesquisarLangSearch(pergunta, chave) {
  const d = await pedirJson(`${LANGSEARCH_API}/web-search`, {
    metodo: "POST",
    cabecalhos: { authorization: `Bearer ${chave}` },
    corpo: { query: pergunta, count: 5, summary: true },
  });
  const valores = d.data?.webPages?.value || d.webPages?.value || [];
  const itens = valores.map((r) => ({ titulo: r.name || r.url, url: r.url, trecho: r.summary || r.snippet }));
  if (!itens.length) return null;
  return {
    fonte: "langsearch",
    texto: montarTexto(itens, null),
    links: itens.map(({ titulo, url }) => ({ titulo, url })),
  };
}

/// Instância de SearXNG dele. As públicas não servem (429/captcha), mas uma
/// própria serve e não custa chave — por isso é endereço no config, não chave.
async function pesquisarSearx(pergunta, base) {
  const raiz = String(base).replace(/\/+$/, "");
  const d = await pedirJson(`${raiz}/search?q=${encodeURIComponent(pergunta)}&format=json&language=pt-BR`);
  const itens = (d.results || []).slice(0, 5).map((r) => ({ titulo: r.title || r.url, url: r.url, trecho: r.content }));
  const pronta = (d.answers || [])[0] || null;
  if (!itens.length && !pronta) return null;
  return {
    fonte: "searxng",
    texto: montarTexto(itens, pronta),
    links: itens.map(({ titulo, url }) => ({ titulo, url })),
  };
}

// 3. Reservas sem chave — resposta instantânea do DuckDuckGo e Wikipédia
// ===========================================================================
async function pesquisarDuckDuckGo(pergunta) {
  const url = `${DDG_API}/?q=${encodeURIComponent(pergunta)}&format=json&no_html=1&skip_disambig=1`;
  const res = await buscarComTempo(url, {}, 10_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const texto = (data.AbstractText || data.Abstract || "").trim();
  const relacionados = (data.RelatedTopics || [])
    .map((t) => (t.Text || "").trim())
    .filter(Boolean)
    .slice(0, 4);

  if (!texto && !relacionados.length) return null;
  return {
    fonte: "duckduckgo",
    texto: texto || relacionados.join(" · "),
    links: data.AbstractURL ? [{ titulo: data.Heading || data.AbstractURL, url: data.AbstractURL }] : [],
  };
}

async function pesquisarWikipedia(pergunta) {
  const busca = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(
    pergunta
  )}&srlimit=3&format=json&origin=*`;
  const res = await buscarComTempo(busca, {}, 10_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const achados = data?.query?.search || [];
  if (!achados.length) return null;

  // O primeiro resultado vira resumo; os outros, só títulos para contexto.
  const titulo = achados[0].title;
  const resumoUrl = `${WIKI_API}?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(
    titulo
  )}&format=json&origin=*`;
  const r2 = await buscarComTempo(resumoUrl, {}, 10_000);
  const d2 = await r2.json().catch(() => ({}));
  const paginas = d2?.query?.pages || {};
  const extrato = Object.values(paginas)[0]?.extract || "";

  return {
    fonte: "wikipedia",
    texto: (extrato || achados[0].snippet.replace(/<[^>]+>/g, "")).slice(0, 2500),
    links: [
      { titulo, url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, "_"))}` },
    ],
    outros: achados.slice(1).map((a) => a.title),
  };
}

// ===========================================================================
// 4. Leitura de uma página — HTML → texto
// ===========================================================================
/// Extração simples e previsível: tira script/style/nav, troca tags por espaço,
/// resolve as entidades mais comuns. Não é um navegador; é o suficiente para a
/// E.V.E ler uma notícia, uma documentação ou um artigo.
function htmlParaTexto(html) {
  let t = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|aside|header)[\s\S]*?<\/\1>/gi, " ");

  const titulo = (t.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";

  t = t
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // Entidades. Página brasileira é cheia de &atilde; e &ccedil;, então o
  // tratamento não pode se limitar a uma listinha: as acentuadas são montadas
  // com o acento combinante e normalizadas (a + ̃ = ã).
  const ACENTO = {
    grave: "̀", acute: "́", circ: "̂", tilde: "̃",
    uml: "̈", ring: "̊", cedil: "̧",
  };
  const ENTIDADES = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'",
    hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»",
    ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·",
    deg: "°", euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®",
    trade: "™", sup2: "²", sup3: "³", frac12: "½", times: "×", divide: "÷",
    oslash: "ø", aelig: "æ", szlig: "ß", ordf: "ª", ordm: "º", shy: "",
  };

  t = t
    .replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (bruta, corpo) => {
      // Numérica: &#233; ou &#xE9;
      if (corpo[0] === "#") {
        const n = corpo[1] === "x" || corpo[1] === "X"
          ? parseInt(corpo.slice(2), 16)
          : parseInt(corpo.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
      }
      // Acentuada: letra + nome do acento (&atilde;, &ccedil;, &eacute;…)
      const m = corpo.match(/^([a-zA-Z])(grave|acute|circ|tilde|uml|ring|cedil)$/);
      if (m) return (m[1] + ACENTO[m[2]]).normalize("NFC");

      const nome = corpo.toLowerCase();
      return nome in ENTIDADES ? ENTIDADES[nome] : " ";
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { titulo: titulo.replace(/\s+/g, " ").trim(), texto: t };
}

/// Leitor de reserva: o r.jina.ai busca a página pelo servidor dele, roda o
/// JavaScript e devolve markdown. Serve nos dois casos em que o fetch direto
/// falha de verdade: site que bloqueia quem não é navegador (403/429/503) e
/// site que só monta o conteúdo com JavaScript — nesse a extração direta volta
/// com HTML vazio, e "página sem texto" é indistinguível de página sem texto.
/// Testado sem chave nenhuma em outubro de 2026.
async function lerComJina(url) {
  const res = await buscarComTempo(
    `${JINA_READER}/${url}`,
    { headers: { accept: "text/plain", "x-respond-with": "markdown" } },
    25_000
  );
  if (!res.ok) throw new Error(`o leitor de reserva respondeu HTTP ${res.status}`);
  const bruto = await res.text();
  const titulo = (bruto.match(/^Title:\s*(.+)$/m) || [])[1] || "";
  // O cabeçalho que ele põe no topo (Title/URL Source/Published Time) não é
  // conteúdo da página: sai, senão vira texto que o modelo cita como se fosse.
  const corpo = bruto.replace(/^[\s\S]*?Markdown Content:\s*/, "").trim() || bruto.trim();
  return {
    url,
    titulo: titulo.trim(),
    texto: corpo.slice(0, LIMITE_PAGINA),
    truncado: corpo.length > LIMITE_PAGINA,
    via: "jina",
  };
}

const TEXTO_CURTO = 200; // menos que isto é página que não entregou conteúdo

async function lerPagina(url) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  let direto = null;
  let motivo = null;
  try {
    direto = await lerDireto(url);
  } catch (err) {
    motivo = err;
  }

  // Conteúdo de verdade pelo caminho direto: pronto, sem gastar o leitor externo.
  if (direto && direto.texto.trim().length >= TEXTO_CURTO) return direto;

  // Não é texto (imagem, vídeo, binário): o leitor de reserva também não vai
  // ajudar, e insistir só atrasaria a resposta.
  if (motivo?.naoEhTexto) throw motivo;

  try {
    return await lerComJina(url);
  } catch (err) {
    // O direto trouxe pouco, mas trouxe: pouco é melhor que nada.
    if (direto) return direto;
    throw motivo || err;
  }
}

/// A leitura direta: um GET e HTML → texto. Era o lerPagina inteiro antes.
async function lerDireto(url) {
  const res = await buscarComTempo(url, { redirect: "follow" }, 20_000);
  const tipo = res.headers.get("content-type") || "";

  if (!res.ok) {
    const err = new Error(`A página respondeu HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (/image|video|audio|octet-stream|pdf/i.test(tipo)) {
    const err = new Error(`Esse endereço não é texto (${tipo.split(";")[0]}).`);
    err.naoEhTexto = true;
    throw err;
  }

  const bruto = await res.text();
  if (/json/i.test(tipo)) {
    return { url: res.url, titulo: "(JSON)", texto: bruto.slice(0, LIMITE_PAGINA) };
  }

  const { titulo, texto } = htmlParaTexto(bruto);
  return {
    url: res.url,
    titulo,
    texto: texto.slice(0, LIMITE_PAGINA),
    truncado: texto.length > LIMITE_PAGINA,
  };
}

// ===========================================================================
// Porta de entrada: a corrente de buscadores, com cache
// ===========================================================================
/// Cache de dez minutos por pergunta. Existe porque o log mostrou quatro
/// chamadas idênticas de web_search em seis segundos: a resposta fraca da
/// reserva fazia o cérebro tentar outra vez, e cada tentativa gastava uma
/// busca de verdade. Dez minutos é o tempo em que "a mesma pergunta" ainda é
/// a mesma pergunta numa conversa — e preço de ação nenhuma muda tanto nisso.
const CACHE_MS = 10 * 60_000;
const cache = new Map();

/// Buscador que secou fica de molho por meia hora.
///
/// Sem isto, com a cota do Google esgotada, TODA pesquisa do dia começava com
/// duas chamadas condenadas ao Gemini — 1,3 segundo de espera antes de ela
/// sequer tentar o buscador que funciona, dez, vinte vezes por dia.
///
/// O prazo depende do TIPO de limite, porque os dois chegam como 429 e são
/// coisas diferentes:
///   • cota do plano estourada (dia, mês) → meia hora. É o caso do Google
///     hoje; não vai voltar nos próximos minutos.
///   • limite por segundo/minuto → dois minutos. Esse se recupera sozinho, e
///     dormir meia hora por causa dele seria trocar o buscador bom pela
///     Wikipédia à toa — exatamente o problema que esta corrente veio resolver.
/// Nenhum prazo é "até amanhã": um prazo curto se conserta sozinho, e o custo
/// de errar para menos é uma única tentativa perdida.
const DESCANSO_COTA_MS = 30 * 60_000;
const DESCANSO_RITMO_MS = 2 * 60_000;
const secos = new Map();

const estaSeco = (nome) => (secos.get(nome) || 0) > Date.now();

/// Só limite conta. Erro de rede é passageiro e pode ser do wi-fi dele;
/// marcar o buscador por causa disso seria desligar o que está funcionando.
function marcarSeSecou(nome, err) {
  const texto = err?.message || String(err);
  const cotaAcabou = /quota|exceeded|billing|plan|credit|cr[ée]dito|limite di[áa]rio|monthly/i.test(texto);
  const ritmo = err?.status === 429 || /rate.?limit|too many|slow down/i.test(texto);
  if (!cotaAcabou && !ritmo) return null;
  const prazo = cotaAcabou ? DESCANSO_COTA_MS : DESCANSO_RITMO_MS;
  secos.set(nome, Date.now() + prazo);
  return cotaAcabou ? "cota" : "ritmo";
}

const chaveDeCache = (p) => (p || "").trim().toLowerCase().replace(/\s+/g, " ");

/// Limpa só o cache de PERGUNTAS. Os descansos são outra coisa e ficam onde
/// estão: um diz "já respondi isso agora há pouco", o outro diz "a cota deste
/// buscador acabou". Juntar os dois foi um erro visível no log — ele salvou
/// uma chave do Serper às 16:32, o salvamento limpou o cache, e com ele foi
/// embora a marca de que o Google estava seco. Às 16:34 a sondagem condenada
/// ao Google voltou, cinco minutos depois de um descanso de trinta.
function limparCache() {
  cache.clear();
}

/// O descanso de UM buscador — para quando a chave dele acabou de mudar e a
/// cota de ontem não diz mais nada sobre a de hoje.
function limparDescanso(nome) {
  secos.delete(nome);
}

/// Todos, para os testes poderem partir de um estado limpo.
function limparDescansos() {
  secos.clear();
}

/// A ordem da corrente. `chave` diz de onde tirar a credencial no config;
/// `exige` false significa que entra sem chave nenhuma.
const BUSCADORES = [
  {
    nome: "google",
    // O grounding do Gemini usa a chave do próprio cérebro, não uma à parte.
    pronto: (c) => !!(c.geminiKey && c.geminiModel),
    rodar: (pergunta, c, onDebug) =>
      pesquisarComGemini(pergunta, { apiKey: c.geminiKey, model: c.geminiModel, onDebug }),
  },
  { nome: "tavily", pronto: (c) => !!c.tavilyKey, rodar: (p, c) => pesquisarTavily(p, c.tavilyKey) },
  { nome: "serper", pronto: (c) => !!c.serperKey, rodar: (p, c) => pesquisarSerper(p, c.serperKey) },
  { nome: "brave", pronto: (c) => !!c.braveKey, rodar: (p, c) => pesquisarBrave(p, c.braveKey) },
  {
    nome: "langsearch",
    pronto: (c) => !!c.langsearchKey,
    rodar: (p, c) => pesquisarLangSearch(p, c.langsearchKey),
  },
  { nome: "searxng", pronto: (c) => !!c.searxUrl, rodar: (p, c) => pesquisarSearx(p, c.searxUrl) },
  { nome: "duckduckgo", pronto: () => true, rodar: (p) => pesquisarDuckDuckGo(p) },
  { nome: "wikipedia", pronto: () => true, rodar: (p) => pesquisarWikipedia(p) },
];

/// Quais buscadores estão de fato disponíveis. A interface usa isto para
/// dizer a verdade no painel em vez de prometer busca que não existe.
function buscadoresProntos(chaves = {}) {
  return BUSCADORES.filter((b) => b.pronto(chaves)).map((b) => b.nome);
}

async function pesquisar(pergunta, opcoes = {}) {
  // Compatibilidade: antes esta função recebia { apiKey, model } soltos.
  const chaves = {
    geminiKey: opcoes.chaves?.geminiKey ?? opcoes.apiKey,
    geminiModel: opcoes.chaves?.geminiModel ?? opcoes.model,
    ...(opcoes.chaves || {}),
  };
  const { onDebug } = opcoes;

  const k = chaveDeCache(pergunta);
  const guardado = cache.get(k);
  if (guardado && Date.now() - guardado.quando < CACHE_MS) {
    onDebug?.(`"${pergunta}" veio do cache (${guardado.resultado.fonte})`);
    return { ...guardado.resultado, doCache: true };
  }

  const problemas = [];
  // O primeiro da fila é o caminho normal; do segundo em diante, a resposta
  // vai anunciada como reserva — quem lê precisa saber que não veio do melhor.
  let primeiro = true;

  // Se TODOS estiverem de molho, os descansos são ignorados: a trava existe
  // para poupar tempo, nunca para transformar "lento" em "sem resposta".
  const disponiveis = BUSCADORES.filter((b) => b.pronto(chaves));
  const acordados = disponiveis.filter((b) => !estaSeco(b.nome));
  const fila = acordados.length ? acordados : disponiveis;

  for (const buscador of fila) {
    try {
      const r = await buscador.rodar(pergunta, chaves, onDebug);
      if (!r) {
        problemas.push(`${buscador.nome}: sem resultado`);
        primeiro = false;
        continue;
      }
      if (!primeiro) {
        onDebug?.(`pesquisa atendida pela reserva: ${buscador.nome}`);
        r.aviso =
          problemas.length && /google/i.test(problemas[0])
            ? `A Busca do Google não estava disponível; isto vem de ${buscador.nome}.`
            : `Isto vem de ${buscador.nome}, não do buscador principal.`;
      }
      cache.set(k, { quando: Date.now(), resultado: r });
      return r;
    } catch (err) {
      problemas.push(`${buscador.nome}: ${err.message}`);
      const secou = marcarSeSecou(buscador.nome, err);
      onDebug?.(
        `${buscador.nome} falhou: ${err.message}` +
          (secou === "cota"
            ? " — de molho por 30 min para não atrasar as próximas buscas"
            : secou === "ritmo"
              ? " — de molho por 2 min (limite de ritmo, se recupera sozinho)"
              : "")
      );
    }
    primeiro = false;
  }

  const erro = new Error("Não consegui pesquisar na web agora. " + problemas.join(" | "));
  erro.semResultado = true;
  erro.tentados = problemas;
  throw erro;
}

module.exports = {
  pesquisar,
  pesquisarComGemini,
  pesquisarTavily,
  pesquisarSerper,
  pesquisarBrave,
  pesquisarLangSearch,
  pesquisarSearx,
  pesquisarDuckDuckGo,
  pesquisarWikipedia,
  buscadoresProntos,
  limparCache,
  limparDescanso,
  limparDescansos,
  estaSeco,
  lerPagina,
  lerComJina,
  htmlParaTexto,
  BUSCADORES,
};
