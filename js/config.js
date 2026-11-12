/* ==========================================================================
   Configuração da conexão com a nuvem
   --------------------------------------------------------------------------
   ESTE É O ÚNICO ARQUIVO QUE VOCÊ EDITA.

   1. Publique o appsscript.txt no Google Apps Script e faça a implantação
      como Aplicativo da Web com:
         Executar como ....... Eu
         Quem tem acesso ..... Qualquer pessoa
      ("Qualquer pessoa" é obrigatório para abrir o sistema sem login.)

   2. Copie a URL da implantação. Ela termina em /exec.

   3. Cole a URL entre as aspas de URL_APPS_SCRIPT, abaixo, e salve.

   4. Abra o index.html. Pronto: a nuvem fica configurada neste arquivo.

   Depois disso, qualquer computador que tenha esta pasta (ou o site
   publicado com este arquivo) abre o sistema direto no Google Sheets,
   sem login e sem configurar nada de novo. A URL não fica no navegador:
   ela viaja junto com o arquivo.

   Exemplo:
     URL_APPS_SCRIPT: 'https://script.google.com/macros/s/AKfycb.../exec'

   Se a variável ficar vazia, o sistema abre em modo de demonstração e guarda
   os dados apenas neste navegador (localStorage).
   ========================================================================== */
var CONFIG = {
  /** URL da implantação do Apps Script. Deixe vazio para o modo demonstração. */
  URL_APPS_SCRIPT: 'https://script.google.com/macros/s/AKfycbzBF2EJd1jrWbP8l69_ESXD6e7x2hBT8H0m2nm-GpqsPzDxllCtcsk8wPlkzHfEzykV3w/exec',

  /** Tempo máximo de espera por uma resposta do servidor (em milissegundos). */
  TEMPO_LIMITE_MS: 90000
};
