// duas-vozes.test.js — o cérebro que AGE e o cérebro que CONVERSA.
//
// Nenhum modelo grátis dele faz as duas coisas. O nemotron da nvidia acerta a
// ferramenta e vaza a identidade de treino em 10 de 12 perguntas sobre ela
// mesma; o qwen do Groq vazou 0 de 6 e soa humano, mas com as 30 ferramentas
// no pedido bate 429 no terceiro, porque o teto de lá é 8.000 tokens por
// minuto e as ferramentas sozinhas custam 2.463.
//
// A ordem é o que faz isto ser seguro, e ela é CONTRAINTUITIVA: quem decide
// ferramenta é sempre o cérebro de ação. Rotear antes — mandar para a conversa
// e deixar ela pedir socorro — foi medido e reprovado: o qwen respondeu
// sozinha a "me faz um pdf" e a "como tá o meu computador?", 1 erro em 5
// pedidos de ação, e o erro é ela afirmar que fez o que não fez.
//
// O que este arquivo guarda:
//   • turno com ferramenta → a voz da AÇÃO responde (só ela viu o resultado);
//   • turno sem ferramenta → a resposta da ação é descartada e a CONVERSA fala;
//   • o pedido da conversa NUNCA leva as ferramentas (é o ponto da economia);
//   • o histórico da conversa não leva chamada nem resultado de ferramenta;
//   • conversa secou (429 do Groq) → a resposta da ação é usada, nunca mudez.
// Rode com: node test/duas-vozes.test.js

const http = require("node:http");
const assert = require("node:assert");

function sse(res, eventos) {
  res.setHeader("content-type", "text/event-stream");
  for (const e of eventos) res.write("data: " + JSON.stringify(e) + "\n\n");
  res.write("data: [DONE]\n\n");
  res.end();
}
const delta = (d) => ({ choices: [{ index: 0, delta: d }] });

const recebidos = [];
let cenario = "conversa";

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const pedido = body ? JSON.parse(body) : {};
    // /mistral é a AÇÃO neste teste; /groq é a voz de CONVERSA.
    const qual = req.url.startsWith("/groq") ? "conversa" : "acao";
    recebidos.push({ qual, pedido });

    if (qual === "conversa") {
      if (cenario === "conversa-esgotada") {
        res.statusCode = 429;
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ error: { message: "Rate limit reached" } }));
      }
      return sse(res, [delta({ content: "Que bom te ver. " }), delta({ content: "Como foi o dia?" })]);
    }

    // ---- a ação chama ferramenta e depois responde com o resultado
    if (cenario === "acao") {
      const jaTemResultado = (pedido.messages || []).some((m) => m.role === "tool");
      if (!jaTemResultado) {
        return sse(res, [
          delta({ content: "Deixa eu ver aqui. " }),
          delta({ tool_calls: [{ index: 0, id: "c1", function: { name: "system_status" } }] }),
          delta({ tool_calls: [{ index: 0, function: { arguments: "{}" } }] }),
        ]);
      }
      return sse(res, [delta({ content: "Seu Mac está com 12% de CPU." })]);
    }

    // ---- a ação não chama nada: era conversa, e esta resposta vai ser jogada
    // fora. O texto é o vazamento de verdade, medido no log de 02/11.
    return sse(res, [
      delta({ content: "Não, sou um modelo de linguagem " }),
      delta({ content: "treinado por pesquisadores da NVIDIA." }),
    ]);
  });
});

servidor.listen(0, async () => {
  const base = `http://127.0.0.1:${servidor.address().port}`;
  process.env.EV_MISTRAL_API = `${base}/mistral`;
  process.env.EV_GROQ_API = `${base}/groq`;
  const { createBrain } = require("../brains.js");
  const ops = { onDebug: () => {}, onModel: () => {}, onModeloProvedor: () => {} };

  // mistral é a ação (é o `provider`), groq é a voz de conversa.
  const montar = (extra = {}) =>
    createBrain({ provider: "mistral", mistralKey: "m_x", groqKey: "gsk_x", ...extra });

  // ----------------------------------------------- 1. a montagem
  const b = montar();
  assert.strictEqual(b.constructor.name, "CerebroDeDuasVozes", "duas chaves = duas vozes");
  assert.strictEqual(b.conversa.provider, "groq");
  assert.strictEqual(b.conversa.semFerramentas, true, "a voz de conversa vai SEM ferramentas");
  assert.strictEqual(b.provider, "mistral", "a identidade visível é a da ação");

  // Uma chave só: não há com quem fazer a segunda voz.
  assert.strictEqual(
    createBrain({ provider: "mistral", mistralKey: "m_x" }).constructor.name,
    "OpenAIBrain",
    "sem chave de outro provedor, fica o cérebro simples"
  );
  // E a conversa nunca cai no MESMO provedor da ação: seria o mesmo balde de
  // limite, que é justamente o que estoura.
  assert.strictEqual(
    createBrain({ provider: "groq", groqKey: "gsk_x" }).constructor.name,
    "OpenAIBrain",
    "groq na ação não pode virar groq na conversa também"
  );
  // `nenhum` desliga a segunda voz. Sobra só o mistral: o groq também não
  // entra na reserva da ação, porque com as ferramentas ele não cabe duas
  // vezes no minuto (04/11, 34 ferramentas).
  assert.notStrictEqual(montar({ conversaProvider: "nenhum" }).constructor.name, "CerebroDeDuasVozes", "`nenhum` desliga a segunda voz");
  // E a voz de conversa não fica também na reserva da ação: mesmo balde.
  const comReserva = createBrain({ provider: "nvidia", nvidiaKey: "n", mistralKey: "m", groqKey: "g" });
  assert.strictEqual(comReserva.conversa.provider, "groq");
  assert.deepStrictEqual(comReserva.etapas.map((e) => e.provider), ["nvidia", "mistral"]);
  assert.strictEqual(
    montar({ conversaProvider: "nenhum" }).provider,
    "mistral",
    "sem a conversa, a ação é o mistral sozinho"
  );

  // ------------------------- 2. turno SEM ferramenta → a conversa responde
  cenario = "conversa";
  recebidos.length = 0;
  const ditos = [];
  const b1 = montar();
  await b1.ask("oi, tudo bem?", { ...ops, onSay: (t) => ditos.push(t), onTool: () => {} });

  const fala = ditos.join(" ");
  assert.ok(
    /Que bom te ver/.test(fala),
    `quem devia falar era a voz de conversa, e saiu: ${fala}`
  );
  assert.ok(
    !/modelo de linguagem|NVIDIA/i.test(fala),
    "a resposta da ação tinha de ser DESCARTADA: é ela que vaza"
  );
  assert.deepStrictEqual(
    recebidos.map((r) => r.qual),
    ["acao", "conversa"],
    "a ação decide primeiro, a conversa escreve depois"
  );
  assert.ok(recebidos[0].pedido.tools?.length, "a ação precisa das ferramentas para decidir");
  assert.strictEqual(
    recebidos[1].pedido.tools, undefined,
    "a conversa NÃO pode levar ferramenta: são 2.463 dos 3.921 tokens fixos"
  );

  // ------------------------- 3. turno COM ferramenta → a ação responde
  cenario = "acao";
  recebidos.length = 0;
  const ditos2 = [];
  const usadas = [];
  const b2 = montar();
  await b2.ask("como tá meu computador?", {
    ...ops, onSay: (t) => ditos2.push(t), onTool: (n) => usadas.push(n),
  });

  assert.deepStrictEqual(usadas, ["system_status"], "a ferramenta tinha de ser chamada");
  const fala2 = ditos2.join(" ");
  assert.ok(/12% de CPU/.test(fala2), `a resposta com o resultado é da ação, e saiu: ${fala2}`);
  // O "deixa eu ver aqui" é fala legítima: fica guardado só até a primeira
  // ferramenta aparecer, e aí sai na ordem.
  assert.ok(/Deixa eu ver aqui/.test(fala2), "o que ela diz antes de agir não pode se perder");
  assert.ok(
    ditos2.findIndex((t) => /Deixa eu ver/.test(t)) < ditos2.findIndex((t) => /12%/.test(t)),
    "e tem de sair ANTES da resposta, na ordem em que foi dito"
  );
  assert.ok(
    !recebidos.some((r) => r.qual === "conversa"),
    "turno de ação não gasta a voz de conversa: ela não viu o resultado da ferramenta"
  );

  // --------------- 4. o histórico da conversa não leva ferramenta
  // Um `tool_calls` no histórico de quem não tem ferramenta é referência a
  // algo que ela não conhece, e um `role: "tool"` órfão faz a API recusar o
  // pedido INTEIRO — a conversa morreria no turno seguinte a uma ação.
  cenario = "conversa";
  recebidos.length = 0;
  await b2.ask("e aí, o que você achou?", { ...ops, onSay: () => {}, onTool: () => {} });

  const pedidoDaConversa = recebidos.find((r) => r.qual === "conversa").pedido;
  for (const m of pedidoDaConversa.messages) {
    assert.ok(!m.tool_calls, "chamada de ferramenta não pode entrar no histórico da conversa");
    assert.notStrictEqual(m.role, "tool", "resultado de ferramenta também não");
    assert.strictEqual(typeof m.content, "string", "só texto");
  }
  // Mas o ASSUNTO precisa atravessar: ela tem de saber do que se falava.
  assert.ok(
    pedidoDaConversa.messages.some((m) => /12% de CPU/.test(m.content)),
    "o que a ação respondeu no turno anterior tem de estar no histórico da conversa"
  );
  assert.ok(
    pedidoDaConversa.messages.some((m) => /o que você achou/.test(m.content)),
    "e a pergunta de agora também"
  );

  // ------------- 5. a conversa secou → a resposta da ação serve
  // O Groq dá umas cinco perguntas por minuto. Quando ele seca, pior do que
  // uma resposta sem graça é a E.V.E ficar MUDA.
  cenario = "conversa-esgotada";
  recebidos.length = 0;
  const ditos3 = [];
  const b3 = montar();
  await b3.ask("oi", { ...ops, onSay: (t) => ditos3.push(t), onTool: () => {} });
  const fala3 = ditos3.join(" ");
  assert.ok(fala3.trim().length > 0, "limite da conversa não pode virar silêncio");
  assert.ok(
    /modelo de linguagem|NVIDIA/i.test(fala3),
    `aqui a resposta da ação é o que sobrou, e devia ter sido usada; saiu: ${fala3}`
  );

  // ------------- 6. anexo não atravessa para a voz de conversa
  // Ela foi escolhida por conversar, não por ler imagem nem PDF.
  cenario = "conversa";
  recebidos.length = 0;
  const ditos4 = [];
  const b4 = montar();
  await b4.ask("o que é isso?", {
    ...ops, onSay: (t) => ditos4.push(t), onTool: () => {},
    anexo: { nome: "foto.png", base64: "AAAA", mime: "image/png" },
  });
  assert.ok(
    !recebidos.some((r) => r.qual === "conversa"),
    "com anexo, o turno fica inteiro na ação"
  );
  assert.ok(ditos4.join(" ").trim().length > 0, "e ela responde algo");

  console.log("✓ duas vozes: a ação decide a ferramenta, a conversa escreve o resto");
  console.log("   sem ferramenta → fala a conversa; a resposta da ação (que vaza) é descartada");
  console.log("   com ferramenta → fala a ação, e o \"deixa eu ver\" sai antes, na ordem");
  console.log("   pedido da conversa → sem as 30 ferramentas: 1.458 tokens em vez de 3.921");
  console.log("   histórico da conversa → só texto, e o assunto da ação atravessa");
  console.log("   conversa em 429  → a resposta da ação é usada; nunca fica muda");
  console.log("   anexo            → fica na ação, que é quem lê imagem e PDF");
  servidor.close();
});
