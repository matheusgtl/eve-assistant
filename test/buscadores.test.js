// buscadores.test.js — a corrente de pesquisa na web.
//
// Existe porque a cota da Busca do Google acabou no meio de um dia de uso real
// e TODA pesquisa passou a cair na Wikipédia — que não sabe preço, notícia nem
// resultado de jogo. A corrente é a resposta: vários buscadores, cada um só se
// tiver chave, e quem responder primeiro ganha.
//
// O que não pode quebrar:
//   • cada buscador precisa pedir do jeito que a API dele espera (chave no
//     cabeçalho certo, resultado no campo certo);
//   • quem não tem chave não é tentado — nem para errar;
//   • resposta de reserva vem ANUNCIADA como reserva;
//   • o cache impede a mesma pergunta de gastar busca duas vezes;
//   • ninguém devolve resposta inventada quando todos falham.
// Rode com: node test/buscadores.test.js

const http = require("node:http");
const assert = require("node:assert");

const vistos = [];
let fora = new Set();

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const [caminho, consulta] = req.url.split("?");
    const nome = caminho.split("/")[1];
    vistos.push({ nome, caminho, consulta, body, cabecalhos: req.headers });
    res.setHeader("content-type", "application/json");

    if (fora.has(nome)) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ error: { message: `${nome} sem cota` } }));
    }

    if (caminho === "/tavily/search") {
      return res.end(
        JSON.stringify({
          answer: "O dólar fechou a 5,12 reais.",
          results: [
            { title: "Câmbio hoje", url: "https://ex.com/a", content: "Dólar a R$ 5,12 no fechamento." },
          ],
        })
      );
    }
    if (caminho === "/serper/search") {
      return res.end(
        JSON.stringify({
          answerBox: { answer: "R$ 5,12" },
          organic: [{ title: "Cotação", link: "https://ex.com/b", snippet: "Fechou a 5,12." }],
        })
      );
    }
    if (caminho === "/brave/web/search") {
      return res.end(
        JSON.stringify({
          web: { results: [{ title: "Dólar", url: "https://ex.com/c", description: "5,12 reais." }] },
        })
      );
    }
    if (caminho === "/langsearch/web-search") {
      return res.end(
        JSON.stringify({
          data: { webPages: { value: [{ name: "Dólar hoje", url: "https://ex.com/d", summary: "5,12." }] } },
        })
      );
    }
    if (caminho === "/searx/search") {
      return res.end(
        JSON.stringify({ answers: ["5,12 reais"], results: [{ title: "Câmbio", url: "https://ex.com/e", content: "5,12" }] })
      );
    }
    // Reservas: vazias de propósito neste teste.
    res.statusCode = 404;
    res.end("{}");
  });
});

(async () => {
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  process.env.EV_TAVILY_API = `${base}/tavily`;
  process.env.EV_SERPER_API = `${base}/serper`;
  process.env.EV_BRAVE_API = `${base}/brave`;
  process.env.EV_LANGSEARCH_API = `${base}/langsearch`;
  process.env.EV_DDG_API = `${base}/ddg`;
  process.env.EV_WIKI_API = `${base}/wiki`;
  process.env.EV_GEMINI_API = `${base}/gemini`;

  const web = require("../web.js");
  const searx = `${base}/searx`;

  // ------------------------------------- 1. cada um fala a sua língua
  web.limparCache();
  web.limparDescansos();
  const t = await web.pesquisar("dólar hoje", { chaves: { tavilyKey: "tv-1" } });
  assert.strictEqual(t.fonte, "tavily");
  assert.match(t.texto, /5,12/, "a resposta pronta do Tavily entra no texto");
  assert.match(t.texto, /\[1\]/, "e os trechos vêm numerados, para ela poder citar");
  assert.strictEqual(t.links[0].url, "https://ex.com/a");
  const pedidoTavily = vistos.find((v) => v.caminho === "/tavily/search");
  assert.strictEqual(pedidoTavily.cabecalhos.authorization, "Bearer tv-1", "Tavily usa Bearer");

  web.limparCache();
  web.limparDescansos();
  const s = await web.pesquisar("dólar hoje", { chaves: { serperKey: "sp-1" } });
  assert.strictEqual(s.fonte, "serper");
  const pedidoSerper = vistos.find((v) => v.caminho === "/serper/search");
  assert.strictEqual(pedidoSerper.cabecalhos["x-api-key"], "sp-1", "Serper usa x-api-key");
  const corpoSerper = JSON.parse(pedidoSerper.body);
  assert.strictEqual(corpoSerper.gl, "br", "sem gl/hl o Serper responde com resultado dos EUA");
  assert.strictEqual(corpoSerper.hl, "pt-br");

  web.limparCache();
  web.limparDescansos();
  const b = await web.pesquisar("dólar hoje", { chaves: { braveKey: "br-1" } });
  assert.strictEqual(b.fonte, "brave");
  const pedidoBrave = vistos.find((v) => v.caminho === "/brave/web/search");
  assert.strictEqual(pedidoBrave.cabecalhos["x-subscription-token"], "br-1", "Brave usa x-subscription-token");

  web.limparCache();
  web.limparDescansos();
  assert.strictEqual((await web.pesquisar("dólar hoje", { chaves: { langsearchKey: "ls" } })).fonte, "langsearch");
  web.limparCache();
  web.limparDescansos();
  assert.strictEqual((await web.pesquisar("dólar hoje", { chaves: { searxUrl: searx } })).fonte, "searxng");

  // ------------------------------- 2. quem não tem chave não é tentado
  const antes = vistos.length;
  web.limparCache();
  web.limparDescansos();
  await web.pesquisar("dólar hoje", { chaves: { tavilyKey: "tv-1" } });
  const novos = vistos.slice(antes).map((v) => v.nome);
  assert.ok(!novos.includes("serper"), "sem chave do Serper, nem bate na porta dele");
  assert.ok(!novos.includes("brave"), "idem Brave");
  assert.ok(!novos.includes("gemini"), "sem chave do Gemini, o grounding nem é tentado");

  // --------------------- 3. um seca, o seguinte assume — e isso é dito
  fora = new Set(["tavily"]);
  web.limparCache();
  web.limparDescansos();
  const r = await web.pesquisar("dólar hoje", { chaves: { tavilyKey: "tv-1", serperKey: "sp-1" } });
  assert.strictEqual(r.fonte, "serper", "o próximo da corrente assume");
  assert.ok(r.aviso, "resposta de reserva tem de vir anunciada como reserva");
  fora = new Set();

  // ------------------------------------------------------ 4. o cache
  // O log de uso real mostrou quatro web_search idênticos em seis segundos.
  // Cada um era uma busca paga de verdade.
  web.limparCache();
  web.limparDescansos();
  const antesDoCache = vistos.filter((v) => v.nome === "tavily").length;
  await web.pesquisar("preço do café", { chaves: { tavilyKey: "tv-1" } });
  const repetida = await web.pesquisar("  PREÇO do Café  ", { chaves: { tavilyKey: "tv-1" } });
  const depois = vistos.filter((v) => v.nome === "tavily").length;
  assert.strictEqual(depois - antesDoCache, 1, "a mesma pergunta não pode gastar duas buscas");
  assert.strictEqual(repetida.doCache, true, "e quem recebe precisa saber que veio do cache");
  assert.strictEqual(repetida.fonte, "tavily");

  // ------------------- 4b. buscador que secou não é tentado de novo na hora
  // Com a cota do Google esgotada, toda pesquisa do dia começava com duas
  // chamadas condenadas — 1,3s de espera antes de tentar quem funciona.
  fora = new Set(["tavily"]);
  web.limparCache();
  web.limparDescansos();
  await web.pesquisar("primeira pergunta", { chaves: { tavilyKey: "tv-1", serperKey: "sp-1" } });
  assert.strictEqual(web.estaSeco("tavily"), true, "limite estourado põe o buscador de molho");

  const antesDeSecar = vistos.filter((v) => v.nome === "tavily").length;
  await web.pesquisar("segunda pergunta", { chaves: { tavilyKey: "tv-1", serperKey: "sp-1" } });
  assert.strictEqual(
    vistos.filter((v) => v.nome === "tavily").length,
    antesDeSecar,
    "na pergunta seguinte ele é pulado, sem gastar a ida e a volta"
  );
  fora = new Set();

  // Limpar o CACHE não pode apagar o descanso. Caso real, do log de 27/10: ele
  // salvou uma chave do Serper às 16:32, o salvamento limpou o cache, e junto
  // foi a marca de que o Google estava seco — às 16:34 a sondagem condenada
  // voltou, cinco minutos depois de um descanso de trinta. São duas coisas:
  // uma diz "já respondi isso", a outra diz "a cota deste acabou".
  fora = new Set(["tavily"]);
  web.limparCache();
  web.limparDescansos();
  await web.pesquisar("qualquer", { chaves: { tavilyKey: "tv-1", serperKey: "sp-1" } });
  assert.strictEqual(web.estaSeco("tavily"), true);
  web.limparCache();
  assert.strictEqual(web.estaSeco("tavily"), true, "limpar o cache não pode acordar quem secou");
  web.limparDescanso("tavily");
  assert.strictEqual(web.estaSeco("tavily"), false, "mas trocar a chave DELE acorda, e só ele");
  fora = new Set();

  // Erro de rede NÃO seca: pode ser o wi-fi dele, e desligar o buscador por
  // causa disso seria desligar o que está funcionando.
  web.limparCache();
  web.limparDescansos();
  await web
    .pesquisar("terceira", { chaves: { searxUrl: "http://127.0.0.1:9/nao-existe" } })
    .catch(() => {});
  assert.strictEqual(web.estaSeco("searxng"), false, "falha de rede é passageira, não é cota");

  // ------------------------------- 5. todos falham → erro, não invenção
  fora = new Set(["tavily", "serper", "brave", "langsearch", "searx"]);
  web.limparCache();
  web.limparDescansos();
  const erro = await web
    .pesquisar("qualquer coisa", { chaves: { tavilyKey: "tv-1", serperKey: "sp-1" } })
    .then(() => null, (e) => e);
  assert.ok(erro, "deveria falhar em vez de devolver resposta vazia");
  assert.strictEqual(erro.semResultado, true);
  assert.ok(erro.tentados.length >= 2, "e dizer o que foi tentado, para dar para consertar");
  fora = new Set();

  // --------------------------------- 6. a ordem é a da qualidade
  const ordem = web.BUSCADORES.map((x) => x.nome);
  assert.strictEqual(ordem[0], "google", "o grounding do Google vem primeiro: já está pago na chave dela");
  assert.strictEqual(ordem[ordem.length - 1], "wikipedia", "a Wikipédia é a última reserva, não a primeira opção");
  assert.ok(
    ordem.indexOf("tavily") < ordem.indexOf("duckduckgo"),
    "buscador de verdade antes da resposta instantânea"
  );

  servidor.close();
  console.log("✓ corrente de busca: cinco buscadores, cache e reserva anunciada");
  console.log("   cada API         → cabeçalho e campos próprios, pt-BR onde dá");
  console.log("   sem chave        → nem é tentado");
  console.log("   mesma pergunta   → uma busca só (o cache de 10 min)");
  console.log("   cota estourada   → de molho 30 min; rede caindo → continua na fila");
  console.log("   limpar cache     → não acorda quem secou (eram a mesma função)");
  console.log("   todos fora       → erro com a lista do que falhou, nunca invenção");
})();
