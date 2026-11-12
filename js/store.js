/**
 * Estado compartilhado do frontend.
 * Fica em memória; a fonte da verdade é sempre o backend.
 */
var Estado = {
  app: null,
  turmas: [],
  backup: null,
  filtroAno: 'todos',
  rota: { view: 'turmas', turmaId: null, aba: 'alunos' },
  turma: null,
  alunos: [],
  alunosCarregados: false,
  alunoEditandoId: null,
  filtroAluno: '',
  selecaoNotas: {},
  grade: null,
  boletim: null,
  resumo: null,
  modoBoletim: 'materia',
  materiaBoletimId: null,
  carregando: false
};

Estado.turmaPorId = function (id) {
  for (var i = 0; i < Estado.turmas.length; i += 1) {
    if (Estado.turmas[i].id === id) return Estado.turmas[i];
  }
  return null;
};

Estado.materiaDaTurma = function (turmaId, materiaId) {
  var turma = Estado.turmaPorId(turmaId);
  if (!turma) return null;
  for (var i = 0; i < turma.materias.length; i += 1) {
    if (turma.materias[i].id === materiaId) return turma.materias[i];
  }
  return null;
};

Estado.definirTurmas = function (turmas) {
  Estado.turmas = turmas || [];
  if (Estado.turma) {
    var atualizada = Estado.turmaPorId(Estado.turma.id);
    if (atualizada) Estado.turma = atualizada;
  }
};

Estado.anosDisponiveis = function () {
  var anos = {};
  Estado.turmas.forEach(function (turma) {
    anos[turma.ano] = true;
  });
  return Object.keys(anos)
    .map(Number)
    .sort(function (a, b) {
      return b - a;
    });
};

Estado.selecaoNotasDaTurma = function (turmaId) {
  var turma = Estado.turmaPorId(turmaId);
  var selecao = Estado.selecaoNotas[turmaId];
  if (!turma) return selecao || null;

  var materiaValida = false;
  if (selecao && selecao.materiaId) {
    materiaValida = turma.materias.some(function (materia) {
      return materia.id === selecao.materiaId;
    });
  }
  if (!selecao || !materiaValida) {
    selecao = {
      materiaId: turma.materias.length ? turma.materias[0].id : null,
      bimestre: (selecao && selecao.bimestre) || 1
    };
    Estado.selecaoNotas[turmaId] = selecao;
  }
  return selecao;
};

Estado.salvarSelecaoNotas = function (turmaId, materiaId, bimestre) {
  Estado.selecaoNotas[turmaId] = {
    materiaId: materiaId,
    bimestre: Number(bimestre)
  };
};

Estado.limparTurma = function () {
  Estado.turma = null;
  Estado.alunos = [];
  Estado.alunosCarregados = false;
  Estado.alunoEditandoId = null;
  Estado.filtroAluno = '';
  Estado.grade = null;
  Estado.boletim = null;
  Estado.resumo = null;
  Estado.modoBoletim = 'materia';
  Estado.materiaBoletimId = null;
};

Estado.turmaAtualizada = function (turma) {
  if (!turma) return;
  Estado.turma = turma;
  for (var i = 0; i < Estado.turmas.length; i += 1) {
    if (Estado.turmas[i].id === turma.id) {
      Estado.turmas[i] = turma;
      return;
    }
  }
  Estado.turmas.push(turma);
};
