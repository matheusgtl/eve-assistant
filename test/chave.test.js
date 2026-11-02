// chave.test.js — valida o reconhecimento e a checagem de chaves de API.
// Rode com: node test/chave.test.js

const http = require("node:http");
const assert = require("node:assert");

let modo = "ok";

const servidor = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (modo === "ok") {
    return res.end(
      JSON.stringify({
        models: [
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        ],
      })
    );
  }
  res.statusCode = 400;
  res.end(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }));
});

servidor.listen(0, async () => {
  process.env.EV_GEMINI_API = `http://127.0.0.1:${servidor.address().port}`;
  const { detectProvider, checkGemini } = require("../brains.js");

  // --- reconhecimento por formato ---
  assert.strictEqual(detectProvider("AIzaSyAlgo"), "gemini", "formato antigo do Google");
  assert.strictEqual(detectProvider("AQ.Ab8RN6Algo"), "gemini", "formato novo do Google");
  assert.strictEqual(detectProvider("sk-ant-api03-algo"), "anthropic");
  assert.strictEqual(detectProvider("formato-desconhecido"), null, "desconhecido não chuta");
  assert.strictEqual(detectProvider(""), null);
  assert.strictEqual(detectProvider("   "), null, "espaços não viram chave");

  // --- chave boa ---
  modo = "ok";
  const boa = await checkGemini("chave-qualquer");
  assert.deepStrictEqual(boa, { ok: true, model: "gemini-2.5-flash" });

  // --- chave ruim ---
  modo = "erro";
  const ruim = await checkGemini("chave-ruim");
  assert.strictEqual(ruim.ok, false);
  assert.strictEqual(ruim.status, 400);
  assert.match(ruim.error, /API key not valid/);

  // --- a chave genérica vale só para quem está na FRENTE ---------------
  // Em 02/11 a chave do OpenRouter estava só na `apiKey`, que o `chaveDe`
  // aceita enquanto ele for o principal. Trocar de principal tirava o
  // OpenRouter da corrente junto, sem chave nenhuma — e a troca era necessária
  // porque o limite grátis dele é 50 pedidos POR DIA (medido: X-RateLimit-Limit
  // 50, com o 429 batendo às 18:33). Daí a migração que copia a genérica para
  // o campo próprio na abertura.
  const { chaveDe } = require("../brains.js");
  const soNaGenerica = { provider: "openrouter", apiKey: "sk-or-v1-xxx" };
  assert.strictEqual(
    chaveDe(soNaGenerica, "openrouter"), "sk-or-v1-xxx",
    "o principal pode ter a chave na genérica"
  );
  assert.strictEqual(
    chaveDe({ ...soNaGenerica, provider: "nvidia", nvidiaKey: "nvapi-y" }, "openrouter"), "",
    "e ao trocar de principal ele perde a chave: é isto que a migração evita"
  );
  assert.strictEqual(
    chaveDe({ provider: "nvidia", nvidiaKey: "nvapi-y", openrouterKey: "sk-or-v1-xxx" }, "openrouter"),
    "sk-or-v1-xxx",
    "com a chave no campo próprio ele continua na corrente como reserva"
  );

  console.log("✓ formatos AIza e AQ. reconhecidos; chave válida e inválida tratadas");
  console.log("  chave genérica → vale para o principal; campo próprio sobrevive à troca");
  console.log("  chave boa  → modelo:", boa.model);
  console.log("  chave ruim → erro:", ruim.error);
  servidor.close();
});
