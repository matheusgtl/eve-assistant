// conversas.test.js — o diário de conversas no cofre.
//
// Pedido dele em 02/11: "seria legal ele ter um histórico de conversas salvas
// iguais as que você tem". Já existia `salvar_conversa`, mas só salvava quando
// ele PEDIA — e conversa que depende de alguém lembrar de salvar é conversa
// perdida.
// Rode com: node test/conversas.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Conversas, emTurnos, emConversas, tituloDe, juntar, PAUSA_NOVA_CONVERSA } =
  require("../conversas.js");

const hora = (min) => new Date(Date.UTC(2026, 10, 2, 12, min, 0)).toISOString();

// ------------------------------------------- 1. fragmentos voltam a ser resposta
// A conversa salva de 01/11 ficou assim, oito blocos para UMA resposta:
//
//   **E.V.E** (22:35): Aqui estão os eventos marcados para novembro:
//   **E.V.E** (22:35): - **1º de novembro** – UFPR
//   **E.V.E** (22:35): - **6 de novembro** – Resultado 1ª fase UEL
{
  const turnos = emTurnos([
    { quem: "voce", texto: "quais os eventos de novembro?", hora: hora(0) },
    { quem: "eve", texto: "Aqui estão os eventos de novembro:\n\n", hora: hora(1) },
    { quem: "eve", texto: "- 1º de novembro — UFPR\n", hora: hora(1) },
    { quem: "eve", texto: "- 6 de novembro — resultado da UEL", hora: hora(1) },
    { quem: "eve", texto: "\n- 8 de novembro — ENEM", hora: hora(1) },
    { quem: "voce", texto: "tira o do dia 8", hora: hora(2) },
  ]);

  assert.strictEqual(turnos.length, 3, `3 turnos (pergunta, resposta, pergunta), não ${turnos.length}`);
  assert.strictEqual(turnos[0].quem, "voce");
  assert.strictEqual(turnos[1].quem, "eve");
  // A resposta inteira num turno, com a estrutura preservada.
  const resposta = turnos[1].texto;
  assert.strictEqual((resposta.match(/^- /gm) || []).length, 3, "os três itens têm de ficar em linhas");
  assert.match(resposta, /novembro:\n\n- 1º/, "a quebra de parágrafo sobrevive");

  // Pergunta dele NUNCA se junta com a seguinte: duas perguntas são duas.
  const duas = emTurnos([
    { quem: "voce", texto: "primeira", hora: hora(0) },
    { quem: "voce", texto: "segunda", hora: hora(1) },
  ]);
  assert.strictEqual(duas.length, 2, "duas perguntas dele não viram uma");
}

// ------------------------------------------- 2. a pausa separa conversas
{
  const turnos = [
    { quem: "voce", texto: "bom dia", hora: hora(0) },
    { quem: "eve", texto: "Bom dia!", hora: hora(1) },
    // 40 minutos depois: outro assunto, outra conversa.
    { quem: "voce", texto: "e о jantar?", hora: hora(41) },
    { quem: "eve", texto: "Vou ver.", hora: hora(42) },
  ];
  const grupos = emConversas(turnos);
  assert.strictEqual(grupos.length, 2, "pausa longa começa conversa nova");
  assert.strictEqual(grupos[0].length, 2);
  assert.strictEqual(grupos[1].length, 2);

  // Pausa curta é a mesma conversa com uma ida ao café.
  const perto = emConversas([
    { quem: "voce", texto: "a", hora: hora(0) },
    { quem: "eve", texto: "b", hora: hora(PAUSA_NOVA_CONVERSA / 60000 - 5) },
  ]);
  assert.strictEqual(perto.length, 1, "pausa curta não parte a conversa");
}

// ------------------------------------------- 3. o título vem do que ELE disse
{
  assert.strictEqual(
    tituloDe([
      { quem: "eve", texto: "Oi!" },
      { quem: "voce", texto: "quais os avisos desse mês?" },
    ]),
    "quais os avisos desse mês?",
    "o título é a pergunta dele, não a saudação dela"
  );
  // Longo demais corta em palavra inteira, não no meio.
  const longo = tituloDe([
    { quem: "voce", texto: "preciso que você confira se existe algum lembrete duplicado na minha lista de novembro" },
  ]);
  assert.ok(longo.length <= 60);
  assert.doesNotMatch(longo, /\s$/, "não termina em espaço");
  assert.ok(!longo.endsWith("dupl"), "não corta palavra ao meio");
}

// ------------------------------------------- 4. o arquivo e o índice
{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "eve-conv-"));
  const c = new Conversas({ pasta, nomeDela: "E.V.E", onDebug: () => {} });

  const itens = [
    { quem: "voce", texto: "quais os avisos desse mês?", hora: hora(0) },
    { quem: "eve", texto: "Você tem sete avisos:\n\n", hora: hora(1) },
    { quem: "eve", texto: "- 6 de novembro — resultado da UEL", hora: hora(1) },
  ];
  const arquivo = c.salvar(itens);

  return arquivo.then(async (nome) => {
    assert.match(nome, /^2026-11-02-\d{4}-quais-os-avisos-desse-mes\.md$/, `nome torto: ${nome}`);
    const texto = fs.readFileSync(path.join(pasta, nome), "utf8");

    // Frontmatter: "quando: nunca" é o que mantém conversa salva FORA do índice
    // que viaja no contexto dela. Conversa salva é para ele reler.
    assert.match(texto, /^---\nquando: nunca/, "conversa não pode entrar no contexto dela");
    assert.match(texto, /tags: \[conversa\]/);
    assert.match(texto, /turnos: 2/, "dois turnos: a pergunta e a resposta inteira");
    assert.match(texto, /^# Quais os avisos desse mês\?$/m, "um H1 com o título");
    assert.match(texto, /^### Matheus · \d{2}:\d{2}$/m, "cabeçalho por turno");
    assert.match(texto, /^### E\.V\.E · \d{2}:\d{2}$/m);
    // A resposta dela inteira, com a lista de pé.
    assert.match(texto, /sete avisos:\n\n- 6 de novembro/, "a estrutura da resposta sobrevive");
    // E o nome dela, não "eve".
    assert.doesNotMatch(texto, /^### eve/m);

    // Salvar de novo sem mudança não reescreve (nem toca o arquivo à toa).
    const antes = fs.statSync(path.join(pasta, nome)).mtimeMs;
    await new Promise((r) => setTimeout(r, 12));
    await c.salvar(itens);
    assert.strictEqual(fs.statSync(path.join(pasta, nome)).mtimeMs, antes, "não reescreve igual");

    // Mais um turno: o MESMO arquivo cresce, não nasce outro.
    await c.salvar([...itens, { quem: "voce", texto: "obrigado", hora: hora(2) }]);
    const md = fs.readdirSync(pasta).filter((f) => f.endsWith(".md") && f !== "CONVERSAS.md");
    assert.strictEqual(md.length, 1, `a conversa em andamento é um arquivo só (achei ${md.length})`);
    assert.match(fs.readFileSync(path.join(pasta, nome), "utf8"), /obrigado/);

    // Conversa de outro dia é outro arquivo, e o índice lista as duas.
    const outroDia = new Date(Date.UTC(2026, 10, 5, 14, 30)).toISOString();
    await c.salvar([...itens, { quem: "voce", texto: "e hoje?", hora: outroDia }]);
    const todos = fs.readdirSync(pasta).filter((f) => f.endsWith(".md") && f !== "CONVERSAS.md");
    assert.strictEqual(todos.length, 2, "conversa nova, arquivo novo");

    const indice = fs.readFileSync(path.join(pasta, "CONVERSAS.md"), "utf8");
    assert.match(indice, /# Conversas/);
    assert.match(indice, /quando: nunca/, "o índice também fica fora do contexto dela");
    for (const f of todos) {
      assert.ok(indice.includes(`[[Conversas/${f.replace(/\.md$/, "")}]]`), `${f} não está no índice`);
    }
    assert.match(indice, /## Novembro de 2026/, "agrupado por mês");

    fs.rmSync(pasta, { recursive: true, force: true });

    console.log("✓ diário de conversas: fragmentos viram resposta, pausa separa, índice navegável");
    console.log("   8 fragmentos de 01/11 → 1 turno com a lista de pé");
    console.log("   arquivo:", nome);
    console.log("   pausa que começa conversa nova:", PAUSA_NOVA_CONVERSA / 60000, "min");
  });
}
