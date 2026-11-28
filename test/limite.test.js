// limite.test.js — quando os passos acabam, ela diz o que conseguiu.
//
// 27/11/2026, 23:12 e 28/11, 02:44: cinco respostas iguais, "Executei vários
// passos e ainda não terminei. Quer que eu continue?" — depois de ler doze
// páginas do Notion, sem dizer nada do que leu. Agora, no fim dos passos, um
// último pedido SEM ferramenta (tool_choice "none") pede o resumo; os botões
// Continua/Pode parar vêm do sinal onLimite, não da frase.
// Rode com: node test/limite.test.js

const http = require("node:http");
const assert = require("node:assert");

const sse = (res, eventos) => {
  res.setHeader("content-type", "text/event-stream");
  for (const e of eventos) res.write("data: " + JSON.stringify(e) + "\n\n");
  res.write("data: [DONE]\n\n");
  res.end();
};
const delta = (d) => ({ choices: [{ index: 0, delta: d }] });

const pedidos = [];
let n = 0;
const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const p = JSON.parse(body || "{}");
    pedidos.push(p);
    if (p.tool_choice === "none") {
      return sse(res, [delta({ content: "Li 16 páginas: rotina, gostos e o show. Faltam as de 2025. Quer que eu continue?" })]);
    }
    n++;
    return sse(res, [
      delta({ tool_calls: [{ index: 0, id: "c" + n, function: { name: "ferramenta_de_teste", arguments: `{"x":${n}}` } }] }),
    ]);
  });
});

servidor.listen(0, async () => {
  try {
    process.env.EV_MISTRAL_API = `http://127.0.0.1:${servidor.address().port}/mistral`;
    const { createBrain } = require("../brains.js");
    const b = createBrain({ provider: "mistral", mistralKey: "m_x" });
    const ditos = [];
    let limite = 0;
    await b.ask("lê tudo", {
      onSay: (t) => ditos.push(t), onTool: () => {}, onDebug: () => {}, onModel: () => {},
      onModeloProvedor: () => {}, onLimite: () => limite++,
    });
    const fala = ditos.join(" ");
    assert.ok(/Li 16 páginas/.test(fala), `o resumo de verdade tinha de sair: ${fala}`);
    assert.ok(!/Executei vários passos/.test(fala), "não a frase pronta");
    assert.strictEqual(limite, 1, "o sinal dos botões Continua/Pode parar");
    assert.strictEqual(pedidos.at(-1).tool_choice, "none", "o resumo não chama ferramenta");
    assert.ok(
      !b.messages.some((m) => /Nota interna/.test(m.content || "")),
      "a nota interna sai do histórico"
    );
    console.log("✓ limite: no fim dos passos ela conta o que já fez");
  } catch (e) {
    console.error("✗", e);
    process.exitCode = 1;
  } finally {
    servidor.close();
  }
});
