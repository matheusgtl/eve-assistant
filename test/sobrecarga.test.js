// sobrecarga.test.js — o 503 do Gemini ("this model is currently experiencing
// high demand") não é erro de conta, de chave nem de cota: é fila.
//
// A fila é POR MODELO, e a conta tem dezoito. Então a ordem certa é: trocar de
// modelo na hora (custa zero) e só esperar quando acabarem os modelos. A
// primeira versão fazia o contrário — esperava 1,5 s, depois 4 s, e só então
// trocava; numa tarde em que o modelo preferido viveu lotado, isso virou cinco
// segundos e meio de silêncio em cada pergunta.
//
// E a troca feita por fila NÃO pode ser gravada na configuração: seria
// permanente para um problema de cinco minutos.
// Rode com: node test/sobrecarga.test.js

const http = require("node:http");
const assert = require("node:assert");

/// A E.V.E pede a geração em streaming; o sucesso precisa sair em SSE.
function responderEmFrases(res, texto) {
  res.setHeader("content-type", "text/event-stream");
  res.write(
    "data: " +
      JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: texto }] } }] }) +
      "\n\n"
  );
  res.end();
}

const MODELO_A = "gemini-flash-latest";
const MODELO_B = "gemini-3.6-flash";

let cenario = "passa-sozinho";
const tentativas = [];

function lotado(res) {
  res.statusCode = 503;
  res.end(
    JSON.stringify({
      error: {
        code: 503,
        status: "UNAVAILABLE",
        message:
          "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
      },
    })
  );
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
          models: [MODELO_A, MODELO_B].map((n) => ({
            name: `models/${n}`,
            supportedGenerationMethods: ["generateContent"],
          })),
        })
      );
    }

    const modelo = url.match(/models\/([^:]+):/)[1];
    tentativas.push(modelo);

    if (cenario === "passa-sozinho") {
      // Todos os modelos lotados nas duas primeiras tentativas; na terceira
      // volta, libera. É o caso em que só o tempo resolve.
      if (tentativas.length <= 2) return lotado(res);
      return responderEmFrases(res, "Consegui!");
    }

    if (cenario === "so-o-outro") {
      if (modelo === MODELO_A) return lotado(res);
      return responderEmFrases(res, "Fui pelo outro.");
    }

    return lotado(res); // tudo lotado
  });
});

servidor.listen(0, async () => {
  process.env.EV_GEMINI_API = `http://127.0.0.1:${servidor.address().port}`;
  const { createBrain } = require("../brains.js");
  const nada = { onTool: () => {}, onDebug: () => {}, onModel: () => {} };

  // --- 1. tudo lotado e depois libera: tenta os modelos antes de esperar ---
  const t0 = Date.now();
  const debug = [];
  const ditos = [];
  const trocas = [];
  const b1 = createBrain({ apiKey: "AQ.x", model: MODELO_A });
  await b1.ask("oi", {
    ...nada,
    onSay: (t) => ditos.push(t),
    onDebug: (m) => debug.push(m),
    onModel: (m) => trocas.push(m),
  });
  const levou = Date.now() - t0;

  assert.deepStrictEqual(ditos, ["Consegui!"], "deveria responder depois de insistir");
  assert.deepStrictEqual(
    tentativas,
    [MODELO_A, MODELO_B, MODELO_A],
    "primeiro troca de modelo (de graça); só depois espera e recomeça"
  );
  assert.deepStrictEqual(trocas, [], "troca por lotação não é gravada na configuração");
  assert.ok(levou >= 1400, `deveria ter esperado ~1,5s depois de esgotar os modelos (${levou} ms)`);
  assert.ok(levou < 4000, `não deveria somar as duas esperas aqui (${levou} ms)`);
  assert.ok(debug.some((m) => /lotados/.test(m)), "a espera precisa ficar registrada no log");

  // --- 2. fila que não passa: vai para outro modelo, sem gravar a troca ---
  cenario = "so-o-outro";
  tentativas.length = 0;
  const t1 = Date.now();
  const ditos2 = [];
  const trocas2 = [];
  const b2 = createBrain({ apiKey: "AQ.x", model: MODELO_A });
  await b2.ask("oi", { ...nada, onSay: (t) => ditos2.push(t), onModel: (m) => trocas2.push(m) });

  assert.deepStrictEqual(ditos2, ["Fui pelo outro."]);
  assert.strictEqual(b2.model, MODELO_B, "deveria estar usando o outro modelo agora");
  assert.deepStrictEqual(
    trocas2,
    [],
    "troca por lotação é desvio temporário: não pode ser gravada no config"
  );
  assert.strictEqual(
    tentativas.filter((m) => m === MODELO_A).length,
    1,
    "um 503 basta para ir ao próximo modelo — insistir no lotado é só silêncio"
  );
  assert.ok(Date.now() - t1 < 1200, "trocar de modelo não pode custar espera");

  // --- 3. tudo lotado: erro específico, não "serviço instável" ---
  cenario = "tudo-lotado";
  const b3 = createBrain({ apiKey: "AQ.x", model: MODELO_A });
  const erro = await b3.ask("oi", { ...nada, onSay: () => {} }).then(() => null, (e) => e);

  assert.ok(erro, "deveria falhar");
  assert.strictEqual(erro.sobrecarga, true, "precisa vir marcado como lotação");
  assert.notStrictEqual(erro.semCota, true, "não confundir fila com falta de cota");
  assert.notStrictEqual(erro.cotaDiaria, true, "nem com limite diário");

  console.log("✓ 503 do Gemini tratado como fila: troca primeiro, espera depois");
  console.log("  lotado         → desviou para outro modelo na hora, sem gravar a troca");
  console.log("  todos lotados  → só aí esperou, e respondeu em", levou, "ms");
  console.log("  nunca libera   → erro.sobrecarga =", erro.sobrecarga);
  servidor.close();
});
