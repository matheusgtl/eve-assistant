# E.V.E

Assistente de voz em português para macOS. Electron, JavaScript CommonJS, helpers em Swift. Sem TypeScript nem lint.
O `README.md` explica o porquê de cada decisão: **leia a seção do assunto antes de mudar comportamento**.

## Comandos
Use o Node do nvm: `export PATH=~/.nvm/versions/node/v24.14.0/bin:$PATH`.
- `npm test`: todos os testes, sem rede; `npm test memoria pdf`: só os que casam
- `npm run verificar`: sintaxe, Swift e testes. Rode antes de dizer "pronto"
- `npm run install-app`: troca o app instalado. Siga a skill `instalar`

Não abra o app (`npm start`) sem pedido. O teste de sistema mede esta máquina.

## Onde fica
- `main.js`: Electron, voz e canais; `preload.js`: ponte; `renderer/`: interface
- `brains.js`: prompt, provedores e corrente de reserva; `agentes.js`: consumo
- `tools.js`: ferramentas e travas; `escolhas.js`: botões de resposta e o sim que só ele dá; `memoria.js`, `conversas.js`, `skills.js`: cofre do Obsidian
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
- Canal novo: `main.js`, `preload.js` e `renderer` juntos (`test/ponte.test.js` confere).
- Permissão do macOS depende de `Info.plist` e assinatura: leia essa seção do README antes de mexer.
- Corrigiu bug? Primeiro o teste que falha; comente a causa e a data do log.
- Chaves e dados ficam em `~/Library/Application Support/E.V.E/`. Nunca versione, imprima nem use dados reais em teste.
- Repositório privado. Commits em português no formato `Área: o que mudou`, sem coautoria, com push.

## Pronto quando
`npm run verificar` passa e o commit está no GitHub. Voz, microfone, permissões e provedores reais não são testados aqui: diga isso.
