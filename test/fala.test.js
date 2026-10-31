// fala.test.js — a resposta sai em pedaços, conforme o modelo escreve.
//
// É daqui que vem a sensação de resposta rápida: em vez de ficar calada até o
// modelo terminar o parágrafo inteiro, a E.V.E recebe a primeira fala pronta
// assim que ela fecha e já começa a falar. O que não pode acontecer:
//   - perder ou embaralhar texto no caminho;
//   - picotar a voz em pedacinhos ("Oi!" sozinho);
//   - falar duas vezes o mesmo trecho quando houver ferramenta no meio.
// Rode com: node test/fala.test.js

const http = require("node:http");
const assert = require("node:assert");

const MODELO = "gemini-flash-latest";

const TEXTO =
  "Olhei aqui para você. A sua memória está em cinquenta e sete por cento, " +
  "o que é bastante folga para o que você costuma rodar. O disco é que merece " +
  "atenção: restam só quarenta e seis gigabytes. Quer que eu procure o que está " +
  "ocupando mais espaço?";

let cenario = "simples";
const recebidos = [];

/// Manda o texto em pedaços pequenos, como a API faz de verdade — inclusive
/// cortando no meio de uma palavra, que é o caso que quebra implementações
/// ingênuas de divisão por frase.
function emFluxo(res, texto, partesExtras = []) {
  res.setHeader("content-type", "text/event-stream");
  for (let i = 0; i < texto.length; i += 17) {
    res.write(
      "data: " +
        JSON.stringify({
          candidates: [{ content: { role: "model", parts: [{ text: texto.slice(i, i + 17) }] } }],
        }) +
        "\n\n"
    );
  }
  for (const parte of partesExtras) {
    res.write("data: " + JSON.stringify({ candidates: [{ content: { parts: [parte] } }] }) + "\n\n");
  }
  res.end();
}

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");

    if (url.endsWith("/models")) {
      return res.end(
        JSON.stringify({
          models: [{ name: `models/${MODELO}`, supportedGenerationMethods: ["generateContent"] }],
        })
      );
    }

    recebidos.push(JSON.parse(body));

    if (cenario === "sem-sse") {
      // Endpoint que aceita o pedido mas não fala SSE: a E.V.E precisa repetir
      // sem streaming em vez de ficar muda.
      return res.end(
        JSON.stringify({
          candidates: [{ content: { role: "model", parts: [{ text: "Respondi sem streaming." }] } }],
        })
      );
    }

    if (cenario === "com-ferramenta") {
      if (recebidos.length === 1) {
        // Os modelos novos do Gemini anexam uma assinatura de raciocínio à
        // chamada de ferramenta e EXIGEM ela de volta no pedido seguinte.
        return emFluxo(res, "Já vou ver isso para você. ", [
          {
            functionCall: { name: "list_directory", args: { dirpath: "~" } },
            thoughtSignature: "AssinaturaDoPensamento123==",
          },
        ]);
      }
      return emFluxo(res, "Pronto, são cinquenta e nove itens na sua pasta.");
    }

    return emFluxo(res, TEXTO);
  });
});

servidor.listen(0, async () => {
  process.env.EV_GEMINI_API = `http://127.0.0.1:${servidor.address().port}`;
  const { createBrain } = require("../brains.js");
  const base = { onTool: () => {}, onDebug: () => {}, onModel: () => {} };

  // ---------------------------------------- 1. texto longo sai em pedaços
  const ditos = [];
  const b1 = createBrain({ apiKey: "AQ.x", model: MODELO });
  await b1.ask("como está o computador?", { ...base, onSay: (t) => ditos.push(t) });

  assert.ok(ditos.length >= 2, `deveria sair em pedaços, saiu em ${ditos.length}`);
  assert.strictEqual(
    ditos.join(" ").replace(/\s+/g, " ").trim(),
    TEXTO.replace(/\s+/g, " ").trim(),
    "juntando os pedaços tem que dar exatamente o texto original"
  );
  for (const pedaco of ditos.slice(0, -1)) {
    assert.ok(pedaco.length >= 42, `pedaço curto demais para virar fala: ${JSON.stringify(pedaco)}`);
  }
  assert.ok(
    /[.!?…:]$/.test(ditos[0]),
    `o primeiro pedaço deveria terminar em pontuação: ${JSON.stringify(ditos[0])}`
  );

  // O histórico guarda as partes COMO VIERAM — inclusive campos que a API
  // exige de volta, como o thoughtSignature das chamadas de ferramenta.
  const guardado = b1.contents.find((c) => c.role === "model");
  const textoGuardado = guardado.parts.map((p) => p.text || "").join("");
  assert.strictEqual(textoGuardado.replace(/\s+/g, " ").trim(), TEXTO.replace(/\s+/g, " ").trim());

  // ------------------------------- 2. com ferramenta no meio, sem repetir
  cenario = "com-ferramenta";
  recebidos.length = 0;
  const ditos2 = [];
  const ferramentas = [];
  const b2 = createBrain({ apiKey: "AQ.x", model: MODELO });
  await b2.ask("o que tem na minha pasta?", {
    ...base,
    onTool: (n) => ferramentas.push(n),
    onSay: (t) => ditos2.push(t),
  });

  assert.deepStrictEqual(ferramentas, ["list_directory"]);
  const falaInteira = ditos2.join(" ");
  assert.match(falaInteira, /Já vou ver isso/);
  assert.match(falaInteira, /cinquenta e nove itens/);
  assert.strictEqual(
    falaInteira.split("Já vou ver isso").length - 1,
    1,
    "o trecho anterior à ferramenta não pode ser falado duas vezes"
  );

  // A assinatura precisa voltar INTACTA no pedido seguinte. Sem isso a API
  // recusa a conversa inteira com "Function call is missing a thought_signature",
  // que foi exatamente o erro que apareceu em uso.
  const segundoPedido = recebidos[1];
  const partesDoModelo = segundoPedido.contents.find((c) => c.role === "model").parts;
  const chamada = partesDoModelo.find((p) => p.functionCall);
  assert.ok(chamada, "a chamada de ferramenta tem de estar no histórico");
  assert.strictEqual(
    chamada.thoughtSignature,
    "AssinaturaDoPensamento123==",
    "a assinatura de raciocínio precisa voltar junto com a chamada"
  );

  // ------------------------- 3. servidor que não fala SSE: cai para o normal
  cenario = "sem-sse";
  const ditos3 = [];
  const debug3 = [];
  const b3 = createBrain({ apiKey: "AQ.x", model: MODELO });
  await b3.ask("oi", { ...base, onDebug: (m) => debug3.push(m), onSay: (t) => ditos3.push(t) });

  assert.deepStrictEqual(ditos3, ["Respondi sem streaming."], "não pode ficar muda");
  assert.ok(debug3.some((m) => /sem streaming/.test(m)), "a queda precisa ficar registrada");

  console.log("✓ fala em pedaços: começa antes de o modelo terminar, sem perder nem repetir");
  console.log("  pedaços:", ditos.length, "· primeiro:", JSON.stringify(ditos[0].slice(0, 46) + "…"));
  console.log("  com ferramenta:", ditos2.length, "pedaços, nenhum repetido");
  console.log("  sem SSE → repetiu pelo caminho normal");
  servidor.close();
});
