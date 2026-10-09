/* ================= EXPORTAR FATURAMENTO POR UNIDADE (sem considerar pagador) =================
   Agrupa só pela unidade de entrega/destino (a praça do CTRC, 3 siglas) — o pagador NÃO entra
   nessa conta, ao contrário do Fechamento-RECEITA (que é por Focal). Gera um Excel de uma
   aba só, com o total VAL + RVA por unidade, ordenado do maior faturamento para o menor.

   payload = { periodo: "Agosto/2026", unidades: [
     {sigla, cidade, qctrc, freteVal, freteRva, frete, vlrMerc}, ...
   ]}
*/
(function(){
  const FONTE = "Arial";
  const COR = {navy:"0F172A", ouro:"D4A017", zebra:"F1F5F9", texto:"1C2333"};
  const MOEDA = '"R$" #,##0.00';

  const preenche = hex => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF"+hex}});
  const fino = {style:"thin", color:{argb:"FFBFBFBF"}};
  const bordaTudo = {top:fino, bottom:fino, left:fino, right:fino};
  const colLetra = n => { let s = ""; while(n > 0){ const m = (n-1) % 26; s = String.fromCharCode(65+m) + s; n = Math.floor((n-1)/26); } return s; };

  function celula(ws, ref, valor, o){
    o = o || {};
    const c = ws.getCell(ref);
    if(valor !== undefined && valor !== null) c.value = valor;
    c.font = {name:FONTE, size:o.tam || 10, bold:!!o.negrito, italic:!!o.italico, color:{argb:"FF" + (o.cor || COR.texto)}};
    if(o.fundo) c.fill = preenche(o.fundo);
    c.alignment = {vertical:"middle", horizontal:o.alinh || "center", wrapText:!!o.quebra, indent:o.indent || 0};
    if(o.borda) c.border = bordaTudo;
    if(o.fmt) c.numFmt = o.fmt;
    return c;
  }

  // Nome exato de cada unidade (substitui a antiga coluna CIDADE).
  const NOME_UNIDADE = {
    URU:"URUAÇU", GAN:"GOIANÉSIA", ANP:"ANÁPOLIS", ROT:"ROTINHA", RIA:"RIALMA", LZI:"LUZIÂNIA",
    CRT:"CRISTALINA", NIQ:"NIQUELÂNDIA", FEC:"FECHADO", CRI:"CRIXÁS", GNA:"GOIÂNIA", JAR:"JARAGUÁ",
    RUB:"RUBIATABA", STZ:"SANTA TEREZINHA", PIR:"PIRENÓPOLIS", ITA:"ITAPACI", ALE:"ALEXÂNIA",
    AL2:"ALL CARGO", IVC:"INVICTA", EGO:"EXPRESSO GOIÁS", TOP:"TOP LUZ", TNG:"DELPS",
    NWF:"NWF TRANSPORTES", TLC:"LC ENCOMENDAS", RIT:"RÁPIDO IPORÁ TRANSPORTES", CW3:"CW3 TRANSPORTES",
    USE:"USE TRANSPORTES", SPR:"SOUSA PIRES", GYN:"GOIÂNIA", BSB:"BRASÍLIA", SLV:"SALVADOS"
  };
  // Siglas que são somadas dentro de outra (CMG entra junto com CW3).
  const JUNTAR_COM = {CMG:"CW3"};

  function prepararUnidades(lista){
    const mapa = {};
    lista.forEach(u => {
      const sig = String(u.sigla || "").toUpperCase().trim();
      const alvo = JUNTAR_COM[sig] || sig;
      const m = mapa[alvo] || (mapa[alvo] = {sigla:alvo, cidade:"", qctrc:0, freteVal:0, freteRva:0, frete:0, vlrMerc:0});
      m.qctrc += u.qctrc || 0; m.freteVal += u.freteVal || 0; m.freteRva += u.freteRva || 0;
      m.frete += u.frete || 0; m.vlrMerc += u.vlrMerc || 0;
      if(!m.cidade && u.cidade) m.cidade = u.cidade;
    });
    return Object.values(mapa).map(u => ({...u, nome: NOME_UNIDADE[u.sigla] || u.cidade || u.sigla}));
  }

  /* ---------- Abas EXPEDIDORA e GERAL (expedida x recebida) ----------
     expedicao = { periodo, expedidoras:[{sigla,qctrc,freteVal,freteRva,frete,vlrMerc}],
                   receptoras:[mesmo formato] }
     Expedidora = praça que despachou o CTRC (3 primeiras letras da "Praca Expedidora").
     Receptora  = unidade que entregou (já usada na aba FATURAMENTO POR UNIDADE). */
  function nomeAbaLivre(base, usados){
    let nome = base, i = 2;
    while(usados && usados.has(nome.toUpperCase())) nome = base.slice(0, 27) + " (" + i++ + ")";
    if(usados) usados.add(nome.toUpperCase());
    return nome;
  }

  function cabecalhoAba(ws, ultCol, titulo, sub){
    ws.mergeCells(1, 1, 2, ultCol);
    celula(ws, "A1", titulo, {tam:15, negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    for(let c = 1; c <= ultCol; c++){ ws.getCell(1, c).fill = preenche(COR.navy); ws.getCell(2, c).fill = preenche(COR.navy); }
    ws.mergeCells(3, 1, 3, ultCol);
    celula(ws, "A3", sub, {tam:10, cor:"FFFFFF", fundo:COR.ouro, alinh:"left", indent:1});
    for(let c = 1; c <= ultCol; c++) ws.getCell(3, c).fill = preenche(COR.ouro);
  }

  function montarAbaExpedidora(wb, exp, usados){
    const ws = wb.addWorksheet(nomeAbaLivre("EXPEDIDORA", usados), {views:[{showGridLines:false}]});
    const ULT = 9;
    cabecalhoAba(ws, ULT, "FATURAMENTO POR UNIDADE EXPEDIDORA (O QUE CADA UNIDADE EXPEDIU)",
      `${exp.periodo || ""}  •  VAL (Rede Do Valle) + RVA (Real Vale)  •  Coluna "Praça Expedidora" — só as 3 primeiras siglas (ex.: GYNP vira GYN)`);
    const cab = ["SIGLA (EXPEDIDORA)", "UNIDADE", "CTRCs EXPEDIDOS", "FRETE VAL (R$)", "FRETE RVA (R$)", "FRETE TOTAL (R$)", "VLR MERCADORIA (R$)", "FRETE / CTRC (R$)", "% DO TOTAL"];
    cab.forEach((t, i) => celula(ws, colLetra(i + 1) + "5", t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
    ws.getRow(5).height = 30;

    const lista = prepararUnidades(exp.expedidoras || []).sort((a, b) => b.frete - a.frete);
    const ini = 6, fim = ini + lista.length - 1, tot = fim + 1;
    const totalFrete = lista.reduce((s, u) => s + u.frete, 0);
    lista.forEach((u, i) => {
      const r = ini + i, z = i % 2 === 0 ? COR.zebra : null;
      celula(ws, `A${r}`, u.sigla, {negrito:true, fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `B${r}`, u.nome, {fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `C${r}`, u.qctrc, {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `D${r}`, u.freteVal, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `E${r}`, u.freteRva, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `F${r}`, {formula:`D${r}+E${r}`, result:u.frete}, {fundo:z, fmt:MOEDA, negrito:true, borda:true});
      celula(ws, `G${r}`, u.vlrMerc, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `H${r}`, {formula:`IF(C${r}=0,0,F${r}/C${r})`, result:u.qctrc ? u.frete / u.qctrc : 0}, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `I${r}`, {formula:`IF(F$${tot}=0,0,F${r}/F$${tot})`, result:totalFrete ? u.frete / totalFrete : 0}, {fundo:z, fmt:"0.0%", borda:true});
    });
    const S = k => lista.reduce((s, u) => s + u[k], 0);
    const T = {qctrc:S("qctrc"), freteVal:S("freteVal"), freteRva:S("freteRva"), frete:S("frete"), vlrMerc:S("vlrMerc")};
    celula(ws, `A${tot}`, "TOTAL", {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    celula(ws, `B${tot}`, null, {fundo:COR.navy});
    [["C","qctrc","#,##0"],["D","freteVal",MOEDA],["E","freteRva",MOEDA],["F","frete",MOEDA],["G","vlrMerc",MOEDA]].forEach(([L,k,f]) =>
      celula(ws, `${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:T[k]}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:f}));
    celula(ws, `H${tot}`, {formula:`IF(C${tot}=0,0,F${tot}/C${tot})`, result:T.qctrc ? T.frete / T.qctrc : 0}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:MOEDA});
    celula(ws, `I${tot}`, 1, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.0%"});
    ws.getRow(tot).height = 22;
    celula(ws, `A${tot + 2}`, "Cada linha é a unidade que EXPEDIU (despachou) o CTRC — Praça Expedidora, 3 primeiras siglas. O pagador não é considerado.", {tam:9, italico:true, cor:"6B7286", alinh:"left"});
    [18, 30, 14, 16, 16, 17, 20, 16, 12].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:5, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
  }

  function montarAbaGeralExpRec(wb, exp, usados){
    const ws = wb.addWorksheet(nomeAbaLivre("GERAL EXP x REC", usados), {views:[{showGridLines:false}]});
    const ULT = 7;
    cabecalhoAba(ws, ULT, "GERAL POR FILIAL — EXPEDIDA x RECEBIDA",
      `${exp.periodo || ""}  •  VAL + RVA  •  Ordenado do maior para o menor Frete Exp. + Rec.`);
    // Mesmas colunas, na mesma ordem, da tabela "Geral por filial" da tela.
    const cab = ["FILIAL", "CTRCs EXPEDIDOS", "FRETE EXPEDIDO (R$)", "CTRCs RECEBIDOS", "FRETE RECEBIDO (R$)", "FRETE EXP. + REC. (R$)", "% MOVIMENTADO"];
    cab.forEach((t, i) => celula(ws, colLetra(i + 1) + "5", t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
    ws.getRow(5).height = 30;

    const mapa = {};
    const pega = u => mapa[u.sigla] || (mapa[u.sigla] = {sigla:u.sigla, eq:0, ef:0, rq:0, rf:0});
    prepararUnidades(exp.expedidoras || []).forEach(u => { const m = pega(u); m.eq += u.qctrc; m.ef += u.frete; });
    prepararUnidades(exp.receptoras || []).forEach(u => { const m = pega(u); m.rq += u.qctrc; m.rf += u.frete; });
    // Classificação: maior Frete Exp. + Rec. primeiro (empate: ordem alfabética da sigla).
    const lista = Object.values(mapa).map(m => ({...m, tf:m.ef + m.rf}))
      .sort((a, b) => (b.tf - a.tf) || a.sigla.localeCompare(b.sigla));

    const ini = 6, fim = ini + lista.length - 1, tot = fim + 1;
    const totalMov = lista.reduce((s, u) => s + u.tf, 0);
    lista.forEach((u, i) => {
      const r = ini + i, z = i % 2 === 0 ? COR.zebra : null;
      celula(ws, `A${r}`, u.sigla, {negrito:true, fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `B${r}`, u.eq, {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `C${r}`, u.ef, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `D${r}`, u.rq, {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `E${r}`, u.rf, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `F${r}`, {formula:`C${r}+E${r}`, result:u.tf}, {fundo:z, fmt:MOEDA, negrito:true, borda:true});
      celula(ws, `G${r}`, {formula:`IF(F$${tot}=0,0,F${r}/F$${tot})`, result:totalMov ? u.tf / totalMov : 0}, {fundo:z, fmt:"0.0%", borda:true});
    });
    const S = k => lista.reduce((s, u) => s + u[k], 0);
    const T = {eq:S("eq"), ef:S("ef"), rq:S("rq"), rf:S("rf"), tf:S("tf")};
    celula(ws, `A${tot}`, "TOTAL", {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    [["B","eq","#,##0"],["C","ef",MOEDA],["D","rq","#,##0"],["E","rf",MOEDA],["F","tf",MOEDA]].forEach(([L,k,f]) =>
      celula(ws, `${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:T[k]}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:f}));
    celula(ws, `G${tot}`, 1, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.0%"});
    ws.getRow(tot).height = 22;

    ws.mergeCells(tot + 2, 1, tot + 3, ULT);
    celula(ws, `A${tot + 2}`, "Atenção: o mesmo CTRC conta uma vez na unidade expedidora e uma vez na receptora. Por isso o total EXPEDIDO e o total RECEBIDO são o mesmo faturamento da empresa; a coluna FRETE EXP. + REC. mostra quanto cada filial movimentou nas duas pontas (somada, ela conta o faturamento em dobro).", {tam:9, italico:true, cor:"6B7286", alinh:"left", quebra:true});
    [14, 16, 20, 16, 20, 22, 16].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:5, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
  }

  // Adiciona as duas abas (EXPEDIDORA e GERAL EXP x REC) a um workbook já existente.
  // `usados` (opcional) = Set de nomes de aba em maiúsculas, para não repetir nome.
  window.montarAbasExpedicao = function(wb, expedicao, usados){
    if(!expedicao || (!(expedicao.expedidoras || []).length && !(expedicao.receptoras || []).length)) return false;
    // A GERAL (Exp. x Rec.) vem primeiro; a EXPEDIDORA detalhada vem depois.
    montarAbaGeralExpRec(wb, expedicao, usados);
    if((expedicao.expedidoras || []).length) montarAbaExpedidora(wb, expedicao, usados);
    return true;
  };

  window.exportarExpedicaoExcel = async function(payload, nomeArquivo){
    if(typeof ExcelJS === "undefined"){
      alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão com a internet e recarregue a página.");
      return;
    }
    if(!payload || (!(payload.expedidoras || []).length && !(payload.receptoras || []).length)){
      alert("Nada para exportar: importe o Faturamento Geral (VAL e/ou RVA) e marque pelo menos uma filial.");
      return;
    }
    try{
      const wb = new ExcelJS.Workbook();
      wb.creator = "Painel Tambasa"; wb.created = new Date();
      wb.calcProperties = {fullCalcOnLoad:true};
      window.montarAbasExpedicao(wb, payload);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo || "Faturamento_Expedidora_Geral.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      console.error("Erro ao exportar Expedidora/Geral:", err);
      alert("Não foi possível gerar o Excel: " + (err.message || err));
    }
  };

  window.montarWorkbookUnidade = function(ExcelLib, payload){
    const wb = new ExcelLib.Workbook();
    wb.creator = "Painel Tambasa";
    wb.created = new Date();
    wb.calcProperties = {fullCalcOnLoad:true};

    const ws = wb.addWorksheet("FATURAMENTO POR UNIDADE", {views:[{showGridLines:false}]});

    const ULT_COL = 8;
    ws.mergeCells(1, 1, 2, ULT_COL);
    celula(ws, "A1", "FATURAMENTO POR UNIDADE DE ENTREGA (SEM CONSIDERAR PAGADOR)", {tam:15, negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    for(let c = 1; c <= ULT_COL; c++){ ws.getCell(1, c).fill = preenche(COR.navy); ws.getCell(2, c).fill = preenche(COR.navy); }
    ws.mergeCells(3, 1, 3, ULT_COL);
    celula(ws, "A3", `${payload.periodo || ""}  •  VAL (Rede Do Valle) + RVA (Real Vale)  •  Agrupado só pela praça de destino — o pagador não é considerado`, {tam:10, cor:"FFFFFF", fundo:COR.ouro, alinh:"left", indent:1});
    for(let c = 1; c <= ULT_COL; c++) ws.getCell(3, c).fill = preenche(COR.ouro);

    const cab = ["SIGLA (PRAÇA)", "UNIDADE", "CTRCs", "FRETE VAL (R$)", "FRETE RVA (R$)", "FRETE TOTAL (R$)", "VLR MERCADORIA (R$)", "FRETE / CTRC (R$)"];
    cab.forEach((t, i) => celula(ws, colLetra(i + 1) + "5", t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
    ws.getRow(5).height = 30;

    const lista = prepararUnidades(payload.unidades).sort((a, b) => b.frete - a.frete);
    const ini = 6, fim = ini + lista.length - 1, tot = fim + 1;
    lista.forEach((u, i) => {
      const r = ini + i, z = i % 2 === 0 ? COR.zebra : null;
      celula(ws, `A${r}`, u.sigla, {negrito:true, fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `B${r}`, u.nome, {fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `C${r}`, u.qctrc, {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `D${r}`, u.freteVal, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `E${r}`, u.freteRva, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `F${r}`, {formula:`D${r}+E${r}`, result:u.frete}, {fundo:z, fmt:MOEDA, negrito:true, borda:true});
      celula(ws, `G${r}`, u.vlrMerc, {fundo:z, fmt:MOEDA, borda:true});
      celula(ws, `H${r}`, {formula:`IF(C${r}=0,0,F${r}/C${r})`, result:u.qctrc ? u.frete / u.qctrc : 0}, {fundo:z, fmt:MOEDA, borda:true});
    });

    const S = k => lista.reduce((s, u) => s + u[k], 0);
    const T = {qctrc:S("qctrc"), freteVal:S("freteVal"), freteRva:S("freteRva"), frete:S("frete"), vlrMerc:S("vlrMerc")};
    celula(ws, `A${tot}`, "TOTAL", {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    celula(ws, `B${tot}`, null, {fundo:COR.navy});
    [["C","qctrc","#,##0"],["D","freteVal",MOEDA],["E","freteRva",MOEDA],["F","frete",MOEDA],["G","vlrMerc",MOEDA]].forEach(([L,k,f]) =>
      celula(ws, `${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:T[k]}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:f}));
    celula(ws, `H${tot}`, {formula:`IF(C${tot}=0,0,F${tot}/C${tot})`, result:T.qctrc ? T.frete / T.qctrc : 0}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:MOEDA});
    ws.getRow(tot).height = 22;

    celula(ws, `A${tot + 2}`, "Cada linha é uma unidade/praça de entrega (3 siglas). O pagador não é considerado aqui — só quem recebeu a mercadoria.", {tam:9, italico:true, cor:"6B7286", alinh:"left"});
    [16, 30, 11, 16, 16, 17, 20, 16].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:5, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    // também leva as abas EXPEDIDORA e GERAL EXP x REC, quando houver Praça Expedidora importada
    if(payload.expedicao) window.montarAbasExpedicao(wb, payload.expedicao, new Set(["FATURAMENTO POR UNIDADE"]));
    return wb;
  };

  window.exportarUnidadeExcel = async function(payload, nomeArquivo){
    if(typeof ExcelJS === "undefined"){
      alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão com a internet e recarregue a página.");
      return;
    }
    if(!payload || !payload.unidades || !payload.unidades.length){
      alert("Importe o Faturamento Geral (VAL e/ou RVA) antes de exportar.");
      return;
    }
    try{
      const wb = window.montarWorkbookUnidade(ExcelJS, payload);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo || "Faturamento_Por_Unidade.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      console.error("Erro ao exportar Faturamento por Unidade:", err);
      alert("Não foi possível gerar o Excel: " + (err.message || err));
    }
  };
})();
