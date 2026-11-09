// O controle de gastos: lançar, somar, consultar, apagar — e a tabela do mês
// continuar legível no Obsidian e editável à mão.

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Gastos, valorDe, categoriaDe, dataDe } = require("../gastos.js");
const { runTool, configurar, toolDefinitions } = require("../tools.js");
const { Memoria } = require("../memoria.js");

(async () => {
  // ------------------------------------------------ 1. o que ela manda, lido
  // É assim que ele fala, e é assim que o modelo repete.
  assert.strictEqual(valorDe("32,50"), 32.5);
  assert.strictEqual(valorDe("R$ 1.234,56"), 1234.56);
  assert.strictEqual(valorDe("1,234.56"), 1234.56);
  assert.strictEqual(valorDe("1.500"), 1500, "1.500 é mil e quinhentos, não um e meio");
  assert.strictEqual(valorDe("12.5"), 12.5);
  assert.strictEqual(valorDe(40), 40);
  assert.ok(Number.isNaN(valorDe("uns trinta")));

  assert.strictEqual(categoriaDe("alimentacao"), "Alimentação");
  assert.strictEqual(categoriaDe("gasolina"), "Carro");
  assert.strictEqual(categoriaDe("iFood"), "Alimentação");
  assert.strictEqual(categoriaDe("coisa nenhuma"), "Outros", "categoria inventada vai para Outros");
  assert.strictEqual(categoriaDe("qualquer", true), "Entrada");

  const agora = new Date(2026, 10, 4, 22, 30); // 04/11, 22h30 — em UTC já é dia 5
  assert.strictEqual(dataDe("", agora), "2026-11-04", "sem data é HOJE no relógio dele, não em UTC");
  assert.strictEqual(dataDe("03/11", agora), "2026-11-03");
  assert.strictEqual(dataDe("2026-10-31", agora), "2026-10-31");
  assert.strictEqual(dataDe("ontem", agora), null, "data em palavra é ela quem resolve");

  // ------------------------------------------------ 2. lançar e somar
  const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "ev-gastos-"));
  const livro = new Gastos({ pasta: cofre });

  const a = await livro.registrar({ valor: 32.5, descricao: "iFood", categoria: "Alimentação", pagamento: "Alelo" }, agora);
  assert.ok(a.ok && /^g[a-z0-9]+$/.test(a.id), "devolve o id, para poder apagar depois");
  await livro.registrar({ valor: "150,00", descricao: "gasolina", categoria: "Carro", data: "2026-11-02" }, agora);
  await livro.registrar({ valor: 17.5, descricao: "lanche", categoria: "comida" }, agora);
  await livro.registrar({ valor: 2000, descricao: "salário", categoria: "Entrada", data: "2026-11-01" }, agora);
  await livro.registrar({ valor: 90, descricao: "tênis", categoria: "Compras", data: "2026-10-28" }, agora);

  const nov = await livro.consultar({ mes: "2026-11" }, agora);
  assert.strictEqual(nov.lancamentos, 4);
  assert.strictEqual(nov.gastos, "R$ 200,00", "32,50 + 150 + 17,50 — a soma é do código");
  assert.strictEqual(nov.entradas, "R$ 2.000,00");
  assert.ok(!("entradas_menos_gastos" in nov), "08/11: o número que ela confundia com o saldo saiu");
  assert.deepStrictEqual(
    nov.por_categoria.map((c) => c.categoria),
    ["Carro", "Alimentação"],
    "o maior primeiro, e 'comida' entrou como Alimentação"
  );
  assert.strictEqual(nov.por_categoria[1].total, "R$ 50,00");

  // Sem período: o mês atual. Com de/até: cruza meses.
  assert.strictEqual((await livro.consultar({}, agora)).lancamentos, 4);
  const cruzado = await livro.consultar({ de: "2026-10-25", ate: "2026-11-02" }, agora);
  assert.strictEqual(cruzado.gastos, "R$ 240,00", "tênis de outubro + gasolina de novembro");
  assert.strictEqual((await livro.consultar({ mes: "2026-11", busca: "alelo" }, agora)).gastos, "R$ 32,50");
  assert.strictEqual((await livro.consultar({ mes: "2026-11", categoria: "carro" }, agora)).gastos, "R$ 150,00");
  const vazio = await livro.consultar({ mes: "2025-01" }, agora);
  assert.ok(vazio.vazio, "mês sem nada diz que não há nada, para ela não inventar");

  // ------------------------------------------------ 3. a tabela, no Obsidian
  const arquivo = path.join(cofre, "Gastos", "2026-11.md");
  let md = fs.readFileSync(arquivo, "utf8");
  assert.match(md, /^# Gastos de novembro de 2026$/m);
  assert.match(md, /\| 02\/11 \| 150,00 \| Carro \| gasolina \| — \|/);
  assert.match(md, /- Carro: R\$ 150,00 \(1\)/);
  assert.match(md, /\[\[fatos\/financas-do-matheus\]\]/, "o mês aponta para a nota das finanças");

  // Ele corrige uma linha à mão no Obsidian: vale na próxima conta.
  fs.writeFileSync(arquivo, md.replace("| 150,00 | Carro |", "| 120,00 | Carro |"));
  assert.strictEqual((await livro.consultar({ mes: "2026-11" }, agora)).gastos, "R$ 170,00", "a edição dele vale");

  // ------------------------------------------------ 4. apagar
  const apagado = await livro.apagar({ id: a.id });
  assert.ok(apagado.ok && /iFood/.test(apagado.apagado));
  assert.strictEqual((await livro.consultar({ mes: "2026-11" }, agora)).lancamentos, 3);
  assert.ok((await livro.apagar({ id: "gnada" })).erro);
  assert.ok(fs.existsSync(arquivo + ".bak"), "regravar o mês guarda a cópia anterior");

  // ------------------------------------------------ 5. recusas
  assert.ok((await livro.registrar({ valor: "uns trinta", descricao: "x" }, agora)).erro, "sem valor, pergunta");
  assert.ok((await livro.registrar({ valor: 10, descricao: " " }, agora)).erro);
  assert.ok((await livro.registrar({ valor: 10, descricao: "x", data: "semana passada" }, agora)).erro);

  // 05/11: o livro é do que JÁ aconteceu. Ela lançou estimativas do mês e o
  // salário do dia 20 no dia 4, e o mês abriu com R$ 659 que ele não gastou.
  const futuro = await livro.registrar({ valor: 409.88, descricao: "salário", categoria: "Entrada", data: "2026-11-20" }, agora);
  assert.match(futuro.erro || "", /ainda não chegou[\s\S]*financas-do-matheus/, "data futura é plano, e ela é mandada para a nota");
  const estimativa = await livro.registrar({ valor: 30, descricao: "Lazer - cinema (estimativa mês)", categoria: "Lazer" }, agora);
  assert.match(estimativa.erro || "", /é plano/, "estimativa não entra no livro");
  assert.ok((await livro.registrar({ valor: 30, descricao: "média de mercado", categoria: "Mercado" }, agora)).erro);
  assert.ok((await livro.registrar({ valor: 327.64, descricao: "Fatura Nubank (vence dia 13)", categoria: "Contas" }, agora)).ok,
    "fatura PAGA com o vencimento na descrição é gasto de verdade");

  // 05/11: "quanto tenho na conta agora?" — ela leu o saldo do LIVRO
  // (R$ 409,88 de um salário que não tinha caído). O saldo da conta parte do
  // último que ele informou, e só o que sai da conta conta.
  const conta = new Gastos({ pasta: fs.mkdtempSync(path.join(os.tmpdir(), "ev-conta-")) });
  const dia5 = new Date(2026, 10, 5, 19, 20);
  assert.match((await conta.consultar({}, dia5)).saldo_em_conta, /pergunte quanto ele tem/, "sem partida, ela pergunta");
  await conta.registrar({ valor: 50, descricao: "antes do saldo", categoria: "Lazer", data: "2026-11-04" }, dia5);
  await conta.registrar({ valor: 90.42, categoria: "Saldo", data: "2026-11-04" }, dia5);
  await conta.registrar({ valor: 10, descricao: "Pix de um amigo", categoria: "Entrada" }, dia5);
  await conta.registrar({ valor: 25, descricao: "almoço", categoria: "Alimentação", pagamento: "Alelo" }, dia5);
  await conta.registrar({ valor: 40, descricao: "tênis", categoria: "Compras", pagamento: "crédito Nubank" }, dia5);
  await conta.registrar({ valor: 5, descricao: "pão", categoria: "Mercado", pagamento: "Pix" }, dia5);
  const agoraNaConta = await conta.consultar({}, dia5);
  assert.strictEqual(agoraNaConta.saldo_em_conta.valor, "R$ 95,42", "90,42 + 10 − 5; Alelo, crédito e o gasto de antes não contam");
  assert.strictEqual(agoraNaConta.gastos, "R$ 120,00", "o Saldo não é gasto: 50 + 25 + 40 + 5");
  assert.strictEqual(agoraNaConta.entradas, "R$ 10,00", "nem entrada");
  assert.ok(!("saldo" in agoraNaConta), "o campo ambíguo `saldo` não volta");
  await conta.registrar({ valor: 100, categoria: "Saldo" }, dia5);
  assert.strictEqual((await conta.consultar({}, dia5)).saldo_em_conta.valor, "R$ 100,00", "o último saldo informado manda");

  // 07/11: o dízimo do pagamento que ele acabou de contar não foi lançado.
  // O lembrete vem no resultado, com o valor exato.
  const pago = await conta.registrar({ valor: 534.96, descricao: "pagamento", categoria: "Entrada" }, dia5);
  assert.match(pago.lembrar || "", /R\$ 53,50/, "10% de 534,96 é 53,50 (ela tinha escrito 53,49)");
  assert.strictEqual((await conta.registrar({ valor: 5, descricao: "pão", categoria: "Mercado" }, dia5)).lembrar, undefined, "gasto não lembra dízimo");

  // 07/11: "quanto sobra depois de pagar a fatura?" — ela somou o salário
  // ao saldo que já o tinha e disse R$ 653,70. A conta agora vem pronta.
  const real = new Gastos({ pasta: fs.mkdtempSync(path.join(os.tmpdir(), "ev-sobra-")) });
  const dia7 = new Date(2026, 10, 7, 13, 53);
  await real.registrar({ valor: 90.42, categoria: "Saldo", data: "2026-11-04" }, dia7);
  await real.registrar({ valor: 10, descricao: "Pix de amigo", categoria: "Entrada", data: "2026-11-05" }, dia7);
  await real.registrar({ valor: 534.96, descricao: "pagamento", categoria: "Entrada", data: "2026-11-06" }, dia7);
  await real.registrar({ valor: 53.5, descricao: "dízimo", categoria: "Igreja", data: "2026-11-06" }, dia7);
  for (const v of [10, 22, 20]) await real.registrar({ valor: v, descricao: "pix", categoria: "Outros", pagamento: "Pix" }, dia7);
  const sobra = (await real.consultar({ vai_pagar: [327.64] }, dia7)).quanto_sobra;
  assert.strictEqual(sobra.valor, "R$ 202,24", "529,88 − 327,64; não os 653,70 que ela disse");
  assert.deepStrictEqual(sobra.linha_do_tempo, ["hoje: R$ 529,88 na conta", "planejado: − R$ 327,64 que ele quer separar = R$ 202,24"]);
  const falta = (await real.consultar({ vai_pagar: [600] }, dia7)).quanto_sobra;
  assert.match(falta.aviso, /NÃO FECHA/, "quando não fecha, ela é avisada");
  assert.strictEqual((await real.consultar({}, dia7)).quanto_sobra, undefined, "sem vai_pagar, nada");

  // 08/11: "fiz uma compra no crédito, 97,43 em 2 vezes; agora tenho 376,36
  // de fatura, quanto vai sobrar?" — ela usou a fatura VELHA (327,64, de uma
  // nota) e descontou a compra no crédito da conta. Agora a fatura é conta A
  // pagar no livro, o valor novo substitui o velho, e o cartão não sai da conta.
  const dia8 = new Date(2026, 10, 8, 1, 32);
  const velha = await real.registrar({ valor: 327.64, descricao: "Fatura Nubank", categoria: "A pagar", data: "2026-11-13" }, dia8);
  assert.ok(velha.ok, JSON.stringify(velha));
  const nova = await real.registrar({ valor: 376.36, descricao: "Fatura do Nubank", categoria: "A pagar", data: "2026-11-13" }, dia8);
  assert.match(nova.substituiu || "", /327,64/, "fatura nova substitui a velha, não soma");
  const compra = await real.registrar({ valor: 97.43, descricao: "compra", categoria: "Compras", pagamento: "crédito", parcelas: 2 }, dia8);
  assert.deepStrictEqual(compra.parcelas, ["1ª R$ 48,72", "2ª R$ 48,71"], "as parcelas somam a compra, centavo por centavo");
  assert.match(compra.lembrar, /NÃO sai da conta/);
  const oito = await real.consultar({}, dia8);
  assert.strictEqual(oito.saldo_em_conta.valor, "R$ 529,88", "a compra no crédito não sai da conta");
  assert.strictEqual(oito.a_pagar.length, 1);
  assert.strictEqual(oito.a_pagar[0].valor, "R$ 376,36");
  assert.strictEqual(oito.quanto_sobra.valor, "R$ 153,52", "529,88 − 376,36, sem ela precisar pedir");
  assert.match(oito.no_cartao, /97,43/);
  assert.strictEqual((await real.consultar({ vai_pagar: [30] }, dia8)).quanto_sobra.valor, "R$ 123,52", "e guardando 30");
  assert.strictEqual((await real.consultar({ vai_pagar: [376.36] }, dia8)).quanto_sobra.valor, "R$ 153,52",
    "repetir a fatura no vai_pagar não desconta duas vezes");
  assert.ok((await real.registrar({ valor: 50, descricao: "cinema (estimativa)", categoria: "A pagar", data: "2026-11-20" }, dia8)).erro,
    "estimativa não vira conta a pagar");
  // 08/11, de novo: "com o que vou receber dia 20, quanto tenho no fim do
  // mês?" — ela deu −R$ 229,83 e depois +R$ 879,34. A linha do tempo vem pronta.
  const prev = await real.registrar({ valor: 534.96, descricao: "2ª parcela do salário", categoria: "A receber", data: "2026-11-20" }, dia8);
  assert.ok(prev.ok, JSON.stringify(prev));
  await real.registrar({ valor: 158.71, descricao: "Fatura Nubank", categoria: "A pagar", data: "2026-12-13" }, dia8);
  const fim = (await real.consultar({}, dia8)).quanto_sobra;
  assert.strictEqual(fim.valor, "R$ 634,98", "529,88 − 376,36 + 534,96 − 53,50 de dízimo");
  assert.deepStrictEqual(fim.linha_do_tempo, [
    "hoje: R$ 529,88 na conta",
    "13/11: − R$ 376,36 Fatura do Nubank = R$ 153,52",
    "20/11: + R$ 534,96 2ª parcela do salário = R$ 688,48",
    "20/11: − R$ 53,50 dízimo (10%) = R$ 634,98",
  ]);
  assert.match(fim.depois_das_contas, /^R\$ 153,52/, "depois da fatura, antes do salário");
  assert.match(fim.mes_que_vem[0], /13\/12: − R\$ 158,71 Fatura Nubank \(fora desta conta\)/,
    "a fatura de dezembro não é a de novembro: substitui só no mesmo mês, e não entra na conta deste");
  // 08/11: "um PDF com o relatório do meu mês e quanto posso guardar". Os
  // números saem do livro, não dela.
  const rel = (await real.relatorio({}, dia8)).markdown;
  assert.match(rel, /^# Relatório de novembro de 2026$/m);
  assert.match(rel, /R\$ 105,50 saíram da conta, R\$ 97,43 no cartão/, "cartão separado da conta");
  assert.match(rel, /Previsto para o fim do mês:\*\* R\$ 634,98/);
  assert.match(rel, /deixa de sobra:\*\* R\$ 544,56/, "544,96 + 534,96 − 105,50 − 376,36 − 53,50");
  assert.match(rel, /Em 12 meses:\*\* R\$ 7\.169,70/, "634,98 + 12 × 544,56");
  assert.match(rel, /R\$ 10\.000,00:\*\* 18 meses/);
  assert.ok(!/\|/.test(rel), "sem tabela: o PDF não desenha tabela");

  // 09/11: "quanto vou ter até o fim do ano?" — ela disse R$ 1.799,84
  // (multiplicou o fim de novembro e somou o saldo de hoje, que já estava
  // dentro). Com `ate`, a linha do tempo vai até lá usando os fixos.
  fs.writeFileSync(path.join(real.pasta, "fixos.md"), [
    "| dia | valor | tipo | descrição |", "|---|---|---|---|",
    "| 5 | 534,96 | A receber | 1ª parcela do salário |",
    "| 7 | 22,00 | A pagar | Ajuda no app de música da igreja |",
    "| 13 | 110,00 | A pagar | Fatura Nubank (mínimo) |",
    "| 20 | 534,96 | A receber | 2ª parcela do salário |",
  ].join("\n"));
  const ano = (await real.consultar({ ate: "2026-12-31" }, dia8)).quanto_sobra;
  assert.deepStrictEqual(ano.por_mes, ["fim de novembro: R$ 634,98", "fim de dezembro: R$ 1.417,19"]);
  assert.strictEqual(ano.valor, "R$ 1.417,19", "634,98 + 2 × (534,96 − 53,50) − 22 − 158,71");
  assert.ok(ano.linha_do_tempo.some((l) => /13\/12: − R\$ 158,71/.test(l)), "a fatura de dezembro lançada vale, não o mínimo fixo");
  assert.ok(!ano.linha_do_tempo.some((l) => /13\/12 \(fixo\)/.test(l)));
  assert.strictEqual((await real.consultar({}, dia8)).quanto_sobra.valor, "R$ 634,98", "sem `ate`, só até o fim do mês");
  fs.rmSync(path.join(real.pasta, "fixos.md"));

  // O salário cai com outro nome e outro valor: o previsto sai sozinho.
  const dia20 = new Date(2026, 10, 20, 10);
  const caiu = await real.registrar({ valor: 540, descricao: "caiu o pagamento", categoria: "Entrada" }, dia20);
  assert.match(caiu.quitou || "", /2ª parcela/, "não conta o salário duas vezes");
  await real.registrar({ valor: 54, descricao: "dízimo", categoria: "Igreja" }, dia20);
  assert.strictEqual((await real.consultar({}, dia20)).a_receber, undefined);
  for (const i of (await real.consultar({}, dia20)).a_pagar) if (i.vence === "13/12") await real.apagar({ id: i.id });
  await real.apagar({ id: caiu.id });
  for (const i of (await real.consultar({ busca: "dízimo" }, dia20)).itens) if (i.data === "2026-11-20") await real.apagar({ id: i.id });

  // Ele paga a fatura: sai das contas a pagar sozinha, e sai da conta.
  const dia13 = new Date(2026, 10, 13, 9);
  const paga = await real.registrar({ valor: 376.36, descricao: "paguei a fatura do Nubank", categoria: "Contas", pagamento: "Pix" }, dia13);
  assert.match(paga.quitou || "", /Fatura do Nubank/);
  // 09/11: depois de "paguei minha fatura" ela disse o saldo de antes. O novo vem junto.
  assert.strictEqual(paga.agora_na_conta, "R$ 153,52", "o saldo novo vem no próprio lançamento");
  const treze = await real.consultar({}, dia13);
  assert.strictEqual(treze.a_pagar, undefined, "paga, não está mais a pagar");
  assert.strictEqual(treze.saldo_em_conta.valor, "R$ 153,52");
  assert.strictEqual(treze.quanto_sobra, undefined);
  // Pagar algo com o mesmo nome em outra coisa não quita conta errada: o
  // "conta" do "paguei a conta de luz" não é a fatura.
  await real.registrar({ valor: 120, descricao: "Conta de luz", categoria: "A pagar", data: "2026-11-20" }, dia13);
  assert.strictEqual((await real.registrar({ valor: 30, descricao: "paguei a conta do celular", categoria: "Contas" }, dia13)).quitou, undefined);

  // ------------------------------------------------ 6. pelas ferramentas
  // O livro mora no cofre da memória, e a pasta Gastos não entra no índice:
  // cada mês viraria uma linha que viaja em toda pergunta.
  const memoria = new Memoria({ pasta: cofre });
  configurar({ memoria, gastos: null });
  const r = JSON.parse(await runTool("registrar_gasto", { valor: 25, descricao: "uber", categoria: "Transporte" }));
  assert.ok(r.ok, JSON.stringify(r));
  const c = JSON.parse(await runTool("consultar_gastos", { categoria: "Transporte" }));
  assert.ok(c.gastos.includes("25,00"), JSON.stringify(c));
  const indice = await memoria.indice();
  assert.ok(!indice.some((i) => i.nome.startsWith("Gastos/")), "o livro de gastos não entra no índice da memória");

  const def = toolDefinitions.find((t) => t.name === "registrar_gasto");
  assert.ok(def.input_schema.properties.categoria.enum.includes("Entrada"), "entrada é uma categoria");
  assert.ok(def.input_schema.properties.categoria.enum.includes("A pagar"), "conta a vencer é uma categoria");

  fs.rmSync(cofre, { recursive: true, force: true });
  console.log("✓ gastos: lançar, somar no código, consultar por mês/período/categoria, apagar");
  console.log("   \"1.500\" → 1500 · \"comida\" → Alimentação · sem data às 22h30 → hoje, não amanhã");
  console.log("   tabela do mês editada à mão no Obsidian → vale na conta seguinte");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
