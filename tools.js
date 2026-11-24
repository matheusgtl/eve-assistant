// tools.js — o que a E.V.E sabe fazer no computador e na internet.
//
// Cada ferramenta tem uma definição (o schema que o modelo lê) e um executor
// (o que roda de fato nesta máquina). A lista é a mesma para os dois cérebros:
// o brains.js traduz o schema para o formato de cada API.
//
// A régua aqui é simples: **o que dá para desfazer, ela faz** — criar, editar,
// abrir, fechar app, mandar arquivo para o Lixo, rodar comando, controlar o
// sistema. Nada disso pede autorização; é para isso que ela existe.
//
// Só três coisas têm trava, e nenhuma depende de o modelo se comportar:
//   1. Comando que destrói sem volta (rm -rf, sudo, formatar, desligar) só roda
//      com confirmed=true, depois de ela explicar o risco em voz alta.
//   2. Apagar arquivo é SEMPRE mandar para o Lixo, nunca `rm`.
//   3. Mandar mensagem para outra pessoa exige confirmação — o destinatário é
//      gente, e não existe desfazer.

const { exec, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs/promises");
const fsSync = require("node:fs"); // para checar se um app existe, sem await
const os = require("node:os");
const path = require("node:path");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const HOME = os.homedir();

// Mesma regra de nome de arquivo da memória: sem acento, sem espaço, legível.
const { apelido: apelidoDeArquivo } = require("./memoria.js");
const { Gastos, CATEGORIAS } = require("./gastos.js");
const { calcular: calcularConta } = require("./calculo.js");

// Contexto injetado pelo main.js: lembretes, chave do Gemini, notificações.
// Fica aqui para as ferramentas não precisarem conhecer o Electron.
let ctx = {
  lembretes: null,
  notificar: null,
  chaveGemini: () => null,
  // Todas as chaves de busca de uma vez: a pesquisa virou uma corrente de
  // buscadores, e passar uma chave de cada vez não escala.
  chavesDeBusca: () => ({}),
  memoria: null,
  skills: null,
  conversa: null, // { historico(), pasta() } — para salvar_conversa
  modelo: () => null,
  onDebug: () => {},
  // Arquivo que ela criou para ele (hoje, PDF). O app mostra um cartão no chat
  // com Abrir e Baixar — sem isto ela dizia "salvei em ~/Documents/x.pdf" e
  // ele tinha de ir procurar no Finder.
  onArquivo: () => {},
  web: require("./web.js"),
  pdf: require("./pdf.js"),
  sistema: require("./sistema.js"),
};

/// O livro de gastos mora no cofre, ao lado da memória: `Gastos/AAAA-MM.md`.
/// `ctx.gastos` existe para os testes apontarem para uma pasta temporária.
function livroDeGastos() {
  if (ctx.gastos) return ctx.gastos;
  const pasta = ctx.memoria?.pasta;
  // O log vai com o rótulo da memória: o `ctx.onDebug` é o da web, e
  // "web: gasto registrado" mandava procurar o problema no lugar errado.
  const onDebug = ctx.memoria?.onDebug || ctx.onDebug;
  return pasta ? new Gastos({ pasta, onDebug }) : null;
}

function configurar(novo) {
  ctx = { ...ctx, ...novo };
}

// ---------------------------------------------------------------------------
// Comandos que exigem confirmação explícita
// ---------------------------------------------------------------------------
const DANGEROUS = [
  /\brm\s+-[a-z]*[rf]/i,
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\bdiskutil\s+(erase|reformat|partition)/i,
  /:\(\)\s*\{/, // fork bomb
  />\s*\/dev\/sd/i,
  /\bchmod\s+-R\b/i,
  /\bchown\s+-R\b/i,
  /\bgit\s+push\s+.*--force/i,
  /\bempty\s+(the\s+)?trash\b/i, // AppleScript: esvaziar o Lixo é irreversível
  /\bdefaults\s+delete\b/i,
  /\bcsrutil\b/i,
  /\bspctl\b/i,
  /\blaunchctl\s+(unload|remove|bootout)\b/i,
];

function isDangerous(texto = "") {
  return DANGEROUS.some((re) => re.test(texto));
}

function pedirConfirmacao(oque) {
  return {
    needs_confirmation: true,
    message:
      `"${oque}" pode causar dano ou não tem como desfazer. ` +
      `Explique em UMA frase o que vai acontecer, pergunte se pode, e só repita ` +
      `esta chamada com confirmed=true depois do sim dele. Não tente outro caminho ` +
      `para contornar a confirmação.`,
  };
}

// Um PDF de 60 páginas passa de 150 mil caracteres. Entregue inteiro, ele
// sozinho estoura o histórico da conversa — e o que sai para dar lugar a ele é
// a pergunta que ele fez. O corte é grande o bastante para um contrato ou um
// exame caber inteiro, e pequeno o bastante para sobrar conversa em volta.
/// O id que ela mandou é de LEMBRETE INTERNO, e não de evento do Calendário?
///
/// Log de 01/11: `apagar_evento id="dz5a8q"` e, pior,
/// `apagar_evento id="A5DDE6E6-…-FA0DB8D3300A:nsa5aq"` — ela pegou o prefixo
/// do calendário e colou nele um id de lembrete interno. As duas falharam no
/// Calendário com "nao_encontrado", que é um erro verdadeiro e inútil: não diz
/// que ela misturou dois espaços de id diferentes, então ela tentaria de novo.
///
/// A regra olha a FORMA do id interno (Math.random().toString(36).slice(2,8),
/// isto é 4 a 6 caracteres de [a-z0-9]) em vez de exigir UUID do evento. Exigir
/// UUID recusaria id de calendário CalDAV ou Exchange, que têm outro formato —
/// e recusar o que funciona é pior do que aceitar o que vai falhar.
const FORMA_ID_INTERNO = /^[a-z0-9]{4,6}$/;

function idDeLembreteInterno(id) {
  const texto = String(id).trim();
  // O id de evento do iCloud é "<uuid do calendário>:<uuid do evento>". Se a
  // última parte tem forma de id interno, ela montou um híbrido.
  const ultima = texto.split(":").pop();
  if (!FORMA_ID_INTERNO.test(ultima)) return null;
  return {
    error:
      `"${texto}" não é id de evento do Calendário — é id de lembrete interno. ` +
      "São dois espaços diferentes: para apagar EVENTO, chame listar_eventos no dia e use o " +
      "id de lá (duas partes longas separadas por dois-pontos). Para apagar LEMBRETE INTERNO, " +
      "use cancel_reminder. E não monte um id juntando pedaços de dois lugares.",
    codigo: "id_de_outro_tipo",
  };
}

const TETO_TEXTO_FERRAMENTA = 24_000;

/// Este arquivo é texto, ou são bytes que só PARECEM texto?
///
/// Por que isto existe: ela chamou read_file num PDF de 53 KB. Lido como
/// UTF-8, o PDF virou 51.237 caracteres com 27,7% de caracteres de
/// substituição — e lixo binário tokeniza quase um token por caractere, então
/// o pedido saiu com 48.959 tokens e o Groq respondeu 413 ("Limit 8000,
/// Requested 48959"). O conteúdo era inútil para ela de todo modo: o texto
/// verdadeiro do PDF está comprimido dentro dos streams.
///
/// Ela já tinha a ferramenta certa (ler_pdf, com PDFKit e OCR), que resolve o
/// mesmo arquivo em algumas centenas de tokens. Faltava read_file dizer não.
const ASSINATURAS = [
  { magica: "%PDF-", erro: "isso é um PDF; o texto dele não sai como texto cru", use: "ler_pdf" },
  { magica: "\x89PNG", erro: "isso é uma imagem PNG" },
  { magica: "\xff\xd8\xff", erro: "isso é uma imagem JPEG" },
  { magica: "GIF8", erro: "isso é uma imagem GIF" },
  // docx, xlsx e pptx são zip por dentro, e começam igual.
  { magica: "PK\x03\x04", erro: "isso é um arquivo compactado (zip, docx, xlsx, pptx)" },
  { magica: "\x7fELF", erro: "isso é um executável" },
  { magica: "\xcf\xfa\xed\xfe", erro: "isso é um executável do macOS" },
];

function tipoBinario(buf) {
  const inicio = buf.subarray(0, 8).toString("binary");
  for (const a of ASSINATURAS) {
    if (inicio.startsWith(a.magica)) return a;
  }
  // Sem assinatura conhecida: decide pelo conteúdo. Byte zero não acontece em
  // texto; e muito byte de controle significa que o resto também é lixo.
  const amostra = buf.subarray(0, 8_000);
  if (amostra.includes(0)) return { erro: "isso é um arquivo binário, não texto" };
  let controle = 0;
  for (const b of amostra) {
    if (b < 9 || (b > 13 && b < 32)) controle++;
  }
  if (amostra.length && controle / amostra.length > 0.1) {
    return { erro: "isso é um arquivo binário, não texto" };
  }
  return null;
}

function cortarTextoLongo(texto, teto = TETO_TEXTO_FERRAMENTA) {
  const t = String(texto || "");
  if (t.length <= teto) return { texto: t, cortado: false };
  // Corta no fim de uma linha, não no meio de uma palavra: um número de
  // contrato partido ao meio é pior que um parágrafo de menos.
  const pedaco = t.slice(0, teto);
  const quebra = pedaco.lastIndexOf("\n");
  return { texto: quebra > teto * 0.8 ? pedaco.slice(0, quebra) : pedaco, cortado: true };
}

function resolvePath(p) {
  if (!p) return HOME;
  if (p.startsWith("~")) p = path.join(HOME, p.slice(1));
  return path.isAbsolute(p) ? p : path.join(HOME, p);
}

/// O cofre é território do anotar_memoria. Escrever nele com write_file é
/// pular o backup, o frontmatter e o índice — e, pior, pode nem chegar lá.
///
/// 02/11, 18:04: a trava de perda recusou um anotar_memoria que apagaria dois
/// terços de `perfil-matheus`. Em vez de regravar com o texto junto, ela
/// chamou `write_file` com `filepath: "fatos/perfil-matheus.md"` — relativo.
/// O resolvePath junta caminho relativo com HOME, então os 3.527 caracteres
/// foram para `/Users/matheus/fatos/perfil-matheus.md`, uma pasta fantasma. O
/// cofre não mudou, e ela respondeu como se tivesse salvo.
function escritaNoCofre(caminho) {
  const cofre = ctx.memoria?.pasta;
  if (!cofre) return null;
  const alvo = path.resolve(caminho);
  const raiz = path.resolve(cofre);
  const dentro = alvo === raiz || alvo.startsWith(raiz + path.sep);
  // "fatos/x.md" e "processos/x.md" caem FORA do cofre quando resolvidos a
  // partir do HOME, e é justamente o erro que aconteceu: a intenção era o
  // cofre, o destino não era.
  const pareceNota = /(^|\/)(fatos|processos|Conversas)\/[^/]+\.md$/.test(caminho);
  if (!dentro && !pareceNota) return null;
  return {
    error:
      "Não escreva no cofre da memória com write_file: isso pula o backup, o frontmatter e o " +
      "índice. Para gravar ou atualizar uma nota, use anotar_memoria — e se ele recusou por " +
      "apagar demais, chame-o DE NOVO com o texto que ele devolveu mais o seu acréscimo.",
    use: "anotar_memoria",
  };
}

// ---------------------------------------------------------------------------
// Definições — o que o modelo "vê"
// ---------------------------------------------------------------------------
// As definições viajam em TODO pedido ao modelo — as 18 somadas eram ~1.500
// tokens em cada pergunta, e uma pergunta real faz três pedidos. Então aqui o
// texto é caro, e a régua do que fica é: isto ajuda o modelo a ESCOLHER a
// ferramenta certa ou a não errar um parâmetro?
//
// Sai: repetir o nome do campo em prosa ("filepath: Caminho do arquivo"), e o
// ritual do needs_confirmation, que o prompt do sistema já explica uma vez.
// Fica: quando preferir uma ferramenta a outra, formatos que já quebraram
// (horário em ISO), padrões não óbvios e as travas de segurança.
const toolDefinitions = [
  // ---------------- computador ----------------
  {
    name: "run_command",
    description:
      "Roda um comando de shell (zsh) neste Mac: consultar, instalar, converter, " +
      "controlar o sistema, rodar scripts.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["command"],
    },
  },
  {
    name: "open_target",
    description:
      "Abre app, arquivo, pasta ou site NA TELA DELE, como o comando 'open'. " +
      "Só quando ele pedir para abrir/mostrar/ver — não para você consultar algo. " +
      "Ex.: 'Spotify', 'https://globo.com', '~/Downloads'.",
    input_schema: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"],
    },
  },
  {
    name: "applescript",
    description:
      "Roda um AppleScript: é assim que se controla um app POR DENTRO — tocar no Spotify, " +
      "criar nota, abrir aba, apertar teclas (System Events), ler a janela ativa, ajustar " +
      "volume. Prefira a run_command quando a ação é dentro de um app.",
    input_schema: {
      type: "object",
      properties: {
        script: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["script"],
    },
  },
  {
    name: "read_file",
    description: "Lê um arquivo de texto.",
    input_schema: {
      type: "object",
      properties: { filepath: { type: "string" } },
      required: ["filepath"],
    },
  },
  {
    name: "write_file",
    description:
      "Cria um arquivo de texto ou substitui o conteúdo inteiro. " +
      "Para mudar só um pedaço, use edit_file.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string" },
        content: { type: "string" },
      },
      required: ["filepath", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Troca um trecho exato por outro, preservando o resto. " +
      "O trecho antigo precisa aparecer uma única vez no arquivo.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string" },
        old: { type: "string", description: "Trecho exato a substituir." },
        new: { type: "string", description: "Texto que entra no lugar." },
      },
      required: ["filepath", "old", "new"],
    },
  },
  {
    name: "trash_file",
    description: "Manda para o Lixo, recuperável. É assim que se exclui aqui — nunca rm.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["filepath"],
    },
  },
  {
    name: "list_directory",
    description: "Lista uma pasta, com tamanho e data de modificação.",
    input_schema: {
      type: "object",
      properties: { dirpath: { type: "string", description: "Vazio = pasta do usuário." } },
    },
  },
  {
    name: "find_files",
    description: "Procura no disco inteiro pelo Spotlight. Aceita nome, parte do nome ou texto.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        dirpath: { type: "string", description: "Limitar a esta pasta." },
        por_conteudo: {
          type: "boolean",
          description: "True procura DENTRO dos arquivos; padrão é pelo nome.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "system_status",
    description:
      "CPU, memória, GPU, bateria, disco, tempo ligado. O resumo já está no seu contexto a " +
      "cada pergunta: chame só para o número exato.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "clipboard",
    description: "Lê ou escreve a área de transferência.",
    input_schema: {
      type: "object",
      properties: {
        acao: { type: "string", enum: ["ler", "escrever"] },
        texto: { type: "string", description: "Só para escrever." },
      },
      required: ["acao"],
    },
  },

  // ---------------- documentos ----------------
  {
    name: "ler_pdf",
    description:
      "Texto de um PDF do disco, inclusive escaneado (faz OCR). Use em vez de read_file, " +
      "que num PDF devolve lixo binário.",
    input_schema: {
      type: "object",
      properties: {
        caminho: { type: "string" },
        pagina: { type: "integer", description: "Uma página só, se o PDF for grande." },
      },
      required: ["caminho"],
    },
  },
  {
    name: "criar_pdf",
    description:
      "Escreve um PDF no disco. Conteúdo em Markdown, o " +
      "documento inteiro numa chamada só. Nunca salve .md/.txt como PDF.",
    input_schema: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Termina em .pdf; sem pasta vai para ~/Documents." },
        conteudo: { type: "string", description: "O documento em Markdown." },
        titulo: { type: "string" },
      },
      required: ["caminho", "conteudo"],
    },
  },

  // ---------------- dinheiro ----------------
  // 04/11: ele pediu controle de gastos. A soma é do código (gastos.js), não
  // dela: conta de dinheiro errada dita com confiança é pior que nenhuma.
  {
    name: "registrar_gasto",
    description: "Lança gasto; entrou é Entrada; \"tenho X na conta\" é Saldo; a vencer: A pagar/A receber.",
    input_schema: {
      type: "object",
      properties: {
        valor: { type: "number" },
        descricao: { type: "string" },
        categoria: { type: "string", enum: [...CATEGORIAS, "Entrada", "Saldo", "A pagar", "A receber"] },
        data: { type: "string", description: "AAAA-MM-DD." },
        pagamento: { type: "string" },
        parcelas: { type: "integer" },
      },
      required: ["valor", "descricao"],
    },
  },
  {
    name: "consultar_gastos",
    description: "Saldo, contas a pagar, quanto sobra, totais; pdf: relatório.",
    input_schema: {
      type: "object",
      properties: {
        vai_pagar: { type: "array", items: { type: "number" } },
        pdf: { type: "boolean" },
        mes: { type: "string", description: "AAAA-MM" },
        de: { type: "string" },
        ate: { type: "string" },
        categoria: { type: "string" },
        busca: { type: "string" },
      },
    },
  },
  {
    name: "calcular",
    description: "Conta exata; dinheiro é sempre aqui. Linhas com rótulo: \"a = 10 * 3; b = a - 5\".",
    input_schema: { type: "object", properties: { conta: { type: "string" } }, required: ["conta"] },
  },
  {
    name: "apagar_gasto",
    description: "Tira um lançamento pelo id (corrigir = apagar e lançar de novo).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },

  // ---------------- internet ----------------
  {
    name: "web_search",
    description:
      "Pesquisa na internet e devolve a resposta com as fontes. Use sempre que a pergunta " +
      "depender de informação atual ou de algo que você não tenha certeza. Não adivinhe: pesquise.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "read_webpage",
    description: "Devolve o texto de uma página. Use depois de pesquisar, ou quando ele mandar um link.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },

  // ---------------- avisos e lembretes ----------------
  {
    name: "notify",
    description: "Notificação do macOS agora, para quando a janela pode não estar à vista.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        mensagem: { type: "string" },
      },
      required: ["mensagem"],
    },
  },
  {
    name: "create_reminder",
    description:
      "Cria um lembrete: na hora marcada eu notifico e falo em voz alta.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" },
        quando: {
          type: "string",
          description:
            "ISO 8601 local (2026-10-22T15:30), calculado a partir da data e hora no seu " +
            "contexto. 'em N minutos' também vale.",
        },
      },
      required: ["texto", "quando"],
    },
  },
  {
    name: "criar_evento",
    description: "Compromisso no Calendário do Mac e do iPhone.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        inicio: { type: "string", description: "ISO local. Só a data (2026-05-02) = dia inteiro." },
        fim: { type: "string", description: "ISO local. Só com hora marcada." },
        local: { type: "string" },
        alarme_minutos: { type: "integer", description: "Aviso N minutos antes." },
        repetir: { type: "string", description: "anual/mensal/semanal" },
      },
      required: ["titulo", "inicio"],
    },
  },
  {
    name: "listar_eventos",
    description: "Eventos do Calendário, com id. Sem datas, 7 dias.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "ISO local" },
        ate: { type: "string" },
        busca: { type: "string", description: "título; ano todo" },
      },
    },
  },
  {
    // O lembrete do APP Lembretes, que é outra coisa do lembrete interno dela
    // (create_reminder). A distinção fica no prompt para não custar duas vezes.
    name: "criar_lembrete_app",
    description: "Lembrete no app Lembretes do Mac: notifica e aparece no iPhone.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        quando: { type: "string", description: "ISO local. Sem hora não notifica." },
        lista: { type: "string" },
        alarme_minutos: { type: "integer" },
      },
      required: ["titulo"],
    },
  },
  {
    name: "listar_lembretes_app",
    description: "Lembretes pendentes do app Lembretes, com id. Use antes de apagar.",
    input_schema: { type: "object", properties: { lista: { type: "string" } } },
  },
  {
    name: "apagar_lembrete_app",
    description: "Remove um lembrete do app Lembretes. O id vem de listar_lembretes_app.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    // Só por id, nunca por título ou data. O id vem de listar_eventos, então
    // para apagar ela é obrigada a olhar a lista primeiro — e é exatamente
    // esse passo que a impede de apagar o evento errado por causa de um
    // título parecido.
    name: "apagar_evento",
    description: "Remove um compromisso do Calendário. O id vem de listar_eventos.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "list_reminders",
    description: "Lista os lembretes pendentes.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancel_reminder",
    description: "Cancela um lembrete pelo id de list_reminders.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },

  // ---------------- memória (.md) ----------------
  {
    name: "consultar_memoria",
    description:
      "Abre um documento da sua memória e devolve o conteúdo. O índice do que existe já está " +
      "no seu contexto: quando um documento servir, LEIA antes de responder de cabeça.",
    input_schema: {
      type: "object",
      properties: { nome: { type: "string", description: "Como aparece no índice." } },
      required: ["nome"],
    },
  },
  {
    name: "anotar_memoria",
    description:
      "Grava um processo ou fato para você saber nas próximas conversas. Use quando ele te " +
      "ensinar como algo é feito, corrigir seu jeito, ou contar algo que vale lembrar.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        quando: { type: "string", description: "Em que situação consultar. Só esta linha fica no seu contexto." },
        conteudo: { type: "string", description: "Markdown. Comece com # Título. Cite outras notas com [[nome]]." },
        pasta: { type: "string", enum: ["processos", "fatos"] },
        relacionado: { type: "array", items: { type: "string" }, description: "Notas ligadas a esta." },
      },
      required: ["nome", "quando", "conteudo"],
    },
  },

  // ---------------- skills ----------------
  {
    name: "usar_skill",
    description:
      "Devolve os passos de uma skill. A lista está no seu contexto: quando o pedido dele " +
      "bater com uma, ABRA antes de improvisar.",
    input_schema: {
      type: "object",
      properties: { nome: { type: "string", description: "O comando, como aparece na lista." } },
      required: ["nome"],
    },
  },
  {
    name: "criar_skill",
    description:
      "Cria uma skill: um comando dele e o roteiro que você segue. Use quando ele pedir uma " +
      "skill, ou disser que quer repetir algo com um comando só.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        comando: { type: "string", description: "O que ele diz para acionar." },
        quando: { type: "string", description: "Quando usar. Só esta linha fica no seu contexto." },
        passos: { type: "string", description: "Passo a passo numerado, em markdown." },
      },
      required: ["nome", "quando", "passos"],
    },
  },
  {
    name: "salvar_conversa",
    description:
      "Salva esta conversa num .md no cofre dele.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Assunto; sem ele, a data." },
        ultimas: { type: "integer", description: "Só as N últimas mensagens." },
      },
    },
  },

  // ---------------- mensagens ----------------
  {
    name: "send_message",
    description:
      "Manda mensagem para outra pessoa de verdade (WhatsApp, iMessage/SMS, e-mail). " +
      "A primeira chamada SEMPRE volta needs_confirmation: leia em voz alta para quem vai e o " +
      "texto inteiro, espere o sim, repita com confirmed=true. Nunca invente destinatário.",
    input_schema: {
      type: "object",
      properties: {
        canal: { type: "string", enum: ["imessage", "email", "whatsapp"] },
        para: {
          type: "string",
          description: "Telefone com DDD, e-mail ou nome do contato. Sem +55 é completado sozinho.",
        },
        texto: { type: "string" },
        assunto: { type: "string", description: "Só para e-mail." },
        confirmed: { type: "boolean" },
      },
      required: ["canal", "para", "texto"],
    },
  },
];

// ---------------------------------------------------------------------------
// Executores
// ---------------------------------------------------------------------------
async function osascript(script) {
  const { stdout, stderr } = await execFileAsync("/usr/bin/osascript", ["-e", script], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024 * 4,
  });
  return { stdout: (stdout || "").trim(), stderr: (stderr || "").trim() };
}

const executors = {
  async run_command({ command, confirmed }) {
    if (isDangerous(command) && !confirmed) return pedirConfirmacao(command);
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: HOME,
        timeout: 60_000,
        maxBuffer: 1024 * 1024 * 8,
        shell: "/bin/zsh",
        // Sem isto, acentos e emojis saem corrompidos na saída dos comandos.
        env: { ...process.env, LANG: "pt_BR.UTF-8", LC_ALL: "pt_BR.UTF-8" },
      });
      return { stdout: stdout || "(sem saída)", stderr: stderr || "" };
    } catch (err) {
      return { error: err.message, stdout: err.stdout || "", stderr: err.stderr || "" };
    }
  },

  async open_target({ target }) {
    try {
      await execFileAsync("/usr/bin/open", [target], { timeout: 20_000 });
      return { ok: true, aberto: target };
    } catch (err) {
      // "open Spotify" falha; "open -a Spotify" é o jeito para aplicativos.
      try {
        await execFileAsync("/usr/bin/open", ["-a", target], { timeout: 20_000 });
        return { ok: true, aberto: target };
      } catch (err2) {
        return { error: err2.message };
      }
    }
  },

  async applescript({ script, confirmed }) {
    if (isDangerous(script) && !confirmed) return pedirConfirmacao("esse AppleScript");
    try {
      const r = await osascript(script);
      return { ok: true, saida: r.stdout || "(sem saída)", erro: r.stderr || undefined };
    } catch (err) {
      // O osascript escreve o motivo real no stderr; a mensagem do Node é genérica.
      return { error: (err.stderr || err.message || "").trim() };
    }
  },

  async read_file({ filepath }) {
    try {
      const full = resolvePath(filepath);
      const info = await fs.stat(full);
      if (info.isDirectory()) {
        return { error: "isso é uma pasta, não um arquivo", use: "list_directory" };
      }

      // Ler só o começo. Antes isto era readFile do arquivo INTEIRO para
      // depois cortar — um arquivo de 500 MB entrava todo na memória para
      // sobreviverem 24 mil caracteres dele.
      const limite = TETO_TEXTO_FERRAMENTA * 4; // folga para UTF-8 multibyte
      const fh = await fs.open(full, "r");
      let buf;
      let lidos = 0;
      try {
        buf = Buffer.alloc(Math.min(info.size, limite));
        if (buf.length) ({ bytesRead: lidos } = await fh.read(buf, 0, buf.length, 0));
      } finally {
        await fh.close();
      }
      const bytes = buf.subarray(0, lidos);

      // Binário é recusado ANTES de virar texto. Mandar lixo para o modelo
      // custa o orçamento inteiro do pedido e não ensina nada a ela.
      const binario = tipoBinario(bytes);
      if (binario) {
        return {
          error: `${binario.erro} (${info.size} bytes)`,
          use: binario.use,
          dica: binario.use
            ? `Chame ${binario.use} neste mesmo caminho.`
            : "Não insista em ler como texto; diga a ele que o arquivo não é de texto.",
        };
      }

      const { texto, cortado } = cortarTextoLongo(bytes.toString("utf8"));
      return {
        filepath: full,
        content: texto,
        bytes: info.size,
        truncado: cortado || info.size > lidos || undefined,
        aviso:
          cortado || info.size > lidos
            ? "O arquivo é maior do que isto; leu-se só o começo. Não repita a chamada " +
              "esperando mais — use run_command com grep/sed se precisar de outro trecho."
            : undefined,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async write_file({ filepath, content }) {
    try {
      const full = resolvePath(filepath);
      const barrado = escritaNoCofre(full) || escritaNoCofre(String(filepath || ""));
      if (barrado) return barrado;
      // Sobrescrever algo que já existe é perda de dado: guarda uma cópia .bak.
      let substituiu = false;
      try {
        await fs.access(full);
        await fs.copyFile(full, full + ".bak");
        substituiu = true;
      } catch {}
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content ?? "", "utf8");
      return {
        ok: true,
        filepath: full,
        bytes: Buffer.byteLength(content ?? ""),
        backup: substituiu ? full + ".bak" : undefined,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async edit_file({ filepath, old, new: novo }) {
    try {
      const full = resolvePath(filepath);
      const antes = await fs.readFile(full, "utf8");
      const ocorrencias = antes.split(old).length - 1;
      if (ocorrencias === 0) return { error: "Esse trecho não existe no arquivo." };
      if (ocorrencias > 1) {
        return { error: `O trecho aparece ${ocorrencias} vezes; inclua mais contexto para ficar único.` };
      }
      await fs.writeFile(full, antes.replace(old, novo ?? ""), "utf8");
      return { ok: true, filepath: full };
    } catch (err) {
      return { error: err.message };
    }
  },

  async trash_file({ filepath, confirmed }) {
    const full = resolvePath(filepath);
    // Fora da pasta do usuário é sistema ou de outra conta: só com confirmação.
    if (!full.startsWith(HOME) && !confirmed) return pedirConfirmacao(`mandar ${full} para o Lixo`);
    try {
      await fs.access(full);
    } catch {
      return { error: "Esse caminho não existe." };
    }
    try {
      // O Finder faz o movimento certo (mantém "Colocar de volta" no Lixo).
      await osascript(
        `tell application "Finder" to delete POSIX file ${JSON.stringify(full)}`
      );
      return { ok: true, nolixo: full, nota: "Está no Lixo; dá para recuperar." };
    } catch (err) {
      return { error: (err.stderr || err.message || "").trim() };
    }
  },

  async list_directory({ dirpath }) {
    try {
      const full = resolvePath(dirpath);
      const entradas = await fs.readdir(full, { withFileTypes: true });
      const itens = [];
      for (const e of entradas.slice(0, 300)) {
        let tamanho = null;
        let modificado = null;
        try {
          const st = await fs.stat(path.join(full, e.name));
          tamanho = e.isDirectory() ? null : st.size;
          modificado = st.mtime.toISOString().slice(0, 16).replace("T", " ");
        } catch {}
        itens.push({
          nome: e.name,
          tipo: e.isDirectory() ? "pasta" : "arquivo",
          bytes: tamanho,
          modificado,
        });
      }
      return { dirpath: full, total: entradas.length, itens };
    } catch (err) {
      return { error: err.message };
    }
  },

  async find_files({ query, dirpath, por_conteudo }) {
    try {
      const args = por_conteudo ? [query] : ["-name", query];
      if (dirpath) args.unshift("-onlyin", resolvePath(dirpath));
      const { stdout } = await execFileAsync("/usr/bin/mdfind", args, {
        timeout: 20_000,
        maxBuffer: 1024 * 1024 * 4,
      });
      const achados = stdout.split("\n").filter(Boolean);
      return {
        total: achados.length,
        achados: achados.slice(0, 40),
        nota: achados.length > 40 ? "mostrando os 40 primeiros" : undefined,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async system_status() {
    try {
      const a = await ctx.sistema.amostrar();
      return a;
    } catch (err) {
      return { error: err.message };
    }
  },

  async clipboard({ acao, texto }) {
    try {
      if (acao === "escrever") {
        // O locale C corrompe acentos e emojis ao colar; UTF-8 explícito resolve.
        await new Promise((resolve, reject) => {
          const p = execFile(
            "/usr/bin/pbcopy",
            [],
            { env: { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" } },
            (err) => (err ? reject(err) : resolve())
          );
          p.stdin.end(texto ?? "");
        });
        return { ok: true, copiado: (texto || "").slice(0, 80) };
      }
      const { stdout } = await execFileAsync("/usr/bin/pbpaste", [], { maxBuffer: 1024 * 1024 });
      return { conteudo: stdout.slice(0, 20_000) };
    } catch (err) {
      return { error: err.message };
    }
  },

  // ---------------- memória ----------------
  async consultar_memoria({ nome }) {
    if (!ctx.memoria) return { error: "memória não disponível" };
    try {
      const r = await ctx.memoria.consultar(nome);
      if (r.erro) return { error: r.erro, disponiveis: r.disponiveis };
      return r;
    } catch (err) {
      return { error: err.message };
    }
  },

  async anotar_memoria({ nome, quando, conteudo, pasta, relacionado }) {
    if (!ctx.memoria) return { error: "memória não disponível" };
    try {
      const r = await ctx.memoria.anotar({ nome, quando, conteudo, pasta, relacionado });
      // `conteudo_atual` vem quando a gravação foi recusada por apagar demais:
      // ela precisa do texto para juntar e tentar de novo na mesma resposta.
      if (r.erro) return { error: r.erro, conteudo_atual: r.conteudo_atual };
      return r;
    } catch (err) {
      return { error: err.message };
    }
  },

  // ---------------- documentos ----------------
  async ler_pdf({ caminho, pagina }) {
    try {
      const r = await ctx.pdf.lerPdf(resolvePath(caminho), { pagina: pagina || null });
      const { texto, cortado } = cortarTextoLongo(r.texto);
      return {
        caminho: resolvePath(caminho),
        titulo: r.titulo || undefined,
        paginas: r.paginas,
        lidas: r.lidas,
        // Dizer que veio de OCR não é detalhe técnico: OCR erra, e ela precisa
        // saber disso antes de afirmar um número de contrato em voz alta.
        por_ocr: r.ocr || undefined,
        truncado: r.truncado || cortado || undefined,
        // O aviso é para ELA, não para o log: sem ele o modelo lê um texto que
        // termina no meio e chama `ler_pdf` outra vez no mesmo arquivo. Foi o
        // que aconteceu no dia 27 — catorze leituras seguidas e nenhuma
        // resposta, porque cada leitura empurrava a anterior para fora.
        aviso: cortado
          ? `Li os primeiros ${TETO_TEXTO_FERRAMENTA.toLocaleString("pt-BR")} caracteres ` +
            "deste PDF. Para ver o resto, chame ler_pdf de novo com `pagina` — não repita " +
            "a chamada sem mudar nada, o resultado vai ser este mesmo."
          : undefined,
        texto,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async registrar_gasto(args) {
    const livro = livroDeGastos();
    if (!livro) return { error: "o cofre da memória não está disponível" };
    try {
      const r = await livro.registrar(args);
      return r.erro ? { error: r.erro } : r;
    } catch (err) {
      return { error: err.message };
    }
  },

  async consultar_gastos(args) {
    const livro = livroDeGastos();
    if (!livro) return { error: "o cofre da memória não está disponível" };
    try {
      // 08/11: "um PDF com o relatório do meu mês e quanto posso guardar". O
      // relatório inteiro sai do livro, com os números prontos, e vai direto
      // para o PDF — ela não reescreve número nenhum no caminho.
      if (args?.pdf) {
        const rel = await livro.relatorio(args);
        const feito = await executors.criar_pdf({ caminho: rel.arquivo, conteudo: rel.markdown, titulo: rel.titulo });
        if (feito.error) return feito;
        const c = await livro.consultar(args);
        return {
          ...feito,
          saldo_em_conta: c.saldo_em_conta?.valor || c.saldo_em_conta,
          fim_do_mes: c.quanto_sobra?.valor,
          aviso: feito.aviso + " Os números estão no PDF; em voz, diga só o fim do mês e quanto dá para guardar por mês.",
        };
      }
      return await livro.consultar(args || {});
    } catch (err) {
      return { error: err.message };
    }
  },

  async calcular({ conta }) {
    const r = calcularConta(conta);
    return r.erro ? { error: r.erro, feitas: r.feitas } : r;
  },

  async apagar_gasto(args) {
    const livro = livroDeGastos();
    if (!livro) return { error: "o cofre da memória não está disponível" };
    try {
      const r = await livro.apagar(args);
      return r.erro ? { error: r.erro } : r;
    } catch (err) {
      return { error: err.message };
    }
  },

  async criar_pdf({ caminho, conteudo, titulo }) {
    if (!conteudo?.trim()) {
      return { error: "o conteúdo chegou vazio: escreva o documento antes de salvá-lo" };
    }

    // "relatorio" vira "~/Documents/relatorio.pdf". Sem isto o resolvePath
    // joga caminho relativo direto no HOME, que foi como 3.500 caracteres
    // acabaram numa pasta fantasma em 02/11 — mesma armadilha, outra porta.
    // Apara ANTES de escolher o padrão: com `caminho: "  "` o `||` via uma
    // string verdadeira, aparava para vazio e somava ".pdf" — o arquivo saía
    // chamado ".pdf", oculto, no Documents.
    let pedido = String(caminho || "").trim() || "documento";
    if (!/\.pdf$/i.test(pedido)) pedido += ".pdf";
    if (!pedido.startsWith("~") && !path.isAbsolute(pedido) && !pedido.includes("/")) {
      pedido = path.join("~", "Documents", pedido);
    }
    const full = resolvePath(pedido);

    try {
      // Sobrescrever é perda de dado: guarda a cópia, como o write_file.
      let substituiu = false;
      try {
        await fs.access(full);
        await fs.copyFile(full, full + ".bak");
        substituiu = true;
      } catch {}

      const r = await ctx.pdf.criarPdf(full, conteudo, { titulo: titulo || "" });
      ctx.onArquivo({
        tipo: "pdf",
        caminho: r.caminho,
        nome: path.basename(r.caminho),
        paginas: r.paginas,
        bytes: r.bytes,
      });
      return {
        caminho: r.caminho,
        paginas: r.paginas,
        bytes: r.bytes,
        substituiu: substituiu || undefined,
        backup: substituiu ? full + ".bak" : undefined,
        // Ela dizia "salvei o PDF" sem dizer ONDE, e ele tinha de procurar.
        aviso: `Diga a ele o caminho (${r.caminho}) e quantas páginas saíram.`,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  // ---------------- skills ----------------
  async usar_skill({ nome }) {
    if (!ctx.skills) return { error: "skills não disponíveis" };
    try {
      const r = await ctx.skills.usar(nome);
      if (r.erro) return { error: r.erro, disponiveis: r.disponiveis };
      return r;
    } catch (err) {
      return { error: err.message };
    }
  },

  async criar_skill({ nome, comando, quando, passos }) {
    if (!ctx.skills) return { error: "skills não disponíveis" };
    try {
      const r = await ctx.skills.criar({ nome, comando, quando, passos });
      if (r.erro) return { error: r.erro };
      return r;
    } catch (err) {
      return { error: err.message };
    }
  },

  async salvar_conversa({ titulo, ultimas }) {
    if (!ctx.conversa) return { error: "não tenho acesso ao histórico" };
    try {
      let mensagens = ctx.conversa.historico() || [];
      if (ultimas > 0) mensagens = mensagens.slice(-ultimas);
      if (!mensagens.length) return { error: "a conversa está vazia; não há o que salvar" };

      const agora = new Date();
      const data = agora.toISOString().slice(0, 10);
      const base = titulo?.trim() ? `${data}-${apelidoDeArquivo(titulo)}` : `${data}-conversa`;
      const pasta = ctx.conversa.pasta();
      await fs.mkdir(pasta, { recursive: true });

      // Nunca sobrescrever: duas conversas sobre o mesmo assunto no mesmo dia
      // são duas conversas. O sufixo evita perder a primeira em silêncio.
      let caminho = path.join(pasta, base + ".md");
      let n = 2;
      while (fsSync.existsSync(caminho)) caminho = path.join(pasta, `${base}-${n++}.md`);

      const quem = (m) => (m.quem === "voce" ? "**Matheus**" : "**E.V.E**");
      // O frontmatter precisa ser linhas CONTIGUAS entre os dois "---": uma
      // linha em branco no meio e o Obsidian deixa de reconhecer o bloco.
      // Por isso o cabeçalho junta com \n e só as falas se separam com \n\n.
      const cabecalho = [
        "---",
        "quando: nunca — isto é uma conversa salva, não um processo",
        `data: ${data}`,
        "---",
        "",
        `# ${titulo?.trim() || `Conversa de ${agora.toLocaleDateString("pt-BR")}`}`,
        "",
      ].join("\n");
      const falas = mensagens
        .map((m) => {
          const hora = m.hora
            ? new Date(m.hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "";
          return `${quem(m)}${hora ? ` (${hora})` : ""}: ${String(m.texto || "").trim()}`;
        })
        .join("\n\n");
      const corpo = cabecalho + "\n" + falas + "\n";

      await fs.writeFile(caminho, corpo);
      return { ok: true, caminho, mensagens: mensagens.length };
    } catch (err) {
      return { error: err.message };
    }
  },

  // ---------------- internet ----------------
  async web_search({ query }) {
    try {
      const r = await ctx.web.pesquisar(query, {
        chaves: ctx.chavesDeBusca(),
        onDebug: ctx.onDebug,
      });
      return {
        resposta: r.texto,
        fontes: r.links,
        buscado_por: r.consultas,
        buscador: r.fonte,
        aviso: r.aviso,
      };
    } catch (err) {
      return {
        error: err.message,
        instrucao:
          "Diga ao usuário que você não conseguiu pesquisar agora e qual foi o motivo. " +
          "Não responda de memória como se fosse informação atual.",
      };
    }
  },

  async read_webpage({ url }) {
    try {
      const p = await ctx.web.lerPagina(url);
      return { url: p.url, titulo: p.titulo, texto: p.texto, truncado: p.truncado };
    } catch (err) {
      return { error: err.message };
    }
  },

  // ---------------- avisos e lembretes ----------------
  async notify({ titulo, mensagem }) {
    try {
      await ctx.notificar?.({ titulo: titulo || "E.V.E", mensagem });
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  },

  async create_reminder({ texto, quando }) {
    if (!ctx.lembretes) return { error: "Os lembretes não estão disponíveis agora." };
    return ctx.lembretes.criar({ texto, quando });
  },

  // ---------------- calendário do macOS ----------------
  // Separado dos lembretes de propósito: ver o comentário em calendario.js.
  async criar_evento({ titulo, inicio, fim, local, dia_inteiro, alarme_minutos, repetir }) {
    if (!ctx.calendario) return { error: "o Calendário não está disponível agora" };
    try {
      return await ctx.calendario.criar({
        titulo, inicio, fim, local,
        diaInteiro: dia_inteiro,
        alarmeMinutos: alarme_minutos,
        repetir,
      });
    } catch (err) {
      // O código vem do helper e diz o que ELE precisa fazer. Sem isso, "falhou"
      // soaria como defeito do app quando é só uma permissão desligada.
      return { error: err.message, codigo: err.codigo || undefined };
    }
  },

  async listar_eventos({ de, ate, busca }) {
    if (!ctx.calendario) return { error: "o Calendário não está disponível agora" };
    try {
      return await ctx.calendario.listar({ de, ate, busca });
    } catch (err) {
      return { error: err.message, codigo: err.codigo || undefined };
    }
  },

  async criar_lembrete_app({ titulo, quando, lista, alarme_minutos }) {
    if (!ctx.calendario) return { error: "os Lembretes não estão disponíveis agora" };
    try {
      return await ctx.calendario.criarLembreteApp({
        titulo, quando, lista, alarmeMinutos: alarme_minutos,
      });
    } catch (err) {
      return { error: err.message, codigo: err.codigo || undefined };
    }
  },

  async listar_lembretes_app({ lista }) {
    if (!ctx.calendario) return { error: "os Lembretes não estão disponíveis agora" };
    try {
      return await ctx.calendario.listarLembretesApp({ lista });
    } catch (err) {
      return { error: err.message, codigo: err.codigo || undefined };
    }
  },

  async apagar_lembrete_app({ id }) {
    if (!ctx.calendario) return { error: "os Lembretes não estão disponíveis agora" };
    if (!id) {
      return { error: "apagar_lembrete_app precisa do id. Chame listar_lembretes_app primeiro." };
    }
    // A mesma trava do apagar_evento, e pelo mesmo motivo: id de lembrete
    // INTERNO não serve aqui tampouco — o do app Lembretes é longo.
    const errado = idDeLembreteInterno(id);
    if (errado) return errado;
    try {
      return await ctx.calendario.apagarLembreteApp(id);
    } catch (err) {
      return { error: err.message, codigo: err.codigo || undefined };
    }
  },

  async apagar_evento({ id }) {
    if (!ctx.calendario) return { error: "o Calendário não está disponível agora" };
    if (!id) {
      return {
        error:
          "apagar_evento precisa do id do evento. Chame listar_eventos no dia certo " +
          "e use o id que vier de lá.",
      };
    }
    const errado = idDeLembreteInterno(id);
    if (errado) return errado;
    try {
      return await ctx.calendario.apagar(id);
    } catch (err) {
      return { error: err.message, codigo: err.codigo || undefined };
    }
  },

  async list_reminders() {
    if (!ctx.lembretes) return { error: "Os lembretes não estão disponíveis agora." };
    const lista = ctx.lembretes.listar();
    return { total: lista.length, lembretes: lista };
  },

  async cancel_reminder({ id }) {
    if (!ctx.lembretes) return { error: "Os lembretes não estão disponíveis agora." };
    return ctx.lembretes.cancelar(id);
  },

  // ---------------- mensagens ----------------
  async send_message({ canal, para, texto, assunto, confirmed }) {
    // Mensagem para outra pessoa é o único caso em que a confirmação não é
    // negociável: o destinatário é gente, e não existe desfazer.
    if (!confirmed) {
      return {
        needs_confirmation: true,
        message:
          `Antes de enviar, leia em voz alta para quem vai (${para}), por onde (${canal}) e ` +
          `o texto completo. Espere o "sim" e só então repita com confirmed=true.`,
        resumo: { canal, para, texto, assunto },
      };
    }

    try {

      if (canal === "imessage") {
        const script =
          `tell application "Messages"\n` +
          `  set alvo to a reference to participant ${JSON.stringify(para)} of account 1\n` +
          `  send ${JSON.stringify(texto)} to alvo\n` +
          `end tell`;
        await osascript(script);
        return { ok: true, enviado: { canal, para } };
      }

      if (canal === "email") {
        const script =
          `tell application "Mail"\n` +
          `  set msg to make new outgoing message with properties ` +
          `{subject:${JSON.stringify(assunto || "")}, content:${JSON.stringify(texto)}, visible:false}\n` +
          `  tell msg to make new to recipient at end of to recipients ` +
          `with properties {address:${JSON.stringify(para)}}\n` +
          `  send msg\n` +
          `end tell`;
        await osascript(script);
        return { ok: true, enviado: { canal, para, assunto } };
      }

      if (canal === "whatsapp") return await whatsapp(para, texto);

      return { error: `Canal desconhecido: ${canal}` };
    } catch (err) {
      return { error: explicarErroDeAutomacao(err) };
    }
  },
};

/// Entrega no WhatsApp. Só roda depois de o usuário ter confirmado em voz alta
/// (a trava de confirmação fica em send_message, antes de chegar aqui).
///
/// O WhatsApp não tem dicionário de AppleScript — não existe "peça ao app para
/// enviar". O que existe é o esquema whatsapp://send, que abre a conversa certa
/// com o texto já escrito na caixa; dali falta um Enter, e esse Enter sai pelo
/// System Events. É automação de interface, e isso tem três consequências que
/// o código assume: precisa da permissão de Acessibilidade, precisa esperar a
/// conversa abrir antes de teclar, e o resultado pede conferência na tela em
/// vez de jurar que saiu.
async function whatsapp(para, texto) {
  const digitos = String(para).replace(/\D/g, "");
  if (digitos.length < 8) return { error: "Preciso do número com DDD." };
  const numero = digitos.length <= 11 ? "55" + digitos : digitos; // escrito sem +55

  const temApp = fsSync.existsSync("/Applications/WhatsApp.app");
  const endereco = temApp
    ? `whatsapp://send?phone=${numero}&text=${encodeURIComponent(texto)}`
    : `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

  await execFileAsync("/usr/bin/open", [endereco], { timeout: 15_000 });

  if (!temApp) {
    return {
      ok: true,
      aberto: endereco,
      nota:
        "O app do WhatsApp não está instalado aqui, então abri no navegador — ali o " +
        "último clique é dele. Diga isso; não afirme que a mensagem saiu.",
    };
  }

  // A conversa demora a aparecer; teclar antes joga o Enter no lugar errado.
  await new Promise((r) => setTimeout(r, 3000));

  await osascript(
    `tell application "System Events"\n` +
      `  tell process "WhatsApp"\n` +
      `    set frontmost to true\n` +
      `    delay 0.6\n` +
      `    key code 36\n` + // Enter
      `  end tell\n` +
      `end tell`
  );

  return {
    ok: true,
    entregue: { para: numero, texto },
    nota:
      "Abri a conversa e apertei enter. Diga em uma frase para quem foi e o que foi, " +
      "e peça para ele dar uma olhada na tela — se a conversa demorar mais que o " +
      "normal para abrir, o enter pode não ter pegado.",
  };
}

/// Erro de automação do macOS tem causa única e solução única: falta permissão.
/// Dizer qual painel abrir vale mais do que repetir o código do erro.
function explicarErroDeAutomacao(err) {
  const motivo = (err.stderr || err.message || "").trim();
  if (/assistive access|-1719|-25211|accessibility/i.test(motivo)) {
    return (
      "O macOS bloqueou o controle do teclado. Autorize em Ajustes do Sistema › " +
      "Privacidade e Segurança › Acessibilidade, marcando a E.V.E — e tente de novo."
    );
  }
  if (/not allowed|Not authorized|-1743/i.test(motivo)) {
    return (
      "O macOS bloqueou o controle do app. Autorize em Ajustes do Sistema › " +
      "Privacidade e Segurança › Automação, marcando a E.V.E."
    );
  }
  return motivo;
}

/// Executa uma ferramenta pelo nome. Devolve sempre string (o tool_result).
async function runTool(name, input) {
  const fn = executors[name];
  if (!fn) return JSON.stringify({ error: `Ferramenta desconhecida: ${name}` });
  try {
    return JSON.stringify(await fn(input || {}));
  } catch (err) {
    // Rede fora, permissão negada, caminho inválido: o cérebro precisa saber o
    // que houve para explicar — não pode receber uma exceção e travar o laço.
    return JSON.stringify({ error: err?.message || String(err) });
  }
}

module.exports = { toolDefinitions, runTool, configurar, isDangerous, DANGEROUS };
