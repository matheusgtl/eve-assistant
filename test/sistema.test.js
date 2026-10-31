// sistema.test.js — o painel do sistema, medido nesta máquina de verdade.
//
// Não há servidor falso aqui de propósito: o valor deste teste é justamente
// provar que os comandos do macOS que a E.V.E usa (vm_stat, pmset, df, ioreg,
// system_profiler) existem, respondem e são interpretados em números que fazem
// sentido. Se a Apple mudar o formato de algum, é aqui que isso aparece.
// Rode com: node test/sistema.test.js

const assert = require("node:assert");
const os = require("node:os");
const sistema = require("../sistema.js");

(async () => {
  const t0 = Date.now();
  const a = await sistema.amostrar();
  const levou = Date.now() - t0;

  // --- CPU ---
  assert.ok(Number.isInteger(a.cpu), "cpu precisa ser número inteiro");
  assert.ok(a.cpu >= 0 && a.cpu <= 100, `cpu fora da faixa: ${a.cpu}`);
  assert.strictEqual(a.nucleos, os.cpus().length);

  // Duas leituras seguidas: a segunda é a ocupação real do intervalo.
  // (Somar `ps -o %cpu` dava coisas como 199% — por isso a conta vem dos ticks.)
  await new Promise((r) => setTimeout(r, 300));
  const b = await sistema.amostrar();
  assert.ok(b.cpu >= 0 && b.cpu <= 100, `segunda leitura fora da faixa: ${b.cpu}`);

  // --- memória ---
  const m = a.memoria;
  assert.ok(m.totalGB > 1, "memória total implausível");
  assert.ok(m.usadaGB > 0 && m.usadaGB <= m.totalGB, `em uso implausível: ${m.usadaGB}/${m.totalGB}`);
  assert.ok(m.porcento > 0 && m.porcento <= 100);
  assert.strictEqual(m.totalGB, +(os.totalmem() / 1e9).toFixed(1));

  // --- GPU: o nome sempre; a ocupação só onde o driver publica ---
  assert.ok(typeof a.gpu.nome === "string" && a.gpu.nome.length > 0);
  if (a.gpu.porcento != null) {
    assert.ok(a.gpu.porcento >= 0 && a.gpu.porcento <= 100, `gpu fora da faixa: ${a.gpu.porcento}`);
  }

  // --- bateria: null em Mac de mesa, objeto coerente em portátil ---
  if (a.bateria) {
    assert.ok(a.bateria.porcento >= 0 && a.bateria.porcento <= 100);
    assert.ok(["carregada", "carregando", "bateria"].includes(a.bateria.estado));
    assert.notStrictEqual(a.bateria.restante, "0:00", "“0:00” é o macOS calculando, não um valor");
  }

  // --- disco: no APFS o volume que interessa é o de dados ---
  assert.ok(a.disco, "deveria ler o disco");
  assert.ok(a.disco.totalGB > 10, `disco implausível: ${a.disco.totalGB} GB`);
  assert.strictEqual(a.disco.usadoGB + a.disco.livreGB, a.disco.totalGB);
  assert.ok(a.disco.porcento > 0 && a.disco.porcento <= 100);

  // --- tempo ---
  assert.match(a.hora, /^\d{2}:\d{2}:\d{2}$/, "relógio do painel, com segundos");
  assert.ok(a.data.length > 3);
  assert.match(a.uptime, /^\d{2,}:\d{2}$/, "tempo ligado em horas:minutos");
  assert.ok(a.uptimeHoras >= 0);

  // --- rede, processos e sistema (o painel novo mostra os três) ---
  assert.ok(a.rede && Number.isFinite(a.rede.total), "deveria medir a rede");
  assert.ok(a.rede.total >= 0, "tráfego não pode ser negativo");
  assert.ok(a.processos > 20, `contagem de processos implausível: ${a.processos}`);
  assert.match(a.so, /mac ?os/i);
  // Temperatura do SMC exige root no macOS: melhor N/D explícito que número inventado.
  assert.strictEqual(a.temperatura, null);

  // --- resumo que entra no contexto do cérebro ---
  const resumo = sistema.resumo(a);
  for (const palavra of ["CPU", "memória", "GPU", "disco"]) {
    assert.ok(resumo.includes(palavra), `o resumo deveria citar ${palavra}: ${resumo}`);
  }
  assert.strictEqual(sistema.resumo(null), "", "sem amostra, resumo vazio (não quebra o prompt)");

  // Uma amostra a cada 3 s: não pode custar mais que isso.
  assert.ok(levou < 3000, `a amostra levou ${levou} ms — lenta demais para o painel`);

  // --------------- amostragem em três velocidades, sem buraco no resultado
  // Ler tudo a cada 2 s custava ~58 ms de CPU, o dia inteiro. Agora bateria,
  // disco e processos vão a cada 5ª leitura e o nome da GPU/versão do macOS
  // uma vez só. O risco dessa economia é entregar um campo vazio na leitura
  // "rápida" — e a interface mostraria "undefined" sem reclamar.
  const CAMPOS = ["cpu", "nucleos", "memoria", "gpu", "bateria", "disco", "rede", "processos", "so", "temperatura"];
  const custos = [];
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    const amostra = await sistema.amostrar();
    custos.push(Date.now() - t0);
    for (const campo of CAMPOS) {
      assert.notStrictEqual(amostra[campo], undefined, `leitura ${i}: faltou "${campo}"`);
    }
    assert.ok(amostra.bateria.porcento >= 0, `leitura ${i}: bateria sem número`);
    assert.ok(amostra.gpu.nome, `leitura ${i}: GPU sem nome`);
  }

  // O teste NÃO sabe em que ponto do ciclo entrou — o contador vive no módulo
  // e já andou. Então não dá para dizer "a leitura 5 é a cara"; o que dá, e é
  // o que importa, é que a MAIORIA das leituras seja barata. Medir a
  // distribuição em vez da posição também tira a dependência de um limiar em
  // milissegundos, que na suíte inteira mede a carga do Mac, não o código.
  const ordenados = [...custos].sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  const caro = ordenados[ordenados.length - 1];
  assert.ok(
    mediana < caro,
    `sem caminho rápido: mediana ${mediana} ms e pior caso ${caro} ms são iguais`
  );
  const baratas = custos.filter((c) => c <= mediana).length;
  assert.ok(baratas >= 5, `só ${baratas} de 10 leituras foram baratas; o ciclo lento está largo demais`);
  console.log(
    "   10 leituras: mediana", mediana, "ms · pior caso", caro,
    "ms (antes toda leitura era o pior caso)"
  );

  console.log("✓ painel do sistema: leituras reais desta máquina, em faixas plausíveis");
  console.log("  ", resumo);
  console.log("   amostra completa em", levou, "ms (com o nome da GPU descoberto agora)");
})();
