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
  assert.ok(!/--repetir/.test(chamada), "sem pedido, não repete");

  // 09/11: "aniversário da Hortência, dia todo, todo ano" saiu só em 2026.
  await cal.criar({ titulo: "Aniversário da Hortência", inicio: "2026-11-30", repetir: "anual" });
  assert.match(chamadas().at(-1), /--repetir anual/, "todo ano chega ao helper");

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

  // ------------------------------------- 8. TIRAR do calendário -----------
  // 31/10: ele pediu "tire os eventos do dia 21/22 e adicione agenda com o
  // Felipe". Ela criou o novo, não tirou os velhos, e disse "Feito". Não era
  // mentira nem teimosia: apagar_evento não existia. Ela então gastou 13
  // chamadas de run_command tentando fazer pelo terminal, que não alcança o
  // Calendário. Esta seção existe para isso não voltar calado.
  assert.ok(
    nomes.includes("apagar_evento"),
    "sem a ferramenta apagar_evento ela vai tentar apagar pelo terminal outra vez"
  );
  // Apagar é por id, e o id só existe porque listar devolve. As duas andam juntas.
  const defApagar = toolDefinitions.find((t) => t.name === "apagar_evento");
  assert.deepStrictEqual(defApagar.input_schema.required, ["id"], "apagar_evento exige o id");
  assert.match(
    toolDefinitions.find((t) => t.name === "listar_eventos").description,
    /id/i,
    "listar_eventos tem de avisar que devolve o id, senão ela não sabe o que passar"
  );

  // O wrapper manda o id, e só o id.
  process.env.EV_CAL_BIN = helperFalso({ apagado: true, evento: { id: "XYZ-9", titulo: "gravação Nicolly" } });
  delete require.cache[require.resolve("../calendario.js")];
  const cal4 = require("../calendario.js");
  const apagado = await cal4.apagar("XYZ-9");
  assert.strictEqual(apagado.apagado, true);
  const chamadaApagar = chamadas().at(-1);
  assert.match(chamadaApagar, /^apagar /, "a ação tem de ser 'apagar'");
  assert.match(chamadaApagar, /--id XYZ-9/, "o id tem de viajar no argumento --id");

  // Sem id não se inventa: apagar por título parecido é apagar o evento errado.
  const semId = await cal4.apagar().then(() => null, (e) => e);
  assert.ok(semId instanceof Error, "apagar sem id tem de ser recusado");
  assert.match(semId.message, /id/i);

  // E o helper precisa CONFERIR que saiu. `remove` sem erro não é prova: num
  // calendário de conta remota a remoção pode ser recusada depois.
  // Aqui a ORDEM é o que importa, então medimos posição em vez de casar um
  // regex longo: um `assert.match` com distância fixa quebraria no primeiro
  // comentário que alguém escrevesse entre as duas linhas.
  const swift = fs.readFileSync(path.join(raiz, "native/ev-cal.swift"), "utf8");
  const ondeRemove = swift.indexOf("store.remove(");
  const ondeConfere = swift.indexOf("store.event(withIdentifier: id) != nil");
  assert.ok(ondeRemove > 0, "ev-cal.swift precisa remover o evento");
  assert.ok(
    ondeConfere > ondeRemove,
    "ev-cal.swift: depois de remover, confira que o evento saiu ANTES de dizer que saiu — " +
      "`remove` sem erro não é prova"
  );
  assert.match(swift, /nao_confirmado/, "a remoção não confirmada precisa de código próprio");

  // ------------------- 9. meio pedido não é pedido feito -------------------
  for (const [regra, esperado] of [
    ["o caminho do apagar", /listar_eventos[\s\S]{0,160}apagar_evento/],
    ["não dizer que tirou sem confirmação", /[Nn]unca diga que tirou sem/],
    ["terminal não mexe no Calendário", /run_command não mexe no Calendário/],
    ["pedido com várias partes", /várias partes[\s\S]{0,240}TODAS/],
    ["dizer qual parte ficou de fora", /qual parte ficou de fora/],
  ]) {
    assert.match(prompt, esperado, `o prompt precisa dizer: ${regra}`);
  }

  // ---------------- 10. o app LEMBRETES do macOS ---------------------------
  // Pedido dele em 01/11: "tudo aquilo que foi colocado da minha agenda queria
  // que fosse também adicionado no meu aplicativo Lembretes... para que
  // aparecesse no meu computador e no celular". O evento já ia para o iPhone
  // pelo iCloud; o que faltava era a notificação e a caixinha de concluído.
  process.env.EV_CAL_BIN = helperFalso({
    criado: true,
    lembrete: { id: "LM-1", titulo: "Agenda com o Felipe", quando: "2026-11-21T09:00:00-03:00", tem_hora: true },
  });
  delete require.cache[require.resolve("../calendario.js")];
  const cal5 = require("../calendario.js");

  const lem = await cal5.criarLembreteApp({
    titulo: "Ligar para a tia",
    quando: "2026-11-21T09:00",
    alarmeMinutos: 30,
  });
  assert.strictEqual(lem.criado, true);
  const chamadaLembrete = chamadas().at(-1);
  assert.match(chamadaLembrete, /^lembrete /, "a ação do app Lembretes é 'lembrete'");
  assert.match(chamadaLembrete, /--titulo Ligar para a tia/);
  assert.match(chamadaLembrete, /--quando 2026-11-21T09:00/);
  assert.match(chamadaLembrete, /--alarme 30/);

  const semTitulo = await cal5.criarLembreteApp({}).then(() => null, (e) => e);
  assert.ok(semTitulo instanceof Error, "lembrete sem título tem de ser recusado");

  // O EVENTO espelha por padrão, e o espelho se desliga por pedido.
  await cal5.criar({ titulo: "Reunião", inicio: "2026-11-21T09:00" });
  assert.doesNotMatch(chamadas().at(-1), /--sem-lembrete/, "por padrão o evento espelha");
  await cal5.criar({ titulo: "Reunião", inicio: "2026-11-21T09:00", semLembrete: true });
  assert.match(chamadas().at(-1), /--sem-lembrete/, "e o espelho tem de poder ser desligado");

  // A ferramenta existe e o erro vira resposta, não exceção.
  assert.ok(nomes.includes("criar_lembrete_app"), "falta a ferramenta do app Lembretes");

  // ---- a permissão dos Lembretes é OUTRA, e isso é fácil de errar ----
  // O EventKit serve calendário e lembretes pela mesma classe, mas são dois
  // interruptores nos Ajustes, duas chaves no plist e dois pedidos no macOS 14+.
  // Sem a chave do plist o sistema MATA o processo em vez de pedir permissão.
  for (const arquivo of ["build/Info.plist", "native/cal-info.plist"]) {
    const texto = fs.readFileSync(path.join(raiz, arquivo), "utf8");
    assert.match(
      texto,
      /NSRemindersFullAccessUsageDescription/,
      `${arquivo}: sem esta chave o macOS mata o processo ao pedir acesso aos Lembretes`
    );
  }
  const swiftLem = fs.readFileSync(path.join(raiz, "native/ev-cal.swift"), "utf8");
  assert.match(swiftLem, /requestFullAccessToReminders/, "falta o pedido de acesso aos Lembretes");
  assert.match(
    swiftLem,
    /defaultCalendarForNewReminders\(\)/,
    "defaultCalendarForNewReminders é MÉTODO, não propriedade — sem os parênteses não compila"
  );
  // O mesmo cuidado do evento: ler de volta antes de dizer que criou.
  assert.ok(
    swiftLem.indexOf("calendarItem(withIdentifier:") > swiftLem.indexOf("try store.save(r,"),
    "confira que o lembrete ficou lá ANTES de dizer que ficou"
  );
  // E falhar o espelho não pode desfazer o compromisso.
  assert.match(swiftLem, /lembrete_erro/, "o espelho que falha precisa contar o motivo");

  // O prompt tem de impedir a chamada dupla.
  assert.match(
    prompt,
    /criar_evento já cria SOZINHO o lembrete no app Lembretes/,
    "senão ela chama criar_lembrete_app depois do evento e cria dois"
  );

  // ---------------- 11. data sem hora é o DIA INTEIRO ----------------------
  // 01/11: "pedi para mudar a questão de horários para deixar o dia todo
  // sempre, em vez de sempre que colocar no horário de 09:00". No log das
  // 20:51 ela criou dez lembretes com "T09:00" porque a hora era dela, não
  // dele — ele nunca disse hora nenhuma.
  //
  // A regra vive no HELPER, deduzida do formato, e não numa nota de memória.
  // A nota que ela escreveu às 23:19 do dia 31 não era lida em todo pedido: o
  // índice da memória leva só a linha "quando", e o conteúdo sai por demanda.
  // Regra que depende de ela decidir consultar não é regra, é sorte.
  assert.match(
    swiftLem,
    /let horaNoTexto = inicioTexto\.contains\("T"\) \|\| inicioTexto\.contains\(":"\)/,
    "o dia inteiro tem de ser deduzido do formato da data"
  );
  assert.match(
    swiftLem,
    /let diaInteiro = tem\("dia-inteiro"\) \|\| !horaNoTexto/,
    "sem hora no texto, o evento é do dia inteiro mesmo sem a flag"
  );

  // A descrição da ferramenta tem de dizer isso, senão ela completa com 09:00.
  const defEvento = toolDefinitions.find((t) => t.name === "criar_evento");
  assert.match(
    defEvento.input_schema.properties.inicio.description,
    /dia inteiro/i,
    "a descrição do início precisa dizer que só a data vira dia inteiro"
  );
  assert.doesNotMatch(
    JSON.stringify(defEvento),
    /T09:00/,
    "o exemplo com 09:00 na descrição era de onde ela tirava a hora"
  );

  // E a regra tem de estar no PROMPT, que é o que ela lê em todo pedido —
  // não na memória, que ela lê quando decide.
  assert.match(prompt, /Hora só quando ele disser a hora/, "falta a regra no prompt");
  assert.match(prompt, /Nunca complete com 09:00/, "e ela precisa ser explícita sobre o 09:00");

  // ---------------- 12. não criar o mesmo lembrete duas vezes --------------
  // No log de 01/11 ele acabou com dois de cada: às 20:51 ela preencheu os
  // Lembretes a partir dos lembretes internos (com 09:00), e às 20:58 refez os
  // eventos como dia inteiro — e cada evento refeito espelhou mais um. As duas
  // vias estavam certas; faltava uma olhar antes de escrever.
  assert.match(swiftLem, /ja_existia/, "o lembrete repetido tem de devolver ja_existia");
  assert.match(
    swiftLem,
    /Calendar\.current\.startOfDay/,
    "a comparação é pelo DIA: 09:00 por uma via e dia inteiro pela outra são o MESMO compromisso"
  );
  // E a busca tem de acontecer antes do save, senão a guarda não guarda nada.
  assert.ok(
    swiftLem.indexOf("fetchReminders(matching: store.predicateForReminders(in: [listaAlvo]))") <
      swiftLem.indexOf("try store.save(r, commit: true)"),
    "a conferência precisa vir ANTES de gravar"
  );

  // ---------------- 13. id de lembrete interno não é id de evento ----------
  // Log de 01/11: `apagar_evento id="dz5a8q"` e, pior,
  // `apagar_evento id="A5DDE6E6-…-FA0DB8D3300A:nsa5aq"` — ela pegou o prefixo
  // do calendário e colou nele um id de lembrete interno. As duas falharam com
  // "nao_encontrado": erro verdadeiro e inútil, porque não diz que ela misturou
  // dois espaços de id, e por isso ela tentaria de novo.
  process.env.EV_CAL_BIN = helperFalso({ apagado: true });
  delete require.cache[require.resolve("../calendario.js")];
  ferramentas.configurar({ calendario: require("../calendario.js") });

  const antesDaTrava = chamadas().length;
  for (const idRuim of ["dz5a8q", "A5DDE6E6-2A73-4E2F-919D-FA0DB8D3300A:nsa5aq"]) {
    const r = JSON.parse(await ferramentas.runTool("apagar_evento", { id: idRuim }));
    assert.strictEqual(r.codigo, "id_de_outro_tipo", `${idRuim} tinha de ser recusado`);
    assert.match(r.error, /cancel_reminder/, "e tem de dizer qual ferramenta serve para o interno");
    assert.match(r.error, /listar_eventos/, "e onde pegar o id certo");
  }
  assert.strictEqual(
    chamadas().length,
    antesDaTrava,
    "id errado não pode nem chegar ao helper: falhar rápido é o ponto"
  );

  // E o que é id de evento DE VERDADE tem de passar — inclusive formatos que
  // não são UUID, como os de calendário CalDAV ou Exchange. Recusar o que
  // funciona é pior do que aceitar o que vai falhar.
  for (const idBom of [
    "A5DDE6E6-2A73-4E2F-919D-FA0DB8D3300A:109A92E3-E903-4D95-856D-D52C8CA0A162",
    "109A92E3-E903-4D95-856D-D52C8CA0A162",
    "evento-1234567890@algum-servidor.com",
  ]) {
    const r = JSON.parse(await ferramentas.runTool("apagar_evento", { id: idBom }));
    assert.notStrictEqual(r.codigo, "id_de_outro_tipo", `${idBom} NÃO podia ser recusado`);
  }

  // ---------------- 14. dia inteiro avisa de MANHÃ, não à meia-noite -------
  // Medido nos lembretes dele em 01/11: os que o espelho criou tinham
  // "remind me date" às 00:00, porque evento de dia inteiro não tem hora e eu
  // não punha alarme — então os Lembretes puseram o deles, meia-noite. Ser
  // acordado à meia-noite para lembrar do ENEM não é o que ele pediu ao querer
  // "o dia todo": isso é sobre como o compromisso aparece no CALENDÁRIO, não
  // sobre a hora do aviso.
  assert.match(swiftLem, /let HORA_DO_AVISO = 9/, "falta a hora do aviso de dia inteiro");
  // A hora TEM de ir no vencimento, não só num EKAlarm anexado.
  //
  // A primeira tentativa foi anexar um EKAlarm às 9h num lembrete sem hora no
  // vencimento, e MEDIDO depois: o app continuou reportando "remind me date"
  // às 00:00. Num lembrete sem hora de vencimento ele normaliza o alarme para
  // o começo do dia e ignora o anexado. "Dia inteiro com aviso às 9h" não é
  // estado que o Lembretes sustenta.
  assert.match(
    swiftLem,
    /bySettingHour: HORA_DO_AVISO[\s\S]{0,200}?r\.dueDateComponents = Calendar\.current\.dateComponents\(\s*\[\.year, \.month, \.day, \.hour, \.minute\]/,
    "a hora do aviso tem de entrar no VENCIMENTO; só o EKAlarm não basta (medido)"
  );
  // E hora marcada continua sendo a hora dele, não as 9h.
  assert.match(
    swiftLem,
    /let instante = comHora\s*\?\s*quando/,
    "com hora marcada o vencimento é o instante que ele pediu"
  );

  // ---------------- 16. aviso ANTES do compromisso -------------------------
  // 02/11: "tenho psicologo as 10am, disparar um alarme 1 hora antes para eu
  // acordar". O campo alarme_minutos já existia e nada dizia a ela quando usar.
  //
  // E o helper passa a RELATAR os alarmes reais, porque duas vezes neste
  // projeto eu afirmei a hora de um aviso que estava noutra hora. Pedir um
  // EKAlarm às 9h não é o mesmo que o aviso soar às 9h, e ler de volta é a
  // única forma de saber. De quebra, isso desmascarou o que me enganou: o
  // `remind me date` do AppleScript relata o VENCIMENTO, não o alarme.
  assert.match(swiftLem, /func descreverAlarmes/, "o helper tem de relatar os alarmes reais");
  assert.match(swiftLem, /"minutos_antes"/, "aviso relativo precisa dizer quantos minutos antes");
  assert.match(swiftLem, /d\["avisos"\] = avisos/, "e os avisos têm de sair na resposta");
  // Nos DOIS descritores: evento e lembrete.
  assert.strictEqual(
    (swiftLem.match(/let avisos = descreverAlarmes\(/g) || []).length,
    2,
    "evento e lembrete, os dois, precisam relatar aviso"
  );

  const defEv = toolDefinitions.find((t) => t.name === "criar_evento");
  assert.ok(defEv.input_schema.properties.alarme_minutos, "criar_evento precisa do alarme_minutos");
  const defLem = toolDefinitions.find((t) => t.name === "criar_lembrete_app");
  assert.ok(defLem.input_schema.properties.alarme_minutos, "e o lembrete do app também");

  assert.match(prompt, /alarme_minutos no criar_evento/, "falta a regra de quando usar o alarme");
  assert.match(
    prompt,
    /confirme a hora do aviso com ele, não a do compromisso/,
    "ela tem de confirmar a hora do AVISO, que é a que ele quer saber"
  );

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log("✓ calendário do macOS: argumentos, permissão explicada e a confusão com lembrete");
  console.log("   criar          →", chamada.slice(0, 72) + "…");
  console.log("   sem permissão  → código sem_permissao + o que ligar nos Ajustes");
  console.log("   evento ≠ lembrete → dito no prompt, com empate caindo para o evento");
  console.log("   apagar         →", chamadaApagar, "· confere a remoção antes de responder");
  console.log("   meio pedido    → prompt exige dizer qual parte ficou de fora");
  console.log("   app Lembretes  →", chamadaLembrete.slice(0, 64) + "…");
  console.log("   espelho        → evento cria o lembrete sozinho; --sem-lembrete desliga");
})();
