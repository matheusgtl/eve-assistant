// sessoes.js — uma sessão por conversa, para ela trabalhar em várias ao mesmo tempo.
//
// CONVERSAS SIMULTÂNEAS (26/11/2026). Até aqui havia UM cérebro para o app
// inteiro, e trocar de conversa na barra lateral o cancelava e zerava (17:04
// de 26/11: a pesquisa de notícias morreu na troca). Agora cada conversa tem a
// sua sessão — o cérebro dela e o estado do turno — e trocar de conversa não
// cancela nada: a que saiu continua trabalhando, como no Claude, e a resposta
// entra NELA, não na que está aberta.
//
// Quem diz a que conversa um pedaço de código pertence é o AsyncLocalStorage:
// o turno roda dentro de `rodar(sessao, fn)`, e tudo que ele chama — as
// ferramentas, o prompt, o anotar — acha a sessão certa por `doTurno()`, sem
// passar parâmetro por quinze funções. Fora de um turno (iniciativa, clique na
// interface) vale a conversa aberta.
//
// O que é da sessão (cérebro, notas, honestidade...) quem cria é o main.js,
// pela fábrica `criarSessao(id)`; aqui só mora a regra de quem é quem.

"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

// Além das que trabalham (que nunca saem), as últimas paradas guardam o
// cérebro: voltar nelas traz o histórico inteiro do agente, não só o fio.
const MAX_PARADAS = 6;

class Sessoes {
  constructor({ criarSessao, maxParadas = MAX_PARADAS }) {
    this.criarSessao = criarSessao;
    this.maxParadas = maxParadas;
    this.ctx = new AsyncLocalStorage();
    this.mapa = new Map(); // id da conversa → sessão
    this.aberta = criarSessao(null);
    this.aberta.ocupada = this.aberta.ocupada || 0;
  }

  /// A sessão do turno em andamento; fora de um turno, a que está na tela.
  doTurno() {
    return this.ctx.getStore() || this.aberta;
  }

  /// A conversa desta sessão é a que está na tela agora?
  naTela(s = this.doTurno()) {
    return s === this.aberta;
  }

  /// Roda um turno DENTRO da sessão: até o fim, ele é dela, mesmo que a tela
  /// mude de conversa no meio. `ocupada` conta os turnos em andamento.
  async rodar(s, fn) {
    s.ocupada = (s.ocupada || 0) + 1;
    try {
      return await this.ctx.run(s, fn);
    } finally {
      s.ocupada--;
    }
  }

  /// Roda fora de qualquer sessão (a fila da fala, que não é de ninguém).
  fora(fn) {
    return this.ctx.exit(fn);
  }

  /// A conversa que já estava aberta quando o app começou ganha o id dela.
  identificarAberta(id) {
    this.aberta.id = id;
    if (id) this.mapa.set(id, this.aberta);
  }

  ocupada(id) {
    return (this.mapa.get(id)?.ocupada || 0) > 0;
  }

  /// A tela passa para a conversa `id`. A que saiu NÃO é cancelada. A que
  /// entra volta com a sessão dela se ainda existe (e tem cérebro); senão
  /// nasce uma, e `preparar(s)` dá o cérebro a ela.
  /// Devolve { s, saiu, voltou }.
  trocar(id, preparar = () => {}) {
    const saiu = this.aberta;
    if (saiu.id) this.mapa.set(saiu.id, saiu);
    let s = id ? this.mapa.get(id) : null;
    const voltou = !!(s && s.brain);
    if (!voltou) {
      s = this.criarSessao(id);
      s.ocupada = s.ocupada || 0;
      preparar(s);
    }
    if (id) this.mapa.set(id, s);
    this.aberta = s;
    this.aposentar();
    return { s, saiu, voltou };
  }

  /// Esquece os cérebros das sessões paradas mais antigas. As que trabalham
  /// nunca saem: o turno delas ainda precisa do cérebro.
  aposentar() {
    const paradas = [...this.mapa.values()].filter((x) => x !== this.aberta && !x.ocupada);
    while (paradas.length > this.maxParadas) this.mapa.delete(paradas.shift().id);
  }

  /// Chave ou provedor mudou: as paradas esquecem o cérebro antigo (a que
  /// trabalha termina com o dela).
  esquecerParadas() {
    for (const [id, x] of this.mapa) if (x !== this.aberta && !x.ocupada) this.mapa.delete(id);
  }
}

module.exports = { Sessoes, MAX_PARADAS };
