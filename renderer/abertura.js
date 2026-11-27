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
    // A esfera do painel fica coberta: não precisa desenhar por baixo.
    window.esfera?.pausa?.(true);
    const fechar = () => {
      if (fim) return;
      fim = true;
      window.esfera?.pausa?.(false);
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

    // DESEMPENHO (27/11/2026, "deixa a animação mais fluida"). A versão das
    // curvas criava, A CADA QUADRO, um objeto por neurônio, duas listas
    // filtradas, e ~470 ligações × 9 amostras × 5 objetos de ponto — dezenas
    // de milhares de objetos por quadro, e o coletor de lixo travava a
    // animação no meio. Agora tudo mora em Float32Array criados uma vez, as
    // contas são feitas no lugar, e o giro usa cos/sen somados (sem
    // trigonometria por neurônio). O desenho é o mesmo.

    // Uma camada por grupo, de cima para baixo, como a rede é montada.
    const total = Math.max(40, Math.min(400, d.neuronios || 334));
    const novos = Math.min(total, d.nasceram || 0);
    const camadas = [0.22, 0.38, 0.3, 0.1]; // sentidos, inter, motores, o resto
    // por neurônio, fixo: posição solta, ponto na esfera (sem giro), quando nasce
    const X0 = new Float32Array(total), Y0 = new Float32Array(total);
    const BX = new Float32Array(total), BY = new Float32Array(total), BZ = new Float32Array(total);
    const NASCE = new Float32Array(total);
    const NOVO = new Uint8Array(total);
    // por neurônio, a cada quadro
    const PX = new Float32Array(total), PY = new Float32Array(total), PZ = new Float32Array(total);
    const EX = new Float32Array(total), EY = new Float32Array(total), VIS = new Float32Array(total);
    let k = 0;
    camadas.forEach((frac, c) => {
      const n = c === 3 ? total - k : Math.round(total * frac);
      for (let i = 0; i < n; i++, k++) {
        const ang = Math.random() * Math.PI * 2;
        const raio = 0.18 + Math.random() * 0.3;
        // solto em volta do centro, camada por camada de cima para baixo
        X0[k] = 0.5 + Math.cos(ang) * raio * 0.75;
        Y0[k] = 0.5 + ((c - 1.5) / 1.5) * 0.22 + (Math.random() - 0.5) * 0.12;
        // destino: a casca de uma esfera no centro (um ponto sorteado nela)
        const lat = Math.asin(Math.random() * 2 - 1);
        const lon = Math.random() * Math.PI * 2;
        BX[k] = Math.cos(lat) * Math.cos(lon);
        BY[k] = Math.sin(lat);
        BZ[k] = Math.cos(lat) * Math.sin(lon);
        NASCE[k] = 0.02 + (k / total) * 0.6; // quando aparece (s)
        NOVO[k] = k >= total - novos ? 1 : 0;
      }
    });
    const nLig = Math.round(total * 1.4);
    const LA = new Uint16Array(nLig), LB = new Uint16Array(nLig);
    const LQ = new Float32Array(nLig), LC = new Float32Array(nLig);
    for (let i = 0; i < nLig; i++) {
      const a = (Math.random() * total) | 0;
      LA[i] = a;
      LB[i] = Math.min(total - 1, a + 1 + ((Math.random() * 40) | 0));
      LQ[i] = 0.35 + Math.random() * 0.75; // quando a ligação começa a se desenhar
      // a curvatura dela enquanto solta (um lado ou o outro, nunca reta)
      LC[i] = (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1);
    }
    const LPROG = new Float32Array(nLig); // quanto de cada ligação já está desenhado (0 = nada)

    // LIGAÇÕES CURVAS. Soltas, cada uma é uma Bézier quadrática de lado;
    // conforme a esfera fecha, vira o ARCO DA ESFERA entre os dois neurônios
    // (círculo máximo, projetado). O ponto da ligação `i` em `u` sai em ox/oy.
    let ox = 0, oy = 0;
    let fecha = 0, cg = 1, sg = 0;
    function pontoDaLigacao(i, u) {
      const a = LA[i], b = LB[i];
      const px = PX[a], py = PY[a], qx = PX[b], qy = PY[b];
      const dx = qx - px, dy = qy - py;
      const cxL = (px + qx) / 2 - dy * LC[i], cyL = (py + qy) / 2 + dx * LC[i];
      const v = 1 - u;
      let sx = v * v * px + 2 * v * u * cxL + u * u * qx;
      let sy = v * v * py + 2 * v * u * cyL + u * u * qy;
      if (fecha > 0) {
        // o arco: interpola na esfera (sem giro), normaliza, gira e projeta
        let x = BX[a] + (BX[b] - BX[a]) * u, y = BY[a] + (BY[b] - BY[a]) * u, z = BZ[a] + (BZ[b] - BZ[a]) * u;
        const m = Math.sqrt(x * x + y * y + z * z);
        if (m > 1e-3) {
          x /= m; y /= m; z /= m;
          const xr = x * cg - z * sg, zr = z * cg + x * sg;
          const f = 3 / (3 + zr);
          // o arco é corrigido para as pontas de agora (que ainda estão chegando)
          const ax = cx + xr * R * f - (EX[a] + (EX[b] - EX[a]) * u) + px + dx * u;
          const ay = cy + y * R * f - (EY[a] + (EY[b] - EY[a]) * u) + py + dy * u;
          sx += (ax - sx) * fecha;
          sy += (ay - sy) * fecha;
        }
      }
      ox = sx;
      oy = sy;
    }

    // Traça de 0 até `ate` com quadráticas pelos pontos médios das amostras:
    // liso, sem quina. As amostras vão para um buffer reaproveitado.
    const AMOSTRAS = 7;
    const AM = new Float32Array((AMOSTRAS + 1) * 2);
    function tracar(i, ate) {
      for (let s = 0; s <= AMOSTRAS; s++) {
        pontoDaLigacao(i, (s / AMOSTRAS) * ate);
        AM[s * 2] = ox;
        AM[s * 2 + 1] = oy;
      }
      ctx.moveTo(AM[0], AM[1]);
      for (let s = 1; s < AMOSTRAS; s++) {
        ctx.quadraticCurveTo(AM[s * 2], AM[s * 2 + 1], (AM[s * 2] + AM[s * 2 + 2]) / 2, (AM[s * 2 + 1] + AM[s * 2 + 3]) / 2);
      }
      ctx.quadraticCurveTo(AM[AMOSTRAS * 2], AM[AMOSTRAS * 2 + 1], AM[AMOSTRAS * 2], AM[AMOSTRAS * 2 + 1]);
    }

    const t0 = performance.now();
    const DURACAO = 2.6;
    let textoMostrado = false;
    const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    // As cores são texto: montadas uma vez, não a cada quadro.
    const COR_NEURONIO = cor(0.85), COR_NOVO = NASCEU(0.85), COR_SINAL = "rgba(255,255,255,.85)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function quadro(agora) {
      if (fim) return;
      const t = (agora - t0) / 1000;
      if (canvas.clientWidth !== L) medir();
      ctx.clearRect(0, 0, L, A);
      // os pontos soltos se medem pelo centro do conjunto, não da janela
      const dy = cy - A / 2;
      fecha = suave((t - 0.95) / 0.65); // 0 = solto, 1 = na esfera
      const giro = t * 0.9;
      cg = Math.cos(giro);
      sg = Math.sin(giro);

      for (let i = 0; i < total; i++) {
        const xr = BX[i] * cg - BZ[i] * sg, zr = BZ[i] * cg + BX[i] * sg;
        const f = 3 / (3 + zr);
        const ex = cx + xr * R * f, ey = cy + BY[i] * R * f;
        EX[i] = ex;
        EY[i] = ey;
        const lx = X0[i] * L, ly = Y0[i] * A + dy;
        PX[i] = lx + (ex - lx) * fecha;
        PY[i] = ly + (ey - ly) * fecha;
        PZ[i] = zr * fecha;
        VIS[i] = suave((t - NASCE[i]) / 0.18);
      }

      // ligações se desenhando
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = cor((0.18 * (1 - fecha * 0.45)).toFixed(3));
      ctx.beginPath();
      for (let i = 0; i < nLig; i++) {
        const a = LA[i], b = LB[i];
        const prog = suave((t - LQ[i]) / 0.3);
        // a ponta escondida atrás da esfera não tem neurônio desenhado
        if (prog <= 0 || VIS[a] < 1 || VIS[b] < 1 || PZ[a] > 0.6 || PZ[b] > 0.6) {
          LPROG[i] = 0;
          continue;
        }
        LPROG[i] = prog;
        tracar(i, prog);
      }
      ctx.stroke();

      // sinais correndo pelas curvas já prontas
      ctx.fillStyle = COR_SINAL;
      ctx.beginPath();
      for (let i = 0; i < nLig; i += 7) {
        if (LPROG[i] < 1) continue;
        pontoDaLigacao(i, ((t - LQ[i]) * 2 + i * 0.13) % 1);
        ctx.moveTo(ox + 1.3, oy);
        ctx.arc(ox, oy, 1.3, 0, Math.PI * 2);
      }
      ctx.fill();

      // os neurônios: duas passadas (os de sempre e os que nasceram), sem listas
      for (let novo = 0; novo < 2; novo++) {
        if (novo && !novos) break;
        ctx.fillStyle = novo ? COR_NOVO : COR_NEURONIO;
        ctx.beginPath();
        for (let i = 0; i < total; i++) {
          if (NOVO[i] !== novo || VIS[i] <= 0 || PZ[i] > 0.6) continue;
          const r = (1.2 + (1 - VIS[i]) * 3) * (novo ? 1.4 : 1);
          ctx.moveTo(PX[i] + r, PY[i]);
          ctx.arc(PX[i], PY[i], r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // a esfera se fecha: contorno e o núcleo acendendo
      if (fecha > 0) {
        ctx.strokeStyle = cor((0.35 * fecha).toFixed(3));
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
