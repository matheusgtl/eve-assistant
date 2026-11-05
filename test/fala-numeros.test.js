// Número escrito vira número falado. 05/11: "R$ 327,64, vence dia 13" saiu
// estranho na voz — o modelo rápido não normaliza texto no plano dele.
const assert = require("node:assert");
const { numerosParaFala: f, porExtenso } = require("../falaNumeros.js");

assert.strictEqual(f("R$ 327,64"), "trezentos e vinte e sete reais e sessenta e quatro centavos");
assert.strictEqual(f("R$ 1,00"), "um real");
assert.strictEqual(f("R$ 0,50"), "cinquenta centavos");
assert.strictEqual(f("R$ 1.000"), "mil reais");
assert.strictEqual(f("vence dia 13"), "vence dia treze");
assert.strictEqual(f("hoje (05/11)"), "hoje (cinco de novembro)");
assert.strictEqual(f("01/05/2027"), "primeiro de maio de dois mil e vinte e sete");
assert.strictEqual(f("às 19h"), "às dezenove horas");
assert.strictEqual(f("às 19:20"), "às dezenove e vinte");
assert.strictEqual(f("10%"), "dez por cento");
assert.strictEqual(f("3,5"), "três vírgula cinco");
assert.strictEqual(porExtenso(1500), "mil e quinhentos");
assert.strictEqual(porExtenso(1234), "mil duzentos e trinta e quatro");
assert.strictEqual(porExtenso(2026), "dois mil e vinte e seis");
assert.strictEqual(porExtenso(100), "cem");
assert.strictEqual(porExtenso(101), "cento e um");
assert.strictEqual(porExtenso(1000000), "um milhão");
assert.strictEqual(f("sem número nenhum"), "sem número nenhum");
assert.strictEqual(f("99:99"), "noventa e nove:noventa e nove", "hora impossível não vira hora");

console.log("✓ fala de números: R$ 327,64 → trezentos e vinte e sete reais e sessenta e quatro centavos");
