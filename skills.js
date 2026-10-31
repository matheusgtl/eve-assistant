// skills.js — as habilidades da E.V.E: um comando, uma sequência de ações.
//
// A ideia é a mesma das skills do Claude Code, e a razão de existir é a mesma:
// tem coisa que ele pede sempre e que é um ROTEIRO, não uma pergunta — salvar
// a conversa, preparar o fim do dia, organizar a pasta de downloads. Explicar
// o roteiro toda vez é trabalho repetido; e pior, ela faz diferente a cada vez.
//
// Uma skill é um .md com frontmatter, na mesma pasta do Obsidian onde mora a
// memória. Isso é deliberado: ele ABRE E ESCREVE essas skills à mão, no editor
// que já usa, sem passar por mim e sem reiniciar o app. Uma skill que só a
// E.V.E soubesse criar seria metade da ideia.
//
//     ---
//     comando: salvar conversa
//     quando: ele pedir para salvar, guardar ou exportar esta conversa
//     ---
//     # Salvar conversa
//     1. Chame salvar_conversa.
//     2. Diga em uma frase onde ficou.
//
// O que vai para o contexto é só a LINHA de cada skill (comando — quando).
// Os passos são lidos sob demanda, pela ferramenta usar_skill. Mesma economia
// da memória: o índice inteiro viaja em toda pergunta, o conteúdo não.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { apelido, lerFrontmatter } = require("./memoria.js");

const PASTA = "Skills"; // dentro do cofre da memória
const TETO_INDICE = 1400; // caracteres (~350 tokens) de índice no prompt
const LIMITE_LEITURA = 20_000;

/// As skills que já vêm prontas. Existem por um motivo prático: skill é uma
/// ideia que não se explica em abstrato. Com duas na pasta, ele abre, lê e
/// entende o formato em dez segundos — e a primeira que ele escrever vai
/// parecer com estas.
const INICIAIS = [
  {
    nome: "salvar conversa",
    quando: "ele pedir para salvar, guardar, exportar ou arquivar esta conversa",
    passos: [
      "1. Chame `salvar_conversa`. Se ele disse um nome ou um assunto, passe em `titulo`;",
      "   se não disse, deixe em branco e eu uso a data.",
      "2. Diga em UMA frase onde o arquivo ficou. Não leia o caminho inteiro em voz alta.",
      "",
      "Se ele pedir só um trecho (\"salva só a parte do contrato\"), use `write_file`",
      "direto, escrevendo o trecho em markdown na pasta Conversas do cofre.",
    ].join("\n"),
  },
  {
    nome: "resumir o dia",
    quando: "ele pedir um resumo do dia, do que ficou pendente, ou como foi o dia",
    passos: [
      "1. Chame `list_reminders` e veja o que está pendente.",
      "2. Chame `system_status` para saber como está o Mac (bateria, disco).",
      "3. Olhe a conversa de hoje: o que ele pediu, o que ficou no meio.",
      "4. Responda em até quatro frases, nesta ordem: o que ficou pendente,",
      "   o que vence amanhã, e um aviso só se houver algo de fato (disco cheio,",
      "   bateria acabando). Sem nada relevante, diga que o dia está limpo.",
    ].join("\n"),
  },
];

async function listarArquivos(raiz) {
  try {
    const itens = await fsp.readdir(raiz, { withFileTypes: true });
    return itens
      .filter((i) => i.isFile() && i.name.endsWith(".md") && !i.name.startsWith("."))
      .map((i) => i.name);
  } catch {
    return [];
  }
}

class Skills {
  constructor({ pasta, onDebug } = {}) {
    this.pasta = pasta; // já é .../<cofre>/Skills
    this.onDebug = onDebug || (() => {});
    this.cache = null;
  }

  /// Cria a pasta e as skills iniciais. Só escreve o que não existe: uma skill
  /// que ele editou nunca é sobrescrita por uma minha na abertura seguinte.
  async preparar() {
    if (!this.pasta) return;
    await fsp.mkdir(this.pasta, { recursive: true });
    for (const inicial of INICIAIS) {
      const arquivo = path.join(this.pasta, apelido(inicial.nome) + ".md");
      if (fs.existsSync(arquivo)) continue;
      await fsp.writeFile(arquivo, this.formatar(inicial));
    }
    const leiame = path.join(this.pasta, "_como-criar-uma-skill.md");
    if (!fs.existsSync(leiame)) {
      await fsp.writeFile(
        leiame,
        [
          "---",
          "comando: (este arquivo não é uma skill)",
          "quando: nunca",
          "---",
          "",
          "# Como criar uma skill",
          "",
          "Uma skill é um roteiro que a E.V.E segue quando você diz um comando.",
          "Crie um `.md` aqui nesta pasta com este formato:",
          "",
          "```",
          "---",
          "comando: arrumar os downloads",
          "quando: ele pedir para organizar, limpar ou arrumar a pasta de downloads",
          "---",
          "",
          "# Arrumar os downloads",
          "",
          "1. Liste ~/Downloads.",
          "2. Separe por tipo em subpastas (imagens, documentos, instaladores).",
          "3. Mande para o Lixo o que tiver mais de 90 dias.",
          "4. Diga quantos arquivos moveu.",
          "```",
          "",
          "O `comando:` é o que você fala. O `quando:` é a única linha que fica no",
          "contexto dela o tempo todo — escreva pensando em *como ela reconhece a hora",
          "de usar*. Os passos ela só lê quando a skill é acionada.",
          "",
          "Pode pedir para ela criar também: \"crie uma skill que...\".",
          "Editar aqui vale na hora, sem reiniciar o aplicativo.",
          "",
        ].join("\n")
      );
    }
    this.onDebug("skills em " + this.pasta);
  }

  formatar({ nome, quando, passos, comando }) {
    return [
      "---",
      `comando: ${(comando || nome).replace(/\n/g, " ").trim()}`,
      `quando: ${(quando || nome).replace(/\n/g, " ").trim()}`,
      `atualizado: ${new Date().toISOString().slice(0, 10)}`,
      "---",
      "",
      `# ${nome.trim()}`,
      "",
      String(passos || "").trim(),
      "",
    ].join("\n");
  }

  /// Lista do que existe, relendo quando a pasta muda. Mesmo cache da memória:
  /// ler dez arquivos pequenos custa milissegundos, mas não a cada pergunta.
  async indice() {
    if (!this.pasta) return [];
    const arquivos = await listarArquivos(this.pasta);
    let marca = arquivos.join("|");
    for (const nome of arquivos) {
      try {
        marca += (await fsp.stat(path.join(this.pasta, nome))).mtimeMs + ",";
      } catch {}
    }
    if (this.cache?.marca === marca) return this.cache.itens;

    const itens = [];
    for (const arquivo of arquivos) {
      // O arquivo de instruções não é skill; ele se marca com quando: nunca.
      try {
        const bruto = await fsp.readFile(path.join(this.pasta, arquivo), "utf8");
        const { dados, corpo } = lerFrontmatter(bruto);
        if (/^nunca$/i.test((dados.quando || "").trim())) continue;
        const titulo = (corpo.match(/^#{1,3}\s+(.+)$/m) || [])[1];
        itens.push({
          arquivo,
          nome: arquivo.replace(/\.md$/, ""),
          comando: (dados.comando || titulo || arquivo.replace(/\.md$/, "")).trim(),
          quando: (dados.quando || titulo || "").trim(),
        });
      } catch {}
    }
    itens.sort((a, b) => a.comando.localeCompare(b.comando));
    this.cache = { marca, itens };
    return itens;
  }

  /// As linhas do índice, já cortadas no orçamento do prompt.
  async paraPrompt() {
    const itens = await this.indice();
    const linhas = [];
    let tamanho = 0;
    for (const item of itens) {
      const linha = `- ${item.comando}${item.quando ? ` — ${item.quando}` : ""}`;
      if (tamanho + linha.length > TETO_INDICE) break;
      linhas.push(linha);
      tamanho += linha.length + 1;
    }
    return { linhas, total: itens.length, cortados: itens.length - linhas.length };
  }

  /// Abre uma skill. Aceita o comando falado, o nome do arquivo, com ou sem
  /// .md — o modelo vai errar isso, e errar aqui não pode virar "não existe".
  async usar(nome) {
    const pedido = (nome || "").trim().replace(/\.md$/, "").toLowerCase();
    if (!pedido) return { erro: "diga qual skill" };
    const itens = await this.indice();
    const alvo =
      itens.find((i) => i.comando.toLowerCase() === pedido) ||
      itens.find((i) => i.nome.toLowerCase() === pedido) ||
      itens.find((i) => i.nome.toLowerCase() === apelido(pedido)) ||
      itens.find((i) => i.comando.toLowerCase().includes(pedido)) ||
      itens.find((i) => pedido.includes(i.comando.toLowerCase())) ||
      // Última tentativa: todas as palavras do comando aparecem no pedido, em
      // qualquer ordem. É o caso de "salvar essa conversa aqui" para a skill
      // "salvar conversa" — o modelo repassa a frase dele em vez do comando,
      // e recusar isso seria recusar a skill por causa de um "essa".
      itens.find((i) => {
        const palavras = i.comando
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        return palavras.length > 0 && palavras.every((w) => pedido.includes(w));
      });

    if (!alvo) {
      return { erro: `não tenho uma skill "${nome}"`, disponiveis: itens.map((i) => i.comando) };
    }
    const bruto = await fsp.readFile(path.join(this.pasta, alvo.arquivo), "utf8");
    const { corpo } = lerFrontmatter(bruto);
    return {
      comando: alvo.comando,
      passos: corpo.trim().slice(0, LIMITE_LEITURA),
      instrucao:
        "Este é o roteiro desta skill. Siga os passos agora, na ordem, usando suas " +
        "ferramentas. Não leia os passos em voz alta — execute e conte o resultado.",
    };
  }

  /// Cria ou reescreve uma skill. Guarda .bak ao sobrescrever, pela mesma razão
  /// da memória: ela pode reescrever por cima de algo que ele escreveu à mão.
  async criar({ nome, comando, quando, passos }) {
    if (!this.pasta) return { erro: "a pasta de skills não está disponível" };
    if (!nome?.trim()) return { erro: "a skill precisa de nome" };
    if (!passos?.trim()) return { erro: "a skill precisa de passos" };

    const arquivo = apelido(nome) + ".md";
    const caminho = path.join(this.pasta, arquivo);
    await fsp.mkdir(this.pasta, { recursive: true });

    let backup = false;
    if (fs.existsSync(caminho)) {
      await fsp.copyFile(caminho, caminho + ".bak");
      backup = true;
    }
    await fsp.writeFile(caminho, this.formatar({ nome, comando, quando, passos }));
    this.cache = null;
    this.onDebug(`skill ${backup ? "reescrita" : "criada"}: ${arquivo}`);
    return { ok: true, arquivo, comando: (comando || nome).trim(), substituiu: backup || undefined };
  }
}

module.exports = { Skills, PASTA, INICIAIS, TETO_INDICE };
