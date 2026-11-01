// agentes.test.js — o painel de uso dos provedores.
//
// Ele existe porque os planos gratuitos são medidos em TOKENS POR DIA, não em
// perguntas: sem painel, a primeira notícia de que a cota acabou é a E.V.E
// parar de responder no meio de uma conversa.
//
// Três regras que não podem quebrar:
//   • número MEDIDO manda sobre estimado, e estimativa precisa vir marcada —
//     estimativa apresentada como medida é pior do que número nenhum;
//   • o saldo que o PROVEDOR informa nos cabeçalhos manda sobre qualquer teto
//     escrito aqui dentro: é a conta dele, da chave dele, agora;
//   • teto nunca é inventado. Onde não há limite conhecido, a barra mostra a
//     fatia do dia e DIZ que é isso (origem "relativo", teto null).
// Rode com: node test/agentes.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Agentes, LIMITES, lerLimites, janelaDe, janelaCheia, emSegundos } = require("../agentes.js");

const arquivo = path.join(os.tmpdir(), `eve-agentes-${process.pid}.json`);
fs.rmSync(arquivo, { force: true });

(async () => {
  const a = new Agentes({ arquivo });

  // ------------------------------------------- 1. contagem e acúmulo
  a.registrar({ provedor: "groq", modelo: "openai/gpt-oss-120b", entrada: 2000, saida: 200 });
  a.registrar({ provedor: "groq", entrada: 2400, saida: 150 });

  let r = a.resumo(["groq", "gemini"]);
  const groq = r.linhas.find((l) => l.provedor === "groq");
  assert.strictEqual(groq.pedidos, 2);
  assert.strictEqual(groq.tokens, 4750, "entrada + saída somadas");
  assert.strictEqual(groq.estimado, false, "os dois pedidos vieram medidos");
  assert.strictEqual(groq.modelo, "openai/gpt-oss-120b", "guarda o modelo que respondeu");
  assert.strictEqual(groq.ativo, true, "o último a responder é o ativo");

  // --------------------------- 2. basta UM estimado para marcar tudo
  a.registrar({ provedor: "groq", entrada: 100, saida: 10, estimado: true });
  const groq2 = a.resumo(["groq"]).linhas[0];
  assert.strictEqual(
    groq2.estimado,
    true,
    "misturou medido com estimado: o total deixa de ser medida exata e precisa avisar"
  );

  // ------------------------- 3. barra: teto publicado, medido e relativo
  assert.ok(LIMITES.groq, "o Groq publica teto diário");
  assert.strictEqual(groq2.barra.origem, "publicado");
  assert.ok(groq2.barra.fracao > 0 && groq2.barra.fracao < 1);
  assert.ok(groq2.barra.fonte, "teto publicado tem de vir com a fonte; número sem procedência mente");

  a.registrar({ provedor: "nvidia", entrada: 5000, saida: 300 });
  const nvidia = a.resumo(["nvidia"]).linhas.find((l) => l.provedor === "nvidia");
  assert.strictEqual(nvidia.barra.origem, "relativo", "sem teto conhecido, a barra é fatia do dia");
  assert.strictEqual(nvidia.barra.teto, null, "e teto continua null: não se inventa limite");
  assert.match(nvidia.barra.rotulo, /sem teto publicado/i, "e isso precisa estar escrito");
  assert.strictEqual(nvidia.tokens, 5300, "o consumo continua sendo contado");

  // Provedor que nunca foi usado não ganha barra nenhuma — nem relativa.
  const gemini = a.resumo(["gemini"]).linhas.find((l) => l.provedor === "gemini");
  assert.strictEqual(gemini.barra, null, "sem uso não há o que desenhar");

  // Estourar o teto não pode passar de 100%: barra não transborda.
  a.registrar({ provedor: "groq", entrada: 400_000, saida: 0 });
  assert.strictEqual(a.resumo(["groq"]).linhas[0].barra.fracao, 1);

  // ------------- 3b. o saldo informado pelo provedor manda sobre o teto daqui
  const comCabecalhos = lerLimites(
    new Headers({
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "973",
      "x-ratelimit-reset-requests": "7h59m",
      "x-ratelimit-limit-tokens": "8000",
      "x-ratelimit-remaining-tokens": "487",
      "x-ratelimit-reset-tokens": "7.66s",
    })
  );
  assert.strictEqual(comCabecalhos.janelaPedidos, "dia", "reset em horas é cota do dia");
  assert.strictEqual(comCabecalhos.janelaTokens, "minuto", "reset em segundos é cota do minuto");

  const d = new Agentes({});
  d.registrar({ provedor: "groq", entrada: 500, saida: 50, limites: comCabecalhos });
  const medido = d.resumo(["groq"]).linhas[0];
  assert.strictEqual(medido.barra.origem, "medido", "com saldo informado, não se usa o teto daqui");

  // A BARRA MOSTRA O QUE APERTA, E DIZ QUAL JANELA É.
  //
  // Aqui restam 973 de 1.000 pedidos no DIA (2,7% gasto) e 487 de 8.000 tokens
  // no MINUTO (94% gasto). A versão anterior preferia a janela do dia, com um
  // argumento legítimo: 94% de vermelho assusta quando o limite se refaz em
  // 7 segundos. Só que foi exatamente essa escolha que mentiu para ele em
  // 31/10 — o painel mostrava folga do dia no instante em que a resposta
  // morria por falta de tokens do minuto.
  //
  // A saída não é escolher um dos dois: é mostrar o que aperta E rotular a
  // janela. "94% no minuto" manda esperar sete segundos; "94% hoje" manda
  // parar. Sem o rótulo as duas frases eram a mesma barra, e por isso a
  // versão anterior tinha de escolher.
  assert.strictEqual(medido.barra.unidade, "tokens", "o minuto aperta mais que o dia aqui");
  assert.strictEqual(medido.barra.janela, "minuto", "e a barra TEM de dizer qual janela é");
  assert.strictEqual(medido.barra.teto, 8000);
  assert.strictEqual(medido.barra.restante, 487, "quanto resta é número, não só texto");
  assert.ok(Math.abs(medido.barra.fracao - 0.939) < 0.002, "7.513 de 8.000 tokens gastos");
  assert.match(medido.barra.rotulo, /487/, "a barra diz quanto RESTA, não só quanto foi");
  assert.match(medido.barra.rotulo, /no minuto/, "e o rótulo nomeia a janela");

  // Com o minuto folgado, quem aperta volta a ser o dia — e o rótulo muda.
  const folgado = new Agentes({});
  folgado.registrar({
    provedor: "groq",
    entrada: 500,
    saida: 50,
    limites: lerLimites(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "120",
        "x-ratelimit-reset-requests": "7h59m",
        "x-ratelimit-limit-tokens": "8000",
        "x-ratelimit-remaining-tokens": "7900",
        "x-ratelimit-reset-tokens": "7.66s",
      })
    ),
  });
  const bf = folgado.resumo(["groq"]).linhas[0].barra;
  assert.strictEqual(bf.unidade, "pedidos", "com o minuto folgado, o dia é quem aperta");
  assert.strictEqual(bf.janela, "dia");
  assert.match(bf.rotulo, /hoje/, "e aí o rótulo diz hoje");

  // Sem cabeçalho de reset não dá para saber a janela — e sem janela o número
  // não vira barra, porque barra de janela errada mente.
  const semReset = lerLimites(
    new Headers({ "x-ratelimit-limit-requests": "60", "x-ratelimit-remaining-requests": "59" })
  );
  assert.strictEqual(semReset.janelaPedidos, null);
  const e = new Agentes({});
  e.registrar({ provedor: "openrouter", entrada: 10, saida: 1, limites: semReset });
  assert.strictEqual(
    e.resumo(["openrouter"]).linhas[0].barra.origem,
    "publicado",
    "sem janela conhecida, cai para o teto publicado em vez de adivinhar"
  );

  // ---- 3c. a janela sai de REGRA DE TRÊS, não do reset cru ----------------
  // Cabeçalhos reais do Groq, capturados em 27/10 com a conta quase intocada:
  //   limit-requests 1000 · remaining 999  · reset-requests 1m26.4s
  //   limit-tokens   8000 · remaining 7927 · reset-tokens   547ms
  // Lendo o reset como "tempo até a janela virar", 1m26s viraria cota de HORA
  // e a barra do dia nunca apareceria — foi o que aconteceu de verdade.
  // Esses contadores são balde furado: o reset repõe o que foi GASTO. A janela
  // inteira é reset × limite ÷ gasto, e aí a conta fecha exata.
  assert.strictEqual(Math.round(janelaCheia(86.4, 1000, 999)), 86_400, "86,4s por 1 pedido → 24h");
  assert.ok(Math.abs(janelaCheia(0.547, 8000, 7927) - 60) < 1, "547ms por 73 tokens → 1 minuto");

  const reais = lerLimites(
    new Headers({
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "999",
      "x-ratelimit-reset-requests": "1m26.4s",
      "x-ratelimit-limit-tokens": "8000",
      "x-ratelimit-remaining-tokens": "7927",
      "x-ratelimit-reset-tokens": "547ms",
    })
  );
  assert.strictEqual(reais.janelaPedidos, "dia", "conta quase intocada e mesmo assim: cota do dia");
  assert.strictEqual(reais.janelaTokens, "minuto");

  // Nada gasto, nada a deduzir — e nada a inventar.
  assert.strictEqual(janelaCheia(0, 1000, 1000), null);
  assert.strictEqual(
    lerLimites(
      new Headers({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "1000",
        "x-ratelimit-reset-requests": "0s",
      })
    ).janelaPedidos,
    null
  );

  // Formatos de duração que os provedores usam de verdade.
  assert.strictEqual(emSegundos("24.9225s"), 24.9225);
  assert.strictEqual(emSegundos("2m59.56s"), 179.56);
  assert.strictEqual(emSegundos("1h"), 3600);
  assert.strictEqual(janelaDe(emSegundos("1h")), "hora");
  assert.strictEqual(lerLimites(new Headers({})), null, "sem cabeçalho nenhum, não há saldo");

  // ------------------------------------------- 4. erros contam
  a.registrar({ provedor: "mistral", erro: "Rate limit reached for model" });
  const mistral = a.resumo(["mistral"]).linhas.find((l) => l.provedor === "mistral");
  assert.strictEqual(mistral.erros, 1);
  assert.match(mistral.ultimoErro, /Rate limit/);

  // ------------------- 5. quem tem chave e quem só aparece no histórico
  const comChave = a.resumo(["groq"]);
  assert.strictEqual(comChave.linhas.find((l) => l.provedor === "groq").configurado, true);
  assert.strictEqual(
    comChave.linhas.find((l) => l.provedor === "nvidia").configurado,
    false,
    "provedor sem chave aparece, mas marcado — ele gastou cota hoje"
  );

  // ------------------------------------------- 6. sobrevive a reabrir
  await a.salvar();
  const b = new Agentes({ arquivo });
  assert.strictEqual(
    b.resumo(["groq"]).linhas[0].pedidos,
    4,
    "fechar e abrir o app não pode zerar o consumo do dia"
  );

  // ------------------------------- 7. dado de ontem não vale para hoje
  const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  dados.dia = "2000-01-01";
  fs.writeFileSync(arquivo, JSON.stringify(dados));
  const c = new Agentes({ arquivo });
  assert.strictEqual(
    c.resumo(["groq"]).linhas[0].pedidos,
    0,
    "consumo de outro dia tem de virar zero, não ser somado ao de hoje"
  );

  fs.rmSync(arquivo, { force: true });

  console.log("✓ uso dos agentes: saldo do provedor manda, teto nunca é inventado");
  console.log("   medido + estimado → marcado como estimado");
  console.log("   barra            → mostra o que APERTA e nomeia a janela (94% no minuto)");
  console.log("   janela            → regra de três no balde furado: 86,4s×1000 = 24h exatas");
  console.log("   sem teto nenhum   → barra de fatia do dia, dito com essas palavras");
  console.log("   reabrir o app     → mantém o dia; outro dia → zera");
})();
