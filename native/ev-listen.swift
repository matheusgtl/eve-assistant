// ev-listen.swift — Motor de escuta nativo da E.V.E.
//
// Usa SFSpeechRecognizer (pt-BR, reconhecimento no próprio dispositivo, sem internet)
// e AVAudioEngine para captar o microfone.
//
// Protocolo: lê comandos por stdin (START / STOP / QUIT) e escreve eventos JSON por stdout,
// uma linha por evento: {"type":"listening"} {"type":"partial","text":...} {"type":"final","text":...}
// {"type":"level","value":0..1} — volume da voz, para a esfera reagir enquanto você fala.

import Foundation
import Speech
import AVFoundation

func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

final class Listener {
    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "pt-BR"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var lastText = ""
    private var running = false

    // Medição de volume: só a thread de áudio toca nestes.
    private var tapCount = 0
    private let emitQueue = DispatchQueue(label: "ev.emit")

    // Reconhecimento local x servidor da Apple (usado só se o local falhar).
    fileprivate var useOnDevice = true
    fileprivate var didFallback = false

    /// Marcado no instante em que pedimos para parar. O `task.cancel()` faz o
    /// reconhecedor devolver um erro de cancelamento (216) mesmo quando a
    /// transcrição deu certo — sem esta flag, isso virava um erro falso na tela.
    private var cancelling = false

    // Tempo de silêncio antes de encerrar automaticamente a fala.
    // Configuráveis pelo Electron (comando TIMEOUT), porque "quanto tempo de
    // pausa ainda é a mesma frase" é preferência de quem fala, não constante.
    fileprivate var firstWordTimeout = 10.0
    fileprivate var silenceTimeout = 2.5

    /// Último instante em que ouvimos som acima do ruído de fundo.
    /// O cronômetro de silêncio antes só era renovado quando o reconhecedor
    /// mandava um resultado parcial — e ele atrasa. Resultado: a escuta
    /// fechava no meio de uma frase. Agora quem manda é o microfone.
    private var ultimoSom = Date()
    private var inicioSessao = Date()
    private let limiarSom: Float = 0.12
    private let duracaoMaxima = 90.0

    func start() {
        guard !running else { return }
        guard let recognizer = recognizer, recognizer.isAvailable else {
            emit(["type": "error", "message": "Reconhecimento em português indisponível."])
            return
        }

        running = true
        cancelling = false
        lastText = ""
        ultimoSom = Date()
        inicioSessao = Date()

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = useOnDevice && recognizer.supportsOnDeviceRecognition
        request = req
        emit(["type": "engine", "onDevice": req.requiresOnDeviceRecognition])

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            self.request?.append(buffer)
            self.reportLevel(buffer)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            emit(["type": "error", "message": "Microfone: \(error.localizedDescription)"])
            running = false
            return
        }

        emit(["type": "listening"])

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                if !text.isEmpty {
                    self.lastText = text
                    emit(["type": "partial", "text": text])
                    self.armSilenceTimer(self.silenceTimeout)
                }
                if result.isFinal { self.stop() }
            }
            if let error = error {
                // Erro que chega por causa do nosso próprio cancelamento: ignorar.
                if self.cancelling || !self.running { return }

                // Fora isso, reportar: antes o erro era engolido e a escuta
                // simplesmente morria em silêncio.
                let ns = error as NSError
                emit([
                    "type": "recog-error",
                    "domain": ns.domain,
                    "code": ns.code,
                    "message": ns.localizedDescription,
                    "onDevice": self.useOnDevice,
                ])

                // Se o reconhecimento local falhar sem ter ouvido nada, tenta uma vez
                // pelo servidor da Apple (precisa de internet, mas destrava o uso).
                if self.useOnDevice && self.lastText.isEmpty && !self.didFallback {
                    self.didFallback = true
                    self.useOnDevice = false
                    self.stop(silent: true)
                    emit(["type": "notice", "message": "Reconhecimento local falhou; tentando pelo servidor da Apple."])
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.start() }
                    return
                }
                self.stop()
            }
        }

        armSilenceTimer(firstWordTimeout)
    }

    /// Calcula o volume (RMS → dB → 0…1) do trecho de áudio e emite ~20×/s.
    /// Roda na thread de áudio, então o cálculo é barato e a escrita vai para outra fila.
    private func reportLevel(_ buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0] else { return }
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return }

        tapCount += 1
        guard tapCount % 2 == 0 else { return } // ~1 emissão a cada 46 ms

        var sum: Float = 0
        for i in stride(from: 0, to: frames, by: 2) {
            let sample = channel[i]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float((frames + 1) / 2))
        let db = 20 * log10(max(rms, 1e-7))

        // Fala normal fica entre -50 dB (silêncio) e -12 dB (voz alta).
        let level = max(0, min(1, (db + 50) / 38))

        // Enquanto houver voz, a frase não acabou.
        if level > limiarSom { ultimoSom = Date() }

        emitQueue.async {
            emit(["type": "level", "value": Double(level)])
        }
    }

    private func armSilenceTimer(_ delay: TimeInterval) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.silenceTimer?.invalidate()
            self.silenceTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { _ in
                guard self.running else { return }

                // Limite duro: uma sessão não fica aberta para sempre por causa
                // de ruído de fundo constante.
                if Date().timeIntervalSince(self.inicioSessao) > self.duracaoMaxima {
                    self.stop()
                    return
                }

                // Ainda está falando: o cronômetro recomeça do silêncio real.
                let desdeOSom = Date().timeIntervalSince(self.ultimoSom)
                if desdeOSom < self.silenceTimeout {
                    self.armSilenceTimer(self.silenceTimeout - desdeOSom)
                    return
                }
                self.stop()
            }
        }
    }

    /// `silent: true` desmonta o áudio sem emitir "final" — usado ao trocar de motor.
    func stop(silent: Bool = false) {
        cancelling = true
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.running else { return }
            self.running = false

            self.silenceTimer?.invalidate()
            self.silenceTimer = nil

            self.engine.stop()
            self.engine.inputNode.removeTap(onBus: 0)
            self.request?.endAudio()
            self.task?.cancel()
            self.request = nil
            self.task = nil

            if !silent { emit(["type": "final", "text": self.lastText]) }
        }
    }
}

let listener = Listener()

/// Estado das permissões. Um START que chegue antes da autorização terminar
/// fica guardado e é executado assim que ela sai — sem isso, o primeiro
/// "espaço" do usuário se perderia silenciosamente.
final class Gate {
    private let queue = DispatchQueue(label: "ev.gate")
    private var authorized = false
    private var pendingStart = false

    func requestStart() {
        queue.async {
            if self.authorized {
                listener.start()
            } else {
                self.pendingStart = true
                emit(["type": "waiting-permission"])
            }
        }
    }

    func grant() {
        queue.async {
            self.authorized = true
            emit(["type": "ready"])
            if self.pendingStart {
                self.pendingStart = false
                listener.start()
            }
        }
    }

    func deny(_ message: String) {
        queue.async {
            self.authorized = false
            self.pendingStart = false
            emit(["type": "error", "message": message])
        }
    }
}

let gate = Gate()

// Pede as permissões de fala e microfone uma única vez, na inicialização.
SFSpeechRecognizer.requestAuthorization { status in
    switch status {
    case .authorized:
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if granted {
                gate.grant()
            } else {
                gate.deny("Permissão de microfone negada. Ative em Ajustes › Privacidade e Segurança › Microfone.")
            }
        }
    case .denied, .restricted:
        gate.deny("Permissão de reconhecimento de fala negada. Ative em Ajustes › Privacidade e Segurança › Reconhecimento de Fala.")
    default:
        gate.deny("Permissão de fala não concedida.")
    }
}

// Lê comandos do processo pai (Electron) numa thread separada.
DispatchQueue.global().async {
    while let line = readLine(strippingNewline: true) {
        switch line.trimmingCharacters(in: .whitespaces) {
        case "START": gate.requestStart()
        case "STOP":  listener.stop()
        case "PING":  emit(["type": "pong"])   // diagnóstico: confirma que os comandos chegam
        case "QUIT":  exit(0)
        default:
            // TIMEOUT <silêncio> <primeira palavra>, em segundos.
            let partes = line.split(separator: " ")
            if partes.count >= 2, partes[0] == "TIMEOUT" {
                if let silencio = Double(partes[1]) {
                    listener.silenceTimeout = max(0.8, min(8.0, silencio))
                }
                if partes.count >= 3, let primeira = Double(partes[2]) {
                    listener.firstWordTimeout = max(3.0, min(30.0, primeira))
                }
                emit(["type": "timeout", "silence": listener.silenceTimeout,
                      "firstWord": listener.firstWordTimeout])
            }
        }
    }
    exit(0)
}

RunLoop.main.run()
