// calculo.js — conta de verdade, para ela não fazer de cabeça.
//
// 04/11, 23:50: o plano do mês dele saiu com R$ 409,88 − 327,64 − 40,99 =
// 41,25 (certo) e, na linha de baixo, 41,25 + 90,42 = 138,67 (são 131,67).
// O erro desceu a tabela inteira: "total para usar no mês R$ 507,56" (500,56),
// "o que sobra R$ 10,25" (11,25). Dito com toda a confiança, num plano para
// ele GUARDAR dinheiro. Modelo de linguagem não soma; quem soma é isto.
//
// Sem eval: um analisador pequeno que só conhece número, + − × ÷, %, parênteses
// e os rótulos das linhas anteriores. Nada mais passa.

const { valorDe } = require("./gastos.js");

const semAcento = (t) =>
  String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, "_");

function tokens(texto) {
  const lista = [];
  const re = /\s*(?:(\d[\d.,]*)|([A-Za-zÀ-ÖØ-öø-ÿ_][\wÀ-ÖØ-öø-ÿ]*)|(\*\*|[-+*/×÷x%()^]))/gy;
  let pos = 0;
  const limpo = String(texto).replace(/R\$\s*/gi, "");
  while (pos < limpo.length) {
    re.lastIndex = pos;
    const m = re.exec(limpo);
    if (!m) {
      if (!limpo.slice(pos).trim()) break;
      throw new Error(`não entendi "${limpo.slice(pos).trim().slice(0, 15)}"`);
    }
    pos = re.lastIndex;
    if (m[1]) {
      // "409,88." no fim de frase: o ponto final não é casa decimal.
      const n = valorDe(m[1].replace(/[.,]$/, ""));
      if (!Number.isFinite(n)) throw new Error(`número ilegível: ${m[1]}`);
      lista.push({ t: "n", v: n });
    } else if (m[2]) {
      // "x" entre números é vezes; o resto é rótulo de uma linha anterior.
      lista.push(m[2] === "x" ? { t: "op", v: "*" } : { t: "id", v: semAcento(m[2]) });
    } else {
      const op = { "×": "*", x: "*", "÷": "/", "**": "^" }[m[3]] || m[3];
      lista.push({ t: "op", v: op });
    }
  }
  return lista;
}

function avaliar(texto, nomes) {
  // Rótulo com espaço ("sobra do salário") vira um nome só antes de quebrar
  // em pedaços; senão seriam três palavras soltas que não são número.
  let conta = String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const nome of Object.keys(nomes).sort((a, b) => b.length - a.length)) {
    const padrao = nome.split("_").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s_]+");
    conta = conta.replace(new RegExp(`(^|[^\\w])${padrao}(?![\\w])`, "g"), `$1${nome}`);
  }
  const ts = tokens(conta);
  let i = 0;
  const ver = () => ts[i];
  const pega = (v) => (ts[i]?.t === "op" && ts[i].v === v ? (i++, true) : false);

  function primario() {
    const t = ts[i++];
    if (!t) throw new Error("a conta termina no meio");
    if (t.t === "n") return t.v;
    if (t.t === "id") {
      if (!(t.v in nomes)) throw new Error(`"${t.v}" não é número nem rótulo de uma linha anterior`);
      return nomes[t.v];
    }
    if (t.v === "(") {
      const v = soma();
      if (!pega(")")) throw new Error("falta fechar parêntese");
      return v;
    }
    if (t.v === "-") return -fator();
    if (t.v === "+") return fator();
    throw new Error(`"${t.v}" fora do lugar`);
  }
  function fator() {
    let v = primario();
    // 10% vira 0,10. "10% de 409,88" o modelo escreve como "10% * 409,88".
    while (pega("%")) v /= 100;
    if (pega("^")) v = Math.pow(v, fator());
    return v;
  }
  function produto() {
    let v = fator();
    for (;;) {
      if (pega("*")) v *= fator();
      else if (pega("/")) {
        const d = fator();
        if (d === 0) throw new Error("divisão por zero");
        v /= d;
      } else return v;
    }
  }
  function soma() {
    let v = produto();
    for (;;) {
      if (pega("+")) v += produto();
      else if (pega("-")) v -= produto();
      else return v;
    }
  }
  const v = soma();
  if (ver()) throw new Error(`sobrou "${ver().v}" no fim da conta`);
  return v;
}

const emReais = (v) =>
  (v < 0 ? "-" : "") +
  "R$ " +
  Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/// Uma ou várias contas, separadas por linha ou ";". Cada uma pode ter rótulo
/// ("sobra = 409,88 - 327,64"), e as seguintes podem usar o rótulo — é assim
/// que um plano de mês se escreve sem ela copiar número de uma linha à outra,
/// que foi exatamente onde o erro de 04/11 entrou.
function calcular(texto) {
  const linhas = String(texto || "").split(/[;\n]+/).map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return { erro: "mande a conta, por exemplo: sobra = 409,88 - 327,64" };
  const nomes = {};
  const resultados = [];
  for (const linha of linhas) {
    const m = linha.match(/^([A-Za-zÀ-ÿ_][\wÀ-ÿ ]{0,40}?)\s*[=:]\s*(.+)$/);
    const rotulo = m ? m[1].trim() : null;
    const conta = m ? m[2] : linha;
    try {
      const v = Math.round(avaliar(conta, nomes) * 1e6) / 1e6;
      if (rotulo) nomes[semAcento(rotulo)] = v;
      resultados.push({ rotulo: rotulo || undefined, conta: conta.trim(), resultado: v, em_reais: emReais(v) });
    } catch (err) {
      return { erro: `na linha "${linha}": ${err.message}`, feitas: resultados.length ? resultados : undefined };
    }
  }
  return { resultados, aviso: "Use estes números como estão; não refaça a conta de cabeça." };
}

module.exports = { calcular, avaliar };
