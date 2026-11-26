// preload.js — ponte segura entre a interface e o processo principal.
// A interface não tem Node: tudo que ela pode fazer está listado aqui.

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("ev", {
  // --- ações ---
  mic: (acao) => ipcRenderer.invoke("ev:mic", acao), // "start" | "stop" | "toggle"
  type: (texto) => ipcRenderer.invoke("ev:type", texto),
  interrupt: () => ipcRenderer.invoke("ev:interrupt"),
  reset: () => ipcRenderer.invoke("ev:reset"),
  // --- conversas da barra lateral ---
  chats: () => ipcRenderer.invoke("ev:chats"),
  newChat: () => ipcRenderer.invoke("ev:chat-new"),
  openChat: (id) => ipcRenderer.invoke("ev:chat-open", id),
  renameChat: (id, titulo) => ipcRenderer.invoke("ev:chat-rename", { id, titulo }),
  saveKey: (chave) => ipcRenderer.invoke("ev:save-key", chave),
  saveReserves: (chaves) => ipcRenderer.invoke("ev:save-reserves", chaves),
  saveSearch: (chaves) => ipcRenderer.invoke("ev:save-search", chaves),
  attachData: (dados) => ipcRenderer.invoke("ev:attach-data", dados),
  debug: (msg) => ipcRenderer.invoke("ev:debug", msg),
  metricsNow: () => ipcRenderer.invoke("ev:metrics-now"),
  openExternal: (url) => ipcRenderer.invoke("ev:open-external", url),
  // Cartão de arquivo no chat: só abre o que ela mesma criou (ver main.js).
  openFile: (caminho) => ipcRenderer.invoke("ev:file-open", caminho),
  saveFileAs: (caminho) => ipcRenderer.invoke("ev:file-save-as", caminho),

  // --- configuração ---
  getConfig: () => ipcRenderer.invoke("ev:get-config"),
  setConfig: (mudancas) => ipcRenderer.invoke("ev:set-config", mudancas),

  // --- voz ---
  voices: () => ipcRenderer.invoke("ev:voices"),
  previewVoice: (opts) => ipcRenderer.invoke("ev:preview-voice", opts),
  setVoice: (opts) => ipcRenderer.invoke("ev:set-voice", opts),
  openVoiceSettings: () => ipcRenderer.invoke("ev:open-voice-settings"),
  elevenConnect: (chave) => ipcRenderer.invoke("ev:eleven-connect", chave),
  elevenPreview: (opts) => ipcRenderer.invoke("ev:eleven-preview", opts),
  setTts: (opts) => ipcRenderer.invoke("ev:set-tts", opts),

  // --- anexos ---
  // O caminho do arquivo arrastado não está mais em File.path (removido no
  // Electron 32); quem sabe dizer é o webUtils, daqui do preload.
  filePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  attachFile: (caminho) => ipcRenderer.invoke("ev:attach-file", caminho),
  chooseFile: () => ipcRenderer.invoke("ev:choose-file"),
  clearAttachment: () => ipcRenderer.invoke("ev:clear-attachment"),

  // --- lembretes ---
  reminders: () => ipcRenderer.invoke("ev:reminders"),
  cancelReminder: (id) => ipcRenderer.invoke("ev:cancel-reminder", id),

  // --- a rede neural (rede.js) ---
  rede: () => ipcRenderer.invoke("ev:rede"),

  // --- eventos vindos do processo principal ---
  on: (evento, handler) => {
    const canais = {
      state: "ev:state",
      level: "ev:level",
      heard: "ev:heard",
      message: "ev:message",
      history: "ev:history",
      tool: "ev:tool",
      error: "ev:error",
      notice: "ev:notice",
      setup: "ev:setup",
      config: "ev:config",
      metrics: "ev:metrics",
      agents: "ev:agents",
      mic: "ev:mic",
      attachment: "ev:attachment",
      arquivo: "ev:arquivo",
      escolhas: "ev:escolhas",
      chats: "ev:chats",
      rede: "ev:rede",
    };
    const canal = canais[evento];
    if (canal) ipcRenderer.on(canal, (_e, payload) => handler(payload));
  },
});
