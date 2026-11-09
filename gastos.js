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
// "Saldo" não é gasto nem entrada: é ele dizendo quanto TEM na conta naquele
// momento. 05/11: ele perguntou "quanto tenho na conta agora?" e ela leu o
// saldo do livro (entradas menos gastos lançados, R$ 409,88 de um salário que
// nem tinha caído). O livro não sabia o ponto de partida. Agora sabe: o último
// Saldo informado, mais o que entrou e saiu DA CONTA depois dele.
const SALDO = "Saldo";
// Pago no Alelo ou no crédito não sai da conta corrente: o Alelo é outro
// cartão, e a compra no crédito só sai quando a fatura for paga.
const FORA_DA_CONTA = /alelo|vale|cr[eé]dito|cart[aã]o/i;
const ALELO = /alelo|vale/i;
const noCartao = (i) => !i.entrada && FORA_DA_CONTA.test(i.pagamento || "") && !ALELO.test(i.pagamento || "");
// "A pagar" é conta que ainda VAI vencer: a fatura do cartão, um boleto. Não é
// gasto (não saiu nada) e mora no mês do vencimento. 08/11: ele disse "agora
// tenho 376,36 de fatura" e ela respondeu com os R$ 327,64 que estavam escritos
// numa nota — o valor velho — e descontou da conta a compra que ele tinha feito
// no crédito. Conta a pagar numa nota fica velha e depende de ela lembrar de
// passar no vai_pagar; aqui ela entra sozinha no quanto_sobra e sai sozinha
// quando ele paga.
const A_PAGAR = "A pagar";
// "A receber" é o espelho: dinheiro que vai entrar numa data (a 2ª parcela do
// salário, dia 20). 08/11: "com o que vou receber dia 20, quanto tenho no fim
// do mês?" — sem isso no livro ela montou a conta na mão: tirou o Claude (que é
// no cartão), o app da igreja (já pago no dia 7), os gastos já lançados (que já
// estavam no saldo) e deu −R$ 229,83. Depois tirou a fatura, que ainda vai ser
// paga, e deu +R$ 879,34. O certo era R$ 634,98.
const A_RECEBER = "A receber";
const PREVISTO = new Set([A_PAGAR, A_RECEBER]);
// Pagamento do trabalho tem dízimo de 10%, separado no dia em que cai.
const DO_TRABALHO = /sal[aá]rio|pagamento|parcela|trabalho/i;
// Palavras que não dizem QUAL conta é: "paguei a conta do mês" não quita a
// fatura do Nubank só por ter "conta".
const VAZIAS = new Set(["pagamento", "pagar", "paguei", "pago", "conta", "contas", "valor", "para", "pela", "pelo", "mensal", "parcela"]);
const palavras = (t) => new Set(semAcento(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !VAZIAS.has(w)));
const temEmComum = (a, b) => { const B = palavras(b); return [...palavras(a)].some((w) => B.has(w)); };
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

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
  if (chave === "saldo") return SALDO;
  if (chave.replace(/\s+/g, " ") === "a pagar") return A_PAGAR;
  if (chave.replace(/\s+/g, " ") === "a receber") return A_RECEBER;
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

/// "hoje (05/11)", "ontem (04/11)", "em 02/11". 05/11: ela leu 2026-11-05 e
/// disse "ontem (5/11)" no próprio dia 5 — data crua deixa a conta com ela.
function quandoFoi(data, agora) {
  const d = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
  const h = hoje(agora);
  if (data === h) return `hoje (${d})`;
  const ontem = new Date((agora || new Date()).getTime());
  ontem.setDate(ontem.getDate() - 1);
  if (data === hoje(ontem)) return `ontem (${d})`;
  return `em ${d}`;
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
    // Só por data, e estável: no mesmo dia vale a ordem em que foi lançado.
    // É ela que diz se um gasto veio antes ou depois do Saldo daquele dia.
    itens = [...itens].sort((a, b) => a.data.localeCompare(b.data));
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
      `**Gastos:** ${reais(r.gastos)} (${reais(r.noCartao)} no cartão) · **Entradas:** ${reais(r.entradas)}` +
        (r.aPagar ? ` · **A pagar:** ${reais(r.aPagar)}` : ""),
      "",
      "*O saldo da conta não é entradas menos gastos: ele parte do último Saldo informado, e o que foi no cartão só sai quando a fatura é paga.*",
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

  async registrar({ valor, descricao, categoria, data, pagamento, entrada, parcelas } = {}, agora) {
    // A ferramenta não tem campo `entrada`: é a categoria "Entrada" (custa
    // menos no pedido do que um booleano a mais). O `entrada` fica para quem
    // chama o módulo direto.
    entrada = entrada || semAcento(categoria) === semAcento(ENTRADA);
    const v = valorDe(valor);
    const ehSaldo = semAcento(categoria) === "saldo";
    if (ehSaldo && Number.isFinite(v)) entrada = false;
    if (!Number.isFinite(v) || (v === 0 && !ehSaldo)) return { erro: `valor ilegível: "${valor}". Pergunte quanto foi.` };
    const desc = limparCelula(descricao) || (ehSaldo ? "saldo da conta informado por ele" : "");
    if (!desc) return { erro: "falta dizer com o quê foi o gasto" };
    const dia = dataDe(data, agora);
    if (!dia) return { erro: `data ilegível: "${data}". Use AAAA-MM-DD.` };

    // O livro é do que JÁ aconteceu. 04/11: ela lançou "cinema (estimativa
    // mês)", "remédios (estimativa)", o salário do dia 20 no dia 4 e a fatura
    // que ele ia pagar no dia seguinte — o mês abriu com R$ 659 "gastos" que
    // ele não tinha gastado. Plano tem lugar: a nota das finanças.
    const ONDE_VAI_O_PLANO =
      "Conta que ainda vai vencer (fatura, boleto) é a categoria A pagar, com a data do vencimento. " +
      "Média e estimativa vão em fatos/financas-do-matheus. O resto se lança no dia em que ele pagou ou recebeu.";
    const cat0 = categoriaDe(categoria);
    if (PREVISTO.has(cat0) && !entrada) {
      if (/estimativ|m[eé]dia|or[cç]amento/i.test(desc)) return { erro: `"${desc}" é plano, não conta. ${ONDE_VAI_O_PLANO}` };
      return this.contaAPagar({ id: null, data: dia, centavos: Math.abs(centavos(v)), categoria: cat0, descricao: desc, pagamento: "", entrada: false }, agora);
    }
    if (dia > hoje(agora)) {
      return { erro: `${dia} ainda não chegou: isso não aconteceu ainda. ${ONDE_VAI_O_PLANO}` };
    }
    if (/estimativ|previs[aã]o|previsto|m[eé]dia|planejad|or[cç]amento|vai pagar|a pagar\b/i.test(desc)) {
      return { erro: `"${desc}" é plano, não gasto feito. ${ONDE_VAI_O_PLANO}` };
    }

    // Parcelado: a compra entra inteira (é o que ele gastou), e cada parcela
    // cai numa fatura. Parcelado é sempre no cartão.
    const total = Math.abs(centavos(v));
    const n = Math.floor(Number(parcelas));
    let valoresDasParcelas;
    let descFinal = desc;
    if (n >= 2 && !entrada && !ehSaldo) {
      const base = Math.floor(total / n);
      valoresDasParcelas = Array.from({ length: n }, (_, k) => base + (k === 0 ? total - base * n : 0));
      if (!FORA_DA_CONTA.test(pagamento || "")) pagamento = limparCelula(pagamento ? `crédito ${pagamento}` : "crédito");
      if (!/\d+\s*x/i.test(desc)) descFinal = `${desc} (${n}x de ${reais(valoresDasParcelas[0]).replace("R$ ", "")})`;
    }

    const mes = dia.slice(0, 7);
    const itens = await this.lerMes(mes);
    const item = {
      id: await this.novoId(),
      data: dia,
      centavos: total,
      categoria: categoriaDe(categoria, !!entrada),
      descricao: descFinal,
      pagamento: limparCelula(pagamento),
      entrada: !!entrada,
    };
    const id = item.id;
    itens.push(item);
    await this.gravarMes(mes, itens);
    const r = resumir(itens);
    if (ehSaldo) {
      this.onDebug(`saldo da conta registrado: ${id} ${reais(item.centavos)} em ${dia}`);
      return { ok: true, id, registrado: `saldo da conta: ${reais(item.centavos)} em ${dia}` };
    }
    // 07/11: ele ensinou "caiu o pagamento, separo 10% de dízimo na hora",
    // ela anotou a regra — e não lançou o dízimo do pagamento que ele tinha
    // acabado de contar. Regra numa nota depende de ela lembrar; o lembrete no
    // resultado da própria ferramenta chega na hora certa, com o valor exato
    // (ela tinha escrito 53,49 para 10% de 534,96, que é 53,50).
    const cartao = noCartao(item);
    const lembrar = item.entrada
      ? `Se isto é pagamento do trabalho dele: o dízimo é ${reais(Math.round(item.centavos / 10))} ` +
        "(10%), separado na hora — lance agora com categoria Igreja, sem perguntar. Pix de amigo ou " +
        "reembolso não tem dízimo."
      : cartao
        ? "Foi no cartão: NÃO sai da conta agora, entra na fatura. Não desconte do saldo."
        : undefined;
    // Pagou uma conta que estava a pagar? Ela sai da lista sozinha.
    const quitou = !cartao ? await this.quitar(item) : undefined;
    this.onDebug(`gasto registrado: ${id} ${reais(item.centavos)} ${item.categoria} (${descFinal})` + (quitou ? ` — quitou ${quitou}` : ""));
    return {
      ok: true,
      id,
      registrado: `${reais(item.centavos)} · ${item.categoria} · ${descFinal} · ${dia}`,
      mes: {
        gastos: reais(r.gastos),
        nesta_categoria: reais(r.porCategoria.find((c) => c.categoria === item.categoria)?.centavos || 0),
      },
      parcelas: valoresDasParcelas?.map((c, k) => `${k + 1}ª ${reais(c)}`),
      quitou: quitou ? `${quitou} saiu das contas a pagar` : undefined,
      ...(await this.depoisDoLancamento(agora)),
      lembrar,
    };
  }

  /// 09/11: "paguei minha fatura" — ela lançou certo e respondeu "saldo na
  /// conta: R$ 529,88", o número de ANTES, que estava na conversa. O saldo
  /// novo vem junto com o lançamento, para ela não precisar lembrar de
  /// consultar de novo.
  async depoisDoLancamento(agora) {
    const c = await this.consultar({}, agora);
    return {
      agora_na_conta: typeof c.saldo_em_conta === "object" ? c.saldo_em_conta.valor : undefined,
      fim_do_mes: typeof c.quanto_sobra === "object" ? c.quanto_sobra.valor : undefined,
      numeros_novos: "Use estes números, não os que foram ditos antes nesta conversa.",
    };
  }

  /// Os fixos de todo mês, em `Gastos/fixos.md` — salário, contas por Pix, a
  /// fatura mínima. Ele edita à mão no Obsidian. Servem para projetar além do
  /// mês atual; o mês atual vem só do livro (o que já foi pago está lá).
  async fixos() {
    let texto;
    try {
      texto = await fsp.readFile(path.join(this.pasta, "fixos.md"), "utf8");
    } catch {
      return [];
    }
    const lista = [];
    for (const linha of texto.split("\n")) {
      const cel = linha.split("|").slice(1, -1).map((x) => x.trim());
      if (cel.length < 4 || !/^\d{1,2}$/.test(cel[0])) continue;
      const c = centavos(valorDe(cel[1]));
      const categoria = categoriaDe(cel[2]);
      if (!Number.isFinite(c) || !PREVISTO.has(categoria)) continue;
      lista.push({ dia: Number(cel[0]), centavos: Math.abs(c), categoria, descricao: cel[3] });
    }
    return lista;
  }

  async novoId() {
    const usados = new Set();
    for (const m of await this.meses()) for (const i of await this.lerMes(m)) usados.add(i.id);
    let id;
    do id = "g" + Math.random().toString(36).slice(2, 6); while (usados.has(id));
    return id;
  }

  async todos() {
    const lista = [];
    for (const m of await this.meses()) lista.push(...(await this.lerMes(m)));
    return lista;
  }

  async tirar(alvo) {
    const m = alvo.data.slice(0, 7);
    await this.gravarMes(m, (await this.lerMes(m)).filter((i) => i.id !== alvo.id));
  }

  /// Conta a vencer. Se já há uma parecida em aberto ("Fatura Nubank" de
  /// novo), o valor novo SUBSTITUI o velho: é ele dizendo que a fatura mudou.
  async contaAPagar(item, agora) {
    const abertas = (await this.todos()).filter((i) => i.categoria === item.categoria);
    const velha = abertas.find((i) => temEmComum(i.descricao, item.descricao) && i.data.slice(0, 7) === item.data.slice(0, 7));
    if (velha) await this.tirar(velha);
    item.id = await this.novoId();
    const mes = item.data.slice(0, 7);
    await this.gravarMes(mes, [...(await this.lerMes(mes)), item]);
    const receber = item.categoria === A_RECEBER;
    this.onDebug(`${receber ? "a receber" : "conta a pagar"}: ${item.id} ${reais(item.centavos)} ${item.descricao} em ${item.data}` + (velha ? ` (era ${reais(velha.centavos)})` : ""));
    return {
      ok: true,
      id: item.id,
      registrado: `${receber ? "a receber" : "a pagar"}: ${reais(item.centavos)} · ${item.descricao} · ${ddmm(item.data)}`,
      substituiu: velha ? `${reais(velha.centavos)} (${velha.descricao}) — o valor velho saiu` : undefined,
      ...(await this.depoisDoLancamento(agora)),
      lembrar: receber
        ? "Ainda não entrou. Quando ele disser que caiu, lance a Entrada (e o dízimo): isto sai daqui sozinho."
        : "Não saiu nada da conta ainda. Quando ele disser que pagou, lance o pagamento: a conta sai daqui sozinha.",
    };
  }

  /// Pagamento de verdade que corresponde a uma conta a pagar: tira a conta.
  /// Casa pelo nome ("fatura", "nubank"); pelo valor só se for a única com ele.
  async quitar(pago) {
    const tipo = pago.entrada ? A_RECEBER : A_PAGAR;
    const abertas = (await this.todos()).filter((i) => i.categoria === tipo);
    const porNome = abertas.filter((i) => temEmComum(i.descricao, pago.descricao));
    const porValor = abertas.filter((i) => i.centavos === pago.centavos);
    // Salário que caiu com valor diferente do previsto e outro nome ("caiu o
    // pagamento" × "2ª parcela do salário"): é o que estava previsto para
    // aqueles dias, se for o único.
    const perto = pago.entrada
      ? abertas.filter((i) => Math.abs(Date.parse(i.data) - Date.parse(pago.data)) <= 5 * 864e5 && DO_TRABALHO.test(i.descricao))
      : [];
    const alvo =
      porNome.find((i) => i.centavos === pago.centavos) ||
      (porNome.length === 1 ? porNome[0] : null) ||
      (porValor.length === 1 ? porValor[0] : null) ||
      (pago.entrada && DO_TRABALHO.test(pago.descricao) && perto.length === 1 ? perto[0] : null);
    if (!alvo) return undefined;
    await this.tirar(alvo);
    return `${alvo.descricao} (${reais(alvo.centavos)}, vencia ${ddmm(alvo.data)})`;
  }

  /// O período padrão é o mês corrente; `de`/`ate` cruzam meses.
  async consultar({ mes, de, ate, categoria, busca, vai_pagar } = {}, agora) {
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
      .filter((i) => !PREVISTO.has(i.categoria))
      .filter((i) => i.data >= inicio && i.data <= fim)
      .filter((i) => !cat || i.categoria === cat || (semAcento(categoria) === "entrada" && i.entrada))
      .filter((i) => !termo || semAcento(`${i.descricao} ${i.pagamento}`).includes(termo))
      .sort((a, b) => b.data.localeCompare(a.data));

    const r = resumir(itens);
    const saldo = await this.saldoEmConta(agora);
    const previstos = (await this.todos()).filter((i) => PREVISTO.has(i.categoria)).sort((a, b) => a.data.localeCompare(b.data));
    const abertas = previstos.filter((i) => i.categoria === A_PAGAR);
    const aReceber = previstos.filter((i) => i.categoria === A_RECEBER);
    const LIMITE = 30;
    return {
      periodo: `${inicio} a ${fim}`,
      lancamentos: itens.length,
      // 08/11: o `entradas_menos_gastos` saiu. Ela leu "entrou 544,96, saiu
      // 202,93, sobra 342,03" — com a compra no crédito descontada de uma
      // conta de onde ela não saiu. O que ele tem é o saldo_em_conta.
      gastos: reais(r.gastos),
      no_cartao: r.noCartao ? `${reais(r.noCartao)} destes gastos foram no cartão: não saíram da conta, vão na fatura` : undefined,
      entradas: reais(r.entradas),
      saldo_em_conta: saldo,
      a_pagar: abertas.length
        ? abertas.map((i) => ({
            id: i.id, vence: ddmm(i.data), valor: reais(i.centavos), descricao: i.descricao,
            atrasada: i.data < hoje(agora) ? "já venceu: pergunte se ele pagou" : undefined,
          }))
        : undefined,
      a_receber: aReceber.length
        ? aReceber.map((i) => ({ id: i.id, dia: ddmm(i.data), valor: reais(i.centavos), descricao: i.descricao }))
        : undefined,
      quanto_sobra: await this.quantoSobra(saldo, previstos, vai_pagar, agora, dataDe(ate, agora)),
      por_categoria: r.porCategoria.map((c) => ({ categoria: c.categoria, total: reais(c.centavos), qtd: c.qtd })),
      itens: itens.slice(0, LIMITE).map((i) => ({
        id: i.id, data: i.data, valor: reais(i.centavos), categoria: i.categoria,
        descricao: i.descricao, pagamento: i.pagamento || undefined,
      })),
      mais: itens.length > LIMITE ? itens.length - LIMITE : undefined,
      vazio: itens.length ? undefined : "nenhum lançamento neste período — não invente valores",
    };
  }

  /// Quanto ele tem na conta corrente agora: o último Saldo que ele informou,
  /// mais as entradas, menos os gastos que saíram da conta depois dele.
  async saldoEmConta(agora) {
    const todos = [];
    for (const m of await this.meses()) todos.push(...(await this.lerMes(m)));
    const ate = hoje(agora);
    const linha = todos.filter((i) => i.data <= ate);
    let k = -1;
    for (let j = 0; j < linha.length; j++) if (linha[j].categoria === SALDO) k = j;
    if (k < 0) {
      return "sem ponto de partida: pergunte quanto ele tem na conta agora e lance com a categoria Saldo";
    }
    const base = linha[k];
    let c = base.centavos;
    const contados = [];
    for (const i of linha.slice(k + 1)) {
      if (i.categoria === SALDO || PREVISTO.has(i.categoria)) continue;
      if (FORA_DA_CONTA.test(i.pagamento || "")) continue;
      c += i.entrada ? i.centavos : -i.centavos;
      contados.push(`${i.entrada ? "+" : "−"}${reais(i.centavos).replace("R$ ", "")} ${i.descricao} (${quandoFoi(i.data, agora)})`);
    }
    return {
      valor: reais(c),
      como: `${reais(base.centavos)} informados ${quandoFoi(base.data, agora)}` + (contados.length ? `, ${contados.join(", ")}` : ", sem movimento depois"),
      // 07/11: ela somou o salário de novo a este saldo ("sobram R$ 653,70"
      // de uma conta que tinha 529,88). O aviso diz o que já está dentro.
      aviso:
        "Este saldo JÁ inclui tudo o que entrou e saiu (salário, dízimo, Pix, gastos). Para " +
        "\"quanto sobra depois de pagar X\": este valor menos X, e nada mais. Alelo e crédito não saem da conta.",
    };
  }

  /// "Quanto sobra depois de pagar a fatura?" — a conta inteira, feita aqui.
  ///
  /// 07/11, duas vezes no mesmo dia: com a calculadora na mão ela montou a
  /// conta errada. Primeiro "salário − dízimo − fatura − 30" e depois somou o
  /// saldo, que já tinha o salário dentro: "sobram R$ 653,70" de uma conta com
  /// 529,88. A calculadora acertou a soma; o erro era a FÓRMULA. Então a
  /// fórmula saiu da mão dela: o saldo vem do livro, ela só diz o que ainda vai
  /// sair, e o número final vem pronto.
  ///
  /// 08/11: as contas a pagar entram sozinhas; o vai_pagar é só o que não é
  /// conta lançada (guardar 30, um gasto que ele planeja).
  ///
  /// 08/11, de novo: "e no fim do mês, com o que vou receber dia 20?" Agora a
  /// resposta é uma linha do tempo do saldo, dia por dia, até o fim do mês: o
  /// que já aconteceu está no saldo de hoje, o que vence ou cai depois entra na
  /// data dele, e o dízimo de salário previsto entra sozinho. O que é do mês
  /// que vem aparece à parte e NÃO entra.
  ///
  /// 09/11: "quanto vou ter até o fim do ano?" — ela pegou os R$ 634,98 do fim
  /// de novembro, chamou de "o que sobra por mês", multiplicou e ainda somou o
  /// saldo de hoje, que já estava dentro: R$ 1.799,84. Com `ate` no futuro a
  /// linha do tempo vai até lá, e os meses seguintes vêm dos fixos.
  async quantoSobra(saldo, previstos, vaiPagar, agora, ate) {
    const mesAtual = hoje(agora).slice(0, 7);
    const fimDoMes = `${mesAtual}-31`;
    const horizonte = ate && ate > fimDoMes ? ate : fimDoMes;
    const gerados = [];
    if (horizonte > fimDoMes) {
      const fixos = await this.fixos();
      let [a, m] = mesAtual.split("-").map(Number);
      for (;;) {
        m++; if (m > 12) { m = 1; a++; }
        const mes = `${a}-${String(m).padStart(2, "0")}`;
        if (`${mes}-01` > horizonte) break;
        const ultimo = new Date(a, m, 0).getDate();
        for (const f of fixos) {
          const data = `${mes}-${String(Math.min(f.dia, ultimo)).padStart(2, "0")}`;
          if (data > horizonte) continue;
          // A fatura de dezembro já lançada (R$ 158,71) vale mais que o mínimo fixo.
          // Perto do mesmo dia: o salário do dia 5 lançado não apaga o fixo do dia 20.
          const jaTem = previstos.some((p) => p.data.slice(0, 7) === mes && p.categoria === f.categoria &&
            temEmComum(p.descricao, f.descricao) && Math.abs(Number(p.data.slice(8, 10)) - Math.min(f.dia, ultimo)) <= 5);
          if (!jaTem) gerados.push({ data, centavos: f.centavos, categoria: f.categoria, descricao: f.descricao, fixo: true });
        }
      }
    }
    const dentro = [...previstos.filter((i) => i.data <= horizonte), ...gerados].sort((x, y) => x.data.localeCompare(y.data));
    const depois = previstos.filter((i) => i.data > horizonte);
    const extras = (Array.isArray(vaiPagar) ? vaiPagar : vaiPagar != null ? [vaiPagar] : [])
      .map((v) => centavos(Math.abs(valorDe(v))))
      .filter((c) => Number.isFinite(c) && c > 0)
      // A conta já lançada não entra duas vezes se ela repetir o valor.
      .filter((c) => !previstos.some((a) => a.categoria === A_PAGAR && a.centavos === c));
    if (!dentro.length && !extras.length) return undefined;
    if (typeof saldo !== "object") {
      return "sem saldo de partida: pergunte quanto ele tem na conta agora e lance com a categoria Saldo";
    }
    let c = centavos(valorDe(saldo.valor));
    const passos = [`hoje: ${reais(c)} na conta`];
    const mexe = (delta, rotulo, quando) => {
      c += delta;
      passos.push(`${quando}: ${delta < 0 ? "−" : "+"} ${reais(Math.abs(delta))} ${rotulo} = ${reais(c)}`);
    };
    const doMes = dentro.filter((i) => i.data <= fimDoMes);
    const depoisDasContas = c - doMes.filter((i) => i.categoria === A_PAGAR).reduce((a, i) => a + i.centavos, 0);
    const porMes = [];
    let mesCorrente = mesAtual;
    const fechaMes = () => porMes.push(`fim de ${MESES[Number(mesCorrente.slice(5, 7)) - 1]}: ${reais(c)}`);
    for (const i of dentro) {
      if (i.data.slice(0, 7) !== mesCorrente) { fechaMes(); mesCorrente = i.data.slice(0, 7); }
      const quando = (i.data < hoje(agora) ? `${ddmm(i.data)} (atrasada)` : ddmm(i.data)) + (i.fixo ? " (fixo)" : "");
      if (i.categoria === A_PAGAR) mexe(-i.centavos, i.descricao, quando);
      else {
        mexe(i.centavos, i.descricao, quando);
        if (DO_TRABALHO.test(i.descricao)) mexe(-Math.round(i.centavos / 10), "dízimo (10%)", quando);
      }
    }
    for (const e of extras) mexe(-e, "que ele quer separar", "planejado");
    fechaMes();
    const temReceber = doMes.some((i) => i.categoria === A_RECEBER);
    const longe = horizonte > fimDoMes;
    return {
      valor: reais(c),
      ate: longe ? ddmm(horizonte) + "/" + horizonte.slice(0, 4) : "fim do mês",
      // "Quanto sobra depois da fatura?" é este; "no fim do mês" é o valor.
      depois_das_contas: temReceber ? `${reais(depoisDasContas)} (hoje menos as contas a pagar deste mês, sem contar o que vai receber)` : undefined,
      por_mes: longe ? porMes : undefined,
      linha_do_tempo: passos,
      mes_que_vem: depois.length
        ? depois.map((i) => `${ddmm(i.data)}: ${i.categoria === A_PAGAR ? "−" : "+"} ${reais(i.centavos)} ${i.descricao} (fora desta conta)`)
        : undefined,
      aviso:
        `valor é o que ele terá na conta em ${longe ? ddmm(horizonte) : "fim do mês"}, guardando tudo o que sobra: é o total ` +
        "juntado, NÃO some o saldo de hoje (já está dentro) nem multiplique. Diga como veio, sem refazer a conta. " +
        "Gastos lançados e o que já foi pago estão no saldo de hoje; compra no cartão e o Claude estão na fatura." +
        (longe ? " Os meses seguintes usam os fixos (salário, dízimo, fatura mínima): gasto novo no cartão aumenta a fatura e diminui isto." : "") +
        (c < 0 ? " NÃO FECHA: falta dinheiro — diga quanto falta." : ""),
    };
  }

  /// Relatório do mês em Markdown, para o criar_pdf. 08/11: ele pediu "um PDF
  /// com o relatório do mês e quanto posso guardar". Os números saem daqui,
  /// prontos — se ela escrevesse o relatório, cada soma seria uma chance de
  /// errar, e o PDF fica guardado com o erro dentro.
  async relatorio({ mes } = {}, agora = new Date()) {
    const alvo = /^\d{4}-\d{2}$/.test(String(mes || "").trim()) ? mes.trim() : hoje(agora).slice(0, 7);
    const [ano, m] = alvo.split("-");
    const nomeMes = `${MESES[Number(m) - 1]} de ${ano}`;
    const doMes = (await this.lerMes(alvo)).filter((i) => !PREVISTO.has(i.categoria) && i.categoria !== SALDO);
    const r = resumir(doMes);
    const entradas = doMes.filter((i) => i.entrada);
    const gastos = doMes.filter((i) => !i.entrada).sort((a, b) => a.data.localeCompare(b.data));
    const daConta = gastos.filter((i) => !FORA_DA_CONTA.test(i.pagamento || ""));
    const noCart = gastos.filter(noCartao);
    const noAlelo = gastos.filter((i) => ALELO.test(i.pagamento || ""));
    const soma = (l) => l.reduce((a, i) => a + i.centavos, 0);
    const saldo = await this.saldoEmConta(agora);
    const previstos = (await this.todos()).filter((i) => PREVISTO.has(i.categoria)).sort((a, b) => a.data.localeCompare(b.data));
    const ehAtual = alvo === hoje(agora).slice(0, 7);
    const sobra = ehAtual ? await this.quantoSobra(saldo, previstos, [], agora) : undefined;
    const fimC = sobra && typeof sobra === "object" ? centavos(valorDe(sobra.valor)) : typeof saldo === "object" && ehAtual ? centavos(valorDe(saldo.valor)) : null;

    // O que o mês deixa de sobra: tudo o que entra menos tudo o que sai da
    // conta, contando o que ainda vai entrar e vencer neste mês (e o dízimo).
    const prevMes = previstos.filter((i) => i.data.slice(0, 7) === alvo);
    const recebe = prevMes.filter((i) => i.categoria === A_RECEBER);
    const paga = prevMes.filter((i) => i.categoria === A_PAGAR);
    const dizimoPrev = recebe.filter((i) => DO_TRABALHO.test(i.descricao)).reduce((a, i) => a + Math.round(i.centavos / 10), 0);
    const ritmo = r.entradas + soma(recebe) - soma(daConta) - soma(paga) - dizimoPrev;

    const linha = (i) => `- ${ddmm(i.data)} · **${reais(i.centavos)}** · ${i.descricao}` + (i.pagamento ? ` · ${i.pagamento}` : "");
    const pct = (c) => (r.gastos ? ` (${Math.round((c / r.gastos) * 100)}%)` : "");
    const md = [
      `# Relatório de ${nomeMes}`,
      "",
      `*Feito em ${ddmm(hoje(agora))}/${hoje(agora).slice(0, 4)} com o que está lançado no controle de gastos.*`,
      "",
      "## Resumo",
      `- **Entrou:** ${reais(r.entradas)}` + (recebe.length ? ` (e ainda vai entrar ${reais(soma(recebe))})` : ""),
      `- **Gastou:** ${reais(r.gastos)}: ${reais(soma(daConta))} saíram da conta` +
        (noCart.length ? `, ${reais(soma(noCart))} no cartão` : "") + (noAlelo.length ? `, ${reais(soma(noAlelo))} no Alelo` : ""),
      ...(ehAtual && typeof saldo === "object" ? [`- **Na conta hoje:** ${saldo.valor}`] : []),
      ...(fimC != null ? [`- **Previsto para o fim do mês:** ${reais(fimC)}`] : []),
      "",
      "## Entradas",
      ...(entradas.length ? entradas.map(linha) : ["- nenhuma lançada"]),
      ...recebe.map((i) => `- ${ddmm(i.data)} · **${reais(i.centavos)}** · ${i.descricao} · *previsto*`),
      "",
      "## Gastos por categoria",
      ...(r.porCategoria.length
        ? r.porCategoria.map((c) => `- **${c.categoria}:** ${reais(c.centavos)}${pct(c.centavos)} · ${c.qtd} ${c.qtd === 1 ? "lançamento" : "lançamentos"}`)
        : ["- nada gasto"]),
      "",
      "## Todos os gastos",
      ...(gastos.length ? gastos.map(linha) : ["- nenhum"]),
      "",
      ...(noCart.length || previstos.some((i) => i.categoria === A_PAGAR)
        ? [
            "## Cartão e contas a pagar",
            ...(noCart.length ? [`- Compras no cartão neste mês: **${reais(soma(noCart))}**. Não saem da conta no dia; entram na fatura.`] : []),
            ...previstos.filter((i) => i.categoria === A_PAGAR).map((i) => `- Vence ${ddmm(i.data)}: **${reais(i.centavos)}** · ${i.descricao}`),
            "",
          ]
        : []),
      ...(sobra && typeof sobra === "object"
        ? ["## Até o fim do mês", ...sobra.linha_do_tempo.map((t) => `- ${t}`), ""]
        : []),
      "## Quanto dá para guardar",
    ];
    if (fimC != null) md.push(`- **Neste mês:** se nada mais for gasto, ficam **${reais(fimC)}** na conta no fim de ${MESES[Number(m) - 1]}. É isso que dá para guardar.`);
    if (ritmo > 0) {
      md.push(
        `- **O que ${MESES[Number(m) - 1]} deixa de sobra:** ${reais(ritmo)} (tudo o que entra no mês menos tudo o que sai da conta, com dízimo e fatura).`,
        "",
        `### Se todo mês for como ${MESES[Number(m) - 1]}`,
        `Guardando ${reais(ritmo)} por mês` + (fimC != null ? `, a partir dos ${reais(fimC)} do fim deste mês:` : ":"),
      );
      const base = fimC != null ? fimC : 0;
      for (const k of [3, 6, 12]) md.push(`- **Em ${k} meses:** ${reais(base + k * ritmo)}`);
      md.push("", "### Quanto tempo para juntar");
      for (const meta of [100000, 300000, 500000, 1000000]) {
        const falta = meta - base;
        const meses = falta <= 0 ? 0 : Math.ceil(falta / ritmo);
        md.push(`- **${reais(meta)}:** ${meses === 0 ? "já tem" : `${meses} ${meses === 1 ? "mês" : "meses"}`}`);
      }
      md.push(
        "",
        `Cada R$ 50 a menos de gasto por mês são ${reais(5000 * 12)} a mais em um ano.`,
        "",
        "*É uma projeção: supõe que entra e sai o mesmo que neste mês. Gasto novo, fatura maior ou salário diferente mudam a conta.*",
      );
    } else if (ritmo <= 0) {
      md.push(`- Neste mês sai mais do que entra: faltam ${reais(-ritmo)} para empatar. Antes de guardar, é preciso cortar gasto.`);
    }
    return { markdown: md.join("\n"), titulo: `Relatório de ${nomeMes}`, arquivo: `Relatorio de gastos ${alvo}.pdf` };
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
  let gastos = 0, entradas = 0, emCartao = 0, aPagar = 0;
  const mapa = new Map();
  for (const i of itens) {
    if (i.categoria === SALDO) continue;
    if (i.categoria === A_PAGAR) { aPagar += i.centavos; continue; }
    if (i.categoria === A_RECEBER) continue;
    if (i.entrada) { entradas += i.centavos; continue; }
    gastos += i.centavos;
    if (noCartao(i)) emCartao += i.centavos;
    const c = mapa.get(i.categoria) || { categoria: i.categoria, centavos: 0, qtd: 0 };
    c.centavos += i.centavos;
    c.qtd++;
    mapa.set(i.categoria, c);
  }
  const porCategoria = [...mapa.values()].sort((a, b) => b.centavos - a.centavos);
  return { gastos, entradas, porCategoria, noCartao: emCartao, aPagar };
}

module.exports = { Gastos, CATEGORIAS, A_PAGAR, A_RECEBER, PASTA_GASTOS, valorDe, categoriaDe, dataDe, reais };
