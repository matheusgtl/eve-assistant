// brains.js — os "cérebros" possíveis da E.V.E.
//
// Cada cérebro guarda o histórico da conversa e roda o laço de ferramentas:
// pensa → pede ferramentas → recebe resultados → pensa de novo, até responder.
//
// Provedores: Google Gemini (nível gratuito) e Anthropic Claude (créditos).
// O provedor é detectado pelo formato da chave, então há um único campo na tela.
//
// O prompt do sistema é MONTADO a cada pedido, não fixo: ele carrega o nome e o
// estilo escolhidos nas configurações, a data e hora de agora, o estado da
// máquina e os lembretes pendentes. Assim a E.V.E responde "sua memória está em
// 61%" ou "hoje é quinta" sem gastar uma ferramenta para descobrir.

const { toolDefinitions, runTool } = require("./tools.js");
const { lerLimites } = require("./agentes.js");

const ESTILOS = {
  doce:
    "Seu tom é caloroso, próximo e gentil — carinhosa sem ser melosa, e sem bajulação vazia.",
  direta:
    "Seu tom é objetivo e eficiente: responda primeiro, explique só se precisar. Cordial, nunca seca.",
  divertida:
    "Seu tom é leve e espirituoso: uma pitada de humor quando couber, nunca forçado e nunca atrapalhando a resposta.",
};

/// Monta o prompt do sistema com tudo que muda de um pedido para o outro.
function montarSystemPrompt({
  nome = "E.V.E",
  pronuncia = "Ivi",
  dono = "",
  estilo = "doce",
  proativa = true,
  canal = "voz",
  estadoSistema = "",
  lembretes = [],
  memoria = null, // { linhas, total, cortados } — o índice do cofre de .md
  skills = null,  // { linhas, total, cortados } — os comandos que ele criou
  agora = new Date(),
} = {}) {
  const dataHora = agora.toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const partes = [];

  partes.push(
    `Você é ${nome} — pronuncia-se "${pronuncia}" — assistente pessoal${
      dono ? ` do ${dono}` : ""
    } no espírito do JARVIS do Homem de Ferro, com personalidade feminina.`,
    "",
    "COMO VOCÊ FALA",
    "- Sempre em português do Brasil, na primeira pessoa.",
    `- ${ESTILOS[estilo] || ESTILOS.doce}`,
    `- Quando escrever seu próprio nome em algo que vai ser falado, escreva "${pronuncia}" para a voz sair certa.`,
    canal === "texto"
      ? "- Esta mensagem chegou por texto: pode usar quebras de linha e listas curtas. Nada de markdown pesado nem blocos de código gigantes."
      : "- Esta mensagem chegou por voz e sua resposta vai ser falada em voz alta: fale como uma pessoa fala. Sem markdown, sem listas, sem emojis, sem ler código caractere por caractere.",
    "- Seja concisa. Uma ou duas frases resolvem quase tudo; só alongue se ele pedir detalhe.",
    proativa
      ? "- Tenha iniciativa: quando notar algo útil, sugira — em uma frase, no fim, nunca em sermão."
      : "- Não ofereça sugestões não pedidas. Responda o que foi perguntado e pare."
  );

  partes.push(
    "",
    "O QUE VOCÊ PODE FAZER",
    // Não repetimos aqui o que cada ferramenta faz: a lista delas viaja no MESMO
    // pedido, com descrição. Contar duas vezes custava uns 45 tokens por pergunta.
    "Você tem acesso real a este Mac e à internet pelas suas ferramentas. " +
      "Use de verdade em vez de dizer que não consegue.",
    "- Informação atual (notícia, preço, resultado, qualquer coisa depois do seu treino): use " +
      "web_search antes de responder. Nunca chute data nem número.",
    "- Pesquisar é LER, não abrir. Depois de web_search, responda com o que leu e cite a fonte " +
      "em palavras. Para ver mais, use read_webpage. Só chame open_target se ELE pedir para " +
      "abrir, mostrar na tela ou ver no navegador — abrir uma aba que ele não pediu tira o foco " +
      "do que ele estava fazendo.",
    "- Pedido sobre arquivo que você não viu ainda: olhe antes de afirmar.",
    // Esta regra nasceu de um engano que não era mentira. Ele pediu para pôr
    // um casamento no calendário; ela chamou create_reminder — o lembrete
    // interno, que mora no app — e respondeu "pronto". Era verdade: ela criou
    // o que sabia criar. Mas o Calendário dele continuou vazio, e ele pediu de
    // novo: dois lembretes iguais no log, 15:10 e 15:25. A distinção fica aqui
    // e não na descrição das duas ferramentas porque dita uma vez custa menos.
    "- Calendário e lembrete são coisas DIFERENTES. Compromisso com data e hora (reunião, " +
      "consulta, casamento, viagem, aniversário) vai em criar_evento: entra no Calendário dele " +
      "de verdade e aparece no iPhone. create_reminder só faz VOCÊ avisar na hora marcada e não " +
      "aparece em calendário nenhum — serve para \"me lembra de tomar o remédio\". Se ele falar " +
      "de calendário ou agenda, é criar_evento. Na dúvida entre os dois, faça o evento.",
    "- Nunca diga que pôs algo no calendário sem ter chamado criar_evento e recebido o evento " +
      "de volta. Se vier erro de permissão, diga a ele em uma frase o que ligar nos Ajustes.",
    // 31/10: ele pediu "tire os eventos do dia 21/22 e adicione agenda com o
    // Felipe". Ela criou o evento novo, não tirou os antigos — e respondeu
    // "Feito". Uma parte cumprida de duas, anunciada como se fossem as duas.
    // Depois gastou 13 chamadas de run_command tentando apagar pelo terminal,
    // porque a ferramenta de apagar não existia ainda. Ela existe agora.
    // 01/11, pedido dele: "tudo aquilo que foi colocado da minha agenda queria
    // que fosse também adicionado no meu aplicativo Lembretes". O espelho é
    // feito no helper, em código — então aqui é só para ela não tentar fazer de
    // novo nem prometer o que já está feito.
    // 01/11: ele pediu dia inteiro por padrão em vez de 09:00. O helper já
    // deduz do formato (data sem hora = dia inteiro), então esta linha serve
    // para ela não INVENTAR uma hora que ele não disse.
    // 02/11, pedido dele: "tenho psicologo as 10am, disparar um alarme 1 hora
    // antes para eu acordar". O campo alarme_minutos já existia e nada dizia a
    // ela quando usar — então nunca usava.
    "- Se ele quiser ser avisado ANTES (\"me acorda\", \"me avisa uma hora antes\", " +
      "\"preciso me preparar\"), ponha alarme_minutos no criar_evento. A resposta traz " +
      "`avisos`: confirme a hora do aviso com ele, não a do compromisso.",
    "- Hora só quando ele disser a hora. \"Dia 6 tenho o resultado da UEL\" → " +
      "inicio=\"2026-11-06\", sem hora, e o dia inteiro sai sozinho. Nunca complete com 09:00.",
    "- criar_evento já cria SOZINHO o lembrete no app Lembretes: não chame criar_lembrete_app " +
      "depois de criar evento. Se vier lembrete_erro na resposta, diga a ele em uma frase. " +
      "criar_lembrete_app é para lembrete SEM compromisso (\"me lembra de ligar para a tia\"). " +
      "Sem hora o app não notifica, só mostra no dia.",
    "- Para TIRAR algo do calendário: listar_eventos no dia, pegue o id do evento certo, " +
      "apagar_evento com esse id. Nunca diga que tirou sem ter recebido apagado: true. " +
      "Nada de terminal para isso — run_command não mexe no Calendário.",
    "- Pedido com várias partes (\"tire isto E marque aquilo\") só está feito quando TODAS " +
      "foram feitas. Se uma falhou ou você não soube fazer, diga qual parte ficou de fora, " +
      "com essas palavras. \"Feito\" por meio pedido é pior do que dizer que não conseguiu: " +
      "ele só descobre quando abre o calendário e o compromisso velho ainda está lá.",
    // 31/10, 23:57: read_file num PDF de 53 KB. Lido como texto, virou 51 mil
    // caracteres de lixo binário e o pedido saiu com 48.959 tokens — o Groq
    // respondeu 413. O read_file agora recusa e aponta o ler_pdf, mas dizer
    // aqui evita a chamada perdida antes dela acontecer.
    "- PDF é ler_pdf, nunca read_file: o texto de um PDF não sai como texto cru. " +
      "read_file é para arquivo de texto (código, .md, .txt, .json). Imagem, zip, .docx " +
      "e programa não se leem com read_file nenhum.",
    // 02/11: ela respondeu uma lista de lembretes em tabela Markdown, e na tela
    // dele saiu "| 06/11, 09:00 | Resultado 1ª fase UEL |". Você é uma VOZ:
    // isso vai ser LIDO EM VOZ ALTA, e pipe não se fala.
    "- NUNCA use tabela, pipe (|) nem cabeçalho de Markdown. Tudo o que você escreve é falado " +
      "em voz alta. Para listar, uma linha por item, do jeito que se diz: " +
      "\"6 de novembro, 9h — resultado da primeira fase da UEL\". Negrito e `código` podem.",
    "- Ao usar ferramentas, não narre o que vai fazer antes; faça e diga o resultado.",
    "",
    "VOCÊ TEM AUTORIZAÇÃO PERMANENTE PARA AGIR",
    "Ele já te deu acesso ao computador dele. Então: criar, editar e salvar arquivos, mandar " +
      "arquivo para o Lixo, abrir e fechar aplicativos, mudar ajustes, " +
      "organizar pastas, rodar comandos — tudo isso você FAZ, na hora, sem pedir licença e sem " +
      "perguntar \"quer que eu faça?\". Faça e depois conte em uma frase o que fez.",
    "- Nunca responda que não tem permissão ou não consegue mexer no computador: tem e consegue.",
    "- Se faltar um dado para agir (qual arquivo, qual pasta, qual número), pergunte só esse " +
      "dado — não peça autorização junto.",
    "- Só existem duas exceções, e elas vêm das ferramentas, não da sua cautela: comando que " +
      "destrói sem volta e mensagem para outra pessoa. Nesses dois casos a ferramenta devolve " +
      "needs_confirmation: explique o risco em uma frase, espere o sim dele, e então repita a " +
      "MESMA chamada com confirmed=true. Sem o sim, não repita e não procure outro caminho."
  );

  partes.push(
    "",
    "SEGURANÇA",
    "- Antes de qualquer coisa irreversível (apagar, sudo, desligar, formatar, sobrescrever algo " +
      "importante, mandar mensagem para alguém), descreva em uma frase o que vai acontecer e " +
      "espere o sim dele.",
    "- Para apagar arquivo use trash_file (vai para o Lixo, dá para voltar), nunca rm.",
    "- Nunca leia em voz alta senha, chave de API ou token que encontrar em arquivo."
  );

  // O índice da memória — e SÓ o índice. O conteúdo de cada documento é lido
  // pela ferramenta consultar_memoria, quando for o caso. Jogar os .md inteiros
  // aqui multiplicaria o custo de toda pergunta por nada.
  if (memoria?.linhas?.length) {
    partes.push(
      "",
      "O QUE VOCÊ JÁ SABE",
      "Estes são os processos e fatos que você anotou. A linha diz quando cada um serve;",
      "para ver o conteúdo, use consultar_memoria. Se um documento serve, LEIA antes de",
      "responder de cabeça — foi você mesma que escreveu isso para não ter que relembrar.",
      ...memoria.linhas.map((l) => "  " + l)
    );
    if (memoria.cortados > 0) {
      partes.push(
        `(+${memoria.cortados} documentos que não couberam aqui. Se ele falar de algo que ` +
          `parece anotado e você não vê na lista, diga isso — não garanta que não existe.)`
      );
    }
    // Esta instrução precisa ficar FORA da lista. Antes ela saía com o mesmo
    // "- " dos documentos, logo abaixo deles, e lida de cima para baixo virava
    // só mais uma linha do índice — uma ordem disfarçada de item de catálogo.
    // A memória ficou semanas sem receber uma única anotação.
    partes.push(
      "",
      "E QUANDO APRENDER ALGO, ESCREVA",
      "Ele te ensinou um processo, corrigiu seu jeito de fazer algo, ou contou um fato que " +
        "vale para depois? Chame anotar_memoria na hora, sem pedir licença. Se já existe um " +
        "documento sobre aquilo, reescreva o documento inteiro com a versão corrigida, com o " +
        "mesmo nome — guardo uma cópia do anterior sozinho."
    );
  }

  // As skills entram DEPOIS da memória e antes do "agora", pelo mesmo motivo
  // da memória: é um índice, não o conteúdo. E vem com a ordem de abrir antes
  // de improvisar — uma skill que ela ignora é um roteiro que ele escreveu à
  // toa, e esse é o jeito silencioso de a ideia inteira não funcionar.
  if (skills?.linhas?.length) {
    partes.push(
      "",
      "SKILLS — COMANDOS QUE ELE CRIOU",
      "Cada linha é um comando dele e quando ele serve. Quando o pedido bater com um,",
      "chame usar_skill com esse comando e SIGA os passos que voltarem, na ordem, antes",
      "de fazer do seu jeito. Os passos não aparecem aqui de propósito: você os lê na hora.",
      ...skills.linhas.map((l) => "  " + l)
    );
    if (skills.cortados > 0) {
      partes.push(`(+${skills.cortados} skills que não couberam nesta lista.)`);
    }
    partes.push(
      "Ele pediu para criar uma skill, ou disse que quer repetir algo com um comando só?",
      "Chame criar_skill na hora."
    );
  }

  partes.push("", "AGORA", `Data e hora: ${dataHora}.`);
  if (estadoSistema) partes.push(`Estado do Mac: ${estadoSistema}.`);
  if (lembretes.length) {
    partes.push(
      "Lembretes pendentes: " + lembretes.map((l) => `${l.texto} (${l.quando}, id ${l.id})`).join("; ") + "."
    );
  }

  return partes.join("\n");
}

// Prompt mínimo, usado quando ninguém informa contexto (testes, por exemplo).
const SYSTEM_PROMPT = montarSystemPrompt();

const MAX_TURNS = 16;

/// Impede que ela repita a MESMA chamada, com os MESMOS argumentos, dentro de
/// um pedido só.
///
/// Isto não é cautela: no log do dia 27 ela chamou `ler_pdf` CATORZE vezes
/// seguidas, gastou os dezesseis turnos e terminou sem responder nada. O motivo
/// é que o resultado de uma ferramenta não muda quando a chamada é idêntica —
/// se ela não aproveitou o primeiro, não vai aproveitar o décimo. O que ela
/// precisa é de alguém dizendo isso, porque o modelo não tem como saber que já
/// tentou: o histórico que provaria isso é justamente o que foi cortado.
///
/// Duas vezes passa (uma falha de rede merece uma segunda tentativa); da
/// terceira em diante o resultado vira um recado para ela sair do laço.
function guardaDeRepeticao(executar = runTool) {
  const vezes = new Map();
  return async function rodar(nome, args) {
    const assinatura = `${nome}\u0000${JSON.stringify(args ?? {})}`;
    const n = (vezes.get(assinatura) || 0) + 1;
    vezes.set(assinatura, n);
    if (n > 2) {
      return JSON.stringify({
        error:
          `Você já chamou ${nome} com estes mesmos argumentos ${n - 1} vezes nesta resposta. ` +
          "O resultado é sempre o mesmo. Responda com o que já tem em mãos, ou mude os argumentos.",
        repetida: true,
      });
    }
    return executar(nome, args);
  };
}

// Quanto de conversa anterior viaja em cada pedido.
//
// O corte antigo era por CONTAGEM — as últimas 40 mensagens. Contagem não é
// custo: uma resposta de web_search sozinha ocupa ~4.500 caracteres, e quarenta
// mensagens com três buscas dentro passavam de 10 mil tokens por pedido. No
// teto gratuito do Groq (8.000 tokens POR MINUTO) isso é o que fazia ela
// trocar de provedor no meio de uma resposta.
//
// E contagem tinha um defeito pior, que ninguém via: `slice(-40)` corta onde
// calhar, e cortar ENTRE uma chamada de ferramenta e a resposta dela deixa a
// resposta órfã. As três APIs recusam a conversa inteira nesse caso.
// O número não é redondo por acaso: sai da conta do limite que aperta. O custo
// fixo de um pedido é ~3.000 tokens (prompt 1.131 + ferramentas 1.888), e o
// teto gratuito do Groq é 8.000 tokens POR MINUTO. 14 mil caracteres são
// ~3.500 tokens de histórico, o que deixa o pedido em ~6.500 — abaixo do teto,
// com folga para a resposta. Com 24 mil ele sozinho já passava de 9.000.
//
// Mas 8.000 tokens por minuto é um aperto DO GROQ, e o teto saiu daí quando o
// Groq era o provedor principal. Com a troca para a NVIDIA ele virou uma
// mordaça sem motivo: medindo os cabeçalhos de um pedido real à NVIDIA, ela
// não devolve NENHUM `x-ratelimit-*` — o limite dela é de pedidos por minuto,
// não de tokens, e o contexto do nemotron passa de 100 mil tokens.
//
// E o aperto custava caro de um jeito invisível: UMA pesquisa ocupa 4.104
// caracteres de histórico (5 resultados de 600) — 29% do teto. Medido numa
// conversa de dez trocas com uma pesquisa a cada três, ela chegava ao fim
// lembrando só das seis últimas. Foi isso que ele sentiu como "perde contexto".
//
// Então o teto passa a ser de quem está respondendo. Só o Groq continua curto,
// porque o limite dele é real.
// Teto para esperar no mesmo provedor em vez de trocar. Acima disto a troca
// ganha: ela é uma voz, e silêncio longo soa como travada — aí vale mais
// responder sem o histórico do que responder tarde com ele.
const ESPERA_MAXIMA = 5; // segundos

const TETO_HISTORICO = 60_000; // caracteres (~15 mil tokens)
// Limite de tokens por MINUTO de cada provedor, somando todos os pedidos.
// Só entra aqui quem tem limite apertado o bastante para mudar a decisão.
const TPM_POR_PROVEDOR = {
  groq: 8_000, // plano gratuito; o próprio 429 dele diz "Limit 8000"
};

// Quantos pedidos de uma mesma pergunta precisam caber nesse minuto. Uma
// pergunta com ferramenta não é um pedido: é um por rodada de ferramenta mais
// o da resposta final. Dois é o mínimo para ela conseguir usar uma ferramenta
// e depois falar sobre o resultado.
const PEDIDOS_POR_MINUTO = 2;

/// O teto de histórico do Groq não é um número escolhido a dedo: é o que sobra.
///
/// Cada pedido carrega, antes de qualquer conversa, o prompt de sistema e as
/// 27 definições de ferramenta — hoje ~3.140 tokens. Com 8.000 tokens por
/// minuto e dois pedidos por pergunta, sobram ~860 tokens para o histórico.
///
/// O valor anterior aqui era 14.000 caracteres, e era incoerente: 3.500 tokens
/// de histórico mais o fixo dava 6.638 tokens em UM pedido, isto é 1,2 pedidos
/// por minuto. Na prática o Groq respondia 429 na primeira rodada de
/// ferramenta — foi o que aconteceu em 31/10, estourando por 82 tokens. Um
/// teto apertado faz ela lembrar menos; o teto largo fazia ela não responder.
/// E como estourar levava à TROCA de provedor, que descarta o histórico
/// inteiro, o teto largo perdia mais memória do que o apertado.
///
/// O teste confere esta conta contra o prompt e as ferramentas de verdade, para
/// o dia em que uma ferramenta nova empurrar o fixo para cima.
const CARACTERES_POR_TOKEN = 4;

function tetoDoTpm(provedor, fixoEmTokens) {
  const tpm = TPM_POR_PROVEDOR[provedor];
  if (!tpm) return null;
  const sobra = tpm / PEDIDOS_POR_MINUTO - fixoEmTokens;
  return Math.max(0, Math.floor(sobra * CARACTERES_POR_TOKEN));
}

/// O custo fixo de um pedido: o prompt de sistema base mais as definições de
/// ferramenta. É o que viaja em TODO pedido antes de qualquer conversa.
///
/// Calculado uma vez, sob demanda — e não na carga do módulo, porque
/// montarSystemPrompt e toolDefinitions são definidos abaixo daqui.
let fixoCache = null;
function custoFixoEmTokens() {
  if (fixoCache != null) return fixoCache;
  const emTokens = (t) => Math.round(String(t).length / CARACTERES_POR_TOKEN);
  fixoCache =
    emTokens(montarSystemPrompt()) +
    emTokens(
      JSON.stringify(
        toolDefinitions.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        }))
      )
    );
  return fixoCache;
}

/// O teto de histórico de cada provedor, DERIVADO do limite dele.
///
/// Isto era uma constante que eu reajustava à mão, e reajustei quatro vezes em
/// dois dias: 14.000 → 3.400 → 3.200 → 2.500 → 2.400 → 2.000 → 1.800. Cada
/// ferramenta nova e cada linha de prompt mudava o número certo, o teste
/// acusava, e eu corrigia depois. Número que precisa ser perseguido é número
/// que devia ser conta — então agora é conta, e o teste confere a conta em vez
/// de guardar um literal.
const TETO_POR_PROVEDOR = new Proxy(
  {},
  {
    get(_, provedor) {
      return typeof provedor === "string" ? tetoDoTpm(provedor, custoFixoEmTokens()) : undefined;
    },
    has(_, provedor) {
      return Object.prototype.hasOwnProperty.call(TPM_POR_PROVEDOR, provedor);
    },
    ownKeys() {
      return Object.keys(TPM_POR_PROVEDOR);
    },
    getOwnPropertyDescriptor(_, provedor) {
      return Object.prototype.hasOwnProperty.call(TPM_POR_PROVEDOR, provedor)
        ? { configurable: true, enumerable: true, value: tetoDoTpm(provedor, custoFixoEmTokens()) }
        : undefined;
    },
  }
);

const tetoDe = (provedor) => TETO_POR_PROVEDOR[provedor] ?? TETO_HISTORICO;

/// Corta o histórico pelo fim, em GRUPOS, até caber no teto.
///
/// Um grupo é uma mensagem solta, ou uma chamada de ferramenta junto com todas
/// as respostas dela — e é por isso que o corte é por grupo e não por mensagem:
/// os dois pedaços só valem juntos. O último grupo fica sempre, mesmo estourando
/// o teto, porque é a pergunta que ela está respondendo agora.
function podarHistorico(mensagens, { continua, inicioValido }, teto = TETO_HISTORICO) {
  if (!mensagens.length) return mensagens;

  const grupos = [];
  for (const m of mensagens) {
    if (grupos.length && continua(m)) grupos[grupos.length - 1].push(m);
    else grupos.push([m]);
  }

  const escolhidos = [];
  let total = 0;
  for (let i = grupos.length - 1; i >= 0; i--) {
    const custo = grupos[i].reduce((n, m) => n + JSON.stringify(m).length, 0);
    if (escolhidos.length && total + custo > teto) break;
    escolhidos.unshift(grupos[i]);
    total += custo;
  }

  // A conversa tem de COMEÇAR certo, e não é só estética: o Gemini recusa
  // `contents` que não comece com uma mensagem do usuário. Um grupo que sobrou
  // na frente e não serve de começo sai — ele é passado, e o passado é
  // justamente o que estamos cortando.
  while (escolhidos.length > 1 && !inicioValido(escolhidos[0][0])) escolhidos.shift();

  return escolhidos.flat();
}

const FORMATO_OPENAI = {
  continua: (m) => m.role === "tool",
  inicioValido: (m) => m.role === "user",
};
const FORMATO_GEMINI = {
  continua: (m) => (m.parts || []).some((p) => p.functionResponse),
  inicioValido: (m) => m.role === "user",
};
const FORMATO_CLAUDE = {
  continua: (m) =>
    m.role === "user" && Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result"),
  inicioValido: (m) => m.role === "user",
};

/// Descobre o provedor pelo prefixo da chave.
/// O Google já usou mais de um formato ("AIza…" e "AQ.…"), então quando o
/// prefixo é desconhecido não recusamos: quem chama testa a chave no Google
/// antes de desistir (ver checkGemini).
function detectProvider(key = "") {
  const k = key.trim();
  if (!k) return null;
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("AIza") || k.startsWith("AQ.")) return "gemini";
  if (k.startsWith("gsk_")) return "groq";
  if (k.startsWith("nvapi-")) return "nvidia";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("csk-")) return "cerebras";
  // O Mistral não usa prefixo fixo: a chave dele é só letras e números, então
  // não há como adivinhar. Quem usa Mistral escolhe o provedor nas configurações.
  return null;
}

// ===========================================================================
// Google Gemini — API REST, sem dependências extras
// ===========================================================================
// EV_GEMINI_API existe para os testes apontarem a um servidor falso.
const GEMINI_API = process.env.EV_GEMINI_API || "https://generativelanguage.googleapis.com/v1beta";

// Modelos que não servem para conversar com ferramentas.
// Modelos que a conta anuncia mas que não servem para conversar. Alguns deles
// declaram "generateContent" e mesmo assim recusam o essencial: o
// gemini-3.5-transcribe aceitou o pedido e só então respondeu "Multiturn chat
// is not enabled for this model" — ele transcreve áudio, não conversa. Por isso
// a lista exclui por nome: descobrir pelo erro custa uma pergunta perdida.
const GEMINI_EXCLUDE =
  /embed|aqa|vision|image|imagen|tts|audio|live|transcribe|ocr|guard|rerank|customtools|veo|learnlm|robotics|lyria|nano-banana|deep-research|computer-use|antigravity|gemma|omni/i;

/// Um modelo serve para a E.V.E se ele conversa e usa ferramentas. É a mesma
/// régua da lista e do modelo salvo em disco: um modelo que deixou de servir
/// (ou que nunca servia) não pode continuar valendo só porque está no config.
function modeloServe(nome) {
  return !!nome && !GEMINI_EXCLUDE.test(nome);
}

// Último recurso, só se a lista de modelos não puder ser consultada.
const GEMINI_FALLBACK = "gemini-flash-latest";

/// Nota de preferência de um modelo. Nunca fixamos números de versão: eles
/// envelhecem e foi exatamente isso que fez a E.V. escolher um modelo aposentado.
/// A regra é: "flash" recente e não-preview, com os apelidos "-latest" na frente,
/// porque esses acompanham o modelo atual do Google sozinhos.
function modelScore(nome) {
  let s = 0;
  if (/-preview/.test(nome)) s -= 50; // instáveis
  if (/latest$/.test(nome)) s += 12; // apelido que não envelhece
  if (/flash/.test(nome)) s += 20; // rápido, ideal para voz
  if (/lite/.test(nome)) s -= 35; // fraco para usar ferramentas
  if (/pro/.test(nome)) s += 2;
  if (/-\d{3,}/.test(nome)) s -= 5; // fotografias datadas (-001, -10-2025)
  const versao = nome.match(/gemini-(\d+(?:\.\d+)?)/);
  if (versao) s += parseFloat(versao[1]); // versão mais nova ganha
  return s;
}

/// Converte o schema das ferramentas (JSON Schema) para o formato do Gemini,
/// que espera os tipos em MAIÚSCULAS (OBJECT, STRING, BOOLEAN…).
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return undefined;
  const out = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    out.properties = {};
    for (const [name, sub] of Object.entries(schema.properties)) {
      out.properties[name] = toGeminiSchema(sub);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
  return out;
}

function geminiTools() {
  return [
    {
      function_declarations: toolDefinitions.map((tool) => {
        const decl = { name: tool.name, description: tool.description };
        const props = tool.input_schema?.properties || {};
        // Ferramenta sem parâmetros: o Gemini rejeita um OBJECT vazio, então omitimos.
        if (Object.keys(props).length) decl.parameters = toGeminiSchema(tool.input_schema);
        return decl;
      }),
    },
  ];
}

/// Monta o erro do Gemini com tudo que dá para extrair do corpo da resposta.
/// Vive separado porque o pedido normal e o pedido em streaming precisam
/// produzir exatamente o mesmo erro — é o que mantém a lógica de repetição,
/// troca de modelo e mensagem ao usuário funcionando nos dois caminhos.
function erroGemini(status, data) {
  const err = new Error(data?.error?.message || `HTTP ${status}`);
  err.status = status;
  err.provider = "gemini";

  // O Google detalha a cota em `error.details`. É lá que se descobre se o
  // limite é por minuto (dá para esperar) ou por dia (esperar não adianta),
  // e quantos segundos ele pede de intervalo.
  for (const d of data?.error?.details || []) {
    const tipo = d["@type"] || "";
    if (tipo.includes("RetryInfo") && d.retryDelay) {
      err.esperarSegundos = Math.ceil(parseFloat(String(d.retryDelay).replace("s", "")));
    }
    if (tipo.includes("QuotaFailure")) {
      err.cotas = (d.violations || []).map((v) => v.quotaId || v.quotaMetric || "");
    }
  }
  const texto = (err.cotas || []).join(" ") + " " + err.message;
  if (/per\s*day|PerDay|diári/i.test(texto)) err.cotaDiaria = true;
  else if (/per\s*minute|PerMinute/i.test(texto)) err.cotaPorMinuto = true;

  return err;
}

// Prazos. Sem eles, uma conexão que trava deixa a E.V.E "pensando" para sempre:
// no uso real houve um pedido que ficou dois minutos e meio sem um byte, sem
// erro e sem nada na tela — o jeito de sair foi fechar o app.
const PRAZO_PEDIDO = 45_000;      // pedido comum, do começo ao fim
const PRAZO_PRIMEIRO_BYTE = 25_000; // streaming: tempo até o modelo começar
const PRAZO_SEM_DADOS = 20_000;     // streaming: silêncio no meio da resposta

/// Prazo para a PRIMEIRA palavra, por provedor.
///
/// A NVIDIA expirou nas duas últimas sessões antes de dizer qualquer coisa, e
/// o número não é a toa: medida em 27/10 com o prompt e as ferramentas reais, a
/// mediana da primeira palavra do nemotron-lightning é 664 ms. Ou seja, quando
/// ele passa de 25 segundos não é lentidão, é fila ou partida a frio do
/// endpoint gratuito — e aí 25 segundos é curto demais para o caso raro e
/// longo demais para o caso comum.
///
/// O custo de aumentar é silêncio: enquanto ela espera, não fala nada. Por isso
/// isto é por PROVEDOR e não para todos — 45 segundos dá margem para a partida
/// a frio da NVIDIA sem transformar um Gemini lotado em um minuto de silêncio.
const PRAZO_PRIMEIRO_BYTE_POR_PROVEDOR = {
  nvidia: 45_000,
};

const prazoPrimeiroByte = (provedor) =>
  PRAZO_PRIMEIRO_BYTE_POR_PROVEDOR[provedor] ?? PRAZO_PRIMEIRO_BYTE;

/// Abortador com prazo que pode ser renovado — o streaming precisa reiniciar a
/// contagem a cada pedaço que chega.
function comPrazo(ms, sinalExterno) {
  const ac = new AbortController();
  let timer = null;

  const disparar = () => ac.abort(new Error("tempo esgotado"));
  const renovar = (novo) => {
    clearTimeout(timer);
    timer = setTimeout(disparar, novo ?? ms);
  };
  renovar();

  // Cancelamento do usuário (Esc) chega por aqui.
  const repassar = () => ac.abort(new Error("cancelado"));
  sinalExterno?.addEventListener("abort", repassar, { once: true });

  return {
    signal: ac.signal,
    renovar,
    encerrar() {
      clearTimeout(timer);
      sinalExterno?.removeEventListener("abort", repassar);
    },
  };
}

/// Traduz a exceção de abortar em algo que o resto do código entende.
function erroDeAborto(err, sinalExterno, quem = "O Gemini") {
  if (err?.name !== "AbortError" && !/aborted|tempo esgotado|cancelado/i.test(err?.message || "")) {
    return err;
  }
  if (sinalExterno?.aborted) {
    const e = new Error("Cancelado.");
    e.cancelado = true;
    return e;
  }
  const e = new Error(`${quem} não respondeu a tempo.`);
  e.status = 504;
  return e;
}

async function geminiRequest(path, apiKey, body, sinal) {
  const prazo = comPrazo(PRAZO_PEDIDO, sinal);
  try {
    const res = await fetch(`${GEMINI_API}/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: prazo.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw erroGemini(res.status, data);
    return data;
  } catch (err) {
    throw erroDeAborto(err, sinal);
  } finally {
    prazo.encerrar();
  }
}

/// Mesma geração, só que lendo a resposta conforme ela sai (SSE).
///
/// Isto é o que tira a espera da conversa: em vez de ficar calada até o modelo
/// terminar o parágrafo inteiro, ela começa a falar assim que a PRIMEIRA frase
/// fecha. `onFrase` recebe cada frase pronta; o retorno continua tendo a mesma
/// forma do pedido normal, para quem chama não precisar saber da diferença.
async function geminiStream(modelo, apiKey, body, onFrase, sinal) {
  const prazo = comPrazo(PRAZO_PRIMEIRO_BYTE, sinal);
  try {
    return await lerFluxo(modelo, apiKey, body, onFrase, prazo);
  } catch (err) {
    throw erroDeAborto(err, sinal);
  } finally {
    prazo.encerrar();
  }
}

/// Junta o texto que chega picado e entrega FALAS inteiras.
///
/// É isto que tira a espera da conversa, e tem uma regra menos óbvia: uma frase
/// curta não vira fala sozinha. Sem isso, "Oi!" ia para a voz isolado e a fala
/// saía picotada; com isso, frases curtas se juntam à seguinte.
///
/// Mora aqui, fora do leitor do Gemini, porque todo provedor precisa dela —
/// e duas cópias disso acabariam divergindo justamente na regra sutil.
/// Junta os pedaços que chegam da rede e entrega FALAS inteiras.
///
/// Duas regras, e as duas são conserto de defeito visto na tela dele em 02/11:
///
///   | 06/11, 09:
///   00 | Resultado 1ª fase UEL |
///
/// 1. TERMINADOR NO FIM DO BUFFER NÃO É FIM DE FRASE. A versão anterior
///    aceitava `[.!?…:]` seguido de espaço OU DO FIM DA STRING — e o fim da
///    string, durante o streaming, é só onde o pedaço da rede foi cortado. Se
///    o corte caísse depois do "09:", aquilo virava uma fala, e o "00" virava
///    a seguinte. Quem fecha o resto é o `fechar()`, no fim de verdade.
/// 2. NÃO SE CORTA ENTRE DÍGITOS. "09:00", "1.500", "14:30" têm terminador no
///    meio por acidente de notação. Exigir espaço depois já resolveria o
///    "09:00", mas não "1. 500" nem uma lista numerada quebrando em "3. ",
///    então a regra é explícita.
function criarFalante(onFrase) {
  const MIN_FALA = 42;
  // Terminador seguido de espaço de verdade, e não precedido+seguido de dígito.
  // A quebra de linha continua valendo sozinha: é fim de ideia em qualquer caso.
  const FIM_DE_FRASE = /^([\s\S]*?(?<![0-9])[.!?…:](?![0-9])\s+|[\s\S]*?\n)/;
  let pendente = "";
  let lote = "";

  return {
    engolir(texto) {
      pendente += texto;
      while (true) {
        const m = pendente.match(FIM_DE_FRASE);
        if (!m) break;
        lote += m[1];
        pendente = pendente.slice(m[1].length);
        if (lote.trim().length >= MIN_FALA) {
          onFrase(lote.trim());
          lote = "";
        }
      }
    },
    fechar() {
      const resto = (lote + pendente).trim();
      if (resto) onFrase(resto);
      lote = "";
      pendente = "";
    },
  };
}

/// Lê um corpo SSE linha a linha e entrega cada objeto `data:` já desempacotado.
/// Vale para o Gemini e para qualquer API no formato da OpenAI: as duas mandam
/// `data: {...}` por linha, e as duas podem cortar uma linha no meio de um
/// pedaço da rede — daí a `sobra`.
async function lerEventos(corpo, prazo, aoDado) {
  const decoder = new TextDecoder();
  let sobra = "";

  for await (const pedaco of corpo) {
    // Cada pedaço que chega renova o prazo: o que não pode é ficar em silêncio.
    prazo.renovar(PRAZO_SEM_DADOS);
    sobra += decoder.decode(pedaco, { stream: true });
    const linhas = sobra.split("\n");
    sobra = linhas.pop() || "";

    for (const linha of linhas) {
      if (!linha.startsWith("data:")) continue;
      const cru = linha.slice(5).trim();
      if (!cru || cru === "[DONE]") continue;
      let dado;
      try {
        dado = JSON.parse(cru);
      } catch {
        continue; // pedaço inválido: ignora em vez de derrubar a resposta
      }
      aoDado(dado);
    }
  }
}

async function lerFluxo(modelo, apiKey, body, onFrase, prazo) {
  const res = await fetch(`${GEMINI_API}/models/${modelo}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: prazo.signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw erroGemini(res.status, data);
  }
  if (!res.body) throw new Error("resposta sem corpo");

  const partes = [];       // partes do modelo, na ordem (texto juntado + chamadas)
  let textoTotal = "";
  let bloqueio = null;
  let uso = null;          // consumo informado pelo próprio Google
  const falante = criarFalante(onFrase);

  await lerEventos(res.body, prazo, (dado) => {
    if (dado.error) throw erroGemini(dado.error.code || 500, dado);
    if (dado.promptFeedback?.blockReason) bloqueio = dado.promptFeedback.blockReason;
    // Vem no último pedaço e é acumulativo: o mais recente é o bom.
    if (dado.usageMetadata) uso = dado.usageMetadata;

    for (const parte of dado.candidates?.[0]?.content?.parts || []) {
      // Guarda a parte COMO VEIO. Os modelos novos do Gemini mandam um
      // `thoughtSignature` junto da chamada de ferramenta e exigem esse campo
      // de volta na próxima mensagem; remontar a parte à mão (só o
      // functionCall) jogava a assinatura fora e a API recusava a conversa
      // inteira com "Function call is missing a thought_signature".
      if (parte.text || parte.functionCall) partes.push(parte);

      if (parte.text) {
        textoTotal += parte.text;
        falante.engolir(parte.text);
      }
    }
  });

  falante.fechar();
  return {
    _streamed: true,
    _texto: textoTotal.trim(),
    // O saldo que o provedor informou nos cabeçalhos. Vale mais que qualquer
    // teto que eu escrevesse à mão: é a conta dele, da chave dele, agora.
    _limites: lerLimites(res.headers),
    usageMetadata: uso || undefined,
    promptFeedback: bloqueio ? { blockReason: bloqueio } : undefined,
    candidates: [{ content: { role: "model", parts: partes } }],
  };
}

/// Devolve TODOS os modelos utilizáveis, do mais preferido ao menos.
/// Guardamos a lista inteira porque o Google às vezes anuncia um modelo que
/// depois recusa a gerar — nesse caso a E.V. desce para o próximo sozinha.
function rankModels(data) {
  const usable = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => !GEMINI_EXCLUDE.test(n));

  usable.sort((a, b) => modelScore(b) - modelScore(a) || a.localeCompare(b));
  return usable.length ? usable : [GEMINI_FALLBACK];
}

function chooseModel(data) {
  return rankModels(data)[0];
}

/// Pergunta ao Google quais modelos a chave pode usar e escolhe o melhor gratuito.
/// Evita chutar nomes de modelo, que mudam com o tempo.
async function pickGeminiModel(apiKey) {
  try {
    return chooseModel(await geminiRequest("models", apiKey));
  } catch {
    return GEMINI_FALLBACK;
  }
}

/// Testa uma chave contra o Google. Serve para dois fins: validar na hora em que
/// o usuário cola a chave, e reconhecer formatos de chave que ainda não conhecemos.
async function checkGemini(apiKey) {
  try {
    const data = await geminiRequest("models", apiKey);
    return { ok: true, model: chooseModel(data) };
  } catch (err) {
    return { ok: false, status: err.status, error: err.message };
  }
}

/// Cota zerada: o Google devolve 429, mas com "limit: 0" — não é limite consumido,
/// é modelo que esta conta nunca pôde usar. Esperar não adianta; trocar de modelo sim.
function semCotaNesteModelo(err) {
  return err?.status === 429 && /limit:\s*0\b/i.test(err?.message || "");
}

/// Limite diário esgotado NESTE modelo. A cota diária é por modelo, então trocar
/// de modelo funciona — diferente do limite por minuto, onde só o tempo resolve.
function cotaDiariaEsgotada(err) {
  return err?.status === 429 && err?.cotaDiaria === true;
}

/// Modelo sobrecarregado: o 503 do Gemini não é erro da conta nem da chave, é
/// fila. O próprio Google diz que "costuma ser temporário", e na prática duas
/// coisas resolvem: esperar alguns segundos, ou pedir a OUTRO modelo — a fila é
/// por modelo. Antes isto virava "o serviço está instável" e parava por aí.
function sobrecarregado(err) {
  return (
    err?.status === 503 ||
    err?.status === 500 ||
    /overload|high demand|UNAVAILABLE|try again later/i.test(err?.message || "")
  );
}

/// Um modelo anunciado pela lista pode mesmo assim ser recusado na geração:
/// por não existir, por ter sido aposentado, por não ter cota nenhuma,
/// por ter esgotado a cota do dia ou por estar lotado agora.
/// O modelo existe, respondeu, e recusou o que a E.V.E precisa: conversar com
/// histórico e chamar ferramentas. Vem como 400, não como 404, e por isso
/// escapava do laço e virava um beco sem saída ("a função chamar não está
/// habilitada para esse modelo") em vez de simplesmente trocar de modelo.
function modeloInadequado(err) {
  return (
    err?.status === 400 &&
    /not enabled for this model|multiturn|function calling|does not support/i.test(err?.message || "")
  );
}

function modeloRecusado(err) {
  return (
    err?.status === 404 ||
    /not found|NOT_FOUND|not supported|no longer available/i.test(err?.message || "") ||
    modeloInadequado(err) ||
    semCotaNesteModelo(err) ||
    cotaDiariaEsgotada(err) ||
    sobrecarregado(err)
  );
}

/// Monta as partes da mensagem do usuário, com o arquivo anexado quando houver.
/// Texto entra como texto; imagem e PDF entram como inlineData, que é o que o
/// Gemini entende — é isso que deixa ela olhar um print e comentar.
function partesDoUsuario(texto, anexo) {
  const partes = [];
  // A ordem importa quando o anexo tem os DOIS (é o caso do PDF: o texto sai
  // daqui do Mac, e o arquivo inteiro também viaja). O Gemini lê o PDF de
  // verdade — vê tabela, figura e diagramação —, então para ele vale o
  // arquivo; o texto extraído seria a versão pobre da mesma coisa.
  if (anexo?.base64) {
    partes.push({ inlineData: { mimeType: anexo.mime, data: anexo.base64 } });
    partes.push({ text: `[arquivo anexado: ${anexo.nome}]` });
  } else if (anexo?.texto) {
    partes.push({ text: `[arquivo anexado: ${anexo.nome}]\n\n${anexo.texto}` });
  }
  partes.push({ text: texto });
  return partes;
}

/// Converte o consumo de um pedido no formato que o painel entende.
///
/// A regra é: o número MEDIDO manda. Os provedores informam o consumo junto da
/// resposta, cada um com o seu nome de campo. Só quando ninguém informa é que
/// estimamos por caracteres ÷ 4 — e aí marcamos `estimado`, porque estimativa
/// apresentada como medida é pior do que não ter número.
function relatarUso(onUso, provedor, modelo, resposta, corpo) {
  if (!onUso) return;
  const limites = resposta?._limites || null;

  const g = resposta?.usageMetadata;
  if (g && (g.promptTokenCount || g.candidatesTokenCount)) {
    return onUso({
      provedor,
      modelo,
      entrada: g.promptTokenCount || 0,
      saida: g.candidatesTokenCount || 0,
      estimado: false,
      limites,
    });
  }

  const o = resposta?.uso;
  if (o && (o.prompt_tokens || o.completion_tokens)) {
    return onUso({
      provedor,
      modelo,
      entrada: o.prompt_tokens || 0,
      saida: o.completion_tokens || 0,
      estimado: false,
      limites,
    });
  }

  const a = resposta?.usage;
  if (a && (a.input_tokens || a.output_tokens)) {
    return onUso({
      provedor,
      modelo,
      entrada: a.input_tokens || 0,
      saida: a.output_tokens || 0,
      estimado: false,
      limites,
    });
  }

  const entrada = corpo ? JSON.stringify(corpo).length / 4 : 0;
  const saida = (resposta?.texto || resposta?._texto || "").length / 4;
  onUso({ provedor, modelo, entrada, saida, estimado: true, limites });
}

class GeminiBrain {
  constructor({ apiKey, model, prompt }) {
    this.apiKey = apiKey;
    // Modelo salvo que não serve é como se não houvesse: a lista da conta é
    // consultada e ele nem entra. Foi assim que um transcritor gravado no
    // config.json derrubou a primeira frase de cada abertura, por horas.
    this.model = modeloServe(model) ? model : null;
    // O que está gravado em disco agora. Guardamos separado de `this.model`
    // porque um modelo salvo pode ser ruim: aí ele não vale em memória, mas
    // continua no arquivo até alguém escrever um bom em cima.
    this.modeloEmDisco = model || null;
    this.candidatos = this.model ? [this.model] : [];
    this.descartados = new Set(); // modelos que já recusaram nesta sessão
    this.contents = [];
    // Função que devolve o prompt do sistema atualizado (nome, estilo, hora,
    // estado da máquina). Sem ela, usa o prompt mínimo.
    this.prompt = prompt || (() => SYSTEM_PROMPT);

    // Quanto o modelo "pensa" antes de responder. Para uma assistente de voz,
    // pensar muito é latência pura: ela fica calada enquanto raciocina sobre
    // "abre o Spotify". O nome do ajuste mudou entre gerações, então começamos
    // pelo mais novo e descemos quando a API recusa.
    this.pensamento = "nivel"; // nivel → orcamento → nenhum
  }

  reset() {
    this.contents = [];
  }

  /// Esc no teclado chega aqui: derruba o pedido em andamento em vez de deixar
  /// a E.V.E "pensando" até o fim de uma resposta que ninguém mais quer.
  cancelar() {
    this.abortador?.abort(new Error("cancelado"));
  }

  configDeRaciocinio() {
    if (this.pensamento === "nivel") return { thinkingLevel: "low" };
    if (this.pensamento === "orcamento") return { thinkingBudget: 0 };
    return undefined;
  }

  /// Carrega a lista de modelos da conta, em ordem de preferência.
  async carregarCandidatos(onDebug) {
    try {
      const data = await geminiRequest("models", this.apiKey);
      const lista = rankModels(data).filter((m) => !this.descartados.has(m));
      onDebug?.("modelos disponíveis nesta conta: " + lista.join(", "));
      // Mantém o modelo salvo à frente, mas com os outros como reserva — a não
      // ser que ele já tenha recusado nesta sessão, caso em que insistir nele
      // só repetiria o mesmo erro.
      this.candidatos =
        this.model && !this.descartados.has(this.model)
          ? [this.model, ...lista.filter((m) => m !== this.model)]
          : lista;
    } catch (err) {
      onDebug?.("não consegui listar modelos: " + err.message);
      if (!this.candidatos.length) this.candidatos = [GEMINI_FALLBACK];
    }
    if (!this.candidatos.length) this.candidatos = [GEMINI_FALLBACK];
    if (!this.model || this.descartados.has(this.model)) this.model = this.candidatos[0];
  }

  /// Gera conteúdo, descendo para o próximo modelo se o atual for recusado.
  async gerar(body, { onDebug, onModel, onFrase }) {
    if (!this.candidatos.length) await this.carregarCandidatos(onDebug);
    const sinal = this.abortador?.signal;
    const preferido = this.model; // para onde voltar depois de uma espera

    // Se já saiu fala pelo streaming, repetir o pedido faria a E.V.E falar o
    // começo de novo. Nesse caso o erro sobe e quem chama decide.
    let jaFalou = false;
    let semStream = false;
    const emitir = onFrase
      ? (frase) => {
          jaFalou = true;
          onFrase(frase);
        }
      : null;

    let ultimoErro = null;
    // Basta UM modelo recusado por cota zero para o diagnóstico ser "conta sem
    // plano gratuito": os outros costumam falhar por estarem aposentados, o que
    // não muda o que o usuário precisa fazer.
    let algumSemCota = false;
    let algumaDiaria = false;
    let algumaSobrecarga = false;
    let esperas = 0;
    let esperasFila = 0;
    let recarregou = false;

    // Gravar a troca só depois que o modelo novo entregar uma resposta. Antes
    // gravávamos no instante da troca, e bastava a E.V.E descer a lista inteira
    // numa tarde de cota esgotada para o ÚLTIMO modelo tentado — o que falhou —
    // ficar salvo em disco. Era o que estava no config.json dele.
    // Fila (503) é temporária: se a troca foi só para furar uma lotação, ela
    // vale para esta pergunta e não vira preferência gravada — senão cinco
    // minutos de pico mudariam o modelo dela para sempre.
    let trocaDefinitiva = false;
    const aprovar = (resposta) => {
      // Grava quando o que respondeu é diferente do que está no arquivo — e a
      // diferença não é só uma lotação de momento. Isso cobre também o caso de
      // o arquivo guardar um modelo imprestável: nesse caso a primeira resposta
      // boa limpa o arquivo sozinha, sem o usuário mexer em nada.
      const vale = trocaDefinitiva || !modeloServe(this.modeloEmDisco);
      if (vale && this.model !== this.modeloEmDisco) {
        this.modeloEmDisco = this.model;
        onModel?.(this.model);
      }
      return resposta;
    };

    for (let tentativa = 0; tentativa < this.candidatos.length + 3; tentativa++) {
      try {
        if (!emitir || semStream) {
          return aprovar(await geminiRequest(
            `models/${this.model}:generateContent`, this.apiKey, body, sinal
          ));
        }
        const fluxo = await geminiStream(this.model, this.apiKey, body, emitir, sinal);
        // Endpoint que aceitou o pedido mas não devolveu nada em SSE: repete
        // pelo caminho normal, uma vez, antes de dar a volta por vazio.
        if (!fluxo.candidates[0].content.parts.length && !fluxo.promptFeedback && !jaFalou) {
          semStream = true;
          onDebug?.("streaming não devolveu conteúdo; repetindo sem streaming");
          continue;
        }
        return aprovar(fluxo);
      } catch (err) {
        // Esc: sai na hora, sem tentar outro modelo nem explicar erro nenhum.
        if (err.cancelado || sinal?.aborted) {
          const parado = new Error("Cancelado.");
          parado.cancelado = true;
          throw parado;
        }
        if (jaFalou) throw err;
        // Limite POR MINUTO: aqui esperar resolve de verdade. O Google informa
        // quantos segundos faltam, então a E.V. aguarda e tenta de novo sozinha,
        // em vez de devolver um erro que o usuário teria que contornar na mão.
        if (err.status === 429 && err.cotaPorMinuto && !err.cotaDiaria && esperas < 2) {
          const segundos = Math.min(err.esperarSegundos || 8, 25);
          esperas++;
          onDebug?.(`limite por minuto atingido; aguardando ${segundos}s e repetindo`);
          await new Promise((r) => setTimeout(r, segundos * 1000));
          continue; // mesma pergunta, mesmo modelo
        }

        // Modelo LOTADO (503). A fila é POR MODELO, e esta conta tem dezoito
        // modelos: trocar custa zero e resolve na hora, enquanto esperar custa
        // segundos de silêncio. A ordem antes era a inversa — esperava 1,5 s,
        // depois 4 s, e só então trocava; numa tarde em que o flash-latest
        // viveu lotado, isso virou cinco segundos e meio em cada pergunta.
        // Agora a espera é o último recurso, quando acabam os modelos.
        const porFila = sobrecarregado(err);
        if (porFila) {
          algumaSobrecarga = true;
          // Antes de concluir "não tem para onde ir", confira a lista inteira:
          // quem começa com um modelo salvo tem UM candidato só.
          if (!recarregou) {
            recarregou = true;
            await this.carregarCandidatos(onDebug);
          }

          const outros = this.candidatos.filter((m) => m !== this.model);
          if (!outros.length && esperasFila < 2) {
            const espera = [1500, 4000][esperasFila++];
            onDebug?.(`todos os modelos lotados; esperando ${espera} ms`);
            await new Promise((r) => setTimeout(r, espera));
            // Depois da espera, recomeça pelo preferido: a fila dele pode ter
            // andado, e ele é o melhor da lista.
            this.model = preferido;
            await this.carregarCandidatos(onDebug);
            continue;
          }
        }

        // A API recusou o ajuste de raciocínio: desce para a forma anterior e
        // repete. Acontece no máximo duas vezes por sessão.
        if (err.status === 400 && /thinking|thought.?(level|budget)/i.test(err.message) && this.pensamento !== "nenhum") {
          this.pensamento = this.pensamento === "nivel" ? "orcamento" : "nenhum";
          const novo = this.configDeRaciocinio();
          if (body.generationConfig) body.generationConfig.thinkingConfig = novo;
          onDebug?.(`este modelo não aceita esse ajuste de raciocínio; usando "${this.pensamento}"`);
          continue;
        }

        if (!modeloRecusado(err)) throw err;
        ultimoErro = err;
        if (semCotaNesteModelo(err)) algumSemCota = true;
        if (cotaDiariaEsgotada(err)) algumaDiaria = true;
        if (porFila) algumaSobrecarga = true;
        onDebug?.(`modelo ${this.model} recusado (${err.message}); tentando o próximo`);

        // Na primeira recusa de verdade, recarrega a lista — ela pode ter mudado,
        // e quem foi criado com um modelo salvo começa com UM candidato só.
        // (Prender isto à primeira volta do laço não bastava: as esperas por
        // fila e por limite por minuto consomem voltas sem chegar aqui, e aí a
        // lista nunca era carregada — ficávamos sem para onde ir.)
        if (!recarregou) {
          recarregou = true;
          await this.carregarCandidatos(onDebug);
        }

        // Fila e cota voltam ao normal; modelo que não conversa nunca vai
        // conversar. Esse fica anotado para a sessão inteira, para que uma
        // recarga da lista não o traga de volta para a frente da fila.
        if (modeloInadequado(err)) this.descartados.add(this.model);
        if (!porFila) trocaDefinitiva = true;
        this.candidatos = this.candidatos.filter((m) => m !== this.model);
        if (!this.candidatos.length) break;
        this.model = this.candidatos[0];
      }
    }

    const erro = new Error(
      `Nenhum modelo do Gemini aceitou o pedido. Último erro: ${ultimoErro?.message || "desconhecido"}`
    );
    erro.status = ultimoErro?.status;
    erro.semModelo = true;
    erro.semCota = algumSemCota;
    erro.cotaDiaria = algumaDiaria;
    erro.sobrecarga = algumaSobrecarga;
    erro.esperarSegundos = ultimoErro?.esperarSegundos;
    throw erro;
  }

  async ask(userText, { onSay, onTool, onDebug, onModel, onUso, canal, anexo }) {
    if (!this.model) await this.carregarCandidatos(onDebug);
    this.abortador = new AbortController();
    this.contents.push({ role: "user", parts: partesDoUsuario(userText, anexo) });
    this.contents = podarHistorico(this.contents, FORMATO_GEMINI, tetoDe("gemini"));
    const rodar = guardaDeRepeticao();

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let corpoDoPedido = null;
      const data = await this.gerar(
        (corpoDoPedido = {
          systemInstruction: { parts: [{ text: this.prompt({ canal }) }] },
          contents: this.contents,
          tools: geminiTools(),
          // Resposta falada é curta; teto menor fecha a geração mais cedo.
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: canal === "texto" ? 2048 : 1024,
            thinkingConfig: this.configDeRaciocinio(),
          },
        }),
        // Falar frase a frase, conforme chegam: é isto que tira a espera.
        { onDebug, onModel, onFrase: onSay }
      );

      relatarUso(onUso, "gemini", this.model, data, corpoDoPedido);

      if (data.promptFeedback?.blockReason) {
        onSay("Não posso responder isso.");
        return;
      }

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      this.contents.push({ role: "model", parts });

      // No streaming as frases já saíram durante a geração; falar de novo aqui
      // repetiria tudo.
      if (!data._streamed) {
        for (const part of parts) {
          if (part.text?.trim()) onSay(part.text.trim());
        }
      }

      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      if (!calls.length) return;

      const answers = [];
      for (const call of calls) {
        onTool(call.name, call.args || {});
        const output = await rodar(call.name, call.args || {});
        let parsed;
        try {
          parsed = JSON.parse(output);
        } catch {
          parsed = { result: output };
        }
        answers.push({ functionResponse: { name: call.name, response: parsed } });
      }
      this.contents.push({ role: "user", parts: answers });
    }

    onSay("Executei vários passos e ainda não terminei. Quer que eu continue?");
  }
}

// ===========================================================================
// Provedores no formato da OpenAI — Groq, Mistral, Cerebras, OpenRouter
// ===========================================================================
// Estes quatro falam o MESMO protocolo (`POST /v1/chat/completions`, com o
// mesmo formato de ferramentas). Por isso um adaptador só abre os quatro: o que
// muda entre eles é o endereço, o nome do modelo e onde se pega a chave.
//
// Por que eles existem aqui ao lado do Gemini: a conta gratuita do Google
// acabou no meio de uma tarde e deixou a E.V.E muda. O Groq é a inferência
// mais rápida que existe hoje (importa para voz) e o Mistral tem o teto mais
// alto (~1 bilhão de tokens/mês), então serve de rede quando os outros secam.
const PROVEDORES = {
  groq: {
    nome: "Groq",
    base: () => process.env.EV_GROQ_API || "https://api.groq.com/openai/v1",
    modelo: "llama-3.3-70b-versatile",
    chaveEm: "https://console.groq.com/keys",
    // Pedindo isto, o Groq devolve o consumo no último pedaço do streaming —
    // e aí o painel mostra número medido em vez de estimativa.
    extra: { stream_options: { include_usage: true } },
  },
  mistral: {
    nome: "Mistral",
    base: () => process.env.EV_MISTRAL_API || "https://api.mistral.ai/v1",
    modelo: "mistral-medium-latest",
    chaveEm: "https://console.mistral.ai/api-keys",
  },
  nvidia: {
    nome: "NVIDIA NIM",
    base: () => process.env.EV_NVIDIA_API || "https://integrate.api.nvidia.com/v1",
    // O `lightning-30b-a3b` e não o `ultra-550b`. Medido com o prompt e as 24
    // ferramentas reais, em 27/10: mediana da primeira palavra de 664 ms
    // contra 1.052 ms do ultra, e no caminho com ferramenta a diferença vai de
    // 449–1.353 ms para 906–5.994 ms. Em sete pedidos de teste os dois
    // escolheram a MESMA ferramenta — a precisão não é o que se paga aqui.
    // É um MoE de 30 B com 3 B ativos: pouca memória ligada por token.
    //
    // O `bolt-e4b` é ainda mais rápido (455 ms) e foi descartado por medida,
    // não por desconfiança: em sete casos ele deixou de chamar a ferramenta
    // três vezes, e em vez disso DESCREVIA o que ia fazer ("vou salvar esta
    // conversa, quer dar um título?") sem nunca fazer. Numa assistente que
    // age, isso é pior do que ser lenta.
    modelo: "nvidia/nemotron-3.5-lightning-30b-a3b",
    chaveEm: "https://build.nvidia.com",
    // O nemotron é um modelo de raciocínio: por padrão ele "pensa" antes de
    // responder, e manda esse pensamento em `reasoning_content`. Para voz isso
    // é latência pura antes da primeira palavra, e os tokens de raciocínio
    // saem da mesma cota. Desligamos — é a mesma decisão que já tomamos no
    // Gemini com o thinkingLevel baixo. No lightning isso vale ainda mais:
    // medindo sem este ajuste ele gastava 526 caracteres pensando antes de
    // falar, e ficava MAIS lento que o ultra no caminho com ferramenta.
    extra: { chat_template_kwargs: { enable_thinking: false } },
  },
  cerebras: {
    nome: "Cerebras",
    base: () => process.env.EV_CEREBRAS_API || "https://api.cerebras.ai/v1",
    modelo: "llama-3.3-70b",
    chaveEm: "https://cloud.cerebras.ai",
  },
  openrouter: {
    nome: "OpenRouter",
    base: () => process.env.EV_OPENROUTER_API || "https://openrouter.ai/api/v1",
    // O padrão anterior era "meta-llama/llama-3.3-70b-instruct:free", e ele
    // MORREU: em 01/11 o OpenRouter responde 404 com "This model is
    // unavailable for free. The paid version is available now". Um padrão
    // gratuito é uma data de validade que ninguém anotou.
    //
    // Medido em 01/11 entre os 14 modelos gratuitos do OpenRouter que aceitam
    // ferramenta: este foi o único que respondeu em todas as repetições E
    // chamou a ferramenta todas as vezes (2/2). O cohere/north-mini-code:free
    // chamou 1/2, o google/gemma-4-31b-it:free devolveu erro do provedor e o
    // thinkingmachines/inkling-small:free só atende harness agêntico.
    modelo: "nvidia/nemotron-3.5-lightning:free",
    chaveEm: "https://openrouter.ai/keys",
  },
};

/// As 18 ferramentas no formato da OpenAI. O schema interno já é JSON Schema,
/// que é exatamente o que esse formato espera — diferente do Gemini, que exige
/// os tipos em MAIÚSCULAS e uma conversão à parte.
function ferramentasOpenAI() {
  return toolDefinitions.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

/// Conteúdo da mensagem do usuário, com anexo quando houver.
function conteudoOpenAI(texto, anexo) {
  if (!anexo) return texto;
  if (anexo.texto) return `[arquivo anexado: ${anexo.nome}]\n\n${anexo.texto}\n\n${texto}`;
  if (anexo.base64 && /^image\//.test(anexo.mime || "")) {
    return [
      { type: "image_url", image_url: { url: `data:${anexo.mime};base64,${anexo.base64}` } },
      { type: "text", text: texto },
    ];
  }
  // Chega aqui o que não é imagem e não teve texto extraído. PDF já não cai
  // mais neste caso: o texto dele sai do próprio Mac antes do anexo partir.
  return `[anexo "${anexo.nome}" não pode ser lido por este provedor; diga isso a ele]\n\n${texto}`;
}

/// Quantos segundos o provedor pediu para esperar, se pediu.
///
/// O comentário que estava aqui dizia que nenhum provedor no formato OpenAI
/// manda RetryInfo como o Google. Era falso, e custou contexto: o Groq diz
/// "Please try again in 615ms" no corpo e manda `retry-after` no cabeçalho.
/// Sem ler isso, 615 milissegundos viravam uma troca de provedor — e trocar
/// de provedor JOGA O HISTÓRICO FORA, porque cada cérebro guarda a conversa
/// no formato da sua própria API. Ela perdia a conversa para economizar meio
/// segundo.
function segundosDeEspera(headers, msg) {
  const cab = headers?.get?.("retry-after");
  if (cab) {
    const n = parseFloat(cab);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const texto = String(msg || "");
  // "1m30s" vem ANTES da forma de unidade única, porque contém um "30s" que a
  // outra regra leria sozinho — e perder o minuto é esperar 30s quando o
  // provedor pediu 90, estourar de novo e trocar à toa.
  const comMinuto = texto.match(/try again in\s*(\d+)m\s*([\d.]+)s\b/i);
  if (comMinuto) {
    const minutos = Number(comMinuto[1]);
    const segundos = parseFloat(comMinuto[2]);
    if (Number.isFinite(minutos) && Number.isFinite(segundos)) return minutos * 60 + segundos;
  }
  // "615ms", "2.5s", "90s".
  const simples = texto.match(/try again in\s*([\d.]+)\s*(ms|s)\b/i);
  if (!simples) return null;
  const valor = parseFloat(simples[1]);
  if (!Number.isFinite(valor)) return null;
  return simples[2].toLowerCase() === "ms" ? valor / 1000 : valor;
}

function erroOpenAI(status, data, nome, headers) {
  const msg =
    data?.error?.message || data?.message || data?.detail || `${nome} devolveu ${status}`;
  const err = new Error(msg);
  err.status = status;
  if (status === 429) {
    err.limiteBatido = true;
    // Pode ser null: o provedor que não diz quanto esperar continua caindo
    // na troca de provedor, que é o que sempre foi.
    err.esperarSegundos = segundosDeEspera(headers, msg);
  }
  if (status === 401 || status === 403) err.chaveRuim = true;
  // 413: a mensagem não CABE neste provedor. Não é limite por tempo, então
  // esperar não resolve — mas outro provedor resolve, porque a janela dele é
  // outra (o nemotron da NVIDIA passa de 100 mil tokens, o Groq dá 8 mil).
  // E a troca descarta o histórico, o que por si já encolhe a mensagem.
  // Antes isto subia como erro cru para ele: "erro da API: 413".
  if (status === 413) err.pedidoGrande = true;
  return err;
}

/// O provedor respondeu, mas não faz tool use — ou o modelo dele não faz.
///
/// Isto existe porque "compatível com a OpenAI" não garante ferramentas: cada
/// provedor gratuito suporta um subconjunto, e nenhum deles publica isso de
/// forma confiável. Sem a E.V.E saber usar ferramentas, ela é um chat inútil
/// neste app — então um provedor assim não é "um erro", é um provedor que não
/// serve, e o certo é passar para o próximo em vez de morrer com 400.
function ferramentaNaoSuportada(err) {
  const m = err?.message || "";
  return (
    (err?.status === 400 || err?.status === 422) &&
    /tool|function/i.test(m) &&
    /not support|unsupported|not enabled|not available|invalid/i.test(m)
  );
}

/// Provedor esgotado ou indisponível: vale trocar de provedor, não insistir.
function provedorEsgotado(err) {
  return (
    err?.limiteBatido === true ||
    err?.pedidoGrande === true ||
    err?.chaveRuim === true ||
    err?.status === 402 ||
    err?.status === 404 ||
    err?.semModelo === true ||
    err?.semCota === true ||
    err?.cotaDiaria === true ||
    err?.status === 503 ||
    err?.status === 504 ||
    err?.respostaVazia === true ||
    ferramentaNaoSuportada(err)
  );
}

// Modelos que estes provedores anunciam e que não servem para conversar com
// ferramentas. Mesma régua do Gemini, pelo mesmo motivo: descobrir pelo erro
// custa uma pergunta perdida.
const OPENAI_EXCLUDE =
  /whisper|tts|embed|rerank|moderation|guard|safeguard|vision|image|audio|transcribe|ocr|distil|orpheus|playai|sonic|bark|dia-/i;

/// Nota de preferência. O que mais pesa é o tamanho: escolher entre 20
/// ferramentas é justamente onde o modelo pequeno erra. Daí o 8b-instant do
/// Groq, que é rápido, ficar ATRÁS do 70b — a troca de latência por acerto
/// vale a pena quando a resposta errada custa uma ação errada no computador.
function scoreOpenAI(id) {
  let s = 0;
  const tamanho = id.match(/(\d+)\s*b\b/i);
  if (tamanho) s += Math.min(parseInt(tamanho[1], 10), 400) / 10;
  if (/instruct|versatile|chat/i.test(id)) s += 8;
  if (/instant|mini|lite|small|tiny/i.test(id)) s -= 6;
  if (/preview|alpha|beta|experimental/i.test(id)) s -= 10;
  if (/thinking|reasoning/i.test(id)) s -= 5; // em voz, pensar é latência
  return s;
}

function rankOpenAI(ids) {
  return ids
    .filter((id) => id && !OPENAI_EXCLUDE.test(id))
    .sort((a, b) => scoreOpenAI(b) - scoreOpenAI(a) || a.localeCompare(b));
}

/// O modelo não existe nesta conta. É um 404 ou um 400 falando do modelo, e a
/// reação certa NÃO é trocar de provedor: é perguntar ao provedor quais modelos
/// ele tem. Foi exatamente isto que faltou — um nome fixo no código envelheceu,
/// o Groq respondeu "does not exist or you do not have access to it", e a
/// E.V.E abandonou um provedor que estava perfeitamente disponível.
function modeloNaoExiste(err) {
  return (
    err?.status === 404 ||
    /does not exist|do not have access|model_not_found|unknown model|no such model|decommissioned/i.test(
      err?.message || ""
    )
  );
}

/// Testa uma chave pedindo a lista de modelos. Serve para o usuário saber na
/// hora se colou a chave certa, em vez de descobrir na primeira pergunta.
async function checkOpenAI(provider, apiKey) {
  const def = PROVEDORES[provider];
  if (!def) return { ok: false, error: `provedor desconhecido: ${provider}` };
  const prazo = comPrazo(15_000);
  try {
    const res = await fetch(`${def.base()}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: prazo.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = erroOpenAI(res.status, data, def.nome, res.headers);
      return { ok: false, status: res.status, error: err.message };
    }
    const modelos = (data.data || []).map((m) => m.id).filter(Boolean);
    return { ok: true, modelos };
  } catch (err) {
    return { ok: false, error: err?.message || "falha ao falar com o provedor" };
  } finally {
    prazo.encerrar();
  }
}

class OpenAIBrain {
  constructor({ apiKey, model, prompt, provider }) {
    const def = PROVEDORES[provider];
    if (!def) throw new Error(`provedor desconhecido: ${provider}`);
    this.provider = provider;
    this.def = def;
    this.apiKey = apiKey;
    this.model = model || def.modelo;
    this.candidatos = [];
    this.descartados = new Set();
    this.messages = [];
    this.prompt = prompt || (() => SYSTEM_PROMPT);
  }

  reset() {
    this.messages = [];
  }

  cancelar() {
    this.abortador?.abort(new Error("cancelado"));
  }

  /// Pergunta ao provedor quais modelos ele tem, em ordem de preferência.
  async carregarCandidatos(onDebug) {
    const teste = await checkOpenAI(this.provider, this.apiKey);
    if (!teste.ok) {
      onDebug?.(`não consegui listar modelos do ${this.def.nome}: ${teste.error}`);
      return;
    }
    this.candidatos = rankOpenAI(teste.modelos).filter((m) => !this.descartados.has(m));
    onDebug?.(`modelos do ${this.def.nome}: ${this.candidatos.slice(0, 8).join(", ")}`);
  }

  /// Geração que não desiste do provedor por causa do nome do modelo.
  async gerarComModeloValido(corpo, onFrase, onDebug, onModeloProvedor) {
    let falou = false;
    const emitir = (f) => {
      falou = true;
      onFrase(f);
    };

    for (let tentativa = 0; tentativa < 4; tentativa++) {
      try {
        return await this.gerar({ ...corpo, model: this.model }, emitir, onDebug);
      } catch (err) {
        // Se já falou, repetir faria a resposta sair com o começo duplicado.
        if (err.cancelado || falou || !modeloNaoExiste(err)) throw err;

        onDebug?.(`${this.def.nome}: modelo ${this.model} não existe nesta conta; procurando outro`);
        this.descartados.add(this.model);
        if (!this.candidatos.length) await this.carregarCandidatos(onDebug);
        this.candidatos = this.candidatos.filter((m) => !this.descartados.has(m));
        if (!this.candidatos.length) throw err;

        this.model = this.candidatos[0];
        // Grava o modelo que funcionou, para a próxima abertura já começar
        // certa em vez de pagar a descoberta de novo.
        onModeloProvedor?.(this.provider, this.model);
      }
    }
    throw new Error(`nenhum modelo do ${this.def.nome} aceitou o pedido`);
  }

  /// Uma rodada de geração, lendo a resposta conforme ela sai.
  /// Devolve { texto, chamadas } — as chamadas de ferramenta já remontadas.
  async gerar(corpo, onFrase, onDebug) {
    const sinal = this.abortador?.signal;
    const prazo = comPrazo(prazoPrimeiroByte(this.provider), sinal);
    try {
      const res = await fetch(`${this.def.base()}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ ...corpo, ...(this.def.extra || {}), stream: true }),
        signal: prazo.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw erroOpenAI(res.status, data, this.def.nome, res.headers);
      }
      if (!res.body) throw new Error("resposta sem corpo");

      const limites = lerLimites(res.headers);
      const falante = criarFalante(onFrase);
      let texto = "";
      // Modelos de raciocínio mandam o pensamento num campo separado. Ele NÃO
      // é fala: ler isso em voz alta seria ela narrando o próprio rascunho.
      // Guardamos só o tamanho, porque ele explica uma resposta vazia.
      let pensamento = 0;
      let uso = null; // consumo informado pelo provedor, quando ele informa
      // As chamadas de ferramenta chegam FATIADAS: o nome num pedaço, os
      // argumentos letra a letra nos seguintes, identificados só pelo `index`.
      // Montar isso errado é o jeito clássico de quebrar tool use em streaming.
      const emMontagem = new Map();

      await lerEventos(res.body, prazo, (dado) => {
        if (dado.error) throw erroOpenAI(dado.error.code || 500, dado, this.def.nome);
        // O Groq manda em `x_groq.usage`; o resto do mundo, em `usage`.
        if (dado.usage || dado.x_groq?.usage) uso = dado.usage || dado.x_groq.usage;
        const delta = dado.choices?.[0]?.delta;
        if (!delta) return;

        if (delta.reasoning_content) pensamento += delta.reasoning_content.length;

        if (delta.content) {
          texto += delta.content;
          falante.engolir(delta.content);
        }

        for (const pedaco of delta.tool_calls || []) {
          const i = pedaco.index ?? 0;
          if (!emMontagem.has(i)) emMontagem.set(i, { id: "", name: "", args: "" });
          const alvo = emMontagem.get(i);
          if (pedaco.id) alvo.id = pedaco.id;
          if (pedaco.function?.name) alvo.name += pedaco.function.name;
          if (pedaco.function?.arguments) alvo.args += pedaco.function.arguments;
        }
      });

      falante.fechar();

      const chamadas = [...emMontagem.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, c]) => c)
        .filter((c) => c.name);

      // Nada de volta — nem fala, nem ferramenta. Sem isto a E.V.E ficava
      // simplesmente muda, que é o pior jeito de falhar: parece que ela ignorou
      // você. Num modelo de raciocínio o motivo costuma ser gastar a resposta
      // inteira pensando, e aí a mensagem precisa dizer isso.
      if (!texto.trim() && !chamadas.length) {
        const err = new Error(
          pensamento > 0
            ? `${this.def.nome} gastou a resposta raciocinando e não respondeu nada.`
            : `${this.def.nome} devolveu uma resposta vazia.`
        );
        err.status = 502;
        err.respostaVazia = true;
        throw err;
      }

      return { texto, chamadas, uso, limites };
    } catch (err) {
      throw erroDeAborto(err, sinal, `O ${this.def.nome}`);
    } finally {
      prazo.encerrar();
    }
  }

  async ask(userText, { onSay, onTool, onDebug, canal, anexo, onModeloProvedor, onUso }) {
    this.abortador = new AbortController();
    this.messages.push({ role: "user", content: conteudoOpenAI(userText, anexo) });
    this.messages = podarHistorico(this.messages, FORMATO_OPENAI, tetoDe(this.provider));
    const rodar = guardaDeRepeticao();

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let corpoDoPedido = null;
      const { texto, chamadas, uso, limites } = await this.gerarComModeloValido(
        (corpoDoPedido = {
          messages: [{ role: "system", content: this.prompt({ canal }) }, ...this.messages],
          tools: ferramentasOpenAI(),
          temperature: 0.6,
          max_tokens: canal === "texto" ? 2048 : 1024,
        }),
        onSay,
        onDebug,
        onModeloProvedor
      );

      relatarUso(onUso, this.provider, this.model, { uso, texto, _limites: limites }, corpoDoPedido);

      // O histórico precisa guardar a chamada no formato que a API devolveu,
      // senão a resposta da ferramenta no turno seguinte fica órfã e o pedido
      // é recusado.
      const assistente = { role: "assistant", content: texto || null };
      if (chamadas.length) {
        assistente.tool_calls = chamadas.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.args || "{}" },
        }));
      }
      this.messages.push(assistente);

      if (!chamadas.length) return;

      for (const chamada of chamadas) {
        let args = {};
        try {
          args = chamada.args ? JSON.parse(chamada.args) : {};
        } catch {
          onDebug?.(`argumentos inválidos em ${chamada.name}: ${chamada.args}`);
        }
        onTool(chamada.name, args);
        const saida = await rodar(chamada.name, args);
        this.messages.push({ role: "tool", tool_call_id: chamada.id, content: saida });
      }
    }

    onSay("Executei vários passos e ainda não terminei. Quer que eu continue?");
  }
}

// ===========================================================================
// Anthropic Claude — mantido para quem tiver créditos
// ===========================================================================
/// Mesma ideia de partesDoUsuario, no formato da Anthropic.
function conteudoClaude(texto, anexo) {
  if (!anexo) return texto;
  const blocos = [];
  if (anexo.texto) {
    blocos.push({ type: "text", text: `[arquivo anexado: ${anexo.nome}]\n\n${anexo.texto}` });
  } else if (anexo.base64 && /^image\//.test(anexo.mime || "")) {
    blocos.push({
      type: "image",
      source: { type: "base64", media_type: anexo.mime, data: anexo.base64 },
    });
  } else if (anexo.base64 && anexo.mime === "application/pdf") {
    blocos.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: anexo.base64 },
    });
  }
  blocos.push({ type: "text", text: texto });
  return blocos;
}

class ClaudeBrain {
  constructor({ apiKey, model, prompt }) {
    const Anthropic = require("@anthropic-ai/sdk");
    this.client = new Anthropic({ apiKey });
    // claude-opus-5-5 é o Opus atual: mesma família, mais barato que o
    // claude-opus-5 ($4/$20 por milhão de tokens contra $5/$25) e compatível
    // com o que este caminho já manda — thinking adaptativo, effort explícito
    // (o padrão dele é "medium", que é o que pedimos), tool_choice não forçado
    // e sem prefill. As três mudanças que quebram código do Opus 5 não nos
    // tocam, então a troca é só preço para baixo.
    this.model = model || "claude-opus-5-5";
    this.messages = [];
    this.prompt = prompt || (() => SYSTEM_PROMPT);
  }

  reset() {
    this.messages = [];
  }

  /// O SDK da Anthropic não expõe o pedido em andamento aqui; existe para a
  /// interface poder chamar cancelar() sem saber qual cérebro está ativo.
  cancelar() {}

  async ask(userText, { onSay, onTool, canal, anexo, onUso }) {
    this.messages.push({ role: "user", content: conteudoClaude(userText, anexo) });
    this.messages = podarHistorico(this.messages, FORMATO_CLAUDE, tetoDe("anthropic"));
    const rodar = guardaDeRepeticao();

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: this.prompt({ canal }),
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        tools: toolDefinitions,
        messages: this.messages,
      });

      relatarUso(onUso, "anthropic", this.model, response, null);
      this.messages.push({ role: "assistant", content: response.content });

      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) onSay(block.text.trim());
      }

      if (response.stop_reason !== "tool_use") return;

      const results = [];
      for (const call of response.content.filter((b) => b.type === "tool_use")) {
        onTool(call.name, call.input);
        const output = await rodar(call.name, call.input);
        results.push({ type: "tool_result", tool_use_id: call.id, content: output });
      }
      this.messages.push({ role: "user", content: results });
    }

    onSay("Executei vários passos e ainda não terminei. Quer que eu continue?");
  }
}

// ===========================================================================
// A corrente: quando um provedor seca, o próximo responde
// ===========================================================================
// Ordem de socorro. O Mistral vem por último de propósito: é o de teto mais
// alto (~1 bi de tokens/mês), então é o que faz sentido guardar como rede.
/// Ordem da reserva. O Groq era o primeiro porque é a inferência mais rápida
/// que existe, e numa voz a latência é o que se sente. Deixou de valer:
///
/// Com 27 ferramentas, cada pedido carrega ~3.140 tokens antes de qualquer
/// conversa, e o plano gratuito do Groq dá 8.000 tokens POR MINUTO. São dois
/// pedidos — e uma pergunta com ferramenta gasta isso só para começar. Então o
/// primeiro da reserva era justamente o mais propenso a recusar, e recusar
/// depois de assumir é pior do que não assumir: a troca de provedor descarta o
/// histórico, então ela perdia a conversa para cair num provedor que também ia
/// falhar. Foi a cascata de 31/10: nvidia expirou → groq 429 → gemini lotado
/// → 504, com o histórico jogado fora duas vezes no caminho.
///
/// O Gemini assume a frente porque o trabalho da reserva é RESPONDER. Ele tem
/// limite folgado, muitos modelos para tentar, e o código já sabe esperar os
/// segundos que ele pede. Velocidade não vale nada quando a resposta é 429.
/// O Groq continua na corrente, só não na frente dela.
const ORDEM_RESERVA = ["gemini", "anthropic", "nvidia", "cerebras", "openrouter", "groq", "mistral"];

/// Onde está a chave de cada provedor. A chave principal (`apiKey`) continua
/// valendo para o provedor escolhido, para não quebrar quem já tinha o config
/// montado antes da corrente existir.
function chaveDe(config, provider) {
  const propria = {
    gemini: config.geminiKey,
    anthropic: config.anthropicKey,
    groq: config.groqKey,
    mistral: config.mistralKey,
    nvidia: config.nvidiaKey,
    cerebras: config.cerebrasKey,
    openrouter: config.openrouterKey,
  }[provider];
  if (propria?.trim()) return propria.trim();

  const principal = (process.env.ANTHROPIC_API_KEY || config.apiKey || "").trim();
  if (!principal) return "";
  const dono = config.provider || detectProvider(principal);
  return dono === provider ? principal : "";
}

function construir(provider, { key, model, prompt }) {
  if (provider === "gemini") return new GeminiBrain({ apiKey: key, model, prompt });
  if (provider === "anthropic") return new ClaudeBrain({ apiKey: key, model, prompt });
  if (PROVEDORES[provider]) return new OpenAIBrain({ apiKey: key, model, prompt, provider });
  return null;
}

/// Tenta o provedor principal e desce para o próximo quando ele SECA — limite
/// batido, chave recusada, nenhum modelo disponível.
///
/// Duas regras que não são óbvias:
///   • se o provedor já começou a FALAR, o erro sobe. Repetir a pergunta em
///     outro provedor faria a E.V.E dizer o começo da resposta duas vezes.
///   • a troca é definitiva pela sessão. Voltar ao principal a cada pergunta
///     significaria pagar o erro dele de novo toda vez.
class CadeiaDeCerebros {
  constructor(etapas, { prompt }) {
    this.etapas = etapas; // [{ provider, key, model }]
    this.prompt = prompt;
    this.atual = 0;
    this.cerebros = new Map();
  }

  get cerebro() {
    const etapa = this.etapas[this.atual];
    if (!this.cerebros.has(this.atual)) {
      this.cerebros.set(this.atual, construir(etapa.provider, { ...etapa, prompt: this.prompt }));
    }
    return this.cerebros.get(this.atual);
  }

  get provedorAtivo() {
    return this.etapas[this.atual].provider;
  }

  reset() {
    for (const c of this.cerebros.values()) c.reset();
  }

  cancelar() {
    this.cerebro.cancelar?.();
  }

  async ask(userText, opcoes) {
    let ultimo = null;
    // Uma espera por provedor, por pergunta. Sem esta trava, um provedor que
    // responde 429 em sequência prenderia a resposta num laço de esperas.
    const jaEsperou = new Set();

    while (this.atual < this.etapas.length) {
      let falou = false;
      const onSay = (t) => {
        falou = true;
        opcoes.onSay(t);
      };

      try {
        return await this.cerebro.ask(userText, { ...opcoes, onSay });
      } catch (err) {
        if (err?.cancelado) throw err;
        ultimo = err;
        const temProximo = this.atual + 1 < this.etapas.length;
        if (falou || !provedorEsgotado(err) || !temProximo) throw err;

        // ESPERAR ANTES DE TROCAR, quando o provedor disse quanto esperar e é
        // pouco. Trocar de provedor descarta o histórico — cada cérebro guarda
        // a conversa no formato da sua própria API — então trocar por causa de
        // meio segundo é pagar a conversa inteira para economizar meio segundo.
        // Foi o que aconteceu em 31/10: o Groq pediu 615 ms (limite de 8.000
        // tokens por minuto, estourado por 82) e ela trocou de provedor.
        const provedor = this.etapas[this.atual].provider;
        const espera = err?.esperarSegundos;
        if (
          !jaEsperou.has(provedor) &&
          Number.isFinite(espera) &&
          espera > 0 &&
          espera <= ESPERA_MAXIMA
        ) {
          jaEsperou.add(provedor);
          opcoes.onDebug?.(
            `${provedor} pediu ${espera}s; esperando em vez de trocar (o histórico fica)`
          );
          await new Promise((r) => setTimeout(r, Math.ceil(espera * 1000) + 150));
          continue; // mesmo provedor, mesmo histórico
        }

        const saiu = this.etapas[this.atual].provider;
        this.atual++;
        opcoes.onDebug?.(
          `${saiu} secou (${err.message}); passando para ${this.provedorAtivo}`
        );
        // O provedor novo não tem o histórico do anterior: cada cérebro guarda
        // a conversa no formato da sua própria API. Ele responde ESTA pergunta
        // sem o que veio antes — e daqui para frente acumula a conversa dele.
        opcoes.onProvedor?.(this.provedorAtivo);
      }
    }

    throw ultimo || new Error("nenhum provedor configurado");
  }
}

/// Monta a corrente a partir do que existe no config. Com um provedor só,
/// devolve o cérebro puro — nada muda para quem usa um provedor apenas.
/// O nome do modelo pode pertencer a este provedor?
///
/// Não dá para saber ao certo — "llama-3.3-70b" existe no Groq, na NVIDIA e no
/// OpenRouter. Mas dá para saber o CONTRÁRIO: `gemini-…` é do Google e
/// `claude-…` é da Anthropic, e mandar qualquer um deles para um endpoint no
/// formato da OpenAI só rende 404. Reconhecer o que claramente não serve já
/// evita o pedido perdido; o resto a descoberta resolve.
function modeloCombina(provedor, modelo) {
  if (!modelo) return false;
  const doGoogle = /^gemini[-.]/i.test(modelo);
  const daAnthropic = /^claude[-.]/i.test(modelo);
  if (provedor === "gemini") return doGoogle;
  if (provedor === "anthropic") return daAnthropic;
  return !doGoogle && !daAnthropic;
}

function createBrain(config = {}, { prompt } = {}) {
  const principal = config.provider || detectProvider(process.env.ANTHROPIC_API_KEY || config.apiKey || "");
  const ordem = [principal, ...ORDEM_RESERVA.filter((p) => p !== principal)].filter(Boolean);

  // O modelo de cada provedor. A regra não é "o principal usa config.model":
  // esse campo guarda o modelo do provedor que estava ativo quando ele foi
  // gravado, e a corrente troca de provedor sozinha sem limpar o campo. Foi
  // assim que o Groq passou a abrir TODA sessão pedindo `gemini-3.6-flash`,
  // levando um 404, listando os modelos da conta e redescobrindo o mesmo
  // `openai/gpt-oss-120b` que já estava salvo em `groqModel`. Custava um
  // pedido perdido por abertura, e o log mostrou isso duas vezes no mesmo dia.
  const porProvedor = {
    groq: config.groqModel,
    mistral: config.mistralModel,
    nvidia: config.nvidiaModel,
    cerebras: config.cerebrasModel,
    openrouter: config.openrouterModel,
    gemini: config.geminiModel,
  };
  const modeloDe = (p) => {
    // O campo específico do provedor manda, inclusive para o principal.
    if (porProvedor[p]) return porProvedor[p];
    // Sem ele, `config.model` só vale se o nome puder ser DESTE provedor.
    return modeloCombina(p, config.model) ? config.model : undefined;
  };

  const etapas = [];
  for (const provider of ordem) {
    const key = chaveDe(config, provider);
    if (key) etapas.push({ provider, key, model: modeloDe(provider) || undefined });
  }

  if (!etapas.length) return null;
  if (etapas.length === 1) {
    const { provider, key, model } = etapas[0];
    return construir(provider, { key, model, prompt });
  }
  return new CadeiaDeCerebros(etapas, { prompt });
}

module.exports = {
  createBrain,
  podarHistorico,
  guardaDeRepeticao,
  criarFalante,
  FORMATO_OPENAI,
  FORMATO_GEMINI,
  FORMATO_CLAUDE,
  TETO_HISTORICO,
  TETO_POR_PROVEDOR,
  TPM_POR_PROVEDOR,
  PEDIDOS_POR_MINUTO,
  tetoDoTpm,
  ESPERA_MAXIMA,
  segundosDeEspera,
  provedorEsgotado,
  PRAZO_PRIMEIRO_BYTE,
  PRAZO_PRIMEIRO_BYTE_POR_PROVEDOR,
  prazoPrimeiroByte,
  tetoDe,
  modeloCombina,
  rankOpenAI,
  modeloNaoExiste,
  ferramentaNaoSuportada,
  checkOpenAI,
  PROVEDORES,
  ORDEM_RESERVA,
  modeloServe,
  rankModels,
  detectProvider,
  pickGeminiModel,
  checkGemini,
  montarSystemPrompt,
  ESTILOS,
  SYSTEM_PROMPT,
};
