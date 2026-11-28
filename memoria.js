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
/// A E.V.E virou Sexta-Feira em 25/11/2026, e a pasta do cofre foi junto.
/// A antiga é MOVIDA (não copiada) na primeira abertura: ver mudarDeNome.
const NOME_DA_PASTA = "Sexta-Feira";
const NOME_ANTIGO = "E.V.E";

function PASTA(configurada) {
  if (process.env.EV_MEMORIA_DIR) return process.env.EV_MEMORIA_DIR;
  if (configurada) return configurada;
  const cofre = cofreDoObsidian();
  if (cofre) return path.join(cofre, NOME_DA_PASTA);
  return path.join(os.homedir(), "Documents", NOME_DA_PASTA);
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
// "rede": o diário da rede neural (cerebroRede.js) cresce todo dia e não pode
// entrar no índice que viaja em toda pergunta.
const FORA_DA_MEMORIA = new Set(["skills", "conversas", "gastos", "rede"]);

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
/// o cofre é uma pasta com arquivos, e o grafo não mostra nada. Recebe nomes
/// já resolvidos (`fatos/x`), e escreve sempre com a pasta: em 02/11 o cofre
/// tinha `[[perfil-matheus]]` numa nota e `[[fatos/perfil-matheus]]` na
/// outra, e ninguém sabia dizer qual era o certo.
function secaoRelacionado(relacionado, proprioSlug) {
  const itens = [...new Set(
    (Array.isArray(relacionado) ? relacionado : [relacionado])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => limparLink(x))
      // Link para si mesma não é link. Em 02/11 ela pôs
      // [[hortencia-barbosa-leote]] dentro de hortencia-barbosa-leote.md.
      .filter((x) => path.basename(x) !== proprioSlug)
  )];
  if (!itens.length) return [];
  return ["", "## Relacionado", ...itens.map((i) => `- [[${i}]]`)];
}

/// "[[fatos/x|apelido]]", "[[x#seção]]", "x.md" → "fatos/x" ou "x".
function limparLink(bruto) {
  return String(bruto).trim()
    .replace(/^\[\[|\]\]$/g, "")
    .split("|")[0].split("#")[0]
    .replace(/\.md$/, "")
    .trim();
}

/// Tira a seção "## Relacionado" do corpo e devolve os links que estavam nela.
///
/// Ela escreve essa seção no conteúdo E manda `relacionado` — saíam duas
/// seções iguais no fim da nota. Agora a seção é uma só, e quem a escreve é o
/// anotar, juntando as duas fontes.
function extrairRelacionado(corpo) {
  const m = corpo.match(/(^|\n)#{2,3}\s+Relacionad[oa]s?\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i);
  if (!m) return { corpo, links: [] };
  const links = [...m[2].matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => limparLink(x[1]));
  return { corpo: (corpo.slice(0, m.index) + corpo.slice(m.index + m[0].length)).trim(), links };
}

/// Um link aponta para uma nota que EXISTE? Devolve o nome com pasta, ou null.
/// Link para nota que não existe vira nó fantasma no grafo do Obsidian — e
/// quase sempre é o modelo errando o nome de uma que existe.
function resolverLink(link, itens) {
  const pedido = limparLink(link).toLowerCase();
  if (!pedido) return null;
  const base = path.basename(pedido);
  const alvo =
    itens.find((i) => i.nome.toLowerCase() === pedido) ||
    itens.find((i) => path.basename(i.nome).toLowerCase() === base) ||
    itens.find((i) => path.basename(i.nome).toLowerCase() === apelido(base));
  return alvo ? alvo.nome : null;
}

// Quanto texto de notas entra sozinho no prompt a cada pergunta. É caro: vai
// em todo pedido daquele turno. 3.000 caracteres são ~750 tokens — cabe a
// nota de finanças inteira e um pedaço de outra.
const TETO_NOTAS_ABERTAS = 3_000;

// Palavras que aparecem em qualquer pergunta e não dizem o assunto.
const VAZIAS = new Set(
  ("aqui agora ainda algo alguma algum assim aquele aquela cada coisa como comigo " +
    "consegue contigo depois desde disso disto entao esse essa esta este estou estava " +
    "fazer fale falar fala gente hoje isso isto mais mesmo minha minhas muito nada " +
    "nossa nosso onde ontem outro outra para pela pelo pode porque porfavor pois pouco " +
    "quando quanto quantos quero qual quem sabe sempre seja seus suas sobre tambem " +
    "tenho tem tinha todo toda tudo voce vamos vai vou voces amanha favor dela dele " +
    "deles elas eles pfv voltar sera seria").split(" ")
);

/// "Fatura do Nubank, quanto vai sobrar?" → ["fatu", "nuba", "sobr"]. Raiz de 4
/// letras porque "gastei", "gastou" e "gastos" têm de cair na mesma.
function raizesDe(texto) {
  return [...new Set(
    String(texto || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .match(/[a-z0-9]+/g) || []
  )]
    .filter((p) => p.length >= 4 && !VAZIAS.has(p))
    .map((p) => p.slice(0, 4));
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
    await this.mudarDeNome();
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
          "Isto é a memória da Sexta-Feira, e é um cofre do Obsidian.",
          "",
          "Cada arquivo é um processo (como fazer algo) ou um fato (algo que vale lembrar).",
          "O `quando:` no topo é o que a Sexta-Feira lê em toda pergunta para saber que o",
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

  /// O cofre dela se chamava "E.V.E" até 25/11/2026. Se a pasta nova ainda não
  /// existe e a antiga está ao lado, ela é RENOMEADA: mover não perde nada, os
  /// links do Obsidian são por nome de nota, e copiar deixaria duas memórias
  /// divergindo. Se as duas existirem, nada é mexido — decidir qual vale é dele.
  async mudarDeNome() {
    if (path.basename(this.pasta) !== NOME_DA_PASTA || fs.existsSync(this.pasta)) return;
    const antiga = path.join(path.dirname(this.pasta), NOME_ANTIGO);
    if (!fs.existsSync(antiga)) return;
    try {
      await fsp.rename(antiga, this.pasta);
      this.onDebug(`cofre renomeado: ${antiga} → ${this.pasta}`);
    } catch (err) {
      this.onDebug(`não consegui renomear ${antiga}: ${err.message}`);
    }
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

  /// As notas que tratam do assunto da pergunta, JÁ LIDAS, para entrarem no
  /// prompt sem depender de ela decidir abrir.
  ///
  /// 05/11, 19:55: "assim que eu pagar a minha fatura, quanto vai sobrar?" —
  /// e ela respondeu "sem lançamentos de fatura ainda, me diga o valor". O
  /// valor (R$ 327,64), o dia e o plano inteiro estavam em
  /// fatos/financas-do-matheus, cujo `quando:` diz "fatura". O índice estava no
  /// prompt; ela simplesmente não abriu. Pedir no prompt "LEIA antes" não
  /// bastou — então quem abre agora é o código.
  ///
  /// A escolha é por palavras: cada palavra da pergunta (sem acento, raiz de 5
  /// letras) vale 3 se aparece no `quando:` ou no título, 1 se aparece no
  /// corpo. Pergunta de continuação ("e aí, quanto sobra?") quase não tem
  /// palavra própria — aí ficam as notas do turno anterior.
  async relevantes(pergunta, { anteriores = [], maximo = 2, orcamento = TETO_NOTAS_ABERTAS } = {}) {
    const raizes = raizesDe(pergunta);
    const itens = await this.indice();
    const pontuadas = [];
    for (const item of itens) {
      let bruto;
      try {
        bruto = await fsp.readFile(path.join(this.pasta, item.nome + ".md"), "utf8");
      } catch {
        continue;
      }
      const { corpo } = lerFrontmatter(bruto);
      const limpo = extrairRelacionado(corpo).corpo.trim();
      const forte = new Set(raizesDe(`${item.quando} ${path.basename(item.nome)} ${(limpo.match(/^#\s+(.+)$/m) || [])[1] || ""}`));
      const fraco = new Set(raizesDe(limpo));
      let pontos = 0;
      for (const r of raizes) pontos += forte.has(r) ? 3 : fraco.has(r) ? 1 : 0;
      pontuadas.push({ nome: item.nome, pontos, conteudo: limpo });
    }
    pontuadas.sort((a, b) => b.pontos - a.pontos);
    let escolhidas = pontuadas.filter((p) => p.pontos >= 3).slice(0, maximo);
    if (!escolhidas.length && anteriores.length) {
      escolhidas = pontuadas.filter((p) => anteriores.includes(p.nome)).slice(0, maximo);
    }
    // O orçamento é em caracteres e é TOTAL: a segunda nota recebe o que a
    // primeira deixou, cortada no fim de uma linha.
    const saida = [];
    let resta = orcamento;
    for (const p of escolhidas) {
      if (resta < 300) break;
      let texto = p.conteudo;
      if (texto.length > resta) {
        texto = texto.slice(0, resta);
        texto = texto.slice(0, Math.max(texto.lastIndexOf("\n"), 200)) + "\n[…]";
      }
      resta -= texto.length;
      saida.push({ nome: p.nome, conteudo: texto, pontos: p.pontos });
    }
    return saida;
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
    // As notas ligadas a esta, para ela saber o que abrir em seguida sem
    // adivinhar nome: o perfil aponta para a Hortência, a Hortência para a
    // igreja, e é seguindo isso que o cofre vira um cérebro e não uma gaveta.
    const ligadas = [...new Set(
      [...corpo.matchAll(/\[\[([^\]]+)\]\]/g)]
        .map((x) => resolverLink(x[1], itens))
        .filter((n) => n && n !== alvo.nome)
    )];
    return {
      nome: alvo.nome,
      quando: dados.quando || alvo.quando,
      ligadas: ligadas.length ? ligadas : undefined,
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

    // 24/11: "quando: agora, ao analisar o calendário". Essa linha é o que faz
    // a nota abrir depois; um momento que já passou não abre nunca mais.
    const semPrefixo = String(quando || "").trim().replace(/^quando:?\s*/i, "");
    if (/^(agora|hoje|ontem|amanhã|neste momento|nesta conversa|imediatamente)(?![\p{L}\d])/iu.test(semPrefixo)) {
      return {
        erro:
          `"quando: ${quando}" só vale para este momento, e a nota não abriria depois. Chame de novo ` +
          "dizendo que pergunta FUTURA dele precisa dela (ex.: \"ele perguntar de aniversário ou data de alguém\").",
      };
    }

    const subpasta = /^fatos/i.test(pasta) ? "fatos" : /^aprend/i.test(pasta) ? "aprendizados" : "processos";
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
    // NOTA NOVA SOBRE ASSUNTO QUE JÁ TEM NOTA NÃO PASSA DE PRIMEIRA.
    //
    // 04/11 e 07/11: com fatos/financas-do-matheus já dizendo "10% de cada
    // parcela, assim que cai", ela criou fatos/regra-dizimo-matheus, depois
    // processos/despesas-variaveis-matheus, depois
    // processos/regra-dizimo-pagamento-cai — três notas soltas do mesmo
    // assunto, e a principal sem a informação nova. A recusa devolve a nota
    // que já existe, para ela reescrever ali. Se for mesmo outro assunto,
    // a segunda chamada com o mesmo nome passa.
    if (!fs.existsSync(caminho) && this.recusadaPorParecida !== slug) {
      // Só nota DELA conta (fatos/, processos/, aprendizados/). As da raiz
      // (CEREBRO, MEMORIA, GLOSSARIO…) o código gera a cada abertura; em
      // 27/11/2026, 17:29 a CEREBRO.md recusou duas notas novas e a recusa
      // mandou gravar numa "pasta CEREBRO" que não existe.
      const parecidas = await this.relevantes(`${quando || ""} ${titulo || ""} ${nome}`, { maximo: 3, orcamento: 4000 });
      const parecida = parecidas.find((p) => /^(fatos|processos|aprendizados)\//.test(p.nome));
      if (parecida && parecida.pontos >= 5) {
        this.recusadaPorParecida = slug;
        return {
          erro:
            `já existe "${parecida.nome}" sobre este assunto. Reescreva ELA com anotar_memoria ` +
            `(nome "${path.basename(parecida.nome)}", pasta "${parecida.nome.split("/")[0]}"), juntando o ` +
            "que é novo ao texto abaixo — não crie outra nota. Se for mesmo outro assunto, chame de novo " +
            "com o mesmo nome e eu crio.",
          conteudo_atual: parecida.conteudo,
        };
      }
    }
    this.recusadaPorParecida = null;

    let anterior = null;
    if (fs.existsSync(caminho)) {
      anterior = await fsp.readFile(caminho, "utf8");
      const vaiVirar = conteudo.trim().length;
      const era = anterior.replace(/^---[\s\S]*?---\n/, "").trim().length;
      // 10/11: "leia o projeto do app e anote" — a nota do app foi recusada
      // por parecer a do grupo, e ela escreveu o app POR CIMA da do grupo:
      // 3.541 caracteres novos, nada dos membros, do Instagram e dos encontros.
      // O tamanho subiu, então a trava de baixo não viu. Esta olha o que FICA.
      const palavrasDe = (t) => new Set((t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{5,}/g)) || []);
      const velhas = [...palavrasDe(anterior.replace(/^---[\s\S]*?---\n/, ""))];
      const novas = palavrasDe(conteudo);
      const ficam = velhas.filter((w) => novas.has(w)).length / (velhas.length || 1);
      const encolhe = era > 500 && vaiVirar < era * 0.5; // a trava de baixo explica esse caso
      if (!encolhe && era > 200 && velhas.length >= 15 && ficam < 0.5) {
        return {
          erro:
            `a nota "${arquivo}" seria SUBSTITUÍDA: só ${Math.round(ficam * 100)}% do que ela diz continua no texto novo. ` +
            "Se é outro assunto, anote com OUTRO nome (e ponha esta nota em relacionado). Se é a mesma, " +
            "mande o texto abaixo inteiro mais o que é novo.",
          conteudo_atual: anterior,
        };
      }
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

    const { titulo: tituloDoCorpo, corpo: corpoComLinks } = separarTitulo(conteudo.trim());
    const cabeca = (titulo || tituloDoCorpo || humanizar(slug)).trim();

    // Os links vêm de três lugares e viram UMA seção: o `relacionado` da
    // chamada, a seção que ela escreveu no conteúdo, e os que a nota já tinha
    // — reescrever a nota inteira para corrigir uma linha não pode desligá-la
    // do resto do cofre. Só fica o que aponta para nota que existe.
    const { corpo, links: doCorpo } = extrairRelacionado(corpoComLinks);
    const deAntes = anterior !== null ? extrairRelacionado(lerFrontmatter(anterior).corpo).links : [];
    const pedidos = [
      ...(Array.isArray(relacionado) ? relacionado : relacionado ? [relacionado] : []),
      ...doCorpo,
      ...deAntes,
    ].filter((x) => typeof x === "string" && x.trim());
    const itens = await this.indice();
    const proprio = `${subpasta}/${slug}`;
    const ligadas = [], semNota = [];
    for (const pedido of pedidos) {
      const nome = resolverLink(pedido, itens);
      if (!nome) semNota.push(limparLink(pedido));
      else if (nome !== proprio && !ligadas.includes(nome)) ligadas.push(nome);
    }

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
      ...secaoRelacionado(ligadas, slug),
      "",
    ].join("\n");

    await fsp.writeFile(caminho, texto);
    const devolvidas = await this.ligarDeVolta(proprio, ligadas);
    this.cache = null;
    await this.gerarMapa();
    this.onDebug(`memória anotada: ${arquivo}${backup ? " (com backup)" : ""}`);
    return {
      ok: true,
      nome: arquivo.replace(/\.md$/, ""),
      titulo: cabeca,
      backup: backup ? path.basename(backup) : undefined,
      ligada_a: ligadas.length ? ligadas : undefined,
      ligacao_de_volta: devolvidas.length ? devolvidas : undefined,
      links_sem_nota: semNota.length
        ? `${[...new Set(semNota)].join(", ")}: não existe nota com esse nome, então não liguei. ` +
          "Se a pessoa ou o assunto merece nota própria, crie e ligue."
        : undefined,
    };
  }

  /// Link nos dois sentidos. Quando a nota da igreja aponta para a Hortência,
  /// a da Hortência passa a apontar para a igreja — sem isso, quem abre a
  /// Hortência não fica sabendo que existe a outra, e o grafo só tem setas que
  /// saem das notas novas. Só ACRESCENTA uma linha na seção Relacionado da
  /// outra nota; o texto dela não é tocado.
  async ligarDeVolta(proprio, ligadas) {
    const feitas = [];
    for (const outra of ligadas) {
      const arquivo = path.join(this.pasta, outra + ".md");
      try {
        const texto = await fsp.readFile(arquivo, "utf8");
        const jaTem = [...texto.matchAll(/\[\[([^\]]+)\]\]/g)]
          .some((x) => path.basename(limparLink(x[1])) === path.basename(proprio));
        if (jaTem) continue;
        const linha = `- [[${proprio}]]`;
        const secao = texto.match(/\n#{2,3}\s+Relacionad[oa]s?\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i);
        let novo;
        if (secao) {
          const fim = secao.index + secao[0].length;
          novo = texto.slice(0, fim).replace(/\s*$/, "") + "\n" + linha + "\n" + texto.slice(fim).replace(/^\s*\n/, "");
        } else {
          novo = texto.replace(/\s*$/, "") + "\n\n## Relacionado\n" + linha + "\n";
        }
        await fsp.writeFile(arquivo, novo);
        feitas.push(outra);
      } catch {}
    }
    return feitas;
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
        "# Memória da Sexta-Feira",
        "",
        `*Gerado automaticamente. ${itens.length} documento(s). Editar aqui não muda nada —`,
        "o que vale é o `quando:` dentro de cada arquivo.*",
        "",
        "Ver também: [[CEREBRO]] · [[APRENDIZADOS]] · [[CONVERSAS]]",
        "",
      ];
      for (const grupo of ["processos", "fatos", "aprendizados"]) {
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
  TETO_NOTAS_ABERTAS,
  raizesDe,
};
