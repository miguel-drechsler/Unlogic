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
 *   sensibilidade  sensibilidade do mouse (0,3 a 2,5)
 *   volume         volume geral (0 a 1)
 */
const Progresso = (() => {
  const CHAVE = "unlogic.progresso.v1";

  function vazio(totalFases) {
    return {
      melhores: Array(totalFases).fill(null),
      modoEstudo: false,
      mudo: false,
      sensibilidade: 1,
      volume: 0.8,
    };
  }

  // Número salvo dentro da faixa, ou o padrão (dados antigos ou corrompidos não quebram o jogo).
  const faixa = (v, min, max, padrao) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : padrao);

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
        sensibilidade: faixa(dados.sensibilidade, 0.3, 2.5, padrao.sensibilidade),
        volume: faixa(dados.volume, 0, 1, padrao.volume),
      };
    } catch {
      return padrao;
    }
  }

  function salvar({ melhores, modoEstudo, mudo, sensibilidade, volume }) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ melhores, modoEstudo, mudo, sensibilidade, volume }));
    } catch {
      /* sem localStorage: o progresso fica só na memória */
    }
  }

  return { carregar, salvar };
})();
