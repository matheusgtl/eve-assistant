// argumentos.test.js — o campo com o nome errado e o erro que se repete.
//
// Log de 28/11/2026, 02:45: "adicione um lembrete para quinta que vem". Ela
// chamou criar_lembrete_app ONZE vezes com `texto` (o campo do create_reminder)
// em vez de `titulo`. O erro dizia "o lembrete precisa de um título" — e não
// QUAL campo faltava —, então ela trocou o que podia: a lista, a frase e, pior,
// a data, de quinta para "em 10 minutos". Nada foi criado.
//
// Duas travas, ambas em código:
//   • o campo com outro nome conhecido (texto → titulo) é corrigido antes de
//     chegar na ferramenta; o que faltar de verdade volta dizendo O NOME do
//     campo e o que ela mandou;
//   • a mesma ferramenta com o mesmo erro duas vezes: da terceira em diante
//     ela é parada, com o recado de não mudar o pedido dele para contornar.
// Rode com: node test/argumentos.test.js

const assert = require("node:assert");
const ferramentas = require("../tools.js");
const { ajustarArgumentos } = ferramentas;
const { guardaDeRepeticao } = require("../brains.js");

(async () => {
  // ------------------------------- 1. o campo com outro nome
  const criados = [];
  ferramentas.configurar({
    calendario: {
      criarLembreteApp: async (dados) => {
        if (!dados.titulo) throw new Error("o lembrete precisa de um título");
        criados.push(dados);
        return { ok: true, titulo: dados.titulo };
      },
    },
  });

  const r = JSON.parse(
    await ferramentas.runTool("criar_lembrete_app", {
      texto: "Desativar Instagram Premium", quando: "2026-12-04T09:00",
    })
  );
  assert.strictEqual(r.ok, true, `texto no lugar de titulo tinha de virar titulo: ${JSON.stringify(r)}`);
  assert.strictEqual(criados[0].titulo, "Desativar Instagram Premium");
  assert.strictEqual(criados[0].quando, "2026-12-04T09:00", "a data dele não pode mudar");

  // O que faltar de verdade volta com o NOME do campo e o que ela mandou.
  const faltou = JSON.parse(await ferramentas.runTool("criar_lembrete_app", { quando: "2026-12-04T09:00" }));
  assert.ok(/"titulo"/.test(faltou.error), `o erro precisa dizer qual campo falta: ${faltou.error}`);
  assert.ok(/quando/.test(faltou.error), "e o que ela mandou, para ela ver a diferença");

  // Não mexe no que já está certo, nem cria campo que a ferramenta não tem.
  assert.deepStrictEqual(
    ajustarArgumentos("create_reminder", { texto: "ligar", quando: "em 5 minutos" }),
    { args: { texto: "ligar", quando: "em 5 minutos" } }
  );
  assert.deepStrictEqual(
    ajustarArgumentos("create_reminder", { titulo: "ligar", quando: "em 5 minutos" }).args,
    { texto: "ligar", quando: "em 5 minutos" },
    "o contrário também: titulo no create_reminder vira texto"
  );
  assert.deepStrictEqual(
    ajustarArgumentos("read_file", { path: "~/a.txt" }).args,
    { filepath: "~/a.txt" }
  );
  // Ferramenta sem schema (ou desconhecida) passa como veio.
  assert.deepStrictEqual(ajustarArgumentos("nao_existe", { a: 1 }), { args: { a: 1 } });

  // ------------------------------- 2. o mesmo erro, de novo e de novo
  let chamadas = 0;
  const rodar = guardaDeRepeticao(async () => {
    chamadas++;
    return JSON.stringify({ error: "o lembrete precisa de um título" });
  });
  // Argumentos DIFERENTES a cada vez, como no log: a guarda exata não via.
  await rodar("criar_lembrete_app", { texto: "a", quando: "2026-12-04T09:00" });
  await rodar("criar_lembrete_app", { texto: "a", quando: "2026-12-04T09:00", lista: "Lembretes" });
  const terceira = JSON.parse(await rodar("criar_lembrete_app", { texto: "b", quando: "em 10 minutos" }));
  assert.strictEqual(chamadas, 2, "da terceira em diante a ferramenta nem roda");
  assert.strictEqual(terceira.repetida, true);
  assert.ok(/mesmo erro/.test(terceira.error), terceira.error);
  assert.ok(/não mude|nao mude/i.test(terceira.error), "o recado diz para não mudar o pedido dele");

  // Erro diferente (outro arquivo que não existe) não é o mesmo erro.
  let lidas = 0;
  const rodar2 = guardaDeRepeticao(async (_n, a) => {
    lidas++;
    return JSON.stringify({ error: `ENOENT: no such file or directory, stat '${a.filepath}'` });
  });
  for (const f of ["/a", "/b", "/c"]) await rodar2("read_file", { filepath: f });
  assert.strictEqual(lidas, 3, "caminhos diferentes são tentativas diferentes");

  // E o resumo do que foi feito fica com a guarda, para o fim dos passos.
  assert.deepStrictEqual(rodar.resumo(), { passos: 3, falhas: 3 });

  // ------------------------------- 3. caminho do cofre escrito como do HOME
  // 27/11/2026, 17:33: read_file "~/processos/cerebro.md" → ENOENT.
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const cofre = fs.mkdtempSync(path.join(os.tmpdir(), "ev-leitura-"));
  fs.mkdirSync(path.join(cofre, "processos"));
  fs.writeFileSync(path.join(cofre, "processos", "nota-teste-ev.md"), "# Nota\n\nconteúdo do cofre");
  ferramentas.configurar({ memoria: { pasta: cofre } });
  const lida = JSON.parse(await ferramentas.runTool("read_file", { filepath: "~/processos/nota-teste-ev.md" }));
  assert.ok(/conteúdo do cofre/.test(JSON.stringify(lida)), `ler do cofre: ${JSON.stringify(lida).slice(0, 200)}`);
  const pasta = JSON.parse(await ferramentas.runTool("list_directory", { dirpath: ".memoria/processos" }));
  assert.ok(/nota-teste-ev/.test(JSON.stringify(pasta)), "listar do cofre");
  ferramentas.configurar({ memoria: null });
  fs.rmSync(cofre, { recursive: true, force: true });

  console.log("✓ argumentos: campo com outro nome corrigido, erro repetido parado, caminho do cofre achado");
})().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
