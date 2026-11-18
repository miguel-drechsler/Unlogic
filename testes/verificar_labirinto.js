/*
 * verificar_labirinto.js — confere o mapa 3D gerado para cada fase.
 * Uso:  node testes/verificar_labirinto.js
 *
 * Com TODAS as portas fechadas (pior caso), cada alavanca, o terminal, a toca do
 * monstro e a célula da saída precisam ser alcançáveis a partir do início.
 * Legenda do desenho: @ início, a-e alavancas, T terminal, 1-5 portas, S saída, M monstro.
 */
const path = require("path");
const js = (nome) => require(path.join(__dirname, "..", "js", nome));
const FASES = js("fases.js");
const Labirinto = js("labirinto.js");
const Estado = js("estado.js");

let tudoCerto = true;
const falha = (msg) => { console.log("  ERRO: " + msg); tudoCerto = false; };

FASES.forEach((fase, i) => {
  const nomes = Object.keys(fase.alavancas);
  const lab = Labirinto.paraFase(fase, i);
  console.log(`\n=== Fase ${i + 1} · andar ${FASES.nomeDoAndar(i)}: ${fase.titulo} (${lab.L}×${lab.L} tiles) ===`);
  console.log(Labirinto.paraTexto(lab));

  if (lab.portas.length !== fase.portas.length) falha("faltam portas no mapa");
  if (lab.alavancas.length !== nomes.length || !lab.terminal) falha("faltam alavancas ou terminal");

  const d = Labirinto.distancias(lab, lab.inicio); // só chão: portas contam como fechadas
  const em = (t) => d[t.z * lab.L + t.x];
  lab.alavancas.forEach((a, k) => { if (em(a) < 0) falha(`alavanca ${nomes[k]} inalcançável`); });
  if (em(lab.terminal) < 0) falha("terminal inalcançável");
  if (em(lab.saida.dentro) < 0) falha("saída inalcançável");
  if (em(lab.monstro) < 0) falha("monstro isolado");
  const rota = Labirinto.caminho(lab, lab.monstro, lab.inicio);
  if (!rota || rota.length !== em(lab.monstro)) falha("A* discorda da busca em largura");
  console.log(`  monstro a ${em(lab.monstro)} tiles do início | saída a ${em(lab.saida.dentro)} tiles`);

  // Nenhum beco sem saída: toda célula tem pelo menos duas aberturas (portas contam como parede).
  const becos = lab.celulasChao.filter((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .filter(([dx, dz]) => lab.tiles[(c.z + dz) * lab.L + c.x + dx] === Labirinto.CHAO).length < 2);
  if (becos.length) falha(becos.length + " beco(s) sem saída");

  const e = Estado.criar(fase, i);
  if (!e.solucoes.length) falha("fase sem solução");
  if (Estado.situacao(e) !== "jogando") falha("estado inicial já decide a fase");
});

console.log(tudoCerto ? "\nTodos os mapas são jogáveis." : "\nHá mapas com problema.");
process.exit(tudoCerto ? 0 : 1);
