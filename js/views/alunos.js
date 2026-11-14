/** Aba de alunos: cadastro manual, busca, renomear, excluir e importação. */
var AlunosTab = (function () {
  // Nomes fictícios usados no modelo CSV baixado pela tela de importação.
  var NOMES_MODELO = [
    'Ana Beatriz Souza', 'Bruno Carvalho', 'Carla Mendes',
    'Diego Ferreira', 'Elisa Rocha', 'Felipe Nunes',
    'Gabriela Lima', 'Henrique Alves', 'Isabela Martins', 'João Pedro Costa'
  ];

  function render(container, turma) {
    if (!Estado.alunosCarregados || !Estado.turma || Estado.turma.id !== turma.id) {
      Estado.alunos = [];
      Estado.alunosCarregados = false;
      Estado.alunoEditandoId = null;
      container.innerHTML = Ui.carregando('Carregando alunos...');
      carregar(container, turma);
      return;
    }
    montar(container, turma);
  }

  async function carregar(container, turma) {
    try {
      var alunos = await Api.listarAlunos(turma.id);
      if (!Estado.turma || Estado.turma.id !== turma.id) return;
      Estado.alunos = alunos;
      Estado.alunosCarregados = true;
      montar(container, turma);
    } catch (erro) {
      container.innerHTML = Ui.alerta(
        Ui.escaparHtml(erro.message || 'Não foi possível carregar os alunos.'),
        'erro'
      );
    }
  }

  function montar(container, turma) {
    container.innerHTML =
      '<div id="alunos-painel">' +
        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<div class="card-title">Alunos da turma</div>' +
              '<div class="card-subtitle">' +
                Estado.alunos.length + ' ' +
                Ui.plural(Estado.alunos.length, 'aluno cadastrado', 'alunos cadastrados') +
              '</div>' +
            '</div>' +
            '<div class="page-actions">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-importar>' +
                Ui.icone('upload') + 'Importar planilha' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="card-body tight">' +
            '<form class="inline-form" id="form-add-aluno" novalidate>' +
              '<input class="input" id="novo-aluno-nome" maxlength="160" ' +
                'placeholder="Digite o nome do aluno e pressione Enter" autocomplete="off">' +
              '<button type="submit" class="btn btn-primary">' +
                Ui.icone('plus') + 'Adicionar' +
              '</button>' +
            '</form>' +
            '<div style="margin-top:12px; position:relative">' +
              '<input class="input" id="buscar-aluno" placeholder="Buscar aluno..." ' +
                'value="' + Ui.escaparHtml(Estado.filtroAluno) + '" autocomplete="off">' +
            '</div>' +
          '</div>' +
          '<div id="alunos-tabela-wrap"></div>' +
        '</div>' +
      '</div>';

    var painel = container.querySelector('#alunos-painel');
    var form = painel.querySelector('#form-add-aluno');
    var inputNovo = painel.querySelector('#novo-aluno-nome');
    var busca = painel.querySelector('#buscar-aluno');

    form.addEventListener('submit', async function (evento) {
      evento.preventDefault();
      var nome = inputNovo.value.trim();
      if (!nome) {
        inputNovo.focus();
        return;
      }
      var botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        var aluno = await Api.adicionarAluno(turma.id, nome);
        Estado.alunos.push(aluno);
        Estado.alunos.sort(ordenarAlunos);
        inputNovo.value = '';
        inputNovo.focus();
        atualizarTabela(painel, turma, container);
        Ui.toast('Aluno adicionado.', 'sucesso');
        App.atualizarContagens();
      } catch (erro) {
        Ui.toast(erro.message || 'Não foi possível adicionar o aluno.', 'erro');
      } finally {
        botao.disabled = false;
      }
    });

    busca.addEventListener('input', function () {
      Estado.filtroAluno = busca.value;
      atualizarTabela(painel, turma, container);
    });

    painel.querySelector('[data-importar]').addEventListener('click', function () {
      abrirImportacao(turma, container);
    });

    painel.addEventListener('click', function (evento) {
      var botao = evento.target.closest('[data-acao-aluno]');
      if (!botao) return;
      var acao = botao.getAttribute('data-acao-aluno');
      var id = botao.getAttribute('data-aluno-id');

      if (acao === 'editar') {
        Estado.alunoEditandoId = id;
        atualizarTabela(painel, turma, container);
      } else if (acao === 'cancelar') {
        Estado.alunoEditandoId = null;
        atualizarTabela(painel, turma, container);
      } else if (acao === 'salvar') {
        salvarNome(painel, turma, id, container);
      } else if (acao === 'excluir') {
        excluirAluno(painel, turma, id, container);
      } else if (acao === 'mover-cima' || acao === 'mover-baixo') {
        moverAluno(painel, turma, id, acao === 'mover-cima' ? 'cima' : 'baixo', container);
      }
    });

    painel.addEventListener('keydown', function (evento) {
      if (evento.key !== 'Enter') return;
      var input = evento.target.closest('[data-editar-nome]');
      if (!input) return;
      evento.preventDefault();
      salvarNome(painel, turma, input.getAttribute('data-aluno-id'), container);
    });

    atualizarTabela(painel, turma, container);
  }

  function atualizarTabela(container, turma, raizExterna) {
    var wrap = container.querySelector('#alunos-tabela-wrap');
    if (!wrap) return;
    var externo = raizExterna || container;

    var filtro = Estado.filtroAluno.trim().toLowerCase();
    var filtrando = !!filtro;
    var alunos = Estado.alunos.filter(function (aluno) {
      return !filtro || aluno.nome.toLowerCase().indexOf(filtro) !== -1;
    });

    if (!Estado.alunos.length) {
      wrap.innerHTML = Ui.vazio({
        icone: 'users',
        titulo: 'Nenhum aluno cadastrado',
        texto:
          'Adicione um aluno manualmente ou importe uma planilha com os nomes da turma.',
        acao:
          '<button type="button" class="btn btn-secondary" data-importar-vazio>' +
          Ui.icone('upload') + 'Importar planilha</button>'
      });
      var botaoVazio = wrap.querySelector('[data-importar-vazio]');
      if (botaoVazio) {
        botaoVazio.addEventListener('click', function () {
          abrirImportacao(turma, externo);
        });
      }
      return;
    }

    if (!alunos.length) {
      wrap.innerHTML = Ui.vazio({
        icone: 'search',
        titulo: 'Nenhum aluno encontrado',
        texto: 'Tente outro termo de busca.'
      });
      return;
    }

    wrap.innerHTML =
      '<div class="table-wrap">' +
        '<table class="table">' +
          '<thead><tr>' +
            '<th style="width:52px">#</th>' +
            '<th>Nome do aluno</th>' +
            '<th style="width:190px; text-align:right">Ações</th>' +
          '</tr></thead>' +
          '<tbody>' +
            alunos.map(function (aluno, indice) {
              var editando = Estado.alunoEditandoId === aluno.id;
              var podeMover = !editando && !filtrando;
              var primeiro = indice === 0;
              var ultimo = indice === alunos.length - 1;
              return (
                '<tr>' +
                  '<td class="student-index">' + (indice + 1) + '</td>' +
                  '<td>' +
                    (editando
                      ? '<div class="inline-edit">' +
                          '<input class="input" data-editar-nome data-aluno-id="' +
                            Ui.escaparHtml(aluno.id) + '" maxlength="160" value="' +
                            Ui.escaparHtml(aluno.nome) + '">' +
                          '<button type="button" class="icon-btn" title="Salvar" ' +
                            'data-acao-aluno="salvar" data-aluno-id="' +
                            Ui.escaparHtml(aluno.id) + '">' + Ui.icone('check') + '</button>' +
                          '<button type="button" class="icon-btn" title="Cancelar" ' +
                            'data-acao-aluno="cancelar" data-aluno-id="' +
                            Ui.escaparHtml(aluno.id) + '">' + Ui.icone('x') + '</button>' +
                        '</div>'
                      : '<span class="student-name">' + Ui.escaparHtml(aluno.nome) + '</span>') +
                  '</td>' +
                  '<td>' +
                    '<div class="row-actions">' +
                      (podeMover
                        ? '<button type="button" class="icon-btn" title="Mover para cima" ' +
                            (primeiro ? 'disabled ' : '') +
                            'data-acao-aluno="mover-cima" data-aluno-id="' +
                            Ui.escaparHtml(aluno.id) + '">' + Ui.icone('arrowUp') + '</button>' +
                          '<button type="button" class="icon-btn" title="Mover para baixo" ' +
                            (ultimo ? 'disabled ' : '') +
                            'data-acao-aluno="mover-baixo" data-aluno-id="' +
                            Ui.escaparHtml(aluno.id) + '">' + Ui.icone('arrowDown') + '</button>'
                        : '') +
                      (!editando
                        ? '<button type="button" class="icon-btn" title="Editar nome" ' +
                            'data-acao-aluno="editar" data-aluno-id="' +
                            Ui.escaparHtml(aluno.id) + '">' + Ui.icone('edit') + '</button>'
                        : '') +
                      '<button type="button" class="icon-btn perigo" title="Excluir aluno" ' +
                        'data-acao-aluno="excluir" data-aluno-id="' +
                        Ui.escaparHtml(aluno.id) + '">' + Ui.icone('trash') + '</button>' +
                    '</div>' +
                  '</td>' +
                '</tr>'
              );
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';

    if (Estado.alunoEditandoId) {
      var inputEdicao = wrap.querySelector('[data-editar-nome]');
      if (inputEdicao) {
        inputEdicao.focus();
        inputEdicao.select();
      }
    }
  }

  async function salvarNome(container, turma, id, raizExterna) {
    var input = container.querySelector('[data-editar-nome][data-aluno-id="' + id + '"]');
    if (!input) return;
    var nome = input.value.trim();
    if (!nome) {
      Ui.toast('O nome do aluno não pode ficar vazio.', 'aviso');
      input.focus();
      return;
    }

    try {
      var aluno = await Api.renomearAluno(id, nome);
      Estado.alunos = Estado.alunos.map(function (item) {
        return item.id === id ? aluno : item;
      });
      Estado.alunoEditandoId = null;
      atualizarTabela(container, turma, raizExterna);
      Ui.toast('Nome atualizado.', 'sucesso');
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível renomear o aluno.', 'erro');
    }
  }

  /** Move o aluno uma posição para cima ou para baixo e re-renderiza a lista. */
  async function moverAluno(container, turma, id, direcao, raizExterna) {
    try {
      var alunos = await Api.moverAluno(id, direcao);
      if (Array.isArray(alunos)) Estado.alunos = alunos;
      atualizarTabela(container, turma, raizExterna);
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível alterar a posição do aluno.', 'erro');
    }
  }

  async function excluirAluno(container, turma, id, raizExterna) {
    var aluno = Estado.alunos.filter(function (item) {
      return item.id === id;
    })[0];
    if (!aluno) return;

    var confirmou = await Ui.confirmar({
      titulo: 'Excluir aluno',
      mensagem:
        'Excluir "' + aluno.nome + '" também apaga as notas dele em todas as avaliações. ' +
        'Deseja continuar?',
      textoConfirmar: 'Excluir aluno',
      perigo: true
    });
    if (!confirmou) return;

    try {
      await Api.excluirAluno(id);
      Estado.alunos = Estado.alunos.filter(function (item) {
        return item.id !== id;
      });
      if (Estado.alunoEditandoId === id) Estado.alunoEditandoId = null;
      atualizarTabela(container, turma, raizExterna);
      Ui.toast('Aluno excluído.', 'sucesso');
      App.atualizarContagens();
    } catch (erro) {
      Ui.toast(erro.message || 'Não foi possível excluir o aluno.', 'erro');
    }
  }

  function baixarModeloAlunos() {
    var conteudo = '\uFEFFNome\r\n' + NOMES_MODELO.join('\r\n') + '\r\n';
    var blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-importacao-alunos.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
    Ui.toast('Modelo baixado. Substitua os nomes de exemplo pelos reais.', 'sucesso');
  }

  function abrirImportacao(turma, container) {
    var corpo =
      '<div id="import-erro" class="hidden" style="margin-bottom:14px"></div>' +
      '<div class="stack">' +
        Ui.alerta(
          'Um nome por linha. Também é possível importar CSV/TXT com uma coluna de nomes ' +
          'ou informar o link de uma planilha do Google Sheets.',
          'info'
        ) +
        '<div class="stack" style="gap:8px">' +
          '<label class="radio-card selecionado" data-modo-card="texto">' +
            '<input type="radio" name="modo-import" value="texto" checked>' +
            '<span class="radio-card-info">' +
              '<strong>Colar lista de nomes</strong>' +
              '<span>Digite ou cole um nome por linha.</span>' +
            '</span>' +
          '</label>' +
          '<label class="radio-card" data-modo-card="arquivo">' +
            '<input type="radio" name="modo-import" value="arquivo">' +
            '<span class="radio-card-info">' +
              '<strong>Enviar arquivo CSV ou TXT</strong>' +
              '<span>O arquivo deve ter os nomes em uma coluna.</span>' +
            '</span>' +
          '</label>' +
          '<label class="radio-card" data-modo-card="url">' +
            '<input type="radio" name="modo-import" value="url">' +
            '<span class="radio-card-info">' +
              '<strong>Link do Google Sheets</strong>' +
              '<span>Cole o link da planilha com os nomes.</span>' +
            '</span>' +
          '</label>' +
        '</div>' +
        '<div id="import-campos"></div>' +
      '</div>';

    var modal = Ui.abrirModal({
      titulo: 'Importar alunos',
      subtitulo: 'Adicione vários alunos de uma vez para a turma ' + turma.nome + '.',
      corpo: corpo,
      rodape:
        '<button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-importar-alunos>' +
          Ui.icone('upload') + 'Importar alunos' +
        '</button>'
    });

    var campos = modal.corpo.querySelector('#import-campos');
    var erroBox = modal.corpo.querySelector('#import-erro');
    var botao = modal.rodape.querySelector('[data-importar-alunos]');

    campos.addEventListener('click', function (evento) {
      var baixar = evento.target.closest('[data-baixar-modelo]');
      if (!baixar) return;
      evento.preventDefault();
      baixarModeloAlunos();
    });

    function modoSelecionado() {
      var marcado = modal.corpo.querySelector('input[name="modo-import"]:checked');
      return marcado ? marcado.value : 'texto';
    }

    function renderCampos() {
      var modo = modoSelecionado();
      Ui.qsa('[data-modo-card]', modal.corpo).forEach(function (card) {
        card.classList.toggle(
          'selecionado',
          card.getAttribute('data-modo-card') === modo
        );
      });

      if (modo === 'texto') {
        campos.innerHTML =
          '<div class="field">' +
            '<label class="label" for="import-texto">Nomes dos alunos</label>' +
            '<textarea class="textarea" id="import-texto" ' +
              'placeholder="Ana Silva&#10;Bruno Souza&#10;Carla Lima"></textarea>' +
          '</div>';
      } else if (modo === 'arquivo') {
        campos.innerHTML =
          '<div class="field">' +
            '<label class="label" for="import-arquivo">Arquivo CSV ou TXT</label>' +
            '<input class="input" id="import-arquivo" type="file" accept=".csv,.txt,text/csv,text/plain">' +
            '<p class="hint">A codificação é detectada automaticamente (UTF-8 ou Windows-1252).</p>' +
            '<p class="hint">Sem arquivo? ' +
              '<button type="button" class="btn btn-ghost btn-sm" data-baixar-modelo>' +
                Ui.icone('download') + 'Baixar modelo CSV' +
              '</button>' +
            '</p>' +
          '</div>';
      } else {
        campos.innerHTML =
          '<div class="field">' +
            '<label class="label" for="import-url">Link da planilha</label>' +
            '<input class="input" id="import-url" type="url" ' +
              'placeholder="https://docs.google.com/spreadsheets/d/...">' +
            '<p class="hint">A planilha precisa estar acessível pela sua conta Google.</p>' +
          '</div>';
      }
    }

    function mostrarErro(mensagem) {
      erroBox.className = 'alert alert-danger';
      erroBox.innerHTML = Ui.icone('alert') + '<div>' + Ui.escaparHtml(mensagem) + '</div>';
    }

    modal.corpo.addEventListener('change', function (evento) {
      if (evento.target.name === 'modo-import') renderCampos();
    });

    modal.rodape.querySelector('[data-cancelar]').addEventListener('click', modal.fechar);

    botao.addEventListener('click', async function () {
      erroBox.className = 'hidden';
      var modo = modoSelecionado();
      var payload = {};
      botao.disabled = true;
      var textoOriginal = botao.innerHTML;
      botao.innerHTML = '<span class="spinner" style="width:15px;height:15px"></span> Importando...';

      try {
        if (modo === 'texto') {
          var texto = modal.corpo.querySelector('#import-texto').value;
          if (!texto.trim()) throw new Error('Cole a lista de nomes para importar.');
          payload.texto = texto;
        } else if (modo === 'arquivo') {
          var arquivo = modal.corpo.querySelector('#import-arquivo').files[0];
          if (!arquivo) throw new Error('Selecione um arquivo CSV ou TXT.');
          if (arquivo.size > 3 * 1024 * 1024) {
            throw new Error('O arquivo é muito grande. Use um arquivo de até 3 MB.');
          }
          payload.texto = await lerArquivoTexto(arquivo);
        } else {
          var url = modal.corpo.querySelector('#import-url').value.trim();
          if (!url) throw new Error('Informe o link da planilha do Google Sheets.');
          payload.url = url;
        }

        var resultado = await Api.importarAlunos(turma.id, payload);
        var mensagem =
          resultado.adicionados + ' ' +
          Ui.plural(resultado.adicionados, 'aluno adicionado', 'alunos adicionados') + '.';
        if (resultado.ignorados > 0) {
          mensagem +=
            ' ' + resultado.ignorados + ' ' +
            Ui.plural(resultado.ignorados, 'nome ignorado', 'nomes ignorados') +
            ' por já existir na turma.';
        }
        Ui.toast(mensagem, resultado.adicionados ? 'sucesso' : 'aviso');
        modal.fechar();

        var alunos = await Api.listarAlunos(turma.id);
        Estado.alunos = alunos;
        Estado.alunosCarregados = true;
        montar(container, turma);
        App.atualizarContagens();
      } catch (erro) {
        mostrarErro(erro.message || 'Não foi possível importar os alunos.');
        botao.disabled = false;
        botao.innerHTML = textoOriginal;
      }
    });

    renderCampos();
  }

  function lerArquivoTexto(arquivo) {
    return arquivo.arrayBuffer().then(function (buffer) {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch (erro) {
        return new TextDecoder('windows-1252').decode(buffer);
      }
    });
  }

  /**
   * Mesma regra do backend: quem tem posição escolhida vem primeiro, na ordem
   * escolhida; os demais ficam em ordem alfabética no final.
   */
  function ordenarAlunos(a, b) {
    var ordemA = Number(a.ordem);
    var ordemB = Number(b.ordem);
    var temA = a.ordem !== null && a.ordem !== undefined && a.ordem !== '' && isFinite(ordemA);
    var temB = b.ordem !== null && b.ordem !== undefined && b.ordem !== '' && isFinite(ordemB);
    if (!temA && temB) return 1;
    if (temA && !temB) return -1;
    if (temA && temB && ordemA !== ordemB) return ordemA - ordemB;
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  }

  return {
    render: render
  };
})();
