// web.test.js — o acesso à internet da E.V.E, contra servidores falsos.
//
// O que importa aqui: a pesquisa precisa pedir a Busca do Google do jeito que a
// API espera, aceitar os DOIS nomes da ferramenta embutida (o nome mudou entre
// gerações de modelo), e descer para as fontes abertas quando o Google não
// estiver disponível — sem nunca devolver resposta inventada.
// Rode com: node test/web.test.js

const http = require("node:http");
const assert = require("node:assert");

let cenario = "google-ok";
const pedidos = [];

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const [caminho, consulta] = req.url.split("?");
    res.setHeader("content-type", "application/json");

    // ---------- Gemini com grounding ----------
    if (caminho.includes(":generateContent")) {
      const payload = JSON.parse(body || "{}");
      const ferramenta = Object.keys(payload.tools?.[0] || {})[0];
      pedidos.push({ ferramenta, payload });

      if (cenario === "google-fora" || cenario === "tudo-fora") {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { message: "quota exceeded" } }));
      }
      // Modelo antigo: recusa "google_search" e só aceita o nome velho.
      if (cenario === "nome-velho" && ferramenta === "google_search") {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({ error: { message: "Unknown name \"google_search\": Cannot find field." } })
        );
      }

      return res.end(
        JSON.stringify({
          candidates: [
            {
              content: { role: "model", parts: [{ text: "O dólar fechou a 5,12 reais hoje." }] },
              groundingMetadata: {
                webSearchQueries: ["cotação do dólar hoje"],
                groundingChunks: [
                  { web: { uri: "https://exemplo.com/dolar", title: "Câmbio hoje" } },
                  { web: { url: "https://outro.com/b" } },
                ],
              },
            },
          ],
        })
      );
    }

    // ---------- DuckDuckGo (resposta instantânea) ----------
    if (caminho === "/ddg" || caminho === "/ddg/") {
      if (cenario === "tudo-fora") {
        return res.end(JSON.stringify({ Abstract: "", RelatedTopics: [] }));
      }
      return res.end(
        JSON.stringify({
          Heading: "Bitcoin",
          AbstractText: "Bitcoin é uma criptomoeda descentralizada.",
          AbstractURL: "https://pt.wikipedia.org/wiki/Bitcoin",
          RelatedTopics: [],
        })
      );
    }

    // ---------- Wikipédia ----------
    if (caminho === "/wiki") {
      if (cenario === "tudo-fora") {
        return res.end(JSON.stringify({ query: { search: [] } }));
      }
      if (/list=search/.test(consulta || "")) {
        return res.end(
          JSON.stringify({ query: { search: [{ title: "Fotossíntese", snippet: "um <b>processo</b>" }] } })
        );
      }
      return res.end(
        JSON.stringify({ query: { pages: { 1: { extract: "Fotossíntese é o processo pelo qual…" } } } })
      );
    }

    // ---------- páginas para ler ----------
    if (caminho === "/pagina") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><html><head><title>  Notícia   do dia </title>
        <style>.x{color:red}</style><script>var espiao = 1;</script></head>
        <body><nav>menu início contato</nav>
        <h1>Chuva forte</h1><p>Hoje chove &amp; venta em S&atilde;o Paulo.</p>
        <p>Segunda linha&hellip;</p><footer>rodapé</footer></body></html>`);
    }
    if (caminho === "/imagem") {
      res.setHeader("content-type", "image/png");
      return res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }
    if (caminho === "/ausente") {
      res.statusCode = 404;
      return res.end("não existe");
    }

    res.statusCode = 404;
    res.end("{}");
  });
});

servidor.listen(0, async () => {
  const base = `http://127.0.0.1:${servidor.address().port}`;
  process.env.EV_GEMINI_API = base;
  process.env.EV_DDG_API = `${base}/ddg`;
  process.env.EV_WIKI_API = `${base}/wiki`;

  const web = require("../web.js");
  const opts = { apiKey: "AQ.falsa", model: "gemini-flash-latest" };

  // ---------------------------------------------- 1. caminho normal
  const r1 = await web.pesquisar("cotação do dólar hoje", opts);
  assert.strictEqual(r1.fonte, "google");
  assert.match(r1.texto, /5,12/);
  assert.deepStrictEqual(r1.consultas, ["cotação do dólar hoje"]);
  assert.strictEqual(r1.links.length, 2, "os dois formatos de link devem ser lidos");
  assert.strictEqual(r1.links[0].url, "https://exemplo.com/dolar");
  assert.strictEqual(r1.links[1].url, "https://outro.com/b", "link sem título também conta");
  assert.ok(!r1.aviso, "no caminho normal não há aviso de reserva");

  const p = pedidos[0];
  assert.strictEqual(p.ferramenta, "google_search", "primeiro tenta o nome atual");
  assert.ok(p.payload.systemInstruction, "manda instrução pedindo resposta curta e factual");
  assert.strictEqual(p.payload.contents[0].parts[0].text, "cotação do dólar hoje");

  // ------------------------- 2. modelo que só conhece o nome antigo
  cenario = "nome-velho";
  pedidos.length = 0;
  const r2 = await web.pesquisar("quem descobriu o Brasil", opts);
  assert.strictEqual(r2.fonte, "google", "deveria conseguir no segundo nome de ferramenta");
  assert.deepStrictEqual(
    pedidos.map((x) => x.ferramenta),
    ["google_search", "google_search_retrieval"],
    "tenta os dois nomes, nessa ordem"
  );

  // ------------------------- 3. Google fora: cai para as fontes abertas
  cenario = "google-fora";
  const r3 = await web.pesquisar("bitcoin", opts);
  assert.strictEqual(r3.fonte, "duckduckgo");
  assert.match(r3.texto, /criptomoeda/);
  assert.ok(r3.aviso, "a resposta de reserva precisa vir anunciada como tal");
  assert.match(r3.aviso, /Google/);

  // ------------------------- 4. sem chave do Gemini também funciona
  // Sem isto o caso abaixo seria atendido pelo CACHE da chamada anterior (a
  // pergunta é a mesma de propósito) e passaria sem exercitar nada.
  web.limparCache();
  const r4 = await web.pesquisar("bitcoin", {});
  assert.strictEqual(r4.fonte, "duckduckgo", "sem chave, nem tenta o Google");

  // ------------------------- 5. nada disponível: erro honesto, não invenção
  cenario = "tudo-fora";
  const erro = await web.pesquisar("qualquer coisa", opts).then(() => null, (e) => e);
  assert.ok(erro, "deveria falhar em vez de devolver resposta vazia");
  assert.strictEqual(erro.semResultado, true);
  assert.match(erro.message, /não consegui pesquisar/i);

  // ------------------------- 6. leitura de página
  cenario = "google-ok";
  const pag = await web.lerPagina(`${base}/pagina`);
  assert.strictEqual(pag.titulo, "Notícia do dia", "título normalizado");
  assert.match(pag.texto, /Chuva forte/);
  assert.match(pag.texto, /São Paulo/, "entidades HTML decodificadas");
  assert.match(pag.texto, /&/, "o &amp; virou &");
  assert.ok(!/espiao/.test(pag.texto), "script não pode entrar no texto");
  assert.ok(!/color:red/.test(pag.texto), "style não pode entrar no texto");
  assert.ok(!/menu início/.test(pag.texto), "menu de navegação sai fora");

  const naoTexto = await web.lerPagina(`${base}/imagem`).then(() => null, (e) => e);
  assert.ok(naoTexto, "imagem não é página de texto");
  assert.match(naoTexto.message, /não é texto/);

  const ausente = await web.lerPagina(`${base}/ausente`).then(() => null, (e) => e);
  assert.strictEqual(ausente.status, 404);

  console.log("✓ web: busca do Google, troca de nome da ferramenta, reservas e leitura de página");
  console.log("  google   →", r1.texto, `(${r1.links.length} fontes)`);
  console.log("  reserva  →", r3.fonte, "|", r3.aviso);
  console.log("  sem nada → erro:", erro.message.slice(0, 60) + "…");
  console.log("  página   →", JSON.stringify(pag.titulo), "·", pag.texto.replace(/\s+/g, " ").slice(0, 48) + "…");
  servidor.close();
});
