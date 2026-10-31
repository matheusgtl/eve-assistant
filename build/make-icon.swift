// make-icon.swift — o ícone do aplicativo.
//
// A versão anterior era um globo de arame: dezenas de meridianos, poeira de
// pontos e brilho. Bonito a 512 px e uma mancha a 16, que é o tamanho em que
// um ícone de verdade passa a maior parte da vida — Dock pequeno, Spotlight,
// lista do Finder, barra de menus.
//
// Então aqui a régua é uma só: **o desenho tem de sobreviver a 16 px**. Isso
// corta quase tudo e deixa três formas, nenhuma sobre a outra:
//   1. o anel — a esfera dela, reduzida ao contorno;
//   2. uma órbita inclinada, que cruza o anel e dá o movimento;
//   3. o núcleo, um ponto sólido no centro.
// Sem degradê no traço, sem brilho, sem sombra: a 16 px nada disso aparece,
// e a 512 só deixava o contorno menos nítido.

import AppKit

let LADO: CGFloat = 1024
let destino = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "build/icon.png"

let imagem = NSImage(size: NSSize(width: LADO, height: LADO))
imagem.lockFocus()

let ctx = NSGraphicsContext.current!.cgContext
ctx.setShouldAntialias(true)

// ----------------------------------------------------------------- o fundo
// Quadrado arredondado no raio da Apple (~22% do lado) e um degradê vertical
// curto. O degradê é a única sutileza que resiste ao tamanho pequeno: dá
// profundidade sem virar textura.
let caixa = NSRect(x: 0, y: 0, width: LADO, height: LADO)
let cantos = NSBezierPath(roundedRect: caixa, xRadius: LADO * 0.225, yRadius: LADO * 0.225)
cantos.addClip()

let fundo = NSGradient(
    colors: [
        NSColor(calibratedRed: 0.07, green: 0.13, blue: 0.22, alpha: 1), // topo
        NSColor(calibratedRed: 0.02, green: 0.05, blue: 0.10, alpha: 1), // base
    ]
)!
fundo.draw(in: caixa, angle: -90)

// ---------------------------------------------------------------- as formas
// Primeira tentativa foi anel vazado + órbita + núcleo. A 512 px ficava ótimo
// e a 16 px virava borrão: dois traços finos se cruzando no meio viram uma
// mancha única, e o núcleo sumia dentro dela. A lição é velha e vale repetir
// aqui: **contorno não reduz, massa reduz**.
//
// Então o corpo é um disco CHEIO e só a órbita é traço — um contraste de
// formas, não dois traços competindo. Duas formas no total.
let centro = NSPoint(x: LADO / 2, y: LADO / 2)
let raio = LADO * 0.275

// 1. O corpo: disco sólido.
NSColor(calibratedRed: 0.42, green: 0.82, blue: 1.0, alpha: 1).setFill()
NSBezierPath(
    ovalIn: NSRect(x: centro.x - raio, y: centro.y - raio, width: raio * 2, height: raio * 2)
).fill()

// 2. A órbita, inclinada e cruzando o disco. Vai desenhada em DUAS partes:
// primeiro um rasgo da cor do fundo, depois o traço branco dentro dele. Esse
// contorno escuro é o que separa a órbita do disco quando os dois encostam —
// sem ele, a 16 px branco sobre azul-claro desaparece.
let orbitaW = raio * 1.62
let orbitaH = raio * 0.30
let traco = LADO * 0.044

ctx.saveGState()
ctx.translateBy(x: centro.x, y: centro.y)
ctx.rotate(by: -26 * .pi / 180)
let caminho = NSBezierPath(
    ovalIn: NSRect(x: -orbitaW, y: -orbitaH, width: orbitaW * 2, height: orbitaH * 2)
)
caminho.lineWidth = traco * 2.3
NSColor(calibratedRed: 0.03, green: 0.07, blue: 0.13, alpha: 1).setStroke()
caminho.stroke()

caminho.lineWidth = traco
NSColor.white.setStroke()
caminho.stroke()
ctx.restoreGState()

imagem.unlockFocus()

guard let tiff = imagem.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
else {
    print("não consegui gerar o PNG")
    exit(1)
}
try! png.write(to: URL(fileURLWithPath: destino))
print("✓ ícone em \(destino)")
