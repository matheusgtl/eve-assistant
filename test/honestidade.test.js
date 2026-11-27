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

// 8. Log de 27/11/2026, 17:29–17:40: três "Correção: nem tudo deu certo" que
// eram mentira — a falha já tinha sido resolvida no mesmo turno.
const { resultadoDeFerramenta } = require("../registro.js");
const ERRO_PARECIDA = JSON.stringify({
  erro: 'já existe "CEREBRO" sobre este assunto. Reescreva ELA com anotar_memoria (nome "CEREBRO", pasta "CEREBRO"), juntando o que é novo ao texto abaixo — não crie outra nota. Se for mesmo outro assunto, chame de novo com o mesmo nome e eu crio.',
});
const ERRO_COFRE = JSON.stringify({
  error: "Não escreva no cofre da memória com write_file: isso pula o backup, o frontmatter e o índice. Para gravar ou atualizar uma nota, use anotar_memoria — e se ele recusou por apagar demais, chame-o DE NOVO com o texto que ele devolveu mais o seu acréscimo.",
  use: "anotar_memoria",
});
const OK = JSON.stringify({ ok: true });

// 8a. A memória recusou o nome novo e mandou reescrever "CEREBRO"; ela reescreveu.
{
  const h = new Honestidade();
  h.chamou("anotar_memoria", { nome: "cerebro-da-sexta-feira" });
  h.resultado("anotar_memoria", resultadoDeFerramenta(ERRO_PARECIDA));
  h.chamou("anotar_memoria", { nome: "CEREBRO" });
  h.resultado("anotar_memoria", resultadoDeFerramenta(OK));
  assert.strictEqual(h.aviso("Reescrevi o CEREBRO com as ligações novas."), null, "fez o que a recusa pediu");
}

// 8b. write_file no cofre foi barrado e mandou usar anotar_memoria na mesma nota.
{
  const h = new Honestidade();
  h.chamou("write_file", { filepath: "/Users/x/Obsidian/Sexta-Feira/processos/cerebro.md" });
  h.resultado("write_file", resultadoDeFerramenta(ERRO_COFRE));
  h.chamou("anotar_memoria", { nome: "CEREBRO" });
  h.resultado("anotar_memoria", resultadoDeFerramenta(OK));
  assert.strictEqual(h.aviso("Atualizei a nota do cérebro."), null);
}

// 8c. Comando que só procura (find, ls) e falhou é consulta, não ação.
{
  const h = new Honestidade();
  h.chamou("run_command", { command: "find ~/.memoria -type f" });
  h.resultado("run_command", { ok: false, texto: "erro: Command failed: find ~/.memoria -type f find: No such file or directory" });
  h.chamou("run_command", { command: "ls -la ~/x | head -5" });
  h.resultado("run_command", { ok: false, texto: "erro: No such file" });
  assert.strictEqual(h.aviso("Renomeei os títulos das conversas."), null);
}

// 8d. Mas a trava continua apertada: o desvio só vale para o alvo que a
// recusa indicou, e comando que mexe em algo continua sendo ação.
{
  const h = new Honestidade();
  h.chamou("write_file", { filepath: "/Users/x/Obsidian/Sexta-Feira/processos/cerebro.md" });
  h.resultado("write_file", resultadoDeFerramenta(ERRO_COFRE));
  h.chamou("anotar_memoria", { nome: "outra-nota" });
  h.resultado("anotar_memoria", resultadoDeFerramenta(OK));
  assert.ok(h.aviso("Atualizei a nota do cérebro."), "gravou outra nota: a falha continua");

  const h2 = new Honestidade();
  h2.chamou("anotar_memoria", { nome: "cerebro-da-sexta-feira" });
  h2.resultado("anotar_memoria", resultadoDeFerramenta(ERRO_PARECIDA));
  assert.ok(h2.aviso("Anotei."), "recusada e nunca refeita: a falha continua");

  for (const command of ["find ~ -name '*.tmp' -delete", "find . -exec rm {} \\;", "ls > lista.txt", "ls && rm a", "cat a | tee b", "rm -rf x", "mv a b"]) {
    const h3 = new Honestidade();
    h3.chamou("run_command", { command });
    h3.resultado("run_command", { ok: false, texto: "erro: x" });
    assert.ok(h3.aviso("Feito."), `comando que age continua sendo ação: ${command}`);
  }

  // e um trash_file que deu certo não salva outro que falhou
  const h4 = new Honestidade();
  h4.chamou("trash_file", { filepath: "~/a.dmg" });
  h4.resultado("trash_file", { ok: false, texto: "erro: timeout" });
  h4.chamou("trash_file", { filepath: "~/b.dmg" });
  h4.resultado("trash_file", { ok: true, texto: "ok" });
  assert.ok(h4.aviso("Removi os dois."));
}

console.log("✓ honestidade: falha de ferramenta não vira \"feito\"; falha resolvida não vira \"não consegui\"");
