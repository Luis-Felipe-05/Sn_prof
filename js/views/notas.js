/** Aba de notas: avaliações por bimestre e lançamento automático das notas. */
var NotasTab = (function () {
  function render(container, turma) {
    if (!turma.materias.length) {
      container.innerHTML = Ui.vazio({
        icone: 'book',
        titulo: 'Cadastre uma matéria primeiro',
        texto:
          'As avaliações e notas são organizadas por matéria e bimestre. ' +
          'Edite a turma para adicionar as matérias que você leciona.',
        acao:
          '<button type="button" class="btn btn-primary" data-editar-turma-notas>' +
          Ui.icone('edit') + 'Editar turma</button>'
      });
      container.querySelector('[data-editar-turma-notas]').addEventListener('click', function () {
        TurmasView.abrirFormulario(turma, function () {
          App.recarregarRota();
        });
      });
      return;
    }

    var selecao = Estado.selecaoNotasDaTurma(turma.id);
    if (!selecao.materiaId) {
      container.innerHTML = Ui.vazio({
        icone: 'book',
        titulo: 'Nenhuma matéria selecionada',
        texto: 'Adicione uma matéria à turma para lançar notas.'
      });
      return;
    }

    carregar(container, turma, selecao.materiaId, selecao.bimestre);
  }

  async function carregar(container, turma, materiaId, bimestre) {
    container.innerHTML = Ui.carregando('Carregando avaliações e notas...');
    try {
      var grade = await Api.obterGrade(turma.id, materiaId, bimestre);
      var selecaoAtual = Estado.selecaoNotasDaTurma(turma.id);
      if (
        !Estado.turma ||
        Estado.turma.id !== turma.id ||
        selecaoAtual.materiaId !== materiaId ||
        selecaoAtual.bimestre !== bimestre
      ) {
        return;
      }
      Estado.grade = grade;
      montar(container, turma, grade);
    } catch (erro) {
      container.innerHTML = Ui.alerta(
        Ui.escaparHtml(erro.message || 'Não foi possível carregar as notas.'),
        'erro'
      );
    }
  }

  function montar(container, turma, grade) {
    var selecao = Estado.selecaoNotasDaTurma(turma.id);
    var totalPeso = grade.pesoTotal;
    var pesoOk = Math.abs(totalPeso - 100) < 0.01;

    container.innerHTML =
      '<div id="notas-painel">' +
        '<div class="card" style="margin-bottom:16px">' +
          '<div class="card-body tight">' +
            '<div class="toolbar">' +
              '<div class="field">' +
                '<label class="label" for="notas-materia">Matéria</label>' +
                '<select class="select" id="notas-materia">' +
                  turma.materias.map(function (materia) {
                    return '<option value="' + Ui.escaparHtml(materia.id) + '"' +
                      (materia.id === selecao.materiaId ? ' selected' : '') + '>' +
                      Ui.escaparHtml(materia.nome) + '</option>';
                  }).join('') +
                '</select>' +
              '</div>' +
              '<div class="field" style="max-width:180px">' +
                '<label class="label" for="notas-bimestre">Bimestre</label>' +
                '<select class="select" id="notas-bimestre">' +
                  [1, 2, 3, 4].map(function (bimestre) {
                    return '<option value="' + bimestre + '"' +
                      (bimestre === selecao.bimestre ? ' selected' : '') + '>' +
                      bimestre + 'º bimestre</option>';
                  }).join('') +
                '</select>' +
              '</div>' +
              '<div class="spacer"></div>' +
              '<div class="row">' +
                Ui.badge('Peso total: ' + formatarPercentual(totalPeso), pesoOk ? 'badge-success' : 'badge-warning') +
                (pesoOk ? '' : Ui.badge('O ideal é 100%', 'badge-warning')) +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="notas-layout">' +
          '<div class="card">' +
            '<div class="card-header">' +
              '<div>' +
                '<div class="card-title">Avaliações</div>' +
                '<div class="card-subtitle">' + grade.bimestre + 'º bimestre · ' +
                  grade.avaliacoes.length + ' ' +
                  Ui.plural(grade.avaliacoes.length, 'avaliação', 'avaliações') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="card-body tight">' +
              '<form id="form-avaliacao" class="stack" style="gap:9px" novalidate>' +
                '<input class="input" id="avaliacao-nome" maxlength="120" ' +
                  'placeholder="Nome da avaliação (ex.: Prova 1)" autocomplete="off">' +
                '<div class="inline-form">' +
                  '<div class="input-group" style="flex:1">' +
                    '<input class="input" id="avaliacao-peso" inputmode="decimal" ' +
                      'placeholder="Peso" value="10">' +
                    '<span class="suffix">%</span>' +
                  '</div>' +
                  '<button type="submit" class="btn btn-primary">' +
                    Ui.icone('plus') + 'Adicionar' +
                  '</button>' +
                '</div>' +
              '</form>' +
            '</div>' +
            '<div class="eval-list" id="lista-avaliacoes">' +
              (grade.avaliacoes.length
                ? grade.avaliacoes.map(itemAvaliacao).join('')
                : Ui.vazio({
                    icone: 'clipboard',
                    titulo: 'Nenhuma avaliação',
                    texto: 'Crie a primeira avaliação deste bimestre.'
                  })) +
            '</div>' +
            '<div class="weight-total">' +
              '<span>Soma dos pesos</span>' +
              Ui.badge(formatarPercentual(totalPeso), pesoOk ? 'badge-success' : 'badge-warning') +
            '</div>' +
          '</div>' +

          '<div class="card">' +
            '<div class="card-header">' +
              '<div>' +
                '<div class="card-title">Lançamento de notas</div>' +
                '<div class="card-subtitle">Notas de 0 a 10. As alterações são salvas automaticamente.</div>' +
              '</div>' +
              '<div class="row no-print">' +
                Ui.badge('Média ponderada', 'badge-primary') +
              '</div>' +
            '</div>' +
            (grade.alunos.length && grade.avaliacoes.length
              ? tabelaNotas(grade)
              : Ui.vazio({
                  icone: grade.alunos.length ? 'clipboard' : 'users',
                  titulo: grade.alunos.length
                    ? 'Crie uma avaliação para começar'
                    : 'Nenhum aluno cadastrado',
                  texto: grade.alunos.length
                    ? 'Use o formulário ao lado para criar a primeira avaliação do bimestre.'
                    : 'Cadastre ou importe os alunos da turma antes de lançar notas.',
                  acao: grade.alunos.length
                    ? ''
                    : '<button type="button" class="btn btn-secondary" data-ir-alunos>' +
                      Ui.icone('users') + 'Ir para Alunos</button>'
                })) +
          '</div>' +
        '</div>' +
      '</div>';

    var painel = container.querySelector('#notas-painel');
    ligarEventos(painel, turma, grade);
  }

  function itemAvaliacao(avaliacao) {
    return (
      '<div class="eval-item">' +
        '<div class="eval-info">' +
          '<div class="eval-name">' + Ui.escaparHtml(avaliacao.nome) + '</div>' +
          '<div class="eval-meta">Peso ' + formatarPercentual(avaliacao.peso) + '</div>' +
        '</div>' +
        '<div class="row-actions no-print">' +
          '<button type="button" class="icon-btn" title="Editar avaliação" ' +
            'data-editar-avaliacao="' + Ui.escaparHtml(avaliacao.id) + '">' +
            Ui.icone('edit') + '</button>' +
          '<button type="button" class="icon-btn perigo" title="Excluir avaliação" ' +
            'data-excluir-avaliacao="' + Ui.escaparHtml(avaliacao.id) + '">' +
            Ui.icone('trash') + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function tabelaNotas(grade) {
    return (
      '<div class="grid-scroll">' +
        '<table class="grade-table">' +
          '<thead><tr>' +
            '<th>Aluno</th>' +
            grade.avaliacoes.map(function (avaliacao) {
              return '<th>' +
                '<span class="eval-header-name" title="' + Ui.escaparHtml(avaliacao.nome) + '">' +
                  Ui.escaparHtml(avaliacao.nome) +
                '</span>' +
                '<span class="eval-header-peso">' + formatarPercentual(avaliacao.peso) + '</span>' +
              '</th>';
            }).join('') +
            '<th>Média</th>' +
          '</tr></thead>' +
          '<tbody>' +
            grade.alunos.map(function (aluno) {
              var media = grade.medias[aluno.id] || {};
              return (
                '<tr>' +
                  '<td><span class="student-name">' + Ui.escaparHtml(aluno.nome) + '</span></td>' +
                  grade.avaliacoes.map(function (avaliacao, indice) {
                    var chave = aluno.id + ':' + avaliacao.id;
                    var valor = grade.notas[chave];
                    return '<td>' +
                      '<input class="grade-input" type="text" inputmode="decimal" ' +
                        'data-nota-aluno="' + Ui.escaparHtml(aluno.id) + '" ' +
                        'data-nota-avaliacao="' + Ui.escaparHtml(avaliacao.id) + '" ' +
                        'data-coluna="' + indice + '" ' +
                        'aria-label="Nota de ' + Ui.escaparHtml(aluno.nome) + ' em ' +
                          Ui.escaparHtml(avaliacao.nome) + '" ' +
                        'value="' + Ui.formatarNotaInput(valor) + '">' +
                    '</td>';
                  }).join('') +
                  '<td>' + celulaMedia(grade, aluno, media) + '</td>' +
                '</tr>'
              );
            }).join('') +
          '</tbody>' +
          '<tfoot><tr>' +
            '<td>Média da turma</td>' +
            grade.avaliacoes.map(function (avaliacao) {
              return '<td data-media-avaliacao="' + Ui.escaparHtml(avaliacao.id) + '">' +
                mediaDaAvaliacao(grade, avaliacao.id) + '</td>';
            }).join('') +
            '<td data-media-turma="1">' + mediaDaTurma(grade) + '</td>' +
          '</tr></tfoot>' +
        '</table>' +
      '</div>'
    );
  }

  /**
   * Média automática do bimestre com a **nota em falta contando 0**.
   *
   * Mesma regra da tela de recuperação: o peso da nota que o professor ainda
   * não lançou entra mesmo assim em `pesoTotal`; na prática, `média do
   * lançado × peso lançado ÷ peso total`. Aluno sem nota nenhuma (com
   * avaliação cadastrada) resulta em 0, e `null` só quando não existe
   * nenhuma avaliação no bimestre — aí não há o que zerar.
   */
  function automaticaComZero(media) {
    if (!media) return null;
    var pesoTotal = Number(media.pesoTotal) || 0;
    var pesoCoberto = Number(media.pesoConsiderado) || 0;
    var bruto = media.mediaAutomatica;

    if (!(pesoTotal > 0)) {
      // Sem avaliação cadastrada: só o que já existir, sem invenção.
      return bruto !== null && bruto !== undefined && isFinite(Number(bruto))
        ? Number(bruto)
        : null;
    }

    // Todo o lance sem nota é 0; sem nota nenhuma a média também é 0.
    if (bruto === null || bruto === undefined || bruto === '') return 0;
    var exata = Number(bruto);
    if (!isFinite(exata)) exata = 0;
    return (exata * Math.min(pesoCoberto, pesoTotal)) / pesoTotal;
  }

  /** O valor que a célula da média mostra (manual vale como digitado). */
  function mediaExibida(media) {
    if (!media) return null;
    if (media.manual) {
      var manual = media.media;
      return manual === null || manual === undefined || manual === ''
        ? null
        : Number(manual);
    }
    return automaticaComZero(media);
  }

  /**
   * Célula da média efetiva do bimestre.
   *
   * É um botão: clicar abre o modal de média manual. Sem valor manual vale o
   * cálculo automático já com a nota em falta valendo 0 (com o selo
   * "parcial" quando ainda faltam notas — lançar a nota que falta pode subir
   * a média).
   */
  function celulaMedia(grade, aluno, media) {
    var valor = mediaExibida(media);
    var vazia = valor === null || valor === undefined;
    var manual = !!(media && media.manual);
    var parcial = !vazia && !manual && !media.completo;
    var automatica = automaticaComZero(media);
    var pesoTotal = Number(media && media.pesoTotal) || 0;
    var pesoCoberto = Number(media && media.pesoConsiderado) || 0;

    var titulo;
    if (manual) {
      titulo = 'Média manual' +
        (automatica === null || automatica === undefined
          ? ''
          : ' · cálculo automático: ' + Ui.formatarNota(automatica));
    } else if (vazia) {
      titulo = 'Nenhuma avaliação neste bimestre. ' +
        'Clique para digitar uma média manual.';
    } else {
      var faltante = pesoTotal - pesoCoberto;
      titulo = faltante > 0.05
        ? 'Falta ' + formatarPercentual(faltante) + ' do peso — nota em ' +
          'falta conta 0 · clique para editar a média'
        : 'Todos os pesos lançados · clique para editar a média';
    }

    return (
      '<button type="button" class="media-cell media-edit' +
        (vazia ? ' vazia' : '') +
        (parcial ? ' parcial' : '') +
        (manual ? ' manual' : '') + '" ' +
        'data-media-aluno="' + Ui.escaparHtml(aluno.id) + '" ' +
        'title="' + Ui.escaparHtml(titulo) + '" ' +
        MediasUI.atributos({
          alunoId: aluno.id,
          alunoNome: aluno.nome,
          materiaId: grade.materia.id,
          materiaNome: grade.materia.nome,
          escopo: 'bimestre',
          bimestre: grade.bimestre,
          media: valor,
          mediaAutomatica: automatica,
          manual: manual
        }) +
        '>' +
        (vazia ? '—' : Ui.formatarNota(valor)) +
        (manual ? '<span class="media-sub">manual</span>' : '') +
        (parcial ? '<span class="media-sub">parcial</span>' : '') +
      '</button>'
    );
  }

  function ligarEventos(painel, turma, grade) {
    var selectMateria = painel.querySelector('#notas-materia');
    var selectBimestre = painel.querySelector('#notas-bimestre');

    function recarregar() {
      var materiaId = selectMateria.value;
      var bimestre = Number(selectBimestre.value);
      Estado.salvarSelecaoNotas(turma.id, materiaId, bimestre);
      carregar(painel.parentNode || painel, turma, materiaId, bimestre);
    }

    selectMateria.addEventListener('change', recarregar);
    selectBimestre.addEventListener('change', recarregar);

    var formAvaliacao = painel.querySelector('#form-avaliacao');
    formAvaliacao.addEventListener('submit', async function (evento) {
      evento.preventDefault();
      var nome = painel.querySelector('#avaliacao-nome').value.trim();
      var peso = painel.querySelector('#avaliacao-peso').value.trim();
      if (!nome) {
        Ui.toast('Informe o nome da avaliação.', 'aviso');
        painel.querySelector('#avaliacao-nome').focus();
        return;
      }
      var botao = formAvaliacao.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        await Api.criarAvaliacao({
          turmaId: turma.id,
          materiaId: selectMateria.value,
          bimestre: Number(selectBimestre.value),
          nome: nome,
          peso: peso
        });
        Ui.toast('Avaliação criada.', 'sucesso');
        App.atualizarContagens();
        recarregar();
      } catch (erro) {
        Ui.toast(erro.message || 'Não foi possível criar a avaliação.', 'erro');
        botao.disabled = false;
      }
    });

    painel.addEventListener('click', function (evento) {
      var editar = evento.target.closest('[data-editar-avaliacao]');
      if (editar) {
        var avaliacao = encontrarAvaliacao(grade, editar.getAttribute('data-editar-avaliacao'));
        if (avaliacao) abrirEdicaoAvaliacao(painel, turma, grade, avaliacao);
        return;
      }

      var excluir = evento.target.closest('[data-excluir-avaliacao]');
      if (excluir) {
        var avaliacaoExcluir = encontrarAvaliacao(
          grade,
          excluir.getAttribute('data-excluir-avaliacao')
        );
        if (avaliacaoExcluir) excluirAvaliacao(painel, turma, avaliacaoExcluir);
        return;
      }

      var irAlunos = evento.target.closest('[data-ir-alunos]');
      if (irAlunos) {
        App.navegarTurma(turma.id, 'alunos');
      }
    });

    painel.addEventListener('change', function (evento) {
      var input = evento.target.closest('[data-nota-aluno]');
      if (!input) return;
      salvarNota(painel, input, grade);
    });

    painel.addEventListener('keydown', function (evento) {
      var input = evento.target.closest('[data-nota-aluno]');
      if (!input || evento.key !== 'Enter') return;
      evento.preventDefault();
      var linha = input.closest('tr');
      var proxima = linha ? linha.nextElementSibling : null;
      if (proxima) {
        var proximoInput = proxima.querySelector(
          '[data-coluna="' + input.getAttribute('data-coluna') + '"]'
        );
        if (proximoInput) {
          input.blur();
          proximoInput.focus();
          proximoInput.select();
        }
      } else {
        input.blur();
      }
    });
  }

  async function salvarNota(painel, input, grade) {
    var alunoId = input.getAttribute('data-nota-aluno');
    var avaliacaoId = input.getAttribute('data-nota-avaliacao');
    var chave = alunoId + ':' + avaliacaoId;
    var anterior = Object.prototype.hasOwnProperty.call(grade.notas, chave)
      ? grade.notas[chave]
      : null;
    var bruto = input.value.trim();
    var valor = bruto === '' ? null : Number(bruto.replace(',', '.'));

    if (valor !== null && (!isFinite(valor) || valor < 0 || valor > 10)) {
      Ui.toast('Digite uma nota entre 0 e 10.', 'aviso');
      input.value = Ui.formatarNotaInput(anterior);
      return;
    }

    input.disabled = true;
    input.classList.remove('salvo', 'erro');
    input.classList.add('salvando');

    try {
      var resultado = await Api.salvarNota({
        avaliacaoId: avaliacaoId,
        alunoId: alunoId,
        valor: valor === null ? '' : valor
      });

      if (resultado.valor === null || resultado.valor === undefined) {
        delete grade.notas[chave];
        input.value = '';
      } else {
        grade.notas[chave] = resultado.valor;
        input.value = Ui.formatarNotaInput(resultado.valor);
      }

      grade.medias[alunoId] = resultado.media;
      input.classList.remove('salvando');
      input.classList.add('salvo');
      atualizarMedias(painel, grade);
      window.setTimeout(function () {
        input.classList.remove('salvo');
      }, 1200);
    } catch (erro) {
      grade.notas[chave] = anterior;
      input.value = Ui.formatarNotaInput(anterior);
      input.classList.remove('salvando');
      input.classList.add('erro');
      window.setTimeout(function () {
        input.classList.remove('erro');
      }, 1800);
      Ui.toast(erro.message || 'Não foi possível salvar a nota.', 'erro');
    } finally {
      input.disabled = false;
    }
  }

  function atualizarMedias(painel, grade) {
    grade.alunos.forEach(function (aluno) {
      var media = grade.medias[aluno.id] || {};
      var celula = painel.querySelector('[data-media-aluno="' + aluno.id + '"]');
      if (celula) {
        celula.outerHTML = celulaMedia(grade, aluno, media);
      }
    });

    grade.avaliacoes.forEach(function (avaliacao) {
      var celula = painel.querySelector(
        '[data-media-avaliacao="' + avaliacao.id + '"]'
      );
      if (celula) celula.textContent = mediaDaAvaliacao(grade, avaliacao.id);
    });

    var mediaTurma = painel.querySelector('[data-media-turma]');
    if (mediaTurma) mediaTurma.textContent = mediaDaTurma(grade);
  }

  function abrirEdicaoAvaliacao(painel, turma, grade, avaliacao) {
    var modal = Ui.abrirModal({
      titulo: 'Editar avaliação',
      corpo:
        '<div id="editar-avaliacao-erro" class="hidden" style="margin-bottom:14px"></div>' +
        '<div class="field">' +
          '<label class="label" for="editar-avaliacao-nome">Nome da avaliação</label>' +
          '<input class="input" id="editar-avaliacao-nome" maxlength="120" autofocus value="' +
            Ui.escaparHtml(avaliacao.nome) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label class="label" for="editar-avaliacao-peso">Peso em porcentagem</label>' +
          '<div class="input-group">' +
            '<input class="input" id="editar-avaliacao-peso" inputmode="decimal" value="' +
              Ui.formatarNotaInput(avaliacao.peso) + '">' +
            '<span class="suffix">%</span>' +
          '</div>' +
        '</div>',
      rodape:
        '<button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-salvar>' +
          Ui.icone('save') + 'Salvar' +
        '</button>'
    });

    var erroBox = modal.corpo.querySelector('#editar-avaliacao-erro');
    modal.rodape.querySelector('[data-cancelar]').addEventListener('click', modal.fechar);
    modal.rodape.querySelector('[data-salvar]').addEventListener('click', async function () {
      var botao = modal.rodape.querySelector('[data-salvar]');
      botao.disabled = true;
      try {
        await Api.atualizarAvaliacao(avaliacao.id, {
          nome: modal.corpo.querySelector('#editar-avaliacao-nome').value.trim(),
          peso: modal.corpo.querySelector('#editar-avaliacao-peso').value.trim()
        });
        Ui.toast('Avaliação atualizada.', 'sucesso');
        modal.fechar();
        var selecao = Estado.selecaoNotasDaTurma(turma.id);
        carregar(painel.parentNode || painel, turma, selecao.materiaId, selecao.bimestre);
      } catch (erro) {
        erroBox.className = 'alert alert-danger';
        erroBox.innerHTML = Ui.icone('alert') + '<div>' +
          Ui.escaparHtml(erro.message || 'Não foi possível salvar.') + '</div>';
        botao.disabled = false;
      }
    });
  }

  async function excluirAvaliacao(painel, turma, avaliacao) {
    var confirmou = await Ui.confirmar({
      titulo: 'Excluir avaliação',
      mensagem:
        'Excluir a avaliação "' + avaliacao.nome + '" também apaga todas as notas ' +
        'lançadas nela. Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir avaliação',
      perigo: true
    });
    if (!confirmou) return;

    try {
      await Api.excluirAvaliacao(avaliacao.id);
      Ui.toast('Avaliação excluída.', 'sucesso');
      App.atualizarContagens();
      var selecao = Estado.selecaoNotasDaTurma(turma.id);
      carregar(painel.parentNode || painel, turma, selecao.materiaId, selecao.bimestre);
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível excluir a avaliação.', 'erro');
    }
  }

  function encontrarAvaliacao(grade, id) {
    for (var i = 0; i < grade.avaliacoes.length; i += 1) {
      if (grade.avaliacoes[i].id === id) return grade.avaliacoes[i];
    }
    return null;
  }

  /**
   * Média de uma avaliação na linha "Média da turma", com a nota em falta de
   * cada aluno valendo 0: o denominador são TODOS os alunos, não só quem já
   * tem nota. Sem nota lançada em ninguém, a média é 0,0 — e não mais «—».
   */
  function mediaDaAvaliacao(grade, avaliacaoId) {
    var alunos = grade.alunos || [];
    if (!alunos.length) return '—';

    var soma = 0;
    alunos.forEach(function (aluno) {
      var chave = aluno.id + ':' + avaliacaoId;
      var bruto = Object.prototype.hasOwnProperty.call(grade.notas, chave)
        ? grade.notas[chave]
        : null;
      if (bruto === null || bruto === undefined || bruto === '') return; // vale 0
      var numero = Number(bruto);
      if (isFinite(numero)) soma += numero;
    });

    var media = soma / alunos.length;
    return Ui.formatarNota(Math.round(media * 10) / 10);
  }

  /** Média da turma já contando o zero da nota em falta, célula a célula. */
  function mediaDaTurma(grade) {
    var valores = (grade.alunos || [])
      .map(function (aluno) {
        return mediaExibida(grade.medias[aluno.id]);
      })
      .filter(function (valor) {
        return valor !== null && valor !== undefined;
      });
    if (!valores.length) return '—';
    var media = valores.reduce(function (soma, valor) {
      return soma + valor;
    }, 0) / valores.length;
    return Ui.formatarNota(Math.round(media * 10) / 10);
  }

  function formatarPercentual(valor) {
    var numero = Number(valor) || 0;
    return String(Math.round(numero * 10) / 10).replace('.', ',') + '%';
  }

  return {
    render: render
  };
})();
