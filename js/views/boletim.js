/** Aba de boletim: visão por matéria e resumo geral da turma. */
var BoletimTab = (function () {
  /** Opções da coluna "Situação final" (chave = valor gravado no backend). */
  var SITUACOES = [
    { valor: '', rotulo: '—' },
    { valor: 'aprovado', rotulo: 'Aprovado' },
    { valor: 'reprovado', rotulo: 'Reprovado' },
    { valor: 'aprovado_conselho', rotulo: 'Aprovado pelo conselho' },
    { valor: 'reprovado_conselho', rotulo: 'Reprovado pelo conselho' },
    { valor: 'reprovado_frequencia', rotulo: 'Reprovado por frequência' },
    { valor: 'reprovado_nota', rotulo: 'Reprovado por nota' }
  ];
  function render(container, turma) {
    if (!turma.materias.length) {
      container.innerHTML = Ui.vazio({
        icone: 'book',
        titulo: 'Cadastre uma matéria primeiro',
        texto:
          'O boletim é calculado por matéria. Edite a turma para adicionar as ' +
          'matérias que você leciona.',
        acao:
          '<button type="button" class="btn btn-primary" data-editar-turma-boletim>' +
          Ui.icone('edit') + 'Editar turma</button>'
      });
      var botaoEditar = container.querySelector('[data-editar-turma-boletim]');
      if (botaoEditar) {
        botaoEditar.addEventListener('click', function () {
          TurmasView.abrirFormulario(turma, function () {
            App.recarregarRota();
          });
        });
      }
      return;
    }

    var modo = Estado.modoBoletim === 'geral' ? 'geral' : 'materia';
    Estado.modoBoletim = modo;

    var materiaId = Estado.materiaBoletimId;
    if (!materiaId || !encontrarMateria(turma, materiaId)) {
      materiaId = turma.materias[0].id;
    }
    Estado.materiaBoletimId = materiaId;

    carregar(container, turma, modo, materiaId);
  }

  async function carregar(container, turma, modo, materiaId) {
    container.innerHTML = Ui.carregando('Calculando boletim...');
    try {
      if (modo === 'geral') {
        var resumo = await Api.obterResumo(turma.id);
        if (!respostaAtual(turma, modo, materiaId)) return;
        Estado.resumo = resumo;
        montar(container, turma, modo, null, resumo);
      } else {
        var boletim = await Api.obterBoletim(turma.id, materiaId);
        if (!respostaAtual(turma, modo, materiaId)) return;
        Estado.boletim = boletim;
        montar(container, turma, modo, boletim, null);
      }
    } catch (erro) {
      if (!respostaAtual(turma, modo, materiaId)) return;
      container.innerHTML = Ui.alerta(
        Ui.escaparHtml(erro.message || 'Não foi possível calcular o boletim.'),
        'erro'
      );
    }
  }

  function respostaAtual(turma, modo, materiaId) {
    return (
      Estado.rota.view === 'turma' &&
      Estado.rota.turmaId === turma.id &&
      Estado.rota.aba === 'boletim' &&
      Estado.modoBoletim === modo &&
      (modo === 'geral' || Estado.materiaBoletimId === materiaId)
    );
  }

  function montar(container, turma, modo, boletim, resumo) {
    var alunos = modo === 'materia' ? boletim.alunos : resumo.alunos;
    var materia = modo === 'materia' ? boletim.materia : null;

    var html =
      toolbar(turma, modo) +
      cabecalhoImpressao(turma, modo, materia) +
      resumoCards(turma, modo, boletim, resumo);

    if (!alunos.length) {
      html += Ui.vazio({
        icone: 'users',
        titulo: 'Nenhum aluno para avaliar',
        texto:
          'Cadastre ou importe os alunos da turma para gerar o boletim.',
        acao:
          '<button type="button" class="btn btn-secondary" data-ir-alunos-boletim>' +
          Ui.icone('users') + 'Ir para Alunos</button>'
      });
    } else if (modo === 'materia') {
      html += cardMateria(boletim);
    } else {
      html += cardGeral(resumo);
    }

    container.innerHTML = html;
    ligarEventos(container, turma);
  }

  function toolbar(turma, modo) {
    return (
      '<div class="card no-print" style="margin-bottom:16px">' +
        '<div class="card-body tight">' +
          '<div class="toolbar">' +
            '<div class="segmented" role="group" aria-label="Modo do boletim">' +
              '<button type="button" data-modo-boletim="materia" class="' +
                (modo === 'materia' ? 'ativo' : '') + '">Por matéria</button>' +
              '<button type="button" data-modo-boletim="geral" class="' +
                (modo === 'geral' ? 'ativo' : '') + '">Resumo geral</button>' +
            '</div>' +
            (modo === 'materia'
              ? '<div class="field" style="max-width:280px; flex:0 1 280px">' +
                  '<label class="label" for="boletim-materia">Matéria</label>' +
                  '<select class="select" id="boletim-materia">' +
                    turma.materias.map(function (materia) {
                      return '<option value="' + Ui.escaparHtml(materia.id) + '"' +
                        (materia.id === Estado.materiaBoletimId ? ' selected' : '') +
                        '>' + Ui.escaparHtml(materia.nome) + '</option>';
                    }).join('') +
                  '</select>' +
                '</div>'
              : '') +
            '<div class="spacer"></div>' +
            '<button type="button" class="btn btn-secondary btn-sm" data-imprimir-boletim>' +
              Ui.icone('printer') + 'Imprimir boletim' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function cabecalhoImpressao(turma, modo, materia) {
    return (
      '<div class="print-only" style="margin-bottom:16px">' +
        '<div style="font-size:18px; font-weight:750">' +
          Ui.escaparHtml(turma.nome) + ' — ' +
          Ui.escaparHtml(modo === 'materia' ? materia.nome : 'Resumo geral') +
        '</div>' +
        '<div class="muted small">Ano ' + turma.ano +
          ' · Emitido em ' + new Date().toLocaleDateString('pt-BR') +
        '</div>' +
      '</div>'
    );
  }

  function resumoCards(turma, modo, boletim, resumo) {
    if (modo === 'materia') {
      var totalAvaliacoes = contarAvaliacoes(boletim.avaliacoesPorBimestre);
      var completos = boletim.alunos.filter(function (aluno) {
        return aluno.finalCompleto;
      }).length;
      return (
        '<div class="summary-cards">' +
          stat('Média final da turma', Ui.formatarNota(boletim.mediaFinalTurma)) +
          stat('Alunos', String(boletim.alunos.length)) +
          stat('Avaliações', String(totalAvaliacoes)) +
          stat('Boletins completos', completos + ' / ' + boletim.alunos.length) +
        '</div>'
      );
    }

    var completosGeral = resumo.alunos.filter(function (aluno) {
      return aluno.completo;
    }).length;
    return (
      '<div class="summary-cards">' +
        stat('Média geral da turma', Ui.formatarNota(resumo.mediaGeralTurma)) +
        stat('Alunos', String(resumo.alunos.length)) +
        stat('Matérias', String(resumo.materias.length)) +
        stat('Boletins completos', completosGeral + ' / ' + resumo.alunos.length) +
      '</div>'
    );
  }

  function stat(rotulo, valor) {
    return (
      '<div class="stat">' +
        '<div class="stat-label">' + Ui.escaparHtml(rotulo) + '</div>' +
        '<div class="stat-value">' + valor + '</div>' +
      '</div>'
    );
  }

  function cardMateria(boletim) {
    return (
      '<div class="card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Boletim por matéria</div>' +
            '<div class="card-subtitle">' +
              Ui.escaparHtml(boletim.materia.nome) + ' · ' +
              Ui.escaparHtml(boletim.turma.nome) +
            '</div>' +
          '</div>' +
          '<div class="row no-print">' +
            Ui.badge('Média ponderada', 'badge-primary') +
          '</div>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table">' +
            '<thead><tr>' +
              '<th>Aluno</th>' +
              boletim.bimestres.map(function (bimestre) {
                var peso = boletim.pesoPorBimestre[bimestre];
                return '<th class="center">' + bimestre + 'º bimestre' +
                  (peso
                    ? '<span class="eval-header-peso">Peso ' + formatarPercentual(peso) + '</span>'
                    : '') +
                  '</th>';
              }).join('') +
              '<th class="center">Média final</th>' +
              '<th class="center">Situação final</th>' +
            '</tr></thead>' +
            '<tbody>' +
              boletim.alunos.map(function (aluno) {
                return (
                  '<tr>' +
                    '<td><span class="student-name">' +
                      Ui.escaparHtml(aluno.nome) + '</span></td>' +
                    boletim.bimestres.map(function (bimestre) {
                      var calculo = aluno.bimestres[bimestre] || {};
                      return '<td class="center">' +
                        celulaEditavel({
                          alunoId: aluno.id,
                          alunoNome: aluno.nome,
                          materiaId: boletim.materia.id,
                          materiaNome: boletim.materia.nome,
                          escopo: 'bimestre',
                          bimestre: bimestre,
                          valor: calculo.media,
                          automatica: calculo.mediaAutomatica,
                          manual: calculo.manual,
                          completo: calculo.completo,
                          titulo: 'Peso lançado: ' +
                            formatarPercentual(calculo.pesoConsiderado) +
                            ' de ' + formatarPercentual(calculo.pesoTotal)
                        }) +
                      '</td>';
                    }).join('') +
                    '<td class="center">' +
                      celulaEditavel({
                        alunoId: aluno.id,
                        alunoNome: aluno.nome,
                        materiaId: boletim.materia.id,
                        materiaNome: boletim.materia.nome,
                        escopo: 'final',
                        valor: aluno.mediaFinal,
                        automatica: aluno.mediaFinalAutomatica,
                        manual: aluno.mediaFinalManual,
                        completo: aluno.finalCompleto,
                        subParcial:
                          (aluno.bimestresConsiderados || 0) + '/4 bim.',
                        titulo: aluno.finalCompleto
                          ? ''
                          : (aluno.bimestresConsiderados || 0) +
                            ' de 4 bimestres considerados'
                      }) +
                    '</td>' +
                    '<td class="center">' +
                      celulaSituacao(aluno) +
                    '</td>' +
                  '</tr>'
                );
              }).join('') +
            '</tbody>' +
            '<tfoot><tr>' +
              '<td>Média da turma</td>' +
              boletim.bimestres.map(function (bimestre) {
                return '<td class="center">' +
                  celulaMedia(boletim.mediasTurma[bimestre], false, '') +
                '</td>';
              }).join('') +
              '<td class="center">' +
                celulaMedia(boletim.mediaFinalTurma, false, '') +
              '</td>' +
              '<td></td>' +
            '</tr></tfoot>' +
          '</table>' +
        '</div>' +
        '<div class="card-footer legend">' +
          '<strong>Como calculamos:</strong> a média do bimestre é a soma de ' +
          '(nota × peso) dividida pela soma dos pesos já lançados. A média final ' +
          'é a média aritmética dos bimestres com notas. Células marcadas como ' +
          '<strong>parcial</strong> usam apenas as avaliações já lançadas. ' +
          'Clique em qualquer média para digitar um valor manual. A média marcada ' +
          'como <strong>manual</strong> substitui o cálculo até você apagá-la.' +
        '</div>' +
      '</div>'
    );
  }

  function cardGeral(resumo) {
    return (
      '<div class="card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">Resumo geral da turma</div>' +
            '<div class="card-subtitle">' +
              Ui.escaparHtml(resumo.turma.nome) + ' · ' +
              resumo.materias.length + ' ' +
              Ui.plural(resumo.materias.length, 'matéria', 'matérias') +
            '</div>' +
          '</div>' +
          '<div class="row no-print">' +
            Ui.badge('Média das matérias', 'badge-primary') +
          '</div>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="table">' +
            '<thead><tr>' +
              '<th>Aluno</th>' +
              resumo.materias.map(function (materia) {
                return '<th class="center">' + Ui.escaparHtml(materia.nome) + '</th>';
              }).join('') +
              '<th class="center">Média geral</th>' +
            '</tr></thead>' +
            '<tbody>' +
              resumo.alunos.map(function (aluno) {
                return (
                  '<tr>' +
                    '<td><span class="student-name">' +
                      Ui.escaparHtml(aluno.nome) + '</span></td>' +
                    resumo.materias.map(function (materia) {
                      var item = aluno.materias[materia.id];
                      return '<td class="center">' +
                        celulaEditavel({
                          alunoId: aluno.id,
                          alunoNome: aluno.nome,
                          materiaId: materia.id,
                          materiaNome: materia.nome,
                          escopo: 'final',
                          valor: item ? item.mediaFinal : null,
                          automatica: item ? item.mediaFinalAutomatica : null,
                          manual: item ? item.mediaFinalManual : false,
                          completo: item ? item.completo : false,
                          subParcial: item
                            ? (item.bimestresConsiderados || 0) + '/4 bim.'
                            : '',
                          titulo: item && item.completo
                            ? ''
                            : 'Média calculada com os bimestres já lançados'
                        }) +
                      '</td>';
                    }).join('') +
                    '<td class="center">' +
                      celulaMedia(
                        aluno.mediaGeral,
                        !aluno.completo,
                        aluno.completo
                          ? ''
                          : 'Média calculada com as matérias já lançadas'
                      ) +
                    '</td>' +
                  '</tr>'
                );
              }).join('') +
            '</tbody>' +
            '<tfoot><tr>' +
              '<td>Média da turma</td>' +
              resumo.materias.map(function (materia) {
                return '<td class="center">' +
                  celulaMedia(resumo.mediasPorMateria[materia.id], false, '') +
                '</td>';
              }).join('') +
              '<td class="center">' +
                celulaMedia(resumo.mediaGeralTurma, false, '') +
              '</td>' +
            '</tr></tfoot>' +
          '</table>' +
        '</div>' +
        '<div class="card-footer legend">' +
          '<strong>Como calculamos:</strong> cada matéria tem sua média final ' +
          '(média aritmética dos bimestres com notas). A média geral do aluno é ' +
          'a média aritmética das médias finais das matérias. Células marcadas ' +
          'como <strong>parcial</strong> ainda têm bimestres sem notas. Clique em ' +
          'uma média final de matéria para digitá-la manualmente; a média geral ' +
          'continua sendo calculada a partir desses valores.' +
        '</div>' +
      '</div>'
    );
  }

  /** Select com a situação final do aluno na matéria. */
  function celulaSituacao(aluno) {
    var atual = aluno.situacao || '';
    return (
      '<select class="select situacao-select" ' +
        'data-situacao data-aluno-id="' + Ui.escaparHtml(aluno.id) + '" ' +
        'data-valor-anterior="' + Ui.escaparHtml(atual) + '" ' +
        'title="Situação final de ' + Ui.escaparHtml(aluno.nome) + '">' +
        SITUACOES.map(function (opcao) {
          return '<option value="' + Ui.escaparHtml(opcao.valor) + '"' +
            (opcao.valor === atual ? ' selected' : '') + '>' +
            Ui.escaparHtml(opcao.rotulo) + '</option>';
        }).join('') +
      '</select>'
    );
  }

  function celulaMedia(valor, parcial, titulo) {
    if (valor === null || valor === undefined || valor === '') {
      return '<span class="media-cell vazia">—</span>';
    }
    return (
      '<span class="media-cell ' + (parcial ? 'parcial' : '') + '"' +
        (titulo ? ' title="' + Ui.escaparHtml(titulo) + '"' : '') + '>' +
        Ui.formatarNota(valor) +
        (parcial ? '<span class="media-sub">parcial</span>' : '') +
      '</span>'
    );
  }

  /**
   * Célula editável de média (bimestre ou final).
   *
   * O valor automático continua no modal para comparação; o valor manual, quando
   * existe, é o que vale no boletim.
   */
  function celulaEditavel(opcoes) {
    var valor = opcoes.valor;
    var vazia = valor === null || valor === undefined || valor === '';
    var manual = !!opcoes.manual;
    var parcial = !vazia && !manual && opcoes.completo === false;

    var titulo = opcoes.titulo || '';
    if (manual) {
      titulo = 'Média manual' +
        (opcoes.automatica === null || opcoes.automatica === undefined
          ? ''
          : ' · cálculo automático: ' + Ui.formatarNota(opcoes.automatica));
    } else if (vazia) {
      titulo = 'Clique para digitar uma média manual.';
    } else if (titulo) {
      titulo += ' · clique para editar a média';
    } else {
      titulo = 'Clique para editar a média';
    }

    return (
      '<button type="button" class="media-cell media-edit' +
        (vazia ? ' vazia' : '') +
        (parcial ? ' parcial' : '') +
        (manual ? ' manual' : '') + '" ' +
        'title="' + Ui.escaparHtml(titulo) + '" ' +
        MediasUI.atributos({
          alunoId: opcoes.alunoId,
          alunoNome: opcoes.alunoNome,
          materiaId: opcoes.materiaId,
          materiaNome: opcoes.materiaNome,
          escopo: opcoes.escopo,
          bimestre: opcoes.escopo === 'final' ? 0 : opcoes.bimestre,
          media: vazia ? null : valor,
          mediaAutomatica: opcoes.automatica,
          manual: manual
        }) +
        '>' +
        (vazia ? '—' : Ui.formatarNota(valor)) +
        (manual ? '<span class="media-sub">manual</span>' : '') +
        (parcial
          ? '<span class="media-sub">' +
              Ui.escaparHtml(opcoes.subParcial || 'parcial') +
            '</span>'
          : '') +
      '</button>'
    );
  }

  function ligarEventos(container, turma) {
    Ui.qsa('[data-modo-boletim]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        var novoModo = botao.getAttribute('data-modo-boletim');
        if (novoModo === Estado.modoBoletim) return;
        Estado.modoBoletim = novoModo;
        var materiaId = Estado.materiaBoletimId || turma.materias[0].id;
        carregar(container, turma, novoModo, materiaId);
      });
    });

    var selectMateria = container.querySelector('#boletim-materia');
    if (selectMateria) {
      selectMateria.addEventListener('change', function () {
        Estado.materiaBoletimId = selectMateria.value;
        carregar(container, turma, 'materia', selectMateria.value);
      });
    }

    var imprimir = container.querySelector('[data-imprimir-boletim]');
    if (imprimir) {
      imprimir.addEventListener('click', function () {
        window.print();
      });
    }

    Ui.qsa('[data-situacao]', container).forEach(function (seletor) {
      seletor.addEventListener('change', function () {
        salvarSituacao(seletor);
      });
    });

    var irAlunos = container.querySelector('[data-ir-alunos-boletim]');
    if (irAlunos) {
      irAlunos.addEventListener('click', function () {
        App.navegarTurma(turma.id, 'alunos');
      });
    }
  }

  async function salvarSituacao(seletor) {
    var alunoId = seletor.getAttribute('data-aluno-id');
    var materiaId = Estado.materiaBoletimId;
    var valor = seletor.value;
    var anterior = seletor.getAttribute('data-valor-anterior') || '';

    seletor.disabled = true;
    try {
      var resultado = await Api.salvarSituacao({
        alunoId: alunoId,
        materiaId: materiaId,
        valor: valor
      });
      seletor.setAttribute('data-valor-anterior', resultado.situacao || '');
      if (Estado.boletim) {
        Estado.boletim.alunos = Estado.boletim.alunos.map(function (aluno) {
          if (aluno.id !== alunoId) return aluno;
          var atualizado = {};
          Object.keys(aluno).forEach(function (chave) {
            atualizado[chave] = aluno[chave];
          });
          atualizado.situacao = resultado.situacao;
          return atualizado;
        });
      }
      Ui.toast('Situação final registrada.', 'sucesso');
    } catch (erro) {
      seletor.value = anterior;
      Ui.toast(erro.message || 'Não foi possível salvar a situação final.', 'erro');
    } finally {
      seletor.disabled = false;
    }
  }

  function encontrarMateria(turma, id) {
    for (var i = 0; i < turma.materias.length; i += 1) {
      if (turma.materias[i].id === id) return turma.materias[i];
    }
    return null;
  }

  function contarAvaliacoes(porBimestre) {
    var total = 0;
    Object.keys(porBimestre || {}).forEach(function (bimestre) {
      total += (porBimestre[bimestre] || []).length;
    });
    return total;
  }

  function formatarPercentual(valor) {
    var numero = Number(valor) || 0;
    return String(Math.round(numero * 10) / 10).replace('.', ',') + '%';
  }

  return {
    render: render
  };
})();
