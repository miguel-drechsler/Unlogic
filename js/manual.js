/*
 * manual.js — O bloco "Neste andar" do manual (tela de início e pausa)
 *
 * Gera, a partir dos dados da fase, um resumo do andar escolhido:
 *   conceito e texto da fase, o campo opcional `manual` (texto escrito à mão),
 *   os conectivos que aparecem nas portas, as mecânicas especiais (alavancas
 *   presas, terminal de contradição, tautologia), a folga de energia e o nível
 *   da criatura (lenta / atenta / implacável, de Monstro.dificuldade).
 *
 * Regra de ouro: NUNCA entregar a solução. Nada de valores corretos das
 * alavancas, nada de dizer QUAIS portas são contradições (nem quantas: as
 * frases usam "pelo menos uma"). A folga é dita em linguagem de jogo
 * ("dá para errar uma virada"), não como o número mínimo de viradas.
 *
 * Sem DOM e sem Three.js: Manual.resumo(fase, indice) devolve só dados e texto;
 * quem desenha é menus.js. Roda também no Node (testes).
 */
const Manual = (() => {
  const L = typeof Logica !== "undefined" ? Logica : require("./logica.js");
  const E = typeof Estado !== "undefined" ? Estado : require("./estado.js");
  const andar = typeof nomeDoAndar !== "undefined" ? nomeDoAndar : require("./fases.js").nomeDoAndar;
  const M = typeof Monstro !== "undefined" ? Monstro : require("./monstro.js");
  const total = () => (typeof FASES !== "undefined" ? FASES : require("./fases.js")).length;

  // O nível vem de Monstro.dificuldade; a frase traduz os parâmetros em comportamento.
  const CRIATURA = {
    lenta: "Demora a acordar, anda devagar e cansa logo de caçar.",
    atenta: "Acorda mais cedo, fareja de mais longe e caça por mais tempo.",
    implacável: "Quase não dá trégua, ronda perto de você e demora a cansar. " +
      "Mesmo assim, sem erros seus, ela caça mais devagar que o seu passo.",
  };

  // Na ordem da precedência (a mesma da referência do tablet, tecla H).
  const CONECTIVOS = [
    { op: "nao", simbolo: "¬", nome: "não" },
    { op: "e", simbolo: "∧", nome: "e" },
    { op: "ou", simbolo: "∨", nome: "ou" },
    { op: "imp", simbolo: "→", nome: "se… então" },
    { op: "bi", simbolo: "↔", nome: "se e somente se" },
  ];

  // Conjunto dos operadores usados numa árvore de fórmula.
  function operadores(no, achados = new Set()) {
    if (no.op === "var") return achados;
    achados.add(no.op);
    if (no.op === "nao") return operadores(no.arg, achados);
    operadores(no.esq, achados);
    return operadores(no.dir, achados);
  }

  function conectivos(arvores) {
    const usados = new Set();
    arvores.forEach((a) => operadores(a, usados));
    return CONECTIVOS.filter((c) => usados.has(c.op)).map(({ simbolo, nome }) => ({ simbolo, nome }));
  }

  function mecanicas(fase, tipos) {
    const lista = [];
    if (fase.presas.length) {
      const nomes = fase.presas.join(" e ");
      lista.push(`Alavancas com grade (${nomes}) estão presas: são premissas. ` +
        "Não dá para virá-las, mas o valor delas ajuda a deduzir o resto.");
    }
    if (tipos.includes("contradicao")) {
      lista.push("Pelo menos uma porta deste andar nunca abre, com nenhuma combinação de alavancas. " +
        "Descubra qual e sele-a no terminal “Impossível!”: acertar é de graça, errar custa 1 de energia.");
    }
    if (tipos.includes("tautologia")) {
      lista.push("Pelo menos uma porta fica aberta com qualquer combinação (tautologia). " +
        "Ela não precisa de você, e acusá-la no terminal é um erro.");
    }
    return lista;
  }

  // A folga é a energia que sobra depois do caminho mais curto. Desfazer uma
  // virada errada custa 2 (ida e volta); uma acusação errada custa 1.
  function energia(fase, indice, temTerminal) {
    const folga = fase.energia - E.distanciaDaSolucao(E.criar(fase, indice));
    const viradas = Math.floor(folga / 2);
    let frase;
    if (folga <= 0) {
      frase = "Energia contada: não sobra nada. Cada virada precisa estar certa.";
    } else if (viradas === 0) {
      frase = temTerminal
        ? "Sobra pouca energia: aguenta uma acusação errada no terminal, mas não desfazer uma virada errada."
        : "Sobra pouca energia: não dá para desfazer uma virada errada.";
    } else {
      frase = viradas === 1
        ? "Há folga para errar uma virada e desfazê-la. Mais do que isso apaga as luzes."
        : `Há folga para errar ${viradas} viradas e desfazê-las.`;
    }
    return { total: fase.energia, folga: Math.max(0, folga), frase };
  }

  function resumo(fase, indice) {
    const arvores = fase.portas.map((t) => L.ler(t));
    const tipos = arvores.map((a) => L.classificar(a));
    return {
      andar: andar(indice),
      titulo: fase.titulo,
      conceito: fase.conceito,
      manual: typeof fase.manual === "string" && fase.manual.trim() ? fase.manual.trim() : null,
      texto: fase.texto,
      conectivos: conectivos(arvores),
      mecanicas: mecanicas(fase, tipos),
      energia: energia(fase, indice, tipos.includes("contradicao")),
      criatura: criatura(indice),
    };
  }

  function criatura(indice) {
    const { nivel } = M.dificuldade(indice, total());
    const n = M.quantidade(indice, total());
    const grupo = n > 1 ? ` Há ${n} criaturas neste andar, cada uma mais fraca que uma caçadora solitária.` : "";
    return { nivel, frase: `${CRIATURA[nivel]}${grupo} No modo estudo elas ficam desligadas.` };
  }

  return { resumo };
})();

if (typeof module !== "undefined") module.exports = Manual;
