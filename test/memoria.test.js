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
  // =========================================================================
  // Não substituir uma nota grande por um pedaço dela
  // =========================================================================
  // 02/11, duas vezes no mesmo dia: ela leu `hortencia-barbosa-leote` (3.106
  // bytes, o perfil acadêmico inteiro tirado de um PDF dele) e gravou de volta
  // uma atualização de 809 bytes com o mesmo nome. Depois fez igual com
  // `perfil-matheus`: 2.352 → 877, levando família, formação e documentos.
  // O backup salvou as duas, mas nem ele nem eu teríamos notado.
  {
    const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "eve-cofre-"));
    const mem = new Memoria({ pasta: cofre, onDebug: () => {} });
    await mem.preparar();

    const grande = [
      "# Hortência Barbosa Leote",
      "",
      "## Formação",
      "- Medicina, UEL",
      "## Experiências",
      "- Intercâmbio no Chile",
      "## Contato",
      "- email e telefone",
      "## Premiações",
      "- primeiro lugar na olimpíada",
      "x".repeat(400),
    ].join("\n");
    const criada = await mem.anotar({ nome: "hortencia", quando: "falar da Hortência", conteudo: grande, pasta: "fatos" });
    assert.ok(criada.ok, "a nota grande precisa ser criada");

    // O acréscimo sozinho é recusado, e a recusa TRAZ o conteúdo atual: sem
    // isso ela precisaria de outra rodada só para descobrir o que apagaria.
    const recusa = await mem.anotar({
      nome: "hortencia",
      quando: "falar da Hortência",
      conteudo: "# Atualização\n\n- Agora são amigos desde agosto.",
      pasta: "fatos",
    });
    assert.ok(recusa.erro, "gravar um pedaço por cima tinha de ser recusado");
    assert.match(recusa.erro, /APAGA/, "a recusa precisa dizer o que aconteceria");
    // A saída tem de estar escrita, e com a ferramenta nomeada: em 02/11 a
    // recusa dizia o problema e não a saída, e ela desviou para o write_file —
    // que escreveu numa pasta fantasma no home.
    assert.match(recusa.erro, /chame anotar_memoria DE NOVO/, "e o que fazer");
    assert.match(recusa.erro, /não use write_file/, "e o que NÃO fazer");
    assert.ok(recusa.conteudo_atual, "a recusa precisa devolver o conteúdo atual");
    assert.match(recusa.conteudo_atual, /Premiações/, "o conteúdo inteiro, para ela juntar");

    // O arquivo continua intacto: recusa não grava nada.
    const noDisco = fs.readFileSync(path.join(cofre, "fatos", "hortencia.md"), "utf8");
    assert.match(noDisco, /Premiações/, "a nota não pode ter sido tocada");

    // Com o texto completo mais o acréscimo, passa.
    const junto = await mem.anotar({
      nome: "hortencia",
      quando: "falar da Hortência",
      conteudo: grande + "\n\n## Atualização\n\n- Agora são amigos desde agosto.",
      pasta: "fatos",
    });
    assert.ok(junto.ok, "o texto completo com o acréscimo tem de passar");

    // 10/11: o app Midnight Racers foi escrito POR CIMA da nota do grupo —
    // texto maior, então a trava do tamanho não viu. Esta vê o que some.
    const outroAssunto = await mem.anotar({
      nome: "hortencia",
      quando: "falar do aplicativo",
      conteudo: "# Aplicativo\n\n" + "Radar com GPS, telemetria, leaderboard, mercado interno, comboio, garagem. ".repeat(30),
      pasta: "fatos",
    });
    assert.match(outroAssunto.erro || "", /SUBSTITUÍDA/, "texto maior que joga fora o que a nota dizia é recusado");
    assert.match(fs.readFileSync(path.join(cofre, "fatos", "hortencia.md"), "utf8"), /Premiações/, "e a nota fica intacta");
    const final = fs.readFileSync(path.join(cofre, "fatos", "hortencia.md"), "utf8");
    assert.match(final, /Premiações/);
    assert.match(final, /amigos desde agosto/);

    // Nota pequena pode ser reescrita à vontade: a trava é para perda grande.
    await mem.anotar({ nome: "curta", quando: "x", conteudo: "# Curta\n\numa linha", pasta: "fatos" });
    const trocada = await mem.anotar({ nome: "curta", quando: "x", conteudo: "# Curta\n\noutra", pasta: "fatos" });
    assert.ok(trocada.ok, "nota curta não entra na trava");

    // 24/11: um `quando` que já passou não abre a nota nunca mais.
    for (const q of ["agora, ao analisar o calendário", "quando: hoje", "Amanhã"]) {
      const r = await mem.anotar({ nome: "aniversarios", quando: q, conteudo: "# A\n\nx", pasta: "fatos" });
      assert.match(r.erro || "", /FUTURA/, `"${q}" tem de ser recusado`);
    }
    const hojeEmDia = await mem.anotar({ nome: "zebra", quando: "ele perguntar o que tem hoje", conteudo: "# Z\n\nx", pasta: "fatos" });
    assert.ok(hojeEmDia.ok, "'hoje' no meio da frase é um quando legítimo");

    // =======================================================================
    // `\n` literal e frontmatter dentro do corpo
    // =======================================================================
    // Em 02/11, às 18:32, ela gravou a nota do Alelo inteira numa ÚNICA linha:
    // o frontmatter e o corpo com os `\n` como dois caracteres, e o acréscimo
    // no fim. O arquivo cresceu de 490 para 1.044 bytes, então a guarda de
    // perda não viu nada — ela só mede encolhimento. A nota ficou ilegível e o
    // título saiu do slug ("Cartao alelo do matheus londrina", sem acento),
    // porque o `# ` de verdade estava enterrado no meio da linha.
    const comoVeioDela =
      "---\\nquando: lugares que aceitam Alelo\\natualizado: 2026-11-02\\ntags: [fato]\\n---\\n\\n" +
      "# Cartão Alelo do Matheus\\n\\n- Cartão: Alelo (vale-refeição)\\n- Cidade: Londrina\\n" +
      "\\n**Organização e metódica:** acréscimo que ela queria fazer.";
    const limpa = await mem.anotar({
      nome: "alelo",
      quando: "lugares que aceitam Alelo",
      conteudo: comoVeioDela,
      pasta: "fatos",
    });
    assert.ok(limpa.ok, "a nota tem de ser gravada");
    const alelo = fs.readFileSync(path.join(cofre, "fatos", "alelo.md"), "utf8");

    assert.doesNotMatch(alelo, /\\n/, "nenhum `\\n` literal pode sobrar no arquivo");
    assert.ok(alelo.split("\n").length > 8, "o texto tem de voltar a ter linhas");
    assert.match(alelo, /^# Cartão Alelo do Matheus$/m, "o título dela, com acento, e não o slug");
    assert.doesNotMatch(alelo, /^# Alelo$/m, "o humanizar do slug não devia ter sido usado");
    assert.match(alelo, /Organização e metódica/, "o acréscimo fica");
    assert.match(alelo, /vale-refeição/, "e o conteúdo antigo também");

    // Um frontmatter só, e no topo. Ela devolve a nota inteira (com
    // frontmatter) quando junta o acréscimo, e aqui se escreve outro em cima.
    assert.strictEqual(
      (alelo.match(/^---$/gm) || []).length,
      2,
      "dois `---` e não quatro: frontmatter duplicado aparece como texto no Obsidian"
    );
    assert.strictEqual(
      (alelo.match(/^tags:/gm) || []).length,
      1,
      "o frontmatter do corpo tem de sair"
    );

    // E o inverso não pode quebrar: uma nota que CITA `\n` num trecho de
    // código tem muitas quebras de verdade e o `\n` precisa continuar lá.
    const comCodigo = [
      "# Código",
      "",
      "Para separar as linhas o split usa `\\n` como marca:",
      "",
      "```js",
      'texto.split("\\n")',
      "```",
      "",
      "E isso vale para o arquivo inteiro.",
    ].join("\n");
    await mem.anotar({ nome: "codigo", quando: "x", conteudo: comCodigo, pasta: "fatos" });
    const codigo = fs.readFileSync(path.join(cofre, "fatos", "codigo.md"), "utf8");
    assert.match(codigo, /split\("\\n"\)/, "o `\\n` citado em código não pode ser desescapado");

    // =======================================================================
    // Link para si mesma não é link
    // =======================================================================
    // Em 02/11 ela pôs [[hortencia-barbosa-leote]] dentro do arquivo
    // hortencia-barbosa-leote.md, em três notas diferentes.
    await mem.anotar({ nome: "outra-nota", quando: "x", conteudo: "# Outra\n\ntexto", pasta: "fatos" });
    const sozinha = await mem.anotar({
      nome: "sozinha",
      quando: "x",
      conteudo: "# Sozinha\n\ntexto",
      pasta: "fatos",
      relacionado: ["sozinha", "fatos/sozinha", "outra-nota", "Outra Nota", "fantasma"],
    });
    const texto = fs.readFileSync(path.join(cofre, "fatos", "sozinha.md"), "utf8");
    assert.doesNotMatch(texto, /\[\[(fatos\/)?sozinha\]\]/, "autolink tem de ser descartado");
    assert.match(texto, /\[\[fatos\/outra-nota\]\]/, "e o link de verdade fica, sempre com a pasta");
    assert.strictEqual(
      (texto.match(/outra-nota\]\]/g) || []).length,
      1,
      "link repetido (com e sem pasta, com espaço) entra uma vez só"
    );

    // 04/11: link para nota que não existe vira nó fantasma no grafo. Não
    // entra, e ela fica sabendo, para criar a nota se for o caso.
    assert.doesNotMatch(texto, /fantasma/, "link para nota inexistente não entra");
    assert.match(sozinha.links_sem_nota || "", /fantasma/, "e ela é avisada");

    // A ligação de volta: a outra nota passa a apontar para esta.
    const outra = fs.readFileSync(path.join(cofre, "fatos", "outra-nota.md"), "utf8");
    assert.match(outra, /## Relacionado\n- \[\[fatos\/sozinha\]\]/, "a ligação vale nos dois sentidos");
    assert.deepStrictEqual(sozinha.ligacao_de_volta, ["fatos/outra-nota"]);

    // Uma seção só, mesmo quando ela escreve a seção no conteúdo E manda relacionado.
    await mem.anotar({
      nome: "sozinha",
      quando: "x",
      conteudo: "# Sozinha\n\ntexto novo\n\n## Relacionado\n- [[outra-nota]]",
      pasta: "fatos",
      relacionado: ["outra-nota"],
    });
    const reescrita = fs.readFileSync(path.join(cofre, "fatos", "sozinha.md"), "utf8");
    assert.strictEqual((reescrita.match(/## Relacionado/g) || []).length, 1, "uma seção Relacionado só");
    // Reescrever sem citar a ligação não a desfaz.
    await mem.anotar({ nome: "sozinha", quando: "x", conteudo: "# Sozinha\n\ntexto de novo", pasta: "fatos" });
    assert.match(
      fs.readFileSync(path.join(cofre, "fatos", "sozinha.md"), "utf8"),
      /\[\[fatos\/outra-nota\]\]/,
      "reescrever a nota não a desliga do resto do cofre"
    );
    // A outra nota não ganha a mesma linha duas vezes.
    assert.strictEqual(
      (fs.readFileSync(path.join(cofre, "fatos", "outra-nota.md"), "utf8").match(/sozinha\]\]/g) || []).length,
      1,
      "ligação de volta não se repete"
    );
    // E quem consulta fica sabendo para onde a nota aponta.
    const lida = await mem.consultar("sozinha");
    assert.deepStrictEqual(lida.ligadas, ["fatos/outra-nota"], "consultar diz as notas ligadas");

    // E o padrão: um H1 só, humano, mesmo quando ela manda título no conteúdo.
    assert.strictEqual((texto.match(/^# /gm) || []).length, 1, "um H1 por nota");
    assert.match(texto, /^# Sozinha$/m, "o título dela, não o slug");
    assert.match(texto, /^tags: \[fato\]$/m);

    fs.rmSync(cofre, { recursive: true, force: true });
  }



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

  console.log("   \\n literal              → desescapado; `\\n` citado em código fica");
  console.log("   frontmatter no corpo    → sai, e o título dela sobrevive");
  console.log("   conteúdo no prompt      → nunca");
  console.log("   ordem de gravar         → fora da lista, com título próprio");

  fs.rmSync(cofre, { recursive: true, force: true });
})();

// ---------------------------------------------------------------------------
// 05/11: as notas do assunto entram sozinhas — ela não abriu a de finanças
// para responder sobre a fatura que estava anotada.
// ---------------------------------------------------------------------------
(async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { Memoria } = require("../memoria.js");
  const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "ev-relevantes-"));
  const mem = new Memoria({ pasta: cofre });
  await mem.anotar({ nome: "financas", pasta: "fatos", quando: "quando ele falar de dinheiro, fatura, Nubank ou quanto vai sobrar", conteudo: "# Finanças\n\nFatura do Nubank: R$ 327,64, vence dia 13." });
  await mem.anotar({ nome: "igreja", pasta: "fatos", quando: "quando ele falar da igreja ou do culto", conteudo: "# Igreja\n\nCulto domingo às 19h." });
  await mem.anotar({ nome: "gastos", pasta: "processos", quando: "ele contar que gastou ou pagou algo", conteudo: "# Gastos\n\nLance com registrar_gasto." });

  const fatura = await mem.relevantes("assim que eu pagar a minha fatura, quanto vai sobrar?");
  assert.strictEqual(fatura[0]?.nome, "fatos/financas", "a pergunta da fatura abre a nota das finanças");
  assert.match(fatura[0].conteudo, /327,64/, "com o conteúdo, não só o nome");
  assert.doesNotMatch(fatura[0].conteudo, /^---/, "sem frontmatter");
  assert.ok(!fatura.some((n) => n.nome === "fatos/igreja"), "nota de outro assunto não entra");

  assert.deepStrictEqual((await mem.relevantes("gastei 30 no ifood")).map((n) => n.nome)[0], "processos/gastos",
    "gastei/gastou/gastos caem na mesma raiz");
  assert.deepStrictEqual(await mem.relevantes("oi, tudo bem?"), [], "conversa à toa não abre nada");

  // Continuação sem palavra própria: ficam as do turno anterior.
  const seguinte = await mem.relevantes("e aí?", { anteriores: ["fatos/financas"] });
  assert.deepStrictEqual(seguinte.map((n) => n.nome), ["fatos/financas"], "a pergunta de continuação herda as notas");

  // Orçamento total: nota gigante é cortada no fim de uma linha.
  await mem.anotar({ nome: "grande", pasta: "fatos", quando: "fatura enorme", conteudo: "# Grande\n\n" + "linha da fatura\n".repeat(500) });
  const grande = await mem.relevantes("fatura", { orcamento: 1000 });
  const total = grande.reduce((n, x) => n + x.conteudo.length, 0);
  assert.ok(total <= 1100, `o orçamento é do total: ${total}`);

  fs.rmSync(cofre, { recursive: true, force: true });
  console.log("✓ memória: as notas do assunto entram já lidas; conversa à toa não abre nada");
})().catch((e) => { console.error(e); process.exit(1); });

// ---------------------------------------------------------------------------
// 07/11: nota nova sobre assunto que já tem nota é recusada de primeira —
// ela criou três notas de dízimo soltas com a de finanças já dizendo isso.
// ---------------------------------------------------------------------------
(async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { Memoria } = require("../memoria.js");
  const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "ev-parecida-"));
  const mem = new Memoria({ pasta: cofre });
  await mem.anotar({ nome: "financas", pasta: "fatos", quando: "quando ele falar de dinheiro, salário, dízimo ou pagamento", conteudo: "# Finanças\n\nDízimo: 10% de cada parcela." });

  const dup = await mem.anotar({ nome: "regra-dizimo", pasta: "processos", quando: "quando cair o pagamento do salário, separar o dízimo", conteudo: "# Regra\n\n10%." });
  assert.match(dup.erro || "", /já existe "fatos\/financas"/, "a nota parecida é recusada e aponta a que existe");
  assert.match(dup.conteudo_atual, /10% de cada parcela/, "com o texto dela, para juntar");
  assert.ok(!fs.existsSync(path.join(cofre, "processos", "regra-dizimo.md")));

  const insistiu = await mem.anotar({ nome: "regra-dizimo", pasta: "processos", quando: "quando cair o pagamento do salário, separar o dízimo", conteudo: "# Regra\n\n10%." });
  assert.ok(insistiu.ok, "insistir com o mesmo nome cria: pode ser mesmo outro assunto");

  const outra = await mem.anotar({ nome: "julia", pasta: "fatos", quando: "quando ele falar da Júlia", conteudo: "# Júlia\n\nAmiga." });
  assert.ok(outra.ok, "assunto sem nota parecida passa direto");

  fs.rmSync(cofre, { recursive: true, force: true });
  console.log("✓ memória: nota nova parecida com uma que existe volta para ser juntada nela");
})().catch((e) => { console.error(e); process.exit(1); });
