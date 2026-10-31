// ev-pdf.swift — extrai o texto de um PDF, com OCR quando não há texto.
//
// Por que um binário nativo e não uma biblioteca de PDF em JavaScript:
//
// 1. O macOS já sabe ler PDF. O PDFKit vem no sistema, é o mesmo motor da
//    Pré-Visualização, e acerta em arquivo que os leitores em JavaScript
//    erram — coluna dupla, tabela, fonte embutida, acentuação.
// 2. PDF escaneado não tem texto nenhum. É uma foto de uma página. Nenhuma
//    biblioteca de extração resolve isso; precisa de OCR. O Vision, também do
//    sistema, reconhece português e é o mesmo OCR que a Pré-Visualização usa.
//    Esse caso não é exótico: contrato, boleto e exame de laboratório chegam
//    assim quase sempre.
// 3. Zero dependência nova no projeto. O app já compila um helper em Swift.
//
// Uso:  ev-pdf <arquivo.pdf> [--max-paginas N] [--pagina N] [--sem-ocr]
// Sai:  JSON { paginas, texto, ocr, lidas, titulo }

import Foundation
import PDFKit
import Vision
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Texto demais estoura o contexto do modelo; o corte fica aqui, perto da fonte.
let LIMITE = 400_000

func morrer(_ mensagem: String) -> Never {
    let saida: [String: Any] = ["erro": mensagem]
    if let d = try? JSONSerialization.data(withJSONObject: saida),
       let s = String(data: d, encoding: .utf8) { print(s) }
    exit(1)
}

/// OCR de uma página, via Vision. `pt-BR` primeiro: sem isso ele assume inglês
/// e erra justamente os acentos, que é o que mais aparece num documento dele.
func ocr(_ pagina: PDFPage) -> String {
    // A escala mira uma RESOLUÇÃO, não um múltiplo. Com 2× fixo a conta dava
    // errado nos dois extremos: página de 72 dpi saía pequena demais para
    // letra miúda, e página que já vinha grande (um escaneamento onde 1 ponto
    // é 1 pixel) virava uma imagem de 4800×6212 — e aí o Vision reduz por
    // conta própria e passa a errar justamente o texto pequeno. Medido: o
    // título saía certo e o corpo virava algo como "Para sal do de cuerdo".
    // Mirando ~2200 px no lado maior (≈200 dpi numa página carta), as duas
    // pontas caem no tamanho em que ele acerta.
    let caixa = pagina.bounds(for: .mediaBox)
    let ladoMaior = max(caixa.width, caixa.height)
    let escala: CGFloat = ladoMaior > 0 ? min(4.0, max(0.3, 2200.0 / ladoMaior)) : 2.0
    let largura = Int(caixa.width * escala)
    let altura = Int(caixa.height * escala)
    guard largura > 0, altura > 0,
          let contexto = CGContext(
            data: nil, width: largura, height: altura,
            bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { return "" }

    contexto.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    contexto.fill(CGRect(x: 0, y: 0, width: largura, height: altura))
    contexto.scaleBy(x: escala, y: escala)
    contexto.translateBy(x: -caixa.origin.x, y: -caixa.origin.y)
    pagina.draw(with: .mediaBox, to: contexto)

    guard let imagem = contexto.makeImage() else { return "" }

    // Diagnóstico: grava o que o Vision vai ver. Existe porque OCR errado é
    // indistinguível de renderização errada olhando só o texto de saída.
    if let destino = ProcessInfo.processInfo.environment["EV_PDF_DEBUG_IMG"] {
        let url = URL(fileURLWithPath: destino)
        if let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) {
            CGImageDestinationAddImage(dest, imagem, nil)
            CGImageDestinationFinalize(dest)
        }
    }

    let pedido = VNRecognizeTextRequest()
    pedido.recognitionLevel = .accurate
    pedido.usesLanguageCorrection = true
    pedido.recognitionLanguages = ["pt-BR", "pt", "en-US"]

    let tratador = VNImageRequestHandler(cgImage: imagem, options: [:])
    do { try tratador.perform([pedido]) } catch { return "" }

    let linhas = (pedido.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    return linhas.joined(separator: "\n")
}

// --------------------------------------------------------------------------
var argumentos = Array(CommandLine.arguments.dropFirst())
var maxPaginas = 60
var soPagina: Int? = nil
var permitirOcr = true
var caminho: String? = nil

var i = 0
while i < argumentos.count {
    switch argumentos[i] {
    case "--max-paginas":
        i += 1
        if i < argumentos.count { maxPaginas = max(1, Int(argumentos[i]) ?? 60) }
    case "--pagina":
        i += 1
        if i < argumentos.count { soPagina = Int(argumentos[i]) }
    case "--sem-ocr":
        permitirOcr = false
    default:
        caminho = argumentos[i]
    }
    i += 1
}

guard let caminho = caminho else { morrer("falta o caminho do PDF") }
let url = URL(fileURLWithPath: (caminho as NSString).expandingTildeInPath)
guard FileManager.default.fileExists(atPath: url.path) else { morrer("não existe: \(url.path)") }
guard let documento = PDFDocument(url: url) else {
    morrer("não consegui abrir como PDF (arquivo corrompido ou protegido por senha)")
}
if documento.isLocked { morrer("o PDF está protegido por senha") }

let total = documento.pageCount
var partes: [String] = []
var usouOcr = false
var lidas = 0

// Uma página só, quando ele pede página N — útil para PDF grande.
let faixa: [Int]
if let p = soPagina {
    guard p >= 1 && p <= total else { morrer("o PDF tem \(total) página(s); não existe a \(p)") }
    faixa = [p - 1]
} else {
    faixa = Array(0..<min(total, maxPaginas))
}

for indice in faixa {
    guard let pagina = documento.page(at: indice) else { continue }
    var texto = pagina.string ?? ""

    // Menos de 20 caracteres numa página inteira é página sem camada de texto
    // (escaneada, ou só imagem). Aí o OCR é a única leitura possível.
    if texto.trimmingCharacters(in: .whitespacesAndNewlines).count < 20, permitirOcr {
        let reconhecido = ocr(pagina)
        if !reconhecido.isEmpty {
            texto = reconhecido
            usouOcr = true
        }
    }

    lidas += 1
    let numero = indice + 1
    partes.append("--- página \(numero) ---\n\(texto.trimmingCharacters(in: .whitespacesAndNewlines))")
    if partes.joined(separator: "\n\n").count > LIMITE { break }
}

var texto = partes.joined(separator: "\n\n")
let truncado = texto.count > LIMITE
if truncado { texto = String(texto.prefix(LIMITE)) }

let titulo = (documento.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String) ?? ""

let saida: [String: Any] = [
    "paginas": total,
    "lidas": lidas,
    "texto": texto,
    "ocr": usouOcr,
    "truncado": truncado,
    "titulo": titulo,
]
if let d = try? JSONSerialization.data(withJSONObject: saida),
   let s = String(data: d, encoding: .utf8) {
    print(s)
} else {
    morrer("não consegui montar a resposta")
}
