#!/usr/bin/env bash
# Instala em ~/Applications. Para no primeiro erro: o app instalado só é trocado
# depois de a verificação passar e o novo estar montado e com assinatura válida.
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(git branch --show-current)" = main ] || { echo "ERRO: instale a partir da main."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "ERRO: há mudanças sem commit."; exit 1; }
git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "ERRO: main local diferente do GitHub."; exit 1; }
if pgrep -f "/Applications/(E.V.E|Sexta-Feira).app/Contents/MacOS/" >/dev/null; then
  echo "ERRO: a Sexta-Feira está aberta. Feche antes de instalar."; exit 1
fi

bash scripts/verificar.sh
bash build/pack.sh

novo="$(ls -d dist/Sexta-Feira-darwin-*/Sexta-Feira.app | head -1)"
codesign --verify --deep --strict "$novo"
for h in ev-listen ev-pdf ev-pdf-criar ev-cal; do
  [ -x "$novo/Contents/Resources/native/$h" ] || { echo "ERRO: falta $h no pacote."; exit 1; }
done

# A E.V.E virou Sexta-Feira em 25/11/2026: o app antigo sai junto, senão
# ficariam dois ícones abrindo o mesmo app (mesmo bundle id, mesmos dados).
rm -rf ~/Applications/'Sexta-Feira.app' ~/Applications/'E.V.E.app' ~/Applications/'E.V.app'
cp -R "$novo" ~/Applications/
echo "✓ instalado em ~/Applications/Sexta-Feira.app: $(git log -1 --format='%h %s')"
