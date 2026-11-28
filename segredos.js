// segredos.js — chave colada no chat não sai do Mac.
//
// 27/11/2026, 22:51: ele colou a chave do Notion no chat ("ntn_… pode
// testar"). Ela foi parar em quatro lugares onde não devia: numa busca na web
// (a chave dentro da query, mandada ao Google e ao Tavily), em catorze `curl`
// pelo terminal, no eve.log e na nota da conversa no cofre do Obsidian. A
// chave certa mora em Ajustes › Conexões, que grava em Application Support.
//
// Só padrões de chave com prefixo conhecido: id de página do Notion (32
// hexadecimais) e hash de commit NÃO são segredo, e esconder isso quebraria
// trabalho legítimo.

"use strict";

const PADROES = [
  /\bntn_[A-Za-z0-9]{20,}/g, // Notion (integração interna, novo)
  /\bsecret_[A-Za-z0-9]{20,}/g, // Notion (antigo)
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, // Anthropic, OpenAI
  /\bsk_[A-Za-z0-9]{30,}/g, // ElevenLabs
  /\bgsk_[A-Za-z0-9]{20,}/g, // Groq
  /\bnvapi-[A-Za-z0-9_-]{20,}/g, // NVIDIA
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google
  /\btvly-[A-Za-z0-9_-]{16,}/g, // Tavily
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bsk-or-v1-[a-f0-9]{30,}/g, // OpenRouter
];

const MARCA = "[chave escondida]";

function temSegredo(texto) {
  const t = String(texto ?? "");
  return PADROES.some((r) => {
    r.lastIndex = 0;
    return r.test(t);
  });
}

/// O texto com cada chave trocada pela marca.
function redigir(texto) {
  let t = String(texto ?? "");
  for (const r of PADROES) t = t.replace(r, MARCA);
  return t;
}

/// Qual serviço a chave parece ser, para dizer a ele onde colar.
function servicoDe(texto) {
  const t = String(texto ?? "");
  if (/\b(?:ntn_|secret_)[A-Za-z0-9]{20,}/.test(t)) return "Notion";
  if (/\bgsk_/.test(t)) return "Groq";
  if (/\bnvapi-/.test(t)) return "NVIDIA";
  if (/\bAIza/.test(t)) return "Google";
  if (/\btvly-/.test(t)) return "Tavily";
  if (/\bsk_[A-Za-z0-9]{30,}/.test(t)) return "ElevenLabs";
  return null;
}

module.exports = { temSegredo, redigir, servicoDe, MARCA };
