// modelo-ruim.test.js — o caso real de 22/10: a E.V.E abriu com
// "gemini-3.5-transcribe" salvo no config.json e morreu na primeira frase com
// 400 "Function calling is not enabled for this model".
//
// Como ele foi parar lá: numa tarde de cota esgotada ela desceu a lista inteira
// de modelos da conta, gravando CADA troca em disco. O último da lista era um
// transcritor de áudio — que anuncia generateContent, aceita o pedido e só
// então recusa conversar. A troca ficou salva; o erro passou a abrir com ela.
//
// Três garantias, uma para cada elo dessa corrente:
//   1. um modelo que não conversa nunca entra na lista de candidatos;
//   2. se um entrar, o 400 dele faz a E.V.E TROCAR, não desistir;
//   3. só se grava em disco o modelo que realmente respondeu.
// Rode com: node test/modelo-ruim.test.js

const http = require("node:http");
const assert = require("node:assert");

function responderEmFrases(res, texto) {
  res.setHeader("content-type", "text/event-stream");
  res.write(
    "data: " +
      JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: texto }] } }] }) +
      "\n\n"
  );
  res.end();
}

// A lista verdadeira da conta dele, tirada do log.
const DA_CONTA = [
  "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-pro-latest",
  "gemini-4-argon", "gemini-3.5-transcribe", "gemini-flash-lite-latest",
  "gemini-3.1-pro-preview-customtools",
];

const TRANSCRITOR = "gemini-3.5-transcribe";
const BOM = "gemini-flash-latest";

let cenario = "config-envenenado";
const tentados = [];

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url.split("?")[0];
    res.setHeader("content-type", "application/json");

    if (url.endsWith("/models")) {
      return res.end(
        JSON.stringify({
          models: DA_CONTA.map((n) => ({
            name: `models/${n}`,
            supportedGenerationMethods: ["generateContent"],
          })),
        })
      );
    }

    const modelo = url.match(/models\/([^:]+):/)[1];
    tentados.push(modelo);

    // Um transcritor não conversa. A mensagem é a do Google, palavra por palavra.
    if (modelo === TRANSCRITOR || modelo === "gemini-3.1-pro-preview-customtools") {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          error: { code: 400, status: "INVALID_ARGUMENT", message: "Function calling is not enabled for this model" },
        })
      );
    }

    if (cenario === "lotado" && modelo === BOM) {
      res.statusCode = 503;
      return res.end(
        JSON.stringify({
          error: { code: 503, status: "UNAVAILABLE", message: "This model is currently experiencing high demand." },
        })
      );
    }

    responderEmFrases(res, "Pronto, mandei a mensagem.");
  });
});

servidor.listen(0, async () => {
  process.env.EV_GEMINI_API = `http://127.0.0.1:${servidor.address().port}`;
  const brains = require("../brains.js");
  const { createBrain, modeloServe, rankModels } = brains;
  conferirModeloHerdado(brains);

  // ------------------------------------- 1. a lista não oferece o que não serve
  const lista = rankModels({
    models: DA_CONTA.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })),
  });
  assert.ok(!lista.includes(TRANSCRITOR), "transcritor não pode entrar na lista de candidatos");
  assert.ok(lista.includes(BOM), "o modelo bom tem de continuar na lista");
  assert.ok(!modeloServe(TRANSCRITOR) && modeloServe(BOM));

  // --------------------------- 2. config envenenado se cura na primeira frase
  tentados.length = 0;
  const gravados = [];
  const ditos = [];
  const b1 = createBrain({ apiKey: "AQ.x", model: TRANSCRITOR }); // exatamente o config dele
  await b1.ask("manda uma mensagem pra minha mãe", {
    onSay: (t) => ditos.push(t),
    onTool: () => {},
    onDebug: () => {},
    onModel: (m) => gravados.push(m),
  });

  assert.deepStrictEqual(ditos, ["Pronto, mandei a mensagem."], "ela tem de responder, não morrer no 400");
  assert.ok(
    !tentados.includes(TRANSCRITOR),
    `o modelo salvo que não serve nem devia ser tentado; tentou: ${tentados.join(", ")}`
  );
  assert.ok(gravados.length > 0, "o modelo que funcionou precisa ser gravado em lugar do ruim");
  for (const m of gravados) assert.ok(modeloServe(m), `gravou um modelo que não serve: ${m}`);

  // ------------- 3. 400 descoberto em uso: troca e grava o que respondeu
  // Aqui o nome não denuncia nada — a recusa só aparece na hora de gerar.
  tentados.length = 0;
  const gravados2 = [];
  const ditos2 = [];
  const b2 = createBrain({ apiKey: "AQ.x", model: null });
  b2.model = "gemini-3.1-pro-preview-customtools"; // escapou pela lista
  b2.candidatos = [b2.model];
  await b2.ask("e agora?", {
    onSay: (t) => ditos2.push(t),
    onTool: () => {},
    onDebug: () => {},
    onModel: (m) => gravados2.push(m),
  });

  assert.deepStrictEqual(ditos2, ["Pronto, mandei a mensagem."], "400 do modelo = trocar, não desistir");
  assert.strictEqual(gravados2.at(-1), BOM, "grava o modelo que respondeu");
  assert.ok(
    b2.descartados.has("gemini-3.1-pro-preview-customtools"),
    "quem recusou conversar fica descartado pela sessão"
  );

  // ------------------- 4. troca por LOTAÇÃO não vira preferência gravada
  cenario = "lotado";
  tentados.length = 0;
  const gravados3 = [];
  const b3 = createBrain({ apiKey: "AQ.x", model: BOM });
  await b3.ask("oi", { onSay: () => {}, onTool: () => {}, onDebug: () => {}, onModel: (m) => gravados3.push(m) });
  assert.deepStrictEqual(gravados3, [], "lotação é temporária: não pode mudar o modelo salvo");

  console.log("✓ modelo ruim: não entra na lista, não desiste no 400, e só grava o que respondeu");
  console.log("   config com", TRANSCRITOR, "→ nem tentado; respondeu por", gravados.at(-1));
  console.log("   400 em uso  → trocou para", gravados2.at(-1), "e descartou o ruim");
  console.log("   503         → trocou para responder, sem gravar preferência");
  servidor.close();
});

// ---------------------------------------------------------------------------
// 4. O caso de 27/10: modelo do provedor ERRADO herdado na abertura
// ---------------------------------------------------------------------------
// O log mostrou, duas vezes no mesmo dia:
//   "Groq: modelo gemini-3.6-flash não existe nesta conta; procurando outro"
// mesmo com `groqModel: "openai/gpt-oss-120b"` já salvo em disco.
//
// A causa: `config.model` guarda o modelo do provedor que estava ativo quando
// foi gravado, e a corrente troca de provedor SOZINHA sem limpar o campo.
// Montando a corrente, o provedor principal lia `config.model` e ignorava o
// `groqModel` que ele mesmo tinha descoberto. Custava um 404 e uma listagem de
// modelos por abertura — a recuperação funcionava, então nada parecia quebrado.
// É função, e não um bloco solto no fim do arquivo: um `require("../brains.js")`
// aqui em cima rodaria ANTES de EV_GEMINI_API ser definido lá dentro do listen,
// e o brains.js leria o endereço real do Google em vez do servidor falso.
function conferirModeloHerdado({ createBrain, modeloCombina }) {

  const config = {
    provider: "groq",
    groqKey: "gsk_teste",
    groqModel: "openai/gpt-oss-120b",
    model: "gemini-3.6-flash", // sobra de quando o Gemini era o cérebro
  };

  const cerebro = createBrain(config, { prompt: () => "x" });
  const principal = cerebro.etapas ? cerebro.etapas[0] : cerebro;
  assert.strictEqual(
    principal.model || cerebro.model,
    "openai/gpt-oss-120b",
    "o provedor principal tem de usar o modelo DELE, não o que sobrou de outro"
  );

  // Sem campo próprio, um nome de outro provedor não pode semear o pedido: o
  // cérebro cai no padrão do Groq, que pelo menos existe lá.
  const semSalvo = createBrain(
    { provider: "groq", groqKey: "gsk_teste", model: "gemini-3.6-flash" },
    { prompt: () => "x" }
  );
  assert.notStrictEqual(
    semSalvo.model,
    "gemini-3.6-flash",
    "nome claramente de outro provedor não pode virar o pedido: só renderia 404"
  );
  assert.ok(semSalvo.model, "mas tem de sobrar algum modelo para tentar");

  // Já um nome que PODE ser do provedor continua valendo — "llama-3.3-70b"
  // existe no Groq, na NVIDIA e no OpenRouter, e descartá-lo seria jogar fora
  // uma escolha legítima dele.
  const plausivel = createBrain(
    { provider: "groq", groqKey: "gsk_teste", model: "llama-3.3-70b-versatile" },
    { prompt: () => "x" }
  );
  assert.strictEqual(plausivel.model, "llama-3.3-70b-versatile");

  // E numa corrente de verdade (mais de um provedor com chave), cada etapa
  // carrega o modelo DELA — era esse o caso real do log.
  const corrente = createBrain(
    { provider: "groq", groqKey: "g", nvidiaKey: "n", groqModel: "openai/gpt-oss-120b", model: "gemini-3.6-flash", conversaProvider: "nenhum" },
    { prompt: () => "x" }
  );
  assert.strictEqual(corrente.etapas[0].provider, "groq");
  assert.strictEqual(corrente.etapas[0].model, "openai/gpt-oss-120b");

  assert.strictEqual(modeloCombina("gemini", "openai/gpt-oss-120b"), false);
  assert.strictEqual(modeloCombina("anthropic", "claude-opus-5"), true);

  console.log("   modelo herdado   → o campo do provedor manda; nome de outro é descartado");
}
