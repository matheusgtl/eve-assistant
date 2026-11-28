// segredos.test.js — chave colada no chat não sai do Mac.
//
// 27/11/2026, 22:51: a chave do Notion colada no chat foi numa busca na web,
// em catorze curl, no eve.log e na nota da conversa no cofre. As chaves daqui
// são inventadas, no formato dos serviços.
// Rode com: node test/segredos.test.js

const assert = require("node:assert");
const { temSegredo, redigir, servicoDe, MARCA } = require("../segredos.js");
const registro = require("../registro.js");
const ferramentas = require("../tools.js");

const falsa = "ntn_" + "0".repeat(12) + "AbCdEfGhIjKlMnOpQrStUv" + "12345";

(async () => {
  assert.ok(temSegredo(`${falsa} pode testar`));
  assert.strictEqual(redigir(`${falsa} pode testar`), `${MARCA} pode testar`);
  assert.strictEqual(servicoDe(falsa), "Notion");
  for (const t of [
    "gsk_" + "a1".repeat(15), "nvapi-" + "Zz9".repeat(10), "AIza" + "b".repeat(35),
    "sk-proj-" + "c".repeat(30), "tvly-" + "d".repeat(20),
  ]) assert.ok(temSegredo(`a chave é ${t}`), `devia pegar ${t.slice(0, 8)}…`);

  // O que NÃO é segredo passa: id de página do Notion, hash, texto comum.
  for (const t of [
    "https://app.notion.com/p/Meu-Dashboard-253ea19b9a6480fd8face2fcd90a68a5",
    "commit 6fb6ee0a1b2c3d4e5f60718293a4b5c6d7e8f901",
    "o secret_santa da firma é sexta",
    "minha task-list está aqui",
  ]) assert.ok(!temSegredo(t), `não devia pegar: ${t}`);

  // O log nunca escreve a chave.
  const l = registro.linha(["── #5 escreveu:", JSON.stringify(`${falsa} pode testar`)]);
  assert.ok(!l.includes(falsa) && l.includes(MARCA), l);

  // A busca na web recusa a chave.
  const r = JSON.parse(await ferramentas.runTool("web_search", { query: `Notion API test ${falsa}` }));
  assert.ok(r.error && /chave/.test(r.error), JSON.stringify(r));
  const p = JSON.parse(await ferramentas.runTool("read_webpage", { url: `https://x.com/?k=${falsa}` }));
  assert.ok(p.error && /chave/.test(p.error), JSON.stringify(p));

  console.log("✓ segredos: chave escondida no log e recusada na web; id de página passa");
})().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
