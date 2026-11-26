// registro.js — o formato do eve.log. Sem Electron, para dar para testar.
//
// Em 25/11, ao ler o log para achar o que melhorar, não deu para separar uma
// conversa da outra: a linha tinha hora sem data (um mês de log com "[20:45]"
// repetido), o que ele DIGITAVA não aparecia (só o que falava), e ferramenta
// aparecia só quando era chamada — nunca se deu certo nem quanto demorou.
// Agora: data em toda linha, cada pergunta abre e fecha um bloco numerado, e
// cada ferramenta tem o resultado e o tempo.

const fs = require("node:fs");

const dois = (n) => String(n).padStart(2, "0");

/** 2026-11-25 20:45:43 — hora local, ordenável e legível. */
function carimbo(d = new Date()) {
  return (
    `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ` +
    `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`
  );
}

const linha = (partes, d = new Date()) => `[${carimbo(d)}] ${partes.join(" ")}`;

/// O log cresce para sempre. Passou do teto, o atual vira eve.log.1 (o
/// anterior a ele sai) e começa um novo: sempre há o último pedaço inteiro.
function rotacionar(caminho, teto = 2 * 1024 * 1024) {
  try {
    if (fs.statSync(caminho).size < teto) return false;
    fs.renameSync(caminho, caminho + ".1");
    return true;
  } catch {
    return false; // ainda não existe, ou sem permissão: segue escrevendo
  }
}

const segundos = (ms) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const curto = (t, max) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

/** O que a ferramenta devolveu, numa linha: deu certo, pediu o sim ou falhou (e por quê). */
function resultadoDeFerramenta(resultado) {
  let r = resultado;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return { ok: true, texto: "ok" };
    }
  }
  if (r?.needs_confirmation) return { ok: true, texto: "pediu o sim" };
  if (r?.error || r?.erro) return { ok: false, texto: "erro: " + curto(r.error || r.erro, 140) };
  return { ok: true, texto: "ok" };
}

/// Uma pergunta, do começo ao fim. Abre com o que ele disse ou escreveu e
/// fecha com quanto levou, quanto levou até a primeira palavra (é isso que ele
/// sente como "demora"), quantas ferramentas e quantas falharam.
class Turno {
  constructor(numero, texto, canal, agora = Date.now) {
    this.numero = numero;
    this.agora = agora;
    this.inicio = agora();
    this.primeiraFala = null;
    this.ferramentas = 0;
    this.falhas = 0;
    this.caracteres = 0;
    this.abertura = `── #${numero} ${canal === "voz" ? "falou" : "escreveu"}: ${JSON.stringify(curto(texto, 300))}`;
  }

  falou(texto) {
    if (this.primeiraFala == null) this.primeiraFala = this.agora() - this.inicio;
    this.caracteres += String(texto ?? "").length;
  }

  ferramenta(ok) {
    this.ferramentas++;
    if (!ok) this.falhas++;
  }

  /** desfecho: "ok" | "cancelado" | "erro: …" */
  fim(desfecho = "ok", provedor) {
    const partes = [`── #${this.numero} fim · ${segundos(this.agora() - this.inicio)}`];
    if (this.primeiraFala != null) partes.push(`1ª fala em ${segundos(this.primeiraFala)}`);
    if (this.ferramentas) {
      partes.push(
        `${this.ferramentas} ferramenta${this.ferramentas > 1 ? "s" : ""}` +
          (this.falhas ? ` (${this.falhas} falh${this.falhas > 1 ? "aram" : "ou"})` : "")
      );
    }
    if (provedor) partes.push(provedor);
    partes.push(desfecho === "ok" ? `resposta de ${this.caracteres} caracteres` : curto(desfecho, 160));
    return partes.join(" · ");
  }
}

module.exports = { carimbo, linha, rotacionar, resultadoDeFerramenta, Turno };
