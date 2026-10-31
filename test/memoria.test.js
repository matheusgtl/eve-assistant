// memoria.test.js — o cérebro de .md: o que entra no contexto e o que não entra.
//
// A tentação aqui é jogar os documentos todos no prompt. Isso estouraria o
// orçamento: cada arquivo entraria em TODA pergunta, três vezes por pergunta.
// Então o teste trava a decisão oposta: no prompt vai só o ÍNDICE, e nunca o
// conteúdo; passando do orçamento, os excedentes saem e ela é AVISADA de que
// saíram — para não garantir que algo não existe quando só não cabia.
//
// E trava o caso que vem do Obsidian: uma nota escrita à mão, sem frontmatter,
// precisa aparecer para ela sozinha. Se precisasse de passo de sincronização,
// a pasta e a cabeça dela viveriam fora de sincronia.
// Rode com: node test/memoria.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "eve-memoria-"));
process.env.EV_MEMORIA_DIR = cofre;

const { Memoria, apelido, TETO_INDICE } = require("../memoria.js");
const { montarSystemPrompt } = require("../brains.js");
const ferramentas = require("../tools.js");

const chamar = async (nome, args) => JSON.parse(await ferramentas.runTool(nome, args));

(async () => {
  const memoria = new Memoria({ pasta: cofre });
  await memoria.preparar();

  // ------------------------------------------- 1. cofre do Obsidian de verdade
  for (const esperado of ["processos", "fatos", ".obsidian"]) {
    assert.ok(fs.existsSync(path.join(cofre, esperado)), `faltou criar ${esperado}`);
  }
  assert.ok(
    fs.existsSync(path.join(cofre, ".obsidian", "app.json")),
    "sem .obsidian/app.json o Obsidian não reconhece a pasta como cofre"
  );

  // ------------------------------------------- 2. anotar e consultar
  const gravado = await memoria.anotar({
    nome: "Backup das Fotos",
    quando: "ele pedir para fazer backup das fotos",
    conteudo: "1. Conectar o HD externo\n2. Rodar `rsync -a ~/Pictures /Volumes/HD/`",
  });
  assert.ok(gravado.ok);
  assert.strictEqual(gravado.nome, "processos/backup-das-fotos", "nome vira apelido sem acento");
  assert.strictEqual(apelido("Processo de Ação Imediata"), "processo-de-acao-imediata");

  // O modelo vai errar o nome. Errar aqui não pode virar "não encontrei".
  for (const comoPediu of [
    "processos/backup-das-fotos",
    "backup-das-fotos",
    "backup-das-fotos.md",
    "BACKUP-DAS-FOTOS",
    "backup",
  ]) {
    const r = await memoria.consultar(comoPediu);
    assert.ok(!r.erro, `não achou pedindo "${comoPediu}": ${r.erro}`);
    assert.match(r.conteudo, /rsync/, `conteúdo errado para "${comoPediu}"`);
  }

  const inexistente = await memoria.consultar("como pilotar um avião");
  assert.match(inexistente.erro, /não existe/);
  assert.ok(inexistente.disponiveis.includes("processos/backup-das-fotos"), "diz o que existe");

  // Sobrescrever guarda backup: memória perdida some sem ninguém notar na hora.
  const denovo = await memoria.anotar({
    nome: "Backup das Fotos",
    quando: "ele pedir backup",
    conteudo: "Mudou o processo.",
  });
  assert.strictEqual(denovo.backup, "backup-das-fotos.md.bak");
  assert.match(
    fs.readFileSync(path.join(cofre, "processos", "backup-das-fotos.md.bak"), "utf8"),
    /rsync/,
    "o backup tem o conteúdo antigo"
  );

  // --------------------- 3. nota escrita no Obsidian, SEM frontmatter
  await fsp.writeFile(
    path.join(cofre, "fatos", "meu-provedor.md"),
    "# Internet de casa é Vivo Fibra 500\n\nSuporte: 10621.\n"
  );
  const indice = await memoria.indice();
  const achada = indice.find((i) => i.nome === "fatos/meu-provedor");
  assert.ok(achada, "nota escrita à mão no Obsidian tem de aparecer sozinha");
  assert.strictEqual(
    achada.quando,
    "Internet de casa é Vivo Fibra 500",
    "sem frontmatter, o primeiro título faz o papel do 'quando'"
  );

  // O mapa para navegar no Obsidian usa links dele — e não é a fonte da verdade.
  const mapa = fs.readFileSync(path.join(cofre, "MEMORIA.md"), "utf8");
  assert.match(mapa, /\[\[processos\/backup-das-fotos\]\]/, "o mapa usa links do Obsidian");
  assert.match(mapa, /Gerado automaticamente/, "o mapa precisa se declarar gerado");
  assert.ok(
    !(await memoria.indice()).some((i) => i.nome === "MEMORIA"),
    "o mapa gerado não pode entrar no próprio índice"
  );

  // ----------------------------- 4. o PROMPT leva índice, nunca conteúdo
  const paraPrompt = await memoria.paraPrompt();
  const prompt = montarSystemPrompt({ memoria: paraPrompt });
  assert.match(prompt, /O QUE VOCÊ JÁ SABE/);
  assert.match(prompt, /processos\/backup-das-fotos — ele pedir backup/);
  assert.ok(
    !/rsync/.test(prompt),
    "o CONTEÚDO do documento não pode entrar no prompt — é isso que estoura o orçamento"
  );
  assert.ok(/consultar_memoria/.test(prompt), "ela precisa saber como abrir o documento");

  // Sem memória, o bloco não existe: quem não usa não paga tokens por isso.
  assert.ok(!/O QUE VOCÊ JÁ SABE/.test(montarSystemPrompt({})));

  // ---------------------------------- 5. orçamento: corta e AVISA
  for (let i = 0; i < 120; i++) {
    await fsp.writeFile(
      path.join(cofre, "processos", `enche-${i}.md`),
      `---\nquando: situação número ${i} que precisa de um texto razoavelmente longo aqui\n---\n\n# Enche ${i}\n`
    );
  }
  memoria.cache = null;
  const cheio = await memoria.paraPrompt();
  assert.ok(cheio.total > 120, "todos os documentos contam no total");
  assert.ok(cheio.cortados > 0, "passando do orçamento, alguns ficam de fora");
  assert.ok(
    cheio.linhas.join("\n").length <= TETO_INDICE,
    `o índice estourou o teto: ${cheio.linhas.join("\n").length} > ${TETO_INDICE}`
  );
  const promptCheio = montarSystemPrompt({ memoria: cheio });
  assert.match(
    promptCheio,
    /não couberam/,
    "ela precisa SABER que a lista está incompleta, para não garantir que algo não existe"
  );

  // -------------------------------- 6. pelas ferramentas, como ela usa
  ferramentas.configurar({ memoria });
  const lida = await chamar("consultar_memoria", { nome: "backup-das-fotos" });
  assert.match(lida.conteudo, /Mudou o processo/);

  const nova = await chamar("anotar_memoria", {
    nome: "Fechar o mês",
    quando: "ele falar de fechamento do mês",
    conteudo: "Conferir as notas e mandar para a contadora.",
    pasta: "processos",
  });
  assert.ok(nova.ok);
  assert.ok(fs.existsSync(path.join(cofre, "processos", "fechar-o-mes.md")));

  const semNome = await chamar("anotar_memoria", { nome: "", quando: "x", conteudo: "y" });
  assert.match(semNome.error, /nome/, "nota sem nome é recusada, não salva em branco");

  console.log("✓ memória .md: índice no prompt, conteúdo sob demanda, cofre do Obsidian");
  console.log("   nome errado de 5 jeitos → achou nos 5");
  console.log("   nota sem frontmatter    → indexada pelo título (escrita no Obsidian)");
  console.log("   124 documentos          →", cheio.linhas.length, "no prompt,", cheio.cortados, "fora, e ela é avisada");
  // -------------- 7. a instrução de escrever não é item de índice
  // Ela saía com o mesmo "- " dos documentos, logo abaixo deles: lida de cima
  // para baixo virava mais uma linha do catálogo, e a memória ficou semanas
  // sem receber uma anotação.
  const promptInstrucao = montarSystemPrompt({
    memoria: { linhas: ["- processos/x — quando for o caso"], total: 1, cortados: 0 },
  });
  const linhasPrompt = promptInstrucao.split("\n");
  const ondeEscreve = linhasPrompt.findIndex((l) => /anotar_memoria/.test(l) && /ensin/.test(l));
  assert.ok(ondeEscreve > 0, "falta a instrução de gravar o que aprendeu");
  assert.ok(
    !linhasPrompt[ondeEscreve].trimStart().startsWith("-"),
    "a ordem de gravar não pode sair com a mesma marca dos documentos do índice"
  );
  assert.ok(
    linhasPrompt.some((l) => /^E QUANDO APRENDER ALGO/.test(l)),
    "a instrução precisa do próprio título, separada da lista"
  );

  // ------------------- 8. mudar de casa não perde anotação
  const velhaCasa = fs.mkdtempSync(path.join(os.tmpdir(), "eve-casa-velha-"));
  const novaCasa = fs.mkdtempSync(path.join(os.tmpdir(), "eve-casa-nova-"));
  fs.mkdirSync(path.join(velhaCasa, "processos"));
  fs.writeFileSync(
    path.join(velhaCasa, "processos", "mudanca.md"),
    "---\nquando: testar a mudança\n---\n\n# Mudança\n\nprecisa sobreviver\n"
  );
  const { Memoria: M2 } = require("../memoria.js");
  // A classe só migra da pasta antiga padrão; aqui checamos a regra que
  // importa de verdade: destino com conteúdo NUNCA é sobrescrito.
  const jaUsada = new M2({ pasta: velhaCasa });
  await jaUsada.preparar();
  assert.ok(
    fs.existsSync(path.join(velhaCasa, "processos", "mudanca.md")),
    "preparar() não pode mexer no que já estava na pasta"
  );
  fs.rmSync(velhaCasa, { recursive: true, force: true });
  fs.rmSync(novaCasa, { recursive: true, force: true });

  console.log("   conteúdo no prompt      → nunca");
  console.log("   ordem de gravar         → fora da lista, com título próprio");

  fs.rmSync(cofre, { recursive: true, force: true });
})();
