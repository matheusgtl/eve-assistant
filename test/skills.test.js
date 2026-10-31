// skills.test.js — as habilidades que ele escreve, e que ela segue.
//
// A ideia é a das skills do Claude Code: um comando, um roteiro. O que faz
// isso funcionar ou não é economia de contexto e disciplina de leitura:
//
//   • só a LINHA de cada skill viaja no prompt (comando — quando). Se os
//     passos fossem junto, dez skills inviabilizariam o plano gratuito;
//   • a pasta é a verdade. Ele escreve no Obsidian e vale na pergunta
//     seguinte, sem sincronizar nada e sem reiniciar o app;
//   • as skills NÃO podem entrar no índice da memória, que tem orçamento
//     próprio — senão cada skill expulsa um fato dela do contexto.
// Rode com: node test/skills.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Skills } = require("../skills.js");
const { Memoria } = require("../memoria.js");
const { montarSystemPrompt } = require("../brains.js");
const { lerFrontmatter } = require("../memoria.js");
const ferramentas = require("../tools.js");

const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "eve-skills-"));
const pasta = path.join(cofre, "Skills");

(async () => {
  const sk = new Skills({ pasta });
  await sk.preparar();

  // ------------------------------------------ 1. começa com exemplos
  const inicio = await sk.indice();
  assert.ok(inicio.length >= 2, "a pasta vazia não ensina nada: tem de vir com exemplos");
  assert.ok(
    inicio.some((i) => i.comando === "salvar conversa"),
    "salvar conversa é a skill que ele pediu de exemplo"
  );
  assert.ok(
    fs.existsSync(path.join(pasta, "_como-criar-uma-skill.md")),
    "e com o formato explicado, para ele escrever a dele"
  );
  assert.ok(
    !inicio.some((i) => i.nome.includes("como-criar")),
    "mas o arquivo de instruções não é uma skill e não pode ocupar contexto"
  );

  // ------------------------------- 2. no prompt vai a linha, não o roteiro
  const idx = await sk.paraPrompt();
  const prompt = montarSystemPrompt({ skills: idx });
  assert.match(prompt, /SKILLS/, "a seção precisa existir");
  assert.match(prompt, /salvar conversa/, "com o comando");
  assert.ok(
    !prompt.includes("Chame `salvar_conversa`"),
    "e sem os passos: eles são lidos sob demanda, por usar_skill"
  );
  assert.match(prompt, /usar_skill/, "e o prompt tem de mandar ABRIR antes de improvisar");

  // ----------------------- 3. achar a skill mesmo quando o nome vem torto
  for (const pedido of [
    "salvar conversa",
    "salvar-conversa",
    "salvar-conversa.md",
    "salvar essa conversa aqui",
    "SALVAR CONVERSA",
  ]) {
    const r = await sk.usar(pedido);
    assert.strictEqual(r.comando, "salvar conversa", `"${pedido}" deveria achar a skill`);
    assert.ok(r.passos.includes("salvar_conversa"), "e devolver os passos de verdade");
    assert.match(r.instrucao, /Siga os passos/, "com a ordem de executar, não de narrar");
  }
  const nada = await sk.usar("voar até marte");
  assert.ok(nada.erro, "o que não existe não pode virar roteiro inventado");
  assert.ok(nada.disponiveis.includes("salvar conversa"), "e a recusa lista o que existe");

  // ------------------------------------- 4. criar, e reescrever com backup
  await sk.criar({
    nome: "arrumar downloads",
    comando: "arrumar os downloads",
    quando: "ele pedir para organizar a pasta de downloads",
    passos: "1. Liste ~/Downloads.\n2. Separe por tipo.",
  });
  assert.strictEqual((await sk.usar("arrumar os downloads")).comando, "arrumar os downloads");

  const rescrita = await sk.criar({
    nome: "arrumar downloads",
    comando: "arrumar os downloads",
    quando: "ele pedir para organizar a pasta de downloads",
    passos: "1. Versão nova.",
  });
  assert.strictEqual(rescrita.substituiu, true);
  assert.ok(
    fs.existsSync(path.join(pasta, "arrumar-downloads.md.bak")),
    "reescrever por cima de uma skill que ELE escreveu precisa guardar a anterior"
  );

  // ------------------------- 5. escrita à mão no Obsidian vale na hora
  fs.writeFileSync(
    path.join(pasta, "fim-de-expediente.md"),
    "---\ncomando: fim de expediente\nquando: ele disser que vai parar por hoje\n---\n\n# Fim de expediente\n\n1. Feche o Slack.\n"
  );
  const depois = await sk.indice();
  assert.ok(
    depois.some((i) => i.comando === "fim de expediente"),
    "uma skill escrita à mão tem de aparecer sem reiniciar nada"
  );
  assert.strictEqual((await sk.usar("fim de expediente")).passos.includes("Slack"), true);

  // ------------------- 6. skills não podem poluir o índice da memória
  const mem = new Memoria({ pasta: cofre });
  await mem.preparar();
  const indiceMemoria = await mem.indice();
  assert.ok(
    !indiceMemoria.some((i) => i.nome.startsWith("Skills/") || i.nome.includes("arrumar-downloads")),
    "skill não é memória: no índice da memória ela gastaria o orçamento que é dos fatos"
  );
  fs.mkdirSync(path.join(cofre, "Conversas"), { recursive: true });
  fs.writeFileSync(path.join(cofre, "Conversas", "2026-10-27-teste.md"), "# conversa salva\n");
  mem.cache = null;
  assert.ok(
    !(await mem.indice()).some((i) => i.nome.includes("Conversas/")),
    "conversa salva também não: uma semana delas expulsaria os fatos do contexto"
  );

  // ------------------------- 6b. salvar conversa: o arquivo precisa ser válido
  // A conversa salva é um .md dentro do cofre, e o frontmatter tem de ser
  // LINHAS CONTÍGUAS entre os dois "---". Uma linha em branco no meio e o
  // Obsidian deixa de reconhecer o bloco — o arquivo abre, parece certo, e o
  // `quando: nunca` para de valer.
  ferramentas.configurar({
    conversa: {
      historico: () => [
        { quem: "voce", texto: "oi", hora: "2026-10-27T14:03:00Z" },
        { quem: "eve", texto: "Olá.", hora: "2026-10-27T14:03:04Z" },
      ],
      pasta: () => path.join(cofre, "Conversas"),
    },
  });
  const salva = JSON.parse(await ferramentas.runTool("salvar_conversa", { titulo: "Contrato" }));
  assert.strictEqual(salva.ok, true);
  assert.strictEqual(salva.mensagens, 2);
  const texto = fs.readFileSync(salva.caminho, "utf8");
  assert.strictEqual(
    lerFrontmatter(texto).dados.quando,
    "nunca — isto é uma conversa salva, não um processo",
    "frontmatter quebrado: o Obsidian não vai ler o bloco"
  );
  assert.match(texto, /\*\*Matheus\*\*.*oi/, "quem falou o quê tem de estar lá");

  const outra = JSON.parse(await ferramentas.runTool("salvar_conversa", { titulo: "Contrato" }));
  assert.notStrictEqual(
    outra.caminho,
    salva.caminho,
    "duas conversas sobre o mesmo assunto no mesmo dia são duas conversas"
  );

  // ------------------------------------------------ 7. orçamento do prompt
  for (let i = 0; i < 60; i++) {
    fs.writeFileSync(
      path.join(pasta, `skill-${i}.md`),
      `---\ncomando: comando número ${i}\nquando: situação razoavelmente descrita de número ${i}\n---\n\n# Skill ${i}\n\npassos\n`
    );
  }
  sk.cache = null;
  const cheio = await sk.paraPrompt();
  assert.ok(cheio.total > 60, "sessenta e poucas skills na pasta");
  assert.ok(cheio.cortados > 0, "e parte precisa ficar de fora do prompt");
  assert.ok(
    cheio.linhas.join("\n").length < 1500,
    "o índice no prompt tem teto: ele viaja em TODA pergunta"
  );

  fs.rmSync(cofre, { recursive: true, force: true });
  console.log("✓ skills: um comando, um roteiro — e o roteiro só é lido quando serve");
  console.log("   no prompt     → só a linha (comando — quando), nunca os passos");
  console.log("   nome torto    → 5 jeitos de pedir, 5 acertos");
  console.log("   escrita à mão → vale na pergunta seguinte, sem reiniciar");
  console.log("   memória       → não enxerga Skills/ nem Conversas/");
  console.log("   conversa salva → frontmatter válido, e nunca sobrescreve a anterior");
})();
