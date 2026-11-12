/**
 * Médias editáveis.
 *
 * Compartilha entre as telas de Notas e Boletim:
 * - os atributos que transformam uma célula de média em botão de edição;
 * - o modal que salva a média manual ou volta ao cálculo automático.
 *
 * Regra: sem valor manual vale o cálculo automático; com valor manual, vale o
 * que o professor digitou. O valor automático continua visível no modal.
 */
var MediasUI = (function () {
  function rotulo(escopo, bimestre) {
    if (escopo === 'final') return 'Média final (5º conceito)';
    return 'Média do ' + Number(bimestre) + 'º bimestre';
  }

  function numeroTexto(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    var numero = Number(valor);
    return isFinite(numero) ? String(numero) : '';
  }

  /** Atributos lidos pelo clique delegado em document. */
  function atributos(opcoes) {
    return (
      ' data-editar-media="1"' +
      ' data-aluno-id="' + Ui.escaparHtml(opcoes.alunoId) + '"' +
      ' data-aluno-nome="' + Ui.escaparHtml(opcoes.alunoNome || '') + '"' +
      ' data-materia-id="' + Ui.escaparHtml(opcoes.materiaId) + '"' +
      ' data-materia-nome="' + Ui.escaparHtml(opcoes.materiaNome || '') + '"' +
      ' data-escopo="' + Ui.escaparHtml(opcoes.escopo) + '"' +
      ' data-bimestre="' + (Number(opcoes.bimestre) || 0) + '"' +
      ' data-media="' + Ui.escaparHtml(numeroTexto(opcoes.media)) + '"' +
      ' data-media-automatica="' +
        Ui.escaparHtml(numeroTexto(opcoes.mediaAutomatica)) + '"' +
      ' data-manual="' + (opcoes.manual ? '1' : '0') + '"'
    );
  }

  function lerCelula(elemento) {
    return {
      alunoId: elemento.getAttribute('data-aluno-id'),
      alunoNome: elemento.getAttribute('data-aluno-nome') || '',
      materiaId: elemento.getAttribute('data-materia-id'),
      materiaNome: elemento.getAttribute('data-materia-nome') || '',
      escopo: elemento.getAttribute('data-escopo') || 'bimestre',
      bimestre: Number(elemento.getAttribute('data-bimestre')) || 0,
      media: elemento.getAttribute('data-media'),
      mediaAutomatica: elemento.getAttribute('data-media-automatica'),
      manual: elemento.getAttribute('data-manual') === '1'
    };
  }

  function abrirEdicao(dados) {
    var automatica =
      dados.mediaAutomatica === '' || dados.mediaAutomatica === null
        ? null
        : Number(dados.mediaAutomatica);

    var automaticoTexto =
      automatica === null || !isFinite(automatica)
        ? 'ainda não há notas suficientes para o cálculo automático'
        : 'o cálculo automático é <strong>' + Ui.formatarNota(automatica) + '</strong>';

    var corpo =
      '<div class="stack">' +
        Ui.alerta(
          'Nesta ' + Ui.escaparHtml(rotulo(dados.escopo, dados.bimestre).toLowerCase()) +
          ', ' + automaticoTexto + '. Ao digitar um valor abaixo, a média manual ' +
          'passa a valer no boletim. Deixe em branco para voltar ao automático.',
          'info'
        ) +
        '<div class="field">' +
          '<label class="label" for="media-manual">Média manual (0 a 10)</label>' +
          '<input class="input" id="media-manual" inputmode="decimal" ' +
            'autocomplete="off" ' +
            'placeholder="' +
              (automatica === null ? 'Sem cálculo automático' : Ui.formatarNota(automatica)) +
            '" value="' +
              (dados.manual ? Ui.formatarNotaInput(dados.media) : '') +
            '">' +
          '<p class="hint">Deixe em branco e salve para usar o cálculo automático.</p>' +
        '</div>' +
        '<div id="media-manual-erro" class="hidden"></div>' +
      '</div>';

    var modal = Ui.abrirModal({
      titulo: 'Editar média',
      subtitulo:
        (dados.alunoNome || 'Aluno') +
        (dados.materiaNome ? ' · ' + dados.materiaNome : '') +
        ' · ' + rotulo(dados.escopo, dados.bimestre),
      corpo: corpo,
      rodape:
        '<button type="button" class="btn btn-secondary" data-cancelar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-salvar-media>' +
          Ui.icone('save') + 'Salvar' +
        '</button>'
    });

    var input = modal.corpo.querySelector('#media-manual');
    var erroBox = modal.corpo.querySelector('#media-manual-erro');
    var botao = modal.rodape.querySelector('[data-salvar-media]');

    modal.rodape.querySelector('[data-cancelar]').addEventListener('click', modal.fechar);

    function mostrarErro(mensagem) {
      erroBox.className = 'alert alert-danger';
      erroBox.innerHTML =
        Ui.icone('alert') + '<div>' + Ui.escaparHtml(mensagem) + '</div>';
    }

    async function salvar() {
      var bruto = input.value.trim();
      var valor = bruto === '' ? null : Number(bruto.replace(',', '.'));
      if (valor !== null && (!isFinite(valor) || valor < 0 || valor > 10)) {
        mostrarErro('Digite uma média entre 0 e 10, ou deixe em branco.');
        input.focus();
        return;
      }

      botao.disabled = true;
      botao.innerHTML =
        '<span class="spinner" style="width:15px;height:15px"></span> Salvando...';
      erroBox.className = 'hidden';

      try {
        await Api.salvarMediaManual({
          alunoId: dados.alunoId,
          materiaId: dados.materiaId,
          escopo: dados.escopo,
          bimestre: dados.escopo === 'bimestre' ? dados.bimestre : 0,
          valor: valor === null ? '' : valor
        });
        modal.fechar();
        Ui.toast(
          valor === null
            ? 'Média voltou ao cálculo automático.'
            : 'Média manual salva.',
          'sucesso'
        );
        if (window.App && typeof App.recarregarRota === 'function') {
          App.recarregarRota();
        }
      } catch (erro) {
        mostrarErro(erro.message || 'Não foi possível salvar a média.');
        botao.disabled = false;
        botao.innerHTML = Ui.icone('save') + 'Salvar';
      }
    }

    botao.addEventListener('click', salvar);
    input.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        salvar();
      }
    });
    input.focus();
    input.select();
  }

  // Um único clique delegado atende Notas e Boletim, inclusive após re-render.
  document.addEventListener('click', function (evento) {
    var alvo = evento.target.closest('[data-editar-media]');
    if (!alvo) return;
    evento.preventDefault();
    abrirEdicao(lerCelula(alvo));
  });

  return {
    rotulo: rotulo,
    atributos: atributos
  };
})();
