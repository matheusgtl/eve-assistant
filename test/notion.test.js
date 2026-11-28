// O Notion dele (notion.js + a ferramenta `notion` do tools.js), contra um
// Notion FALSO local: sem rede, sem chave nem página de verdade.
// Rode com: node test/notion.test.js
const assert = require("node:assert");
const http = require("node:http");

const CHAVE = "ntn_teste_falsa";
const PAG = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const BASE = "aaaabbbbccccddddeeeeffff00001111";
const comHifens = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
const txt = (t) => [{ plain_text: t }];
const pedidos = [];

const servidor = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    pedidos.push({ metodo: req.method, url: req.url, corpo: corpo ? JSON.parse(corpo) : null, auth: req.headers.authorization, versao: req.headers["notion-version"] });
    const json = (status, d) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(d));
    };
    if (req.headers.authorization !== `Bearer ${CHAVE}`) return json(401, { code: "unauthorized", message: "API token is invalid." });
    const u = req.url;
    if (u === "/v1/users/me") return json(200, { name: "Sexta-Feira", bot: {} });
    if (u === "/v1/search") {
      const q = JSON.parse(corpo || "{}").query || "";
      if (/nada/.test(q)) return json(200, { results: [] });
      return json(200, {
        results: [
          { object: "page", id: comHifens(PAG), url: "https://www.notion.so/Estudos-" + PAG, last_edited_time: "2026-11-20T10:00:00Z", properties: { Nome: { type: "title", title: txt("Estudos de Python") } } },
          { object: "database", id: comHifens(BASE), url: "https://www.notion.so/" + BASE, last_edited_time: "2026-11-21T10:00:00Z", title: txt("Tarefas") },
        ],
      });
    }
    if (u === `/v1/pages/${comHifens(PAG)}`) return json(200, { id: comHifens(PAG), url: "https://www.notion.so/Estudos-" + PAG, properties: { Nome: { type: "title", title: txt("Estudos de Python") } } });
    if (u.startsWith(`/v1/blocks/${comHifens(PAG)}/children`)) {
      // Duas páginas de resultados: o leitor precisa seguir o cursor.
      if (!u.includes("start_cursor")) {
        return json(200, {
          has_more: true, next_cursor: "c2",
          results: [
            { id: "b1", type: "heading_1", heading_1: { rich_text: txt("Listas") } },
            { id: "b2", type: "bulleted_list_item", has_children: true, bulleted_list_item: { rich_text: txt("append") } },
            { id: "b3", type: "child_page", child_page: { title: "Exercícios" } },
          ],
        });
      }
      return json(200, { has_more: false, results: [{ id: "b4", type: "to_do", to_do: { rich_text: txt("revisar dicionários"), checked: true } }] });
    }
    if (u.startsWith("/v1/blocks/b2/children")) return json(200, { has_more: false, results: [{ id: "b5", type: "paragraph", paragraph: { rich_text: txt("adiciona no fim") } }] });
    if (u.startsWith("/v1/blocks/b3/children")) throw new Error("subpágina não pode abrir em cascata");
    if (u === `/v1/pages/${comHifens(BASE)}`) return json(400, { code: "validation_error", message: "is a database" });
    if (u === `/v1/databases/${comHifens(BASE)}`) return json(200, { id: comHifens(BASE), title: txt("Tarefas"), url: "https://www.notion.so/" + BASE });
    if (u === `/v1/databases/${comHifens(BASE)}/query`) {
      return json(200, {
        has_more: false,
        results: [{ id: "l1", properties: { Nome: { type: "title", title: txt("Pagar fatura") }, Status: { type: "status", status: { name: "Feito" } }, Data: { type: "date", date: { start: "2026-11-13" } } } }],
      });
    }
    return json(404, { code: "object_not_found", message: "Could not find" });
  });
});

servidor.listen(0, async () => {
  try {
    process.env.EV_NOTION_API = `http://127.0.0.1:${servidor.address().port}/v1`;
    const { Notion, idDe } = require("../notion.js");
    const { runTool, configurar, toolDefinitions } = require("../tools.js");

    // id: puro, com hífens ou o link que ele copia
    assert.strictEqual(idDe(PAG), comHifens(PAG));
    assert.strictEqual(idDe(`https://www.notion.so/meu/Estudos-de-Python-${PAG}?pvs=4`), comHifens(PAG));
    assert.strictEqual(idDe("estudos"), null);
    // 27/11/2026: palavra do título terminando em letra hexadecimal ("Dashboard")
    assert.strictEqual(idDe(`https://app.notion.com/p/Meu-Dashboard-${PAG}`), comHifens(PAG));
    assert.strictEqual(idDe(`https://app.notion.com/p/${PAG}`), comHifens(PAG));
    assert.strictEqual(idDe(comHifens(PAG)), comHifens(PAG));

    const n = new Notion(CHAVE);
    assert.deepStrictEqual(await n.testar(), { nome: "Sexta-Feira" });
    assert.strictEqual(pedidos[0].versao, "2022-06-28", "manda a versão da API");

    // busca: páginas e bases, com título e id
    const achados = await n.buscar("python");
    assert.deepStrictEqual(achados.map((a) => [a.tipo, a.titulo]), [["página", "Estudos de Python"], ["base", "Tarefas"]]);

    // página: segue o cursor, entra no que está aninhado, NÃO abre subpágina
    const p = await n.ler(`https://www.notion.so/Estudos-${PAG}`);
    assert.strictEqual(p.titulo, "Estudos de Python");
    assert.match(p.texto, /# Listas/);
    assert.match(p.texto, /- append\n {2}adiciona no fim/, "filho aninhado vem indentado");
    assert.match(p.texto, /subpágina: Exercícios \(id b3\)/, "subpágina vira linha com id");
    assert.match(p.texto, /- \[x\] revisar dicionários/, "a segunda página de blocos veio");

    // base: o id de base cai no caminho de base e lista as linhas
    const b = await n.ler(BASE);
    assert.strictEqual(b.titulo, "Tarefas");
    assert.match(b.texto, /\*\*Pagar fatura\*\* — Status: Feito · Data: 2026-11-13/);

    // SÓ LEITURA: nenhum pedido que escreve (PATCH, DELETE, POST em /pages ou /blocks)
    for (const r of pedidos) {
      assert.ok(r.metodo === "GET" || (r.metodo === "POST" && /\/(search|databases\/[^/]+\/query)$/.test(r.url)), `pedido que escreve: ${r.metodo} ${r.url}`);
    }

    // erros dizem o que ELE faz, em português
    await assert.rejects(new Notion("ntn_errada").testar(), /recusou a chave.*Conexões/);
    await assert.rejects(n.ler("ffffffffffffffffffffffffffffffff"), /compartilhada com a integração/);
    await assert.rejects(n.ler("não é id"), /não parece um id/);
    await assert.rejects(new Notion(null).buscar("x"), /não está conectado.*Conexões/);

    // a ferramenta: sem chave, erro claro; com chave, busca e lê
    const chamar = async (args) => JSON.parse(await runTool("notion", args));
    configurar({ notionKey: () => null });
    assert.match((await chamar({ consulta: "python" })).error, /não está conectado/);
    configurar({ notionKey: () => CHAVE });
    assert.strictEqual((await chamar({ consulta: "python" })).resultados.length, 2);
    assert.match((await chamar({ consulta: "nada aqui" })).aviso, /compartilhou com a integração/);
    assert.match((await chamar({ id: PAG })).texto, /revisar dicionários/);

    // Log de 27/11/2026, 23:09: a busca devolvia o `url` de cada página e ela
    // lia com read_webpage (12 vezes, 16 s cada, a página de login do Notion)
    // em vez de chamar notion com o id. A busca não dá mais link, dá o id e a
    // dica; e read_webpage num link do Notion manda para a ferramenta certa.
    const busca = await chamar({ consulta: "python" });
    assert.ok(busca.resultados.every((r) => r.id && !("url" in r)), "busca dá id, não link");
    assert.match(busca.dica, /notion com o id/);
    for (const url of [`https://app.notion.com/p/Meu-Dashboard-${PAG}`, `https://www.notion.so/Estudos-${PAG}`, `notion.so/${PAG}`]) {
      const r = JSON.parse(await runTool("read_webpage", { url }));
      assert.strictEqual(r.use, "notion", `${url}: manda para o notion`);
      assert.strictEqual(r.id, comHifens(PAG), "já com o id certo");
      assert.match(r.error, /notion/);
    }
    // Sem chave em Conexões, link do Notion segue para a web normalmente (página publicada).
    configurar({ notionKey: () => null, web: { lerPagina: async (u) => ({ url: u, titulo: "pública", texto: "ok" }) } });
    assert.strictEqual(JSON.parse(await runTool("read_webpage", { url: `https://www.notion.so/${PAG}` })).titulo, "pública");
    configurar({ notionKey: () => CHAVE });

    // 23:07: com a chave salva e nada compartilhado, o aviso a fez pedir a
    // chave NO CHAT. O aviso diz que a chave já está ok, e que não se pede chave.
    const vazio = await chamar({ consulta: "nada aqui" });
    assert.match(vazio.aviso, /chave já está conectada/);
    assert.match(vazio.aviso, /não peça a chave/i);

    // 28/11/2026, 02:44: "ler tudo no notion" → consulta "tudo", que buscou a
    // PALAVRA "tudo" no título. Pedido de tudo é a lista inteira.
    const buscas = pedidos.filter((r) => /\/search$/.test(r.url)).length;
    const tudo = await chamar({ consulta: "tudo" });
    const ultimaBusca = pedidos.filter((r) => /\/search$/.test(r.url)).pop();
    assert.ok(pedidos.filter((r) => /\/search$/.test(r.url)).length === buscas + 1);
    assert.ok(!(ultimaBusca.corpo || {}).query, `"tudo" não pode virar a palavra buscada: ${JSON.stringify(ultimaBusca.corpo)}`);
    assert.ok(tudo.resultados.length >= 2, "e lista o que há");

    // Vários ids de uma vez, para "ler tudo" caber nos passos.
    const varias = await chamar({ id: `${PAG}, ${BASE}` });
    assert.strictEqual(varias.paginas.length, 2);
    assert.match(varias.paginas[0].texto, /revisar dicionários/);
    assert.strictEqual(varias.paginas[1].titulo, "Tarefas");

    // não é ação: a trava de honestidade não a conta, e ela não pede sim
    const { ACOES } = require("../honestidade.js");
    assert.ok(!ACOES.notion, "ler o Notion não é algo que ela \"fez\"");
    const def = toolDefinitions.find((t) => t.name === "notion");
    assert.ok(def && !def.input_schema.properties.confirmed, "só leitura: sem confirmed");

    // "o que você consegue fazer" só fala do Notion se ele está conectado
    const { RESPOSTAS } = require("../pensamento.js");
    assert.match(await RESPOSTAS.capacidades({ notion: () => true }), /ler o seu Notion/);
    assert.doesNotMatch(await RESPOSTAS.capacidades({ notion: () => false }), /Notion/);

    console.log("✓ notion: busca, lê página (cursor, aninhados) e base, só leitura, erros em português");
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    servidor.close();
  }
});
