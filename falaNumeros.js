// falaNumeros.js — número escrito vira número FALADO, em português.
//
// 05/11: "A fatura do Nubank de novembro é R$ 327,64, vence dia 13" saiu com
// um jeito estranho na voz. O modelo rápido da ElevenLabs (flash v2.5) não
// normaliza texto no plano dele — a própria API diz que isso é só no
// Enterprise —, então "327,64" chega cru e a voz, que é inglesa, improvisa a
// leitura. Escrever por extenso antes de mandar tira a dúvida da voz: palavra
// portuguesa ela sabe falar.

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function ate999(n) {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10;
    return DEZENAS[d] + (u ? " e " + UNIDADES[u] : "");
  }
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), resto = n % 100;
  return CENTENAS[c] + (resto ? " e " + ate999(resto) : "");
}

/// Inteiro por extenso: 1500 → "mil e quinhentos", 1234 → "mil duzentos e
/// trinta e quatro", 2026 → "dois mil e vinte e seis".
function porExtenso(n) {
  n = Math.floor(Math.abs(n));
  if (n < 1000) return ate999(n);
  const grupos = [];
  const nomes = [
    ["", ""],
    ["mil", "mil"],
    ["milhão", "milhões"],
    ["bilhão", "bilhões"],
  ];
  let i = 0;
  while (n > 0 && i < nomes.length) {
    grupos.push({ valor: n % 1000, nivel: i });
    n = Math.floor(n / 1000);
    i++;
  }
  const partes = grupos
    .filter((g) => g.valor)
    .reverse()
    .map((g) => {
      if (g.nivel === 0) return ate999(g.valor);
      if (g.nivel === 1) return g.valor === 1 ? "mil" : `${ate999(g.valor)} mil`;
      const [um, varios] = nomes[g.nivel];
      return `${ate999(g.valor)} ${g.valor === 1 ? um : varios}`;
    });
  // O "e" antes do último grupo só entra quando ele é pequeno ou redondo:
  // "mil e quinhentos", "mil e vinte", mas "mil duzentos e trinta".
  const ultimo = grupos[0].valor;
  if (partes.length > 1 && ultimo && (ultimo < 100 || ultimo % 100 === 0)) {
    const fim = partes.pop();
    return partes.join(" ") + " e " + fim;
  }
  return partes.join(" ");
}

const inteiroDe = (t) => Number(String(t).replace(/\./g, ""));

function dinheiro(inteiro, centavos) {
  const reais = inteiroDe(inteiro);
  const cents = centavos ? Number(centavos.padEnd(2, "0").slice(0, 2)) : 0;
  const parteReais = reais ? `${porExtenso(reais)} ${reais === 1 ? "real" : "reais"}` : "";
  const parteCents = cents ? `${porExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}` : "";
  if (parteReais && parteCents) return `${parteReais} e ${parteCents}`;
  return parteReais || parteCents || "zero reais";
}

/// Troca, num texto que vai ser falado, o que é número pelo que se fala.
/// Ordem importa: dinheiro e data antes do número solto.
function numerosParaFala(texto) {
  return String(texto || "")
    // R$ 1.234,56 · R$ 10 · R$10,5
    .replace(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (_, i, c) => dinheiro(i, c))
    // 05/11/2026 · 5/11
    .replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (m, d, mes, ano) => {
      const nm = MESES[Number(mes) - 1];
      if (!nm || Number(d) < 1 || Number(d) > 31) return m;
      const dia = Number(d) === 1 ? "primeiro" : porExtenso(Number(d));
      const a = ano ? ` de ${porExtenso(Number(ano.length === 2 ? "20" + ano : ano))}` : "";
      return `${dia} de ${nm}${a}`;
    })
    // 19:20 · 9h30 · 19h
    .replace(/\b(\d{1,2})(?::|h)(\d{2})\b/g, (m, h, min) =>
      Number(h) > 23 || Number(min) > 59 ? m : `${porExtenso(Number(h))}${Number(min) ? " e " + porExtenso(Number(min)) : " horas"}`
    )
    .replace(/\b(\d{1,2})h\b/g, (m, h) => (Number(h) > 23 ? m : `${porExtenso(Number(h))} ${Number(h) === 1 ? "hora" : "horas"}`))
    // 10% · 2,5%
    .replace(/(\d+)(?:,(\d+))?\s?%/g, (_, i, d) => `${porExtenso(Number(i))}${d ? " vírgula " + porExtenso(Number(d)) : ""} por cento`)
    // 1.500 · 3,5 · 42
    .replace(/\b(\d{1,3}(?:\.\d{3})+|\d+),(\d+)\b/g, (_, i, d) => `${porExtenso(inteiroDe(i))} vírgula ${porExtenso(Number(d))}`)
    .replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (m) => porExtenso(inteiroDe(m)))
    .replace(/\b\d{1,12}\b/g, (m) => (m.length > 1 && m.startsWith("0") ? m.split("").map((x) => UNIDADES[x]).join(" ") : porExtenso(Number(m))));
}

module.exports = { numerosParaFala, porExtenso };
