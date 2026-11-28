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
const { redigir } = require("./segredos.js");
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
  for (let item of itens) {
    const quem = item.quem === "voce" ? "voce" : "eve";
    // Arquivo criado vira parágrafo próprio com o caminho: no diário, um
    // "📎 relatorio.pdf" colado no meio da frase dela não diz onde está.
    if (item.arquivo?.caminho) {
      item = { ...item, texto: `\n\n📎 ${item.arquivo.nome} — ${item.arquivo.caminho}\n\n` };
    }
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

/// O assunto escrito no título da nota ("# 27/11/2026 às 17:29 — Assunto"),
/// sem a data. Null se a nota não tem título (aí o link mostra o arquivo).
async function assuntoDoArquivo(arquivo) {
  try {
    const texto = await fs.readFile(arquivo, "utf8");
    const m = texto.match(/^# (.+)$/m);
    if (!m) return null;
    const assunto = m[1].replace(/^\d{2}\/\d{2}\/\d{4}(?: às \d{2}:\d{2})?\s*[—-]\s*/, "").replace(/[|\[\]]/g, " ").trim();
    return assunto || null;
  } catch {
    return null;
  }
}

function nomeDoArquivo(turnos) {
  const d = new Date(Date.parse(turnos[0].hora || "") || Date.now());
  const data = `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
  const hora = `${doisDigitos(d.getHours())}${doisDigitos(d.getMinutes())}`;
  return `${data}-${hora}-${apelido(tituloDe(turnos)) || "conversa"}.md`;
}

function markdown(turnos, nomeDela, ligacoes = []) {
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
    // 27/11/2026: ele pediu títulos com a data e o assunto, "de forma bonita".
    `# ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} às ${hhmm(d)} — ${titulo[0].toUpperCase() + titulo.slice(1)}`,
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
  // As notas que ela abriu e os aprendizados que gravou NESTA conversa. É o
  // que liga o diário ao resto do cérebro no grafo do Obsidian (25/11/2026):
  // sem isto cada conversa era uma ilha.
  const unicas = [...new Set(ligacoes.filter(Boolean))];
  linhas.push("---", "", "## Ligações", "");
  for (const l of unicas) linhas.push(`- [[${l}]]`);
  linhas.push("- [[CONVERSAS]] · [[CEREBRO]]", "");
  return linhas.join("\n");
}

class Conversas {
  /// `desde` é a hora em que o app abriu, e é o que separa esta conversa das
  /// anteriores.
  ///
  /// Sem isso, em 02/11 duas sessões caíram no MESMO arquivo: ele conversou
  /// até 16:09, fechou o app, reabriu 16:36 e conversou até 17:04. A pausa foi
  /// de 29 minutos — um minuto abaixo do limiar — então a regra de tempo juntou
  /// as duas, e o arquivo ficou com duas horas e o título da primeira pergunta.
  ///
  /// Abrir o app é um limite mais forte do que qualquer heurística de pausa: o
  /// histórico sobrevive ao fechamento, mas a conversa não. A pausa continua
  /// valendo DENTRO de uma sessão, para quem deixa a janela aberta o dia todo.
  constructor({ pasta, nomeDela = "Sexta-Feira", onDebug = () => {}, desde = Date.now() }) {
    this.pasta = pasta;
    this.nomeDela = nomeDela;
    this.onDebug = onDebug;
    this.desde = desde;
    this.ultimoEscrito = new Map(); // arquivo → conteúdo, para não reescrever igual
  }

  /// Salva a conversa em andamento. Chamada depois de cada resposta dela.
  /// Reescreve o arquivo da conversa ATUAL; as anteriores ficam como estão.
  /// `desde` (26/11/2026, conversas simultâneas): cada conversa aberta tem o
  /// seu começo; sem ele vale o da abertura do app.
  async salvar(itens, { ligacoes = [], desde = this.desde } = {}) {
    if (!this.pasta || !itens?.length) return null;
    // Só o que foi dito DESDE que o app abriu. O histórico guarda 120 entradas
    // e atravessa reinícios; sem este corte, a sessão de hoje herdaria a de
    // ontem sempre que a pausa entre as duas fosse curta.
    const desta = itens.filter((i) => {
      const t = Date.parse(i.hora || "");
      return !Number.isFinite(t) || t >= desde;
    });
    if (!desta.length) return null;
    const conversas = emConversas(emTurnos(desta));
    const atual = conversas[conversas.length - 1];
    if (!atual?.length) return null;

    const arquivo = nomeDoArquivo(atual);
    // Chave colada no chat não vai para o cofre (27/11/2026, 22:51).
    const conteudo = redigir(markdown(atual, this.nomeDela, ligacoes));
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
        "Ver também: [[CEREBRO]] · [[MEMORIA]] · [[APRENDIZADOS]]",
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
        // O link mostra o assunto, não o nome do arquivo (27/11/2026).
        const assunto = await assuntoDoArquivo(path.join(this.pasta, f));
        const nome = f.replace(/\.md$/, "");
        linhas.push(`- **${dia}/${mes}, ${hh}:${mm}** — [[Conversas/${nome}${assunto ? `|${assunto}` : ""}]]`);
      }
      await fs.writeFile(path.join(this.pasta, "CONVERSAS.md"), linhas.join("\n") + "\n");
    } catch (err) {
      this.onDebug(`não consegui gerar o índice de conversas: ${err.message}`);
    }
  }
}

module.exports = { Conversas, emTurnos, emConversas, tituloDe, juntar, markdown, PAUSA_NOVA_CONVERSA };
