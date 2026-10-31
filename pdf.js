// pdf.js — leitura de PDF neste Mac, incluindo PDF escaneado.
//
// O problema que isto resolve: até aqui, PDF anexado só era lido pelo Gemini e
// pelo Claude, que aceitam o arquivo inteiro na mensagem. Com Groq, NVIDIA ou
// qualquer provedor no formato da OpenAI, o anexo virava um aviso — "este
// provedor não lê PDF" — e a conversa morria ali. Como a corrente de cérebros
// troca de provedor sozinha quando um seca, isso acontecia sem ele pedir.
//
// A leitura é feita por um helper nativo (native/ev-pdf, em Swift) porque o
// macOS já traz os dois motores certos: PDFKit para o texto e Vision para o
// OCR de página escaneada. Contrato, boleto e exame de laboratório chegam
// escaneados quase sempre — sem OCR, "ler PDF" cobriria metade dos PDFs reais.
//
// Nada aqui depende de o helper existir: se faltar, a função diz o motivo, e
// quem chama decide (o anexo volta a ser mandado inteiro para quem lê PDF).

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/// O binário fica ao lado do código em desenvolvimento e em Resources/native
/// quando empacotado — o mesmo arranjo do motor de escuta.
function caminhoDoHelper() {
  if (process.env.EV_PDF_BIN) return process.env.EV_PDF_BIN;
  const candidatos = [
    path.join(__dirname, "native", "ev-pdf"),
    path.join(process.resourcesPath || "", "native", "ev-pdf"),
  ];
  return candidatos.find((c) => c && fs.existsSync(c)) || candidatos[0];
}

const PRAZO = 120_000; // OCR de muitas páginas é lento; 2 min é o teto

/// Lê um PDF e devolve { texto, paginas, lidas, ocr, truncado, titulo }.
/// `pagina` lê uma só; `maxPaginas` limita quantas entram de uma vez.
function lerPdf(caminho, { pagina = null, maxPaginas = 60, semOcr = false } = {}) {
  return new Promise((resolve, reject) => {
    const bin = caminhoDoHelper();
    if (!fs.existsSync(bin)) {
      const err = new Error(
        "o leitor de PDF nativo não está compilado (rode `npm run native`)"
      );
      err.semHelper = true;
      return reject(err);
    }

    const alvo = caminho.startsWith("~") ? path.join(os.homedir(), caminho.slice(1)) : caminho;
    const args = [alvo, "--max-paginas", String(maxPaginas)];
    if (pagina) args.push("--pagina", String(pagina));
    if (semOcr) args.push("--sem-ocr");

    execFile(bin, args, { timeout: PRAZO, maxBuffer: 32 * 1024 * 1024 }, (erro, saida) => {
      let dados = null;
      try {
        dados = JSON.parse(saida);
      } catch {}
      // O helper escreve o motivo em JSON mesmo quando sai com erro; a
      // mensagem dele ("protegido por senha") vale muito mais que "exit 1".
      if (dados?.erro) return reject(new Error(dados.erro));
      if (erro) {
        return reject(
          new Error(
            erro.killed ? "o PDF demorou demais para ser lido (mais de 2 minutos)" : erro.message
          )
        );
      }
      if (!dados) return reject(new Error("não consegui entender a resposta do leitor de PDF"));
      resolve(dados);
    });
  });
}

const ehPdf = (caminho) => /\.pdf$/i.test(caminho || "");

module.exports = { lerPdf, ehPdf, caminhoDoHelper };
