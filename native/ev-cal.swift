// ev-cal.swift — eventos no Calendário DE VERDADE deste Mac, via EventKit.
//
// Por que isto existe: ele pediu "põe no meu calendário" e a E.V.E chamou
// `create_reminder` — o lembrete interno dela, que mora num JSON e só ela vê.
// Ela respondeu "pronto" com toda a honestidade, porque de fato criou o que
// sabia criar. Mas o Calendário dele continuou vazio, e ele pediu de novo: dois
// lembretes iguais do mesmo casamento no log, 15:10 e 15:25.
//
// Então o buraco não era a E.V.E mentindo, era não existir calendário nenhum
// no app. EventKit é o jeito certo: é o mesmo banco que o Calendário.app usa,
// então o evento aparece no app, no iPhone e no iCloud, sem arquivo .ics no
// meio e sem AppleScript (que exige o Calendário.app aberto e é lento).
//
// Uso:  ev-cal criar --titulo T --inicio ISO [--fim ISO] [--dia-inteiro]
//                    [--local L] [--notas N] [--alarme MIN] [--calendario C]
//       ev-cal listar --de ISO --ate ISO
//       ev-cal calendarios
//       ev-cal apagar --id ID
// Sai:  JSON

import Foundation
import EventKit

// ---------------------------------------------------------------------------
// Saída: sempre JSON, inclusive no erro. Quem chama precisa do MOTIVO.
// ---------------------------------------------------------------------------
func imprimir(_ objeto: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: objeto, options: [.sortedKeys]),
          let s = String(data: d, encoding: .utf8) else {
        print("{\"erro\":\"não consegui montar a resposta\"}")
        return
    }
    print(s)
}

func morrer(_ mensagem: String, codigo: String? = nil) -> Never {
    var saida: [String: Any] = ["erro": mensagem]
    if let c = codigo { saida["codigo"] = c }
    imprimir(saida)
    exit(1)
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
let argumentos = Array(CommandLine.arguments.dropFirst())
guard let acao = argumentos.first, !acao.hasPrefix("--") else {
    morrer("falta a ação (criar, listar, calendarios, apagar)")
}

func opcao(_ nome: String) -> String? {
    guard let i = argumentos.firstIndex(of: "--\(nome)"), i + 1 < argumentos.count else { return nil }
    let valor = argumentos[i + 1]
    return valor.hasPrefix("--") ? nil : valor
}
func tem(_ nome: String) -> Bool { argumentos.contains("--\(nome)") }

/// Datas em ISO 8601 LOCAL, que é como a E.V.E escreve ("2026-05-02T09:00").
/// A hora é local de propósito: o contexto dela já traz a hora deste Mac, e
/// converter para UTC no caminho é como um compromisso das 9h vira das 6h.
func lerData(_ texto: String) -> Date? {
    let formatos = [
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd",
    ]
    for f in formatos {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = TimeZone.current
        fmt.dateFormat = f
        if let d = fmt.date(from: texto) { return d }
    }
    // Com fuso explícito (…Z ou …-03:00) também vale.
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime]
    return iso.date(from: texto)
}

func escrever(_ data: Date) -> String {
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = TimeZone.current
    fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
    return fmt.string(from: data)
}

// ---------------------------------------------------------------------------
// Permissão
// ---------------------------------------------------------------------------
// Do macOS 14 em diante o acesso é separado em leitura e escrita, e escrever
// exige acesso COMPLETO. Pedir o antigo `.requestAccess` num sistema novo
// devolve autorização que não serve para gravar, e o save falha depois — com
// uma mensagem que não ajuda ninguém. Então o pedido é o certo para a versão.
let store = EKEventStore()

func garantirPermissao() {
    let estado = EKEventStore.authorizationStatus(for: .event)
    if #available(macOS 14.0, *) {
        if estado == .fullAccess { return }
        if estado == .writeOnly && acao == "criar" { return }
    } else if estado == .authorized {
        return
    }

    if estado == .denied || estado == .restricted {
        morrer(
            "o acesso ao Calendário está negado. Abra Ajustes do Sistema › "
                + "Privacidade e Segurança › Calendários e ligue a E.V.E.",
            codigo: "sem_permissao"
        )
    }

    // Primeira vez: o macOS mostra a janela. O semáforo existe porque isto é
    // um programa de linha de comando — sem ele o processo termina antes da
    // resposta chegar.
    let espera = DispatchSemaphore(value: 0)
    var liberado = false
    var falha: Error?
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { ok, erro in
            liberado = ok; falha = erro; espera.signal()
        }
    } else {
        store.requestAccess(to: .event) { ok, erro in
            liberado = ok; falha = erro; espera.signal()
        }
    }
    // 60 s: o tempo é dele clicando na janela de permissão, não da máquina.
    if espera.wait(timeout: .now() + 60) == .timedOut {
        morrer("ninguém respondeu à janela de permissão do Calendário", codigo: "sem_resposta")
    }
    if !liberado {
        morrer(
            falha?.localizedDescription
                ?? "você não autorizou o acesso ao Calendário. Dá para ligar depois em "
                + "Ajustes do Sistema › Privacidade e Segurança › Calendários.",
            codigo: "sem_permissao"
        )
    }
}

/// O calendário onde gravar. Sem nome, o padrão do sistema — o mesmo que o
/// Calendário.app usa quando você cria um evento sem escolher nada.
/// Permissão do app LEMBRETES. É OUTRA permissão, não a do Calendário.
///
/// O EventKit serve as duas coisas pela mesma classe, e é fácil achar que uma
/// autorização cobre as duas — não cobre. São dois interruptores nos Ajustes
/// (Calendários e Lembretes), duas chaves no Info.plist, e do macOS 14 em
/// diante dois pedidos diferentes. Sem NSRemindersFullAccessUsageDescription o
/// sistema MATA o processo em vez de mostrar a janela, igual ao calendário.
func garantirPermissaoLembretes() {
    let estado = EKEventStore.authorizationStatus(for: .reminder)
    if #available(macOS 14.0, *) {
        if estado == .fullAccess { return }
    } else if estado == .authorized {
        return
    }

    if estado == .denied || estado == .restricted {
        morrer(
            "o acesso aos Lembretes está negado. Abra Ajustes do Sistema › "
                + "Privacidade e Segurança › Lembretes e ligue a E.V.E.",
            codigo: "sem_permissao_lembretes"
        )
    }

    let espera = DispatchSemaphore(value: 0)
    var liberado = false
    var falha: Error?
    if #available(macOS 14.0, *) {
        store.requestFullAccessToReminders { ok, erro in
            liberado = ok; falha = erro; espera.signal()
        }
    } else {
        store.requestAccess(to: .reminder) { ok, erro in
            liberado = ok; falha = erro; espera.signal()
        }
    }
    if espera.wait(timeout: .now() + 60) == .timedOut {
        morrer("ninguém respondeu à janela de permissão dos Lembretes", codigo: "sem_resposta")
    }
    if !liberado {
        morrer(
            "não recebi permissão para os Lembretes"
                + (falha != nil ? ": \(falha!.localizedDescription)" : ""),
            codigo: "sem_permissao_lembretes"
        )
    }
}

/// A lista onde o lembrete vai. Sem nome, a lista padrão do app Lembretes.
func listaDeLembretes(_ nome: String?) -> EKCalendar {
    let graváveis = store.calendars(for: .reminder).filter { $0.allowsContentModifications }
    if let nome = nome, !nome.isEmpty {
        let alvo = nome.lowercased()
        if let exato = graváveis.first(where: { $0.title.lowercased() == alvo }) { return exato }
        if let parecido = graváveis.first(where: { $0.title.lowercased().contains(alvo) }) {
            return parecido
        }
        morrer(
            "não encontrei uma lista de lembretes chamada \"\(nome)\". As que dá para escrever: "
                + graváveis.map { $0.title }.joined(separator: ", "),
            codigo: "sem_lista"
        )
    }
    // defaultCalendarForNewReminders() é MÉTODO, enquanto o de eventos
    // (defaultCalendarForNewEvents) é propriedade. Assimetria da própria API.
    if let padrao = store.defaultCalendarForNewReminders(), padrao.allowsContentModifications {
        return padrao
    }
    guard let primeira = graváveis.first else {
        morrer("não há nenhuma lista de lembretes onde eu possa escrever", codigo: "sem_lista")
    }
    return primeira
}

func descreverLembrete(_ r: EKReminder) -> [String: Any] {
    var d: [String: Any] = [
        "id": r.calendarItemIdentifier,
        "titulo": r.title ?? "(sem título)",
        "lista": r.calendar?.title ?? "",
        "concluido": r.isCompleted,
    ]
    if let c = r.dueDateComponents, let data = Calendar.current.date(from: c) {
        d["quando"] = escrever(data)
        // Sem hora o app Lembretes não notifica, só mostra o dia. Dizer isto de
        // volta evita ela prometer um aviso que não vai soar.
        d["tem_hora"] = c.hour != nil
    }
    if let n = r.notes, !n.isEmpty { d["notas"] = n }
    return d
}

func calendarioDeEscrita(_ nome: String?) -> EKCalendar {
    let graváveis = store.calendars(for: .event).filter { $0.allowsContentModifications }
    if let nome = nome, !nome.isEmpty {
        let alvo = nome.lowercased()
        if let exato = graváveis.first(where: { $0.title.lowercased() == alvo }) { return exato }
        if let parecido = graváveis.first(where: { $0.title.lowercased().contains(alvo) }) {
            return parecido
        }
        morrer(
            "não encontrei um calendário chamado \"\(nome)\". Os que dá para escrever: "
                + graváveis.map { $0.title }.joined(separator: ", "),
            codigo: "sem_calendario"
        )
    }
    if let padrao = store.defaultCalendarForNewEvents, padrao.allowsContentModifications {
        return padrao
    }
    guard let primeiro = graváveis.first else {
        morrer("não há nenhum calendário onde eu possa escrever neste Mac", codigo: "sem_calendario")
    }
    return primeiro
}

func descrever(_ e: EKEvent) -> [String: Any] {
    var d: [String: Any] = [
        "id": e.eventIdentifier ?? "",
        "titulo": e.title ?? "(sem título)",
        "calendario": e.calendar?.title ?? "",
        "dia_inteiro": e.isAllDay,
    ]
    if let i = e.startDate { d["inicio"] = escrever(i) }
    if let f = e.endDate { d["fim"] = escrever(f) }
    if let l = e.location, !l.isEmpty { d["local"] = l }
    if let n = e.notes, !n.isEmpty { d["notas"] = n }
    return d
}

/// Cria um lembrete no app Lembretes e CONFERE que ficou lá.
///
/// Usada por duas vias: pela ação "lembrete" e, de carona, pelo "criar" do
/// evento — porque o pedido dele foi que tudo o que entra na agenda apareça
/// também nos Lembretes, no Mac e no iPhone.
func criarLembrete(titulo: String, quando: Date?, comHora: Bool, notas: String?,
                   lista: String?, alarmeMinutos: Double?) -> [String: Any] {
    garantirPermissaoLembretes()

    let r = EKReminder(eventStore: store)
    r.title = titulo
    r.calendar = listaDeLembretes(lista)
    if let n = notas, !n.isEmpty { r.notes = n }

    if let quando = quando {
        // O app Lembretes guarda vencimento em DateComponents, não em Date. E
        // sem a hora ele não notifica: mostra o item no dia e fica calado. Por
        // isso a hora entra quando existe, e `tem_hora` volta na resposta para
        // ela não prometer um aviso que não vai soar.
        var campos: Set<Calendar.Component> = [.year, .month, .day]
        if comHora { campos.formUnion([.hour, .minute]) }
        r.dueDateComponents = Calendar.current.dateComponents(campos, from: quando)

        // Vencimento com hora já notifica, mas um alarme explícito é o que faz
        // o aviso chegar também no iPhone de forma confiável.
        if comHora {
            let desconto = (alarmeMinutos ?? 0) * 60
            r.addAlarm(EKAlarm(absoluteDate: quando.addingTimeInterval(-abs(desconto))))
        }
    }

    do {
        try store.save(r, commit: true)
    } catch {
        morrer("os Lembretes recusaram o item: \(error.localizedDescription)")
    }

    // Mesma desconfiança do evento: `save` sem erro não é prova.
    guard let gravado = store.calendarItem(withIdentifier: r.calendarItemIdentifier) as? EKReminder
    else {
        morrer("o lembrete foi aceito mas não apareceu no app Lembretes", codigo: "nao_confirmado")
    }
    return descreverLembrete(gravado)
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
switch acao {

case "calendarios":
    garantirPermissao()
    let todos = store.calendars(for: .event)
    let padrao = store.defaultCalendarForNewEvents?.calendarIdentifier
    imprimir([
        "calendarios": todos.map { c in
            [
                "nome": c.title,
                "gravavel": c.allowsContentModifications,
                "padrao": c.calendarIdentifier == padrao,
                "conta": c.source?.title ?? "",
            ] as [String: Any]
        }
    ])

case "criar":
    guard let titulo = opcao("titulo"), !titulo.trimmingCharacters(in: .whitespaces).isEmpty else {
        morrer("falta --titulo")
    }
    guard let inicioTexto = opcao("inicio") else { morrer("falta --inicio") }
    guard let inicio = lerData(inicioTexto) else {
        morrer("não entendi a data \"\(inicioTexto)\"; use 2026-05-02T09:00")
    }
    let diaInteiro = tem("dia-inteiro")

    var fim: Date
    if let fimTexto = opcao("fim") {
        guard let d = lerData(fimTexto) else {
            morrer("não entendi a data de fim \"\(fimTexto)\"; use 2026-05-02T11:00")
        }
        fim = d
    } else {
        // Sem fim declarado: uma hora, ou o dia todo quando é dia inteiro. Um
        // evento de duração zero o Calendário aceita e mostra torto.
        fim = inicio.addingTimeInterval(diaInteiro ? 86_400 : 3_600)
    }
    if fim <= inicio {
        morrer("o fim (\(escrever(fim))) não pode ser antes do começo (\(escrever(inicio)))")
    }

    garantirPermissao()

    let evento = EKEvent(eventStore: store)
    evento.title = titulo
    evento.startDate = inicio
    evento.endDate = fim
    evento.isAllDay = diaInteiro
    evento.calendar = calendarioDeEscrita(opcao("calendario"))
    if let l = opcao("local") { evento.location = l }
    if let n = opcao("notas") { evento.notes = n }
    if let minutos = opcao("alarme"), let m = Double(minutos) {
        // Negativo porque EventKit conta ANTES do começo.
        evento.addAlarm(EKAlarm(relativeOffset: -abs(m) * 60))
    }

    do {
        try store.save(evento, span: .thisEvent, commit: true)
    } catch {
        morrer("o Calendário recusou o evento: \(error.localizedDescription)")
    }

    // Lê de volta pelo identificador. Isto não é zelo: `save` sem erro não é
    // prova de que o evento ficou lá — num calendário de conta remota a
    // gravação pode ser desfeita depois. "Disse que fez" foi exatamente o
    // problema que trouxe este arquivo à existência, então aqui se confirma.
    guard let id = evento.eventIdentifier, let gravado = store.event(withIdentifier: id) else {
        morrer("o evento foi aceito mas não apareceu no Calendário", codigo: "nao_confirmado")
    }
    // ESPELHO NOS LEMBRETES. O pedido dele, em 01/11: "tudo aquilo que foi
    // colocado da minha agenda queria que fosse também adicionado no meu
    // aplicativo Lembretes". O evento já aparece no iPhone pelo iCloud; o
    // lembrete é o que dá a notificação e a caixinha de concluído.
    //
    // Falhar aqui NÃO desfaz o evento: ele está gravado e conferido, e perder
    // o compromisso por causa do espelho seria trocar um problema por um pior.
    // O que se faz é contar o que aconteceu — `lembrete` traz o item, ou
    // `lembrete_erro` traz o motivo, e ela diz isso a ele em uma frase.
    var saida: [String: Any] = ["criado": true, "evento": descrever(gravado)]
    if !tem("sem-lembrete") {
        let estado = EKEventStore.authorizationStatus(for: .reminder)
        let negado = estado == .denied || estado == .restricted
        if negado {
            saida["lembrete_erro"] = "o acesso aos Lembretes está negado "
                + "(Ajustes do Sistema › Privacidade e Segurança › Lembretes)"
        } else {
            saida["lembrete"] = criarLembrete(
                titulo: titulo,
                quando: inicio,
                // Evento de dia inteiro não tem hora para avisar, e lembrete
                // sem hora não notifica. Então para o dia inteiro a hora do
                // lembrete é a do início do evento (9h, pela criação dele).
                comHora: !diaInteiro,
                notas: opcao("notas"),
                lista: opcao("lista"),
                alarmeMinutos: opcao("alarme").flatMap(Double.init)
            )
        }
    }
    imprimir(saida)

case "listar":
    garantirPermissao()
    let agora = Date()
    let de = opcao("de").flatMap(lerData) ?? agora
    let ate = opcao("ate").flatMap(lerData) ?? Calendar.current.date(byAdding: .day, value: 7, to: de)!
    let predicado = store.predicateForEvents(withStart: de, end: ate, calendars: nil)
    let eventos = store.events(matching: predicado).sorted {
        ($0.startDate ?? .distantPast) < ($1.startDate ?? .distantPast)
    }
    imprimir([
        "de": escrever(de),
        "ate": escrever(ate),
        "total": eventos.count,
        "eventos": eventos.prefix(100).map(descrever),
    ])

case "apagar":
    guard let id = opcao("id") else { morrer("falta --id") }
    garantirPermissao()
    guard let evento = store.event(withIdentifier: id) else {
        morrer("não achei evento com esse id", codigo: "nao_encontrado")
    }
    let resumo = descrever(evento)
    do {
        try store.remove(evento, span: .thisEvent, commit: true)
    } catch {
        morrer("não consegui apagar: \(error.localizedDescription)")
    }
    // Mesmo cuidado do "criar", e pela mesma razão: `remove` sem erro não é
    // prova de que o evento saiu — num calendário de conta remota a remoção
    // pode ser recusada depois. E "disse que fez" é o defeito exato que já
    // apareceu duas vezes neste app, então aqui se confirma antes de dizer.
    if store.event(withIdentifier: id) != nil {
        morrer("o evento foi aceito para remoção mas continua no Calendário",
               codigo: "nao_confirmado")
    }
    imprimir(["apagado": true, "evento": resumo])

case "lembrete":
    guard let titulo = opcao("titulo"), !titulo.trimmingCharacters(in: .whitespaces).isEmpty else {
        morrer("falta --titulo")
    }
    var quandoLembrete: Date? = nil
    var comHora = false
    if let texto = opcao("quando") {
        guard let d = lerData(texto) else {
            morrer("não entendi a data \"\(texto)\"; use 2026-11-21T09:00")
        }
        quandoLembrete = d
        // "2026-11-21" sem hora é dia inteiro; com "T09:00" tem hora.
        comHora = texto.contains("T") || texto.contains(":")
    }
    imprimir([
        "criado": true,
        "lembrete": criarLembrete(
            titulo: titulo, quando: quandoLembrete, comHora: comHora,
            notas: opcao("notas"), lista: opcao("lista"),
            alarmeMinutos: opcao("alarme").flatMap(Double.init)
        ),
    ])

case "lembretes":
    garantirPermissaoLembretes()
    let listas = opcao("lista").map { [listaDeLembretes($0)] }
        ?? store.calendars(for: .reminder)
    let predicado = store.predicateForReminders(in: listas)
    // fetchReminders é assíncrono; o semáforo é o mesmo motivo da permissão.
    let espera = DispatchSemaphore(value: 0)
    var achados: [EKReminder] = []
    store.fetchReminders(matching: predicado) { r in
        achados = r ?? []
        espera.signal()
    }
    if espera.wait(timeout: .now() + 30) == .timedOut {
        morrer("os Lembretes não responderam a tempo", codigo: "sem_resposta")
    }
    let pendentes = achados.filter { !$0.isCompleted }.sorted {
        let a = $0.dueDateComponents.flatMap(Calendar.current.date(from:)) ?? .distantFuture
        let b = $1.dueDateComponents.flatMap(Calendar.current.date(from:)) ?? .distantFuture
        return a < b
    }
    imprimir([
        "total": pendentes.count,
        "lembretes": pendentes.prefix(100).map(descreverLembrete),
    ])

case "listas":
    garantirPermissaoLembretes()
    let todas = store.calendars(for: .reminder)
    let padraoLista = store.defaultCalendarForNewReminders()?.calendarIdentifier
    imprimir([
        "listas": todas.map { c in
            [
                "nome": c.title,
                "gravavel": c.allowsContentModifications,
                "padrao": c.calendarIdentifier == padraoLista,
                "conta": c.source?.title ?? "",
            ] as [String: Any]
        }
    ])

default:
    morrer("ação desconhecida \"\(acao)\" (criar, listar, calendarios, apagar)")
}
