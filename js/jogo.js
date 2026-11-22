/*
 * jogo.js — Regras do jogo e interface
 *
 * Usa o motor lógico (logica.js) e as fases (fases.js).
 * Regras:
 *   - Virar uma alavanca gasta 1 de energia.
 *   - A fase é vencida quando TODAS as portas estão abertas (fórmula verdadeira)
 *     ou seladas (contradições identificadas pelo jogador).
 *   - Acusar de "impossível" uma porta que não é contradição custa 1 de energia.
 *   - Consultar a tabela-verdade de uma porta custa pontos.
 */
(() => {
  const PONTOS_BASE = 100;
  const BONUS_MAXIMO = 100; // bônus por terminar sem gastar a folga de energia (igual ao 3D)
  const CUSTO_TABELA = 10;
  const CUSTO_ERRO = 20;

  const $ = (id) => document.getElementById(id);
  const VF = (b) => (b ? "V" : "F");

  const melhores = Array(FASES.length).fill(null); // melhor pontuação em cada fase
  let estado;

  // ---------- Preparação de uma fase ----------
  function iniciarFase(indice) {
    const fase = FASES[indice];
    estado = {
      indice,
      fase,
      valores: { ...fase.alavancas },
      energia: fase.energia,
      portas: fase.portas.map((texto) => {
        const arvore = Logica.ler(texto);
        return { arvore, tipo: Logica.classificar(arvore) };
      }),
      seladas: new Set(),
      tabelasVistas: new Set(),
      erros: 0,
      terminou: false,
    };
    aviso("");
    desenhar();
  }

  // ---------- Regras ----------
  function portaAberta(i) {
    return Logica.avaliar(estado.portas[i].arvore, estado.valores);
  }

  function venceu() {
    return estado.portas.every((_, i) => estado.seladas.has(i) || portaAberta(i));
  }

  function virarAlavanca(nome) {
    if (estado.terminou || estado.fase.presas.includes(nome)) return;
    if (estado.energia <= 0) return;
    estado.valores[nome] = !estado.valores[nome];
    estado.energia--;
    aviso(`Alavanca ${nome} agora vale ${VF(estado.valores[nome])}.`);
    depoisDaJogada();
  }

  function acusarImpossivel(i) {
    if (estado.terminou || estado.seladas.has(i)) return;
    const porta = estado.portas[i];
    if (porta.tipo === "contradicao") {
      estado.seladas.add(i);
      aviso(`Correto! A porta ${i + 1} é uma contradição: falsa em todas as valorações. Porta selada.`);
    } else {
      estado.erros++;
      estado.energia = Math.max(0, estado.energia - 1);
      const motivo = porta.tipo === "tautologia"
        ? "ela é verdadeira em TODAS as linhas (é uma tautologia)"
        : "existe pelo menos uma linha da tabela-verdade em que ela é verdadeira";
      aviso(`Errado: a porta ${i + 1} não é impossível, pois ${motivo}. −1 de energia.`, true);
    }
    depoisDaJogada();
  }

  // Menor número de viradas que ainda leva a uma solução. Contradições não
  // seladas podem ser seladas de graça no terminal, então não entram na conta.
  // Se não houver solução possível, devolve Infinity.
  function distanciaMinima() {
    const portas = estado.portas.filter((p, i) => !estado.seladas.has(i) && p.tipo !== "contradicao");
    const livres = Object.keys(estado.valores).filter((n) => !estado.fase.presas.includes(n));
    let minimo = Infinity;
    for (let m = 0; m < 1 << livres.length; m++) {
      const v = { ...estado.valores };
      livres.forEach((n, k) => { v[n] = ((m >> k) & 1) === 1; });
      if (portas.every((p) => Logica.avaliar(p.arvore, v))) {
        minimo = Math.min(minimo, livres.filter((n) => v[n] !== estado.valores[n]).length);
      }
    }
    return minimo;
  }

  function depoisDaJogada() {
    desenhar();
    if (venceu()) {
      estado.terminou = true;
      setTimeout(mostrarVitoria, 450);
    } else if (estado.energia < distanciaMinima()) {
      // Mesmo com energia sobrando, pode não haver mais como abrir tudo:
      // avisa na hora em vez de deixar o jogador tentando à toa.
      estado.terminou = true;
      setTimeout(mostrarDerrota, 450);
    }
  }

  // O bônus mede a FOLGA preservada (energia além do mínimo de viradas), como no 3D
  // (estado.js): resolver sem desperdício vale o mesmo em toda fase.
  const folgaDaFase = (fase) => fase.energia - movimentosMinimos(fase);
  function bonusEnergia() {
    const folga = folgaDaFase(FASES[estado.indice]);
    return folga <= 0 ? BONUS_MAXIMO : Math.round(BONUS_MAXIMO * Math.min(1, estado.energia / folga));
  }

  function pontuacaoDaFase() {
    const p = PONTOS_BASE + bonusEnergia()
      - CUSTO_TABELA * estado.tabelasVistas.size - CUSTO_ERRO * estado.erros;
    return Math.max(10, p);
  }

  // Menor número de alavancas a virar para vencer a fase (testa todas as combinações).
  function movimentosMinimos(fase) {
    const portas = fase.portas.map((t) => Logica.ler(t)).filter((f) => Logica.classificar(f) !== "contradicao");
    const livres = Object.keys(fase.alavancas).filter((n) => !fase.presas.includes(n));
    let minimo = Infinity;
    for (let m = 0; m < 1 << livres.length; m++) {
      const v = { ...fase.alavancas };
      livres.forEach((n, k) => { v[n] = ((m >> k) & 1) === 1; });
      if (portas.every((f) => Logica.avaliar(f, v))) {
        minimo = Math.min(minimo, livres.filter((n) => v[n] !== fase.alavancas[n]).length);
      }
    }
    return minimo;
  }

  function total() {
    return melhores.reduce((s, p) => s + (p || 0), 0);
  }

  // ---------- Desenho da tela ----------
  function desenhar() {
    const { fase, indice } = estado;
    $("faseNumero").textContent = `Fase ${indice + 1} de ${FASES.length}`;
    $("faseConceito").textContent = fase.conceito;
    $("faseTitulo").textContent = fase.titulo;
    $("faseTexto").textContent = fase.texto;
    $("pontos").textContent = total();

    // Seletor de fases (todas liberadas, para facilitar a apresentação)
    const seletor = $("seletorFases");
    seletor.innerHTML = "";
    FASES.forEach((f, i) => {
      const b = document.createElement("button");
      b.textContent = i + 1;
      b.title = f.titulo;
      b.className = "fase-bolinha" + (i === indice ? " atual" : "") + (melhores[i] !== null ? " feita" : "");
      b.onclick = () => iniciarFase(i);
      seletor.appendChild(b);
    });

    // Energia
    const energia = $("energia");
    energia.innerHTML = "";
    for (let i = 0; i < fase.energia; i++) {
      const pip = document.createElement("span");
      pip.className = "pip" + (i < estado.energia ? " cheio" : "");
      energia.appendChild(pip);
    }
    energia.setAttribute("aria-label", `${estado.energia} de ${fase.energia}`);

    // Alavancas
    const painel = $("alavancas");
    painel.innerHTML = "";
    Object.keys(estado.valores).forEach((nome) => {
      const valor = estado.valores[nome];
      const presa = fase.presas.includes(nome);
      const b = document.createElement("button");
      b.className = `alavanca ${valor ? "ligada" : "desligada"}${presa ? " presa" : ""}`;
      b.disabled = presa || estado.terminou || estado.energia === 0;
      b.setAttribute("aria-label", `Alavanca ${nome}: ${valor ? "verdadeira" : "falsa"}${presa ? ", presa" : ""}`);
      b.innerHTML = `
        <span class="alavanca-nome">${nome}</span>
        <span class="alavanca-trilho"><span class="alavanca-cabo"></span></span>
        <span class="alavanca-valor">${VF(valor)}</span>`;
      b.onclick = () => virarAlavanca(nome);
      painel.appendChild(b);
    });

    // Portas
    const area = $("portas");
    area.innerHTML = "";
    estado.portas.forEach((porta, i) => {
      const selada = estado.seladas.has(i);
      const aberta = portaAberta(i);
      const situacao = selada ? "selada" : aberta ? "aberta" : "fechada";
      const formula = formulaAvaliada(porta.arvore);
      const substituida = Logica.paraTexto(porta.arvore, (n) =>
        `<span class="val ${estado.valores[n] ? "v" : "f"}">${VF(estado.valores[n])}</span>`);
      const viuTabela = estado.tabelasVistas.has(i);

      const card = document.createElement("article");
      card.className = `porta ${situacao}`;
      card.innerHTML = `
        <div class="porta-desenho" aria-hidden="true"><span class="folha"></span></div>
        <div class="porta-corpo">
        <div class="porta-topo">
          <span class="porta-nome">Porta ${i + 1}</span>
          <span class="selo">${{ aberta: "ABERTA", fechada: "FECHADA", selada: "SELADA" }[situacao]}</span>
        </div>
        <p class="formula">${formula}</p>
        <p class="substituicao">${substituida} <span class="igual">=</span>
          <span class="val ${aberta ? "v" : "f"}">${VF(aberta)}</span></p>
        <div class="porta-acoes">
          <button class="mini" data-acao="tabela">Tabela-verdade${viuTabela ? "" : ` (−${CUSTO_TABELA} pts)`}</button>
          <button class="mini perigo" data-acao="impossivel" ${selada || estado.terminou ? "disabled" : ""}>Impossível!</button>
        </div>
        </div>`;
      card.querySelector('[data-acao="tabela"]').onclick = () => abrirTabela(i);
      card.querySelector('[data-acao="impossivel"]').onclick = () => acusarImpossivel(i);
      area.appendChild(card);
    });
  }

  // Fórmula em HTML onde cada subfórmula vira um "ramo" sublinhado com o seu valor atual.
  function formulaAvaliada(no, pai = null) {
    const valor = Logica.avaliar(no, estado.valores);
    if (no.op === "var") return `<span class="var ${valor ? "v" : "f"}">${no.nome}</span>`;
    const dentro = no.op === "nao"
      ? Logica.SIMBOLO.nao + formulaAvaliada(no.arg, no)
      : `${formulaAvaliada(no.esq, no)}<span class="op">${Logica.SIMBOLO[no.op]}</span>${formulaAvaliada(no.dir, no)}`;
    // mesmos parênteses que Logica.paraTexto
    const parenteses = pai && no.op !== "nao" &&
      (pai.op === "nao" || no.op !== pai.op || pai.op === "imp" || pai.op === "bi");
    return `<span class="ramo r-${valor ? "v" : "f"}">${parenteses ? `(${dentro})` : dentro}</span>`;
  }

  function aviso(texto, ruim = false) {
    const el = $("aviso");
    el.textContent = texto;
    el.className = "aviso" + (ruim ? " ruim" : "");
  }

  // ---------- Tabela-verdade ----------
  function abrirTabela(i) {
    estado.tabelasVistas.add(i);
    const porta = estado.portas[i];
    const { vars, linhas } = Logica.tabelaVerdade(porta.arvore);
    $("tabelaTitulo").textContent = `Tabela-verdade — Porta ${i + 1}`;
    $("tabelaFormula").textContent = Logica.paraTexto(porta.arvore);

    let html = "<thead><tr>" + vars.map((v) => `<th>${v}</th>`).join("") +
      `<th class="col-resultado">Fórmula</th></tr></thead><tbody>`;
    linhas.forEach((l) => {
      const atual = vars.every((v) => l.valores[v] === estado.valores[v]);
      html += `<tr class="${atual ? "atual" : ""}">` +
        vars.map((v) => `<td class="${l.valores[v] ? "v" : "f"}">${VF(l.valores[v])}</td>`).join("") +
        `<td class="col-resultado ${l.resultado ? "v" : "f"}">${VF(l.resultado)}</td></tr>`;
    });
    $("tabela").innerHTML = html + "</tbody>";
    $("dlgTabela").showModal();
    desenhar();
  }

  // ---------- Janelas ----------
  function janela(titulo, corpoHtml, botoes) {
    $("msgTitulo").textContent = titulo;
    $("msgCorpo").innerHTML = corpoHtml;
    const acoes = $("msgAcoes");
    acoes.innerHTML = "";
    botoes.forEach(([rotulo, acao, classe]) => {
      const b = document.createElement("button");
      b.className = "botao " + (classe || "");
      b.textContent = rotulo;
      b.onclick = () => { $("dlgMensagem").close(); acao && acao(); };
      acoes.appendChild(b);
    });
    $("dlgMensagem").showModal();
  }

  function mostrarVitoria() {
    const pts = pontuacaoDaFase();
    melhores[estado.indice] = Math.max(melhores[estado.indice] || 0, pts);
    desenhar();

    const valoracao = Object.keys(estado.valores)
      .map((n) => `<span class="val ${estado.valores[n] ? "v" : "f"}">${n}=${VF(estado.valores[n])}</span>`).join(" ");
    const provas = estado.portas.map((p, i) => {
      if (estado.seladas.has(i)) return `<li>Porta ${i + 1}: contradição — selada</li>`;
      const sub = Logica.paraTexto(p.arvore, (n) => VF(estado.valores[n]));
      return `<li>Porta ${i + 1}: ${sub} = <b class="v">V</b></li>`;
    }).join("");

    const ultima = estado.indice === FASES.length - 1;
    janela("Fase concluída!", `
      <p>Valoração final: ${valoracao}</p>
      <ul class="provas">${provas}</ul>
      <table class="pontuacao">
        <tr><td>Base</td><td>${PONTOS_BASE}</td></tr>
        <tr><td>Folga de energia preservada (${Math.min(estado.energia, folgaDaFase(FASES[estado.indice]))} de ${folgaDaFase(FASES[estado.indice])})</td><td>+${bonusEnergia()}</td></tr>
        <tr><td>Tabelas consultadas (${estado.tabelasVistas.size} × ${CUSTO_TABELA})</td><td>−${CUSTO_TABELA * estado.tabelasVistas.size}</td></tr>
        <tr><td>Acusações erradas (${estado.erros} × ${CUSTO_ERRO})</td><td>−${CUSTO_ERRO * estado.erros}</td></tr>
        <tr class="soma"><td>Pontos da fase</td><td>${pts}</td></tr>
      </table>`,
      ultima
        ? [["Ver resultado final", mostrarFinal, "primario"], ["Jogar de novo esta fase", () => iniciarFase(estado.indice)]]
        : [["Próxima fase →", () => iniciarFase(estado.indice + 1), "primario"], ["Jogar de novo", () => iniciarFase(estado.indice)]]
    );
  }

  function mostrarDerrota() {
    const falta = distanciaMinima();
    const situacao = falta === Infinity
      ? "Não existe mais valoração capaz de abrir todas as portas."
      : `Ainda faltavam <b>${falta}</b> virada(s) e restam <b>${estado.energia}</b> de energia.`;
    janela("Sem energia!", `
      <p>As alavancas travaram antes de todas as portas abrirem.</p>
      <p>${situacao}</p>
      <p>Dica: antes de virar uma alavanca, avalie o que acontece com <b>todas</b> as portas.
      A tabela-verdade custa pontos, mas pode economizar energia.</p>`,
      [["Tentar de novo", () => iniciarFase(estado.indice), "primario"]]);
  }

  function mostrarFinal() {
    const feitas = melhores.filter((p) => p !== null).length;
    const maximo = FASES.length * (PONTOS_BASE + BONUS_MAXIMO);
    janela("Laboratório concluído!", `
      <p>Fases concluídas: <b>${feitas} de ${FASES.length}</b></p>
      <p>Pontuação total: <b class="destaque">${total()}</b> de ${maximo} possíveis.</p>
      <p>Pontuação máxima = resolver todas as fases com o mínimo de movimentos,
      sem tabelas e sem erros: só raciocínio lógico.</p>`,
      [["Recomeçar da fase 1", () => { melhores.fill(null); iniciarFase(0); }, "primario"]]);
  }

  function mostrarRegras() {
    janela("Como jogar", `
      <p>Você está preso num laboratório. Cada <b>alavanca</b> é uma variável proposicional
      (<b class="v">V</b> ou <b class="f">F</b>) e cada <b>porta</b> tem uma fechadura que é uma fórmula.</p>
      <ul>
        <li>A porta <b>abre</b> quando a fórmula é verdadeira com os valores atuais.</li>
        <li>Para vencer, <b>todas</b> as portas precisam estar abertas ao mesmo tempo.</li>
        <li>Virar uma alavanca gasta <b>1 de energia</b>. Se a energia restante não
          alcançar mais nenhuma solução, a fase acaba na hora.</li>
        <li><b>Tabela-verdade</b>: mostra todas as combinações da porta (custa ${CUSTO_TABELA} pontos).</li>
        <li><b>Impossível!</b>: se a porta for uma contradição, ela é selada.
          Se não for, você perde 1 de energia.</li>
        <li>Alavancas tracejadas (fixas) estão presas: são premissas.</li>
        <li>Atalho: aperte a letra da alavanca no teclado para virá-la;
          aperte <b>R</b> para reiniciar a fase.</li>
      </ul>
      <p class="nota">¬ não · ∧ e · ∨ ou · → se...então · ↔ se e somente se</p>`,
      [["Entendi", null, "primario"]]);
  }

  // ---------- Eventos ----------
  $("btnReiniciar").onclick = () => iniciarFase(estado.indice);
  $("btnRegras").onclick = mostrarRegras;
  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyR") return iniciarFase(estado.indice);
    const letra = e.key.toUpperCase();
    if (letra in estado.valores) virarAlavanca(letra);
  });

  iniciarFase(0);
  mostrarRegras();
})();
