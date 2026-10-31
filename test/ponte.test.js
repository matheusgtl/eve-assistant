// ponte.test.js — a fiação entre interface, preload e processo principal.
//
// A interface não tem Node: tudo passa por canais nomeados. Um canal escrito
// de um jeito no preload e de outro no main falha em silêncio — o botão
// simplesmente não faz nada, sem erro nenhum. Este teste confere, por leitura
// dos arquivos, que os três lados falam dos mesmos canais.
//
// O que ele NÃO prova: que o app sobe. Isso só o Electron diz; aqui a gente
// evita de propósito abrir janela e pedir permissão de microfone num teste.
// Rode com: node test/ponte.test.js

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const raiz = path.join(__dirname, "..");
const ler = (p) => fs.readFileSync(path.join(raiz, p), "utf8");

const preload = ler("preload.js");
const main = ler("main.js");
const interfaceJs = ler("renderer/interface.js");
const html = ler("renderer/index.html");

const achar = (texto, re) => [...texto.matchAll(re)].map((m) => m[1]);

// --------------------------------------------------- 1. invoke ↔ handle
const invocados = new Set(achar(preload, /ipcRenderer\.invoke\("([^"]+)"/g));
const tratados = new Set(achar(main, /ipcMain\.handle\("([^"]+)"/g));

assert.ok(invocados.size >= 15, `poucos canais no preload: ${invocados.size}`);
for (const canal of invocados) {
  assert.ok(tratados.has(canal), `o preload chama "${canal}", mas o main não trata`);
}
for (const canal of tratados) {
  assert.ok(invocados.has(canal), `o main trata "${canal}", mas ninguém chama — código morto`);
}

// ------------------------------------------- 2. eventos enviados ↔ ouvidos
const enviados = new Set(achar(main, /send\("(ev:[^"]+)"/g));
const mapeados = new Set(achar(preload, /:\s*"(ev:[^"]+)"/g));

for (const canal of enviados) {
  assert.ok(mapeados.has(canal), `o main envia "${canal}", mas o preload não repassa`);
}

// ---------------------------------- 3. nomes de evento que a interface ouve
const nomesPreload = new Set(achar(preload, /^\s{6}(\w+):\s*"ev:/gm));
const ouvidos = new Set(achar(interfaceJs, /window\.ev\.on\("(\w+)"/g));

for (const nome of ouvidos) {
  assert.ok(nomesPreload.has(nome), `a interface ouve "${nome}", que o preload não publica`);
}
for (const esperado of ["state", "message", "metrics", "config", "error", "setup"]) {
  assert.ok(ouvidos.has(esperado), `a interface deveria ouvir "${esperado}"`);
}

// -------------------------- 4. métodos usados pela interface existem na ponte
const expostos = new Set(achar(preload, /^\s{2}(\w+):\s*\(/gm));
const usados = new Set(achar(interfaceJs, /window\.ev\.(\w+)\(/g));
usados.delete("on");

for (const metodo of usados) {
  assert.ok(expostos.has(metodo), `a interface chama window.ev.${metodo}(), que não existe no preload`);
}

// ------------------------------- 5. ids que o JavaScript procura existem no HTML
const idsHtml = new Set(achar(html, /\bid="([^"]+)"/g));
const idsUsados = new Set(achar(interfaceJs, /getElementById\("([^"]+)"\)/g));

for (const id of idsUsados) {
  assert.ok(idsHtml.has(id), `interface.js procura #${id}, que não existe no index.html`);
}

// O canvas da esfera é procurado pelo esfera.js, não pela interface.
assert.ok(idsHtml.has("esfera"), "falta o canvas #esfera no HTML");
assert.match(ler("renderer/esfera.js"), /getElementById\("esfera"\)/);

// ------------------- 6. um ajuste que a tela muda tem de chegar ao config
// Campo novo em PADROES que a interface manda mudar, mas que ninguém pôs na
// lista `permitidos` do ev:set-config, é descartado em silêncio: o botão
// parece funcionar e nada acontece. Já aconteceu, e não dá erro em lugar nenhum.
const ajustesDaTela = achar(interfaceJs, /salvar\(\{\s*([A-Za-z_][\w]*)\s*:/g);
const permitidos = main.match(/const permitidos = \[([\s\S]*?)\];/)?.[1] || "";
for (const campo of new Set(ajustesDaTela)) {
  // Vale estar na lista `permitidos` (caminho comum) OU ter tratamento
  // próprio no handler — é o caso do `provider`, que precisa conferir se há
  // chave antes de trocar. O que não pode é ninguém olhar para ele.
  const tratado =
    permitidos.includes(`"${campo}"`) || main.includes(`mudancas.${campo}`);
  assert.ok(
    tratado,
    `a tela manda mudar "${campo}", e o ev:set-config descarta em silêncio: ` +
      `o botão parece funcionar e nada acontece`
  );
}

// --------------- 6b. todo tema precisa da sua versão clara
// Sem isto, um tema novo cai no fallback e o modo claro mostra a cor de
// destaque de OUTRO tema — erro silencioso, que só aparece a olho nu.
const blocoDe = (nome) => {
  const i = interfaceJs.indexOf(`const ${nome} = {`);
  return i < 0 ? "" : interfaceJs.slice(i, interfaceJs.indexOf("\n};", i));
};
const temas = achar(blocoDe("TEMAS"), /^\s{2}([a-z]+): \{/gm);
const claros = new Set(achar(blocoDe("CLAROS"), /^\s{2}([a-z]+): \{/gm));
assert.ok(temas.length >= 5, `achei só ${temas.length} temas; a varredura quebrou`);
for (const tema of temas) {
  assert.ok(claros.has(tema), `o tema "${tema}" não tem versão clara em CLAROS`);
}

// ------------------------- 6c. contraste de verdade nas duas famílias
// As paletas são escritas à mão e a olho nu "parece legível" engana muito:
// um cinza-azulado sobre quase preto parece bom e tem 3× de contraste, que é
// reprovado em qualquer régua. Aqui a conta é a da WCAG, e vale para o texto
// secundário também — é nele que a leitura cansa primeiro.
const canal = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luz = (hex) =>
  0.2126 * canal(parseInt(hex.slice(1, 3), 16) / 255) +
  0.7152 * canal(parseInt(hex.slice(3, 5), 16) / 255) +
  0.0722 * canal(parseInt(hex.slice(5, 7), 16) / 255);
const razao = (a, b) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const paletas = [
  ...interfaceJs.matchAll(
    /"--fundo": "(#\w{6})", "--painel": "(#\w{6})", "--borda": "(#\w{6})",\s*\n\s*"--texto": "(#\w{6})", "--fraco": "(#\w{6})", "--ac": "(#\w{6})"/g
  ),
];
assert.strictEqual(paletas.length, 10, `esperava 10 paletas (5 temas × 2 modos), achei ${paletas.length}`);

for (const [, , painel, borda, texto, fraco, ac] of paletas) {
  assert.ok(razao(texto, painel) >= 7, `texto ${texto} sobre ${painel}: ${razao(texto, painel).toFixed(1)}× (mínimo 7)`);
  assert.ok(razao(fraco, painel) >= 4.5, `secundário ${fraco} sobre ${painel}: ${razao(fraco, painel).toFixed(1)}× (mínimo 4,5)`);
  assert.ok(razao(ac, painel) >= 3, `destaque ${ac} sobre ${painel}: ${razao(ac, painel).toFixed(1)}× (mínimo 3)`);
  // A borda não carrega texto, mas se ela some o desenho inteiro se desfaz.
  assert.ok(razao(borda, painel) >= 1.25, `borda ${borda} some no painel ${painel}`);
}

// --------------- 6d. as barras do btop não podem ser apagadas por CSS
// Isto já aconteceu DUAS vezes, com a mesma forma e nenhum erro no console:
// uma regra que mira `.barra i` para pintar o bloco APAGADO acaba ganhando de
// `.barra i.on-ok`, que pinta o bloco ACESO — e a barra inteira vira cinza.
//   1ª vez: `:root[data-claro="1"] .barra i` (0,3,1) > `.barra i.on-ok` (0,2,1)
//           → no modo claro, todas as barras do monitor sumiam.
//   2ª vez: `.agente .barra i` (0,2,1) EMPATA com `.barra i.on-ok` e vem
//           depois no arquivo → ganhava no desempate por ordem, e a barra do
//           painel de agentes nunca acendia, nos dois temas.
// O primeiro guarda só olhava regras de tema e por isso não pegou a segunda.
// Este faz a conta de verdade: especificidade, e ordem no empate.
assert.match(
  html,
  /\.barra i \{[^}]*background: var\(--barra-off\)/,
  "o bloco apagado da barra precisa vir de --barra-off"
);

/// Especificidade de um seletor: [ids, classes/atributos/pseudoclasses, elementos].
function especificidade(seletor) {
  const limpo = seletor.replace(/::?[a-z-]+(\([^)]*\))?/g, (m) =>
    // pseudo-ELEMENTO conta como elemento; pseudo-CLASSE conta como classe.
    /^::/.test(m) ? " elem " : " .cls "
  );
  const ids = (limpo.match(/#[\w-]+/g) || []).length;
  const classes = (limpo.match(/\.[\w-]+|\[[^\]]+\]/g) || []).length;
  const elementos = (limpo.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return [ids, classes, elementos];
}
const maiorOuIgual = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true; // empate: quem vem depois ganha
};

// Todas as regras do arquivo, com a ordem em que aparecem.
const regras = [...html.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m, i) => ({
  ordem: i,
  seletores: m[1].split(",").map((x) => x.trim()).filter(Boolean),
  corpo: m[2],
}));

// Quem ACENDE um bloco: qualquer seletor que termine em .barra i.on-*
const acesas = regras.flatMap((r) =>
  r.seletores
    .filter((sel) => /\.barra i\.on-/.test(sel) && /background/.test(r.corpo))
    .map((sel) => ({ sel, ordem: r.ordem, espec: especificidade(sel) }))
);
assert.ok(acesas.length >= 3, "as três faixas (ok/meio/alto) precisam pintar a barra");

// Quem pinta o bloco em geral e PODERIA passar por cima das acesas.
const atropelos = [];
for (const r of regras) {
  for (const sel of r.seletores) {
    if (!/\.barra i\s*$/.test(sel)) continue;
    if (!/background(-color)?:/.test(r.corpo)) continue;
    const espec = especificidade(sel);
    for (const acesa of acesas) {
      const ganhaPorPeso = maiorOuIgual(espec, acesa.espec) && espec.join() !== acesa.espec.join();
      const ganhaPorOrdem = espec.join() === acesa.espec.join() && r.ordem > acesa.ordem;
      if (ganhaPorPeso || ganhaPorOrdem) {
        atropelos.push(`"${sel}" (${espec}) apaga "${acesa.sel}" (${acesa.espec})`);
      }
    }
  }
}
assert.strictEqual(
  atropelos.length,
  0,
  "regra pintando .barra i por cima do bloco aceso — a barra nunca acende:\n  " + atropelos.join("\n  ")
);

// ------- 6e. salvar uma chave não pode apagar as outras
// Caso real de 27/10: ele salvou a chave do Serper e perdeu a do Tavily. A
// tela LIMPA os campos depois de salvar, então o envio seguinte levava todos
// os outros vazios — e o handler lia vazio como "apague". Perda silenciosa de
// uma credencial que estava funcionando.
//
// A regra agora é: vazio é "não mexi", traço é "remova". O teste olha os dois
// handlers, porque os dois tinham o mesmo defeito.
for (const handler of ["ev:save-search", "ev:save-reserves"]) {
  const inicio = main.indexOf(`ipcMain.handle("${handler}"`);
  assert.ok(inicio > 0, `handler ${handler} sumiu`);
  const corpo = main.slice(inicio, inicio + 2200);
  assert.match(
    corpo,
    /if \(![a-zA-Z]+\) continue;/,
    `${handler}: campo vazio tem de ser ignorado, não apagar a chave salva`
  );
  assert.match(corpo, /=== "-"/, `${handler}: precisa de um jeito EXPLÍCITO de remover`);
}

// ------- 6g. a tela de voz tem de mostrar o que ESTÁ valendo
// Caso real de 30/10: ele disse que a E.V.E "não usa mais a voz que eu
// selecionei". A voz salva estava certa no config — o que faltava era a tela
// dizer isso. A lista de vozes abria toda apagada, e `vozEleven` começava em
// `null`, então não havia como saber qual voz estava no ar a não ser ouvindo.
//
// Pior: a caixa "resposta mais rápida" nunca era marcada a partir do config.
// Arrastar o controle de velocidade mandava `rapido: false` junto, e o modo
// rápido se desligava sozinho — visível no log, "velocidade 1.15" sem o
// "(rápido)" que aparecia antes.
assert.match(
  interfaceJs,
  /vozEleven = configAtual\?\.elevenVoiceId/,
  "a lista de vozes precisa começar na voz que está salva, não em null"
);
assert.match(
  interfaceJs,
  /if \(v\.id === vozEleven\) linha\.classList\.add\("sel"\)/,
  "e a voz salva precisa aparecer marcada na lista"
);
assert.match(
  interfaceJs,
  /cfgRapido[\s\S]{0,80}?checked = !!configAtual\?\.elevenRapido/,
  "a caixa do modo rápido precisa ser marcada a partir do config"
);
{
  const inicio = main.indexOf('ipcMain.handle("ev:set-tts"');
  assert.ok(inicio > 0, "handler ev:set-tts sumiu");
  const corpo = main.slice(inicio, inicio + 1400);
  assert.match(
    corpo,
    /if \(rapido !== undefined\)/,
    "ev:set-tts: `rapido` ausente é 'não mexi', não 'desliga'"
  );
}

// ------- 6f. assinatura: sem isso o macOS esquece as permissões
// Duas coisas faziam o macOS pedir microfone e automação a cada reinstalação:
//
//   1. `codesign --deep` NÃO alcança Contents/Resources. Os helpers nativos
//      ficavam sem assinatura nenhuma — inclusive o ev-listen, que é quem pede
//      microfone e reconhecimento de fala. Binário sem assinatura não tem
//      identidade estável para o TCC guardar.
//   2. Assinatura ad-hoc identifica o app pelo HASH DO BINÁRIO:
//        E.V.E      → designated => cdhash H"daf5e5…"
//        Obsidian   → designated => identifier "md.obsidian" and certificate …
//      O hash muda em toda compilação; o identificador, não. É por isso que
//      atualizar o Obsidian não zera as permissões dele e recompilar a E.V.E
//      zerava as dela.
const pack = ler("build/pack.sh");
assert.match(pack, /find-identity/, "o build tem de procurar uma identidade de verdade antes de cair no ad-hoc");
assert.match(
  pack,
  /Resources\/native\/ev-\*/,
  "os helpers nativos precisam ser assinados explicitamente: o --deep não chega lá"
);
const ordemHelpers = pack.indexOf("Resources/native/ev-*");
const ordemBundle = pack.search(/codesign --force --deep --sign "\$ASSINA" "\$APP"/);
assert.ok(ordemHelpers > 0 && ordemBundle > 0, "as duas assinaturas têm de existir");
assert.ok(
  ordemHelpers < ordemBundle,
  "helper assinado DEPOIS do bundle quebra o selo do bundle: tem de ser de dentro para fora"
);
assert.ok(
  fs.existsSync(path.join(__dirname, "..", "build", "criar-certificado.sh")),
  "o caminho para a identidade estável precisa estar no repositório, não num comando perdido"
);

// ------------------------------- 7. o mudo não pode travar a esfera
// Quem devolve a esfera para "parada" é o fim da fala. No mudo não existe
// fala, então sem um caminho próprio ela ficaria "pensando" para sempre — e
// no microfone aberto a escuta nunca reabriria.
assert.match(
  main,
  /function speak\(texto\) \{[\s\S]{0,400}?mudo/,
  "speak() precisa consultar o mudo ANTES de pôr qualquer coisa na fila"
);
const trechoMudo = main.match(/if \(loadConfig\(\)\.mudo\) \{[\s\S]{0,200}?\}/g) || [];
assert.ok(
  trechoMudo.some((t) => /setEstado\("idle"\)/.test(t) && /aoTerminarFala\(\)/.test(t)),
  "no mudo, alguém precisa devolver o estado para parada e reabrir a escuta"
);

// --------------------------------- 8. os dois scripts da interface são carregados
assert.match(html, /<script src="esfera\.js">/);
assert.match(html, /<script src="interface\.js">/);

console.log("✓ ponte interface ↔ preload ↔ main: canais, eventos, métodos e ids conferem");
console.log("  canais de ida:", invocados.size, "· eventos de volta:", enviados.size);
console.log("  métodos expostos:", expostos.size, "· ids ligados:", idsUsados.size);
console.log("  paletas conferidas:", paletas.length, "· contraste mínimo do texto: 7×");
