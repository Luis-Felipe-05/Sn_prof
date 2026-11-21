/**
 * Aba "Alunos de recuperação": lista por matéria.
 *
 * Tudo é calculado em memória, ao abrir a página, a partir do resumo de cada
 * turma: nada é gravado no banco nem no Apps Script. Critérios, aplicados
 * matéria por matéria:
 *
 *   1º semestre: ((média 1º bim. + média 2º bim.) / 2) < 5
 *   2º semestre: ((média 3º bim. + média 4º bim.) / 2) < 5
 *
 * A média de um bimestre só considera as notas da matéria; um aluno pode ficar
 * em recuperação no 1º semestre, no 2º ou nos dois — nesta realidade por
 * matéria também —, mesmo estando aprovado na média geral da turma.
 */
var RecuperacaoView = (function () {
  var LIMITE_REQUISICOES = 4;
  var CACHE = { chave: null, itens: null };

  /* ------------------------------------------------------------------ */
  /* Cálculo (puro, sem DOM)                                             */
  /* ------------------------------------------------------------------ */

  function arredondar(valor) {
    return Math.round(Number(valor) * 100) / 100;
  }

  /**
   * Média de um bimestre para um aluno: médias das matérias que têm nota.
   * Com `materiaId`, só o cálculo daquela matéria entra (modo “por matéria”).
   * `parcial` quando alguma matéria tem avaliação lançada sem nota completa.
   */
  function mediaDeBimestre(aluno, bimestre, materiaId) {
    var valores = [];
    var parcial = false;
    var materias = aluno.materias || {};
    var alvos = materiaId ? [materiaId] : Object.keys(materias);

    alvos.forEach(function (id) {
      var daMateria = materias[id];
      if (!daMateria) return;
      var calculo = (daMateria.bimestres || {})[bimestre];
      if (!calculo) return;

      var avaliacoes = Number(calculo.totalAvaliacoes) || 0;
      var lancadas = Number(calculo.lancamentos) || 0;
      if (avaliacoes > 0 && lancadas < avaliacoes) parcial = true;

      var valor = calculo.mediaExata;
      if (valor === null || valor === undefined || !isFinite(Number(valor))) {
        // Matéria sem avaliação neste bimestre (ou sem nota nenhuma) fica de
        // fora: ela não entra na média do bimestre.
        if (avaliacoes > 0) parcial = true;
        return;
      }
      valores.push(Number(valor));
    });

    if (!valores.length) {
      return { valor: null, exato: null, parcial: parcial };
    }

    var media = valores.reduce(function (soma, nota) {
      return soma + nota;
    }, 0) / valores.length;

    return { valor: arredondar(media), exato: media, parcial: parcial };
  }

  function ausente(calc) {
    return !calc || calc.exato === null || calc.exato === undefined;
  }

  function mediaSemestre(segundo, primeiro) {
    if (ausente(segundo) || ausente(primeiro)) return null;
    var exato = (segundo.exato + primeiro.exato) / 2;
    return {
      valor: arredondar(exato),
      exato: exato,
      parcial: segundo.parcial || primeiro.parcial
    };
  }

  /**
   * Calcula quem está de recuperação numa resposta de apiObterResumo.
   * `materia` é opcional: definindo, só as notas daquela matéria entram.
   */
  function calcular(resumo, materia) {
    var alunos = (resumo && resumo.alunos) || [];
    var materiaId = materia ? materia.id : null;
    var emRecuperacao = [];
    var semNotas = 0;

    alunos.forEach(function (aluno) {
      var bimestres = [1, 2, 3, 4].map(function (bimestre) {
        return mediaDeBimestre(aluno, bimestre, materiaId);
      });
      // Ordem inversa: o segundo argumento vem primeiro.
      var semestre1 = mediaSemestre(bimestres[1], bimestres[0]);
      var semestre2 = mediaSemestre(bimestres[3], bimestres[2]);

      var rec1 = !!semestre1 && semestre1.exato < 5;
      var rec2 = !!semestre2 && semestre2.exato < 5;
      if (!semestre1 && !semestre2) semNotas += 1;
      if (!rec1 && !rec2) return;

      emRecuperacao.push({
        id: aluno.id,
        nome: aluno.nome,
        bimestres: bimestres,
        semestre1: semestre1,
        semestre2: semestre2,
        rec1: rec1,
        rec2: rec2,
        situacao: rec1 && rec2 ? '12' : rec1 ? '1' : '2',
        parcial: (rec1 && semestre1.parcial) || (rec2 && semestre2.parcial)
      });
    });

    emRecuperacao.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {
        sensitivity: 'base'
      });
    });

    return {
      total: alunos.length,
      materias: ((resumo && resumo.materias) || []).length,
      materia: materia || null,
      alunos: emRecuperacao,
      semNotas: semNotas,
      rec1: emRecuperacao.filter(function (aluno) {
        return aluno.rec1;
      }).length,
      rec2: emRecuperacao.filter(function (aluno) {
        return aluno.rec2;
      }).length,
      ambos: emRecuperacao.filter(function (aluno) {
        return aluno.rec1 && aluno.rec2;
      }).length
    };
  }

  /** Recuperação pela média geral do aluno (todas as matérias juntas). */
  function calcularTurma(resumo) {
    return calcular(resumo, null);
  }

  /** Recuperação olhando apenas uma matéria. */
  function calcularMateria(resumo, materia) {
    return calcular(resumo, materia || null);
  }

  /** Um bloco “turma + matéria” para o modo por matéria. */
  function calcularMaterias(resumo) {
    return (((resumo && resumo.materias) || []).map(function (materia) {
      return { materia: materia, calculo: calcularMateria(resumo, materia) };
    }));
  }

  /**
   * Total de uma turma: ocorrências aluno·matéria e quantos alunos únicos
   * aparecem, para os contadores não misturarem as duas contagens.
   */
  function agregar(item) {
    var totais = {
      registros: 0,
      rec1: 0,
      rec2: 0,
      ambos: 0,
      alunos: 0,
      alunosRec1: 0,
      alunosRec2: 0,
      alunosAmbos: 0,
      materias: 0
    };
    var vistos = {};

    (item.materias || []).forEach(function (bloco) {
      var calc = bloco.calculo;
      totais.materias += 1;
      totais.registros += calc.alunos.length;
      totais.rec1 += calc.rec1;
      totais.rec2 += calc.rec2;
      totais.ambos += calc.ambos;

      calc.alunos.forEach(function (aluno) {
        var chave = aluno.id || aluno.nome;
        var visto = vistos[chave];
        if (!visto) {
          visto = vistos[chave] = { rec1: false, rec2: false, ambos: false };
        }
        visto.rec1 = visto.rec1 || aluno.rec1;
        visto.rec2 = visto.rec2 || aluno.rec2;
        visto.ambos = visto.ambos || (aluno.rec1 && aluno.rec2);
      });
    });

    Object.keys(vistos).forEach(function (chave) {
      var visto = vistos[chave];
      totais.alunos += 1;
      if (visto.rec1) totais.alunosRec1 += 1;
      if (visto.rec2) totais.alunosRec2 += 1;
      if (visto.ambos) totais.alunosAmbos += 1;
    });

    return totais;
  }

  /* ------------------------------------------------------------------ */
  /* Formatação de texto                                                 */
  /* ------------------------------------------------------------------ */

  function nota(valor) {
    if (valor === null || valor === undefined || !isFinite(Number(valor))) {
      return '—';
    }
    return Number(valor).toFixed(1).replace('.', ',');
  }

  function rotuloSituacao(aluno, completo) {
    var base =
      aluno.situacao === '12'
        ? 'Recuperação nos dois semestres'
        : aluno.situacao === '1'
          ? 'Recuperação no 1º semestre'
          : 'Recuperação no 2º semestre';
    if (completo) return base;
    if (aluno.situacao === '1') return '1º semestre';
    if (aluno.situacao === '2') return '2º semestre';
    return '1º e 2º semestres';
  }

  function celulaMedia(calc, emRecuperacao) {
    if (!calc || calc.valor === null || calc.valor === undefined) {
      return '<span class="media-cell vazia">—</span>';
    }
    return (
      '<span class="media-cell' + (emRecuperacao ? ' recup' : '') + '">' +
      nota(calc.valor) +
      '</span>' +
      (calc.parcial
        ? '<span class="media-sub">parcial</span>'
        : '')
    );
  }

  /* ------------------------------------------------------------------ */
  /* Carregamento                                                        */
  /* ------------------------------------------------------------------ */

  function turmasFiltradas() {
    // Ano escolhido que deixou de existir volta para "todos os anos",
    // mesmo comportamento da tela de Turmas.
    var anos = Estado.anosDisponiveis();
    if (
      Estado.filtroAno !== 'todos' &&
      anos.indexOf(Number(Estado.filtroAno)) === -1
    ) {
      Estado.filtroAno = 'todos';
    }

    return Estado.turmas.filter(function (turma) {
      return (
        Estado.filtroAno === 'todos' || turma.ano === Number(Estado.filtroAno)
      );
    });
  }

  /** Executa com no máximo LIMITE_REQUISICOES chamadas em andamento. */
  async function emParalelo(itens, funcao) {
    var resultado = new Array(itens.length);
    var proximo = 0;

    async function trabalhador() {
      while (proximo < itens.length) {
        var indice = proximo;
        proximo += 1;
        resultado[indice] = await funcao(itens[indice]);
      }
    }

    var trabalhadores = [];
    var quantidade = Math.max(
      1,
      Math.min(LIMITE_REQUISICOES, itens.length)
    );
    for (var i = 0; i < quantidade; i += 1) trabalhadores.push(trabalhador());
    await Promise.all(trabalhadores);
    return resultado;
  }

  async function carregar(container, forcar) {
    var turmas = turmasFiltradas();
    var chave = turmas
      .map(function (turma) {
        return turma.id;
      })
      .sort()
      .join(',');

    if (!forcar && CACHE.chave === chave && CACHE.itens) {
      pintar(container, CACHE.itens);
      return;
    }

    container.innerHTML =
      cabecalho() +
      '<div class="card"><div class="card-body">' +
        Ui.carregando('Calculando as médias de cada semestre...') +
      '</div></div>';
    ligarCabecalho(container, null);

    try {
      var itens = await emParalelo(turmas, function (turma) {
        return Api.obterResumo(turma.id).then(
          function (resumo) {
            return {
              turma: turma,
              resumo: resumo,
              // Os dois agrupamentos saem do mesmo resumo: trocar o modo na
              // tela não custa uma nova chamada ao servidor.
              calculo: calcularTurma(resumo),
              materias: calcularMaterias(resumo),
              erro: null
            };
          },
          function (erro) {
            return {
              turma: turma,
              resumo: null,
              calculo: null,
              materias: [],
              erro: erro.message || 'Não foi possível ler as notas da turma.'
            };
          }
        );
      });

      CACHE = { chave: chave, itens: itens };
      if (!naRota(container)) return;
      pintar(container, itens);
    } catch (erro) {
      if (!naRota(container)) return;
      container.innerHTML =
        cabecalho() +
        Ui.alerta(
          Ui.escaparHtml(
            erro.message || 'Não foi possível calcular a recuperação.'
          ),
          'erro'
        );
      ligarCabecalho(container, null);
    }
  }

  /** Evita que uma resposta lenta repinte a tela depois da navegação. */
  function naRota(container) {
    if (!Estado.rota || Estado.rota.view !== 'recuperacao') return false;
    try {
      return document.getElementById('conteudo').contains(container);
    } catch (erro) {
      return false;
    }
  }

  function atualizar(container) {
    CACHE.chave = null;
    CACHE.itens = null;
    return carregar(container, true);
  }

  /* ------------------------------------------------------------------ */
  /* Tela                                                                */
  /* ------------------------------------------------------------------ */

  function cabecalho() {
    return (
      '<div class="page-header">' +
        '<div>' +
          '<h1 class="page-title">Alunos de recuperação</h1>' +
          '<p class="page-subtitle">' +
            'Uma lista por matéria, calculada ao abrir esta página — ' +
            'nada é salvo no sistema.' +
          '</p>' +
        '</div>' +
        '<div class="page-actions no-print">' +
          '<button type="button" class="btn btn-secondary" data-atualizar-rec>' +
            Ui.icone('refresh') + 'Atualizar' +
          '</button>' +
          '<button type="button" class="btn btn-primary" data-gerar-pdf>' +
            Ui.icone('download') + 'Gerar PDF' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function ligarCabecalho(container, itens) {
    var botaoAtualizar = container.querySelector('[data-atualizar-rec]');
    if (botaoAtualizar) {
      botaoAtualizar.addEventListener('click', function () {
        atualizar(container);
      });
    }

    var botaoPdf = container.querySelector('[data-gerar-pdf]');
    if (botaoPdf) {
      botaoPdf.addEventListener('click', function () {
        gerarPdf(itens);
      });
    }

    Ui.qsa('[data-filtro-ano-rec]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        Estado.filtroAno = botao.getAttribute('data-filtro-ano-rec');
        carregar(container, false);
      });
    });
  }

  function pintar(container, itens) {
    container.innerHTML =
      cabecalho() +
      resumoCards(itens) +
      chipsAno() +
      secoes(itens) +
      legenda(itens);

    ligarCabecalho(container, itens);

    Ui.qsa('[data-ir-turma-rec]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        App.navegarTurma(botao.getAttribute('data-ir-turma-rec'), 'notas');
      });
    });

    var irTurmas = container.querySelector('[data-ir-turmas-rec]');
    if (irTurmas) {
      irTurmas.addEventListener('click', App.navegarTurmas);
    }

    // Mesma ferramenta da tela de Turmas: cria [TESTE] com alunos aprovados
    // e em recuperação (nos dois agrupamentos) para testar esta lista.
    var dadosTeste = container.querySelector('[data-dados-teste-rec]');
    if (dadosTeste) {
      dadosTeste.addEventListener('click', function () {
        if (
          typeof TurmasView !== 'undefined' &&
          typeof TurmasView.abrirDadosTeste === 'function'
        ) {
          TurmasView.abrirDadosTeste();
        }
      });
    }
  }

  /**
   * Cartões de resumo. Todos os números são **alunos**, com exceção da última
   * carta (matérias): assim o total de quem está de recuperação não briga com
   * a contagem de recuperações em matérias.
   */
  function resumoCards(itens) {
    if (!itens.length) return '';
    var totais = somar(itens);

    return (
      '<div class="summary-cards">' +
        stat('Alunos em recuperação', String(totais.total),
          'de ' + totais.alunosTotal + ' alunos') +
        stat('No 1º semestre', String(totais.rec1), 'alunos') +
        stat('No 2º semestre', String(totais.rec2), 'alunos') +
        stat('Nos dois semestres', String(totais.ambos),
          'na mesma matéria') +
        stat('Matérias com recuperação', String(totais.blocos),
          'de ' + totais.materiasTotal + ' matérias') +
      '</div>'
    );
  }

  function stat(rotulo, valor, subtitulo) {
    return (
      '<div class="stat">' +
        '<div class="stat-label">' + Ui.escaparHtml(rotulo) + '</div>' +
        '<div class="stat-value">' + valor + '</div>' +
        (subtitulo
          ? '<div class="stat-sub">' + Ui.escaparHtml(subtitulo) + '</div>'
          : '') +
      '</div>'
    );
  }

  /**
   * Somadores globais da tela: `total`, `rec1`, `rec2` e `ambos` contam
   * **alunos** (quem está em recuperação em duas matérias conta 1); `pares`
   * são as ocorrências aluno·matéria e `blocos` as matérias com ao menos um
   * aluno em recuperação.
   */
  function somar(itens) {
    var totais = {
      total: 0,
      rec1: 0,
      rec2: 0,
      ambos: 0,
      pares: 0,
      blocos: 0,
      turmas: 0,
      semNotas: 0,
      alunosTotal: 0,
      materiasTotal: 0
    };
    var vistos = {};

    (itens || []).forEach(function (item) {
      if (!item.calculo) return;
      totais.turmas += 1;
      totais.semNotas += item.calculo.semNotas;
      totais.alunosTotal += item.calculo.total;
      totais.materiasTotal += item.calculo.materias;

      item.materias.forEach(function (bloco) {
        var calc = bloco.calculo;
        if (!calc.alunos.length) return;
        totais.blocos += 1;
        totais.pares += calc.alunos.length;
        calc.alunos.forEach(function (aluno) {
          var chave = item.turma.id + ':' + (aluno.id || aluno.nome);
          var visto = vistos[chave];
          if (!visto) {
            visto = vistos[chave] =
              { rec1: false, rec2: false, ambos: false };
          }
          visto.rec1 = visto.rec1 || aluno.rec1;
          visto.rec2 = visto.rec2 || aluno.rec2;
          visto.ambos = visto.ambos || (aluno.rec1 && aluno.rec2);
        });
      });
    });

    Object.keys(vistos).forEach(function (chave) {
      var visto = vistos[chave];
      totais.total += 1;
      if (visto.rec1) totais.rec1 += 1;
      if (visto.rec2) totais.rec2 += 1;
      if (visto.ambos) totais.ambos += 1;
    });

    return totais;
  }

  function chipsAno() {
    var anos = Estado.anosDisponiveis();
    if (anos.length < 2) return '';

    return (
      '<div class="filter-chips no-print">' +
        '<button type="button" class="chip-button ' +
          (Estado.filtroAno === 'todos' ? 'ativo' : '') +
          '" data-filtro-ano-rec="todos">Todos os anos</button>' +
        anos.map(function (ano) {
          return '<button type="button" class="chip-button ' +
            (Number(Estado.filtroAno) === ano ? 'ativo' : '') +
            '" data-filtro-ano-rec="' + ano + '">' + ano + '</button>';
        }).join('') +
      '</div>'
    );
  }

  function secoes(itens) {
    if (!itens.length) {
      return Ui.vazio({
        icone: 'book',
        titulo: 'Nenhuma turma cadastrada',
        texto:
          'Cadastre uma turma e lance as notas para ver quem fica de ' +
          'recuperação — ou gere dados de teste para experimentar agora.',
        acao:
          '<button type="button" class="btn btn-primary" data-ir-turmas-rec>' +
          Ui.icone('users') + 'Ir para Turmas</button>' +
          '<button type="button" class="btn btn-secondary" data-dados-teste-rec>' +
          Ui.icone('teste') + 'Gerar dados de teste</button>'
      });
    }

    var porAno = {};
    itens.forEach(function (item) {
      var ano = item.turma.ano;
      if (!porAno[ano]) porAno[ano] = [];
      porAno[ano].push(item);
    });

    return Object.keys(porAno)
      .map(Number)
      .sort(function (a, b) {
        return b - a;
      })
      .map(function (ano) {
        return (
          '<section class="year-group">' +
            '<div class="year-heading">' +
              '<h2>Ano ' + ano + '</h2>' +
              Ui.badge(
                porAno[ano].length + ' ' +
                  Ui.plural(porAno[ano].length, 'turma', 'turmas'),
                'badge-muted'
              ) +
            '</div>' +
            porAno[ano]
              .map(function (item) {
                return cartao(item);
              })
              .join('') +
          '</section>'
        );
      })
      .join('');
  }

  function cartao(item) {
    var turma = item.turma;

    if (item.erro) {
      return (
        '<div class="card" style="margin-bottom:16px">' +
          '<div class="card-header">' +
            '<div><div class="card-title">' + Ui.escaparHtml(turma.nome) + '</div></div>' +
          '</div>' +
          Ui.alerta(Ui.escaparHtml(item.erro), 'erro') +
        '</div>'
      );
    }

    var calc = item.calculo;
    var total = calc.total;
    var alt = agregar(item);

    return (
      '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">' + Ui.escaparHtml(turma.nome) + '</div>' +
            '<div class="card-subtitle">' +
              total + ' ' + Ui.plural(total, 'aluno', 'alunos') +
              ' · ' + calc.materias + ' ' +
              Ui.plural(calc.materias, 'matéria', 'matérias') +
              ' · ' + alt.registros + ' ' +
              Ui.plural(alt.registros, 'recuperação em matéria',
                'recuperações em matérias') +
            '</div>' +
          '</div>' +
          '<div class="row">' +
            Ui.badge(alt.alunos + ' ' +
              Ui.plural(alt.alunos, 'aluno', 'alunos'),
              alt.alunos ? 'badge-danger' : 'badge-muted') +
            Ui.badge('1º sem. ' + alt.alunosRec1,
              alt.alunosRec1 ? 'badge-warning' : 'badge-muted') +
            Ui.badge('2º sem. ' + alt.alunosRec2,
              alt.alunosRec2 ? 'badge-warning' : 'badge-muted') +
            Ui.badge('Nos dois ' + alt.alunosAmbos,
              alt.alunosAmbos ? 'badge-danger' : 'badge-muted') +
          '</div>' +
        '</div>' +
        corpoPorMateria(item, calc) +
      '</div>'
    );
  }

  /** Um bloco por matéria, com a própria lista de recuperação. */
  function corpoPorMateria(item, calc) {
    if (!calc.total) {
      return '<div class="card-body">' + Ui.alerta(
        'Esta turma ainda não tem alunos cadastrados.',
        'info'
      ) + '</div>';
    }

    var comRegistro = item.materias.filter(function (bloco) {
      return bloco.calculo.alunos.length;
    });

    if (!comRegistro.length) {
      return '<div class="card-body">' + Ui.alerta(
        'Nenhum aluno está de recuperação em nenhuma matéria. Foram ' +
        'consideradas ' + item.materias.length + ' ' +
        Ui.plural(item.materias.length, 'matéria', 'matérias') + ' e ' +
        calc.total + ' ' + Ui.plural(calc.total, 'aluno', 'alunos') + '.',
        'sucesso'
      ) + '</div>';
    }

    if (!item.materias.length) {
      return '<div class="card-body">' + Ui.alerta(
        'Cadastre as matérias desta turma para ver a recuperação por matéria.',
        'info'
      ) + '</div>';
    }

    return (
      item.materias.map(blocoDeMateria).join('') +
      rodapeCalculo(calc)
    );
  }
  function blocoDeMateria(bloco) {
    var calc = bloco.calculo;
    var topo =
      '<div class="materia-bloco-topo">' +
        '<span class="materia-bloco-nome">' +
          Ui.escaparHtml(bloco.materia.nome) + '</span>' +
        '<span class="row">' +
          Ui.badge(
            calc.alunos.length + ' ' +
              Ui.plural(calc.alunos.length, 'aluno', 'alunos'),
            calc.alunos.length ? 'badge-danger' : 'badge-muted'
          ) +
          Ui.badge('1º sem. ' + calc.rec1,
            calc.rec1 ? 'badge-warning' : 'badge-muted') +
          Ui.badge('2º sem. ' + calc.rec2,
            calc.rec2 ? 'badge-warning' : 'badge-muted') +
          Ui.badge('Nos dois ' + calc.ambos,
            calc.ambos ? 'badge-danger' : 'badge-muted') +
        '</span>' +
      '</div>';

    if (!calc.alunos.length) {
      return (
        '<div class="materia-bloco">' + topo +
          '<div class="muted small materia-vazio">' +
            'Nenhum aluno está de recuperação nesta matéria.' +
          '</div>' +
        '</div>'
      );
    }

    return '<div class="materia-bloco">' + topo + tabelaHtml(calc) + '</div>';
  }

  function tabelaHtml(calc) {
    return (
      '<div class="table-wrap">' +
        '<table class="table">' +
          '<thead><tr>' +
            '<th>Aluno</th>' +
            '<th class="center">1º bim.</th>' +
            '<th class="center">2º bim.</th>' +
            '<th class="center">Média 1º sem.</th>' +
            '<th class="center">3º bim.</th>' +
            '<th class="center">4º bim.</th>' +
            '<th class="center">Média 2º sem.</th>' +
            '<th>Situação</th>' +
          '</tr></thead>' +
          '<tbody>' +
            calc.alunos.map(linha).join('') +
          '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function semNotasFrase(calc) {
    if (!calc.semNotas) return '';
    return '; ' + calc.semNotas + ' ainda não ' +
      (Number(calc.semNotas) === 1 ? 'tem notas' : 'têm notas') +
      ' suficientes para serem avaliados';
  }

  function rodapeCalculo(calc) {
    return (
      '<div class="card-footer legend">' +
        '<strong>Como calculamos:</strong> ' +
        'cada matéria tem seu próprio quadro: as médias vêm só das notas ' +
        'dessa matéria. O semestre é (1º bim. + 2º bim.) ÷ 2 — ou (3º + 4º) ' +
        '÷ 2 — e abaixo de 5,0 o aluno fica de recuperação naquele conteúdo. ' +
        'Quem aparece nos dois semestres é porque a mesma matéria ficou ' +
        'abaixo de 5,0 nos dois; um aluno pode estar aprovado na média geral ' +
        'e ainda assim de recuperação em uma matéria.' +
        semNotasFrase(calc) + '.' +
      '</div>'
    );
  }

  /**
   * Uma linha por aluno em recuperação. As médias dos semestres de
   * recuperação ficam destacadas.
   */
  function linha(aluno) {
    return (
      '<tr>' +
        '<td><span class="student-name">' + Ui.escaparHtml(aluno.nome) +
          (aluno.parcial ? '<span class="media-sub">com notas em falta</span>' : '') +
        '</span></td>' +
        '<td class="center">' + celulaSimples(aluno.bimestres[0]) + '</td>' +
        '<td class="center">' + celulaSimples(aluno.bimestres[1]) + '</td>' +
        '<td class="center semestre-recup' + (aluno.rec1 ? ' sim' : '') + '">' +
          celulaMedia(aluno.semestre1, aluno.rec1) + '</td>' +
        '<td class="center">' + celulaSimples(aluno.bimestres[2]) + '</td>' +
        '<td class="center">' + celulaSimples(aluno.bimestres[3]) + '</td>' +
        '<td class="center semestre-recup' + (aluno.rec2 ? ' sim' : '') + '">' +
          celulaMedia(aluno.semestre2, aluno.rec2) + '</td>' +
        '<td>' +
          Ui.badge(
            rotuloSituacao(aluno, false),
            aluno.situacao === '12' ? 'badge-danger' : 'badge-warning'
          ) +
        '</td>' +
      '</tr>'
    );
  }

  function celulaSimples(calc) {
    if (!calc || calc.valor === null || calc.valor === undefined) {
      return '<span class="media-cell vazia">—</span>';
    }
    return '<span class="media-cell">' + nota(calc.valor) + '</span>' +
      (calc.parcial ? '<span class="media-sub">parcial</span>' : '');
  }

  function legenda(itens) {
    var totais = somar(itens);
    if (!totais.turmas) return '';

    var partes = [
      '<strong>Como contar:</strong> ' + totais.total + ' ' +
        Ui.plural(totais.total, 'aluno está', 'alunos estão') +
        ' de recuperação em alguma matéria, em ' + totais.turmas + ' ' +
        Ui.plural(totais.turmas, 'turma', 'turmas') + ' — ' +
        totais.pares + ' ' +
        Ui.plural(totais.pares, 'ocorrência', 'ocorrências') +
        ' aluno·matéria, porque um mesmo aluno pode estar de recuperação ' +
        'em mais de uma matéria.'
    ];

    if (totais.blocos) {
      partes.push(
        ' “Nos dois” quer dizer que a mesma matéria ficou abaixo de 5,0 ' +
        'nos dois semestres.'
      );
    }
    if (totais.semNotas) {
      partes.push(
        ' Ainda, ' + totais.semNotas + ' ' +
        Ui.plural(totais.semNotas, 'aluno ainda não tem',
          'alunos ainda não têm') +
        ' notas suficientes para serem avaliados.'
      );
    }

    return (
      '<div class="card no-print">' +
        '<div class="card-body">' +
          '<div class="legend">' +
            partes.join('') +
            ' Os cálculos existem só nesta página, enquanto ela estiver ' +
            'aberta: clique em <strong>Atualizar</strong> depois de lançar ' +
            'novas notas. Valores marcados com <strong>parcial</strong> ' +
            'usam notas incompletas.' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* PDF                                                                 */
  /* ------------------------------------------------------------------ */

  var COLUNAS = [
    { titulo: 'Aluno', largura: 200, alinhamento: 'esquerda' },
    { titulo: '1º bim.', largura: 55, alinhamento: 'direita' },
    { titulo: '2º bim.', largura: 55, alinhamento: 'direita' },
    { titulo: 'Média 1º sem.', largura: 90, alinhamento: 'direita' },
    { titulo: '3º bim.', largura: 55, alinhamento: 'direita' },
    { titulo: '4º bim.', largura: 55, alinhamento: 'direita' },
    { titulo: 'Média 2º sem.', largura: 90, alinhamento: 'direita' },
    { titulo: 'Situação', largura: 162, alinhamento: 'esquerda' }
  ];

  function colunaX(indice) {
    var x = 40;
    for (var i = 0; i < indice; i += 1) x += COLUNAS[i].largura;
    return x;
  }

  /** Um bloco do PDF por matéria com recuperação, na ordem da tela. */
  function blocosPdf(itens) {
    var blocos = [];

    (itens || []).forEach(function (item) {
      if (item.erro || !item.turma || !item.materias) return;

      item.materias.forEach(function (bloco) {
        if (!bloco.calculo.alunos.length) return;
        blocos.push({
          titulo: bloco.materia.nome,
          detalhe: item.turma.nome + ' · Ano ' + item.turma.ano,
          direita: rotuloContador(bloco.calculo),
          calculo: bloco.calculo
        });
      });
    });

    return blocos;
  }

  /** Contagem à direita do título do bloco (ocorrências da matéria). */
  function rotuloContador(calc) {
    return calc.alunos.length + ' em recuperação · 1º sem. ' + calc.rec1 +
      ' · 2º sem. ' + calc.rec2 +
      (calc.ambos ? ' · nos dois ' + calc.ambos : '');
  }

  function gerarPdf(itens) {
    var totais = somar(itens);
    var blocos = blocosPdf(itens);

    if (!blocos.length) {
      Ui.toast(
        'Não há recuperação em nenhuma matéria para gerar o PDF.',
        'aviso'
      );
      return;
    }

    var doc = Pdf.criar({ largura: 842, altura: 595, margem: 40 });
    var alturaLinha = 16;

    cabecalhoPdf(doc, totais);

    blocos.forEach(function (bloco) {
      // Garante cabeçalho + duas linhas antes de começar o bloco.
      doc.espaco(24 + 20 + alturaLinha * 2);
      secaoPdf(doc, bloco);
      bloco.calculo.alunos.forEach(function (aluno) {
        // Tetos: se a linha não couber, quebra a página e repete o cabeçalho
        // para quem estiver lendo o PDF a partir daqui.
        if (doc.y + alturaLinha > doc.altura - doc.margem) {
          doc.novaPagina();
          cabecalhoContinuacaoPdf(doc, bloco);
        }
        var topo = doc.bloco(alturaLinha);
        linhaPdf(doc, bloco, aluno, topo, alturaLinha);
      });
      doc.y += 12;
    });

    var agora = new Date();
    doc.rodapes = function (pagina, total) {
      doc.texto(40, 564, 'Gerado em ' + agora.toLocaleDateString('pt-BR') +
        ' às ' + agora.toLocaleTimeString('pt-BR'),
        { tamanho: 7.5, cor: '#64748b' });
      doc.texto(802, 564, 'Página ' + pagina + ' de ' + total,
        { tamanho: 7.5, cor: '#64748b', alinhamento: 'direita' });
      doc.regua(40, 802, 561, { cor: '#e2e8f0', largura: 0.7 });
    };

    Pdf.baixar(doc, 'alunos-de-recuperacao.pdf');
    Ui.toast(
      'PDF gerado: ' + totais.total + ' ' +
        Ui.plural(totais.total, 'aluno em recuperação',
          'alunos em recuperação') +
        ' (' + totais.pares + ' ' +
        Ui.plural(totais.pares, 'ocorrência', 'ocorrências') +
        ' aluno·matéria) em ' + blocos.length + ' ' +
        Ui.plural(blocos.length, 'matéria', 'matérias') + '.',
      'sucesso'
    );
  }

  /**
   * Cabeçalho do PDF. A régua é desenhada depois da linha de totais
   * (`doc.y + 4`): antes ela saía em `doc.y - 6` e cruzava a frase.
   */
  function cabecalhoPdf(doc, totais) {
    var topo = doc.bloco(24);
    doc.texto(40, topo, 'Alunos de recuperação', {
      tamanho: 17,
      negrito: true,
      cor: '#0f172a'
    });
    doc.texto(802, topo + 6, 'Sistema de Notas', {
      tamanho: 9,
      cor: '#64748b',
      alinhamento: 'direita'
    });

    doc.bloco(14);
    doc.texto(40, topo + 27,
      'Cada matéria avaliada separadamente · ' +
      '1º semestre: ((média 1º bim. + média 2º bim.) ÷ 2) < 5 · ' +
      '2º semestre: ((média 3º bim. + média 4º bim.) ÷ 2) < 5',
      { tamanho: 8.5, cor: '#475569' });

    doc.bloco(16);
    doc.texto(40, topo + 41,
      totais.total + ' ' +
      Ui.plural(totais.total, 'aluno em recuperação',
        'alunos em recuperação') +
      ' · 1º sem. ' + totais.rec1 + ' · 2º sem. ' + totais.rec2 +
      ' · nos dois ' + totais.ambos +
      ' · ' + totais.pares + ' ' +
      Ui.plural(totais.pares, 'ocorrência aluno·matéria',
        'ocorrências aluno·matéria') +
      ' em ' + totais.blocos + ' ' +
      Ui.plural(totais.blocos, 'matéria', 'matérias'),
      { tamanho: 9, negrito: true, cor: '#4f46e5' });

    // A nota do “*” mora aqui em cima: nem corretor a joga para outra página.
    doc.texto(802, topo + 42, '* média com notas incompletas', {
      tamanho: 7.5,
      cor: '#64748b',
      alinhamento: 'direita'
    });

    doc.regua(40, 802, doc.y + 4, { cor: '#cbd5e1', largura: 0.8 });
    doc.y += 10;
  }

  function secaoPdf(doc, bloco) {
    var topo = doc.bloco(24);
    var alturaTitulo = doc.larguraTexto(bloco.titulo, 11, true);
    var xDetalhe = 47 + alturaTitulo + 10;
    var larguraDetalhe = 790 - xDetalhe;
    // Título gigante: o detalhe some em vez de invadir o contador da direita.
    var detalhe = larguraDetalhe < 60 ? '' : bloco.detalhe;
    var cor = '#1e3a8a';
    var larguraDireita = Math.max(60, 790 - xDetalhe);

    doc.retangulo(40, topo, 762, 20, '#e0e7ff');
    doc.texto(47, topo + 4, bloco.titulo, {
      tamanho: 11,
      negrito: true,
      cor: cor
    });
    doc.texto(xDetalhe, topo + 6, detalhe,
      { tamanho: 8.5, cor: '#3730a3', largura: larguraDetalhe });
    doc.texto(795, topo + 6, bloco.direita,
      { tamanho: 8.5, negrito: true, cor: '#b91c1c', alinhamento: 'direita',
        largura: larguraDireita });

    // Cabeçalho das colunas.
    colunasPdf(doc);
  }

  function cabecalhoContinuacaoPdf(doc, bloco) {
    var topo = doc.bloco(22);

    doc.retangulo(40, topo, 762, 18, '#e0e7ff');
    doc.texto(47, topo + 4, bloco.titulo + ' — continuação', {
      tamanho: 10,
      negrito: true,
      cor: '#1e3a8a',
      largura: 420
    });
    doc.texto(795, topo + 5, bloco.direita,
      { tamanho: 8.5, negrito: true, cor: '#b91c1c', alinhamento: 'direita' });

    colunasPdf(doc);
  }

  function colunasPdf(doc) {
    var topoColunas = doc.bloco(18);
    doc.retangulo(40, topoColunas, 762, 16, '#f1f5f9');
    COLUNAS.forEach(function (coluna, indice) {
      var x = colunaX(indice);
      doc.texto(
        coluna.alinhamento === 'direita'
          ? x + coluna.largura - 5
          : x + 5,
        topoColunas + 3,
        coluna.titulo,
        {
          tamanho: 8,
          negrito: true,
          cor: '#475569',
          alinhamento: coluna.alinhamento,
          largura: coluna.largura - 8
        }
      );
    });
    doc.regua(40, 802, doc.y, { cor: '#94a3b8', largura: 0.8 });
  }

  function linhaPdf(doc, bloco, aluno, topo, alturaLinha) {
    var base = topo + 3.5;

    if (aluno.rec1 || aluno.rec2) {
      // Fundo discreto nas médias dos semestres em recuperação.
      if (aluno.rec1) doc.retangulo(colunaX(3), topo, COLUNAS[3].largura, alturaLinha, '#fee2e2');
      if (aluno.rec2) doc.retangulo(colunaX(6), topo, COLUNAS[6].largura, alturaLinha, '#fee2e2');
    }

    doc.texto(colunaX(0) + 5, base, aluno.nome, {
      tamanho: 9,
      largura: COLUNAS[0].largura - 10
    });

    var valores = [
      aluno.bimestres[0], aluno.bimestres[1], aluno.semestre1,
      aluno.bimestres[2], aluno.bimestres[3], aluno.semestre2
    ];
    valores.forEach(function (calc, indice) {
      var coluna = indice + 1;
      var x = colunaX(coluna) + COLUNAS[coluna].largura - 5;
      var emRecuperacao =
        (coluna === 3 && aluno.rec1) || (coluna === 6 && aluno.rec2);
      doc.texto(x, base, textoNota(calc), {
        tamanho: 9,
        negrito: emRecuperacao,
        cor: emRecuperacao ? '#b91c1c' : '#0f172a',
        alinhamento: 'direita'
      });
    });

    doc.texto(colunaX(7) + 5, base, rotuloSituacao(aluno, true), {
      tamanho: 8.5,
      negrito: true,
      cor: aluno.situacao === '12' ? '#b91c1c' : '#b45309'
    });

    doc.regua(40, 802, topo + alturaLinha, { cor: '#e2e8f0', largura: 0.6 });
  }

  function textoNota(calc) {
    if (!calc || calc.valor === null || calc.valor === undefined) return '-';
    return nota(calc.valor) + (calc.parcial ? '*' : '');
  }

  function render(container) {
    carregar(container, false);
  }

  return {
    render: render,
    calcularTurma: calcularTurma,
    calcularMateria: calcularMateria,
    calcularMaterias: calcularMaterias,
    gerarPdf: gerarPdf
  };
})();
