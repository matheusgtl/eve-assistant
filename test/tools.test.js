// tools.test.js — as travas de segurança das ferramentas.
//
// Estas são as garantias que não podem depender de o modelo se comportar:
// comando destrutivo pede confirmação, mensagem para outra pessoa pede
// confirmação sempre, apagar é mandar para o Lixo, e falha de ferramenta volta
// como erro legível em vez de derrubar o laço.
//
// O teste não executa nada destrutivo nem mexe na área de transferência: só
// checa as travas e as operações reversíveis, em arquivos temporários.
// Rode com: node test/tools.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ferramentas = require("../tools.js");
const { toolDefinitions, runTool, isDangerous, configurar } = ferramentas;

const chamar = async (nome, args) => JSON.parse(await runTool(nome, args));

(async () => {
  // ------------------------------------------------- 1. catálogo coerente
  const nomes = toolDefinitions.map((t) => t.name);
  for (const obrigatoria of [
    "run_command", "open_target", "applescript", "read_file", "write_file",
    "edit_file", "trash_file", "list_directory", "find_files", "system_status",
    "clipboard", "web_search", "read_webpage", "notify", "create_reminder",
    "list_reminders", "cancel_reminder", "send_message",
    "consultar_memoria", "anotar_memoria",
  ]) {
    assert.ok(nomes.includes(obrigatoria), `falta a ferramenta ${obrigatoria}`);
  }
  assert.strictEqual(new Set(nomes).size, nomes.length, "nome de ferramenta repetido");
  for (const t of toolDefinitions) {
    assert.ok(t.description?.length > 20, `${t.name}: descrição curta demais`);
    assert.strictEqual(t.input_schema.type, "object", `${t.name}: schema precisa ser object`);
    for (const obrig of t.input_schema.required || []) {
      assert.ok(t.input_schema.properties[obrig], `${t.name}: exige "${obrig}" que não existe`);
    }
  }

  // -------------------------------------- 1b. orçamento de tokens
  // As definições viajam em TODO pedido, e uma pergunta real faz três pedidos.
  // Quando eram ~1.773 tokens, isso sozinho consumia 5.300 tokens por pergunta
  // — num plano gratuito de 200 mil/dia, 26 perguntas. Este teto existe para o
  // texto não voltar a crescer sem ninguém perceber.
  //
  // O teto total subiu de 1.700 para 1.900 quando entraram ler_pdf, usar_skill,
  // criar_skill e salvar_conversa (20 → 24 ferramentas). Subir aqui é um ato
  // deliberado e tem preço: ~5.600 tokens por pergunta, ~35 perguntas por dia
  // no plano gratuito do Groq. Quem mede de verdade o inchaço é o teto POR
  // FERRAMENTA logo abaixo, que não afrouxa quando a lista cresce.
  //
  // Subiu de novo, para 2.150, com criar_evento e listar_eventos (24 → 26).
  // O preço: ~185 tokens a mais por pedido. O que se compra: ele pediu um
  // compromisso no calendário e recebeu um lembrete interno, porque calendário
  // não existia no app. Para caber, a distinção entre evento e lembrete foi
  // escrita no PROMPT em vez de repetida na descrição das duas ferramentas —
  // dita uma vez custa menos que duas. A média por ferramenta não se moveu
  // (79,7), o que é a prova de que o que entrou foi ferramenta e não texto.
  const comoViaja = JSON.stringify(
    toolDefinitions.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema }))
  );
  const tokens = Math.round(comoViaja.length / 4);
  const porFerramenta = tokens / toolDefinitions.length;
  // Dois tetos, porque eles pegam coisas diferentes: o total é o que a conta
  // gratuita paga por pergunta; a média por ferramenta é o que pega descrição
  // engordando sem que o total acuse, quando ferramentas novas entram.
  assert.ok(tokens < 2150, `as ferramentas somam ~${tokens} tokens (teto: 2150)`);
  assert.ok(porFerramenta < 80, `~${porFerramenta.toFixed(0)} tokens por ferramenta (teto: 80)`);

  // ------------------- 1c. pesquisar não pode abrir aba no navegador
  // Caso real de 27/10, no log: web_search às 15:56:47, open_target às
  // 15:56:54. Ela pesquisou e abriu a página no navegador dele, no meio do que
  // ele estava fazendo. A causa estava escrita no prompt: "navegar e abrir
  // páginas" aparecia na lista do que ela faz sem pedir licença.
  const { montarSystemPrompt } = require("../brains.js");
  const prompt = montarSystemPrompt();
  assert.ok(
    !/navegar e abrir p[áa]ginas/i.test(prompt),
    "o prompt não pode mandar ela abrir páginas por conta própria"
  );
  assert.match(
    prompt,
    /Pesquisar é LER, não abrir/,
    "e precisa dizer explicitamente que pesquisa não termina em aba aberta"
  );
  const abrir = toolDefinitions.find((t) => t.name === "open_target");
  assert.match(
    abrir.description,
    /só quando ele pedir/i,
    "a própria ferramenta tem de dizer que é a pedido dele, não para consulta"
  );

  // ------------------------------------------------- 2. o que é perigoso
  for (const perigoso of [
    "rm -rf ~/Documents", "sudo rm algo", "shutdown -h now", "diskutil eraseDisk x",
    "dd if=/dev/zero of=/dev/disk0", "chmod -R 777 /", "git push origin main --force",
    "tell application \"Finder\" to empty trash", "launchctl bootout gui/501",
  ]) {
    assert.ok(isDangerous(perigoso), `deveria ser perigoso: ${perigoso}`);
  }

  // A régua é "dá para desfazer?". Fechar um app e botar o Mac para dormir dão
  // — e pedir confirmação para isso só atrapalhava quem mandou fechar o Spotify.
  for (const seguro of [
    "ls ~/Downloads", "open -a Spotify", "git status", "echo oi",
    "defaults read com.apple.finder", "say olá",
    "killall WhatsApp", "pmset sleepnow", "osascript -e 'tell app \"Safari\" to quit'",
  ]) {
    assert.ok(!isDangerous(seguro), `não deveria ser perigoso: ${seguro}`);
  }

  // Comando perigoso NÃO executa: volta pedindo confirmação.
  const alvoFalso = path.join(os.tmpdir(), `eve-nao-apagar-${process.pid}`);
  fs.writeFileSync(alvoFalso, "este arquivo precisa sobreviver ao teste");
  const barrado = await chamar("run_command", { command: `rm -rf ${alvoFalso}` });
  assert.strictEqual(barrado.needs_confirmation, true);
  assert.match(barrado.message, /confirmed=true/);
  assert.ok(fs.existsSync(alvoFalso), "o arquivo não pode ter sido apagado");
  assert.match(barrado.message, /não tente outro caminho/i);

  // Comando inofensivo roda normalmente.
  const ok = await chamar("run_command", { command: "echo ação" });
  assert.match(ok.stdout, /ação/, "comando simples deve rodar e manter o acento");

  // Comando que falha vira erro descrito, não exceção.
  const falhou = await chamar("run_command", { command: "exit 3" });
  assert.ok(falhou.error, "comando com saída diferente de zero precisa reportar erro");

  // ------------------------------------------------- 3. arquivos
  const arq = path.join(os.tmpdir(), `eve-teste-${process.pid}.txt`);
  fs.rmSync(arq, { force: true });
  fs.rmSync(arq + ".bak", { force: true });

  const escrito = await chamar("write_file", { filepath: arq, content: "linha um\nlinha dois\n" });
  assert.ok(escrito.ok);
  assert.strictEqual(escrito.backup, undefined, "arquivo novo não gera backup");

  const lido = await chamar("read_file", { filepath: arq });
  assert.match(lido.content, /linha um/);

  // Sobrescrever guarda cópia: perder conteúdo por engano é o acidente mais comum.
  const sobrescrito = await chamar("write_file", { filepath: arq, content: "outro conteúdo" });
  assert.strictEqual(sobrescrito.backup, arq + ".bak");
  assert.match(fs.readFileSync(arq + ".bak", "utf8"), /linha um/, "o backup tem o conteúdo antigo");

  // edit_file exige trecho único.
  fs.writeFileSync(arq, "alfa\nbeta\nalfa\n");
  const ambiguo = await chamar("edit_file", { filepath: arq, old: "alfa", new: "gama" });
  assert.match(ambiguo.error, /2 vezes/, "trecho repetido precisa ser recusado");
  const inexistente = await chamar("edit_file", { filepath: arq, old: "zzz", new: "x" });
  assert.match(inexistente.error, /não existe/);
  const editado = await chamar("edit_file", { filepath: arq, old: "beta", new: "beta editado" });
  assert.ok(editado.ok);
  assert.strictEqual(fs.readFileSync(arq, "utf8"), "alfa\nbeta editado\nalfa\n");

  const listado = await chamar("list_directory", { dirpath: os.tmpdir() });
  assert.ok(Array.isArray(listado.itens) && listado.itens.length > 0);
  assert.ok(listado.itens.every((i) => i.tipo === "pasta" || i.tipo === "arquivo"));

  // ------------------------------------------------- 4. Lixo, não rm
  const fora = await chamar("trash_file", { filepath: "/Library/Preferences" });
  assert.strictEqual(fora.needs_confirmation, true, "fora da pasta do usuário exige confirmação");
  const naoExiste = await chamar("trash_file", { filepath: path.join(os.homedir(), "nao-existe-xyz-123") });
  assert.match(naoExiste.error, /não existe/);

  fs.rmSync(arq, { force: true });
  fs.rmSync(arq + ".bak", { force: true });
  fs.rmSync(alvoFalso, { force: true });

  // ------------------------------------------------- 5. mensagem a terceiros
  const msg = await chamar("send_message", {
    canal: "imessage",
    para: "+5511999999999",
    texto: "oi",
  });
  assert.strictEqual(msg.needs_confirmation, true, "mandar mensagem exige confirmação SEMPRE");
  assert.match(msg.message, /leia em voz alta/i);
  assert.strictEqual(msg.resumo.para, "+5511999999999", "o resumo volta para ela ler em voz alta");

  // O WhatsApp agora entrega de verdade depois do sim — mas a trava vale igual,
  // e sem confirmed=true nada pode sair nem abrir conversa com ninguém.
  const zap = await chamar("send_message", {
    canal: "whatsapp",
    para: "11 98888-7777",
    texto: "oi",
  });
  assert.strictEqual(zap.needs_confirmation, true, "WhatsApp também passa pela confirmação");
  assert.ok(!zap.entregue, "não pode ter entregado nada antes do sim");
  assert.ok(!zap.aberto, "nem sequer abrir a conversa antes do sim");

  // Número sem DDD não vira envio para um número errado: vira pedido de dado.
  const curto = await chamar("send_message", { canal: "whatsapp", para: "123", texto: "oi", confirmed: true });
  assert.match(curto.error, /DDD/, "número curto demais tem de ser recusado, não completado");

  // ------------------------------------------------- 6. contexto injetado
  const criados = [];
  const avisados = [];
  configurar({
    lembretes: {
      criar: (x) => (criados.push(x), { ok: true, id: "aaa111", texto: x.texto, quando: "hoje às 15:00" }),
      listar: () => [{ id: "aaa111", texto: "x", quando: "hoje às 15:00" }],
      cancelar: (id) => ({ ok: true, cancelado: id }),
    },
    notificar: async (n) => avisados.push(n),
    chaveGemini: () => "AQ.falsa",
    modelo: () => "gemini-flash-latest",
    web: {
      pesquisar: async (q) => {
        if (q === "falha") throw new Error("sem internet");
        return { texto: "achei isso", links: [{ titulo: "t", url: "https://x" }], consultas: [q] };
      },
      lerPagina: async () => ({ url: "https://x", titulo: "T", texto: "corpo" }),
    },
  });

  const lembrete = await chamar("create_reminder", { texto: "beber água", quando: "em 10 minutos" });
  assert.ok(lembrete.ok);
  assert.deepStrictEqual(criados[0], { texto: "beber água", quando: "em 10 minutos" });

  const pendentes = await chamar("list_reminders");
  assert.strictEqual(pendentes.total, 1);
  assert.ok((await chamar("cancel_reminder", { id: "aaa111" })).ok);

  await chamar("notify", { titulo: "oi", mensagem: "pronto" });
  assert.deepStrictEqual(avisados[0], { titulo: "oi", mensagem: "pronto" });

  const busca = await chamar("web_search", { query: "dólar hoje" });
  assert.strictEqual(busca.resposta, "achei isso");
  assert.strictEqual(busca.fontes[0].url, "https://x");

  // Busca falhou: a ferramenta precisa INSTRUIR a não inventar.
  const buscaRuim = await chamar("web_search", { query: "falha" });
  assert.match(buscaRuim.error, /sem internet/);
  assert.match(buscaRuim.instrucao, /Não responda de memória/i);

  // ------------------------------------------------- 7. erros não derrubam o laço
  const desconhecida = await chamar("ferramenta_que_nao_existe", {});
  assert.match(desconhecida.error, /desconhecida/);

  configurar({
    web: {
      pesquisar: async () => {
        throw new Error("explodiu");
      },
      lerPagina: async () => {
        throw new Error("explodiu");
      },
    },
  });
  const pagina = await chamar("read_webpage", { url: "https://x" });
  assert.match(pagina.error, /explodiu/, "exceção vira erro legível");

  // --------------------------- PDF grande não pode engolir a conversa
  // Um PDF de 60 páginas passa de 150 mil caracteres. Entregue inteiro na
  // resposta da ferramenta, ele sozinho estoura o histórico — e o que sai para
  // abrir espaço é a pergunta que ele fez. Foi assim que, no dia 27, ela
  // chamou `ler_pdf` catorze vezes seguidas sem nunca responder.
  configurar({
    pdf: {
      lerPdf: async () => ({
        texto: Array.from({ length: 4000 }, (_, i) => `linha ${i} do contrato`).join("\n"),
        paginas: 60,
        lidas: 60,
      }),
    },
  });
  const grande = await chamar("ler_pdf", { caminho: "/tmp/contrato.pdf" });
  assert.ok(grande.texto.length <= 24_000, `o texto voltou com ${grande.texto.length} caracteres`);
  assert.strictEqual(grande.truncado, true, "e ela precisa SABER que foi cortado");
  assert.match(grande.aviso, /pagina/, "o aviso tem de dizer como ver o resto");
  assert.match(grande.aviso, /não repita a chamada/i, "e tem de dizer o que NÃO fazer");
  assert.ok(grande.texto.endsWith("contrato"), "o corte cai no fim de uma linha, não no meio");

  // PDF pequeno continua chegando inteiro, sem aviso nenhum.
  configurar({
    pdf: { lerPdf: async () => ({ texto: "Contrato de duas linhas.\nAssinado.", paginas: 1, lidas: 1 }) },
  });
  const pequeno = await chamar("ler_pdf", { caminho: "/tmp/recibo.pdf" });
  assert.strictEqual(pequeno.texto, "Contrato de duas linhas.\nAssinado.");
  assert.strictEqual(pequeno.truncado, undefined, "nada a avisar quando cabe inteiro");
  assert.strictEqual(pequeno.aviso, undefined);

  // =========================================================================
  // read_file não pode mandar binário para o modelo
  // =========================================================================
  // 31/10, 23:57: ela chamou read_file no PDF do currículo (53 KB). Lido como
  // UTF-8 virou 51.237 caracteres, 27,7% deles caracteres de substituição — e
  // lixo binário tokeniza quase um token por caractere. O pedido saiu com
  // 48.959 tokens e o Groq respondeu "413 Request too large: Limit 8000". O
  // conteúdo era inútil de todo modo: o texto do PDF está comprimido dentro
  // dos streams, e ela já tinha ler_pdf (PDFKit + OCR) para isso.
  {
    const pastaBin = fs.mkdtempSync(path.join(os.tmpdir(), "eve-bin-"));
    const porFazer = (nome, bytes) => {
      const alvoArq = path.join(pastaBin, nome);
      fs.writeFileSync(alvoArq, bytes);
      return alvoArq;
    };

    // PDF: recusado E com a ferramenta certa indicada pelo nome.
    const pdfFalso = porFazer(
      "curriculo.pdf",
      Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4000, 0xcc)])
    );
    const rPdf = JSON.parse(await runTool("read_file", { filepath: pdfFalso }));
    assert.ok(rPdf.error, "PDF tem de ser recusado por read_file");
    assert.match(rPdf.error, /PDF/i);
    assert.strictEqual(rPdf.use, "ler_pdf", "e tem de apontar a ferramenta certa");
    assert.strictEqual(rPdf.content, undefined, "nada de conteúdo binário na resposta");

    // Os outros binários: recusados, mesmo sem ferramenta alternativa.
    for (const [nome, bytes, esperado] of [
      ["foto.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]), /PNG/i],
      ["foto.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2]), /JPEG/i],
      ["doc.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]), /compactado/i],
      // Sem assinatura conhecida, decide pelo conteúdo: byte zero não é texto.
      ["sem-nome.dat", Buffer.concat([Buffer.from("texto"), Buffer.alloc(50, 0)]), /binário/i],
    ]) {
      const r = JSON.parse(await runTool("read_file", { filepath: porFazer(nome, bytes) }));
      assert.ok(r.error, `${nome} tinha de ser recusado`);
      assert.match(r.error, esperado, `${nome}: a mensagem precisa dizer o que é`);
      assert.ok(r.dica, `${nome}: tem de dizer a ela o que fazer em vez de insistir`);
    }

    // Texto de verdade continua passando, inteiro quando é pequeno.
    const arqMd = porFazer("notas.md", Buffer.from("# título\n\nacentuação e emoji ✓\n"));
    const rMd = JSON.parse(await runTool("read_file", { filepath: arqMd }));
    assert.match(rMd.content, /acentuação e emoji ✓/, "UTF-8 multibyte não pode quebrar");
    assert.ok(!rMd.truncado, "arquivo pequeno não é truncado");
    assert.strictEqual(rMd.aviso, undefined, "e não leva aviso à toa");

    // Arquivo grande: cortado no teto comum, com aviso para não repetir.
    const arqGrande = porFazer("grande.txt", Buffer.from("linha de texto comum\n".repeat(20_000)));
    const rG = JSON.parse(await runTool("read_file", { filepath: arqGrande }));
    assert.ok(rG.content.length <= 24_000, `cortou em ${rG.content.length}; o teto é 24.000`);
    assert.strictEqual(rG.truncado, true);
    assert.match(rG.aviso, /não repita a chamada/i, "senão ela chama de novo esperando o resto");
    // O teto antigo era 100.000 caracteres: 25 mil tokens num pedido só, três
    // vezes o minuto inteiro do Groq.
    assert.ok(rG.content.length < 100_000 / 4, "o teto de 100 mil caracteres não pode voltar");

    // Pasta não é arquivo.
    const rDir = JSON.parse(await runTool("read_file", { filepath: pastaBin }));
    assert.match(rDir.error, /pasta/i);
    assert.strictEqual(rDir.use, "list_directory");

    fs.rmSync(pastaBin, { recursive: true, force: true });
  }

  console.log("✓ ferramentas: travas de confirmação, arquivos, lembretes e erros");
  console.log("   ler_pdf 150k  → cortado em", grande.texto.length, "caracteres, com aviso");
  console.log("  ", nomes.length, "ferramentas declaradas");
  console.log("   rm -rf        → needs_confirmation, arquivo intacto");
  console.log("   send_message  → needs_confirmation sempre");
  console.log("   sobrescrever  → guarda .bak automático");
  console.log("   read_file     → PDF vira ler_pdf; binário recusado; teto 24k, não 100k");
  console.log("   as", toolDefinitions.length, "definições ≈", tokens, "tokens por pedido",
    `(${porFerramenta.toFixed(0)}/ferramenta)`);
})();
