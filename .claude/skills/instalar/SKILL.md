---
name: instalar
description: Instala a versão atual da E.V.E em ~/Applications, somente se a verificação e a assinatura passarem. Use ao terminar qualquer mudança no app (autorizado, sem perguntar) ou quando pedirem para instalar, reinstalar ou atualizar.
---

# Instalar a E.V.E

1. **Instale sozinho** quando uma versão nova ficar pronta: ele autorizou em 25/11/2026. Não precisa perguntar.
2. **Revise** o diff desde a última instalação. Mudou `Info.plist`, helper Swift ou assinatura? Avise que o macOS pode pedir permissões de novo.
3. **Commit e push** na main.
4. **App fechado.** Se estiver aberto, peça para fechar; não mate o processo.
5. **Rode** em segundo plano:
   ```bash
   export PATH=~/.nvm/versions/node/v24.14.0/bin:$PATH
   npm run install-app
   ```
   O macOS pode pedir a senha das chaves para assinar: quem digita é o usuário.
6. **Falhou? Corrija a causa.** Não copie o app à mão nem apague ou pule teste. Se a saída diz "assinando ad-hoc", avise que as permissões serão pedidas de novo.
7. **Relate** o commit instalado e o que falta testar falando com ela.
