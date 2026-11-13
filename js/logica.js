/*
 * logica.js — Motor de Lógica Proposicional do jogo "Alavancas"
 *
 * Tudo o que envolve lógica fica neste arquivo:
 *   - ler uma fórmula escrita como texto  ->  árvore (parser)
 *   - avaliar a fórmula para uma valoração (A=V, B=F, ...)
 *   - gerar a tabela-verdade
 *   - classificar: tautologia, contradição ou contingência
 *
 * Sintaxe aceita nas fórmulas (ASCII ou Unicode):
 *   negação        !   ~   ¬
 *   conjunção      &   ∧
 *   disjunção      |   ∨
 *   condicional    ->  →
 *   bicondicional  <-> ↔
 *   variáveis      letras maiúsculas (A, B, C, ...)
 *
 * Precedência (da mais forte para a mais fraca): ¬, ∧, ∨, →, ↔
 * A condicional associa à direita: A → B → C  =  A → (B → C)
 */
const Logica = (() => {
  const SIMBOLO = { nao: "¬", e: "∧", ou: "∨", imp: "→", bi: "↔" };

  // ---------- 1. Tokenização ----------
  function tokenizar(texto) {
    const tokens = [];
    let i = 0;
    while (i < texto.length) {
      const c = texto[i];
      if (/\s/.test(c)) { i++; continue; }
      if (texto.startsWith("<->", i)) { tokens.push("bi"); i += 3; continue; }
      if (texto.startsWith("->", i)) { tokens.push("imp"); i += 2; continue; }
      if (c === "↔") { tokens.push("bi"); i++; continue; }
      if (c === "→") { tokens.push("imp"); i++; continue; }
      if (c === "&" || c === "∧") { tokens.push("e"); i++; continue; }
      if (c === "|" || c === "∨") { tokens.push("ou"); i++; continue; }
      if (c === "!" || c === "~" || c === "¬") { tokens.push("nao"); i++; continue; }
      if (c === "(" || c === ")") { tokens.push(c); i++; continue; }
      if (/[A-Z]/.test(c)) { tokens.push({ variavel: c }); i++; continue; }
      throw new Error(`Símbolo inválido "${c}" na fórmula: ${texto}`);
    }
    return tokens;
  }

  // ---------- 2. Parser (descida recursiva) ----------
  // Cada nó da árvore é { op, ... }:
  //   { op: "var", nome: "A" }
  //   { op: "nao", arg: <nó> }
  //   { op: "e" | "ou" | "imp" | "bi", esq: <nó>, dir: <nó> }
  function ler(texto) {
    const tokens = tokenizar(texto);
    let pos = 0;
    const olhar = () => tokens[pos];
    const consumir = () => tokens[pos++];

    function bicondicional() {
      let esq = condicional();
      while (olhar() === "bi") { consumir(); esq = { op: "bi", esq, dir: condicional() }; }
      return esq;
    }
    function condicional() {
      const esq = disjuncao();
      if (olhar() === "imp") { consumir(); return { op: "imp", esq, dir: condicional() }; }
      return esq;
    }
    function disjuncao() {
      let esq = conjuncao();
      while (olhar() === "ou") { consumir(); esq = { op: "ou", esq, dir: conjuncao() }; }
      return esq;
    }
    function conjuncao() {
      let esq = negacao();
      while (olhar() === "e") { consumir(); esq = { op: "e", esq, dir: negacao() }; }
      return esq;
    }
    function negacao() {
      if (olhar() === "nao") { consumir(); return { op: "nao", arg: negacao() }; }
      return atomo();
    }
    function atomo() {
      const t = consumir();
      if (t && t.variavel) return { op: "var", nome: t.variavel };
      if (t === "(") {
        const dentro = bicondicional();
        if (consumir() !== ")") throw new Error(`Falta ")" na fórmula: ${texto}`);
        return dentro;
      }
      throw new Error(`Fórmula mal escrita: ${texto}`);
    }

    const arvore = bicondicional();
    if (pos !== tokens.length) throw new Error(`Sobrou algo no fim da fórmula: ${texto}`);
    return arvore;
  }

  // ---------- 3. Avaliação (semântica dos conectivos) ----------
  function avaliar(f, v) {
    switch (f.op) {
      case "var": return v[f.nome];
      case "nao": return !avaliar(f.arg, v);
      case "e":   return avaliar(f.esq, v) && avaliar(f.dir, v);
      case "ou":  return avaliar(f.esq, v) || avaliar(f.dir, v);
      case "imp": return !avaliar(f.esq, v) || avaliar(f.dir, v); // P → Q  ≡  ¬P ∨ Q
      case "bi":  return avaliar(f.esq, v) === avaliar(f.dir, v);
    }
    throw new Error("Operador desconhecido: " + f.op);
  }

  // ---------- 4. Variáveis de uma fórmula ----------
  function variaveis(f, conjunto = new Set()) {
    if (f.op === "var") conjunto.add(f.nome);
    else if (f.op === "nao") variaveis(f.arg, conjunto);
    else { variaveis(f.esq, conjunto); variaveis(f.dir, conjunto); }
    return [...conjunto].sort();
  }

  // ---------- 5. Tabela-verdade ----------
  // Ordem clássica: primeira linha tudo V, última tudo F.
  function tabelaVerdade(f) {
    const vars = variaveis(f);
    const n = vars.length;
    const linhas = [];
    for (let i = 0; i < 1 << n; i++) {
      const valores = {};
      vars.forEach((nome, k) => { valores[nome] = ((i >> (n - 1 - k)) & 1) === 0; });
      linhas.push({ valores, resultado: avaliar(f, valores) });
    }
    return { vars, linhas };
  }

  // ---------- 6. Classificação ----------
  function classificar(f) {
    const { linhas } = tabelaVerdade(f);
    if (linhas.every((l) => l.resultado)) return "tautologia";
    if (linhas.every((l) => !l.resultado)) return "contradicao";
    return "contingencia";
  }

  // ---------- 7. Escrita da fórmula ----------
  // `mostrarVar` permite trocar cada variável por outra coisa (ex.: V/F colorido).
  function paraTexto(f, mostrarVar = (n) => n) {
    function precisaParenteses(filho, pai) {
      if (filho.op === "var" || filho.op === "nao") return false;
      if (pai.op === "nao") return true;
      return filho.op !== pai.op || pai.op === "imp" || pai.op === "bi";
    }
    function escrever(no, pai) {
      let s;
      if (no.op === "var") s = mostrarVar(no.nome);
      else if (no.op === "nao") s = SIMBOLO.nao + escrever(no.arg, no);
      else s = `${escrever(no.esq, no)} ${SIMBOLO[no.op]} ${escrever(no.dir, no)}`;
      return pai && precisaParenteses(no, pai) ? `(${s})` : s;
    }
    return escrever(f, null);
  }

  return { ler, avaliar, variaveis, tabelaVerdade, classificar, paraTexto, SIMBOLO };
})();

if (typeof module !== "undefined") module.exports = Logica;
