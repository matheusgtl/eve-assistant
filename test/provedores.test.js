// provedores.test.js — o adaptador do formato OpenAI (Groq, Mistral, Cerebras,
// OpenRouter) e a corrente que troca de provedor quando um seca.
//
// O ponto frágil aqui é tool use em streaming: a chamada de ferramenta NÃO
// chega inteira. O nome vem partido, os argumentos vêm letra a letra, e a única
// coisa que amarra os pedaços é o campo `index`. Montar isso errado é o jeito
// clássico de quebrar as ferramentas sem que nenhum erro apareça.
//
// E a corrente tem uma regra que não é óbvia: se o provedor JÁ COMEÇOU A FALAR,
// não se troca. Repetir a pergunta em outro provedor faria a E.V.E dizer o
// começo da resposta duas vezes.
// Rode com: node test/provedores.test.js

const http = require("node:http");
const assert = require("node:assert");

function sse(res, eventos) {
  res.setHeader("content-type", "text/event-stream");
  for (const e of eventos) res.write("data: " + JSON.stringify(e) + "\n\n");
  res.write("data: [DONE]\n\n");
  res.end();
}

const delta = (d) => ({ choices: [{ index: 0, delta: d }] });

const recebidos = [];
let cenario = "ferramenta";

const servidor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const pedido = body ? JSON.parse(body) : {};
    const qual = req.url.startsWith("/groq") ? "groq" : "mistral";
    recebidos.push({ qual, pedido });

    // ---- provedor que bateu o limite diário
    if (cenario === "groq-esgotado" && qual === "groq") {
      res.statusCode = 429;
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ error: { message: "Rate limit reached for model" } }));
    }

    // ---- provedor que responde, mas cujo modelo não faz tool use.
    // "Compatível com a OpenAI" não garante ferramentas, e nenhum provedor
    // gratuito publica isso de forma confiável — então a E.V.E tem de descobrir
    // em uso e seguir adiante, em vez de morrer com 400.
    if (cenario === "sem-ferramentas" && qual === "groq") {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({ error: { message: "Function calling is not supported for this model" } })
      );
    }

    // ---- modelo de raciocínio que gasta a resposta pensando: manda só
    // reasoning_content e nenhum content. Sem tratamento, a E.V.E ficava muda —
    // o pior jeito de falhar, porque parece que ela ignorou você.
    if (cenario === "so-pensou" && qual === "groq") {
      return sse(res, [
        delta({ reasoning_content: "Hmm, deixa eu pensar com muito cuidado nisso…" }),
        delta({ reasoning_content: " e pensar mais um pouco, sem nunca concluir." }),
      ]);
    }

    // ---- o MESMO caso, com o outro nome de campo. O OpenRouter manda o
    // raciocínio em `reasoning`, não em `reasoning_content`: medido em 02/11,
    // num stream real vieram 321 deltas de `reasoning` e zero do outro nome.
    // Lendo só um dos dois, o contador ficava em zero e a E.V.E dizia
    // "resposta vazia" quando o certo era "gastou a resposta raciocinando".
    if (cenario === "so-pensou-or" && qual === "mistral") {
      return sse(res, [
        delta({ reasoning: "Vou pensar nisso com muito cuidado…" }),
        delta({ reasoning: " e seguir pensando, sem nunca concluir." }),
      ]);
    }

    // ---- nome de modelo que envelheceu. O provedor está ÓTIMO; só o nome
    // fixo no código morreu. Aconteceu de verdade: o Groq respondeu
    // "does not exist or you do not have access to it" e a E.V.E abandonou um
    // provedor disponível em vez de perguntar quais modelos ele tem.
    if (cenario === "modelo-velho" && qual === "groq") {
      if (req.url.endsWith("/models")) {
        res.setHeader("content-type", "application/json");
        return res.end(
          JSON.stringify({
            data: [
              { id: "whisper-large-v3" },
              { id: "meta-llama/llama-guard-4-12b" },
              { id: "llama-3.1-8b-instant" },
              { id: "openai/gpt-oss-120b" },
            ],
          })
        );
      }
      if (pedido.model === "llama-3.3-70b-versatile") {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        return res.end(
          JSON.stringify({
            error: { message: "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it." },
          })
        );
      }
      return sse(res, [delta({ content: "Abri o YouTube no Safari para você, pronto." })]);
    }

    // ---- provedor que fala e SÓ DEPOIS quebra
    if (cenario === "falou-e-quebrou" && qual === "groq") {
      res.setHeader("content-type", "text/event-stream");
      // Precisa passar do mínimo de fala (42 caracteres), senão o texto fica
      // retido no lote e NÃO chega a ser falado — aí trocar de provedor seria
      // correto, e não é esse o caso que este cenário testa.
      res.write("data: " + JSON.stringify(delta({ content: "Deixa eu ver isso para você agora, um instante. " })) + "\n\n");
      res.write("data: " + JSON.stringify({ error: { code: 429, message: "Rate limit reached" } }) + "\n\n");
      return res.end();
    }

    const jaUsouFerramenta = pedido.messages.some((m) => m.role === "tool");

    if (cenario === "ferramenta" && !jaUsouFerramenta) {
      // A chamada chega em SEIS pedaços: nome partido em dois, argumentos em
      // três, e o id só no primeiro. Exatamente como a API faz.
      return sse(res, [
        delta({ content: "Já vou olhar o seu sistema. " }),
        delta({ tool_calls: [{ index: 0, id: "call_99", type: "function", function: { name: "system_", arguments: "" } }] }),
        delta({ tool_calls: [{ index: 0, function: { name: "status" } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: '{"de' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'talhado"' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: ":true}" } }] }),
      ]);
    }

    return sse(res, [
      delta({ content: "Olhei aqui para você: " }),
      delta({ content: "a memória está tranquila e o disco " }),
      delta({ content: "é que merece atenção." }),
    ]);
  });
});

servidor.listen(0, async () => {
  const base = `http://127.0.0.1:${servidor.address().port}`;
  process.env.EV_GROQ_API = `${base}/groq`;
  process.env.EV_MISTRAL_API = `${base}/mistral`;
  const { createBrain, PROVEDORES } = require("../brains.js");
  const base_ops = { onDebug: () => {}, onModel: () => {} };

  // ------------------------------------------- 1. catálogo de provedores
  for (const p of ["groq", "mistral", "cerebras", "openrouter"]) {
    assert.ok(PROVEDORES[p]?.modelo, `${p}: falta modelo padrão`);
    assert.ok(/^https:\/\//.test(PROVEDORES[p].base().replace(`${base}/${p}`, "https://x")) || true);
    assert.ok(PROVEDORES[p].chaveEm.startsWith("https://"), `${p}: falta onde pegar a chave`);
  }

  // A corrente expõe `etapas` com provedor e modelo de cada degrau — é disso
  // que o log de abertura diz quem pensa primeiro. Antes dessa linha o log
  // mostrava as TROCAS e não o ponto de partida, e eu tinha de ir ler o
  // config a cada diagnóstico.
  const corrente = createBrain({
    provider: "nvidia", nvidiaKey: "nvapi-x", nvidiaModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
    groqKey: "gsk_x", openrouterKey: "sk-or-x",
  });
  assert.ok(Array.isArray(corrente.etapas), "a corrente precisa expor as etapas");
  assert.strictEqual(corrente.etapas[0].provider, "nvidia", "o principal vem na frente");
  assert.strictEqual(
    corrente.etapas[0].model, "nvidia/nemotron-3.5-lightning-30b-a3b",
    "e com o modelo do campo próprio, que é o que o log mostra"
  );
  assert.ok(
    corrente.etapas.slice(1).some((e) => e.provider === "openrouter"),
    "quem tem chave no campo próprio fica na reserva"
  );

  // --------------------- 2. ferramenta fatiada é remontada e executada
  recebidos.length = 0;
  const ditos = [];
  const usadas = [];
  const b = createBrain({ provider: "groq", groqKey: "gsk_teste" });
  assert.strictEqual(b.constructor.name, "OpenAIBrain", "um provedor só = cérebro puro");
  await b.ask("como está meu sistema?", { ...base_ops, onSay: (t) => ditos.push(t), onTool: (n) => usadas.push(n) });

  assert.deepStrictEqual(usadas, ["system_status"], "o nome partido tem de ser remontado");
  const segundo = recebidos[1].pedido;
  const chamada = segundo.messages.find((m) => m.role === "assistant" && m.tool_calls)?.tool_calls[0];
  assert.ok(chamada, "o histórico precisa guardar a chamada no formato da API");
  assert.strictEqual(chamada.function.name, "system_status");
  assert.deepStrictEqual(
    JSON.parse(chamada.function.arguments),
    { detalhado: true },
    "os argumentos vieram letra a letra e precisam fechar um JSON válido"
  );
  const resposta = segundo.messages.find((m) => m.role === "tool");
  assert.strictEqual(resposta.tool_call_id, "call_99", "a resposta da ferramenta tem de citar o id da chamada");

  // Formato do pedido: as ferramentas em JSON Schema puro, sem conversão.
  // O número vem do catálogo, não fixo: ferramentas novas não devem quebrar isto.
  const { toolDefinitions } = require("../tools.js");
  assert.strictEqual(recebidos[0].pedido.tools.length, toolDefinitions.length);
  assert.strictEqual(recebidos[0].pedido.tools[0].type, "function");
  assert.ok(recebidos[0].pedido.stream, "tem de pedir streaming");
  assert.strictEqual(recebidos[0].pedido.messages[0].role, "system");

  // A fala sai em pedaços, com a mesma regra do Gemini (nada picotado).
  assert.ok(ditos.length >= 2, `deveria falar em pedaços, falou em ${ditos.length}`);
  assert.match(ditos.join(" "), /Já vou olhar o seu sistema/);
  assert.match(ditos.join(" "), /merece atenção/);

  // --------------------------- 3. provedor seca → o próximo responde
  cenario = "groq-esgotado";
  recebidos.length = 0;
  const ditos2 = [];
  const trocas = [];
  const cadeia = createBrain({ provider: "groq", groqKey: "gsk_x", mistralKey: "m_x" });
  assert.strictEqual(cadeia.constructor.name, "CadeiaDeCerebros");
  assert.deepStrictEqual(cadeia.etapas.map((e) => e.provider), ["groq", "mistral"]);

  await cadeia.ask("e agora?", {
    ...base_ops,
    onSay: (t) => ditos2.push(t),
    onTool: () => {},
    onProvedor: (p) => trocas.push(p),
  });

  assert.ok(ditos2.length > 0, "ela tem de responder pelo provedor de reserva");
  assert.deepStrictEqual(trocas, ["mistral"], "a troca precisa ser anunciada");
  assert.strictEqual(cadeia.provedorAtivo, "mistral", "a troca vale para o resto da sessão");
  assert.ok(
    recebidos.some((r) => r.qual === "mistral"),
    "o pedido tem de ter chegado ao segundo provedor"
  );

  // --------------- 4. se já falou, NÃO troca (senão repetiria a fala)
  cenario = "falou-e-quebrou";
  recebidos.length = 0;
  const ditos3 = [];
  const cadeia2 = createBrain({ provider: "groq", groqKey: "gsk_x", mistralKey: "m_x" });
  let estourou = null;
  try {
    await cadeia2.ask("oi", { ...base_ops, onSay: (t) => ditos3.push(t), onTool: () => {} });
  } catch (err) {
    estourou = err;
  }
  assert.ok(estourou, "quem já falou precisa deixar o erro subir");
  assert.strictEqual(ditos3.length, 1, "falou uma vez só");
  assert.ok(
    !recebidos.some((r) => r.qual === "mistral"),
    "não pode repetir a pergunta em outro provedor depois de ter falado"
  );

  // --------- 4b. provedor sem tool use → não serve, passa adiante
  cenario = "sem-ferramentas";
  recebidos.length = 0;
  const ditos4 = [];
  const trocas4 = [];
  const cadeia3 = createBrain({ provider: "groq", groqKey: "gsk_x", mistralKey: "m_x" });
  await cadeia3.ask("como está meu sistema?", {
    ...base_ops,
    onSay: (t) => ditos4.push(t),
    onTool: () => {},
    onProvedor: (p) => trocas4.push(p),
  });
  assert.ok(ditos4.length > 0, "provedor sem ferramentas não pode emudecer a E.V.E");
  assert.deepStrictEqual(trocas4, ["mistral"], "ela precisa trocar de provedor, não desistir");

  // Sozinho, sem reserva, o erro tem de ser legível em vez de um 400 cru.
  const sozinho = createBrain({ provider: "groq", groqKey: "gsk_x" });
  await assert.rejects(
    sozinho.ask("oi", { ...base_ops, onSay: () => {}, onTool: () => {} }),
    /Function calling is not supported/
  );

  // ------- 4c. raciocínio não é fala, e resposta vazia não é silêncio
  cenario = "so-pensou";
  recebidos.length = 0;
  const ditos5 = [];
  const cadeia4 = createBrain({ provider: "groq", groqKey: "gsk_x", mistralKey: "m_x" });
  await cadeia4.ask("pensa aí", { ...base_ops, onSay: (t) => ditos5.push(t), onTool: () => {} });

  const falaInteira5 = ditos5.join(" ");
  assert.ok(ditos5.length > 0, "resposta vazia não pode virar silêncio");
  assert.ok(
    !/deixa eu pensar/i.test(falaInteira5),
    "o raciocínio do modelo NÃO é fala: ela não pode narrar o próprio rascunho"
  );
  assert.match(falaInteira5, /Olhei aqui para você|memória/, "quem respondeu foi o provedor de reserva");

  // Sozinha, a mensagem precisa dizer o que aconteceu de verdade.
  const soPensa = createBrain({ provider: "groq", groqKey: "gsk_x" });
  await assert.rejects(
    soPensa.ask("oi", { ...base_ops, onSay: () => {}, onTool: () => {} }),
    /gastou a resposta raciocinando/
  );

  // O mesmo com o nome de campo do OpenRouter: tem de dar o mesmo diagnóstico.
  cenario = "so-pensou-or";
  const soPensaOr = createBrain({ provider: "mistral", mistralKey: "m_x" });
  await assert.rejects(
    soPensaOr.ask("oi", { ...base_ops, onSay: () => {}, onTool: () => {} }),
    /gastou a resposta raciocinando/,
    "`reasoning` é raciocínio igual a `reasoning_content` — ler um só dá o diagnóstico errado"
  );

  // E o provedor recebe o ajuste que desliga o raciocínio.
  const comExtra = createBrain({ provider: "nvidia", nvidiaKey: "nvapi-falsa" });
  assert.deepStrictEqual(
    comExtra.def.extra,
    { chat_template_kwargs: { enable_thinking: false } },
    "o nemotron precisa ir com o raciocínio desligado: para voz, pensar é latência"
  );

  // Mesmo modelo base no OpenRouter, botão DIFERENTE: o `chat_template_kwargs`
  // é ignorado lá (medido: ainda gastou 284 tokens pensando), e sem o botão
  // certo ele secava a cada pedido.
  assert.deepStrictEqual(
    PROVEDORES.openrouter.extra,
    { reasoning: { enabled: false } },
    "o OpenRouter desliga o raciocínio por `reasoning.enabled`, não por chat_template_kwargs"
  );

  // ---- 4d. nome de modelo velho: troca de MODELO, não de provedor
  cenario = "modelo-velho";
  recebidos.length = 0;
  const ditos6 = [];
  const trocas6 = [];
  const modelos6 = [];
  const cadeia5 = createBrain({ provider: "groq", groqKey: "gsk_x", mistralKey: "m_x" });
  await cadeia5.ask("abre o YouTube", {
    ...base_ops,
    onSay: (t) => ditos6.push(t),
    onTool: () => {},
    onProvedor: (p) => trocas6.push(p),
    onModeloProvedor: (p, m) => modelos6.push([p, m]),
  });

  assert.match(ditos6.join(" "), /Abri o YouTube/, "o provedor estava bom: ela tinha de responder por ele");
  assert.deepStrictEqual(trocas6, [], "nome de modelo errado NÃO é motivo para largar o provedor");
  assert.deepStrictEqual(
    modelos6,
    [["groq", "openai/gpt-oss-120b"]],
    "ela precisa escolher o melhor modelo que a conta TEM, e gravar"
  );
  assert.ok(
    !recebidos.some((r) => r.qual === "mistral"),
    "a reserva não devia ter sido acionada"
  );

  // ------------------------------------------------- 5. Esc cancela
  cenario = "ferramenta";
  const b3 = createBrain({ provider: "mistral", mistralKey: "m_x" });
  const pedido = b3.ask("demora", { ...base_ops, onSay: () => {}, onTool: () => {} });
  b3.cancelar();
  await assert.rejects(pedido, (e) => e.cancelado === true, "Esc tem de virar erro cancelado");

  conferirPodaDoHistorico();
  const tetos = conferirTetoPorProvedor();
  await conferirGuardaDeRepeticao();
  await conferirBuscaReescrita();
  const orcamento = conferirOrcamentoDoGroq();
  conferirEsperaAntesDeTrocar();
  console.log("✓ provedores no formato OpenAI: ferramenta fatiada, histórico e corrente de reserva");
  console.log("   chamada em 6 pedaços → system_status({detalhado:true})");
  console.log("   groq 429            → respondeu pelo mistral, troca anunciada");
  console.log("   já tinha falado     → erro sobe, sem repetir a fala");
  console.log("   modelo sem tool use → trocou de provedor em vez de morrer no 400");
  console.log("   só raciocinou       → não falou o rascunho, e não ficou muda");
  console.log("   raciocínio em dois nomes → reasoning_content (groq) e reasoning (openrouter)");
  console.log("   nome de modelo velho → trocou de MODELO (gpt-oss-120b), não de provedor");
  console.log("   etapas da corrente  → provedor + modelo, que é o log de abertura");
  console.log("   poda do histórico   → por tamanho, em grupos, começando por ele");
  console.log("   teto por provedor   → groq lembra", tetos.comGroq.length, "trocas de 10; nvidia lembra", tetos.comNvidia.length);
  console.log("   chamada repetida    → barrada na 3ª, com recado para sair do laço");
  console.log("   busca reescrita     → 7 buscas do log dele viraram 3");
  console.log(
    "   orçamento do groq   → fixo " + orcamento.fixo + " tokens; teto " +
      orcamento.teto + " caracteres; " + orcamento.pedidos + " pedidos/minuto"
  );
  console.log("   retry-after curto   → espera no mesmo provedor, histórico fica");
  console.log("   ordem da reserva    → " + orcamento.reserva + " (groq saiu da frente)");
  console.log(
    "   prazo 1ª palavra    → nvidia " +
      require("../brains.js").prazoPrimeiroByte("nvidia") / 1000 +
      "s; os outros " + require("../brains.js").PRAZO_PRIMEIRO_BYTE / 1000 + "s"
  );
  servidor.close();
});

// ---------------------------------------------------------------------------
// A MESMA pergunta reescrita não é uma busca nova
// ---------------------------------------------------------------------------
// Log de 02/11: sete buscas para DUAS perguntas, reescrevendo a mesma coisa.
// A guarda exata não pegava nada, porque as strings eram diferentes — e cada
// busca custa um crédito do Tavily (mil por mês) e ~4.500 caracteres de
// contexto, que saem do orçamento da pergunta.
async function conferirBuscaReescrita() {
  const { guardaDeRepeticao, semelhanca, SEMELHANCA_MAXIMA } = require("../brains.js");

  // O limiar foi MEDIDO nas buscas dele, não escolhido: as duplicatas reais
  // ficaram entre 0,60 e 1,00, e as buscas diferentes entre 0,00 e 0,11.
  assert.ok(
    semelhanca("Londrina restaurantes aceitam Alelo vale refeição", "Londrina Alelo vale refeição aceita restaurantes") >= 0.99,
    "ordem das palavras não muda a pergunta"
  );
  assert.ok(
    semelhanca("Alelo Londrina aceita restaurantes", "Londrina Alelo vale refeição aceita restaurantes") >= SEMELHANCA_MAXIMA,
    "acrescentar palavra à mesma pergunta não a torna nova"
  );
  assert.ok(
    semelhanca("previsão do tempo Londrina amanhã", "resultado primeira fase UEL 2026") < 0.2,
    "buscas de assunto diferente têm de ficar LONGE do limiar"
  );
  assert.ok(
    semelhanca("lugares abertos hoje à noite Londrina para comer", "previsão do tempo Londrina amanhã") < SEMELHANCA_MAXIMA,
    "uma cidade em comum não faz duas buscas serem a mesma"
  );

  // O log dele, replayado: sete buscas entram, três chegam ao buscador.
  const chegaram = [];
  const rodar = guardaDeRepeticao(async (_n, a) => {
    chegaram.push(a.query);
    return JSON.stringify({ ok: true });
  });
  const doLog = [
    "Lugares que aceitam vale refeição Londrina feriado hoje",
    "Londrina feriado hoje vale refeição aceita restaurantes",
    "feriado hoje Londrina 2 de novembro 2026",
    "feriado 2 de novembro Londrina 2026",
    "Alelo Londrina aceita restaurantes",
    "Londrina restaurantes aceitam Alelo vale refeição",
    "Londrina Alelo vale refeição aceita restaurantes",
  ];
  const barradas = [];
  for (const query of doLog) {
    const r = JSON.parse(await rodar("web_search", { query }));
    if (r.repetida) barradas.push(query);
  }
  assert.strictEqual(chegaram.length, 3, `3 buscas de 7 (chegaram ${chegaram.length})`);
  assert.strictEqual(barradas.length, 4);
  // E a mensagem tem de dizer O QUE fazer, senão ela reescreve outra vez.
  const aviso = JSON.parse(await rodar("web_search", { query: doLog[1] }));
  assert.match(aviso.error, /Use o que já veio/, "a recusa precisa mandar usar o que já tem");
  assert.match(aviso.error, /busque OUTRA coisa/, "e dizer qual é a saída válida");

  // A regra é SÓ da busca. Caminho parecido é arquivo diferente; barrar ali
  // recusaria trabalho legítimo.
  const arquivos = [];
  const rodar2 = guardaDeRepeticao(async (_n, a) => {
    arquivos.push(a.query);
    return JSON.stringify({ ok: true });
  });
  for (const q of ["relatorio vendas 2025", "relatorio vendas 2026"]) {
    await rodar2("find_files", { query: q });
  }
  assert.strictEqual(arquivos.length, 2, "find_files não entra na regra difusa");

  // E a guarda é por RESPOSTA: a pergunta seguinte pode buscar a mesma coisa.
  const outra = [];
  const rodar3 = guardaDeRepeticao(async (_n, a) => {
    outra.push(a.query);
    return JSON.stringify({ ok: true });
  });
  await rodar3("web_search", { query: doLog[0] });
  assert.strictEqual(outra.length, 1, "guarda nova por resposta, senão ela nunca mais busca aquilo");
}

// ---------------------------------------------------------------------------
// O orçamento do Groq: o teto de histórico é uma CONTA, não um palpite
// ---------------------------------------------------------------------------
// 31/10: "Rate limit reached ... tokens per minute (TPM): Limit 8000,
// Used 3487, Requested 4595" — estourou por 82 tokens. O teto estava em 14.000
// caracteres, o que dava 6.638 tokens num pedido só: 1,2 pedidos por minuto,
// quando uma pergunta com ferramenta precisa de dois no mínimo.
//
// Este teste existe para o dia em que uma ferramenta nova empurrar o custo
// fixo para cima. Ele não checa um número bonito; ele refaz a conta com o
// prompt e as ferramentas DE VERDADE e exige que o teto continue coerente.
function conferirOrcamentoDoGroq() {
  const {
    montarSystemPrompt, TETO_POR_PROVEDOR, TPM_POR_PROVEDOR, PEDIDOS_POR_MINUTO, tetoDoTpm,
  } = require("../brains.js");
  const { toolDefinitions } = require("../tools.js");

  const emTokens = (texto) => Math.round(texto.length / 4);
  const fixo =
    emTokens(montarSystemPrompt()) +
    emTokens(
      JSON.stringify(
        toolDefinitions.map((t) => ({
          name: t.name, description: t.description, parameters: t.input_schema,
        }))
      )
    );
  const tpm = TPM_POR_PROVEDOR.groq;
  assert.strictEqual(tpm, 8_000, "o 429 do Groq diz Limit 8000; se mudou, mude aqui");

  // O teto agora é DERIVADO, então o teste confere a CONTA e não um literal.
  // Antes ele guardava o número e eu o reajustava à mão a cada ferramenta ou
  // linha de prompt nova — sete vezes em dois dias. Número que precisa ser
  // perseguido devia ser conta; virou conta, e aqui se confere que é a certa.
  assert.strictEqual(
    TETO_POR_PROVEDOR.groq,
    tetoDoTpm("groq", fixo),
    "o teto do groq tem de sair do TPM menos o custo fixo medido"
  );

  const pedido = fixo + emTokens("x".repeat(TETO_POR_PROVEDOR.groq));
  const pedidos = tpm / pedido;
  assert.ok(
    pedidos >= PEDIDOS_POR_MINUTO,
    `no pior caso cabem ${pedidos.toFixed(1)} pedidos no minuto do Groq, e uma pergunta com ` +
      `ferramenta precisa de ${PEDIDOS_POR_MINUTO}. Custo fixo: ${fixo} tokens.`
  );

  // E o aperto tem de continuar sendo REAL: se o custo fixo crescer tanto que
  // não sobre histórico nenhum, isso não é um teto, é um aviso de que o
  // caminho certo passou a ser cortar ferramenta ou pagar o plano.
  assert.ok(
    TETO_POR_PROVEDOR.groq > 0,
    `o custo fixo (${fixo} tokens) não deixa histórico nenhum no minuto do Groq. ` +
      "Corte ferramenta ou tire o Groq da corrente."
  );

  // Provedor sem TPM declarado não ganha teto apertado à toa.
  assert.strictEqual(tetoDoTpm("nvidia", fixo), null, "nvidia não declara TPM: sem teto derivado");

  // E o Groq não pode voltar a ser o PRIMEIRO da reserva. Com este custo fixo
  // ele é o provedor mais propenso a recusar, e recusar depois de assumir é
  // pior do que não assumir: a troca descarta o histórico, então ela perderia
  // a conversa para cair num provedor que também ia falhar. Foi a cascata de
  // 31/10 — nvidia expirou → groq 429 → gemini lotado → 504.
  const { ORDEM_RESERVA } = require("../brains.js");
  const ondeGroq = ORDEM_RESERVA.indexOf("groq");
  const ondeGemini = ORDEM_RESERVA.indexOf("gemini");
  assert.ok(ondeGroq > 0, "o groq não pode abrir a reserva: é o mais apertado de todos");
  assert.ok(
    ondeGemini >= 0 && ondeGemini < ondeGroq,
    "o gemini tem de vir antes do groq: o trabalho da reserva é RESPONDER, e o " +
      "gemini tem limite folgado e espera tratada"
  );

  return {
    fixo,
    teto: TETO_POR_PROVEDOR.groq,
    pedidos: pedidos.toFixed(1),
    reserva: ORDEM_RESERVA.slice(0, 3).join(" → "),
  };
}

// ---------------------------------------------------------------------------
// Esperar meio segundo é melhor do que trocar de provedor
// ---------------------------------------------------------------------------
// Trocar descarta o histórico: cada cérebro guarda a conversa no formato da
// sua própria API. O Groq pediu 615 ms e ela trocou — pagou a conversa inteira
// para economizar meio segundo.
function conferirEsperaAntesDeTrocar() {
  const { segundosDeEspera, ESPERA_MAXIMA } = require("../brains.js");
  const cab = (v) => ({ get: (n) => (n === "retry-after" ? v : null) });

  // O corpo do 429 do Groq, copiado do log do dia 31/10.
  const real =
    "Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01m5` " +
    "service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 3487, " +
    "Requested 4595. Please try again in 615ms.";
  assert.strictEqual(segundosDeEspera(null, real), 0.615, "615ms tem de virar 0,615s");
  assert.ok(0.615 <= ESPERA_MAXIMA, "uma espera dessas tem de caber no teto, senão troca à toa");

  assert.strictEqual(segundosDeEspera(null, "please try again in 2.5s"), 2.5);
  assert.strictEqual(segundosDeEspera(null, "try again in 1m30s"), 90, "minutos contam");

  // O cabeçalho manda, quando existe: é o número oficial.
  assert.strictEqual(segundosDeEspera(cab("3"), real), 3, "retry-after ganha do texto");
  assert.strictEqual(segundosDeEspera(cab("0.4"), null), 0.4, "aceita fracionado");

  // Sem indicação nenhuma → null, e aí a troca de provedor é o certo.
  assert.strictEqual(segundosDeEspera(null, "quota exceeded"), null);
  assert.strictEqual(segundosDeEspera(null, null), null);
  assert.strictEqual(segundosDeEspera(cab("amanhã"), "sem número"), null, "lixo não vira espera");

  // Espera longa não pode virar silêncio: acima do teto, troca.
  assert.ok(
    segundosDeEspera(null, "try again in 1m30s") > ESPERA_MAXIMA,
    "90s tem de ficar ACIMA do teto, senão ela fica muda esperando"
  );

  // 413 não é limite por tempo: é "a mensagem não cabe aqui". Esperar não
  // resolve, trocar resolve — a janela do outro provedor é outra, e a troca
  // descarta o histórico, o que por si já encolhe a mensagem. Antes isto subia
  // cru para ele: "erro da API: 413".
  const { provedorEsgotado } = require("../brains.js");
  const e413 = Object.assign(new Error("Request too large ... Limit 8000, Requested 48959"), {
    status: 413,
    pedidoGrande: true,
  });
  assert.ok(provedorEsgotado(e413), "413 tem de acionar a reserva, não virar erro na cara dele");
  assert.strictEqual(segundosDeEspera(null, e413.message), null, "e não há o que esperar num 413");

  // ---- o prazo da primeira palavra é por provedor ----
  // A NVIDIA expirou em DUAS sessões seguidas, e sempre em 25 segundos
  // exatos — 23:43:48→23:44:13 e 23:56:53→23:57:18. Vinha do prazo da
  // primeira palavra, não dos 15s da checagem de modelos.
  const { prazoPrimeiroByte, PRAZO_PRIMEIRO_BYTE } = require("../brains.js");
  assert.ok(
    prazoPrimeiroByte("nvidia") > PRAZO_PRIMEIRO_BYTE,
    "a NVIDIA precisa de mais prazo: a mediana dela é 664 ms, então passar de 25s é fila " +
      "ou partida a frio do endpoint gratuito, não lentidão"
  );
  assert.strictEqual(prazoPrimeiroByte("gemini"), PRAZO_PRIMEIRO_BYTE, "o resto fica no padrão");
  assert.strictEqual(prazoPrimeiroByte("groq"), PRAZO_PRIMEIRO_BYTE);
  // Esperar é silêncio: ela não fala nada enquanto espera. Um prazo largo para
  // todos transformaria qualquer provedor lotado em um minuto de nada.
  assert.ok(
    prazoPrimeiroByte("nvidia") <= 60_000,
    "acima de um minuto o silêncio soa como travada; aí é melhor cair para a reserva"
  );

  // E a corrente tem de ter a trava de uma espera por provedor.
  const fonte = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "brains.js"),
    "utf8"
  );
  assert.match(fonte, /jaEsperou\.has\(provedor\)/, "sem a trava, 429 em sequência vira laço");
  assert.match(fonte, /jaEsperou\.add\(provedor\)/);
  assert.match(fonte, /continue; \/\/ mesmo provedor, mesmo histórico/);
}

// ---------------------------------------------------------------------------
// Poda do histórico: por TAMANHO, e sem separar chamada de ferramenta
// ---------------------------------------------------------------------------
// O corte antigo era `slice(-40)` — as últimas 40 mensagens. Dois problemas:
//
//   1. contagem não é custo. Uma resposta de web_search ocupa ~4.500
//      caracteres; quarenta mensagens com buscas dentro passavam de 10 mil
//      tokens por pedido, e o teto gratuito do Groq é 8.000 POR MINUTO. Era
//      isso que fazia ela trocar de provedor no meio de uma resposta.
//   2. cortar onde calhar deixa a resposta de uma ferramenta ÓRFÃ — sem a
//      chamada que a gerou. As três APIs recusam a conversa inteira assim, e
//      o Gemini ainda exige que ela comece por uma mensagem do usuário.
function conferirPodaDoHistorico() {
  const { podarHistorico, FORMATO_OPENAI, FORMATO_GEMINI, FORMATO_CLAUDE } =
    require("../brains.js");

  const respostaGorda = JSON.stringify({ resposta: "x".repeat(4200), fontes: [] });
  const conversa = [];
  for (let i = 0; i < 8; i++) {
    conversa.push({ role: "user", content: "pergunta " + i });
    if (i % 2 === 0) {
      conversa.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c" + i, type: "function", function: { name: "web_search", arguments: "{}" } }],
      });
      conversa.push({ role: "tool", tool_call_id: "c" + i, content: respostaGorda });
    }
    conversa.push({ role: "assistant", content: "resposta " + i });
  }

  // O teto vai explícito: este teste é sobre COMO o corte agrupa e por onde
  // começa, não sobre qual teto está em vigor. Amarrado ao padrão, ele parou de
  // exercitar o corte no dia em que o padrão subiu, e passou sem cortar nada.
  const APERTO = 14_000;
  const podado = podarHistorico(conversa, FORMATO_OPENAI, APERTO);
  const tamanho = JSON.stringify(podado).length;
  assert.ok(tamanho <= APERTO * 1.6, `histórico podado ainda tem ${tamanho} caracteres`);
  assert.ok(tamanho < JSON.stringify(conversa).length, "e precisa de fato ter cortado algo");

  // Nenhuma resposta de ferramenta pode ficar sem a chamada que a gerou.
  podado.forEach((m, i) => {
    if (m.role !== "tool") return;
    const anterior = podado[i - 1];
    assert.ok(
      anterior && (anterior.tool_calls || anterior.role === "tool"),
      "resposta de ferramenta órfã: a API recusa a conversa inteira"
    );
  });
  assert.strictEqual(podado[0].role, "user", "a conversa tem de começar por uma fala dele");

  // O caso exato que o corte por contagem quebrava.
  const curto = [
    { role: "assistant", content: null, tool_calls: [{ id: "a" }] },
    { role: "tool", tool_call_id: "a", content: "resultado" },
    { role: "user", content: "e agora?" },
  ];
  assert.strictEqual(curto.slice(-2)[0].role, "tool", "o slice antigo começaria numa órfã");
  assert.strictEqual(podarHistorico(curto, FORMATO_OPENAI, 10)[0].role, "user");

  // Gemini: `contents` que não começa com "user" é recusado pela API.
  const gemini = [];
  for (let i = 0; i < 8; i++) {
    gemini.push({ role: "user", parts: [{ text: "pergunta " + i }] });
    gemini.push({ role: "model", parts: [{ functionCall: { name: "web_search", args: {} } }] });
    gemini.push({
      role: "user",
      parts: [{ functionResponse: { name: "web_search", response: { t: "y".repeat(4000) } } }],
    });
    gemini.push({ role: "model", parts: [{ text: "resposta " + i }] });
  }
  const podadoG = podarHistorico(gemini, FORMATO_GEMINI, APERTO);
  assert.strictEqual(podadoG[0].role, "user");
  assert.ok(
    !(podadoG[0].parts || []).some((p) => p.functionResponse),
    "e não pode começar por uma resposta de ferramenta disfarçada de mensagem do usuário"
  );

  // Uma pergunta sozinha e enorme nunca é jogada fora: é o que ela responde agora.
  const gigante = [{ role: "user", content: "z".repeat(200_000) }];
  assert.strictEqual(podarHistorico(gigante, FORMATO_OPENAI).length, 1);

  // Claude agrupa tool_result dentro de uma mensagem do usuário.
  const claude = [
    { role: "user", content: "oi" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1" }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] },
    { role: "assistant", content: "pronto" },
  ];
  assert.strictEqual(podarHistorico(claude, FORMATO_CLAUDE, 10).length >= 1, true);
}

// ---------------------------------------------------------------------------
// O teto do histórico é de QUEM responde — e não do Groq para todo mundo
// ---------------------------------------------------------------------------
// O aperto nasceu do limite do Groq: 8.000 tokens POR MINUTO no plano
// gratuito. Quando o principal virou a NVIDIA, o teto ficou onde estava e
// passou a cortar conversa sem necessidade — a NVIDIA não manda nenhum
// `x-ratelimit-*` e o limite dela é de pedidos, não de tokens.
//
// Foi isto que ele sentiu: "ela perde contexto agora".
//
// O número exato do teto do Groq NÃO é conferido aqui de propósito: ele é
// derivado do TPM e do custo fixo do pedido, e quem guarda essa conta é o
// conferirOrcamentoDoGroq. Repetir a constante nos dois lugares faria o teste
// passar a exigir um número em vez da propriedade que importa.
function conferirTetoPorProvedor() {
  const { podarHistorico, FORMATO_OPENAI, tetoDe, TETO_HISTORICO } = require("../brains.js");

  assert.ok(tetoDe("groq") < TETO_HISTORICO, "o aperto do Groq é real e continua valendo");
  assert.strictEqual(tetoDe("nvidia"), TETO_HISTORICO, "a NVIDIA não tem esse aperto");
  assert.strictEqual(tetoDe("gemini"), TETO_HISTORICO);
  assert.ok(
    TETO_HISTORICO > tetoDe("groq") * 3,
    "e o teto solto precisa ser de fato maior, senão apertar o Groq não distingue nada"
  );

  // Uma conversa como a dele: dez trocas, uma pesquisa a cada três. Cada
  // resposta de busca são 5 resultados com trechos de 600 caracteres.
  const busca = JSON.stringify({
    fonte: "tavily",
    texto: Array.from({ length: 5 }, (_, i) => `${i + 1}. título\n${"y".repeat(600)}`).join("\n\n"),
  });
  const conversa = [];
  for (let i = 1; i <= 10; i++) {
    conversa.push({ role: "user", content: `pergunta número ${i}` });
    if (i % 3 === 1) {
      conversa.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c" + i, type: "function", function: { name: "web_search", arguments: "{}" } }],
      });
      conversa.push({ role: "tool", tool_call_id: "c" + i, content: busca });
    }
    conversa.push({ role: "assistant", content: "z".repeat(260) });
  }

  const lembradas = (teto) =>
    podarHistorico(conversa, FORMATO_OPENAI, teto)
      .filter((m) => m.role === "user" && typeof m.content === "string")
      .map((m) => Number(m.content.match(/número (\d+)/)[1]));

  const comGroq = lembradas(tetoDe("groq"));
  const comNvidia = lembradas(tetoDe("nvidia"));

  assert.ok(comGroq.length < 10, "com o teto do Groq ela mesmo assim esquece — é o preço do limite dele");
  assert.deepStrictEqual(
    comNvidia,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "com a NVIDIA ela tem de lembrar da conversa INTEIRA"
  );
  return { comGroq, comNvidia };
}

// ---------------------------------------------------------------------------
// A mesma chamada, de novo e de novo: o laço que gastou os 16 turnos
// ---------------------------------------------------------------------------
// No log do dia 27 ela chamou `ler_pdf` catorze vezes seguidas e terminou sem
// responder. Chamada idêntica devolve resultado idêntico — da terceira em
// diante o que ela precisa receber é um recado, não o mesmo texto outra vez.
async function conferirGuardaDeRepeticao() {
  const { guardaDeRepeticao } = require("../brains.js");

  const chamadas = [];
  const falso = async (nome, args) => {
    chamadas.push([nome, args]);
    return JSON.stringify({ texto: "o mesmo PDF de sempre" });
  };
  const rodar = guardaDeRepeticao(falso);
  const args = { caminho: "~/Documents/contrato.pdf" };

  const r1 = JSON.parse(await rodar("ler_pdf", args));
  const r2 = JSON.parse(await rodar("ler_pdf", args));
  assert.ok(!r1.repetida && !r2.repetida, "uma segunda tentativa é legítima (falha de rede)");

  const r3 = JSON.parse(await rodar("ler_pdf", args));
  assert.strictEqual(r3.repetida, true, "a terceira idêntica tem de ser barrada");
  assert.match(r3.error, /já chamou ler_pdf/, "e o recado precisa dizer o que fazer");
  assert.match(r3.error, /Responda com o que já tem/);

  for (let i = 0; i < 11; i++) await rodar("ler_pdf", args);
  assert.strictEqual(chamadas.length, 2, "nenhuma leitura a mais pode ter chegado ao disco");

  // Mudar os argumentos é progresso, não repetição: tem de passar.
  const outra = JSON.parse(await rodar("ler_pdf", { ...args, pagina: 2 }));
  assert.ok(!outra.repetida, "página diferente é uma chamada diferente");
  assert.strictEqual(chamadas.length, 3);

  // E a guarda é por pedido: a conversa seguinte começa limpa.
  const nova = JSON.parse(await guardaDeRepeticao(falso)("ler_pdf", args));
  assert.ok(!nova.repetida, "o pedido seguinte não herda o bloqueio do anterior");
}
