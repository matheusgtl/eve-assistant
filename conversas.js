// conversas.js — o diário de conversas no cofre do Obsidian.
//
// Por que existe: `salvar_conversa` já guardava uma conversa, mas só quando ele
// PEDIA. Conversa que depende de alguém lembrar de salvar é conversa perdida —
// e ele pediu o que tem comigo: a conversa fica, sem pedir.
//
// Duas decisões que valem explicar.
//
// 1. SALVA A CADA TURNO, não ao fechar o app. Salvar no `before-quit` perde
//    tudo se o app cair ou se a máquina dormir e ele nunca mais abrir aquela
//    janela. Reescrever o arquivo do dia a cada resposta custa alguns
//    quilobytes e não perde nada.
//
// 2. JUNTA OS FRAGMENTOS. A fala dela sai frase a frase, e o histórico guarda
//    cada frase como uma entrada. A conversa salva de 01/11 ficou assim:
//
//      **E.V.E** (22:35): Aqui estão os eventos marcados para novembro:
//      **E.V.E** (22:35): - **1º de novembro** – UFPR
//      **E.V.E** (22:35): - **6 de novembro** – Resultado 1ª fase UEL
//
//    Oito blocos para uma resposta, todos com a mesma hora. Aqui os fragmentos
//    seguidos dela voltam a ser uma resposta — a mesma regra da bolha na tela.

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

/// Quanto tempo de silêncio encerra uma conversa e começa outra.
/// Meia hora: abaixo disso é a mesma conversa com uma pausa para o café; acima,
/// ele voltou para outro assunto.
const PAUSA_NOVA_CONVERSA = 30 * 60 * 1000;

const doisDigitos = (n) => String(n).padStart(2, "0");

function apelido(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/// Cola o fragmento no anterior. A quebra pode vir no fim de um ou na frente do
/// outro, dependendo de onde o corte de fala caiu — a mesma regra da tela.
function juntar(antes, novo) {
  if (!antes) return String(novo).replace(/^\n+/, "");
  const fecha = /\n$/.test(antes);
  const abre = /^\n/.test(novo);
  if (fecha && abre) return antes + String(novo).replace(/^\n+/, "");
  if (fecha || abre) return antes + novo;
  return antes + " " + novo;
}

/// O histórico cru (uma entrada por fragmento) vira turnos de conversa.
function emTurnos(itens) {
  const turnos = [];
  for (const item of itens) {
    const quem = item.quem === "voce" ? "voce" : "eve";
    const ultimo = turnos[turnos.length - 1];
    // Fala dele nunca se junta: cada pergunta é uma pergunta. Dela, sim.
    if (ultimo && ultimo.quem === quem && quem === "eve") {
      ultimo.texto = juntar(ultimo.texto, item.texto || "");
      continue;
    }
    turnos.push({ quem, texto: String(item.texto || ""), hora: item.hora });
  }
  return turnos;
}

/// Onde um turno começa uma conversa NOVA: o primeiro, ou depois de uma pausa
/// longa. Devolve os grupos já separados.
function emConversas(turnos) {
  const grupos = [];
  for (const t of turnos) {
    const atual = grupos[grupos.length - 1];
    const quando = Date.parse(t.hora || "") || 0;
    const anterior = atual ? Date.parse(atual[atual.length - 1].hora || "") || 0 : 0;
    if (!atual || (quando && anterior && quando - anterior > PAUSA_NOVA_CONVERSA)) {
      grupos.push([t]);
    } else {
      atual.push(t);
    }
  }
  return grupos;
}

/// O título de uma conversa: a primeira coisa que ELE disse, encurtada.
/// Sem chamar modelo — título é para achar o arquivo, não para ser literatura,
/// e uma chamada de modelo por turno salvo seria caro e lento.
function tituloDe(turnos) {
  const dele = turnos.find((t) => t.quem === "voce" && t.texto.trim());
  if (!dele) return "conversa";
  const limpo = dele.texto.replace(/\s+/g, " ").trim();
  const corte = limpo.length > 60 ? limpo.slice(0, 60).replace(/\s+\S*$/, "") : limpo;
  return corte || "conversa";
}

function nomeDoArquivo(turnos) {
  const d = new Date(Date.parse(turnos[0].hora || "") || Date.now());
  const data = `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
  const hora = `${doisDigitos(d.getHours())}${doisDigitos(d.getMinutes())}`;
  return `${data}-${hora}-${apelido(tituloDe(turnos)) || "conversa"}.md`;
}

function markdown(turnos, nomeDela) {
  const d = new Date(Date.parse(turnos[0].hora || "") || Date.now());
  const fim = new Date(Date.parse(turnos[turnos.length - 1].hora || "") || Date.now());
  const hhmm = (x) => `${doisDigitos(x.getHours())}:${doisDigitos(x.getMinutes())}`;
  const titulo = tituloDe(turnos);
  const linhas = [
    "---",
    // "nunca": isto não é um processo nem um fato, então não entra no índice
    // que viaja no contexto dela. Conversa salva é para ELE reler.
    "quando: nunca — isto é uma conversa salva",
    `data: ${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`,
    `inicio: ${hhmm(d)}`,
    `fim: ${hhmm(fim)}`,
    `turnos: ${turnos.length}`,
    "tags: [conversa]",
    "---",
    "",
    `# ${titulo[0].toUpperCase() + titulo.slice(1)}`,
    "",
    `*${d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}, ${hhmm(d)}–${hhmm(fim)}*`,
    "",
  ];
  for (const t of turnos) {
    const texto = t.texto.trim();
    if (!texto) continue;
    const quem = t.quem === "voce" ? "Matheus" : nomeDela;
    const hora = t.hora ? hhmm(new Date(t.hora)) : "";
    linhas.push(`### ${quem}${hora ? ` · ${hora}` : ""}`, "", texto, "");
  }
  return linhas.join("\n");
}

class Conversas {
  constructor({ pasta, nomeDela = "E.V.E", onDebug = () => {} }) {
    this.pasta = pasta;
    this.nomeDela = nomeDela;
    this.onDebug = onDebug;
    this.ultimoEscrito = new Map(); // arquivo → conteúdo, para não reescrever igual
  }

  /// Salva a conversa em andamento. Chamada depois de cada resposta dela.
  /// Reescreve o arquivo da conversa ATUAL; as anteriores ficam como estão.
  async salvar(itens) {
    if (!this.pasta || !itens?.length) return null;
    const conversas = emConversas(emTurnos(itens));
    const atual = conversas[conversas.length - 1];
    if (!atual?.length) return null;

    const arquivo = nomeDoArquivo(atual);
    const conteudo = markdown(atual, this.nomeDela);
    if (this.ultimoEscrito.get(arquivo) === conteudo) return arquivo;

    await fs.mkdir(this.pasta, { recursive: true });
    await fs.writeFile(path.join(this.pasta, arquivo), conteudo);
    this.ultimoEscrito.set(arquivo, conteudo);
    await this.gerarIndice();
    this.onDebug(`conversa salva: ${arquivo} (${atual.length} turnos)`);
    return arquivo;
  }

  /// O índice das conversas, com link do Obsidian. Mesma ideia do MEMORIA.md:
  /// é gerado, e a verdade são os arquivos.
  async gerarIndice() {
    try {
      const arquivos = (await fs.readdir(this.pasta))
        .filter((f) => f.endsWith(".md") && f !== "CONVERSAS.md")
        .sort()
        .reverse();
      const linhas = [
        "---",
        "quando: nunca — este arquivo é gerado automaticamente",
        "tags: [indice]",
        "---",
        "",
        "# Conversas",
        "",
        `*${arquivos.length} conversa(s). Gerado automaticamente — a verdade são os arquivos.*`,
        "",
      ];
      let mesAtual = null;
      for (const f of arquivos) {
        const m = f.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})-(.*)\.md$/);
        if (!m) continue;
        const [, ano, mes, dia, hh, mm, slug] = m;
        const mesNome = new Date(`${ano}-${mes}-02`).toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        });
        if (mesNome !== mesAtual) {
          linhas.push("", `## ${mesNome[0].toUpperCase() + mesNome.slice(1)}`, "");
          mesAtual = mesNome;
        }
        linhas.push(`- **${dia}/${mes}, ${hh}:${mm}** — [[Conversas/${f.replace(/\.md$/, "")}]]`);
      }
      await fs.writeFile(path.join(this.pasta, "CONVERSAS.md"), linhas.join("\n") + "\n");
    } catch (err) {
      this.onDebug(`não consegui gerar o índice de conversas: ${err.message}`);
    }
  }
}

module.exports = { Conversas, emTurnos, emConversas, tituloDe, juntar, markdown, PAUSA_NOVA_CONVERSA };
