// pdf.test.js — leitura de PDF, incluindo escaneado.
//
// Existe porque "ela lê PDF" era meia verdade: só o Gemini e o Claude liam, e
// a corrente de cérebros troca de provedor sozinha. Anexar um PDF durante uma
// conversa no Groq devolvia "este provedor não lê PDF" sem ele ter mudado nada.
//
// Os dois casos que importam são diferentes de verdade:
//   • PDF com camada de texto → PDFKit extrai, rápido e exato;
//   • PDF escaneado (uma FOTO da página) → não tem texto nenhum para extrair,
//     só OCR resolve. Contrato, boleto e exame chegam assim quase sempre.
// Rode com: node test/pdf.test.js

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { lerPdf, ehPdf, caminhoDoHelper } = require("../pdf.js");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "eve-pdf-"));
const TEXTO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

O valor é de R$ 4.750,00 por mês, em Londrina, Paraná.
Vigência de 12 meses a partir de março de 2026.`;

/// Gera um PDF de verdade com AppKit, em vez de guardar um .pdf no repositório:
/// assim o teste diz o que entrou e pode conferir o que saiu, letra por letra.
function gerarPdf(destino) {
  const swift = path.join(pasta, "gerar.swift");
  fs.writeFileSync(
    swift,
    `import AppKit
var pagina = NSRect(x: 0, y: 0, width: 612, height: 792)
let dados = NSMutableData()
let ctx = CGContext(consumer: CGDataConsumer(data: dados)!, mediaBox: &pagina, nil)!
ctx.beginPDFPage(nil as CFDictionary?)
NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
NSColor.white.setFill(); pagina.fill()
(${JSON.stringify(TEXTO)} as NSString).draw(
  in: NSRect(x: 60, y: 420, width: 492, height: 320),
  withAttributes: [.font: NSFont(name: "Helvetica", size: 13)!, .foregroundColor: NSColor.black])
ctx.endPDFPage(); ctx.closePDF()
dados.write(toFile: ${JSON.stringify(destino)}, atomically: true)`
  );
  execFileSync("/usr/bin/swift", [swift], { stdio: "pipe" });
}

(async () => {
  if (!fs.existsSync(caminhoDoHelper())) {
    console.log("⚠ leitor de PDF nativo não compilado (npm run native) — teste pulado");
    process.exit(0);
  }

  const comTexto = path.join(pasta, "contrato.pdf");
  gerarPdf(comTexto);

  // ---------------------------------------- 1. PDF com camada de texto
  const a = await lerPdf(comTexto);
  assert.strictEqual(a.ocr, false, "havendo camada de texto, não se gasta OCR");
  assert.strictEqual(a.paginas, 1);
  assert.match(a.texto, /CONTRATO DE PRESTAÇÃO/);
  assert.match(a.texto, /R\$ 4\.750,00/, "número de dinheiro tem de sair exato");
  assert.match(a.texto, /Paraná/, "e o acento também");

  // ----------------------------------- 2. PDF escaneado: só imagem, OCR
  // Rasteriza a 150 dpi e remonta como PDF — é o que um scanner entrega.
  const png = path.join(pasta, "pagina.png");
  const escaneado = path.join(pasta, "escaneado.pdf");
  execFileSync("/usr/bin/sips", ["-s", "format", "png", "--resampleWidth", "1275", comTexto, "--out", png], { stdio: "pipe" });
  execFileSync("/usr/bin/sips", ["-s", "format", "pdf", png, "--out", escaneado], { stdio: "pipe" });

  const semOcr = await lerPdf(escaneado, { semOcr: true });
  assert.ok(
    semOcr.texto.replace(/---[^-]*---/g, "").trim().length < 20,
    "sem OCR, um escaneamento não tem texto nenhum para dar — é a confirmação de que o caso é real"
  );

  const comOcr = await lerPdf(escaneado);
  assert.strictEqual(comOcr.ocr, true, "e o OCR precisa entrar sozinho, sem ninguém pedir");
  assert.match(comOcr.texto, /CONTRATO DE PRESTAÇÃO/i);
  assert.match(comOcr.texto, /4\.750,00/, "o valor tem de sobreviver ao OCR");
  assert.match(comOcr.texto, /Londrina/i);

  // ---------------------------------------------- 3. erros explicados
  const naoPdf = path.join(pasta, "qualquer.txt");
  fs.writeFileSync(naoPdf, "isto não é um PDF");
  const erro = await lerPdf(naoPdf).then(() => null, (e) => e);
  assert.ok(erro, "arquivo que não é PDF tem de falhar");
  assert.match(erro.message, /PDF/, "e a mensagem precisa dizer o que houve, não 'exit 1'");

  // ------------------------------------------- 4. uma página escolhida
  const umaSo = await lerPdf(comTexto, { pagina: 1 });
  assert.strictEqual(umaSo.lidas, 1);
  const inexistente = await lerPdf(comTexto, { pagina: 9 }).then(() => null, (e) => e);
  assert.match(inexistente.message, /1 página/, "pedir página que não existe explica quantas existem");

  assert.strictEqual(ehPdf("a/b/c.PDF"), true);
  assert.strictEqual(ehPdf("a/b/c.txt"), false);

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log("✓ PDF: camada de texto, OCR em escaneado, página avulsa e erros explicados");
  console.log("   com texto   → PDFKit, sem gastar OCR");
  console.log("   escaneado   → sem OCR não sai nada; com OCR sai o contrato inteiro");
  console.log("   não é PDF   → mensagem que dá para entender");
})();
