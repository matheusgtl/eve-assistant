// chats.js — as conversas da barra lateral.
//
// Até 25/11/2026 existia UMA conversa: o historico.json, que o "limpar" zerava.
// Com o layout novo (o das conversas do Claude) ele pode começar uma conversa
// nova sem perder a anterior e voltar nela depois — e o agente que pegar a
// conversa de volta tem de saber onde ela estava (ver `inicioDoCerebro` no
// main.js e "O FIO DESTA CONVERSA" no prompt).
//
// Formato, de propósito, sem mexer no que já existe:
//   • historico.json continua sendo a conversa ABERTA, do jeito de sempre —
//     tudo que já lia e escrevia nele (tela, diário, ferramentas) segue igual;
//   • chats.json guarda qual é a aberta e as OUTRAS, inteiras.
// Trocar de conversa é guardar a aberta no chats.json e pôr a escolhida no
// historico.json. Nada é apagado nessa troca.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_GUARDADAS = 80;

function tituloDe(itens) {
  const dele = (itens || []).find((i) => i.quem === "voce" && String(i.texto || "").trim());
  if (!dele) return "Nova conversa";
  const limpo = String(dele.texto).replace(/^\[[^\]]*\]\s*/, "").replace(/\s+/g, " ").trim();
  const corte = limpo.length > 48 ? limpo.slice(0, 48).replace(/\s+\S*$/, "") + "…" : limpo;
  return corte ? corte[0].toUpperCase() + corte.slice(1) : "Nova conversa";
}

const novoId = () => crypto.randomBytes(6).toString("hex");

class Chats {
  /// `historico` = { ler(): itens, gravar(itens) } — o historico.json do main.
  constructor({ arquivo, historico, agora = () => new Date() }) {
    this.arquivo = arquivo;
    this.historico = historico;
    this.agora = agora;
  }

  carregar() {
    try {
      const d = JSON.parse(fs.readFileSync(this.arquivo, "utf8"));
      if (d && d.atual && Array.isArray(d.guardadas)) return d;
    } catch {}
    // Primeira vez: a conversa que já estava no histórico vira a aberta.
    // Gravada já aqui: sem isso cada leitura inventava um id novo para ela.
    const itens = this.historico.ler();
    const dados = {
      atual: { id: novoId(), criada: itens[0]?.hora || this.agora().toISOString() },
      guardadas: [],
    };
    this.gravar(dados);
    return dados;
  }

  gravar(dados) {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const tmp = this.arquivo + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(dados));
    fs.renameSync(tmp, this.arquivo); // nunca um chats.json pela metade
  }

  /// A aberta, com título e data tirados do que foi dito.
  aberta(dados = this.carregar()) {
    const itens = this.historico.ler();
    return {
      id: dados.atual.id,
      titulo: dados.atual.titulo || tituloDe(itens),
      criada: dados.atual.criada,
      atualizada: itens[itens.length - 1]?.hora || dados.atual.criada,
      itens,
    };
  }

  /// A lista para a barra lateral: a aberta primeiro, depois a mais recente.
  listar() {
    const dados = this.carregar();
    const a = this.aberta(dados);
    const resumo = (c, atual) => ({
      id: c.id,
      titulo: c.titulo || tituloDe(c.itens),
      atualizada: c.atualizada,
      mensagens: (c.itens || []).filter((i) => i.quem === "voce").length,
      atual,
    });
    return [
      resumo(a, true),
      ...dados.guardadas
        .slice()
        .sort((x, y) => String(y.atualizada).localeCompare(String(x.atualizada)))
        .map((c) => resumo(c, false)),
    ];
  }

  /// Guarda a aberta (se tiver algo dito) e devolve os dados sem ela.
  guardarAberta(dados) {
    const a = this.aberta(dados);
    if (a.itens.some((i) => i.quem === "voce")) {
      dados.guardadas = [a, ...dados.guardadas.filter((c) => c.id !== a.id)].slice(0, MAX_GUARDADAS);
    }
    return dados;
  }

  /// Começa uma conversa vazia. A anterior fica guardada.
  nova() {
    const dados = this.guardarAberta(this.carregar());
    dados.atual = { id: novoId(), criada: this.agora().toISOString() };
    this.historico.gravar([]);
    this.gravar(dados);
    return this.aberta(dados);
  }

  /// Abre uma guardada. Devolve null se o id não existe (nada muda).
  abrir(id) {
    let dados = this.carregar();
    if (dados.atual.id === id) return this.aberta(dados);
    const alvo = dados.guardadas.find((c) => c.id === id);
    if (!alvo) return null;
    dados = this.guardarAberta(dados);
    dados.guardadas = dados.guardadas.filter((c) => c.id !== id);
    dados.atual = { id: alvo.id, criada: alvo.criada, titulo: alvo.titulo };
    this.historico.gravar(alvo.itens || []);
    this.gravar(dados);
    return this.aberta(dados);
  }

  /// Muda o nome que aparece na barra lateral.
  renomear(id, titulo) {
    const t = String(titulo || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!t) return false;
    const dados = this.carregar();
    if (dados.atual.id === id) dados.atual.titulo = t;
    else {
      const c = dados.guardadas.find((x) => x.id === id);
      if (!c) return false;
      c.titulo = t;
    }
    this.gravar(dados);
    return true;
  }
}

module.exports = { Chats, tituloDe, MAX_GUARDADAS };
