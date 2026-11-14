/**
 * Ponte entre o frontend e o backend.
 *
 * Três modos, escolhidos automaticamente:
 *
 * 1. nuvem        — CONFIG.URL_APPS_SCRIPT preenchida em js/config.js.
 *                   Fala com o Apps Script por HTTP (POST) e, se o navegador
 *                   bloquear por CORS, cai sozinho para JSONP.
 * 2. apps-script  — página aberta pela própria implantação (google.script.run).
 * 3. local        — demonstração no localStorage (LocalBackend).
 *
 * O servidor sempre responde no formato { ok, data } ou { ok, erro }.
 *
 * Toda chamada carrega junto a chave de acesso digitada pelo usuário (que
 * fica guardada só no navegador). Sem a chave, o servidor recusa tudo.
 */
var Api = (function () {
  var PREFIXO_CALLBACK = '__sistemaNotas';
  var LIMITE_URL_JSONP = 4500;
  var TAMANHO_PARTE_JSONP = 1000;
  var LIMITE_CORPO_JSONP = 120000;
  var TEMPO_LIMITE_PADRAO = 90000;

  var transporte = null; // 'http' | 'jsonp' | null (ainda não testado)
  var testeEmAndamento = null;
  var contadorJsonp = 0;

  /* ------------------------------------------------------------------ */
  /* Chave de acesso                                                     */
  /* ------------------------------------------------------------------ */

  var CHAVE_ARMAZENAMENTO = 'sistemaNotas.chaveAcesso';
  var chaveMemoria = '';
  var aoFaltarChave = null;

  /**
   * A chave nunca vai para o repositório: fica apenas no navegador, depois
   * que o usuário digita na primeira abertura (ou em armazenamento
   * bloqueado, onde vale só nesta sessão).
   */
  function chaveAtual() {
    try {
      var guardada = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
      if (guardada) return guardada;
    } catch (erro) {
      // Aba anônima ou armazenamento bloqueado: vale o que está em memória.
    }
    return chaveMemoria;
  }

  function definirChave(valor) {
    chaveMemoria = String(valor === null || valor === undefined ? '' : valor).trim();
    try {
      if (chaveMemoria) {
        window.localStorage.setItem(CHAVE_ARMAZENAMENTO, chaveMemoria);
      } else {
        window.localStorage.removeItem(CHAVE_ARMAZENAMENTO);
      }
    } catch (erro) {
      // Sem localStorage a chave vale apenas para esta sessão.
    }
    return chaveMemoria;
  }

  /** Requisição padrão: toda chamada carrega a chave junto. */
  function montarRequisicao(nome, argumentos) {
    return {
      action: nome,
      args: argumentos || [],
      chave: chaveAtual()
    };
  }

  function avisarFaltaDeChave(erro) {
    if (!erro || !erro.__chave || typeof aoFaltarChave !== 'function') return;
    try {
      aoFaltarChave(erro);
    } catch (erroAviso) {
      // O aviso nunca pode esconder o erro original.
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ambiente                                                            */
  /* ------------------------------------------------------------------ */

  function urlConfigurada() {
    var url = '';
    if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.URL_APPS_SCRIPT) {
      url = String(CONFIG.URL_APPS_SCRIPT).trim();
    }
    if (!url) return '';
    // Aceita a URL com ou sem parâmetros e com barra no final.
    return url.replace(/[?#].*$/, '').replace(/\/+$/, '');
  }

  function dentroDoAppsScript() {
    return (
      typeof google !== 'undefined' &&
      google.script &&
      typeof google.script.run === 'object'
    );
  }

  function modo() {
    if (urlConfigurada()) return 'nuvem';
    if (dentroDoAppsScript()) return 'apps-script';
    return 'local';
  }

  function tempoLimite() {
    var valor =
      typeof CONFIG !== 'undefined' && CONFIG && Number(CONFIG.TEMPO_LIMITE_MS);
    return valor > 0 ? valor : TEMPO_LIMITE_PADRAO;
  }

  /* ------------------------------------------------------------------ */
  /* Chamada                                                             */
  /* ------------------------------------------------------------------ */

  function chamar(nome, argumentos) {
    var args = argumentos || [];
    var ambiente = modo();

    var promessa;
    if (ambiente === 'local') {
      promessa = chamarLocal(nome, args);
    } else if (ambiente === 'apps-script') {
      promessa = chamarBridge(nome, args);
    } else {
      promessa = chamarNuvem(nome, args);
    }

    return promessa.catch(function (erro) {
      avisarFaltaDeChave(erro);
      throw erro;
    });
  }

  function chamarLocal(nome, argumentos) {
    return new Promise(function (resolver, rejeitar) {
      if (typeof LocalBackend === 'undefined') {
        rejeitar(
          new Error(
            'Este sistema precisa da pasta js completa ou de uma URL do ' +
            'Apps Script configurada em js/config.js.'
          )
        );
        return;
      }
      LocalBackend.chamar(nome, argumentos || []).then(resolver, rejeitar);
    });
  }

  function chamarBridge(nome, argumentos) {
    return new Promise(function (resolver, rejeitar) {
      var runner = google.script.run
        .withSuccessHandler(function (resposta) {
          try {
            resolver(interpretar(resposta));
          } catch (erro) {
            rejeitar(erro);
          }
        })
        .withFailureHandler(function (erro) {
          var mensagem = erro && erro.message
            ? erro.message
            : 'Falha de comunicação com o servidor. Tente novamente.';
          // Backend antigo: apiExecutar ainda não existe no projeto.
          if (/not found|não encontrada|não existe/i.test(mensagem)) {
            mensagem =
              'O backend publicado é antigo e ainda não tem a chave de ' +
              'acesso. Cole o appsscript.txt atual no editor, salve e ' +
              'publique uma nova versão da implantação.';
          }
          rejeitar(new Error(mensagem));
        });

      if (typeof runner.apiExecutar !== 'function') {
        rejeitar(
          new Error(
            'O backend publicado é antigo e ainda não tem a chave de ' +
            'acesso. Cole o appsscript.txt atual no editor, salve e ' +
            'publique uma nova versão da implantação.'
          )
        );
        return;
      }

      runner.apiExecutar(nome, argumentos || [], chaveAtual());
    });
  }

  function interpretar(resposta) {
    if (!resposta || resposta.ok !== true) {
      var erro = new Error(
        resposta && resposta.erro
          ? resposta.erro
          : 'O servidor não retornou uma resposta válida.'
      );
      // O servidor marca os erros de autenticação com o código "chave".
      if (resposta && resposta.codigo === 'chave') erro.__chave = true;
      throw erro;
    }
    return resposta.data;
  }

  /* ------------------------------------------------------------------ */
  /* Nuvem — HTTP                                                        */
  /* ------------------------------------------------------------------ */

  function chamarNuvem(nome, argumentos) {
    return garantirTransporte().then(function (escolhido) {
      if (escolhido === 'jsonp') {
        return enviarPorJsonp(nome, argumentos).then(interpretar);
      }
      return enviarPorHttp(nome, argumentos).then(interpretar);
    });
  }

  /**
   * Descobre uma única vez, por sessão, se o navegador consegue ler a resposta
   * do POST. O teste usa apiPing, que não altera nenhum dado.
   */
  function garantirTransporte() {
    if (transporte) return Promise.resolve(transporte);
    if (testeEmAndamento) return testeEmAndamento;

    testeEmAndamento = enviarPorHttp('apiPing', [])
      .then(
        function () {
          transporte = 'http';
        },
        function (erro) {
          if (!erro || !erro.__rede) throw erro;
          // Sem permissão de CORS: usa JSONP, que não passa por CORS.
          return enviarPorJsonp('apiPing', []).then(function () {
            transporte = 'jsonp';
          });
        }
      )
      .then(
        function () {
          testeEmAndamento = null;
          return transporte;
        },
        function (erro) {
          testeEmAndamento = null;
          throw erroDeConexao(erro);
        }
      );

    return testeEmAndamento;
  }

  function enviarPorHttp(nome, argumentos) {
    var url = urlConfigurada();
    var controlador =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;

    if (controlador) {
      timer = setTimeout(function () {
        controlador.abort();
      }, tempoLimite());
    }

    return fetch(url, {
      method: 'POST',
      // text/plain evita o preflight de CORS (o Apps Script não responde OPTIONS).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(montarRequisicao(nome, argumentos)),
      redirect: 'follow',
      signal: controlador ? controlador.signal : undefined
    })
      .catch(function (erro) {
        throw erroDeRede(erro);
      })
      .then(function (resposta) {
        if (timer) clearTimeout(timer);
        return resposta.text().then(function (texto) {
          return { status: resposta.status, texto: texto };
        });
      })
      .then(function (retorno) {
        var dados;
        try {
          dados = JSON.parse(retorno.texto);
        } catch (erro) {
          throw erroDeConfiguracao(retorno.status);
        }
        if (!dados || typeof dados !== 'object') {
          throw erroDeConfiguracao(retorno.status);
        }
        return dados;
      });
  }

  /* ------------------------------------------------------------------ */
  /* Nuvem — JSONP                                                       */
  /* ------------------------------------------------------------------ */

  function enviarPorJsonp(nome, argumentos) {
    var base = urlConfigurada();
    var corpo = JSON.stringify(montarRequisicao(nome, argumentos));
    var codificado = encodeURIComponent(corpo);

    if (base.length + codificado.length + 80 <= LIMITE_URL_JSONP) {
      return jsonp(base, corpo);
    }
    return enviarEmPartes(base, corpo);
  }

  function jsonp(base, corpo) {
    return new Promise(function (resolver, rejeitar) {
      var nomeCallback =
        PREFIXO_CALLBACK + (++contadorJsonp) + '_' + Date.now();
      var script = document.createElement('script');
      var encerrado = false;
      var timer = setTimeout(function () {
        finalizar();
        rejeitar(
          erroDeRede(new Error('Tempo esgotado ao falar com o Apps Script.'))
        );
      }, tempoLimite());

      function finalizar() {
        if (encerrado) return;
        encerrado = true;
        clearTimeout(timer);
        try {
          delete window[nomeCallback];
        } catch (erro) {
          window[nomeCallback] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[nomeCallback] = function (resposta) {
        finalizar();
        resolver(resposta);
      };

      script.onerror = function () {
        finalizar();
        rejeitar(
          erroDeRede(
            new Error('Não foi possível carregar a resposta do Apps Script.')
          )
        );
      };

      script.src =
        base +
        '?callback=' + encodeURIComponent(nomeCallback) +
        '&payload=' + encodeURIComponent(corpo) +
        '&_=' + Date.now();
      document.head.appendChild(script);
    });
  }

  /**
   * Envia requisições grandes (por exemplo, importar centenas de alunos) em
   * partes, porque a URL do JSONP tem limite de tamanho.
   */
  function enviarEmPartes(base, corpo) {
    if (corpo.length > LIMITE_CORPO_JSONP) {
      return Promise.reject(
        new Error(
          'O envio é grande demais para este navegador, que precisou usar o ' +
          'modo de compatibilidade (JSONP). Divida a importação em partes ' +
          'menores — por exemplo, uma turma por vez — e tente novamente.'
        )
      );
    }

    var token =
      'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var partes = [];
    var inicio = 0;

    while (inicio < corpo.length) {
      var fim = Math.min(inicio + TAMANHO_PARTE_JSONP, corpo.length);
      // Não corta um par substituto (emoji) ao meio: encodeURIComponent falha.
      if (fim < corpo.length && /[\uD800-\uDBFF]/.test(corpo.charAt(fim - 1))) {
        fim++;
      }
      partes.push(corpo.slice(inicio, fim));
      inicio = fim;
    }

    var cadeia = Promise.resolve();

    partes.forEach(function (parte, numero) {
      cadeia = cadeia.then(function () {
        return jsonp(
          base,
          JSON.stringify(
            montarRequisicao('apiParteEnvio', [
              {
                token: token,
                indice: numero,
                total: partes.length,
                parte: parte
              }
            ])
          )
        ).then(interpretar);
      });
    });

    return cadeia.then(function () {
      return jsonp(
        base,
        JSON.stringify(
          montarRequisicao('apiFinalizarEnvio', [{ token: token }])
        )
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* Erros                                                               */
  /* ------------------------------------------------------------------ */

  function erroDeRede(causa) {
    var erro = new Error(
      'Não foi possível falar com o Apps Script. Verifique a internet, a URL ' +
      'em js/config.js e se a implantação está publicada com acesso ' +
      '"Qualquer pessoa".'
    );
    erro.__rede = true;
    erro.causa = causa;
    return erro;
  }

  function erroDeConexao(erro) {
    if (erro && erro.message) return erro;
    return erroDeRede(erro);
  }

  function erroDeConfiguracao(status) {
    var erro = new Error(
      'O Apps Script respondeu em um formato inesperado' +
      (status ? ' (HTTP ' + status + ')' : '') +
      '. Confira se a URL em js/config.js termina em /exec e se a implantação ' +
      'está publicada com acesso "Qualquer pessoa".'
    );
    erro.__config = true;
    return erro;
  }

  /* ------------------------------------------------------------------ */
  /* Fachada                                                             */
  /* ------------------------------------------------------------------ */

  return {
    local: function () {
      return modo() === 'local';
    },
    chave: function () {
      return chaveAtual();
    },
    definirChave: function (valor) {
      return definirChave(valor);
    },
    semChave: function () {
      var ambiente = modo();
      return (ambiente === 'nuvem' || ambiente === 'apps-script') && !chaveAtual();
    },
    definirAoFaltarChave: function (funcao) {
      aoFaltarChave = typeof funcao === 'function' ? funcao : null;
    },
    conexao: function () {
      return {
        modo: modo(),
        transporte: transporte,
        url: urlConfigurada()
      };
    },
    bootstrap: function () {
      return chamar('apiBootstrap');
    },
    obterTurma: function (id) {
      return chamar('apiObterTurma', [id]);
    },
    criarTurma: function (dados) {
      return chamar('apiCriarTurma', [dados]);
    },
    atualizarTurma: function (id, dados) {
      return chamar('apiAtualizarTurma', [id, dados]);
    },
    excluirTurma: function (id) {
      return chamar('apiExcluirTurma', [id]);
    },
    listarAlunos: function (turmaId) {
      return chamar('apiListarAlunos', [turmaId]);
    },
    adicionarAluno: function (turmaId, nome) {
      return chamar('apiAdicionarAluno', [turmaId, nome]);
    },
    renomearAluno: function (id, nome) {
      return chamar('apiRenomearAluno', [id, nome]);
    },
    excluirAluno: function (id) {
      return chamar('apiExcluirAluno', [id]);
    },
    moverAluno: function (id, direcao) {
      return chamar('apiMoverAluno', [id, direcao]);
    },
    importarAlunos: function (turmaId, payload) {
      return chamar('apiImportarAlunos', [turmaId, payload]);
    },
    listarAvaliacoes: function (turmaId, materiaId, bimestre) {
      return chamar('apiListarAvaliacoes', [turmaId, materiaId, bimestre]);
    },
    criarAvaliacao: function (dados) {
      return chamar('apiCriarAvaliacao', [dados]);
    },
    atualizarAvaliacao: function (id, dados) {
      return chamar('apiAtualizarAvaliacao', [id, dados]);
    },
    excluirAvaliacao: function (id) {
      return chamar('apiExcluirAvaliacao', [id]);
    },
    obterGrade: function (turmaId, materiaId, bimestre) {
      return chamar('apiObterGrade', [turmaId, materiaId, bimestre]);
    },
    salvarNota: function (dados) {
      return chamar('apiSalvarNota', [dados]);
    },
    salvarMediaManual: function (dados) {
      return chamar('apiSalvarMediaManual', [dados]);
    },
    salvarSituacao: function (dados) {
      return chamar('apiSalvarSituacao', [dados]);
    },
    obterBoletim: function (turmaId, materiaId) {
      return chamar('apiObterBoletim', [turmaId, materiaId]);
    },
    obterResumo: function (turmaId) {
      return chamar('apiObterResumo', [turmaId]);
    },
    statusBackup: function () {
      return chamar('apiStatusBackup');
    },
    listarBackups: function () {
      return chamar('apiListarBackups');
    },
    criarBackup: function () {
      return chamar('apiCriarBackup');
    },
    restaurarBackup: function (id) {
      return chamar('apiRestaurarBackup', [id]);
    },
    instalarBackupSemanal: function () {
      return chamar('apiInstalarBackupSemanal');
    }
  };
})();
