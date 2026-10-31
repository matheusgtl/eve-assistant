// lembretes.js — lembretes da E.V.E: guardar, agendar, avisar.
//
// São dela, não do app Lembretes da Apple: ficam num JSON ao lado da
// configuração, sobrevivem a reiniciar o Mac e disparam notificação do
// sistema + fala. Quem mostra o aviso é o main.js, pelo callback aoDisparar.
//
// O relógio: um único temporizador, sempre armado para o próximo lembrete.
// setTimeout não aguenta mais de ~24,8 dias (estoura o inteiro de 32 bits e
// dispara na hora), então esperas longas são fatiadas em pedaços de um dia.

const fs = require("node:fs");
const path = require("node:path");

const UM_DIA = 24 * 60 * 60 * 1000;

const MESES = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

const DIAS_SEMANA = {
  domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3,
  quinta: 4, sexta: 5, sábado: 6, sabado: 6,
};

/// Converte o que o usuário (ou o cérebro) escreveu em um instante no tempo.
/// Aceita ISO 8601 — que é o que pedimos ao modelo — e também as formas que
/// uma pessoa fala, porque o modelo às vezes repassa a frase crua.
/// Devolve um Date ou null.
function interpretarQuando(texto, agora = new Date()) {
  if (!texto) return null;
  const t = String(texto).trim().toLowerCase();

  // --- ISO 8601 (o caminho preferido) ---
  if (/^\d{4}-\d{2}-\d{2}([t ]\d{2}:\d{2})?/.test(t)) {
    // Sem fuso explícito, a string é lida como hora local — que é o que se quer
    // num lembrete ("amanhã às 9" é 9 da manhã aqui, não em Londres).
    // O texto chega em minúsculas, e "2026-10-22t15:30" não é data válida: o
    // separador e o fuso precisam estar em maiúsculas.
    const iso = t.toUpperCase().replace(" ", "T");
    const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + (iso.includes("T") ? "" : "T09:00"));
    return isNaN(d) ? null : d;
  }

  // --- "em 10 minutos", "daqui a 2 horas", "em 30 segundos" ---
  const relativo = t.match(/(?:em|daqui\s*a|depois\s*de)\s+(?:uma?\s+|um\s+)?(\d+)?\s*(segundo|minuto|min\b|hora|dia|semana)/);
  if (relativo) {
    const n = Number(relativo[1] || 1);
    const unidade = relativo[2];
    const ms =
      unidade.startsWith("segundo") ? 1000 :
      unidade.startsWith("min") ? 60_000 :
      unidade.startsWith("hora") ? 3_600_000 :
      unidade.startsWith("dia") ? UM_DIA : 7 * UM_DIA;
    return new Date(agora.getTime() + n * ms);
  }

  // --- hora do dia: "às 15h", "as 9:30", "18h40" ---
  const hora = t.match(/(?:às|as|á|a)?\s*(\d{1,2})\s*(?:[:h]\s*(\d{2}))?\s*(?:h|horas)?\b/);
  const temHora = hora && /[:h]|hora|às|as\s+\d/.test(t);

  const alvo = new Date(agora);
  alvo.setSeconds(0, 0);

  // --- dia: hoje / amanhã / depois de amanhã / dia da semana / "25 de dez" ---
  let diaDefinido = false;
  if (/depois de amanh/.test(t)) {
    alvo.setDate(alvo.getDate() + 2);
    diaDefinido = true;
  } else if (/amanh/.test(t)) {
    alvo.setDate(alvo.getDate() + 1);
    diaDefinido = true;
  } else if (/hoje|agora/.test(t)) {
    diaDefinido = true;
  } else {
    for (const [nome, indice] of Object.entries(DIAS_SEMANA)) {
      if (!t.includes(nome)) continue;
      let delta = (indice - alvo.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "na segunda" dito numa segunda = a próxima
      alvo.setDate(alvo.getDate() + delta);
      diaDefinido = true;
      break;
    }
    const data = t.match(/\b(\d{1,2})\s*(?:de\s*)?([a-zç]{3,})/);
    if (!diaDefinido && data && MESES[data[2].slice(0, 3)] !== undefined) {
      alvo.setMonth(MESES[data[2].slice(0, 3)], Number(data[1]));
      diaDefinido = true;
    }
  }

  if (!temHora && !diaDefinido) return null;

  if (temHora) {
    let h = Number(hora[1]);
    const m = Number(hora[2] || 0);
    // "às 8" dito à tarde quase sempre quer dizer 20h.
    if (h <= 12 && /tarde|noite/.test(t)) h += 12;
    if (h === 24) h = 0;
    alvo.setHours(h, m, 0, 0);
  } else {
    alvo.setHours(9, 0, 0, 0); // dia sem hora: manhã
  }

  // Já passou e nenhum dia foi dito: é para amanhã.
  if (alvo <= agora && !diaDefinido) alvo.setDate(alvo.getDate() + 1);
  if (alvo <= agora) return null;

  return alvo;
}

function formatar(quando) {
  const d = new Date(quando);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return `hoje às ${hora}`;
  const amanha = new Date(hoje.getTime() + UM_DIA);
  if (d.toDateString() === amanha.toDateString()) return `amanhã às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} às ${hora}`;
}

class Lembretes {
  constructor({ arquivo, aoDisparar, log }) {
    this.arquivo = arquivo;
    this.aoDisparar = aoDisparar || (() => {});
    this.log = log || (() => {});
    this.itens = [];
    this.timer = null;
  }

  carregar() {
    try {
      const dados = JSON.parse(fs.readFileSync(this.arquivo, "utf8"));
      this.itens = Array.isArray(dados) ? dados : [];
    } catch {
      this.itens = [];
    }
    // Lembretes que venceram com o app fechado disparam agora, avisando o atraso.
    const agora = Date.now();
    const atrasados = this.itens.filter((l) => !l.feito && new Date(l.quando).getTime() <= agora);
    for (const l of atrasados) this.disparar(l, true);
    this.rearmar();
    return this.itens.filter((l) => !l.feito);
  }

  salvar() {
    try {
      fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
      // Guarda só o que ainda importa: pendentes e os 20 últimos já disparados.
      const pendentes = this.itens.filter((l) => !l.feito);
      const prontos = this.itens.filter((l) => l.feito).slice(-20);
      this.itens = [...prontos, ...pendentes];
      fs.writeFileSync(this.arquivo, JSON.stringify(this.itens, null, 2));
    } catch (err) {
      this.log("não consegui salvar os lembretes:", err.message);
    }
  }

  criar({ texto, quando }) {
    const data = quando instanceof Date ? quando : interpretarQuando(quando);
    if (!data) {
      return {
        erro:
          `Não entendi o horário "${quando}". Me dê a data e hora no formato ` +
          `2026-10-22T15:30, ou algo como "em 20 minutos".`,
      };
    }
    const limpo = String(texto || "").trim() || "Lembrete";

    // Lembrete igual, na mesma hora, já pendente: devolve o que existe em vez
    // de criar outro.
    //
    // Isto não é hipótese. No dia 30 ele pediu o mesmo compromisso duas vezes
    // (porque o primeiro pedido tinha caído no lembrete em vez de no
    // calendário, e ele não encontrava), e ficaram dois lembretes do mesmo
    // casamento — e três da UFPR, que vão tocar três vezes no mesmo minuto.
    // Repetir o pedido é o que qualquer pessoa faz quando acha que não deu
    // certo; a correção fica aqui, onde é barata, e não na disciplina dele.
    const jaExiste = this.itens.find(
      (l) => !l.feito && l.texto === limpo && l.quando === data.toISOString()
    );
    if (jaExiste) {
      this.log("lembrete repetido, não criei outro:", jaExiste.id, limpo);
      return {
        ok: true,
        jaExistia: true,
        id: jaExiste.id,
        texto: jaExiste.texto,
        quando: formatar(jaExiste.quando),
        iso: jaExiste.quando,
      };
    }

    const item = {
      id: Math.random().toString(36).slice(2, 8),
      texto: limpo,
      quando: data.toISOString(),
      criadoEm: new Date().toISOString(),
      feito: false,
    };
    this.itens.push(item);
    this.salvar();
    this.rearmar();
    this.log("lembrete criado:", item.id, item.texto, "→", formatar(item.quando));
    return { ok: true, id: item.id, texto: item.texto, quando: formatar(item.quando), iso: item.quando };
  }

  listar() {
    return this.itens
      .filter((l) => !l.feito)
      .sort((a, b) => new Date(a.quando) - new Date(b.quando))
      .map((l) => ({ id: l.id, texto: l.texto, quando: formatar(l.quando), iso: l.quando }));
  }

  cancelar(id) {
    const antes = this.itens.length;
    this.itens = this.itens.filter((l) => l.id !== id);
    if (this.itens.length === antes) return { erro: `Não achei lembrete com id ${id}.` };
    this.salvar();
    this.rearmar();
    return { ok: true, cancelado: id };
  }

  disparar(item, atrasado = false) {
    item.feito = true;
    this.salvar();
    this.aoDisparar({ ...item, atrasado });
  }

  /// Arma o temporizador para o lembrete mais próximo. Chamado a cada mudança.
  rearmar() {
    clearTimeout(this.timer);
    this.timer = null;

    const proximo = this.itens
      .filter((l) => !l.feito)
      .sort((a, b) => new Date(a.quando) - new Date(b.quando))[0];
    if (!proximo) return;

    const espera = new Date(proximo.quando).getTime() - Date.now();
    // Espera longa: dorme um dia e reavalia, para não estourar o setTimeout.
    const fatia = Math.min(Math.max(espera, 0), UM_DIA);
    this.timer = setTimeout(() => {
      if (new Date(proximo.quando).getTime() - Date.now() > 500) return this.rearmar();
      this.disparar(proximo);
      this.rearmar();
    }, fatia);
  }

  parar() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { Lembretes, interpretarQuando, formatar };
