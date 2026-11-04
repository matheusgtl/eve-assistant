// arquivo.test.js — o cartão do arquivo que ela criou, no chat.
//
// Pedido dele em 04/11: quando ela criar um PDF, mostrar na conversa "como o
// seu", com botão de download. Antes ela dizia "salvei em
// ~/Documents/relatorio.pdf" e ele tinha de ir procurar no Finder.
//
// O caminho tem quatro paradas, e cada uma pode falhar calada:
//   1. a ferramenta avisa o app (onArquivo) — e só quando o PDF EXISTE;
//   2. o processo principal guarda no histórico e só abre o que ela criou;
//   3. a interface desenha o cartão, e os botões chamam a ponte certa;
//   4. o diário de conversas registra o arquivo com o caminho.
// Rode com: node test/arquivo.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  // =====================================================================
  // 1. a ferramenta avisa — e só quando deu certo
  // =====================================================================
  const { runTool, configurar } = require("../tools.js");
  const avisos = [];
  configurar({ onArquivo: (a) => avisos.push(a), pdf: require("../pdf.js") });

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "eve-arquivo-"));
  const alvo = path.join(pasta, "relatorio.pdf");
  const r = JSON.parse(await runTool("criar_pdf", { caminho: alvo, conteudo: "# Oi\n\nTexto.", titulo: "Oi" }));
  assert.ok(!r.error, `devia ter criado: ${r.error}`);
  assert.strictEqual(avisos.length, 1, "um PDF criado = um aviso para o app");
  assert.deepStrictEqual(
    Object.keys(avisos[0]).sort(),
    ["bytes", "caminho", "nome", "paginas", "tipo"],
    "o cartão precisa de caminho, nome, páginas, tamanho e tipo"
  );
  assert.strictEqual(avisos[0].caminho, alvo);
  assert.strictEqual(avisos[0].nome, "relatorio.pdf");
  assert.strictEqual(avisos[0].tipo, "pdf");
  assert.strictEqual(avisos[0].bytes, fs.statSync(alvo).size, "o tamanho é o do arquivo de verdade");

  // Recusado não vira cartão: um botão "Baixar" para arquivo que não existe é
  // pior do que nenhum botão.
  await runTool("criar_pdf", { caminho: path.join(pasta, "vazio.pdf"), conteudo: "  " });
  assert.strictEqual(avisos.length, 1, "PDF recusado não pode gerar cartão");
  configurar({ onArquivo: () => {} });

  // =====================================================================
  // 2. o processo principal: histórico e a trava de "só o que ela criou"
  // =====================================================================
  // O main.js não carrega fora do Electron; a regra é conferida no código,
  // como a ponte faz com os canais.
  const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  for (const canal of ["ev:file-open", "ev:file-save-as"]) {
    const i = main.indexOf(`ipcMain.handle("${canal}"`);
    assert.ok(i >= 0, `falta o handler ${canal}`);
    // Até o handler seguinte: o primeiro "});" é o do diálogo de salvar, no meio.
    const corpo = main.slice(i, main.indexOf("\nipcMain.handle(", i + 1));
    assert.match(
      corpo, /arquivoLiberado\(caminho\)/,
      `${canal} tem de passar pela lista de liberados: o caminho vem da interface`
    );
    assert.ok(
      corpo.indexOf("arquivoLiberado") < Math.max(corpo.indexOf("openPath"), corpo.indexOf("copyFile")),
      `${canal} confere ANTES de abrir ou copiar`
    );
  }
  assert.match(main, /onArquivo:\s*anotarArquivo/, "a ferramenta tem de estar ligada ao registro");
  assert.match(
    main, /for \(const item of lerHistorico\(\)\) liberarArquivo\(item\.arquivo\?\.caminho\)/,
    "os cartões que voltam do histórico têm de continuar abrindo depois de reabrir o app"
  );
  assert.match(
    main, /anotar\("eve", `📎 \$\{arquivo\.nome\}`, \{ arquivo \}\)/,
    "o arquivo entra no histórico como item próprio, com o objeto junto"
  );
  // Baixar é COPIAR. O original fica onde ela disse que gravou.
  const salvar = main.slice(main.indexOf('ipcMain.handle("ev:file-save-as"'));
  assert.doesNotMatch(
    salvar.slice(0, salvar.indexOf("\nipcMain.handle(", 1)), /\brename\(/,
    "baixar não pode MOVER o original: a frase dela dizendo onde salvou viraria mentira"
  );

  // =====================================================================
  // 3. a interface desenha o cartão, e os botões chamam a ponte
  // =====================================================================
  class No {
    constructor(tag) {
      this.tagName = (tag || "").toUpperCase();
      this.filhos = [];
      this.className = "";
      this._texto = "";
      this.atributos = {};
      this.ouvintes = {};
      this.disabled = false;
    }
    appendChild(f) { this.filhos.push(f); return f; }
    append(...fs) { this.filhos.push(...fs); }
    setAttribute(k, v) { this.atributos[k] = String(v); }
    addEventListener(ev, fn) { this.ouvintes[ev] = fn; }
    querySelector() { return null; }
    set textContent(v) { this._texto = String(v); this.filhos = []; }
    get textContent() {
      return this.filhos.length ? this.filhos.map((f) => f.textContent).join("") : this._texto;
    }
    porClasse(c) {
      const achados = String(this.className).split(/\s+/).includes(c) ? [this] : [];
      for (const f of this.filhos) if (f.porClasse) achados.push(...f.porClasse(c));
      return achados;
    }
  }

  const fonte = fs.readFileSync(path.join(__dirname, "..", "renderer", "interface.js"), "utf8");
  const extrair = (nome) => {
    const i = fonte.indexOf(`function ${nome}(`);
    assert.ok(i >= 0, `não achei ${nome} no interface.js`);
    let nivel = 0;
    let j = fonte.indexOf("{", i);
    for (; j < fonte.length; j++) {
      if (fonte[j] === "{") nivel++;
      else if (fonte[j] === "}" && --nivel === 0) break;
    }
    return fonte.slice(i, j + 1);
  };

  const bolha = new No("div");
  const sistema = [];
  const chamadas = [];
  let respostaDaPonte = { ok: true };
  const ponte = {
    openFile: async (c) => { chamadas.push(["openFile", c]); return respostaDaPonte; },
    saveFileAs: async (c) => { chamadas.push(["saveFileAs", c]); return respostaDaPonte; },
  };

  const { mostrarArquivo, tamanhoLegivel } = new Function(
    "document", "window", "ultimaLinhaEve", "registrar", "registrarSistema", "rolar",
    `${extrair("tamanhoLegivel")}\n${extrair("mostrarArquivo")}\nreturn { mostrarArquivo, tamanhoLegivel };`
  )(
    { createElement: (t) => new No(t) },
    { ev: ponte },
    bolha,
    () => bolha,
    (t) => sistema.push(t),
    () => {}
  );

  assert.strictEqual(tamanhoLegivel(512), "512 B");
  assert.strictEqual(tamanhoLegivel(30838), "30 KB");
  assert.strictEqual(tamanhoLegivel(2_400_000), "2,3 MB", "vírgula decimal, como ele lê");

  mostrarArquivo({ tipo: "pdf", caminho: "/Users/x/Documents/relatorio.pdf", nome: "relatorio.pdf", paginas: 3, bytes: 30838 });
  const [cartao] = bolha.porClasse("arquivo");
  assert.ok(cartao, "o cartão tem de entrar na bolha dela");
  assert.strictEqual(cartao.porClasse("arquivo-nome")[0].textContent, "relatorio.pdf");
  assert.strictEqual(cartao.porClasse("arquivo-nome")[0].title, "/Users/x/Documents/relatorio.pdf",
    "o caminho completo aparece ao passar o mouse");
  assert.strictEqual(cartao.porClasse("arquivo-meta")[0].textContent, "3 páginas · 30 KB");
  assert.strictEqual(cartao.porClasse("arquivo-icone")[0].textContent, "PDF");

  const botoes = cartao.porClasse("arquivo-botao");
  assert.deepStrictEqual(botoes.map((b) => b.textContent), ["Abrir", "Baixar"]);
  assert.ok(botoes[1].className.includes("primario"), "Baixar é a ação principal: é o que ele pediu");
  assert.strictEqual(botoes[1].atributos["aria-label"], "Baixar relatorio.pdf", "leitor de tela diz qual arquivo");

  // Baixar com sucesso: chama a ponte com o caminho e diz onde a cópia ficou.
  respostaDaPonte = { ok: true, caminho: "/Users/x/Downloads/relatorio.pdf" };
  await botoes[1].ouvintes.click();
  assert.deepStrictEqual(chamadas.at(-1), ["saveFileAs", "/Users/x/Documents/relatorio.pdf"]);
  assert.match(sistema.at(-1), /cópia salva em \/Users\/x\/Downloads\/relatorio\.pdf/);
  assert.strictEqual(botoes[1].disabled, false, "o botão volta a funcionar depois do clique");

  // Cancelou a janela de salvar: nada a dizer.
  const antes = sistema.length;
  respostaDaPonte = { ok: false, cancelado: true };
  await botoes[1].ouvintes.click();
  assert.strictEqual(sistema.length, antes, "cancelar não é erro");

  // Arquivo apagado depois de criado: o motivo aparece, em vez de botão morto.
  respostaDaPonte = { ok: false, erro: "o arquivo não está mais nesse lugar" };
  await botoes[0].ouvintes.click();
  assert.deepStrictEqual(chamadas.at(-1)[0], "openFile");
  assert.match(sistema.at(-1), /não consegui: o arquivo não está mais nesse lugar/);

  // Uma página no singular.
  const bolha2 = new No("div");
  new Function(
    "document", "window", "ultimaLinhaEve", "registrar", "registrarSistema", "rolar",
    `${extrair("tamanhoLegivel")}\n${extrair("mostrarArquivo")}\nreturn mostrarArquivo;`
  )({ createElement: (t) => new No(t) }, { ev: ponte }, bolha2, () => bolha2, () => {}, () => {})(
    { tipo: "pdf", caminho: "/a.pdf", nome: "a.pdf", paginas: 1, bytes: 900 }
  );
  assert.strictEqual(bolha2.porClasse("arquivo-meta")[0].textContent, "1 página · 900 B");

  // No histórico, o item do arquivo vira cartão e não o texto "📎 nome".
  const replay = fonte.slice(fonte.indexOf('window.ev.on("history"'));
  assert.match(
    replay.slice(0, 600), /if \(i\.arquivo\) \{\s*mostrarArquivo\(i\.arquivo\);\s*continue;/,
    "ao reabrir o app o cartão tem de voltar, não um texto com clipe"
  );
  assert.match(fonte, /window\.ev\.on\("arquivo", \(arquivo\) => mostrarArquivo\(arquivo\)\)/);

  // =====================================================================
  // 4. o diário de conversas registra onde o arquivo está
  // =====================================================================
  const { emTurnos } = require("../conversas.js");
  const turnos = emTurnos([
    { quem: "voce", texto: "faz um pdf", hora: "2026-11-04T10:00:00Z" },
    { quem: "eve", texto: "Já vou fazer.", hora: "2026-11-04T10:00:01Z" },
    { quem: "eve", texto: "📎 relatorio.pdf", arquivo: { nome: "relatorio.pdf", caminho: alvo }, hora: "2026-11-04T10:00:02Z" },
    { quem: "eve", texto: "Salvei nos Documentos.", hora: "2026-11-04T10:00:03Z" },
  ]);
  assert.strictEqual(turnos.length, 2, "os três fragmentos dela são uma resposta só");
  assert.match(
    turnos[1].texto, new RegExp(`Já vou fazer\\.\\n\\n📎 relatorio\\.pdf — ${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\nSalvei`),
    "o arquivo entra como parágrafo próprio, com o caminho"
  );

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log("✓ cartão de arquivo: a ferramenta avisa, o app guarda, a tela desenha, o diário registra");
  console.log("   criar_pdf ok    → um aviso com caminho, nome, páginas e tamanho; recusado → nenhum");
  console.log("   abrir / baixar  → só o que ela criou; baixar COPIA, o original fica");
  console.log("   cartão          → \"3 páginas · 30 KB\", Abrir e Baixar; cancelar não é erro");
  console.log("   reabrir o app   → o cartão volta do histórico, e continua abrindo");
  console.log("   diário          → parágrafo próprio com o caminho");
})();
