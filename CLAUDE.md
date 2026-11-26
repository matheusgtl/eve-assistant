# Sexta-Feira (ex-E.V.E)

Assistente de voz em português para macOS. Chamava-se E.V.E até 25/11/2026: pastas de dados, log, bundle id e certificado continuam com o nome antigo de propósito (README, início). Electron, JavaScript CommonJS, helpers em Swift. Sem TypeScript nem lint.
O `README.md` explica o porquê de cada decisão: **leia a seção do assunto antes de mudar comportamento**.

## Comandos
Use o Node do nvm: `export PATH=~/.nvm/versions/node/v24.14.0/bin:$PATH`.
- `npm test`: todos os testes, sem rede; `npm test memoria pdf`: só os que casam
- `npm run verificar`: sintaxe, Swift e testes. Rode antes de dizer "pronto"
- `npm run install-app`: troca o app instalado. Siga a skill `instalar`: ao terminar uma mudança no app, instale sem perguntar

Não abra o app (`npm start`) sem pedido. O teste de sistema mede esta máquina.

## Onde fica
- `main.js`: Electron, voz e canais; `preload.js`: ponte; `renderer/`: interface
- `brains.js`: prompt, provedores e corrente de reserva; `agentes.js`: consumo
- `chats.js`: conversas da barra lateral; `sessoes.js`: uma sessão (cérebro e turno) por conversa, para ela trabalhar em várias ao mesmo tempo; `aprendizados.js`: erros e lições no cofre; `honestidade.js`: trava contra "feito" com ferramenta em erro
- `tools.js`: ferramentas e travas; `escolhas.js`: botões de resposta e o sim que só ele dá; `memoria.js`, `conversas.js`, `skills.js`: cofre do Obsidian
- `registro.js`: formato do `~/Library/Logs/E.V.E/eve.log` (leia para diagnosticar)
- `build/make-icon.swift`: ícone, logo e ícone da barra de menus a partir de `assets/logo-original.png`
- `rede.js`: rede neural pulsada (do Pestinha); `sentidos.js`: o Mac como canais; `iniciativa.js`: travas e mensagens por conta própria. Mudou peso? `npm test mente`
- `pensamento.js`: rede de linguagem que responde sozinha (só leitura, em código) antes dos agentes; `cerebroRede.js`: diário da rede em `<cofre>/rede/`; `renderer/abertura.js`: animação do primeiro uso do dia
- `gastos.js`, `calculo.js`, `calendario.js`, `lembretes.js`, `web.js`, `pdf.js`, `sistema.js`, `tts.js`
- `native/*.swift`: escuta, PDF e Calendário
- `esfera.js`, `index.html` e `interface.js` na **raiz** são cópias ignoradas: edite as de `renderer/`

## Regras
- **Duas vozes:** a nvidia decide e age primeiro; o groq/qwen só escreve conversa. Não inverta, não junte num modelo só, não tente consertar identidade pelo prompt: tudo já foi medido.
- **Ferramentas custam tokens:** o teto está em `test/tools.test.js`. Não aumente; encurte outra descrição.
- **Travas em código, não no prompt.** `confirmed=true` só vale depois do sim dele (`escolhas.js`). O que não tem volta e mensagem para outra pessoa esperam o sim. Nunca afrouxe sem pedido; `test/travas.test.js` cobre.
- **Conta é do código** (`calculo.js`, `gastos.js`), nunca do modelo. Dinheiro não perde dado nem muda data em silêncio.
- **Memória não apaga:** gravar no cofre passa por `memoria.js`.
- Ela nunca diz que fez o que não fez: ferramenta que falha devolve erro claro.
- **Pensamento local só lê** (e mexe só nos ajustes dela: voz e abrir com o Mac, com limiar de 85%). Intenção local que age no mundo (criar, mandar, apagar) é proibida: isso é dos agentes. `test/pensamento.test.js` tem a lista que nunca pode ser local.
- **Conversas simultâneas:** estado de turno mora na sessão (`sessaoDoTurno()`), nunca em global do main. O sim de uma conversa não aprova o pedido de outra (`test/escolhas.test.js`).
- Canal novo: `main.js`, `preload.js` e `renderer` juntos (`test/ponte.test.js` confere).
- Permissão do macOS depende de `Info.plist` e assinatura: leia essa seção do README antes de mexer.
- Corrigiu bug? Primeiro o teste que falha; comente a causa e a data do log.
- Chaves e dados ficam em `~/Library/Application Support/E.V.E/`. Nunca versione, imprima nem use dados reais em teste.
- Repositório privado. Commits em português no formato `Área: o que mudou`, sem coautoria, com push.

## Pronto quando
`npm run verificar` passa, o commit está no GitHub e, se mudou o app, está instalado. Voz, microfone, permissões e provedores reais não são testados aqui: diga isso.
