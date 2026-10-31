// lembretes.test.js — o que precisa estar certo nos lembretes:
//   1. entender o horário (ISO e as formas que uma pessoa fala)
//   2. disparar na hora, uma única vez
//   3. sobreviver a fechar o app, inclusive quando a hora passou com ele fechado
// Rode com: node test/lembretes.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Lembretes, interpretarQuando, formatar } = require("../lembretes.js");

// ---------------------------------------------------------------- 1. horários
// Quinta-feira, 22 de outubro de 2026, 14:00.
const agora = new Date(2026, 9, 22, 14, 0, 0);
const q = (texto) => interpretarQuando(texto, agora);

assert.strictEqual(q("2026-10-22T15:30").getHours(), 15, "ISO com hora");
assert.strictEqual(q("2026-10-22T15:30").getMinutes(), 30);
assert.strictEqual(q("2026-12-25").getMonth(), 11, "ISO só com data");
assert.strictEqual(q("2026-12-25").getHours(), 9, "data sem hora cai na manhã");

const dezMin = q("em 10 minutos");
assert.strictEqual(dezMin.getTime() - agora.getTime(), 600_000, "em 10 minutos");
assert.strictEqual(q("daqui a 2 horas").getHours(), 16);
assert.strictEqual(q("em 30 segundos").getTime() - agora.getTime(), 30_000);

const amanha = q("amanhã às 9");
assert.strictEqual(amanha.getDate(), 23, "amanhã é dia 23");
assert.strictEqual(amanha.getHours(), 9);

const hoje18 = q("hoje às 18:30");
assert.strictEqual(hoje18.getDate(), 22);
assert.strictEqual(hoje18.getHours(), 18);
assert.strictEqual(hoje18.getMinutes(), 30);

// "às 8 da noite" não é 8 da manhã.
assert.strictEqual(q("às 8 da noite").getHours(), 20, "8 da noite = 20h");

// Hora que já passou, sem dizer o dia: é para amanhã, não para o passado.
const passou = q("às 10h");
assert.strictEqual(passou.getDate(), 23, "10h de uma quinta às 14h = 10h de sexta");
assert.ok(passou > agora, "nunca devolver um horário no passado");

// Dia da semana: "na segunda" dito numa quinta é a segunda que vem.
const segunda = q("segunda às 9");
assert.strictEqual(segunda.getDay(), 1);
assert.strictEqual(segunda.getDate(), 26);

assert.strictEqual(q("qualquer coisa sem horário"), null, "o que não dá para entender volta null");
assert.strictEqual(q(""), null);

// ------------------------------------------------- 2. disparo e persistência
const arquivo = path.join(os.tmpdir(), `eve-lembretes-teste-${process.pid}.json`);
fs.rmSync(arquivo, { force: true });

const disparados = [];
const l = new Lembretes({ arquivo, aoDisparar: (item) => disparados.push(item) });
l.carregar();

const criado = l.criar({ texto: "tomar água", quando: new Date(Date.now() + 250) });
assert.ok(criado.ok, "deveria criar");
assert.strictEqual(l.listar().length, 1);

const recusado = l.criar({ texto: "nada", quando: "qualquer hora" });
assert.ok(recusado.erro, "horário incompreensível vira erro, não lembrete sem hora");
assert.match(recusado.erro, /não entendi/i);
assert.strictEqual(l.listar().length, 1, "o recusado não entra na lista");

// Cancelar some da lista e não dispara depois.
const outro = l.criar({ texto: "some", quando: new Date(Date.now() + 200) });
assert.strictEqual(l.listar().length, 2);
assert.ok(l.cancelar(outro.id).ok);
assert.strictEqual(l.listar().length, 1);
assert.ok(l.cancelar("nao-existe").erro, "id inválido avisa em vez de silenciar");

setTimeout(() => {
  assert.strictEqual(disparados.length, 1, `deveria ter disparado 1, disparou ${disparados.length}`);
  assert.strictEqual(disparados[0].texto, "tomar água");
  assert.notStrictEqual(disparados[0].texto, "some", "o cancelado não pode disparar");
  assert.strictEqual(l.listar().length, 0, "depois de disparar sai dos pendentes");
  l.parar();

  // ---- 3. app fechado na hora do lembrete: dispara ao abrir, avisando o atraso
  const atrasadoArquivo = path.join(os.tmpdir(), `eve-atrasado-${process.pid}.json`);
  fs.writeFileSync(
    atrasadoArquivo,
    JSON.stringify([
      { id: "abc123", texto: "era pra ter avisado", quando: new Date(Date.now() - 60_000).toISOString(), feito: false },
      { id: "def456", texto: "ainda vai", quando: new Date(Date.now() + 3_600_000).toISOString(), feito: false },
    ])
  );

  const atrasados = [];
  const l2 = new Lembretes({ arquivo: atrasadoArquivo, aoDisparar: (i) => atrasados.push(i) });
  const pendentes = l2.carregar();

  assert.strictEqual(atrasados.length, 1, "só o vencido dispara ao abrir");
  assert.strictEqual(atrasados[0].texto, "era pra ter avisado");
  assert.strictEqual(atrasados[0].atrasado, true, "precisa vir marcado como atrasado");
  assert.strictEqual(pendentes.length, 1, "o futuro continua pendente");
  l2.parar();

  // O que foi gravado precisa reabrir igual.
  const l3 = new Lembretes({ arquivo: atrasadoArquivo, aoDisparar: () => {} });
  l3.carregar();
  assert.strictEqual(l3.listar().length, 1, "o disparado não volta a pendente ao reabrir");
  assert.strictEqual(l3.listar()[0].texto, "ainda vai");
  l3.parar();

  // -------- pedido repetido não vira lembrete repetido --------
  // Caso real de 30/10: ele pediu o mesmo compromisso duas vezes, porque o
  // primeiro pedido tinha caído no lembrete em vez de no calendário e ele não
  // encontrava. Ficaram dois lembretes do mesmo casamento — e três da UFPR,
  // que tocariam três vezes no mesmo minuto.
  const repetidoArquivo = path.join(os.tmpdir(), `eve-lembretes-rep-${Date.now()}.json`);
  const l4 = new Lembretes({ arquivo: repetidoArquivo, aoDisparar: () => {} });
  const quando = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16);

  const primeiro = l4.criar({ texto: "Casamento da Rebeca", quando });
  assert.strictEqual(primeiro.ok, true);
  assert.ok(!primeiro.jaExistia, "o primeiro é novo");

  const segundo = l4.criar({ texto: "Casamento da Rebeca", quando });
  assert.strictEqual(segundo.ok, true, "pedir de novo não é erro — ele não fez nada errado");
  assert.strictEqual(segundo.jaExistia, true, "mas ela precisa SABER que já existia");
  assert.strictEqual(segundo.id, primeiro.id, "e devolver o mesmo lembrete, não um novo");
  assert.strictEqual(l4.listar().length, 1, "um lembrete só na lista");

  // Espaço a mais no texto é o mesmo pedido.
  assert.strictEqual(l4.criar({ texto: "  Casamento da Rebeca  ", quando }).jaExistia, true);

  // Hora diferente é outro compromisso, e tem de passar.
  const outraHora = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 16);
  assert.ok(!l4.criar({ texto: "Casamento da Rebeca", quando: outraHora }).jaExistia);
  assert.strictEqual(l4.listar().length, 2);

  // E cancelado libera o lugar: ele pode querer o mesmo lembrete de volta.
  l4.cancelar(primeiro.id);
  const denovo = l4.criar({ texto: "Casamento da Rebeca", quando });
  assert.ok(!denovo.jaExistia, "depois de cancelar, o mesmo lembrete pode ser criado de novo");
  l4.parar();
  fs.rmSync(repetidoArquivo, { force: true });

  fs.rmSync(arquivo, { force: true });
  fs.rmSync(atrasadoArquivo, { force: true });

  console.log("✓ lembretes: horários, disparo único, cancelamento e persistência");
  console.log("  pedido repetido → devolve o que já existe, sem criar outro");
  console.log("  “em 10 minutos” →", formatar(dezMin));
  console.log("  “às 10h” numa quinta 14h →", formatar(passou), "(não devolve passado)");
  console.log("  vencido com o app fechado → disparou marcado como atrasado");
}, 700);
