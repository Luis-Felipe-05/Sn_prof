/** Moldura da turma: cabeçalho, abas e despacho para a aba ativa. */
var TurmaView = (function () {
  function render(container, turmaId, aba) {
    aba = normalizarAba(aba);

    if (!Estado.turma || Estado.turma.id !== turmaId) {
      container.innerHTML = Ui.carregando('Carregando turma...');
      carregar(container, turmaId, aba);
      return;
    }

    montar(container, Estado.turma, aba);
  }

  async function carregar(container, turmaId, aba) {
    try {
      var turma = await Api.obterTurma(turmaId);
      if (Estado.rota.view !== 'turma' || Estado.rota.turmaId !== turmaId) return;

      if (!turma) {
        container.innerHTML = Ui.vazio({
          icone: 'alert',
          titulo: 'Turma não encontrada',
          texto: 'A turma pode ter sido excluída ou o link está incorreto.',
          acao:
            '<button type="button" class="btn btn-secondary" data-voltar-turmas>' +
            Ui.icone('arrowLeft') + 'Voltar para Turmas</button>'
        });
        var voltar = container.querySelector('[data-voltar-turmas]');
        if (voltar) {
          voltar.addEventListener('click', function () {
            App.navegarTurmas();
          });
        }
        return;
      }

      Estado.turmaAtualizada(turma);
      montar(container, turma, aba);
    } catch (erro) {
      if (Estado.rota.view !== 'turma' || Estado.rota.turmaId !== turmaId) return;
      container.innerHTML = Ui.alerta(
        Ui.escaparHtml(erro.message || 'Não foi possível carregar a turma.'),
        'erro'
      );
    }
  }

  function montar(container, turma, aba) {
    var abas = [
      { id: 'alunos', rotulo: 'Alunos', icone: 'users', contagem: turma.totalAlunos, chave: 'alunos' },
      { id: 'notas', rotulo: 'Notas', icone: 'clipboard', contagem: turma.totalAvaliacoes, chave: 'avaliacoes' },
      { id: 'boletim', rotulo: 'Boletim', icone: 'chart', contagem: turma.materias.length, chave: 'materias' }
    ];

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="breadcrumb">' +
            '<button type="button" data-voltar-turmas>' +
              Ui.icone('arrowLeft') + 'Turmas' +
            '</button>' +
            '<span aria-hidden="true">/</span>' +
            '<span>' + Ui.escaparHtml(turma.nome) + '</span>' +
          '</div>' +
          '<h1 class="page-title">' + Ui.escaparHtml(turma.nome) + '</h1>' +
          '<p class="page-subtitle" data-subtitulo-turma>' +
            subtitulo(turma) +
          '</p>' +
        '</div>' +
        '<div class="page-actions no-print">' +
          '<button type="button" class="btn btn-secondary" data-editar-turma-view>' +
            Ui.icone('edit') + 'Editar turma' +
          '</button>' +
          '<button type="button" class="btn btn-danger-soft" data-excluir-turma-view>' +
            Ui.icone('trash') + 'Excluir' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="tabs no-print" role="tablist" aria-label="Seções da turma">' +
        abas.map(function (item) {
          var ativo = item.id === aba;
          return (
            '<button type="button" class="tab ' + (ativo ? 'ativo' : '') + '" ' +
              'role="tab" aria-selected="' + (ativo ? 'true' : 'false') + '" ' +
              'data-aba-turma="' + item.id + '">' +
              Ui.icone(item.icone) +
              Ui.escaparHtml(item.rotulo) +
              '<span class="badge" data-contagem="' + item.chave + '">' +
                item.contagem +
              '</span>' +
            '</button>'
          );
        }).join('') +
      '</div>' +
      '<div id="turma-tab-painel"></div>';

    var painel = container.querySelector('#turma-tab-painel');

    container.querySelector('[data-voltar-turmas]').addEventListener('click', function () {
      App.navegarTurmas();
    });

    container.querySelector('[data-editar-turma-view]').addEventListener('click', function () {
      TurmasView.abrirFormulario(turma, function () {
        App.recarregarRota();
      });
    });

    container.querySelector('[data-excluir-turma-view]').addEventListener('click', function () {
      TurmasView.excluirTurma(turma);
    });

    Ui.qsa('[data-aba-turma]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        var destino = botao.getAttribute('data-aba-turma');
        if (destino === Estado.rota.aba) return;
        App.navegarTurma(turma.id, destino);
      });
    });

    if (aba === 'notas') {
      NotasTab.render(painel, turma);
    } else if (aba === 'boletim') {
      BoletimTab.render(painel, turma);
    } else {
      AlunosTab.render(painel, turma);
    }
  }

  function subtitulo(turma) {
    return (
      'Ano ' + turma.ano +
      ' · ' + turma.totalAlunos + ' ' +
      Ui.plural(turma.totalAlunos, 'aluno', 'alunos') +
      ' · ' + turma.materias.length + ' ' +
      Ui.plural(turma.materias.length, 'matéria', 'matérias')
    );
  }

  function normalizarAba(aba) {
    return aba === 'notas' || aba === 'boletim' ? aba : 'alunos';
  }

  return {
    render: render
  };
})();
