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

  console.log("✓ formatos AIza e AQ. reconhecidos; chave válida e inválida tratadas");
  console.log("  chave boa  → modelo:", boa.model);
  console.log("  chave ruim → erro:", ruim.error);
  servidor.close();
});
