// sistema.js — estado do Mac: CPU, memória, GPU, bateria, disco, tempo.
//
// Tudo aqui precisa ser barato, porque é lido a cada poucos segundos para
// alimentar o painel da interface. Duas decisões por causa disso:
//
//   CPU — calculada a partir de os.cpus(), que devolve os contadores de ticks
//   de cada núcleo. Dois instantes bastam para saber a ocupação real, sem
//   subprocesso nenhum. (`ps -o %cpu` NÃO serve: ele mostra a média desde
//   que cada processo nasceu, e somar isso dá números como "199%".)
//
//   GPU — o ioreg expõe "Device Utilization %" do acelerador gráfico; é a
//   única fonte de ocupação de GPU que existe sem instalar nada. O nome da
//   placa vem do system_profiler, que é lento, então é lido uma única vez.

const os = require("node:os");
const { execFile } = require("node:child_process");

const sh = (cmd, args, timeout = 4000) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      resolve(err ? "" : stdout)
    );
  });

// --------------------------------------------------------------------------
// CPU — diferença entre duas leituras dos contadores de ticks
// --------------------------------------------------------------------------
let anterior = null;

function lerTicks() {
  let ocupado = 0;
  let total = 0;
  for (const nucleo of os.cpus()) {
    const t = nucleo.times;
    ocupado += t.user + t.nice + t.sys + t.irq;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  }
  return { ocupado, total };
}

function cpuPorcento() {
  const agora = lerTicks();
  if (!anterior) {
    anterior = agora;
    // Primeira leitura não tem com o que comparar: usa a média desde o boot.
    return agora.total ? (agora.ocupado / agora.total) * 100 : 0;
  }
  const dOcupado = agora.ocupado - anterior.ocupado;
  const dTotal = agora.total - anterior.total;
  anterior = agora;
  if (dTotal <= 0) return 0;
  return Math.max(0, Math.min(100, (dOcupado / dTotal) * 100));
}

// --------------------------------------------------------------------------
// Memória — o "em uso" do macOS é ativa + wired + comprimida
// --------------------------------------------------------------------------
async function memoria() {
  const out = await sh("/usr/bin/vm_stat", []);
  const total = os.totalmem();

  const pagina = Number((out.match(/page size of (\d+)/) || [])[1]) || 4096;
  const campo = (rotulo) => {
    const m = out.match(new RegExp(rotulo.replace(/ /g, "\\s+") + ":\\s+(\\d+)"));
    return m ? Number(m[1]) * pagina : 0;
  };

  const ativa = campo("Pages active");
  const wired = campo("Pages wired down");
  const comprimida = campo("Pages occupied by compressor");
  const usada = ativa + wired + comprimida;

  // Sem o vm_stat (improvável), cai para a conta grosseira do Node.
  const emUso = usada > 0 ? usada : total - os.freemem();
  return {
    usadaGB: +(emUso / 1e9).toFixed(1),
    totalGB: +(total / 1e9).toFixed(1),
    porcento: Math.round((emUso / total) * 100),
    comprimidaGB: +(comprimida / 1e9).toFixed(1),
  };
}

// --------------------------------------------------------------------------
// GPU
// --------------------------------------------------------------------------
let nomeGPU = null;

async function gpuNome() {
  if (nomeGPU !== null) return nomeGPU;
  const out = await sh("/usr/sbin/system_profiler", ["SPDisplaysDataType"], 8000);
  nomeGPU = ((out.match(/Chipset Model:\s*(.+)/) || [])[1] || "").trim() || "GPU";
  return nomeGPU;
}

async function gpuUso() {
  const out = await sh("/usr/sbin/ioreg", ["-r", "-d", "1", "-w", "0", "-c", "IOAccelerator"]);
  const valores = [...out.matchAll(/"Device Utilization %"=(\d+)/g)].map((m) => Number(m[1]));
  if (!valores.length) return null; // sem essa chave: Macs onde o driver não publica
  return Math.max(...valores);
}

// --------------------------------------------------------------------------
// Bateria
// --------------------------------------------------------------------------
async function bateria() {
  const out = await sh("/usr/bin/pmset", ["-g", "batt"]);
  if (!out) return null;
  if (/no batteries/i.test(out)) return null; // Mac de mesa

  const porcento = Number((out.match(/(\d+)%/) || [])[1]);
  const estado = /AC Power/.test(out)
    ? /charged/i.test(out)
      ? "carregada"
      : "carregando"
    : "bateria";
  const restante = (out.match(/(\d+:\d\d) remaining/) || [])[1] || null;

  return {
    porcento: Number.isFinite(porcento) ? porcento : null,
    estado,
    // "0:00" é o que o macOS devolve quando ainda está calculando.
    restante: restante && restante !== "0:00" ? restante : null,
  };
}

// --------------------------------------------------------------------------
// Disco — no APFS o volume que interessa é o de dados, não a raiz selada
// --------------------------------------------------------------------------
async function disco() {
  const out = await sh("/bin/df", ["-k", "/System/Volumes/Data"]);
  const linha = out.trim().split("\n").pop() || "";
  const partes = linha.split(/\s+/);
  const usado = Number(partes[2]) * 1024;
  const livre = Number(partes[3]) * 1024;
  if (!Number.isFinite(usado) || !Number.isFinite(livre)) return null;
  const total = usado + livre;
  // Arredonda as partes e soma: assim "186 + 46 = 233" não aparece no painel.
  const usadoGB = Math.round(usado / 1e9);
  const livreGB = Math.round(livre / 1e9);
  return {
    usadoGB,
    livreGB,
    totalGB: usadoGB + livreGB,
    porcento: Math.round((usado / total) * 100),
  };
}

// --------------------------------------------------------------------------
// Rede — bytes por segundo, pela diferença entre duas leituras do netstat
// --------------------------------------------------------------------------
let redeAnterior = null;
let interfacePadrao = null;

async function qualInterface() {
  if (interfacePadrao) return interfacePadrao;
  const out = await sh("/sbin/route", ["-n", "get", "default"]);
  interfacePadrao = ((out.match(/interface:\s*(\w+)/) || [])[1] || "en0").trim();
  return interfacePadrao;
}

async function rede() {
  const iface = await qualInterface();
  const out = await sh("/usr/sbin/netstat", ["-ib"]);

  // A primeira linha da interface (a do <Link#>) é a que traz os totais;
  // as outras repetem os mesmos números por endereço.
  const linha = out.split("\n").find((l) => l.startsWith(iface + " ") && /<Link#/.test(l));
  if (!linha) return { entrada: 0, saida: 0, total: 0 };

  const campos = linha.trim().split(/\s+/);
  const recebidos = Number(campos[6]);
  const enviados = Number(campos[9]);
  if (!Number.isFinite(recebidos) || !Number.isFinite(enviados)) {
    return { entrada: 0, saida: 0, total: 0 };
  }

  const agora = Date.now();
  const anterior = redeAnterior;
  redeAnterior = { recebidos, enviados, quando: agora };
  if (!anterior) return { entrada: 0, saida: 0, total: 0, iface };

  const segundos = Math.max(0.2, (agora - anterior.quando) / 1000);
  // Contadores podem zerar (interface reiniciada): nesse caso, descarta.
  const entrada = Math.max(0, (recebidos - anterior.recebidos) / segundos);
  const saida = Math.max(0, (enviados - anterior.enviados) / segundos);
  return { entrada, saida, total: entrada + saida, iface };
}

// --------------------------------------------------------------------------
// Processos, sistema e temperatura
// --------------------------------------------------------------------------
async function processos() {
  const out = await sh("/bin/ps", ["-A", "-o", "pid="]);
  return out ? out.trim().split("\n").length : null;
}

let nomeSO = null;
async function sistemaOperacional() {
  if (nomeSO) return nomeSO;
  const produto = (await sh("/usr/bin/sw_vers", ["-productName"])).trim();
  const versao = (await sh("/usr/bin/sw_vers", ["-productVersion"])).trim();
  nomeSO = [produto || "macOS", versao].filter(Boolean).join(" ");
  return nomeSO;
}

/// Temperatura do processador. No macOS isso vem do SMC, e as duas formas de
/// ler (powermetrics e o IOKit do SMC) exigem root — pedir sua senha por um
/// número no painel não vale a pena. Então: N/D, dito com todas as letras,
/// em vez de inventar um valor.
async function temperatura() {
  return null;
}

// --------------------------------------------------------------------------
// Amostra completa — é isto que a interface recebe
// --------------------------------------------------------------------------
// Nem toda medida precisa da mesma cadência, e ler tudo a cada 2 segundos
// custava ~58 ms de CPU — 2,9% de um núcleo com o app aberto o dia inteiro.
// A amostragem ficou em três velocidades, pela natureza de cada número:
//
//   • o que muda a cada segundo (CPU, memória, GPU, rede) → sempre;
//   • o que muda em minutos (bateria, disco, nº de processos) → a cada 5ª
//     leitura, ~10 s. Juntas custavam 69 dos 58 ms do caminho paralelo, e a
//     barra de bateria não anda mais depressa por ser lida cinco vezes mais;
//   • o que NÃO muda enquanto o app vive (nome da GPU, versão do macOS) → uma
//     vez só. Isso era um `sw_vers` e um `system_profiler` por amostragem para
//     devolver sempre a mesma string.
const LENTAS_A_CADA = 5;
let contador = 0;
let lentas = null;
let fixas = null;

async function amostrar() {
  const precisaDasLentas = !lentas || contador % LENTAS_A_CADA === 0;
  contador++;

  const [mem, gpu, net] = await Promise.all([memoria(), gpuUso(), rede()]);

  if (!fixas) {
    const [nomeGpu, versaoSo] = await Promise.all([gpuNome(), sistemaOperacional()]);
    fixas = { nomeGpu, versaoSo };
  }
  if (precisaDasLentas) {
    const [bat, dsk, procs, temp] = await Promise.all([
      bateria(),
      disco(),
      processos(),
      temperatura(),
    ]);
    lentas = { bat, dsk, procs, temp };
  }

  const { nomeGpu: nome, versaoSo: so } = fixas;
  const { bat, dsk, procs, temp } = lentas;

  const agora = new Date();
  const seg = Math.floor(os.uptime());
  return {
    cpu: Math.round(cpuPorcento()),
    nucleos: os.cpus().length,
    memoria: mem,
    gpu: { nome, porcento: gpu },
    bateria: bat,
    disco: dsk,
    rede: net,
    processos: procs,
    so,
    temperatura: temp,
    hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    data: agora.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    uptime: `${String(Math.floor(seg / 3600)).padStart(2, "0")}:${String(Math.floor((seg % 3600) / 60)).padStart(2, "0")}`,
    uptimeHoras: +(os.uptime() / 3600).toFixed(1),
  };
}

/// A mesma informação em uma linha, para entrar no contexto do cérebro.
/// Assim a E.V.E responde "sua memória está em 61%" sem gastar uma ferramenta.
function resumo(a) {
  if (!a) return "";
  const partes = [
    `CPU ${a.cpu}% (${a.nucleos} núcleos)`,
    `memória ${a.memoria.usadaGB}/${a.memoria.totalGB} GB (${a.memoria.porcento}%)`,
  ];
  if (a.gpu.porcento != null) partes.push(`GPU ${a.gpu.nome} ${a.gpu.porcento}%`);
  else partes.push(`GPU ${a.gpu.nome}`);
  if (a.bateria) {
    partes.push(
      `bateria ${a.bateria.porcento}% (${a.bateria.estado}${
        a.bateria.restante ? `, ${a.bateria.restante} restantes` : ""
      })`
    );
  }
  if (a.disco) partes.push(`disco ${a.disco.usadoGB}/${a.disco.totalGB} GB livres ${a.disco.livreGB} GB`);
  partes.push(`ligado há ${a.uptimeHoras} h`);
  return partes.join(" · ");
}

module.exports = {
  amostrar, resumo, cpuPorcento, memoria, bateria, disco, gpuUso, gpuNome,
  rede, processos, sistemaOperacional, temperatura,
};
