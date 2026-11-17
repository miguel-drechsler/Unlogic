/*
 * menus.js — Tela de início (placa + painel do elevador) e menu de pausa
 *
 * Só cuida do DOM. Toda decisão de jogo volta para jogo3d.js pelos callbacks:
 *   jogar()  escolherAndar(i)  continuar()  reiniciar()  sairParaMenu()  mudarOpcao(nome, valor)
 *
 * As opções são sliders (sensibilidade, volume) e caixas (som, modo estudo).
 *
 * Cada tela tem "vistas" trocáveis ([data-vistas] > .vista[data-vista]):
 *   início: andar (padrão) · ajuda · opcoes        pausa: acoes (padrão) · opcoes · controles
 * As opções e a lista de controles são geradas aqui uma vez e aparecem nas duas telas.
 */
const Menus = (() => {
  const $ = (id) => document.getElementById(id);
  const VISTA_PADRAO = { telaInicio: "andar", telaPausa: "acoes" };

  const CONTROLES = [
    [["W", "A", "S", "D"], "andar"],
    [["Mouse"], "olhar"],
    [["Shift"], "correr (gasta fôlego)"],
    [["E"], "virar alavanca ou usar o terminal (o clique também serve)"],
    [["Tab"], "abrir o tablet com as portas encontradas"],
    [["H"], "tabela dos conectivos no tablet"],
    [["R"], "reiniciar o andar na hora"],
    [["M"], "minimapa: local (gira com você), completo ou oculto"],
    [["K"], "ligar ou desligar o som"],
    [["F"], "tela cheia"],
    [["P"], "pausar sem sair da tela cheia (Esc também pausa)"],
  ];

  const FORMATO = {
    sensibilidade: (v) => `${v.toFixed(1).replace(".", ",")}×`,
    volume: (v) => `${Math.round(v * 100)}%`,
  };

  let cb = {};
  let opcoes = {};
  let selecionado = 0;
  let confirmando = null; // botão destrutivo esperando o segundo clique

  // ---------- Montagem ----------
  function htmlControles() {
    return `<dl class="teclado">${CONTROLES.map(([teclas, oQue]) =>
      `<dt>${teclas.map((t) => `<kbd>${t}</kbd>`).join("")}</dt><dd>${oQue}</dd>`).join("")}</dl>`;
  }

  function htmlOpcoes() {
    return `
      <label class="opcao"><span>Sensibilidade do mouse</span>
        <input type="range" data-opcao="sensibilidade" min="0.3" max="2.5" step="0.1">
        <output data-saida="sensibilidade"></output></label>
      <label class="opcao"><span>Volume</span>
        <input type="range" data-opcao="volume" min="0" max="1" step="0.05">
        <output data-saida="volume"></output></label>
      <label class="opcao-caixa"><input type="checkbox" data-opcao="telaCheia">
        <span>Tela cheia<small>Atalho: tecla F. Esc e P pausam sem sair dela.</small></span></label>
      <label class="opcao-caixa"><input type="checkbox" data-opcao="som">
        <span>Som ligado<small>Atalho em jogo: tecla K.</small></span></label>
      <label class="opcao-caixa"><input type="checkbox" data-opcao="modoEstudo">
        <span>Modo estudo<small>Sem a criatura, para estudar ou apresentar com calma. Não conta recorde.</small></span></label>`;
  }

  function mostrarOpcoes() {
    document.querySelectorAll("[data-opcao]").forEach((el) => {
      if (el.type === "checkbox") el.checked = !!opcoes[el.dataset.opcao];
      else el.value = opcoes[el.dataset.opcao];
    });
    document.querySelectorAll("[data-saida]").forEach((el) => { el.textContent = FORMATO[el.dataset.saida](opcoes[el.dataset.saida]); });
  }

  // O painel do elevador: −1 no alto, o andar mais fundo embaixo, como num elevador de verdade.
  function montarElevador() {
    $("botoesAndar").innerHTML = FASES.map((f, i) => `
      <div class="linha-andar">
        <button class="botao-andar" data-andar="${i}" style="--i:${i}" aria-pressed="false"
          aria-label="Andar −${i + 1}: ${f.titulo}">−${i + 1}</button>
        <span class="placa-andar" data-placa="${i}"></span>
      </div>`).join("");
  }

  function configurar(callbacks, opcoesIniciais) {
    cb = callbacks;
    opcoes = opcoesIniciais;
    document.querySelectorAll("[data-opcoes]").forEach((el) => { el.innerHTML = htmlOpcoes(); });
    document.querySelectorAll("[data-controles]").forEach((el) => { el.innerHTML = htmlControles(); });
    montarElevador();
    mostrarOpcoes();

    document.addEventListener("input", (ev) => {
      const nome = ev.target.dataset && ev.target.dataset.opcao;
      if (!nome) return;
      opcoes[nome] = ev.target.type === "checkbox" ? ev.target.checked : Number(ev.target.value);
      mostrarOpcoes(); // mantém as duas cópias (início e pausa) iguais
      cb.mudarOpcao(nome, opcoes[nome]);
    });

    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-andar], [data-abrir], [data-voltar], [data-acao]");
      if (!el) return;
      const tela = el.closest(".tela");
      if (el.dataset.andar !== undefined) return cb.escolherAndar(Number(el.dataset.andar));
      if (el.dataset.abrir) {
        const atual = tela.querySelector("[data-vistas]").dataset.atual;
        return vista(tela, atual === el.dataset.abrir ? VISTA_PADRAO[tela.id] : el.dataset.abrir);
      }
      if (el.hasAttribute("data-voltar")) return vista(tela, VISTA_PADRAO[tela.id]);
      acao(el);
    });
  }

  function acao(el) {
    switch (el.dataset.acao) {
      case "jogar": return cb.jogar();
      case "continuar": return cb.continuar();
      case "reiniciar": return confirmar(el, `Confirmar: reiniciar o andar −${selecionado + 1}`, cb.reiniciar);
      case "menu": return confirmar(el, "Confirmar: sair e perder este andar", cb.sairParaMenu);
    }
  }

  // Ações que jogam progresso fora pedem um segundo clique (o rótulo diz o que vai acontecer).
  function confirmar(botao, texto, fazer) {
    if (confirmando === botao) { desfazerConfirmacao(); return fazer(); }
    desfazerConfirmacao();
    confirmando = botao;
    botao.dataset.rotulo = botao.textContent;
    botao.textContent = texto;
    botao.classList.add("confirmar");
    botao.relogio = setTimeout(desfazerConfirmacao, 4000);
  }

  function desfazerConfirmacao() {
    if (!confirmando) return;
    clearTimeout(confirmando.relogio);
    confirmando.textContent = confirmando.dataset.rotulo;
    confirmando.classList.remove("confirmar");
    confirmando = null;
  }

  // Troca a vista visível de uma tela e põe o foco no primeiro controle dela.
  function vista(tela, nome) {
    desfazerConfirmacao();
    const caixa = tela.querySelector("[data-vistas]");
    caixa.dataset.atual = nome;
    caixa.querySelectorAll(":scope > .vista").forEach((v) => { v.hidden = v.dataset.vista !== nome; });
    tela.querySelectorAll("[data-abrir]").forEach((b) => b.setAttribute("aria-expanded", String(b.dataset.abrir === nome)));
    const foco = caixa.querySelector(`.vista[data-vista="${nome}"]`).querySelector("button, input");
    if (foco) foco.focus({ preventScroll: true });
  }

  // ---------- Tela de início ----------
  function andares(indice, melhores) {
    selecionado = indice;
    const f = FASES[indice];
    $("visor").textContent = `−${indice + 1}`;
    document.querySelectorAll("[data-andar]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.andar) === indice)));
    document.querySelectorAll("[data-placa]").forEach((p) => {
      const pts = melhores[Number(p.dataset.placa)];
      p.textContent = pts !== null ? `${pts} pts` : "";
    });

    $("andarNumero").textContent = `Andar −${indice + 1} de −${FASES.length}`;
    $("andarTitulo").textContent = f.titulo;
    $("andarConceito").textContent = f.conceito;
    const ficha = [
      ["Alavancas", Object.keys(f.alavancas).length],
      ["Portas", f.portas.length],
      ["Energia", f.energia],
      ["Recorde", melhores[indice] !== null ? `${melhores[indice]} pts` : "nenhum"],
    ];
    $("andarFicha").innerHTML = ficha.map(([nome, valor]) => `<div><dt>${nome}</dt><dd>${valor}</dd></div>`).join("");
    $("btnDescer").textContent = `Descer ao andar −${indice + 1}`;

    const vencidos = melhores.filter((p) => p !== null).length;
    const total = melhores.reduce((s, p) => s + (p || 0), 0);
    $("progresso").textContent = vencidos
      ? `${vencidos} de ${FASES.length} andares vencidos, ${total} pontos`
      : `${FASES.length} andares abaixo de você`;
  }

  function inicio(mostrar) {
    $("telaInicio").hidden = !mostrar;
    if (mostrar) vista($("telaInicio"), "andar");
  }

  // ---------- Pausa ----------
  function relogio(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function pausa(mostrar, { e, motivo } = {}) {
    $("telaPausa").hidden = !mostrar;
    if (!mostrar) return desfazerConfirmacao();
    selecionado = e.indice;
    $("pausaAndar").textContent = `Andar −${e.indice + 1}: ${e.fase.titulo}`;
    $("pausaMotivo").hidden = !motivo;
    $("pausaMotivo").textContent = motivo || "";

    let pips = "";
    for (let i = 0; i < e.fase.energia; i++) pips += `<i class="${i < e.energia ? "cheio" : ""}"></i>`;
    const abertas = e.portas.filter((_, i) => Estado.portaResolvida(e, i)).length;
    $("pausaStatus").innerHTML = [
      ["Energia", `<span class="pips" aria-label="${e.energia} de ${e.fase.energia}">${pips}</span>`],
      ["Portas abertas", `${abertas} de ${e.portas.length}`],
      ["Alavancas encontradas", `${e.alavancasVistas.size} de ${Object.keys(e.valores).length}`],
      ["Tempo no andar", relogio(e.tempo)],
    ].map(([nome, valor]) => `<div><dt>${nome}</dt><dd>${valor}</dd></div>`).join("");

    vista($("telaPausa"), "acoes");
  }

  // ---------- Teclado fora do jogo ----------
  // Devolve true se a tecla foi usada aqui.
  function tecla(ev, modo) {
    if (ev.target && ev.target.type === "range") return false; // as setas pertencem ao slider
    const tela = modo === "menu" ? $("telaInicio") : $("telaPausa");
    if (tela.hidden) return false;
    const caixa = tela.querySelector("[data-vistas]");
    if (ev.code === "Escape" && caixa.dataset.atual !== VISTA_PADRAO[tela.id]) {
      vista(tela, VISTA_PADRAO[tela.id]);
      return true;
    }
    if (modo === "menu" && (ev.code === "ArrowUp" || ev.code === "ArrowDown")) {
      ev.preventDefault();
      const i = Math.max(0, Math.min(FASES.length - 1, selecionado + (ev.code === "ArrowDown" ? 1 : -1)));
      if (i !== selecionado) cb.escolherAndar(i);
      return true;
    }
    if (modo === "pausado" && ev.code === "KeyP" && !ev.repeat) { cb.continuar(); return true; }
    return false;
  }

  // Para quando uma opção muda por fora do menu (ex.: tecla K muta o som).
  const sincronizarOpcoes = () => mostrarOpcoes();

  return { configurar, andares, inicio, pausa, tecla, sincronizarOpcoes };
})();
