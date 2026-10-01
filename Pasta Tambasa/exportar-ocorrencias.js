/* ================= EXPORTAR OCORRÊNCIAS (código 69) — UMA ABA POR FOCAL =================
   Gera o .xlsx direto dos DADOS (não lê mais a tabela da tela), então sai sempre formatado:
     RESUMO            -> uma linha por focal (clique no nome para ir para a aba), com totais
     <um por focal>    -> título, cabeçalho azul-marinho, linhas zebradas, filtro automático,
                          cabeçalho congelado e linha de TOTAL (SUBTOTAL: acompanha o filtro)
     Sem focal definido -> vai por último, com a aba em vermelho, porque precisa de ação

   Valores de frete e mercadoria saem como NÚMERO (dá para somar/filtrar no Excel), formato R$.
   CTRC e NF saem como TEXTO (não perde zero à esquerda nem vira notação científica).

   Uso:  exportarOcorrenciasPorFocal({
           titulo, filtroTexto, rodape,
           colunas:[{titulo, tipo:"texto"|"centro"|"moeda"}],
           grupos:[{focal, semFocal, linhas:[[valor, valor, ...]]}]
         }, "arquivo.xlsx");
   Depende da biblioteca ExcelJS (carregada no index.html). */
(function(root){
  const FONTE = "Arial";
  const MOEDA = '"R$" #,##0.00';

  function corVar(nome, padrao){
    try{
      const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
      return (v && v.replace("#", "").toUpperCase()) || padrao;
    }catch(e){ return padrao; }
  }
  const preencher = hex => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF" + hex}});
  const colLetra = n => { let s = ""; while(n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const aspas = nome => "'" + String(nome).replace(/'/g, "''") + "'";
  const n0 = v => Number(v) || 0;

  function nomeAbaValido(nome, usados){
    const base = String(nome || "Planilha").replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Planilha";
    let final = base, i = 2;
    while(usados.has(final.toLowerCase())){
      const suf = " (" + i++ + ")";
      final = base.slice(0, 31 - suf.length) + suf;
    }
    usados.add(final.toLowerCase());
    return final;
  }

  function montar(ExcelJSlib, cfg){
    const NAVY = corVar("--navy", "0F1C47");
    const GOLD = corVar("--gold", "C99A2E");
    const VERMELHO = "B42318";
    const linhaFina = {style:"thin", color:{argb:"FFD5DAE6"}};
    const bordas = {top:linhaFina, bottom:linhaFina, left:linhaFina, right:linhaFina};
    const colunas = cfg.colunas, nC = colunas.length;
    const moedaIdx = colunas.map((c, i) => c.tipo === "moeda" ? i : -1).filter(i => i >= 0);

    const wb = new ExcelJSlib.Workbook();
    wb.creator = "Painel Tambasa"; wb.created = new Date();
    wb.calcProperties = {fullCalcOnLoad:true};
    const usados = new Set(["resumo"]);
    const wsResumo = wb.addWorksheet("RESUMO", {views:[{showGridLines:false}]});
    wsResumo.properties.tabColor = {argb:"FF" + GOLD};

    const infoAbas = [];   // {focal, nome, n, soma:{idx:valor}, primeira, ultima}

    /* ---------------- uma aba por focal ---------------- */
    cfg.grupos.forEach(g => {
      const nome = nomeAbaValido(g.focal, usados);
      const ws = wb.addWorksheet(nome, {views:[{showGridLines:false}]});
      ws.properties.tabColor = {argb:"FF" + (g.semFocal ? VERMELHO : NAVY)};

      // título e subtítulo (focal)
      const faixa = (r, texto, o) => {
        ws.mergeCells(r, 1, r, nC);
        for(let c = 1; c <= nC; c++) ws.getCell(r, c).fill = preencher(o.fundo);
        const cel = ws.getCell(r, 1);
        cel.value = texto;
        cel.font = {name:FONTE, size:o.tam, bold:true, color:{argb:"FF" + o.cor}};
        cel.alignment = {vertical:"middle", horizontal:"left", indent:1};
        ws.getRow(r).height = o.altura;
      };
      faixa(1, cfg.titulo, {fundo:NAVY, cor:"FFFFFF", tam:14, altura:30});
      faixa(2, `${g.focal}  •  ${g.linhas.length} ocorrência(s)`, {fundo:g.semFocal ? VERMELHO : GOLD, cor:g.semFocal ? "FFFFFF" : NAVY, tam:12, altura:24});
      // linha 3: filtro aplicado / aviso
      ws.mergeCells(3, 1, 3, nC);
      const c3 = ws.getCell(3, 1);
      c3.value = g.semFocal
        ? "Atenção: o sistema não conseguiu definir o focal destas ocorrências pela regra PAGADOR > UNIDADE. Defina o responsável."
        : (cfg.filtroTexto || "");
      c3.font = {name:FONTE, size:9, italic:true, bold:!!g.semFocal, color:{argb:"FF" + (g.semFocal ? VERMELHO : "6B7286")}};
      c3.alignment = {vertical:"middle", horizontal:"left", indent:1, wrapText:true};
      ws.getRow(3).height = 20;

      // cabeçalho
      const HDR = 4;
      colunas.forEach((col, i) => {
        const cel = ws.getCell(HDR, i + 1);
        cel.value = col.titulo.toUpperCase();
        cel.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}};
        cel.fill = preencher(NAVY);
        cel.alignment = {vertical:"middle", horizontal:col.tipo === "moeda" ? "right" : (col.tipo === "centro" ? "center" : "left"), wrapText:true, indent:col.tipo === "centro" ? 0 : 1};
        cel.border = {bottom:{style:"medium", color:{argb:"FF" + GOLD}}};
      });
      ws.getRow(HDR).height = 26;

      // linhas
      const ini = HDR + 1;
      const maxLen = colunas.map(c => c.titulo.length + 2);
      g.linhas.forEach((lin, k) => {
        const r = ini + k, zebra = k % 2 === 1;
        colunas.forEach((col, i) => {
          const v = lin[i];
          const cel = ws.getCell(r, i + 1);
          if(col.tipo === "moeda"){
            if(v !== null && v !== undefined && v !== "") { cel.value = n0(v); cel.numFmt = MOEDA; }
          } else {
            const t = String(v == null ? "" : v);
            if(t !== "") cel.value = t;                       // sempre texto: preserva zeros à esquerda
            maxLen[i] = Math.max(maxLen[i], t.length + 2);
          }
          cel.font = {name:FONTE, size:10, color:{argb:"FF1C2333"}};
          if(zebra) cel.fill = preencher("F3F5FA");
          cel.alignment = {vertical:"middle", horizontal:col.tipo === "moeda" ? "right" : (col.tipo === "centro" ? "center" : "left"), indent:col.tipo === "centro" ? 0 : 1};
          cel.border = bordas;
        });
        ws.getRow(r).height = 20;
      });
      const ult = ini + g.linhas.length - 1;

      // linha de TOTAL (SUBTOTAL: soma só o que está visível quando você filtra)
      const rt = ult + 1;
      const soma = {};
      colunas.forEach((col, i) => {
        const cel = ws.getCell(rt, i + 1);
        cel.fill = preencher(NAVY);
        cel.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}};
        cel.border = {top:{style:"medium", color:{argb:"FF" + GOLD}}};
        cel.alignment = {vertical:"middle", horizontal:col.tipo === "moeda" ? "right" : "left", indent:1};
        if(i === 0){
          cel.value = {formula:`"TOTAL: "&SUBTOTAL(103,A${ini}:A${ult})&" ocorrência(s)"`, result:`TOTAL: ${g.linhas.length} ocorrência(s)`};
        } else if(col.tipo === "moeda"){
          const L = colLetra(i + 1);
          soma[i] = g.linhas.reduce((s, lin) => s + n0(lin[i]), 0);
          cel.value = {formula:`SUBTOTAL(109,${L}${ini}:${L}${ult})`, result:soma[i]};
          cel.numFmt = MOEDA;
        }
      });
      ws.getRow(rt).height = 24;

      // rodapé
      const notas = [];
      if(cfg.rodape) notas.push(cfg.rodape);
      notas.push("Exportado em " + new Date().toLocaleString("pt-BR") + " — Painel Tambasa");
      notas.forEach((n, k) => {
        const r = rt + 2 + k;
        ws.mergeCells(r, 1, r, nC);
        const cel = ws.getCell(r, 1);
        cel.value = n;
        cel.font = {name:FONTE, size:9, italic:true, color:{argb:"FF6B7286"}};
        cel.alignment = {vertical:"middle", horizontal:"left", wrapText:true};
        ws.getRow(r).height = n.length > 120 ? 26 : 16;
      });

      // larguras, filtro, congelar, impressão
      maxLen.forEach((m, i) => { ws.getColumn(i + 1).width = Math.max(colunas[i].tipo === "moeda" ? 16 : 11, Math.min(m + 3, 46)); });
      if(g.linhas.length > 0) ws.autoFilter = {from:{row:HDR, column:1}, to:{row:ult, column:nC}};
      ws.views = [{state:"frozen", ySplit:HDR, showGridLines:false}];
      ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9,
        printTitlesRow:`${HDR}:${HDR}`, margins:{left:0.3, right:0.3, top:0.4, bottom:0.4, header:0.2, footer:0.2}};

      infoAbas.push({focal:g.focal, semFocal:!!g.semFocal, nome, n:g.linhas.length, soma, ini, ult});
    });

    /* ---------------- RESUMO ---------------- */
    const ws = wsResumo;
    const cols = ["FOCAL", "OCORRÊNCIAS"].concat(moedaIdx.map(i => colunas[i].titulo.toUpperCase()));
    const nR = cols.length;
    const faixaR = (r, texto, o) => {
      ws.mergeCells(r, 1, r, nR);
      for(let c = 1; c <= nR; c++) ws.getCell(r, c).fill = preencher(o.fundo);
      const cel = ws.getCell(r, 1);
      cel.value = texto; cel.font = {name:FONTE, size:o.tam, bold:true, color:{argb:"FF" + o.cor}};
      cel.alignment = {vertical:"middle", horizontal:"left", indent:1};
      ws.getRow(r).height = o.altura;
    };
    faixaR(1, cfg.titulo, {fundo:NAVY, cor:"FFFFFF", tam:14, altura:30});
    faixaR(2, "RESUMO POR FOCAL — clique no nome para abrir a aba", {fundo:GOLD, cor:NAVY, tam:11, altura:24});
    ws.mergeCells(3, 1, 3, nR);
    const r3 = ws.getCell(3, 1); r3.value = cfg.filtroTexto || ""; r3.font = {name:FONTE, size:9, italic:true, color:{argb:"FF6B7286"}};
    r3.alignment = {vertical:"middle", horizontal:"left", indent:1};
    ws.getRow(3).height = 20;
    cols.forEach((t, i) => {
      const cel = ws.getCell(4, i + 1);
      cel.value = t; cel.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}}; cel.fill = preencher(NAVY);
      cel.alignment = {vertical:"middle", horizontal:i === 0 ? "left" : (i === 1 ? "center" : "right"), indent:i === 1 ? 0 : 1, wrapText:true};
      cel.border = {bottom:{style:"medium", color:{argb:"FF" + GOLD}}};
    });
    ws.getRow(4).height = 26;
    infoAbas.forEach((a, k) => {
      const r = 5 + k, q = aspas(a.nome), zebra = k % 2 === 1;
      const base = {font:{name:FONTE, size:10, color:{argb:"FF1C2333"}}, border:bordas};
      const c1 = ws.getCell(r, 1);
      c1.value = {text:a.focal, hyperlink:`#${q}!A1`};
      c1.font = {name:FONTE, size:10, bold:true, underline:true, color:{argb:"FF" + (a.semFocal ? VERMELHO : "1F4FA3")}};
      c1.alignment = {vertical:"middle", horizontal:"left", indent:1}; c1.border = bordas;
      const c2 = ws.getCell(r, 2);
      c2.value = {formula:`COUNTA(${q}!A${a.ini}:A${a.ult})`, result:a.n};
      c2.numFmt = "#,##0"; c2.alignment = {vertical:"middle", horizontal:"center"}; c2.font = base.font; c2.border = bordas;
      moedaIdx.forEach((mi, j) => {
        const L = colLetra(mi + 1), cel = ws.getCell(r, 3 + j);
        cel.value = {formula:`SUM(${q}!${L}${a.ini}:${L}${a.ult})`, result:a.soma[mi] || 0};
        cel.numFmt = MOEDA; cel.alignment = {vertical:"middle", horizontal:"right", indent:1}; cel.font = base.font; cel.border = bordas;
      });
      if(zebra) for(let c = 1; c <= nR; c++) ws.getCell(r, c).fill = preencher("F3F5FA");
      ws.getRow(r).height = 22;
    });
    const rt = 5 + infoAbas.length, r1 = 5, r2 = rt - 1;
    for(let c = 1; c <= nR; c++){
      const cel = ws.getCell(rt, c);
      cel.fill = preencher(NAVY); cel.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}};
      cel.border = {top:{style:"medium", color:{argb:"FF" + GOLD}}};
      cel.alignment = {vertical:"middle", horizontal:c === 1 ? "left" : (c === 2 ? "center" : "right"), indent:c === 2 ? 0 : 1};
    }
    ws.getCell(rt, 1).value = "TOTAL GERAL";
    const totN = infoAbas.reduce((s, a) => s + a.n, 0);
    ws.getCell(rt, 2).value = {formula:`SUM(B${r1}:B${r2})`, result:totN}; ws.getCell(rt, 2).numFmt = "#,##0";
    moedaIdx.forEach((mi, j) => {
      const L = colLetra(3 + j), cel = ws.getCell(rt, 3 + j);
      cel.value = {formula:`SUM(${L}${r1}:${L}${r2})`, result:infoAbas.reduce((s, a) => s + (a.soma[mi] || 0), 0)};
      cel.numFmt = MOEDA;
    });
    ws.getRow(rt).height = 24;
    ws.mergeCells(rt + 2, 1, rt + 2, nR);
    const nota = ws.getCell(rt + 2, 1);
    nota.value = (cfg.rodape || "") + (cfg.rodape ? "  " : "") + "Exportado em " + new Date().toLocaleString("pt-BR") + " — Painel Tambasa";
    nota.font = {name:FONTE, size:9, italic:true, color:{argb:"FF6B7286"}};
    nota.alignment = {vertical:"top", horizontal:"left", wrapText:true}; ws.getRow(rt + 2).height = 40;
    [34, 15].concat(moedaIdx.map(() => 22)).forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9};
    wb.views = [{activeTab:0}];
    return wb;
  }

  async function exportarOcorrenciasPorFocal(cfg, nomeArquivo){
    if(typeof ExcelJS === "undefined"){
      alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão com a internet e recarregue a página.");
      return;
    }
    if(!cfg || !cfg.grupos || cfg.grupos.length === 0){ alert("Não há ocorrências para exportar."); return; }
    try{
      const wb = montar(ExcelJS, cfg);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo || "Ocorrencias_por_Focal.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      console.error("Erro ao exportar ocorrências:", err);
      alert("Não foi possível gerar o Excel: " + (err.message || err));
    }
  }

  root.exportarOcorrenciasPorFocal = exportarOcorrenciasPorFocal;
  root.__montarOcorrenciasXlsx = montar;     // usado nos testes
})(typeof window !== "undefined" ? window : globalThis);
