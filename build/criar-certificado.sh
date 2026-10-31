#!/bin/bash
# criar-certificado.sh — cria a identidade local que faz o macOS PARAR de
# pedir as mesmas permissões a cada reinstalação.
#
# O problema, em uma linha: sem certificado, o app é assinado "ad-hoc", e aí o
# requisito designado dele é o HASH DO BINÁRIO:
#
#     # designated => cdhash H"ecb0a58028c3516105d0b53ec51885e7f7c5394e"
#
# O TCC (o banco de permissões do macOS) guarda a autorização amarrada a esse
# hash. Qualquer recompilação muda o hash, e o sistema passa a ver um aplicativo
# diferente — microfone, reconhecimento de fala e automação voltam a ser
# perguntados do zero, toda vez.
#
# Com um certificado próprio, o requisito passa a ser a IDENTIDADE:
#
#     # designated => identifier "com.matheus.eve" and certificate leaf[...]
#
# Isso não muda quando o código muda. Você autoriza uma vez e acabou.
#
# É um certificado SEU, local, que não sai desta máquina e não vale como
# assinatura da Apple — serve só para o seu Mac reconhecer o seu app.
# Para desfazer: Acesso às Chaves › login › Meus certificados › apague
# "E.V.E Local Signing".
set -e

NOME="E.V.E Local Signing"
CHAVEIRO="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning | grep -q "$NOME"; then
  echo "✓ a identidade \"$NOME\" já existe — nada a fazer."
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/cert.cnf" <<CNF
[ req ]
distinguished_name = dn
x509_extensions = v3
prompt = no
[ dn ]
CN = $NOME
[ v3 ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF

echo "› gerando o certificado…"
openssl req -x509 -newkey rsa:2048 -keyout "$TMP/chave.pem" -out "$TMP/cert.pem" \
  -days 3650 -nodes -config "$TMP/cert.cnf" >/dev/null 2>&1
# Os algoritmos antigos são obrigatórios: o OpenSSL 3 exporta por padrão num
# formato que o Security do macOS recusa com "MAC verification failed during
# PKCS12 import (wrong password?)" — mensagem que manda procurar o problema no
# lugar errado. Senha vazia também dá problema no import, então vai uma.
openssl pkcs12 -export -inkey "$TMP/chave.pem" -in "$TMP/cert.pem" \
  -out "$TMP/eve.p12" -passout pass:eve -name "$NOME" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 >/dev/null 2>&1

echo "› guardando no seu chaveiro…"
echo "  (o macOS pode pedir a senha do seu usuário — é o chaveiro, não uma conta online)"
# -T /usr/bin/codesign deixa o codesign usar a chave sem perguntar toda vez.
security import "$TMP/eve.p12" -k "$CHAVEIRO" -P eve -T /usr/bin/codesign

echo "› marcando como confiável para assinar código…"
echo "  (o macOS pode abrir uma janela pedindo a senha do seu usuário)"
if ! security add-trusted-cert -r trustRoot -p codeSign -k "$CHAVEIRO" "$TMP/cert.pem" 2>/dev/null; then
  echo "  não consegui marcar sozinho — faça à mão, leva dez segundos:"
  echo "    Acesso às Chaves › login › Meus certificados › \"$NOME\""
  echo "    duplo clique › Confiar › Assinatura de código: Sempre Confiar"
fi

echo
if security find-identity -v -p codesigning | grep -q "$NOME"; then
  echo "✓ pronto. Agora rode:  npm run install-app"
  echo
  echo "  Na primeira assinatura o macOS pode perguntar se o codesign pode usar a chave:"
  echo "  clique em SEMPRE PERMITIR, aí ele não pergunta mais."
  echo
  echo "  Na primeira abertura ele vai pedir as permissões UMA vez (as de agora estavam"
  echo "  amarradas ao hash antigo e não valem mais). Depois disso, nem reinstalar"
  echo "  faz ele perguntar de novo."
else
  echo "✗ o certificado não apareceu como identidade de assinatura."
  echo "  Abra o Acesso às Chaves, ache \"$NOME\" e marque Confiar › Assinatura de código."
fi
