// chats.test.js — as conversas da barra lateral (25/11/2026).
// Trocar de conversa nunca apaga nada; a aberta continua no historico.json.
// Rode com: node test/chats.test.js
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Chats, tituloDe } = require("../chats.js");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "chats-"));
let historico = [
  { quem: "voce", texto: "quanto sobra esse mês?", hora: "2026-11-20T10:00:00Z" },
  { quem: "eve", texto: "Sobram 300.", hora: "2026-11-20T10:00:05Z" },
];
const chats = new Chats({
  arquivo: path.join(pasta, "chats.json"),
  historico: { ler: () => historico, gravar: (i) => (historico = i) },
  agora: () => new Date("2026-11-25T22:00:00Z"),
});

// 1. Primeira vez: o histórico que já existia vira a conversa aberta.
let lista = chats.listar();
assert.strictEqual(lista.length, 1);
assert.strictEqual(lista[0].atual, true);
assert.strictEqual(lista[0].titulo, "Quanto sobra esse mês?");
const primeira = lista[0].id;

// 2. Nova conversa guarda a anterior inteira e zera o histórico.
const nova = chats.nova();
assert.deepStrictEqual(historico, []);
lista = chats.listar();
assert.strictEqual(lista.length, 2);
assert.strictEqual(lista[0].id, nova.id);
assert.strictEqual(lista[0].titulo, "Nova conversa");
assert.strictEqual(lista[1].id, primeira);
assert.strictEqual(lista[1].mensagens, 1);

// 3. Conversa vazia não vira lixo na lista ao trocar.
historico.push({ quem: "voce", texto: "marca dentista amanhã", hora: "2026-11-25T22:01:00Z" });
const voltou = chats.abrir(primeira);
assert.strictEqual(voltou.itens.length, 2, "a conversa antiga volta inteira");
assert.strictEqual(historico[0].texto, "quanto sobra esse mês?");
lista = chats.listar();
assert.strictEqual(lista.length, 2, "a do dentista ficou guardada");
assert.ok(lista.some((c) => c.titulo === "Marca dentista amanhã"));

chats.nova();
chats.nova(); // duas novas seguidas: a vazia do meio não é guardada
assert.strictEqual(chats.listar().length, 3);

// 4. Id que não existe não muda nada.
const antes = JSON.stringify(historico);
assert.strictEqual(chats.abrir("nao-existe"), null);
assert.strictEqual(JSON.stringify(historico), antes);

// 5. Renomear.
assert.ok(chats.renomear(primeira, "  Finanças   de novembro "));
assert.ok(chats.listar().some((c) => c.titulo === "Finanças de novembro"));
assert.ok(!chats.renomear(primeira, "   "));

// 6. Título: tira o [anexo] da frente e corta frase longa na palavra.
assert.strictEqual(tituloDe([{ quem: "voce", texto: "[nota.pdf] resume isso" }]), "Resume isso");
assert.ok(tituloDe([{ quem: "voce", texto: "a ".repeat(60) }]).endsWith("…"));

fs.rmSync(pasta, { recursive: true, force: true });
console.log("✓ chats: nova, abrir, guardar e renomear sem perder nada");
