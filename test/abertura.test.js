// abertura.test.js — a animação da primeira abertura do dia, sem navegador.
// Roda o renderer/abertura.js de verdade com DOM e canvas falsos e confere:
// o conjunto (esfera + texto) fica centrado na janela, nada sai inválido, e
// ela termina sozinha em menos de 3 s (26/11: a primeira versão, com 4,6 s e a
// esfera a 40% da altura, ficou longa e descentrada).
// Rode com: node test/abertura.test.js

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const L = 1200;
const A = 800;
const arcos = [];
let curvas = 0;
const ctx = {
  setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, stroke() {}, fill() {},
  lineTo(x, y) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `linha inválida ${x},${y}`);
  },
  arc(x, y, r) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && r >= 0, `arco inválido ${x},${y},${r}`);
    arcos.push({ x, y, r });
  },
  createRadialGradient(...v) {
    v.forEach((n) => assert.ok(Number.isFinite(n), "gradiente inválido"));
    return { addColorStop() {} };
  },
  set fillStyle(v) {
    assert.ok(!/NaN|undefined/.test(String(v)), `cor inválida ${v}`);
  },
  set strokeStyle(v) {
    assert.ok(!/NaN|undefined/.test(String(v)), `cor inválida ${v}`);
  },
  set lineWidth(v) {},
  // As ligações são curvas desde 26/11: o controle e o fim também têm de ser números.
  quadraticCurveTo(...v) {
    v.forEach((n) => assert.ok(Number.isFinite(n), "curva inválida"));
    curvas++;
  },
};

function elemento(tag) {
  const el = {
    tag, style: { cssText: "" }, filhos: [], ouvintes: {},
    append(...f) { this.filhos.push(...f); },
    appendChild(f) { this.filhos.push(f); },
    setAttribute() {},
    addEventListener(ev, fn) { this.ouvintes[ev] = fn; },
    remove() { this.removido = true; },
  };
  if (tag === "canvas") {
    el.clientWidth = L;
    el.clientHeight = A;
    el.getContext = () => ctx;
  }
  return el;
}

let quadro = null;
let agora = 0;
const timers = [];
const corpo = elemento("body");
global.performance = { now: () => agora };
global.requestAnimationFrame = (fn) => (quadro = fn);
global.setTimeout = (fn, ms) => timers.push({ fn, ms });
global.getComputedStyle = () => ({ getPropertyValue: (v) => ({ "--ac": "#5cc8ff", "--fundo": "#0e1013", "--texto": "#ececec" })[v] || "" });
global.document = {
  visibilityState: "visible",
  documentElement: {},
  body: corpo,
  createElement: elemento,
  addEventListener() {},
};
global.window = {
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  ev: {
    abertura: async () => ({ mostrar: true, saudacao: "Bom dia, Teste", data: "quinta-feira, 26 de novembro", rodape: "340 neurônios", neuronios: 340, nasceram: 6 }),
  },
};

eval(fs.readFileSync(path.join(__dirname, "..", "renderer", "abertura.js"), "utf8"));

(async () => {
  await new Promise((r) => setImmediate(r));
  const camada = corpo.filhos[0];
  assert.ok(camada, "a camada da abertura não apareceu");
  const [canvas, bloco] = camada.filhos;
  assert.strictEqual(canvas.tag, "canvas");

  // roda até ela terminar sozinha, de 1/60 s em 1/60 s
  let fim = null;
  for (let i = 0; i < 60 * 6 && quadro; i++) {
    const fn = quadro;
    quadro = null;
    agora = i * (1000 / 60);
    arcos.length = 0;
    fn(agora);
    if (camada.style.opacity === "0") {
      fim = agora;
      break;
    }
  }
  assert.ok(fim !== null, "a animação não terminou sozinha");
  assert.ok(fim < 3000, `durou ${fim} ms: devia ser curta (menos de 3 s)`);
  assert.ok(fim > 1500, `durou ${fim} ms: rápida demais para ler o texto`);
  assert.strictEqual(bloco.style.opacity, "1", "o bom dia apareceu antes do fim");

  // centralização: o último quadro é a esfera fechada; o meio do conjunto
  // (do alto da esfera ao fim do texto) tem de ser o meio da janela.
  const pontos = arcos.filter((a) => a.r < 5);
  const xs = pontos.map((a) => a.x);
  const ys = pontos.map((a) => a.y);
  const centroX = (Math.min(...xs) + Math.max(...xs)) / 2;
  assert.ok(Math.abs(centroX - L / 2) < L * 0.04, `esfera fora do centro na horizontal: ${centroX.toFixed(0)} de ${L}`);
  const topoEsfera = Math.min(...ys);
  const fimTexto = parseFloat(bloco.style.top) + 92;
  const meio = (topoEsfera + fimTexto) / 2;
  assert.ok(Math.abs(meio - A / 2) < A * 0.06, `conjunto fora do centro na vertical: meio em ${meio.toFixed(0)} de ${A}`);

  assert.ok(curvas > 100, `as ligações deviam ser curvas: só ${curvas} curvas desenhadas`);
  console.log(`✓ abertura: ${curvas} curvas · termina em ${(fim / 1000).toFixed(2)} s · centro do conjunto ${centroX.toFixed(0)},${meio.toFixed(0)} numa janela ${L}×${A}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
