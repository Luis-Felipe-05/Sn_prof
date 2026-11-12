/**
 * Backend local de demonstração.
 *
 * Usado SOMENTE quando o sistema é aberto fora do Apps Script (por exemplo,
 * abrindo o index.html direto no navegador). Os dados ficam no localStorage
 * deste navegador e não têm nenhuma relação com a planilha do Google.
 *
 * A versão oficial usa Google Sheets + Apps Script (arquivo appsscript.txt).
 */
var LocalBackend = (function () {
  var CHAVE = 'sistema-notas-local-v1';
  var VERSAO = '1.0.0';
  var BIMESTRES = [1, 2, 3, 4];
  var MAX_BACKUPS = 16;
  var LIMITE_IMPORTACAO = 2000;
  var memoria = null;

  /* ---------------- Persistência ---------------- */

  function estadoVazio() {
    return {
      turmas: [],
      materias: [],
      alunos: [],
      avaliacoes: [],
      notas: [],
      mediasManuais: [],
      config: [],
      backups: []
    };
  }

  function normalizarEstado(dados) {
    var base = estadoVazio();
    if (!dados || typeof dados !== 'object') return base;
    base.turmas = Array.isArray(dados.turmas) ? dados.turmas : [];
    base.materias = Array.isArray(dados.materias) ? dados.materias : [];
    base.alunos = Array.isArray(dados.alunos) ? dados.alunos : [];
    base.avaliacoes = Array.isArray(dados.avaliacoes) ? dados.avaliacoes : [];
    base.notas = Array.isArray(dados.notas) ? dados.notas : [];
    base.mediasManuais = Array.isArray(dados.mediasManuais)
      ? dados.mediasManuais
      : [];
    base.config = Array.isArray(dados.config) ? dados.config : [];
    base.backups = Array.isArray(dados.backups) ? dados.backups : [];
    return base;
  }

  function ler() {
    if (memoria) return memoria;
    try {
      var bruto = window.localStorage.getItem(CHAVE);
      memoria = normalizarEstado(bruto ? JSON.parse(bruto) : null);
    } catch (erro) {
      memoria = estadoVazio();
    }
    return memoria;
  }

  function gravar(dados) {
    memoria = dados;
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify(dados));
    } catch (erro) {
      // Sem localStorage (modo privado): continua apenas em memória.
    }
  }

  /* ---------------- Utilidades ---------------- */

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return (
      'id-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function agora() {
    return new Date().toISOString();
  }

  function arredondar1(numero) {
    return Math.round(numero * 10) / 10;
  }

  function arredondar2(numero) {
    return Math.round(numero * 100) / 100;
  }

  function chaveNome(nome) {
    return String(nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function nomesIguais(a, b) {
    return chaveNome(a) === chaveNome(b);
  }

  function falha(mensagem) {
    throw new Error(mensagem);
  }

  function exigirTexto(valor, campo, maximo) {
    var texto = String(valor === null || valor === undefined ? '' : valor)
      .replace(/\s+/g, ' ')
      .trim();
    if (!texto) falha(campo + ' é obrigatório.');
    var limite = maximo || 160;
    if (texto.length > limite) {
      falha(campo + ' deve ter no máximo ' + limite + ' caracteres.');
    }
    return texto;
  }

  function exigirId(valor, campo) {
    var id = String(valor === null || valor === undefined ? '' : valor).trim();
    if (!id) falha((campo || 'Registro') + ' inválido.');
    return id;
  }

  function exigirAno(valor) {
    var ano = Number(valor);
    if (!isFinite(ano) || Math.floor(ano) !== ano || ano < 2000 || ano > 2100) {
      falha('Ano inválido. Informe um ano entre 2000 e 2100.');
    }
    return ano;
  }

  function exigirBimestre(valor) {
    var bimestre = Number(valor);
    if (BIMESTRES.indexOf(bimestre) === -1) {
      falha('Bimestre inválido. Use 1, 2, 3 ou 4.');
    }
    return bimestre;
  }

  function exigirPeso(valor) {
    var numero = Number(
      String(valor === null || valor === undefined ? '' : valor).replace(',', '.')
    );
    if (!isFinite(numero) || numero < 0.01 || numero > 100) {
      falha('O peso deve ser um número entre 0,01 e 100 (%).');
    }
    return arredondar2(numero);
  }

  function normalizarNota(valor) {
    if (valor === null || valor === undefined) return null;
    var texto = String(valor).trim();
    if (!texto) return null;
    var numero = Number(texto.replace(',', '.'));
    if (!isFinite(numero) || numero < 0 || numero > 10) {
      falha('A nota deve ser um número entre 0 e 10.');
    }
    return arredondar2(numero);
  }

  /* ---------------- Cálculos ---------------- */

  function calcularBimestre(avaliacoes, notasPorAvaliacao) {
    var somaPonderada = 0;
    var pesoConsiderado = 0;
    var pesoTotal = 0;
    var lancamentos = 0;

    (avaliacoes || []).forEach(function (avaliacao) {
      var peso = Number(avaliacao.peso) || 0;
      pesoTotal += peso;

      var nota = notasPorAvaliacao ? notasPorAvaliacao[avaliacao.id] : null;
      if (nota === null || nota === undefined || nota === '') return;

      var numero = Number(nota);
      if (!isFinite(numero)) return;

      somaPonderada += numero * peso;
      pesoConsiderado += peso;
      lancamentos += 1;
    });

    var exata = pesoConsiderado > 0 ? somaPonderada / pesoConsiderado : null;
    return {
      media: exata === null ? null : arredondar1(exata),
      mediaExata: exata,
      pesoConsiderado: arredondar1(pesoConsiderado),
      pesoTotal: arredondar1(pesoTotal),
      lancamentos: lancamentos,
      totalAvaliacoes: (avaliacoes || []).length,
      completo:
        (avaliacoes || []).length > 0 &&
        lancamentos === (avaliacoes || []).length
    };
  }

  function aplicarManual(calculo, manual) {
    var base = calculo || {};
    var temManual =
      manual &&
      manual.valor !== null &&
      manual.valor !== undefined &&
      isFinite(Number(manual.valor));

    var resultado = {
      media: base.media === undefined ? null : base.media,
      mediaExata: base.mediaExata === undefined ? null : base.mediaExata,
      mediaAutomatica: base.media === undefined ? null : base.media,
      mediaAutomaticaExata: base.mediaExata === undefined ? null : base.mediaExata,
      manual: false,
      pesoConsiderado: base.pesoConsiderado === undefined ? 0 : base.pesoConsiderado,
      pesoTotal: base.pesoTotal === undefined ? 0 : base.pesoTotal,
      lancamentos: base.lancamentos === undefined ? 0 : base.lancamentos,
      totalAvaliacoes: base.totalAvaliacoes === undefined ? 0 : base.totalAvaliacoes,
      completo: !!base.completo
    };

    if (!temManual) return resultado;

    resultado.media = arredondar1(Number(manual.valor));
    resultado.mediaExata = Number(manual.valor);
    resultado.manual = true;
    resultado.completo = true;
    return resultado;
  }

  function calcularFinal(mediasExatas, manual) {
    var valores = (mediasExatas || []).filter(function (valor) {
      return valor !== null && valor !== undefined && isFinite(Number(valor));
    });
    var exata = valores.length
      ? valores.reduce(function (soma, valor) {
          return soma + Number(valor);
        }, 0) / valores.length
      : null;

    var resultado = {
      media: exata === null ? null : arredondar1(exata),
      mediaExata: exata,
      mediaAutomatica: exata === null ? null : arredondar1(exata),
      mediaAutomaticaExata: exata,
      manual: false,
      completo: valores.length === BIMESTRES.length,
      bimestresConsiderados: valores.length
    };

    if (
      manual &&
      manual.valor !== null &&
      manual.valor !== undefined &&
      isFinite(Number(manual.valor))
    ) {
      resultado.media = arredondar1(Number(manual.valor));
      resultado.mediaExata = Number(manual.valor);
      resultado.manual = true;
    }

    return resultado;
  }

  function mediaDeValores(valores) {
    var numeros = (valores || []).filter(function (valor) {
      return valor !== null && valor !== undefined && isFinite(Number(valor));
    });
    if (!numeros.length) return null;
    return arredondar1(
      numeros.reduce(function (soma, valor) {
        return soma + Number(valor);
      }, 0) / numeros.length
    );
  }

  /* ---------------- Consultas ---------------- */

  function ordenarTurmas(turmas) {
    return turmas.slice().sort(function (a, b) {
      if (a.ano !== b.ano) return b.ano - a.ano;
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {
        sensitivity: 'base'
      });
    });
  }

  function materiasDaTurma(dados, turmaId) {
    return dados.materias
      .filter(function (materia) {
        return materia.turmaId === turmaId;
      })
      .sort(function (a, b) {
        return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {
          sensitivity: 'base'
        });
      });
  }

  function alunosDaTurma(dados, turmaId) {
    return dados.alunos
      .filter(function (aluno) {
        return aluno.turmaId === turmaId;
      })
      .sort(function (a, b) {
        return String(a.nome).localeCompare(String(b.nome), 'pt-BR', {
          sensitivity: 'base'
        });
      });
  }

  function avaliacoesDaTurma(dados, turmaId) {
    return dados.avaliacoes.filter(function (avaliacao) {
      return avaliacao.turmaId === turmaId;
    });
  }

  function resumoTurma(dados, turma) {
    var materias = materiasDaTurma(dados, turma.id);
    var alunos = alunosDaTurma(dados, turma.id);
    var avaliacoes = avaliacoesDaTurma(dados, turma.id);
    return {
      id: turma.id,
      nome: turma.nome,
      ano: Number(turma.ano),
      criadoEm: turma.criadoEm,
      materias: materias,
      totalAlunos: alunos.length,
      totalAvaliacoes: avaliacoes.length
    };
  }

  function listarTurmas(dados) {
    return ordenarTurmas(dados.turmas).map(function (turma) {
      return resumoTurma(dados, turma);
    });
  }

  function buscarTurma(dados, id) {
    for (var i = 0; i < dados.turmas.length; i += 1) {
      if (dados.turmas[i].id === id) return dados.turmas[i];
    }
    return null;
  }

  function turmaOuErro(dados, id) {
    var turma = buscarTurma(dados, exigirId(id, 'Turma'));
    if (!turma) falha('Turma não encontrada.');
    return turma;
  }

  function obterTurma(dados, id) {
    var turma = buscarTurma(dados, id);
    return turma ? resumoTurma(dados, turma) : null;
  }

  function contextoAvaliacao(dados, turmaId, materiaId, bimestre) {
    var turma = turmaOuErro(dados, turmaId);
    var materia = null;
    for (var i = 0; i < dados.materias.length; i += 1) {
      if (dados.materias[i].id === materiaId) {
        materia = dados.materias[i];
        break;
      }
    }
    if (!materia || materia.turmaId !== turma.id) {
      falha('Matéria não encontrada nesta turma.');
    }
    return {
      turma: turma,
      materia: materia,
      bimestre: exigirBimestre(bimestre)
    };
  }

  function avaliacoesDaMateriaBimestre(dados, turmaId, materiaId, bimestre) {
    return dados.avaliacoes
      .filter(function (avaliacao) {
        return (
          avaliacao.turmaId === turmaId &&
          avaliacao.materiaId === materiaId &&
          Number(avaliacao.bimestre) === Number(bimestre)
        );
      })
      .sort(function (a, b) {
        return String(a.criadoEm).localeCompare(String(b.criadoEm));
      });
  }

  function notasPorAluno(dados, avaliacaoIds) {
    var ids = {};
    (avaliacaoIds || []).forEach(function (id) {
      ids[id] = true;
    });
    var mapa = {};
    dados.notas.forEach(function (nota) {
      if (!ids[nota.avaliacaoId]) return;
      if (!mapa[nota.alunoId]) mapa[nota.alunoId] = {};
      mapa[nota.alunoId][nota.avaliacaoId] = Number(nota.valor);
    });
    return mapa;
  }

  function chaveMediaManual(alunoId, materiaId, escopo, bimestre) {
    return alunoId + '|' + materiaId + '|' + escopo + '|' + (Number(bimestre) || 0);
  }

  function mapaMediasManuais(dados) {
    var mapa = {};
    (dados.mediasManuais || []).forEach(function (registro) {
      var valor = Number(registro.valor);
      if (!isFinite(valor)) return;
      mapa[
        chaveMediaManual(
          registro.alunoId,
          registro.materiaId,
          registro.escopo,
          registro.bimestre
        )
      ] = { valor: valor };
    });
    return mapa;
  }

  function buscarMediaManual(mapa, alunoId, materiaId, escopo, bimestre) {
    return (
      mapa[chaveMediaManual(alunoId, materiaId, escopo, bimestre)] || null
    );
  }

  /* ---------------- Importação ---------------- */

  function detectarDelimitador(linhas) {
    var amostra = linhas.slice(0, 20).join('\n');
    var contagem = {
      ';': (amostra.match(/;/g) || []).length,
      '\t': (amostra.match(/\t/g) || []).length,
      ',': (amostra.match(/,/g) || []).length
    };
    var melhor = '';
    var maior = 0;
    [';', '\t', ','].forEach(function (delimitador) {
      if (contagem[delimitador] > maior) {
        maior = contagem[delimitador];
        melhor = delimitador;
      }
    });
    return melhor;
  }

  function parseLinhaCsv(linha, delimitador) {
    var campos = [];
    var atual = '';
    var dentroAspas = false;

    for (var i = 0; i < linha.length; i += 1) {
      var caractere = linha[i];
      if (caractere === '"') {
        if (dentroAspas && linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          dentroAspas = !dentroAspas;
        }
      } else if (caractere === delimitador && !dentroAspas) {
        campos.push(atual);
        atual = '';
      } else {
        atual += caractere;
      }
    }
    campos.push(atual);

    return campos.map(function (campo) {
      return campo.replace(/^"|"$/g, '').trim();
    });
  }

  function ehCabecalhoNome(valor) {
    var chave = chaveNome(valor);
    return (
      chave === 'nome' ||
      chave === 'aluno' ||
      chave === 'aluna' ||
      chave === 'estudante' ||
      chave === 'discente' ||
      chave === 'name' ||
      chave.indexOf('nome ') === 0 ||
      chave.indexOf('name ') === 0
    );
  }

  function localizarCabecalho(tabela) {
    var limite = Math.min(5, tabela.length);
    for (var i = 0; i < limite; i += 1) {
      for (var j = 0; j < tabela[i].length; j += 1) {
        if (ehCabecalhoNome(tabela[i][j])) {
          return { coluna: j, inicio: i + 1 };
        }
      }
    }
    return { coluna: -1, inicio: 0 };
  }

  function escolherColunaDeNomes(tabela) {
    var maxColunas = 0;
    tabela.forEach(function (linha) {
      if (linha.length > maxColunas) maxColunas = linha.length;
    });

    var melhorColuna = 0;
    var melhorPontuacao = -1;

    for (var j = 0; j < maxColunas; j += 1) {
      var pontuacao = 0;
      tabela.forEach(function (linha) {
        var valor = linha[j] || '';
        if (!valor) return;
        if (/[A-Za-zÀ-ÿ]/.test(valor) && !/^[\d.,-]+$/.test(valor)) {
          pontuacao += 1;
        }
      });
      if (pontuacao > melhorPontuacao) {
        melhorPontuacao = pontuacao;
        melhorColuna = j;
      }
    }

    return melhorColuna;
  }

  function extrairNomesDeLinhas(linhas) {
    var tabela = (linhas || [])
      .map(function (linha) {
        return (linha || []).map(function (celula) {
          return String(celula === null || celula === undefined ? '' : celula)
            .replace(/\s+/g, ' ')
            .trim();
        });
      })
      .filter(function (linha) {
        return linha.some(function (celula) {
          return !!celula;
        });
      });

    if (!tabela.length) return [];

    var cabecalho = localizarCabecalho(tabela);
    var coluna = cabecalho.coluna;
    var inicio = cabecalho.inicio;

    if (coluna < 0) {
      coluna = escolherColunaDeNomes(tabela);
      inicio = 0;
    }

    var nomes = [];
    var vistos = {};

    for (var i = inicio; i < tabela.length; i += 1) {
      var valor = tabela[i][coluna] || '';
      if (!valor) continue;
      if (ehCabecalhoNome(valor)) continue;
      if (/^[\d.,-]+$/.test(valor)) continue;

      var nome = valor.replace(/\s+/g, ' ').trim();
      var chave = chaveNome(nome);
      if (!chave || vistos[chave]) continue;
      vistos[chave] = true;
      nomes.push(nome);
    }

    return nomes;
  }

  function extrairNomes(payload) {
    if (String(payload.url || '').trim()) {
      falha(
        'A importação por link do Google Sheets só funciona no aplicativo publicado ' +
        'no Apps Script. Use a opção de colar nomes ou enviar um arquivo CSV/TXT.'
      );
    }
    var texto = String(payload.texto || '').replace(/^\uFEFF/, '');
    if (!texto.trim()) return [];

    var linhas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var delimitador = detectarDelimitador(linhas);
    var tabela = linhas.map(function (linha) {
      return delimitador ? parseLinhaCsv(linha, delimitador) : [linha];
    });
    return extrairNomesDeLinhas(tabela);
  }

  /* ---------------- Backup ---------------- */

  function infoBackup(registro) {
    return {
      id: registro.id,
      nomeArquivo: registro.nomeArquivo,
      criadoEm: registro.criadoEm,
      tamanhoBytes: registro.tamanhoBytes,
      origem: registro.origem,
      status: registro.status,
      mensagem: registro.mensagem || '',
      url: '',
      downloadUrl:
        'data:application/json;charset=utf-8,' +
        encodeURIComponent(JSON.stringify(registro.dados || {}, null, 2))
    };
  }

  function snapshot(dados) {
    return {
      meta: {
        app: 'sistema-notas',
        versao: VERSAO,
        geradoEm: agora(),
        planilhaId: 'local',
        timezone: 'local'
      },
      turmas: dados.turmas,
      materias: dados.materias,
      alunos: dados.alunos,
      avaliacoes: dados.avaliacoes,
      notas: dados.notas,
      mediasManuais: dados.mediasManuais,
      config: dados.config
    };
  }

  function statusBackup(dados) {
    var lista = dados.backups.slice().sort(function (a, b) {
      return String(b.criadoEm).localeCompare(String(a.criadoEm));
    });
    return {
      ultimo: lista.length ? infoBackup(lista[0]) : null,
      totalBackups: lista.length,
      triggerAtivo: true,
      pastaUrl: '',
      planilhaUrl: '',
      ultimoErro: null
    };
  }

  function registrarBackup(dados, origem) {
    var conteudo = snapshot(dados);
    var json = JSON.stringify(conteudo, null, 2);
    var registro = {
      id: uid(),
      criadoEm: agora(),
      nomeArquivo: 'backup-notas-local-' + dados.backups.length + '.json',
      tamanhoBytes: json.length,
      origem: origem || 'manual',
      status: 'ok',
      mensagem: '',
      dados: conteudo
    };
    dados.backups.push(registro);
    dados.backups.sort(function (a, b) {
      return String(a.criadoEm).localeCompare(String(b.criadoEm));
    });
    while (dados.backups.length > MAX_BACKUPS) dados.backups.shift();
    return registro;
  }

  /* ---------------- Ações da API ---------------- */

  var ACOES = {
    apiBootstrap: function () {
      var dados = ler();
      return {
        app: { nome: 'Sistema de Notas', versao: VERSAO },
        turmas: listarTurmas(dados),
        backup: statusBackup(dados)
      };
    },

    apiObterTurma: function (id) {
      var dados = ler();
      return obterTurma(dados, exigirId(id, 'Turma'));
    },

    apiCriarTurma: function (payload) {
      var dados = ler();
      var nome = exigirTexto(payload && payload.nome, 'Nome da turma', 120);
      var ano = exigirAno(payload && payload.ano);
      var materias = payload && Array.isArray(payload.materias)
        ? payload.materias
        : [];

      var duplicada = dados.turmas.some(function (turma) {
        return turma.ano === ano && nomesIguais(turma.nome, nome);
      });
      if (duplicada) {
        falha('Já existe uma turma com esse nome no ano ' + ano + '.');
      }

      var turma = { id: uid(), nome: nome, ano: ano, criadoEm: agora() };
      dados.turmas.push(turma);

      var vistos = {};
      materias.forEach(function (item) {
        var nomeMateria = exigirTexto(
          typeof item === 'string' ? item : item && item.nome,
          'Nome da matéria',
          120
        );
        var chave = chaveNome(nomeMateria);
        if (vistos[chave]) return;
        vistos[chave] = true;
        dados.materias.push({
          id: uid(),
          turmaId: turma.id,
          nome: nomeMateria,
          criadoEm: agora()
        });
      });

      gravar(dados);
      return obterTurma(dados, turma.id);
    },

    apiAtualizarTurma: function (id, payload) {
      var dados = ler();
      var turma = turmaOuErro(dados, id);
      var nome = exigirTexto(payload && payload.nome, 'Nome da turma', 120);
      var ano = exigirAno(payload && payload.ano);

      var duplicada = dados.turmas.some(function (outra) {
        return outra.id !== turma.id && outra.ano === ano && nomesIguais(outra.nome, nome);
      });
      if (duplicada) {
        falha('Já existe outra turma com esse nome no ano ' + ano + '.');
      }

      turma.nome = nome;
      turma.ano = ano;

      if (payload && Array.isArray(payload.materias)) {
        sincronizarMaterias(dados, turma.id, payload.materias);
      }

      gravar(dados);
      return obterTurma(dados, turma.id);
    },

    apiExcluirTurma: function (id) {
      var dados = ler();
      var turma = turmaOuErro(dados, id);

      var avaliacaoIds = {};
      dados.avaliacoes.forEach(function (avaliacao) {
        if (avaliacao.turmaId === turma.id) avaliacaoIds[avaliacao.id] = true;
      });
      var alunoIds = {};
      dados.alunos.forEach(function (aluno) {
        if (aluno.turmaId === turma.id) alunoIds[aluno.id] = true;
      });

      dados.notas = dados.notas.filter(function (nota) {
        return !avaliacaoIds[nota.avaliacaoId] && !alunoIds[nota.alunoId];
      });
      dados.mediasManuais = dados.mediasManuais.filter(function (registro) {
        return !alunoIds[registro.alunoId];
      });
      dados.avaliacoes = dados.avaliacoes.filter(function (avaliacao) {
        return avaliacao.turmaId !== turma.id;
      });
      dados.materias = dados.materias.filter(function (materia) {
        return materia.turmaId !== turma.id;
      });
      dados.alunos = dados.alunos.filter(function (aluno) {
        return aluno.turmaId !== turma.id;
      });
      dados.turmas = dados.turmas.filter(function (item) {
        return item.id !== turma.id;
      });

      gravar(dados);
      return { ok: true };
    },

    apiListarAlunos: function (turmaId) {
      var dados = ler();
      var turma = turmaOuErro(dados, turmaId);
      return alunosDaTurma(dados, turma.id);
    },

    apiAdicionarAluno: function (turmaId, nome) {
      var dados = ler();
      var turma = turmaOuErro(dados, turmaId);
      nome = exigirTexto(nome, 'Nome do aluno', 160);

      var duplicado = alunosDaTurma(dados, turma.id).some(function (aluno) {
        return nomesIguais(aluno.nome, nome);
      });
      if (duplicado) {
        falha('Já existe um aluno com esse nome nesta turma.');
      }

      var aluno = {
        id: uid(),
        turmaId: turma.id,
        nome: nome,
        criadoEm: agora()
      };
      dados.alunos.push(aluno);
      gravar(dados);
      return aluno;
    },

    apiRenomearAluno: function (id, nome) {
      var dados = ler();
      var aluno = null;
      for (var i = 0; i < dados.alunos.length; i += 1) {
        if (dados.alunos[i].id === id) {
          aluno = dados.alunos[i];
          break;
        }
      }
      if (!aluno) falha('Aluno não encontrado.');
      nome = exigirTexto(nome, 'Nome do aluno', 160);

      var duplicado = alunosDaTurma(dados, aluno.turmaId).some(function (outro) {
        return outro.id !== aluno.id && nomesIguais(outro.nome, nome);
      });
      if (duplicado) {
        falha('Já existe outro aluno com esse nome nesta turma.');
      }

      aluno.nome = nome;
      gravar(dados);
      return aluno;
    },

    apiExcluirAluno: function (id) {
      var dados = ler();
      var existe = dados.alunos.some(function (aluno) {
        return aluno.id === id;
      });
      if (!existe) falha('Aluno não encontrado.');

      dados.notas = dados.notas.filter(function (nota) {
        return nota.alunoId !== id;
      });
      dados.mediasManuais = dados.mediasManuais.filter(function (registro) {
        return registro.alunoId !== id;
      });
      dados.alunos = dados.alunos.filter(function (aluno) {
        return aluno.id !== id;
      });
      gravar(dados);
      return { ok: true };
    },

    apiImportarAlunos: function (turmaId, payload) {
      var dados = ler();
      var turma = turmaOuErro(dados, turmaId);
      var nomes = extrairNomes(payload || {});
      if (!nomes.length) {
        falha('Nenhum nome de aluno foi encontrado na origem informada.');
      }
      if (nomes.length > LIMITE_IMPORTACAO) {
        falha(
          'A importação tem ' + nomes.length + ' nomes. O limite é ' +
          LIMITE_IMPORTACAO + ' por vez.'
        );
      }

      var chaves = {};
      var existentes = alunosDaTurma(dados, turma.id);
      existentes.forEach(function (aluno) {
        chaves[chaveNome(aluno.nome)] = true;
      });

      var novos = [];
      var ignorados = [];
      nomes.forEach(function (nome) {
        var chave = chaveNome(nome);
        if (chaves[chave]) {
          ignorados.push(nome);
          return;
        }
        chaves[chave] = true;
        novos.push(nome);
      });

      var criadoEm = agora();
      novos.forEach(function (nome) {
        dados.alunos.push({
          id: uid(),
          turmaId: turma.id,
          nome: nome,
          criadoEm: criadoEm
        });
      });
      gravar(dados);

      return {
        adicionados: novos.length,
        ignorados: ignorados.length,
        nomesIgnorados: ignorados.slice(0, 30),
        total: existentes.length + novos.length
      };
    },

    apiListarAvaliacoes: function (turmaId, materiaId, bimestre) {
      var dados = ler();
      var contexto = contextoAvaliacao(dados, turmaId, materiaId, bimestre);
      var avaliacoes = avaliacoesDaMateriaBimestre(
        dados,
        contexto.turma.id,
        contexto.materia.id,
        contexto.bimestre
      );
      return {
        avaliacoes: avaliacoes,
        pesoTotal: arredondar1(
          avaliacoes.reduce(function (soma, avaliacao) {
            return soma + Number(avaliacao.peso || 0);
          }, 0)
        )
      };
    },

    apiCriarAvaliacao: function (payload) {
      var dados = ler();
      var contexto = contextoAvaliacao(
        dados,
        payload && payload.turmaId,
        payload && payload.materiaId,
        payload && payload.bimestre
      );
      var nome = exigirTexto(payload && payload.nome, 'Nome da avaliação', 120);
      var peso = exigirPeso(payload && payload.peso);

      var duplicada = avaliacoesDaMateriaBimestre(
        dados,
        contexto.turma.id,
        contexto.materia.id,
        contexto.bimestre
      ).some(function (avaliacao) {
        return nomesIguais(avaliacao.nome, nome);
      });
      if (duplicada) {
        falha('Já existe uma avaliação com esse nome neste bimestre e matéria.');
      }

      var avaliacao = {
        id: uid(),
        turmaId: contexto.turma.id,
        materiaId: contexto.materia.id,
        bimestre: contexto.bimestre,
        nome: nome,
        peso: peso,
        criadoEm: agora()
      };
      dados.avaliacoes.push(avaliacao);
      gravar(dados);
      return avaliacao;
    },

    apiAtualizarAvaliacao: function (id, payload) {
      var dados = ler();
      var avaliacao = null;
      for (var i = 0; i < dados.avaliacoes.length; i += 1) {
        if (dados.avaliacoes[i].id === id) {
          avaliacao = dados.avaliacoes[i];
          break;
        }
      }
      if (!avaliacao) falha('Avaliação não encontrada.');

      var nome = exigirTexto(payload && payload.nome, 'Nome da avaliação', 120);
      var peso = exigirPeso(payload && payload.peso);

      var duplicada = avaliacoesDaMateriaBimestre(
        dados,
        avaliacao.turmaId,
        avaliacao.materiaId,
        avaliacao.bimestre
      ).some(function (outra) {
        return outra.id !== avaliacao.id && nomesIguais(outra.nome, nome);
      });
      if (duplicada) {
        falha('Já existe uma avaliação com esse nome neste bimestre e matéria.');
      }

      avaliacao.nome = nome;
      avaliacao.peso = peso;
      gravar(dados);
      return avaliacao;
    },

    apiExcluirAvaliacao: function (id) {
      var dados = ler();
      var existe = dados.avaliacoes.some(function (avaliacao) {
        return avaliacao.id === id;
      });
      if (!existe) falha('Avaliação não encontrada.');

      dados.notas = dados.notas.filter(function (nota) {
        return nota.avaliacaoId !== id;
      });
      dados.avaliacoes = dados.avaliacoes.filter(function (avaliacao) {
        return avaliacao.id !== id;
      });
      gravar(dados);
      return { ok: true };
    },

    apiObterGrade: function (turmaId, materiaId, bimestre) {
      var dados = ler();
      var contexto = contextoAvaliacao(dados, turmaId, materiaId, bimestre);
      var alunos = alunosDaTurma(dados, contexto.turma.id);
      var avaliacoes = avaliacoesDaMateriaBimestre(
        dados,
        contexto.turma.id,
        contexto.materia.id,
        contexto.bimestre
      );
      var porAluno = notasPorAluno(
        dados,
        avaliacoes.map(function (avaliacao) {
          return avaliacao.id;
        })
      );

      var mapaNotas = {};
      Object.keys(porAluno).forEach(function (alunoId) {
        Object.keys(porAluno[alunoId]).forEach(function (avaliacaoId) {
          mapaNotas[alunoId + ':' + avaliacaoId] = porAluno[alunoId][avaliacaoId];
        });
      });

      var medias = {};
      var mediasManuais = mapaMediasManuais(dados);
      alunos.forEach(function (aluno) {
        var automatica = calcularBimestre(avaliacoes, porAluno[aluno.id] || {});
        medias[aluno.id] = aplicarManual(
          automatica,
          buscarMediaManual(
            mediasManuais,
            aluno.id,
            contexto.materia.id,
            'bimestre',
            contexto.bimestre
          )
        );
      });

      return {
        turma: resumoTurma(dados, contexto.turma),
        materia: contexto.materia,
        bimestre: contexto.bimestre,
        alunos: alunos,
        avaliacoes: avaliacoes,
        notas: mapaNotas,
        medias: medias,
        pesoTotal: arredondar1(
          avaliacoes.reduce(function (soma, avaliacao) {
            return soma + Number(avaliacao.peso || 0);
          }, 0)
        )
      };
    },

    apiSalvarNota: function (payload) {
      var dados = ler();
      var avaliacaoId = exigirId(payload && payload.avaliacaoId, 'Avaliação');
      var alunoId = exigirId(payload && payload.alunoId, 'Aluno');
      var valor = normalizarNota(payload && payload.valor);

      var avaliacao = null;
      for (var i = 0; i < dados.avaliacoes.length; i += 1) {
        if (dados.avaliacoes[i].id === avaliacaoId) {
          avaliacao = dados.avaliacoes[i];
          break;
        }
      }
      if (!avaliacao) falha('Avaliação não encontrada.');

      var aluno = null;
      for (var j = 0; j < dados.alunos.length; j += 1) {
        if (dados.alunos[j].id === alunoId) {
          aluno = dados.alunos[j];
          break;
        }
      }
      if (!aluno) falha('Aluno não encontrado.');
      if (aluno.turmaId !== avaliacao.turmaId) {
        falha('O aluno e a avaliação pertencem a turmas diferentes.');
      }

      var nota = null;
      for (var k = 0; k < dados.notas.length; k += 1) {
        if (
          dados.notas[k].avaliacaoId === avaliacaoId &&
          dados.notas[k].alunoId === alunoId
        ) {
          nota = dados.notas[k];
          break;
        }
      }

      if (valor === null) {
        dados.notas = dados.notas.filter(function (item) {
          return !(item.avaliacaoId === avaliacaoId && item.alunoId === alunoId);
        });
      } else if (nota) {
        nota.valor = valor;
        nota.atualizadoEm = agora();
      } else {
        dados.notas.push({
          id: uid(),
          avaliacaoId: avaliacaoId,
          alunoId: alunoId,
          valor: valor,
          atualizadoEm: agora()
        });
      }

      var avaliacoes = avaliacoesDaMateriaBimestre(
        dados,
        avaliacao.turmaId,
        avaliacao.materiaId,
        avaliacao.bimestre
      );
      var porAluno = notasPorAluno(
        dados,
        avaliacoes.map(function (item) {
          return item.id;
        })
      );

      var automatica = calcularBimestre(
        avaliacoes,
        porAluno[alunoId] || {}
      );
      var manual = buscarMediaManual(
        mapaMediasManuais(dados),
        alunoId,
        avaliacao.materiaId,
        'bimestre',
        avaliacao.bimestre
      );

      gravar(dados);
      return {
        valor: valor,
        media: aplicarManual(automatica, manual)
      };
    },

    apiSalvarMediaManual: function (payload) {
      var dados = ler();
      var alunoId = exigirId(payload && payload.alunoId, 'Aluno');
      var materiaId = exigirId(payload && payload.materiaId, 'Matéria');
      var escopo = String((payload && payload.escopo) || '').toLowerCase();
      if (escopo !== 'bimestre' && escopo !== 'final') {
        falha('Tipo de média inválido.');
      }
      var bimestre =
        escopo === 'bimestre' ? exigirBimestre(payload && payload.bimestre) : 0;
      var valor = normalizarNota(payload && payload.valor);

      var aluno = null;
      for (var i = 0; i < dados.alunos.length; i += 1) {
        if (dados.alunos[i].id === alunoId) {
          aluno = dados.alunos[i];
          break;
        }
      }
      if (!aluno) falha('Aluno não encontrado.');

      var materia = null;
      for (var j = 0; j < dados.materias.length; j += 1) {
        if (dados.materias[j].id === materiaId) {
          materia = dados.materias[j];
          break;
        }
      }
      if (!materia || materia.turmaId !== aluno.turmaId) {
        falha('Matéria não encontrada nesta turma.');
      }

      dados.mediasManuais = dados.mediasManuais.filter(function (registro) {
        return !(
          registro.alunoId === alunoId &&
          registro.materiaId === materiaId &&
          registro.escopo === escopo &&
          (Number(registro.bimestre) || 0) === bimestre
        );
      });
      if (valor !== null) {
        dados.mediasManuais.push({
          id: uid(),
          alunoId: alunoId,
          materiaId: materiaId,
          escopo: escopo,
          bimestre: bimestre,
          valor: valor,
          atualizadoEm: agora()
        });
      }
      gravar(dados);

      var resultado = {
        alunoId: alunoId,
        materiaId: materiaId,
        escopo: escopo,
        bimestre: bimestre,
        manual: valor !== null,
        valor: valor
      };

      if (escopo === 'bimestre') {
        var contexto = contextoAvaliacao(dados, aluno.turmaId, materiaId, bimestre);
        var avaliacoes = avaliacoesDaMateriaBimestre(
          dados,
          contexto.turma.id,
          contexto.materia.id,
          contexto.bimestre
        );
        var porAluno = notasPorAluno(
          dados,
          avaliacoes.map(function (avaliacao) {
            return avaliacao.id;
          })
        );
        var automatica = calcularBimestre(
          avaliacoes,
          porAluno[alunoId] || {}
        );
        resultado.media = aplicarManual(
          automatica,
          valor === null ? null : { valor: valor }
        );
      } else {
        var boletim = ACOES.apiObterBoletim(aluno.turmaId, materiaId);
        for (var k = 0; k < boletim.alunos.length; k += 1) {
          if (boletim.alunos[k].id !== alunoId) continue;
          resultado.media = {
            media: boletim.alunos[k].mediaFinal,
            mediaExata: boletim.alunos[k].mediaFinalExata,
            mediaAutomatica: boletim.alunos[k].mediaFinalAutomatica,
            manual: boletim.alunos[k].mediaFinalManual,
            completo: boletim.alunos[k].finalCompleto
          };
          break;
        }
      }

      return resultado;
    },

    apiObterBoletim: function (turmaId, materiaId) {
      var dados = ler();
      var contexto = contextoAvaliacao(dados, turmaId, materiaId, 1);
      var alunos = alunosDaTurma(dados, contexto.turma.id);
      var avaliacoes = dados.avaliacoes.filter(function (avaliacao) {
        return (
          avaliacao.turmaId === contexto.turma.id &&
          avaliacao.materiaId === contexto.materia.id
        );
      });
      var porAluno = notasPorAluno(
        dados,
        avaliacoes.map(function (avaliacao) {
          return avaliacao.id;
        })
      );

      var avaliacoesPorBimestre = {};
      var pesoPorBimestre = {};
      BIMESTRES.forEach(function (bimestre) {
        var doBimestre = avaliacoes.filter(function (avaliacao) {
          return Number(avaliacao.bimestre) === bimestre;
        });
        avaliacoesPorBimestre[bimestre] = doBimestre.map(function (avaliacao) {
          return {
            id: avaliacao.id,
            nome: avaliacao.nome,
            peso: Number(avaliacao.peso)
          };
        });
        pesoPorBimestre[bimestre] = arredondar1(
          doBimestre.reduce(function (soma, avaliacao) {
            return soma + Number(avaliacao.peso || 0);
          }, 0)
        );
      });

      var mediasManuais = mapaMediasManuais(dados);
      var alunosBoletim = alunos.map(function (aluno) {
        var bimestres = {};
        var mediasExatas = [];
        BIMESTRES.forEach(function (bimestre) {
          var automatica = calcularBimestre(
            avaliacoesPorBimestre[bimestre],
            porAluno[aluno.id] || {}
          );
          var calculo = aplicarManual(
            automatica,
            buscarMediaManual(
              mediasManuais,
              aluno.id,
              contexto.materia.id,
              'bimestre',
              bimestre
            )
          );
          bimestres[bimestre] = calculo;
          mediasExatas.push(calculo.mediaExata);
        });
        var final = calcularFinal(
          mediasExatas,
          buscarMediaManual(
            mediasManuais,
            aluno.id,
            contexto.materia.id,
            'final',
            0
          )
        );
        var todosCompletos = BIMESTRES.every(function (bimestre) {
          return bimestres[bimestre].completo;
        });
        return {
          id: aluno.id,
          nome: aluno.nome,
          bimestres: bimestres,
          mediaFinal: final.media,
          mediaFinalExata: final.mediaExata,
          mediaFinalAutomatica: final.mediaAutomatica,
          mediaFinalManual: final.manual,
          finalCompleto: final.manual ? true : final.completo && todosCompletos,
          bimestresConsiderados: final.bimestresConsiderados
        };
      });

      var mediasTurma = {};
      BIMESTRES.forEach(function (bimestre) {
        mediasTurma[bimestre] = mediaDeValores(
          alunosBoletim.map(function (aluno) {
            return aluno.bimestres[bimestre].mediaExata;
          })
        );
      });

      return {
        turma: resumoTurma(dados, contexto.turma),
        materia: contexto.materia,
        bimestres: BIMESTRES,
        avaliacoesPorBimestre: avaliacoesPorBimestre,
        pesoPorBimestre: pesoPorBimestre,
        alunos: alunosBoletim,
        mediasTurma: mediasTurma,
        mediaFinalTurma: mediaDeValores(
          alunosBoletim.map(function (aluno) {
            return aluno.mediaFinalExata;
          })
        )
      };
    },

    apiObterResumo: function (turmaId) {
      var dados = ler();
      var turma = turmaOuErro(dados, turmaId);
      var alunos = alunosDaTurma(dados, turma.id);
      var materias = materiasDaTurma(dados, turma.id);
      var avaliacoes = avaliacoesDaTurma(dados, turma.id);
      var porAluno = notasPorAluno(
        dados,
        avaliacoes.map(function (avaliacao) {
          return avaliacao.id;
        })
      );

      var avaliacoesPorMateria = {};
      avaliacoes.forEach(function (avaliacao) {
        if (!avaliacoesPorMateria[avaliacao.materiaId]) {
          avaliacoesPorMateria[avaliacao.materiaId] = [];
        }
        avaliacoesPorMateria[avaliacao.materiaId].push(avaliacao);
      });

      var mediasManuais = mapaMediasManuais(dados);
      var alunosResumo = alunos.map(function (aluno) {
        var porMateria = {};
        var mediasExatas = [];

        materias.forEach(function (materia) {
          var daMateria = avaliacoesPorMateria[materia.id] || [];
          var porBimestre = {};
          var mediasBimestres = [];
          BIMESTRES.forEach(function (bimestre) {
            var automatica = calcularBimestre(
              daMateria.filter(function (avaliacao) {
                return Number(avaliacao.bimestre) === bimestre;
              }),
              porAluno[aluno.id] || {}
            );
            var calculo = aplicarManual(
              automatica,
              buscarMediaManual(
                mediasManuais,
                aluno.id,
                materia.id,
                'bimestre',
                bimestre
              )
            );
            porBimestre[bimestre] = calculo;
            mediasBimestres.push(calculo.mediaExata);
          });
          var final = calcularFinal(
            mediasBimestres,
            buscarMediaManual(
              mediasManuais,
              aluno.id,
              materia.id,
              'final',
              0
            )
          );
          porMateria[materia.id] = {
            mediaFinal: final.media,
            mediaFinalExata: final.mediaExata,
            mediaFinalAutomatica: final.mediaAutomatica,
            mediaFinalManual: final.manual,
            completo: final.manual
              ? true
              : final.completo &&
                BIMESTRES.every(function (bimestre) {
                  return porBimestre[bimestre].completo;
                }),
            bimestresConsiderados: final.bimestresConsiderados,
            bimestres: porBimestre
          };
          if (final.mediaExata !== null) mediasExatas.push(final.mediaExata);
        });

        var mediaGeral = calcularFinal(mediasExatas);
        return {
          id: aluno.id,
          nome: aluno.nome,
          materias: porMateria,
          mediaGeral: mediaGeral.media,
          mediaGeralExata: mediaGeral.mediaExata,
          completo:
            materias.length > 0 &&
            mediasExatas.length === materias.length &&
            materias.every(function (materia) {
              return porMateria[materia.id].completo;
            })
        };
      });

      var mediasPorMateria = {};
      materias.forEach(function (materia) {
        mediasPorMateria[materia.id] = mediaDeValores(
          alunosResumo.map(function (aluno) {
            return aluno.materias[materia.id].mediaFinalExata;
          })
        );
      });

      return {
        turma: resumoTurma(dados, turma),
        materias: materias,
        alunos: alunosResumo,
        mediasPorMateria: mediasPorMateria,
        mediaGeralTurma: mediaDeValores(
          alunosResumo.map(function (aluno) {
            return aluno.mediaGeralExata;
          })
        )
      };
    },

    apiStatusBackup: function () {
      return statusBackup(ler());
    },

    apiListarBackups: function () {
      var dados = ler();
      return dados.backups
        .slice()
        .sort(function (a, b) {
          return String(b.criadoEm).localeCompare(String(a.criadoEm));
        })
        .map(infoBackup);
    },

    apiCriarBackup: function () {
      var dados = ler();
      var registro = registrarBackup(dados, 'manual');
      gravar(dados);
      return {
        backup: infoBackup(registro),
        status: statusBackup(dados)
      };
    },

    apiRestaurarBackup: function (id) {
      var dados = ler();
      var registro = null;
      for (var i = 0; i < dados.backups.length; i += 1) {
        if (dados.backups[i].id === id) {
          registro = dados.backups[i];
          break;
        }
      }
      if (!registro) falha('Backup não encontrado.');

      var conteudo = registro.dados;
      if (!conteudo || !conteudo.meta || conteudo.meta.app !== 'sistema-notas') {
        falha('Este arquivo não foi gerado pelo Sistema de Notas.');
      }
      ['turmas', 'materias', 'alunos', 'avaliacoes', 'notas'].forEach(function (tabela) {
        if (!Array.isArray(conteudo[tabela])) {
          falha('Backup incompleto: a tabela "' + tabela + '" não foi encontrada.');
        }
      });

      var seguranca = registrarBackup(dados, 'pre-restauracao');

      var resumo = {
        turmas: conteudo.turmas.length,
        materias: conteudo.materias.length,
        alunos: conteudo.alunos.length,
        avaliacoes: conteudo.avaliacoes.length,
        notas: conteudo.notas.length,
        mediasManuais: Array.isArray(conteudo.mediasManuais)
          ? conteudo.mediasManuais.length
          : 0
      };

      dados.turmas = conteudo.turmas.slice();
      dados.materias = conteudo.materias.slice();
      dados.alunos = conteudo.alunos.slice();
      dados.avaliacoes = conteudo.avaliacoes.slice();
      dados.notas = conteudo.notas.slice();
      dados.mediasManuais = Array.isArray(conteudo.mediasManuais)
        ? conteudo.mediasManuais.slice()
        : [];
      if (Array.isArray(conteudo.config)) dados.config = conteudo.config.slice();

      gravar(dados);
      return {
        ok: true,
        resumo: resumo,
        backupSeguranca: infoBackup(seguranca),
        avisoSeguranca: ''
      };
    },

    apiInstalarBackupSemanal: function () {
      return statusBackup(ler());
    }
  };

  /* ---------------- Sincronização de matérias ---------------- */

  function sincronizarMaterias(dados, turmaId, desejadas) {
    var existentes = materiasDaTurma(dados, turmaId);
    var porId = {};
    var porNome = {};
    existentes.forEach(function (materia) {
      porId[materia.id] = materia;
      porNome[chaveNome(materia.nome)] = materia;
    });

    var vistos = {};
    var mantidos = {};

    desejadas.forEach(function (item) {
      var nome = exigirTexto(
        typeof item === 'string' ? item : item && item.nome,
        'Nome da matéria',
        120
      );
      var chave = chaveNome(nome);
      if (vistos[chave]) {
        falha('A matéria "' + nome + '" está repetida na turma.');
      }
      vistos[chave] = true;

      var materia = null;
      if (typeof item === 'object' && item && item.id) {
        materia = porId[item.id];
        if (!materia) {
          falha('Uma das matérias informadas não pertence a esta turma.');
        }
      } else {
        materia = porNome[chave] || null;
      }

      if (materia) {
        materia.nome = nome;
        mantidos[materia.id] = true;
      } else {
        dados.materias.push({
          id: uid(),
          turmaId: turmaId,
          nome: nome,
          criadoEm: agora()
        });
      }
    });

    existentes.forEach(function (materia) {
      if (mantidos[materia.id]) return;
      var avaliacaoIds = {};
      dados.avaliacoes.forEach(function (avaliacao) {
        if (avaliacao.materiaId === materia.id) avaliacaoIds[avaliacao.id] = true;
      });
      dados.notas = dados.notas.filter(function (nota) {
        return !avaliacaoIds[nota.avaliacaoId];
      });
      dados.avaliacoes = dados.avaliacoes.filter(function (avaliacao) {
        return avaliacao.materiaId !== materia.id;
      });
      dados.mediasManuais = dados.mediasManuais.filter(function (registro) {
        return registro.materiaId !== materia.id;
      });
      dados.materias = dados.materias.filter(function (outra) {
        return outra.id !== materia.id;
      });
    });
  }

  /* ---------------- Fachada ---------------- */

  function chamar(nome, argumentos) {
    return new Promise(function (resolver, rejeitar) {
      try {
        var acao = ACOES[nome];
        if (!acao) falha('Ação desconhecida: ' + nome);
        resolver(acao.apply(null, argumentos || []));
      } catch (erro) {
        rejeitar(erro);
      }
    });
  }

  function mostrarAvisoModoLocal() {
    // Dentro do Apps Script o aviso não deve aparecer.
    if (typeof google !== 'undefined' && google.script && google.script.run) return;
    // Com a URL da nuvem configurada, também não: o sistema não está local.
    if (
      typeof CONFIG !== 'undefined' &&
      CONFIG &&
      String(CONFIG.URL_APPS_SCRIPT || '').trim()
    ) {
      return;
    }
    var aviso = document.getElementById('modo-local');
    if (!aviso) return;

    // js/config.js não existe (clone novo do repositório): ensina o caminho.
    if (typeof CONFIG === 'undefined') {
      var texto = aviso.querySelector('span');
      if (texto) {
        texto.innerHTML =
          'Modo demonstração: os dados ficam apenas neste navegador. ' +
          'Para usar o Google Sheets, copie <strong>js/config.example.js</strong> ' +
          'para <strong>js/config.js</strong> e cole a URL que termina em ' +
          '<strong>/exec</strong>.';
      }
    }

    aviso.hidden = false;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mostrarAvisoModoLocal);
    } else {
      mostrarAvisoModoLocal();
    }
  }

  return {
    chamar: chamar,
    limpar: function () {
      memoria = estadoVazio();
      try {
        window.localStorage.removeItem(CHAVE);
      } catch (erro) {
        // ignora
      }
    }
  };
})();
