/*
 * verificar_regras.js — simula partidas com as regras de estado.js (sem 3D).
 * Uso:  node testes/verificar_regras.js
 *
 * Para cada fase confere que:
 *   - o caminho ótimo vence, sem nenhuma virada contada como errada;
 *   - a vitória só vem depois de selar as contradições no terminal;
 *   - toda virada que afasta da solução é contada como errada;
 *   - acusar uma porta que não é contradição custa 1 de energia;
 *   - gastar energia demais causa o apagão na hora (o andar não fica sem saída em silêncio).
 */
const path = require("path");
const js = (nome) => require(path.join(__dirname, "..", "js", nome));
const FASES = js("fases.js");
const Estado = js("estado.js");

let tudoCerto = true;
const conferir = (ok, msg) => { if (!ok) { console.log("  ERRO: " + msg); tudoCerto = false; } };

FASES.forEach((fase, i) => {
  console.log(`\n=== Fase ${i + 1}: ${fase.titulo} ===`);
  const nomes = Object.keys(fase.alavancas);
  const livres = nomes.filter((n) => !fase.presas.includes(n));
  const diferencas = (e, s) => nomes.filter((n) => s[n] !== e.valores[n]);

  // 1. Caminho ótimo.
  let e = Estado.criar(fase, i);
  const alvo = e.solucoes.slice().sort((a, b) => diferencas(e, a).length - diferencas(e, b).length)[0];
  const viradas = diferencas(e, alvo);
  viradas.forEach((n) => {
    const r = Estado.virar(e, n);
    conferir(r.ok && !r.errada, `virada correta de ${n} foi recusada ou contada como errada`);
  });
  const contradicoes = e.portas.map((p, k) => (p.tipo === "contradicao" ? k : -1)).filter((k) => k >= 0);
  conferir(contradicoes.length === 0 || !Estado.venceu(e), "venceu antes de selar as contradições");
  contradicoes.forEach((k) => conferir(Estado.acusar(e, k).correto, `porta ${k + 1} deveria ser selável`));
  conferir(Estado.situacao(e) === "vitoria", "o caminho ótimo não vence");
  console.log(`  ótimo: virar ${viradas.join(", ")}${contradicoes.length ? " e selar " + contradicoes.map((k) => k + 1).join(", ") : ""}` +
    ` -> ${Estado.pontuacao(e)} pontos, ${e.energia} de energia sobrando`);

  // 2. Cada virada que afasta da solução é errada; cada uma que aproxima, não.
  livres.forEach((n) => {
    e = Estado.criar(fase, i);
    const antes = Estado.distanciaDaSolucao(e);
    const r = Estado.virar(e, n);
    conferir(r.errada === (Estado.distanciaDaSolucao(e) >= antes), `classificação da virada inicial de ${n}`);
  });
  fase.presas.forEach((n) => conferir(!Estado.virar(Estado.criar(fase, i), n).ok, `alavanca presa ${n} virou`));

  // 3. Acusação errada custa energia e não sela.
  e = Estado.criar(fase, i);
  const inocente = e.portas.findIndex((p) => p.tipo !== "contradicao");
  const r = Estado.acusar(e, inocente);
  conferir(!r.correto && e.energia === fase.energia - 1 && !e.seladas.has(inocente), "acusação errada sem custo");

  // 4. Desperdício: vira a mesma alavanca de ida e volta até o apagão.
  e = Estado.criar(fase, i);
  let passos = 0;
  while (Estado.situacao(e) === "jogando" && passos++ < 20) Estado.virar(e, livres[0]);
  conferir(Estado.situacao(e) === "apagao", "desperdiçar energia não causou apagão");
  conferir(!Estado.virar(e, livres[0]).ok, "virou alavanca durante o apagão");
  console.log(`  desperdício: apagão depois de ${fase.energia - e.energia} viradas, com ${e.energia} de energia inútil`);
});

console.log(tudoCerto ? "\nAs regras se comportam como esperado." : "\nHá regras com problema.");
process.exit(tudoCerto ? 0 : 1);
