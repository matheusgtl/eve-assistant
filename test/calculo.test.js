// calcular: a conta é do código. 04/11, ela escreveu 41,25 + 90,42 = 138,67
// num plano para ele guardar dinheiro, e o erro desceu a tabela inteira.
const assert = require("node:assert");
const { calcular } = require("../calculo.js");
const { runTool } = require("../tools.js");

(async () => {
  // O plano de 04/11, refeito com rótulos — as linhas usam a de cima.
  const r = calcular(
    "dizimo = 409,88 * 10%\n" +
      "sobra da parcela = 409,88 - 327,64 - dizimo\n" +
      "total = sobra da parcela + 90,42\n" +
      "guardar = 30; livre = total - guardar"
  );
  const v = Object.fromEntries(r.resultados.map((x) => [x.rotulo, x.em_reais]));
  assert.strictEqual(v.dizimo, "R$ 40,99");
  assert.strictEqual(v["sobra da parcela"], "R$ 41,25");
  assert.strictEqual(v.total, "R$ 131,67", "o número que ela errou: eram 131,67, não 138,67");
  assert.strictEqual(v.livre, "R$ 101,67");

  // Os formatos que ele e o modelo escrevem.
  const um = (c) => calcular(c).resultados[0].resultado;
  assert.strictEqual(um("R$ 1.234,56 + 0,44"), 1235);
  assert.strictEqual(um("819,76 x 10%"), 81.976);
  assert.strictEqual(um("1.500 / 3"), 500);
  assert.strictEqual(um("(2 + 3) × 2"), 10);
  assert.strictEqual(um("-5 + 10"), 5);
  assert.strictEqual(um("0.1 + 0.2"), 0.3, "sem o 0,30000000000000004 do ponto flutuante");

  // Recusas: nunca executa código, e diz onde errou.
  assert.match(calcular("2 +").erro, /termina no meio/);
  assert.match(calcular("process.exit(1)").erro, /não entendi|não é número/);
  assert.match(calcular("1 / 0").erro, /divisão por zero/);
  assert.match(calcular("sobra + 1").erro, /rótulo/);
  assert.ok(calcular("").erro);

  const pelaFerramenta = JSON.parse(await runTool("calcular", { conta: "a = 2; a * 3" }));
  assert.strictEqual(pelaFerramenta.resultados[1].resultado, 6);

  console.log("✓ calcular: o plano de 04/11 refeito dá R$ 131,67, não os 138,67 que ela disse");
  console.log("   1.500 é mil e quinhentos · 10% é 0,10 · rótulo com espaço vale na linha seguinte");
})().catch((e) => { console.error(e); process.exit(1); });
