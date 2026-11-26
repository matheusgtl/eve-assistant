// cerebroRede.js — a rede neural anotando tudo no cérebro do Obsidian.
//
// Mora em `<memória>/rede/`, ligada à nota CEREBRO.md como mais um índice:
//
//   rede/REDE.md                  ← gerado: o que ela é agora, o que aprendeu
//   rede/dias/2026-11-26.md       ← diário: iniciativas, respostas, crescimento
//   rede/assembleias/<nome>.md    ← uma nota por grupo de neurônios que nasceu
//   rede/linguagem.md             ← o que a rede de linguagem já resolve sozinha
//
// Só ACRESCENTA: o diário recebe linhas no fim, a nota de uma assembleia é
// escrita uma vez, e nada aqui apaga arquivo (a regra da memória vale aqui).
// A pasta fica fora do índice da memória (FORA_DA_MEMORIA em memoria.js):
// o diário cresce todo dia e não pode viajar em toda pergunta.

"use strict";

const fsp = require("node:fs/promises");
const fs = require("node:fs");
const path = require("node:path");
const { ROTULOS } = require("./rede.js");

const PASTA = "rede";

const doisDigitos = (n) => String(n).padStart(2, "0");
const diaISO = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};
const horaCurta = (t) => {
  const d = new Date(t);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
};
const nomeDaAssembleia = (a) => `${a.canal.toLowerCase()}-${a.motor.toLowerCase()}`;
const rotulo = (m) => ROTULOS[m] || String(m || "").toLowerCase();
const sinal = (r) => (r > 0 ? `+${r}` : String(r));

/// A linha do diário para um evento da Mente (ou da rede de linguagem).
function linhaDoEvento(e) {
  const h = horaCurta(e.em);
  switch (e.tipo) {
    case "iniciativa": {
      const sentia = Object.keys(e.canais || {}).map((c) => c.toLowerCase()).join(", ");
      return `- ${h} — **falou por conta própria** (${rotulo(e.motor)}): “${e.texto}”${sentia ? ` · sentia: ${sentia}` : ""}`;
    }
    case "resposta":
      return `- ${h} — você respondeu à iniciativa (${rotulo(e.motor)}): “${e.texto}” → aprendeu ${sinal(e.recompensa)}`;
    case "notificacao":
      return `- ${h} — você abriu a notificação (${rotulo(e.motor)}) → aprendeu ${sinal(e.recompensa)}`;
    case "ignorada":
      return `- ${h} — a iniciativa (${rotulo(e.motor)}) ficou sem resposta → aprendeu ${sinal(e.recompensa)}`;
    case "cresceu":
      return `- ${h} — **a rede cresceu**: nasceu [[${nomeDaAssembleia(e.assembleia)}]] (${e.antes} → ${e.neuronios} neurônios)`;
    case "pensou":
      return `- ${h} — respondeu sozinha, sem agente (${e.intencao}, ${Math.round(e.confianca * 100)}%): “${e.pergunta}”`;
    case "corrigida":
      return `- ${h} — você corrigiu a resposta local (${e.intencao}): “${e.pergunta}” volta para os agentes`;
    case "aprendeu-com-agente":
      return `- ${h} — aprendeu com o agente: “${e.pergunta}” é ${e.intencao}`;
    case "linguagem-cresceu":
      return `- ${h} — **a rede de linguagem cresceu**: ${e.antes} → ${e.ocultos} neurônios ocultos`;
    case "despertar":
      return `- ${h} — acordou: ${e.descricao}`;
    default:
      return null;
  }
}

function notaDaAssembleia(a, nome = "Sexta-Feira") {
  const tipo = a.sinal > 0 ? "excitatória" : "inibitória";
  const efeito = a.sinal > 0
    ? `quando **${a.canal.toLowerCase()}** está aceso, a vontade de **${rotulo(a.motor)}** sobe mais rápido`
    : `quando **${a.canal.toLowerCase()}** está aceso, ela segura a vontade de **${rotulo(a.motor)}**`;
  return [
    "---",
    "quando: nunca — nota gerada pela rede neural",
    "tags: [rede, assembleia]",
    "---",
    "",
    `# Assembleia ${a.canal.toLowerCase()} → ${rotulo(a.motor)}`,
    "",
    `Nasceu em ${a.nasceuEm ? new Date(a.nasceuEm).toLocaleString("pt-BR") : "data desconhecida"}, no dia [[${diaISO(a.nasceuEm || Date.now())}]].`,
    "",
    `Seis neurônios ${a.sinal > 0 ? "excitatórios" : "inibitórios"} que a ${nome} criou porque a ligação`,
    `entre esse sentido e essa iniciativa ficou forte com as suas respostas. Na prática: ${efeito}.`,
    "",
    `Tipo: ${tipo}.`,
    "",
    "Ver também: [[REDE]] · [[CEREBRO]]",
    "",
  ].join("\n");
}

function notaDaRede(estado, { nome = "Sexta-Feira", linguagem = null } = {}) {
  const linhas = [
    "---",
    "quando: nunca — este arquivo é gerado automaticamente",
    "tags: [indice, rede]",
    "---",
    "",
    `# A rede neural da ${nome}`,
    "",
    `*${estado.descricao}.* Neurônios pulsados que sentem o seu ritmo no Mac e decidem quando ela fala`,
    "por conta própria; ao lado, uma rede de linguagem que responde sozinha o que já aprendeu, sem chamar os agentes.",
    "",
    `Humor agora: **${estado.humor}**. Iniciativas hoje: ${estado.hoje || 0}.`,
    "",
    "## O que ela aprendeu",
    "",
  ];
  if (estado.aprendizados?.length) {
    for (const [c, m, p] of estado.aprendizados) {
      linhas.push(`- ${c.toLowerCase()} → ${rotulo(m)}: ${p > 0 ? "puxa" : "segura"} (${p.toFixed(3)})`);
    }
  } else linhas.push("- ainda nada: ela aprende com as suas respostas às iniciativas");
  linhas.push("", "## Assembleias que nasceram", "");
  if (estado.assembleias?.length) {
    for (const a of estado.assembleias) linhas.push(`- [[${nomeDaAssembleia(a)}]] — ${a.sinal > 0 ? "excitatória" : "inibitória"}`);
  } else linhas.push("- nenhuma ainda: nascem quando uma associação aprendida fica forte");
  linhas.push("", "## Linguagem", "");
  if (linguagem) {
    linhas.push(
      `- ${linguagem.ocultos} neurônios ocultos, ${linguagem.intencoes} intenções, ${linguagem.exemplos} exemplos`,
      `- respondeu sozinha ${linguagem.locais} vezes; ${linguagem.agentes} foram para os agentes; ${linguagem.corrigidas} correções`,
      "- detalhes em [[linguagem]]"
    );
  } else linhas.push("- ainda carregando");
  linhas.push("", "Ver também: [[CEREBRO]] · os dias ficam em `rede/dias/`", "");
  return linhas.join("\n");
}

class CerebroRede {
  constructor({ pasta, nome = "Sexta-Feira", onDebug } = {}) {
    this.raiz = pasta ? path.join(pasta, PASTA) : null;
    this.nome = nome;
    this.onDebug = onDebug || (() => {});
    this.fila = Promise.resolve();
  }

  /// Tudo em fila: dois eventos no mesmo segundo não podem se atropelar.
  enfileirar(fn) {
    if (!this.raiz) return Promise.resolve();
    this.fila = this.fila.then(fn).catch((err) => this.onDebug("rede no cérebro: " + err.message));
    return this.fila;
  }

  registrar(e) {
    const linha = linhaDoEvento(e);
    if (!linha) return Promise.resolve();
    return this.enfileirar(async () => {
      const dia = diaISO(e.em);
      const pasta = path.join(this.raiz, "dias");
      await fsp.mkdir(pasta, { recursive: true });
      const arquivo = path.join(pasta, `${dia}.md`);
      if (!fs.existsSync(arquivo)) {
        const cabeca = [
          "---",
          "quando: nunca — diário gerado pela rede neural",
          "tags: [rede, diario]",
          "---",
          "",
          `# Rede em ${new Date(e.em).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
          "",
          "Ver também: [[REDE]] · [[CEREBRO]]",
          "",
        ].join("\n");
        await fsp.writeFile(arquivo, cabeca);
      }
      await fsp.appendFile(arquivo, linha + "\n");
      if (e.tipo === "cresceu") {
        await fsp.mkdir(path.join(this.raiz, "assembleias"), { recursive: true });
        const nota = path.join(this.raiz, "assembleias", `${nomeDaAssembleia(e.assembleia)}.md`);
        if (!fs.existsSync(nota)) await fsp.writeFile(nota, notaDaAssembleia(e.assembleia, this.nome));
      }
    });
  }

  /// Reescreve REDE.md (gerado, como MEMORIA.md) e a nota da linguagem.
  atualizarIndice(estado, linguagem = null, notaLinguagem = null) {
    return this.enfileirar(async () => {
      await fsp.mkdir(this.raiz, { recursive: true });
      await fsp.writeFile(path.join(this.raiz, "REDE.md"), notaDaRede(estado, { nome: this.nome, linguagem }));
      if (notaLinguagem) await fsp.writeFile(path.join(this.raiz, "linguagem.md"), notaLinguagem);
    });
  }
}

module.exports = { CerebroRede, linhaDoEvento, notaDaRede, notaDaAssembleia, nomeDaAssembleia, diaISO, PASTA };
