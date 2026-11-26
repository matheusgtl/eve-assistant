// honestidade.test.js — a trava que não deixa ela dizer "feito" quando a
// ferramenta falhou (pedido dele em 25/11/2026).
//
// Caso real de 25/11/2026, 23:34: três trash_file voltaram com erro e ela
// respondeu "Tudo certo. Removi o Nox, os arquivos MIDNIGHT RACERS e o
// instalador XAMPP". O prompt já proibia isso; o modelo fez assim mesmo.
// Rode com: node test/honestidade.test.js
const assert = require("node:assert");
const { Honestidade, reconheceFalha } = require("../honestidade.js");

const ERRO_FINDER = "erro: Command failed: /usr/bin/osascript -e tell application \"Finder\" to delete POSIX file";

// 1. O caso do log: três falhas, uma deu certo, e a resposta diz que tudo deu certo.
{
  const h = new Honestidade();
  for (const f of ["Nox_installer.dmg", "MIDNIGHT RACERS - 01.MP4", "MIDNIGHT RACERS - 2.MP4"]) {
    h.chamou("trash_file", { filepath: `~/Downloads/${f}`, confirmed: true });
    h.resultado("trash_file", { ok: false, texto: ERRO_FINDER });
  }
  h.chamou("trash_file", { filepath: "~/Downloads/xampp.dmg" });
  h.resultado("trash_file", { ok: true, texto: "ok" });

  const falhas = h.pendentes();
  assert.strictEqual(falhas.length, 3);
  const aviso = h.aviso("Tudo certo. Removi o Nox, os arquivos MIDNIGHT RACERS e o instalador XAMPP.");
  assert.ok(aviso, "a resposta mentiu: o código tem de corrigir");
  assert.match(aviso, /Nox_installer\.dmg/);
  assert.match(aviso, /MIDNIGHT RACERS - 01\.MP4/);
  assert.match(aviso, /mandar para o Lixo/);
  assert.doesNotMatch(aviso, /xampp/, "o que deu certo não entra no aviso");
}

// 2. Ela mesma contou a falha: nada a acrescentar.
{
  const h = new Honestidade();
  h.chamou("trash_file", { filepath: "~/a.dmg" });
  h.resultado("trash_file", { ok: false, texto: "erro: timeout" });
  assert.strictEqual(h.aviso("Não consegui mandar o a.dmg para o Lixo: o Finder não respondeu."), null);
  assert.ok(reconheceFalha("Deu erro ao apagar"));
  assert.ok(reconheceFalha("Esse não foi: falhou por permissão"));
  assert.ok(!reconheceFalha("Pronto, removi tudo."));
}

// 3. Falhou e depois deu certo com o MESMO alvo (tentou de novo): recuperada.
{
  const h = new Honestidade();
  h.chamou("trash_file", { filepath: "~/a.dmg" });
  h.resultado("trash_file", { ok: false, texto: "erro: timeout" });
  h.chamou("trash_file", { filepath: "~/a.dmg" });
  h.resultado("trash_file", { ok: true, texto: "ok" });
  assert.strictEqual(h.pendentes().length, 0);
  assert.strictEqual(h.aviso("Removi o a.dmg."), null);
}

// 4. Consulta que falhou (busca, leitura) não é "fazer": não vira aviso.
{
  const h = new Honestidade();
  h.chamou("web_search", { query: "dólar hoje" });
  h.resultado("web_search", { ok: false, texto: "erro: sem rede" });
  h.chamou("read_file", { filepath: "~/x.txt" });
  h.resultado("read_file", { ok: false, texto: "erro: não existe" });
  assert.strictEqual(h.aviso("O dólar está a 5,10."), null);
}

// 5. Turno sem ferramenta, ou tudo certo: nada.
{
  const h = new Honestidade();
  assert.strictEqual(h.aviso("Oi!"), null);
  h.chamou("criar_evento", { titulo: "Dentista" });
  h.resultado("criar_evento", { ok: true, texto: "ok" });
  assert.strictEqual(h.aviso("Marquei o dentista."), null);
}

// 6. Evento e comando têm nome legível no aviso, e o motivo vem curto.
{
  const h = new Honestidade();
  h.chamou("criar_evento", { titulo: "Dentista" });
  h.resultado("criar_evento", { ok: false, texto: "erro: o acesso ao Calendário está negado. Abra Ajustes do Sistema e ligue a Sexta-Feira, e depois tente de novo porque sem isso nada funciona" });
  h.chamou("run_command", { command: "mv a b" });
  h.resultado("run_command", { ok: false, texto: "erro: No such file" });
  const aviso = h.aviso("Feito! Marquei o dentista e movi o arquivo.");
  assert.match(aviso, /criar o evento “Dentista”/);
  assert.match(aviso, /rodar o comando “mv a b”/);
  assert.ok(aviso.length < 420, `aviso curto (${aviso.length})`);
  assert.doesNotMatch(aviso, /^erro:/m);
}

// 7. Tudo falhou: o aviso não pode dizer "o resto foi feito".
{
  const h = new Honestidade();
  h.chamou("trash_file", { filepath: "~/a.dmg" });
  h.resultado("trash_file", { ok: false, texto: "erro: x" });
  h.chamou("web_search", { query: "y" });
  h.resultado("web_search", { ok: true, texto: "ok" });
  const aviso = h.aviso("Removi o a.dmg.");
  assert.doesNotMatch(aviso, /resto foi feito/, "nenhuma ação deu certo");
  assert.match(aviso, /Nada foi feito/);
}

console.log("✓ honestidade: falha de ferramenta não vira \"feito\"");
