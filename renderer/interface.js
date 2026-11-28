// interface.js — a tela da Sexta-Feira (a E.V.E até 25/11/2026).
//
// 25/11/2026: o layout passou a ser o das conversas do Claude — conversas à
// esquerda, o chat no meio, e o painel dela à direita (esfera, contexto,
// sistema e agentes). As barras deixaram de ser blocos e viraram um trilho só,
// de pontas arredondadas, com a cor do nível.
//
// Organização do arquivo:
//   1. temas
//   2. monitor do sistema (barras no estilo btop)
//   3. registro da conversa
//   4. eventos do processo principal
//   5. teclado, microfone e anexos
//   6. configurações
//
// O estado de verdade (ouvindo, pensando, falando) vem do processo principal.
// Aqui a gente só reflete — foi o que acabou com as divergências entre a tecla
// de espaço, o clique na esfera e o atalho global.

// ===========================================================================
// 1. Temas
// ===========================================================================
// 25/11/2026: todos os escuros ficaram quase pretos (ele pediu "mais puxado
// para o preto, menos para o cinza"). A diferença entre fundo, barra lateral,
// painel e campo é pequena de propósito: separa as áreas sem acinzentar.
//
// Verde, âmbar e vermelho são IGUAIS em todos os temas: são sinal (uso baixo,
// médio, alto), não decoração, e mudar de tema não pode mudar o que eles
// querem dizer. As barras têm cores próprias e vivas no index.html
// (--barra-ok…); estas aqui são as do texto.
const SINAL_ESCURO = { "--ok": "#22d37f", "--meio": "#fbbf24", "--alto": "#ff6b6b" };
const SINAL_CLARO = { "--ok": "#067647", "--meio": "#b54708", "--alto": "#d92d20" };

const TEMAS = {
  // O tema da Sexta-Feira: preto neutro e o ciano do olho dela.
  sexta: {
    nome: "Sexta-Feira", desc: "preto e o ciano do olho",
    vars: {
      "--fundo": "#0a0b0d", "--lateral": "#060708", "--painel": "#111215", "--campo": "#15161a",
      "--borda": "#272a30", "--texto": "#ececed", "--fraco": "#8d9098", "--ac": "#5cc8ff", "--ac2": "#a99bff",
      ...SINAL_ESCURO,
    },
    esfera: { idle: [92, 200, 255], listening: [110, 240, 180], thinking: [169, 155, 255], speaking: [130, 220, 255] },
  },
  holografico: {
    nome: "Holográfico", desc: "ciano sobre azul-noite",
    vars: {
      "--fundo": "#04080d", "--lateral": "#020508", "--painel": "#0a1219", "--campo": "#0e1820",
      "--borda": "#1a2a38", "--texto": "#e6f4ff", "--fraco": "#86a6bf", "--ac": "#6fd8ff", "--ac2": "#b3a6ff",
      ...SINAL_ESCURO,
    },
    esfera: { idle: [95, 208, 255], listening: [110, 240, 180], thinking: [155, 140, 255], speaking: [251, 191, 36] },
  },
  ambar: {
    nome: "Âmbar", desc: "terminal antigo",
    vars: {
      "--fundo": "#0b0805", "--lateral": "#070503", "--painel": "#140f09", "--campo": "#19130c",
      "--borda": "#33281a", "--texto": "#fbefdb", "--fraco": "#b39570", "--ac": "#ffc96e", "--ac2": "#ff9a5e",
      ...SINAL_ESCURO,
    },
    esfera: { idle: [255, 190, 92], listening: [163, 230, 53], thinking: [255, 138, 76], speaking: [255, 214, 120] },
  },
  esmeralda: {
    nome: "Esmeralda", desc: "osciloscópio",
    vars: {
      "--fundo": "#040b08", "--lateral": "#020604", "--painel": "#09140f", "--campo": "#0d1a14",
      "--borda": "#183325", "--texto": "#dcfae9", "--fraco": "#74ab91", "--ac": "#5ff7b4", "--ac2": "#63d8ff",
      ...SINAL_ESCURO,
    },
    esfera: { idle: [91, 240, 174], listening: [170, 255, 210], thinking: [79, 208, 255], speaking: [251, 191, 36] },
  },
  violeta: {
    nome: "Violeta", desc: "roxo profundo",
    vars: {
      "--fundo": "#08060d", "--lateral": "#050308", "--painel": "#110d1a", "--campo": "#161120",
      "--borda": "#2a2140", "--texto": "#efe7ff", "--fraco": "#9d91c0", "--ac": "#c4a3ff", "--ac2": "#ff9bd8",
      ...SINAL_ESCURO,
    },
    esfera: { idle: [179, 136, 255], listening: [120, 245, 190], thinking: [255, 135, 207], speaking: [251, 191, 36] },
  },
  mono: {
    nome: "Monocromático", desc: "branco sobre preto",
    vars: {
      "--fundo": "#09090a", "--lateral": "#050506", "--painel": "#121213", "--campo": "#171719",
      "--borda": "#27272a", "--texto": "#f4f4f5", "--fraco": "#9a9aa1", "--ac": "#ededf0", "--ac2": "#b8bcc5",
      ...SINAL_ESCURO,
    },
    esfera: { idle: [223, 226, 230], listening: [255, 255, 255], thinking: [158, 163, 171], speaking: [200, 205, 212] },
  },
};

// Versão clara de cada tema. É um EIXO à parte, não um sétimo tema: o tema
// escolhe a cor de destaque, o claro/escuro escolhe o fundo. Os destaques são
// escurecidos à mão até terem contraste de verdade sobre o branco.
const CLAROS = {
  sexta: {
    vars: {
      "--fundo": "#ffffff", "--lateral": "#f6f6f7", "--painel": "#ffffff", "--campo": "#ffffff",
      "--borda": "#e2e3e7", "--texto": "#16171a", "--fraco": "#62646c", "--ac": "#0a72b3", "--ac2": "#5a43d6",
      ...SINAL_CLARO,
    },
    esfera: { idle: [10, 114, 179], listening: [6, 118, 71], thinking: [90, 67, 214], speaking: [10, 114, 179] },
  },
  holografico: {
    vars: {
      "--fundo": "#f6fafd", "--lateral": "#eaf2f8", "--painel": "#ffffff", "--campo": "#ffffff",
      "--borda": "#c9dae7", "--texto": "#06161f", "--fraco": "#3c5e78", "--ac": "#00618a", "--ac2": "#4433c4",
      ...SINAL_CLARO,
    },
    esfera: { idle: [0, 97, 138], listening: [6, 118, 71], thinking: [68, 51, 196], speaking: [143, 64, 0] },
  },
  ambar: {
    vars: {
      "--fundo": "#fdfaf4", "--lateral": "#f5eee1", "--painel": "#ffffff", "--campo": "#ffffff",
      "--borda": "#e3d5bd", "--texto": "#2a1c07", "--fraco": "#6d5331", "--ac": "#7d4502", "--ac2": "#a8330a",
      ...SINAL_CLARO,
    },
    esfera: { idle: [125, 69, 2], listening: [6, 118, 71], thinking: [168, 51, 10], speaking: [143, 64, 0] },
  },
  esmeralda: {
    vars: {
      "--fundo": "#f5fbf8", "--lateral": "#e8f4ee", "--painel": "#ffffff", "--campo": "#ffffff",
      "--borda": "#c4ddd0", "--texto": "#062018", "--fraco": "#336450", "--ac": "#00634a", "--ac2": "#025682",
      ...SINAL_CLARO,
    },
    esfera: { idle: [0, 99, 74], listening: [6, 118, 71], thinking: [2, 86, 130], speaking: [143, 64, 0] },
  },
  violeta: {
    vars: {
      "--fundo": "#faf7fe", "--lateral": "#f1eafc", "--painel": "#ffffff", "--campo": "#ffffff",
      "--borda": "#dccff0", "--texto": "#1c1233", "--fraco": "#55457c", "--ac": "#5a17c4", "--ac2": "#a30d5d",
      ...SINAL_CLARO,
    },
    esfera: { idle: [90, 23, 196], listening: [6, 118, 71], thinking: [163, 13, 93], speaking: [143, 64, 0] },
  },
  mono: {
    vars: {
      "--fundo": "#ffffff", "--lateral": "#f4f4f5", "--painel": "#ffffff", "--campo": "#ffffff",
      "--borda": "#e0e0e3", "--texto": "#0e0f12", "--fraco": "#55585f", "--ac": "#1c1e22", "--ac2": "#4f535b",
      ...SINAL_CLARO,
    },
    esfera: { idle: [28, 30, 34], listening: [14, 15, 18], thinking: [79, 83, 91], speaking: [92, 84, 76] },
  },
};

const LADOS_ESFERA = { pequena: "180px", media: "230px", grande: "290px" };

function aplicarVisual(cfg) {
  const nomeTema = TEMAS[cfg.tema] ? cfg.tema : "sexta";
  const tema = TEMAS[nomeTema];
  const claro = !!cfg.claro;
  const paleta = claro ? CLAROS[nomeTema] || CLAROS.sexta : tema;

  // Os temas antigos não têm a cor da barra lateral nem a do campo de texto:
  // saem do fundo e do painel, para nenhum tema ficar com cinza de outro.
  const vars = {
    "--lateral": paleta.vars["--fundo"],
    "--campo": paleta.vars["--painel"],
    ...paleta.vars,
  };
  for (const [chave, valor] of Object.entries(vars)) {
    document.documentElement.style.setProperty(chave, valor);
  }
  // O CSS tem uns poucos lugares que precisam saber do fundo claro — sombra,
  // brilho e a opacidade de alguns traços não invertem sozinhos.
  document.documentElement.dataset.claro = claro ? "1" : "";
  window.esfera?.tema(paleta.esfera);
  window.esfera?.claro(claro);
  atualizarBotaoClaro(claro);

  document.documentElement.style.setProperty(
    "--esfera-lado",
    LADOS_ESFERA[cfg.esferaTamanho || "media"] || LADOS_ESFERA.media
  );
  window.esfera?.desempenho(cfg.desempenho || "normal");
  window.esfera?.modelo?.(cfg.esferaModelo || "holografica");
  requestAnimationFrame(() => window.esfera?.redimensionar());
}

// ===========================================================================
// 2. Monitor do sistema — barras unificadas
// ===========================================================================
// Até 25/11/2026 cada barra era uma fileira de 16 blocos no estilo btop. Ele
// pediu barras inteiras, de pontas arredondadas, "alterando as cores conforme
// o maior ou menor uso". Então: um trilho, um preenchimento, e a cor do
// preenchimento é a do NÍVEL (verde até 50%, âmbar até 80%, vermelho acima).
const MEDIDAS = [
  { id: "cpu", rot: "CPU" },
  { id: "mem", rot: "Memória" },
  { id: "gpu", rot: "GPU" },
  { id: "disco", rot: "Disco" },
  { id: "rede", rot: "Rede" },
  { id: "bat", rot: "Bateria" },
  { id: "temp", rot: "Temperatura" },
];

const elMedida = {};

/// Uma barra: trilho arredondado com o preenchimento dentro.
function criarBarra() {
  const barra = document.createElement("div");
  barra.className = "barra";
  const enche = document.createElement("div");
  enche.className = "enche";
  barra.appendChild(enche);
  return barra;
}

/// fracao = 0…1, ou null para "sem medida". `faixa` força a cor (bateria).
function encherBarra(barra, fracao, faixa) {
  const enche = barra.firstElementChild;
  if (fracao == null) {
    barra.className = "barra sem";
    enche.style.width = "0%";
    return;
  }
  const f = Math.max(0, Math.min(1, fracao));
  barra.className = "barra " + (faixa || faixaDe(f));
  // Um fio aparece mesmo em 0–1%: barra vazia parece quebrada.
  enche.style.width = Math.max(f * 100, 2.5).toFixed(1) + "%";
}

(function montarMedidas() {
  const alvo = document.getElementById("medidas");
  for (const m of MEDIDAS) {
    const caixa = document.createElement("div");
    caixa.className = "medida";

    const linha = document.createElement("div");
    linha.className = "linha";
    const rot = document.createElement("span");
    rot.className = "rot";
    rot.textContent = m.rot;
    const val = document.createElement("span");
    val.className = "val valorCor";
    val.textContent = "—";
    linha.append(rot, val);

    const barra = criarBarra();
    const det = document.createElement("div");
    det.className = "det";

    caixa.append(linha, barra, det);
    alvo.appendChild(caixa);
    elMedida[m.id] = { caixa, rot: m.rot, val, barra, det };
  }
})();

function faixaDe(fracao) {
  if (fracao <= 0.5) return "ok";
  if (fracao <= 0.8) return "meio";
  return "alto";
}

/// porcento = 0…100, ou null para "sem barra". detalhe = linha pequena embaixo.
function pintar(id, texto, porcento, detalhe) {
  const m = elMedida[id];
  if (!m) return;
  m.val.textContent = texto;
  m.det.textContent = detalhe || "";
  // O monitor é compacto: o detalhe (núcleos, GB livres…) vai para o passar
  // do mouse, em vez de uma linha a mais embaixo de cada barra.
  m.caixa.title = detalhe ? `${m.rot}: ${texto} · ${detalhe}` : `${m.rot}: ${texto}`;
  // Medida que este Mac não informa (temperatura sem root, GPU sem driver)
  // não ocupa lugar: uma barra vazia para sempre só gasta espaço.
  m.caixa.classList.toggle("oculta", porcento == null && /n\/d/.test(texto));
  if (porcento == null) {
    m.val.className = "val valorCor";
    encherBarra(m.barra, null);
    return;
  }
  encherBarra(m.barra, porcento / 100);
  m.val.className = "val valorCor " + faixaDe(porcento / 100);
}

const bytes = (b) => {
  if (b < 1024) return `${Math.round(b)} B/s`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB/s`;
  return `${(b / 1024 / 1024).toFixed(1)} MB/s`;
};

function mostrarMetricas(m) {
  pintar("cpu", m.cpu + "%", m.cpu, `${m.nucleos} núcleos`);
  pintar("mem", m.memoria.porcento + "%", m.memoria.porcento,
    `${m.memoria.usadaGB} de ${m.memoria.totalGB} GB`);

  // Nem todo Mac publica a ocupação da GPU; aí fica só o modelo, sem barra.
  pintar("gpu", m.gpu.porcento != null ? m.gpu.porcento + "%" : "n/d", m.gpu.porcento,
    (m.gpu.nome || "").replace(/^(Intel|Apple|AMD|NVIDIA)\s*/i, ""));

  if (m.disco) {
    pintar("disco", m.disco.porcento + "%", m.disco.porcento, `${m.disco.livreGB} GB livres`);
  }

  // Rede não tem "100%": a barra usa escala logarítmica até ~16 MB/s, senão o
  // uso normal ficaria sempre preso no primeiro bloco.
  const total = m.rede?.total || 0;
  const escala = total <= 0 ? 0 : Math.min(100, (Math.log10(1 + total / 1024) / Math.log10(16384)) * 100);
  pintar("rede", bytes(total), escala, `↓ ${bytes(m.rede?.entrada || 0)}  ↑ ${bytes(m.rede?.saida || 0)}`);

  if (m.bateria) {
    // Bateria é o contrário das outras: cheia é bom, então a cor inverte.
    //
    // E aqui ela NÃO é um degradê ao longo da barra, como nas outras medidas.
    // Era, e ficava errado: pintando bloco a bloco pela posição, o começo da
    // barra saía vermelho, e uma bateria em 88% aparecia quase toda vermelha
    // enquanto o número ao lado dizia verde. Agora a barra inteira assume a
    // cor do NÍVEL — cheia é verde, acabando é vermelha —, que é o que o
    // número diz e o que se lê de relance.
    const b = elMedida.bat;
    const faixa = faixaDe(1 - m.bateria.porcento / 100);
    encherBarra(b.barra, m.bateria.porcento / 100, faixa);
    b.val.textContent = m.bateria.porcento + "%";
    b.val.className = "val valorCor " + faixaDe(1 - m.bateria.porcento / 100);
    b.det.textContent = m.bateria.estado + (m.bateria.restante ? ` · ${m.bateria.restante}` : "");
    b.caixa.title = `Bateria: ${m.bateria.porcento}% · ${b.det.textContent}`;
  } else {
    pintar("bat", "tomada", null, "sem bateria");
  }

  // O sensor de temperatura do Mac exige root; melhor n/d do que número inventado.
  pintar("temp", m.temperatura != null ? m.temperatura + "°C" : "n/d", m.temperatura, "exige acesso root");

  document.getElementById("infoUp").textContent = m.uptime;
  document.getElementById("infoProc").textContent = m.processos ?? "—";
  document.getElementById("infoSo").textContent = m.so || "—";
}

// O relógio bate de segundo em segundo, independente do painel.
function tiqueRelogio() {
  const agora = new Date();
  document.getElementById("relogioHora").textContent = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("relogioData").textContent = agora
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .replace(/\./g, "");
}
tiqueRelogio();
setInterval(tiqueRelogio, 1000);

// ===========================================================================
// 3. Registro da conversa
// ===========================================================================
const roloEl = document.getElementById("rolo");
const estadoEl = document.getElementById("estado");
const parcialEl = document.getElementById("parcial");
const entradaEl = document.getElementById("entrada");
const btnMicEl = document.getElementById("btnMic");

const ROTULOS = { idle: "pronta", listening: "ouvindo", thinking: "pensando", speaking: "falando" };

let estado = "idle";
let micAberto = false;
let configAtual = {};
let ultimaLinhaEve = null;
// Quem rola é a faixa inteira do chat; #rolo é a coluna de mensagens dentro dela.
const rolagemEl = document.getElementById("rolo-externo");

function perto() {
  return rolagemEl.scrollHeight - rolagemEl.scrollTop - rolagemEl.clientHeight < 140;
}
function rolar(forcar) {
  atualizarVazio();
  if (forcar || perto()) rolagemEl.scrollTop = rolagemEl.scrollHeight;
}

/// A conversa vazia mostra o olho dela e uma saudação, como o Claude.
const vazioEl = document.getElementById("vazio");
function atualizarVazio() {
  const temConversa = !!roloEl.querySelector(".linha-log.voce, .linha-log.eve");
  vazioEl.classList.toggle("show", !temConversa);
  if (!temConversa) {
    const h = new Date().getHours();
    const periodo = h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    document.getElementById("saudacao").textContent = configAtual.dono ? `${periodo}, ${configAtual.dono}` : periodo;
  }
}

for (const b of document.querySelectorAll("#sugestoes [data-sugestao]")) {
  b.addEventListener("click", () => window.ev.type(b.dataset.sugestao));
}

/// Escreve tratando **negrito** e `código`. Monta nós de texto, nunca HTML:
/// o que vem do modelo não pode virar markup.
/// Pedaços em linha: **negrito**, `código` e [texto](link).
function escreverLinha(el, texto) {
  const partes = String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  for (const parte of partes) {
    if (!parte) continue;
    if (parte.startsWith("**") && parte.endsWith("**")) {
      const b = document.createElement("b");
      b.textContent = parte.slice(2, -2);
      el.appendChild(b);
    } else if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 2) {
      const c = document.createElement("code");
      c.textContent = parte.slice(1, -1);
      el.appendChild(c);
    } else {
      const link = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const a = document.createElement("a");
        a.dataset.url = link[2];
        a.textContent = link[1];
        el.appendChild(a);
      } else {
        el.appendChild(document.createTextNode(parte));
      }
    }
  }
}

/// A resposta dela, com a forma que ela escreveu.
///
/// Antes isto era só negrito e código numa única linha de texto: parágrafo,
/// lista e título chegavam como caractere solto e saíam como um bloco corrido.
/// Ele pediu o contrário — "o que tiver que quebrar parágrafo que seja assim".
///
/// A estrutura do Markdown é de BLOCO: não se decide o que é um item de lista
/// olhando um caractere por vez. Então o fragmento novo entra no texto cru da
/// bolha e a bolha é redesenhada inteira. Custa reparsear algumas centenas de
/// caracteres por frase, e é o que torna o resultado correto em vez de
/// aproximado.
///
/// Tabela não entra de propósito: além de não caber na largura da bolha, tudo
/// isto é LIDO EM VOZ ALTA, e pipe não se fala. O prompt pede lista.
function escrever(el, textoCru) {
  el.textContent = "";
  const linhas = String(textoCru || "").split("\n");
  let i = 0;
  let listaAtual = null; // <ul>/<ol> aberto, para itens seguidos entrarem juntos

  const fecharLista = () => {
    listaAtual = null;
  };

  while (i < linhas.length) {
    const linha = linhas[i];

    // Bloco de código cercado por ```
    const cerca = linha.match(/^\s*```(\w*)\s*$/);
    if (cerca) {
      fecharLista();
      const corpo = [];
      i++;
      while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) {
        corpo.push(linhas[i]);
        i++;
      }
      i++; // passa a cerca de fechamento
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = corpo.join("\n");
      pre.appendChild(code);
      el.appendChild(pre);
      continue;
    }

    // Linha vazia: separa blocos, e fecha a lista que estava aberta.
    if (!linha.trim()) {
      fecharLista();
      i++;
      continue;
    }

    // Título. Vira uma linha de destaque, não um <h1> — isto é uma bolha de
    // conversa, e um título de 2em dentro dela seria grito.
    const titulo = linha.match(/^\s*#{1,6}\s+(.*)$/);
    if (titulo) {
      fecharLista();
      const d = document.createElement("div");
      d.className = "md-titulo";
      escreverLinha(d, titulo[1]);
      el.appendChild(d);
      i++;
      continue;
    }

    // Item de lista, com marcador ou numerado.
    const item = linha.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (item) {
      const numerada = item[1] !== undefined;
      if (!listaAtual || listaAtual.tagName !== (numerada ? "OL" : "UL")) {
        listaAtual = document.createElement(numerada ? "ol" : "ul");
        listaAtual.className = "md-lista";
        if (numerada) listaAtual.start = Number(item[1]) || 1;
        el.appendChild(listaAtual);
      }
      const li = document.createElement("li");
      escreverLinha(li, item[2]);
      listaAtual.appendChild(li);
      i++;
      continue;
    }

    // Parágrafo: junta as linhas seguintes até uma vazia ou outro bloco, e uma
    // quebra simples no meio vira <br> — ela usa isso para separar itens que
    // não são lista.
    fecharLista();
    const p = document.createElement("p");
    p.className = "md-p";
    let primeira = true;
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !/^\s*(?:#{1,6}\s|```|[-*•]\s|\d+[.)]\s)/.test(linhas[i])
    ) {
      if (!primeira) p.appendChild(document.createElement("br"));
      escreverLinha(p, linhas[i].trim());
      primeira = false;
      i++;
    }
    el.appendChild(p);
  }
}

/// Cola o fragmento novo no que a bolha já tem.
///
/// A quebra pode vir no FIM do fragmento anterior ou no COMEÇO do novo,
/// dependendo de onde o corte de fala caiu: se caiu no ponto final de um item
/// de lista, a quebra que separa os itens chega na frente do fragmento
/// seguinte. Qualquer uma das duas vale; na falta das duas entra um espaço, que
/// é o que diferencia "dois parágrafos" de "duas frases do mesmo parágrafo".
function juntarFragmentos(antes, novo) {
  // Bolha nova não começa com quebra: isso só abriria uma linha vazia.
  if (!antes) return novo.replace(/^\n+/, "");
  const fechaAntes = /\n$/.test(antes);
  const abreNovo = /^\n/.test(novo);
  // As duas juntas dariam parágrafo onde havia só linha nova.
  if (fechaAntes && abreNovo) return antes + novo.replace(/^\n+/, "");
  if (fechaAntes || abreNovo) return antes + novo;
  return antes + " " + novo;
}

function registrar({ quem, texto, classe }) {
  // FRAGMENTOS SEGUIDOS DELA ENTRAM NA MESMA BOLHA.
  //
  // A fala sai frase a frase para ela começar a falar antes de o modelo
  // terminar — ótimo para a voz, péssimo para a tela: cada frase virava uma
  // linha "E.V.E:" própria, e uma resposta de sete linhas aparecia picada em
  // sete falas, como ele viu em 02/11. Juntar aqui não mexe na fala: o áudio
  // continua saindo frase a frase.
  //
  // `classe` separa o que PRECISA de bolha própria: erro e lembrete disparado
  // não são continuação da resposta.
  if (quem === "eve" && !classe && ultimaLinhaEve) {
    const alvo = ultimaLinhaEve.querySelector(".txt");
    if (alvo) {
      // A bolha guarda o texto CRU e é redesenhada inteira. Markdown é
      // estrutura de bloco: não se costura um item de lista colando pedaço no
      // DOM, porque o pedaço seguinte pode pertencer ao mesmo item.
      ultimaLinhaEve._cru = juntarFragmentos(ultimaLinhaEve._cru || "", texto);
      escrever(alvo, ultimaLinhaEve._cru);
      rolar();
      return ultimaLinhaEve;
    }
  }

  const linha = document.createElement("div");
  linha.className = "linha-log " + quem + (classe ? " " + classe : "");

  const rotulo = document.createElement("span");
  rotulo.className = "quem";
  rotulo.textContent =
    classe === "erro" ? "Erro" : quem === "eve" ? configAtual.nome || "Sexta-Feira" : "Você";
  linha.appendChild(rotulo);

  // O olho dela ao lado de cada resposta: o mesmo símbolo vetorial da logo.
  if (quem === "eve") {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "olho avatar-olho");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#olho");
    svg.appendChild(use);
    linha.appendChild(svg);
  }

  const txt = document.createElement("span");
  txt.className = "txt";
  linha._cru = String(texto ?? "");
  escrever(txt, linha._cru);
  linha.appendChild(txt);

  roloEl.appendChild(linha);
  // Só a resposta corrida continua aberta para receber frase. Fala dele, erro
  // e lembrete fecham a bolha anterior — senão a resposta seguinte dela
  // grudaria no que veio antes.
  ultimaLinhaEve = quem === "eve" && !classe ? linha : null;
  rolar();
  return linha;
}

function registrarSistema(texto) {
  const linha = document.createElement("div");
  linha.className = "linha-log sis";
  linha.textContent = texto;
  roloEl.appendChild(linha);
  rolar();
}

function mostrarFerramenta(nome) {
  const alvo = ultimaLinhaEve || registrar({ quem: "eve", texto: "" });
  const f = document.createElement("span");
  f.className = "ferr";
  f.textContent = "⚙ " + nome.replace(/_/g, " ");
  alvo.appendChild(f);
  rolar();
}

/// "30838" → "30 KB". Tamanho é para ele saber se dá para mandar no WhatsApp,
/// não para contar byte.
function tamanhoLegivel(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/// O cartão do arquivo que ela criou, dentro da bolha da resposta dela: ícone,
/// nome, páginas e tamanho, e os botões Abrir e Baixar. Sem ele, "salvei em
/// ~/Documents/relatorio.pdf" mandava ele procurar o arquivo no Finder.
function mostrarArquivo(arquivo) {
  if (!arquivo?.caminho) return;
  const alvo = ultimaLinhaEve || registrar({ quem: "eve", texto: "" });

  const cartao = document.createElement("div");
  cartao.className = "arquivo";

  const icone = document.createElement("span");
  icone.className = "arquivo-icone";
  icone.textContent = (arquivo.tipo || "arq").toUpperCase();
  icone.setAttribute("aria-hidden", "true");

  const info = document.createElement("span");
  info.className = "arquivo-info";
  const nome = document.createElement("span");
  nome.className = "arquivo-nome";
  nome.textContent = arquivo.nome || arquivo.caminho.split("/").pop();
  nome.title = arquivo.caminho;
  const meta = document.createElement("span");
  meta.className = "arquivo-meta";
  const paginas = arquivo.paginas ? `${arquivo.paginas} página${arquivo.paginas === 1 ? "" : "s"} · ` : "";
  meta.textContent = paginas + tamanhoLegivel(arquivo.bytes);
  info.append(nome, meta);

  // O resultado de cada botão vira linha de sistema: arquivo movido ou apagado
  // depois de criado é o caso comum, e falhar calado parece botão quebrado.
  const botao = (rotulo, classe, acao) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "arquivo-botao " + classe;
    b.textContent = rotulo;
    b.setAttribute("aria-label", `${rotulo} ${nome.textContent}`);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const r = await acao(arquivo.caminho);
        if (r?.ok && r.caminho) registrarSistema(`cópia salva em ${r.caminho}`);
        else if (r && !r.ok && !r.cancelado) registrarSistema(`não consegui: ${r.erro}`);
      } finally {
        b.disabled = false;
      }
    });
    return b;
  };

  const acoes = document.createElement("span");
  acoes.className = "arquivo-acoes";
  acoes.append(
    botao("Abrir", "secundario", window.ev.openFile),
    botao("Baixar", "primario", window.ev.saveFileAs)
  );

  cartao.append(icone, info, acoes);
  alvo.appendChild(cartao);
  rolar();
}

function setEstado(s, rotulo) {
  estado = s;
  // "pensando" e "falando" geram nível sozinhos: religar o laço aqui é o que
  // permite que ele se desligue quando não há nada para animar.
  pedirQuadroDeNivel();
  document.body.className = s === "idle" ? "" : s;
  estadoEl.textContent = rotulo ? `${ROTULOS[s] || s} · ${rotulo}` : ROTULOS[s] || "";
  window.esfera?.estado(s);

  btnMicEl.classList.toggle("ligado", s === "listening" || micAberto);
  // Só o título: o botão é um ícone, e textContent apagaria o SVG.
  btnMicEl.title = micAberto ? "microfone aberto — clique para fechar" : s === "listening" ? "ouvindo…" : "falar (espaço)";
  document.getElementById("pilulaEstado").textContent = estadoEl.textContent || "pronta";

  // O estado do microfone já está escrito no próprio botão, acima: um selo
  // repetindo isso era a mesma informação ocupando o dobro do espaço.
}

// ------------------------------------------------- reação ao volume da voz
// Enquanto o usuário fala, o nível é o volume real medido pelo motor de escuta.
// Enquanto a E.V.E fala não temos o áudio dela para medir, então geramos uma
// envoltória — é um indicador de fala, e está escrito aqui para ninguém
// confundir com medição.
let nivelAlvo = 0;
let nivelSuave = 0;
let faseFala = 0;
// O último valor REALMENTE escrito em --level, e se já existe quadro pedido.
let nivelEscrito = -1;
let quadroPedido = false;

// Enquanto ela fala ou pensa, o nível é gerado aqui — sempre há o que animar.
// Fora disso só há movimento se o volume ainda está subindo ou descendo. E
// quando chega a zero, parado é parado: o laço para em vez de rodar à toa.
const temOqueAnimar = () =>
  estado === "speaking" || estado === "thinking" || nivelAlvo > 0 || nivelSuave > 0;

function pedirQuadroDeNivel() {
  if (quadroPedido || !temOqueAnimar()) return;
  quadroPedido = true;
  requestAnimationFrame(animarNivel);
}

function animarNivel(t) {
  quadroPedido = false;
  if (estado === "speaking") {
    faseFala += 0.085;
    nivelAlvo = Math.max(
      0.1,
      Math.min(1, 0.42 + 0.3 * Math.sin(faseFala) + 0.16 * Math.sin(faseFala * 2.7 + 1.1))
    );
  } else if (estado === "thinking") {
    nivelAlvo = 0.12 + 0.06 * Math.sin(t / 420);
  }

  const subindo = nivelAlvo > nivelSuave;
  nivelSuave += (nivelAlvo - nivelSuave) * (subindo ? 0.45 : 0.12);
  if (nivelSuave < 0.001) nivelSuave = 0;

  // Só escrever quando MUDA, e em passo de 0,01 — isto é o conserto de um
  // consumo de GPU real, não zelo. --level mora no :root e três regras
  // dependem dele, entre elas a opacidade da grade do palco (um elemento
  // grande, pintado com quatro degradês e uma máscara) e um scaleY. Escrever
  // a variável invalida o estilo das três; escrever o MESMO valor invalida
  // igual, sem mudar um pixel. Como o laço rodava sempre — inclusive em
  // silêncio absoluto — a GPU recompunha a tela 60 a 120 vezes por segundo
  // para não mostrar nada diferente. O passo de 0,01 é menor do que o olho
  // distingue num degradê, e corta o repintar por tremor do microfone.
  const v = Math.round(nivelSuave * 100) / 100;
  if (v !== nivelEscrito) {
    nivelEscrito = v;
    document.documentElement.style.setProperty("--level", v.toFixed(2));
    window.esfera?.nivel(v);
  }

  pedirQuadroDeNivel();
}
pedirQuadroDeNivel();

// ===========================================================================
// 4. Eventos vindos do processo principal
// ===========================================================================
window.ev.on("config", (cfg) => {
  configAtual = { ...configAtual, ...cfg };
  mostrarMudo();
  mostrarNomes();
  aplicarVisual(configAtual);
  preencherConfig();
  setEstado(estado);
});

window.ev.on("history", (itens) => {
  roloEl.textContent = "";
  ultimaLinhaEve = null;
  itensNaConversa = itens.length;
  mostrarContexto();
  for (const i of itens) {
    // O item do arquivo carrega o cartão, não texto: o "📎 nome" gravado junto
    // é para o diário e para quem ler o historico.json à mão.
    if (i.arquivo) {
      mostrarArquivo(i.arquivo);
      continue;
    }
    registrar({
      quem: i.quem === "voce" ? "voce" : "eve",
      texto: i.texto,
      classe: i.lembrete ? "lembrete" : "",
    });
  }
  if (itens.length) registrarSistema("conversa recuperada — o fio dela vai junto para o agente.");
  rolar(true);
});

window.ev.on("state", ({ state, rotulo, micAberto: aberto }) => {
  if (aberto !== undefined) micAberto = aberto;
  if (state !== "listening") {
    nivelAlvo = 0;
    parcialEl.textContent = "";
  }
  setEstado(state, rotulo);
});

window.ev.on("mic", ({ aberto }) => {
  micAberto = !!aberto;
  setEstado(estado);
});

window.ev.on("level", ({ value }) => {
  if (estado !== "listening") return;
  nivelAlvo = value;
  pedirQuadroDeNivel();
});

window.ev.on("heard", ({ text, final }) => {
  parcialEl.textContent = final ? "" : text || "";
});

window.ev.on("message", ({ quem, texto, lembrete, anexo, local, iniciativa }) => {
  parcialEl.textContent = "";
  itensNaConversa++;
  mostrarContexto();
  registrar({ quem, texto: anexo ? `[${anexo}] ${texto}` : texto, classe: lembrete ? "lembrete" : "" });
  // De onde veio: a rede de linguagem dela (sem agente) ou uma iniciativa da
  // rede pulsada. Aparece como as ferramentas, logo abaixo da fala.
  if (local === "lembranca") mostrarFerramenta("rede neural · lembrou do que aprendeu com o agente");
  else if (local) mostrarFerramenta(`rede neural · pensou sozinha (${local})`);
  else if (iniciativa) mostrarFerramenta(`rede neural · por conta própria (${String(iniciativa).toLowerCase()})`);
  atualizarLembretes();
});

window.ev.on("tool", ({ name }) => mostrarFerramenta(name));
window.ev.on("arquivo", (arquivo) => mostrarArquivo(arquivo));
window.ev.on("escolhas", (dados) => mostrarEscolhas(dados));

/// Botões de resposta embaixo da última fala dela: o "Sim, pode / Não" de um
/// pedido de confirmação, ou as opções que ela ofereceu. Clicar é o mesmo que
/// escrever o rótulo — falar também vale. Só existe um grupo por vez, e ele
/// some quando chega a resposta (qualquer que seja).
function mostrarEscolhas(dados) {
  document.querySelectorAll(".escolhas").forEach((el) => el.remove());
  if (!dados?.opcoes?.length) return;

  const grupo = document.createElement("div");
  grupo.className = "escolhas" + (dados.tipo === "confirmacao" ? " confirmacao" : "");
  grupo.setAttribute("role", "group");
  grupo.setAttribute("aria-label", dados.tipo === "confirmacao" ? "Confirmar" : "Responder");

  dados.opcoes.forEach((rotulo, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "arquivo-botao " + (i === 0 ? "primario" : "secundario");
    b.textContent = rotulo;
    b.addEventListener("click", () => {
      grupo.remove();
      window.ev.type(rotulo);
    });
    grupo.appendChild(b);
  });

  roloEl.appendChild(grupo);
  rolar();
}
window.ev.on("error", ({ message }) => registrar({ quem: "eve", texto: message, classe: "erro" }));
window.ev.on("notice", ({ message }) => registrarSistema(message));
window.ev.on("metrics", mostrarMetricas);
window.ev.on("attachment", (info) => mostrarAnexo(info));

window.ev.on("setup", ({ needed }) => {
  document.getElementById("setup").classList.toggle("show", needed);
  if (needed) document.getElementById("chaveSetup").focus();
});

// ===========================================================================
// 5. Interação
// ===========================================================================
const telaConfig = document.getElementById("telaConfig");
const setupEl = document.getElementById("setup");

const algumaTelaAberta = () =>
  telaConfig.classList.contains("show") || setupEl.classList.contains("show");

document.getElementById("esfera").addEventListener("click", () => window.ev.mic("toggle"));
btnMicEl.addEventListener("click", () => window.ev.mic("toggle"));
document.getElementById("btnInterromper").addEventListener("click", () => window.ev.interrupt());
document.getElementById("btnLimpar").addEventListener("click", () => window.ev.newChat());

// O painel da direita: some e volta (em janela estreita ele flutua por cima).
document.getElementById("btnPainel").addEventListener("click", () => {
  const largo = window.innerWidth > 1100;
  document.body.classList.toggle(largo ? "sem-painel" : "com-painel");
  requestAnimationFrame(() => window.esfera?.redimensionar());
});
document.getElementById("btnConfig").addEventListener("click", abrirConfig);
document.getElementById("btnFecharConfig").addEventListener("click", fecharConfig);

/// O campo cresce com o texto até um teto, e aí passa a rolar. Campo de uma
/// linha escondia o que você acabou de escrever assim que passava da largura —
/// que é exatamente quando reler importa.
function ajustarAltura() {
  entradaEl.style.height = "auto";
  entradaEl.style.height = Math.min(entradaEl.scrollHeight, 190) + "px";
}

function enviarTexto() {
  const texto = entradaEl.value.trim();
  if (!texto) return;
  entradaEl.value = "";
  ajustarAltura();
  window.ev.type(texto);
}

document.getElementById("btnEnviar").addEventListener("click", enviarTexto);
entradaEl.addEventListener("input", ajustarAltura);

entradaEl.addEventListener("keydown", (e) => {
  // Enter envia; ⇧enter quebra linha. Sem a exceção do shift, um campo de
  // várias linhas seria impossível de usar para um texto de verdade.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarTexto();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    entradaEl.blur(); // devolve o espaço para o microfone
  }
});

// --- teclado da janela (fase de captura: chega antes de qualquer botão) ---
let pressionadoEm = 0;

window.addEventListener(
  "keydown",
  (e) => {
    const emCampo = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "");

    if (e.metaKey && e.key === ",") {
      e.preventDefault();
      abrirConfig();
      return;
    }
    // ⌘N (e o ⌘K de antes): conversa nova. A anterior fica na barra lateral.
    if (e.metaKey && ["k", "n"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      window.ev.newChat();
      return;
    }
    if (e.metaKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      alternarMudo();
      return;
    }

    if (setupEl.classList.contains("show")) {
      if (e.key === "Enter") document.getElementById("btnSetup").click();
      return;
    }
    if (telaConfig.classList.contains("show")) {
      if (e.key === "Escape" && !emCampo) fecharConfig();
      return;
    }
    if (e.key === "Escape") {
      window.ev.interrupt();
      return;
    }
    if (emCampo) return;

    // Espaço: aperte e fale. Segurar e soltar envia; um toque curto deixa
    // ouvindo até o silêncio. No modo "sempre aberto", liga/desliga.
    if (e.code === "Space") {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (configAtual.modoMic === "aberto") {
        window.ev.mic("toggle");
      } else {
        pressionadoEm = Date.now();
        window.ev.mic("start");
      }
      return;
    }

    // Começar a digitar leva o foco para o campo, sem perder a primeira letra.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      entradaEl.focus();
      entradaEl.value += e.key;
      e.preventDefault();
    }
  },
  true
);

window.addEventListener(
  "keyup",
  (e) => {
    if (e.code !== "Space") return;
    if (configAtual.modoMic === "aberto" || algumaTelaAberta()) return;
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
    // Segurou: solta e manda. Tocou de leve: continua ouvindo até calar.
    if (pressionadoEm && Date.now() - pressionadoEm > 400) window.ev.mic("stop");
    pressionadoEm = 0;
  },
  true
);

window.addEventListener("focus", () => {
  if (!algumaTelaAberta()) document.body.focus();
});
document.body.focus();

// Links abrem no navegador do sistema, não dentro do app.
document.addEventListener("click", (e) => {
  const url = e.target?.dataset?.url;
  if (url) {
    e.preventDefault();
    window.ev.openExternal(url);
  }
});

// --- anexos: arrastar, clicar ou COLAR ---
// O alvo de soltar é o compositor inteiro, não um retângulo tracejado à parte:
// o lugar onde você ia escrever é o lugar onde você espera largar o arquivo.
const compositorEl = document.getElementById("compositor");
const anexadoEl = document.getElementById("anexado");

function mostrarAnexo(info) {
  if (!info || info.erro) {
    anexadoEl.classList.remove("tem");
    if (info?.erro) registrarSistema("anexo: " + info.erro);
    return;
  }
  const tamanho =
    info.tamanho > 1024 * 1024
      ? (info.tamanho / 1024 / 1024).toFixed(1) + " MB"
      : Math.max(1, Math.round(info.tamanho / 1024)) + " KB";
  document.getElementById("anexadoNome").textContent = `${info.nome} · ${tamanho}`;
  anexadoEl.classList.add("tem");
  registrarSistema(`arquivo pronto: ${info.nome}. vai junto com a sua próxima mensagem.`);
}

document.getElementById("anexadoX").addEventListener("click", () => {
  window.ev.clearAttachment();
  anexadoEl.classList.remove("tem");
});

document.getElementById("btnAnexar").addEventListener("click", async () => {
  const info = await window.ev.chooseFile();
  if (info) mostrarAnexo(info);
});

for (const evento of ["dragenter", "dragover"]) {
  window.addEventListener(evento, (e) => {
    e.preventDefault();
    compositorEl.classList.add("sobre");
  });
}
window.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) compositorEl.classList.remove("sobre");
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  compositorEl.classList.remove("sobre");
  const arquivo = e.dataTransfer?.files?.[0];
  if (!arquivo) return;
  // File.path saiu do Electron 32; quem resolve o caminho é o preload.
  const caminho = window.ev.filePath(arquivo);
  if (!caminho) return registrarSistema("não consegui ler o caminho desse arquivo.");
  mostrarAnexo(await window.ev.attachFile(caminho));
});

/// Colar imagem (print do ⌘⇧4, figura copiada do navegador). Aqui NÃO existe
/// caminho no disco: o que vem é o conteúdo, então mandamos os bytes e o
/// processo principal grava num arquivo temporário antes de anexar.
entradaEl.addEventListener("paste", async (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (!item) return; // texto colado segue o caminho normal

  e.preventDefault();
  const arquivo = item.getAsFile();
  if (!arquivo) return;
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  mostrarAnexo(
    await window.ev.attachData({
      nome: arquivo.name || `colado-${Date.now()}.png`,
      mime: arquivo.type,
      base64: btoa(bin),
    })
  );
});

// ===========================================================================
// 6. Configurações
// ===========================================================================
function abrirConfig() {
  telaConfig.classList.add("show");
  preencherConfig();
  carregarVozes();
  atualizarLembretes(true);
}
function fecharConfig() {
  telaConfig.classList.remove("show");
  document.body.focus();
}

for (const aba of telaConfig.querySelectorAll(".aba[data-folha]")) {
  aba.addEventListener("click", () => {
    for (const o of telaConfig.querySelectorAll(".aba[data-folha]")) o.classList.remove("ativa");
    aba.classList.add("ativa");
    for (const f of telaConfig.querySelectorAll(".folha")) f.classList.remove("ativa");
    const folhas = {
      geral: "folhaGeral", voz: "folhaVoz", visual: "folhaVisual",
      lembretes: "folhaLembretes", chave: "folhaChave", conexoes: "folhaConexoes",
    };
    document.getElementById(folhas[aba.dataset.folha])?.classList.add("ativa");
  });
}

function grupo(idContainer, campo, aoEscolher) {
  const cont = document.getElementById(idContainer);
  if (!cont) return;
  cont.addEventListener("click", (e) => {
    const botao = e.target.closest(".opcao");
    if (!botao) return;
    for (const o of cont.querySelectorAll(".opcao")) o.classList.remove("sel");
    botao.classList.add("sel");
    if (aoEscolher) aoEscolher(botao.dataset.v);
    else salvar({ [campo]: botao.dataset.v });
  });
}

function marcar(idContainer, valor) {
  const cont = document.getElementById(idContainer);
  if (!cont) return;
  for (const o of cont.querySelectorAll(".opcao")) o.classList.toggle("sel", o.dataset.v === valor);
}

async function salvar(mudancas) {
  configAtual = { ...configAtual, ...(await window.ev.setConfig(mudancas)) };
  aplicarVisual(configAtual);
}

// Preferências que só a tela usa ficam no localStorage: menos ida e volta.
function salvarLocal(mudancas) {
  configAtual = { ...configAtual, ...mudancas };
  try {
    localStorage.setItem(
      "eve-visual",
      JSON.stringify({
        esferaTamanho: configAtual.esferaTamanho,
        desempenho: configAtual.desempenho,
        esferaModelo: configAtual.esferaModelo,
      })
    );
  } catch {}
  aplicarVisual(configAtual);
}

(function carregarVisualLocal() {
  try {
    Object.assign(configAtual, JSON.parse(localStorage.getItem("eve-visual") || "{}"));
  } catch {}
})();

grupo("cfgEstilo", "estilo");
grupo("cfgModoMic", "modoMic");
grupo("cfgTema", "tema");
grupo("cfgEsfera", null, (v) => salvarLocal({ esferaTamanho: v }));
grupo("cfgModeloEsfera", null, (v) => salvarLocal({ esferaModelo: v }));
grupo("cfgDesempenho", null, (v) => {
  salvarLocal({ desempenho: v });
  mostrarCustoGrafico();
});

(function montarTemas() {
  const cont = document.getElementById("cfgTema");
  for (const [chave, t] of Object.entries(TEMAS)) {
    const b = document.createElement("button");
    b.className = "opcao";
    b.dataset.v = chave;
    const titulo = document.createElement("b");
    titulo.textContent = t.nome;
    b.appendChild(titulo);
    b.appendChild(document.createTextNode(t.desc));
    const amostra = document.createElement("span");
    amostra.className = "amostra";
    // A amostra mostra o tema de verdade: fundo, painel, destaque e o segundo destaque.
    for (const cor of [t.vars["--fundo"], t.vars["--painel"], t.vars["--ac"], t.vars["--ac2"]]) {
      const i = document.createElement("i");
      i.style.background = cor;
      amostra.appendChild(i);
    }
    b.appendChild(amostra);
    cont.appendChild(b);
  }
})();

function mostrarCustoGrafico() {
  const info = window.esfera?.custo?.();
  const el = document.getElementById("ajudaDesempenho");
  if (!el || !info) return;
  el.textContent =
    `Agora: ${info.fps} quadros por segundo em uso, ${info.fpsParado} parada, ` +
    `${info.pontos} pontos por quadro. Menos quadros = menos GPU e mais bateria.`;
}

for (const [id, campo] of Object.entries({ cfgNome: "nome", cfgPronuncia: "pronuncia", cfgDono: "dono" })) {
  const el = document.getElementById(id);
  el.addEventListener("change", () => salvar({ [campo]: el.value.trim() }));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.blur();
  });
}

for (const [id, campo] of Object.entries({
  cfgProativa: "proativa", cfgNotificacoes: "notificacoes",
  cfgIniciativa: "iniciativa", cfgSegundoPlano: "segundoPlano", cfgLogin: "abrirNoLogin",
})) {
  document.getElementById(id).addEventListener("change", (e) => salvar({ [campo]: e.target.checked }));
}

const pausaEl = document.getElementById("cfgPausa");
pausaEl.addEventListener("input", () => (document.getElementById("vPausa").textContent = pausaEl.value + "s"));
pausaEl.addEventListener("change", () => salvar({ pausaFala: Number(pausaEl.value) }));

function preencherConfig() {
  const c = configAtual;
  document.getElementById("cfgNome").value = c.nome || "";
  document.getElementById("cfgPronuncia").value = c.pronuncia || "";
  document.getElementById("cfgDono").value = c.dono || "";
  document.getElementById("cfgProativa").checked = !!c.proativa;
  document.getElementById("cfgNotificacoes").checked = !!c.notificacoes;
  document.getElementById("cfgIniciativa").checked = c.iniciativa !== false;
  document.getElementById("cfgSegundoPlano").checked = c.segundoPlano !== false;
  document.getElementById("cfgLogin").checked = !!c.abrirNoLogin;
  pausaEl.value = c.pausaFala ?? 2.5;
  document.getElementById("vPausa").textContent = (c.pausaFala ?? 2.5) + "s";

  marcar("cfgEstilo", c.estilo || "doce");
  marcar("cfgModoMic", c.modoMic || "toque");
  marcar("cfgTema", c.tema || "holografico");
  marcar("cfgEsfera", c.esferaTamanho || "media");
  marcar("cfgModeloEsfera", c.esferaModelo || "holografica");
  marcar("cfgDesempenho", c.desempenho || "normal");
  mostrarCustoGrafico();

  const ajuda = document.getElementById("ajudaChave");
  if (ajuda) {
    ajuda.textContent = c.temChave
      ? `Conectada pelo ${c.provider === "gemini" ? "Google Gemini" : "Anthropic Claude"}${
          c.model ? " · " + c.model : ""
        }. Colar outra chave substitui esta.`
      : "Sem chave ainda — é o que ela usa para pensar e para pesquisar na web.";
  }
}

// --- vozes do macOS ---
const ROTULO_QUALIDADE = { premium: "PREMIUM", aprimorada: "APRIMORADA", padrão: "PADRÃO", novidade: "NOVIDADE" };
const listaVozesEl = document.getElementById("listaVozes");
const rateEl = document.getElementById("cfgRate");
const pitchEl = document.getElementById("cfgPitch");
let vozEscolhida = null;
let vozesCarregadas = false;

async function carregarVozes() {
  const { vozes, atual, tts } = await window.ev.voices();
  vozEscolhida = atual.voice;
  rateEl.value = atual.rate;
  pitchEl.value = atual.pitch;
  document.getElementById("vRate").textContent = atual.rate;
  document.getElementById("vPitch").textContent = atual.pitch;

  if (!vozesCarregadas) {
    listaVozesEl.textContent = "";
    for (const v of vozes) {
      const linha = document.createElement("div");
      linha.className = "item" + (v.nome === vozEscolhida ? " sel" : "");

      const n = document.createElement("span");
      n.className = "n";
      n.textContent = v.nome.replace(/\s*\(Português \(Brasil\)\)/, "");
      linha.appendChild(n);

      const t = document.createElement("span");
      t.className = "t" + (v.qualidade === "premium" || v.qualidade === "aprimorada" ? " boa" : "");
      t.textContent = v.idioma === "pt_PT" ? "PORTUGAL" : ROTULO_QUALIDADE[v.qualidade] || "PADRÃO";
      linha.appendChild(t);

      const ouvir = document.createElement("button");
      ouvir.className = "ouvir";
      ouvir.textContent = "ouvir";
      ouvir.addEventListener("click", (e) => {
        e.stopPropagation();
        window.ev.previewVoice({ voice: v.nome, rate: +rateEl.value, pitch: +pitchEl.value });
      });
      linha.appendChild(ouvir);

      linha.addEventListener("click", () => {
        vozEscolhida = v.nome;
        for (const o of listaVozesEl.children) o.classList.remove("sel");
        linha.classList.add("sel");
        window.ev.setVoice({ voice: v.nome, rate: +rateEl.value, pitch: +pitchEl.value });
      });

      listaVozesEl.appendChild(linha);
    }
    vozesCarregadas = true;
  }

  if (tts.motor === "elevenlabs" || tts.temChave) {
    trocarMotor("eleven");
    conectarEleven();
  }
}

rateEl.addEventListener("input", () => (document.getElementById("vRate").textContent = rateEl.value));
pitchEl.addEventListener("input", () => (document.getElementById("vPitch").textContent = pitchEl.value));
for (const el of [rateEl, pitchEl]) {
  el.addEventListener("change", () => {
    if (vozEscolhida) window.ev.setVoice({ voice: vozEscolhida, rate: +rateEl.value, pitch: +pitchEl.value });
  });
}
document.getElementById("btnOuvirTom").addEventListener("click", () =>
  window.ev.previewVoice({ voice: vozEscolhida, rate: +rateEl.value, pitch: +pitchEl.value })
);
document.getElementById("baixarVozes").addEventListener("click", () => window.ev.openVoiceSettings());

// --- ElevenLabs ---
function trocarMotor(qual) {
  for (const a of telaConfig.querySelectorAll(".aba[data-motor]")) {
    a.classList.toggle("ativa", a.dataset.motor === qual);
  }
  document.getElementById("painelMacos").style.display = qual === "macos" ? "" : "none";
  document.getElementById("painelEleven").style.display = qual === "eleven" ? "" : "none";
}
for (const a of telaConfig.querySelectorAll(".aba[data-motor]")) {
  a.addEventListener("click", () => trocarMotor(a.dataset.motor));
}

const listaElevenEl = document.getElementById("listaEleven");
const subElevenEl = document.getElementById("subEleven");
const btnUsarEleven = document.getElementById("btnUsarEleven");
let vozEleven = null;

async function conectarEleven() {
  const r = await window.ev.elevenConnect(document.getElementById("chaveEleven").value);
  if (!r.ok) {
    subElevenEl.textContent = r.erro;
    return;
  }
  document.getElementById("conectarEleven").style.display = "none";

  const restante =
    r.cota && r.cota.limite != null
      ? ` Restam ${(r.cota.limite - r.cota.usado).toLocaleString("pt-BR")} caracteres este mês.`
      : "";
  subElevenEl.textContent = `${r.vozes.length} vozes disponíveis.${restante} Ouvir as amostras não gasta cota.`;

  listaElevenEl.textContent = "";
  // A voz que está valendo é a do config, não a última clicada nesta sessão.
  // Começar por ela é o que faz a lista abrir já mostrando a escolha dele —
  // antes abria toda apagada, e a única forma de saber qual voz estava no ar
  // era ouvir.
  vozEleven = configAtual?.elevenVoiceId || null;
  if (vozEleven) btnUsarEleven.disabled = false;
  const rapidoEl = document.getElementById("cfgRapido");
  if (rapidoEl) rapidoEl.checked = !!configAtual?.elevenRapido;

  for (const v of r.vozes) {
    const linha = document.createElement("div");
    linha.className = "item";
    if (v.id === vozEleven) linha.classList.add("sel");

    const n = document.createElement("span");
    n.className = "n";
    n.textContent = v.nome;
    linha.appendChild(n);

    if (v.descricao) {
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = v.descricao.toUpperCase();
      linha.appendChild(t);
    }

    if (v.previewUrl) {
      const ouvir = document.createElement("button");
      ouvir.className = "ouvir";
      ouvir.textContent = "ouvir";
      ouvir.addEventListener("click", (e) => {
        e.stopPropagation();
        window.ev.elevenPreview({ previewUrl: v.previewUrl });
      });
      linha.appendChild(ouvir);
    }

    linha.addEventListener("click", () => {
      vozEleven = v.id;
      for (const o of listaElevenEl.children) o.classList.remove("sel");
      linha.classList.add("sel");
      btnUsarEleven.disabled = false;
      if (v.previewUrl) window.ev.elevenPreview({ previewUrl: v.previewUrl });
    });

    listaElevenEl.appendChild(linha);
  }
}

document.getElementById("btnEleven").addEventListener("click", conectarEleven);

// Velocidade da fala neural. Fica separada do "rate" da voz do macOS porque
// as unidades são outras: aqui é um multiplicador de 0,7 a 1,2 que a própria
// ElevenLabs aplica; lá são palavras por minuto.
const velocidadeEl = document.getElementById("cfgVelocidade");
const vVelocidadeEl = document.getElementById("vVelocidade");

function mostrarVelocidade() {
  if (!velocidadeEl) return;
  const v = Number(configAtual?.elevenVelocidade ?? 1);
  velocidadeEl.value = String(v);
  vVelocidadeEl.textContent = v.toFixed(2).replace(".", ",") + "×";
}

velocidadeEl?.addEventListener("input", () => {
  vVelocidadeEl.textContent = Number(velocidadeEl.value).toFixed(2).replace(".", ",") + "×";
});
// Só no "change": a cada passo do arraste seria um pedido à ElevenLabs por
// milímetro de mouse, e cada pedido gasta cota.
velocidadeEl?.addEventListener("change", async () => {
  await window.ev.setTts({
    motor: configAtual?.tts || "elevenlabs",
    voiceId: vozEleven || undefined,
    rapido: document.getElementById("cfgRapido").checked,
    velocidade: +velocidadeEl.value,
  });
  configAtual = { ...configAtual, ...(await window.ev.getConfig()) };
});

btnUsarEleven.addEventListener("click", async () => {
  if (!vozEleven) return;
  await window.ev.setTts({
    motor: "elevenlabs",
    voiceId: vozEleven,
    rapido: document.getElementById("cfgRapido").checked,
    velocidade: +velocidadeEl.value,
  });
});

// --- lembretes ---
const listaLembretesEl = document.getElementById("listaLembretes");

async function atualizarLembretes(desenhar) {
  const lista = await window.ev.reminders();
  if (!desenhar && !telaConfig.classList.contains("show")) return;

  listaLembretesEl.textContent = "";
  if (!lista.length) {
    const vazio = document.createElement("div");
    vazio.className = "item";
    vazio.style.color = "var(--fraco)";
    vazio.textContent = "nenhum lembrete pendente";
    listaLembretesEl.appendChild(vazio);
    return;
  }
  for (const l of lista) {
    const linha = document.createElement("div");
    linha.className = "item";
    linha.style.cursor = "default";

    const n = document.createElement("span");
    n.className = "n";
    n.textContent = l.texto;
    linha.appendChild(n);

    const t = document.createElement("span");
    t.className = "t";
    t.textContent = l.quando.toUpperCase();
    linha.appendChild(t);

    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "cancelar";
    x.addEventListener("click", async () => {
      await window.ev.cancelReminder(l.id);
      atualizarLembretes(true);
    });
    linha.appendChild(x);

    listaLembretesEl.appendChild(linha);
  }
}

// --- claro / escuro ---
const btnClaroEl = document.getElementById("btnClaro");

function atualizarBotaoClaro(claro) {
  if (!btnClaroEl) return;
  // Só o título. Mexer em textContent aqui APAGAVA o SVG do sol e da lua —
  // textContent substitui os filhos do elemento — e o botão passava a mostrar
  // a palavra "claro" no lugar do ícone. Sobrou de quando ele era de texto.
  btnClaroEl.title = claro ? "voltar ao modo escuro" : "alternar para o modo claro";
}

btnClaroEl?.addEventListener("click", async () => {
  await salvar({ claro: !configAtual.claro });
});

// --- mudo: ela responde por escrito, sem falar ---
// Não é o mesmo que "interromper": aquele cala a frase de agora, este cala
// todas as próximas, até ser desligado. E continua escrevendo na conversa.
const btnMudoEl = document.getElementById("btnMudo");

async function alternarMudo() {
  await salvar({ mudo: !configAtual.mudo });
  mostrarMudo();
}

function mostrarMudo() {
  if (!btnMudoEl) return;
  const mudo = !!configAtual.mudo;
  btnMudoEl.classList.toggle("mudo", mudo);
  btnMudoEl.title = mudo
    ? "a voz está desligada — ela responde escrevendo (⌘M)"
    : "silenciar a voz; ela continua respondendo por escrito (⌘M)";
}

btnMudoEl?.addEventListener("click", alternarMudo);

// ===========================================================================
// Uso dos agentes
// ===========================================================================
// Os planos gratuitos são medidos em TOKENS POR DIA, não em perguntas. Este
// painel existe para a cota acabar com aviso, e não no meio de uma conversa.
const NOMES_AGENTE = {
  gemini: "gemini",
  anthropic: "claude",
  groq: "groq",
  nvidia: "nvidia",
  mistral: "mistral",
  cerebras: "cerebras",
  openrouter: "openrouter",
};

const listaAgentesEl = document.getElementById("listaAgentes");

/// 1.234 → "1,2 mil". Número cru de cinco dígitos num painel de 9px vira
/// borrão; o que importa aqui é a ordem de grandeza.
function curto(n) {
  // Sem a casa decimal quando ela é zero: "200 mil" se lê, "200,0 mil" trava.
  const enxuto = (x, sufixo) => (x % 1 === 0 ? String(x) : x.toFixed(1).replace(".", ",")) + sufixo;
  if (n >= 1_000_000) return enxuto(Math.round((n / 1_000_000) * 10) / 10, " mi");
  if (n >= 1000) return enxuto(Math.round((n / 1000) * 10) / 10, " mil");
  return String(Math.round(n));
}

/// O texto curto embaixo da barra. O "≈" segue a convenção do painel: número
/// que é conta nossa, não medida do provedor.
/// Como se diz a janela de um limite em português corrido.
const JANELA_TEXTO = { minuto: "no minuto", hora: "na hora", dia: "hoje" };
const janelaDeTexto = (b) => JANELA_TEXTO[b.janela] || "hoje";

/// A linha curta embaixo da barra: quanto RESTA, e de que janela.
///
/// Antes isto dizia "hoje" em tudo. Virou mentira quando a barra passou a
/// poder mostrar a janela do minuto — e as duas frases são conselhos opostos:
/// "487 tk restam no minuto" manda esperar sete segundos, "487 tk restam hoje"
/// manda parar de perguntar.
function resumoDaBarra(b) {
  const pct = Math.round((b.fracao || 0) * 100);
  const quando = janelaDeTexto(b);
  // Contagem de pedidos vai inteira: os tetos de pedidos por dia são pequenos
  // (50 a 14 mil), e "1,0 mil" é pior de ler que "1000" nessa escala.
  if (b.origem === "medido") {
    return b.unidade === "pedidos"
      ? `${b.restante} de ${b.teto} pedidos ${quando}`
      : `${curto(b.restante)} de ${curto(b.teto)} tk ${quando}`;
  }
  if (b.origem === "publicado") {
    return b.unidade === "pedidos"
      ? `${b.usado} de ${b.teto} pedidos ${quando}`
      : `≈ ${pct}% de ${curto(b.teto)} tk ${quando}`;
  }
  return `${pct}% do uso de hoje`;
}

/// O selo ao lado da barra: a porcentagem e a janela, como no medidor de
/// contexto do Claude Code. Era só title antes — e número que só aparece no
/// hover não serve para avisar ninguém.
function seloDaBarra(b) {
  const pct = Math.round((b.fracao || 0) * 100);
  if (b.origem === "relativo") return `${pct}% do dia`;
  return `${pct}% ${janelaDeTexto(b)}`;
}

/// A frase inteira, no title. Aqui cabe explicar de onde vem o número — e de
/// onde vem é o que separa saldo real de estimativa minha.
function legendaDaBarra(l) {
  const b = l.barra;
  if (b.origem === "medido") {
    return `${b.rotulo} — saldo que o ${l.provedor} informou nos cabeçalhos da última resposta.`;
  }
  if (b.origem === "publicado") {
    return `${b.rotulo} — teto publicado${b.fonte ? ` (${b.fonte})` : ""}. O ${l.provedor} não informa saldo, então a conta é minha.`;
  }
  return `${l.provedor}: sem saldo informado e sem teto publicado confiável. A barra mostra a fatia do consumo de hoje que passou por aqui, não quanto resta.`;
}

function mostrarAgentes(dados) {
  if (!listaAgentesEl || !dados) return;
  const linhas = dados.linhas || [];
  document.getElementById("agentesDia").textContent = dados.dia || "—";
  document.getElementById("agentesTotal").textContent =
    curto(linhas.reduce((n, l) => n + l.tokens, 0)) + " tk";

  if (!linhas.length) {
    listaAgentesEl.innerHTML = '<div class="semAgente">nenhum provedor configurado</div>';
    return;
  }

  listaAgentesEl.innerHTML = "";
  for (const l of linhas) {
    const bloco = document.createElement("div");
    bloco.className = "agente";

    const linha1 = document.createElement("div");
    linha1.className = "linha1";

    const nome = document.createElement("span");
    nome.className = "nome" + (l.configurado ? "" : " off");
    nome.textContent = NOMES_AGENTE[l.provedor] || l.provedor;
    linha1.appendChild(nome);

    // Uma etiqueta só, a mais importante: quem está respondendo agora, ou o
    // que deu errado. Três etiquetas numa linha de 10px não se leem.
    if (l.ativo) linha1.appendChild(etiqueta("ativo", "on"));
    else if (l.erros) linha1.appendChild(etiqueta(l.erros + " erro" + (l.erros > 1 ? "s" : ""), "erro"));
    else if (!l.configurado) linha1.appendChild(etiqueta("sem chave", ""));
    else if (l.pedidos) linha1.appendChild(etiqueta("reserva", ""));

    const num = document.createElement("span");
    num.className = "num";
    // O "≈" não é enfeite: diz que o provedor não informou o consumo e que
    // este número é conta nossa.
    num.textContent = l.pedidos
      ? `${l.pedidos}× · ${l.estimado ? "≈" : ""}${curto(l.tokens)} tk`
      : "—";
    linha1.appendChild(num);
    bloco.appendChild(linha1);

    // A barra, na melhor fonte que existir para aquele provedor — e o `origem`
    // dizendo qual é. Antes ela só aparecia com teto publicado, e o provedor
    // que mais trabalhava (sem teto publicado) era o único sem barra: o painel
    // parecia quebrado justamente onde mais importava.
    if (l.barra) {
      // Um trilho só, com a cor do NÍVEL. Cota usa a escala de perigo; a
      // fatia do dia (sem teto conhecido) fica numa cor neutra, porque ali
      // "cheio" não quer dizer "acabando".
      const faixa = faixaDe(l.barra.fracao || 0);
      const barra = criarBarra();
      encherBarra(barra, l.barra.fracao || 0, l.barra.origem === "relativo" ? "neutra" : faixa);
      barra.title = legendaDaBarra(l);
      // A barra e o selo na mesma linha: "████░░░░  94% no minuto".
      const faixaBarra = document.createElement("div");
      faixaBarra.className = "faixaBarra";
      faixaBarra.appendChild(barra);
      const selo = document.createElement("span");
      selo.className = "selo on-" + faixa;
      selo.textContent = seloDaBarra(l.barra);
      selo.title = legendaDaBarra(l);
      faixaBarra.appendChild(selo);
      bloco.appendChild(faixaBarra);
    }

    const det = document.createElement("div");
    det.className = "det";
    const partes = [];
    if (l.modelo) partes.push(l.modelo.split("/").pop());
    if (l.barra) partes.push(resumoDaBarra(l.barra));
    det.textContent = partes.join(" · ");
    if (det.textContent) {
      if (l.barra) det.title = legendaDaBarra(l);
      bloco.appendChild(det);
    }

    listaAgentesEl.appendChild(bloco);
  }
}

function etiqueta(texto, classe) {
  const el = document.createElement("span");
  el.className = "tag" + (classe ? " " + classe : "");
  el.textContent = texto;
  return el;
}

window.ev.on("agents", mostrarAgentes);

// --- a rede neural (rede.js): o que ela sente e a vontade de falar ---
const NOMES_REDE = {
  ALERTA: "alerta", FOCO: "foco", CUIDADO: "cuidado", CURIOSA: "curiosidade", SAUDOSA: "saudade",
  CALMA: "calma", RECEIO: "receio", RESPEITO: "respeito",
  PAUSA: "pausa", DORMIR: "dormir", SAUDAR: "cumprimentar", AVISAR: "avisar", PAPO: "papo",
};
const DECISOES_REDE = ["PAUSA", "DORMIR", "SAUDAR", "AVISAR", "PAPO"];
const MOTIVOS_REDE = {
  desligada: "mensagens desligadas", ocupada: "ela estava ocupada", chamada: "você estava numa chamada",
  longe: "você estava longe", conversando: "vocês tinham acabado de conversar", intervalo: "falou há pouco",
  "intervalo do tipo": "já tinha dito isso há pouco", "limite do dia": "limite do dia", fato: "o fato não se confirmou",
};

function linhasDaRede(el, itens) {
  if (!el) return;
  el.innerHTML = "";
  for (const { nome, hz } of itens) {
    const item = document.createElement("div");
    const linha = document.createElement("div");
    linha.className = "linha";
    const rot = document.createElement("span");
    rot.textContent = NOMES_REDE[nome] || nome.toLowerCase();
    const val = document.createElement("span");
    val.textContent = `${Math.round(hz)} Hz`;
    linha.append(rot, val);
    const barra = criarBarra();
    encherBarra(barra, Math.min(1, hz / 25), hz >= 10 ? "meio" : "neutra");
    item.append(linha, barra);
    el.appendChild(item);
  }
}

function mostrarRede(e) {
  if (!e) return;
  // A esfera desenha a rede de verdade: um ponto por neurônio, aceso pelos disparos.
  window.esfera?.rede?.(e);
  document.getElementById("redeHumor").textContent = e.humor;
  linhasDaRede(document.getElementById("redeInter"), e.inter.filter((p) => p.nome !== "INIB"));
  linhasDaRede(document.getElementById("redeDecisoes"), e.motores.filter((m) => DECISOES_REDE.includes(m.nome)));
  const partes = [e.descricao];
  if (e.ultimaDecisao) {
    const d = e.ultimaDecisao;
    const quando = new Date(d.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    partes.push(d.motivo
      ? `Às ${quando} quis ${NOMES_REDE[d.motor]}, mas segurou: ${MOTIVOS_REDE[d.motivo] || d.motivo}.`
      : `Às ${quando} decidiu ${NOMES_REDE[d.motor]}.`);
  }
  partes.push(`${e.hoje || 0} mensagem(ns) por conta própria hoje.`);
  if (e.assembleias?.length) partes.push(`${e.assembleias.length} grupo(s) de neurônios nasceram do que ela aprendeu.`);
  if (e.linguagem) {
    const l = e.linguagem;
    partes.push(`Pensou sozinha ${l.hoje.locais}× hoje; ${l.hoje.agentes}× chamou os agentes. Rede de linguagem: ${l.ocultos} neurônios, ${l.exemplos} exemplos, ${l.lembrancas || 0} respostas aprendidas com os agentes.`);
  }
  document.getElementById("redeDet").textContent = partes.join(" ");
}
window.ev.on("rede", mostrarRede);
window.ev.rede().then(mostrarRede).catch(() => {});

// --- chave da API ---
async function salvarChave(idCampo) {
  const el = document.getElementById(idCampo);
  const chave = el.value.trim();
  if (!chave) return;
  if (await window.ev.saveKey(chave)) {
    el.value = "";
    fecharConfig();
  }
}
document.getElementById("btnSetup").addEventListener("click", () => salvarChave("chaveSetup"));
document.getElementById("btnSalvarChave").addEventListener("click", () => salvarChave("cfgChave"));

// --- provedores de reserva ---
// Os campos ficam em branco mesmo quando há chave salva: chave não volta para a
// tela. O texto de ajuda é que diz quais estão ativas.
const ajudaReservasEl = document.getElementById("ajudaReservas");

// UMA tabela, e a tela sai dela. Provedor novo entra só aqui — antes entrava
// aqui, no HTML e no configPublica, e era esquecido em pelo menos um dos três.
const RESERVAS = [
  { id: "groq", vazio: "gsk_…", limite: "~200 mil tk/dia",
    ajuda: "O mais rápido que existe, mas são 8.000 tokens POR MINUTO: com 27 ferramentas cabem uns 2 pedidos nesse minuto.",
    url: "https://console.groq.com/keys", onde: "console.groq.com › Keys" },
  { id: "nvidia", vazio: "nvapi-…", limite: "sem teto publicado",
    ajuda: "Conta de desenvolvedor, sem cartão. Medido em 01/11: 303 ms até a primeira palavra, e chamou a ferramenta em 3 de 3.",
    url: "https://build.nvidia.com", onde: "build.nvidia.com" },
  { id: "mistral", vazio: "chave do Mistral", limite: "varia por conta",
    ajuda: 'O "Free mode" existe, mas alguns consoles pedem plano — confira em Limits.',
    url: "https://console.mistral.ai/api-keys", onde: "console.mistral.ai › API Keys" },
  { id: "cerebras", vazio: "chave do Cerebras", limite: "pede cartão",
    ajuda: "Em 01/11 passou a exigir método de pagamento para criar a chave. Fica na lista porque a corrente sabe usá-lo se um dia você tiver.",
    url: "https://cloud.cerebras.ai", onde: "cloud.cerebras.ai" },
  { id: "openrouter", vazio: "sk-or-…", limite: "50 pedidos/dia",
    ajuda: "Uma chave, 416 modelos, 14 deles gratuitos com ferramenta. Medido em 01/11: ~4,7 s até a primeira palavra, contra 0,3 s da NVIDIA direta — serve de reserva, não de principal.",
    url: "https://openrouter.ai/keys", onde: "openrouter.ai/keys" },
];

// Buscadores: mesma mecânica das reservas, com uma diferença — aqui a chave é
// testada com uma BUSCA de verdade. Chave errada aqui não dá erro nenhum: a
// corrente desce calada para a Wikipédia, e foi exatamente assim que um dia
// inteiro de perguntas atuais virou resposta de enciclopédia.
const BUSCADORES_UI = [
  { id: "tavilyKey", nome: "tavily", vazio: "tvly-…", limite: "1.000 buscas/mês",
    ajuda: "Feito para IA, grátis sem cartão.", url: "https://app.tavily.com", onde: "app.tavily.com" },
  { id: "serperKey", nome: "serper", vazio: "chave do Serper", limite: "2.500 grátis",
    ajuda: "Resultados do Google. O crédito vem ao criar a conta, sem cartão.",
    url: "https://serper.dev", onde: "serper.dev" },
  { id: "braveKey", nome: "brave search", vazio: "chave do Brave", limite: "pede cartão",
    ajuda: "US$ 5 de crédito por mês, cerca de 1.000 buscas.",
    url: "https://brave.com/search/api/", onde: "brave.com/search/api" },
  { id: "langsearchKey", nome: "langsearch", vazio: "chave do LangSearch", limite: "plano por tokens",
    ajuda: "", url: "https://langsearch.com", onde: "langsearch.com" },
  { id: "searxUrl", nome: "searxng próprio", vazio: "https://searx.minha-maquina",
    limite: "endereço, não chave", tipo: "text",
    ajuda: "As instâncias públicas bloqueiam robô; uma sua funciona e não custa chave." },
];

// Conexões (27/11/2026): serviços que ela LÊ, fora dos cérebros. Mesma
// mecânica dos buscadores: a chave é testada com um pedido de verdade.
const CONEXOES = [
  { id: "notionKey", nome: "notion", vazio: "ntn_… ou secret_…", limite: "só leitura",
    ajuda: "Crie uma integração interna e copie o \"Internal Integration Secret\". Depois, em cada página que ela pode ler: ··· → Conexões → a sua integração. Ela só enxerga o que você compartilhar.",
    url: "https://www.notion.so/profile/integrations", onde: "notion.so › Integrações" },
];

/// Monta uma lista de provedores fechada, com o campo escondido até o clique.
/// `temChave` recebe o id e diz se já existe chave guardada.
function montarListaProvedores(elId, itens, temChave) {
  const alvo = document.getElementById(elId);
  if (!alvo) return;
  alvo.innerHTML = "";

  for (const it of itens) {
    const tem = !!temChave(it.id);
    const linha = document.createElement("div");
    linha.className = "prov" + (tem ? " tem" : "");

    const cabeca = document.createElement("button");
    cabeca.type = "button";
    cabeca.className = "cabeca";
    cabeca.setAttribute("aria-expanded", "false");

    const ponto = document.createElement("span");
    ponto.className = "ponto";
    // O título do ponto é o que um leitor de tela anuncia, então ele diz a
    // situação por extenso em vez de depender da cor.
    ponto.title = tem ? "chave guardada" : "sem chave";
    cabeca.appendChild(ponto);

    const quem = document.createElement("span");
    quem.className = "quem";
    quem.textContent = it.nome || it.id;
    cabeca.appendChild(quem);

    const limite = document.createElement("span");
    limite.className = "limite";
    limite.textContent = tem ? "guardada · " + (it.limite || "") : it.limite || "sem chave";
    cabeca.appendChild(limite);

    const seta = document.createElement("span");
    seta.className = "seta";
    seta.textContent = "▸";
    cabeca.appendChild(seta);
    linha.appendChild(cabeca);

    const corpo = document.createElement("div");
    corpo.className = "corpo";

    const campo = document.createElement("input");
    campo.type = it.tipo || "password";
    campo.id = "cfg_" + it.id;
    campo.spellcheck = false;
    campo.placeholder = tem ? "já guardada — cole outra para trocar" : it.vazio || "";
    corpo.appendChild(campo);

    if (it.ajuda || it.url) {
      const ajuda = document.createElement("div");
      ajuda.className = "ajuda";
      if (it.ajuda) ajuda.appendChild(document.createTextNode(it.ajuda + " "));
      if (it.url) {
        const a = document.createElement("a");
        a.dataset.url = it.url;
        a.textContent = it.onde || it.url;
        ajuda.appendChild(a);
      }
      corpo.appendChild(ajuda);
    }
    linha.appendChild(corpo);

    cabeca.addEventListener("click", () => {
      const abrindo = !linha.classList.contains("aberto");
      linha.classList.toggle("aberto", abrindo);
      cabeca.setAttribute("aria-expanded", String(abrindo));
      if (abrindo) campo.focus();
    });

    alvo.appendChild(linha);
  }
}

/// O campo de um item da lista. Devolve "" quando a linha nunca foi aberta —
/// e "" significa "não mexi", que é a convenção dos dois handlers de salvar.
function valorDoCampo(id) {
  return document.getElementById("cfg_" + id)?.value.trim() || "";
}

function limparCampos(itens) {
  for (const it of itens) {
    const el = document.getElementById("cfg_" + it.id);
    if (el) el.value = "";
  }
}

function pintarProvedores() {
  const tem = configAtual?.temChaves || {};
  montarListaProvedores("listaProvedores", RESERVAS, (id) => tem[id]);
  const conexoes = configAtual?.conexoes || {};
  montarListaProvedores("listaConexoes", CONEXOES, (id) => conexoes[id.replace(/Key$/, "")]);
  const busca = configAtual?.buscadores || [];
  montarListaProvedores("listaBuscadores", BUSCADORES_UI, (id) =>
    busca.includes(id.replace(/Key$|Url$/, ""))
  );
}

const ajudaBuscaEl = document.getElementById("ajudaBusca");
const buscadoresAtivosEl = document.getElementById("buscadoresAtivos");

function mostrarBuscadores() {
  pintarProvedores(); // a bolinha de cada buscador vem de configAtual.buscadores
  if (!buscadoresAtivosEl) return;
  const ativos = configAtual?.buscadores || [];
  const comChave = ativos.filter((b) => b !== "duckduckgo" && b !== "wikipedia");
  buscadoresAtivosEl.textContent = comChave.length
    ? `em uso, nesta ordem: ${ativos.join(" → ")}`
    : "só as reservas sem chave (duckduckgo, wikipédia) — elas não sabem preço nem notícia";
}

document.getElementById("btnSalvarBusca")?.addEventListener("click", async () => {
  const chaves = {};
  for (const b of BUSCADORES_UI) chaves[b.id] = valorDoCampo(b.id);
  ajudaBuscaEl.textContent = "testando com uma busca de verdade…";

  const r = await window.ev.saveSearch(chaves);
  if (r?.ok) {
    limparCampos(BUSCADORES_UI);
    ajudaBuscaEl.textContent = r.relato?.length ? r.relato.join(" · ") : "nada mudou.";
    configAtual = { ...configAtual, ...(await window.ev.getConfig()) };
    mostrarBuscadores();
  mostrarVelocidade();
  } else {
    ajudaBuscaEl.textContent = r?.erro || "não consegui salvar.";
  }
});

const ajudaConexoesEl = document.getElementById("ajudaConexoes");
document.getElementById("btnSalvarConexoes")?.addEventListener("click", async () => {
  const chaves = {};
  for (const c of CONEXOES) chaves[c.id] = valorDoCampo(c.id);
  ajudaConexoesEl.textContent = "testando…";
  const r = await window.ev.saveConnections(chaves);
  if (r?.ok) {
    limparCampos(CONEXOES);
    ajudaConexoesEl.textContent = r.relato?.length ? r.relato.join(" · ") : "nada mudou.";
    configAtual = { ...configAtual, ...(await window.ev.getConfig()) };
    pintarProvedores();
  } else {
    ajudaConexoesEl.textContent = r?.erro || "não consegui salvar.";
  }
});

document.getElementById("btnSalvarReservas").addEventListener("click", async () => {
  const chaves = {};
  for (const r of RESERVAS) chaves[r.id] = valorDoCampo(r.id);
  ajudaReservasEl.textContent = "verificando…";

  const r = await window.ev.saveReserves(chaves);
  if (r?.ok) {
    limparCampos(RESERVAS);
    ajudaReservasEl.textContent = r.relato?.length ? r.relato.join(" · ") : "nada mudou.";
    configAtual = { ...configAtual, ...(await window.ev.getConfig()) };
    mostrarReservas();
    mostrarPrincipal();
  } else {
    ajudaReservasEl.textContent = `a chave do ${r?.provedor || "provedor"} não foi aceita.`;
  }
});

const NOMES_PROVEDOR = {
  gemini: "Gemini (Google)",
  anthropic: "Claude (Anthropic)",
  groq: "Groq — o mais rápido",
  nvidia: "NVIDIA NIM",
  mistral: "Mistral",
};

const principalEl = document.getElementById("cfgPrincipal");

principalEl.addEventListener("change", async () => {
  await salvar({ provider: principalEl.value });
  ajudaReservasEl.textContent = `agora quem pensa primeiro é ${principalEl.value}.`;
});

/// Só lista provedores que têm chave: oferecer um sem chave deixaria ela sem
/// cérebro, e o erro só apareceria na pergunta seguinte.
function mostrarPrincipal() {
  const disponiveis = configAtual.disponiveis || [];
  principalEl.innerHTML = "";
  for (const id of disponiveis) {
    const op = document.createElement("option");
    op.value = id;
    op.textContent = NOMES_PROVEDOR[id] || id;
    if (id === configAtual.provider) op.selected = true;
    principalEl.appendChild(op);
  }
  principalEl.disabled = disponiveis.length < 2;
}

/// A chave nunca volta para a tela. A lista mostra a situação de cada
/// provedor; aqui fica só a frase de resumo embaixo do botão.
function mostrarReservas() {
  pintarProvedores();
  const tem = configAtual?.temChaves || {};
  const ativas = RESERVAS.filter((d) => tem[d.id]).map((d) => d.id);
  if (ativas.length && ajudaReservasEl && !ajudaReservasEl.textContent) {
    ajudaReservasEl.textContent = `reservas com chave: ${ativas.join(", ")}.`;
  }
}

// ===========================================================================
// Partida
// ===========================================================================
(async function inicio() {
  configAtual = { ...configAtual, ...(await window.ev.getConfig()) };
  mostrarNomes();
  aplicarVisual(configAtual);
  mostrarChats(await window.ev.chats());
  preencherConfig();
  mostrarReservas();
  mostrarPrincipal();
  mostrarBuscadores();
  mostrarVelocidade();
  mostrarMudo();
  setEstado("idle");
  atualizarLembretes();
})();

// ===========================================================================
// Conversas da barra lateral, nomes e contexto
// ===========================================================================
const listaChatsEl = document.getElementById("listaChats");
const tituloConversaEl = document.getElementById("tituloConversa");
let chatAtual = null;
let itensNaConversa = 0;

function quandoFoi(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (d.toDateString() === hoje.toDateString()) return "hoje, " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === ontem.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function mostrarChats(lista) {
  if (!Array.isArray(lista)) return;
  listaChatsEl.textContent = "";
  for (const c of lista) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chat" + (c.atual ? " atual" : "");
    b.title = c.ocupada ? `${c.titulo} — ela ainda está trabalhando nesta conversa` : c.titulo;
    b.textContent = c.titulo;
    // Ela continua trabalhando numa conversa que ele deixou: um ponto pulsa.
    if (c.ocupada) {
      const ponto = document.createElement("span");
      ponto.className = "trabalhando";
      ponto.setAttribute("aria-label", "trabalhando");
      b.prepend(ponto);
    }
    const q = document.createElement("span");
    q.className = "quando";
    q.textContent = quandoFoi(c.atualizada);
    b.appendChild(q);
    if (!c.atual) b.addEventListener("click", () => window.ev.openChat(c.id));
    listaChatsEl.appendChild(b);
    if (c.atual) {
      chatAtual = c;
      if (document.activeElement !== tituloConversaEl) tituloConversaEl.textContent = c.titulo;
    }
  }
}
window.ev.on("chats", mostrarChats);

// Duplo clique no título da conversa: renomear. Enter grava, Esc desiste.
tituloConversaEl.addEventListener("dblclick", () => {
  tituloConversaEl.contentEditable = "true";
  tituloConversaEl.focus();
  document.getSelection()?.selectAllChildren(tituloConversaEl);
});
tituloConversaEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    tituloConversaEl.blur();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    tituloConversaEl.textContent = chatAtual?.titulo || "";
    tituloConversaEl.blur();
  }
});
tituloConversaEl.addEventListener("blur", () => {
  if (tituloConversaEl.contentEditable !== "true") return;
  tituloConversaEl.contentEditable = "false";
  const novo = tituloConversaEl.textContent.trim();
  if (chatAtual && novo && novo !== chatAtual.titulo) window.ev.renameChat(chatAtual.id, novo);
  else tituloConversaEl.textContent = chatAtual?.titulo || "";
  document.body.focus();
});

function mostrarNomes() {
  const nome = configAtual.nome || "Sexta-Feira";
  document.getElementById("tituloNome").textContent = nome;
  document.getElementById("marcaModelo").textContent = nome;
  document.title = nome;
  const dono = (configAtual.dono || "").trim();
  document.getElementById("nomeDono").textContent = dono || "você";
  document.getElementById("avatarDono").textContent = (dono || "?")[0].toUpperCase();
  atualizarVazio();
}

/// O histórico guarda até 300 itens por conversa (TETO_ITENS em chats.js; eram
/// 120 até 26/11/2026, e uma tarde de conversa já marcava "120 de 120"). A
/// barra mostra quanto da conversa já existe. O que o agente lembra é outro
/// corte, por tamanho: ~15 mil tokens do fim da conversa (brains.js).
const TETO_CONVERSA = 300;
function mostrarContexto() {
  const n = Math.min(itensNaConversa, TETO_CONVERSA);
  const f = n / TETO_CONVERSA;
  document.getElementById("contextoMsgs").textContent = `${n} de ${TETO_CONVERSA}`;
  document.getElementById("contextoPct").textContent = Math.round(f * 100) + "%";
  encherBarra(document.getElementById("contextoBarra"), f);
  document.getElementById("contextoDet").textContent =
    f >= 0.8
      ? "A conversa está longa: as mensagens mais antigas começam a sair. Para um assunto novo, comece outra conversa (⌘N)."
      : "Se o agente trocar ou você voltar a esta conversa, o que foi dito aqui vai junto para ele não se perder.";
}
