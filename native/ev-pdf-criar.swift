// ev-pdf-criar.swift — escreve um PDF a partir de texto em Markdown.
//
// Por que um binário nativo, e por que CoreText:
//
// 1. O macOS já sabe compor e paginar texto. O CoreText é o mesmo motor de
//    tipografia do Pages e do TextEdit: quebra linha certo em português,
//    monta ligadura, acerta acentuação e entrelinha. Uma biblioteca de PDF em
//    JavaScript desenha caixas e deixa a tipografia para quem chamar.
// 2. Zero dependência nova. O irmão deste arquivo, o ev-pdf, já lê PDF com
//    PDFKit e Vision pelo mesmo motivo.
// 3. Nada de WebKit. Dava tipografia melhor ainda via HTML, mas o WKWebView
//    exige NSApplication e volta assíncrono — num CLI isso é um run loop e
//    uma classe de travamento a mais. O CoreText desenha e pronto.
//
// O texto entra pela ENTRADA PADRÃO, não como argumento: documento tem
// parágrafo, quebra de linha e acento, e a lista de argumentos tem limite de
// tamanho no sistema. Passar um relatório por argv é um erro esperando a hora.
//
// Uso:  ev-pdf-criar --saida <arquivo.pdf> [--titulo <texto>] [--sem-numero]
//       (o conteúdo vem pela entrada padrão)
// Sai:  JSON { caminho, paginas, bytes }

import Foundation
import AppKit
import CoreText

let A4 = CGSize(width: 595, height: 842)   // pontos, retrato
let MARGEM: CGFloat = 56                    // ~2 cm
let LIMITE_ENTRADA = 400_000                // o mesmo teto da leitura

func morrer(_ mensagem: String) -> Never {
    let saida: [String: Any] = ["erro": mensagem]
    if let d = try? JSONSerialization.data(withJSONObject: saida),
       let s = String(data: d, encoding: .utf8) { print(s) }
    exit(1)
}

// --------------------------------------------------------------------------
// Tipografia
// --------------------------------------------------------------------------
// Corpo em 11pt com entrelinha de 4pt: é o que cabe confortável numa A4 com
// margem de 2 cm sem o texto virar parede. Os títulos usam peso, não cor —
// um documento que vai ser impresso ou lido no celular não pode depender de
// cor para ter hierarquia.

let CORPO = NSFont.systemFont(ofSize: 11)
let CORPO_NEGRITO = NSFont.boldSystemFont(ofSize: 11)
let CORPO_ITALICO = NSFontManager.shared.convert(CORPO, toHaveTrait: .italicFontMask)
let MONO = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
let H1 = NSFont.systemFont(ofSize: 22, weight: .bold)
let H2 = NSFont.systemFont(ofSize: 16, weight: .semibold)
let H3 = NSFont.systemFont(ofSize: 13, weight: .semibold)

let TINTA = NSColor.black
let TINTA_FRACA = NSColor(white: 0.35, alpha: 1)

func paragrafo(
    antes: CGFloat = 0, depois: CGFloat = 8, entrelinha: CGFloat = 4,
    recuo: CGFloat = 0, primeiraLinha: CGFloat? = nil
) -> NSParagraphStyle {
    let p = NSMutableParagraphStyle()
    p.paragraphSpacingBefore = antes
    p.paragraphSpacing = depois
    p.lineSpacing = entrelinha
    p.headIndent = recuo
    p.firstLineHeadIndent = primeiraLinha ?? recuo
    return p
}

// --------------------------------------------------------------------------
// Markdown em linha: **negrito**, *itálico*, `código`, [texto](url)
// --------------------------------------------------------------------------
// Uma passada só, consumindo da esquerda para a direita. A ordem importa: o
// código vem primeiro porque dentro de um trecho de código o asterisco é
// asterisco, não marca de negrito.

func inline(_ texto: String, base: NSFont) -> NSMutableAttributedString {
    let saida = NSMutableAttributedString()
    var resto = Substring(texto)

    let negrito = NSFontManager.shared.convert(base, toHaveTrait: .boldFontMask)
    let italico = NSFontManager.shared.convert(base, toHaveTrait: .italicFontMask)
    let mono = NSFont.monospacedSystemFont(ofSize: base.pointSize - 1, weight: .regular)

    func juntar(_ s: String, _ fonte: NSFont, codigo: Bool = false) {
        var atributos: [NSAttributedString.Key: Any] = [.font: fonte, .foregroundColor: TINTA]
        if codigo { atributos[.backgroundColor] = NSColor(white: 0.94, alpha: 1) }
        saida.append(NSAttributedString(string: s, attributes: atributos))
    }

    // Cada marca é (abertura, fechamento, fonte, é código?).
    let marcas: [(String, String, NSFont, Bool)] = [
        ("`", "`", mono, true),
        ("**", "**", negrito, false),
        ("__", "__", negrito, false),
        ("*", "*", italico, false),
        ("_", "_", italico, false),
    ]

    while !resto.isEmpty {
        // Onde começa a próxima marca, e qual é.
        var achou: (indice: String.Index, marca: (String, String, NSFont, Bool))? = nil
        for m in marcas {
            guard let i = resto.range(of: m.0)?.lowerBound else { continue }
            // Precisa existir o fechamento depois da abertura, senão o
            // asterisco é só um asterisco: "2 * 3" não é itálico.
            let depois = resto.index(i, offsetBy: m.0.count, limitedBy: resto.endIndex) ?? resto.endIndex
            guard resto[depois...].range(of: m.1) != nil else { continue }
            if achou == nil || i < achou!.indice { achou = (i, m) }
        }

        // Link antes das marcas de ênfase, para o texto do link sair limpo.
        if let faixa = resto.range(of: #"\[([^\]]+)\]\(([^)]+)\)"#, options: .regularExpression),
           achou == nil || faixa.lowerBound < achou!.indice {
            juntar(String(resto[resto.startIndex..<faixa.lowerBound]), base)
            let inteiro = String(resto[faixa])
            // Fica só o texto visível; a URL vira atributo de link.
            if let corte = inteiro.range(of: "]("),
               case let rotulo = String(inteiro[inteiro.index(after: inteiro.startIndex)..<corte.lowerBound]),
               case let url = String(inteiro[corte.upperBound..<inteiro.index(before: inteiro.endIndex)]) {
                saida.append(NSAttributedString(string: rotulo, attributes: [
                    .font: base, .foregroundColor: NSColor(red: 0, green: 0.25, blue: 0.6, alpha: 1),
                    .underlineStyle: NSUnderlineStyle.single.rawValue, .link: url,
                ]))
            }
            resto = resto[faixa.upperBound...]
            continue
        }

        guard let (indice, marca) = achou else { juntar(String(resto), base); break }

        juntar(String(resto[resto.startIndex..<indice]), base)
        let apos = resto.index(indice, offsetBy: marca.0.count)
        guard let fecha = resto[apos...].range(of: marca.1) else {
            juntar(String(resto[indice...]), base); break
        }
        juntar(String(resto[apos..<fecha.lowerBound]), marca.2, codigo: marca.3)
        resto = resto[fecha.upperBound...]
    }

    return saida
}

// --------------------------------------------------------------------------
// Markdown em bloco
// --------------------------------------------------------------------------
// O Markdown é estruturado por BLOCO: um item de lista não é uma linha com um
// traço na frente, é um item, e o que vem na linha seguinte pode continuar o
// mesmo item. Por isso o laço olha linha por linha mas acumula parágrafo.

func montar(_ texto: String) -> NSAttributedString {
    let saida = NSMutableAttributedString()
    let linhas = texto.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")

    var i = 0
    var acumulado: [String] = []
    var numeroDaLista = 1

    func despejarParagrafo() {
        guard !acumulado.isEmpty else { return }
        let junto = acumulado.joined(separator: " ")
        acumulado = []
        let p = inline(junto, base: CORPO)
        p.addAttribute(.paragraphStyle, value: paragrafo(), range: NSRange(location: 0, length: p.length))
        saida.append(p)
        saida.append(NSAttributedString(string: "\n"))
    }

    func titulo(_ conteudo: String, _ fonte: NSFont, antes: CGFloat, depois: CGFloat) {
        despejarParagrafo()
        let t = inline(conteudo, base: fonte)
        t.addAttribute(
            .paragraphStyle,
            value: paragrafo(antes: antes, depois: depois, entrelinha: 2),
            range: NSRange(location: 0, length: t.length)
        )
        saida.append(t)
        saida.append(NSAttributedString(string: "\n"))
    }

    while i < linhas.count {
        let linha = linhas[i]
        let limpa = linha.trimmingCharacters(in: .whitespaces)

        // Bloco de código cercado: tudo dentro vai cru, inclusive asteriscos.
        if limpa.hasPrefix("```") {
            despejarParagrafo()
            var dentro: [String] = []
            i += 1
            while i < linhas.count, !linhas[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                dentro.append(linhas[i]); i += 1
            }
            i += 1
            let bloco = NSMutableAttributedString(
                string: dentro.joined(separator: "\n") + "\n",
                attributes: [
                    .font: MONO, .foregroundColor: TINTA,
                    .backgroundColor: NSColor(white: 0.96, alpha: 1),
                    .paragraphStyle: paragrafo(antes: 4, depois: 10, entrelinha: 2, recuo: 12),
                ]
            )
            saida.append(bloco)
            continue
        }

        if limpa.isEmpty { despejarParagrafo(); numeroDaLista = 1; i += 1; continue }

        // Linha divisória. Desenhada com um traço de sublinhado num espaço
        // largo: é a forma de ter régua horizontal sem sair do fluxo do texto.
        if limpa == "---" || limpa == "***" || limpa == "___" {
            despejarParagrafo()
            saida.append(NSAttributedString(string: " \n", attributes: [
                .font: NSFont.systemFont(ofSize: 4),
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
                .strikethroughColor: NSColor(white: 0.8, alpha: 1),
                .paragraphStyle: paragrafo(antes: 6, depois: 10),
                .expansion: 4.0,
            ]))
            i += 1
            continue
        }

        if limpa.hasPrefix("### ") {
            titulo(String(limpa.dropFirst(4)), H3, antes: 12, depois: 5); i += 1; continue
        }
        if limpa.hasPrefix("## ") {
            titulo(String(limpa.dropFirst(3)), H2, antes: 16, depois: 7); i += 1; continue
        }
        if limpa.hasPrefix("# ") {
            titulo(String(limpa.dropFirst(2)), H1, antes: 4, depois: 12); i += 1; continue
        }

        // Citação.
        if limpa.hasPrefix("> ") {
            despejarParagrafo()
            let c = inline(String(limpa.dropFirst(2)), base: CORPO_ITALICO)
            c.addAttribute(
                .paragraphStyle, value: paragrafo(depois: 8, recuo: 20),
                range: NSRange(location: 0, length: c.length)
            )
            c.addAttribute(.foregroundColor, value: TINTA_FRACA, range: NSRange(location: 0, length: c.length))
            saida.append(c); saida.append(NSAttributedString(string: "\n"))
            i += 1
            continue
        }

        // Item de lista, com marca ou numerado. O recuo pendurado é o que faz
        // a segunda linha de um item alinhar com o texto e não com a marca.
        let itemComMarca = limpa.hasPrefix("- ") || limpa.hasPrefix("* ")
        let itemNumerado = limpa.range(of: #"^\d+[.)]\s"#, options: .regularExpression) != nil
        if itemComMarca || itemNumerado {
            despejarParagrafo()
            var conteudo: String
            var marca: String
            if itemComMarca {
                conteudo = String(limpa.dropFirst(2))
                marca = "•  "
            } else {
                let faixa = limpa.range(of: #"^\d+[.)]\s"#, options: .regularExpression)!
                conteudo = String(limpa[faixa.upperBound...])
                marca = "\(numeroDaLista).  "
                numeroDaLista += 1
            }
            let item = NSMutableAttributedString(
                string: marca, attributes: [.font: CORPO, .foregroundColor: TINTA]
            )
            item.append(inline(conteudo, base: CORPO))
            item.addAttribute(
                .paragraphStyle,
                value: paragrafo(depois: 3, recuo: 18, primeiraLinha: 4),
                range: NSRange(location: 0, length: item.length)
            )
            saida.append(item)
            saida.append(NSAttributedString(string: "\n"))
            i += 1
            continue
        }

        acumulado.append(limpa)
        i += 1
    }

    despejarParagrafo()
    return saida
}

// --------------------------------------------------------------------------
// Argumentos
// --------------------------------------------------------------------------
var argumentos = Array(CommandLine.arguments.dropFirst())
var saidaPath: String? = nil
var tituloDoc = ""
var comNumero = true

var a = 0
while a < argumentos.count {
    switch argumentos[a] {
    case "--saida":
        a += 1
        if a < argumentos.count { saidaPath = argumentos[a] }
    case "--titulo":
        a += 1
        if a < argumentos.count { tituloDoc = argumentos[a] }
    case "--sem-numero":
        comNumero = false
    default:
        break
    }
    a += 1
}

guard let saidaPath = saidaPath else { morrer("falta --saida com o caminho do PDF") }

let dadosEntrada = FileHandle.standardInput.readDataToEndOfFile()
guard var conteudo = String(data: dadosEntrada, encoding: .utf8) else {
    morrer("o conteúdo não está em UTF-8")
}
if conteudo.count > LIMITE_ENTRADA { conteudo = String(conteudo.prefix(LIMITE_ENTRADA)) }
guard !conteudo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
    morrer("não vou escrever um PDF vazio: o conteúdo chegou em branco")
}

// O título vira o H1 quando o conteúdo ainda não tem um. Dois títulos iguais
// seguidos é o erro que apareceu em metade das notas do cofre.
let jaTemTitulo = conteudo.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("# ")
if !tituloDoc.isEmpty && !jaTemTitulo {
    conteudo = "# \(tituloDoc)\n\n\(conteudo)"
}

let destino = URL(fileURLWithPath: (saidaPath as NSString).expandingTildeInPath)
try? FileManager.default.createDirectory(
    at: destino.deletingLastPathComponent(), withIntermediateDirectories: true
)

// --------------------------------------------------------------------------
// Composição e paginação
// --------------------------------------------------------------------------
let texto = montar(conteudo)
guard texto.length > 0 else { morrer("o conteúdo não produziu nenhum texto") }

var caixa = CGRect(origin: .zero, size: A4)
var info: [CFString: Any] = [kCGPDFContextCreator: "E.V.E"]
if !tituloDoc.isEmpty { info[kCGPDFContextTitle] = tituloDoc }

guard let ctx = CGContext(destino as CFURL, mediaBox: &caixa, info as CFDictionary) else {
    morrer("não consegui criar o arquivo em \(destino.path) (pasta sem permissão de escrita?)")
}

let area = CGRect(
    x: MARGEM, y: MARGEM + (comNumero ? 16 : 0),
    width: A4.width - MARGEM * 2,
    height: A4.height - MARGEM * 2 - (comNumero ? 16 : 0)
)
let framesetter = CTFramesetterCreateWithAttributedString(texto)
let numerador = NSFont.systemFont(ofSize: 9)

var inicio = 0
var paginas = 0
while inicio < texto.length {
    ctx.beginPDFPage(nil)
    let frame = CTFramesetterCreateFrame(
        framesetter, CFRange(location: inicio, length: 0), CGPath(rect: area, transform: nil), nil
    )
    CTFrameDraw(frame, ctx)
    let visivel = CTFrameGetVisibleStringRange(frame)
    paginas += 1

    if comNumero {
        let n = NSAttributedString(string: "\(paginas)", attributes: [
            .font: numerador, .foregroundColor: TINTA_FRACA,
        ])
        let linha = CTLineCreateWithAttributedString(n)
        let largura = CTLineGetTypographicBounds(linha, nil, nil, nil)
        ctx.textPosition = CGPoint(x: (A4.width - CGFloat(largura)) / 2, y: MARGEM - 6)
        CTLineDraw(linha, ctx)
    }

    ctx.endPDFPage()

    // Nada caberia nesta página: sem esta saída o laço gira para sempre.
    // Acontece com uma única palavra mais larga que a área de texto.
    if visivel.length == 0 {
        ctx.closePDF()
        morrer("não consegui paginar: há um trecho que não cabe na largura da página")
    }
    inicio += visivel.length
}

ctx.closePDF()

let atributos = try? FileManager.default.attributesOfItem(atPath: destino.path)
let bytes = (atributos?[.size] as? Int) ?? 0
let resposta: [String: Any] = ["caminho": destino.path, "paginas": paginas, "bytes": bytes]
if let d = try? JSONSerialization.data(withJSONObject: resposta),
   let s = String(data: d, encoding: .utf8) {
    print(s)
} else {
    morrer("não consegui montar a resposta")
}
