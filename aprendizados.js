// aprendizados.js — a Sexta-Feira aprende com os erros dela.
//
// Pedido dele em 25/11/2026: "que ela possa aprender com os erros, atualizar
// no cérebro dela para não cometer mais o mesmo erro e sempre fazer do jeito
// certo".
//
// Aprender tem duas metades, e cada uma mora num lugar diferente:
//
// 1. O QUE DEU ERRADO é fato, e fato quem registra é o CÓDIGO. Toda ferramenta
//    que volta com erro entra em `aprendizados/erros-de-ferramenta.md`, com
//    quantas vezes aconteceu. Depender de o modelo lembrar de anotar o próprio
//    erro é o mesmo que não anotar.
//
// 2. QUAL É O JEITO CERTO é julgamento, e esse é dela: quando ele a corrige,
//    ela grava uma nota em `aprendizados/` pelo anotar_memoria (o que errou, por
//    quê, o certo). O código só ajuda percebendo que a fala dele PARECE uma
//    correção e avisando no prompt daquele turno.
//
// As duas metades voltam no prompt de TODA pergunta, num bloco curto: lição
// que só existe no disco não muda comportamento nenhum.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PASTA = "aprendizados";
const ARQUIVO_ERROS = "erros-de-ferramenta.md";
const ESTADO = ".erros.json"; // o Obsidian ignora arquivo com ponto na frente
const TETO_LICOES = 1_400; // caracteres das lições no prompt (~350 tokens)
const TETO_ERROS = 500;
const MAX_ERROS = 40;

/// "erro 429 em 3.2s para /Users/x/a.pdf" e "erro 429 em 1.1s para /b.pdf" são
/// o mesmo erro. Números e caminhos saem da chave, senão nada se repete nunca.
function assinatura(ferramenta, erro) {
  const texto = String(erro || "")
    .toLowerCase()
    .replace(/(?:~|\/)[^\s"'`]+/g, "<caminho>")
    .replace(/\d+(?:[.,]\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return `${ferramenta}: ${texto}`;
}

/// A fala dele parece uma correção? Não precisa acertar sempre: o custo de um
/// falso positivo é uma linha a mais no prompt daquele turno.
/// "para de" só conta seguido de verbo ("para de inventar"): em 25/11/2026
/// "mover ele para dentro de arquivos" casava pelo "para de" de "para dentro".
const CORRECAO =
  /(?:^|[\s,.!])(?:n[ãa]o\s+(?:[ée]\s+(?:isso|assim)|era\s+(?:isso|assim|pra)|foi\s+isso|t[áa]\s+certo)|errad[oa]|errou|de novo n[ãa]o|outra vez n[ãa]o|eu (?:te )?(?:disse|falei|pedi) (?:que|pra|para)|j[áa] (?:te )?(?:disse|falei|expliquei)|t[áa] errado|n[ãa]o fa[çc]a mais|nunca mais (?:fa[çc]a|fale)|pa(?:ra|re) de\s+\p{L}+(?:ar|er|ir|ndo)\b|o certo [ée]|na verdade [ée])/iu;

function pareceCorrecao(texto) {
  return CORRECAO.test(String(texto || ""));
}

function lerFrontmatter(texto) {
  const m = String(texto).match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { dados: {}, corpo: String(texto) };
  const dados = {};
  for (const linha of m[1].split("\n")) {
    const kv = linha.match(/^(\w+):\s*(.*)$/);
    if (kv) dados[kv[1]] = kv[2].trim();
  }
  return { dados, corpo: String(texto).slice(m[0].length) };
}

/// A lição em uma linha: o título e a primeira frase que diz o jeito certo.
/// A nota inteira continua no cofre; no prompt vai só o que muda a conduta.
function resumoDaLicao(conteudo, nome) {
  const { dados, corpo } = lerFrontmatter(conteudo);
  const titulo = (corpo.match(/^#\s+(.+)$/m)?.[1] || nome).trim();
  // "Jeito certo:" manda. Antes um "o certo" solto também valia, e a lição
  // que citava a frase errada dela ("Tudo certo. Removi…") virava o resumo
  // dela mesma — o oposto da lição (25/11/2026).
  const certo =
    corpo.match(/jeito certo[^:\n]*:\s*(.+)/i)?.[1] ||
    corpo.match(/(?:fazer assim|regra)[^:\n]*:\s*(.+)/i)?.[1] ||
    corpo
      .replace(/^#.*$/gm, "")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .find((p) => p && !/^(relacionado|ligações)/i.test(p)) ||
    "";
  const quando = dados.quando && !/^nunca/i.test(dados.quando) ? ` (quando: ${dados.quando})` : "";
  return `- ${titulo}${quando}: ${certo.replace(/\s+/g, " ").slice(0, 380)}`.trim();
}

class Aprendizados {
  constructor({ pasta, onDebug } = {}) {
    // `pasta` é a pasta da memória; os aprendizados moram numa subpasta dela,
    // para o Obsidian enxergar tudo como um cérebro só.
    this.raiz = pasta;
    this.pasta = pasta ? path.join(pasta, PASTA) : null;
    this.onDebug = onDebug || (() => {});
    this.fila = Promise.resolve();
  }

  lerEstado() {
    try {
      const e = JSON.parse(fs.readFileSync(path.join(this.pasta, ESTADO), "utf8"));
      return Array.isArray(e) ? e : [];
    } catch {
      return [];
    }
  }

  /// Uma ferramenta voltou com erro. Grava (ou soma, se já aconteceu) e
  /// reescreve a nota legível. Em fila: duas falhas no mesmo turno não podem
  /// se sobrescrever.
  registrarFalha({ ferramenta, erro, pedido, agora = new Date() } = {}) {
    if (!this.pasta || !ferramenta || !erro) return Promise.resolve(null);
    const tarefa = async () => {
      await fsp.mkdir(this.pasta, { recursive: true });
      const estado = this.lerEstado();
      const chave = assinatura(ferramenta, erro);
      let item = estado.find((e) => e.chave === chave);
      if (item?.resolvido) {
        // Voltou a falhar depois de corrigido: a conta recomeça do zero.
        delete item.resolvido;
        delete item.nota;
        item.vezes = 1;
        item.ultima = agora.toISOString();
        item.erro = String(erro).slice(0, 240);
      } else if (item) {
        item.vezes++;
        item.ultima = agora.toISOString();
        item.erro = String(erro).slice(0, 240);
        if (pedido) item.pedido = String(pedido).slice(0, 160);
      } else {
        item = {
          chave,
          ferramenta,
          erro: String(erro).slice(0, 240),
          pedido: pedido ? String(pedido).slice(0, 160) : "",
          vezes: 1,
          primeira: agora.toISOString(),
          ultima: agora.toISOString(),
        };
        estado.push(item);
      }
      estado.sort((a, b) => b.ultima.localeCompare(a.ultima));
      const guardado = estado.slice(0, MAX_ERROS);
      await fsp.writeFile(path.join(this.pasta, ESTADO), JSON.stringify(guardado, null, 1));
      await fsp.writeFile(path.join(this.pasta, ARQUIVO_ERROS), this.markdownDosErros(guardado));
      this.onDebug(`aprendizado: falha de ${ferramenta} registrada (${item.vezes}×)`);
      return item;
    };
    this.fila = this.fila.then(tarefa, tarefa);
    return this.fila.catch((err) => {
      this.onDebug("aprendizado: não consegui registrar a falha: " + err.message);
      return null;
    });
  }

  /// A causa de uma falha foi corrigida no CÓDIGO (não foi erro dela): sai dos
  /// alertas do prompt, para ela não evitar uma ferramenta que já funciona.
  /// Fica no diário, marcada — é história, e história não se apaga.
  async marcarResolvido(ferramenta, nota = "") {
    if (!this.pasta) return 0;
    const estado = this.lerEstado();
    let n = 0;
    for (const e of estado) {
      if (e.ferramenta !== ferramenta || e.resolvido) continue;
      e.resolvido = new Date().toISOString();
      e.nota = nota;
      n++;
    }
    if (n) {
      await fsp.mkdir(this.pasta, { recursive: true });
      await fsp.writeFile(path.join(this.pasta, ESTADO), JSON.stringify(estado, null, 1));
      await fsp.writeFile(path.join(this.pasta, ARQUIVO_ERROS), this.markdownDosErros(estado));
    }
    return n;
  }

  markdownDosErros(estado) {
    const linhas = [
      "---",
      // Não entra no índice da memória: este arquivo é o diário, e o que vale
      // dele já vai no bloco de aprendizados do prompt.
      "quando: nunca — diário gerado automaticamente",
      "tags: [aprendizado, erros]",
      "---",
      "",
      "# Erros de ferramenta",
      "",
      "*Gerado automaticamente a cada ferramenta que falha. O que se repete vira aviso no",
      "contexto dela. As lições — o jeito certo — ficam nas outras notas desta pasta.*",
      "",
      "Ver também: [[APRENDIZADOS]] · [[CEREBRO]]",
      "",
    ];
    for (const e of estado) {
      const d = e.ultima.slice(0, 10).split("-").reverse().join("/");
      linhas.push(
        `## ${e.ferramenta} · ${e.vezes}× · último em ${d}`,
        "",
        `- **Erro:** ${e.erro}`,
        ...(e.pedido ? [`- **Pedido:** ${e.pedido}`] : []),
        ...(e.resolvido ? [`- **resolvido: ${e.nota || "corrigido no código"}** (${e.resolvido.slice(0, 10).split("-").reverse().join("/")})`] : []),
        ""
      );
    }
    return linhas.join("\n");
  }

  /// As lições que ela escreveu (notas em aprendizados/, menos o diário).
  async licoes() {
    if (!this.pasta || !fs.existsSync(this.pasta)) return [];
    const nomes = (await fsp.readdir(this.pasta))
      .filter((f) => f.endsWith(".md") && f !== ARQUIVO_ERROS && f !== "APRENDIZADOS.md")
      .sort();
    const saida = [];
    for (const f of nomes) {
      try {
        const caminho = path.join(this.pasta, f);
        const [texto, info] = await Promise.all([fsp.readFile(caminho, "utf8"), fsp.stat(caminho)]);
        saida.push({ nome: `${PASTA}/${f.replace(/\.md$/, "")}`, resumo: resumoDaLicao(texto, f), mtime: info.mtimeMs });
      } catch {}
    }
    // A mais nova primeiro: se o orçamento cortar, corta a mais antiga.
    return saida.sort((a, b) => b.mtime - a.mtime);
  }

  /// O bloco do prompt. `linhas` são as lições; `alertas`, os erros que já se
  /// repetiram (uma vez só pode ter sido azar; duas é padrão).
  async paraPrompt() {
    const linhas = [];
    let resta = TETO_LICOES;
    for (const l of await this.licoes()) {
      if (l.resumo.length > resta) break;
      resta -= l.resumo.length;
      linhas.push(l.resumo);
    }
    const alertas = [];
    let restaErros = TETO_ERROS;
    for (const e of this.lerEstado().filter((x) => x.vezes >= 2 && !x.resolvido).slice(0, 6)) {
      const linha = `- ${e.ferramenta} falhou ${e.vezes}×: ${e.erro.replace(/\s+/g, " ").slice(0, 110)}`;
      if (linha.length > restaErros) break;
      restaErros -= linha.length;
      alertas.push(linha);
    }
    return { linhas, alertas };
  }

  /// O índice dos aprendizados, para o Obsidian.
  async gerarMapa() {
    if (!this.pasta) return;
    try {
      await fsp.mkdir(this.pasta, { recursive: true });
      const licoes = await this.licoes();
      const linhas = [
        "---",
        "quando: nunca — este arquivo é gerado automaticamente",
        "tags: [indice, aprendizado]",
        "---",
        "",
        "# Aprendizados",
        "",
        "*O que ela errou e o jeito certo. Cada nota daqui volta no contexto dela em toda pergunta.*",
        "",
        "Ver também: [[CEREBRO]] · [[erros-de-ferramenta]]",
        "",
        ...licoes.map((l) => `- [[${l.nome}]]`),
        "",
      ];
      await fsp.writeFile(path.join(this.pasta, "APRENDIZADOS.md"), linhas.join("\n"));
    } catch (err) {
      this.onDebug("aprendizado: não consegui gerar o índice: " + err.message);
    }
  }
}

/// A nota central do cérebro no Obsidian: liga memória, aprendizados,
/// conversas e skills. É o que faz o grafo do Obsidian mostrar UMA rede, em
/// vez de quatro pastas soltas.
async function gerarCerebro(raiz, { nome = "Sexta-Feira" } = {}) {
  if (!raiz) return;
  const linhas = [
    "---",
    "quando: nunca — este arquivo é gerado automaticamente",
    "tags: [cerebro]",
    "---",
    "",
    `# Cérebro da ${nome}`,
    "",
    "Tudo aqui se liga: cada conversa aponta para as notas que ela usou e para o que",
    "aprendeu nela; cada aprendizado aponta para a nota do assunto. Abra o **grafo** do",
    "Obsidian nesta pasta para ver a rede.",
    "",
    "- [[MEMORIA]] — o que ela sabe (processos e fatos)",
    "- [[APRENDIZADOS]] — os erros e o jeito certo",
    "- [[CONVERSAS]] — o diário de cada conversa",
    "- [[Skills/_como-criar-uma-skill|Skills]] — os comandos que você criou",
    "",
  ];
  try {
    await fsp.writeFile(path.join(raiz, "CEREBRO.md"), linhas.join("\n"));
  } catch {}
}

module.exports = {
  Aprendizados,
  assinatura,
  pareceCorrecao,
  resumoDaLicao,
  gerarCerebro,
  PASTA_APRENDIZADOS: PASTA,
  TETO_LICOES,
};
