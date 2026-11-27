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
//
// A REDE DE VERDADE (26/11/2026). Desde que a Sexta-Feira tem uma rede neural
// própria (rede.js), a poeira e os sinais sorteados deram lugar a ela: cada
// ponto aceso é um NEURÔNIO da rede, agrupado com a sua população (sentidos em
// cima, interneurônios no equador, motores embaixo, assembleias que nasceram
// do aprendizado entre o sentido e o motor que ligam), e acende com os
// disparos reais medidos no último segundo. Os sinais que correm são as
// LIGAÇÕES reais: saem mais de quem está disparando, na proporção do peso;
// excitatórios em branco, inibitórios na cor quente. Neurônio novo nasce com
// um anel. Sem dados da rede (antes do primeiro tique), volta a decoração.
//
// MODELOS (26/11/2026), escolhidos em Configurações › Aparência:
//   • "holografica" — a casca de arcos e trilhas de circuito, o átomo no
//     centro, e a rede real por dentro (o modelo de sempre);
//   • "neural" — só a rede: casca mínima de meridianos, neurônios maiores,
//     ligações curvas sobre a superfície e um núcleo que brilha com a
//     atividade TOTAL da rede. A mesma rede, os mesmos disparos; muda só a
//     moldura. Sem dados da rede, o "neural" mostra a holográfica.

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
  const MODELOS = ["holografica", "neural"];
  let modelo = "holografica";
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
    // CURVAS NA CASCA (26/11/2026, "ainda existem linhas retas entre os
    // neurônios"). Cada trecho ia de um canto ao outro numa reta só — uma
    // corda que cortava a esfera, com um ponto em cada ponta que parece
    // neurônio. Agora o trecho é desenhado em passos curtos SOBRE a casca
    // (um paralelo ou um meridiano), e a linha acompanha a curvatura. Os
    // pontos continuam só nos cantos.
    const caminho = [];
    for (let k = 0; k < pontos.length - 1; k++) {
      const a = pontos[k], b = pontos[k + 1];
      const passos = Math.max(2, Math.ceil(Math.max(Math.abs(b.lat - a.lat), Math.abs(b.lon - a.lon)) / 0.1));
      for (let i = k === 0 ? 0 : 1; i <= passos; i++) {
        const u = i / passos;
        caminho.push({ lat: a.lat + (b.lat - a.lat) * u, lon: a.lon + (b.lon - a.lon) * u, canto: i === 0 || i === passos });
      }
    }
    trilhas.push({
      pontos,
      caminho,
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

  // --- A rede real -------------------------------------------------------
  const COR_NASCIMENTO = [120, 255, 190];
  // Poucas faixas de transparência na camada da rede: cada faixa × cor é uma
  // pintura, e a esfera inteira tem teto de pinturas por quadro (esfera.test).
  const FAIXAS_NEURONIO = 2; // o brilho do disparo aparece no TAMANHO do ponto
  const FAIXAS_FIO = 2;
  let rede = null; // { versao, neuronios: [], pools: [], ligacoes: [] }
  const sinais = []; // pulsos entre neurônios de verdade
  const SINAIS_MAX = 40;
  let ultimoTempoRede = null;

  // Ruído determinístico por índice: o mesmo neurônio cai sempre no mesmo lugar.
  const fixo = (i, k) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  /// Onde cada população mora na casca. Bandas por grupo, com as populações
  /// espalhadas em longitude; a assembleia fica entre o sentido e o motor dela.
  function montarRede(topo) {
    const pools = topo.pools.map((p, i) => ({ ...p, i, neuronios: [], taxa: 0 }));
    const faixas = { sentido: [0.55, 1.1], inter: [-0.3, 0.3], motor: [-1.1, -0.55] };
    for (const grupo of Object.keys(faixas)) {
      const doGrupo = pools.filter((p) => p.grupo === grupo);
      doGrupo.forEach((p, k) => {
        const [a, b] = faixas[grupo];
        p.lat = a + (b - a) * ((k * 0.618) % 1);
        p.lon = (k / doGrupo.length) * Math.PI * 2 + (grupo === "inter" ? 0.4 : grupo === "motor" ? 0.9 : 0);
        p.raio = 1;
      });
    }
    const porNome = Object.fromEntries(pools.map((p) => [p.nome, p]));
    for (const p of pools.filter((x) => x.grupo === "assembleia")) {
      const [canal, motor] = p.nome.slice(2).split(">");
      const a = porNome[canal];
      const b = porNome[motor];
      p.lat = a && b ? (a.lat + b.lat) / 2 : 0;
      p.lon = a && b ? Math.atan2(Math.sin(a.lon) + Math.sin(b.lon), Math.cos(a.lon) + Math.cos(b.lon)) : 0;
      p.raio = 1.07;
    }
    const antigos = new Set((rede?.pools || []).map((p) => p.nome));
    const neuronios = [];
    for (const p of pools) {
      const novo = rede && !antigos.has(p.nome);
      for (let k = 0; k < p.n; k++) {
        const id = neuronios.length;
        const n = {
          pool: p,
          lat: p.lat + (fixo(id, 1) - 0.5) * 0.26,
          lon: p.lon + (fixo(id, 2) - 0.5) * 0.3,
          raio: p.raio + (fixo(id, 3) - 0.5) * 0.04,
          taxa: 0, // disparos por segundo, medidos
          brilho: 0,
          nasceu: novo ? 1 : 0, // anel de nascimento
        };
        p.neuronios.push(n);
        neuronios.push(n);
      }
    }
    const ligacoes = (topo.ligacoes || [])
      .filter(([a, b, w]) => pools[a] && pools[b] && Math.abs(w) >= 0.04)
      .map(([a, b, w]) => ({ de: pools[a], para: pools[b], peso: w }));
    rede = { versao: topo.versao, pools, neuronios, ligacoes };
    sinais.length = 0;
  }

  function receberRede(dados) {
    if (!dados || !dados.topologia) return;
    if (!rede || rede.versao !== dados.topologia.versao) montarRede(dados.topologia);
    const d = dados.disparos || [];
    rede.neuronios.forEach((n, i) => (n.taxa = Number(d[i]) || 0));
    for (const p of rede.pools) p.taxa = p.neuronios.reduce((s, n) => s + n.taxa, 0) / Math.max(1, p.n);
  }

  /// Ponto entre dois neurônios pela superfície (interpolação esférica simples).
  function entre(a, b, t) {
    const ax = Math.cos(a.lat) * Math.cos(a.lon), ay = Math.sin(a.lat), az = Math.cos(a.lat) * Math.sin(a.lon);
    const bx = Math.cos(b.lat) * Math.cos(b.lon), by = Math.sin(b.lat), bz = Math.cos(b.lat) * Math.sin(b.lon);
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    const m = Math.hypot(x, y, z) || 1;
    const arco = 1 + Math.sin(Math.PI * t) * 0.12; // o sinal sobe um pouco acima da casca
    const r = (a.raio + (b.raio - a.raio) * t) * arco;
    return { lat: Math.asin(Math.max(-1, Math.min(1, y / m))), lon: Math.atan2(z, x), raio: r };
  }

  /// Quantos trechos uma curva entre dois neurônios precisa para não mostrar
  /// quina: um a cada ~0,12 rad do ângulo entre eles, de 6 a 16.
  function trechosDoArco(a, b) {
    const ax = Math.cos(a.lat) * Math.cos(a.lon), ay = Math.sin(a.lat), az = Math.cos(a.lat) * Math.sin(a.lon);
    const bx = Math.cos(b.lat) * Math.cos(b.lon), by = Math.sin(b.lat), bz = Math.cos(b.lat) * Math.sin(b.lon);
    const ang = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)));
    return Math.max(6, Math.min(16, Math.ceil(ang / 0.12)));
  }

  /// Desenha a rede real: ligações ativas, neurônios e sinais.
  /// Casca do modelo neural: três paralelos e três meridianos, bem fracos.
  /// É só para a esfera ter forma; quem ocupa a figura é a rede.
  function desenharCasca(cor, sopro) {
    const casca = novoAgrupador(2);
    const passos = 28;
    const linha = (ponto) => {
      let anterior = null;
      for (let i = 0; i <= passos; i++) {
        const atual = ponto(i / passos);
        pontosDesenhados++;
        if (anterior) casca.add(anterior, atual, Math.max(0, ((anterior.f + atual.f) / 2 - 0.78) * 0.9) * reforco());
        anterior = atual;
      }
    };
    for (const lat of [-0.7, 0, 0.7]) linha((u) => projetar(lat, u * Math.PI * 2, sopro));
    for (const lon of [0, Math.PI / 3, (2 * Math.PI) / 3]) linha((u) => projetar(-Math.PI / 2 + u * Math.PI, lon, sopro));
    casca.pintar(cor, 0.7);
  }

  /// Atividade média da rede (0..1): o núcleo do modelo neural brilha com ela.
  function atividadeDaRede() {
    if (!rede) return 0;
    let soma = 0;
    for (const p of rede.pools) soma += p.taxa;
    return Math.min(1, soma / rede.pools.length / 12);
  }

  function desenharRede(tempo, cor, sopro) {
    const neural = modelo === "neural";
    const dt = ultimoTempoRede === null ? 33 : Math.min(200, Math.max(0, tempo - ultimoTempoRede));
    ultimoTempoRede = tempo;
    const quente = ACENTO;

    // ligações: só aparecem com o pré-sináptico disparando
    // Um fio só para as duas: quem diz se a ligação excita ou inibe é a cor
    // do sinal que corre por ela (branco ou quente), não o fio parado.
    const fios = novoAgrupador(FAIXAS_FIO);
    // Os fios parados só no modelo neural: na holográfica as ligações reais
    // aparecem pelos sinais que correm nelas, e as trilhas de circuito já
    // fazem o papel de fio — desenhar os dois estourava o teto de pintura.
    for (const l of neural ? rede.ligacoes : []) {
      const atividade = Math.min(1, l.de.taxa / 25) * Math.min(1, Math.abs(l.peso) * 4);
      if (atividade < 0.05) continue;
      // A ligação é curva, por cima da casca (o mesmo caminho dos sinais).
      // Eram 4 trechos, e os 4 apareciam como retas emendadas (26/11/2026):
      // agora o número de trechos acompanha o tamanho do arco.
      const centro = { lat: l.de.lat, lon: l.de.lon, raio: l.de.raio };
      const alvo = { lat: l.para.lat, lon: l.para.lon, raio: l.para.raio };
      const segmentos = trechosDoArco(centro, alvo);
      let anterior = projetar(centro.lat, centro.lon, centro.raio * sopro);
      for (let k = 1; k <= segmentos; k++) {
        const p = k === segmentos ? alvo : entre(centro, alvo, k / segmentos);
        const atual = projetar(p.lat, p.lon, p.raio * sopro);
        pontosDesenhados++;
        const alpha = Math.min(1, Math.max(0, ((anterior.f + atual.f) / 2 - 0.74) * 1.2) * atividade * (neural ? 0.95 : 0.7) * reforco());
        fios.add(anterior, atual, alpha);
        anterior = atual;
      }
    }
    fios.pintar(cor, 0.8);

    // sinais nascem nas ligações, na proporção do disparo real × peso
    if (perfil.particulas) {
      for (const l of rede.ligacoes) {
        if (sinais.length >= SINAIS_MAX) break;
        const chance = (l.de.taxa / 25) * Math.abs(l.peso) * 3 * (dt / 1000);
        if (Math.random() < chance) {
          const de = l.de.neuronios[(Math.random() * l.de.n) | 0];
          const para = l.para.neuronios[(Math.random() * l.para.n) | 0];
          if (de && para) sinais.push({ de, para, t: 0, inib: l.peso < 0 });
        }
      }
    }

    // neurônios: piscam com a taxa medida (Poisson), apagam em ~150 ms
    // Duas cores só: excitatório na cor do estado, inibitório na quente. O
    // nascimento aparece no anel (cor própria), não numa terceira cor de ponto.
    const baldes = [new Map(), new Map()];
    const corDe = (n) => (n.pool.tipo === "inh" ? 1 : 0);
    const aneis = [];
    for (const n of rede.neuronios) {
      if (Math.random() < n.taxa * (dt / 1000)) n.brilho = 1;
      n.brilho *= Math.exp(-dt / 150);
      if (n.nasceu > 0) n.nasceu = Math.max(0, n.nasceu - dt / 4000);
      const q = projetar(n.lat, n.lon, n.raio * sopro);
      pontosDesenhados++;
      if (q.f < 0.74) continue;
      const base = (neural ? 0.22 : 0.12) + Math.min(0.35, n.taxa / 60);
      const alpha = Math.min(1, (base + n.brilho * 0.75) * Math.min(1, (q.f - 0.72) * 1.6) * reforco());
      const r = Math.max(0.6, (1 + n.brilho * 1.4) * q.f * (neural ? 1.55 : 1));
      const k = corDe(n);
      const faixa = Math.min(FAIXAS_NEURONIO - 1, (alpha * FAIXAS_NEURONIO) | 0);
      let lista = baldes[k].get(faixa);
      if (!lista) baldes[k].set(faixa, (lista = []));
      lista.push({ q, r });
      if (n.nasceu > 0) aneis.push({ q, r: r + (1 - n.nasceu) * 10, a: n.nasceu });
    }
    const cores = [cor, quente];
    baldes.forEach((mapa, k) => {
      for (const [faixa, itens] of mapa) {
        ctx.fillStyle = rgba(cores[k], ((faixa + 0.5) / FAIXAS_NEURONIO).toFixed(3));
        ctx.beginPath();
        for (const { q, r } of itens) {
          ctx.moveTo(q.x + r, q.y);
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    });
    if (aneis.length) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(COR_NASCIMENTO, 0.5);
      ctx.beginPath();
      for (const { q, r } of aneis) {
        ctx.moveTo(q.x + r, q.y);
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // sinais viajando
    const exc = [];
    const inib = [];
    for (let i = sinais.length - 1; i >= 0; i--) {
      const s = sinais[i];
      s.t += dt / 550;
      if (s.t >= 1) {
        s.para.brilho = Math.max(s.para.brilho, 0.6); // chegou: o alvo acende
        sinais.splice(i, 1);
        continue;
      }
      const p = entre(s.de, s.para, s.t);
      const q = projetar(p.lat, p.lon, p.raio * sopro);
      pontosDesenhados++;
      if (q.f < 0.74) continue;
      (s.inib ? inib : exc).push({ q, r: Math.max(0.7, 1.8 * q.f) });
    }
    for (const [lista, c] of [[exc, realce()], [inib, quente]]) {
      if (!lista.length) continue;
      ctx.fillStyle = rgba(c, (0.6 + nivel * 0.3).toFixed(3));
      ctx.beginPath();
      for (const { q, r } of lista) {
        ctx.moveTo(q.x + r, q.y);
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
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

  function novoAgrupador(faixas = FAIXAS) {
    const baldes = new Map();
    return {
      add(a, b, alpha) {
        if (alpha < 0.015) return;
        const faixa = Math.min(faixas - 1, (alpha * faixas) | 0);
        let lista = baldes.get(faixa);
        if (!lista) baldes.set(faixa, (lista = []));
        lista.push(a, b);
      },
      pintar(cor, largura) {
        ctx.lineWidth = largura;
        for (const [faixa, pontos] of baldes) {
          ctx.strokeStyle = rgba(cor, ((faixa + 0.5) / faixas).toFixed(3));
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

    // O modelo neural troca a casca decorativa (arcos, trilhas, poeira) por
    // uma casca mínima: a figura passa a ser só a rede.
    const neural = modelo === "neural" && !!rede;
    if (neural) desenharCasca(cor, sopro);
    else {
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
      for (const ponto of trilha.caminho) {
        const atual = projetar(ponto.lat, ponto.lon, r);
        pontosDesenhados++;
        if (anterior) {
          const prof = (anterior.f + atual.f) / 2;
          const alpha = Math.max(0, (prof - 0.76) * 1.05) * (0.55 + nivel * 0.45) * reforco();
          (trilha.acento ? circuitoQuente : circuito).add(anterior, atual, Math.min(1, alpha));
        }
        // O ponto em cada curva de 90° é o que faz parecer circuito, e não
        // uma linha quebrada qualquer.
        if (ponto.canto && atual.f > 0.74) cantos.push(atual); // corte só de segurança: quem apaga o fundo é a transparência
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
    for (const p of rede ? [] : poeira) {
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

    }

    // --- 3. a rede de verdade, ou os sinais decorativos sem ela ------------
    if (rede) desenharRede(tempo, cor, sopro);
    else if (perfil.particulas) {
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

    if (!neural) {
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

    }

    const pulsar = 0.5 + 0.5 * Math.sin(tempo / 900);
    // No neural o núcleo é menor e acende com a atividade total da rede.
    const rNucleo = neural
      ? raioTela * (0.1 + atividadeDaRede() * 0.12 + nivel * 0.08 + pulsar * 0.015)
      : raioTela * (0.2 + nivel * 0.12 + pulsar * 0.025);
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
  // Pausada (27/11/2026): a abertura do dia cobre a janela inteira, e a esfera
  // seguia desenhando por baixo, disputando o quadro com a animação. Pausada,
  // ela acorda 2 vezes por segundo só para ver se já pode voltar.
  let pausada = false;
  const alvoDeFps = () =>
    pausada ? 2 : estado !== "idle" || nivel > 0.01 ? perfil.fps : perfil.parado;

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
    if (!pausada) desenhar(tempo);
    agendar();
  }

  redimensionar();
  ultimoQuadro = performance.now();
  agendar();

  window.esfera = {
    estado: (e) => (estado = e || "idle"),
    // Para de desenhar enquanto algo cobre a esfera (a abertura do dia).
    pausa: (sim) => (pausada = !!sim),
    nivel: (v) => (nivel = Math.max(0, Math.min(1, v || 0))),
    tema: (cores) => {
      CORES = { ...CORES, ...(cores || {}) };
    },
    claro: (ligado) => (claro = !!ligado),
    desempenho: (modo) => {
      perfil = PERFIS[modo] || PERFIS.normal;
      redimensionar();
    },
    // { topologia, disparos } de rede.js, a cada segundo (main.js → ev:rede).
    rede: receberRede,
    // Sem argumento, só diz qual está em uso.
    modelo: (m) => {
      if (m !== undefined) modelo = MODELOS.includes(m) ? m : "holografica";
      return modelo;
    },
    modelos: () => [...MODELOS],
    neuronios: () => (rede ? rede.neuronios.length : 0),
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
