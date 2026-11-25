// Travas do que não tem volta, conferidas de ponta a ponta pelo runTool.
// Os comandos daqui são inofensivos mesmo se a trava falhar: só mexem em pasta temporária.
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runTool, toolDefinitions } = require("../tools.js");

const chamar = async (nome, args) => JSON.parse(await runTool(nome, args));

(async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "eve-travas-"));
  const vivo = path.join(pasta, "vivo.txt");
  const semVolta = (r, oque) => {
    assert.strictEqual(r.needs_confirmation, true, `${oque} precisa pedir confirmação`);
    assert.ok(fs.existsSync(vivo), `${oque} executou antes do sim`);
  };
  try {
    fs.writeFileSync(vivo, "precisa sobreviver");

    // Terminal: variações e comando escondido no meio de outros.
    for (const c of [
      `rm -r ${pasta}`, `rm -fr ${pasta}`, `rm -r -f ${pasta}`, `/bin/rm -rf ${pasta}`,
      `echo oi && rm -rf ${pasta}`, `true; RM -RF ${pasta}`,
    ]) semVolta(await chamar("run_command", { command: c }), c);

    // Só o sim explícito libera; valor vazio não é sim.
    for (const confirmed of [undefined, false, null, "", 0]) {
      semVolta(await chamar("run_command", { command: `rm -rf ${pasta}`, confirmed }), `confirmed=${confirmed}`);
    }

    // AppleScript não é desvio para o terminal.
    semVolta(await chamar("applescript", { script: `do shell script "rm -rf ${pasta}"` }), "applescript");

    // Lixo fora da pasta dele (caminho que não existe: nada a apagar se a trava falhar).
    semVolta(await chamar("trash_file", { filepath: "/nao-existe-eve/teste" }), "lixo fora da pasta");

    // Mensagem: nenhum canal sai sem o sim.
    for (const canal of ["imessage", "email", "whatsapp"]) {
      semVolta(await chamar("send_message", { canal, para: "+5500000000000", texto: "teste" }), canal);
    }

    // Quem tem trava precisa expor `confirmed`, senão o sim dele não chega.
    for (const nome of ["run_command", "applescript", "trash_file", "send_message"]) {
      const def = toolDefinitions.find((t) => t.name === nome);
      assert.ok(JSON.stringify(def).includes('"confirmed"'), `${nome} sem confirmed no schema`);
    }

    // O sim de verdade executa.
    await chamar("run_command", { command: `rm -rf ${pasta}`, confirmed: true });
    assert.ok(!fs.existsSync(vivo), "com o sim, o comando tem de rodar");
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
  console.log("✓ travas: terminal, AppleScript, Lixo e mensagem esperam o sim");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
