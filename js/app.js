/**
 * Inicialização, roteamento por hash e atualização da moldura (sidebar).
 */
var App = (function () {
  var eventosLigados = false;
  var chavePendente = null;

  function iniciar() {
    ligarEventos();

    var conteudo = document.getElementById('conteudo');
    if (conteudo) conteudo.innerHTML = Ui.carregando('Carregando sistema...');

    // Primeira abertura neste navegador: pede a chave antes de qualquer
    // chamada à nuvem. Sem chave não há o que buscar no servidor.
    if (Api.semChave()) {
      pedirChave('').then(function (ok) {
        if (ok) {
          iniciar();
        } else {
          var erroSemChave = new Error(
            'É preciso a chave de acesso para conectar à nuvem. Ela é ' +
            'criada uma vez no editor do Apps Script, em Configurações do ' +
            'projeto → Propriedades do script (propriedade CHAVE_ACESSO).'
          );
          erroSemChave.__chave = true;
          mostrarErroInicial(erroSemChave);
        }
      });
      return;
    }

    carregarDadosIniciais()
      .then(function () {
        if (!location.hash) {
          try {
            history.replaceState(null, '', '#/turmas');
          } catch (erro) {
            location.hash = '#/turmas';
          }
        }
        tratarRota();
      })
      .catch(function (erro) {
        if (erro && erro.__chave) {
          // O modal da chave já está aberto (abrído pelo Api) ou será aberto
          // aqui. Se o usuário salvar, o próprio modal reinicia a conexão;
          // se desistir, fica o erro na tela.
          pedirChave(erro.message).then(function (ok) {
            if (!ok) mostrarErroInicial(erro);
          });
          return;
        }
        mostrarErroInicial(erro);
      });
  }

  function ligarEventos() {
    if (eventosLigados) return;
    eventosLigados = true;

    // Chave errada ou trocada no meio do uso: pede de novo, sem derrubar a
    // navegação. Quem está no meio do carregamento inicial cuida do erro no
    // próprio iniciar().
    Api.definirAoFaltarChave(function (erro) {
      if (!Estado.app) return;
      pedirChave(erro.message);
    });

    Ui.qsa('[data-nav]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var destino = botao.getAttribute('data-nav');
        if (destino === 'backup') {
          navegarBackup();
        } else {
          navegarTurmas();
        }
      });
    });

    var botaoChave = document.getElementById('sidebar-chave');
    if (botaoChave) {
      botaoChave.addEventListener('click', function () {
        pedirChave(
          'Você já está conectado. Troque a chave apenas se ela tiver ' +
          'mudado no editor do Apps Script.'
        );
      });
    }

    window.addEventListener('hashchange', tratarRota);
  }

  /**
   * Modal da chave de acesso. Salvar grava a chave só neste navegador e
   * reinicia a conexão; cancelar mantém o erro na tela. Devolve uma
   * Promise<boolean> e, se o modal já estiver aberto, a mesma promessa.
   */
  function pedirChave(motivo) {
    if (chavePendente) return chavePendente;

    var promessa = new Promise(function (resolver) {
      var corpo =
        '<div class="stack">' +
          (motivo ? Ui.alerta(Ui.escaparHtml(motivo), 'aviso') : '') +
          '<div class="field">' +
            '<label class="label" for="campo-chave">Chave de acesso</label>' +
            '<input class="input" type="password" id="campo-chave" ' +
              'autocomplete="off" autofocus ' +
              'placeholder="a chave definida no Apps Script">' +
          '</div>' +
          '<p class="muted small">Ela foi criada uma única vez no editor do ' +
          'Apps Script (<strong>Configurações do projeto</strong> → ' +
          '<strong>Propriedades do script</strong> → <code>CHAVE_ACESSO</code>) ' +
          'e fica guardada apenas neste navegador.</p>' +
        '</div>';

      var modal = Ui.abrirModal({
        titulo: 'Chave de acesso',
        subtitulo: 'Informe a chave para conectar à nuvem.',
        corpo: corpo,
        rodape:
          '<button type="button" class="btn btn-secondary" data-cancelar>' +
            'Cancelar</button>' +
          '<button type="button" class="btn btn-primary" data-salvar>' +
            'Salvar e conectar</button>',
        aoFechar: function () {
          resolver(false);
        }
      });

      var campo = modal.corpo.querySelector('#campo-chave');

      function salvar() {
        var valor = String((campo && campo.value) || '').trim();
        if (!valor) {
          Ui.toast('Digite a chave de acesso.', 'aviso');
          if (campo) campo.focus();
          return;
        }
        Api.definirChave(valor);
        // Resolve antes de fechar: fechar() dispara aoFechar, que
        // resolveria false.
        resolver(true);
        modal.fechar();
        iniciar();
      }

      modal.rodape
        .querySelector('[data-salvar]')
        .addEventListener('click', salvar);
      modal.rodape
        .querySelector('[data-cancelar]')
        .addEventListener('click', function () {
          modal.fechar();
        });
      if (campo) {
        campo.addEventListener('keydown', function (evento) {
          if (evento.key === 'Enter') {
            evento.preventDefault();
            salvar();
          }
        });
      }
    });

    chavePendente = promessa;
    promessa.then(function () {
      if (chavePendente === promessa) chavePendente = null;
    });
    return promessa;
  }

  async function carregarDadosIniciais() {
    var dados = await Api.bootstrap();
    Estado.app = dados.app;
    Estado.definirTurmas(dados.turmas);
    Estado.backup = dados.backup;
    atualizarSidebar();
  }

  function mostrarErroInicial(erro) {
    var conteudo = document.getElementById('conteudo');
    if (!conteudo) return;

    var conexao = Api.conexao();
    var dica;

    if (erro && erro.__chave) {
      dica = 'Informe a <strong>chave de acesso</strong> criada no editor do ' +
        'Apps Script, em <strong>Configurações do projeto</strong> → ' +
        '<strong>Propriedades do script</strong> (propriedade ' +
        '<code>CHAVE_ACESSO</code>).';
    } else if (conexao.modo === 'nuvem') {
      dica = 'Confira se a URL em <strong>js/config.js</strong> termina em ' +
        '<code>/exec</code> e se a implantação está publicada com acesso ' +
        '"Qualquer pessoa".';
    } else {
      dica = 'Verifique se o aplicativo web do Apps Script está publicado e ' +
        'autorizado na sua conta Google.';
    }

    conteudo.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<h1 class="page-title">Não foi possível abrir o sistema</h1>' +
          '<p class="page-subtitle">' + dica + '</p>' +
        '</div>' +
      '</div>' +
      Ui.alerta(
        Ui.escaparHtml(erro.message || 'Falha ao carregar os dados iniciais.'),
        'erro'
      ) +
      '<div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap">' +
        (erro && erro.__chave
          ? '<button type="button" class="btn btn-primary" id="informar-chave">' +
              Ui.icone('lock') + 'Informar chave' +
            '</button>'
          : '') +
        '<button type="button" class="btn ' +
          (erro && erro.__chave ? 'btn-secondary' : 'btn-primary') +
          '" id="tentar-novamente">' +
          Ui.icone('refresh') + 'Tentar novamente' +
        '</button>' +
      '</div>';

    var botao = document.getElementById('tentar-novamente');
    if (botao) {
      botao.addEventListener('click', function () {
        iniciar();
      });
    }

    var botaoChave = document.getElementById('informar-chave');
    if (botaoChave) {
      botaoChave.addEventListener('click', function () {
        pedirChave(erro.message);
      });
    }
  }

  function lerRota() {
    var hash = String(location.hash || '').replace(/^#\/?/, '');
    var partes = hash.split('/').filter(function (parte) {
      return !!parte;
    });

    if (partes[0] === 'turma' && partes[1]) {
      return {
        view: 'turma',
        turmaId: decodeURIComponent(partes[1]),
        aba: normalizarAba(partes[2])
      };
    }

    if (partes[0] === 'backup') {
      return { view: 'backup', turmaId: null, aba: 'alunos' };
    }

    return { view: 'turmas', turmaId: null, aba: 'alunos' };
  }

  function tratarRota() {
    if (!Estado.app) return;

    var rota = lerRota();

    if (rota.view === 'turma') {
      if (!Estado.turma || Estado.turma.id !== rota.turmaId) {
        Estado.limparTurma();
      }
    } else if (Estado.turma) {
      Estado.limparTurma();
    }

    Estado.rota = rota;
    atualizarNav();
    atualizarTitulo();
    renderizarRota();
  }

  function renderizarRota() {
    var conteudo = document.getElementById('conteudo');
    if (!conteudo) return;

    conteudo.innerHTML = '';
    var alvo = document.createElement('div');
    alvo.className = 'view-root';
    conteudo.appendChild(alvo);

    try {
      if (Estado.rota.view === 'turma') {
        TurmaView.render(alvo, Estado.rota.turmaId, Estado.rota.aba);
      } else if (Estado.rota.view === 'backup') {
        BackupView.render(alvo);
      } else {
        TurmasView.render(alvo);
      }
    } catch (erro) {
      alvo.innerHTML = Ui.alerta(
        Ui.escaparHtml(erro.message || 'Erro ao abrir a tela.'),
        'erro'
      );
    }
  }

  function atualizarNav() {
    Ui.qsa('[data-nav]').forEach(function (botao) {
      var destino = botao.getAttribute('data-nav');
      var ativo =
        (destino === 'turmas' &&
          (Estado.rota.view === 'turmas' || Estado.rota.view === 'turma')) ||
        (destino === 'backup' && Estado.rota.view === 'backup');
      botao.classList.toggle('ativo', ativo);
    });
  }

  function atualizarTitulo() {
    var titulo = 'Sistema de Notas';
    if (Estado.rota.view === 'backup') {
      titulo = 'Backup · ' + titulo;
    } else if (Estado.rota.view === 'turma') {
      var turma = Estado.turmaPorId(Estado.rota.turmaId) || Estado.turma;
      if (turma) titulo = turma.nome + ' · ' + titulo;
    }
    document.title = titulo;
  }

  function navegarTurmas() {
    if (location.hash === '#/turmas') return;
    location.hash = '#/turmas';
  }

  function navegarTurma(turmaId, aba) {
    var destino =
      '#/turma/' + encodeURIComponent(turmaId) + '/' + normalizarAba(aba);
    if (location.hash === destino) return;
    location.hash = destino;
  }

  function navegarBackup() {
    if (location.hash === '#/backup') return;
    location.hash = '#/backup';
  }

  function recarregarRota() {
    renderizarRota();
  }

  async function atualizarTurmas() {
    try {
      var dados = await Api.bootstrap();
      Estado.app = dados.app;
      Estado.definirTurmas(dados.turmas);
      Estado.backup = dados.backup;
      atualizarSidebar();

      if (Estado.rota.view !== 'turma') {
        Estado.limparTurma();
      }

      if (
        Estado.rota.view === 'turma' &&
        !Estado.turmaPorId(Estado.rota.turmaId)
      ) {
        navegarTurmas();
        return;
      }

      if (Estado.rota.view === 'turmas') {
        renderizarRota();
      }
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível atualizar as turmas.', 'erro');
    }
  }

  async function atualizarContagens() {
    if (Estado.rota.view !== 'turma' || !Estado.rota.turmaId) return;

    try {
      var turma = await Api.obterTurma(Estado.rota.turmaId);
      if (!turma) return;
      if (
        Estado.rota.view !== 'turma' ||
        Estado.rota.turmaId !== turma.id
      ) {
        return;
      }

      Estado.turmaAtualizada(turma);
      atualizarContadoresTurma(turma);
      atualizarTitulo();
    } catch (erro) {
      // A atualização de contadores é secundária; não interrompe o fluxo.
    }
  }

  function atualizarContadoresTurma(turma) {
    var contagens = {
      alunos: turma.totalAlunos,
      avaliacoes: turma.totalAvaliacoes,
      materias: turma.materias.length
    };

    Object.keys(contagens).forEach(function (chave) {
      Ui.qsa('[data-contagem="' + chave + '"]').forEach(function (elemento) {
        elemento.textContent = contagens[chave];
      });
    });

    var subtitulo = document.querySelector('[data-subtitulo-turma]');
    if (subtitulo) {
      subtitulo.textContent =
        'Ano ' + turma.ano +
        ' · ' + turma.totalAlunos + ' ' +
        Ui.plural(turma.totalAlunos, 'aluno', 'alunos') +
        ' · ' + turma.materias.length + ' ' +
        Ui.plural(turma.materias.length, 'matéria', 'matérias');
    }
  }

  function atualizarStatusBackup(status) {
    if (status) Estado.backup = status;
    renderStatusBackup(Estado.backup);
  }

  function atualizarSidebar() {
    var conexao = Api.conexao();
    var versao = document.getElementById('sidebar-versao');
    if (versao) {
      var base = Estado.app
        ? Estado.app.nome + ' v' + Estado.app.versao
        : 'Sistema de Notas';
      var rotulo = conexao.modo === 'local' ? 'modo local' : 'nuvem';

      versao.textContent = base + ' · ' + rotulo;
      versao.title =
        conexao.modo === 'nuvem'
          ? 'Conectado a ' + conexao.url +
            ' (' + (conexao.transporte || 'verificando') + ')'
          : conexao.modo === 'local'
            ? 'Demonstração: os dados ficam apenas neste navegador.'
            : 'Aberto pela implantação do Apps Script.';
    }

    var botaoChave = document.getElementById('sidebar-chave');
    if (botaoChave) botaoChave.hidden = conexao.modo === 'local';

    renderStatusBackup(Estado.backup);
  }

  function renderStatusBackup(status) {
    var ponto = document.getElementById('sidebar-backup-dot');
    var texto = document.getElementById('sidebar-backup-texto');
    if (!ponto || !texto) return;

    if (!status) {
      ponto.className = 'status-dot';
      texto.textContent = 'Verificando...';
      return;
    }

    if (status.ultimo) {
      ponto.className = 'status-dot ok';
      texto.textContent = 'Último: ' + Ui.formatarData(status.ultimo.criadoEm);
    } else if (status.ultimoErro) {
      ponto.className = 'status-dot erro';
      texto.textContent = 'Falha no backup';
    } else {
      ponto.className = 'status-dot';
      texto.textContent = 'Nenhum backup ainda';
    }
  }

  function normalizarAba(aba) {
    return aba === 'notas' || aba === 'boletim' ? aba : 'alunos';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  return {
    navegarTurmas: navegarTurmas,
    navegarTurma: navegarTurma,
    navegarBackup: navegarBackup,
    recarregarRota: recarregarRota,
    atualizarTurmas: atualizarTurmas,
    atualizarContagens: atualizarContagens,
    atualizarStatusBackup: atualizarStatusBackup
  };
})();
