/* ================= EXPORTAR TABELAS PARA EXCEL (.xlsx) =================
   Lê a tabela que está NA TELA (cabeçalho, linhas e rodapé) e gera um .xlsx
   com as mesmas cores, negrito, alinhamento e larguras de coluna. Como as
   cores são lidas direto do que o navegador está pintando (getComputedStyle),
   qualquer mudança de cor no style.css (ou de tema) já sai igual no Excel,
   sem precisar mexer aqui.

   Uso:
     exportarTabelasExcel([
       { nome:"Performance", titulo:"...", subtitulo:"...", tabela:<elemento table>, rodape:"..." }
     ], "Arquivo.xlsx");

   Depende da biblioteca ExcelJS (carregada no index.html).
   Os números saem como número de verdade (dá para somar/filtrar no Excel) e
   o SLA/PERF% sai como porcentagem. */
(function(){
  const FONTE = "Arial";

  // "rgb(15, 28, 71)" / "rgba(0,0,0,0)" -> "0F1C47" (ou null se transparente)
  function corParaHex(str){
    if(!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if(!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    let [r,g,b] = p;
    const a = p.length > 3 ? p[3] : 1;
    if(a === 0) return null;
    if(a < 1){ // mistura com branco
      r = Math.round(r*a + 255*(1-a)); g = Math.round(g*a + 255*(1-a)); b = Math.round(b*a + 255*(1-a));
    }
    return [r,g,b].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0")).join("").toUpperCase();
  }

  function corVar(nome, padrao){
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    return (v && v.replace("#","").toUpperCase()) || padrao;
  }

  // "1.234" -> 1234 | "98,50%" -> 0.985 | outro texto -> null
  function lerNumero(txt){
    const t = txt.trim();
    if(/^-?\d{1,3}(\.\d{3})+$/.test(t) || /^-?\d+$/.test(t)){
      return {valor:Number(t.replace(/\./g,"")), fmt:"#,##0"};
    }
    if(/^-?\d+(,\d+)?%$/.test(t)){
      return {valor:Math.round(Number(t.replace("%","").replace(",","."))*1e4)/1e6, fmt:"0.00%"};
    }
    return null;
  }

  function nomeAbaValido(nome, usados){
    let base = String(nome || "Planilha").replace(/[\[\]\:\*\?\/\\]/g, " ").replace(/\s+/g," ").trim().slice(0,31) || "Planilha";
    let final = base, i = 2;
    while(usados.has(final.toLowerCase())){
      const suf = " (" + i++ + ")";
      final = base.slice(0, 31 - suf.length) + suf;
    }
    usados.add(final.toLowerCase());
    return final;
  }

  function larguraColunasPx(tabela, totalCols){
    const larg = new Array(totalCols).fill(0);
    const linhaCab = tabela.tHead && tabela.tHead.rows[0];
    if(linhaCab){
      let col = 0;
      Array.from(linhaCab.cells).forEach(c => {
        const span = c.colSpan || 1;
        for(let k = 0; k < span; k++) larg[col + k] = (c.offsetWidth || 0) / span;
        col += span;
      });
    }
    return larg;
  }

  function montarAba(wb, spec, usados){
    const tabela = spec.tabela;
    if(!tabela) return;
    const ws = wb.addWorksheet(nomeAbaValido(spec.nome, usados), {
      views:[{showGridLines:false}]
    });

    const NAVY = corVar("--navy", "0F1C47");
    const NAVY2 = corVar("--navy-2", "152253");
    const GOLD = corVar("--gold", "C99A2E");
    const linhas = Array.from(tabela.rows);
    const totalCols = Math.max(1, ...linhas.map(r => Array.from(r.cells).reduce((s,c)=> s + (c.colSpan||1), 0)));

    let linhaXl = 1;

    // ----- título (e subtítulo) no topo da planilha -----
    function linhaTitulo(texto, opc){
      const row = ws.getRow(linhaXl);
      row.height = opc.altura;
      const cel = row.getCell(1);
      cel.value = texto;
      cel.font = {name:FONTE, size:opc.tam, bold:opc.negrito, color:{argb:"FF"+opc.cor}};
      cel.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF"+opc.fundo}};
      cel.alignment = {vertical:"middle", horizontal:"left", indent:1};
      if(totalCols > 1) ws.mergeCells(linhaXl, 1, linhaXl, totalCols);
      linhaXl++;
    }
    if(spec.subtitulo) linhaTitulo(spec.subtitulo, {altura:20, tam:9, negrito:true, cor:"F4E3B0", fundo:NAVY});
    if(spec.titulo)    linhaTitulo(spec.titulo,    {altura:26, tam:13, negrito:true, cor:"FFFFFF", fundo:NAVY});
    if(spec.titulo || spec.subtitulo){ ws.getRow(linhaXl).height = 8; linhaXl++; }

    // ----- tabela (thead, tbody, tfoot — na ordem em que aparecem na tela) -----
    let ultimaLinhaCabecalho = 0;
    linhas.forEach(tr => {
      const secao = tr.parentElement.tagName; // THEAD | TBODY | TFOOT
      const ehCab = secao === "THEAD";
      const ehRodape = secao === "TFOOT";
      const row = ws.getRow(linhaXl);
      row.height = ehCab ? 34 : (ehRodape ? 28 : 22);

      let col = 1;
      Array.from(tr.cells).forEach(td => {
        const span = td.colSpan || 1;
        const cs = getComputedStyle(td);
        const texto = (td.textContent || "").replace(/\s+/g," ").trim();
        const fundo = corParaHex(cs.backgroundColor);
        const corTxt = corParaHex(cs.color) || "1C2333";
        const negrito = (parseInt(cs.fontWeight,10) || 400) >= 600;
        const italico = cs.fontStyle === "italic";
        const tam = Math.max(8, Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 || 10);
        const alinh = (cs.textAlign === "left" || cs.textAlign === "start") ? "left"
                    : (cs.textAlign === "right" || cs.textAlign === "end") ? "right" : "center";

        const cel = row.getCell(col);
        const num = (ehCab || td.classList.contains("perf-unidade")) ? null : lerNumero(texto);
        if(num){ cel.value = num.valor; cel.numFmt = num.fmt; }
        else if(texto !== "" ){ cel.value = texto; }

        cel.font = {name:FONTE, size:tam, bold:negrito, italic:italico, color:{argb:"FF"+corTxt}};
        if(fundo) cel.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF"+fundo}};
        cel.alignment = {vertical:"middle", horizontal:alinh, wrapText:ehCab, indent: alinh === "left" ? 1 : 0};

        // separador branco entre células (igual à tela); rodapé ganha a linha dourada em cima
        const branco = {style:"thin", color:{argb:"FFFFFFFF"}};
        cel.border = {
          top: ehRodape ? {style:"medium", color:{argb:"FF"+GOLD}} : branco,
          bottom: branco, left: branco, right: branco
        };

        if(span > 1){
          ws.mergeCells(linhaXl, col, linhaXl, col + span - 1);
          // as células mescladas herdam a cor de fundo (evita "buracos" brancos)
          for(let k = 1; k < span; k++){
            const extra = row.getCell(col + k);
            if(fundo) extra.fill = cel.fill;
            extra.border = cel.border;
          }
        }
        col += span;
      });
      if(ehCab) ultimaLinhaCabecalho = linhaXl;
      linhaXl++;
    });

    // ----- observações no rodapé -----
    const notas = [];
    if(spec.rodape) notas.push(spec.rodape);
    notas.push("Exportado em " + new Date().toLocaleString("pt-BR") + " — Painel Tambasa");
    ws.getRow(linhaXl++).height = 8;
    notas.forEach(n => {
      const cel = ws.getRow(linhaXl).getCell(1);
      cel.value = n;
      cel.font = {name:FONTE, size:9, italic:true, color:{argb:"FF6B7286"}};
      cel.alignment = {vertical:"middle", horizontal:"left", wrapText:true};
      if(totalCols > 1) ws.mergeCells(linhaXl, 1, linhaXl, totalCols);
      ws.getRow(linhaXl).height = n.length > 110 ? 26 : 16;
      linhaXl++;
    });

    // ----- larguras (usa a largura que a coluna tem na tela; alarga se o texto for maior) -----
    const px = larguraColunasPx(tabela, totalCols);
    const maxTxt = new Array(totalCols).fill(0);
    linhas.forEach(tr => {
      if(tr.parentElement.tagName === "THEAD") return;
      let c = 0;
      Array.from(tr.cells).forEach(td => {
        const span = td.colSpan || 1;
        if(span === 1) maxTxt[c] = Math.max(maxTxt[c], (td.textContent || "").trim().length);
        c += span;
      });
    });
    for(let i = 0; i < totalCols; i++){
      const pelaTela = px[i] ? px[i] / 7 : 14;
      const pelaTexto = Math.min(maxTxt[i] + 4, 42);
      ws.getColumn(i + 1).width = Math.max(11, Math.round(Math.max(pelaTela, pelaTexto)));
    }

    // congela o cabeçalho para rolar só as linhas
    if(ultimaLinhaCabecalho){
      ws.views = [{state:"frozen", ySplit:ultimaLinhaCabecalho, showGridLines:false}];
    }
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
  }

  window.exportarTabelasExcel = async function(sheets, nomeArquivo){
    if(typeof ExcelJS === "undefined"){
      alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão com a internet e recarregue a página.");
      return;
    }
    const validas = (sheets || []).filter(s => s && s.tabela);
    if(validas.length === 0){
      alert("Não há tabela para exportar.");
      return;
    }
    try{
      const wb = new ExcelJS.Workbook();
      wb.creator = "Painel Tambasa";
      wb.created = new Date();
      const usados = new Set();
      validas.forEach(s => montarAba(wb, s, usados));

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo || "Painel_Tambasa.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      console.error("Erro ao exportar para Excel:", err);
      alert("Não foi possível gerar o Excel: " + (err.message || err));
    }
  };

  // sufixo de data para o nome do arquivo: 2026-09-21
  window.dataParaArquivo = function(){
    return new Date().toISOString().slice(0,10);
  };
})();
