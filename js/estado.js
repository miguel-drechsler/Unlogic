/*
 * estado.js — Regras do jogo em tempo real (sem DOM e sem Three.js)
 *
 * É a parte de regras do antigo jogo.js, separada da interface:
 *   - Virar uma alavanca gasta 1 de energia.
 *   - O andar é vencido quando TODAS as portas estão abertas ou seladas
 *     ao mesmo tempo — é isso que libera a saída.
 *   - Acusar de "impossível" uma porta que não é contradição custa 1 de energia.
 *   - Consultar a tabela-verdade de uma porta custa pontos.
 *   - Quando a energia não alcança mais nenhuma solução: apagão (o monstro entra em fúria).
 *   - Depois que o elevador é liberado, as alavancas travam: a valoração vencedora
 *     não pode mais ser desfeita por um toque acidental.
 *
 * Tudo aqui pergunta ao motor lógico (logica.js); nada de lógica é refeito.
 */
const Estado = (() => {
  const L = typeof Logica !== "undefined" ? Logica : require("./logica.js");

  const PONTOS_BASE = 100;
  const BONUS_ENERGIA = 25;
  const CUSTO_TABELA = 10;
  const CUSTO_ERRO = 20;

  // ---------- Preparação ----------
  function criar(fase, indice = 0) {
    const portas = fase.portas.map((texto) => {
      const arvore = L.ler(texto);
      return { arvore, tipo: L.classificar(arvore) };
    });
    const e = {
      indice,
      fase,
      valores: { ...fase.alavancas },
      energia: fase.energia,
      portas,
      // Cache das variáveis de cada porta: usado pela dica "esta alavanca
      // aparece nas portas ..." e por quem quiser montar dependências.
      variaveisDasPortas: portas.map((p) => L.variaveis(p.arvore)),
      seladas: new Set(),
      tabelasVistas: new Set(),
      alavancasVistas: new Set(), // o que o jogador já encontrou no labirinto
      portasVistas: new Set(),
      erros: 0,          // acusações erradas no terminal
      viradasErradas: 0, // viradas que deixam o monstro mais rápido
      tempo: 0,
    };
    e.solucoes = solucoes(fase);
    return e;
  }

  // Todas as valorações que vencem a fase (testa as 2^n combinações das alavancas livres).
  function solucoes(fase) {
    const portas = fase.portas.map((t) => L.ler(t)).filter((f) => L.classificar(f) !== "contradicao");
    const livres = Object.keys(fase.alavancas).filter((n) => !fase.presas.includes(n));
    const lista = [];
    for (let m = 0; m < 1 << livres.length; m++) {
      const v = { ...fase.alavancas };
      livres.forEach((n, k) => { v[n] = ((m >> k) & 1) === 1; });
      if (portas.every((f) => L.avaliar(f, v))) lista.push(v);
    }
    return lista;
  }

  // ---------- Consultas ----------
  const portaAberta = (e, i) => L.avaliar(e.portas[i].arvore, e.valores);
  const portaResolvida = (e, i) => e.seladas.has(i) || portaAberta(e, i);
  const venceu = (e) => e.portas.every((_, i) => portaResolvida(e, i));
  const situacaoPorta = (e, i) => (e.seladas.has(i) ? "selada" : portaAberta(e, i) ? "aberta" : "fechada");

  // Quantas alavancas ainda faltam virar até a solução mais próxima.
  function distanciaDaSolucao(e) {
    const nomes = Object.keys(e.valores);
    return Math.min(...e.solucoes.map((s) => nomes.filter((n) => s[n] !== e.valores[n]).length));
  }

  // Índices das portas cuja fórmula menciona a variável `nome`.
  // Serve para a dica de navegação ("a alavanca A aparece nas portas 1 e 4"),
  // sem revelar o valor nem a solução.
  function portasComVariavel(e, nome) {
    return e.variaveisDasPortas
      .map((vars, i) => (vars.includes(nome) ? i : -1))
      .filter((i) => i >= 0);
  }

  function retrato(e) {
    return {
      abertas: e.portas.filter((_, i) => portaResolvida(e, i)).length,
      distancia: distanciaDaSolucao(e),
    };
  }

  /*
   * O que conta como uma virada "errada" (a que deixa o monstro mais rápido)?
   *
   * Errada = não aproximou o jogador de nenhuma solução. Usamos a distância até a
   * solução mais próxima, e não o número de portas abertas, porque um passo certo
   * pode fechar portas pelo caminho (ex.: A ∧ B só abre na segunda virada).
   *
   *   antes, depois : { abertas, distancia }
   */
  function viradaFoiErrada(antes, depois) {
    return depois.distancia >= antes.distancia;
  }

  // ---------- Jogadas ----------
  function virar(e, nome) {
    if (e.fase.presas.includes(nome)) return { ok: false, motivo: "presa" };
    // Elevador liberado: as alavancas travam. Virar agora só desfaria a vitória
    // (e contaria como virada em falso, acelerando a criatura no caminho até a saída).
    const agora = situacao(e);
    if (agora === "vitoria") return { ok: false, motivo: "vitoria" };
    if (e.energia <= 0 || agora === "apagao") return { ok: false, motivo: "sem-energia" };
    const antes = retrato(e);
    e.valores[nome] = !e.valores[nome];
    e.energia--;
    const errada = viradaFoiErrada(antes, retrato(e));
    if (errada) e.viradasErradas++;
    return { ok: true, errada, valor: e.valores[nome] };
  }

  function acusar(e, i) {
    if (e.seladas.has(i)) return { ok: false, motivo: "ja-selada" };
    const agora = situacao(e);
    if (agora === "vitoria") return { ok: false, motivo: "vitoria" };
    const { tipo } = e.portas[i];
    // Selar uma contradição é de graça e pode ser a última jogada mesmo com
    // energia zero (o andar 5 termina exatamente assim).
    if (tipo === "contradicao") {
      e.seladas.add(i);
      return { ok: true, correto: true, tipo };
    }
    // Já uma acusação errada precisa de energia para pagar o erro.
    if (e.energia <= 0 || agora === "apagao") return { ok: false, motivo: "sem-energia" };
    e.erros++;
    e.energia--;
    return { ok: true, correto: false, tipo };
  }

  // Devolve true se esta consulta foi a primeira (a que custa pontos).
  function verTabela(e, i) {
    const nova = !e.tabelasVistas.has(i);
    e.tabelasVistas.add(i);
    return nova;
  }

  // "vitoria" tem prioridade: a última virada pode zerar a energia e ainda assim vencer.
  // Apagão = a energia que resta não alcança mais nenhuma solução. Sem isso, um erro
  // deixaria o jogador vagando num andar que já não tem como ser vencido.
  function situacao(e) {
    if (venceu(e)) return "vitoria";
    if (e.energia < distanciaDaSolucao(e)) return "apagao";
    return "jogando";
  }

  // ---------- Pontuação (igual à do jogo 2D) ----------
  function pontuacao(e) {
    const p = PONTOS_BASE + BONUS_ENERGIA * e.energia
      - CUSTO_TABELA * e.tabelasVistas.size - CUSTO_ERRO * e.erros;
    return Math.max(10, p);
  }

  function pontuacaoMaxima(fase) {
    const minimo = Math.min(...solucoes(fase).map((s) =>
      Object.keys(s).filter((n) => s[n] !== fase.alavancas[n]).length));
    return PONTOS_BASE + BONUS_ENERGIA * (fase.energia - minimo);
  }

  return {
    criar, virar, acusar, verTabela, situacao, venceu,
    portaAberta, portaResolvida, situacaoPorta, distanciaDaSolucao,
    portasComVariavel,
    pontuacao, pontuacaoMaxima,
    PONTOS_BASE, BONUS_ENERGIA, CUSTO_TABELA, CUSTO_ERRO,
  };
})();

if (typeof module !== "undefined") module.exports = Estado;
