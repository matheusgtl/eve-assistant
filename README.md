# Sexta-Feira

Assistente pessoal de desktop no espírito da FRIDAY do Homem de Ferro — voz feminina em português, esfera de redes neurais que reage à conversa, acesso real ao Mac e à internet, e um cérebro no Obsidian que aprende com os erros.

Ela se chama **Sexta-Feira** desde 25/11/2026; antes era a **E.V.E** ("Ivi"). Nome e pronúncia continuam configuráveis: o nome aparece na janela, a pronúncia é o que a voz lê em voz alta. Na primeira abertura depois da troca, quem ainda estava com o nome padrão antigo passa para o novo (`renomearParaSextaFeira` no `main.js`); nome escolhido à mão fica.

**O que NÃO mudou de nome, de propósito:** a pasta de dados (`~/Library/Application Support/E.V.E/`, com as chaves, o histórico e os lembretes), o log (`~/Library/Logs/E.V.E/eve.log`), o bundle id (`com.matheus.eve`) e o certificado de assinatura. Trocar qualquer um deles faria ela abrir sem chave ou o macOS pedir todas as permissões de novo. O cofre do Obsidian, esse sim, passou de `E.V.E/` para `Sexta-Feira/`: a pasta é **renomeada** (não copiada) na primeira abertura, e só se a nova ainda não existir.

É um **aplicativo nativo do macOS**. Não abre navegador, não sobe servidor, não tem URL.

## Instalado em

`~/Applications/Sexta-Feira.app` — abra pelo Launchpad, pelo Spotlight (⌘Espaço → "Sexta-Feira"), com dois cliques ou pelo **olho na barra de menus**. A instalação apaga o `E.V.E.app` antigo, que abriria o mesmo app com os mesmos dados.

Fechar a janela só a esconde: ela continua no olho da barra de menus, ouvindo o ⌥Espaço e avisando lembretes. O menu do olho tem abrir, falar, nova conversa, silenciar a voz e sair. O ícone é uma imagem *template* (`assets/trayTemplate*.png`): o macOS pinta de claro ou escuro sozinho.

O ícone do app vem da arte em `assets/logo-original.png`; `build/make-icon.swift` recorta o quadrado, aplica a máscara de cantos da Apple e gera o ícone do app e o da barra de menus. Dentro da tela a logo e o avatar das respostas são outro desenho: o olho em **vetor** (o `<symbol id="olho">` no `index.html`), que segue a cor do tema e fica nítido em qualquer tamanho — a foto do ícone parecia um adesivo colado na interface. O `pack.sh` refaz o `.icns` quando a arte muda.

## Primeira vez

1. Ela pede uma **chave de API**. Cole e clique em Conectar; fica salva só neste Mac, em `~/Library/Application Support/E.V.E/config.json`.

   | Motor | Onde pegar | Custo |
   | --- | --- | --- |
   | **Google Gemini** (recomendado) | aistudio.google.com › Get API key | **Grátis**, sem cartão |
   | Anthropic Claude | console.anthropic.com › API Keys | Precisa de créditos |

   Não há seletor de motor: ela reconhece pelo formato da chave (`AIza…` e `AQ.…` = Gemini, `sk-ant-…` = Claude). A configuração da versão anterior (E.V) é migrada sozinha.
2. O macOS vai pedir **Microfone** e **Reconhecimento de Fala**. Sem as duas ela não ouve.
3. Na primeira vez que ela for controlar outro app (tocar música, mandar mensagem, mandar arquivo para o Lixo), o macOS pede **Automação**. Autorize.
4. Como o app não é assinado com conta de desenvolvedor Apple, pode aparecer um aviso na primeira abertura: clique com o botão direito › **Abrir** › **Abrir**.

## A tela

Desde 25/11/2026, o layout das conversas do Claude, em três faixas:

- **Esquerda — conversas.** Nova conversa (⌘N, também ⌘K), configurações (⌘,) e a lista das conversas. Clicar numa antiga a reabre; a que estava aberta fica guardada (`chats.js`: o `historico.json` continua sendo a aberta, e o `chats.json` guarda as outras inteiras — trocar nunca apaga nada). Duplo clique no título lá em cima renomeia.
- **Centro — o chat.** A mensagem dele numa bolha à direita, a resposta dela em texto corrido com o olho ao lado, as ferramentas usadas como linhas discretas (`⚙ web search`). Conversa vazia mostra o olho, uma saudação e sugestões. O compositor é a caixa arredondada embaixo: anexar, silenciar a voz, microfone e enviar.
- **Direita — o painel dela.** A esfera de redes neurais (clique para falar), o estado, o **contexto da conversa**, o monitor do sistema (compacto: duas colunas, detalhe no passar do mouse, e medida que o Mac não informa some) e o uso dos agentes. A esfera tem um contorno desenhado (o limbo) e perspectiva menos curta: antes só a malha da frente aparecia e a figura lia como oval. O botão no canto da barra lateral esconde o painel; em janela estreita ele flutua.

O tema padrão é o **Sexta-Feira**: preto neutro com o ciano do olho. Todos os temas escuros são quase pretos; verde, âmbar e vermelho são os mesmos em todos (são sinal, não decoração). As **barras têm cores próprias** (`--barra-ok`, `--barra-meio`, `--barra-alto`), vivas nos dois modos: as do texto, no claro, precisam ser escuras para ler, e numa barra isso virava lama. As configurações são uma janela por cima do app, com as abas à esquerda.

O campo de escrever **cresce com o texto** até um teto e então rola. Campo de uma linha escondia o que você acabou de escrever assim que passava da largura — que é exatamente quando reler importa. **Enter** envia, **⇧enter** quebra linha.

Arquivo entra de três jeitos: arrastando para o compositor (o alvo é o lugar onde você ia escrever, não um retângulo tracejado à parte), pelo clipe, ou **colando uma imagem** — um print do ⌘⇧4 vai direto. Imagem colada não tem caminho no disco, então o conteúdo é gravado num temporário antes de virar anexo.

Tudo que ela fala aparece escrito no registro, com as ferramentas usadas logo abaixo da fala (`⎿ web_search`).

## Arquivos para ela olhar

Arraste um arquivo para a janela, ou clique na área de arquivo. Ele vai junto com a sua próxima mensagem — falada ou escrita.

| Tipo | O que acontece |
| --- | --- |
| imagem (png, jpg, webp, gif, heic) | ela olha a imagem de verdade; HEIC é convertido antes, porque os modelos não leem esse formato |
| pdf | o texto é extraído **aqui no Mac** (com OCR se for escaneado) e o arquivo também vai inteiro para quem lê PDF — ver a seção de PDF |
| texto, código, csv, json, log… | o conteúdo entra na mensagem (até 120 mil caracteres) |
| qualquer outro | ela recebe o caminho no disco e usa as ferramentas |

Limite de 8 MB para imagem. PDF acima disso ainda é lido: o arquivo não viaja, mas o texto extraído aqui vai.

## Usando

| Atalho | O que faz |
| --- | --- |
| **espaço** | fala com ela (segure e solte para enviar, ou dê um toque e ela ouve até você calar) |
| **arrastar arquivo** | anexa à próxima mensagem |
| **⌥espaço** | chama de qualquer aplicativo, mesmo com a janela atrás |
| **enter** | envia o que você digitou |
| **esc** | interrompe a fala e fecha o microfone |
| **⌘M** | muda a voz (ela continua respondendo por escrito) |

A janela abre **grande** — 88% da largura útil da tela, até 1500px — e guarda o tamanho que você deixar, inclusive maximizada. Antes eram 780×860 fixos, que num monitor grande obrigava a redimensionar toda vez.
| **⌘K** | limpa a conversa |
| **⌘,** | configurações |

**Mudo** é o botãozinho `voz on` / `voz off` ao lado de *interromper*, ou ⌘M. Não é a mesma coisa que interromper: aquele cala a frase de agora, este cala todas as próximas até você desligar — e ela segue respondendo por escrito na conversa. Ligar o mudo no meio de uma fala cala na hora, e nada de áudio é gerado, então também não gasta cota da ElevenLabs.

Clicar na esfera faz o mesmo que o espaço. Tudo que ela fala também aparece escrito na conversa — e a conversa continua lá quando você reabre o app.

**Quanto tempo ela espera você terminar** (Configurações › Geral) é regulável de 1 a 6 segundos. O cronômetro do silêncio é renovado pelo **microfone**, não pelo reconhecedor de fala: enquanto houver voz, a frase não acabou. Antes a escuta fechava em pausas de respiração, porque dependia de o reconhecedor mandar um resultado parcial — e ele atrasa.

**Dois modos de microfone** (em Configurações › Geral):

- **Aperte e fale** — o microfone abre com o espaço e fecha sozinho quando você para de falar.
- **Sempre aberto** — o microfone fica ligado e a conversa segue sem você apertar nada, até você desligar (espaço, Esc ou o botão). Enquanto ela fala, o microfone pausa — senão ela transcreveria a própria voz.

Exemplos: *"abre o Spotify"*, *"quanta bateria eu tenho?"*, *"pesquisa quanto está o dólar hoje"*, *"lê esse link pra mim"*, *"cria um arquivo de notas na mesa com a lista de compras"*, *"me lembra de ligar pro dentista amanhã às dez"*, *"manda mensagem pro João dizendo que vou me atrasar"*.

## O monitor dos agentes

Abaixo do monitor do sistema, na coluna da esquerda: quanto cada provedor de IA foi usado **hoje**.

Ele existe por um motivo prático — os planos gratuitos são medidos em **tokens por dia**, não em perguntas. Sem esse painel, a primeira notícia de que a cota acabou é ela parar de responder no meio de uma conversa.

Cada linha traz o provedor, uma etiqueta de situação (ativo, reserva, sem chave, ou quantos erros deu), o número de pedidos, os tokens gastos e o modelo que respondeu. Na ordem da corrente de socorro, para o painel mostrar quem substitui quem.

| | |
| --- | --- |
| **O número medido manda** | Os provedores informam o consumo junto da resposta — `usageMetadata` no Gemini, `usage` no formato OpenAI (`x_groq.usage` no Groq, que só manda se a gente pedir). Quando vem, é esse que vale |
| **"≈" quer dizer estimado** | Sem o provedor informar, estimamos por caracteres ÷ 4 e marcamos. Estimativa apresentada como medida é pior do que não ter número |
| **A barra prefere o saldo REAL** | Groq e companhia mandam o saldo da sua conta nos cabeçalhos de cada resposta (`x-ratelimit-remaining-requests` e amigos). Quando vem, a barra é esse número — a conta dele, da chave dele, agora. Tabela de plano gratuito copiada de blog envelhece e erra calada |
| **A janela sai de regra de três** | O mesmo cabeçalho significa coisas diferentes: no Groq, "requests" é por **dia**; na OpenAI, por **minuto**. A primeira versão lia o reset como "tempo até a janela virar" — e os cabeçalhos reais mostraram que está errado: com 999 de 1000 pedidos livres, o Groq respondeu `reset-requests: 1m26.4s`. Esses contadores são **balde furado**: o reset repõe o que foi *gasto*. A janela inteira é `reset × limite ÷ gasto`, e aí a conta fecha exata — 86,4s × 1000 = 24h; 547ms × 8000 ÷ 73 = 60s. Sem nada gasto não há o que deduzir, e o número não vira barra: barra de janela errada mente |
| **Teto publicado é o plano B** | Sem saldo informado, vale o teto que está documentado (Groq: 1.000 pedidos e 200 mil tokens por dia), e a barra mostra **o que aperta primeiro**. Esses vêm com "≈" e com a fonte no tooltip |
| **Sem teto nenhum, a barra é a fatia do dia** | NVIDIA e Gemini não informam saldo e não têm teto publicado confiável. Aí a barra mostra que fatia do consumo de hoje passou por ali — em cor neutra, e dizendo isso com essas palavras. Antes, esses provedores simplesmente não tinham barra, e o que mais trabalhava era o único sem nada desenhado |
| **O dia é o dia local** | Na verdade o Groq zera à meia-noite UTC e o Google à do Pacífico. Seguir cada fuso daria um painel ilegível, então é "hoje", não "restante exato" |

O consumo sobrevive a fechar o app, e dado de outro dia vira zero em vez de ser somado ao de hoje. Passe o mouse na barra para ver de onde o número veio.

## O monitor do sistema

Coluna da esquerda, atualizada a cada 2 segundos: CPU, memória, GPU, disco, rede, bateria e temperatura, mais tempo ligado, número de processos e versão do sistema.

As barras são **um trilho só, de pontas arredondadas** (até 25/11/2026 eram fileiras de blocos no estilo btop). A cor do preenchimento é a do nível e muda com transição: verde até 50%, âmbar até 80%, vermelho acima. A bateria é a exceção: nela cheio é bom, então a escala inverte. As barras dos agentes seguem a mesma regra; a "fatia do dia" (provedor sem teto conhecido) fica numa cor neutra, porque ali cheio não quer dizer acabando.

De onde vem cada número:

| Medida | Fonte | Observação |
| --- | --- | --- |
| CPU | contadores de ticks do kernel (`os.cpus()`) | somar `ps -o %cpu` daria a média de vida de cada processo e números como "199%" |
| Memória | `vm_stat` | "em uso" = ativa + wired + comprimida, como o Monitor de Atividade |
| GPU | `ioreg` (`Device Utilization %`) | única fonte sem instalar nada; onde o driver não publica, fica só o modelo |
| Disco | `df` em `/System/Volumes/Data` | no APFS a raiz é selada e mostraria 20% |
| Rede | diferença entre duas leituras do `netstat -ib` | escala logarítmica na barra, até ~16 MB/s |

**A leitura tem três velocidades.** Ler tudo a cada 2 segundos custava ~58 ms de CPU — 2,9% de um núcleo, com o aplicativo aberto o dia inteiro. Agora cada número vai na cadência da própria natureza:

| | o quê | com que frequência |
| --- | --- | --- |
| rápido | CPU, memória, GPU, rede | toda leitura (2 s) |
| lento | bateria, disco, nº de processos, temperatura | a cada 5ª leitura (~10 s) |
| fixo | nome da GPU, versão do macOS | uma vez só |

A barra de bateria não anda mais depressa por ser lida cinco vezes mais, e a versão do macOS era um comando por amostragem para devolver sempre a mesma string. Medido depois: mediana de **~33 ms** por leitura, contra ~85 ms no ciclo completo. O painel já não atualizava com a janela escondida.
| Bateria | `pmset -g batt` | |
| Temperatura | — | o sensor do SMC exige root; fica **n/d** em vez de número inventado |

Os mesmos números entram no contexto dela a cada pergunta — por isso ela responde "sua memória está em 57%" sem gastar uma ferramenta.

## O que ela pode fazer

24 ferramentas, agrupadas:

- **Computador** — rodar comandos, controlar apps por AppleScript, abrir qualquer coisa, ler/escrever/editar arquivos, mandar para o Lixo, listar pastas, procurar no disco pelo Spotlight, ler o estado da máquina, área de transferência.
- **Internet** — pesquisar na web (corrente de buscadores, com as fontes) e ler o texto de qualquer página, inclusive as que bloqueiam robô.
- **Documentos** — ler PDF do disco, inclusive escaneado (OCR).
- **Avisos** — notificação do macOS na hora, e lembretes que disparam notificação + fala na hora marcada (sobrevivem a fechar o app; se a hora passou com ele fechado, ela avisa assim que abre, dizendo que atrasou).
- **Memória** — consultar e escrever processos e fatos no cofre de `.md` (seção acima).
- **Skills** — abrir o roteiro de uma skill, criar uma nova, e salvar a conversa num `.md` do cofre.
- **Mensagens** — iMessage e e-mail pelo Mail, e WhatsApp (ela abre a conversa com o texto pronto e dá o enter pelo System Events). Em todos os casos ela lê em voz alta para quem vai e o texto inteiro, e só manda depois do seu sim.

## Contexto de cada conversa

O cérebro (o modelo) só lembra do que viu desde que começou. Isso acontece em três momentos: o app abriu, ele **trocou de conversa** na barra lateral, ou **o provedor secou** e outro assumiu no meio da tarefa. Em todos, o `main.js` marca `inicioDoCerebro`, e o prompt leva **"O FIO DESTA CONVERSA"**: as últimas falas da conversa aberta que o cérebro atual não viu (até 12 falas, 1.800 caracteres), com o título da conversa e a ordem de continuar a tarefa sem perguntar de novo. Antes só o primeiro caso existia (e com limite de 48 h); a troca de provedor descartava a conversa inteira.

O painel da direita mostra quanto da conversa existe (o histórico guarda 120 itens por conversa) e avisa quando ela fica longa.

## Aprendizados: ela não repete o erro

Pedido dele em 25/11/2026 (`aprendizados.js`). Duas metades:

- **O que deu errado é do código.** Toda ferramenta que volta com erro entra em `aprendizados/erros-de-ferramenta.md` no cofre, agrupada (número e caminho não contam) e com quantas vezes aconteceu. O que se repete volta no prompt como alerta.
- **O jeito certo é dela.** Quando a fala dele parece uma correção ("não é isso", "tá errado", "eu te disse que…"), o prompt daquele turno manda ela fazer certo e gravar um aprendizado (`anotar_memoria`, pasta `aprendizados`): o erro, o jeito certo e o `quando:`.

Toda lição volta em **toda** pergunta, no bloco "O QUE VOCÊ JÁ APRENDEU" (até 1.400 caracteres, as mais novas primeiro). Lição que só mora no disco não muda comportamento.

## A trava da honestidade

Lição no prompt é pedido, não garantia: em 25/11/2026 ela respondeu "Tudo certo. Removi…" com três de quatro `trash_file` em erro, mesmo com a regra escrita. Então isso virou trava em código (`honestidade.js`). O `main.js` guarda cada ferramenta de **ação** do turno e o resultado dela; se alguma falhou e não deu certo depois com o mesmo alvo, e a resposta não admite falha nenhuma, o código acrescenta a correção na tela e na voz ("Correção: nem tudo deu certo. Não consegui mandar para o Lixo “Nox….dmg” (o Finder não respondeu)…") com os botões *Tenta de novo* / *Deixa assim*. Consulta que falha (busca, leitura) não entra, porque não é algo que ela fez. Cada vez que a trava age conta como erro dela no diário de aprendizados, e a repetição vira alerta no prompt.

## O cérebro no Obsidian

Memória, aprendizados, conversas e skills são uma rede só. A nota `CEREBRO.md` liga os índices (`MEMORIA`, `APRENDIZADOS`, `CONVERSAS`); cada conversa salva termina com **Ligações** para as notas que ela abriu e os aprendizados que gravou naquela conversa. No grafo do Obsidian isso aparece como uma rede de neurônios conversando, e não como pastas soltas.

## A memória dela (cofre do Obsidian)

A memória dela mora **dentro do cofre que você já usa no Obsidian**, numa subpasta `E.V.E/`. Ela descobre o cofre sozinha pelo registro do Obsidian (`obsidian.json`) e usa o mais recentemente aberto; sem nenhum cofre, cria um próprio em `~/Documents/E.V.E`. Para mandar noutro lugar, `memoriaDir` no `config.json`.

Isso não é detalhe: um cofre separado que o Obsidian nunca abre não é um segundo cérebro, é uma pasta solta no disco — foi assim que ela ficou, sem receber uma única anotação, até isto ser corrigido.

```
<seu cofre>/E.V.E/
  MEMORIA.md               ← mapa gerado, com links do Obsidian
  processos/backup-das-fotos.md
  fatos/meu-provedor.md
```

Se a memória mudar de lugar, as anotações vão junto, e a pasta antiga fica onde estava — apagar dado do usuário por conta própria não é mudança, é descuido. E dentro de um cofre que já existe ela **não** cria outro `.obsidian`: cofre aninhado não abre, só polui a árvore.

Cada arquivo é um **processo** (como fazer algo) ou um **fato** (algo que vale lembrar). No topo vai uma linha dizendo quando consultar:

```markdown
---
quando: ele pedir para fazer backup das fotos
---

# Backup das fotos

1. Conectar o HD externo
2. Rodar `rsync -a ~/Pictures /Volumes/HD/`
```

**No contexto dela entra só o índice** — uma linha por documento, `nome — quando usar`. O conteúdo ela abre sob demanda, com `consultar_memoria`. Isso não é economia de estilo: jogar os `.md` no prompt faria cada arquivo entrar em **toda** pergunta, três vezes por pergunta, e desfaria o enxugamento das ferramentas. O índice tem teto (~900 tokens); passando dele, os excedentes saem e ela **sabe que saíram**, para não garantir que algo não existe quando só não cabia.

O "aprender" é a outra ferramenta. Você ensina um processo, ela grava com `anotar_memoria`, e na próxima conversa a linha está no contexto dela — ela sabe que o processo existe, lê, e segue. Não é aprendizado de verdade: o modelo não muda, são anotações que ela consulta. Mas tem uma vantagem sobre aprendizado real: **são seus arquivos**, em texto puro, que você abre e corrige quando ela anotar algo torto. Sobrescrever guarda `.bak`.

**O índice é derivado dos arquivos, não de um índice que ela mantém.** É o que faz uma nota que você escreveu no Obsidian aparecer para ela sem nenhum passo de sincronização — e sem frontmatter o primeiro título do arquivo faz o papel do `quando:`. Um índice mantido à mão sairia de sincronia com a pasta no primeiro dia.

**A ordem de gravar fica fora da lista.** Parece bobagem e não é: ela saía com o mesmo `- ` dos documentos, logo abaixo deles, e lida de cima para baixo virava só mais uma linha do catálogo — uma ordem disfarçada de item. A memória passou semanas sem receber uma anotação por causa disso. Agora tem título próprio, e um teste falha se alguém juntar as duas coisas de novo.

Ela lê e escreve **só na subpasta dela**. As suas notas pessoais, no resto do cofre, ela não vê — e isso é deliberado: o que entra na memória dela sai desta máquina a cada pergunta, rumo ao provedor de IA.

## Provedores: quem pensa por ela

O cérebro dela não está preso a uma empresa. Dá para configurar mais de um provedor e, quando o principal bate o limite, ela **passa para o próximo em vez de ficar muda**.

**Hoje o principal é a NVIDIA**, e a conta que levou a isso vale registrar. O Groq é de longe o mais rápido — e no plano gratuito ele **não consegue terminar uma pergunta que usa ferramenta**:

| | tokens |
| --- | --- |
| fixo por pedido (prompt + 24 ferramentas) | ~3.000 |
| resultado de uma busca no histórico | ~825 |
| **um pedido depois de pesquisar** | **~3.800** |
| teto do Groq grátis | **8.000 por minuto** |

Cabem dois pedidos por minuto. Uma pergunta com ferramenta precisa de três — pergunta, ferramenta, resposta. Daí a sequência que aparecia no log: `groq → gemini → nvidia` no meio de uma única resposta, e **cada troca descarta o histórico da conversa**, porque cada cérebro guarda o diálogo no formato da própria API. Todos os modelos gratuitos do Groq dividem o mesmo teto de 8.000, então trocar de modelo lá dentro não resolve.

O Groq ficou de reserva, onde continua ótimo para respostas curtas.

**E dentro da NVIDIA o modelo também foi escolhido por medida**, com o prompt e as 24 ferramentas reais:

| Modelo | 1ª palavra (mediana) | Caminho com ferramenta | Escolheu a ferramenta certa |
| --- | --- | --- | --- |
| `nemotron-3.5-bolt-e4b` | 455 ms | 808 ms | **4 de 7** |
| **`nemotron-3.5-lightning-30b-a3b`** | **664 ms** | **449–1.353 ms** | **6 de 7** |
| `nemotron-3-ultra-550b-a55b` | 1.052 ms | 906–5.994 ms | 6 de 7 |

O `lightning` é um MoE de 30 B com 3 B ativos: pouca memória ligada por token, e por isso rápido. Ele acerta a ferramenta tanto quanto o `ultra`, que é dezoito vezes maior.

O `bolt` é mais rápido ainda e foi descartado **por medida, não por desconfiança**: em três dos sete casos ele não chamou a ferramenta — descrevia o que ia fazer ("vou salvar esta conversa, quer dar um título?") e não fazia. Numa assistente que age, isso é pior do que ser lenta.

Um detalhe que só apareceu medindo: sem `enable_thinking: false`, o `lightning` gastava 526 caracteres pensando antes de falar e ficava **mais lento que o ultra** no caminho com ferramenta.

| Provedor | Como entra | Limite grátis | Por que está aqui |
| --- | --- | --- | --- |
| **Gemini** | chave `AIza…` / `AQ.…` | varia por projeto; já apareceu `limit: 0` | é o único com busca do Google por dentro |
| **Groq** | chave `gsk_…` | ~200 mil tokens/dia | a inferência mais rápida que existe — é o que se sente na voz |
| **NVIDIA NIM** | chave `nvapi-…` | ~40 pedidos/min, sem teto diário publicado | conta de desenvolvedor, sem cartão. Roda o `nemotron-3-ultra`, com o raciocínio **desligado**: para voz, pensar é latência antes da primeira palavra, e os tokens de raciocínio saem da mesma cota |
| **Mistral** | chave sem prefixo fixo, nas Configurações | ~1 bi de tokens/mês, **se a conta liberar** | alguns consoles pedem plano antes de dar chave |
| **Cerebras** | chave `csk-…` | incerto (o plano permanente parece ter acabado em 2026) | mesmo adaptador, custa zero manter |
| **OpenRouter** | chave `sk-or-…` | 50/dia (1.000 após compra única) | mesmo adaptador |
| **Claude** | chave `sk-ant-…` | pago | para quem tiver créditos |

Os quatro do meio falam o **mesmo protocolo** (`POST /v1/chat/completions`, mesmo formato de ferramentas), então é um adaptador só para todos — o que muda é endereço, nome do modelo e onde se pega a chave.

Duas coisas que valem saber antes de depender disso:

**Ao trocar de provedor, o histórico da conversa não vai junto.** Cada cérebro guarda a conversa no formato da própria API, e não existe tradução fiel entre eles. O provedor novo responde a pergunta do momento sem o que veio antes, e ela **avisa na tela** quando isso acontece. A troca vale para o resto da sessão: voltar ao principal a cada pergunta significaria pagar o erro dele de novo toda vez.

**Provedor que não faz tool use não serve — e ela descobre em uso.** "Compatível com a OpenAI" não garante ferramentas: cada provedor gratuito suporta um subconjunto, e nenhum deles publica isso de forma confiável. Sem ferramentas a E.V.E seria um chat inútil aqui, então um 400 dizendo que `tools` não é suportado não é tratado como erro — é tratado como provedor que não serve, e ela passa para o próximo.

**Se ela já começou a falar, não troca.** Repetir a pergunta em outro provedor faria a resposta sair com o começo duplicado. Nesse caso o erro aparece, e ela não finge que deu certo.

Quem pensa primeiro você escolhe em ⌘, › cérebro (só aparecem provedores que têm chave). Os outros viram reserva, nesta ordem: `groq → gemini → claude → nvidia → cerebras → openrouter → mistral`.

**Raciocínio do modelo não é fala.** Modelos como o nemotron mandam o pensamento num campo separado (`reasoning_content`); ela ignora esse campo — ler aquilo em voz alta seria narrar o próprio rascunho. Mas conta o tamanho, porque é isso que explica uma resposta vazia: se um modelo gastar a resposta inteira pensando, ela diz exatamente isso em vez de ficar muda, e passa para o próximo provedor. Ficar muda é o pior jeito de falhar — parece que ela te ignorou. O Mistral é o último de propósito: é o de teto mais alto, então é o que faz sentido guardar para o fim.

## Pesquisa na web

A pesquisa é uma **corrente de buscadores**, na mesma ideia da corrente de cérebros: tenta um, cai para o próximo. Cada um só entra se tiver chave.

| Ordem | Buscador | Plano gratuito |
| --- | --- | --- |
| 1 | **Busca do Google**, pelo grounding do próprio Gemini | já vem na chave que ela usa para pensar, sem cadastro novo — mas tem cota diária |
| 2 | **Tavily** ✅ configurado | 1.000 buscas/mês, **sem cartão**. Feito para IA: devolve resposta pronta além dos links |
| 3 | **Serper** (resultados do Google) | 2.500 buscas grátis ao criar a conta, sem cartão |
| 4 | **Brave Search** | US$ 5 de crédito por mês (~1.000 buscas); pede cartão |
| 5 | **LangSearch** | plano gratuito medido em tokens por dia |
| 6 | **SearXNG seu** | sem chave — é endereço, não credencial |
| 7 | DuckDuckGo (resposta instantânea) e **Wikipédia** | sem chave, mas não sabem preço, notícia nem resultado de jogo |

Configure em ⌘, › pesquisa na web. **A chave é testada com uma busca de verdade** ao salvar: chave errada não dá erro nenhum sozinha — a corrente desce calada para a Wikipédia, e você só descobre dias depois que um dia inteiro de perguntas atuais virou resposta de enciclopédia.

**Campo em branco não mexe no que já está salvo**, e um traço (`-`) remove. Isso vale também para as chaves de provedor. A primeira versão lia campo vazio como "apague" — e como a tela limpa os campos depois de salvar, gravar uma chave nova apagava todas as outras. Aconteceu de verdade em 27/10: salvar a do Serper levou junto a do Tavily, sem aviso nenhum.

A chave do Gemini é guardada **à parte** da chave do cérebro: se você passar a pensar pelo Groq, a Busca do Google continua disponível.

**Por que não raspar um buscador.** Testado de novo em outubro de 2026, com curl: DuckDuckGo (html e lite) responde "Unfortunately, bots use DuckDuckGo too" com desafio anti-robô; Mojeek pede JavaScript para resolver um captcha; as instâncias públicas de SearXNG devolvem 429 ou página de verificação, e a saída `format=json` vem desligada nas que respondem. Não é questão de cabeçalho: é desafio no servidor.

**Pesquisa não abre aba.** Ver acima, em "o que ela faz sem pedir licença".

**Cache de dez minutos.** O log de uso real mostrou quatro `web_search` idênticos em seis segundos — a resposta fraca da reserva fazia o cérebro tentar de novo, e cada tentativa era uma busca paga. Agora a segunda vem do cache.

**Buscador que secou fica de molho.** Com a cota do Google esgotada, toda pesquisa do dia começava com uma sondagem condenada — medido: **933 ms** jogados fora, em cada busca. Agora, quem devolve limite sai da fila por um tempo, e o prazo depende do tipo (os dois chegam como 429 e são coisas diferentes):

| Tipo | Prazo | Por quê |
| --- | --- | --- |
| cota do plano (dia, mês) | 30 min | não volta nos próximos minutos |
| limite de ritmo (por segundo) | 2 min | se recupera sozinho; dormir meia hora trocaria o buscador bom pela Wikipédia à toa |
| rede fora, chave recusada | não seca | pode ser o wi-fi; desligar por isso seria desligar o que funciona |

Limpar o **cache** não acorda quem secou: são duas coisas, e por um dia foram a mesma função. O log de 27/10 mostrou o preço disso — ele salvou uma chave do Serper às 16:32, o salvamento limpou o cache, e junto foi embora a marca de que o Google estava esgotado; às 16:34 a sondagem condenada voltou, cinco minutos depois de um descanso de trinta. Hoje só trocar a chave *daquele* buscador o acorda.

Se **todos** estiverem de molho, os descansos são ignorados: a trava existe para poupar tempo, nunca para transformar "lento" em "sem resposta". E com o Google fora da fila, as respostas do Tavily deixam de vir rotuladas como reserva — porque deixaram de ser.

**O resumo do buscador vem marcado.** O Tavily devolve um parágrafo pronto junto dos links, e ele costuma sair **em inglês** mesmo com a pergunta e as fontes em português — o resumidor dele não tem opção de idioma. O texto chega a ela com um rótulo pedindo para reescrever em português; sem isso, o jeito mais provável de usar um parágrafo pronto é repetir como está.

**Leitura de página com reserva.** Quando o site bloqueia quem não é navegador, ou só monta o conteúdo com JavaScript, a leitura direta volta vazia. Nesse caso ela tenta pelo `r.jina.ai`, que busca pelo servidor dele e devolve markdown — sem chave.

Resposta de reserva vem **anunciada como reserva**. Se nenhum funcionar, ela diz que não conseguiu pesquisar, com a lista do que falhou, em vez de responder de memória como se fosse informação atual.

## PDF, inclusive escaneado

Arraste um PDF e ela lê de verdade — não importa qual provedor esteja pensando. Também tem a ferramenta `ler_pdf`, para um arquivo que já está no disco.

O trabalho é feito por um helper nativo (`native/ev-pdf`, em Swift), porque o macOS já traz os dois motores certos:

- **PDFKit** para o texto. É o mesmo motor da Pré-Visualização, e acerta onde os leitores em JavaScript erram: coluna dupla, tabela, fonte embutida, acentuação.
- **Vision (OCR, pt-BR)** quando a página **não tem texto nenhum** — um PDF escaneado é uma foto da página. Contrato, boleto e exame de laboratório chegam assim quase sempre; sem OCR, "ler PDF" cobriria metade dos PDFs reais.

Quando o texto vem de OCR, ela **diz isso** antes de afirmar um número em voz alta. E PDF grande não é mais recusado: acima de 8 MB o arquivo não viaja, mas o texto extraído aqui no Mac vai.

## Skills — um comando, uma sequência de ações

Tem coisa que você pede sempre e que é um **roteiro**, não uma pergunta. Explicar o roteiro toda vez é trabalho repetido — e ela faz diferente a cada vez.

Uma skill é um `.md` na pasta `Skills/` do mesmo cofre do Obsidian onde mora a memória:

```markdown
---
comando: arrumar os downloads
quando: ele pedir para organizar, limpar ou arrumar a pasta de downloads
---

# Arrumar os downloads

1. Liste ~/Downloads.
2. Separe por tipo em subpastas (imagens, documentos, instaladores).
3. Mande para o Lixo o que tiver mais de 90 dias.
4. Diga quantos arquivos moveu.
```

- O `comando:` é o que você fala. O `quando:` é a **única linha que fica no contexto dela o tempo todo** — escreva pensando em como ela reconhece a hora de usar. Os passos ela lê só quando a skill é acionada, pela ferramenta `usar_skill`.
- **Você escreve no Obsidian e vale na pergunta seguinte**, sem sincronizar nada e sem reiniciar o app.
- Ou peça: *"crie uma skill que…"*. Ela chama `criar_skill` e grava o arquivo (se já existir um com o mesmo nome, guarda `.bak`).
- Já vêm duas prontas — **salvar conversa** e **resumir o dia** — mais um `_como-criar-uma-skill.md` com o formato. Pasta vazia não ensina nada.

**Salvar conversa** escreve a conversa de verdade (a que está em disco, não a que ela lembra) em `Conversas/` no cofre: `salve esta conversa`, ou `salva como "contrato da Nicolly"`.

Skills e conversas salvas **não entram no índice da memória**, que tem orçamento próprio — uma semana de conversas salvas expulsaria os fatos dela do próprio contexto.

## A rede neural: quando ela fala sem você chamar

Desde 26/11/2026 a Sexta-Feira tem uma **rede neural pulsada** própria (`rede.js`), adaptada do [Pestinha](https://github.com/mille-okws/pestinha) (`core/nervous_system.py`). A máquina é a mesma de lá: neurônios de integração e disparo com vazamento (LIF), ruído de membrana, adaptação de limiar, inibição lateral entre motores, habituação dos receptores e aprendizado por recompensa de três fatores. O desenho é outro: lá a rede decide o que um bichinho de tela sente; aqui ela decide **quando a assistente fala com você por conta própria**. São 334 neurônios e ~8.700 sinapses, rodando em JavaScript no processo principal, sem internet e sem gastar token (custa poucos milissegundos por segundo).

**Ela não pensa nem escreve.** Isso continua com os modelos (`brains.js`). A rede só sente e quer; quem escreve a mensagem é um modelo de frase com os números verdadeiros, e quem deixa sair são travas em código.

| Camada | Arquivo | O que faz |
|---|---|---|
| Sentidos | `sentidos.js` | Só olha: nome do app da frente (`lsappinfo`), tempo parado (`powerMonitor`), bateria (`pmset`) e hora. Nada pede permissão do macOS, e nunca lê conteúdo de janela ou tecla. Vira 16 canais de 0 a 1: trabalho, lazer, web, atividade, ausência, volta, madrugada, primeiro uso do dia, bateria, conversa, cansaço (uso contínuo), saudade (dias sem conversar)… |
| Rede | `rede.js` | Sentidos → interneurônios (alerta, foco, cuidado, curiosidade, saudade, calma, receio, respeito) → motores. Os de **humor** (atenta, concentrada, serena, preocupada…) aparecem no painel e no olho; os de **decisão** são as iniciativas: `PAUSA`, `DORMIR`, `SAUDAR`, `AVISAR` (bateria) e `PAPO`. |
| Travas | `iniciativa.js` | A vontade tem que **durar** (40 Hz·s acima de 10 Hz, um pico não basta). O **fato tem que ser verdade** (pausa só com 90 min de uso contínuo medido; dormir só entre 23h e 5h; bateria só com leitura do `pmset` fora da tomada). **Respeito**: nunca numa chamada (Zoom, FaceTime, Teams…), nunca com você longe, nunca enquanto ela fala ou pensa, nunca até 5 min depois de vocês conversarem. **Intervalo**: 20 min entre quaisquer duas, um intervalo por tipo (pausa 1h30, dormir 3h, cumprimentar 4h, bateria 1h, papo 1 dia) e no máximo 8 por dia. |

A mensagem chega como **notificação** e fica escrita na conversa aberta; ela só fala em voz alta se a janela estiver na sua frente.

**Ela aprende com a sua resposta**, como o Pestinha aprende com o carinho. O contexto do momento em que ela falou (os sentidos acesos) fica guardado; se você responde em até 10 min, a ligação desses sentidos com aquela iniciativa se fortalece (agradeceu: +1; respondeu qualquer coisa: +0,3; clicou na notificação: +0,2) ou enfraquece ("agora não", "para de", "não precisa": −1, e acende o receio por 10 min). Ignorar pesa pouco (−0,1): a notificação pode nem ter sido vista. Os pesos aprendidos têm teto (+0,08 a −0,15 do limiar) e, junto com a habituação, ficam em `rede.json` na pasta de dados. Arquivo inválido é descartado inteiro e a rede começa do zero.

**Os pesos foram medidos, não chutados.** `test/mente.test.js` roda cada cenário (trabalho longo, madrugada, volta, bateria, dois dias sem conversa) e confere que a iniciativa certa vence e passa do limiar — e os cenários em que ela tem que ficar quieta (só trabalhando, cansado mas longe, cansado mas conversando, com saudade mas trabalhando, jogando). Mudou um peso em `CONEXOES`? Rode esse teste.

Desligar: Configurações › Geral › "Mandar mensagens por conta própria", ou o mesmo item no menu do olho. A rede continua rodando (é ela que dá o humor), só não fala.

## Segundo plano e o olho na barra de menus

**Clique no olho** abre a conversa (ou esconde, se ela já está na frente); o **clique direito** abre o menu: humor da rede, falar, nova conversa, voz silenciada, mensagens por conta própria, abrir junto com o Mac e sair. Fechar a janela não fecha o app: com "Ficar em segundo plano" ligado (padrão), o ícone **sai do Dock** e ela fica só no olho, ouvindo o ⌥Espaço, disparando lembretes e com a rede rodando. Sair de verdade é ⌘Q ou "Sair" no menu.

"Abrir junto com o Mac" (desligado por padrão) registra o app nos itens de início de sessão; aberta assim, ela começa só no olho, sem janela. O Dock some **em tempo de execução** (`app.dock.hide()`), e não por `LSUIElement` no `Info.plist`: mexer no plist muda a assinatura e o macOS pediria as permissões de novo.

## O que ela faz sem pedir licença

A régua é: **o que dá para desfazer, ela faz**. Criar e editar arquivos, mandar para o Lixo, abrir e fechar aplicativos, mudar ajustes, organizar pastas, rodar comandos — tudo na hora, sem perguntar.

**Abrir coisa na sua tela é a exceção, e é a pedido.** Pesquisar é LER: depois de uma busca ela responde com o que leu e cita a fonte em palavras. Ela só abre o navegador, um app ou um arquivo se você pedir para abrir, mostrar ou ver. Isso tem data: até 27/10 "navegar e abrir páginas" estava na lista acima, e o log mostrava `web_search` seguido de `open_target` — ela pesquisava e jogava uma aba na sua frente, no meio do que você estava fazendo. O prompt dela diz isso com todas as letras, e a lista de comandos barrados foi enxugada: fechar um app (`killall`) e botar o Mac para dormir saíram de lá, porque os dois se desfazem.

Restam duas travas, e elas não dependem de o modelo se comportar:

1. **Comando que destrói sem volta** — qualquer `rm`, `find -delete`, `sudo`, formatar, desligar, esvaziar o Lixo, `git reset --hard`, force push, `>` por cima de arquivo que já existe, baixar e executar script (`curl … | sh`). Ela explica o risco e espera o seu sim.
2. **Mensagem para outra pessoa** — o destinatário é gente e não existe desfazer. Ela lê para quem vai e o quê, e só manda depois do seu sim.

## Botões de resposta

Quando a resposta depende de você, aparecem botões embaixo da fala dela. Clicar é o mesmo que escrever o rótulo, e falar também vale.

- **Confirmação** (`Sim, pode` / `Não`): quando uma trava pede o seu sim. **O sim é registrado pelo código, não pelo modelo**: `confirmed=true` só vale se a sua fala seguinte for um sim para aquela mesma chamada, e vale uma vez. Antes, o modelo podia preencher `confirmed=true` sozinho, e o log de 25/11 mostra isso (`trash_file … confirmed="true"` na primeira chamada). Mudar de assunto descarta o pedido, e outro comando ou destinatário precisa de outro sim.
- **Escolha** (o que ela oferecer): ela termina a pergunta com `[opções: Sim, cria; Não precisa]`. Essa linha sai da tela e da voz e vira botões, com o recomendado primeiro. Das 75 respostas salvas até 25/11, 15 terminavam em pergunta, e em 12 você respondeu outra coisa: a oferta se perdia.

A lógica está em `escolhas.js`, e `test/escolhas.test.js` confere inclusive a marca chegando em pedaços, como a voz de conversa manda.

## WhatsApp

Sai de verdade, depois de você confirmar em voz alta: ela lê para quem vai e o texto inteiro, você diz que sim, e ela manda.

Por dentro é automação de interface, não de API — o WhatsApp não tem dicionário de AppleScript, então não existe "peça ao app para enviar". O caminho é o esquema `whatsapp://send`, que abre a conversa certa com o texto já escrito na caixa, e o Enter final sai pelo System Events. Três consequências disso:

- precisa da permissão em **Ajustes do Sistema › Privacidade e Segurança › Acessibilidade** (ela pede na primeira vez; se faltar, a mensagem de erro diz exatamente onde autorizar);
- ela espera 3 segundos a conversa abrir antes de teclar;
- ela pede para você conferir na tela, em vez de jurar que saiu — se a conversa demorar mais que o normal, o Enter pode não pegar.

Número brasileiro sem o +55 é completado sozinho. Número curto demais é recusado, não "completado no chute".

iMessage e e-mail (pelo Mail) saem pelo AppleScript do próprio app, também depois da confirmação.

## O custo de cada pergunta

As definições de ferramenta viajam em **todo** pedido ao modelo, e uma pergunta real faz uns três pedidos (pergunta → ferramenta → resposta). Então esse texto é a maior despesa fixa dela:

| | antes do enxugamento | depois | hoje |
| --- | --- | --- | --- |
| prompt do sistema | 719 tk | 661 tk | 641 tk (+136 com duas skills) |
| ferramentas | 1.773 tk (18) | 1.506 tk (20) | **1.866 tk (24)** |
| por pedido | 2.521 tk | 1.972 tk | **~2.643 tk** |
| por pergunta (3 pedidos) | 7.563 tk | 5.916 tk | **~7.929 tk** |

O enxugamento tirou repetição: o nome do campo redito em prosa ("filepath: Caminho do arquivo"), e o ritual do `needs_confirmation`, que estava em quatro ferramentas **e** em dois blocos do prompt.

A subida depois disso é o preço de quatro ferramentas novas de verdade — `ler_pdf`, `usar_skill`, `criar_skill`, `salvar_conversa`. No plano gratuito do Groq (200 mil tokens/dia) isso é a diferença entre ~34 e ~25 perguntas por dia. Vale a pena, mas não é de graça, e por isso está escrito aqui.

O que ficou de propósito nas descrições: quando preferir uma ferramenta a outra (`applescript` para o que é dentro de um app, `ler_pdf` em vez de `read_file` num PDF), formatos que já quebraram (horário em ISO 8601) e as travas de segurança.

`test/tools.test.js` guarda dois tetos. O total (1.900) é o que a conta gratuita paga; subir ele é um ato deliberado e tem preço. O **teto por ferramenta** (80 tk) é o que de fato pega inchaço, porque não afrouxa quando a lista cresce.

As skills e a memória custam só o **índice** — uma linha por item, com teto próprio. Os passos e o conteúdo são lidos sob demanda. Sem esse corte, dez skills na pasta inviabilizariam o plano gratuito.

### O histórico também viaja — e era ele que estourava

O custo fixo acima é só o começo: a conversa anterior vai junto em todo pedido. O corte era por **contagem** (as últimas 40 mensagens), e contagem não é custo — uma resposta de `web_search` ocupa ~4.500 caracteres sozinha. Quarenta mensagens com três buscas dentro passavam de 10 mil tokens por pedido, e o teto gratuito do Groq é 8.000 **por minuto**. Era isso que fazia ela trocar de provedor no meio de uma resposta.

Agora o corte é por tamanho — 14 mil caracteres (~3.500 tokens), número tirado da conta: 3.000 fixos + 3.500 de histórico = ~6.500 por pedido, abaixo do teto com folga para a resposta. Numa conversa de oito perguntas com quatro buscas, são **~1.100 tokens a menos por pedido**.

E o corte agora é por **grupo**. `slice(-40)` cortava onde calhasse, e cortar entre uma chamada de ferramenta e a resposta dela deixa a resposta órfã — as três APIs recusam a conversa inteira nesse caso, e o Gemini ainda exige que ela comece por uma fala sua. Era um erro latente que ninguém tinha visto acontecer ainda.

## Velocidade da fala

Em ⌘, › voz, com a ElevenLabs escolhida, há um controle de **velocidade da fala** de 0,7× a 1,2× — os limites são os que a API aceita, e mandar fora deles faz ela recusar o pedido inteiro, o que significa cair para a voz do macOS no meio de uma frase.

Está em **1,12×**. Medido na mesma frase: o áudio passou de 4,92 s para 4,08 s, e de quebra a síntese ficou mais rápida (630 ms → 412 ms), porque há menos áudio para gerar.

O slider só dispara ao **soltar**, não a cada passo do arraste: cada mudança é um pedido à ElevenLabs, e cota não se gasta por milímetro de mouse.

Na voz do macOS quem manda continua sendo o controle de velocidade daquele painel, em palavras por minuto — é a unidade nativa dele.

**O que NÃO foi mexido, e por quê.** O `optimize_streaming_latency` está em 3 e podia ir a 4, economizando ~170 ms por frase. O nível 4 desliga o normalizador de texto. Medido numa frase com preço, data e hora: o áudio encurtou 7% (7,00 s → 6,48 s) sem que a frase mudasse — ou seja, ele estava deixando de ler "R$ 5,12", "3/11/2026" e "14h30" por extenso. Numa assistente que fala preço e data em voz alta, 170 ms não pagam isso.

## Por que ela responde rápido

Três coisas: o modelo pensa menos, a fala começa antes e o áudio é preparado adiantado.

**Pensar menos** — os modelos novos do Gemini raciocinam antes de responder, e para "abre o Spotify" isso é latência pura. A E.V.E pede o nível mínimo de raciocínio (`thinkingLevel: low`); se o modelo não conhecer esse ajuste, ela desce para o formato anterior (`thinkingBudget: 0`) e depois para nenhum, sozinha.

**Começar antes** — a resposta do modelo é lida **conforme sai** (streaming SSE). Assim que a primeira fala fecha — umas quatro dezenas de caracteres terminando em pontuação — ela já começa a falar, enquanto o resto ainda está sendo gerado. Os pedaços entram numa fila, e o áudio do pedaço seguinte já vai sendo preparado enquanto o atual toca; sem isso haveria um silêncio entre cada frase.

Se o endereço de streaming não responder, ela repete pelo caminho normal — nunca fica muda por causa disso.

Uma sutileza do streaming que custou um erro em uso: os modelos novos anexam um `thoughtSignature` à chamada de ferramenta e **exigem esse campo de volta** no pedido seguinte. Remontar a parte à mão (só o `functionCall`) jogava a assinatura fora, e a API recusava a conversa inteira com *"Function call is missing a thought_signature"*. Agora as partes são guardadas como vieram, e há um teste que falha se alguém voltar a remontá-las.

## O fundo

Atrás da esfera há uma grade de blueprint, em duas camadas: a fina de 34px dá textura, a grossa de 170px dá estrutura. Bem apagada de propósito — ela existe para o fundo não ficar vazio, não para competir com a esfera. Uma máscara radial apaga as bordas, senão a grade terminaria num corte reto no meio da tela. E ela some um pouco quando a voz sobe, para a esfera ficar sozinha no momento em que importa.

## A esfera

Três camadas, e é a soma delas que dá a leitura:

**Arcos de círculo máximo.** Um círculo máximo é a maior circunferência que cabe numa esfera; em perspectiva ele vira uma elipse cruzando o disco inteiro — são as curvas largas. Cada um nasce num plano sorteado, então eles se cruzam em ângulos irregulares, em vez da grade de meridianos que a versão anterior tinha. São arcos **parciais**, com as pontas soltas: círculo fechado pareceria um aro de brinquedo.

**Trilhas de circuito.** Caminhos que andam sobre a superfície em ângulo reto — um trecho variando só a longitude, o seguinte só a latitude, com um ponto em cada curva de 90°. É a alternância que produz os degraus; variar os dois ao mesmo tempo daria uma linha torta qualquer. São elas que fazem parecer placa de circuito, e não teia.

**Núcleo em átomo.** Três elipses cruzadas girando em ritmos diferentes, o estouro branco no centro e espículas curtas saindo dele — sem as espículas o núcleo é só um ponto aceso.

O que se move: os sinais percorrendo as trilhas (a imagem de referência é parada; isto não pode ser), a poeira derivando pela casca, as órbitas do átomo girando, e a esfera inteira respirando com a voz.

**A geometria é calculada uma vez**, na partida. Arcos, trilhas e poeira nunca mudam — por quadro só rodam a projeção e o que se move. São ~757 segmentos em **27 operações de pintura**, graças ao agrupamento por transparência.

## Consumo de GPU

Quatro escolhas seguram o custo do gráfico, e as três primeiras dá para regular em Configurações › Visual:

1. **Limite de quadros por segundo.** 60 fps não deixa a esfera mais bonita, deixa a GPU mais quente. O padrão é 30 em uso e **10 parada** — que é como ela passa a maior parte do tempo.
2. **Teto na densidade de pixels.** Em tela retina, desenhar em 2× quadruplica a área pintada. O padrão é 1,5×, indistinguível a olho nu.
3. **Agrupamento por transparência.** Centenas de segmentos saem em ~27 operações de pintura por quadro, não uma por segmento.
4. **Geometria calculada uma vez**, como descrito acima.

O modo **econômico** desce para 18 fps (6 parada), 1× de densidade, sem partículas e com metade das linhas. O painel de configuração mostra os números do modo escolhido.

## Configurações (⌘,)

- **Geral** — nome, pronúncia, como ela te chama, jeito de falar (doce, direta, divertida), modo do microfone, pausa até ela responder, sugestões espontâneas, notificações.
- **Voz** — vozes do macOS (grátis, offline) ou ElevenLabs (mais naturais, cota mensal gratuita), com **velocidade** e **tom**. O tom usa o comando `[[pbas]]` do `say`: mais baixo soa grave e calmo, mais alto soa leve.
- **Visual** — cinco temas (holográfico, âmbar, esmeralda, violeta, monocromático), tamanho da esfera e modo de desempenho do gráfico. O tema vale para tudo, inclusive para as cores da esfera e do monitor.

**Claro e escuro** é um eixo à parte, no botão da barra de cima — lua no escuro, sol no claro: o tema escolhe a cor de destaque, o modo escolhe o fundo. Assim quem gosta do âmbar continua no âmbar nos dois.

As paletas claras são escritas à mão, uma por tema, porque inverter por fórmula não funciona: num fundo quase preto um ciano pastel brilha, no branco ele some. E a esfera muda três decisões no claro — o realce deixa de ser branco (branco sobre branco não existe), o halo deixa de somar luz e vira sombra de contorno, e os traços finos levam reforço de opacidade para não sumirem. Um teste falha se algum tema ficar sem versão clara, e outro falha se a esfera voltar a pintar branco puro no modo claro.

As barras do btop guardam a cor de bloco apagado numa variável (`--barra-off`), e um teste proíbe regra de tema mirar `.barra i`. Isso não é zelo: o modo claro teve uma regra com especificidade maior que a dos blocos acesos, e **todas as barras sumiam** — acesas pintadas com a cor de apagado, sem erro nenhum em lugar algum.

E um terceiro mede o **contraste** das dez paletas pela régua da WCAG: texto ≥ 7×, secundário ≥ 4,5×, destaque ≥ 3×. A olho nu "parece legível" engana — um cinza-azulado sobre quase preto parece bom e dá 3×, que é reprovado. Era por isso que estava fraco.
- **Lembretes** — os pendentes, com cancelar.
- **Cérebro** — a chave de API e qual modelo está em uso.

Se a ElevenLabs falhar por qualquer motivo — cota, chave sem permissão, internet fora —, ela avisa uma vez e continua falando com a voz do macOS. Nunca fica muda.

As vozes do macOS que vêm de fábrica são de qualidade "compacta". Para uma bem melhor: Ajustes do Sistema › Acessibilidade › Conteúdo Falado › Voz do Sistema › **Gerenciar Vozes** › Português (Brasil) — escolha uma *Premium* ou *Aprimorada*. Depois de baixada, ela aparece sozinha no seletor (o botão "Baixar vozes melhores" abre esse painel).

## Permissões do macOS que não somem

Se a cada reinstalação o macOS voltava a pedir microfone, reconhecimento de fala e automação, não era mania dele — eram duas falhas de assinatura.

**1. Os helpers nativos não estavam assinados.** `codesign --deep` não alcança `Contents/Resources/`, que é onde moram `ev-listen` e `ev-pdf`. O `ev-listen` é justamente quem pede microfone e fala, e um binário sem assinatura não tem identidade estável para o sistema guardar. Agora o `pack.sh` assina **de dentro para fora**: helpers primeiro, bundle depois (o contrário quebraria o selo do bundle).

**2. Assinatura ad-hoc identifica o app pelo hash do binário.** Compare:

```
E.V.E (ad-hoc)  → designated => cdhash H"daf5e541174a7156ea98301e75e051446947b437"
Obsidian        → designated => identifier "md.obsidian" and anchor apple generic and certificate …
```

O TCC — o banco de permissões do macOS — guarda a autorização amarrada a esse requisito. O do Obsidian é o **nome + certificado**, que não muda quando ele é atualizado. O da E.V.E era o **hash do binário**, que muda em toda compilação: para o sistema, era sempre um aplicativo novo.

### Resolvendo de vez

```bash
bash build/criar-certificado.sh && npm run install-app
```

O script cria um certificado de assinatura **seu**, local, que não sai desta máquina e não vale como assinatura da Apple — serve só para o seu Mac reconhecer o seu app sempre como o mesmo. Depois disso o requisito passa a ser `identifier "com.matheus.eve" and certificate leaf …`, e reinstalar não mexe mais nas permissões.

Duas janelas podem aparecer, uma vez cada: a senha do seu usuário (é o chaveiro, não uma conta online) e um pedido do `codesign` para usar a chave — clique em **Sempre Permitir**.

Depois de trocar a assinatura, o macOS vai pedir as permissões **uma última vez**: as de antes estavam amarradas ao hash velho. Daí em diante, ficam.

Para desfazer: Acesso às Chaves › login › Meus certificados › apague "E.V.E Local Signing". O `pack.sh` volta sozinho para ad-hoc, avisando no terminal.

Sem o certificado o app continua funcionando normalmente — só com as permissões voláteis, e o build diz isso em voz alta a cada compilação.

## Segurança

Três travas que não dependem de o modelo se comportar:

1. **Comandos destrutivos** (qualquer `rm`, `find -delete`, `sudo`, `shutdown`, `diskutil erase`, `chmod -R`, `git reset --hard`/`clean -f`, `truncate`, `rsync --delete`, `curl … | sh`, AppleScript com privilégio de administrador, esvaziar o Lixo…) não executam de primeira: ela explica o risco e espera você confirmar em voz alta. `>` por cima de um arquivo que já existe também espera, porque apaga o conteúdo sem `.bak`. A lista está em `DANGEROUS`, no `tools.js`, e `test/travas.test.js` confere o que barra e o que segue livre.
2. **Apagar é mandar para o Lixo**, pelo Finder — dá para recuperar. Ela nunca usa `rm` para apagar arquivo seu. Fora da sua pasta, ou a pasta inteira, só com o seu sim. Sobrescrever um arquivo existente guarda um `.bak` ao lado, e nem `write_file` nem `edit_file` escrevem no cofre da memória.
3. **Mensagem para outra pessoa sempre pede confirmação**, mesmo sem nada de perigoso no texto: ela lê em voz alta para quem vai e o que vai, e só manda depois do seu sim. (No WhatsApp ela deixa pronto e o enter é seu — ver acima.)

Fora disso, ela executa o que você pedir com as suas permissões de usuário — trate-a como um terminal que entende português.

O raciocínio sempre passa pela internet (é a API do motor escolhido). A **transcrição** só fica 100% no seu Mac se o modelo de voz offline estiver instalado: Ajustes do Sistema › Teclado › Ditado, com Português (Brasil). Sem ele, a Apple transcreve nos servidores dela. O app registra qual modo está em uso no log (`{"type":"engine","onDevice":true|false}`).

## Quando o provedor falha

Ela se vira sozinha antes de reclamar, porque cada falha pede uma reação diferente:

| Erro | O que ela faz |
| --- | --- |
| **429 por minuto** | espera os segundos que o Google pede e repete no mesmo modelo |
| **429 por dia** | troca de modelo — a cota diária é por modelo — e grava o que funcionou. A gravação é só no fim: o modelo vai para o disco depois de responder, nunca no instante da troca |
| **503 lotado** | troca de modelo na hora, **sem esperar** — a fila é por modelo e a conta tem dezoito. Só quando todos estão lotados é que ela espera (1,5 s, depois 4 s) e recomeça pelo preferido. A troca não é gravada: a fila é temporária |
| **sotaque trocando no meio da resposta** | o idioma vai **fixo** no pedido à ElevenLabs. Os modelos flash/turbo detectam o idioma por pedido, e desde que a fala passa frase a frase, cada fragmento era detectado sozinho: bastava uma frase curta com palavra inglesa ("abri o Safari") para aquele trecho sair com sotaque inglês e o seguinte voltar ao português |
| **a mesma ferramenta em laço** | chamada idêntica, com argumentos idênticos, passa duas vezes (uma falha de rede merece segunda tentativa) e da terceira em diante devolve um recado em vez do resultado. Sem isso ela chamou `ler_pdf` catorze vezes seguidas num dia só, gastou os dezesseis turnos e terminou sem responder: o resultado nunca mudava, e o histórico que provaria que ela já tinha tentado era justamente o que estava sendo cortado |
| **PDF grande** | o texto volta cortado em 24 mil caracteres, no fim de uma linha, com um aviso dizendo como pedir o resto (`pagina`) e que repetir a chamada não muda nada. Um PDF de 60 páginas passa de 150 mil caracteres — entregue inteiro, o que sai do histórico para abrir espaço é a pergunta dele |
| **"pôs no calendário" e não pôs** | calendário e lembrete eram a mesma coisa para ela, porque **calendário não existia no app**: ela chamava `create_reminder`, o lembrete interno que mora num JSON, e respondia "pronto" com toda a honestidade. Agora há `criar_evento` e `listar_eventos`, por EventKit — o mesmo banco do Calendário.app, então o evento aparece no app, no iPhone e no iCloud. O prompt separa os dois em palavras, e em caso de empate manda fazer o **evento**, que é o que ele consegue ver |
| **pedido repetido virando lembrete repetido** | lembrete idêntico (mesmo texto, mesma hora, ainda pendente) devolve o que já existe em vez de criar outro. Ele pediu o mesmo compromisso duas vezes porque o primeiro não aparecia no calendário, e ficaram dois lembretes do casamento e **três** da UFPR, que tocariam três vezes no mesmo minuto. Repetir o pedido é o que qualquer pessoa faz quando acha que não deu certo |
| **conexão travada** | todo pedido tem prazo — 45 s no pedido comum, 25 s até o modelo começar a responder e 20 s de silêncio no meio da resposta. Sem isso, uma conexão pendurada deixava ela "pensando" indefinidamente |
| **404 / modelo aposentado** | pergunta a lista atual ao Google e desce para o próximo |
| **histórico comendo a cota** | o teto do histórico é **de quem responde**. No Groq são 14 mil caracteres, porque o limite dele é de 8.000 tokens **por minuto** e o custo fixo de um pedido já é ~3.000. Nos outros são 60 mil: a NVIDIA não devolve nenhum `x-ratelimit-*` e limita pedidos, não tokens. Enquanto o teto do Groq valia para todos, uma pesquisa (4.104 caracteres) ocupava 29% da memória dela, e numa conversa de dez trocas ela chegava ao fim lembrando só das seis últimas |
| **limite batido (429 nos outros provedores)** | nenhum deles diz quantos segundos faltam, como o Google diz — então não há o que esperar: ela passa para o próximo provedor configurado |
| **cota da ElevenLabs esgotada** | ela avisa que a **cota** acabou e que a chave está boa, diz a data em que a cota renova, e passa a falar com a voz do macOS. A ordem das verificações importa: a ElevenLabs manda **401** quando a cota acaba, não 429, e enquanto o 401 era conferido primeiro o aviso dizia "chave inválida, gere outra" com a chave perfeitamente boa |
| **400 "not enabled for this model"** | é um modelo que não conversa (um transcritor, por exemplo): ela troca e **descarta** esse modelo pelo resto da sessão. Esses nomes também já são filtrados antes de entrar na lista de candidatos |
| **modelo salvo imprestável** | o modelo gravado no `config.json` só vale se ele conversa; se não, ela consulta a lista da conta e grava o primeiro que **responder de verdade** |

Só quando tudo isso falha ela avisa — e a mensagem diz qual dos casos é.

**Esc cancela de verdade**: derruba o pedido em andamento, não só a fala. Voltar a falar com ela enquanto ela pensa também cancela — a resposta anterior já não interessa.

## Diagnóstico

Tudo fica em `~/Library/Logs/E.V.E/eve.log`: teclas, comandos da escuta, troca de modelo, erros da API, lembretes disparados. Cada pergunta abre e fecha um bloco:

```
[2026-11-25 20:45:42] ── #3 falou: "Apaga o arquivo teste"
[2026-11-25 20:45:43] ferramenta: trash_file · filepath="teste"
[2026-11-25 20:45:43]   ↳ trash_file ✗ 38 ms · erro: Esse caminho não existe.
[2026-11-25 20:45:44] ── #3 fim · 2,1 s · 1ª fala em 1,4 s · 1 ferramenta (1 falhou) · nvidia · resposta de 96 caracteres
```

- **Data em toda linha.** Antes, só a hora: um mês de log sem saber de que dia era cada linha.
- **O que você escreve também entra** (`escreveu:`), não só o que fala.
- **Cada ferramenta tem resultado e tempo** (`↳ ✓` ou `✗` com o erro). Antes, o log só dizia que ela tinha sido chamada.
- **"1ª fala em"** é o tempo até a primeira palavra dela, que é o que se sente como demora.
- Passou de 2 MB, o log vira `eve.log.1` e começa outro.

O formato está em `registro.js`, conferido por `test/registro.test.js`.

```bash
tail -f ~/Library/Logs/E.V.E/eve.log
```

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `main.js` | janela, estado, voz, escuta, painel, lembretes e a ponte com a interface |
| `brains.js` | os cérebros (Gemini, Claude e o adaptador OpenAI para Groq/Mistral/Cerebras/OpenRouter), a corrente de reserva e o prompt montado a cada pedido |
| `tools.js` | as 24 ferramentas e as travas de confirmação |
| `web.js` | a corrente de buscadores, o cache e a leitura de páginas |
| `pdf.js` | leitura de PDF pelo helper nativo |
| `skills.js` | as skills: índice para o prompt, roteiro sob demanda, criação |
| `sistema.js` | CPU, memória, GPU, bateria, disco |
| `lembretes.js` | interpretação de horário, agendamento e persistência |
| `agentes.js` | quanto cada provedor foi usado hoje, e quanto resta — lendo o saldo dos cabeçalhos |
| `memoria.js` | o cofre de `.md`: índice para o prompt, leitura sob demanda, escrita com backup |
| `calendario.js` | o Calendário do macOS, pelo helper `native/ev-cal` (EventKit) |
| `tts.js` | ElevenLabs (a voz do macOS fica no `main.js`) |
| `native/ev-listen.swift` | motor de escuta (SFSpeechRecognizer, pt-BR) |
| `native/ev-pdf.swift` | leitor de PDF (PDFKit) com OCR de página escaneada (Vision) |
| `renderer/index.html` | a interface |
| `renderer/interface.js` | temas, registro, monitor btop, teclado, anexos e configurações |
| `renderer/esfera.js` | a esfera de dados (arcos, trilhas de circuito, poeira e o núcleo em átomo) |
| `build/make-icon.swift` | o ícone: disco, órbita e fundo — três formas, pensadas para 16 px |
| `build/criar-certificado.sh` | a identidade local que faz as permissões do macOS persistirem |
| `build/pack.sh` | compila o Swift, gera o ícone, empacota e assina |

## Modificar e reinstalar

```bash
cd ~/EV && npm run install-app
```

Testes (não precisam de chave nem de internet, exceto o do painel, que mede esta máquina):

```bash
cd ~/EV && npm test
```

Roda todos os `test/*.test.js`; `npm test memoria` roda só os que casam com o nome. `npm run verificar` soma a checagem de sintaxe e do Swift. O `install-app` só instala com tudo passando, commit no GitHub e a E.V.E fechada.

Para fixar um modelo específico, adicione `"model": "gemini-flash-latest"` no `config.json` — sem isso, ela pergunta ao Google qual o melhor disponível e troca sozinha quando um modelo é recusado.
