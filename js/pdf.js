/**
 * Gerador de PDF sem dependências.
 *
 * Escreve um PDF em memória (texto Helvetica, WinAnsiEncoding) direto no
 * navegador: nada é enviado para servidor nem gravado em lugar nenhum.
 *
 * Serve para documentos simples e tabulares (relatórios, listas). As
 * coordenadas são medidas de cima para baixo, como no HTML — a origem de
 * baixo para cima do PDF é tratada aqui dentro.
 *
 * Uso:
 *   var doc = Pdf.criar({ largura: 842, altura: 595, margem: 40 });
 *   var topo = doc.bloco(24);            // reserva 24pt; quebra página se faltar
 *   doc.texto(40, topo, 'Título', { tamanho: 16, negrito: true });
 *   Pdf.baixar(doc, 'relatorio.pdf');
 */
var Pdf = (function () {
  var PADRAO_LARGURA = 842; // A4 paisagem em pontos
  var PADRAO_ALTURA = 595;

  /**
   * Larguras dos caracteres em milésimos do corpo (métricas Helvetica/AFM).
   * Só as que interessam a relatórios: dígitos, pontuação e acentos comuns.
   */
  var LARGURAS = {
    ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667,
    "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333,
    '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556,
    '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278,
    '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, 'A': 667, 'B': 667,
    'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778, 'H': 722, 'I': 278,
    'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778, 'P': 667,
    'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
    'X': 667, 'Y': 667, 'Z': 611, '[': 278, '\\': 278, ']': 278, '^': 469,
    '_': 556, '`': 278, 'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556,
    'f': 278, 'g': 556, 'h': 556, 'i': 222, 'j': 222, 'k': 500, 'l': 222,
    'm': 833, 'n': 556, 'o': 556, 'p': 556, 'q': 556, 'r': 333, 's': 500,
    't': 278, 'u': 556, 'v': 500, 'w': 722, 'x': 500, 'y': 500, 'z': 500,
    '{': 334, '|': 260, '}': 334, '~': 584,
    '°': 400, 'º': 333, 'ª': 333, 'ç': 500, 'Ç': 722, 'ã': 556, 'õ': 556,
    'á': 556, 'à': 556, 'â': 556, 'é': 556, 'ê': 556, 'í': 278, 'ó': 556,
    'ô': 556, 'ú': 556, 'ü': 556, '·': 278, '—': 1000, '–': 500
  };

  /** Letras em negrito com largura diferente da regular. */
  var LARGURAS_NEGRITO = {
    'A': 722, 'B': 722, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
    'H': 722, 'I': 278, 'J': 556, 'K': 722, 'L': 611, 'M': 833, 'N': 722,
    'O': 778, 'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722,
    'V': 667, 'W': 944, 'X': 667, 'Y': 667, 'Z': 611,
    'a': 556, 'b': 611, 'c': 556, 'd': 611, 'e': 556, 'f': 333, 'g': 611,
    'h': 611, 'i': 278, 'j': 278, 'k': 556, 'l': 278, 'm': 889, 'n': 611,
    'o': 611, 'p': 611, 'q': 611, 'r': 389, 's': 556, 't': 333, 'u': 611,
    'v': 556, 'w': 778, 'x': 556, 'y': 556, 'z': 500
  };

  /** Python/negrito repetem as anomalias pontuais da regular. */
  var LARGURAS_NEGRITO_PONTOS = {
    ' ': 278, ',': 278, '.': 278, ':': 278, ';': 278, "'": 191, '°': 400,
    'º': 333, '·': 278, '—': 1000, '–': 500, '(': 333, ')': 333, '-': 333
  };

  /**
   * Caracteres Unicode fora do Latin-1 que existem no WinAnsiEncoding com
   * outro valor. O resto vira "?".
   */
  var SUBSTITUICOES = {
    0x2013: 0x96,
    0x2014: 0x97,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2026: 0x85,
    0x20ac: 0x80,
    0x2212: 0x2d
  };

  function larguraDaLetra(letra, negrito) {
    if (negrito && LARGURAS_NEGRITO_PONTOS[letra] !== undefined) {
      return LARGURAS_NEGRITO_PONTOS[letra];
    }
    if (negrito && LARGURAS_NEGRITO[letra] !== undefined) {
      return LARGURAS_NEGRITO[letra];
    }
    if (LARGURAS[letra] !== undefined) return LARGURAS[letra];
    return negrito ? 611 : 556; // estimativa para letras não mapeadas
  }

  function larguraTexto(texto, tamanho, negrito) {
    var total = 0;
    var cadeia = String(texto === null || texto === undefined ? '' : texto);
    for (var i = 0; i < cadeia.length; i += 1) {
      total += larguraDaLetra(cadeia.charAt(i), !!negrito);
    }
    return (total / 1000) * Number(tamanho || 10);
  }

  /** Codifica em WinAnsi (byte ≤ 255) e escapa o literal do PDF. */
  function literal(texto) {
    var cadeia = String(texto === null || texto === undefined ? '' : texto);
    var saida = '';
    for (var i = 0; i < cadeia.length; i += 1) {
      var ponto = cadeia.charCodeAt(i);
      if (SUBSTITUICOES[ponto] !== undefined) ponto = SUBSTITUICOES[ponto];
      if (ponto > 255) ponto = 0x3f; // "?"
      var letra = String.fromCharCode(ponto);
      if (letra === '\\' || letra === '(' || letra === ')') saida += '\\';
      saida += letra;
    }
    return saida;
  }

  function corTexto(valor) {
    if (!valor) return '0 0 0';
    if (typeof valor === 'string') {
      var hex = valor.replace('#', '');
      if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) +
          hex.charAt(2) + hex.charAt(2);
      }
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255
      ]
        .map(function (n) {
          return (Math.round(n * 1000) / 1000).toString();
        })
        .join(' ');
    }
    return valor
      .map(function (n) {
        return (Math.round((Number(n) / 255) * 1000) / 1000).toString();
      })
      .join(' ');
  }

  function numero(valor) {
    var n = Math.round(Number(valor) * 100) / 100;
    return isFinite(n) ? String(n) : '0';
  }

  function criar(opcoes) {
    var cfg = opcoes || {};
    var largura = Number(cfg.largura) || PADRAO_LARGURA;
    var altura = Number(cfg.altura) || PADRAO_ALTURA;
    var margem = Number(cfg.margem) || 40;

    var doc = {
      largura: largura,
      altura: altura,
      margem: margem,
      paginas: [],
      y: margem
    };

    // -1: desenha na última página. Usado pelo rodapé, página a página.
    var alvoPagina = -1;

    function paginaAtual() {
      if (!doc.paginas.length) doc.paginas.push([]);
      var indice = alvoPagina < 0 || alvoPagina >= doc.paginas.length
        ? doc.paginas.length - 1
        : alvoPagina;
      return doc.paginas[indice];
    }

    /** Garante espaço de um bloco sem consumi-lo; quebra página se faltar. */
    doc.espaco = function (h) {
      if (doc.y + h > altura - margem) doc.novaPagina();
    };

    /** Reserva um bloco de `h` pontos, quebrando a página quando não couber. */
    doc.bloco = function (h) {
      if (doc.y + h > altura - margem) doc.novaPagina();
      var topo = doc.y;
      doc.y += h;
      return topo;
    };

    doc.novaPagina = function () {
      doc.paginas.push([]);
      doc.y = margem;
    };

    doc.totalPaginas = function () {
      return doc.paginas.length;
    };

    /** Retângulo sólido. (x, y) é o canto superior esquerdo. */
    doc.retangulo = function (x, y, w, h, cor) {
      paginaAtual().push(
        corTexto(cor) + ' rg ' +
        numero(x) + ' ' + numero(altura - y - h) + ' ' +
        numero(w) + ' ' + numero(h) + ' re f'
      );
    };

    doc.regua = function (x1, x2, y, opcoesRegua) {
      var opc = opcoesRegua || {};
      paginaAtual().push(
        (opc.largura || 1) + ' w ' +
        corTexto(opc.cor || '#cbd5e1') + ' RG ' +
        numero(x1) + ' ' + numero(altura - y) + ' m ' +
        numero(x2) + ' ' + numero(altura - y) + ' l S'
      );
    };

    /**
     * Texto com (x, y) no topo-esquerda da caixa de linha.
     * alinhamento: 'esquerda' | 'centro' | 'direita'.
     */
    doc.texto = function (x, y, conteudo, opcoesTexto) {
      var opc = opcoesTexto || {};
      var tam = Number(opc.tamanho) || 10;
      var negrito = !!opc.negrito;
      var cadeia = String(conteudo === null || conteudo === undefined ? '' : conteudo);
      if (!cadeia) return;

      var base = larguraTexto(cadeia, tam, negrito);
      var limite = Number(opc.largura) || 0;
      if (limite > 0 && base > limite) {
        var ajustado = cadeia;
        while (ajustado.length > 1 && larguraTexto(ajustado, tam, negrito) > limite) {
          ajustado = ajustado.slice(0, -1);
        }
        cadeia = ajustado.replace(/\s+$/, '') + '\u2026';
        base = larguraTexto(cadeia, tam, negrito);
      }

      var px = x;
      if (opc.alinhamento === 'centro') px = x - base / 2;
      else if (opc.alinhamento === 'direita') px = x - base;

      var py = altura - y - tam * 0.8;
      paginaAtual().push(
        corTexto(opc.cor || '#0f172a') + ' rg BT /' +
        (negrito ? 'F2' : 'F1') + ' ' + tam + ' Tf 1 0 0 1 ' +
        numero(px) + ' ' + numero(py) + ' Tm (' + literal(cadeia) + ') Tj ET'
      );
    };

    doc.larguraTexto = larguraTexto;

    /* ------------------------------------------------------------------ */
    /* Serialização                                                       */
    /* ------------------------------------------------------------------ */

    function montarObjetos() {
      // Documento sem desenho ainda continua sendo um PDF válido (1 página).
      if (!doc.paginas.length) doc.paginas.push([]);

      var objetos = [];
      var idsPaginaConteudo = [];
      var idsPagina = [];

      doc.paginas.forEach(function (ops, indice) {
        idsPaginaConteudo.push(5 + indice * 2);
        idsPagina.push(6 + indice * 2);
      });
      var idTotal = 4 + doc.paginas.length * 2;

      objetos.push({
        id: 1,
        corpo: '<< /Type /Catalog /Pages 2 0 R >>'
      });
      objetos.push({
        id: 2,
        corpo:
          '<< /Type /Pages /Count ' + doc.paginas.length + ' /Kids [' +
          idsPagina
            .map(function (id) {
              return id + ' 0 R';
            })
            .join(' ') + '] >>'
      });
      objetos.push({
        id: 3,
        corpo:
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ' +
          '/Encoding /WinAnsiEncoding >>'
      });
      objetos.push({
        id: 4,
        corpo:
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold ' +
          '/Encoding /WinAnsiEncoding >>'
      });

      doc.paginas.forEach(function (ops, indice) {
        var conteudo = ops.join('\n');
        objetos.push({
          id: idsPaginaConteudo[indice],
          corpo:
            '<< /Length ' + conteudo.length + ' >>\nstream\n' +
            conteudo + '\nendstream'
        });
        objetos.push({
          id: idsPagina[indice],
          corpo:
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
            numero(largura) + ' ' + numero(altura) + '] ' +
            '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ' +
            '/Contents ' + idsPaginaConteudo[indice] + ' 0 R >>'
        });
      });

      return { objetos: objetos, idTotal: idTotal };
    }

    doc.construir = function () {
      if (!doc.paginas.length) doc.paginas.push([]);

      // Rodapé numerado é desenhado por último, quando já se sabe o total.
      if (typeof doc.rodapes === 'function') {
        var total = doc.paginas.length;
        var alvoOriginal = alvoPagina;
        for (var pagina = 0; pagina < total; pagina += 1) {
          alvoPagina = pagina;
          doc.rodapes(pagina + 1, total);
        }
        alvoPagina = alvoOriginal;
      }

      var pacote = montarObjetos();
      var partes = ['%PDF-1.4\n'];
      var bytes = '%PDF-1.4\n'.length;
      var deslocamentos = [];

      pacote.objetos.forEach(function (objeto) {
        deslocamentos[objeto.id] = bytes;
        var bloco =
          objeto.id + ' 0 obj\n' + objeto.corpo + '\nendobj\n';
        partes.push(bloco);
        bytes += bloco.length;
      });

      var startxref = bytes;
      var xref =
        'xref\n0 ' + (pacote.idTotal + 1) + '\n' +
        '0000000000 65535 f \n';
      for (var id = 1; id <= pacote.idTotal; id += 1) {
        var deslocamento = deslocamentos[id] || 0;
        xref +=
          ('0000000000' + deslocamento).slice(-10) + ' 00000 n \n';
      }
      partes.push(xref);
      partes.push(
        'trailer\n<< /Size ' + (pacote.idTotal + 1) + ' /Root 1 0 R >>\n' +
        'startxref\n' + startxref + '\n%%EOF\n'
      );

      return partes.join('');
    };

    doc.bytes = function () {
      var cadeia = doc.construir();
      var saida = new Uint8Array(cadeia.length);
      for (var i = 0; i < cadeia.length; i += 1) {
        saida[i] = cadeia.charCodeAt(i) & 0xff;
      }
      return saida;
    };

    return doc;
  }

  /** Baixa o documento no navegador com o nome dado. */
  function baixar(doc, nome) {
    var bytes = doc.bytes();
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  return {
    criar: criar,
    baixar: baixar,
    larguraTexto: larguraTexto
  };
})();
