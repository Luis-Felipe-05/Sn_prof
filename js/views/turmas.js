/** Tela de turmas: listagem por ano, criação, edição e exclusão. */
var TurmasView = (function () {
  // Ferramenta de teste: cria turmas, alunos, avaliações e notas fictícios.
  // Antes de publicar para uso real, troque para false (o botão desaparece;
  // as turmas [TESTE] podem ser excluídas normalmente pela própria tela).
  var MOSTRAR_DADOS_TESTE = true;

  var TURMAS_TESTE = [
    {
      nome: '[TESTE] 9º Ano A',
      materias: ['Matemática', 'Português'],
      alunos: [
        'Ana Beatriz Souza', 'Bruno Carvalho', 'Carla Mendes',
        'Diego Ferreira', 'Elisa Rocha', 'Felipe Nunes'
      ]
    },
    {
      nome: '[TESTE] 8º Ano B',
      materias: ['Ciências', 'História'],
      alunos: [
        'Gabriela Lima', 'Henrique Alves', 'Isabela Martins',
        'João Pedro Costa', 'Karina Oliveira', 'Lucas Pereira'
      ]
    }
  ];

  var NOTAS_BASE = [8.0, 6.5, 9.5, 7.0, 4.5, 10.0];

  function render(container) {
    var anos = Estado.anosDisponiveis();
    if (Estado.filtroAno !== 'todos' && anos.indexOf(Number(Estado.filtroAno)) === -1) {
      Estado.filtroAno = 'todos';
    }

    var turmas = Estado.turmas.filter(function (turma) {
      return Estado.filtroAno === 'todos' || turma.ano === Number(Estado.filtroAno);
    });

    var grupos = {};
    turmas.forEach(function (turma) {
      if (!grupos[turma.ano]) grupos[turma.ano] = [];
      grupos[turma.ano].push(turma);
    });

    var anosComTurmas = Object.keys(grupos)
      .map(Number)
      .sort(function (a, b) {
        return b - a;
      });

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<h1 class="page-title">Turmas</h1>' +
          '<p class="page-subtitle">Organize suas turmas por ano, matérias e alunos.</p>' +
        '</div>' +
        '<div class="page-actions">' +
          (MOSTRAR_DADOS_TESTE
            ? '<button type="button" class="btn btn-secondary" data-dados-teste>' +
                Ui.icone('teste') + 'Dados de teste' +
              '</button>'
            : '') +
          '<button type="button" class="btn btn-primary" data-nova-turma>' +
            Ui.icone('plus') + 'Nova turma' +
          '</button>' +
        '</div>' +
      '</div>' +
      (anos.length > 1
        ? '<div class="filter-chips">' +
            '<button type="button" class="chip-button ' +
              (Estado.filtroAno === 'todos' ? 'ativo' : '') +
              '" data-filtro-ano="todos">Todos os anos</button>' +
            anos.map(function (ano) {
              return '<button type="button" class="chip-button ' +
                (Number(Estado.filtroAno) === ano ? 'ativo' : '') +
                '" data-filtro-ano="' + ano + '">' + ano + '</button>';
            }).join('') +
          '</div>'
        : '') +
      (turmas.length
        ? anosComTurmas.map(function (ano) {
            return (
              '<section class="year-group">' +
                '<div class="year-heading">' +
                  '<h2>Ano ' + ano + '</h2>' +
                  Ui.badge(grupos[ano].length + ' ' + Ui.plural(grupos[ano].length, 'turma', 'turmas'), 'badge-muted') +
                '</div>' +
                '<div class="turma-grid">' +
                  grupos[ano].map(cardTurma).join('') +
                '</div>' +
              '</section>'
            );
          }).join('')
        : Ui.vazio({
            icone: 'book',
            titulo: Estado.turmas.length ? 'Nenhuma turma neste ano' : 'Comece criando sua primeira turma',
            texto: Estado.turmas.length
              ? 'Escolha outro ano no filtro ou crie uma nova turma.'
              : 'Cadastre a turma, as matérias que você leciona e depois importe a lista de alunos.',
            acao:
              '<button type="button" class="btn btn-primary" data-nova-turma>' +
              Ui.icone('plus') + 'Nova turma</button>'
          }));

    container.querySelectorAll('[data-nova-turma]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        abrirFormulario(null);
      });
    });

    var botaoDadosTeste = container.querySelector('[data-dados-teste]');
    if (botaoDadosTeste) {
      botaoDadosTeste.addEventListener('click', abrirDadosTeste);
    }

    container.querySelectorAll('[data-filtro-ano]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        Estado.filtroAno = botao.getAttribute('data-filtro-ano');
        render(container);
      });
    });

    // O listener delegado é preso ao container, que é reaproveitado quando o
    // filtro de ano redesenha a tela. Registrar apenas uma vez evita que cada
    // clique dispare vários handlers (e abra modais duplicados).
    if (!container.getAttribute('data-turmas-delegado')) {
      container.setAttribute('data-turmas-delegado', '1');
      container.addEventListener('click', function (evento) {
        var editar = evento.target.closest('[data-editar-turma]');
        if (editar) {
          evento.stopPropagation();
          var turmaEditar = Estado.turmaPorId(editar.getAttribute('data-editar-turma'));
          if (turmaEditar) abrirFormulario(turmaEditar);
          return;
        }

        var excluir = evento.target.closest('[data-excluir-turma]');
        if (excluir) {
          evento.stopPropagation();
          var turmaExcluir = Estado.turmaPorId(excluir.getAttribute('data-excluir-turma'));
          if (turmaExcluir) excluirTurma(turmaExcluir);
          return;
        }

        var card = evento.target.closest('[data-abrir-turma]');
        if (card && !evento.target.closest('button')) {
          App.navegarTurma(card.getAttribute('data-abrir-turma'), 'alunos');
        }
      });
    }
  }

  function cardTurma(turma) {
    var materias = turma.materias || [];
    var visiveis = materias.slice(0, 4);
    var restantes = materias.length - visiveis.length;

    return (
      '<article class="turma-card" data-abrir-turma="' + Ui.escaparHtml(turma.id) + '">' +
        '<div class="turma-card-top">' +
          '<div class="turma-avatar">' + Ui.escaparHtml(Ui.iniciais(turma.nome)) + '</div>' +
          '<div class="turma-card-info">' +
            '<h3>' + Ui.escaparHtml(turma.nome) + '</h3>' +
            '<p>Ano ' + turma.ano + ' · ' +
              turma.totalAlunos + ' ' + Ui.plural(turma.totalAlunos, 'aluno', 'alunos') +
            '</p>' +
          '</div>' +
          '<div class="turma-card-actions">' +
            '<button type="button" class="icon-btn" title="Editar turma" ' +
              'aria-label="Editar turma" data-editar-turma="' + Ui.escaparHtml(turma.id) + '">' +
              Ui.icone('edit') +
            '</button>' +
            '<button type="button" class="icon-btn perigo" title="Excluir turma" ' +
              'aria-label="Excluir turma" data-excluir-turma="' + Ui.escaparHtml(turma.id) + '">' +
              Ui.icone('trash') +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chips">' +
          (visiveis.length
            ? visiveis.map(function (materia) {
                return '<span class="chip materia"><span>' +
                  Ui.escaparHtml(materia.nome) + '</span></span>';
              }).join('') +
              (restantes > 0
                ? '<span class="chip">+' + restantes + '</span>'
                : '')
            : '<span class="chip">Sem matérias cadastradas</span>') +
        '</div>' +
        '<div class="turma-card-footer">' +
          '<span>' + turma.totalAvaliacoes + ' ' +
            Ui.plural(turma.totalAvaliacoes, 'avaliação', 'avaliações') +
          '</span>' +
          '<span class="abrir">Abrir ' + Ui.icone('arrowRight') + '</span>' +
        '</div>' +
      '</article>'
    );
  }

  function abrirFormulario(turma, aoSalvar) {
    var editando = !!turma;
    var materias = turma ? turma.materias.slice() : [];
    if (!materias.length) materias = [{ id: '', nome: '' }];

    var corpo =
      '<div id="form-erro" class="hidden" style="margin-bottom:14px"></div>' +
      '<form id="form-turma" novalidate>' +
        '<div class="field-row">' +
          '<div class="field">' +
            '<label class="label" for="turma-nome">Nome da turma</label>' +
            '<input class="input" id="turma-nome" maxlength="120" autofocus ' +
              'placeholder="Ex.: 9º Ano A" value="' +
              Ui.escaparHtml(turma ? turma.nome : '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label class="label" for="turma-ano">Ano</label>' +
            '<input class="input" id="turma-ano" type="number" min="2000" max="2100" ' +
              'value="' + (turma ? turma.ano : new Date().getFullYear()) + '">' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="label">Matérias que você leciona <span class="opcional">(opcional)</span></label>' +
          '<div class="materias-editor" id="materias-editor"></div>' +
          '<div>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="btn-add-materia">' +
              Ui.icone('plus') + 'Adicionar matéria' +
            '</button>' +
          '</div>' +
          '<p class="hint">Ao remover uma matéria, as avaliações e notas dela também são excluídas.</p>' +
        '</div>' +
      '</form>';

    var modal = Ui.abrirModal({
      titulo: editando ? 'Editar turma' : 'Nova turma',
      subtitulo: editando
        ? 'Atualize o nome, o ano e as matérias da turma.'
        : 'Crie a turma e informe as matérias que você leciona nela.',
      corpo: corpo,
      rodape:
        '<button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-salvar>' +
          Ui.icone('save') + (editando ? 'Salvar alterações' : 'Criar turma') +
        '</button>'
    });

    var editor = modal.corpo.querySelector('#materias-editor');
    var erroBox = modal.corpo.querySelector('#form-erro');
    var botaoSalvar = modal.rodape.querySelector('[data-salvar]');
    var idsOriginais = turma
      ? turma.materias.map(function (materia) {
          return materia.id;
        })
      : [];

    function adicionarLinha(materia) {
      var linha = document.createElement('div');
      linha.className = 'materia-row';
      linha.innerHTML =
        '<input class="input" data-materia-nome maxlength="120" ' +
          'placeholder="Ex.: Matemática" value="' +
          Ui.escaparHtml(materia && materia.nome ? materia.nome : '') + '">' +
        '<button type="button" class="icon-btn perigo" data-remover-materia ' +
          'aria-label="Remover matéria">' + Ui.icone('trash') + '</button>';
      if (materia && materia.id) linha.setAttribute('data-materia-id', materia.id);
      editor.appendChild(linha);
    }

    function mostrarErro(mensagem) {
      erroBox.className = 'alert alert-danger';
      erroBox.innerHTML = Ui.icone('alert') + '<div>' + Ui.escaparHtml(mensagem) + '</div>';
    }

    function limparErro() {
      erroBox.className = 'hidden';
      erroBox.innerHTML = '';
    }

    function coletarMaterias() {
      return Ui.qsa('[data-materia-nome]', editor)
        .map(function (input) {
          var linha = input.closest('.materia-row');
          var id = linha.getAttribute('data-materia-id') || null;
          return { id: id, nome: input.value.trim() };
        })
        .filter(function (materia) {
          return !!materia.nome;
        });
    }

    materias.forEach(adicionarLinha);

    editor.addEventListener('click', function (evento) {
      var remover = evento.target.closest('[data-remover-materia]');
      if (!remover) return;
      var linhas = Ui.qsa('.materia-row', editor);
      if (linhas.length === 1) {
        var input = linhas[0].querySelector('[data-materia-nome]');
        input.value = '';
        input.focus();
        return;
      }
      remover.closest('.materia-row').remove();
    });

    modal.corpo.querySelector('#btn-add-materia').addEventListener('click', function () {
      adicionarLinha({ id: '', nome: '' });
      var inputs = Ui.qsa('[data-materia-nome]', editor);
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    modal.rodape.querySelector('[data-cancelar]').addEventListener('click', modal.fechar);

    async function salvar() {
      limparErro();
      var nome = modal.corpo.querySelector('#turma-nome').value.trim();
      var ano = Number(modal.corpo.querySelector('#turma-ano').value);
      var listaMaterias = coletarMaterias();

      if (!nome) {
        mostrarErro('Informe o nome da turma.');
        return;
      }
      if (!ano || ano < 2000 || ano > 2100) {
        mostrarErro('Informe um ano válido entre 2000 e 2100.');
        return;
      }

      if (editando && turma.totalAvaliacoes > 0) {
        var idsAtuais = listaMaterias
          .map(function (materia) {
            return materia.id;
          })
          .filter(Boolean);
        var removeuMateria = idsOriginais.some(function (id) {
          return idsAtuais.indexOf(id) === -1;
        });
        if (removeuMateria) {
          var confirmou = await Ui.confirmar({
            titulo: 'Remover matéria com avaliações?',
            mensagem:
              'Uma ou mais matérias removidas possuem avaliações e notas. ' +
              'Esses registros serão excluídos junto com a matéria. Deseja continuar?',
            textoConfirmar: 'Remover e salvar',
            perigo: true
          });
          if (!confirmou) return;
        }
      }

      botaoSalvar.disabled = true;
      var textoOriginal = botaoSalvar.innerHTML;
      botaoSalvar.innerHTML = '<span class="spinner" style="width:15px;height:15px"></span> Salvando...';

      try {
        var resultado;
        if (editando) {
          resultado = await Api.atualizarTurma(turma.id, {
            nome: nome,
            ano: ano,
            materias: listaMaterias
          });
          Ui.toast('Turma atualizada com sucesso.', 'sucesso');
        } else {
          resultado = await Api.criarTurma({
            nome: nome,
            ano: ano,
            materias: listaMaterias
          });
          Ui.toast('Turma criada com sucesso.', 'sucesso');
        }

        modal.fechar();
        await App.atualizarTurmas();

        if (typeof aoSalvar === 'function') {
          aoSalvar(resultado);
        } else if (!editando) {
          App.navegarTurma(resultado.id, 'alunos');
        }
      } catch (erro) {
        mostrarErro(erro.message || 'Não foi possível salvar a turma.');
        botaoSalvar.disabled = false;
        botaoSalvar.innerHTML = textoOriginal;
      }
    }

    botaoSalvar.addEventListener('click', salvar);
    modal.corpo.querySelector('#form-turma').addEventListener('submit', function (evento) {
      evento.preventDefault();
      salvar();
    });
  }

  async function excluirTurma(turma) {
    var confirmou = await Ui.confirmar({
      titulo: 'Excluir turma',
      mensagem:
        'Excluir a turma "' + turma.nome + '" também apaga todos os alunos, ' +
        'matérias, avaliações e notas vinculados a ela. Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir turma',
      perigo: true
    });
    if (!confirmou) return;

    try {
      await Api.excluirTurma(turma.id);
      Ui.toast('Turma excluída.', 'sucesso');
      if (Estado.rota.view === 'turma' && Estado.rota.turmaId === turma.id) {
        App.navegarTurmas();
      }
      await App.atualizarTurmas();
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível excluir a turma.', 'erro');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Dados de teste (ferramenta temporária)                             */
  /* ------------------------------------------------------------------ */

  function turmasDeTeste() {
    return Estado.turmas.filter(function (turma) {
      return String(turma.nome || '').indexOf('[TESTE]') === 0;
    });
  }

  function avaliacoesDoBimestre(bimestre) {
    return bimestre === 1
      ? [
          { nome: 'Prova bimestral', peso: 60 },
          { nome: 'Trabalho em grupo', peso: 40 }
        ]
      : [
          { nome: 'Prova bimestral', peso: 50 },
          { nome: 'Trabalho em grupo', peso: 50 }
        ];
  }

  function notaDeTeste(indiceAluno, indiceMateria, bimestre, indiceAvaliacao) {
    var valor = NOTAS_BASE[(indiceAluno + indiceMateria) % NOTAS_BASE.length];
    valor += (bimestre - 1) * 0.5;
    valor += indiceAvaliacao === 0 ? 0.5 : -0.5;
    valor = Math.round(valor * 10) / 10;
    return Math.max(0, Math.min(10, valor));
  }

  function abrirDadosTeste() {
    var existentes = turmasDeTeste();
    var temTeste = existentes.length > 0;
    var porTurma = TURMAS_TESTE[0].alunos.length;

    var corpo =
      '<p class="muted" style="line-height:1.6;margin-bottom:12px">' +
        'Cria dados fictícios para você testar todas as telas antes de usar ' +
        'com turmas reais:' +
      '</p>' +
      '<ul class="muted" style="line-height:1.7;margin:0 0 14px 18px;padding:0">' +
        '<li><strong>' + TURMAS_TESTE.length + ' turmas</strong> marcadas com ' +
          '<code>[TESTE]</code></li>' +
        '<li><strong>' + porTurma + ' alunos</strong> em cada turma</li>' +
        '<li><strong>2 matérias</strong> por turma, com avaliações no 1º e 2º ' +
          'bimestres</li>' +
        '<li><strong>Notas variadas</strong>, incluindo alunos abaixo da média</li>' +
      '</ul>' +
      (temTeste
        ? '<div class="alert">' + Ui.icone('info') +
            '<div>Já existem <strong>' + existentes.length + ' turma(s) de teste' +
            '</strong>. Remova os dados atuais antes de popular novamente.</div></div>'
        : '') +
      '<p class="muted" id="dados-teste-status" style="margin-top:12px;min-height:18px"></p>';

    var modal = Ui.abrirModal({
      titulo: 'Dados de teste',
      subtitulo: 'Popule o sistema com turmas, alunos e notas fictícios.',
      corpo: corpo,
      rodape:
        '<button type="button" class="btn btn-secondary" data-cancelar>Fechar</button>' +
        (temTeste
          ? '<button type="button" class="btn btn-danger-soft" data-remover-teste>' +
              Ui.icone('trash') + 'Remover dados de teste' +
            '</button>'
          : '') +
        '<button type="button" class="btn btn-primary" data-popular-teste' +
          (temTeste ? ' disabled' : '') + '>' +
          Ui.icone('teste') + 'Popular dados de teste' +
        '</button>'
    });

    var status = modal.corpo.querySelector('#dados-teste-status');
    var botaoFechar = modal.rodape.querySelector('[data-cancelar]');
    var botaoRemover = modal.rodape.querySelector('[data-remover-teste]');
    var botaoPopular = modal.rodape.querySelector('[data-popular-teste]');

    function relatar(mensagem) {
      if (status) status.textContent = mensagem;
    }

    function travar() {
      modal.rodape.querySelectorAll('button').forEach(function (botao) {
        botao.disabled = true;
      });
    }

    function liberarAposErro(erro) {
      if (botaoFechar) botaoFechar.disabled = false;
      if (botaoRemover) botaoRemover.disabled = false;
      relatar(
        'Não foi possível concluir: ' + (erro.message || 'erro inesperado') +
        ' Feche esta janela e use "Remover dados de teste" antes de tentar de novo.'
      );
    }

    botaoFechar.addEventListener('click', modal.fechar);

    if (botaoPopular) {
      botaoPopular.addEventListener('click', async function () {
        travar();
        try {
          var resumo = await popularDadosTeste(relatar);
          modal.fechar();
          await App.atualizarTurmas();
          Ui.toast(
            'Dados de teste criados: ' + resumo.turmas + ' turmas, ' +
            resumo.alunos + ' alunos, ' + resumo.avaliacoes + ' avaliações e ' +
            resumo.notas + ' notas.',
            'sucesso'
          );
        } catch (erro) {
          liberarAposErro(erro);
        }
      });
    }

    if (botaoRemover) {
      botaoRemover.addEventListener('click', async function () {
        var confirmou = await Ui.confirmar({
          titulo: 'Remover dados de teste',
          mensagem:
            'Serão excluídas ' + existentes.length + ' turma(s) que começam com ' +
            '"[TESTE]", junto com seus alunos, avaliações e notas. ' +
            'Nenhuma turma real é afetada. Deseja continuar?',
          textoConfirmar: 'Remover dados',
          perigo: true
        });
        if (!confirmou) return;

        travar();
        try {
          var removidas = await removerDadosTeste(relatar);
          modal.fechar();
          if (
            Estado.rota.view === 'turma' &&
            !Estado.turmaPorId(Estado.rota.turmaId)
          ) {
            App.navegarTurmas();
          }
          await App.atualizarTurmas();
          Ui.toast(removidas + ' turma(s) de teste removida(s).', 'sucesso');
        } catch (erro) {
          liberarAposErro(erro);
        }
      });
    }
  }

  async function popularDadosTeste(relatar) {
    var ano = new Date().getFullYear();
    var resumo = { turmas: 0, alunos: 0, avaliacoes: 0, notas: 0 };
    var totalNotas = 0;
    TURMAS_TESTE.forEach(function (modelo) {
      totalNotas += modelo.materias.length * 4 * modelo.alunos.length;
    });

    for (var t = 0; t < TURMAS_TESTE.length; t += 1) {
      var modelo = TURMAS_TESTE[t];
      relatar('Criando turma ' + (t + 1) + ' de ' + TURMAS_TESTE.length + '...');
      var turma = await Api.criarTurma({
        nome: modelo.nome,
        ano: ano,
        materias: modelo.materias.map(function (nome) {
          return { nome: nome };
        })
      });
      resumo.turmas += 1;

      var alunos = [];
      for (var a = 0; a < modelo.alunos.length; a += 1) {
        relatar(
          'Turma ' + (t + 1) + ': aluno ' + (a + 1) +
          ' de ' + modelo.alunos.length + '...'
        );
        alunos.push(await Api.adicionarAluno(turma.id, modelo.alunos[a]));
      }
      resumo.alunos += alunos.length;

      var materias = turma.materias || [];
      for (var m = 0; m < materias.length; m += 1) {
        var materia = materias[m];
        for (var b = 1; b <= 2; b += 1) {
          var avaliacoes = avaliacoesDoBimestre(b);
          for (var k = 0; k < avaliacoes.length; k += 1) {
            relatar(
              'Turma ' + (t + 1) + ': ' + materia.nome + ', ' + b +
              'º bimestre — ' + avaliacoes[k].nome + '...'
            );
            var avaliacao = await Api.criarAvaliacao({
              turmaId: turma.id,
              materiaId: materia.id,
              bimestre: b,
              nome: avaliacoes[k].nome,
              peso: avaliacoes[k].peso
            });
            resumo.avaliacoes += 1;

            for (var i = 0; i < alunos.length; i += 1) {
              await Api.salvarNota({
                avaliacaoId: avaliacao.id,
                alunoId: alunos[i].id,
                valor: notaDeTeste(i, m, b, k)
              });
              resumo.notas += 1;
              if (resumo.notas % 8 === 0 || resumo.notas === totalNotas) {
                relatar('Lançando notas... ' + resumo.notas + ' de ' + totalNotas);
              }
            }
          }
        }
      }
    }

    relatar('Concluído.');
    return resumo;
  }

  async function removerDadosTeste(relatar) {
    var alvos = turmasDeTeste();
    for (var i = 0; i < alvos.length; i += 1) {
      relatar('Removendo turma ' + (i + 1) + ' de ' + alvos.length + '...');
      await Api.excluirTurma(alvos[i].id);
    }
    return alvos.length;
  }

  return {
    render: render,
    abrirFormulario: abrirFormulario,
    excluirTurma: excluirTurma
  };
})();
