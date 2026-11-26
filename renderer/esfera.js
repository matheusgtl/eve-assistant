// esfera.js — a esfera de redes neurais da Sexta-Feira.
//
// Três camadas, que é o que faz a leitura da referência:
//   1. ARCOS de círculo máximo em orientações sorteadas — as curvas largas que
//      cruzam a esfera inteira e dão a sensação de volume.
//   2. TRILHAS de circuito: caminhos que andam em ângulo reto sobre a
//      superfície (anda em longitude, vira, anda em latitude), com um ponto em
//      cada canto. São elas que fazem parecer placa de circuito, e não teia.
//   3. NÚCLEO em átomo: três elipses cruzadas girando, com o estouro branco no
//      centro e raios curtos saindo dele.
//
// Tudo em canvas 2D com projeção em perspectiva feita à mão: nada de WebGL,
// porque esta máquina não tem GPU dedicada e canvas 2D roda liso nela.
//
// CUSTO DE GPU — quatro coisas seguram o consumo, e é por isso que elas existem:
//   1. limite de quadros por segundo. 60 fps não deixa a esfera mais bonita;
//      deixa a GPU mais quente. O padrão é 30 em uso e 10 parada.
//   2. teto na densidade de pixels. Em tela retina, desenhar em 2× quadruplica
//      a área pintada; 1,5× é indistinguível a olho nu e custa quase metade.
//   3. agrupamento por faixa de transparência: centenas de segmentos saem em
//      poucas operações de pintura, em vez de uma por segmento.
//   4. A GEOMETRIA É CALCULADA UMA VEZ. Arcos, trilhas e pontos nascem na
//      partida e nunca mudam; por quadro só rodam a projeção e o que se move.
//
// Ela reage a duas coisas: à voz do usuário (volume medido no motor de escuta)
// e à fala da E.V.E (envoltória gerada na interface — indicador, não medida).

(function () {
  const canvas = document.getElementById("esfera");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });

  const ARCOS = 20;          // círculos máximos cruzando a esfera
  const PONTOS_ARCO = 26;
  const TRILHAS = 30;        // caminhos em ângulo reto sobre a superfície
  const CANTOS_TRILHA = 5;   // quantas curvas de 90° cada trilha dá
  const POEIRA = 70;         // pontinhos soltos
  const RAIOS_NUCLEO = 24;   // espículas saindo do centro
  const PULSOS_MAX = 26;
  // 25/11/2026: era 2,8. Perspectiva tão curta empurrava a frente da malha
  // para fora, e como só a frente aparece (o fundo é apagado pela
  // profundidade), a figura lia como um borrão oval. Com 4 a deformação cai
  // pela metade e a esfera ganha um contorno de verdade (o limbo, abaixo).
  const DIST_FOCAL = 4;
  // Raio do contorno visto da câmera: a projeção de uma esfera de raio 1 a
  // esta distância é um círculo de raio D/√(D²−1).
  const LIMBO = DIST_FOCAL / Math.sqrt(DIST_FOCAL * DIST_FOCAL - 1);
  const FAIXAS = 8;

  const PERFIS = {
    economico: { fps: 18, parado: 6, dpr: 1, particulas: false, salto: 2 },
    normal: { fps: 30, parado: 10, dpr: 1.5, particulas: true, salto: 1 },
    fluido: { fps: 60, parado: 20, dpr: 2, particulas: true, salto: 1 },
  };
  let perfil = PERFIS.normal;

  let CORES = {
    idle: [95, 208, 255],
    listening: [110, 240, 180],
    thinking: [155, 140, 255],
    speaking: [251, 191, 36],
  };

  // Um punhado de traços sai numa cor quente, como na referência. São poucos:
  // o contraste é o que faz a malha fria parecer profunda.
  const ACENTO = [255, 120, 96];
  const FRACAO_ACENTO = 0.1;

  let estado = "idle";
  // Fundo claro muda três decisões, e nenhuma delas se resolve invertendo cor:
  //   • o realce era branco. Branco sobre branco não existe — vira tinta escura;
  //   • o halo somava luz. Sobre branco, somar luz não aparece: vira sombra;
  //   • traço fino com pouca opacidade some no claro — leva reforço.
  let claro = false;
  let nivel = 0;
  let giroY = 0;
  let giroX = 0.42;
  let ultimoQuadro = -1e9;

  // --- Geometria: nasce uma vez ------------------------------------------
  const sorteio = (a, b) => a + Math.random() * (b - a);

  /// Arcos de círculo máximo. Um círculo máximo é a maior circunferência que
  /// cabe numa esfera; em perspectiva ele vira uma elipse que cruza o disco
  /// inteiro — são essas as curvas largas da referência. Cada um nasce num
  /// plano sorteado, e por isso eles se cruzam em ângulos irregulares em vez
  /// de formar a grade de meridianos que a esfera antiga tinha.
  const arcos = [];
  for (let a = 0; a < ARCOS; a++) {
    // Dois vetores perpendiculares definem o plano do círculo.
    const incl = sorteio(0, Math.PI);
    const azim = sorteio(0, Math.PI * 2);
    const u = [Math.cos(azim), 0, Math.sin(azim)];
    const n = [
      Math.sin(incl) * Math.cos(azim + Math.PI / 2),
      Math.cos(incl),
      Math.sin(incl) * Math.sin(azim + Math.PI / 2),
    ];
    // v = n × u, para fechar a base do plano.
    const v = [
      n[1] * u[2] - n[2] * u[1],
      n[2] * u[0] - n[0] * u[2],
      n[0] * u[1] - n[1] * u[0],
    ];
    // Arco parcial: começar e terminar em pontos sorteados deixa as pontas
    // soltas, como na imagem — círculo fechado pareceria um aro de brinquedo.
    const de = sorteio(0, Math.PI * 2);
    const abertura = sorteio(Math.PI * 0.5, Math.PI * 1.9);
    arcos.push({
      u,
      v,
      de,
      abertura,
      raio: sorteio(0.74, 1.02),
      acento: Math.random() < FRACAO_ACENTO,
      brilho: sorteio(0.5, 1),
    });
  }

  /// Trilhas de circuito: andam sobre a superfície em ângulo reto — um trecho
  /// variando só a longitude, o seguinte só a latitude. É a alternância que
  /// produz os "degraus" da referência; variar os dois ao mesmo tempo daria
  /// uma linha torta qualquer.
  const trilhas = [];
  for (let t = 0; t < TRILHAS; t++) {
    const pontos = [];
    let lat = sorteio(-1.2, 1.2);
    let lon = sorteio(0, Math.PI * 2);
    let emLongitude = Math.random() < 0.5;
    pontos.push({ lat, lon });
    for (let c = 0; c < CANTOS_TRILHA; c++) {
      const passo = sorteio(0.1, 0.42) * (Math.random() < 0.5 ? -1 : 1);
      if (emLongitude) lon += passo;
      else lat = Math.max(-1.45, Math.min(1.45, lat + passo));
      emLongitude = !emLongitude;
      pontos.push({ lat, lon });
    }
    trilhas.push({
      pontos,
      raio: sorteio(0.97, 1.03),
      acento: Math.random() < FRACAO_ACENTO,
      fase: sorteio(0, Math.PI * 2),
    });
  }

  /// Poeira: pontinhos soltos pela casca, para a esfera não ficar só de linhas.
  const poeira = [];
  for (let i = 0; i < POEIRA; i++) {
    poeira.push({
      lat: Math.asin(sorteio(-1, 1)),
      lon: sorteio(0, Math.PI * 2),
      raio: sorteio(0.9, 1.08),
      fase: sorteio(0, Math.PI * 2),
      vel: sorteio(0.0004, 0.0022) * (Math.random() < 0.3 ? -1 : 1),
    });
  }

  /// Os sinais correm pelas trilhas — é o que a referência não mostra (é uma
  /// imagem parada) e que esta precisa ter: alguma coisa viva circulando.
  const pulsos = [];
  function novoPulso() {
    const t = trilhas[(Math.random() * trilhas.length) | 0];
    return { t, i: 0, p: 0, vel: sorteio(0.012, 0.035) };
  }

  // --- Tamanho ---
  let cx = 0, cy = 0, raioTela = 0, lado = 0;
  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, perfil.dpr);
    lado = canvas.clientWidth || 260;
    canvas.width = Math.round(lado * dpr);
    canvas.height = Math.round(lado * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = lado / 2;
    cy = lado / 2;
    raioTela = lado * 0.4;
  }
  window.addEventListener("resize", redimensionar);

  /// Esférica → cartesiana → rotação → perspectiva. `f` é o fator usado para
  /// encolher e apagar o que está longe.
  function projetar(lat, lon, raio) {
    const cl = Math.cos(lat);
    const x = cl * Math.cos(lon) * raio;
    const y0 = Math.sin(lat) * raio;
    let z = cl * Math.sin(lon) * raio;

    const cy_ = Math.cos(giroY), sy = Math.sin(giroY);
    const x1 = x * cy_ - z * sy;
    z = x * sy + z * cy_;

    const cx_ = Math.cos(giroX), sx = Math.sin(giroX);
    const y = y0 * cx_ - z * sx;
    z = y0 * sx + z * cx_;

    const f = DIST_FOCAL / (DIST_FOCAL + z);
    return { x: cx + x1 * raioTela * f, y: cy + y * raioTela * f, z, f };
  }

  /// Mesma projeção, para geometria que já nasce em cartesiano — é o caso dos
  /// arcos, definidos por um plano, e das órbitas do átomo.
  function projetarXYZ(x, y0, z0) {
    let z = z0;
    const cy_ = Math.cos(giroY), sy = Math.sin(giroY);
    const x1 = x * cy_ - z * sy;
    z = x * sy + z * cy_;

    const cx_ = Math.cos(giroX), sx = Math.sin(giroX);
    const y = y0 * cx_ - z * sx;
    z = y0 * sx + z * cx_;

    const f = DIST_FOCAL / (DIST_FOCAL + z);
    return { x: cx + x1 * raioTela * f, y: cy + y * raioTela * f, z, f };
  }

  const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

  /// A cor do realce: o que no escuro é branco, no claro é tinta escura.
  const realce = () => (claro ? [16, 32, 48] : [255, 255, 255]);
  /// Quanto reforçar a opacidade dos traços finos sobre fundo claro.
  const reforco = () => (claro ? 1.75 : 1);

  /// Raio da superfície num ponto: a voz faz uma onda correr pela rede, em vez
  /// de só inflá-la — é o que dá a impressão de holograma reagindo.
  function raioEm(lat, tempo) {
    const onda = Math.sin(lat * 3 + tempo / 260) * 0.5 + Math.sin(lat * 7 - tempo / 180) * 0.5;
    return 1 + nivel * 0.1 + nivel * onda * 0.09;
  }

  function novoAgrupador() {
    const baldes = new Map();
    return {
      add(a, b, alpha) {
        if (alpha < 0.015) return;
        const faixa = Math.min(FAIXAS - 1, (alpha * FAIXAS) | 0);
        let lista = baldes.get(faixa);
        if (!lista) baldes.set(faixa, (lista = []));
        lista.push(a, b);
      },
      pintar(cor, largura) {
        ctx.lineWidth = largura;
        for (const [faixa, pontos] of baldes) {
          ctx.strokeStyle = rgba(cor, ((faixa + 0.5) / FAIXAS).toFixed(3));
          ctx.beginPath();
          for (let k = 0; k < pontos.length; k += 2) {
            ctx.moveTo(pontos[k].x, pontos[k].y);
            ctx.lineTo(pontos[k + 1].x, pontos[k + 1].y);
          }
          ctx.stroke();
        }
      },
    };
  }

  let pontosDesenhados = 0;

  function desenhar(tempo) {
    const cor = CORES[estado] || CORES.idle;
    const ativa = estado !== "idle";
    pontosDesenhados = 0;

    giroY += 0.0030 + nivel * 0.008 + (estado === "thinking" ? 0.005 : 0);
    giroX = 0.42 + Math.sin(tempo / 5200) * 0.12;
    const sopro = 1 + nivel * 0.08;

    ctx.clearRect(0, 0, lado, lado);

    // --- 1. arcos de círculo máximo ---------------------------------------
    const teia = novoAgrupador();
    const teiaQuente = novoAgrupador();
    for (let a = 0; a < arcos.length; a += perfil.salto) {
      const arco = arcos[a];
      const r = arco.raio * sopro;
      let anterior = null;
      for (let i = 0; i < PONTOS_ARCO; i++) {
        const ang = arco.de + (i / (PONTOS_ARCO - 1)) * arco.abertura;
        const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
        const atual = projetarXYZ(
          arco.u[0] * ca + arco.v[0] * sa,
          arco.u[1] * ca + arco.v[1] * sa,
          arco.u[2] * ca + arco.v[2] * sa
        );
        pontosDesenhados++;
        if (anterior) {
          const prof = (anterior.f + atual.f) / 2;
          const alpha =
            Math.max(0, (prof - 0.76) * 0.85) * arco.brilho * (0.5 + nivel * 0.5) * reforco();
          (arco.acento ? teiaQuente : teia).add(anterior, atual, Math.min(1, alpha));
        }
        anterior = atual;
      }
    }
    teia.pintar(cor, 1);
    teiaQuente.pintar(ACENTO, 1);

    // --- 2. trilhas de circuito + os cantos --------------------------------
    const circuito = novoAgrupador();
    const circuitoQuente = novoAgrupador();
    const cantos = [];
    for (let t = 0; t < trilhas.length; t += perfil.salto) {
      const trilha = trilhas[t];
      const r = trilha.raio * sopro + Math.sin(tempo / 1400 + trilha.fase) * 0.012;
      let anterior = null;
      for (const ponto of trilha.pontos) {
        const atual = projetar(ponto.lat, ponto.lon, r);
        pontosDesenhados++;
        if (anterior) {
          const prof = (anterior.f + atual.f) / 2;
          const alpha = Math.max(0, (prof - 0.76) * 1.05) * (0.55 + nivel * 0.45) * reforco();
          (trilha.acento ? circuitoQuente : circuito).add(anterior, atual, Math.min(1, alpha));
        }
        // O ponto em cada curva de 90° é o que faz parecer circuito, e não
        // uma linha quebrada qualquer.
        if (atual.f > 0.74) cantos.push(atual); // corte só de segurança: quem apaga o fundo é a transparência
        anterior = atual;
      }
    }
    circuito.pintar(cor, 1);
    circuitoQuente.pintar(ACENTO, 1);

    // --- pontos: cantos das trilhas + poeira solta -------------------------
    const baldes = new Map();
    const guardar = (q, alpha, r) => {
      const faixa = Math.min(FAIXAS - 1, (alpha * FAIXAS) | 0);
      let lista = baldes.get(faixa);
      if (!lista) baldes.set(faixa, (lista = []));
      lista.push({ q, r });
    };
    for (const q of cantos) guardar(q, Math.min(1, (q.f - 0.76) * 1.3), Math.max(0.5, 1.3 * q.f));
    for (const p of poeira) {
      p.lon += p.vel + nivel * 0.002;
      const q = projetar(p.lat, p.lon, p.raio * sopro);
      pontosDesenhados++;
      const cintila = 0.55 + 0.45 * Math.sin(tempo / 800 + p.fase);
      guardar(
        q,
        Math.min(1, Math.max(0.03, (q.f - 0.72) * 1.2) * cintila * (0.6 + nivel * 0.4)),
        Math.max(0.4, 1.1 * q.f)
      );
    }
    for (const [faixa, itens] of baldes) {
      ctx.fillStyle = rgba(cor, ((faixa + 0.5) / FAIXAS).toFixed(3));
      ctx.beginPath();
      for (const { q, r } of itens) {
        ctx.moveTo(q.x + r, q.y); // sem isto os círculos saem ligados por linhas
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // --- 3. sinais correndo pelas trilhas ----------------------------------
    if (perfil.particulas) {
      const alvo = Math.min(PULSOS_MAX, Math.round((ativa ? 10 : 4) + nivel * 16));
      while (pulsos.length < alvo) pulsos.push(novoPulso());
      while (pulsos.length > alvo) pulsos.pop();

      ctx.fillStyle = rgba(realce(), (0.55 + nivel * 0.35).toFixed(3));
      ctx.beginPath();
      for (const p of pulsos) {
        p.p += p.vel * (1 + nivel * 1.2) * (estado === "thinking" ? 1.7 : 1);
        if (p.p >= 1) {
          p.p = 0;
          p.i++;
          if (p.i >= p.t.pontos.length - 1) Object.assign(p, novoPulso());
        }
        const de = p.t.pontos[p.i];
        const ate = p.t.pontos[p.i + 1];
        if (!de || !ate) continue;
        const q = projetar(
          de.lat + (ate.lat - de.lat) * p.p,
          de.lon + (ate.lon - de.lon) * p.p,
          p.t.raio * sopro
        );
        if (q.f < 0.74) continue; // atrás da esfera: não acende
        const r = Math.max(0.7, 2 * q.f);
        ctx.moveTo(q.x + r, q.y);
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        pontosDesenhados++;
      }
      ctx.fill();
    }

    // --- o limbo: o contorno da esfera, um círculo de verdade ---------------
    // Sem ele, a forma era só a malha da frente, e a malha muda de desenho a
    // cada giro — às vezes mais larga, às vezes mais alta. O traço fino fixa
    // a silhueta redonda; a malha corre por dentro dele.
    const rLimbo = raioTela * LIMBO * sopro;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(cor, ((claro ? 0.42 : 0.3) + nivel * 0.25).toFixed(3));
    ctx.beginPath();
    ctx.arc(cx, cy, rLimbo, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(cor, (claro ? 0.14 : 0.1).toFixed(3));
    ctx.beginPath();
    ctx.arc(cx, cy, rLimbo * 0.965, 0, Math.PI * 2);
    ctx.stroke();

    // --- brilho de borda (o "limbo" do holograma) ---
    const rBorda = rLimbo;
    const halo = ctx.createRadialGradient(cx, cy, rBorda * 0.8, cx, cy, rBorda * 1.12);
    // No escuro é brilho; no claro, somar luz sobre branco não aparece, então
    // o mesmo gradiente vira uma sombra de contorno — mais forte para existir.
    const corHalo = claro ? realce() : cor;
    halo.addColorStop(0, rgba(corHalo, 0));
    halo.addColorStop(0.62, rgba(corHalo, ((claro ? 0.05 : 0.08) + nivel * 0.1).toFixed(3)));
    halo.addColorStop(1, rgba(corHalo, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, rBorda * 1.12, 0, Math.PI * 2);
    ctx.fill();

    // --- 4. o núcleo em átomo ----------------------------------------------
    // Três elipses cruzadas, giradas em ritmos diferentes: é a figura clássica
    // de átomo, que é o que está no centro da referência.
    const rAtomo = 0.3 + nivel * 0.06;
    const orbitas = novoAgrupador();
    for (let o = 0; o < 3; o++) {
      const incl = (o / 3) * Math.PI;
      const giro = tempo / (2600 + o * 700);
      let anterior = null;
      for (let i = 0; i <= 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        // Círculo no plano XY, inclinado e depois girado no próprio eixo.
        const x0 = Math.cos(ang) * rAtomo;
        const y1 = Math.sin(ang) * rAtomo * Math.cos(incl);
        const z1 = Math.sin(ang) * rAtomo * Math.sin(incl);
        const atual = projetarXYZ(
          x0 * Math.cos(giro) - z1 * Math.sin(giro),
          y1,
          x0 * Math.sin(giro) + z1 * Math.cos(giro)
        );
        pontosDesenhados++;
        if (anterior) orbitas.add(anterior, atual, Math.min(1, Math.max(0, (atual.f - 0.8) * 1.6)));
        anterior = atual;
      }
    }
    orbitas.pintar(claro ? realce() : [235, 245, 255], 1);

    // Espículas curtas saindo do centro: na referência é o que faz o núcleo
    // "estourar" em vez de ser só um ponto aceso.
    const espiculas = novoAgrupador();
    const rI = raioTela * 0.1;
    for (let i = 0; i < RAIOS_NUCLEO; i++) {
      const ang = (i / RAIOS_NUCLEO) * Math.PI * 2 + tempo / 9000;
      const comp = rI * (1.3 + 1.5 * (0.5 + 0.5 * Math.sin(tempo / 700 + i)) + nivel * 1.6);
      espiculas.add(
        { x: cx + Math.cos(ang) * rI * 0.4, y: cy + Math.sin(ang) * rI * 0.4 },
        { x: cx + Math.cos(ang) * comp, y: cy + Math.sin(ang) * comp },
        0.1 + nivel * 0.25
      );
    }
    espiculas.pintar(claro ? cor : [215, 238, 255], 1);

    const pulsar = 0.5 + 0.5 * Math.sin(tempo / 900);
    const rNucleo = raioTela * (0.2 + nivel * 0.12 + pulsar * 0.025);
    const nucleo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rNucleo);
    // O núcleo é o ponto mais INTENSO da figura, não o mais claro: no escuro
    // isso é branco, no claro é a tinta escura. Deixar branco aqui apagaria
    // justamente o centro da esfera sobre o fundo branco.
    nucleo.addColorStop(0, rgba(realce(), (0.85 + nivel * 0.15).toFixed(3)));
    nucleo.addColorStop(0.18, rgba(claro ? cor : [235, 248, 255], (0.4 + nivel * 0.3).toFixed(3)));
    nucleo.addColorStop(0.5, rgba(cor, ((claro ? 0.2 : 0.14) + nivel * 0.26).toFixed(3)));
    nucleo.addColorStop(1, rgba(cor, 0));
    ctx.fillStyle = nucleo;
    ctx.beginPath();
    ctx.arc(cx, cy, rNucleo, 0, Math.PI * 2);
    ctx.fill();
  }

  // Parada, ela não precisa de 30 quadros por segundo — e é assim que ela
  // passa a maior parte do tempo.
  const alvoDeFps = () =>
    estado !== "idle" || nivel > 0.01 ? perfil.fps : perfil.parado;

  // DORMIR entre quadros, em vez de acordar junto com a tela e desistir.
  // A versão antiga pedia requestAnimationFrame sempre e saía fora quando
  // ainda não era hora: o desenho respeitava os 10 fps, mas o processo
  // continuava sendo acordado a cada atualização do monitor — 60 vezes por
  // segundo, 120 num ProMotion — só para calcular que não tinha nada a fazer.
  // Com setTimeout o quadro é agendado para a hora certa e nada acorda antes
  // dela; o requestAnimationFrame no fim serve só para encostar o desenho na
  // atualização da tela e evitar rasgo. Como brinde, janela escondida não
  // recebe rAF: a corrente simplesmente espera, e parada ela não custa nada.
  let quadroPedido = false;

  function agendar() {
    if (quadroPedido) return;
    quadroPedido = true;
    const espera = Math.max(0, 1000 / alvoDeFps() - (performance.now() - ultimoQuadro));
    setTimeout(() => requestAnimationFrame(laco), espera);
  }

  function laco(tempo) {
    quadroPedido = false;
    ultimoQuadro = performance.now();
    desenhar(tempo);
    agendar();
  }

  redimensionar();
  ultimoQuadro = performance.now();
  agendar();

  window.esfera = {
    estado: (e) => (estado = e || "idle"),
    nivel: (v) => (nivel = Math.max(0, Math.min(1, v || 0))),
    tema: (cores) => {
      CORES = { ...CORES, ...(cores || {}) };
    },
    claro: (ligado) => (claro = !!ligado),
    desempenho: (modo) => {
      perfil = PERFIS[modo] || PERFIS.normal;
      redimensionar();
    },
    custo: () => ({
      fps: perfil.fps,
      fpsParado: perfil.parado,
      pontos: pontosDesenhados,
      arcos: arcos.length,
      trilhas: trilhas.length,
      cantos: trilhas.reduce((n, t) => n + t.pontos.length, 0),
      poeira: poeira.length,
    }),
    redimensionar,
  };
})();
