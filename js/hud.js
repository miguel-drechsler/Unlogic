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
  function barra(e) {
    $("andar").textContent = `ANDAR −${e.indice + 1} · ${e.fase.titulo}`;
    let pips = "";
    for (let i = 0; i < e.fase.energia; i++) pips += `<span class="pip${i < e.energia ? " cheio" : ""}"></span>`;
    $("bateria").innerHTML = pips;
    $("bateria").classList.toggle("vazia", e.energia === 0);

    $("chips").innerHTML = Object.keys(e.valores).map((n) => {
      if (!e.alavancasVistas.has(n)) return `<span class="chip oculto">${n} ?</span>`;
      const presa = e.fase.presas.includes(n);
      return `<span class="chip ${cls(e.valores[n])}${presa ? " presa" : ""}">${n} ${VF(e.valores[n])}${presa ? " ▣" : ""}</span>`;
    }).join("");
  }

  function aviso(texto, tipo = "") {
    const el = $("aviso");
    el.textContent = texto;
    el.className = "mostrar " + tipo;
    clearTimeout(relogioAviso);
    relogioAviso = setTimeout(() => { el.className = ""; }, 4200);
  }

  function dica(texto) {
    $("dica").textContent = texto || "";
    $("mira").classList.toggle("ativa", !!texto);
  }

  const folego = (f) => { $("folegoNivel").style.width = `${Math.round(f * 100)}%`; $("folego").classList.toggle("baixo", f < 0.3); };
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
      <p class="teclas">[0] voltar · [1-${e.portas.length}] outra porta</p>`;
  }

  // visao = { tipo: "geral" | "tabela" | "terminal", porta }
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
        <p class="teclas">[1-${n}] acusar porta · [TAB] sair</p>`;
    } else {
      // As portas vêm primeiro: são o que o jogador consulta com pressa.
      $("tabletCorpo").innerHTML = `<h3>${e.fase.conceito}</h3>
        <ul class="portas">${listaDePortas(e)}</ul>
        <p class="teclas">[1-${n}] tabela-verdade (−${Estado.CUSTO_TABELA} pts na 1ª consulta) · [PgDn/PgUp] rolar · [TAB] fechar</p>
        <p>${e.fase.texto}</p>
        <p class="nota">¬ não · ∧ e · ∨ ou · → se...então · ↔ se e somente se<br>
        A saída só libera com <b>todas</b> as portas abertas ou seladas ao mesmo tempo.
        O botão “Impossível!” fica no terminal verde do andar.</p>`;
    }
  }

  // ---------- Telas cheias ----------
  function telaInicio(mostrar, { titulo, subtitulo, botao } = {}) {
    $("telaInicio").hidden = !mostrar;
    if (!mostrar) return;
    $("inicioTitulo").textContent = titulo;
    $("inicioSub").textContent = subtitulo;
    $("btnEntrar").textContent = botao;
  }

  function seletor(indice, melhores, aoEscolher) {
    const el = $("seletorFases");
    el.innerHTML = "";
    FASES.forEach((f, i) => {
      const b = document.createElement("button");
      b.textContent = `−${i + 1}`;
      b.title = f.titulo;
      b.className = "andar-btn" + (i === indice ? " atual" : "") + (melhores[i] !== null ? " feito" : "");
      b.onclick = () => aoEscolher(i);
      el.appendChild(b);
    });
    const f = FASES[indice];
    $("andarInfo").textContent = `${f.titulo} — ${f.conceito}` +
      (melhores[indice] !== null ? ` · melhor: ${melhores[indice]} pts` : "");
  }

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
  }

  const susto = (ligado) => $("susto").classList.toggle("ligado", ligado);

  return { barra, aviso, dica, folego, perigo, tablet, telaInicio, seletor, telaFim, susto, VF };
})();
