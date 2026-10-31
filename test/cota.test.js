// cota.test.js — os dois tipos de limite do Gemini exigem reações opostas:
//   por minuto → esperar e repetir (o tempo resolve)
//   por dia    → trocar de modelo (a cota diária é por modelo)
// Rode com: node test/cota.test.js

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

let cenario = "porMinuto";
const tentativas = [];

function erroCota(res, { porDia, segundos }) {
  res.statusCode = 429;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      error: {
        code: 429,
        message: "You exceeded your current quota, please check your plan and billing details.",
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaId: porDia
                  ? "GenerateRequestsPerDayPerProjectPerModel"
                  : "GenerateRequestsPerMinutePerProjectPerModel",
              },
            ],
          },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: `${segundos}s` },
        ],
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

    if (cenario === "porMinuto") {
      // Falha na 1ª, funciona na 2ª — como um limite por minuto que passa.
      if (tentativas.length === 1) return erroCota(res, { porDia: false, segundos: 1 });
      return responderEmFrases(res, "Consegui!");
    }

    if (cenario === "porDia") {
      // O primeiro modelo esgotou o dia; o segundo ainda tem cota.
      if (modelo === MODELO_A) return erroCota(res, { porDia: true, segundos: 30 });
      return responderEmFrases(res, "Outro modelo.");
    }

    // Todos esgotados no dia.
    return erroCota(res, { porDia: true, segundos: 30 });
  });
});

servidor.listen(0, async () => {
  process.env.EV_GEMINI_API = `http://127.0.0.1:${servidor.address().port}`;
  const { createBrain } = require("../brains.js");

  // --- 1. Limite por minuto: deve esperar e repetir sozinha ---
  const t0 = Date.now();
  const debug1 = [];
  const b1 = createBrain({ apiKey: "AQ.x", model: MODELO_A });
  const ditos1 = [];
  await b1.ask("oi", {
    onSay: (t) => ditos1.push(t),
    onTool: () => {},
    onDebug: (m) => debug1.push(m),
    onModel: () => {},
  });
  const levou = Date.now() - t0;

  assert.deepStrictEqual(ditos1, ["Consegui!"], "deveria responder após esperar");
  assert.deepStrictEqual(tentativas, [MODELO_A, MODELO_A], "deve repetir no MESMO modelo");
  assert.ok(levou >= 900, `deveria ter esperado ~1s, esperou ${levou}ms`);
  assert.ok(debug1.some((m) => /aguardando/.test(m)), "deve registrar a espera no log");

  // --- 2. Limite diário: esperar não resolve, trocar de modelo sim ---
  cenario = "porDia";
  tentativas.length = 0;
  const t1 = Date.now();
  const b2 = createBrain({ apiKey: "AQ.x", model: MODELO_A });
  const ditos2 = [];
  const trocas = [];
  await b2.ask("oi", {
    onSay: (t) => ditos2.push(t),
    onTool: () => {},
    onDebug: () => {},
    onModel: (m) => trocas.push(m),
  });

  assert.deepStrictEqual(ditos2, ["Outro modelo."]);
  assert.deepStrictEqual(trocas, [MODELO_B], "deve migrar para o modelo com cota");
  assert.ok(Date.now() - t1 < 900, "no limite diário NÃO deve ficar esperando à toa");

  // --- 3. Todos os modelos sem cota no dia: erro claro, sem esperar ---
  cenario = "tudoEsgotado";
  const b3 = createBrain({ apiKey: "AQ.x" });
  const erro = await b3
    .ask("oi", { onSay: () => {}, onTool: () => {}, onDebug: () => {}, onModel: () => {} })
    .then(() => null)
    .catch((e) => e);

  assert.ok(erro, "deveria falhar");
  assert.strictEqual(erro.cotaDiaria, true, "deve marcar como limite DIÁRIO");
  assert.notStrictEqual(erro.semCota, true, "não é 'conta sem plano', é cota do dia consumida");

  console.log("✓ os dois limites do Gemini são tratados de forma diferente");
  console.log("  por minuto → esperou e repetiu no mesmo modelo:", tentativas.length ? "sim" : "não");
  console.log("  por dia    → trocou para", trocas[0], "sem esperar");
  console.log("  tudo esgotado → cotaDiaria =", erro.cotaDiaria);
  servidor.close();
});
