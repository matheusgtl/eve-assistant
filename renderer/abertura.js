// abertura.js — a animação da primeira abertura do dia.
//
// Uma vez por dia (quem decide é o main.js, em ev:abertura), na primeira vez
// que a janela aparece: os neurônios da rede DELA surgem um a um, na ordem das
// camadas (sentidos, interneurônios, motores, e por último os que nasceram do
// que ela aprendeu), se ligam, os sinais correm e tudo se fecha na esfera — e
// aí vem o bom dia. ~4,5 s; clique, tecla ou Esc pulam. Com "reduzir
// movimento" ligado no macOS, só o texto aparece e some.
//
// Os números são os de verdade (neurônios, assembleias); o desenho é canvas
// 2D, como a esfera, e o laço para sozinho quando termina.

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
      "justify-content:center;flex-direction:column;cursor:pointer;transition:opacity .6s ease;opacity:1";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    const bloco = document.createElement("div");
    bloco.style.cssText =
      `position:relative;text-align:center;color:${texto};opacity:0;transform:translateY(8px);` +
      "transition:opacity .9s ease,transform .9s ease;pointer-events:none;margin-top:46vh";
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
      setTimeout(() => camada.remove(), 650);
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
      setTimeout(fechar, 2200);
      return;
    }

    // --- os neurônios -------------------------------------------------------
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let L = 0, A = 0;
    const medir = () => {
      L = canvas.clientWidth;
      A = canvas.clientHeight;
      canvas.width = Math.round(L * dpr);
      canvas.height = Math.round(A * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
          x0: 0.5 + Math.cos(ang) * raio * 0.9 + (c - 1.5) * 0.02,
          y0: 0.1 + (c / 3) * 0.6 + (Math.random() - 0.5) * 0.16,
          // destino: a casca de uma esfera no centro (projeção de um ponto sorteado)
          lat: Math.asin(Math.random() * 2 - 1),
          lon: Math.random() * Math.PI * 2,
          nasce: 0.05 + (k / total) * 1.25, // quando aparece (s)
          novo: k >= total - novos,
        });
      }
    });
    const ligacoes = [];
    for (let i = 0; i < total * 1.4; i++) {
      const a = (Math.random() * total) | 0;
      const b = Math.min(total - 1, a + 1 + ((Math.random() * 40) | 0));
      ligacoes.push([a, b, 0.9 + Math.random() * 1.6]);
    }

    const t0 = performance.now();
    const DURACAO = 4.6;
    let textoMostrado = false;
    const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

    function quadro(agora) {
      if (fim) return;
      const t = (agora - t0) / 1000;
      if (canvas.clientWidth !== L) medir();
      ctx.clearRect(0, 0, L, A);
      const cx = L / 2, cy = A * 0.4, R = Math.min(L, A) * 0.2;
      const fecha = suave((t - 2.2) / 1.1); // 0 = solto, 1 = na esfera
      const giro = t * 0.6;

      const pos = pontos.map((p) => {
        const cl = Math.cos(p.lat);
        const x3 = cl * Math.cos(p.lon + giro), y3 = Math.sin(p.lat), z3 = cl * Math.sin(p.lon + giro);
        const f = 3 / (3 + z3);
        const ex = cx + x3 * R * f, ey = cy + y3 * R * f;
        return {
          x: p.x0 * L + (ex - p.x0 * L) * fecha,
          y: p.y0 * A + (ey - p.y0 * A) * fecha,
          z: z3 * fecha,
          vis: suave((t - p.nasce) / 0.25),
          novo: p.novo,
        };
      });

      // ligações se desenhando
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = cor(0.16 * (1 - fecha * 0.5));
      ctx.beginPath();
      for (const [a, b, quando] of ligacoes) {
        const prog = suave((t - quando) / 0.5);
        if (prog <= 0 || pos[a].vis < 1 || pos[b].vis < 1) continue;
        ctx.moveTo(pos[a].x, pos[a].y);
        ctx.lineTo(pos[a].x + (pos[b].x - pos[a].x) * prog, pos[a].y + (pos[b].y - pos[a].y) * prog);
      }
      ctx.stroke();

      // sinais correndo nas ligações já prontas
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      for (let i = 0; i < ligacoes.length; i += 7) {
        const [a, b, quando] = ligacoes[i];
        if (t < quando + 0.5) continue;
        const u = ((t - quando) * 1.3 + i * 0.13) % 1;
        const x = pos[a].x + (pos[b].x - pos[a].x) * u, y = pos[a].y + (pos[b].y - pos[a].y) * u;
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
        const pico = Math.max(0, Math.sin(Math.min(1, (t - 2.6) / 1.2) * Math.PI)) * 0.9;
        brilho.addColorStop(0, `rgba(255,255,255,${(0.2 + pico * 0.7).toFixed(3)})`);
        brilho.addColorStop(0.3, cor((0.25 * fecha).toFixed(3)));
        brilho.addColorStop(1, cor(0));
        ctx.fillStyle = brilho;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!textoMostrado && t > 2.9) {
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
