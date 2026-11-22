/*
 * hud.js — Interface sobreposta ao 3D: bateria, alavancas catalogadas, avisos e o Tablet
 *
 * O Tablet (TAB) substitui a antiga tela estática: mostra as instruções do andar,
 * as portas já encontradas com a fórmula substituída pelos valores conhecidos e,
 * apertando o número da porta, a tabela-verdade (custa pontos, como no jogo 2D).
 * O jogador só vê o que já DESCOBRIU no labirinto: o resto aparece como "?".
 */
const Hud = (() => {
  const $ = (id) => document.getElementById(id);
  const VF = (b) => (b ? "V" : "F");
  const cls = (b) => (b ? "v" : "f");
  let relogioAviso = null;

  // ---------- Barra fixa ----------
  function barra(e, modoEstudo = false) {
    const resolvidas = e.portas.filter((_, i) => Estado.portaResolvida(e, i)).length;
    $("andar").textContent = `ANDAR ${nomeDoAndar(e.indice)} · ${e.fase.titulo}` +
      ` · PORTAS ${resolvidas}/${e.portas.length}` + (modoEstudo ? " · ESTUDO" : "");
    let pips = "";
    for (let i = 0; i < e.fase.energia; i++) pips += `<span class="pip${i < e.energia ? " cheio" : ""}"></span>`;
    $("bateria").innerHTML = pips;
    $("bateria").classList.toggle("vazia", e.energia === 0);
    $("energiaNum").textContent = `${e.energia}/${e.fase.energia}`;

    $("chips").innerHTML = Object.keys(e.valores).map((n) => {
      if (!e.alavancasVistas.has(n)) return `<span class="chip oculto">${n} ?</span>`;
      const presa = e.fase.presas.includes(n);
      return `<span class="chip ${cls(e.valores[n])}${presa ? " presa" : ""}">${n} ${VF(e.valores[n])}${presa ? " ▣" : ""}</span>`;
    }).join("");
  }

  // ---------- Avisos com fila ----------
  // Vários avisos podem chegar no mesmo quadro (ex.: "ELEVADOR LIBERADO" e logo depois
  // "Porta 3 catalogada"). Sem fila, o segundo apagava o primeiro antes de ser lido.
  // tipo: "" (informativo), "bom" ou "ruim" (importantes).
  const DURACAO = 4200;   // ms que o último aviso fica na tela
  const MINIMO = 1600;    // ms mínimos antes de dar lugar ao próximo da fila
  const FILA_MAX = 3;
  const fila = [];
  let atual = null;       // { texto, tipo, desde }

  /*
   * O aviso `novo` pode tomar o lugar do `atual` agora, ou deve esperar na fila?
   *   atual, novo : { texto, tipo }  — tipo "" é informativo; "bom"/"ruim" são importantes
   *   passou      : ms desde que `atual` apareceu
   * Devolva true para interromper já, false para enfileirar.
   *
   * Política: enfileirar é barato (a fila troca de aviso a cada MINIMO ms), então só
   * interrompe na hora quando um aviso IMPORTANTE chega sobre um INFORMATIVO.
   *   - informativo nunca apaga importante ("A criatura te pegou" não some sob
   *     "Porta 7 catalogada", que chega no quadro seguinte ao renascer);
   *   - importante sobre importante espera o MINIMO, para dar tempo de ler o primeiro;
   *   - informativo sobre informativo também espera: catalogar duas coisas no mesmo
   *     passo mostra as duas, uma depois da outra.
   * `passou` é usado só pelo caso importante-sobre-importante.
   */
  function deveInterromper(atual, novo, passou) {
    if (!atual.tipo) return !!novo.tipo;          // atual informativo: só o importante fura
    return !!novo.tipo && passou >= MINIMO;      // atual importante: só outro, e já lido
  }

  function mostrarAviso(a) {
    const el = $("aviso");
    atual = { ...a, desde: performance.now() };
    el.textContent = a.texto;
    el.className = "mostrar " + a.tipo;
    agendarAviso();
  }

  function agendarAviso() {
    clearTimeout(relogioAviso);
    const passou = performance.now() - atual.desde;
    relogioAviso = setTimeout(proximoAviso, Math.max(0, (fila.length ? MINIMO : DURACAO) - passou));
  }

  function proximoAviso() {
    if (fila.length) return mostrarAviso(fila.shift());
    atual = null;
    $("aviso").className = "";
  }

  // chave (opcional): avisos de alternância ("minimapa", "som"...). Um aviso novo com a
  // mesma chave substitui o anterior, na tela ou na fila: apertar M três vezes mostra só
  // o modo final, em vez de enfileirar três mensagens que já ficaram velhas.
  function aviso(texto, tipo = "", chave = null) {
    const novo = { texto, tipo, chave };
    if (chave) {
      const k = fila.findIndex((a) => a.chave === chave);
      if (k >= 0) fila.splice(k, 1);
      if (atual && atual.chave === chave) return mostrarAviso(novo);
    }
    if (!atual || deveInterromper(atual, novo, performance.now() - atual.desde)) return mostrarAviso(novo);
    if (fila.some((a) => a.texto === texto)) return; // repetido: não enfileira de novo
    fila.push(novo);
    if (fila.length > FILA_MAX) { // fila cheia: descarta o informativo mais velho (ou o mais velho de todos)
      const k = fila.findIndex((a) => !a.tipo);
      fila.splice(k >= 0 ? k : 0, 1);
    }
    agendarAviso();
  }

  function limparAvisos() {
    fila.length = 0;
    atual = null;
    clearTimeout(relogioAviso);
    $("aviso").textContent = "";
    $("aviso").className = "";
  }

  // Mira e fôlego são atualizados a cada quadro: só tocam no DOM quando o valor muda.
  // `ativa`: a mira cresce e fica verde (há algo para apertar). Portas só informam.
  let ultimaDica = null, ultimoFolego = -1;
  function dica(texto, ativa = !!texto) {
    texto = texto || "";
    const chave = texto + (ativa ? "\u0001" : "");
    if (chave === ultimaDica) return;
    ultimaDica = chave;
    $("dica").textContent = texto;
    $("mira").classList.toggle("ativa", ativa);
  }

  function folego(f) {
    const pct = Math.round(f * 100);
    if (pct === ultimoFolego) return;
    ultimoFolego = pct;
    $("folegoNivel").style.width = `${pct}%`;
    $("folego").classList.toggle("baixo", f < 0.3);
  }
  const perigo = (p) => { $("perigo").style.opacity = p.toFixed(2); };

  // ---------- Tablet ----------
  // Fórmula com os valores das alavancas já vistas; as desconhecidas viram "?".
  function substituida(e, i) {
    const { arvore } = e.portas[i];
    const texto = Logica.paraTexto(arvore, (n) =>
      e.alavancasVistas.has(n) ? `<b class="${cls(e.valores[n])}">${VF(e.valores[n])}</b>` : `<b class="oculto">?</b>`);
    const completa = Logica.variaveis(arvore).every((n) => e.alavancasVistas.has(n));
    const valor = Estado.portaAberta(e, i);
    return `${texto} = ${completa ? `<b class="${cls(valor)}">${VF(valor)}</b>` : `<b class="oculto">?</b>`}`;
  }

  function listaDePortas(e) {
    return e.portas.map((p, i) => {
      if (!e.portasVistas.has(i)) return `<li class="oculto"><span class="num">${i + 1}</span> porta não encontrada</li>`;
      const s = Estado.situacaoPorta(e, i);
      return `<li class="${s}"><span class="num">${i + 1}</span>
        <span class="formula">${Logica.paraTexto(p.arvore)}</span>
        <span class="selo">${s.toUpperCase()}</span>
        <span class="sub">${s === "selada" ? "contradição: nunca abre" : substituida(e, i)}</span></li>`;
    }).join("");
  }

  // Mostra a avaliação da fórmula "de dentro para fora", usando os valores das
  // alavancas já encontradas. É a mesma ideia da tabela-verdade, mas aplicada
  // à valoração atual: o jogador vê a semântica composicional acontecendo.
  function avaliacaoAtual(e, i) {
    const { arvore } = e.portas[i];
    const passos = Logica.subformulas(arvore)
      .filter((no) => no.op !== "var")
      .filter((no) => Logica.variaveis(no).every((n) => e.alavancasVistas.has(n)))
      .map((no) => {
        const valor = Logica.avaliar(no, e.valores);
        const texto = Logica.paraTexto(no, (n) => `<b class="${cls(e.valores[n])}">${VF(e.valores[n])}</b>`);
        return `<li><span class="formula">${texto}</span> = <b class="${cls(valor)}">${VF(valor)}</b></li>`;
      });
    if (!passos.length) return "";
    return `<p class="rotulo">AVALIAÇÃO ATUAL · de dentro para fora</p><ul class="passos">${passos.join("")}</ul>`;
  }

  function tabela(e, i) {
    const { arvore } = e.portas[i];
    const { vars, linhas } = Logica.tabelaVerdade(arvore);
    const sei = vars.every((n) => e.alavancasVistas.has(n));
    let html = `<h3>Tabela-verdade — Porta ${i + 1}</h3><p class="formula grande">${Logica.paraTexto(arvore)}</p>
      <table><thead><tr>${vars.map((v) => `<th>${v}</th>`).join("")}<th>Fórmula</th></tr></thead><tbody>`;
    linhas.forEach((l) => {
      const atual = sei && vars.every((v) => l.valores[v] === e.valores[v]);
      html += `<tr class="${atual ? "atual" : ""}">` +
        vars.map((v) => `<td class="${cls(l.valores[v])}">${VF(l.valores[v])}</td>`).join("") +
        `<td class="${cls(l.resultado)}">${VF(l.resultado)}</td></tr>`;
    });
    return html + `</tbody></table><p class="nota">${sei
      ? "A linha destacada é a situação atual das alavancas."
      : "Encontre todas as alavancas desta fórmula para ver a linha atual."}</p>
      ${avaliacaoAtual(e, i)}
      <p class="teclas">[0] voltar · [1-${e.portas.length}] outra porta · [H] conectivos · [TAB] fechar</p>`;
  }

  // Referência dos cinco conectivos, gerada pelo próprio motor lógico.
  function referencia() {
    const itens = [
      ["Negação", "!A", "¬A inverte o valor de A."],
      ["Conjunção", "A & B", "A ∧ B só é verdadeira quando A e B são verdadeiras."],
      ["Disjunção", "A | B", "A ∨ B é falsa somente quando A e B são falsas."],
      ["Condicional", "A -> B", "A → B só é falsa quando A é verdadeira e B é falsa."],
      ["Bicondicional", "A <-> B", "A ↔ B é verdadeira quando A e B têm o mesmo valor."],
    ];
    let html = `<h3>Conectivos — tabela-verdade</h3>
      <p class="nota">Precedência: ¬, ∧, ∨, →, ↔. A condicional associa à direita:
      A → B → C = A → (B → C). “V” = verdadeiro, “F” = falso.</p>`;
    for (const [nome, texto, desc] of itens) {
      const f = Logica.ler(texto);
      const { vars, linhas } = Logica.tabelaVerdade(f);
      html += `<p class="formula">${nome} <span class="oculto">·</span> ${Logica.paraTexto(f)}</p>
        <p class="nota">${desc}</p>
        <table class="referencia"><thead><tr>${vars.map((v) => `<th>${v}</th>`).join("")}<th>${Logica.paraTexto(f)}</th></tr></thead><tbody>`;
      linhas.forEach((l) => {
        html += "<tr>" +
          vars.map((v) => `<td class="${cls(l.valores[v])}">${VF(l.valores[v])}</td>`).join("") +
          `<td class="${cls(l.resultado)}">${VF(l.resultado)}</td></tr>`;
      });
      html += "</tbody></table>";
    }
    return html + `<p class="teclas">[H] voltar · [0] visão geral · [TAB] fechar</p>`;
  }

  // visao = { tipo: "geral" | "tabela" | "terminal" | "ajuda", porta }
  function tablet(e, aberto, visao) {
    const el = $("tablet");
    el.hidden = !aberto;
    if (!aberto) return;
    el.className = visao.tipo;
    const n = e.portas.length;
    if (visao.tipo === "tabela") {
      $("tabletCorpo").innerHTML = tabela(e, visao.porta);
    } else if (visao.tipo === "terminal") {
      $("tabletCorpo").innerHTML = `<h3>TERMINAL — PROTOCOLO IMPOSSÍVEL</h3>
        <p>Qual porta é uma <b>contradição</b> (falsa em todas as linhas da tabela-verdade)?
        Acertar sela a porta. <b class="f">Errar custa 1 de energia</b> e enfurece a criatura.</p>
        <ul class="portas">${listaDePortas(e)}</ul>
        <p class="teclas">[1-${n}] acusar porta · [H] conectivos · [TAB] sair</p>`;
    } else if (visao.tipo === "ajuda") {
      $("tabletCorpo").innerHTML = referencia();
    } else {
      // As portas vêm primeiro: são o que o jogador consulta com pressa.
      $("tabletCorpo").innerHTML = `<h3>${e.fase.conceito}</h3>
        <ul class="portas">${listaDePortas(e)}</ul>
        <p class="teclas">[1-${n}] tabela-verdade (−${Estado.CUSTO_TABELA} pts na 1ª consulta) · [H] conectivos · [PgDn/PgUp] rolar · [TAB] fechar</p>
        <p>${e.fase.texto}</p>
        <p class="nota">¬ não · ∧ e · ∨ ou · → se...então · ↔ se e somente se<br>
        A saída só libera com <b>todas</b> as portas abertas ou seladas ao mesmo tempo.
        O botão “Impossível!” fica no terminal verde do andar.<br>
        A luz do tablet atrai a criatura: leia as fórmulas num canto seguro.<br>
        Se precisar recomeçar o andar, aperte <b>R</b>.</p>`;
    }
  }

  // ---------- Tela de resultado (início e pausa ficam em menus.js) ----------
  function telaFim(mostrar, { titulo, corpo, botoes } = {}) {
    $("telaFim").hidden = !mostrar;
    if (!mostrar) return;
    $("fimTitulo").textContent = titulo;
    $("fimCorpo").innerHTML = corpo;
    const acoes = $("fimAcoes");
    acoes.innerHTML = "";
    botoes.forEach(([rotulo, acao], k) => {
      const b = document.createElement("button");
      b.className = "botao" + (k === 0 ? " primario" : "");
      b.textContent = rotulo;
      b.onclick = acao;
      acoes.appendChild(b);
    });
    acoes.firstChild.focus({ preventScroll: true }); // Enter já escolhe a ação principal
  }

  const susto = (ligado) => $("susto").classList.toggle("ligado", ligado);

  return { barra, aviso, limparAvisos, dica, folego, perigo, tablet, telaFim, susto, VF };
})();
