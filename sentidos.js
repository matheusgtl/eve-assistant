// sentidos.js — o Mac e o seu ritmo, como intensidades de 0 a 1 para a rede.
//
// Como no Pestinha (sense/senses.py), ela SÓ OLHA: o nome do app da frente,
// há quanto tempo o teclado e o mouse estão parados, a bateria e a hora.
// Nunca lê o conteúdo de janela, tela ou teclas. Nenhuma dessas leituras pede
// permissão do macOS: `lsappinfo` e `powerMonitor.getSystemIdleTime()` são
// livres, e a bateria vem do `pmset` (sistema.js).
//
// A parte que decide o que cada leitura SIGNIFICA é pura (`Sentidos.ler`),
// com o relógio injetado — é o que test/mente.test.js exercita.

"use strict";

const { execFile } = require("node:child_process");

// Nomes como o macOS mostra (LSDisplayName), em minúsculo.
const APPS = {
  TRABALHO: [
    "code", "visual studio code", "cursor", "windsurf", "zed", "xcode", "terminal", "iterm2", "iterm", "warp",
    "ghostty", "claude", "codex", "android studio", "intellij idea", "pycharm", "webstorm", "sublime text",
    "nova", "figma", "sketch", "blender", "photoshop", "adobe photoshop", "illustrator", "adobe illustrator",
    "final cut pro", "adobe premiere pro", "davinci resolve", "logic pro", "pages", "numbers", "keynote",
    "microsoft word", "microsoft excel", "microsoft powerpoint", "notion", "obsidian", "bambu studio",
    "orcaslicer", "prusaslicer", "affinity designer", "affinity photo", "tableplus", "postman", "docker desktop",
  ],
  LAZER: [
    "spotify", "music", "música", "tv", "steam", "iina", "vlc", "netflix", "prime video", "crunchyroll",
    "minecraft", "roblox", "league of legends", "epic games launcher", "battle.net", "geforce now", "podcasts",
  ],
  SOCIAL: [
    "whatsapp", "discord", "messages", "mensagens", "telegram", "slack", "instagram", "signal", "mail",
  ],
  WEB: [
    "safari", "google chrome", "chrome", "arc", "firefox", "brave browser", "microsoft edge", "opera", "orion",
    "vivaldi", "zen browser", "dia",
  ],
};
// Numa chamada ela não interrompe de jeito nenhum (trava em iniciativa.js).
const CHAMADAS = ["zoom.us", "facetime", "microsoft teams", "webex", "google meet", "around"];
const ELA = ["sexta-feira", "e.v.e", "electron"];

const limitar = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const MIN = 60_000;

function categoria(app) {
  const nome = String(app || "").trim().toLowerCase();
  if (!nome) return null;
  if (ELA.includes(nome)) return "ELA";
  if (CHAMADAS.includes(nome)) return "CHAMADA";
  for (const [cat, lista] of Object.entries(APPS)) if (lista.includes(nome)) return cat;
  return null;
}

const diaDe = (t) => {
  const d = new Date(t);
  // O dia vira às 5h: quem usa até as 2h ainda está "no mesmo dia".
  d.setHours(d.getHours() - 5);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/// Hora da noite como intensidade: 23h começa, 1h–4h é cheio, 5h some.
function madrugada(t) {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 23) return 0.4 + (h - 23) * 0.3;
  if (h < 1) return 0.7 + h * 0.3;
  if (h < 5) return 1;
  if (h < 6) return 0.5 * (6 - h);
  return 0;
}

class Sentidos {
  constructor(salvo = {}) {
    this.appAtual = null;
    this.trocas = []; // instantes de troca de app (últimos 2 min)
    this.inicioSessao = null; // uso contínuo (pausa de 5 min zera)
    this.longeDesde = null;
    this.volta = null; // {em, intensidade, longeS}
    this.manha = null; // {em}
    this.pulsos = {}; // AGRADECE / DISPENSA: {canal: {em, duracaoMs}}
    this.ultimoDia = typeof salvo.ultimoDia === "string" ? salvo.ultimoDia : null;
    this.ultimaConversa = Number.isFinite(salvo.ultimaConversa) ? salvo.ultimaConversa : null;
    this.fatos = {};
  }

  salvar() {
    return { ultimoDia: this.ultimoDia, ultimaConversa: this.ultimaConversa };
  }

  /// Você falou com ela (voz ou texto).
  conversou(agora = Date.now()) {
    this.ultimaConversa = agora;
  }

  /// AGRADECE ou DISPENSA por um tempo (vem da resposta a uma iniciativa).
  pulsar(canal, agora = Date.now(), duracaoMs = 2 * MIN) {
    this.pulsos[canal] = { em: agora, duracaoMs };
  }

  /// leitura: {idleS, app, bateria: {porcento, estado} | null}
  ler({ idleS = 0, app = null, bateria = null } = {}, agora = Date.now()) {
    if (this.ultimaConversa === null) this.ultimaConversa = agora; // primeira vez: sem "saudade" inventada
    const ativo = idleS < 60;
    const cat = categoria(app);

    // trocas de app
    if (app && app !== this.appAtual) {
      if (this.appAtual !== null) this.trocas.push(agora);
      this.appAtual = app;
    }
    this.trocas = this.trocas.filter((t) => agora - t < 2 * MIN);

    // sessão contínua: 5 min parado é uma pausa de verdade
    if (idleS >= 300) this.inicioSessao = null;
    else if (ativo && this.inicioSessao === null) this.inicioSessao = agora - idleS * 1000;
    const sessaoMin = this.inicioSessao === null ? 0 : (agora - this.inicioSessao) / MIN;

    // longe e de volta
    if (idleS >= 20 * 60 && this.longeDesde === null) this.longeDesde = agora - idleS * 1000;
    if (idleS < 10 && this.longeDesde !== null) {
      const longeS = (agora - this.longeDesde) / 1000;
      this.volta = { em: agora, intensidade: limitar(0.4 + longeS / 7200, 0.4, 1), longeS };
      this.longeDesde = null;
    }
    // primeiro uso do dia
    const hoje = diaDe(agora);
    if (ativo && this.ultimoDia !== hoje) {
      if (this.ultimoDia !== null) this.manha = { em: agora };
      this.ultimoDia = hoje;
    }

    const pulso = (p, duracaoMs) => (p && agora - p.em < duracaoMs ? 1 - (agora - p.em) / duracaoMs : 0);
    const semConversaH = (agora - this.ultimaConversa) / 3_600_000;
    const conversaMin = (agora - this.ultimaConversa) / MIN;
    const pct = bateria && Number.isFinite(bateria.porcento) ? bateria.porcento : null;
    const naBateria = !!bateria && bateria.estado === "bateria";

    const canais = {
      TRABALHO: ativo && cat === "TRABALHO" ? 1 : 0,
      LAZER: ativo && cat === "LAZER" ? 1 : 0,
      SOCIAL: ativo && cat === "SOCIAL" ? 1 : 0,
      WEB: ativo && cat === "WEB" ? 1 : 0,
      ATIVIDADE: idleS < 10 ? 1 : idleS < 60 ? 0.5 : 0,
      AUSENCIA: idleS >= 300 ? limitar(0.5 + (idleS - 300) / 600) : idleS >= 120 ? 0.3 : 0,
      VOLTA: this.volta ? pulso(this.volta, 90_000) * this.volta.intensidade : 0,
      TROCAS: limitar((this.trocas.length - 4) / 8),
      MADRUGADA: madrugada(agora),
      MANHA: pulso(this.manha, 2 * MIN),
      BATERIA: naBateria && pct !== null && pct <= 25 ? limitar((25 - pct) / 15) : 0,
      CONVERSA: conversaMin < 3 ? 1 : conversaMin < 10 ? 0.4 : 0,
      AGRADECE: pulso(this.pulsos.AGRADECE, this.pulsos.AGRADECE?.duracaoMs || 0),
      DISPENSA: pulso(this.pulsos.DISPENSA, this.pulsos.DISPENSA?.duracaoMs || 0),
      CANSACO: limitar((sessaoMin - 75) / 60), // ~2h de uso contínuo já pesa
      SAUDADE: limitar((semConversaH - 24) / 24),
    };

    // Os FATOS por trás dos canais: as frases de iniciativa.js usam estes
    // números, nunca a rede — ela não diz "duas horas" se foram cinquenta minutos.
    this.fatos = {
      agora, idleS, app, categoria: cat, sessaoMin, semConversaH,
      bateria: pct, naBateria,
      voltou: canais.VOLTA > 0 ? this.volta : null,
      primeiroDoDia: canais.MANHA > 0,
    };
    return canais;
  }
}

// ---------------------------------------------------------------- leitura do Mac
function executar(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000 }, (err, out) => resolve(err ? "" : String(out)));
  });
}

/// Nome do app da frente pelo `lsappinfo` (sem permissão de Acessibilidade).
async function appDaFrente() {
  const asn = (await executar("/usr/bin/lsappinfo", ["front"])).trim();
  if (!asn) return null;
  const info = await executar("/usr/bin/lsappinfo", ["info", "-only", "name", asn]);
  const m = info.match(/"(?:LSDisplayName|name)"="([^"]*)"/);
  return m ? m[1] : null;
}

module.exports = { Sentidos, categoria, madrugada, diaDe, appDaFrente, APPS, CHAMADAS };
