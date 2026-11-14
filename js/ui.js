/**
 * Componentes e utilidades de interface.
 * Modais funcionam em pilha: é possível abrir uma confirmação sobre um
 * formulário sem destruir o formulário.
 */
var Ui = (function () {
  var pilhaModais = [];
  var proximoModalId = 1;

  var ICONES = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    arrowLeft: '<path d="m15 18-6-6 6-6"/>',
    arrowRight: '<path d="m9 18 6-6-6-6"/>',
    arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>',
    restore: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    alert: '<path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="8"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    sheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    teste: '<path d="M9 3h6"/><path d="M10 3v6l-5.2 9a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'
  };

  function escaparHtml(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function icone(nome, classe) {
    var conteudo = ICONES[nome] || ICONES.info;
    return (
      '<svg class="icon ' + (classe || '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + conteudo + '</svg>'
    );
  }

  function qs(seletor, raiz) {
    return (raiz || document).querySelector(seletor);
  }

  function qsa(seletor, raiz) {
    return Array.prototype.slice.call((raiz || document).querySelectorAll(seletor));
  }

  function formatarNota(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    var numero = Number(valor);
    if (!isFinite(numero)) return '—';
    return numero.toFixed(1).replace('.', ',');
  }

  function formatarNotaInput(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    var numero = Number(valor);
    if (!isFinite(numero)) return '';
    return String(numero).replace('.', ',');
  }

  function formatarDataHora(iso) {
    if (!iso) return '—';
    var data = new Date(iso);
    if (isNaN(data.getTime())) return String(iso);
    return (
      data.toLocaleDateString('pt-BR') +
      ' às ' +
      data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  function formatarData(iso) {
    if (!iso) return '—';
    var data = new Date(iso);
    if (isNaN(data.getTime())) return String(iso);
    return data.toLocaleDateString('pt-BR');
  }

  function formatarTamanho(bytes) {
    var numero = Number(bytes) || 0;
    if (numero < 1024) return numero + ' B';
    if (numero < 1024 * 1024) {
      return (numero / 1024).toFixed(1).replace('.', ',') + ' KB';
    }
    return (numero / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
  }

  function plural(numero, singular, pluralTexto) {
    return Number(numero) === 1 ? singular : pluralTexto;
  }

  function iniciais(nome) {
    var partes = String(nome || '')
      .trim()
      .split(/\s+/)
      .filter(function (parte) {
        return parte.length > 1;
      });
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function toast(mensagem, tipo, duracao) {
    var pilha = document.getElementById('toast-stack');
    if (!pilha) return;
    var classes = {
      sucesso: 'sucesso',
      erro: 'erro',
      aviso: 'aviso',
      info: 'info'
    };
    var nomeIcone = {
      sucesso: 'check',
      erro: 'alert',
      aviso: 'alert',
      info: 'info'
    };
    var elemento = document.createElement('div');
    elemento.className = 'toast ' + (classes[tipo] || 'info');
    elemento.innerHTML =
      icone(nomeIcone[tipo] || 'info') +
      '<div>' + escaparHtml(mensagem) + '</div>';
    pilha.appendChild(elemento);

    var tempo = duracao || (tipo === 'erro' ? 7000 : 4200);
    window.setTimeout(function () {
      elemento.style.opacity = '0';
      elemento.style.transform = 'translateY(6px)';
      elemento.style.transition = 'opacity .2s, transform .2s';
      window.setTimeout(function () {
        if (elemento.parentNode) elemento.parentNode.removeChild(elemento);
      }, 220);
    }, tempo);
  }

  function abrirModal(opcoes) {
    var raiz = document.getElementById('modal-root');
    var titulo = opcoes.titulo || '';
    var subtitulo = opcoes.subtitulo || '';
    var corpo = opcoes.corpo || '';
    var rodape = opcoes.rodape || '';
    var largura = opcoes.larga ? ' larga' : '';
    var idTitulo = 'modal-titulo-' + proximoModalId;
    proximoModalId += 1;

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('data-modal-overlay', '');
    overlay.innerHTML =
      '<div class="modal' + largura + '" role="dialog" aria-modal="true" ' +
        'aria-labelledby="' + idTitulo + '">' +
        '<div class="modal-header">' +
          '<div>' +
            '<h2 class="modal-title" id="' + idTitulo + '">' + escaparHtml(titulo) + '</h2>' +
            (subtitulo
              ? '<p class="modal-subtitle">' + escaparHtml(subtitulo) + '</p>'
              : '') +
          '</div>' +
          '<button type="button" class="icon-btn modal-close" data-modal-fechar ' +
            'aria-label="Fechar">' + icone('x') + '</button>' +
        '</div>' +
        '<div class="modal-body" data-modal-corpo>' + corpo + '</div>' +
        (rodape
          ? '<div class="modal-footer" data-modal-rodape>' + rodape + '</div>'
          : '') +
      '</div>';
    raiz.appendChild(overlay);

    var modal = overlay.querySelector('.modal');
    var aberto = true;
    var controle = null;

    function fechar() {
      if (!aberto) return;
      aberto = false;
      document.removeEventListener('keydown', aoTeclar);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      var indice = pilhaModais.indexOf(controle);
      if (indice !== -1) pilhaModais.splice(indice, 1);
      if (typeof opcoes.aoFechar === 'function') opcoes.aoFechar();
    }

    function aoTeclar(evento) {
      if (evento.key !== 'Escape') return;
      if (pilhaModais[pilhaModais.length - 1] !== controle) return;
      fechar();
    }

    overlay.addEventListener('mousedown', function (evento) {
      if (evento.target === overlay) fechar();
    });
    overlay.querySelector('[data-modal-fechar]').addEventListener('click', fechar);
    document.addEventListener('keydown', aoTeclar);

    controle = {
      fechar: fechar,
      modal: modal,
      corpo: overlay.querySelector('[data-modal-corpo]'),
      rodape: overlay.querySelector('[data-modal-rodape]')
    };
    pilhaModais.push(controle);

    window.setTimeout(function () {
      if (!aberto) return;
      var foco = modal.querySelector('[autofocus]') ||
        modal.querySelector('input, select, textarea, button');
      if (foco) foco.focus();
    }, 30);

    return controle;
  }

  function confirmar(opcoes) {
    return new Promise(function (resolver) {
      var textoConfirmar = opcoes.textoConfirmar || 'Confirmar';
      var textoCancelar = opcoes.textoCancelar || 'Cancelar';
      var classe = opcoes.perigo ? 'btn-danger' : 'btn-primary';
      var modal = abrirModal({
        titulo: opcoes.titulo || 'Confirmar ação',
        corpo:
          '<p class="muted" style="line-height:1.6">' +
            escaparHtml(opcoes.mensagem || '') +
          '</p>',
        rodape:
          '<button type="button" class="btn btn-secondary" data-cancelar>' +
            escaparHtml(textoCancelar) +
          '</button>' +
          '<button type="button" class="btn ' + classe + '" data-confirmar>' +
            escaparHtml(textoConfirmar) +
          '</button>',
        aoFechar: function () {
          resolver(false);
        }
      });

      modal.rodape.querySelector('[data-cancelar]').addEventListener('click', function () {
        modal.fechar();
        resolver(false);
      });
      modal.rodape.querySelector('[data-confirmar]').addEventListener('click', function () {
        // Resolve antes de fechar: fechar() dispara aoFechar, que resolveria false.
        resolver(true);
        modal.fechar();
      });
    });
  }

  function carregando(texto) {
    return (
      '<div class="loading"><span class="spinner"></span>' +
      escaparHtml(texto || 'Carregando...') +
      '</div>'
    );
  }

  function vazio(opcoes) {
    return (
      '<div class="empty">' +
        '<div class="empty-icon">' + icone(opcoes.icone || 'info') + '</div>' +
        '<h3>' + escaparHtml(opcoes.titulo || 'Nada por aqui') + '</h3>' +
        '<p>' + escaparHtml(opcoes.texto || '') + '</p>' +
        (opcoes.acao || '') +
      '</div>'
    );
  }

  function badge(texto, classe) {
    return '<span class="badge ' + (classe || '') + '">' + escaparHtml(texto) + '</span>';
  }

  function alerta(texto, tipo, iconeNome) {
    var classes = {
      info: 'alert-info',
      aviso: 'alert-warning',
      erro: 'alert-danger',
      sucesso: 'alert-success'
    };
    var nomes = { info: 'info', aviso: 'alert', erro: 'alert', sucesso: 'check' };
    return (
      '<div class="alert ' + (classes[tipo] || 'alert-info') + '">' +
        icone(iconeNome || nomes[tipo] || 'info') +
        '<div>' + texto + '</div>' +
      '</div>'
    );
  }

  function debounce(fn, espera) {
    var timer = null;
    return function () {
      var contexto = this;
      var args = arguments;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(contexto, args);
      }, espera);
    };
  }

  function htmlSeguro(valor) {
    return escaparHtml(valor);
  }

  return {
    escaparHtml: escaparHtml,
    htmlSeguro: htmlSeguro,
    icone: icone,
    qs: qs,
    qsa: qsa,
    formatarNota: formatarNota,
    formatarNotaInput: formatarNotaInput,
    formatarDataHora: formatarDataHora,
    formatarData: formatarData,
    formatarTamanho: formatarTamanho,
    plural: plural,
    iniciais: iniciais,
    toast: toast,
    abrirModal: abrirModal,
    confirmar: confirmar,
    carregando: carregando,
    vazio: vazio,
    badge: badge,
    alerta: alerta,
    debounce: debounce
  };
})();
