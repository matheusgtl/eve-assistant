#!/usr/bin/env bash
# Sintaxe, Swift e testes. Não abre o app, não instala e não assina nada.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Sintaxe"
for f in *.js renderer/*.js test/*.js; do node --check "$f"; done
echo "== Swift"
for f in native/*.swift; do xcrun swiftc -typecheck "$f"; done
echo "== Testes"
npm test
echo "== Tudo certo"
