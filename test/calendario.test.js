// calendario.test.js — o Calendário de verdade, sem mexer no Calendário dele.
//
// O que importa aqui: o pedido tem de chegar ao helper com os argumentos
// certos, o erro de permissão tem de chegar à E.V.E com o MOTIVO (e não como
// "falhou"), e — a razão de tudo isto existir — ela não pode mais confundir
// evento com lembrete.
//
// O helper é substituído por um script falso: gravar no Calendário de verdade
// num teste deixaria lixo na agenda dele.
// Rode com: node test/calendario.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "eve-cal-"));
const registro = path.join(pasta, "chamadas.txt");

/// Um ev-cal de mentira: anota como foi chamado e responde o que o teste pedir.
function helperFalso(resposta, { codigoDeSaida = 0 } = {}) {
  const bin = path.join(pasta, `ev-cal-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(
    bin,
    `#!/bin/bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(registro)}\n` +
      `cat <<'FIM'\n${JSON.stringify(resposta)}\nFIM\nexit ${codigoDeSaida}\n`
  );
  fs.chmodSync(bin, 0o755);
  return bin;
}

const chamadas = () =>
  fs.existsSync(registro) ? fs.readFileSync(registro, "utf8").trim().split("\n") : [];

(async () => {
  // ----------------------------------------- 1. criar: argumentos e volta
  const evento = {
    id: "ABC-123",
    titulo: "Casamento da Rebeca & João",
    inicio: "2026-05-02T09:00:00-03:00",
    fim: "2026-05-02T10:00:00-03:00",
    local: "Fazenda Querência di Terra",
    calendario: "Pessoal",
    dia_inteiro: false,
  };
  process.env.EV_CAL_BIN = helperFalso({ criado: true, evento });
  delete require.cache[require.resolve("../calendario.js")];
  const cal = require("../calendario.js");

  const r = await cal.criar({
    titulo: "Casamento da Rebeca & João",
    inicio: "2026-05-02T09:00",
    local: "Fazenda Querência di Terra",
    alarmeMinutos: 60,
  });
  assert.strictEqual(r.criado, true);
  assert.strictEqual(r.evento.id, "ABC-123", "o id tem de voltar: é por ele que se confere depois");

  const chamada = chamadas().at(-1);
  assert.match(chamada, /^criar /, "a ação vem primeiro");
  assert.match(chamada, /--titulo Casamento da Rebeca & João/);
  assert.match(chamada, /--inicio 2026-05-02T09:00/);
  assert.match(chamada, /--local Fazenda Querência di Terra/);
  assert.match(chamada, /--alarme 60/);
  assert.ok(!/--fim/.test(chamada), "sem fim declarado, quem decide a duração é o helper");
  assert.ok(!/--dia-inteiro/.test(chamada), "e dia inteiro só vai quando é pedido");

  // ------------------------------- 2. o que falta é dito antes de gastar
  for (const [args, esperado] of [
    [{ inicio: "2026-05-02T09:00" }, /título/],
    [{ titulo: "Reunião" }, /data de início/],
  ]) {
    const erro = await cal.criar(args).then(() => null, (e) => e);
    assert.ok(erro, "pedido incompleto tem de falhar");
    assert.match(erro.message, esperado);
  }

  // ---------------------------------- 3. permissão negada: motivo e código
  // Sem isto, "não consegui" soaria como defeito do app — quando o que falta é
  // um interruptor nos Ajustes que só ele pode ligar.
  process.env.EV_CAL_BIN = helperFalso(
    {
      erro: "o acesso ao Calendário está negado. Abra Ajustes do Sistema › Privacidade e Segurança › Calendários e ligue a E.V.E.",
      codigo: "sem_permissao",
    },
    { codigoDeSaida: 1 }
  );
  delete require.cache[require.resolve("../calendario.js")];
  const cal2 = require("../calendario.js");
  const negado = await cal2
    .criar({ titulo: "x", inicio: "2026-05-02T09:00" })
    .then(() => null, (e) => e);
  assert.ok(negado, "permissão negada tem de virar erro");
  assert.strictEqual(negado.codigo, "sem_permissao", "o código precisa chegar a quem chama");
  assert.match(negado.message, /Ajustes do Sistema/, "e a mensagem precisa dizer o que fazer");

  // ------------------------------------------- 4. helper ausente é dito
  process.env.EV_CAL_BIN = path.join(pasta, "não-existe");
  delete require.cache[require.resolve("../calendario.js")];
  const cal3 = require("../calendario.js");
  const semHelper = await cal3.calendarios().then(() => null, (e) => e);
  assert.strictEqual(semHelper.semHelper, true);
  assert.match(semHelper.message, /npm run native/, "a mensagem tem de dizer como resolver");

  // ---------------------- 5. a ferramenta: erro vira resposta, não exceção
  const ferramentas = require("../tools.js");
  const chamar = async (n, a) => JSON.parse(await ferramentas.runTool(n, a));

  ferramentas.configurar({
    calendario: {
      criar: async () => {
        const e = new Error("o acesso ao Calendário está negado.");
        e.codigo = "sem_permissao";
        throw e;
      },
      listar: async () => ({ total: 0, eventos: [] }),
    },
  });
  const viaFerramenta = await chamar("criar_evento", { titulo: "x", inicio: "2026-05-02T09:00" });
  assert.match(viaFerramenta.error, /negado/, "o cérebro precisa receber o motivo, não uma exceção");
  assert.strictEqual(viaFerramenta.codigo, "sem_permissao");

  // Sem calendário ligado no contexto ela não pode travar o laço.
  ferramentas.configurar({ calendario: null });
  const semCal = await chamar("criar_evento", { titulo: "x", inicio: "2026-05-02T09:00" });
  assert.match(semCal.error, /não está disponível/);

  // ------- 6. evento e lembrete não podem ser a mesma coisa para ela -------
  // O engano que trouxe este arquivo à existência: ele pediu para pôr um
  // casamento no calendário, ela chamou create_reminder e disse "pronto".
  // As duas coisas eram verdade, e foi por isso que enganou.
  const { toolDefinitions } = ferramentas;
  const nomes = toolDefinitions.map((t) => t.name);
  for (const obrigatoria of ["criar_evento", "listar_eventos"]) {
    assert.ok(nomes.includes(obrigatoria), `falta a ferramenta ${obrigatoria}`);
  }

  const { montarSystemPrompt } = require("../brains.js");
  const prompt = montarSystemPrompt();
  assert.match(
    prompt,
    /Calendário e lembrete são coisas DIFERENTES/,
    "o prompt tem de separar as duas em palavras"
  );
  assert.match(prompt, /criar_evento/, "e nomear a ferramenta certa para compromisso");
  assert.match(
    prompt,
    /Na dúvida entre os dois, faça o evento/,
    "empate tem de cair para o lado que ele consegue ver"
  );
  assert.match(
    prompt,
    /Nunca diga que pôs algo no calendário sem ter chamado criar_evento/,
    "dizer que fez sem ter feito é o defeito que estamos consertando"
  );

  // ------------------- 7. o Info.plist sem o qual o macOS mata o processo
  // EventKit no macOS 14+ exige NSCalendarsFullAccessUsageDescription para
  // ESCREVER. Sem a chave não aparece janela de permissão nenhuma: o processo
  // é encerrado pelo sistema, e o sintoma é "ela disse que fez" outra vez.
  const raiz = path.join(__dirname, "..");
  for (const arquivo of ["build/Info.plist", "native/cal-info.plist"]) {
    const texto = fs.readFileSync(path.join(raiz, arquivo), "utf8");
    assert.match(
      texto,
      /NSCalendarsFullAccessUsageDescription/,
      `${arquivo}: sem esta chave o macOS mata o processo em vez de pedir permissão`
    );
  }
  // E o helper precisa carregar o plist embutido, senão a chave não vale.
  const pack = fs.readFileSync(path.join(raiz, "build/pack.sh"), "utf8");
  assert.match(
    pack,
    /ev-cal\.swift[\s\S]{0,200}?cal-info\.plist/,
    "pack.sh precisa embutir o cal-info.plist no ev-cal"
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8"));
  assert.match(pkg.scripts.native, /ev-cal\.swift/, "`npm run native` precisa compilar o ev-cal");

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log("✓ calendário do macOS: argumentos, permissão explicada e a confusão com lembrete");
  console.log("   criar          →", chamada.slice(0, 72) + "…");
  console.log("   sem permissão  → código sem_permissao + o que ligar nos Ajustes");
  console.log("   evento ≠ lembrete → dito no prompt, com empate caindo para o evento");
})();
