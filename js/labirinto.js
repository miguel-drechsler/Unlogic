/*
 * labirinto.js — Geração procedural do mapa e pathfinding (sem DOM e sem Three.js)
 *
 * O mapa é um grid de "tiles" (2n+1 × 2n+1 para n×n células):
 *   CHAO, PAREDE, PORTA (fechadura lógica) ou SAIDA.
 *
 * Como o mapa nasce das fases:
 *   1. O jogador nasce num SAGUÃO no centro do andar, com quatro saídas.
 *   2. Quatro alas crescem do saguão em rodízio, formando um labirinto PERFEITO
 *      (um único caminho entre duas células), com corredores que preferem seguir reto.
 *   3. Salas de laboratório são abertas nos cantos, e todo BECO SEM SAÍDA ganha uma
 *      segunda abertura. Sem becos, sempre existe outra rota de fuga: um jogador
 *      encurralado pelo monstro não tem contra-jogada (conferido com um bot).
 *   4. Cada porta da fase vira uma abertura EXTRA numa parede, criando um atalho.
 *      Porta fechada = atalho bloqueado, mas nada fica isolado — o jogador sempre
 *      alcança todas as alavancas, não importa quais portas estejam abertas.
 *   5. A saída fica na borda, na célula mais distante do saguão; alavancas e
 *      terminal são presos às paredes, o mais espalhados possível.
 *
 * A mesma semente gera sempre o mesmo mapa (morrer = repetir o mesmo andar).
 */
const Labirinto = (() => {
  const CHAO = 0, PAREDE = 1, PORTA = 2, SAIDA = 3;
  const VIZINHOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Gerador pseudoaleatório com semente (mulberry32).
  function aleatorio(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function embaralhar(lista, rnd) {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }

  const soChao = (lab) => (x, z) => lab.tiles[z * lab.L + x] === CHAO;

  // ---------- Busca em largura: distância (em tiles) da origem a cada tile ----------
  function distancias(lab, origem, passavel = soChao(lab)) {
    const { L } = lab;
    const d = new Int16Array(L * L).fill(-1);
    const fila = [origem.z * L + origem.x];
    d[fila[0]] = 0;
    for (let k = 0; k < fila.length; k++) {
      const i = fila[k], x = i % L, z = (i - x) / L;
      for (const [dx, dz] of VIZINHOS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= L || nz >= L) continue;
        const j = nz * L + nx;
        if (d[j] !== -1 || !passavel(nx, nz)) continue;
        d[j] = d[i] + 1;
        fila.push(j);
      }
    }
    return d;
  }

  // ---------- A*: menor caminho entre dois tiles ----------
  // Devolve a lista de tiles a percorrer (sem o de partida), [] se já está lá,
  // ou null se não há caminho. Heurística: distância Manhattan (admissível no grid).
  function caminho(lab, de, para, passavel = soChao(lab)) {
    const { L } = lab;
    const ini = de.z * L + de.x, fim = para.z * L + para.x;
    if (ini === fim) return [];
    const g = new Float32Array(L * L).fill(Infinity);
    const veio = new Int32Array(L * L).fill(-1);
    const fechado = new Uint8Array(L * L);
    const f = (i) => g[i] + Math.abs((i % L) - para.x) + Math.abs(Math.floor(i / L) - para.z);
    const abertos = [ini];
    g[ini] = 0;

    while (abertos.length) {
      let m = 0;
      for (let k = 1; k < abertos.length; k++) if (f(abertos[k]) < f(abertos[m])) m = k;
      const atual = abertos.splice(m, 1)[0];
      if (atual === fim) {
        const rota = [];
        for (let i = fim; i !== ini; i = veio[i]) rota.push({ x: i % L, z: Math.floor(i / L) });
        return rota.reverse();
      }
      fechado[atual] = 1;
      const x = atual % L, z = Math.floor(atual / L);
      for (const [dx, dz] of VIZINHOS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= L || nz >= L) continue;
        const j = nz * L + nx;
        if (fechado[j] || !passavel(nx, nz)) continue;
        if (g[atual] + 1 < g[j]) {
          if (g[j] === Infinity) abertos.push(j);
          g[j] = g[atual] + 1;
          veio[j] = atual;
        }
      }
    }
    return null;
  }

  // Escolhe `quantos` itens bem espalhados: cada escolha é a mais distante das anteriores.
  function espalhar(lab, candidatos, quantos, primeiraOrigem) {
    const menor = Array.from(distancias(lab, primeiraOrigem));
    const escolhidos = [];
    const usados = new Set();
    while (escolhidos.length < quantos) {
      let melhor = null;
      for (const c of candidatos) {
        const i = c.z * lab.L + c.x;
        if (usados.has(i)) continue;
        if (!melhor || menor[i] > menor[melhor.z * lab.L + melhor.x]) melhor = c;
      }
      if (!melhor) break;
      usados.add(melhor.z * lab.L + melhor.x);
      escolhidos.push(melhor);
      const d = distancias(lab, melhor);
      for (let i = 0; i < menor.length; i++) if (d[i] !== -1 && d[i] < menor[i]) menor[i] = d[i];
    }
    return escolhidos;
  }

  // ---------- Geração ----------
  function gerar({ celulas, nPortas, nAlavancas, semente }) {
    const rnd = aleatorio(semente);
    const n = celulas | 1; // ímpar: existe uma célula exatamente no centro
    const L = 2 * n + 1;
    const tiles = new Uint8Array(L * L).fill(PAREDE);
    const lab = { L, tiles };
    const idx = (x, z) => z * L + x;
    const abrirBloco = (x0, z0) => { // área aberta de 3×3 tiles
      for (let z = z0; z < z0 + 3; z++) for (let x = x0; x < x0 + 3; x++) tiles[idx(x, z)] = CHAO;
    };

    // 1. Saguão central: o jogador nasce no meio do andar, numa sala com 4 saídas.
    const meio = (n - 1) / 2;
    const inicio = { x: 2 * meio + 1, z: 2 * meio + 1 };
    const visitada = new Uint8Array(n * n);
    visitada[meio * n + meio] = 1;
    abrirBloco(inicio.x - 1, inicio.z - 1);

    // 2. Quatro alas crescem do saguão, um passo de cada vez (em rodízio), para que
    //    nenhuma engula o mapa. Cada ala é uma busca em profundidade que prefere
    //    seguir reto: corredores longos em vez de zigue-zague. O resultado ainda é
    //    uma árvore — existe exatamente um caminho entre duas células.
    const alas = VIZINHOS.map(([dx, dz]) => {
      const cx = meio + dx, cz = meio + dz;
      visitada[cz * n + cx] = 1;
      tiles[idx(2 * cx + 1, 2 * cz + 1)] = CHAO;
      return [{ cx, cz, dx, dz }];
    });
    while (alas.some((pilha) => pilha.length)) {
      for (const pilha of alas) {
        if (!pilha.length) continue;
        const { cx, cz, dx: vx, dz: vz } = pilha[pilha.length - 1];
        const opcoes = VIZINHOS.filter(([dx, dz]) => {
          const x = cx + dx, z = cz + dz;
          return x >= 0 && z >= 0 && x < n && z < n && !visitada[z * n + x];
        });
        if (!opcoes.length) { pilha.pop(); continue; }
        const reto = opcoes.find(([dx, dz]) => dx === vx && dz === vz);
        const [dx, dz] = reto && rnd() < 0.65 ? reto : opcoes[Math.floor(rnd() * opcoes.length)];
        tiles[idx(2 * cx + 1 + dx, 2 * cz + 1 + dz)] = CHAO; // derruba a parede entre as duas
        tiles[idx(2 * (cx + dx) + 1, 2 * (cz + dz) + 1)] = CHAO;
        visitada[(cz + dz) * n + cx + dx] = 1;
        pilha.push({ cx: cx + dx, cz: cz + dz, dx, dz });
      }
    }

    // 3. Salas de laboratório nos cantos (blocos de 2×2 células abertos por dentro).
    //    Abrir paredes só cria caminhos a mais: nada fica isolado.
    const u = n - 2;
    let cantos = [[0, 0], [u, u], [u, 0], [0, u]];
    if (n < 7) cantos = rnd() < 0.5 ? cantos.slice(0, 2) : cantos.slice(2); // andar pequeno: 2 salas em diagonal
    const salas = cantos.map(([bx, bz]) => {
      abrirBloco(2 * bx + 1, 2 * bz + 1);
      return { x: 2 * bx + 2, z: 2 * bz + 2 }; // tile central da sala
    });

    //    Becos sem saída: abre uma segunda passagem, de preferência em frente à
    //    primeira (o corredor continua reto). Só acrescenta aberturas, então uma
    //    passada basta e nada fica isolado.
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        const x = 2 * cx + 1, z = 2 * cz + 1;
        const abertas = VIZINHOS.filter(([dx, dz]) => tiles[idx(x + dx, z + dz)] !== PAREDE);
        if (abertas.length !== 1) continue;
        const [ox, oz] = abertas[0];
        const opcoes = VIZINHOS.filter(([dx, dz]) => {
          const vx = cx + dx, vz = cz + dz;
          return (dx !== ox || dz !== oz) && vx >= 0 && vz >= 0 && vx < n && vz < n;
        });
        const [dx, dz] = opcoes.find(([a, b]) => a === -ox && b === -oz) || opcoes[Math.floor(rnd() * opcoes.length)];
        tiles[idx(x + dx, z + dz)] = CHAO;
      }
    }

    // 4. Portas: paredes internas entre duas células. Preferimos as que criam os
    //    maiores atalhos (células vizinhas no grid, mas distantes pelo labirinto).
    const candidatas = [];
    for (let z = 1; z < L - 1; z++) {
      for (let x = 1; x < L - 1; x++) {
        if (tiles[idx(x, z)] !== PAREDE || (x % 2 === 0) === (z % 2 === 0)) continue;
        const eixo = x % 2 === 0 ? "x" : "z"; // direção em que se atravessa a porta
        // A porta precisa de batente dos dois lados (não pode encostar numa sala aberta).
        const batentes = eixo === "x" ? [idx(x, z - 1), idx(x, z + 1)] : [idx(x - 1, z), idx(x + 1, z)];
        if (batentes.some((i) => tiles[i] !== PAREDE)) continue;
        const a = eixo === "x" ? { x: x - 1, z } : { x, z: z - 1 };
        const b = eixo === "x" ? { x: x + 1, z } : { x, z: z + 1 };
        candidatas.push({ x, z, eixo, atalho: distancias(lab, a)[idx(b.x, b.z)], sorte: rnd() });
      }
    }
    candidatas.sort((p, q) => q.atalho - p.atalho || p.sorte - q.sorte);
    const portas = [];
    for (const afastamento of [4, 3, 2, 0]) {
      for (const c of candidatas) {
        if (portas.length >= nPortas) break;
        if (portas.includes(c)) continue;
        if (portas.every((p) => Math.abs(p.x - c.x) + Math.abs(p.z - c.z) >= afastamento)) portas.push(c);
      }
    }
    portas.forEach((p) => { tiles[idx(p.x, p.z)] = PORTA; });
    embaralhar(portas, rnd);

    // 5. Saída: na parede externa, junto à célula de borda mais distante do início.
    const doInicio = distancias(lab, inicio);
    let saida = null;
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        const x = 2 * cx + 1, z = 2 * cz + 1;
        const fora = cx === 0 ? [-1, 0] : cx === n - 1 ? [1, 0] : cz === 0 ? [0, -1] : cz === n - 1 ? [0, 1] : null;
        if (!fora) continue;
        if (!saida || doInicio[idx(x, z)] > doInicio[idx(saida.dentro.x, saida.dentro.z)]) {
          saida = { x: x + fora[0], z: z + fora[1], eixo: fora[0] ? "x" : "z", dentro: { x, z } };
        }
      }
    }
    tiles[idx(saida.x, saida.z)] = SAIDA;

    // 6. Alavancas e terminal: no centro de uma célula, presos a uma parede dela.
    const suportes = [];
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        const x = 2 * cx + 1, z = 2 * cz + 1;
        if ((x === inicio.x && z === inicio.z) || (x === saida.dentro.x && z === saida.dentro.z)) continue;
        const paredes = VIZINHOS.filter(([dx, dz]) => tiles[idx(x + dx, z + dz)] === PAREDE);
        if (!paredes.length) continue;
        const [dx, dz] = paredes[Math.floor(rnd() * paredes.length)];
        suportes.push({ x, z, dx, dz });
      }
    }
    const escolhidos = embaralhar(espalhar(lab, suportes, nAlavancas + 1, inicio), rnd);
    const terminal = escolhidos.pop();

    // 7. Lâmpadas (saguão, salas e mais algumas espalhadas) e toca do monstro.
    //    A toca precisa ser longe pelo caminho E em linha reta: uma célula vizinha do
    //    início pode estar a 40 tiles de caminho, mas a uma porta de distância.
    const celulasChao = [];
    const longe = (c) => doInicio[idx(c.x, c.z)] + 3 * (Math.abs(c.x - inicio.x) + Math.abs(c.z - inicio.z));
    let monstro = inicio;
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        const c = { x: 2 * cx + 1, z: 2 * cz + 1 };
        celulasChao.push(c);
        if (longe(c) > longe(monstro)) monstro = c;
      }
    }
    const corredores = celulasChao.filter((c) => salas.every((s) => Math.abs(c.x - s.x) > 1 || Math.abs(c.z - s.z) > 1));
    const lampadas = [inicio, ...salas, ...espalhar(lab, corredores, Math.max(2, 5 - salas.length), inicio)];

    return { L, tiles, celulas: n, inicio, salas, portas, saida, alavancas: escolhidos, terminal, lampadas, monstro, celulasChao };
  }

  // O mapa de uma fase: tamanho pelo andar, conteúdo pela fase, sempre a mesma semente.
  function paraFase(fase, indice) {
    return gerar({
      celulas: 7 + 2 * Math.floor(indice / 3), // 7, 7, 7, 9, 9...
      nPortas: fase.portas.length,
      nAlavancas: Object.keys(fase.alavancas).length,
      semente: 4242 + indice * 101,
    });
  }

  // Desenho em texto, para depuração e para o verificador.
  function paraTexto(lab) {
    const marca = new Map();
    const p = (t, c) => marca.set(t.z * lab.L + t.x, c);
    lab.alavancas.forEach((a, k) => p(a, String.fromCharCode(97 + k)));
    p(lab.terminal, "T"); p(lab.inicio, "@"); p(lab.monstro, "M");
    let s = "";
    for (let z = 0; z < lab.L; z++) {
      for (let x = 0; x < lab.L; x++) {
        const i = z * lab.L + x, t = lab.tiles[i];
        const k = lab.portas.findIndex((d) => d.x === x && d.z === z);
        s += t === PAREDE ? "█" : t === PORTA ? String(k + 1) : t === SAIDA ? "S" : marca.get(i) || " ";
      }
      s += "\n";
    }
    return s;
  }

  return { gerar, paraFase, caminho, distancias, aleatorio, paraTexto, CHAO, PAREDE, PORTA, SAIDA };
})();

if (typeof module !== "undefined") module.exports = Labirinto;
