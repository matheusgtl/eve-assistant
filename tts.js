// tts.js — síntese de voz da E.V.
//
// Dois motores:
//   macos      → comando `say`, grátis, offline, sempre disponível
//   elevenlabs → vozes neurais, muito mais naturais, cota mensal gratuita
//
// A regra de ouro: se a ElevenLabs falhar por qualquer motivo (cota, rede,
// chave inválida), a fala cai para o macOS. A E.V. nunca fica muda.

// EV_ELEVEN_API existe para os testes apontarem a um servidor falso.
const ELEVEN_API = process.env.EV_ELEVEN_API || "https://api.elevenlabs.io/v1";

// Modelos: o multilingual soa melhor; o flash responde mais rápido.
const MODELO_QUALIDADE = "eleven_multilingual_v2";
const MODELO_RAPIDO = "eleven_flash_v2_5";

async function elevenRequest(caminho, apiKey, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(`${ELEVEN_API}${caminho}`, {
    method,
    headers: {
      "xi-api-key": apiKey,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detalhe = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detalhe = j?.detail?.message || j?.detail?.status || j?.detail || detalhe;
      if (typeof detalhe === "object") detalhe = JSON.stringify(detalhe);
    } catch {}
    const err = new Error(detalhe);
    err.status = res.status;
    err.provider = "elevenlabs";
    throw err;
  }

  if (raw) return Buffer.from(await res.arrayBuffer());
  return res.json();
}

/// Vozes da conta + as padrão da ElevenLabs. `preview_url` é uma amostra já
/// gravada: ouvir por ela não gasta nada da cota mensal.
async function listarVozesEleven(apiKey) {
  const data = await elevenRequest("/voices", apiKey);
  return (data.voices || []).map((v) => ({
    id: v.voice_id,
    nome: v.name,
    descricao: [v.labels?.gender, v.labels?.accent, v.labels?.description]
      .filter(Boolean)
      .join(" · "),
    previewUrl: v.preview_url || null,
    categoria: v.category || null,
    idioma: v.labels?.language || null,
  }));
}

/// O que a lista de vozes mostra. Duas regras, as duas de 05/11:
///  - no plano grátis, voz da biblioteca (categoria "professional", que é como
///    a voz adicionada da biblioteca volta na conta) não funciona pela API —
///    ele escolheu a Raquel, ouviu 402 e a fala caiu na voz do macOS. Some da
///    lista em vez de parecer quebrada;
///  - voz em português vem primeiro: as inglesas falam português com sotaque.
function vozesUsaveis(vozes, plano) {
  const gratis = !plano || /free/i.test(plano);
  const bloqueadas = gratis ? vozes.filter((v) => v.categoria === "professional") : [];
  const usaveis = vozes
    .filter((v) => !bloqueadas.includes(v))
    .sort((a, b) => (b.idioma === "pt") - (a.idioma === "pt"));
  return { vozes: usaveis, ocultas: bloqueadas.map((v) => v.nome) };
}

/// Quanto ainda resta da cota gratuita do mês.
async function cotaEleven(apiKey) {
  try {
    const s = await elevenRequest("/user/subscription", apiKey);
    return {
      usado: s.character_count ?? null,
      limite: s.character_limit ?? null,
      plano: s.tier || null,
      // Em segundos do epoch. Serve para o aviso dizer QUANDO a voz volta —
      // "acabou a cota" sem data deixa ele sem saber se é hoje ou no mês que vem.
      renova: s.next_character_count_reset_unix ?? null,
    };
  } catch {
    return null;
  }
}

/// Gera o áudio da fala. Devolve um Buffer com MP3.
/// A ElevenLabs aceita de 0,7 a 1,2. Fora disso ela recusa o pedido inteiro —
/// e recusar é cair para a voz do macOS no meio de uma frase, o que soa muito
/// pior do que uma fala um pouco mais lenta do que se pediu.
const VELOCIDADE_MIN = 0.7;
const VELOCIDADE_MAX = 1.2;
const velocidadeValida = (v) =>
  Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, Number(v) || 1));

async function sintetizarEleven(texto, { apiKey, voiceId, rapido, velocidade, anterior = "" }) {
  // optimize_streaming_latency=3 corta parte do processamento do servidor antes
  // de começar a devolver áudio. Como agora a fala vai frase a frase, esse
  // atraso inicial acontece várias vezes por resposta — vale cada milissegundo.
  return elevenRequest(
    `/text-to-speech/${voiceId}?output_format=mp3_22050_32&optimize_streaming_latency=3`,
    apiKey,
    {
      method: "POST",
      raw: true,
      body: {
        text: texto,
        model_id: rapido ? MODELO_RAPIDO : MODELO_QUALIDADE,
        // Fixar o idioma conserta o sotaque que trocava no meio da resposta.
        // Os modelos flash/turbo DETECTAM o idioma por pedido — e desde que a
        // fala passou a sair frase a frase, cada fragmento é detectado sozinho.
        // Bastava uma frase curta com uma palavra inglesa ("abri o Safari")
        // para aquele trecho sair com sotaque inglês e o seguinte voltar ao
        // português. Com language_code não há o que detectar.
        language_code: "pt",
        // A fala vai frase a frase, e cada frase era gerada sem saber da
        // anterior: a entonação recomeçava do zero em cada uma, e a resposta
        // soava como frases soltas coladas. `previous_text` é o jeito da
        // própria ElevenLabs de dar continuidade entre pedidos.
        ...(anterior ? { previous_text: String(anterior).slice(-300) } : {}),
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          // 05/11: era 0,2. O "style" exagera o jeito do locutor original —
          // e as vozes da conta são todas inglesas, então exagerava o sotaque
          // inglês. A ElevenLabs recomenda 0.
          style: 0,
          use_speaker_boost: true,
          speed: velocidadeValida(velocidade),
        },
      },
    }
  );
}

/// Baixa a amostra pronta de uma voz (não consome cota).
async function baixarPreview(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/// Traduz erros da ElevenLabs para algo acionável, em português.
function explicarErroEleven(err) {
  const raw = err?.message || String(err);

  // Chave válida, mas criada sem a permissão necessária. É o caso mais comum:
  // a ElevenLabs deixa marcar permissão por permissão ao criar a chave.
  const permissao = raw.match(/missing the permission (\w+)/i);
  if (permissao) {
    const nomes = {
      voices_read: "Voices › Read",
      text_to_speech: "Text to Speech",
      user_read: "User › Read",
      models_read: "Models › Read",
    };
    const alvo = nomes[permissao[1].toLowerCase()] || permissao[1];
    return (
      `A chave é válida, mas falta a permissão "${alvo}". ` +
      `Em elevenlabs.io › Profile › API Keys, edite a chave e marque ` +
      `Text to Speech e Voices › Read — ou escolha "Access to all".`
    );
  }

  // A cota VEM ANTES da chave, e a ordem aqui é o conserto de um erro real:
  // quando a cota acaba, a ElevenLabs responde 401 — não 429 — com o texto
  // "This request exceeds your quota of 10000. You have 0 credits remaining".
  // Como a verificação de 401 vinha primeiro, ela ganhava, e o aviso dizia
  // "chave inválida. Gere outra" com a chave perfeitamente boa. Ele passou a
  // tarde trocando de voz atrás de um problema que não existia.
  if (/quota|credits remaining|limit.*exceed|too many/i.test(raw) || err?.status === 429) {
    return (
      "A cota da ElevenLabs acabou — a chave está boa. " +
      "Ela renova sozinha; até lá falo com a voz do macOS."
    );
  }
  if (err?.status === 401 || /invalid.*api.?key|unauthorized/i.test(raw)) {
    return "Chave da ElevenLabs inválida. Gere outra em elevenlabs.io › Profile › API Key.";
  }
  if (err?.status === 422) {
    return "A ElevenLabs recusou o texto ou a voz escolhida.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(raw)) {
    return "Sem conexão para falar pela ElevenLabs; usando a voz do macOS.";
  }
  return `ElevenLabs: ${raw}`;
}

module.exports = {
  listarVozesEleven,
  vozesUsaveis,
  cotaEleven,
  sintetizarEleven,
  baixarPreview,
  explicarErroEleven,
  MODELO_QUALIDADE,
  MODELO_RAPIDO,
  velocidadeValida,
  VELOCIDADE_MIN,
  VELOCIDADE_MAX,
};
