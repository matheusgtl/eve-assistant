// esfera.test.js — valida a esfera holográfica sem abrir navegador.
// Executa o esfera.js de verdade com um canvas falso e inspeciona o que ele
// manda desenhar: geometria válida, paletas por estado e custo de pintura.
// Rode com: node test/esfera.test.js

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

// Sorteio com semente: a esfera e a rede usam Math.random (geometria, ruído,
// disparos). Com ele fixo o teste mede sempre o mesmo quadro, e um limite
// como o de pinturas não passa num dia e falha no outro (26/11: falhou 1 em 3
// rodadas, com 60 pinturas contra o teto de 60, só por sorteio).
{
  let a = 20261126;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chamadas = { arcos: 0, segmentos: 0, gradientes: 0, pinturas: 0, cores: new Set() };

const ctxFalso = {
  setTransform() {},
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {
    chamadas.segmentos++;
  },
  stroke() {
    chamadas.pinturas++;
  },
  arc(x, y, r) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `coordenada inválida: ${x},${y}`);
    assert.ok(r >= 0 && Number.isFinite(r), `raio inválido: ${r}`);
    chamadas.arcos++;
  },
  fill() {
    chamadas.pinturas++;
  },
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    for (const v of [x0, y0, r0, x1, y1, r1]) {
      assert.ok(Number.isFinite(v), `gradiente com valor inválido: ${v}`);
    }
    chamadas.gradientes++;
    return {
      addColorStop(_pos, cor) {
        assert.ok(!/NaN|undefined/.test(String(cor)), `cor inválida no gradiente: ${cor}`);
      },
    };
  },
  set fillStyle(v) {
    if (typeof v === "string") {
      assert.ok(!/NaN|undefined/.test(v), `cor de preenchimento inválida: ${v}`);
      chamadas.cores.add(v.split(",").slice(0, 3).join(","));
    }
  },
  set strokeStyle(v) {
    if (typeof v === "string") {
      assert.ok(!/NaN|undefined/.test(v), `cor de traço inválida: ${v}`);
      chamadas.cores.add(v.split(",").slice(0, 3).join(","));
    }
  },
  set lineWidth(v) {},
};

const canvasFalso = { clientWidth: 240, width: 0, height: 0, getContext: () => ctxFalso };

let laco = null;
let agendamento = null; // o último setTimeout que a esfera pediu
global.window = { devicePixelRatio: 2, addEventListener() {} };
global.document = { getElementById: (id) => (id === "esfera" ? canvasFalso : null) };
global.requestAnimationFrame = (fn) => {
  laco = fn; // guarda o laço em vez de rodar sem parar
};
// A esfera DORME entre quadros: agenda com setTimeout e só na hora pede o
// quadro. Guardamos a espera pedida — é ela que o teste mede lá embaixo — e
// rodamos o callback na hora, porque é ele que expõe o laço pelo rAF falso.
// Sem isto o relógio do teste pararia de ser do teste.
global.setTimeout = (fn, ms) => {
  agendamento = { ms };
  fn();
  return 0;
};

eval(fs.readFileSync(path.join(__dirname, "..", "renderer", "esfera.js"), "utf8"));

// --- a interface precisa desta ponte ---
assert.ok(global.window.esfera, "esfera.js deve expor window.esfera");
for (const metodo of ["estado", "nivel", "tema", "desempenho", "custo", "redimensionar", "claro"]) {
  assert.strictEqual(typeof window.esfera[metodo], "function", `falta window.esfera.${metodo}`);
}

// --- tamanho do canvas: o teto de densidade é uma economia deliberada de GPU ---
assert.strictEqual(
  canvasFalso.width,
  360,
  "240px em tela 2x deve virar 360 (teto de 1,5×), não 480 — desenhar em 2× custa o dobro"
);

// --- um quadro ---
// O laço limita os quadros por segundo, então o relógio avança de 100 em 100 ms.
laco(0); // aquecimento
for (const k of Object.keys(chamadas)) if (typeof chamadas[k] === "number") chamadas[k] = 0;
laco(200); // este é o quadro medido

assert.ok(chamadas.segmentos > 300, `arame insuficiente: ${chamadas.segmentos} segmentos`);
assert.ok(chamadas.arcos >= 42, `partículas insuficientes: ${chamadas.arcos} arcos`);
assert.ok(chamadas.gradientes >= 2, "faltou o brilho de borda ou o núcleo");

// O agrupamento por transparência é o que mantém isto leve numa máquina sem
// GPU dedicada: muitos segmentos, poucas operações de pintura.
const pinturas = chamadas.pinturas;
const segmentosQuadro = chamadas.segmentos; // guardado aqui: o contador segue somando
assert.ok(pinturas < 40, `pintura demais por quadro (${pinturas}); o agrupamento regrediu`);
assert.ok(
  segmentosQuadro / pinturas > 10,
  `cada pintura deveria cobrir dezenas de segmentos (deu ${(segmentosQuadro / pinturas).toFixed(1)})`
);

// --- a estrutura da esfera de dados ---
// Três camadas: arcos de círculo máximo, trilhas em ângulo reto e poeira.
// O que precisa valer: as três existem, e o custo não sai do controle.
const custo = window.esfera.custo();
assert.ok(custo.arcos >= 12, `arcos de menos: ${custo.arcos}`);
assert.ok(custo.trilhas >= 16, `trilhas de menos: ${custo.trilhas}`);
assert.ok(custo.cantos >= custo.trilhas * 3, "cada trilha precisa de várias curvas de 90°");
assert.ok(custo.poeira >= 40, `poeira de menos: ${custo.poeira}`);
assert.ok(segmentosQuadro < 1400, `${segmentosQuadro} segmentos por quadro: a esfera engordou`);

// --- cada estado tem a sua paleta ---
let relogio = 0;
const paletas = {};
for (const estado of ["idle", "listening", "thinking", "speaking"]) {
  chamadas.cores.clear();
  window.esfera.estado(estado);
  window.esfera.nivel(0.5);
  laco(1000 + relogio);
  relogio += 1000;
  paletas[estado] = [...chamadas.cores];
  assert.ok(paletas[estado].length > 0, `o estado ${estado} não pintou nada`);
}
assert.notDeepStrictEqual(paletas.listening, paletas.speaking, "ouvindo e falando devem diferir");
assert.notDeepStrictEqual(paletas.idle, paletas.thinking, "pronta e pensando devem diferir");

// --- trocar o tema troca as cores de verdade ---
chamadas.cores.clear();
window.esfera.estado("idle");
window.esfera.tema({ idle: [10, 20, 30] });
laco(9000);
assert.ok(
  [...chamadas.cores].some((c) => c.includes("rgba(10,20,30")),
  "window.esfera.tema() deveria mudar a cor usada no desenho"
);

// --- volume no extremo não pode gerar coordenada inválida (o ctx falso checa) ---
window.esfera.nivel(1);
laco(11000);
window.esfera.nivel(0);
laco(13000);

// --- fundo claro: o realce não pode continuar branco ---
// Branco sobre branco não existe. O núcleo é o ponto mais INTENSO da figura,
// não o mais claro — deixar branco no modo claro apagaria o centro da esfera.
chamadas.cores.clear();
window.esfera.estado("idle");
window.esfera.nivel(0.4);
laco(14000);
const noEscuro = [...chamadas.cores];
assert.ok(
  noEscuro.some((c) => c.includes("rgba(255,255,255")),
  "no escuro o realce é branco"
);

chamadas.cores.clear();
window.esfera.claro(true);
laco(15000);
const noClaro = [...chamadas.cores];
assert.ok(
  !noClaro.some((c) => c.includes("rgba(255,255,255")),
  "no claro nada pode ser pintado de branco puro: some no fundo"
);
assert.ok(noClaro.length > 0, "o modo claro tem de pintar alguma coisa");
window.esfera.claro(false);

// --- modo econômico: menos quadros, menos pixels, menos traço ---
const antes = window.esfera.custo();
window.esfera.desempenho("economico");
const economico = window.esfera.custo();
assert.ok(economico.fps < antes.fps, "econômico tem de baixar os quadros por segundo");
assert.strictEqual(canvasFalso.width, 240, "no econômico o canvas desce para 1× (240px)");

chamadas.segmentos = 0;
laco(20000);
const segEconomico = chamadas.segmentos;
assert.ok(
  segEconomico < segmentosQuadro,
  `econômico deveria desenhar menos traço (${segEconomico} vs ${segmentosQuadro})`
);

window.esfera.desempenho("normal");

// --- os sinais se MOVEM ---
// Sem isto a rede seria um desenho bonito e parado. Dois quadros seguidos
// precisam pintar coisas em lugares diferentes.
const posicoesPorQuadro = [];
const arcoOriginal = ctxFalso.arc;
ctxFalso.arc = function (x, y, r) {
  posicoesPorQuadro.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  return arcoOriginal.call(this, x, y, r);
};
window.esfera.estado("thinking");
window.esfera.nivel(0.6);
laco(30000);
const quadroA = posicoesPorQuadro.join("|");
posicoesPorQuadro.length = 0;
laco(30100);
const quadroB = posicoesPorQuadro.join("|");
assert.notStrictEqual(quadroA, quadroB, "a rede está parada: os sinais não se moveram entre dois quadros");

// Mais voz, mais sinais correndo.
posicoesPorQuadro.length = 0;
window.esfera.estado("idle");
window.esfera.nivel(0);
laco(31000);
const quietos = posicoesPorQuadro.length;
posicoesPorQuadro.length = 0;
window.esfera.estado("listening");
window.esfera.nivel(1);
laco(32000);
assert.ok(
  posicoesPorQuadro.length > quietos,
  `voz alta deveria acender mais sinais (${posicoesPorQuadro.length} vs ${quietos} parada)`
);
ctxFalso.arc = arcoOriginal;

// --- parada, ela tem de DORMIR, não acordar junto com a tela -------------
// Antes o laço pedia requestAnimationFrame sempre e desistia quando ainda não
// era hora: o desenho respeitava os 10 fps, mas o processo acordava a cada
// atualização do monitor — 60 vezes por segundo, 120 num ProMotion — só para
// concluir que não tinha nada a fazer. Era consumo de GPU e de CPU em
// silêncio absoluto. Agora a espera é agendada, e é ela que medimos aqui.
const esperaDe = (estado, nivel) => {
  window.esfera.estado(estado);
  window.esfera.nivel(nivel);
  agendamento = null;
  laco(40000);
  assert.ok(agendamento, `${estado} não agendou o próximo quadro: o laço morreu`);
  return agendamento.ms;
};

const sonoParada = esperaDe("idle", 0);
assert.ok(
  sonoParada > 60,
  `parada ela deveria dormir ~100ms (10 fps), mas pediu ${sonoParada.toFixed(1)}ms — ` +
    "isto é o consumo em repouso voltando"
);

const sonoFalando = esperaDe("speaking", 1);
assert.ok(
  sonoFalando < sonoParada,
  `falando tem de desenhar mais que parada (${sonoFalando.toFixed(1)}ms vs ${sonoParada.toFixed(1)}ms)`
);
assert.ok(sonoFalando > 20, `30 fps são ~33ms; pedir ${sonoFalando.toFixed(1)}ms é quadro demais`);

window.esfera.estado("idle");
window.esfera.nivel(0);

// --- a rede DE VERDADE (26/11/2026) ---------------------------------------
// A esfera recebe a topologia e os disparos da rede.js real (pela Mente, como
// o main.js manda) e desenha um ponto por neurônio. O que precisa valer: o
// número de pontos é o número de neurônios, nada sai inválido (o ctx falso
// confere), o custo continua sob controle, e a rede que cresce aparece.
const { Mente } = require(path.join(__dirname, "..", "iniciativa.js"));
const menteReal = new Mente();
menteReal.rede.estimular({ TRABALHO: 1, ATIVIDADE: 1, CANSACO: 1 });
menteReal.rede.passo(1000);
const pacote = menteReal.paraEsfera();
assert.ok(pacote.disparos.some((n) => n > 0), "a rede real não disparou");
window.esfera.rede(pacote);
assert.strictEqual(window.esfera.neuronios(), menteReal.rede.N, "um ponto por neurônio da rede");

const arcosAntes = chamadas.arcos;
for (const k of Object.keys(chamadas)) if (typeof chamadas[k] === "number") chamadas[k] = 0;
laco(40000);
laco(40100);
assert.ok(chamadas.arcos > 60, `a rede real desenhou poucos neurônios: ${chamadas.arcos}`);
assert.ok(chamadas.pinturas < 60, `pintura demais com a rede real: ${chamadas.pinturas} em dois quadros`);
const pinturasComRede = chamadas.pinturas;

// a rede cresce: a esfera remonta e os neurônios novos aparecem
for (let i = 0; i < 5; i++) menteReal.aprender({ motor: "PAUSA", recompensa: 1, contexto: { TRABALHO: 1 } });
assert.ok(menteReal.rede.assembleias.length >= 1, "a rede deveria ter crescido");
window.esfera.rede(menteReal.paraEsfera());
assert.strictEqual(window.esfera.neuronios(), menteReal.rede.N, "a esfera acompanhou o crescimento");
chamadas.cores.clear();
laco(41000);
assert.ok([...chamadas.cores].some((c) => c.includes("rgba(120,255,190")), "o neurônio que nasceu acende com o anel");
void arcosAntes;

// --- modelos da esfera (Configurações › Aparência) -------------------------
assert.deepStrictEqual(window.esfera.modelos(), ["holografica", "neural", "camadas"]);
const medirModelo = (m, t) => {
  window.esfera.modelo(m);
  for (const k of Object.keys(chamadas)) if (typeof chamadas[k] === "number") chamadas[k] = 0;
  laco(t);
  return { ...chamadas };
};
const holo = medirModelo("holografica", 50000);
const neuralQ = medirModelo("neural", 50100);
assert.ok(neuralQ.arcos > 60, `o modelo neural precisa desenhar os neurônios: ${neuralQ.arcos}`);
assert.ok(neuralQ.pinturas < 40, `o modelo neural passou do teto de pintura: ${neuralQ.pinturas}`);
assert.ok(neuralQ.segmentos < holo.segmentos, `o neural tira a casca decorativa: ${neuralQ.segmentos} vs ${holo.segmentos}`);
// 28/11/2026: "um outro modelo de holograma para ver a rede neural
// funcionando". Camadas: a MESMA rede, como diagrama de rede neural em 3D —
// sentidos numa placa, interneurônios e assembleias no meio, motores na outra
// ponta, e os sinais atravessando de uma placa para a outra.
const camadasQ = medirModelo("camadas", 50200);
assert.ok(camadasQ.arcos > 60, `o modelo camadas precisa desenhar os neurônios: ${camadasQ.arcos}`);
assert.ok(camadasQ.pinturas < 40, `o modelo camadas passou do teto de pintura: ${camadasQ.pinturas}`);
assert.ok(camadasQ.segmentos < holo.segmentos, `camadas também tira a casca decorativa: ${camadasQ.segmentos} vs ${holo.segmentos}`);
{
  // cada grupo numa placa, na ordem do sinal: sentido → inter → assembleia → motor
  const placas = window.esfera.placas();
  const ordem = ["sentido", "inter", "assembleia", "motor"].filter((g) => placas[g] !== undefined);
  assert.ok(ordem.length >= 3, `faltam placas: ${JSON.stringify(placas)}`);
  for (let i = 1; i < ordem.length; i++) {
    assert.ok(placas[ordem[i]] > placas[ordem[i - 1]], `a placa ${ordem[i]} vem depois de ${ordem[i - 1]}: ${JSON.stringify(placas)}`);
  }
}
assert.strictEqual(window.esfera.modelo("inexistente"), "holografica", "modelo desconhecido vira holográfica");
assert.strictEqual(window.esfera.modelo(), "holografica");

// --- pausada (27/11/2026): coberta pela abertura do dia, não desenha e dorme mais ---
{
  const antes = chamadas.segmentos;
  window.esfera.pausa(true);
  laco(20000);
  assert.strictEqual(chamadas.segmentos, antes, "pausada, a esfera não desenha nada");
  assert.ok(agendamento.ms >= 400, `pausada, ela dorme ~500 ms entre olhadas (pediu ${agendamento.ms} ms)`);
  window.esfera.pausa(false);
  laco(20600);
  assert.ok(chamadas.segmentos > antes, "despausada, volta a desenhar");
}


console.log("✓ esfera holográfica: geometria, estados, tema e custo de desenho");
console.log(
  "  sono entre quadros: " +
    `${sonoParada.toFixed(0)}ms parada · ${sonoFalando.toFixed(0)}ms falando`
);
console.log("  segmentos por quadro:", segmentosQuadro);
console.log("  operações de pintura por quadro:", pinturas);
console.log("  paletas distintas:", Object.keys(paletas).join(", "));
console.log("  esfera:", custo.arcos, "arcos ·", custo.trilhas, "trilhas ·", custo.poeira, "pontos de poeira");
console.log("  rede real na esfera:", window.esfera.neuronios(), "neurônios ·", pinturasComRede, "pinturas em dois quadros");
