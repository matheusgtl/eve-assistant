// gastos.js — o controle de gastos do Matheus, dentro do cofre do Obsidian.
//
// Um arquivo por mês em `Gastos/AAAA-MM.md`, com uma tabela de lançamentos e
// o resumo por categoria logo abaixo. Por que Markdown e não um JSON escondido
// no Application Support: pelo mesmo motivo da memória — é dele, ele abre no
// Obsidian, confere e corrige uma linha à mão. A tabela é LIDA de volta a cada
// operação, então a edição dele vale; o resumo é regerado, então não fica velho.
//
// E por que somar aqui e não deixar o modelo somar: modelo erra conta, e conta
// de dinheiro errada com voz confiante é pior do que não ter controle nenhum.
// Ela registra e pergunta; quem soma é o código.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PASTA_GASTOS = "Gastos";

// A lista é fechada de propósito: "comida", "lanche" e "restaurante" viram
// três categorias se ela inventar o nome a cada vez, e o resumo do mês perde
// o sentido. O que não casar vai para "Outros", não para uma categoria nova.
const CATEGORIAS = [
  "Alimentação", "Mercado", "Transporte", "Carro", "Casa", "Contas",
  "Saúde", "Lazer", "Compras", "Assinaturas", "Educação", "Igreja", "Outros",
];
const ENTRADA = "Entrada";

const SINONIMOS = {
  comida: "Alimentação", restaurante: "Alimentação", lanche: "Alimentação",
  ifood: "Alimentação", delivery: "Alimentação", alimentacao: "Alimentação",
  supermercado: "Mercado", feira: "Mercado",
  uber: "Transporte", onibus: "Transporte", "99": "Transporte",
  gasolina: "Carro", combustivel: "Carro", posto: "Carro", oficina: "Carro",
  aluguel: "Casa", moradia: "Casa",
  luz: "Contas", agua: "Contas", internet: "Contas", celular: "Contas",
  farmacia: "Saúde", remedio: "Saúde", medico: "Saúde",
  streaming: "Assinaturas", netflix: "Assinaturas", spotify: "Assinaturas",
  dizimo: "Igreja", oferta: "Igreja", doacao: "Igreja",
  curso: "Educação", faculdade: "Educação",
  roupa: "Compras", presente: "Compras",
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const semAcento = (t) =>
  String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function categoriaDe(bruta, entrada) {
  if (entrada) return ENTRADA;
  const chave = semAcento(bruta);
  if (!chave) return "Outros";
  const exata = CATEGORIAS.find((c) => semAcento(c) === chave);
  if (exata) return exata;
  if (SINONIMOS[chave]) return SINONIMOS[chave];
  const parcial = CATEGORIAS.find((c) => chave.includes(semAcento(c)) || semAcento(c).includes(chave));
  return parcial || "Outros";
}

/// "R$ 1.234,56", "32,5", 32.5, "1,234.56" → número. Inválido → NaN.
function valorDe(bruto) {
  if (typeof bruto === "number") return bruto;
  let t = String(bruto ?? "").replace(/[^\d,.-]/g, "");
  if (!t) return NaN;
  const virgula = t.lastIndexOf(","), ponto = t.lastIndexOf(".");
  // O separador decimal é o ÚLTIMO dos dois que aparecer: "1.234,56" é BR,
  // "1,234.56" é americano. Só vírgula é sempre decimal (é como ele fala).
  if (virgula > ponto) t = t.replace(/\./g, "").replace(",", ".");
  else if (ponto > virgula && virgula >= 0) t = t.replace(/,/g, "");
  else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  return Number(t);
}

const centavos = (v) => Math.round(v * 100);
const reais = (c) =>
  (c < 0 ? "-" : "") +
  "R$ " +
  (Math.abs(c) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/// Data local de hoje em AAAA-MM-DD. toISOString daria a data em UTC, e às
/// 22h em Londrina isso já é amanhã.
function hoje(agora = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

function dataDe(bruta, agora) {
  const t = String(bruta || "").trim();
  if (!t) return hoje(agora);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : String((agora || new Date()).getFullYear());
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const limparCelula = (t) => String(t ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();

class Gastos {
  constructor({ pasta, onDebug } = {}) {
    this.raiz = pasta;
    this.pasta = path.join(pasta, PASTA_GASTOS);
    this.onDebug = onDebug || (() => {});
  }

  arquivoDoMes(mes) {
    return path.join(this.pasta, `${mes}.md`);
  }

  /// Lê as linhas da tabela de um mês. Linha que ele editou à mão e quebrou
  /// (valor ilegível) é pulada, não derruba o mês inteiro.
  async lerMes(mes) {
    let texto;
    try {
      texto = await fsp.readFile(this.arquivoDoMes(mes), "utf8");
    } catch {
      return [];
    }
    const [ano] = mes.split("-");
    const itens = [];
    for (const linha of texto.split("\n")) {
      const cel = linha.split("|").slice(1, -1).map((c) => c.trim());
      if (cel.length < 6 || !/^g[a-z0-9]+$/i.test(cel[0])) continue;
      const [id, data, valor, categoria, descricao, pagamento] = cel;
      const dm = data.match(/^(\d{1,2})\/(\d{1,2})$/);
      const c = centavos(valorDe(valor));
      if (!dm || !Number.isFinite(c)) continue;
      const entrada = semAcento(categoria) === semAcento(ENTRADA);
      itens.push({
        id,
        data: `${ano}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`,
        centavos: Math.abs(c),
        categoria: entrada ? ENTRADA : categoriaDe(categoria),
        descricao,
        pagamento: pagamento === "—" ? "" : pagamento,
        entrada,
      });
    }
    return itens;
  }

  async meses() {
    try {
      return (await fsp.readdir(this.pasta))
        .filter((n) => /^\d{4}-\d{2}\.md$/.test(n))
        .map((n) => n.slice(0, 7))
        .sort();
    } catch {
      return [];
    }
  }

  /// Regrava o mês inteiro: tabela em ordem de data e o resumo recalculado.
  async gravarMes(mes, itens) {
    await fsp.mkdir(this.pasta, { recursive: true });
    const [ano, m] = mes.split("-");
    const nomeMes = `${MESES[Number(m) - 1]} de ${ano}`;
    itens = [...itens].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
    const r = resumir(itens);

    const linhas = [
      "---",
      `quando: nunca — lançamentos de ${nomeMes}; a E.V.E lê por consultar_gastos`,
      `atualizado: ${hoje()}`,
      "tags: [gastos]",
      "---",
      "",
      `# Gastos de ${nomeMes}`,
      "",
      `**Gastos:** ${reais(r.gastos)} · **Entradas:** ${reais(r.entradas)} · **Saldo:** ${reais(r.entradas - r.gastos)}`,
      "",
      "| id | data | valor | categoria | descrição | pagamento |",
      "|---|---|---|---|---|---|",
      ...itens.map((i) =>
        `| ${i.id} | ${i.data.slice(8, 10)}/${i.data.slice(5, 7)} | ${reais(i.centavos).replace("R$ ", "")} | ` +
          `${i.categoria} | ${limparCelula(i.descricao)} | ${limparCelula(i.pagamento) || "—"} |`
      ),
      "",
      "## Por categoria",
      "",
      ...(r.porCategoria.length
        ? r.porCategoria.map((c) => `- ${c.categoria}: ${reais(c.centavos)} (${c.qtd})`)
        : ["- nada gasto ainda"]),
      "",
      "*Mantido pela E.V.E. Pode corrigir uma linha da tabela aqui mesmo: o resumo se refaz na próxima vez que ela mexer.*",
      "",
      "## Relacionado",
      "- [[fatos/financas-do-matheus]]",
      "",
    ];
    const alvo = this.arquivoDoMes(mes);
    if (fs.existsSync(alvo)) await fsp.copyFile(alvo, alvo + ".bak");
    await fsp.writeFile(alvo, linhas.join("\n"));
  }

  async registrar({ valor, descricao, categoria, data, pagamento, entrada } = {}, agora) {
    // A ferramenta não tem campo `entrada`: é a categoria "Entrada" (custa
    // menos no pedido do que um booleano a mais). O `entrada` fica para quem
    // chama o módulo direto.
    entrada = entrada || semAcento(categoria) === semAcento(ENTRADA);
    const v = valorDe(valor);
    if (!Number.isFinite(v) || v === 0) return { erro: `valor ilegível: "${valor}". Pergunte quanto foi.` };
    const desc = limparCelula(descricao);
    if (!desc) return { erro: "falta dizer com o quê foi o gasto" };
    const dia = dataDe(data, agora);
    if (!dia) return { erro: `data ilegível: "${data}". Use AAAA-MM-DD.` };

    // O livro é do que JÁ aconteceu. 04/11: ela lançou "cinema (estimativa
    // mês)", "remédios (estimativa)", o salário do dia 20 no dia 4 e a fatura
    // que ele ia pagar no dia seguinte — o mês abriu com R$ 659 "gastos" que
    // ele não tinha gastado. Plano tem lugar: a nota das finanças.
    const ONDE_VAI_O_PLANO =
      "Plano, estimativa e conta a pagar vão em fatos/financas-do-matheus (anotar_memoria). " +
      "Lance aqui no dia em que ele disser que pagou ou recebeu.";
    if (dia > hoje(agora)) {
      return { erro: `${dia} ainda não chegou: isso não aconteceu ainda. ${ONDE_VAI_O_PLANO}` };
    }
    if (/estimativ|previs[aã]o|previsto|m[eé]dia|planejad|or[cç]amento|vai pagar|a pagar\b/i.test(desc)) {
      return { erro: `"${desc}" é plano, não gasto feito. ${ONDE_VAI_O_PLANO}` };
    }

    const mes = dia.slice(0, 7);
    const itens = await this.lerMes(mes);
    const usados = new Set(itens.map((i) => i.id));
    let id;
    do id = "g" + Math.random().toString(36).slice(2, 6); while (usados.has(id));

    const item = {
      id,
      data: dia,
      centavos: Math.abs(centavos(v)),
      categoria: categoriaDe(categoria, !!entrada),
      descricao: desc,
      pagamento: limparCelula(pagamento),
      entrada: !!entrada,
    };
    itens.push(item);
    await this.gravarMes(mes, itens);
    const r = resumir(itens);
    this.onDebug(`gasto registrado: ${id} ${reais(item.centavos)} ${item.categoria} (${desc})`);
    return {
      ok: true,
      id,
      registrado: `${reais(item.centavos)} · ${item.categoria} · ${desc} · ${dia}`,
      mes: {
        gastos: reais(r.gastos),
        nesta_categoria: reais(r.porCategoria.find((c) => c.categoria === item.categoria)?.centavos || 0),
      },
    };
  }

  /// O período padrão é o mês corrente; `de`/`ate` cruzam meses.
  async consultar({ mes, de, ate, categoria, busca } = {}, agora) {
    let inicio, fim;
    if (de || ate) {
      inicio = dataDe(de, agora) || "0000-00-00";
      fim = dataDe(ate, agora) || hoje(agora);
    } else {
      const alvo = /^\d{4}-\d{2}$/.test(String(mes || "").trim()) ? mes.trim() : hoje(agora).slice(0, 7);
      inicio = `${alvo}-01`;
      fim = `${alvo}-31`;
    }
    const todos = [];
    for (const m of await this.meses()) {
      if (m < inicio.slice(0, 7) || m > fim.slice(0, 7)) continue;
      todos.push(...(await this.lerMes(m)));
    }
    const cat = categoria ? categoriaDe(categoria) : null;
    const termo = semAcento(busca);
    const itens = todos
      .filter((i) => i.data >= inicio && i.data <= fim)
      .filter((i) => !cat || i.categoria === cat || (semAcento(categoria) === "entrada" && i.entrada))
      .filter((i) => !termo || semAcento(`${i.descricao} ${i.pagamento}`).includes(termo))
      .sort((a, b) => b.data.localeCompare(a.data));

    const r = resumir(itens);
    const LIMITE = 30;
    return {
      periodo: `${inicio} a ${fim}`,
      lancamentos: itens.length,
      gastos: reais(r.gastos),
      entradas: reais(r.entradas),
      saldo: reais(r.entradas - r.gastos),
      por_categoria: r.porCategoria.map((c) => ({ categoria: c.categoria, total: reais(c.centavos), qtd: c.qtd })),
      itens: itens.slice(0, LIMITE).map((i) => ({
        id: i.id, data: i.data, valor: reais(i.centavos), categoria: i.categoria,
        descricao: i.descricao, pagamento: i.pagamento || undefined,
      })),
      mais: itens.length > LIMITE ? itens.length - LIMITE : undefined,
      vazio: itens.length ? undefined : "nenhum lançamento neste período — não invente valores",
    };
  }

  async apagar({ id } = {}) {
    const alvo = String(id || "").trim();
    if (!alvo) return { erro: "diga o id do lançamento (consultar_gastos mostra)" };
    for (const m of (await this.meses()).reverse()) {
      const itens = await this.lerMes(m);
      const achado = itens.find((i) => i.id === alvo);
      if (!achado) continue;
      await this.gravarMes(m, itens.filter((i) => i.id !== alvo));
      this.onDebug(`gasto apagado: ${alvo}`);
      return { ok: true, apagado: `${reais(achado.centavos)} · ${achado.categoria} · ${achado.descricao} · ${achado.data}` };
    }
    return { erro: `não há lançamento com id "${alvo}"` };
  }
}

function resumir(itens) {
  let gastos = 0, entradas = 0;
  const mapa = new Map();
  for (const i of itens) {
    if (i.entrada) { entradas += i.centavos; continue; }
    gastos += i.centavos;
    const c = mapa.get(i.categoria) || { categoria: i.categoria, centavos: 0, qtd: 0 };
    c.centavos += i.centavos;
    c.qtd++;
    mapa.set(i.categoria, c);
  }
  const porCategoria = [...mapa.values()].sort((a, b) => b.centavos - a.centavos);
  return { gastos, entradas, porCategoria };
}

module.exports = { Gastos, CATEGORIAS, PASTA_GASTOS, valorDe, categoriaDe, dataDe, reais };
