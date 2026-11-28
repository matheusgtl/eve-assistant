// notion.js — ler o Notion dele. SÓ LEITURA.
//
// 27/11/2026: "existe alguma forma de te conectar com meu notion para vc ler
// oq tenho anotado por lá?" — e depois: "quero adicionar uma chave API nela
// para ela ler meu notion". A chave é de uma integração INTERNA do Notion
// (notion.so/profile/integrations → "Internal Integration Secret", começa com
// ntn_ ou secret_). Ela só enxerga as páginas que ele compartilhar com a
// integração (na página: ··· → Conexões → a integração). Por isso "não achei
// nada" vem com essa explicação, e não com "não existe".
//
// Nada aqui escreve: só GET /users/me, POST /search, GET /pages, GET /blocks
// e POST /databases/{id}/query (que, apesar do POST, só consulta). Escrever
// no Notion seria ação no mundo, com outra conversa sobre travas.

"use strict";

const API = process.env.EV_NOTION_API || "https://api.notion.com/v1";
const VERSAO = "2022-06-28";
const TETO_TEXTO = 12_000; // como o PDF: cabe uma página grande, sobra conversa em volta
const TETO_BLOCOS = 400;
const PROFUNDIDADE = 3; // listas e toggles aninhados
const PRAZO = 15_000;

class ErroNotion extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

/// O que dizer quando o Notion recusa. A mensagem crua dele é em inglês e
/// técnica ("API token is invalid"); ela precisa dizer o que ELE faz.
function explicar(status, corpo) {
  const codigo = corpo?.code || "";
  if (status === 401 || codigo === "unauthorized") {
    return "o Notion recusou a chave. Confira em Ajustes › Conexões (a chave é o \"Internal Integration Secret\" da integração).";
  }
  if (status === 404 || codigo === "object_not_found") {
    return "não achei essa página. Ou o id está errado, ou ela não foi compartilhada com a integração (na página: ··· → Conexões → a integração).";
  }
  if (status === 403 || codigo === "restricted_resource") {
    return "a integração não tem permissão de leitura nessa página.";
  }
  if (status === 429) return "o Notion pediu para esperar um pouco (muitos pedidos). Tente de novo em alguns segundos.";
  return `o Notion respondeu ${status}${corpo?.message ? `: ${corpo.message}` : ""}.`;
}

async function pedir(chave, metodo, caminho, corpo) {
  if (!chave) throw new ErroNotion("o Notion não está conectado. Ele cola a chave em Ajustes › Conexões.");
  const ctrl = new AbortController();
  const prazo = setTimeout(() => ctrl.abort(), PRAZO);
  let resp;
  try {
    resp = await fetch(API + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${chave}`,
        "Notion-Version": VERSAO,
        "Content-Type": "application/json",
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new ErroNotion(err.name === "AbortError" ? "o Notion não respondeu a tempo." : `não consegui falar com o Notion (${err.message}).`);
  } finally {
    clearTimeout(prazo);
  }
  let dados = null;
  try {
    dados = await resp.json();
  } catch {}
  if (!resp.ok) throw new ErroNotion(explicar(resp.status, dados), resp.status);
  return dados;
}

/// Aceita o id puro, com ou sem hífens, ou o link inteiro que ele copia do
/// Notion ("https://www.notion.so/Minha-pagina-1a2b…"). Null se não houver id.
function idDe(texto) {
  const t = String(texto || "");
  const achados = t.replace(/-/g, "").match(/[0-9a-f]{32}/gi);
  if (!achados) return null;
  const h = achados[achados.length - 1].toLowerCase(); // no link, o id é o fim
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const textoRico = (lista) => (Array.isArray(lista) ? lista.map((r) => r.plain_text || "").join("") : "");

function tituloDe(obj) {
  if (!obj) return "";
  if (Array.isArray(obj.title)) return textoRico(obj.title); // base de dados
  for (const p of Object.values(obj.properties || {})) {
    if (p?.type === "title") return textoRico(p.title);
  }
  return "";
}

/// O valor de uma propriedade de linha de base, em texto curto.
function valorDe(p) {
  if (!p) return "";
  switch (p.type) {
    case "title": return textoRico(p.title);
    case "rich_text": return textoRico(p.rich_text);
    case "number": return p.number ?? "";
    case "select": return p.select?.name || "";
    case "status": return p.status?.name || "";
    case "multi_select": return (p.multi_select || []).map((s) => s.name).join(", ");
    case "date": return p.date ? [p.date.start, p.date.end].filter(Boolean).join(" → ") : "";
    case "checkbox": return p.checkbox ? "sim" : "não";
    case "url": return p.url || "";
    case "email": return p.email || "";
    case "phone_number": return p.phone_number || "";
    case "people": return (p.people || []).map((x) => x.name).filter(Boolean).join(", ");
    case "formula": return p.formula ? p.formula[p.formula.type] ?? "" : "";
    default: return "";
  }
}

/// Um bloco em uma linha de Markdown. `nivel` indenta listas aninhadas.
function linhaDoBloco(b, nivel = 0) {
  const recuo = "  ".repeat(nivel);
  const d = b[b.type] || {};
  const t = textoRico(d.rich_text);
  switch (b.type) {
    case "heading_1": return `\n# ${t}`;
    case "heading_2": return `\n## ${t}`;
    case "heading_3": return `\n### ${t}`;
    case "bulleted_list_item": return `${recuo}- ${t}`;
    case "numbered_list_item": return `${recuo}1. ${t}`;
    case "to_do": return `${recuo}- [${d.checked ? "x" : " "}] ${t}`;
    case "toggle": return `${recuo}▸ ${t}`;
    case "quote": return `${recuo}> ${t}`;
    case "callout": return `${recuo}> ${d.icon?.emoji ? d.icon.emoji + " " : ""}${t}`;
    case "code": return `${recuo}\`\`\`${d.language || ""}\n${t}\n${recuo}\`\`\``;
    case "divider": return `${recuo}---`;
    case "child_page": return `${recuo}📄 subpágina: ${d.title || ""} (id ${b.id})`;
    case "child_database": return `${recuo}🗂 base: ${d.title || ""} (id ${b.id})`;
    case "table_row": return `${recuo}| ${(d.cells || []).map(textoRico).join(" | ")} |`;
    case "bookmark": case "embed": case "link_preview": return `${recuo}${d.url || ""}`;
    case "paragraph": return t ? `${recuo}${t}` : "";
    default: return t ? `${recuo}${t}` : "";
  }
}

class Notion {
  constructor(chave) {
    this.chave = chave;
  }

  /// Confere a chave. Devolve o nome do bot da integração.
  async testar() {
    const eu = await pedir(this.chave, "GET", "/users/me");
    return { nome: eu?.name || eu?.bot?.workspace_name || "integração" };
  }

  /// Páginas e bases cujo título casa com a consulta (vazia = as mais recentes).
  async buscar(consulta = "", maximo = 10) {
    const corpo = { page_size: maximo, sort: { direction: "descending", timestamp: "last_edited_time" } };
    if (String(consulta).trim()) corpo.query = String(consulta).trim();
    const r = await pedir(this.chave, "POST", "/search", corpo);
    return (r?.results || []).map((o) => ({
      id: o.id,
      tipo: o.object === "database" ? "base" : "página",
      titulo: tituloDe(o) || "(sem título)",
      editado: (o.last_edited_time || "").slice(0, 10),
      url: o.url || "",
    }));
  }

  async blocos(id, nivel, linhas, estado) {
    let cursor;
    do {
      const q = `?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r = await pedir(this.chave, "GET", `/blocks/${id}/children${q}`);
      for (const b of r?.results || []) {
        if (estado.blocos++ >= TETO_BLOCOS) {
          estado.cortado = true;
          return;
        }
        const linha = linhaDoBloco(b, nivel);
        if (linha) linhas.push(linha);
        // Subpágina e base não abrem aqui: viram uma linha com o id, e ela
        // abre se ele quiser. Abrir tudo em cascata estoura o texto.
        if (b.has_children && nivel < PROFUNDIDADE && !["child_page", "child_database"].includes(b.type)) {
          await this.blocos(b.id, nivel + 1, linhas, estado);
        }
      }
      cursor = r?.has_more ? r.next_cursor : null;
    } while (cursor);
  }

  /// Lê uma página (o texto inteiro) ou uma base (as linhas). `alvo` é id ou link.
  async ler(alvo) {
    const id = idDe(alvo);
    if (!id) throw new ErroNotion("isso não parece um id nem um link do Notion. Busque primeiro e use o id que vier.");
    let pagina;
    try {
      pagina = await pedir(this.chave, "GET", `/pages/${id}`);
    } catch (err) {
      // Id de BASE não é página: o Notion devolve 400/404 aqui. Tenta como base.
      if (err.status === 400 || err.status === 404) return this.lerBase(id, err);
      throw err;
    }
    const linhas = [];
    const estado = { blocos: 0, cortado: false };
    await this.blocos(id, 0, linhas, estado);
    return this.montar(tituloDe(pagina) || "(sem título)", pagina.url, linhas, estado.cortado);
  }

  async lerBase(id, erroDaPagina) {
    let base;
    try {
      base = await pedir(this.chave, "GET", `/databases/${id}`);
    } catch {
      throw erroDaPagina; // nem página nem base: o erro que explica é o primeiro
    }
    const r = await pedir(this.chave, "POST", `/databases/${id}/query`, { page_size: 50 });
    const linhas = (r?.results || []).map((linha) => {
      const props = Object.entries(linha.properties || {})
        .map(([nome, p]) => [nome, valorDe(p)])
        .filter(([, v]) => v !== "" && v != null);
      const titulo = props.find(([nome]) => linha.properties[nome]?.type === "title")?.[1] || "(sem título)";
      const resto = props.filter(([nome]) => linha.properties[nome]?.type !== "title").map(([n, v]) => `${n}: ${v}`);
      return `- **${titulo}**${resto.length ? ` — ${resto.join(" · ")}` : ""} (id ${linha.id})`;
    });
    return this.montar(tituloDe(base) || "(base sem título)", base.url, linhas, !!r?.has_more);
  }

  montar(titulo, url, linhas, cortado) {
    let texto = linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (texto.length > TETO_TEXTO) {
      texto = texto.slice(0, TETO_TEXTO).replace(/\s+\S*$/, "");
      cortado = true;
    }
    return { titulo, url: url || "", texto: texto || "(página vazia)", ...(cortado ? { cortado: "a página é maior; isto é o começo" } : {}) };
  }
}

module.exports = { Notion, ErroNotion, idDe, linhaDoBloco, valorDe, tituloDe, explicar, VERSAO, TETO_TEXTO };
