// glossario.js — GLOSSARIO.md, o dicionário do cérebro no Obsidian.
//
// 27/11/2026: "cria um glossário para o cérebro". O cofre fala uma língua
// própria (fato, processo, assembleia, limiar, lembrança, fio, trava...) que
// só fazia sentido para quem leu o código. Esta nota explica cada palavra em
// português simples e aponta para a nota onde ela aparece.
//
// É gerada a cada abertura, como CEREBRO.md e MEMORIA.md: a verdade é o
// código, e os números (limiares, tetos, validade) vêm das constantes dele,
// então o glossário nunca mente sobre o que ela faz. "quando: nunca" deixa a
// nota fora do índice que viaja em toda pergunta (custaria tokens à toa).

"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { LIMIAR_INICIO, LIMIAR_MIN, LIMIAR_AJUSTE, OCULTOS_MAX } = require("./pensamento.js");
const { MAX: MAX_LEMBRANCAS, VALIDADE, SIMILARIDADE_MIN } = require("./lembrancas.js");
const { MAX_POR_DIA, LIMIAR_HZ } = require("./iniciativa.js");

const pct = (x) => `${Math.round(x * 100)}%`;
const dias = (ms) => Math.round(ms / 86_400_000);

/// As seções: [título, [[termo, explicação], ...]]. Termos em ordem de
/// leitura (do mais geral ao mais específico), não alfabética: quem lê de
/// cima a baixo entende cada um com os anteriores.
function secoes(nome) {
  return [
    [
      "O cérebro (o cofre do Obsidian)",
      [
        ["Cérebro", `esta pasta inteira. Tudo que a ${nome} sabe, aprendeu e conversou com você mora aqui, em notas ligadas. A porta de entrada é [[CEREBRO]].`],
        ["Cofre", "o nome do Obsidian para a pasta de notas. \"Anotar no cérebro\" e \"anotar no cofre\" são a mesma coisa."],
        ["Memória", "as notas que ela consulta para responder: fatos e processos. O mapa é [[MEMORIA]]. Memória não se apaga: reescrever uma nota guarda um backup antes."],
        ["Fato", "algo sobre você ou o seu mundo que não muda sozinho: pessoas, finanças, grupos, datas. Mora em `fatos/`."],
        ["Processo", "um jeito de fazer: como lançar um gasto, como ler a agenda. Mora em `processos/`."],
        ["Aprendizado", "um erro que ela cometeu e o jeito certo, para não repetir. Mora em `aprendizados/`, mapa em [[APRENDIZADOS]]."],
        ["Conversa", "o diário de uma conversa com você, com data, hora e as notas que ela usou. Mora em `Conversas/`, índice em [[CONVERSAS]]."],
        ["Skill", "um comando que você ensinou, com passos fixos. Mora em `Skills/`."],
        ["Quando", "a linha no topo de cada nota que diz em que situação ela deve ser aberta. \"nunca\" quer dizer: é para você ler, não viaja nas perguntas."],
        ["Ligações", "os links `[[...]]` entre notas. São o que faz o grafo do Obsidian mostrar uma rede só, em vez de pastas soltas."],
        ["Gerado automaticamente", "nota que o código reescreve a cada abertura (como esta). Editar à mão não adianta: a verdade são os arquivos que ela resume."],
      ],
    ],
    [
      "A rede neural pulsada (o que ela sente)",
      [
        ["Rede pulsada (LIF)", "neurônios que acumulam tensão e disparam quando passam do limite, como os de verdade (Leaky Integrate-and-Fire). Veio do Pestinha. Resumo em [[REDE]]."],
        ["Neurônio", "uma unidade da rede. Cada um tem um papel: sentir algo, pesar algo ou decidir algo."],
        ["Pico (disparo)", "o momento em que um neurônio passa do limite e avisa os vizinhos. A frequência de picos (Hz) é o quanto ele está \"aceso\"."],
        ["Sinapse", "a ligação entre dois neurônios. O peso diz o quanto um pico de um empurra (ou segura) o outro."],
        ["Sentido", "neurônio que lê o Mac: hora do dia, app em uso, quanto tempo você está no computador, bateria. É como ela percebe o seu ritmo."],
        ["Humor", "o grupo de neurônios mais aceso agora: atenta, concentrada, animada, serena, preocupada, com saudade."],
        ["Iniciativa", `quando ela fala por conta própria: cumprimentar, sugerir pausa, mandar dormir, avisar do Mac, puxar conversa. Precisa de vontade (${LIMIAR_HZ} Hz sustentados) e passa pelas travas; no máximo ${MAX_POR_DIA} por dia.`],
        ["Inibição", "neurônio que segura os outros. É o \"respeito\": quando você está ocupado ou acabou de conversar, ele apaga a vontade de interromper."],
        ["Aprender (plasticidade)", "quando você responde bem a uma iniciativa, as sinapses que levaram a ela ficam mais fortes; quando dispensa, enfraquecem. Aparece em [[REDE]] como \"puxa\" ou \"segura\"."],
        ["Assembleia", "um grupo de neurônios novo que nasce quando uma associação aprendida fica forte. É a rede crescendo. Cada uma ganha nota em `rede/assembleias/`."],
        ["Diário da rede", "o que a rede fez em cada dia (iniciativas, respostas sozinhas, crescimento), em `rede/dias/`."],
      ],
    ],
    [
      "A rede de linguagem (o que ela responde sozinha)",
      [
        ["Rede de linguagem", "uma segunda rede, pequena, que lê a sua frase e tenta entender o que você quer antes de chamar os agentes. Detalhes em [[linguagem]]."],
        ["Intenção", "o que a frase pede: hora, bateria, lembretes, como ela está, o que ela consegue fazer... Se a rede reconhece, responde sozinha, lendo dados em código."],
        ["Confiança e limiar", `o quanto a rede tem certeza da intenção. Ela só responde sozinha acima do limiar (começa em ${pct(LIMIAR_INICIO)}, nunca abaixo de ${pct(LIMIAR_MIN)}); mudar os ajustes dela pede ${pct(LIMIAR_AJUSTE)}. Cada correção sua sobe o limiar daquela intenção; cada acerto desce um pouco.`],
        ["Neurônio oculto", `a camada do meio da rede de linguagem. Ela cresce quando aprende intenções novas, até ${OCULTOS_MAX}.`],
        ["Exemplo", "uma frase com a intenção certa. A rede treina com eles; cada pergunta que vai ao agente e volta com a ferramenta certa vira exemplo novo."],
        ["Lembrança", `uma resposta de conhecimento que um agente já deu (sem ferramenta nenhuma). Na próxima vez que você perguntar quase a mesma coisa (${pct(SIMILARIDADE_MIN)} das palavras), ela responde de memória. Até ${MAX_LEMBRANCAS} lembranças, cada uma vale ${dias(VALIDADE)} dias.`],
        ["Correção", "\"não era isso\", \"pensa de novo\", \"pergunta pro agente\": a rede desaprende o que errou, esquece a lembrança e passa a pergunta para os agentes."],
        ["Só leitura", "o que ela faz sozinha nunca age no mundo: não cria, não manda, não apaga. Agir é sempre dos agentes."],
      ],
    ],
    [
      "Os agentes (os modelos de fora)",
      [
        ["Agente", "um modelo de linguagem na nuvem que pensa, usa ferramentas e escreve a resposta quando a rede dela não sabe."],
        ["Duas vozes", "a nvidia decide e age (usa as ferramentas); o groq/qwen só conversa. Separadas de propósito: juntas, uma voz de conversa dizia ter feito o que não fez."],
        ["Provedor", "a empresa que roda o modelo: nvidia, groq, gemini, openrouter, mistral."],
        ["Reserva", "a fila de provedores para quando um falha ou fica sem cota: o pedido passa para o próximo e o fio da conversa vai junto."],
        ["Ferramenta", "uma ação que o agente pode pedir: ler arquivo, pesquisar na web, anotar na memória, ver a agenda. O código executa e devolve o resultado ou o erro."],
        ["Fio da conversa", "o trecho recente da conversa que vai junto de cada pergunta, para o agente lembrar do que vocês falavam."],
        ["Contexto", "tudo que o agente recebe numa pergunta: o fio, as notas abertas, a hora, o que ela sente. Tem teto, porque cada provedor aceita só um tanto."],
        ["Conversas simultâneas", "cada conversa da barra lateral tem o próprio turno: ela pode trabalhar numa enquanto você fala em outra, e cada resposta cai na conversa certa."],
      ],
    ],
    [
      "As travas (o que ela nunca faz sozinha)",
      [
        ["Trava", "uma regra no código, não no prompt: nenhum modelo convence o código a pular."],
        ["Sim", "o que não tem volta (apagar, mandar mensagem para alguém) espera o seu sim, nesta conversa. O sim de uma conversa não aprova o pedido de outra."],
        ["Honestidade", "se uma ferramenta falhou e a resposta diz que deu certo, o código corrige a fala antes de chegar em você."],
        ["Respeito", "as iniciativas têm intervalo mínimo, teto por dia e silêncio depois de vocês conversarem."],
        ["Conta é do código", "dinheiro e cálculo nunca saem da cabeça do modelo: quem soma é o código, e nada muda de data em silêncio."],
      ],
    ],
  ];
}

function textoDoGlossario({ nome = "Sexta-Feira" } = {}) {
  const linhas = [
    "---",
    "quando: nunca — este arquivo é gerado automaticamente",
    "tags: [cerebro, glossario]",
    "---",
    "",
    `# Glossário do cérebro da ${nome}`,
    "",
    "*As palavras que aparecem nas notas, na rede e nas conversas, em português simples. Gerado automaticamente: os números vêm do código.*",
    "",
  ];
  for (const [titulo, termos] of secoes(nome)) {
    linhas.push(`## ${titulo}`, "");
    for (const [termo, explicacao] of termos) linhas.push(`- **${termo}** — ${explicacao}`);
    linhas.push("");
  }
  linhas.push("Ver também: [[CEREBRO]] · [[MEMORIA]] · [[REDE]]", "");
  return linhas.join("\n");
}

async function gerarGlossario(raiz, opcoes = {}) {
  if (!raiz) return;
  try {
    await fsp.writeFile(path.join(raiz, "GLOSSARIO.md"), textoDoGlossario(opcoes));
  } catch {}
}

module.exports = { gerarGlossario, textoDoGlossario, secoes };
