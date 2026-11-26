// main.js — processo principal da Sexta-Feira (a E.V.E até 25/11/2026).
//
// Dono de: janela, configuração, voz, escuta, estado, painel do sistema,
// lembretes e a ponte com a interface. O raciocínio vive em brains.js; as
// ações, em tools.js.
//
// Uma regra de arquitetura que vale a pena manter: o ESTADO é daqui, não da
// interface. A tecla de espaço, o atalho global, o clique na esfera e o modo
// de microfone sempre aberto precisam concordar sobre o que está acontecendo —
// se cada lado guardasse o seu palpite, divergiriam na primeira corrida.

const { app, BrowserWindow, ipcMain, shell, globalShortcut, Notification, dialog, screen, Tray, Menu, nativeImage } = require("electron");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const readline = require("node:readline");

const { createBrain, detectProvider, checkGemini, checkOpenAI, montarSystemPrompt, ORDEM_RESERVA, normalFrase } = require("./brains.js");
const {
  listarVozesEleven,
  vozesUsaveis,
  cotaEleven,
  sintetizarEleven,
  baixarPreview,
  explicarErroEleven,
  velocidadeValida,
} = require("./tts.js");
const ferramentas = require("./tools.js");
const { ROTULOS_CONFIRMACAO, filtroDeOpcoes } = require("./escolhas.js");
const registro = require("./registro.js");
// A pergunta em andamento, para o log fechar o bloco com tempo e ferramentas.
let turnoAtual = null;

// Os botões que a resposta em andamento vai deixar no chat: o pedido de sim de
// uma ferramenta, ou o `[opções: …]` que ela escreveu. Saem no FIM da resposta,
// para ficarem embaixo da fala e não no meio dela.
let escolhasDoTurno = null;
// "Executei vários passos e ainda não terminei. Quer que eu continue?" vem do
// código (brains.js), então os botões dele também.
const PERGUNTA_CONTINUAR = /ainda não terminei\. Quer que eu continue\?$/;
const sistema = require("./sistema.js");
const { Lembretes, formatar: formatarQuando } = require("./lembretes.js");
const { Memoria } = require("./memoria.js");
const { Skills, PASTA: PASTA_SKILLS } = require("./skills.js");
const { Agentes } = require("./agentes.js");
const { lerPdf } = require("./pdf.js");
const calendario = require("./calendario.js");
const { Conversas } = require("./conversas.js");
const { Chats } = require("./chats.js");
const { Aprendizados, pareceCorrecao, gerarCerebro } = require("./aprendizados.js");
const web = require("./web.js");

// Fixa o nome ANTES de qualquer getPath: o app empacotado e o `npm start`
// passam a usar a mesma pasta de configuração.
//
// 25/11/2026: ela virou Sexta-Feira, mas as PASTAS continuam as da E.V.E.
// O nome do app decide onde o Electron procura o config — e é lá que moram as
// chaves, o histórico, os lembretes e o consumo. Trocar a pasta junto com o
// nome faria ela abrir sem cérebro, pedindo chave de novo. O log também fica
// onde sempre esteve (~/Library/Logs/E.V.E/eve.log).
app.setName("Sexta-Feira");
app.setPath("userData", path.join(app.getPath("appData"), "E.V.E"));
app.setAppLogsPath(path.join(app.getPath("home"), "Library", "Logs", "E.V.E"));

const PADROES = {
  nome: "Sexta-Feira",
  pronuncia: "Sexta-Feira",
  dono: "",
  estilo: "doce", // doce | direta | divertida
  proativa: true,
  tema: "sexta", // o tema do layout novo (25/11/2026); os antigos continuam na tela
  modoMic: "toque", // toque (espaço) | aberto (microfone sempre ligado)
  pausaFala: 2.5,   // segundos de silêncio até ela entender que você terminou
  notificacoes: true,
  voice: "Luciana",
  rate: 195,
  pitch: 50, // 30…70, pelo comando [[pbas]] do `say`
  tts: "macos",
  mudo: false, // ela responde por escrito, sem falar
  // Velocidade da fala neural (0,7 a 1,2). Vale para a ElevenLabs; na voz do
  // macOS quem manda é `rate`, que já está em palavras por minuto.
  elevenVelocidade: 1.0,
  claro: false, // fundo claro; o tema continua escolhendo a cor de destaque
  // Chaves dos provedores de reserva. Quando há mais de uma configurada, a
  // E.V.E usa a principal e desce para a próxima quando aquela seca — foi o
  // que faltou na tarde em que a cota gratuita do Google acabou e ela emudeceu.
  groqKey: "",
  nvidiaKey: "",
  mistralKey: "",
  cerebrasKey: "",
  openrouterKey: "",
  groqModel: "",
  nvidiaModel: "",
  mistralModel: "",
  // Chave e modelo do Gemini guardados à parte: a pesquisa na web usa o
  // grounding do Google e continua precisando deles mesmo se o cérebro mudar.
  geminiKey: "",
  geminiModel: "",
  // Buscadores da pesquisa na web. Nenhum é obrigatório: sem nenhum, sobram as
  // reservas sem chave — que não sabem preço, notícia nem resultado de jogo.
  tavilyKey: "",
  serperKey: "",
  braveKey: "",
  langsearchKey: "",
  searxUrl: "",
  // Vazio = descobrir sozinha (subpasta do cofre do Obsidian, se houver um).
  memoriaDir: "",
  janela: null, // {largura, altura, maximizada} — o tamanho que você deixou
};

const INTERVALO_PAINEL = 2000; // ms entre leituras do estado da máquina
const ESPERA_PRIMEIRA_PALAVRA = 12; // s de silêncio inicial antes de desistir

// Arquivos que a E.V.E consegue olhar por dentro. O resto ela abre com as
// ferramentas, pelo caminho — não adianta mandar um binário para o modelo.
const ANEXO_TEXTO = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|zsh|bash|yml|yaml|toml|ini|conf|env|html|css|scss|xml|svg|sql|srt|vtt)$/i;
const ANEXO_IMAGEM = /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i;
const ANEXO_PDF = /\.pdf$/i;
const LIMITE_ANEXO = 8 * 1024 * 1024;

let win = null;
let brain = null;
let listener = null;
let sayProc = null;
let healthProbe = null;
let lembretes = null;
let memoria = null;
let skills = null;
let conversas = null;
let indiceSkills = null;
let agentes = null;
// Índice do cofre de .md já cortado no orçamento. Fica aqui, e não é lido na
// hora, porque o prompt é montado dentro do pedido — ver atualizarIndiceMemoria.
let indiceMemoria = null;
// As notas do assunto da pergunta, já lidas (memoria.relevantes). Ficam de um
// turno para o outro: a pergunta de continuação usa as do turno anterior.
let notasAbertas = [];
// A partir de quando o cérebro ATUAL acompanha a conversa. O que o histórico
// tem de antes disso ele não viu, e entra no prompt ("O FIO DESTA CONVERSA")
// para ele não começar do zero. Começa na abertura do app e anda em três
// casos (25/11/2026): conversa nova ou trocada na barra lateral, "limpar", e
// provedor que secou no meio da tarefa — o substituto chega sem histórico.
let inicioDoCerebro = Date.now();
// A pergunta em andamento e quando ela começou: a troca de provedor no meio
// dela move o início para AQUI, porque a pergunta em si já vai na mensagem.
let perguntaAtual = { texto: "", desde: Date.now() };
// Notas e aprendizados que a conversa aberta tocou: viram links no diário dela
// no Obsidian, que é o que liga a conversa ao resto do cérebro.
const ligacoesDaConversa = new Set();
let aprendizados = null;
let indiceAprendizados = null;
let correcaoNoTurno = false;
let chats = null;

/// O que a conversa ABERTA tem de antes do cérebro atual, para o prompt. Só
/// texto (cartão de arquivo não conta) e no máximo 1.800 caracteres — contados
/// de trás para frente, porque o que importa é onde a conversa PAROU.
///
/// O limite de 48 horas que existia aqui saiu em 25/11/2026: com as conversas
/// na barra lateral, voltar numa de semana passada é justamente o caso em que
/// o fio mais importa.
function conversaAnterior() {
  const turnos = lerHistorico().filter((i) => {
    const t = new Date(i.hora).getTime();
    return (i.quem === "voce" || i.quem === "eve") && !i.arquivo && t < inicioDoCerebro;
  });
  const saida = [];
  let resta = 1_800;
  for (const t of turnos.reverse()) {
    let texto = String(t.texto || "")
      .replace(/^\s*\|.*$/gm, "")     // tabela não cabe aqui
      .replace(/^\s*-{3,}\s*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!texto) continue;
    if (texto.length > 300) texto = texto.slice(0, 300) + "…";
    if (texto.length > resta) break;
    resta -= texto.length;
    saida.unshift({ quem: t.quem, texto, hora: t.hora });
    if (saida.length >= 12) break;
  }
  return saida;
}
let painelTimer = null;
let ultimaAmostra = null;

let estadoAtual = "idle"; // idle | listening | thinking | speaking
let micAberto = false; // só no modo "aberto"
let avisouReserva = false;
let anexoPendente = null; // arquivo que vai junto com a próxima mensagem

// Fila de fala: as respostas chegam em pedaços (streaming), e cada pedaço vira
// uma fala. Sem fila, o pedaço novo cortaria o anterior no meio.
const filaFala = [];
let tocando = false;
let sessaoFala = 0;      // muda ao interromper: áudio atrasado é descartado
let ultimaFalada = { sessao: -1, texto: "" };
let preparoAdiantado = null; // {texto, promessa} — próximo áudio já sendo gerado

// ---------------------------------------------------------------------------
// Configuração — ~/Library/Application Support/E.V.E/
// ---------------------------------------------------------------------------
const configPath = () => path.join(app.getPath("userData"), "config.json");
const historicoPath = () => path.join(app.getPath("userData"), "historico.json");
const lembretesPath = () => path.join(app.getPath("userData"), "lembretes.json");

/// Traz a configuração das versões anteriores (E.V e ev-assistant), para a
/// chave da API e a voz escolhida não se perderem na troca de nome.
/// Quem já usava a E.V.E antes dos provedores de reserva tem a chave do Gemini
/// só em `apiKey`. Copiamos para `geminiKey` uma vez, para que trocar o cérebro
/// por outro provedor depois não leve a pesquisa na web embora.
function separarChaveDoGemini() {
  try {
    const cfg = loadConfig();
    if (cfg.geminiKey || cfg.provider !== "gemini" || !cfg.apiKey) return;
    cfg.geminiKey = cfg.apiKey;
    if (/^gemini/.test(cfg.model || "")) cfg.geminiModel = cfg.model;
    saveConfig(cfg);
    log("chave do Gemini separada para a pesquisa na web");
  } catch (err) {
    log("não consegui separar a chave do Gemini:", err.message);
  }
}

function migrarConfigAntiga() {
  try {
    if (fs.existsSync(configPath())) return;
    const antigos = [
      path.join(app.getPath("appData"), "E.V", "config.json"),
      path.join(app.getPath("appData"), "ev-assistant", "config.json"),
    ];
    for (const antigo of antigos) {
      if (!fs.existsSync(antigo)) continue;
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      fs.copyFileSync(antigo, configPath());
      fs.chmodSync(configPath(), 0o600);
      log("configuração migrada de", antigo);
      return;
    }
  } catch (err) {
    console.error("[Sexta-Feira] falha ao migrar configuração:", err.message);
  }
}

/// O nome novo chega para quem já usava: só troca o que ainda é o padrão
/// antigo. Se ele tinha escolhido outro nome, fica o dele.
function renomearParaSextaFeira() {
  try {
    const cfg = loadConfig();
    if (cfg.renomeadaSexta) return;
    if (!cfg.nome || cfg.nome === "E.V.E") cfg.nome = PADROES.nome;
    if (!cfg.pronuncia || cfg.pronuncia === "Ivi") cfg.pronuncia = PADROES.pronuncia;
    // O holográfico era o padrão, não uma escolha: vai para o tema novo.
    if (!cfg.tema || cfg.tema === "holografico") cfg.tema = PADROES.tema;
    cfg.renomeadaSexta = true;
    saveConfig(cfg);
    log("nome: E.V.E → Sexta-Feira");
  } catch (err) {
    log("não consegui renomear:", err.message);
  }
}

function loadConfig() {
  try {
    return { ...PADROES, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    return { ...PADROES };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/// A chave do provedor principal mora na genérica (`apiKey`) desde antes da
/// corrente existir. Isso funciona enquanto ele é o principal — e só enquanto:
/// trocar de principal fazia o provedor ANTERIOR sair da corrente junto, sem
/// chave nenhuma, porque o `chaveDe` só aceita a genérica para quem está na
/// frente. Copiar para o campo próprio na primeira abertura desarma isso.
function migrarChavePrincipal() {
  const cfg = loadConfig();
  const dono = cfg.provider;
  if (!dono || !cfg.apiKey || cfg[`${dono}Key`]) return;
  cfg[`${dono}Key`] = cfg.apiKey;
  saveConfig(cfg);
  log(`chave do ${dono} copiada para o campo próprio (estava só na genérica)`);
}

/// A configuração que a interface pode ver — sem as chaves de API.
// Todos os provedores no formato OpenAI que a corrente conhece. O OpenRouter e
// o Cerebras estavam fora desta lista e sem campo na interface, embora o
// ORDEM_RESERVA e o chaveDe já os conhecessem — então não havia onde pôr a
// chave deles. Em 01/11 ele colou a do OpenRouter no campo do provedor
// PRINCIPAL, porque era o único campo que aceitava, e sem querer trocou o
// cérebro que estava funcionando. Não foi engano dele: era a interface que não
// tinha o campo.
const RESERVAS = ["groq", "nvidia", "mistral", "cerebras", "openrouter"];

/// Quem tem chave. O provedor que está como PRINCIPAL pode ter a chave na
/// genérica (`apiKey`) em vez do campo próprio — é o caso dele desde 01/11, com
/// o OpenRouter. Escrever essa regra em cada lugar que precisa dela é como
/// aparece um lugar que a esqueceu: a mensagem de "reservas salvas" listava
/// tudo menos o provedor em uso.
const temChave = (cfg, p) => !!(cfg[`${p}Key`] || (cfg.provider === p && cfg.apiKey));

function configPublica() {
  const cfg = loadConfig();
  return {
    nome: cfg.nome,
    pronuncia: cfg.pronuncia,
    dono: cfg.dono,
    estilo: cfg.estilo,
    proativa: cfg.proativa,
    tema: cfg.tema,
    modoMic: cfg.modoMic,
    pausaFala: cfg.pausaFala,
    notificacoes: cfg.notificacoes,
    voice: cfg.voice,
    rate: cfg.rate,
    pitch: cfg.pitch,
    tts: cfg.tts,
    mudo: !!cfg.mudo,
    claro: !!cfg.claro,
    temChave: !!cfg.apiKey,
    temEleven: !!cfg.elevenKey,
    // Só o fato de existir: a chave em si nunca desce para a interface.
    // Quais provedores têm chave, para a tela poder oferecer a escolha de quem
    // pensa primeiro sem nunca ver as chaves em si.
    // Quem tem chave. A regra do `apiKey` vale para TODOS e não só para o
    // Gemini e a Anthropic: quem está como principal pode ter a chave na
    // genérica, e tratar isso como ausência fazia o provedor em uso aparecer
    // como "sem chave" no seletor que escolhe justamente ele.
    disponiveis: ["gemini", "anthropic", ...RESERVAS].filter((p) => temChave(cfg, p)),
    // Um mapa em vez de temGroq/temNvidia/temMistral: provedor novo entrava em
    // três lugares e era esquecido em pelo menos um — foi assim que o
    // OpenRouter e o Cerebras ficaram sem campo na tela.
    temChaves: Object.fromEntries(RESERVAS.map((p) => [p, temChave(cfg, p)])),
    elevenVelocidade: cfg.elevenVelocidade,
    provider: cfg.provider || null,
    model: cfg.model || null,
    // Só os NOMES, nunca as chaves: a tela precisa poder dizer a verdade sobre
    // a pesquisa sem nunca ver uma credencial.
    buscadores: web.buscadoresProntos({
      geminiKey: cfg.geminiKey || (cfg.provider === "gemini" ? cfg.apiKey : null),
      geminiModel: cfg.geminiModel || "gemini-flash-latest",
      tavilyKey: cfg.tavilyKey,
      serperKey: cfg.serperKey,
      braveKey: cfg.braveKey,
      langsearchKey: cfg.langsearchKey,
      searxUrl: cfg.searxUrl,
    }),
  };
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

// ---------------------------------------------------------------------------
// Diagnóstico — ~/Library/Logs/E.V.E/eve.log
// ---------------------------------------------------------------------------
let logFile = null;
let linhasDesdeRotacao = 0;
let turnosNaSessao = 0;

function log(...parts) {
  // Data em toda linha (registro.js): só a hora tornava um mês de log ilegível.
  const line = registro.linha(parts);
  console.log(line);
  try {
    if (!logFile) {
      logFile = path.join(app.getPath("logs"), "eve.log");
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      registro.rotacionar(logFile);
    }
    // Conferir o tamanho a cada linha seria um stat por linha; a cada 500 basta.
    if (++linhasDesdeRotacao >= 500) {
      linhasDesdeRotacao = 0;
      registro.rotacionar(logFile);
    }
    fs.appendFileSync(logFile, line + "\n");
  } catch {}
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
function setEstado(s, rotulo) {
  const mudou = s !== estadoAtual;
  estadoAtual = s;
  send("ev:state", { state: s, rotulo, micAberto });
  if (mudou) atualizarBandeja();
}

// ---------------------------------------------------------------------------
// Histórico da conversa (o que aparece na tela)
// ---------------------------------------------------------------------------
function lerHistorico() {
  try {
    const h = JSON.parse(fs.readFileSync(historicoPath(), "utf8"));
    return Array.isArray(h) ? h.slice(-120) : [];
  } catch {
    return [];
  }
}

/// Arquivos que ELA criou e que a interface pode abrir ou copiar.
///
/// Os botões do cartão mandam um caminho de volta para cá, e o caminho vem da
/// interface. Sem esta lista, qualquer coisa que conseguisse falar com a
/// interface pediria "abra /qualquer/coisa" e o processo principal abriria —
/// a lista transforma "abrir arquivo" em "abrir o arquivo que ela fez".
const arquivosLiberados = new Set();

function liberarArquivo(caminho) {
  if (caminho) arquivosLiberados.add(path.resolve(caminho));
}

function arquivoLiberado(caminho) {
  const alvo = path.resolve(String(caminho || ""));
  if (!arquivosLiberados.has(alvo)) return { erro: "esse arquivo não foi criado por ela" };
  if (!fs.existsSync(alvo)) return { erro: "o arquivo não está mais nesse lugar (foi movido ou apagado)" };
  return { alvo };
}

/// Um arquivo novo entra no histórico como item próprio: é o que faz o cartão
/// voltar quando ele fecha e abre o app, em vez de sumir com a sessão.
function anotarArquivo(arquivo) {
  liberarArquivo(arquivo.caminho);
  anotar("eve", `📎 ${arquivo.nome}`, { arquivo });
  send("ev:arquivo", arquivo);
  log("arquivo criado:", arquivo.caminho, `${arquivo.paginas || "?"} página(s)`, `${arquivo.bytes || 0} bytes`);
}

function anotar(quem, texto, extra = {}) {
  if (!texto) return;
  const item = { quem, texto, hora: new Date().toISOString(), ...extra };
  try {
    const h = lerHistorico();
    h.push(item);
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(historicoPath(), JSON.stringify(h.slice(-120)));
  } catch {}
  return item;
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------
/// Tira do texto o que não se fala. A resposta é mostrada no chat em markdown
/// leve, mas lida em voz alta precisa virar fala: sem asteriscos, sem crase de
/// código, sem URL soletrada.
/// Tem alguma coisa dita aqui? "...", "—", " . . . " não têm. Serve para não
/// falar enchimento e para não gravar enchimento no histórico da conversa.
// Parágrafo inteiro que é só a oferta de ajuda do fim da resposta.
const FECHO_PRONTO =
  /^(?:se (?:precisar|quiser)[^.!?\n]{0,80}(?:é só|basta|me) (?:avisar|mandar|falar|chamar|pedir)|(?:precisa|quer) de mais alguma coisa|(?:qualquer coisa|estou à disposição)[^.!?\n]{0,40})[.!?]?\s*(?:😊|🙂)?$/i;

function temConteudo(texto) {
  return /[\p{L}\p{N}]/u.test(String(texto || ""));
}

const { numerosParaFala } = require("./falaNumeros.js");

function limparParaFala(texto) {
  return String(texto || "")
    .replace(/```[\s\S]*?```/g, " … o código está na tela … ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " o link que está na tela ")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_#>|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    // Por último, com o texto já limpo: "R$ 327,64" vira "trezentos e vinte e
    // sete reais e sessenta e quatro centavos" (ver falaNumeros.js).
    .replace(/[\s\S]+/, (t) => numerosParaFala(t));
}

function vozAtual() {
  const cfg = loadConfig();
  return {
    voice: cfg.voice || PADROES.voice,
    rate: Number(cfg.rate) || PADROES.rate,
    pitch: Number(cfg.pitch) || PADROES.pitch,
  };
}

/// Depois de terminar de falar: no modo de microfone aberto, volta a ouvir.
/// Falar e ouvir ao mesmo tempo faria a E.V.E transcrever a própria voz.
function aoTerminarFala() {
  if (loadConfig().modoMic === "aberto" && micAberto) {
    setTimeout(() => {
      if (micAberto && estadoAtual !== "listening") tell("START");
    }, 350);
  }
}

/// Põe uma fala na fila. As respostas chegam em pedaços, e cada pedaço passa
/// por aqui: sem fila, o pedaço seguinte cortaria o anterior no meio da frase.
function speak(texto) {
  // Mudo: a resposta já está escrita na tela, então não há o que fazer aqui.
  // Nada entra na fila — gerar o áudio e não tocar gastaria cota da ElevenLabs
  // por som que ninguém ia ouvir.
  if (loadConfig().mudo) return;

  const fala = limparParaFala(texto);
  if (!fala) return;
  filaFala.push(fala);
  if (!tocando) tocarProxima();
}

/// Gera (ou escolhe) o áudio de uma fala. Devolve o caminho de um MP3 quando a
/// ElevenLabs está em uso, ou null para falar pelo `say` do macOS.
async function prepararAudio(texto, cfg, anterior = "") {
  if (!(cfg.tts === "elevenlabs" && cfg.elevenKey && cfg.elevenVoiceId)) return null;

  const mp3 = await sintetizarEleven(texto, {
    apiKey: cfg.elevenKey,
    voiceId: cfg.elevenVoiceId,
    rapido: !!cfg.elevenRapido,
    velocidade: cfg.elevenVelocidade,
    anterior,
  });
  const arquivo = path.join(os.tmpdir(), `eve-fala-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
  fs.writeFileSync(arquivo, mp3);
  return arquivo;
}

function tocarArquivo(arquivo, sessao) {
  return new Promise((resolve) => {
    sayProc = execFile("/usr/bin/afplay", [arquivo], () => {
      sayProc = null;
      fs.unlink(arquivo, () => {});
      resolve();
    });
    if (sessao !== sessaoFala) stopProcessoAtual();
  });
}

function falarComMacOS(texto) {
  return new Promise((resolve) => {
    const { voice, rate, pitch } = vozAtual();
    // [[pbas N]] é o comando embutido do `say` que muda a altura da voz —
    // é o que dá o controle de "tom" pedido nas configurações.
    const comTom = pitch && pitch !== 50 ? `[[pbas ${Math.round(pitch)}]] ${texto}` : texto;

    sayProc = execFile("/usr/bin/say", ["-v", voice, "-r", String(rate), comTom], (err) => {
      sayProc = null;
      if (err && !err.killed && /Voice.*not found/i.test(err.message || "")) {
        log("voz indisponível:", voice, "— voltando para", PADROES.voice);
        const cfg = loadConfig();
        delete cfg.voice;
        saveConfig(cfg);
        send("ev:error", {
          message: `A voz "${voice}" não está mais instalada. Voltei para a ${PADROES.voice}.`,
        });
      }
      resolve();
    });
  });
}

async function tocarProxima() {
  if (!filaFala.length) {
    tocando = false;
    if (estadoAtual === "speaking") setEstado("idle");
    aoTerminarFala();
    return;
  }

/// Explica a falha da voz neural. Quando o motivo é cota, vai buscar a data em
/// que ela renova — "a cota acabou" sem data não diz se a voz volta hoje ou no
/// mês que vem, e é a primeira coisa que ele quer saber.
async function avisoDaVoz(err, cfg) {
  const base = explicarErroEleven(err);
  if (!/cota da elevenlabs acabou/i.test(base)) return base;
  const cota = await cotaEleven(cfg.elevenKey).catch(() => null);
  if (!cota?.renova) return base;
  const quando = new Date(cota.renova * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
  return base.replace("Ela renova sozinha;", `Ela renova em ${quando};`);
}

  tocando = true;
  const sessao = sessaoFala;
  const texto = filaFala.shift();
  const cfg = loadConfig();
  setEstado("speaking");

  // Enquanto este pedaço toca, o próximo já está sendo gerado. É o que tira o
  // silêncio entre uma frase e outra quando a voz é da ElevenLabs.
  // A frase anterior DESTA resposta vai junto, para a entonação continuar de
  // onde parou em vez de recomeçar a cada frase.
  const anterior = ultimaFalada.sessao === sessao ? ultimaFalada.texto : "";
  let promessa = null;
  if (preparoAdiantado && preparoAdiantado.texto === texto) promessa = preparoAdiantado.promessa;
  preparoAdiantado = null;

  let arquivo = null;
  try {
    if (promessa) arquivo = await promessa;
    // 05/11: o adiantado que falhava virava `null` em silêncio, e a frase
    // saía na voz do macOS no meio de uma resposta na voz da ElevenLabs —
    // "meio português, meio americano". Falhou adiantado: tenta de novo agora,
    // e só cai para o macOS se falhar outra vez, com o motivo no log.
    if (!arquivo) arquivo = await prepararAudio(texto, cfg, anterior);
  } catch (err) {
    log("elevenlabs falhou:", err.status || "", err.message, "→ voz do macOS");
    if (!avisouReserva) {
      avisouReserva = true;
      send("ev:notice", { message: await avisoDaVoz(err, cfg) });
    }
  }
  if (sessao !== sessaoFala) return; // interrompida enquanto gerava

  ultimaFalada = { sessao, texto };
  if (filaFala.length) {
    const seguinte = filaFala[0];
    preparoAdiantado = {
      texto: seguinte,
      promessa: prepararAudio(seguinte, cfg, texto).catch((err) => {
        log("elevenlabs falhou ao adiantar:", err.status || "", err.message, "— tento de novo na hora");
        return null;
      }),
    };
  }

  if (arquivo) await tocarArquivo(arquivo, sessao);
  else await falarComMacOS(texto);

  if (sessao !== sessaoFala) return;
  tocarProxima();
}

function stopProcessoAtual() {
  if (sayProc) {
    sayProc.kill();
    sayProc = null;
  }
}

/// Cala a boca agora: limpa a fila, derruba o áudio em curso e invalida o que
/// já estava sendo gerado (sessão nova), para nada chegar atrasado e tocar
/// sozinho depois.
function stopSpeaking() {
  sessaoFala++;
  filaFala.length = 0;
  preparoAdiantado = null;
  tocando = false;
  stopProcessoAtual();
}

/// Vozes de português instaladas no macOS. O nome pode conter parênteses e
/// espaços ("Flo (Português (Brasil))"), então o nome é tudo antes do idioma.
function listarVozes() {
  return new Promise((resolve) => {
    execFile("/usr/bin/say", ["-v", "?"], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const NOVIDADE =
        /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bubbles|Jester|Superstar|Trinoids|Wobble|Bad|Bahh|Bells|Boing)\b/;

      const vozes = [];
      for (const linha of stdout.split("\n")) {
        const m = linha.match(/^(.*?)\s+([a-z]{2}_[A-Z]{2})\s+#\s*(.*)$/);
        if (!m) continue;
        const [, nome, idioma, exemplo] = m;
        if (!/^pt_/.test(idioma)) continue;

        let qualidade = "padrão";
        if (/premium/i.test(nome)) qualidade = "premium";
        else if (/enhanced|aprimorad/i.test(nome)) qualidade = "aprimorada";
        else if (NOVIDADE.test(nome)) qualidade = "novidade";

        vozes.push({ nome, idioma, exemplo, qualidade });
      }

      const peso = { premium: 0, aprimorada: 1, padrão: 2, novidade: 3 };
      vozes.sort(
        (a, b) =>
          peso[a.qualidade] - peso[b.qualidade] ||
          (a.nome === PADROES.voice ? -1 : b.nome === PADROES.voice ? 1 : a.nome.localeCompare(b.nome))
      );
      resolve(vozes);
    });
  });
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------
async function notificar({ titulo, mensagem }) {
  if (!loadConfig().notificacoes) return;
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: titulo || loadConfig().nome || "Sexta-Feira", body: mensagem, silent: false });
      n.on("click", () => {
        win?.show();
        win?.focus();
      });
      n.show();
      return;
    }
  } catch (err) {
    log("notificação pelo Electron falhou:", err.message);
  }
  // Reserva: o próprio macOS, pelo osascript.
  execFile("/usr/bin/osascript", [
    "-e",
    `display notification ${JSON.stringify(mensagem)} with title ${JSON.stringify(titulo || loadConfig().nome || "Sexta-Feira")}`,
  ]);
}

// ---------------------------------------------------------------------------
// Painel do sistema
// ---------------------------------------------------------------------------
async function amostrarPainel() {
  try {
    ultimaAmostra = await sistema.amostrar();
    send("ev:metrics", ultimaAmostra);
  } catch (err) {
    log("painel do sistema falhou:", err.message);
  }
}

function iniciarPainel() {
  clearInterval(painelTimer);
  amostrarPainel();
  painelTimer = setInterval(() => {
    // Janela escondida não precisa de painel atualizado; poupa CPU e bateria.
    if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) amostrarPainel();
  }, INTERVALO_PAINEL);
}

// ---------------------------------------------------------------------------
// Escuta — processo Swift com SFSpeechRecognizer (pt-BR)
// ---------------------------------------------------------------------------
function startListener() {
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, "native", "ev-listen")
    : path.join(__dirname, "native", "ev-listen");

  if (!fs.existsSync(bin)) {
    log("motor de escuta não encontrado em", bin);
    send("ev:error", { message: "Motor de escuta não encontrado. Rode: npm run install-app" });
    return;
  }

  listener = spawn(bin, [], { stdio: ["pipe", "pipe", "pipe"] });

  listener.on("error", (err) => {
    log("falha ao iniciar o motor de escuta:", err.message);
    send("ev:error", { message: "Não consegui iniciar a escuta: " + err.message });
    listener = null;
  });

  listener.stderr.on("data", (d) => log("[ev-listen]", d.toString().trim()));

  readline.createInterface({ input: listener.stdout }).on("line", (line) => {
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      return;
    }

    if (evt.type !== "level" && evt.type !== "partial") log("escuta →", line);

    if (evt.type === "listening") setEstado("listening");
    if (evt.type === "partial") send("ev:heard", { text: evt.text, final: false });
    if (evt.type === "level") send("ev:level", { value: evt.value });
    if (evt.type === "error") send("ev:error", { message: evt.message });
    if (evt.type === "pong") healthProbe?.("pong");
    if (evt.type === "timeout") log("escuta: pausa de", evt.silence + "s");
    if (evt.type === "notice") send("ev:notice", { message: evt.message });
    if (evt.type === "waiting-permission") {
      send("ev:notice", { message: "Aguardando sua permissão de microfone…" });
    }

    if (evt.type === "recog-error") {
      const conhecidos = {
        1101: "O modelo de ditado em português não está instalado. Ative o Ditado em Ajustes do Sistema › Teclado › Ditado.",
        1110: "Não ouvi nada. Fale um pouco mais alto ou mais perto do microfone.",
        203: "Não consegui entender o áudio. Verifique se o microfone certo está selecionado.",
        1700: "O reconhecimento de fala não está autorizado para este app.",
      };
      send("ev:error", {
        message:
          conhecidos[evt.code] || `Reconhecimento falhou (${evt.domain} ${evt.code}): ${evt.message}`,
      });
    }

    if (evt.type === "final") {
      const texto = (evt.text || "").trim();
      send("ev:level", { value: 0 });
      if (texto) {
        send("ev:heard", { text: texto, final: true });
        ask(texto, "voz");
      } else if (micAberto && loadConfig().modoMic === "aberto") {
        // Silêncio no modo aberto: volta a escutar em vez de desligar.
        setTimeout(() => micAberto && tell("START"), 400);
      } else {
        setEstado("idle");
      }
    }
  });

  listener.on("exit", (code) => {
    log("motor de escuta encerrou (código " + code + ")");
    listener = null;
  });
}

/// Diz ao motor de escuta quanto silêncio ainda é "a mesma frase". Sem isso ele
/// usa 2,5 s; quem fala pausado prefere mais.
function ajustarEscuta() {
  const cfg = loadConfig();
  tell(`TIMEOUT ${Number(cfg.pausaFala) || PADROES.pausaFala} ${ESPERA_PRIMEIRA_PALAVRA}`);
}

/// Manda um comando para o motor de escuta, reerguendo o processo se ele caiu.
function tell(cmd) {
  if (!listener) {
    startListener();
    if (!listener) return false;
  }
  try {
    listener.stdin.write(cmd + "\n");
    log("escuta ←", cmd);
    return true;
  } catch (err) {
    log("erro ao enviar", cmd, err.message);
    send("ev:error", { message: "A escuta parou de responder. Reinicie a Sexta-Feira." });
    listener = null;
    return false;
  }
}

/// Um único lugar decide o que o espaço, o clique na esfera e o ⌥Espaço fazem.
function mic(acao = "toggle") {
  const cfg = loadConfig();
  const aberto = cfg.modoMic === "aberto";

  if (acao === "start") {
    stopSpeaking();
    // Falar de novo enquanto ela pensa quer dizer "deixa essa pra lá".
    if (estadoAtual === "thinking") brain?.cancelar?.();
    if (aberto) micAberto = true;
    tell("START");
  } else if (acao === "stop") {
    if (aberto) micAberto = false;
    tell("STOP");
  } else {
    // toggle
    if (aberto) {
      micAberto = !micAberto;
      if (micAberto) {
        stopSpeaking();
        if (estadoAtual === "thinking") brain?.cancelar?.();
        tell("START");
      } else {
        tell("STOP");
        stopSpeaking();
        setEstado("idle");
      }
    } else if (estadoAtual === "listening") {
      tell("STOP");
    } else if (estadoAtual === "speaking" || estadoAtual === "thinking") {
      stopSpeaking();
      brain?.cancelar?.();
      setEstado("idle");
    } else {
      tell("START");
    }
  }
  send("ev:mic", { modo: cfg.modoMic, aberto: micAberto });
}

// ---------------------------------------------------------------------------
// Erros da API traduzidos para algo acionável
// ---------------------------------------------------------------------------
function explicarErro(err) {
  const raw = err?.error?.error?.message || err?.message || String(err);
  const status = err?.status;

  if (/api key not valid|API_KEY_INVALID/i.test(raw)) {
    return {
      tela: "Chave do Gemini inválida. Gere outra em aistudio.google.com › Get API key.",
      voz: "Minha chave do Gemini não é válida. Gere uma nova no Google AI Studio.",
    };
  }
  // "limit: 0" não é limite consumido: é conta sem nível gratuito nesse modelo.
  if (err?.semCota || /limit:\s*0\b/i.test(raw)) {
    return {
      tela:
        "Sua chave do Google não tem cota gratuita para nenhum modelo. Gere outra em " +
        "aistudio.google.com usando “Create API key in new project”.",
      voz:
        "Sua chave do Google não tem plano gratuito para nenhum modelo. " +
        "Gere uma chave nova no AI Studio, criando em um projeto novo.",
    };
  }
  if (err?.cotaDiaria) {
    return {
      tela:
        "O limite diário gratuito do Gemini acabou em todos os modelos da sua conta. " +
        "Ele renova à meia-noite no horário do Pacífico — de madrugada aqui.",
      voz: "Acabou meu limite gratuito do Gemini por hoje. Ele renova de madrugada.",
    };
  }
  if (/quota|RESOURCE_EXHAUSTED/i.test(raw) || status === 429) {
    const segundos =
      err?.esperarSegundos || Number((raw.match(/retry in ([\d.]+)s/i) || [])[1]) || null;
    return {
      tela: segundos
        ? `Limite por minuto do Gemini. Já esperei e ainda não liberou; tente em ${Math.ceil(segundos)} segundos.`
        : "Limite de uso do Gemini atingido. Já tentei esperar; tente de novo em um minuto.",
      voz: segundos
        ? `Ainda estou no limite por minuto do Gemini. Tenta de novo em ${Math.ceil(segundos)} segundos.`
        : "Ainda estou no limite de uso do Gemini. Tenta de novo em um minuto.",
    };
  }
  // 503: fila do Google, não problema da conta. Ela já esperou e já tentou
  // outros modelos antes de chegar aqui — por isso a mensagem fala em minutos.
  if (err?.sobrecarga) {
    return {
      tela:
        "Os modelos do Gemini estão lotados agora (erro 503). Já esperei e já tentei outros; " +
        "costuma liberar em alguns minutos.",
      voz: "O Gemini está lotado neste momento. Já tentei esperar e trocar de modelo; me chama de novo daqui a alguns minutos.",
    };
  }
  if (err?.semModelo) {
    return {
      tela: "Nenhum modelo do Gemini aceitou o pedido. A lista da sua conta está em ~/Library/Logs/E.V.E/eve.log.",
      voz: "Nenhum modelo do Gemini aceitou meu pedido. Registrei os detalhes no log.",
    };
  }
  if (/is not found for API version|NOT_FOUND/i.test(raw)) {
    return {
      tela: "O modelo pedido não existe nesta conta. Vou tentar outro automaticamente.",
      voz: "Esse modelo não existe na sua conta. Vou tentar outro.",
    };
  }
  if (/credit balance is too low/i.test(raw)) {
    return {
      tela: "Sua conta da Anthropic está sem créditos. Adicione em console.anthropic.com › Plans & Billing.",
      voz: "Sua conta da Anthropic está sem créditos.",
    };
  }
  // Limite batido em provedor no formato OpenAI (Groq, Mistral, Cerebras,
  // OpenRouter). Nenhum deles manda quantos segundos faltam, como o Google faz,
  // então não há o que esperar: ou tem outro provedor configurado, ou é hora.
  if (err?.limiteBatido || /rate limit|too many requests|quota/i.test(raw)) {
    const cfg = loadConfig();
    const temReserva =
      [cfg.groqKey, cfg.nvidiaKey, cfg.mistralKey, cfg.cerebrasKey, cfg.openrouterKey].filter(Boolean)
        .length > 1;
    return {
      tela: temReserva
        ? "Todos os provedores configurados estão no limite agora. Tente de novo em alguns minutos."
        : "O provedor atual bateu o limite. Em Configurações › Chaves você pode adicionar um provedor de reserva (o Mistral tem o teto mais alto).",
      voz: temReserva
        ? "Todos os provedores que eu tenho bateram o limite agora. Me chama daqui a alguns minutos."
        : "Esse provedor bateu o limite. Você pode me dar uma chave de reserva nas configurações.",
    };
  }
  if (status === 401 || /authentication/i.test(raw)) {
    return {
      tela: "Chave da API inválida ou revogada.",
      voz: "Minha chave de acesso não está funcionando.",
    };
  }
  if (status === 403) {
    return { tela: "Esta chave não tem permissão para o modelo configurado.", voz: "Minha chave não tem permissão para esse modelo." };
  }
  if (status === 404) {
    return {
      tela: `Modelo indisponível para esta conta (${loadConfig().model || "padrão"}).`,
      voz: "O modelo que eu uso não está disponível na sua conta.",
    };
  }
  if (status >= 500) {
    return { tela: "O serviço de IA está instável agora. Tente de novo em instantes.", voz: "O serviço está instável agora." };
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|ETIMEDOUT/i.test(raw)) {
    return { tela: "Sem conexão com a internet.", voz: "Estou sem conexão com a internet." };
  }
  return { tela: raw, voz: "Tive um problema ao processar isso." };
}

// ---------------------------------------------------------------------------
// Cérebro
// ---------------------------------------------------------------------------
/// O prompt é montado na hora de cada pedido, com nome, estilo, data, estado
/// da máquina e lembretes pendentes já dentro.
function promptDoSistema({ canal } = {}) {
  const cfg = loadConfig();
  return montarSystemPrompt({
    nome: cfg.nome,
    pronuncia: cfg.pronuncia,
    dono: cfg.dono,
    estilo: cfg.estilo,
    proativa: cfg.proativa,
    canal: canal || "voz",
    estadoSistema: sistema.resumo(ultimaAmostra),
    lembretes: lembretes ? lembretes.listar().slice(0, 8) : [],
    memoria: indiceMemoria,
    skills: indiceSkills,
    notasAbertas,
    conversaAnterior: conversaAnterior(),
    tituloConversa: chats?.aberta().titulo || "",
    aprendizados: indiceAprendizados,
    correcao: correcaoNoTurno,
    agora: new Date(),
  });
}

/// O índice do cofre fica em memória porque o prompt é montado de forma
/// síncrona, dentro do pedido. Ler a pasta aqui transformaria cada pergunta em
/// uma ida ao disco; então lemos antes de perguntar e no começo.
/// Manda o painel de agentes para a tela. A ordem é a da corrente de socorro,
/// para o painel mostrar quem substitui quem quando um seca.
function enviarAgentes() {
  if (!agentes) return;
  const cfg = loadConfig();
  const principal = cfg.provider || null;
  const ordem = [principal, ...ORDEM_RESERVA.filter((p) => p !== principal)].filter(Boolean);
  const temChave = (p) =>
    p === "gemini" || p === "anthropic"
      ? !!(cfg[`${p}Key`] || (cfg.provider === p && cfg.apiKey))
      : !!cfg[`${p}Key`];
  send("ev:agents", agentes.resumo(ordem.filter(temChave)));
}

function iniciarMemoria() {
  // `memoriaDir` no config manda; sem ele, a memória vai para uma subpasta do
  // cofre que ele já abre no Obsidian (ver PASTA em memoria.js).
  memoria = new Memoria({
    pasta: loadConfig().memoriaDir || undefined,
    onDebug: (msg) => log("memória:", msg),
  });
  log("memória em:", memoria.pasta);
  // Os aprendizados moram dentro da memória (aprendizados/), para o Obsidian
  // ver um cérebro só: memória, aprendizados, conversas e skills ligados pela
  // nota CEREBRO.md.
  aprendizados = new Aprendizados({ pasta: memoria.pasta, onDebug: (msg) => log(msg) });
  memoria
    .preparar()
    .then(() => gerarCerebro(memoria.pasta, { nome: loadConfig().nome || "Sexta-Feira" }))
    .then(() => aprendizados.gerarMapa())
    .then(() => atualizarIndiceAprendizados())
    .then(() => atualizarIndiceMemoria())
    .catch((err) => log("memória: não consegui preparar o cofre:", err.message));

  // As skills moram no mesmo cofre, numa pasta à parte — e a memória foi
  // ensinada a ignorar essa pasta, senão cada skill entraria no índice que
  // viaja em toda pergunta.
  // O diário de conversas mora no mesmo cofre, numa pasta à parte — e com
  // `quando: nunca` no topo, para conversa salva não entrar no índice que
  // viaja no contexto dela. Conversa salva é para ELE reler.
  conversas = new Conversas({
    pasta: path.join(memoria.pasta, "Conversas"),
    nomeDela: loadConfig().nome || "Sexta-Feira",
    onDebug: (msg) => log(msg),
    // Esta sessão começa agora. O que foi dito antes pertence às conversas
    // anteriores, mesmo que o histórico ainda o traga.
    desde: Date.now(),
  });

  skills = new Skills({
    pasta: path.join(memoria.pasta, PASTA_SKILLS),
    onDebug: (msg) => log("skills:", msg),
  });
  skills
    .preparar()
    .then(() => atualizarIndiceSkills())
    .catch((err) => log("skills: não consegui preparar a pasta:", err.message));
}

async function atualizarIndiceSkills() {
  if (!skills) return;
  try {
    indiceSkills = await skills.paraPrompt();
    log("skills:", indiceSkills.total, "disponível(is)");
  } catch (err) {
    log("skills: não consegui ler a pasta:", err.message);
  }
}

async function atualizarIndiceAprendizados() {
  if (!aprendizados) return;
  try {
    indiceAprendizados = await aprendizados.paraPrompt();
  } catch (err) {
    log("aprendizados: não consegui ler:", err.message);
  }
}

async function atualizarIndiceMemoria() {
  if (!memoria) return;
  try {
    indiceMemoria = await memoria.paraPrompt();
    log(
      "memória:",
      indiceMemoria.total,
      "documento(s) no índice" + (indiceMemoria.cortados ? `, ${indiceMemoria.cortados} fora do orçamento` : "")
    );
  } catch (err) {
    log("memória: não consegui ler o índice:", err.message);
  }
}

function initBrain() {
  const cfg = loadConfig();
  brain = createBrain(cfg, { prompt: promptDoSistema });
  if (brain) {
    // Quem pensa primeiro, e com qual modelo. Sem esta linha o log mostra as
    // TROCAS de provedor e não o ponto de partida: para saber quem estava na
    // frente eu tinha de ir ler o config a cada diagnóstico, e numa abertura
    // sem troca nenhuma não havia como saber.
    // Só provider e model saem daqui. `etapas` guarda a CHAVE de cada
    // provedor ao lado, e o log é permanente.
    const etapas = brain.etapas || [{ provider: cfg.provider, model: brain.model }];
    const frente = etapas[0];
    const reserva = etapas.slice(1).map((e) => e.provider);
    log(
      `cérebro: ${frente.provider} (${frente.model || "modelo padrão"})` +
        (reserva.length ? `; reserva: ${reserva.join(" → ")}` : "; sem reserva") +
        // A segunda voz muda o que ele OUVE, então tem de aparecer no log: sem
        // isto, "por que ela respondeu assim" não tem resposta no arquivo.
        (brain.conversa
          ? `; conversa: ${brain.conversa.provider} (${brain.conversa.model})`
          : "")
    );
  }
  return !!brain;
}

/// Resumo de UMA LINHA dos argumentos de uma ferramenta, para o log.
///
/// Por que isto existe: ela gastou 17 chamadas de run_command tentando apagar
/// um evento do Calendário pelo terminal, e o log guardava só o nome da
/// ferramenta. Dava para ver que ela agiu 17 vezes e não dava para saber o
/// QUE ela rodou — justamente a pergunta que importa quando o que está em
/// jogo é a máquina dele.
///
/// Duas regras de contenção:
///   • campo com cara de segredo nunca é escrito, nem truncado. Hoje nenhuma
///     ferramenta recebe chave, mas o log é permanente e ferramenta nova
///     aparece toda semana;
///   • valor longo (conteúdo de arquivo, texto de memória) entra como tamanho,
///     não como texto. O log serve para reconstruir a INTENÇÃO; despejar um
///     arquivo dentro dele só faz o próximo diagnóstico ser mais difícil.
const CAMPO_SECRETO = /key|token|senha|password|secret|chave|authorization/i;
const TETO_VALOR = 120;

function resumirArgs(args) {
  if (!args || typeof args !== "object") return "";
  const partes = [];
  for (const [campo, valor] of Object.entries(args)) {
    if (CAMPO_SECRETO.test(campo)) {
      partes.push(`${campo}=<oculto>`);
      continue;
    }
    if (valor == null) continue;
    if (typeof valor === "object") {
      partes.push(`${campo}=<${Array.isArray(valor) ? `${valor.length} itens` : "objeto"}>`);
      continue;
    }
    const texto = String(valor);
    partes.push(
      texto.length > TETO_VALOR
        ? `${campo}=<${texto.length} caracteres>`
        : `${campo}=${JSON.stringify(texto)}`
    );
  }
  return partes.length ? `· ${partes.join(" ")}` : "";
}

async function ask(userText, canal = "texto") {
  if (!userText) return;
  if (!brain) {
    send("ev:setup", { needed: true });
    return;
  }

  // Pergunta nova cala a resposta anterior — senão ela responde por cima.
  stopSpeaking();

  // Ela pode ter anotado algo na pergunta anterior; e você pode ter escrito uma
  // nota no Obsidian enquanto isso. Reler antes de montar o prompt é o que faz
  // as duas coisas aparecerem sem nenhum passo de sincronização.
  await atualizarIndiceMemoria();
  // As notas do assunto entram já lidas: esperar que ela decida abrir falhou
  // (05/11, a fatura que estava anotada e ela perguntou o valor).
  if (memoria) {
    try {
      notasAbertas = await memoria.relevantes(userText, { anteriores: notasAbertas.map((n) => n.nome) });
      if (notasAbertas.length) log("memória: abertas para esta pergunta:", notasAbertas.map((n) => n.nome).join(", "));
    } catch (err) {
      log("memória: não consegui escolher as notas:", err.message);
    }
  }
  // Uma skill escrita no Obsidian agora mesmo já vale nesta pergunta: reler é
  // o que dispensa qualquer passo de sincronização (e reiniciar o app).
  await atualizarIndiceSkills();
  await atualizarIndiceAprendizados();
  correcaoNoTurno = pareceCorrecao(userText);
  if (correcaoNoTurno) log("aprendizado: a fala parece uma correção");
  for (const n of notasAbertas) ligacoesDaConversa.add(n.nome);

  // Abre o bloco desta pergunta no log — inclusive o que ele ESCREVEU, que antes
  // não aparecia (só a fala, pela linha da escuta).
  const turno = new registro.Turno(++turnosNaSessao, userText, canal);
  turnoAtual = turno;
  log(turno.abertura);

  // Respondeu a um pedido de sim? Quem decide é esta fala, não o modelo.
  const decisao = ferramentas.confirmacoes.aoFalarDele(userText);
  if (decisao) log("confirmação:", decisao, "←", JSON.stringify(userText.slice(0, 40)));
  escolhasDoTurno = null;
  send("ev:escolhas", null); // botões antigos saem: a pergunta já foi respondida

  const anexo = await lerAnexoPendente();
  // Antes do anotar: o item desta pergunta tem hora >= desde, e por isso não
  // entra no "fio" se o provedor trocar no meio dela (a pergunta já vai na
  // própria mensagem).
  perguntaAtual = { texto: userText, desde: Date.now() };
  anotar("voce", userText, { canal, anexo: anexo?.nome });
  enviarChats();
  send("ev:message", { quem: "voce", texto: userText, anexo: anexo?.nome });
  setEstado("thinking");

  let vazias = 0;
  let ultimaFalaTeveConteudo = false;
  const ditasNesteTurno = new Set();

  // `[opções: A | B]` sai da fala e da tela e vira botões (escolhas.js).
  const opcoesDaFala = filtroDeOpcoes(
    (texto) => falar(texto),
    (opcoes) => {
      if (!escolhasDoTurno) escolhasDoTurno = { opcoes, tipo: "oferta" };
    }
  );

  const falar = (texto) => {
        // Texto sem uma letra nem um número não é resposta: é enchimento.
        // O gpt-oss-120b devolveu "..." várias vezes seguidas numa conversa,
        // e ela leu cada um em voz alta, o que soa como gaguejo e polui o
        // histórico que vai de volta ao modelo na pergunta seguinte.
        // 07/11: cinco respostas seguidas terminaram com "Se precisar de mais
        // alguma conta ou lembrete, é só avisar." O prompt proíbe fechar
        // assim, e o nemotron fecha assim mesmo. Como a frase chega sozinha,
        // como um parágrafo à parte, dá para tirá-la aqui.
        // Última trava contra laço, venha de qual voz vier: a mesma frase não
        // sai duas vezes na mesma resposta (07/11, "Deixa eu ver o saldo
        // atual da conta" mais de vinte vezes).
        const normal = normalFrase(texto);
        if (normal.length >= 12 && ditasNesteTurno.has(normal)) {
          log("frase repetida descartada:", JSON.stringify(String(texto).trim().slice(0, 60)));
          return;
        }
        if (normal) ditasNesteTurno.add(normal);
        if (FECHO_PRONTO.test(String(texto).trim())) {
          log("fecho pronto descartado:", JSON.stringify(String(texto).trim().slice(0, 60)));
          return;
        }
        if (!temConteudo(texto)) {
          log("resposta vazia descartada:", JSON.stringify(texto.slice(0, 40)));
          vazias++;
          return;
        }
        ultimaFalaTeveConteudo = true;
        if (!escolhasDoTurno && PERGUNTA_CONTINUAR.test(String(texto).trim())) {
          escolhasDoTurno = { opcoes: ["Continua", "Pode parar"], tipo: "oferta" };
        }
        turno.falou(texto);
        anotar("eve", texto);
        send("ev:message", { quem: "eve", texto });
        speak(texto);
  };

  try {
    await brain.ask(userText, {
      canal,
      anexo,
      onSay: (texto) => opcoesDaFala.say(texto),
      // O log não registrava ferramenta nenhuma, e por isso não dava para
      // saber, lendo depois, se ela tinha AGIDO ou só conversado. Era o buraco
      // de diagnóstico mais caro que este app tinha.
      onTool: (nome, args) => {
        log("ferramenta:", nome, resumirArgs(args));
        send("ev:tool", { name: nome });
        setEstado("thinking", nome);
      },
      onDebug: (msg) => log("cérebro:", msg),
      // Cada pedido alimenta o painel de agentes. Os planos gratuitos são
      // medidos em tokens por dia, e sem isto a primeira notícia de que a cota
      // acabou é ela parar de responder no meio da conversa.
      onUso: (uso) => {
        agentes?.registrar(uso);
        enviarAgentes();
      },
      // Um provedor secou e outro assumiu. Isso aparece na tela porque muda o
      // que ela sabe: o provedor novo responde esta pergunta SEM o histórico da
      // conversa anterior — cada cérebro guarda a conversa no formato da sua
      // própria API, e não há tradução fiel entre eles.
      // O provedor descobriu sozinho um modelo que existe na conta: grava, para
      // a próxima abertura já começar certa em vez de pagar a descoberta de novo.
      onModeloProvedor: (provedor, model) => {
        const cfg = loadConfig();
        cfg[`${provedor}Model`] = model;
        // `model` é o modelo do provedor ATIVO. Deixá-lo com o nome do
        // provedor anterior é o que fazia o campo mentir depois de uma troca
        // automática — e um nome de outro provedor não abre nada.
        if (provedor === cfg.provider) cfg.model = model;
        saveConfig(cfg);
        log(`modelo do ${provedor} ajustado para ${model} (guardado)`);
        enviarAgentes();
      },
      onProvedor: (provedor) => {
        // O provedor novo não tem o histórico do anterior, mas recebe o fio da
        // conversa no prompt: tudo o que foi dito antes desta pergunta.
        inicioDoCerebro = perguntaAtual.desde;
        log("provedor trocado para", provedor, "(o fio da conversa vai no prompt)");
        send("ev:notice", { message: `troquei para ${provedor} — o provedor anterior bateu o limite.` });
      },
      onModel: (model) => {
        const cfg = loadConfig();
        // Só o cérebro PRINCIPAL grava aqui. Este callback é do Gemini, e a
        // corrente cai para ele sozinha quando o principal seca — gravando o
        // modelo dele em `model` com `provider` ainda em "groq". Era assim que
        // o campo passava a mentir: na abertura seguinte o Groq pedia
        // `gemini-3.6-flash`, levava 404 e redescobria o que já estava salvo.
        cfg.geminiModel = model;
        if (cfg.provider === "gemini" || !cfg.provider) cfg.model = model;
        saveConfig(cfg);
        log("modelo do gemini ajustado para", model, "(guardado)");
      },
    });
  } catch (err) {
    // Cancelado pelo usuário (Esc, ou ele voltou a falar): não é erro, não tem
    // o que explicar nem o que dizer em voz alta.
    if (err?.cancelado) {
      log("pedido cancelado pelo usuário");
      log(turno.fim("cancelado", brain?.provedorAtivo));
      send("ev:notice", { message: "cancelado." });
      setEstado("idle");
      return;
    }
    log("erro da API:", err.status || "", err.message || String(err));
    log(turno.fim(`erro: ${err.status || ""} ${err.message || err}`, brain?.provedorAtivo));
    if (agentes && brain) {
      agentes.registrar({
        provedor: brain.provedorAtivo || brain.provider || loadConfig().provider,
        erro: err.message || String(err),
      });
      enviarAgentes();
    }
    const { tela, voz } = explicarErro(err);
    send("ev:error", { message: tela });
    speak(voz);
    setEstado("idle");
    return;
  }
  // Solta o que o filtro ainda segurava (uma marca que nunca fechou vira texto).
  opcoesDaFala.fim();

  // A volta inteira saiu em enchimento: nenhuma frase com conteúdo. Ficar
  // calada aqui é o pior desfecho — parece que ela ignorou o pedido. Melhor
  // dizer que não entendeu e deixar ele repetir.
  if (vazias > 0 && !ultimaFalaTeveConteudo) {
    log(`resposta só com enchimento (${vazias} trechos); avisando em vez de ficar muda`);
    const aviso = "Não consegui formular a resposta. Pode repetir?";
    anotar("eve", aviso);
    send("ev:message", { quem: "eve", texto: aviso });
    speak(aviso);
  }
  if (escolhasDoTurno) {
    log("botões:", escolhasDoTurno.opcoes.join(" | "));
    send("ev:escolhas", escolhasDoTurno);
  }
  log(turno.fim("ok", brain?.provedorAtivo));
  // No mudo não existe fala, e quem devolve a esfera para "parada" é o fim da
  // fala — sem isto ela ficaria "pensando" para sempre, e no modo de microfone
  // aberto a escuta nunca reabriria.
  if (loadConfig().mudo) {
    setEstado("idle");
    aoTerminarFala();
  }
  // Fora do mudo, nada de setEstado aqui de propósito: a fala continua na fila
  // depois do ask() retornar.

  // A conversa vai para o cofre AGORA, não ao fechar o app. Salvar no
  // before-quit perde tudo se o app cair, se a máquina dormir ou se ele
  // simplesmente nunca mais tocar naquela janela. Reescrever o arquivo da
  // conversa em andamento custa alguns quilobytes e não perde nada.
  //
  // Sem await: ele não precisa esperar o disco para ouvir a resposta.
  conversas
    ?.salvar(lerHistorico(), { ligacoes: [...ligacoesDaConversa] })
    .catch((err) => log("conversa não salva:", err.message));
  correcaoNoTurno = false;
  enviarChats();
}

// ---------------------------------------------------------------------------
// Anexos — o arquivo que o usuário soltou na janela vai junto com a pergunta
// ---------------------------------------------------------------------------
function tipoDeAnexo(caminho) {
  if (ANEXO_TEXTO.test(caminho)) return "texto";
  if (ANEXO_IMAGEM.test(caminho)) return "imagem";
  if (ANEXO_PDF.test(caminho)) return "pdf";
  return "outro";
}

const MIMES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", pdf: "application/pdf",
};

/// Lê o arquivo pendente no formato que o cérebro entende e limpa o pendente.
/// Imagem e PDF vão em base64; texto vai como texto; o resto não vai — ela
/// recebe o caminho e usa as ferramentas, que é mais útil que um binário.
async function lerAnexoPendente() {
  const pendente = anexoPendente;
  anexoPendente = null;
  if (!pendente) return null;
  send("ev:attachment", null);

  try {
    const tipo = tipoDeAnexo(pendente.caminho);
    const info = fs.statSync(pendente.caminho);

    if (tipo === "texto") {
      const conteudo = fs.readFileSync(pendente.caminho, "utf8");
      return {
        nome: pendente.nome,
        texto: conteudo.slice(0, 120_000),
        truncado: conteudo.length > 120_000,
      };
    }

    if (tipo === "imagem" || tipo === "pdf") {
      let caminho = pendente.caminho;
      // HEIC é formato da Apple; os modelos não leem. Converte na hora.
      if (/\.heic|\.heif$/i.test(caminho)) {
        const jpg = path.join(os.tmpdir(), `eve-anexo-${Date.now()}.jpg`);
        await new Promise((resolve, reject) =>
          execFile("/usr/bin/sips", ["-s", "format", "jpeg", caminho, "--out", jpg], (e) =>
            e ? reject(e) : resolve()
          )
        );
        caminho = jpg;
      }
      // O limite é do que VIAJA pela rede. PDF grande não é caso perdido: o
      // texto dele é extraído aqui no Mac e cabe folgado — e PDF escaneado,
      // que é o que mais passa de 8 MB, é justamente o que ela mais precisa
      // ler. Antes, um escaneamento de 12 MB era simplesmente recusado.
      const grandeDemais = fs.statSync(caminho).size > LIMITE_ANEXO;
      if (grandeDemais && tipo !== "pdf") {
        send("ev:error", { message: `"${pendente.nome}" é grande demais para eu olhar (limite de 8 MB).` });
        return null;
      }
      const ext = path.extname(caminho).slice(1).toLowerCase();
      const anexo = {
        nome: pendente.nome,
        mime: MIMES[ext] || "application/octet-stream",
      };
      if (!grandeDemais) anexo.base64 = fs.readFileSync(caminho).toString("base64");

      // PDF vai com as DUAS formas: o arquivo inteiro, para quem lê PDF de
      // verdade (Gemini, Claude), e o texto extraído aqui no Mac, para todo o
      // resto. Sem o texto, um PDF anexado durante uma conversa no Groq virava
      // "este provedor não lê PDF" — e a corrente troca de provedor sozinha,
      // então isso acontecia sem ele ter mudado nada.
      if (tipo === "pdf") {
        try {
          const r = await lerPdf(caminho, { maxPaginas: 40 });
          if (r.texto?.trim()) {
            anexo.texto =
              (grandeDemais ? "(PDF grande: só o texto foi extraído, sem as imagens)\n\n" : "") +
              (r.ocr ? "(texto obtido por OCR; pode ter erros de leitura)\n\n" : "") +
              r.texto +
              (r.lidas < r.paginas ? `\n\n[li ${r.lidas} de ${r.paginas} páginas]` : "");
            log("pdf lido:", pendente.nome, r.paginas, "página(s)", r.ocr ? "(OCR)" : "");
          }
        } catch (err) {
          log("não consegui extrair o texto do PDF:", err.message);
        }
        if (!anexo.base64 && !anexo.texto) {
          send("ev:error", {
            message: `"${pendente.nome}" passa de 8 MB e não consegui extrair o texto dele.`,
          });
          return null;
        }
      }
      return anexo;
    }

    // Formato que não dá para mandar inteiro: entrega o caminho.
    return {
      nome: pendente.nome,
      texto:
        `(arquivo binário, ${(info.size / 1024).toFixed(0)} KB, não dá para ler direto)\n` +
        `Caminho no disco: ${pendente.caminho}\n` +
        `Use suas ferramentas se precisar examinar.`,
    };
  } catch (err) {
    log("anexo falhou:", err.message);
    send("ev:error", { message: `Não consegui ler "${pendente.nome}": ${err.message}` });
    return null;
  }
}

function anexar(caminho) {
  try {
    const info = fs.statSync(caminho);
    if (!info.isFile()) return { erro: "Isso é uma pasta, não um arquivo." };
    anexoPendente = { caminho, nome: path.basename(caminho), tamanho: info.size };
    log("anexo pronto:", caminho, info.size, "bytes");
    const resumo = {
      nome: anexoPendente.nome,
      tamanho: info.size,
      tipo: tipoDeAnexo(caminho),
    };
    send("ev:attachment", resumo);
    return resumo;
  } catch (err) {
    return { erro: err.message };
  }
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------
function iniciarLembretes() {
  lembretes = new Lembretes({
    arquivo: lembretesPath(),
    log,
    aoDisparar: (item) => {
      const prefixo = item.atrasado ? "Lembrete atrasado: " : "Lembrete: ";
      log("lembrete disparou:", item.id, item.texto, item.atrasado ? "(atrasado)" : "");
      notificar({ titulo: loadConfig().nome, mensagem: item.texto });
      const texto = prefixo + item.texto;
      anotar("eve", texto, { lembrete: true });
      send("ev:message", { quem: "eve", texto, lembrete: true });
      speak(texto);
    },
  });
  const pendentes = lembretes.carregar();
  log("lembretes carregados:", pendentes.length, "pendentes");
}

// ---------------------------------------------------------------------------
// Conversas da barra lateral (chats.js)
// ---------------------------------------------------------------------------
function gravarHistorico(itens) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(historicoPath(), JSON.stringify((itens || []).slice(-120)));
}

function enviarChats() {
  if (!chats) return;
  try {
    send("ev:chats", chats.listar());
  } catch (err) {
    log("conversas: não consegui listar:", err.message);
  }
}

/// Depois de abrir outra conversa (ou uma nova): o cérebro esquece a anterior
/// e passa a receber o fio DESTA pelo prompt — é o que impede o agente de se
/// perder na troca. A conversa que saiu não é apagada: fica no chats.json.
function aposTrocarDeConversa(aberta, motivo) {
  stopSpeaking();
  brain?.cancelar?.();
  brain?.reset();
  inicioDoCerebro = Date.now();
  notasAbertas = [];
  ligacoesDaConversa.clear();
  // O diário no Obsidian começa um arquivo novo a partir daqui.
  if (conversas) conversas.desde = Date.now();
  escolhasDoTurno = null;
  send("ev:escolhas", null);
  for (const item of aberta.itens) liberarArquivo(item.arquivo?.caminho);
  send("ev:history", aberta.itens);
  enviarChats();
  setEstado("idle");
  log(`conversa ${motivo}: ${JSON.stringify(aberta.titulo)} (${aberta.itens.length} itens; o fio vai no prompt)`);
}

// ---------------------------------------------------------------------------
// Ícone na barra de menus
// ---------------------------------------------------------------------------
let tray = null;
let saindo = false;

function mostrarJanela() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.focus();
}

/// O olho em traço (assets/trayTemplate*.png, gerado por build/make-icon.swift).
/// "Template" no nome faz o macOS pintar sozinho de claro ou escuro.
function criarBandeja() {
  try {
    const imagem = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
    imagem.setTemplateImage(true);
    tray = new Tray(imagem);
    tray.setToolTip(loadConfig().nome || "Sexta-Feira");
    atualizarBandeja();
  } catch (err) {
    log("não consegui pôr o ícone na barra de menus:", err.message);
  }
}

function atualizarBandeja() {
  if (!tray || tray.isDestroyed()) return;
  const cfg = loadConfig();
  const nome = cfg.nome || "Sexta-Feira";
  const rotulo = { idle: "pronta", listening: "ouvindo…", thinking: "pensando…", speaking: "falando…" };
  tray.setToolTip(`${nome} — ${rotulo[estadoAtual] || "pronta"}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `${nome} · ${rotulo[estadoAtual] || "pronta"}`, enabled: false },
      { type: "separator" },
      { label: `Abrir ${nome}`, click: mostrarJanela },
      { label: "Falar", accelerator: "Alt+Space", click: () => { mostrarJanela(); mic("start"); } },
      {
        label: "Nova conversa",
        click: () => {
          mostrarJanela();
          aposTrocarDeConversa(chats.nova(), "nova");
        },
      },
      {
        label: "Voz silenciada",
        type: "checkbox",
        checked: !!cfg.mudo,
        click: (item) => {
          const c = loadConfig();
          c.mudo = item.checked;
          saveConfig(c);
          if (c.mudo) stopSpeaking();
          send("ev:config", configPublica());
          atualizarBandeja();
        },
      },
      { type: "separator" },
      { label: `Sair da ${nome}`, accelerator: "Command+Q", click: () => app.quit() },
    ])
  );
}

// ---------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------
function createWindow() {
  // Abre grande: ocupa a maior parte da tela, com uma folga nas bordas. O
  // padrão antigo era 780×860 fixo, que num monitor grande obrigava a
  // redimensionar toda vez. E o tamanho que você deixar fica guardado.
  const area = screen.getPrimaryDisplay().workAreaSize;
  const guardada = loadConfig().janela;
  const largura = guardada?.largura || Math.min(1500, Math.round(area.width * 0.88));
  const altura = guardada?.altura || Math.min(1000, Math.round(area.height * 0.9));

  win = new BrowserWindow({
    width: Math.max(560, Math.min(largura, area.width)),
    height: Math.max(620, Math.min(altura, area.height)),
    minWidth: 560,
    minHeight: 620,
    title: "Sexta-Feira",
    backgroundColor: "#0e1013",
    titleBarStyle: "hiddenInset",
    vibrancy: "under-window",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (guardada?.maximizada) win.maximize();

  // Com o ícone na barra de menus, fechar a janela só a esconde: ela continua
  // ouvindo o ⌥Espaço, avisando lembretes e a um clique no olho lá em cima.
  // Sair de verdade é ⌘Q ou "Sair" no menu do ícone.
  win.on("close", (e) => {
    if (saindo) return;
    e.preventDefault();
    win.hide();
  });

  // Guarda o tamanho só quando ele para de mudar: gravar a cada pixel do
  // arrasto escreveria no disco dezenas de vezes por segundo.
  let gravarDepois = null;
  const lembrarTamanho = () => {
    clearTimeout(gravarDepois);
    gravarDepois = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMinimized()) return;
      const [l, a] = win.getSize();
      const cfg = loadConfig();
      cfg.janela = { largura: l, altura: a, maximizada: win.isMaximized() };
      saveConfig(cfg);
    }, 600);
  };
  win.on("resize", lembrarTamanho);
  win.on("maximize", lembrarTamanho);
  win.on("unmaximize", lembrarTamanho);

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Sem isto a janela pode abrir sem o foco do teclado, e o espaço não chega.
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
    win.webContents.focus();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  migrarConfigAntiga();
  renomearParaSextaFeira();
  separarChaveDoGemini();
  migrarChavePrincipal();
  chats = new Chats({
    arquivo: path.join(app.getPath("userData"), "chats.json"),
    historico: { ler: lerHistorico, gravar: gravarHistorico },
  });
  iniciarLembretes();
  iniciarMemoria();
  agentes = new Agentes({
    arquivo: path.join(app.getPath("userData"), "agentes.json"),
    onDebug: (msg) => log("agentes:", msg),
  });

  // As ferramentas precisam de lembretes, notificação e da chave do Gemini
  // (a pesquisa na web usa a mesma chave do cérebro).
  // Os cartões que já estão no histórico continuam abrindo depois de reabrir
  // o app: a lista de liberados nasce do que foi gravado.
  for (const item of lerHistorico()) liberarArquivo(item.arquivo?.caminho);

  ferramentas.configurar({
    onArquivo: anotarArquivo,
    // Resultado e tempo de cada ferramenta: antes o log só dizia que ela foi
    // CHAMADA, e não dava para saber se deu certo.
    onResultado: ({ nome, ms, resultado }) => {
      const r = registro.resultadoDeFerramenta(resultado);
      turnoAtual?.ferramenta(r.ok);
      log(`  ↳ ${nome} ${r.ok ? "✓" : "✗"} ${ms} ms · ${r.texto}`);
      // Aprender com o erro: toda falha vai para o diário de erros no cofre, e
      // a que se repete volta no prompt como alerta (aprendizados.js).
      if (!r.ok) {
        aprendizados
          ?.registrarFalha({ ferramenta: nome, erro: r.texto.replace(/^erro:\s*/, ""), pedido: perguntaAtual.texto })
          .then(() => atualizarIndiceAprendizados());
      }
      // A nota que ela gravou entra nas ligações da conversa.
      if (r.ok && nome === "anotar_memoria") {
        try {
          const dados = typeof resultado === "string" ? JSON.parse(resultado) : resultado;
          const nota = dados?.nota || dados?.nome || dados?.arquivo;
          if (typeof nota === "string") ligacoesDaConversa.add(nota.replace(/\.md$/, ""));
          if (/aprendizados/.test(String(nota))) aprendizados?.gerarMapa().then(() => atualizarIndiceAprendizados());
        } catch {}
      }
    },
    // A ferramenta pediu o sim dele: os botões Sim/Não entram no fim desta resposta.
    onPedidoDeSim: ({ nome }) => {
      escolhasDoTurno = { opcoes: ROTULOS_CONFIRMACAO, tipo: "confirmacao" };
      log("confirmação pedida:", nome);
    },
    lembretes,
    memoria,
    skills,
    // O Calendário do macOS, que não é a mesma coisa que `lembretes` — ver o
    // comentário no topo de calendario.js.
    calendario,
    // O histórico já existe em disco e é o que de fato foi dito. Deixar a
    // skill pedir para ela REDIGITAR a conversa daria um resumo do que ela
    // lembra, não a conversa.
    conversa: {
      historico: lerHistorico,
      pasta: () => path.join(memoria?.pasta || app.getPath("userData"), "Conversas"),
    },
    notificar,
    // A busca na web é do GOOGLE: ela usa o grounding do Gemini, que nenhum
    // outro provedor tem. Então a chave do Gemini vale aqui mesmo quando o
    // cérebro é o Groq ou o Mistral — por isso ela é guardada à parte de
    // `apiKey`, que pertence ao provedor escolhido. Sem isso, trocar de
    // provedor derrubava a pesquisa para as reservas (DuckDuckGo, Wikipédia)
    // sem ninguém pedir.
    chaveGemini: () => {
      const cfg = loadConfig();
      if (cfg.geminiKey) return cfg.geminiKey;
      return cfg.provider === "gemini" ? cfg.apiKey : null;
    },
    // E o modelo tem de ser um modelo do Gemini: mandar "llama-3.3-70b" para o
    // endpoint do Google só renderia um 404.
    modelo: () => {
      const cfg = loadConfig();
      if (cfg.geminiModel) return cfg.geminiModel;
      return /^gemini/.test(cfg.model || "") ? cfg.model : "gemini-flash-latest";
    },
    // A corrente de buscadores inteira. Cada um entra só se tiver chave; sem
    // nenhuma, sobram as reservas sem chave (DuckDuckGo e Wikipédia).
    chavesDeBusca: () => {
      const cfg = loadConfig();
      const geminiKey = cfg.geminiKey || (cfg.provider === "gemini" ? cfg.apiKey : null);
      const geminiModel = cfg.geminiModel || (/^gemini/.test(cfg.model || "") ? cfg.model : "gemini-flash-latest");
      return {
        geminiKey,
        geminiModel,
        tavilyKey: cfg.tavilyKey || null,
        serperKey: cfg.serperKey || null,
        braveKey: cfg.braveKey || null,
        langsearchKey: cfg.langsearchKey || null,
        searxUrl: cfg.searxUrl || null,
      };
    },
    onDebug: (msg) => log("web:", msg),
  });

  const temChave = initBrain();
  createWindow();
  criarBandeja();
  startListener();
  iniciarPainel();

  win.webContents.once("did-finish-load", () => {
    send("ev:config", configPublica());
    send("ev:history", lerHistorico());
    enviarChats();
    send("ev:setup", { needed: !temChave });
    if (ultimaAmostra) send("ev:metrics", ultimaAmostra);
    enviarAgentes();

    // Checagem de saúde: o motor de escuta deve responder ao PING.
    let vivo = false;
    healthProbe = (evt) => {
      if (evt === "pong") vivo = true;
    };
    tell("PING");
    ajustarEscuta();
    setTimeout(() => {
      if (!vivo) {
        send("ev:error", {
          message: "O motor de escuta não respondeu. Reinstale com: npm run install-app",
        });
      }
    }, 3000);
  });

  // ⌥Espaço chama a Sexta-Feira de qualquer aplicativo.
  const ok = globalShortcut.register("Alt+Space", () => {
    mostrarJanela();
    mic("start");
  });
  if (!ok) log("não consegui registrar ⌥Espaço (outro app já usa)");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mostrarJanela();
  });
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  saindo = true;
  tray?.destroy();
  stopSpeaking();
  clearInterval(painelTimer);
  lembretes?.parar();
  globalShortcut.unregisterAll();
  if (listener) {
    try {
      listener.stdin.write("QUIT\n");
    } catch {}
  }
});

// ---------------------------------------------------------------------------
// Ponte com a interface
// ---------------------------------------------------------------------------
ipcMain.handle("ev:mic", (_e, acao) => mic(acao));
// As conversas da barra lateral.
ipcMain.handle("ev:chats", () => (chats ? chats.listar() : []));
ipcMain.handle("ev:chat-new", () => {
  if (!chats) return { ok: false };
  aposTrocarDeConversa(chats.nova(), "nova");
  return { ok: true };
});
ipcMain.handle("ev:chat-open", (_e, id) => {
  const aberta = chats?.abrir(String(id || ""));
  if (!aberta) return { ok: false, erro: "essa conversa não existe mais" };
  aposTrocarDeConversa(aberta, "aberta");
  return { ok: true };
});
ipcMain.handle("ev:chat-rename", (_e, { id, titulo } = {}) => {
  const ok = !!chats?.renomear(String(id || ""), titulo);
  if (ok) enviarChats();
  return { ok };
});
ipcMain.handle("ev:type", (_e, texto) => ask(String(texto || "").trim(), "texto"));
ipcMain.handle("ev:debug", (_e, msg) => log("interface:", msg));
ipcMain.handle("ev:metrics-now", () => amostrarPainel());
// Os botões do cartão de arquivo no chat.
ipcMain.handle("ev:file-open", async (_e, caminho) => {
  const { alvo, erro } = arquivoLiberado(caminho);
  if (erro) return { ok: false, erro };
  // openPath devolve "" no sucesso e a mensagem de erro no fracasso.
  const falha = await shell.openPath(alvo);
  return falha ? { ok: false, erro: falha } : { ok: true };
});

/// "Baixar" é salvar uma CÓPIA onde ele escolher, começando pelos Downloads.
/// O original fica onde ela gravou: é o caminho que ela disse em voz alta, e
/// movê-lo faria a frase dela virar mentira.
ipcMain.handle("ev:file-save-as", async (_e, caminho) => {
  const { alvo, erro } = arquivoLiberado(caminho);
  if (erro) return { ok: false, erro };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Salvar uma cópia",
    defaultPath: path.join(app.getPath("downloads"), path.basename(alvo)),
    // Da extensão, e não "PDF" fixo: o cartão serve a qualquer arquivo que ela crie.
    filters: [{ name: path.extname(alvo).slice(1).toUpperCase() || "Arquivo", extensions: [path.extname(alvo).slice(1) || "*"] }],
  });
  if (canceled || !filePath) return { ok: false, cancelado: true };
  try {
    if (path.resolve(filePath) !== alvo) await fs.promises.copyFile(alvo, filePath);
    shell.showItemInFolder(filePath);
    return { ok: true, caminho: filePath };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

ipcMain.handle("ev:open-external", (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle("ev:interrupt", () => {
  stopSpeaking();
  brain?.cancelar?.(); // derruba o pedido em andamento, não só a fala
  micAberto = false;
  tell("STOP");
  setEstado("idle");
});

ipcMain.handle("ev:reset", () => {
  brain?.reset();
  inicioDoCerebro = Date.now();
  try {
    fs.writeFileSync(historicoPath(), "[]");
  } catch {}
  send("ev:history", []);
  enviarChats();
  const cfg = loadConfig();
  const msg = `Pronto, esqueci nossa conversa. Começando do zero.`;
  anotar("eve", msg);
  send("ev:message", { quem: "eve", texto: msg });
  speak(msg);
  log("conversa limpa; cérebro:", cfg.provider || "nenhum");
});

// --- Configuração ---
ipcMain.handle("ev:get-config", () => configPublica());

ipcMain.handle("ev:set-config", (_e, mudancas = {}) => {
  const cfg = loadConfig();
  // Só os campos que a tela de configuração governa — chaves de API têm o
  // caminho próprio, com validação.
  const permitidos = [
    "nome", "pronuncia", "dono", "estilo", "proativa",
    "tema", "modoMic", "pausaFala", "notificacoes", "voice", "rate", "pitch",
    "mudo", "claro",
  ];
  for (const campo of permitidos) {
    if (mudancas[campo] === undefined) continue;
    cfg[campo] = mudancas[campo];
  }
  if (mudancas.modoMic && mudancas.modoMic !== "aberto") micAberto = false;
  // Ligar o mudo enquanto ela fala cala na hora: esperar a frase terminar
  // seria o contrário do que o botão promete.
  if (mudancas.mudo === true) stopSpeaking();

  // Quem pensa primeiro. Só aceita provedor que TEM chave — senão a troca
  // deixaria ela sem cérebro, e o erro só apareceria na pergunta seguinte.
  if (mudancas.provider && mudancas.provider !== cfg.provider) {
    const temChaveDele =
      mudancas.provider === "gemini" || mudancas.provider === "anthropic"
        ? !!(cfg[`${mudancas.provider}Key`] || cfg.apiKey)
        : !!cfg[`${mudancas.provider}Key`];
    if (temChaveDele) {
      cfg.provider = mudancas.provider;
      // O modelo salvo pertence ao provedor antigo: um nome do Gemini mandado
      // ao Groq só renderia 404.
      delete cfg.model;
      saveConfig(cfg);
      iniciarCerebro();
      log("provedor principal:", mudancas.provider);
    } else {
      log("provedor", mudancas.provider, "pedido sem chave; ignorado");
    }
  }

  saveConfig(cfg);
  if (mudancas.pausaFala !== undefined) ajustarEscuta();
  log("configuração:", JSON.stringify(mudancas));
  send("ev:config", configPublica());
  return configPublica();
});

/// Grava as chaves dos provedores de reserva, validando cada uma antes.
/// Campo vazio APAGA a reserva — é como se desfaz sem precisar de outro botão.
// Provedores de reserva oferecidos na tela, nesta ordem. Acrescentar um aqui e
// um campo no HTML é tudo — a corrente em brains.js já lida com qualquer um.

ipcMain.handle("ev:save-reserves", async (_e, chaves = {}) => {
  const cfg = loadConfig();
  const relato = [];

  for (const provedor of RESERVAS) {
    const campo = `${provedor}Key`;
    const chave = (chaves[provedor] || "").trim();

    // Mesma regra dos buscadores: vazio é "não mexi", traço é "remova".
    if (!chave) continue;
    if (chave === "-") {
      if (cfg[campo]) {
        cfg[campo] = "";
        relato.push(`${provedor}: removido`);
      }
      continue;
    }
    if (chave === cfg[campo]) continue; // não revalida o que já estava lá

    send("ev:notice", { message: `Verificando a chave do ${provedor}…` });
    const teste = await checkOpenAI(provedor, chave);
    if (!teste.ok) {
      log(`chave do ${provedor} recusada:`, teste.status || "", teste.error);
      send("ev:error", { message: `Chave do ${provedor} recusada: ${teste.error}` });
      return { ok: false, provedor };
    }
    cfg[campo] = chave;
    relato.push(`${provedor}: ${teste.modelos.length} modelos`);
    log(`chave de RESERVA do ${provedor} validada;`, teste.modelos.length, "modelos");
  }

  saveConfig(cfg);
  iniciarCerebro(); // a corrente é montada na construção: precisa remontar
  enviarAgentes();
  const ativos = RESERVAS.filter((p) => temChave(cfg, p));
  send("ev:notice", {
    message: ativos.length
      ? `reservas salvas: ${ativos.join(", ")}.`
      : "reservas removidas.",
  });
  return { ok: true, relato };
});

/// Salvar buscador TESTA a chave com uma busca de verdade. Uma busca custa um
/// crédito de mil — e uma chave errada que ninguém testa não dá erro nenhum:
/// a corrente desce calada para a Wikipédia e ele só descobre dias depois.
ipcMain.handle("ev:save-search", async (_e, chaves = {}) => {
  const cfg = loadConfig();
  const relato = [];
  const CAMPOS = ["tavilyKey", "serperKey", "braveKey", "langsearchKey", "searxUrl"];

  for (const campo of CAMPOS) {
    const valor = (chaves[campo] || "").trim();
    const nome = campo.replace(/Key$|Url$/, "");

    // Campo vazio é "não mexi nisto", NÃO "apague". A tela limpa os campos
    // depois de salvar — então salvar uma chave nova deixava todas as outras
    // vazias no envio, e o salvamento apagava as que já funcionavam. Aconteceu:
    // ele salvou a chave do Serper e perdeu a do Tavily, sem aviso nenhum.
    // Para remover de propósito existe o traço, que é explícito e ninguém
    // digita por acidente.
    if (!valor) continue;
    if (valor === "-") {
      if (cfg[campo]) {
        cfg[campo] = "";
        relato.push(`${nome}: removido`);
      }
      continue;
    }
    if (valor === cfg[campo]) continue; // não gasta busca no que já estava lá

    send("ev:notice", { message: `Testando a pesquisa pelo ${nome}…` });
    try {
      // Só este buscador na corrente: assim o teste não pode ser "passado" por
      // outro respondendo no lugar dele.
      web.limparCache();
      // Chave nova: a cota de antes não diz mais nada sobre esta. Só a deste
      // buscador — apagar os descansos de todos faria o Google esgotado voltar
      // a ser sondado em toda busca.
      web.limparDescanso(nome === "searx" ? "searxng" : nome);
      const r = await web.pesquisar("qual é a capital do Brasil", {
        chaves: { [campo]: valor },
        onDebug: (msg) => log("busca:", msg),
      });
      if (r.fonte === "duckduckgo" || r.fonte === "wikipedia") {
        throw new Error("a chave não respondeu; caiu na reserva sem chave");
      }
      cfg[campo] = valor;
      relato.push(`${nome}: ok`);
      log(`buscador ${nome} validado`);
    } catch (err) {
      log(`buscador ${nome} recusado:`, err.message);
      return { ok: false, erro: `${nome}: ${err.message}` };
    }
  }

  saveConfig(cfg);
  web.limparCache();
  send("ev:notice", { message: relato.length ? "buscadores salvos." : "nada mudou." });
  return { ok: true, relato };
});

ipcMain.handle("ev:save-key", async (_e, key) => {
  const chave = (key || "").trim();
  if (!chave) return false;

  // Chave da ElevenLabs colada no campo errado: ela é de voz, não de raciocínio.
  if (/^sk_/.test(chave)) {
    send("ev:error", {
      message:
        "Essa é uma chave da ElevenLabs — ela vai nas configurações, na aba Voz. " +
        "Aqui eu preciso da chave do Gemini, de aistudio.google.com.",
    });
    return false;
  }

  let provider = detectProvider(chave);
  let modelo = null;

  // Chave de provedor no formato OpenAI (Groq, Cerebras, OpenRouter): confirma
  // na hora, para o usuário não descobrir que errou só na primeira pergunta.
  if (provider && provider !== "gemini" && provider !== "anthropic") {
    send("ev:notice", { message: "Verificando a chave…" });
    const teste = await checkOpenAI(provider, chave);
    if (!teste.ok) {
      log(`chave do ${provider} recusada:`, teste.status || "", teste.error);
      send("ev:error", { message: `Chave do ${provider} recusada: ${teste.error}` });
      return false;
    }
    // "principal" no texto: o ev:save-reserves loga a frase quase igual, e no
    // log do dia 01/11 as duas eram indistinguíveis — foi o que escondeu que
    // uma chave de reserva tinha trocado o provedor principal.
    log(`chave PRINCIPAL do ${provider} validada;`, teste.modelos.length, "modelos");
  }

  // Chave do Google (ou de formato desconhecido): confirma com o próprio Google.
  if (provider === "gemini" || provider === null) {
    send("ev:notice", { message: "Verificando a chave…" });
    const teste = await checkGemini(chave);

    if (teste.ok) {
      provider = "gemini";
      modelo = teste.model;
      log("chave do Gemini validada; modelo escolhido:", modelo);
    } else if (provider === "gemini") {
      log("chave do Gemini recusada:", teste.status || "", teste.error);
      send("ev:error", { message: explicarErro({ status: teste.status, message: teste.error }).tela });
      return false;
    } else {
      send("ev:error", {
        message: "Chave não reconhecida. Use uma do Gemini (aistudio.google.com) ou da Anthropic (sk-ant-…).",
      });
      return false;
    }
  }

  const cfg = loadConfig();
  // Trocar de provedor invalida o modelo salvo do anterior — limpar ANTES de
  // gravar o modelo recém-escolhido, senão apagaríamos justamente ele.
  if (cfg.provider && cfg.provider !== provider) delete cfg.model;
  if (modelo) cfg.model = modelo;
  const anterior = cfg.provider;
  cfg.apiKey = chave;
  cfg.provider = provider;
  // A chave vai TAMBÉM para o campo do provedor dela, e não só para a genérica.
  //
  // 01/11: ele colou a chave do OpenRouter aqui pensando que estava somando uma
  // reserva. Ficou como principal — o que este campo faz — mas `openrouterKey`
  // continuou vazia, então a chave só valia enquanto o OpenRouter FOSSE o
  // principal. No dia em que ele voltasse para a NVIDIA, o OpenRouter sairia da
  // corrente em silêncio, apesar de a chave estar ali no arquivo.
  cfg[`${provider}Key`] = chave;
  // O Gemini também precisa da dele à parte porque a pesquisa na web usa essa
  // chave mesmo quando o cérebro é outro provedor.
  if (provider === "gemini" && modelo) cfg.geminiModel = modelo;
  saveConfig(cfg);

  const ok = initBrain();
  log("cérebro PRINCIPAL configurado:", provider, ok ? "ok" : "falhou");
  // Trocar o principal é uma mudança grande e era muda. Dizer em voz alta,
  // porque quem cola uma chave de reserva no campo errado não tem como saber
  // que acabou de trocar o cérebro que estava funcionando.
  if (ok && anterior && anterior !== provider) {
    send("ev:notice", {
      message:
        `Agora eu respondo pelo ${provider}; o ${anterior} virou reserva. ` +
        `Se você queria só somar uma reserva, o campo é "Reservas" nos ajustes.`,
    });
    log(`principal trocado: ${anterior} → ${provider} (o ${anterior} continua na reserva)`);
  }
  send("ev:setup", { needed: !ok });
  send("ev:config", configPublica());

  if (ok) {
    const nome = cfg.pronuncia || "Ivi";
    const msg = `Prontinho, sou a ${nome} e já estou aqui. Pode falar comigo.`;
    anotar("eve", msg);
    send("ev:message", { quem: "eve", texto: msg });
    speak(msg);
  }
  return ok;
});

// --- Voz ---
ipcMain.handle("ev:voices", async () => {
  const cfg = loadConfig();
  return {
    vozes: await listarVozes(),
    atual: vozAtual(),
    tts: {
      motor: cfg.tts || "macos",
      voiceId: cfg.elevenVoiceId || null,
      rapido: !!cfg.elevenRapido,
      temChave: !!cfg.elevenKey,
    },
  };
});

ipcMain.handle("ev:preview-voice", (_e, { voice, rate, pitch }) => {
  stopSpeaking();
  const cfg = loadConfig();
  const tom = Number(pitch) || cfg.pitch;
  const frase = `Oi, eu sou a ${cfg.pronuncia || "Ivi"}. Assim que eu falo com você.`;
  const texto = tom && tom !== 50 ? `[[pbas ${Math.round(tom)}]] ${frase}` : frase;
  sayProc = execFile(
    "/usr/bin/say",
    ["-v", voice, "-r", String(rate || PADROES.rate), texto],
    () => (sayProc = null)
  );
});

ipcMain.handle("ev:set-voice", (_e, { voice, rate, pitch }) => {
  const cfg = loadConfig();
  cfg.voice = voice;
  cfg.rate = Number(rate) || PADROES.rate;
  if (pitch !== undefined) cfg.pitch = Number(pitch) || PADROES.pitch;
  cfg.tts = "macos"; // escolher aqui desliga a ElevenLabs
  saveConfig(cfg);
  log("voz definida:", voice, "velocidade", cfg.rate, "tom", cfg.pitch);
  send("ev:config", configPublica());
  speak("Pronto, essa é a minha voz agora.");
  return true;
});

ipcMain.handle("ev:open-voice-settings", () => {
  shell.openExternal("x-apple.systempreferences:com.apple.preference.universalaccess?SpokenContent");
});

// --- ElevenLabs ---
ipcMain.handle("ev:eleven-connect", async (_e, key) => {
  const chave = (key || "").trim() || loadConfig().elevenKey || "";
  if (!chave) return { ok: false, erro: "Cole a chave da ElevenLabs." };
  try {
    const [todas, cota] = await Promise.all([listarVozesEleven(chave), cotaEleven(chave)]);
    const { vozes, ocultas } = vozesUsaveis(todas, cota?.plano);
    const cfg = loadConfig();
    cfg.elevenKey = chave;
    saveConfig(cfg);
    log(
      "elevenlabs conectada:", vozes.length, "vozes" +
        (ocultas.length ? ` (fora da lista, precisam de plano pago: ${ocultas.join(", ")})` : "")
    );
    return { ok: true, vozes, cota };
  } catch (err) {
    log("elevenlabs recusou a chave:", err.status || "", err.message);
    return { ok: false, erro: explicarErroEleven(err) };
  }
});

ipcMain.handle("ev:eleven-preview", async (_e, { previewUrl }) => {
  try {
    stopSpeaking();
    const mp3 = await baixarPreview(previewUrl);
    const arquivo = path.join(os.tmpdir(), "eve-preview.mp3");
    fs.writeFileSync(arquivo, mp3);
    sayProc = execFile("/usr/bin/afplay", [arquivo], () => (sayProc = null));
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: explicarErroEleven(err) };
  }
});

ipcMain.handle("ev:set-tts", (_e, { motor, voiceId, rapido, velocidade }) => {
  const cfg = loadConfig();
  cfg.tts = motor; // "macos" ou "elevenlabs"
  if (voiceId) cfg.elevenVoiceId = voiceId;
  // `undefined` aqui é "não mexi nisso", não "desliga". Mandar `!!undefined`
  // desligava o modo rápido sem que ele pedisse — bastava arrastar o controle
  // de velocidade, que é um campo só da velocidade.
  if (rapido !== undefined) cfg.elevenRapido = !!rapido;
  if (velocidade !== undefined) cfg.elevenVelocidade = velocidadeValida(velocidade);
  saveConfig(cfg);
  avisouReserva = false; // configuração nova merece um aviso novo, se falhar
  log("motor de voz:", motor, voiceId || "", rapido ? "(rápido)" : "", "velocidade", cfg.elevenVelocidade);
  send("ev:config", configPublica());
  speak(motor === "elevenlabs" ? "Pronto, essa é a minha voz agora." : "Voltei para a voz do macOS.");
  return true;
});

// --- Lembretes (a interface também os lista) ---
// --- anexos ---
ipcMain.handle("ev:attach-file", (_e, caminho) => anexar(caminho));

/// Imagem colada da área de transferência. Não existe caminho no disco — o que
/// chega é o conteúdo —, então gravamos num temporário e seguimos pelo mesmo
/// caminho de qualquer outro anexo. O arquivo fica na pasta de temporários do
/// sistema, que o macOS limpa sozinho.
ipcMain.handle("ev:attach-data", (_e, dados = {}) => {
  try {
    const { nome, mime, base64 } = dados;
    if (!base64) return { erro: "nada para anexar" };
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > LIMITE_ANEXO) {
      return { erro: `imagem grande demais (${(bytes.length / 1024 / 1024).toFixed(1)} MB).` };
    }
    const ext = (mime || "image/png").split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
    const seguro = (nome || "colado").replace(/[^\w.-]/g, "_").slice(0, 60);
    const destino = path.join(
      os.tmpdir(),
      `eve-colado-${Date.now()}-${seguro.endsWith(ext) ? seguro : seguro + "." + ext}`
    );
    fs.writeFileSync(destino, bytes);
    log("imagem colada gravada em", destino, bytes.length, "bytes");
    return anexar(destino);
  } catch (err) {
    return { erro: err.message };
  }
});
ipcMain.handle("ev:clear-attachment", () => {
  anexoPendente = null;
  send("ev:attachment", null);
});
ipcMain.handle("ev:choose-file", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Mandar um arquivo para a Sexta-Feira",
    properties: ["openFile"],
    buttonLabel: "Anexar",
  });
  if (r.canceled || !r.filePaths.length) return null;
  return anexar(r.filePaths[0]);
});

ipcMain.handle("ev:reminders", () => (lembretes ? lembretes.listar() : []));
ipcMain.handle("ev:cancel-reminder", (_e, id) => {
  const r = lembretes?.cancelar(id);
  return r;
});
