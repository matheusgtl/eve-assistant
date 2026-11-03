#!/bin/bash
# pack.sh — gera o E.V.E.app completo: motor de escuta nativo, ícone, empacotamento e assinatura.
set -e
cd "$(dirname "$0")/.."

echo "› compilando o motor de escuta (Swift)…"
swiftc -O native/ev-listen.swift -o native/ev-listen \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/helper-info.plist

echo "› compilando o leitor de PDF (PDFKit + OCR)…"
swiftc -O native/ev-pdf.swift -o native/ev-pdf

echo "› compilando o criador de PDF (CoreText)…"
swiftc -O native/ev-pdf-criar.swift -o native/ev-pdf-criar

echo "› compilando o acesso ao Calendário (EventKit)…"
# O Info.plist embutido não é enfeite: sem NSCalendarsFullAccessUsageDescription
# o macOS mata o processo na hora de pedir permissão, em vez de mostrar a janela.
swiftc -O native/ev-cal.swift -o native/ev-cal \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/cal-info.plist

if [ ! -f build/icon.icns ]; then
  echo "› gerando o ícone…"
  swift build/make-icon.swift build/icon.png
  rm -rf build/icon.iconset && mkdir build/icon.iconset
  for s in 16 32 64 128 256 512; do
    sips -z $s $s build/icon.png --out build/icon.iconset/icon_${s}x${s}.png >/dev/null
    sips -z $((s*2)) $((s*2)) build/icon.png --out build/icon.iconset/icon_${s}x${s}@2x.png >/dev/null
  done
  cp build/icon.png build/icon.iconset/icon_512x512@2x.png
  iconutil -c icns build/icon.iconset -o build/icon.icns
  rm -rf build/icon.iconset
fi

echo "› empacotando…"
npx electron-packager . 'E.V.E' \
  --platform=darwin --overwrite --out=dist \
  --app-bundle-id=com.matheus.eve \
  --extra-resource=native \
  --extend-info=build/Info.plist \
  --ignore="^/(dist|build)" >/dev/null

APP=$(ls -d dist/E.V.E-darwin-*/E.V.E.app | head -1)

echo "› aplicando ícone…"
cp build/icon.icns "$APP/Contents/Resources/electron.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile electron" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string electron" "$APP/Contents/Info.plist"

# ---------------------------------------------------------------- assinatura
# Duas coisas estavam erradas aqui, e as duas faziam o macOS esquecer as
# permissões a cada reinstalação.
#
# 1. O `--deep` NÃO alcança Contents/Resources. Os helpers nativos ficavam sem
#    assinatura NENHUMA — inclusive o ev-listen, que é justamente quem pede
#    microfone e reconhecimento de fala. Binário sem assinatura não tem
#    identidade estável para o TCC guardar. Por isso agora a assinatura é de
#    dentro para fora: helpers primeiro, bundle depois (assinar o bundle antes
#    e os helpers depois quebraria o selo do bundle).
#
# 2. Ad-hoc identifica o app pelo HASH DO BINÁRIO, que muda em toda compilação.
#    Com uma identidade de verdade, o requisito designado passa a ser o nome do
#    certificado, que não muda. Veja build/criar-certificado.sh.
IDENTIDADE="${EVE_IDENTIDADE:-E.V.E Local Signing}"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENTIDADE"; then
  ASSINA="$IDENTIDADE"
  echo "› assinando com \"$IDENTIDADE\" (as permissões sobrevivem à reinstalação)…"
else
  ASSINA="-"
  echo "› assinando ad-hoc — o macOS vai PEDIR AS PERMISSÕES DE NOVO a cada reinstalação."
  echo "  Para resolver de vez, rode uma vez:  bash build/criar-certificado.sh"
fi

# Helpers primeiro.
for helper in "$APP"/Contents/Resources/native/ev-*; do
  [ -f "$helper" ] && [ -x "$helper" ] || continue
  codesign --force --sign "$ASSINA" "$helper"
done

# Depois o bundle inteiro (o --deep cobre Frameworks e os Helper.app do Electron).
codesign --force --deep --sign "$ASSINA" "$APP"

echo "✓ pronto: $APP"
codesign -d -r- "$APP" 2>&1 | grep designated | sed 's/^/  /' || true
