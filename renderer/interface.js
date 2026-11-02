// interface.js — a HUD da E.V.E.
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
const TEMAS = {
  holografico: {
    nome: "holográfico", desc: "ciano sobre quase preto",
    vars: {
      "--fundo": "#0b141e", "--painel": "#152231", "--borda": "#2e4a63",
      "--texto": "#eaf5ff", "--fraco": "#9bbbd4", "--ac": "#6fd8ff", "--ac2": "#b3a6ff",
      "--ok": "#5ee88f", "--meio": "#ffc940", "--alto": "#ff8585",
    },
    esfera: { idle: [95, 208, 255], listening: [110, 240, 180], thinking: [155, 140, 255], speaking: [251, 191, 36] },
  },
  ambar: {
    nome: "âmbar", desc: "terminal antigo",
    vars: {
      "--fundo": "#16110a", "--painel": "#241a0f", "--borda": "#4b3822",
      "--texto": "#fcf0dc", "--fraco": "#c3a177", "--ac": "#ffc96e", "--ac2": "#ff9a5e",
      "--ok": "#b6ef4a", "--meio": "#ffc940", "--alto": "#ff8585",
    },
    esfera: { idle: [255, 190, 92], listening: [163, 230, 53], thinking: [255, 138, 76], speaking: [255, 214, 120] },
  },
  esmeralda: {
    nome: "esmeralda", desc: "osciloscópio",
    vars: {
      "--fundo": "#091712", "--painel": "#10241c", "--borda": "#224a38",
      "--texto": "#dffbea", "--fraco": "#7cb89c", "--ac": "#5ff7b4", "--ac2": "#63d8ff",
      "--ok": "#5ee88f", "--meio": "#ffc940", "--alto": "#ff8585",
    },
    esfera: { idle: [91, 240, 174], listening: [170, 255, 210], thinking: [79, 208, 255], speaking: [251, 191, 36] },
  },
  violeta: {
    nome: "violeta", desc: "roxo profundo",
    vars: {
      "--fundo": "#120c1e", "--painel": "#1c152d", "--borda": "#3b2d59",
      "--texto": "#efe7ff", "--fraco": "#a89ccb", "--ac": "#c4a3ff", "--ac2": "#ff9bd8",
      "--ok": "#5ee88f", "--meio": "#ffc940", "--alto": "#ff8585",
    },
    esfera: { idle: [179, 136, 255], listening: [120, 245, 190], thinking: [255, 135, 207], speaking: [251, 191, 36] },
  },
  mono: {
    nome: "monocromático", desc: "branco e cinza",
    vars: {
      "--fundo": "#101114", "--painel": "#1a1c20", "--borda": "#3b3e46",
      "--texto": "#f4f5f7", "--fraco": "#a7abb4", "--ac": "#eceef2", "--ac2": "#bfc4cd",
      "--ok": "#c9d0d8", "--meio": "#e8ebef", "--alto": "#ff8585",
    },
    esfera: { idle: [223, 226, 230], listening: [255, 255, 255], thinking: [158, 163, 171], speaking: [200, 205, 212] },
  },
};

// Versão clara de cada tema. É um EIXO à parte, não um sexto tema: o tema
// escolhe a cor de destaque, o claro/escuro escolhe o fundo. Assim quem gosta
// do âmbar continua no âmbar nos dois modos.
//
// Não dá para inverter as cores do escuro por fórmula. Num fundo quase preto
// um ciano pastel brilha; no branco ele some. Então cada tema tem a sua paleta
// clara escrita à mão, com os destaques escurecidos até terem contraste de
// verdade sobre o branco.
const CLAROS = {
  holografico: {
    vars: {
      "--fundo": "#e8f0f7", "--painel": "#ffffff", "--borda": "#a7c2d7",
      "--texto": "#06161f", "--fraco": "#3c5e78", "--ac": "#00618a", "--ac2": "#4433c4",
      "--ok": "#0f6b33", "--meio": "#8f4000", "--alto": "#a3121a",
    },
    esfera: { idle: [0, 97, 138], listening: [15, 107, 51], thinking: [68, 51, 196], speaking: [143, 64, 0] },
  },
  ambar: {
    vars: {
      "--fundo": "#f5efe3", "--painel": "#fffdf7", "--borda": "#cdb894",
      "--texto": "#2a1c07", "--fraco": "#6d5331", "--ac": "#7d4502", "--ac2": "#a8330a",
      "--ok": "#3d6509", "--meio": "#8f4000", "--alto": "#a3121a",
    },
    esfera: { idle: [125, 69, 2], listening: [61, 101, 9], thinking: [168, 51, 10], speaking: [143, 64, 0] },
  },
  esmeralda: {
    vars: {
      "--fundo": "#e7f5ee", "--painel": "#ffffff", "--borda": "#a2cbb6",
      "--texto": "#062018", "--fraco": "#336450", "--ac": "#00634a", "--ac2": "#025682",
      "--ok": "#0f6b33", "--meio": "#8f4000", "--alto": "#a3121a",
    },
    esfera: { idle: [0, 99, 74], listening: [15, 107, 51], thinking: [2, 86, 130], speaking: [143, 64, 0] },
  },
  violeta: {
    vars: {
      "--fundo": "#f1eafc", "--painel": "#ffffff", "--borda": "#c3b2e3",
      "--texto": "#1c1233", "--fraco": "#55457c", "--ac": "#5a17c4", "--ac2": "#a30d5d",
      "--ok": "#0f6b33", "--meio": "#8f4000", "--alto": "#a3121a",
    },
    esfera: { idle: [90, 23, 196], listening: [15, 107, 51], thinking: [163, 13, 93], speaking: [143, 64, 0] },
  },
  mono: {
    vars: {
      "--fundo": "#eeeef0", "--painel": "#ffffff", "--borda": "#c2c4ca",
      "--texto": "#0e0f12", "--fraco": "#55585f", "--ac": "#1c1e22", "--ac2": "#4f535b",
      "--ok": "#3a4049", "--meio": "#5c544c", "--alto": "#a3121a",
    },
    esfera: { idle: [28, 30, 34], listening: [14, 15, 18], thinking: [79, 83, 91], speaking: [92, 84, 76] },
  },
};

const LADOS_ESFERA = { pequena: "340px", media: "460px", grande: "580px" };

function aplicarVisual(cfg) {
  const nomeTema = TEMAS[cfg.tema] ? cfg.tema : "holografico";
  const tema = TEMAS[nomeTema];
  const claro = !!cfg.claro;
  const paleta = claro ? CLAROS[nomeTema] || CLAROS.holografico : tema;

  for (const [chave, valor] of Object.entries(paleta.vars)) {
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
  requestAnimationFrame(() => window.esfera?.redimensionar());
}

// ===========================================================================
// 2. Monitor do sistema — barras no estilo btop
// ===========================================================================
// Cada barra é uma fileira de blocos. O bloco tem a cor da FAIXA em que ele
// está, não a cor do valor: os primeiros são verdes, os do meio amarelos, os
// últimos vermelhos. Acendem da esquerda para a direita conforme o uso sobe —
// é o que faz 80% parecer diferente de 20% antes mesmo de ler o número.
const BLOCOS = 16;

const MEDIDAS = [
  { id: "cpu", rot: "cpu" },
  { id: "mem", rot: "mem" },
  { id: "gpu", rot: "gpu" },
  { id: "disco", rot: "disco" },
  { id: "rede", rot: "rede" },
  { id: "bat", rot: "bateria" },
  { id: "temp", rot: "temp" },
];

const elMedida = {};

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

    const barra = document.createElement("div");
    barra.className = "barra";
    const blocos = [];
    for (let i = 0; i < BLOCOS; i++) {
      const b = document.createElement("i");
      barra.appendChild(b);
      blocos.push(b);
    }

    const det = document.createElement("div");
    det.className = "det";

    caixa.append(linha, barra, det);
    alvo.appendChild(caixa);
    elMedida[m.id] = { val, barra, blocos, det };
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

  if (porcento == null) {
    m.val.className = "val valorCor";
    for (const b of m.blocos) b.className = "";
    m.barra.style.opacity = ".35";
    return;
  }

  m.barra.style.opacity = "1";
  const acesos = Math.round((Math.max(0, Math.min(100, porcento)) / 100) * BLOCOS);
  for (let i = 0; i < BLOCOS; i++) {
    m.blocos[i].className = i < acesos ? "on-" + faixaDe((i + 1) / BLOCOS) : "";
  }
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
    const acesos = Math.round((m.bateria.porcento / 100) * BLOCOS);
    const faixa = faixaDe(1 - m.bateria.porcento / 100);
    for (let i = 0; i < BLOCOS; i++) {
      b.blocos[i].className = i < acesos ? "on-" + faixa : "";
    }
    b.barra.style.opacity = "1";
    b.val.textContent = m.bateria.porcento + "%";
    b.val.className = "val valorCor " + faixaDe(1 - m.bateria.porcento / 100);
    b.det.textContent = m.bateria.estado + (m.bateria.restante ? ` · ${m.bateria.restante}` : "");
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
  document.getElementById("relogioHora").textContent = agora.toLocaleTimeString("pt-BR");
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

function perto() {
  return roloEl.scrollHeight - roloEl.scrollTop - roloEl.clientHeight < 140;
}
function rolar(forcar) {
  if (forcar || perto()) roloEl.scrollTop = roloEl.scrollHeight;
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
/// O separador de falas devolve a quebra de parágrafo no fim do fragmento
/// quando ela escreveu uma; quando o corte foi só fim de frase, não devolve
/// nada. Então quebra existente manda, e na falta dela entra um espaço — é
/// isso que diferencia "dois parágrafos" de "duas frases do mesmo parágrafo".
function juntarFragmentos(antes, novo) {
  if (!antes) return novo;
  if (/\n$/.test(antes)) return antes + novo;
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
    classe === "erro" ? "ERRO: " : quem === "eve" ? (configAtual.nome || "E.V.E") + ": " : "VOCÊ: ";
  linha.appendChild(rotulo);

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
  linha.textContent = "SIS: " + texto;
  roloEl.appendChild(linha);
  rolar();
}

function mostrarFerramenta(nome) {
  const alvo = ultimaLinhaEve || registrar({ quem: "eve", texto: "" });
  const f = document.createElement("span");
  f.className = "ferr";
  f.textContent = "⎿ " + nome;
  alvo.appendChild(f);
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
  btnMicEl.textContent = micAberto ? "microfone aberto" : s === "listening" ? "ouvindo…" : "microfone";

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
  const nome = cfg.nome || "E.V.E";
  document.getElementById("tituloNome").textContent = nome;
  document.getElementById("marcaModelo").textContent = nome;
  document.getElementById("rodapeFim").textContent = nome.toLowerCase();
  aplicarVisual(configAtual);
  preencherConfig();
  setEstado(estado);
});

window.ev.on("history", (itens) => {
  roloEl.textContent = "";
  ultimaLinhaEve = null;
  for (const i of itens) {
    registrar({
      quem: i.quem === "voce" ? "voce" : "eve",
      texto: i.texto,
      classe: i.lembrete ? "lembrete" : "",
    });
  }
  registrarSistema(itens.length ? "conversa recuperada." : "pronta. aperte espaço e fale.");
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

window.ev.on("message", ({ quem, texto, lembrete, anexo }) => {
  parcialEl.textContent = "";
  registrar({ quem, texto: anexo ? `[${anexo}] ${texto}` : texto, classe: lembrete ? "lembrete" : "" });
  atualizarLembretes();
});

window.ev.on("tool", ({ name }) => mostrarFerramenta(name));
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
document.getElementById("btnLimpar").addEventListener("click", () => window.ev.reset());
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
    if (e.metaKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      window.ev.reset();
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
      lembretes: "folhaLembretes", chave: "folhaChave",
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
      JSON.stringify({ esferaTamanho: configAtual.esferaTamanho, desempenho: configAtual.desempenho })
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
    for (const cor of [t.vars["--ac"], t.vars["--ok"], t.vars["--meio"], t.vars["--alto"]]) {
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

for (const [id, campo] of Object.entries({ cfgProativa: "proativa", cfgNotificacoes: "notificacoes" })) {
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
  pausaEl.value = c.pausaFala ?? 2.5;
  document.getElementById("vPausa").textContent = (c.pausaFala ?? 2.5) + "s";

  marcar("cfgEstilo", c.estilo || "doce");
  marcar("cfgModoMic", c.modoMic || "toque");
  marcar("cfgTema", c.tema || "holografico");
  marcar("cfgEsfera", c.esferaTamanho || "media");
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
  btnMudoEl.textContent = mudo ? "voz off" : "voz on";
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
const BLOCOS_AGENTE = 12;

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
      const barra = document.createElement("div");
      // Cota usa a escala de perigo; fatia do dia, cor neutra (ver o CSS).
      barra.className = "barra" + (l.barra.origem === "relativo" ? " relativa" : "");
      barra.title = legendaDaBarra(l);
      // A parte acesa toda na cor do NÍVEL, não um degradê por posição. Pela
      // posição, 10% de uso acendia um bloco verde e 100% acendia a barra
      // inteira em arco-íris — a cor deixava de significar "quanto".
      const faixa = faixaDe(l.barra.fracao || 0);
      const acesos = Math.round((l.barra.fracao || 0) * BLOCOS_AGENTE);
      for (let i = 0; i < BLOCOS_AGENTE; i++) {
        const b = document.createElement("i");
        if (i < acesos) b.className = "aceso on-" + faixa;
        barra.appendChild(b);
      }
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
  const nome = configAtual.nome || "E.V.E";
  document.getElementById("tituloNome").textContent = nome;
  document.getElementById("marcaModelo").textContent = nome;
  aplicarVisual(configAtual);
  preencherConfig();
  mostrarReservas();
  mostrarPrincipal();
  mostrarBuscadores();
  mostrarVelocidade();
  mostrarMudo();
  setEstado("idle");
  atualizarLembretes();
})();
