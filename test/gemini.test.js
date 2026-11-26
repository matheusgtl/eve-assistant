// gemini.test.js — valida o cérebro Gemini contra um servidor falso.
// Confere o formato do pedido, o laço de ferramentas e a devolução do resultado.
// Rode com: node test/gemini.test.js

const http = require("node:http");
const assert = require("node:assert");

const pedidos = [];

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");

    // Lista de modelos
    if (url.endsWith("/models")) {
      return res.end(
        JSON.stringify({
          models: [
            { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
          ],
        })
      );
    }

    const payload = JSON.parse(body);
    pedidos.push({ url, payload, apiKey: req.headers["x-goog-api-key"] });

    // 1ª volta: pede a ferramenta. 2ª volta: responde em texto.
    const primeira = pedidos.length === 1;
    const partes = primeira
      ? [{ functionCall: { name: "list_directory", args: { dirpath: "~" } } }]
      : [{ text: "Você está com bastante memória livre." }];

    // A E.V.E pede em streaming (é o que a faz começar a falar antes de o
    // modelo terminar), então o servidor falso responde em SSE.
    res.setHeader("content-type", "text/event-stream");
    for (const parte of partes) {
      res.write(
        "data: " +
          JSON.stringify({ candidates: [{ content: { role: "model", parts: [parte] } }] }) +
          "\n\n"
      );
    }
    res.end();
  });
});

servidor.listen(0, async () => {
  const porta = servidor.address().port;
  process.env.EV_GEMINI_API = `http://127.0.0.1:${porta}`;

  const { createBrain } = require("../brains.js");
  const brain = createBrain({ apiKey: "AIzaFalsa123" });
  assert.ok(brain, "deveria criar um cérebro Gemini a partir da chave AIza…");

  const ditos = [];
  const ferramentas = [];
  await brain.ask("quanta memória eu tenho?", {
    onSay: (t) => ditos.push(t),
    onTool: (n) => ferramentas.push(n),
  });

  // --- Verificações ---
  assert.strictEqual(brain.model, "gemini-2.5-flash", "deveria escolher o flash mais novo");
  assert.strictEqual(pedidos.length, 2, "deveria fazer duas voltas: ferramenta e resposta");
  assert.deepStrictEqual(ferramentas, ["list_directory"], "deveria ter executado list_directory");
  assert.deepStrictEqual(ditos, ["Você está com bastante memória livre."]);

  const p1 = pedidos[0].payload;
  assert.strictEqual(pedidos[0].apiKey, "AIzaFalsa123", "a chave deve ir no cabeçalho");
  assert.match(pedidos[0].url, /gemini-2\.5-flash:streamGenerateContent$/, "deve pedir em streaming");
  assert.ok(p1.systemInstruction.parts[0].text.includes("Sexta-Feira"), "prompt de sistema presente");
  assert.strictEqual(p1.contents[0].role, "user");
  assert.strictEqual(p1.contents[0].parts[0].text, "quanta memória eu tenho?");
  assert.ok(p1.tools[0].function_declarations.length >= 6, "todas as ferramentas declaradas");

  const decl = p1.tools[0].function_declarations.find((d) => d.name === "run_command");
  assert.strictEqual(decl.parameters.type, "OBJECT", "tipos em maiúsculas");
  assert.strictEqual(decl.parameters.properties.command.type, "STRING");
  const semParam = p1.tools[0].function_declarations.find((d) => d.name === "system_status");
  assert.ok(!("parameters" in semParam), "ferramenta sem parâmetros não manda schema vazio");

  // A 2ª volta deve conter a resposta da ferramenta no formato do Gemini.
  const p2 = pedidos[1].payload;
  assert.strictEqual(p2.contents.length, 3, "usuário → modelo → resultado da ferramenta");
  assert.strictEqual(p2.contents[1].role, "model");
  assert.strictEqual(p2.contents[2].role, "user");
  const fr = p2.contents[2].parts[0].functionResponse;
  assert.strictEqual(fr.name, "list_directory");
  assert.strictEqual(typeof fr.response, "object", "resposta precisa ser objeto, não string");
  assert.ok(fr.response.dirpath, "a ferramenta rodou de verdade e leu o disco");
  assert.ok(Array.isArray(fr.response.itens), "trouxe a lista de itens");

  console.log("✓ escolha de modelo, formato do pedido, laço de ferramentas e resposta: tudo ok");
  console.log("  modelo escolhido:", brain.model);
  console.log("  ferramenta executada:", ferramentas[0], "→", fr.response.dirpath, `(${fr.response.total} itens)`);
  servidor.close();
});
