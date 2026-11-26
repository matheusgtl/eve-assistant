// Formato do eve.log (registro.js) e o relato de cada ferramenta. Sem rede, sem app.
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { carimbo, linha, rotacionar, resultadoDeFerramenta, Turno } = require("../registro.js");
const { runTool, configurar } = require("../tools.js");

(async () => {
  // Data em toda linha: um mês de "[20:45:43]" não dizia de que dia era.
  const d = new Date(2026, 10, 5, 9, 3, 7);
  assert.strictEqual(carimbo(d), "2026-11-05 09:03:07");
  assert.strictEqual(linha(["ferramenta:", "calcular"], d), "[2026-11-05 09:03:07] ferramenta: calcular");

  // O resultado em uma linha.
  assert.deepStrictEqual(resultadoDeFerramenta('{"ok":true}'), { ok: true, texto: "ok" });
  assert.deepStrictEqual(resultadoDeFerramenta('{"needs_confirmation":true}'), { ok: true, texto: "pediu o sim" });
  const falhou = resultadoDeFerramenta(JSON.stringify({ error: "Esse caminho não existe. " + "x".repeat(300) }));
  assert.strictEqual(falhou.ok, false);
  assert.match(falhou.texto, /^erro: Esse caminho não existe\./);
  assert.ok(falhou.texto.length < 160, "erro longo é cortado");
  assert.strictEqual(resultadoDeFerramenta("texto que não é JSON").ok, true);

  // Uma pergunta, do começo ao fim, com relógio falso.
  let agora = 1_000;
  const t = new Turno(7, "  Apaga o arquivo\n teste  ", "voz", () => agora);
  assert.strictEqual(t.abertura, '── #7 falou: "Apaga o arquivo teste"');
  assert.match(new Turno(1, "oi", "texto").abertura, /escreveu: "oi"/, "o que ele escreve também entra");
  agora = 2_200;
  t.falou("Não encontrei o arquivo.");
  agora = 2_900;
  t.falou(" Quer que eu procure?");
  t.ferramenta(true);
  t.ferramenta(false);
  agora = 4_200;
  assert.strictEqual(
    t.fim("ok", "nvidia"),
    "── #7 fim · 3,2 s · 1ª fala em 1,2 s · 2 ferramentas (1 falhou) · nvidia · resposta de 45 caracteres"
  );
  assert.match(new Turno(2, "x", "texto", () => 0).fim("cancelado"), /fim · 0,0 s · cancelado$/);
  assert.ok(!/1ª fala/.test(new Turno(3, "x", "texto").fim("erro: 503")), "sem fala, sem tempo de 1ª fala");

  // Pergunta enorme (texto colado) não vira uma linha de 10 mil caracteres.
  assert.ok(new Turno(4, "a".repeat(10_000), "texto").abertura.length < 340);

  // Rotação: passou do teto, o atual vira .1 e o anterior sai.
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "eve-log-"));
  try {
    const arq = path.join(pasta, "eve.log");
    assert.strictEqual(rotacionar(arq, 10), false, "sem arquivo, nada a fazer");
    fs.writeFileSync(arq + ".1", "o mais velho");
    fs.writeFileSync(arq, "123456789");
    assert.strictEqual(rotacionar(arq, 10), false, "abaixo do teto fica");
    fs.appendFileSync(arq, "0");
    assert.strictEqual(rotacionar(arq, 10), true);
    assert.ok(!fs.existsSync(arq));
    assert.strictEqual(fs.readFileSync(arq + ".1", "utf8"), "1234567890");
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }

  // runTool relata cada ferramenta: nome, tempo e resultado — inclusive a que falha.
  const relatos = [];
  configurar({ onResultado: (r) => relatos.push(r) });
  try {
    await runTool("calcular", { conta: "2 + 2" });
    await runTool("read_file", { filepath: path.join(os.tmpdir(), "eve-nao-existe-" + process.pid) });
    await runTool("ferramenta_que_nao_existe", {});
  } finally {
    configurar({ onResultado: undefined });
  }
  assert.deepStrictEqual(relatos.map((r) => r.nome), ["calcular", "read_file", "ferramenta_que_nao_existe"]);
  assert.ok(relatos.every((r) => Number.isInteger(r.ms) && r.ms >= 0), "tempo em ms");
  assert.deepStrictEqual(
    relatos.map((r) => resultadoDeFerramenta(r.resultado).ok),
    [true, false, false],
    "a que deu certo e as que falharam"
  );

  // Relato que quebra não derruba a ferramenta.
  configurar({ onResultado: () => { throw new Error("log quebrou"); } });
  try {
    assert.ok(!JSON.parse(await runTool("calcular", { conta: "1 + 1" })).error);
  } finally {
    configurar({ onResultado: undefined });
  }

  console.log("✓ registro: data em toda linha, pergunta aberta e fechada, ferramenta com resultado e tempo");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
