// honestidade.js — a trava que não deixa ela dizer "feito" quando falhou.
//
// Pedido dele em 25/11/2026. Caso real do log, 23:34: três trash_file
// voltaram com erro e ela respondeu "Tudo certo. Removi o Nox, os arquivos
// MIDNIGHT RACERS e o instalador XAMPP". O prompt já mandava não fazer isso e
// a lição foi gravada no cérebro dela — mas regra de prompt é pedido, não
// garantia. A regra do projeto é "travas em código, não no prompt".
//
// O código sabe o que de fato aconteceu: cada ferramenta de AÇÃO que voltou
// com erro e não deu certo depois com o mesmo alvo. No fim do turno, se a
// resposta dela não reconhece nenhuma falha, o código acrescenta a verdade.
// Consulta que falha (busca, leitura) não entra: não é algo que ela "fez".

/// Ferramentas que FAZEM algo no mundo, com o nome que vai no aviso.
const ACOES = {
  run_command: "rodar o comando",
  open_target: "abrir",
  applescript: "rodar o AppleScript",
  write_file: "gravar",
  edit_file: "editar",
  trash_file: "mandar para o Lixo",
  clipboard: "copiar",
  criar_pdf: "criar o PDF",
  registrar_gasto: "registrar o gasto",
  apagar_gasto: "apagar o gasto",
  notify: "notificar",
  create_reminder: "criar o lembrete",
  criar_evento: "criar o evento",
  criar_lembrete_app: "criar o lembrete",
  apagar_lembrete_app: "apagar o lembrete",
  apagar_evento: "apagar o evento",
  cancel_reminder: "cancelar o lembrete",
  anotar_memoria: "anotar na memória",
  criar_skill: "criar a skill",
  salvar_conversa: "salvar a conversa",
  send_message: "mandar a mensagem",
};

/// O alvo da chamada, para o aviso dizer O QUÊ falhou e para reconhecer uma
/// nova tentativa no mesmo alvo.
function alvoDe(args = {}) {
  const bruto =
    args.filepath ?? args.target ?? args.titulo ?? args.nome ?? args.command ??
    args.destinatario ?? args.texto ?? args.descricao ?? "";
  const texto = String(bruto).replace(/\s+/g, " ").trim();
  // Caminho vira só o nome do arquivo: é como ele chama o arquivo.
  const curto = /^[~/]/.test(texto) && !/\s-/.test(texto) ? texto.split("/").pop() : texto;
  return curto.length > 60 ? curto.slice(0, 57) + "…" : curto;
}

/// A resposta dela já admite que algo deu errado?
const ADMITE =
  /n[ãa]o (?:consegui|deu|foi poss[íi]vel|funcionou|rolou)|falh(?:ou|aram|a)|\berro\b|deu errado|n[ãa]o saiu|tentei,? mas|sem sucesso|n[ãa]o (?:removi|apaguei|movi|criei|gravei|mandei)/i;

function reconheceFalha(texto) {
  return ADMITE.test(String(texto || ""));
}

/// O motivo, curto e sem o "erro: Command failed: …" cru do sistema.
function motivoDe(texto) {
  let m = String(texto || "").replace(/^erro:\s*/i, "").trim();
  if (/osascript|tell application "Finder"/i.test(m)) return "o Finder não respondeu";
  if (/command failed/i.test(m)) m = m.replace(/^.*command failed:\s*/i, "").split(/\s{2,}|\n/)[0];
  m = m.split(/(?<=[.!?])\s/)[0];
  return m.length > 90 ? m.slice(0, 87) + "…" : m;
}

class Honestidade {
  constructor() {
    this.chamadas = [];
  }

  chamou(nome, args) {
    this.chamadas.push({ nome, alvo: alvoDe(args), ok: null, motivo: "" });
  }

  /// `r` é o registro.resultadoDeFerramenta: { ok, texto }.
  resultado(nome, r) {
    const c = this.chamadas.find((x) => x.nome === nome && x.ok === null);
    if (!c) return;
    c.ok = !!r?.ok;
    c.motivo = c.ok ? "" : motivoDe(r?.texto);
  }

  /// Ações que falharam e não deram certo depois, no mesmo alvo.
  pendentes() {
    return this.chamadas.filter(
      (c, i) =>
        c.ok === false &&
        ACOES[c.nome] &&
        !this.chamadas.slice(i + 1).some((d) => d.nome === c.nome && d.alvo === c.alvo && d.ok)
    );
  }

  /// O texto a acrescentar no fim da resposta, ou null se não precisa.
  aviso(resposta) {
    const falhas = this.pendentes();
    if (!falhas.length || reconheceFalha(resposta)) return null;
    const itens = falhas.slice(0, 4).map((c) => {
      const o_que = `${ACOES[c.nome]}${c.alvo ? ` “${c.alvo}”` : ""}`;
      return c.motivo ? `${o_que} (${c.motivo})` : o_que;
    });
    const resto = falhas.length > 4 ? ` e mais ${falhas.length - 4}` : "";
    // "O resto foi feito" só quando alguma AÇÃO deu certo: senão o aviso que
    // corrige a mentira mentiria também.
    const algumaFeita = this.chamadas.some((c) => c.ok && ACOES[c.nome]);
    return (
      `Correção: nem tudo deu certo. Não consegui ${itens.join("; ")}${resto}. ` +
      (algumaFeita ? "O resto foi feito." : "Nada foi feito.") +
      " Quer que eu tente de novo?"
    );
  }
}

module.exports = { Honestidade, reconheceFalha, alvoDe, motivoDe, ACOES };
