// modelo.test.js — reproduz o caso real: a lista anuncia um modelo que o Google
// depois recusa. A E.V. deve descer para o próximo sozinha e guardar o que funcionou.
// Rode com: node test/modelo.test.js

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

const APOSENTADO = "gemini-2.5-flash"; // "no longer available to new users"
const SEM_COTA = "gemini-3.6-flash"; // 429 com "limit: 0"
const BOM = "gemini-flash-latest";

const tentados = [];
let tudoSemCota = false; // 2ª fase: conta sem nível gratuito nenhum

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");

    if (url.endsWith("/models")) {
      return res.end(
        JSON.stringify({
          models: [APOSENTADO, SEM_COTA, BOM, "gemini-2.0-flash-lite"].map((n) => ({
            name: `models/${n}`,
            supportedGenerationMethods: ["generateContent"],
          })),
        })
      );
    }

    const modelo = url.match(/models\/([^:]+):/)[1];
    tentados.push(modelo);

    // Modelo aposentado (mensagem real que o Google devolveu ao Matheus).
    if (modelo === APOSENTADO) {
      res.statusCode = 404;
      return res.end(
        JSON.stringify({
          error: {
            message: `This model models/${APOSENTADO} is no longer available to new users.`,
          },
        })
      );
    }

    // Cota gratuita zerada: 429, mas com "limit: 0" — esperar não resolve.
    if (modelo === SEM_COTA || tudoSemCota) {
      res.statusCode = 429;
      return res.end(
        JSON.stringify({
          error: {
            message:
              "You exceeded your current quota.\n* Quota exceeded for metric: " +
              `generate_content_free_tier_requests, limit: 0, model: ${modelo}\nPlease retry in 18.1s.`,
          },
        })
      );
    }

    responderEmFrases(res, "Oi! Tudo bem?");
  });
});

servidor.listen(0, async () => {
  process.env.EV_GEMINI_API = `http://127.0.0.1:${servidor.address().port}`;
  const { createBrain } = require("../brains.js");

  // Começa com o modelo problemático já salvo, como está na configuração do usuário.
  const brain = createBrain({ apiKey: "AQ.AbChaveNova", model: APOSENTADO });

  const ditos = [];
  const trocas = [];
  const debug = [];
  await brain.ask("oi", {
    onSay: (t) => ditos.push(t),
    onTool: () => {},
    onDebug: (m) => debug.push(m),
    onModel: (m) => trocas.push(m),
  });

  assert.deepStrictEqual(
    tentados,
    [APOSENTADO, BOM],
    "após a recusa, recarrega a lista e vai direto ao melhor (flash-latest), sem passar pelo sem-cota"
  );
  assert.deepStrictEqual(ditos, ["Oi! Tudo bem?"], "deve responder normalmente após a troca");
  assert.strictEqual(brain.model, BOM);
  assert.ok(trocas.includes(BOM), "deve avisar qual modelo passou a usar (para salvar)");
  assert.ok(
    debug.some((m) => m.includes("recusado")),
    "deve registrar a recusa no log"
  );
  assert.ok(
    debug.some((m) => m.includes("modelos disponíveis")),
    "deve registrar a lista de modelos da conta"
  );

  console.log("✓ recuperação automática de modelo recusado");
  console.log("  tentou:", tentados.join(" → "));
  console.log("  guardou:", brain.model);
  console.log("  respondeu:", ditos[0]);

  // --- 2ª fase: conta sem cota gratuita em modelo nenhum ---
  tudoSemCota = true;
  tentados.length = 0;
  const brain2 = createBrain({ apiKey: "AQ.AbChaveSemCota" });
  const erro = await brain2
    .ask("oi", { onSay: () => {}, onTool: () => {}, onDebug: () => {}, onModel: () => {} })
    .then(() => null)
    .catch((e) => e);

  assert.ok(erro, "deveria falhar quando nenhum modelo tem cota");
  assert.strictEqual(erro.semCota, true, "deve identificar que é falta de plano, não de espera");
  assert.ok(tentados.length >= 3, "deve ter tentado vários modelos antes de desistir");

  console.log("✓ conta sem cota nenhuma é distinguida de limite temporário");
  console.log("  tentou", tentados.length, "modelos e concluiu: falta de plano gratuito");
  servidor.close();
});
