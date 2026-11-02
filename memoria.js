// memoria.js — o cérebro de arquivos .md: processos e fatos que a E.V.E consulta.
//
// A pasta é um cofre do Obsidian (~/Documents/E.V.E). Isso não é detalhe de
// conveniência: é o que torna a memória dela AUDITÁVEL. Quando ela anotar algo
// torto, você abre no Obsidian e corrige — é texto puro, seu, em disco.
//
// A decisão central aqui é o que vai para o prompt. O jeito óbvio — jogar os
// .md todos no contexto — estoura o orçamento: cada arquivo entraria em TODA
// pergunta, três vezes por pergunta. Então o prompt recebe só um ÍNDICE (uma
// linha por documento, "nome — quando usar") e o conteúdo é lido sob demanda,
// pela ferramenta consultar_memoria.
//
// E o índice é DERIVADO dos arquivos, não um arquivo que ela mantém. Índice à
// mão sai de sincronia com a pasta no primeiro dia, e pior: uma nota que você
// escrevesse no Obsidian ficaria invisível para ela. Assim não há sincronia
// para quebrar — a pasta é a verdade.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

/// Onde o Obsidian guarda os cofres que o usuário abriu. Se ele já usa um,
/// a memória dela deve morar LÁ DENTRO — um cofre separado que o Obsidian
/// nunca abre não é um segundo cérebro, é uma pasta solta no disco.
function cofreDoObsidian() {
  try {
    const registro = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "obsidian",
      "obsidian.json"
    );
    const dados = JSON.parse(fs.readFileSync(registro, "utf8"));
    const cofres = Object.values(dados.vaults || {})
      .filter((v) => v?.path && fs.existsSync(v.path))
      // O mais recentemente aberto primeiro: é o que ele usa de verdade.
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return cofres[0]?.path || null;
  } catch {
    return null;
  }
}

/// A pasta da memória, em ordem de preferência:
///   1. o que estiver no config (ele mandou);
///   2. uma subpasta dentro do cofre que ele já usa no Obsidian;
///   3. um cofre próprio em ~/Documents/E.V.E.
///
/// A subpasta importa: as notas dela ficam visíveis no Obsidian que ele já
/// abre, sem se misturar com as notas dele.
function PASTA(configurada) {
  if (process.env.EV_MEMORIA_DIR) return process.env.EV_MEMORIA_DIR;
  if (configurada) return configurada;
  const cofre = cofreDoObsidian();
  if (cofre) return path.join(cofre, "E.V.E");
  return path.join(os.homedir(), "Documents", "E.V.E");
}

const PASTA_ANTIGA = path.join(os.homedir(), "Documents", "E.V.E");

/// Alguma pasta acima desta já é um cofre?
function dentroDeUmCofre(pasta) {
  let atual = path.dirname(path.resolve(pasta));
  const raiz = path.parse(atual).root;
  while (atual && atual !== raiz) {
    if (fs.existsSync(path.join(atual, ".obsidian"))) return true;
    atual = path.dirname(atual);
  }
  return false;
}

// Teto do índice no prompt. Ele viaja em todo pedido, então cresce junto com o
// custo de cada pergunta: ~900 tokens é o que cabe sem desfazer o enxugamento
// das ferramentas. Passando disso, os mais antigos saem e ela é AVISADA de que
// saíram — melhor do que fingir que a memória inteira está à vista.
const TETO_INDICE = 3600; // caracteres (~900 tokens)
const LIMITE_LEITURA = 20_000; // caracteres por documento lido
const MAPA = "MEMORIA.md"; // mapa gerado, para navegar no Obsidian

// Pastas que moram no mesmo cofre mas NÃO são memória. Sem isto, cada skill e
// cada conversa salva entraria no índice que viaja em toda pergunta — e o
// índice tem orçamento (TETO_INDICE). Uma semana de conversas salvas expulsaria
// os fatos dela do próprio contexto.
const FORA_DA_MEMORIA = new Set(["skills", "conversas"]);

/// Nome de arquivo seguro, sem acento e sem espaço, preservando a legibilidade.
function apelido(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "nota";
}

/// Desfaz duas coisas que ela manda por engano e que estragam a nota em
/// silêncio. Nenhuma das duas encolhe o arquivo, então a guarda de perda não
/// vê, e nem ele nem eu notaríamos olhando o tamanho.
///
/// 1. `\n` LITERAL em vez de quebra de linha. Em 02/11, às 18:32, ela gravou a
///    nota do Alelo inteira numa única linha, com os `\n` como dois caracteres
///    — o arquivo CRESCEU de 490 para 1.044 bytes e virou ilegível. Acontece
///    quando ela remonta o texto a partir do JSON sem desescapar.
///
/// 2. O frontmatter do arquivo DENTRO do corpo. A guarda de perda devolve a
///    nota completa, com frontmatter, para ela juntar o acréscimo; ela devolve
///    tudo de volta, e aqui se escreve um frontmatter novo em cima — a nota
///    fica com dois, e o segundo aparece como texto no Obsidian.
function normalizarConteudo(bruto) {
  let texto = String(bruto);

  // Só desescapa quando o `\n` literal é claramente a quebra de linha que
  // falta. Uma nota normal tem muitas quebras e nenhum `\n` escrito; uma que
  // CITA `\n` num trecho de código tem uma ocorrência e muitas quebras.
  const literais = (texto.match(/\\n/g) || []).length;
  const reais = (texto.match(/\n/g) || []).length;
  if (literais > reais) {
    texto = texto.replace(/\\r\\n|\\n/g, "\n").replace(/\\t/g, "\t");
  }

  // O frontmatter que vier no corpo sai: quem escreve o frontmatter é o anotar.
  const { corpo } = lerFrontmatter(texto.trim());
  return corpo.trim();
}

/// Tira o H1 da frente do conteúdo e devolve os dois separados.
///
/// Ela quase sempre escreve um título no começo do conteúdo. Mantendo esse
/// título E acrescentando `# ${nome}` saíam dois H1 — foi o que aconteceu em
/// metade das notas do cofre dele. Aproveitar o dela é melhor que descartar:
/// é um título humano, e o slug não é.
function separarTitulo(conteudo) {
  const m = conteudo.match(/^#{1,2}\s+(.+?)\s*\n+([\s\S]*)$/);
  if (m) return { titulo: m[1].trim(), corpo: m[2].trim() };
  return { titulo: null, corpo: conteudo };
}

/// "uso-e-troca-de-agentes" → "Uso e troca de agentes".
/// Serve de último recurso para o título, quando não há nenhum.
function humanizar(slug) {
  const texto = String(slug).replace(/[-_]+/g, " ").trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : "Nota";
}

/// A seção de links. É o que faz as notas se conversarem no Obsidian — sem ela
/// o cofre é uma pasta com arquivos, e o grafo não mostra nada.
function secaoRelacionado(relacionado, proprioSlug) {
  const itens = [...new Set(
    (Array.isArray(relacionado) ? relacionado : [relacionado])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim().replace(/^\[\[|\]\]$/g, ""))
      // Link para si mesma não é link. Em 02/11 ela pôs
      // [[hortencia-barbosa-leote]] dentro de hortencia-barbosa-leote.md.
      .filter((x) => x.replace(/^(fatos|processos)\//, "") !== proprioSlug)
  )];
  if (!itens.length) return [];
  return ["", "## Relacionado", ...itens.map((i) => `- [[${i}]]`)];
}

/// Lê o frontmatter YAML simples do topo do arquivo (chave: valor).
/// Não usamos biblioteca de YAML: o que precisamos é uma linha por chave, e
/// uma dependência a mais por isso não se paga.
function lerFrontmatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { dados: {}, corpo: texto };
  const dados = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const par = linha.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (par) dados[par[1].toLowerCase()] = par[2].trim().replace(/^["']|["']$/g, "");
  }
  return { dados, corpo: texto.slice(m[0].length) };
}

/// "Quando usar" de um documento. A ordem importa: o frontmatter é o que a
/// E.V.E escreve, mas uma nota que VOCÊ criou no Obsidian não tem frontmatter —
/// nesse caso valem o primeiro título e, por último, o nome do arquivo.
function quandoUsar({ dados, corpo }, nome) {
  if (dados.quando) return dados.quando;
  if (dados.descricao) return dados.descricao;
  const titulo = corpo.match(/^#{1,3}\s+(.+)$/m);
  if (titulo) return titulo[1].trim();
  const primeira = corpo.split(/\r?\n/).find((l) => l.trim());
  return (primeira || nome).trim().slice(0, 120);
}

async function listarArquivos(raiz, relativo = "") {
  const achados = [];
  let itens = [];
  try {
    itens = await fsp.readdir(path.join(raiz, relativo), { withFileTypes: true });
  } catch {
    return achados;
  }
  for (const item of itens) {
    // .obsidian é configuração do editor; .trash é lixeira dele.
    if (item.name.startsWith(".")) continue;
    if (!relativo && item.isDirectory() && FORA_DA_MEMORIA.has(item.name.toLowerCase())) continue;
    const rel = relativo ? path.join(relativo, item.name) : item.name;
    if (item.isDirectory()) {
      achados.push(...(await listarArquivos(raiz, rel)));
    } else if (item.name.endsWith(".md") && item.name !== MAPA) {
      achados.push(rel);
    }
  }
  return achados;
}

class Memoria {
  constructor({ pasta, onDebug } = {}) {
    pasta = pasta || PASTA();
    this.pasta = pasta;
    this.onDebug = onDebug || (() => {});
    this.cache = null;
  }

  /// Cria o cofre na primeira execução, com uma nota explicando o lugar.
  /// A pasta .obsidian existir é o que faz o Obsidian reconhecer isto como
  /// cofre, em vez de pedir "abrir pasta como cofre" na mão.
  async preparar() {
    await this.mudarDeCasa();
    await fsp.mkdir(path.join(this.pasta, "processos"), { recursive: true });
    await fsp.mkdir(path.join(this.pasta, "fatos"), { recursive: true });
    // O .obsidian é o que faz uma pasta ser um cofre — mas só vale na RAIZ.
    // Dentro de um cofre que já existe ele é lixo: um cofre aninhado em outro
    // não abre, só polui a árvore de quem navega no Obsidian.
    if (!dentroDeUmCofre(this.pasta)) {
      await fsp.mkdir(path.join(this.pasta, ".obsidian"), { recursive: true });
      const config = path.join(this.pasta, ".obsidian", "app.json");
      if (!fs.existsSync(config)) await fsp.writeFile(config, "{}\n");
    }

    const leiame = path.join(this.pasta, "fatos", "sobre-esta-pasta.md");
    if (!fs.existsSync(leiame)) {
      await fsp.writeFile(
        leiame,
        [
          "---",
          "quando: ele perguntar como a sua memória funciona",
          "---",
          "",
          "# Sobre esta pasta",
          "",
          "Isto é a memória da E.V.E, e é um cofre do Obsidian.",
          "",
          "Cada arquivo é um processo (como fazer algo) ou um fato (algo que vale lembrar).",
          "O `quando:` no topo é o que a E.V.E lê em toda pergunta para saber que o",
          "documento existe — o conteúdo ela só abre quando precisa.",
          "",
          "Pode escrever notas aqui pelo Obsidian: ela enxerga sozinha, sem sincronizar nada.",
          "Sem `quando:`, o primeiro título do arquivo faz esse papel.",
          "",
        ].join("\n")
      );
      this.onDebug("cofre de memória criado em " + this.pasta);
    }
    // Gera o mapa já na preparação: quem abrir o cofre no Obsidian pela
    // primeira vez encontra uma porta de entrada em vez de uma pasta crua.
    await this.gerarMapa();
  }

  /// A memória já morou em ~/Documents/E.V.E, fora do Obsidian. Se ela mudou
  /// de lugar, as anotações vão junto — perder memória numa mudança de pasta
  /// seria a pior maneira de "melhorar" isso. A pasta antiga fica onde está:
  /// apagar dado do usuário por conta própria não é mudança, é descuido.
  async mudarDeCasa() {
    if (this.pasta === PASTA_ANTIGA) return;
    if (!fs.existsSync(PASTA_ANTIGA)) return;
    const jaTem = await listarArquivos(this.pasta);
    if (jaTem.length) return; // destino já em uso: não mexe

    const antigos = await listarArquivos(PASTA_ANTIGA);
    if (!antigos.length) return;
    for (const rel of antigos) {
      const destino = path.join(this.pasta, rel);
      await fsp.mkdir(path.dirname(destino), { recursive: true });
      await fsp.copyFile(path.join(PASTA_ANTIGA, rel), destino);
    }
    this.onDebug(
      `memória mudou de ${PASTA_ANTIGA} para ${this.pasta} (${antigos.length} documento(s) copiados; a pasta antiga continua lá)`
    );
  }

  /// Índice de tudo que existe, para entrar no prompt.
  /// Relê quando a pasta muda — reler 30 arquivos pequenos custa milissegundos,
  /// e o cache aqui serve para não fazer isso a cada pergunta.
  async indice() {
    const arquivos = await listarArquivos(this.pasta);
    const assinatura = arquivos.join("|");
    let marca = "";
    for (const rel of arquivos) {
      try {
        marca += (await fsp.stat(path.join(this.pasta, rel))).mtimeMs + ",";
      } catch {}
    }
    if (this.cache?.assinatura === assinatura && this.cache?.marca === marca) {
      return this.cache.itens;
    }

    const itens = [];
    for (const rel of arquivos) {
      try {
        const bruto = await fsp.readFile(path.join(this.pasta, rel), "utf8");
        const partes = lerFrontmatter(bruto);
        const nome = rel.replace(/\.md$/, "");
        itens.push({ nome, quando: quandoUsar(partes, path.basename(nome)) });
      } catch {}
    }
    itens.sort((a, b) => a.nome.localeCompare(b.nome));
    this.cache = { assinatura, marca, itens };
    return itens;
  }

  /// As linhas do índice já cortadas no orçamento. Devolve também quantas
  /// ficaram de fora, para ela poder dizer a verdade em vez de supor.
  async paraPrompt() {
    const itens = await this.indice();
    const linhas = [];
    let tamanho = 0;
    for (const item of itens) {
      const linha = `- ${item.nome} — ${item.quando}`;
      if (tamanho + linha.length > TETO_INDICE) break;
      linhas.push(linha);
      tamanho += linha.length + 1;
    }
    return { linhas, total: itens.length, cortados: itens.length - linhas.length };
  }

  /// Lê um documento. Aceita o nome com ou sem pasta e com ou sem .md, porque
  /// o modelo vai errar isso — e errar aqui não pode virar "não encontrei".
  async consultar(nome) {
    const pedido = (nome || "").trim().replace(/\.md$/, "");
    if (!pedido) return { erro: "diga qual documento" };

    const itens = await this.indice();
    const alvo =
      itens.find((i) => i.nome === pedido) ||
      itens.find((i) => path.basename(i.nome) === path.basename(pedido)) ||
      itens.find((i) => i.nome.toLowerCase().includes(pedido.toLowerCase()));

    if (!alvo) {
      return {
        erro: `não existe "${pedido}" na memória`,
        disponiveis: itens.map((i) => i.nome).slice(0, 30),
      };
    }

    const bruto = await fsp.readFile(path.join(this.pasta, alvo.nome + ".md"), "utf8");
    const { dados, corpo } = lerFrontmatter(bruto);
    return {
      nome: alvo.nome,
      quando: dados.quando || alvo.quando,
      conteudo: corpo.trim().slice(0, LIMITE_LEITURA),
      truncado: corpo.length > LIMITE_LEITURA || undefined,
    };
  }

  /// Escreve ou atualiza um documento.
  /// Sobrescrever guarda .bak: uma memória apagada por engano é pior que um
  /// arquivo apagado por engano, porque ela some sem ninguém notar na hora.
  /// Grava uma nota no cofre, num formato só.
  ///
  /// O que estava torto antes, e dá para ver no cofre dele:
  ///
  ///   # fatos-perfil-matheus-atualizacao     ← slug como título
  ///   # Atualizações de perfil - Matheus     ← e o título de verdade embaixo
  ///
  /// Dois H1 no mesmo arquivo, porque esta função escrevia `# ${nome}` e ela
  /// também escrevia um título no conteúdo. E o nome carregava o nome da pasta
  /// de novo (`fatos/fatos-perfil-matheus`), o que no Obsidian lê como gagueira.
  ///
  /// Agora: um H1, humano; o slug não repete a pasta; e a nota pode apontar
  /// para outras com [[link]], que é o que faz o cofre virar um cofre em vez de
  /// quinze arquivos soltos.
  async anotar({ nome, titulo, quando, conteudo, pasta = "processos", relacionado } = {}) {
    if (!nome?.trim()) return { erro: "a nota precisa de nome" };
    if (!conteudo?.trim()) return { erro: "a nota precisa de conteúdo" };

    // Antes de qualquer medida: o texto limpo. A guarda de perda compara
    // tamanhos, e o `\n` literal INFLA o tamanho — o blob de uma linha que
    // estragou a nota do Alelo passou pela guarda justamente por ser maior.
    conteudo = normalizarConteudo(conteudo);
    if (!conteudo) return { erro: "a nota precisa de conteúdo" };

    const subpasta = /^fatos/i.test(pasta) ? "fatos" : "processos";
    // O nome não repete a pasta: "fatos/fatos-perfil" vira "fatos/perfil".
    const slug = apelido(String(nome).replace(new RegExp(`^${subpasta}[-/\\s]+`, "i"), ""));
    const arquivo = path.join(subpasta, slug + ".md");
    const caminho = path.join(this.pasta, arquivo);
    await fsp.mkdir(path.dirname(caminho), { recursive: true });

    // SUBSTITUIR UMA NOTA GRANDE POR UM PEDAÇO DELA NÃO PASSA.
    //
    // 02/11: ela leu `hortencia-barbosa-leote` (3.106 bytes, o perfil acadêmico
    // inteiro, tirado de um PDF dele), e depois gravou uma atualização de 809
    // bytes com o MESMO nome. O backup salvou, mas nem ele nem eu teríamos
    // notado — a nota simplesmente perdeu dois terços.
    //
    // A recusa devolve o conteúdo atual junto. Assim ela não precisa de outra
    // rodada para descobrir o que apagaria: já tem o texto em mãos para juntar
    // com o acréscimo e gravar de uma vez.
    let anterior = null;
    if (fs.existsSync(caminho)) {
      anterior = await fsp.readFile(caminho, "utf8");
      const vaiVirar = conteudo.trim().length;
      const era = anterior.replace(/^---[\s\S]*?---\n/, "").trim().length;
      if (era > 500 && vaiVirar < era * 0.5) {
        return {
          erro:
            `a nota "${arquivo}" tem ${era} caracteres e você mandou ${vaiVirar}: isso APAGA ` +
            "mais da metade dela. Se é um acréscimo, chame anotar_memoria DE NOVO com o " +
            "texto abaixo mais o seu acréscimo — não use write_file, que não escreve no cofre. " +
            "O conteúdo atual segue aqui.",
          conteudo_atual: anterior,
        };
      }
    }

    let backup;
    if (anterior !== null) {
      backup = caminho + ".bak";
      await fsp.copyFile(caminho, backup);
    }

    const { titulo: tituloDoCorpo, corpo } = separarTitulo(conteudo.trim());
    const cabeca = (titulo || tituloDoCorpo || humanizar(slug)).trim();

    const texto = [
      "---",
      `quando: ${(quando || nome).replace(/\n/g, " ").trim()}`,
      `atualizado: ${new Date().toISOString().slice(0, 10)}`,
      `tags: [${subpasta === "fatos" ? "fato" : "processo"}]`,
      "---",
      "",
      `# ${cabeca}`,
      "",
      corpo,
      ...secaoRelacionado(relacionado, slug),
      "",
    ].join("\n");

    await fsp.writeFile(caminho, texto);
    this.cache = null;
    await this.gerarMapa();
    this.onDebug(`memória anotada: ${arquivo}${backup ? " (com backup)" : ""}`);
    return {
      ok: true,
      nome: arquivo.replace(/\.md$/, ""),
      titulo: cabeca,
      backup: backup ? path.basename(backup) : undefined,
    };
  }

  /// Mapa com links do Obsidian, para VOCÊ navegar. É gerado, não é a verdade:
  /// a verdade são os arquivos. Por isso o aviso no topo.
  async gerarMapa() {
    try {
      const itens = await this.indice();
      const linhas = [
        "---",
        "quando: nunca — este arquivo é gerado automaticamente",
        "---",
        "",
        "# Memória da E.V.E",
        "",
        `*Gerado automaticamente. ${itens.length} documento(s). Editar aqui não muda nada —`,
        "o que vale é o `quando:` dentro de cada arquivo.*",
        "",
      ];
      for (const grupo of ["processos", "fatos"]) {
        const doGrupo = itens.filter((i) => i.nome.startsWith(grupo + "/"));
        if (!doGrupo.length) continue;
        linhas.push(`## ${grupo}`, "");
        for (const i of doGrupo) linhas.push(`- [[${i.nome}]] — ${i.quando}`);
        linhas.push("");
      }
      const soltos = itens.filter((i) => !i.nome.includes("/"));
      if (soltos.length) {
        linhas.push("## soltos", "");
        for (const i of soltos) linhas.push(`- [[${i.nome}]] — ${i.quando}`);
      }
      await fsp.writeFile(path.join(this.pasta, MAPA), linhas.join("\n") + "\n");
    } catch (err) {
      this.onDebug("não consegui gerar o mapa: " + err.message);
    }
  }
}

module.exports = {
  Memoria,
  apelido,
  lerFrontmatter,
  quandoUsar,
  PASTA,
  cofreDoObsidian,
  TETO_INDICE,
  FORA_DA_MEMORIA,
};
