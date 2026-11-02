// formato.test.js — a resposta dela com FORMA, sem abrir navegador.
//
// Pedido dele em 02/11: "mesmo que sendo tudo em uma bolha só, mas o que tiver
// que quebrar parágrafo que seja assim, para não ficar tudo em um texto só".
//
// O que importa aqui: o separador de falas preservar a quebra que ela escreveu,
// e o renderizador virar isso em parágrafo, lista, título e bloco de código.
// Testar isso lendo o código-fonte diria que as regex existem; só rodar diz que
// a estrutura sai certa. Então aqui há um DOM de mentira, pequeno e suficiente.
// Rode com: node test/formato.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// --------------------------------------------------------------- DOM falso
class No {
  constructor(tag) {
    this.tagName = (tag || "").toUpperCase();
    this.filhos = [];
    this.className = "";
    this._texto = "";
    this.dataset = {};
  }
  appendChild(f) {
    this.filhos.push(f);
    return f;
  }
  set textContent(v) {
    this._texto = String(v);
    this.filhos = [];
  }
  get textContent() {
    return this.filhos.length ? this.filhos.map((f) => f.textContent).join("") : this._texto;
  }
  /// Só o que o renderizador usa.
  querySelector() {
    return null;
  }
  /// Ajudantes do teste.
  porTag(tag) {
    const alvo = tag.toUpperCase();
    const achados = this.tagName === alvo ? [this] : [];
    for (const f of this.filhos) if (f.porTag) achados.push(...f.porTag(tag));
    return achados;
  }
  porClasse(c) {
    const achados = String(this.className).split(/\s+/).includes(c) ? [this] : [];
    for (const f of this.filhos) if (f.porClasse) achados.push(...f.porClasse(c));
    return achados;
  }
}

const doc = {
  createElement: (t) => new No(t),
  createTextNode: (t) => ({ textContent: String(t), tagName: "#texto" }),
};

// Carrega só as funções de formatação do interface.js, sem o resto do arquivo
// (que fala com o preload e com o DOM de verdade na carga).
const fonte = fs.readFileSync(path.join(__dirname, "..", "renderer", "interface.js"), "utf8");
function extrair(nome) {
  const i = fonte.indexOf(`function ${nome}(`);
  assert.ok(i >= 0, `não achei a função ${nome} no interface.js`);
  // Conta chaves até fechar a função.
  let nivel = 0;
  let j = fonte.indexOf("{", i);
  const inicio = j;
  for (; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}") {
      nivel--;
      if (nivel === 0) break;
    }
  }
  return fonte.slice(i, j + 1);
}

const { escrever, juntarFragmentos } = new Function(
  "document",
  `${extrair("escreverLinha")}\n${extrair("escrever")}\n${extrair("juntarFragmentos")}
   return { escrever, juntarFragmentos };`
)(doc);

// ------------------------------------------- 1. parágrafos de verdade
{
  const el = new No("span");
  escrever(el, "Primeiro parágrafo.\n\nSegundo parágrafo.");
  const ps = el.porClasse("md-p");
  assert.strictEqual(ps.length, 2, `dois parágrafos, não ${ps.length} — era este o pedido dele`);
  assert.strictEqual(ps[0].textContent, "Primeiro parágrafo.");
  assert.strictEqual(ps[1].textContent, "Segundo parágrafo.");
}

// ------------------------------------------- 2. quebra simples vira <br>
{
  const el = new No("span");
  escrever(el, "linha um\nlinha dois");
  assert.strictEqual(el.porClasse("md-p").length, 1, "uma quebra só não abre parágrafo novo");
  assert.strictEqual(el.porTag("br").length, 1, "mas tem de virar quebra de linha");
}

// ------------------------------------------- 3. listas
{
  const el = new No("span");
  escrever(el, "Avisos:\n\n- 6 de novembro, 9h — UEL\n- 8 de novembro, 9h — ENEM\n\nÉ isso.");
  const uls = el.porTag("ul");
  assert.strictEqual(uls.length, 1, "os dois itens entram na MESMA lista");
  assert.strictEqual(uls[0].porTag("li").length, 2);
  assert.match(uls[0].porTag("li")[0].textContent, /6 de novembro/);
  assert.strictEqual(el.porClasse("md-p").length, 2, "o texto antes e depois continua parágrafo");

  const num = new No("span");
  escrever(num, "1. primeiro\n2. segundo\n3. terceiro");
  assert.strictEqual(num.porTag("ol").length, 1, "lista numerada vira <ol>");
  assert.strictEqual(num.porTag("ol")[0].porTag("li").length, 3);
  assert.strictEqual(num.porTag("ul").length, 0, "e não <ul>");
}

// ------------------------------------------- 4. título e bloco de código
{
  const el = new No("span");
  escrever(el, "## Resumo\n\ntexto\n\n```bash\nnpm test\n```");
  assert.strictEqual(el.porClasse("md-titulo").length, 1, "título vira linha de destaque");
  assert.strictEqual(el.porClasse("md-titulo")[0].textContent, "Resumo");
  const pre = el.porTag("pre");
  assert.strictEqual(pre.length, 1, "bloco cercado por ``` vira <pre>");
  assert.strictEqual(pre[0].textContent, "npm test", "e o conteúdo sai sem a cerca");
}

// ------------------------------------------- 5. negrito, código e link
{
  const el = new No("span");
  escrever(el, "Isto é **importante** e fica em `~/EV`. Veja [o repo](https://exemplo.com).");
  assert.strictEqual(el.porTag("b").length, 1);
  assert.strictEqual(el.porTag("b")[0].textContent, "importante");
  assert.strictEqual(el.porTag("code").length, 1);
  assert.strictEqual(el.porTag("code")[0].textContent, "~/EV");
  const a = el.porTag("a");
  assert.strictEqual(a.length, 1, "link vira <a>");
  assert.strictEqual(a[0].dataset.url, "https://exemplo.com", "com a url no dataset, não no href");
  assert.strictEqual(a[0].textContent, "o repo");
}

// ------------------------------------------- 6. redesenhar não duplica
// A bolha é redesenhada a cada fragmento; se escrever ACUMULASSE no elemento,
// a resposta apareceria repetida e crescendo.
{
  const el = new No("span");
  escrever(el, "Um parágrafo.");
  escrever(el, "Um parágrafo.");
  assert.strictEqual(el.porClasse("md-p").length, 1, "redesenhar tem de limpar antes");
}

// ------------------------------------------- 7. a cola entre fragmentos
// O separador devolve a quebra no fim do fragmento quando ela escreveu uma, e
// nada quando o corte foi só fim de frase. É isso que separa "dois parágrafos"
// de "duas frases do mesmo parágrafo".
{
  assert.strictEqual(juntarFragmentos("", "abc"), "abc");
  assert.strictEqual(juntarFragmentos("Frase um.", "Frase dois."), "Frase um. Frase dois.");
  assert.strictEqual(juntarFragmentos("Título:\n\n", "- item"), "Título:\n\n- item");
  assert.strictEqual(juntarFragmentos("- item um\n", "- item dois"), "- item um\n- item dois");
}

// ------------------------------------------- 8. o caminho completo
// Do separador de falas até o DOM, como acontece de verdade: os fragmentos
// saem do criarFalante e a bolha é remontada com eles.
{
  const { criarFalante } = require("../brains.js");
  const fragmentos = [];
  const f = criarFalante((t) => fragmentos.push(t));
  f.engolir("Aqui estão os seus avisos de novembro:\n\n");
  f.engolir("- 6 de novembro, 9h — resultado da UEL\n");
  f.engolir("- 8 de novembro, 9h — ENEM\n\n");
  f.engolir("Quer que eu mude algum horário? ");
  f.fechar();

  let cru = "";
  for (const frag of fragmentos) cru = juntarFragmentos(cru, frag);
  const el = new No("span");
  escrever(el, cru);

  assert.strictEqual(el.porTag("ul").length, 1, "a lista tem de sobreviver ao fatiamento da fala");
  assert.strictEqual(el.porTag("ul")[0].porTag("li").length, 2, "com os dois itens");
  assert.strictEqual(el.porClasse("md-p").length, 2, "e os dois parágrafos em volta");
  // E o horário não pode ter sido cortado no meio.
  assert.match(el.textContent, /9h/);
  assert.doesNotMatch(el.textContent, /\d:\s|\s\d{2}\s—/, "número cortado ao meio");

  console.log("✓ formato da resposta: parágrafo, lista, título, código e link");
  console.log("   fragmentos da fala:", fragmentos.length, "→ 1 bolha com", el.filhos.length, "blocos");
  console.log("   parágrafos:", el.porClasse("md-p").length, "· listas:", el.porTag("ul").length,
    "· itens:", el.porTag("li").length);
}
