/**
 * Aba "Estatísticas" — painel analítico calculado em memória.
 *
 * IMPORTANTE — regras de negócio:
 * As funções de média/recuperação abaixo são réplicas fiéis do que o sistema
 * já usa (js/views/recuperacao.js e js/local-backend.js). Nenhuma regra é
 * alterada: notas em falta valem zero, semestre é a média de dois bimestres e
 * a recuperação é disparada quando o semestre fica abaixo de 5.
 * Nada é gravado no backend — os números são derivados de Api.obterResumo().
 *
 * Gráficos: SVG puro, zero dependências.
 */
var EstatisticasView = (function () {
  var CACHE = { chave: null, dados: null };
  var ORD = { campo: 'media', dir: 'desc' };

  var COR = {
    prim: '#4f46e5',
    verde: '#10b981',
    amarelo: '#f59e0b',
    vermelho: '#ef4444',
    azul: '#3b82f6',
    roxo: '#8b5cf6',
    cinza: '#94a3b8',
    grid: '#e2e8f0',
    texto: '#64748b'
  };

  var FAIXAS = ['0-2,9', '3-4,9', '5-6,9', '7-8,9', '9-10'];
  var CORES_FAIXA = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#059669'];

  /* ================================================================== */
  /* 1. REGRAS DE NEGÓCIO — réplica exata do sistema                      */
  /* ================================================================== */

  function arredondar1(valor) {
    return Math.round(Number(valor) * 10) / 10;
  }

  /** Média de um bimestre. Cópia exata de RecuperacaoView.mediaDeBimestre. */
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
      var pesoTotal = Number(calculo.pesoTotal) || 0;
      var pesoCoberto = Number(calculo.pesoConsiderado) || 0;

      if (!(avaliacoes > 0) && !(pesoTotal > 0)) return;
      if (lancadas < avaliacoes || pesoCoberto < pesoTotal) parcial = true;

      var manual = Number(calculo.mediaExata);
      if (calculo.manual && isFinite(manual)) {
        valores.push(manual);
        return;
      }

      var pronta = calculo.mediaComZeroExata;
      if (pronta !== null && pronta !== undefined && isFinite(Number(pronta))) {
        valores.push(Number(pronta));
        return;
      }

      var exata = Number(calculo.mediaExata);
      if (!isFinite(exata)) exata = 0;
      if (pesoTotal > 0) {
        exata = exata * Math.min(pesoCoberto, pesoTotal) / pesoTotal;
      }
      valores.push(exata);
    });

    if (!valores.length) return { valor: null, exato: null, parcial: parcial };
    var media = valores.reduce(function (soma, nota) { return soma + nota; }, 0) / valores.length;
    return { valor: arredondar1(media), exato: media, parcial: parcial };
  }

  function ausente(calc) {
    return !calc || calc.exato === null || calc.exato === undefined;
  }

  /** Média do semestre. Cópia exata de RecuperacaoView.mediaSemestre. */
  function mediaSemestre(segundo, primeiro) {
    if (ausente(segundo) || ausente(primeiro)) return null;
    var exato = (segundo.exato + primeiro.exato) / 2;
    return {
      valor: arredondar1(exato),
      exato: exato,
      parcial: segundo.parcial || primeiro.parcial
    };
  }

  /**
   * Situação de recuperação do aluno, por matéria ou global.
   * Critério idêntico ao da tela "Alunos de recuperação": semestre < 5.
   */
  function situacaoRecuperacao(aluno, materiaId) {
    var bim = [1, 2, 3, 4].map(function (b) {
      return mediaDeBimestre(aluno, b, materiaId);
    });
    var s1 = mediaSemestre(bim[1], bim[0]);
    var s2 = mediaSemestre(bim[3], bim[2]);
    var rec1 = !!s1 && s1.exato < 5;
    var rec2 = !!s2 && s2.exato < 5;

    return {
      codigo: rec1 && rec2 ? '12' : rec1 ? '1' : rec2 ? '2' : '0',
      rotulo: rec1 && rec2
        ? 'Recuperação nos dois semestres'
        : rec1 ? 'Recuperação no 1º semestre'
        : rec2 ? 'Recuperação no 2º semestre'
        : 'Sem recuperação',
      rec1: rec1,
      rec2: rec2,
      ambos: rec1 && rec2,
      semNotas: !s1 && !s2,
      parcial: (rec1 && !!s1 && s1.parcial) || (rec2 && !!s2 && s2.parcial),
      semestre1: s1,
      semestre2: s2,
      bimestres: bim
    };
  }

  /* ================================================================== */
  /* 2. ESTATÍSTICA DESCRITIVA (não altera regras — só descreve números)  */
  /* ================================================================== */

  function numeros(valores) {
    return (valores || []).filter(function (v) {
      return v !== null && v !== undefined && isFinite(Number(v));
    }).map(Number);
  }

  function media(valores) {
    var v = numeros(valores);
    if (!v.length) return null;
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }

  function mediana(valores) {
    var v = numeros(valores).slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var meio = Math.floor(v.length / 2);
    if (v.length % 2) return v[meio];
    return (v[meio - 1] + v[meio]) / 2;
  }

  function desvioPadrao(valores) {
    var v = numeros(valores);
    if (v.length < 2) return 0;
    var m = media(v);
    var soma = v.reduce(function (s, x) { return s + Math.pow(x - m, 2); }, 0);
    return Math.sqrt(soma / (v.length - 1));
  }

  function percentil(valores, p) {
    var v = numeros(valores).slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var indice = (p / 100) * (v.length - 1);
    var base = Math.floor(indice);
    var resto = indice - base;
    if (base + 1 >= v.length) return v[base];
    return v[base] + resto * (v[base + 1] - v[base]);
  }

  function distribuicao(valores) {
    var dist = {};
    FAIXAS.forEach(function (f) { dist[f] = 0; });
    numeros(valores).forEach(function (v) {
      if (v < 3) dist['0-2,9']++;
      else if (v < 5) dist['3-4,9']++;
      else if (v < 7) dist['5-6,9']++;
      else if (v < 9) dist['7-8,9']++;
      else dist['9-10']++;
    });
    return dist;
  }

  function descritivo(valores) {
    var v = numeros(valores).slice().sort(function (a, b) { return a - b; });
    return {
      n: v.length,
      media: media(v),
      mediana: mediana(v),
      dp: desvioPadrao(v),
      min: v.length ? v[0] : null,
      max: v.length ? v[v.length - 1] : null,
      q1: percentil(v, 25),
      q3: percentil(v, 75),
      dist: distribuicao(v),
      valores: v
    };
  }

  function somaContagem(lista) {
    var total = { regular: 0, rec1: 0, rec2: 0, ambos: 0, semNotas: 0, parcial: 0 };
    lista.forEach(function (s) {
      if (s.semNotas) total.semNotas++;
      else if (s.ambos) total.ambos++;
      else if (s.rec1) total.rec1++;
      else if (s.rec2) total.rec2++;
      else total.regular++;
      if (s.parcial) total.parcial++;
    });
    return total;
  }

  /* ================================================================== */
  /* 3. CÁLCULO POR TURMA E AGREGAÇÃO                                    */
  /* ================================================================== */

  function calcularTurma(resumo) {
    var turma = resumo.turma || {};
    var alunos = resumo.alunos || [];
    var materias = resumo.materias || [];

    var mediasGerais = alunos.map(function (a) { return a.mediaGeralExata; });
    var estGeral = descritivo(mediasGerais);

    var situacoes = alunos.map(function (aluno) {
      return { aluno: aluno, sit: situacaoRecuperacao(aluno, null) };
    });
    var contagem = somaContagem(situacoes.map(function (s) { return s.sit; }));

    // Evolução da turma em cada bimestre (média das médias de bimestre).
    var porBimestre = [1, 2, 3, 4].map(function (b) {
      var vals = alunos.map(function (a) {
        var calc = mediaDeBimestre(a, b, null);
        return calc.exato;
      });
      return descritivo(vals);
    });

    // Detalhe por matéria: média final publicada + recuperação da matéria.
    var porMateria = {};
    materias.forEach(function (materia) {
      var vals = alunos.map(function (a) {
        var m = (a.materias || {})[materia.id];
        return m ? m.mediaFinalExata : null;
      });
      var est = descritivo(vals);
      var situacoesMateria = alunos.map(function (a) {
        return situacaoRecuperacao(a, materia.id);
      });
      porMateria[materia.id] = {
        id: materia.id,
        nome: materia.nome,
        est: est,
        contagem: somaContagem(situacoesMateria),
        mediaPublicada: resumo.mediasPorMateria != null
          ? resumo.mediasPorMateria[materia.id]
          : est.media
      };
    });

    // Evolução por matéria (série para o gráfico comparativo).
    var evolucaoMaterias = materias.map(function (materia) {
      return {
        nome: materia.nome,
        valores: [1, 2, 3, 4].map(function (b) {
          var vals = alunos.map(function (a) {
            var calc = mediaDeBimestre(a, b, materia.id);
            return calc.exato;
          });
          return media(vals);
        })
      };
    });

    var ranking = situacoes.filter(function (s) {
      return s.aluno.mediaGeralExata !== null && isFinite(s.aluno.mediaGeralExata);
    }).map(function (s) {
      return {
        id: s.aluno.id,
        nome: s.aluno.nome,
        media: Number(s.aluno.mediaGeralExata),
        situacao: s.sit
      };
    }).sort(function (a, b) { return b.media - a.media; });

    return {
      turma: turma,
      totalAlunos: alunos.length,
      totalMaterias: materias.length,
      estGeral: estGeral,
      contagem: contagem,
      porBimestre: porBimestre,
      porMateria: porMateria,
      evolucaoMaterias: evolucaoMaterias,
      ranking: ranking,
      situacoes: situacoes
    };
  }

  function agregar(turmas) {
    var mediasGerais = [];
    var mediasFinais = [];
    var todasContagens = [];
    var materias = {};
    var evolucaoBimestres = [1, 2, 3, 4].map(function () { return []; });
    var alunosAtencao = [];

    turmas.forEach(function (t) {
      mediasGerais.push.apply(mediasGerais, t.estGeral.valores);
      todasContagens.push(t.contagem);

      t.porBimestre.forEach(function (d, i) {
        evolucaoBimestres[i].push.apply(evolucaoBimestres[i], d.valores);
      });

      Object.keys(t.porMateria).forEach(function (id) {
        var m = t.porMateria[id];
        mediasFinais.push.apply(mediasFinais, m.est.valores);
        if (!materias[m.nome]) {
          materias[m.nome] = {
            nome: m.nome,
            valores: [],
            contagem: { regular: 0, rec1: 0, rec2: 0, ambos: 0, semNotas: 0, parcial: 0 },
            turmas: 0
          };
        }
        materias[m.nome].valores.push.apply(materias[m.nome].valores, m.est.valores);
        materias[m.nome].turmas++;
        Object.keys(materias[m.nome].contagem).forEach(function (k) {
          materias[m.nome].contagem[k] += m.contagem[k] || 0;
        });
      });

      t.situacoes.forEach(function (s) {
        if (s.sit.codigo !== '0' && !s.sit.semNotas) {
          alunosAtencao.push({
            nome: s.aluno.nome,
            turma: t.turma.nome,
            turmaId: t.turma.id,
            codigo: s.sit.codigo,
            rotulo: s.sit.rotulo,
            media: s.aluno.mediaGeralExata,
            parcial: s.sit.parcial
          });
        }
      });
    });

    var listaMaterias = Object.keys(materias).map(function (nome) {
      var m = materias[nome];
      var est = descritivo(m.valores);
      return {
        nome: nome,
        est: est,
        contagem: m.contagem,
        turmas: m.turmas
      };
    });

    var contagemGeral = { regular: 0, rec1: 0, rec2: 0, ambos: 0, semNotas: 0, parcial: 0 };
    todasContagens.forEach(function (c) {
      Object.keys(contagemGeral).forEach(function (k) { contagemGeral[k] += c[k] || 0; });
    });

    alunosAtencao.sort(function (a, b) {
      var peso = { '12': 0, '1': 1, '2': 2 };
      if (peso[a.codigo] !== peso[b.codigo]) return peso[a.codigo] - peso[b.codigo];
      var ma = a.media === null || a.media === undefined ? 99 : Number(a.media);
      var mb = b.media === null || b.media === undefined ? 99 : Number(b.media);
      return ma - mb;
    });

    return {
      totalTurmas: turmas.length,
      totalAlunos: turmas.reduce(function (s, t) { return s + t.totalAlunos; }, 0),
      totalMaterias: Object.keys(materias).length,
      estGeral: descritivo(mediasGerais),
      estFinais: descritivo(mediasFinais),
      contagem: contagemGeral,
      porMateria: listaMaterias,
      evolucaoBimestres: evolucaoBimestres.map(function (v) { return descritivo(v); }),
      alunosAtencao: alunosAtencao
    };
  }

  /* ================================================================== */
  /* 4. CARREGAMENTO                                                     */
  /* ================================================================== */

  function turmasFiltradas() {
    var anos = Estado.anosDisponiveis();
    if (Estado.filtroAno !== 'todos' && anos.indexOf(Number(Estado.filtroAno)) === -1) {
      Estado.filtroAno = 'todos';
    }
    return Estado.turmas.filter(function (turma) {
      return Estado.filtroAno === 'todos' || turma.ano === Number(Estado.filtroAno);
    });
  }

  async function carregar(container, forcar) {
    var turmas = turmasFiltradas();
    var chave = turmas.map(function (t) { return t.id; }).sort().join(',');

    if (!forcar && CACHE.chave === chave && CACHE.dados) {
      pintar(container, CACHE.dados);
      return;
    }

    container.innerHTML = cabecalho() +
      '<div class="card"><div class="card-body">' +
      Ui.carregando('Calculando estatísticas a partir das notas lançadas...') +
      '</div></div>';
    ligarCabecalho(container);

    try {
      var resultados = await Promise.all(turmas.map(function (turma) {
        return Api.obterResumo(turma.id).then(
          function (resumo) { return { turma: turma, resumo: resumo, erro: null }; },
          function (erro) {
            return { turma: turma, resumo: null, erro: erro.message || 'Falha ao ler o resumo.' };
          }
        );
      }));

      var calculadas = resultados.filter(function (r) { return !r.erro && r.resumo; })
        .map(function (r) { return calcularTurma(r.resumo); });

      var dados = {
        turmas: calculadas,
        agregado: agregar(calculadas),
        erros: resultados.filter(function (r) { return r.erro; })
      };
      CACHE = { chave: chave, dados: dados };
      if (!naRota(container)) return;
      pintar(container, dados);
    } catch (erro) {
      if (!naRota(container)) return;
      container.innerHTML = cabecalho() + Ui.alerta(
        Ui.escaparHtml(erro.message || 'Não foi possível calcular as estatísticas.'), 'erro'
      );
      ligarCabecalho(container);
    }
  }

  function naRota(container) {
    if (!Estado.rota || Estado.rota.view !== 'estatisticas') return false;
    try {
      return document.getElementById('conteudo').contains(container);
    } catch (e) {
      return false;
    }
  }

  function atualizar(container) {
    CACHE.chave = null;
    CACHE.dados = null;
    return carregar(container, true);
  }

  /* ================================================================== */
  /* 5. GRÁFICOS SVG                                                     */
  /* ================================================================== */

  function ponto(valor, min, max, topo, altura) {
    var v = valor === null || valor === undefined || !isFinite(Number(valor))
      ? min : Math.min(Math.max(Number(valor), min), max);
    return topo + altura - ((v - min) / (max - min)) * altura;
  }

  function svgLinha(labels, series, opcoes) {
    opcoes = opcoes || {};
    var W = 460, H = 195;
    var m = { t: 12, r: 12, b: 28, l: 30 };
    var w = W - m.l - m.r;
    var h = H - m.t - m.b;
    var min = 0, max = 10;
    var g = [];

    g.push('<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + Ui.escaparHtml(opcoes.aria || 'Gráfico de linha') + '">');

    for (var i = 0; i <= 5; i++) {
      var valorEixo = i * 2;
      var y = m.t + h - (i / 5) * h;
      g.push('<line x1="' + m.l + '" y1="' + y + '" x2="' + (W - m.r) + '" y2="' + y + '" stroke="' + COR.grid + '" stroke-width="1"/>');
      g.push('<text x="' + (m.l - 7) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="10" fill="' + COR.texto + '">' + valorEixo + '</text>');
    }

    if (opcoes.corte !== undefined && opcoes.corte !== null) {
      var yc = ponto(opcoes.corte, min, max, m.t, h);
      g.push('<line x1="' + m.l + '" y1="' + yc + '" x2="' + (W - m.r) + '" y2="' + yc + '" stroke="' + COR.vermelho + '" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.65"/>');
      g.push('<text x="' + (W - m.r - 2) + '" y="' + (yc - 5) + '" text-anchor="end" font-size="9" fill="' + COR.vermelho + '">corte ' + Ui.formatarNota(opcoes.corte) + '</text>');
    }

    series.forEach(function (s) {
      var pts = (s.valores || []).map(function (v, i) {
        var x = labels.length === 1 ? m.l + w / 2 : m.l + (i / (labels.length - 1)) * w;
        return { x: x, y: v === null || v === undefined || !isFinite(Number(v)) ? null : ponto(v, min, max, m.t, h), v: v };
      });
      var path = pts.filter(function (p) { return p.y !== null; }).map(function (p, i) {
        return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
      }).join(' ');
      if (path) {
        g.push('<path d="' + path + '" fill="none" stroke="' + s.cor + '" stroke-width="' + (s.largura || 2.5) + '" stroke-linecap="round" stroke-linejoin="round"/>');
      }
      pts.forEach(function (p) {
        if (p.y !== null) {
          g.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.6" fill="#fff" stroke="' + s.cor + '" stroke-width="2"/>');
          if (series.length === 1) {
            g.push('<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 9).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="' + s.cor + '">' + Ui.formatarNota(p.v) + '</text>');
          }
        }
      });
    });

    labels.forEach(function (l, i) {
      var x = labels.length === 1 ? m.l + w / 2 : m.l + (i / (labels.length - 1)) * w;
      g.push('<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="' + COR.texto + '">' + Ui.escaparHtml(l) + '</text>');
    });

    g.push('</svg>');
    return g.join('');
  }

  function svgBarras(itens, opcoes) {
    opcoes = opcoes || {};
    var W = 460;
    var alturaLinha = opcoes.alturaLinha || 31;
    var H = Math.max(70, itens.length * alturaLinha + 30);
    var labelW = opcoes.labelW || 118;
    var m = { t: 8, r: 46, b: 16, l: labelW };
    var w = W - m.l - m.r;
    var max = 10;
    var g = [];

    g.push('<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + Ui.escaparHtml(opcoes.aria || 'Gráfico de barras') + '">');

    for (var i = 0; i <= 5; i++) {
      var x = m.l + (i / 5) * w;
      g.push('<line x1="' + x.toFixed(1) + '" y1="' + m.t + '" x2="' + x.toFixed(1) + '" y2="' + (H - m.b) + '" stroke="' + COR.grid + '" stroke-width="0.8"/>');
      g.push('<text x="' + x.toFixed(1) + '" y="' + (H - 3) + '" text-anchor="middle" font-size="9" fill="' + COR.texto + '">' + i * 2 + '</text>');
    }

    if (opcoes.corte !== undefined && opcoes.corte !== null) {
      var xc = m.l + (Math.min(Math.max(Number(opcoes.corte), 0), max) / max) * w;
      g.push('<line x1="' + xc.toFixed(1) + '" y1="' + m.t + '" x2="' + xc.toFixed(1) + '" y2="' + (H - m.b) + '" stroke="' + COR.vermelho + '" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.6"/>');
    }

    itens.forEach(function (item, i) {
      var y = m.t + i * alturaLinha;
      var v = item.valor === null || item.valor === undefined || !isFinite(Number(item.valor)) ? null : Number(item.valor);
      var bw = v === null ? 0 : (Math.min(Math.max(v, 0), max) / max) * w;
      var nome = String(item.nome || '');
      var curto = nome.length > 17 ? nome.slice(0, 16) + '…' : nome;

      g.push('<text x="' + (m.l - 8) + '" y="' + (y + 17) + '" text-anchor="end" font-size="10.5" fill="' + COR.texto + '">' + Ui.escaparHtml(curto) + '<title>' + Ui.escaparHtml(nome) + '</title></text>');
      g.push('<rect x="' + m.l + '" y="' + (y + 5) + '" width="' + w.toFixed(1) + '" height="15" rx="7.5" fill="#f1f5f9"/>');
      if (bw > 0) {
        g.push('<rect x="' + m.l + '" y="' + (y + 5) + '" width="' + bw.toFixed(1) + '" height="15" rx="7.5" fill="' + (item.cor || COR.prim) + '"/>');
      }
      g.push('<text x="' + (m.l + w + 7) + '" y="' + (y + 17) + '" font-size="10.5" font-weight="700" fill="#334155">' + (v === null ? '—' : Ui.formatarNota(v)) + '</text>');
    });

    g.push('</svg>');
    return g.join('');
  }

  function svgDonut(fatias, opcoes) {
    opcoes = opcoes || {};
    var W = 180, H = 180;
    var cx = 90, cy = 90, r = 62, espessura = 20;
    var total = fatias.reduce(function (s, f) { return s + (Number(f.valor) || 0); }, 0);
    var circ = 2 * Math.PI * r;
    var g = [];

    g.push('<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + Ui.escaparHtml(opcoes.aria || 'Gráfico de distribuição') + '">');
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#f1f5f9" stroke-width="' + espessura + '"/>');

    if (total > 0) {
      var acumulado = 0;
      fatias.forEach(function (f) {
        var valor = Number(f.valor) || 0;
        if (valor <= 0) return;
        var parte = (valor / total) * circ;
        g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + f.cor + '" stroke-width="' + espessura + '" stroke-dasharray="' + parte.toFixed(2) + ' ' + (circ - parte).toFixed(2) + '" stroke-dashoffset="' + (-acumulado).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>');
        acumulado += parte;
      });
    }

    g.push('<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" font-size="25" font-weight="800" fill="#0f172a">' + total + '</text>');
    g.push('<text x="' + cx + '" y="' + (cy + 17) + '" text-anchor="middle" font-size="10" fill="' + COR.texto + '">' + Ui.escaparHtml(opcoes.centro || 'registros') + '</text>');
    g.push('</svg>');
    return g.join('');
  }

  function svgHistograma(dist, opcoes) {
    opcoes = opcoes || {};
    var W = 460, H = 195;
    var m = { t: 12, r: 12, b: 34, l: 30 };
    var w = W - m.l - m.r;
    var h = H - m.t - m.b;
    var chaves = Object.keys(dist);
    var max = Math.max.apply(null, chaves.map(function (k) { return Number(dist[k]) || 0; }).concat([1]));
    var larguraBarra = (w / chaves.length) * 0.68;
    var g = [];

    g.push('<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + Ui.escaparHtml(opcoes.aria || 'Distribuição das notas') + '">');

    for (var i = 0; i <= 4; i++) {
      var y = m.t + h - (i / 4) * h;
      g.push('<line x1="' + m.l + '" y1="' + y + '" x2="' + (W - m.r) + '" y2="' + y + '" stroke="' + COR.grid + '" stroke-width="1"/>');
      g.push('<text x="' + (m.l - 7) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="10" fill="' + COR.texto + '">' + Math.round((i / 4) * max) + '</text>');
    }

    chaves.forEach(function (chave, i) {
      var valor = Number(dist[chave]) || 0;
      var alturaBarra = (valor / max) * h;
      var x = m.l + (i / chaves.length) * w + (w / chaves.length - larguraBarra) / 2;
      var y = m.t + h - alturaBarra;
      g.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + larguraBarra.toFixed(1) + '" height="' + Math.max(alturaBarra, valor ? 2 : 0).toFixed(1) + '" rx="4" fill="' + (CORES_FAIXA[i] || COR.prim) + '"/>');
      if (valor) {
        g.push('<text x="' + (x + larguraBarra / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">' + valor + '</text>');
      }
      g.push('<text x="' + (x + larguraBarra / 2).toFixed(1) + '" y="' + (H - 18) + '" text-anchor="middle" font-size="9.5" fill="' + COR.texto + '">' + Ui.escaparHtml(chave) + '</text>');
    });

    g.push('</svg>');
    return g.join('');
  }

  /* ================================================================== */
  /* 6. RENDERIZAÇÃO                                                     */
  /* ================================================================== */

  function cabecalho() {
    return (
      '<div class="page-header">' +
        '<div>' +
          '<h1 class="page-title">Estatísticas</h1>' +
          '<p class="page-subtitle">' +
            'Indicadores calculados a partir das notas já lançadas, com as ' +
            'mesmas regras de média e recuperação do sistema. Nada é salvo.' +
          '</p>' +
        '</div>' +
        '<div class="page-actions no-print">' +
          '<div class="filter-chips" style="margin-right:12px">' +
            '<button type="button" class="chip-button ' + (Estado.filtroAno === 'todos' ? 'ativo' : '') + '" data-filtro-ano-est="todos">Todos os anos</button>' +
            Estado.anosDisponiveis().map(function (ano) {
              return '<button type="button" class="chip-button ' + (Number(Estado.filtroAno) === ano ? 'ativo' : '') + '" data-filtro-ano-est="' + ano + '">' + ano + '</button>';
            }).join('') +
          '</div>' +
          '<button type="button" class="btn btn-secondary" data-atualizar-est>' + Ui.icone('refresh') + 'Atualizar</button>' +
        '</div>' +
      '</div>'
    );
  }

  function ligarCabecalho(container, dados) {
    var botaoAtualizar = container.querySelector('[data-atualizar-est]');
    if (botaoAtualizar) {
      botaoAtualizar.addEventListener('click', function () { atualizar(container); });
    }

    Ui.qsa('[data-filtro-ano-est]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        Estado.filtroAno = botao.getAttribute('data-filtro-ano-est');
        carregar(container, false);
      });
    });
  }

  function ligarAcoes(container, dados) {
    Ui.qsa('[data-ord]', container).forEach(function (th) {
      th.addEventListener('click', function () {
        var campo = th.getAttribute('data-ord');
        if (ORD.campo === campo) ORD.dir = ORD.dir === 'desc' ? 'asc' : 'desc';
        else ORD = { campo: campo, dir: 'desc' };
        var alvo = container.querySelector('[data-tabela-disciplinas]');
        if (alvo) alvo.innerHTML = tabelaDisciplinas(dados.agregado);
        ligarAcoes(alvo, dados);
      });
    });

    Ui.qsa('[data-ir-turma]', container).forEach(function (botao) {
      botao.addEventListener('click', function () {
        App.navegarTurma(botao.getAttribute('data-ir-turma'), 'alunos');
      });
    });
  }

  function pintar(container, dados) {
    container.innerHTML = '<div class="est-page">' +
      cabecalho() +
      kpis(dados.agregado) +
      secaoVisaoGeral(dados.agregado) +
      secaoDisciplinas(dados.agregado) +
      secaoTurmas(dados.turmas) +
      secaoAtencao(dados.agregado) +
      notaMetodologica() +
      (dados.erros.length ? secaoErros(dados.erros) : '') +
      '</div>';
    ligarCabecalho(container, dados);
    ligarAcoes(container, dados);
  }

  /* ---------- KPIs ---------- */

  function kpi(rotulo, valor, sub, icone, classe) {
    return (
      '<div class="kpi-card ' + (classe || '') + '">' +
        '<div class="kpi-top">' +
          '<span class="kpi-label">' + Ui.escaparHtml(rotulo) + '</span>' +
          '<span class="kpi-icon">' + Ui.icone(icone) + '</span>' +
        '</div>' +
        '<div class="kpi-value">' + valor + '</div>' +
        (sub ? '<div class="kpi-sub">' + Ui.escaparHtml(sub) + '</div>' : '') +
      '</div>'
    );
  }

  function kpis(ag) {
    var emRec = ag.contagem.rec1 + ag.contagem.rec2 + ag.contagem.ambos;
    var totalSituacoes = emRec + ag.contagem.regular;
    var pct = totalSituacoes ? Math.round((emRec / totalSituacoes) * 100) : 0;
    return (
      '<div class="kpi-grid">' +
        kpi('Turmas', String(ag.totalTurmas), 'no filtro selecionado', 'book', '') +
        kpi('Alunos', String(ag.totalAlunos), 'com resumo disponível', 'users', 'kpi-info') +
        kpi('Média geral', Ui.formatarNota(ag.estGeral.media), ag.estGeral.n + ' ' + Ui.plural(ag.estGeral.n, 'média', 'médias'), 'chart', 'kpi-success') +
        kpi('Em recuperação', String(emRec), pct + '% dos alunos', 'alert', 'kpi-warning') +
        kpi('Situação regular', String(ag.contagem.regular), 'sem recuperação', 'check', 'kpi-success') +
        kpi('Disciplinas', String(ag.totalMaterias), 'com notas lançadas', 'clipboard', '') +
      '</div>'
    );
  }

  /* ---------- Componentes de gráfico ---------- */

  function chartCard(titulo, sub, corpo, legendaHtml) {
    return (
      '<div class="chart-card">' +
        '<div class="chart-card-head">' +
          '<div class="chart-card-title">' + Ui.escaparHtml(titulo) + '</div>' +
          (sub ? '<div class="chart-card-sub">' + Ui.escaparHtml(sub) + '</div>' : '') +
        '</div>' +
        '<div class="chart-card-body">' + corpo + '</div>' +
        (legendaHtml ? '<div class="chart-legend">' + legendaHtml + '</div>' : '') +
      '</div>'
    );
  }

  function legenda(itens) {
    return itens.map(function (item) {
      return '<span class="legend-item">' +
        '<span class="legend-swatch" style="background:' + item.cor + '"></span>' +
        Ui.escaparHtml(item.nome) +
        ' <span class="legend-value">' + (item.valor || 0) + '</span>' +
        '</span>';
    }).join('');
  }

  function fatiasSituacao(contagem) {
    return [
      { nome: 'Situação regular', valor: contagem.regular, cor: COR.verde },
      { nome: 'Rec. 1º semestre', valor: contagem.rec1, cor: COR.amarelo },
      { nome: 'Rec. 2º semestre', valor: contagem.rec2, cor: COR.roxo },
      { nome: 'Rec. ambos', valor: contagem.ambos, cor: COR.vermelho }
    ];
  }

  function rateBar(contagem) {
    var total = contagem.regular + contagem.rec1 + contagem.rec2 + contagem.ambos;
    if (!total) return '<div class="muted small">Sem notas lançadas.</div>';
    var partes = fatiasSituacao(contagem);
    return (
      '<div class="rate-bar" title="Proporção por situação de recuperação">' +
        partes.map(function (p) {
          var pct = (p.valor / total) * 100;
          return pct > 0
            ? '<span style="width:' + pct.toFixed(2) + '%;background:' + p.cor + '" title="' + Ui.escaparHtml(p.nome + ': ' + p.valor) + '"></span>'
            : '';
        }).join('') +
      '</div>' +
      '<div style="margin-top:7px">' + legenda(partes) + '</div>'
    );
  }

  /* ---------- Visão consolidada ---------- */

  function secaoVisaoGeral(ag) {
    var series = ag.evolucaoBimestres.map(function (d) { return d.media; });
    var destaques = ag.porMateria.slice().sort(function (a, b) {
      return (b.est.media === null ? -1 : b.est.media) - (a.est.media === null ? -1 : a.est.media);
    }).slice(0, 8).map(function (m) {
      return { nome: m.nome, valor: m.est.media, cor: COR.prim };
    });

    return (
      '<section class="est-section">' +
        '<div class="est-section-head">' +
          '<div>' +
            '<div class="est-section-title">Visão consolidada</div>' +
            '<div class="est-section-desc">Todas as turmas do filtro, ponderadas apenas pelas notas existentes</div>' +
          '</div>' +
          '<span class="badge badge-primary">' + ag.estGeral.n + ' médias gerais</span>' +
        '</div>' +
        '<div class="chart-grid chart-grid--2">' +
          chartCard(
            'Situação dos alunos',
            'Recuperação apurada por semestre (média abaixo de 5,0)',
            '<div class="chart-wrap">' + svgDonut(fatiasSituacao(ag.contagem), { centro: 'alunos' }) + '</div>',
            legenda(fatiasSituacao(ag.contagem))
          ) +
          chartCard(
            'Distribuição das médias gerais',
            'Frequência de notas por faixa',
            '<div class="chart-wrap">' + svgHistograma(ag.estGeral.dist) + '</div>'
          ) +
        '</div>' +
        '<div class="chart-grid chart-grid--2" style="margin-top:14px">' +
          chartCard(
            'Evolução por bimestre',
            'Média de todas as médias de bimestre, com a linha de corte da recuperação',
            '<div class="chart-wrap">' + svgLinha(
              ['1º bim', '2º bim', '3º bim', '4º bim'],
              [{ valores: series, cor: COR.prim }],
              { corte: 5, aria: 'Evolução das médias por bimestre' }
            ) + '</div>'
          ) +
          chartCard(
            'Disciplinas com maior média',
            'Até 8 disciplinas consolidadas',
            '<div class="chart-wrap">' + svgBarras(destaques, { corte: 5, aria: 'Média por disciplina' }) + '</div>'
          ) +
        '</div>' +
      '</section>'
    );
  }

  /* ---------- Disciplinas ---------- */

  function celulaMedia(valor, extra) {
    if (valor === null || valor === undefined || !isFinite(Number(valor))) {
      return '<td class="center">—</td>';
    }
    var classe = Number(valor) < 5 ? 'accent-danger' : Number(valor) >= 8 ? 'accent-success' : '';
    return '<td class="center"><span class="numero-destaque ' + classe + '">' + Ui.formatarNota(valor) + '</span>' + (extra || '') + '</td>';
  }

  function tabelaDisciplinas(ag) {
    var linhas = ag.porMateria.slice().sort(function (a, b) {
      var va = a.est[ORD.campo];
      var vb = b.est[ORD.campo];
      if (ORD.campo === 'nome') {
        return ORD.dir === 'asc'
          ? String(a.nome).localeCompare(String(b.nome), 'pt-BR')
          : String(b.nome).localeCompare(String(a.nome), 'pt-BR');
      }
      if (va === null || va === undefined) va = ORD.dir === 'asc' ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = ORD.dir === 'asc' ? Infinity : -Infinity;
      return ORD.dir === 'asc' ? va - vb : vb - va;
    }).map(function (m) {
      var rec = m.contagem.rec1 + m.contagem.rec2 + m.contagem.ambos;
      var total = rec + m.contagem.regular;
      var pct = total ? Math.round((rec / total) * 100) : 0;
      return (
        '<tr>' +
          '<td class="name">' + Ui.escaparHtml(m.nome) + '<div class="sub">' + m.turmas + ' ' + Ui.plural(m.turmas, 'turma', 'turmas') + '</div></td>' +
          celulaMedia(m.est.media) +
          celulaMedia(m.est.mediana) +
          '<td class="center">' + (m.est.dp !== null ? Ui.formatarNota(m.est.dp) : '—') + '</td>' +
          '<td class="center">' + Ui.formatarNota(m.est.min) + ' – ' + Ui.formatarNota(m.est.max) + '</td>' +
          '<td class="center">' + m.est.n + '</td>' +
          '<td class="center"><span class="mini-bar"><span style="width:' + (m.est.media === null ? 0 : Math.min(m.est.media * 10, 100)).toFixed(0) + '%;background:' + COR.prim + '"></span></span></td>' +
          '<td class="center"><span class="badge ' + (pct >= 30 ? 'badge-danger' : pct > 0 ? 'badge-warning' : 'badge-success') + '">' + rec + ' (' + pct + '%)</span></td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="est-table-wrap"><table class="est-table">' +
        '<thead><tr>' +
          '<th class="ordenavel ' + (ORD.campo === 'nome' ? ORD.dir : '') + '" data-ord="nome">Disciplina</th>' +
          '<th class="center ordenavel ' + (ORD.campo === 'media' ? ORD.dir : '') + '" data-ord="media">Média</th>' +
          '<th class="center ordenavel ' + (ORD.campo === 'mediana' ? ORD.dir : '') + '" data-ord="mediana">Mediana</th>' +
          '<th class="center ordenavel ' + (ORD.campo === 'dp' ? ORD.dir : '') + '" data-ord="dp">DP</th>' +
          '<th class="center">Amplitude</th>' +
          '<th class="center ordenavel ' + (ORD.campo === 'n' ? ORD.dir : '') + '" data-ord="n">N</th>' +
          '<th class="center">Escala 0–10</th>' +
          '<th class="center">Recuperação</th>' +
        '</tr></thead>' +
        '<tbody>' + (linhas || '<tr><td colspan="8" class="center muted">Sem dados.</td></tr>') + '</tbody>' +
      '</table></div>'
    );
  }

  function secaoDisciplinas(ag) {
    return (
      '<section class="est-section">' +
        '<div class="est-section-head">' +
          '<div>' +
            '<div class="est-section-title">Desempenho por disciplina</div>' +
            '<div class="est-section-desc">Clique nos cabeçalhos para ordenar. DP = desvio padrão das médias finais.</div>' +
          '</div>' +
        '</div>' +
        '<div class="card"><div data-tabela-disciplinas>' + tabelaDisciplinas(ag) + '</div></div>' +
      '</section>'
    );
  }

  /* ---------- Turmas ---------- */

  function turmaKpis(t) {
    function tk(label, valor) {
      return '<div class="turma-kpi"><div class="turma-kpi-label">' + Ui.escaparHtml(label) + '</div>' +
        '<div class="turma-kpi-value">' + valor + '</div></div>';
    }
    return (
      '<div class="turma-kpis">' +
        tk('Média', Ui.formatarNota(t.estGeral.media)) +
        tk('Mediana', Ui.formatarNota(t.estGeral.mediana)) +
        tk('Desvio padrão', Ui.formatarNota(t.estGeral.dp)) +
        tk('Mínimo', Ui.formatarNota(t.estGeral.min)) +
        tk('Máximo', Ui.formatarNota(t.estGeral.max)) +
        tk('Amostra', t.estGeral.n + ' ' + Ui.plural(t.estGeral.n, 'aluno', 'alunos')) +
      '</div>'
    );
  }

  function tabelaMateriasTurma(t) {
    var linhas = Object.keys(t.porMateria).map(function (id) { return t.porMateria[id]; })
      .sort(function (a, b) {
        return (b.est.media === null ? -1 : b.est.media) - (a.est.media === null ? -1 : a.est.media);
      }).map(function (m) {
        var rec = m.contagem.rec1 + m.contagem.rec2 + m.contagem.ambos;
        return (
          '<tr>' +
            '<td class="name">' + Ui.escaparHtml(m.nome) + '</td>' +
            celulaMedia(m.est.media) +
            '<td class="center">' + Ui.formatarNota(m.est.mediana) + '</td>' +
            '<td class="center">' + (m.est.dp !== null ? Ui.formatarNota(m.est.dp) : '—') + '</td>' +
            '<td class="center">' + Ui.formatarNota(m.est.min) + ' – ' + Ui.formatarNota(m.est.max) + '</td>' +
            '<td class="center">' + m.est.n + '</td>' +
            '<td class="center"><span class="badge ' + (rec ? 'badge-warning' : 'badge-success') + '">' + rec + '</span></td>' +
          '</tr>'
        );
      }).join('');

    return (
      '<div class="est-table-wrap"><table class="est-table">' +
        '<thead><tr>' +
          '<th>Disciplina</th><th class="center">Média</th><th class="center">Mediana</th>' +
          '<th class="center">DP</th><th class="center">Amplitude</th><th class="center">N</th><th class="center">Rec.</th>' +
        '</tr></thead><tbody>' + linhas + '</tbody>' +
      '</table></div>'
    );
  }

  function ranking(lista, titulo, cor) {
    if (!lista.length) return '<div class="muted small">' + Ui.escaparHtml(titulo) + ': sem dados</div>';
    return (
      '<div>' +
        '<div class="chart-card-title" style="margin-bottom:8px">' + Ui.escaparHtml(titulo) + '</div>' +
        '<div class="rank-list">' +
          lista.map(function (a, i) {
            return '<div class="rank-item">' +
              '<span class="rank-pos">' + (i + 1) + '</span>' +
              '<span class="rank-nome">' + Ui.escaparHtml(a.nome) + '</span>' +
              '<span class="rank-valor" style="color:' + cor + '">' + Ui.formatarNota(a.media) + '</span>' +
              '</div>';
          }).join('') +
        '</div>' +
      '</div>'
    );
  }

  function cardTurma(t) {
    var itensMat = Object.keys(t.porMateria).map(function (id) {
      return { nome: t.porMateria[id].nome, valor: t.porMateria[id].est.media, cor: COR.verde };
    }).sort(function (a, b) {
      return (b.valor === null ? -1 : b.valor) - (a.valor === null ? -1 : a.valor);
    });

    var fatias = fatiasSituacao(t.contagem);
    var serieBimestre = [{ valores: t.porBimestre.map(function (d) { return d.media; }), cor: COR.prim }];

    return (
      '<div class="card turma-estatistica-card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="card-title">' + Ui.escaparHtml(t.turma.nome) + '</div>' +
            '<div class="card-subtitle">' +
              'Ano ' + Ui.escaparHtml(t.turma.ano) + ' · ' + t.totalAlunos + ' ' + Ui.plural(t.totalAlunos, 'aluno', 'alunos') +
              ' · ' + t.totalMaterias + ' ' + Ui.plural(t.totalMaterias, 'matéria', 'matérias') +
              (t.contagem.parcial ? ' · ' + t.contagem.parcial + ' com notas pendentes' : '') +
            '</div>' +
          '</div>' +
          '<div class="row">' +
            '<span class="badge badge-success">' + t.contagem.regular + ' regulares</span>' +
            '<span class="badge badge-warning">' + (t.contagem.rec1 + t.contagem.rec2 + t.contagem.ambos) + ' em recuperação</span>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          turmaKpis(t) +
          '<div class="chart-grid chart-grid--2" style="margin-bottom:14px">' +
            chartCard(
              'Evolução por bimestre',
              'Média da turma em cada bimestre',
              '<div class="chart-wrap">' + svgLinha(
                ['1º', '2º', '3º', '4º'], serieBimestre, { corte: 5, aria: 'Bimestres da turma ' + t.turma.nome }
              ) + '</div>'
            ) +
            chartCard(
              'Média por disciplina',
              'Média final publicada de cada matéria',
              '<div class="chart-wrap">' + svgBarras(itensMat, { corte: 5, aria: 'Disciplinas da turma ' + t.turma.nome }) + '</div>'
            ) +
          '</div>' +
          '<div class="chart-grid chart-grid--2" style="margin-bottom:14px">' +
            chartCard(
              'Situação da turma',
              'Mesmo critério da tela de recuperação',
              '<div class="chart-wrap">' + svgDonut(fatias, { centro: 'alunos' }) + '</div>',
              legenda(fatias)
            ) +
            chartCard(
              'Distribuição das médias',
              'Médias gerais dos alunos da turma',
              '<div class="chart-wrap">' + svgHistograma(t.estGeral.dist) + '</div>'
            ) +
          '</div>' +
          '<div class="divider"></div>' +
          rateBar(t.contagem) +
          '<div class="divider"></div>' +
          tabelaMateriasTurma(t) +
          '<div class="divider"></div>' +
          '<div class="chart-grid chart-grid--2">' +
            ranking(t.ranking.slice(0, 5), 'Maiores médias', COR.verde) +
            ranking(t.ranking.slice(-5).reverse(), 'Menores médias', COR.vermelho) +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function secaoTurmas(turmas) {
    if (!turmas.length) {
      return (
        '<section class="est-section">' + Ui.vazio({
          icone: 'chart',
          titulo: 'Nenhuma turma com dados',
          texto: 'Cadastre turmas, lance notas e volte aqui para ver as estatísticas.',
          acao: '<button type="button" class="btn btn-primary" onclick="App.navegarTurmas()">' + Ui.icone('users') + 'Ir para Turmas</button>'
        }) + '</section>'
      );
    }
    return (
      '<section class="est-section">' +
        '<div class="est-section-head"><div>' +
          '<div class="est-section-title">Análise por turma</div>' +
          '<div class="est-section-desc">Cada turma com seus indicadores, evolução, disciplinas e alunos</div>' +
        '</div></div>' +
        turmas.map(function (t) { return cardTurma(t); }).join('') +
      '</section>'
    );
  }

  /* ---------- Atenção ---------- */

  function secaoAtencao(ag) {
    var lista = ag.alunosAtencao;
    if (!lista.length) {
      return (
        '<section class="est-section">' +
          '<div class="card"><div class="card-body">' +
            Ui.alerta('Nenhum aluno em recuperação nas turmas do filtro atual.', 'sucesso') +
          '</div></div>' +
        '</section>'
      );
    }

    var linhas = lista.slice(0, 25).map(function (a) {
      var classe = a.codigo === '12' ? 'badge-danger' : 'badge-warning';
      return (
        '<tr>' +
          '<td class="name">' + Ui.escaparHtml(a.nome) + '</td>' +
          '<td><button type="button" class="link-button" data-ir-turma="' + Ui.escaparHtml(a.turmaId) + '">' + Ui.escaparHtml(a.turma) + '</button></td>' +
          '<td><span class="badge ' + classe + '">' + Ui.escaparHtml(a.rotulo) + '</span>' + (a.parcial ? ' <span class="badge badge-muted">parcial</span>' : '') + '</td>' +
          '<td class="center">' + Ui.formatarNota(a.media) + '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<section class="est-section">' +
        '<div class="est-section-head"><div>' +
          '<div class="est-section-title">Alunos que exigem atenção</div>' +
          '<div class="est-section-desc">' + lista.length + ' ' + Ui.plural(lista.length, 'aluno', 'alunos') + ' em recuperação, ordenados pela situação e menor média</div>' +
        '</div></div>' +
        '<div class="card"><div class="est-table-wrap"><table class="est-table">' +
          '<thead><tr><th>Aluno</th><th>Turma</th><th>Situação</th><th class="center">Média geral</th></tr></thead>' +
          '<tbody>' + linhas + '</tbody>' +
        '</table></div></div>' +
        (lista.length > 25 ? '<div class="muted small" style="margin-top:7px">Mostrando os 25 primeiros.</div>' : '') +
      '</section>'
    );
  }

  /* ---------- Metodologia, erros e exportação ---------- */

  function notaMetodologica() {
    return (
      '<div class="metodo-nota">' +
        Ui.icone('info') +
        '<div>' +
          '<strong>Como esses números são calculados</strong>' +
          '<ul>' +
            '<li><strong>Nota em falta vale zero:</strong> avaliação cadastrada sem nota entra com peso zero no denominador — mesma regra usada em Notas e Recuperação.</li>' +
            '<li><strong>Média final:</strong> média simples dos quatro bimestres. Médias digitadas manualmente são respeitadas.</li>' +
            '<li><strong>Média geral:</strong> média das médias finais das disciplinas.</li>' +
            '<li><strong>Recuperação:</strong> 1º semestre = (1º + 2º bim) / 2; 2º semestre = (3º + 4º bim) / 2. Semestre abaixo de 5,0 significa recuperação — critério idêntico ao da tela “Alunos de recuperação”.</li>' +
            '<li><strong>Mediana, desvio padrão e faixas</strong> são medidas descritivas: elas explicam a distribuição, mas não alteram a situação de nenhum aluno.</li>' +
            '<li>Nenhuma estatística é gravada. Os valores são recalculados a partir das notas já existentes ao abrir ou atualizar esta página.</li>' +
          '</ul>' +
        '</div>' +
      '</div>'
    );
  }

  function secaoErros(erros) {
    return (
      '<section class="est-section">' +
        '<div class="card">' +
          '<div class="card-header"><div class="card-title">Turmas não incluídas</div></div>' +
          '<div class="card-body">' +
            erros.map(function (e) {
              return Ui.alerta(
                'Turma ' + Ui.escaparHtml(e.turma != null ? (e.turma.nome || e.turma.id) : 'desconhecida') +
                ': ' + Ui.escaparHtml(e.erro), 'erro'
              );
            }).join('') +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  /* ================================================================== */
  /* 7. API pública                                                      */
  /* ================================================================== */

  function render(container) {
    carregar(container, false);
  }

  return { render: render };
})();