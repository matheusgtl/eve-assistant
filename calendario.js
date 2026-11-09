// calendario.js — o Calendário de verdade deste Mac, pelo helper nativo.
//
// A diferença entre isto e `lembretes.js` é a única coisa que importa aqui, e
// é a razão deste arquivo existir: o lembrete é DELA — mora num JSON do app, e
// na hora marcada ela te notifica e fala. O evento é SEU — mora no Calendário
// do macOS, aparece no Calendário.app, no iPhone e no iCloud, e continua lá
// com a E.V.E fechada.
//
// Ele pediu "põe no meu calendário", ela criou um lembrete e respondeu "pronto".
// As duas coisas eram verdade ao mesmo tempo, e foi por isso que enganou.

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function caminhoDoHelper() {
  if (process.env.EV_CAL_BIN) return process.env.EV_CAL_BIN;
  const candidatos = [
    path.join(__dirname, "native", "ev-cal"),
    path.join(process.resourcesPath || "", "native", "ev-cal"),
  ];
  return candidatos.find((c) => c && fs.existsSync(c)) || candidatos[0];
}

// A primeira chamada pode ficar parada esperando ele clicar na janela de
// permissão do macOS. O helper desiste em 60 s; aqui esperamos um pouco mais,
// para que o motivo que chega seja o DELE e não um "prazo esgotado" nosso.
const PRAZO = 70_000;

function rodar(args) {
  return new Promise((resolve, reject) => {
    const bin = caminhoDoHelper();
    if (!fs.existsSync(bin)) {
      const err = new Error("o acesso ao Calendário não está compilado (rode `npm run native`)");
      err.semHelper = true;
      return reject(err);
    }
    execFile(bin, args, { timeout: PRAZO, maxBuffer: 4 * 1024 * 1024 }, (erro, saida) => {
      let dados = null;
      try {
        dados = JSON.parse(saida);
      } catch {}
      // O helper escreve o motivo em JSON mesmo quando sai com erro, e o motivo
      // dele ("o acesso ao Calendário está negado") vale muito mais que "exit 1".
      if (dados?.erro) {
        const err = new Error(dados.erro);
        err.codigo = dados.codigo || null;
        return reject(err);
      }
      if (erro) {
        return reject(
          new Error(
            erro.killed
              ? "o Calendário não respondeu (a janela de permissão pode estar esperando você)"
              : erro.message
          )
        );
      }
      if (!dados) return reject(new Error("não consegui entender a resposta do Calendário"));
      resolve(dados);
    });
  });
}

/// Cria um evento. `inicio`/`fim` em ISO local ("2026-05-02T09:00").
function criar({ titulo, inicio, fim, local, notas, diaInteiro, alarmeMinutos, calendario, semLembrete, repetir } = {}) {
  if (!titulo) return Promise.reject(new Error("o evento precisa de um título"));
  if (!inicio) return Promise.reject(new Error("o evento precisa de uma data de início"));
  const args = ["criar", "--titulo", String(titulo), "--inicio", String(inicio)];
  if (fim) args.push("--fim", String(fim));
  if (local) args.push("--local", String(local));
  if (notas) args.push("--notas", String(notas));
  if (diaInteiro) args.push("--dia-inteiro");
  if (alarmeMinutos != null && Number.isFinite(Number(alarmeMinutos))) {
    args.push("--alarme", String(Number(alarmeMinutos)));
  }
  if (calendario) args.push("--calendario", String(calendario));
  if (repetir) args.push("--repetir", String(repetir));
  // Por padrão o evento VIRA TAMBÉM um lembrete no app Lembretes — foi o que
  // ele pediu. `semLembrete` existe para o caso de ele não querer o espelho de
  // um compromisso específico.
  if (semLembrete) args.push("--sem-lembrete");
  return rodar(args);
}

function listar({ de, ate } = {}) {
  const args = ["listar"];
  if (de) args.push("--de", String(de));
  if (ate) args.push("--ate", String(ate));
  return rodar(args);
}

const calendarios = () => rodar(["calendarios"]);

/// Um lembrete no app LEMBRETES do macOS — não o lembrete interno dela.
///
/// A diferença, outra vez, porque ela já confundiu duas vezes: o lembrete
/// interno (lembretes.js) mora num JSON e só vale com a E.V.E aberta. Este
/// aqui é um item do app Lembretes: aparece no Mac, no iPhone, notifica e tem
/// caixinha de concluído. `quando` sem hora ("2026-11-21") não notifica — o
/// app só mostra o item no dia — então a resposta devolve `tem_hora` para ela
/// não prometer um aviso que não vai soar.
function criarLembreteApp({ titulo, quando, notas, lista, alarmeMinutos } = {}) {
  if (!titulo) return Promise.reject(new Error("o lembrete precisa de um título"));
  const args = ["lembrete", "--titulo", String(titulo)];
  if (quando) args.push("--quando", String(quando));
  if (notas) args.push("--notas", String(notas));
  if (lista) args.push("--lista", String(lista));
  if (alarmeMinutos != null && Number.isFinite(Number(alarmeMinutos))) {
    args.push("--alarme", String(Number(alarmeMinutos)));
  }
  return rodar(args);
}

const listarLembretesApp = ({ lista } = {}) =>
  rodar(lista ? ["lembretes", "--lista", String(lista)] : ["lembretes"]);

const listasDeLembretes = () => rodar(["listas"]);

const apagarLembreteApp = (id) =>
  id
    ? rodar(["lembrete-apagar", "--id", String(id)])
    : Promise.reject(new Error("falta o id do lembrete"));
const apagar = (id) =>
  id ? rodar(["apagar", "--id", String(id)]) : Promise.reject(new Error("falta o id do evento"));

module.exports = {
  criar, listar, calendarios, apagar, caminhoDoHelper,
  criarLembreteApp, listarLembretesApp, listasDeLembretes, apagarLembreteApp,
};
