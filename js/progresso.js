/*
 * progresso.js — Recordes e preferências salvos no navegador (localStorage)
 *
 * O jogo continua funcionando se o navegador bloquear o localStorage
 * (por exemplo, em alguns modos de privacidade): nesse caso, o progresso
 * vale só durante a sessão. Nada aqui depende do DOM ou do Three.js.
 *
 * O que é salvo:
 *   melhores[i]  melhor pontuação de cada andar (null = ainda não vencido)
 *   modoEstudo   prefere jogar sem a criatura?
 *   mudo         som desligado?
 */
const Progresso = (() => {
  const CHAVE = "unlogic.progresso.v1";

  function vazio(totalFases) {
    return {
      melhores: Array(totalFases).fill(null),
      modoEstudo: false,
      mudo: false,
    };
  }

  function carregar(totalFases) {
    const padrao = vazio(totalFases);
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (!dados || typeof dados !== "object") return padrao;
      return {
        melhores: padrao.melhores.map((_, i) => {
          const valor = dados.melhores && dados.melhores[i];
          return Number.isFinite(valor) ? valor : null;
        }),
        modoEstudo: dados.modoEstudo === true,
        mudo: dados.mudo === true,
      };
    } catch {
      return padrao;
    }
  }

  function salvar({ melhores, modoEstudo, mudo }) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ melhores, modoEstudo, mudo }));
    } catch {
      /* sem localStorage: o progresso fica só na memória */
    }
  }

  return { carregar, salvar };
})();
