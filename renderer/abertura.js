// abertura.js — a animação da primeira abertura do dia.
//
// Uma vez por dia (quem decide é o main.js, em ev:abertura), na primeira vez
// que a janela aparece: os neurônios da rede DELA surgem um a um, na ordem das
// camadas (sentidos, interneurônios, motores, e por último os que nasceram do
// que ela aprendeu), se ligam, os sinais correm e tudo se fecha na esfera — e
// aí vem o bom dia. ~2,6 s (26/11: a primeira versão tinha 4,6 s e pedia para
// ser mais curta); clique, tecla ou Esc pulam. Com "reduzir movimento" ligado
// no macOS, só o texto aparece e some.
//
// Centralização: esfera + texto são UM bloco centrado na janela. Antes a
// esfera ficava a 40% da altura e o texto empurrado para baixo por margem
// fixa, e o conjunto parecia caído para um lado.
//
// Os números são os de verdade (neurônios, assembleias); o desenho é canvas
// 2D, como a esfera, e o laço para sozinho quando termina. As ligações são
// curvas (Bézier), não retas.

(function () {
  if (!window.ev?.abertura) return;
  let jaPediu = false;

  async function talvez() {
    if (jaPediu || document.visibilityState !== "visible") return;
    jaPediu = true;
    let dados = null;
    try {
      dados = await window.ev.abertura();
    } catch {
      return;
    }
    if (dados?.mostrar) mostrar(dados);
  }

  function mostrar(d) {
    const estilo = getComputedStyle(document.documentElement);
    const ac = (estilo.getPropertyValue("--ac") || "#5cc8ff").trim();
    const fundo = (estilo.getPropertyValue("--fundo") || "#0e1013").trim();
    const texto = (estilo.getPropertyValue("--texto") || "#ececec").trim();
    const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const camada = document.createElement("div");
    camada.id = "abertura";
    camada.setAttribute("role", "dialog");
    camada.setAttribute("aria-label", d.saudacao);
    camada.style.cssText =
      `position:fixed;inset:0;z-index:999;background:${fundo};display:flex;align-items:center;` +
      "justify-content:center;flex-direction:column;cursor:pointer;transition:opacity .4s ease;opacity:1";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    const bloco = document.createElement("div");
    bloco.style.cssText =
      // top padrão (sem animação, no "reduzir movimento"): o texto no meio da tela
      `position:absolute;left:0;right:0;top:calc(50% - 46px);text-align:center;color:${texto};opacity:0;transform:translateY(6px);` +
      "transition:opacity .45s ease,transform .45s ease;pointer-events:none";
    const t1 = document.createElement("div");
    t1.style.cssText = "font-size:30px;font-weight:600;letter-spacing:.2px";
    t1.textContent = d.saudacao;
    const t2 = document.createElement("div");
    t2.style.cssText = "font-size:14px;opacity:.7;margin-top:8px";
    t2.textContent = d.data;
    const t3 = document.createElement("div");
    t3.style.cssText = `font:12px ui-monospace,Menlo,monospace;color:${ac};opacity:.85;margin-top:14px`;
    t3.textContent = d.rodape;
    bloco.append(t1, t2, t3);
    camada.append(canvas, bloco);
    document.body.appendChild(camada);

    let fim = false;
    const fechar = () => {
      if (fim) return;
      fim = true;
      camada.style.opacity = "0";
      setTimeout(() => camada.remove(), 450);
      window.removeEventListener("keydown", fechar);
    };
    camada.addEventListener("click", fechar);
    window.addEventListener("keydown", fechar);

    const mostrarTexto = () => {
      bloco.style.opacity = "1";
      bloco.style.transform = "none";
    };
    if (calmo) {
      setTimeout(mostrarTexto, 50);
      setTimeout(fechar, 1600);
      return;
    }

    // --- os neurônios -------------------------------------------------------
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let L = 0, A = 0;
    // O conjunto (esfera + vão + texto) é centrado na altura da janela.
    const ALTURA_TEXTO = 92;
    const VAO = 26;
    let cx = 0, cy = 0, R = 0;
    const medir = () => {
      L = canvas.clientWidth;
      A = canvas.clientHeight;
      canvas.width = Math.round(L * dpr);
      canvas.height = Math.round(A * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(L, A) * 0.17;
      const conjunto = R * 2.12 + VAO + ALTURA_TEXTO;
      cx = L / 2;
      cy = (A - conjunto) / 2 + R * 1.06;
      bloco.style.top = `${Math.round(cy + R * 1.06 + VAO)}px`;
    };
    medir();

    const hex = ac.replace("#", "");
    const rgb = hex.length === 6
      ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
      : [92, 200, 255];
    const cor = (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    const NASCEU = (a) => `rgba(120,255,190,${a})`;

    // Uma camada por grupo, de cima para baixo, como a rede é montada.
    const total = Math.max(40, Math.min(400, d.neuronios || 334));
    const novos = Math.min(total, d.nasceram || 0);
    const camadas = [0.22, 0.38, 0.3, 0.1]; // sentidos, inter, motores, o resto
    const pontos = [];
    let k = 0;
    camadas.forEach((frac, c) => {
      const n = c === 3 ? total - k : Math.round(total * frac);
      for (let i = 0; i < n; i++, k++) {
        const ang = Math.random() * Math.PI * 2;
        const raio = 0.18 + Math.random() * 0.3;
        pontos.push({
          // solto em volta do centro, camada por camada de cima para baixo
          x0: 0.5 + Math.cos(ang) * raio * 0.75,
          y0: 0.5 + ((c - 1.5) / 1.5) * 0.22 + (Math.random() - 0.5) * 0.12,
          // destino: a casca de uma esfera no centro (projeção de um ponto sorteado)
          lat: Math.asin(Math.random() * 2 - 1),
          lon: Math.random() * Math.PI * 2,
          nasce: 0.02 + (k / total) * 0.6, // quando aparece (s)
          novo: k >= total - novos,
        });
      }
    });
    const ligacoes = [];
    for (let i = 0; i < total * 1.4; i++) {
      const a = (Math.random() * total) | 0;
      const b = Math.min(total - 1, a + 1 + ((Math.random() * 40) | 0));
      // o terceiro valor é quando a ligação começa a se desenhar; o quarto, a
      // curvatura dela (um lado ou o outro, nunca reta)
      const curva = (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1);
      ligacoes.push([a, b, 0.35 + Math.random() * 0.75, curva]);
    }

    // LIGAÇÕES CURVAS (26/11: "as linhas que ligam os neurônios mais lisas e
    // curvas"). Cada ligação é uma Bézier quadrática: o ponto de controle sai
    // do meio da reta, de lado, e — quando a esfera já fechou — também para
    // fora do centro, para a curva acompanhar a casca em vez de cortá-la.
    const controle = (p, q, curva, fecha) => {
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const dx = q.x - p.x, dy = q.y - p.y;
      const ox = mx - cx, oy = my - cy;
      return {
        x: mx - dy * curva + ox * 0.35 * fecha,
        y: my + dx * curva + oy * 0.35 * fecha,
      };
    };
    // ponto da curva em u (0..1)
    const naCurva = (p, c, q, u) => {
      const v = 1 - u;
      return { x: v * v * p.x + 2 * v * u * c.x + u * u * q.x, y: v * v * p.y + 2 * v * u * c.y + u * u * q.y };
    };
    // ponto do arco da esfera (círculo máximo) entre dois neurônios, em u,
    // já projetado como a esfera é projetada
    const naEsfera = (a, b, u) => {
      let x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
      const m = Math.hypot(x, y, z);
      if (m < 1e-3) return null; // opostos: sem arco único
      x /= m; y /= m; z /= m;
      const f = 3 / (3 + z);
      return { x: cx + x * R * f, y: cy + y * R * f };
    };
    // A ligação em u: a Bézier solta virando o arco da esfera, pela fase `fecha`.
    const caminhoDaLigacao = (p, q, c, u, fecha) => {
      const solta = naCurva(p, c, q, u);
      if (fecha <= 0) return solta;
      // As pontas (p, q) já estão na posição misturada; o arco é mistura do meio.
      const arco = naEsfera(p.u, q.u, u);
      if (!arco) return solta;
      // a reta entre as pontas reais, para corrigir o arco às pontas de agora
      const ex = { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u };
      const a0 = naEsfera(p.u, q.u, 0), a1 = naEsfera(p.u, q.u, 1);
      const base = { x: a0.x + (a1.x - a0.x) * u, y: a0.y + (a1.y - a0.y) * u };
      const naCasca = { x: ex.x + (arco.x - base.x), y: ex.y + (arco.y - base.y) };
      return { x: solta.x + (naCasca.x - solta.x) * fecha, y: solta.y + (naCasca.y - solta.y) * fecha };
    };
    // Traça a curva de 0 até `ate` com quadráticas pelos pontos médios das
    // amostras: liso, sem quina, e com poucas chamadas.
    const AMOSTRAS = 8;
    const tracarSuave = (ponto, ate) => {
      const pts = [];
      for (let i = 0; i <= AMOSTRAS; i++) pts.push(ponto((i / AMOSTRAS) * ate));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const fim = pts[pts.length - 1];
      ctx.quadraticCurveTo(fim.x, fim.y, fim.x, fim.y);
    };

    const t0 = performance.now();
    const DURACAO = 2.6;
    let textoMostrado = false;
    const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

    function quadro(agora) {
      if (fim) return;
      const t = (agora - t0) / 1000;
      if (canvas.clientWidth !== L) medir();
      ctx.clearRect(0, 0, L, A);
      // os pontos soltos se medem pelo centro do conjunto, não da janela
      const dy = cy - A / 2;
      const fecha = suave((t - 0.95) / 0.65); // 0 = solto, 1 = na esfera
      const giro = t * 0.9;

      const pos = pontos.map((p) => {
        const cl = Math.cos(p.lat);
        const x3 = cl * Math.cos(p.lon + giro), y3 = Math.sin(p.lat), z3 = cl * Math.sin(p.lon + giro);
        const f = 3 / (3 + z3);
        const ex = cx + x3 * R * f, ey = cy + y3 * R * f;
        return {
          x: p.x0 * L + (ex - p.x0 * L) * fecha,
          y: p.y0 * A + dy + (ey - p.y0 * A - dy) * fecha,
          z: z3 * fecha,
          u: [x3, y3, z3], // o ponto na esfera (raio 1), para as ligações seguirem a casca
          vis: suave((t - p.nasce) / 0.18),
          novo: p.novo,
        };
      });

      // ligações se desenhando, como curvas. Soltas, cada uma é uma Bézier de
      // lado; conforme a esfera fecha, ela vira o ARCO DA ESFERA entre os dois
      // neurônios (círculo máximo, projetado). 26/11/2026: a Bézier sozinha
      // ainda cortava a esfera por dentro — "as ligações devem seguir o formato
      // da esfera". A curva é amostrada e desenhada com quadráticas pelos
      // pontos médios, então não há quina em lugar nenhum.
      ctx.lineWidth = 0.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = cor(0.18 * (1 - fecha * 0.45));
      ctx.beginPath();
      const curvas = [];
      for (const [a, b, quando, curva] of ligacoes) {
        const prog = suave((t - quando) / 0.3);
        const p = pos[a], q = pos[b];
        // a ponta escondida atrás da esfera não tem neurônio desenhado
        if (prog <= 0 || p.vis < 1 || q.vis < 1 || p.z > 0.6 || q.z > 0.6) { curvas.push(null); continue; }
        const c = controle(p, q, curva, 0);
        const ponto = (u) => caminhoDaLigacao(p, q, c, u, fecha);
        curvas.push(ponto);
        tracarSuave(ponto, prog);
      }
      ctx.stroke();

      // sinais correndo pelas curvas já prontas
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      for (let i = 0; i < ligacoes.length; i += 7) {
        const quando = ligacoes[i][2];
        const ponto = curvas[i];
        if (!ponto || t < quando + 0.3) continue;
        const u = ((t - quando) * 2 + i * 0.13) % 1;
        const { x, y } = ponto(u);
        ctx.moveTo(x + 1.3, y);
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      }
      ctx.fill();

      // os neurônios
      for (const [lista, pintor] of [[pos.filter((p) => !p.novo), cor], [pos.filter((p) => p.novo), NASCEU]]) {
        ctx.fillStyle = pintor(0.85);
        ctx.beginPath();
        for (const p of lista) {
          if (p.vis <= 0 || p.z > 0.6) continue;
          const r = (1.2 + (1 - p.vis) * 3) * (p.novo ? 1.4 : 1);
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // a esfera se fecha: contorno e o núcleo acendendo
      if (fecha > 0) {
        ctx.strokeStyle = cor(0.35 * fecha);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
        ctx.stroke();
        const brilho = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
        const pico = Math.max(0, Math.sin(Math.min(1, (t - 1.3) / 0.8) * Math.PI)) * 0.9;
        brilho.addColorStop(0, `rgba(255,255,255,${(0.2 + pico * 0.7).toFixed(3)})`);
        brilho.addColorStop(0.3, cor((0.25 * fecha).toFixed(3)));
        brilho.addColorStop(1, cor(0));
        ctx.fillStyle = brilho;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!textoMostrado && t > 1.45) {
        textoMostrado = true;
        mostrarTexto();
      }
      if (t > DURACAO) fechar();
      else requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);
  }

  document.addEventListener("visibilitychange", talvez);
  window.addEventListener("focus", talvez);
  talvez();
})();
