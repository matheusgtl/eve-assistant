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
  assert.strictEqual(nov.saldo, "R$ 1.800,00");
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

  fs.rmSync(cofre, { recursive: true, force: true });
  console.log("✓ gastos: lançar, somar no código, consultar por mês/período/categoria, apagar");
  console.log("   \"1.500\" → 1500 · \"comida\" → Alimentação · sem data às 22h30 → hoje, não amanhã");
  console.log("   tabela do mês editada à mão no Obsidian → vale na conta seguinte");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
