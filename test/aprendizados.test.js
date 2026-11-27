// aprendizados.test.js — ela aprende com os erros (pedido dele em 25/11/2026).
// Rode com: node test/aprendizados.test.js
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Aprendizados, assinatura, pareceCorrecao, resumoDaLicao, gerarCerebro } = require("../aprendizados.js");

(async () => {
  // 1. O mesmo erro com números e caminhos diferentes é UM erro só.
  assert.strictEqual(
    assinatura("ler_pdf", "não abri /Users/x/a.pdf em 3.2s"),
    assinatura("ler_pdf", "não abri ~/Documents/b.pdf em 11s")
  );
  assert.notStrictEqual(assinatura("ler_pdf", "sem permissão"), assinatura("criar_evento", "sem permissão"));

  // 2. Correção dele é percebida; pergunta comum não.
  for (const t of ["não é isso, era amanhã", "tá errado", "eu te disse que era 10h", "de novo não!", "o certo é 15/11"]) {
    assert.ok(pareceCorrecao(t), `deveria parecer correção: ${t}`);
  }
  // 25/11/2026, 23:32 no log: "tente mover ele para dentro de arquivos" foi
  // tomado como correção — o "para de" casava dentro de "para dentro".
  assert.ok(pareceCorrecao("para de inventar hora"), "para de + verbo é correção");
  for (const t of [
    "que horas são?",
    "me lembra de ligar pro dentista",
    "não esquece do remédio",
    "pode remover o nox, sobre o logic pro x tente mover ele para dentro de arquivos por favor",
    "manda para depois",
  ]) {
    assert.ok(!pareceCorrecao(t), `não é correção: ${t}`);
  }

  // 3. Falha registrada soma, vira nota no cofre e só vira alerta quando repete.
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "aprend-"));
  const a = new Aprendizados({ pasta });
  await a.registrarFalha({ ferramenta: "criar_evento", erro: "acesso negado ao Calendário (1)", pedido: "marca dentista" });
  let p = await a.paraPrompt();
  assert.strictEqual(p.alertas.length, 0, "uma falha só ainda não é padrão");
  await a.registrarFalha({ ferramenta: "criar_evento", erro: "acesso negado ao Calendário (2)" });
  p = await a.paraPrompt();
  assert.strictEqual(p.alertas.length, 1);
  assert.match(p.alertas[0], /criar_evento falhou 2×/);
  const diario = fs.readFileSync(path.join(pasta, "aprendizados", "erros-de-ferramenta.md"), "utf8");
  assert.match(diario, /quando: nunca/, "o diário não entra no índice da memória");
  assert.match(diario, /criar_evento · 2×/);

  // 4. Duas falhas ao mesmo tempo não se apagam (fila).
  await Promise.all([
    a.registrarFalha({ ferramenta: "web_search", erro: "timeout" }),
    a.registrarFalha({ ferramenta: "read_webpage", erro: "404" }),
  ]);
  assert.strictEqual(a.lerEstado().length, 3);

  // 5. Lição escrita por ela volta no prompt, em uma linha com o jeito certo.
  fs.writeFileSync(
    path.join(pasta, "aprendizados", "evento-sem-hora.md"),
    "---\nquando: ele pedir evento sem dizer a hora\n---\n\n# Evento sem hora\n\nO que errei: pus 09:00.\n\nJeito certo: dia inteiro, sem inventar hora.\n"
  );
  p = await a.paraPrompt();
  assert.strictEqual(p.linhas.length, 1, "o diário de erros não conta como lição");
  assert.match(p.linhas[0], /Evento sem hora \(quando: ele pedir evento sem dizer a hora\): dia inteiro, sem inventar hora\./);

  // 6. Lição sem "jeito certo" escrito usa o primeiro parágrafo.
  assert.match(resumoDaLicao("# Título\n\nSempre confirmar o valor.\n", "x.md"), /Título: Sempre confirmar o valor\./);

  // 6b. 25/11/2026: a lição "nunca dizer que fiz" cita a frase dela ("Tudo
  // certo. Removi…"), e o resumo pegava esse "certo" em vez do "Jeito certo".
  const mentira = resumoDaLicao(
    "# Não mentir\n\nEu respondi \"Tudo certo. Removi tudo\". Era mentira: três continuavam lá.\n\n## Jeito certo: conferir cada ferramenta antes de dizer feito.\n",
    "x.md"
  );
  assert.match(mentira, /Não mentir: conferir cada ferramenta antes de dizer feito\./);

  // 6c. Falha cuja causa foi corrigida no código sai dos alertas, mas fica no
  // diário (marcada), porque é história e não se apaga.
  await a.registrarFalha({ ferramenta: "trash_file", erro: "osascript Finder timeout" });
  await a.registrarFalha({ ferramenta: "trash_file", erro: "osascript Finder timeout" });
  assert.ok((await a.paraPrompt()).alertas.some((l) => /trash_file/.test(l)));
  assert.strictEqual(await a.marcarResolvido("trash_file", "Lixo pela função do sistema"), 1);
  assert.ok(!(await a.paraPrompt()).alertas.some((l) => /trash_file/.test(l)), "resolvida não alerta");
  assert.match(fs.readFileSync(path.join(pasta, "aprendizados", "erros-de-ferramenta.md"), "utf8"), /resolvido: Lixo pela função do sistema/);
  await a.registrarFalha({ ferramenta: "trash_file", erro: "osascript Finder timeout" });
  assert.ok((await a.paraPrompt()).alertas.some((l) => /trash_file falhou 1× desde/.test(l)) === false, "uma falha nova sozinha ainda não é padrão");
  assert.strictEqual(a.lerEstado().find((e) => e.ferramenta === "trash_file").resolvido, undefined, "falhar de novo reabre");

  // 7. Mapa e nota central ligam a rede no Obsidian.
  await a.gerarMapa();
  assert.match(fs.readFileSync(path.join(pasta, "aprendizados", "APRENDIZADOS.md"), "utf8"), /\[\[aprendizados\/evento-sem-hora\]\]/);
  await gerarCerebro(pasta);
  const cerebro = fs.readFileSync(path.join(pasta, "CEREBRO.md"), "utf8");
  for (const l of ["[[MEMORIA]]", "[[APRENDIZADOS]]", "[[CONVERSAS]]", "[[GLOSSARIO]]"]) assert.ok(cerebro.includes(l), l);

  // 8. Sem pasta, nada quebra.
  assert.strictEqual(await new Aprendizados({}).registrarFalha({ ferramenta: "x", erro: "y" }), null);

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log("✓ aprendizados: tudo certo");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
