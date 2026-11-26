// make-icon.swift — os ícones da Sexta-Feira, a partir da arte dele.
//
// Uso:
//   swift build/make-icon.swift app   <destino.png>   ícone do app, 1024×1024
//   swift build/make-icon.swift logo  <destino.png>   logo da interface, 256×256
//   swift build/make-icon.swift tray  <pasta>         ícone da barra de menus
//
// Até 25/11/2026 o ícone era desenhado aqui em código (disco + órbita). Agora
// ele mandou a arte pronta — o olho com as linhas de rede — e ela mora em
// assets/logo-original.png. O que este script faz é só o acabamento que a
// imagem original não tem:
//
// 1. RECORTE. A arte vem com uma moldura preta em volta do quadrado
//    arredondado (502×456, quadrado em x 40…463, y 17…435). Ícone de macOS com
//    fundo preto nos cantos fica com quina quadrada no Dock.
// 2. MÁSCARA no raio da Apple (22,5% do lado), para os cantos virarem
//    transparência de verdade.
// 3. MARGEM da grade do Big Sur: o corpo ocupa 824 de 1024, senão o ícone
//    parece maior que todos os outros do Dock.
//
// A barra de menus é outra história: lá o macOS pede imagem "template" — preta
// com transparência, que ele mesmo pinta de branco no modo escuro. A arte
// colorida viraria um borrão de 18 px, então o olho é redesenhado em traço.

import AppKit

let args = CommandLine.arguments
let modo = args.count > 1 ? args[1] : "app"
let destino = args.count > 2 ? args[2] : "build/icon.png"
let raiz = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let fonte = raiz.appendingPathComponent("assets/logo-original.png")

/// Um bitmap com o tamanho EXATO em pixels. NSImage.lockFocus desenha no
/// tamanho da tela (o dobro, num Retina) e o PNG saía com 2048 px.
func bitmap(_ lado: Int) -> NSBitmapImageRep {
    NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: lado, pixelsHigh: lado,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
}

func gravar(_ rep: NSBitmapImageRep, _ caminho: String) {
    guard let png = rep.representation(using: .png, properties: [:]) else {
        print("não consegui gerar o PNG"); exit(1)
    }
    try! png.write(to: URL(fileURLWithPath: caminho))
    print("✓ \(caminho) (\(rep.pixelsWide) px)")
}

func desenhar(_ lado: Int, _ bloco: (CGContext, CGFloat) -> Void) -> NSBitmapImageRep {
    let rep = bitmap(lado)
    NSGraphicsContext.saveGraphicsState()
    let g = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = g
    g.cgContext.setShouldAntialias(true)
    g.imageInterpolation = .high
    bloco(g.cgContext, CGFloat(lado))
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

/// A arte recortada no quadrado arredondado, desenhada em `caixa`.
func desenharArte(em caixa: NSRect) {
    guard let original = NSImage(contentsOf: fonte),
          let cg = original.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
        print("não achei \(fonte.path)"); exit(1)
    }
    // Recorte quadrado em volta do corpo da arte, em pixels da imagem.
    // Medido na arte de 25/11: o quadrado vai de x 40 a 463 e de y 17 a 435.
    let w = CGFloat(cg.width), h = CGFloat(cg.height)
    let lado = min(w, h) * (424.0 / 456.0)
    let cx = w * (252.0 / 502.0), cy = h * (226.0 / 456.0)
    let corte = CGRect(x: cx - lado / 2, y: cy - lado / 2, width: lado, height: lado).integral
    guard let recorte = cg.cropping(to: corte) else { exit(1) }

    let raio = caixa.width * 0.225
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(roundedRect: caixa, xRadius: raio, yRadius: raio).addClip()
    // Amplia 4% e centraliza: a moldura escura da arte fica fora da máscara.
    let folga = caixa.width * 0.02
    NSImage(cgImage: recorte, size: caixa.size)
        .draw(in: caixa.insetBy(dx: -folga, dy: -folga), from: .zero, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
}

switch modo {
case "app":
    gravar(desenhar(1024) { _, l in
        let corpo = l * 824 / 1024
        desenharArte(em: NSRect(x: (l - corpo) / 2, y: (l - corpo) / 2, width: corpo, height: corpo))
    }, destino)

case "logo":
    gravar(desenhar(256) { _, l in desenharArte(em: NSRect(x: 0, y: 0, width: l, height: l)) }, destino)

case "tray":
    // O olho em traço. 18 pt é o tamanho da barra de menus; @2x para Retina.
    for (escala, sufixo) in [(1, ""), (2, "@2x")] {
        let lado = 18 * escala
        let rep = desenhar(lado) { ctx, l in
            let s = l / 18
            ctx.setStrokeColor(NSColor.black.cgColor)
            ctx.setFillColor(NSColor.black.cgColor)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            let meio = l / 2
            // A amêndoa: duas curvas que se encontram nas pontas.
            let esq = CGPoint(x: 1.2 * s, y: meio), dir = CGPoint(x: l - 1.2 * s, y: meio)
            let olho = CGMutablePath()
            olho.move(to: esq)
            olho.addQuadCurve(to: dir, control: CGPoint(x: meio, y: meio + 8.6 * s))
            olho.addQuadCurve(to: esq, control: CGPoint(x: meio, y: meio - 8.6 * s))
            ctx.setLineWidth(1.35 * s)
            ctx.addPath(olho)
            ctx.strokePath()
            // Uma linha da "rede" por dentro de cada pálpebra, mais fina: é o
            // que faz o olho ser o DELA e não um ícone genérico de "ver".
            if escala == 2 {
                let rede = CGMutablePath()
                rede.move(to: esq)
                rede.addQuadCurve(to: dir, control: CGPoint(x: meio, y: meio + 5.6 * s))
                rede.move(to: esq)
                rede.addQuadCurve(to: dir, control: CGPoint(x: meio, y: meio - 5.6 * s))
                ctx.setLineWidth(0.6 * s)
                ctx.addPath(rede)
                ctx.strokePath()
            }
            // Íris (anel) e núcleo (cheio).
            ctx.setLineWidth(1.1 * s)
            ctx.strokeEllipse(in: CGRect(x: meio - 3.1 * s, y: meio - 3.1 * s, width: 6.2 * s, height: 6.2 * s))
            ctx.fillEllipse(in: CGRect(x: meio - 1.55 * s, y: meio - 1.55 * s, width: 3.1 * s, height: 3.1 * s))
        }
        gravar(rep, "\(destino)/trayTemplate\(sufixo).png")
    }

default:
    print("modo desconhecido: \(modo) (use app, logo ou tray)")
    exit(1)
}
