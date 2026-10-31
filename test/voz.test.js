// voz.test.js — valida a integração com a ElevenLabs sem gastar cota nem chave real.
// Rode com: node test/voz.test.js

const http = require("node:http");
const assert = require("node:assert");

const pedidos = [];
let modo = "ok";

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url.split("?")[0];
    pedidos.push({ url, chave: req.headers["xi-api-key"], body: body ? JSON.parse(body) : null });

    if (modo === "semChave") {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ detail: { message: "Invalid API key" } }));
    }
    if (modo === "semPermissao") {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({
          detail: {
            message: "The API key you used is missing the permission voices_read to execute this operation.",
          },
        })
      );
    }
    if (modo === "semCota") {
      res.statusCode = 429;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ detail: { message: "Quota exceeded for this month" } }));
    }
    // A cota estourada do jeito que a ElevenLabs manda DE VERDADE: 401 e não
    // 429. Esta resposta é copiada do log do Matheus, dia 30/10, palavra por
    // palavra — foi ela que fez o app dizer "chave inválida" com a chave boa.
    if (modo === "cota401") {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({
          detail: {
            message:
              "This request exceeds your quota of 10000. You have 0 credits remaining, " +
              "while 33 credits are required for this request.",
          },
        })
      );
    }

    if (url === "/voices") {
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({
          voices: [
            {
              voice_id: "v1",
              name: "Sarah",
              labels: { gender: "female", accent: "brazilian", description: "calm" },
              preview_url: "http://exemplo/preview.mp3",
            },
            { voice_id: "v2", name: "Antoni", labels: { gender: "male" } },
          ],
        })
      );
    }

    if (url === "/user/subscription") {
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({
          character_count: 1500,
          character_limit: 10000,
          tier: "free",
          next_character_count_reset_unix: 1762142698,
        })
      );
    }

    if (url.startsWith("/text-to-speech/")) {
      res.setHeader("content-type", "audio/mpeg");
      return res.end(Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4])); // "MP3"
    }

    res.statusCode = 404;
    res.end("{}");
  });
});

servidor.listen(0, async () => {
  process.env.EV_ELEVEN_API = `http://127.0.0.1:${servidor.address().port}`;
  const tts = require("../tts.js");

  // --- listagem de vozes ---
  const vozes = await tts.listarVozesEleven("chave-teste");
  assert.strictEqual(vozes.length, 2);
  assert.deepStrictEqual(vozes[0], {
    id: "v1",
    nome: "Sarah",
    descricao: "female · brazilian · calm",
    previewUrl: "http://exemplo/preview.mp3",
  });
  assert.strictEqual(vozes[1].previewUrl, null, "voz sem amostra não quebra a lista");
  assert.strictEqual(pedidos[0].chave, "chave-teste", "a chave vai no cabeçalho xi-api-key");

  // --- cota ---
  const cota = await tts.cotaEleven("chave-teste");
  assert.deepStrictEqual(cota, { usado: 1500, limite: 10000, plano: "free", renova: 1762142698 });

  // --- síntese: qualidade x rapidez ---
  const audio = await tts.sintetizarEleven("Oi, tudo bem?", { apiKey: "k", voiceId: "v1" });
  assert.ok(Buffer.isBuffer(audio) && audio.length > 0, "deve devolver bytes de áudio");
  const pedidoFala = pedidos.at(-1);
  assert.strictEqual(pedidoFala.url, "/text-to-speech/v1");
  assert.strictEqual(pedidoFala.body.text, "Oi, tudo bem?");
  assert.strictEqual(pedidoFala.body.model_id, tts.MODELO_QUALIDADE, "padrão é a melhor qualidade");

  // Sem isto o modelo DETECTA o idioma a cada pedido — e como a fala sai frase
  // a frase, uma frase curta com palavra inglesa saía com sotaque inglês e a
  // seguinte voltava ao português, no meio da mesma resposta.
  assert.strictEqual(
    pedidoFala.body.language_code,
    "pt",
    "o idioma precisa ir fixo no pedido, senão o sotaque troca no meio da resposta"
  );

  await tts.sintetizarEleven("rápido", { apiKey: "k", voiceId: "v1", rapido: true });
  assert.strictEqual(pedidos.at(-1).body.model_id, tts.MODELO_RAPIDO, "modo rápido troca o modelo");

  // ------------------------------- velocidade da fala
  // A ElevenLabs aceita de 0,7 a 1,2 e RECUSA o pedido inteiro fora disso —
  // e uma recusa aqui é cair para a voz do macOS no meio de uma frase, que
  // soa muito pior do que uma fala um pouco mais lenta do que se pediu.
  const { velocidadeValida, VELOCIDADE_MIN, VELOCIDADE_MAX } = tts;
  assert.strictEqual(velocidadeValida(1.12), 1.12);
  assert.strictEqual(velocidadeValida(3), VELOCIDADE_MAX, "acima do teto, limita — não manda e torce");
  assert.strictEqual(velocidadeValida(0.1), VELOCIDADE_MIN);
  assert.strictEqual(velocidadeValida(undefined), 1, "sem ajuste, velocidade normal");
  assert.strictEqual(velocidadeValida("abc"), 1, "lixo no config não pode virar pedido inválido");

  // E a velocidade precisa chegar de fato no corpo do pedido.
  await tts.sintetizarEleven("teste de velocidade", {
    apiKey: "k", voiceId: "v1", rapido: true, velocidade: 1.12,
  });
  const corpo = pedidos.at(-1).body;
  assert.strictEqual(corpo.voice_settings.speed, 1.12, "a velocidade tem de viajar em voice_settings");
  assert.strictEqual(corpo.language_code, "pt", "e o idioma fixo continua lá (o sotaque trocava sem ele)");



  // --- erros que devem disparar a voz reserva ---
  modo = "semChave";
  const e401 = await tts.sintetizarEleven("x", { apiKey: "ruim", voiceId: "v1" }).catch((e) => e);
  assert.strictEqual(e401.status, 401);
  assert.match(tts.explicarErroEleven(e401), /Chave da ElevenLabs inválida/);

  // Chave válida, mas sem a permissão exigida — o caso real que o Matheus encontrou.
  modo = "semPermissao";
  const ePerm = await tts.sintetizarEleven("x", { apiKey: "k", voiceId: "v1" }).catch((e) => e);
  const msgPerm = tts.explicarErroEleven(ePerm);
  assert.match(msgPerm, /válida, mas falta a permissão/, "não pode dizer que a chave é inválida");
  assert.match(msgPerm, /Voices › Read/, "deve nomear a permissão em português");
  assert.doesNotMatch(msgPerm, /Gere outra/, "não deve mandar gerar uma chave nova à toa");

  modo = "semCota";
  const e429 = await tts.sintetizarEleven("x", { apiKey: "k", voiceId: "v1" }).catch((e) => e);
  assert.strictEqual(e429.status, 429);
  assert.match(tts.explicarErroEleven(e429), /cota da ElevenLabs acabou.*macOS/s);

  // ---- o conserto do dia 30/10 ----
  // A cota esgotada chega com status 401. A verificação de 401 vinha ANTES da
  // de cota e ganhava, então o app mandava ele gerar uma chave nova — e a chave
  // estava perfeita. Este teste falha na ordem antiga.
  modo = "cota401";
  const eCota401 = await tts.sintetizarEleven("x", { apiKey: "k", voiceId: "v1" }).catch((e) => e);
  assert.strictEqual(eCota401.status, 401, "a ElevenLabs manda 401 quando a cota acaba");
  const msgCota = tts.explicarErroEleven(eCota401);
  assert.match(msgCota, /cota da ElevenLabs acabou/i, "tem de falar de COTA, não de chave");
  assert.match(msgCota, /a chave está boa/i, "e precisa dizer que a chave não é o problema");
  assert.doesNotMatch(msgCota, /inválida|Gere outra/i, "não pode mandar trocar a chave");

  // Chave de verdade ruim continua sendo diagnosticada como chave ruim.
  modo = "semChave";
  const eRuim = await tts.sintetizarEleven("x", { apiKey: "ruim", voiceId: "v1" }).catch((e) => e);
  assert.match(tts.explicarErroEleven(eRuim), /Chave da ElevenLabs inválida/);

  // A data de renovação tem de sair da cota, senão o aviso não sabe dizer
  // quando a voz volta.
  modo = "ok";
  const cotaRenova = await tts.cotaEleven("k");
  assert.strictEqual(cotaRenova.renova, 1762142698, "a data em que a cota renova precisa vir");
  console.log("✓ ElevenLabs: listagem, cota, síntese, velocidade e mensagens de erro");
  console.log("  vozes lidas:", vozes.map((v) => v.nome).join(", "));
  console.log("  cota:", `${cota.usado}/${cota.limite} caracteres`);
  console.log("  sem cota →", tts.explicarErroEleven(e429));
  console.log("  cota com 401 →", msgCota);
  servidor.close();
});
