/** Tela de backup: status, histórico, criação e restauração de emergência. */
var BackupView = (function () {
  function render(container) {
    container.innerHTML = Ui.carregando('Carregando backups...');
    carregar(container);
  }

  async function carregar(container) {
    try {
      var status = await Api.statusBackup();
      var backups = [];
      try {
        backups = await Api.listarBackups();
      } catch (erroLista) {
        backups = [];
      }

      if (Estado.rota.view !== 'backup') return;

      Estado.backup = status;
      App.atualizarStatusBackup(status);
      montar(container, status, backups);
    } catch (erro) {
      if (Estado.rota.view !== 'backup') return;
      container.innerHTML = Ui.alerta(
        Ui.escaparHtml(erro.message || 'Não foi possível carregar os backups.'),
        'erro'
      );
    }
  }

  function montar(container, status, backups) {
    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<h1 class="page-title">Backup e segurança</h1>' +
          '<p class="page-subtitle">' +
            'Cópias semanais em JSON no Google Drive, com restauração de emergência.' +
          '</p>' +
        '</div>' +
        '<div class="page-actions">' +
          '<button type="button" class="btn btn-primary" data-backup-agora>' +
            Ui.icone('cloud') + 'Fazer backup agora' +
          '</button>' +
        '</div>' +
      '</div>' +
      (status.ultimoErro
        ? '<div style="margin-bottom:16px">' +
            Ui.alerta(
              '<strong>Última falha registrada' +
                (status.ultimoErro.criadoEm
                  ? ' em ' + Ui.escaparHtml(Ui.formatarDataHora(status.ultimoErro.criadoEm))
                  : '') +
                ':</strong> ' +
                Ui.escaparHtml(status.ultimoErro.mensagem || 'erro desconhecido'),
              'aviso'
            ) +
          '</div>'
        : '') +
      '<div class="backup-grid">' +
        cardSemanal(status) +
        cardUltimo(status) +
        cardDados(status) +
      '</div>' +
      cardLista(backups) +
      cardRestauracao();

    ligarEventos(container, backups);
  }

  function cardSemanal(status) {
    var ativo = !!status.triggerAtivo;
    return (
      '<div class="card backup-card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Backup semanal</div>' +
            '<div class="card-subtitle">Automático no Google Drive</div>' +
          '</div>' +
          Ui.badge(ativo ? 'Ativo' : 'Inativo', ativo ? 'badge-success' : 'badge-warning') +
        '</div>' +
        '<div class="card-body">' +
          '<div class="backup-icon">' + Ui.icone('calendar') + '</div>' +
          '<p class="small muted">' +
            (ativo
              ? 'O sistema cria um backup JSON todo domingo às 23h (horário do projeto).'
              : 'O backup automático está inativo. Ative para proteger seus dados toda semana.') +
          '</p>' +
          (status.ultimo
            ? '<p class="small">Último backup: <strong>' +
                Ui.escaparHtml(Ui.formatarDataHora(status.ultimo.criadoEm)) +
              '</strong></p>'
            : '<p class="small">Nenhum backup criado ainda.</p>') +
          (ativo
            ? ''
            : '<div><button type="button" class="btn btn-primary btn-sm" data-ativar-backup>' +
                Ui.icone('refresh') + 'Ativar backup semanal' +
              '</button></div>') +
        '</div>' +
      '</div>'
    );
  }

  function cardUltimo(status) {
    var ultimo = status.ultimo;
    return (
      '<div class="card backup-card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Último backup</div>' +
            '<div class="card-subtitle">Cópia mais recente</div>' +
          '</div>' +
          Ui.badge(status.totalBackups + ' no total', 'badge-muted') +
        '</div>' +
        '<div class="card-body">' +
          (ultimo
            ? '<div class="backup-icon">' + Ui.icone('save') + '</div>' +
              '<div class="eval-info">' +
                '<div class="eval-name">' + Ui.escaparHtml(ultimo.nomeArquivo) + '</div>' +
                '<div class="eval-meta">' +
                  Ui.escaparHtml(Ui.formatarDataHora(ultimo.criadoEm)) + ' · ' +
                  Ui.escaparHtml(Ui.formatarTamanho(ultimo.tamanhoBytes)) + ' · ' +
                  Ui.escaparHtml(origemLabel(ultimo.origem)) +
                '</div>' +
              '</div>' +
              '<div class="backup-actions">' +
                (ultimo.url
                  ? '<a class="btn btn-secondary btn-sm" href="' +
                      Ui.escaparHtml(ultimo.url) +
                      '" target="_blank" rel="noopener">' +
                      Ui.icone('folder') + 'Abrir no Drive</a>'
                  : '') +
                (ultimo.downloadUrl
                  ? '<a class="btn btn-secondary btn-sm" href="' +
                      Ui.escaparHtml(ultimo.downloadUrl) +
                      '" target="_blank" rel="noopener">' +
                      Ui.icone('download') + 'Baixar</a>'
                  : '') +
              '</div>'
            : '<div class="backup-icon">' + Ui.icone('cloud') + '</div>' +
              '<p class="small muted">' +
                'Nenhum backup foi criado ainda. Faça o primeiro agora para proteger seus dados.' +
              '</p>' +
              '<div><button type="button" class="btn btn-primary btn-sm" data-backup-agora>' +
                Ui.icone('cloud') + 'Fazer backup agora' +
              '</button></div>') +
        '</div>' +
      '</div>'
    );
  }

  function cardDados(status) {
    return (
      '<div class="card backup-card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Onde ficam os dados</div>' +
            '<div class="card-subtitle">Planilha e pasta de backups</div>' +
          '</div>' +
          Ui.badge('Google Sheets', 'badge-primary') +
        '</div>' +
        '<div class="card-body">' +
          '<div class="backup-icon">' + Ui.icone('sheet') + '</div>' +
          '<p class="small muted">' +
            'Todos os dados continuam na planilha do Google Sheets. O backup é ' +
            'apenas uma cópia de segurança em JSON. Os backups mais antigos são ' +
            'removidos automaticamente.' +
          '</p>' +
          '<div class="backup-actions">' +
            (status.planilhaUrl
              ? '<a class="btn btn-secondary btn-sm" href="' +
                  Ui.escaparHtml(status.planilhaUrl) +
                  '" target="_blank" rel="noopener">' +
                  Ui.icone('sheet') + 'Abrir planilha</a>'
              : '') +
            (status.pastaUrl
              ? '<a class="btn btn-secondary btn-sm" href="' +
                  Ui.escaparHtml(status.pastaUrl) +
                  '" target="_blank" rel="noopener">' +
                  Ui.icone('folder') + 'Abrir pasta</a>'
              : '') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function cardLista(backups) {
    return (
      '<div class="card" style="margin-bottom:18px">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Backups disponíveis</div>' +
            '<div class="card-subtitle">' +
              backups.length + ' ' +
              Ui.plural(backups.length, 'arquivo encontrado', 'arquivos encontrados') +
            '</div>' +
          '</div>' +
          '<div class="page-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-backup-agora>' +
              Ui.icone('cloud') + 'Fazer backup agora' +
            '</button>' +
          '</div>' +
        '</div>' +
        (backups.length
          ? '<div class="backup-list">' + backups.map(itemBackup).join('') + '</div>'
          : Ui.vazio({
              icone: 'cloud',
              titulo: 'Nenhum backup encontrado',
              texto:
                'Crie o primeiro backup manual ou ative o backup semanal para ' +
                'proteger seus dados automaticamente.',
              acao:
                '<button type="button" class="btn btn-primary" data-backup-agora>' +
                Ui.icone('cloud') + 'Fazer backup agora</button>'
            })) +
      '</div>'
    );
  }

  function itemBackup(backup) {
    var comErro = backup.status === 'erro';
    return (
      '<div class="eval-item">' +
        '<div class="backup-icon" style="width:34px;height:34px;border-radius:9px">' +
          Ui.icone('cloud') +
        '</div>' +
        '<div class="eval-info">' +
          '<div class="eval-name">' + Ui.escaparHtml(backup.nomeArquivo) + '</div>' +
          '<div class="eval-meta">' +
            Ui.escaparHtml(Ui.formatarDataHora(backup.criadoEm)) + ' · ' +
            Ui.escaparHtml(Ui.formatarTamanho(backup.tamanhoBytes)) + ' · ' +
            Ui.escaparHtml(origemLabel(backup.origem)) +
          '</div>' +
          (comErro && backup.mensagem
            ? '<div class="error-text">' + Ui.escaparHtml(backup.mensagem) + '</div>'
            : '') +
        '</div>' +
        '<div class="row-actions no-print">' +
          (backup.downloadUrl
            ? '<a class="icon-btn" href="' + Ui.escaparHtml(backup.downloadUrl) +
                '" target="_blank" rel="noopener" title="Baixar backup" ' +
                'aria-label="Baixar backup">' + Ui.icone('download') + '</a>'
            : '') +
          '<button type="button" class="btn btn-danger-soft btn-sm" ' +
            'data-restaurar-backup="' + Ui.escaparHtml(backup.id) + '">' +
            Ui.icone('restore') + 'Restaurar' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function cardRestauracao() {
    return (
      '<div class="card danger-zone">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Restauração de emergência</div>' +
            '<div class="card-subtitle">Use somente se os dados atuais estiverem incorretos</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<p class="small muted" style="line-height:1.6">' +
            'A restauração substitui todos os dados atuais pelos dados do arquivo ' +
            'escolhido. Antes de alterar a planilha, o sistema cria automaticamente ' +
            'um backup de segurança com o estado atual. A ação exige a digitação de ' +
            '<strong>RESTAURAR</strong> para ser confirmada.' +
          '</p>' +
        '</div>' +
      '</div>'
    );
  }

  function ligarEventos(container, backups) {
    Ui.qsa('[data-backup-agora]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        criarBackup(container);
      });
    });

    var ativar = container.querySelector('[data-ativar-backup]');
    if (ativar) {
      ativar.addEventListener('click', function () {
        ativarBackup(container);
      });
    }

    Ui.qsa('[data-restaurar-backup]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        var backup = encontrarBackup(backups, botao.getAttribute('data-restaurar-backup'));
        if (backup) abrirRestauracao(container, backup);
      });
    });
  }

  async function criarBackup(container) {
    var botoes = Ui.qsa('[data-backup-agora]', container);
    botoes.forEach(function (botao) {
      botao.disabled = true;
    });

    try {
      var resultado = await Api.criarBackup();
      if (resultado.status) App.atualizarStatusBackup(resultado.status);
      Ui.toast('Backup criado: ' + resultado.backup.nomeArquivo, 'sucesso');
      if (Estado.rota.view === 'backup') await carregar(container);
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível criar o backup.', 'erro');
      botoes.forEach(function (botao) {
        botao.disabled = false;
      });
    }
  }

  async function ativarBackup(container) {
    var botao = container.querySelector('[data-ativar-backup]');
    if (botao) {
      botao.disabled = true;
      botao.innerHTML =
        '<span class="spinner" style="width:15px;height:15px"></span> Ativando...';
    }

    try {
      var status = await Api.instalarBackupSemanal();
      App.atualizarStatusBackup(status);
      Ui.toast('Backup semanal ativado.', 'sucesso');
      if (Estado.rota.view === 'backup') await carregar(container);
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível ativar o backup semanal.', 'erro');
      if (botao) {
        botao.disabled = false;
        botao.innerHTML = Ui.icone('refresh') + 'Ativar backup semanal';
      }
    }
  }

  function abrirRestauracao(container, backup) {
    var modal = Ui.abrirModal({
      titulo: 'Restaurar backup',
      subtitulo: backup.nomeArquivo,
      corpo:
        '<div id="restaurar-erro" class="hidden" style="margin-bottom:14px"></div>' +
        Ui.alerta(
          'A restauração substitui <strong>todos</strong> os dados atuais da planilha ' +
          'pelos dados deste backup. Um backup de segurança será criado antes de ' +
          'continuar. Essa ação não pode ser desfeita.',
          'aviso'
        ) +
        '<div class="field" style="margin-top:16px">' +
          '<label class="label" for="restaurar-confirmacao">' +
            'Digite <strong>RESTAURAR</strong> para confirmar' +
          '</label>' +
          '<input class="input" id="restaurar-confirmacao" autocomplete="off" ' +
            'autofocus placeholder="RESTAURAR">' +
        '</div>',
      rodape:
        '<button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>' +
        '<button type="button" class="btn btn-danger" data-confirmar-restauracao disabled>' +
          Ui.icone('restore') + 'Restaurar agora' +
        '</button>'
    });

    var input = modal.corpo.querySelector('#restaurar-confirmacao');
    var erroBox = modal.corpo.querySelector('#restaurar-erro');
    var botao = modal.rodape.querySelector('[data-confirmar-restauracao]');

    input.addEventListener('input', function () {
      botao.disabled = input.value.trim().toUpperCase() !== 'RESTAURAR';
    });

    modal.rodape.querySelector('[data-cancelar]').addEventListener('click', modal.fechar);

    botao.addEventListener('click', async function () {
      if (botao.disabled) return;
      botao.disabled = true;
      var textoOriginal = botao.innerHTML;
      botao.innerHTML =
        '<span class="spinner" style="width:15px;height:15px"></span> Restaurando...';

      try {
        var resultado = await Api.restaurarBackup(backup.id);
        modal.fechar();

        Ui.toast(
          'Backup restaurado. ' + resumoRestauracao(resultado.resumo) + '.',
          'sucesso',
          8000
        );

        if (resultado.avisoSeguranca) {
          Ui.toast(resultado.avisoSeguranca, 'aviso', 10000);
        } else if (resultado.backupSeguranca) {
          Ui.toast('Backup de segurança criado antes da restauração.', 'info', 6000);
        }

        await App.atualizarTurmas();
        if (Estado.rota.view === 'backup') await carregar(container);
      } catch (erro) {
        erroBox.className = 'alert alert-danger';
        erroBox.innerHTML =
          Ui.icone('alert') + '<div>' +
          Ui.escaparHtml(erro.message || 'Não foi possível restaurar o backup.') +
          '</div>';
        botao.disabled = false;
        botao.innerHTML = textoOriginal;
      }
    });
  }

  function resumoRestauracao(resumo) {
    if (!resumo) return 'Nenhum registro informado';
    var itens = [
      ['turmas', 'turma', 'turmas'],
      ['materias', 'matéria', 'matérias'],
      ['alunos', 'aluno', 'alunos'],
      ['avaliacoes', 'avaliação', 'avaliações'],
      ['notas', 'nota', 'notas']
    ];
    return itens
      .filter(function (item) {
        return resumo[item[0]] !== undefined;
      })
      .map(function (item) {
        var total = Number(resumo[item[0]]) || 0;
        return total + ' ' + Ui.plural(total, item[1], item[2]);
      })
      .join(' · ');
  }

  function encontrarBackup(backups, id) {
    for (var i = 0; i < backups.length; i += 1) {
      if (backups[i].id === id) return backups[i];
    }
    return null;
  }

  function origemLabel(origem) {
    var rotulos = {
      manual: 'Manual',
      semanal: 'Semanal',
      'pre-restauracao': 'Antes de restaurar'
    };
    return rotulos[origem] || 'Desconhecida';
  }

  return {
    render: render
  };
})();
