/* ================= EXPORTAR FECHAMENTO (Excel) =================
   Gera a planilha de fechamento no mesmo modelo da "Dashboard_Performance_SIGLA":

     DASHBOARD   -> painel visual (cartões, gráficos, Top 5) — vem de exportar-dashboard.js
     PRINCIPAL   -> resumo da supervisora (total geral) + um quadro por SAC + quadro do Breno (manual)
     SAC 1, SAC 3, ... -> uma aba por SAC, com as unidades dele (o PRINCIPAL busca o total daqui)
     PERF SIGLA  -> painel geral com TODAS as siglas (VAL + RVA), ordenado por performance
     DASHBOARD RECEITA + RECEITA -> só entram se houver dados na aba Fechamento-RECEITA (payload.receita)

   As fórmulas ficam vivas no Excel (PRINCIPAL puxa das abas, PERF % é calculado, totais somam),
   então se você corrigir um número numa aba SAC, o PRINCIPAL atualiza sozinho.

   Esta função NÃO lê a tela: recebe os dados prontos (montados em app.js) e usa só o ExcelJS.

   payload = {
     supervisora: "CAMILA BORGES",
     fontes: "VAL + RVA",              // texto do subtítulo
     periodo: "Agosto/2026",
     meta: 98,                          // meta de performance (%)
     unidades: [ {sigla,destino,exped,entregue,noPrazoEnt,atrasCli,atrasTrans}, ... ],   // TODAS as siglas
     focais:   [ {titulo:"SAC 1 — Jéssica", linhas:[{sigla,combina,destino,exped,entregue,
                  noPrazoEnt,atrasCli,atrasTrans,semDados}]}, ... ]
   }
*/
(function(){
  const FONTE = "Arial";
  const COR = {
    navy:"0F172A", slate:"1E293B", ouro:"D4A017", zebra:"F1F5F9", verde:"16A34A",
    cinza:"D9D9D9", verdeClaro:"DCFCE7", vermelhoClaro:"FEE2E2", amarelo:"FFF2CC", texto:"1C2333"
  };
  const NOME_PRINCIPAL = "PRINCIPAL";
  const NOME_PERF = "PERF SIGLA";

  const preenche = hex => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF"+hex}});
  const fino = {style:"thin", color:{argb:"FFBFBFBF"}};
  const bordaTudo = {top:fino, bottom:fino, left:fino, right:fino};
  const colLetra = n => { let s = ""; while(n > 0){ const m = (n-1) % 26; s = String.fromCharCode(65+m) + s; n = Math.floor((n-1)/26); } return s; };
  const aspas = nome => "'" + nome.replace(/'/g, "''") + "'";
  const n0 = v => Number(v) || 0;
  // PERF% igual ao relatório SSW: no prazo / (entregue - atraso do cliente)
  const perfCalc = (ent, cli, np) => (ent - cli) === 0 ? 0 : np / (ent - cli);

  function nomeAbaUnico(base, usados){
    let b = String(base || "SAC").replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "SAC";
    let final = b, i = 2;
    while(usados.has(final.toUpperCase())){
      const suf = " (" + i++ + ")";
      final = b.slice(0, 31 - suf.length) + suf;
    }
    usados.add(final.toUpperCase());
    return final;
  }

  function celula(ws, ref, valor, o){
    const c = ws.getCell(ref);
    if(valor !== undefined && valor !== null) c.value = valor;
    o = o || {};
    c.font = {name:FONTE, size:o.tam || 10, bold:!!o.negrito, italic:!!o.italico, color:{argb:"FF"+(o.cor || COR.texto)}};
    if(o.fundo) c.fill = preenche(o.fundo);
    c.alignment = {vertical:"middle", horizontal:o.alinh || "center", wrapText:!!o.quebra, indent:o.indent || 0};
    if(o.borda) c.border = bordaTudo;
    if(o.fmt) c.numFmt = o.fmt;
    return c;
  }

  function mescla(ws, r1, c1, r2, c2){ ws.mergeCells(r1, c1, r2, c2); }

  function formatacaoMeta(ws, faixa, meta){
    const lim = meta / 100;
    ws.addConditionalFormatting({ref:faixa, rules:[
      {type:"cellIs", operator:"greaterThanOrEqual", formulae:[String(lim)], style:{fill:{type:"pattern", pattern:"solid", bgColor:{argb:"FF"+COR.verdeClaro}}}, priority:1},
      {type:"cellIs", operator:"lessThan", formulae:[String(lim)], style:{fill:{type:"pattern", pattern:"solid", bgColor:{argb:"FF"+COR.vermelhoClaro}}}, priority:2}
    ]});
  }

  function faixaTitulo(ws, titulo, subtitulo, ultimaCol){
    mescla(ws, 1, 1, 2, ultimaCol);
    celula(ws, "A1", titulo, {tam:20, negrito:true, cor:"FFFFFF", fundo:COR.navy});
    for(let c = 1; c <= ultimaCol; c++){ ws.getCell(1, c).fill = preenche(COR.navy); ws.getCell(2, c).fill = preenche(COR.navy); }
    mescla(ws, 3, 1, 3, ultimaCol);
    celula(ws, "A3", subtitulo, {tam:11, cor:"FFFFFF", fundo:COR.ouro});
    for(let c = 1; c <= ultimaCol; c++) ws.getCell(3, c).fill = preenche(COR.ouro);
    ws.getRow(1).height = 21.75; ws.getRow(2).height = 21.75; ws.getRow(3).height = 19.5;
  }

  /* ---------------- PERF SIGLA ---------------- */
  function montarPerfSigla(wb, p){
    const ws = wb.addWorksheet(NOME_PERF, {views:[{showGridLines:false}]});
    const lista = [...p.unidades].map(u => ({...u, perf: perfCalc(n0(u.entregue), n0(u.atrasCli), n0(u.noPrazoEnt))}))
      .sort((a, b) => (b.perf - a.perf) || String(a.sigla).localeCompare(String(b.sigla)));

    faixaTitulo(ws, "DASHBOARD DE PERFORMANCE DE ENTREGAS",
      `${p.fontes}  •  ${p.periodo}  •  Consolidado por SIGLA  •  Meta de Performance: ${Number(p.meta).toFixed(1).replace(".", ",")}%`, 9);

    const ini = 9, fim = ini + lista.length - 1, tot = fim + 1;
    const somaCol = k => lista.reduce((s, u) => s + n0(u[k]), 0);
    const tExp = somaCol("exped"), tEnt = somaCol("entregue"), tNp = somaCol("noPrazoEnt"), tCli = somaCol("atrasCli"), tTr = somaCol("atrasTrans");
    const tPerf = perfCalc(tEnt, tCli, tNp);
    const lim = p.meta / 100;
    const naMeta = lista.filter(u => u.perf >= lim).length;

    // KPIs (linhas 5 e 6) — puxam da linha TOTAL
    const kpis = [
      {c:1, rot:"EXPEDIDO (TOTAL)", f:`C${tot}`, r:tExp, fmt:"#,##0", fundo:COR.ouro},
      {c:3, rot:"ENTREGUE (TOTAL)", f:`D${tot}`, r:tEnt, fmt:"#,##0", fundo:COR.ouro},
      {c:5, rot:"PERF% GERAL", f:`H${tot}`, r:tPerf, fmt:"0.0%", fundo: tPerf >= lim ? COR.verde : "DC2626"},
      {c:7, rot:"SIGLAS NA META / ABAIXO", f:`COUNTIF(H${ini}:H${fim},">="&${lim})&" / "&COUNTIF(H${ini}:H${fim},"<"&${lim})`, r:`${naMeta} / ${lista.length - naMeta}`, fmt:"General", fundo:COR.slate}
    ];
    kpis.forEach(k => {
      mescla(ws, 5, k.c, 5, k.c + 1); mescla(ws, 6, k.c, 6, k.c + 1);
      celula(ws, `${colLetra(k.c)}5`, k.rot, {tam:9, negrito:true, cor:"FFFFFF", fundo:COR.slate});
      ws.getCell(5, k.c + 1).fill = preenche(COR.slate);
      celula(ws, `${colLetra(k.c)}6`, {formula:k.f, result:k.r}, {tam:16, negrito:true, cor:"FFFFFF", fundo:k.fundo, fmt:k.fmt});
      ws.getCell(6, k.c + 1).fill = preenche(k.fundo);
    });
    ws.getRow(5).height = 18; ws.getRow(6).height = 27.75;

    const cab = ["SIGLA","UNIDADE","EXPEDIDO","ENTREGUE","NO PRAZO","ATRASO CLIENTE","ATRASO TRANSP","PERF %"];
    cab.forEach((t, i) => celula(ws, `${colLetra(i+1)}8`, t, {negrito:true, cor:"FFFFFF", fundo:COR.navy}));
    ws.getRow(8).height = 27.75;

    lista.forEach((u, i) => {
      const r = ini + i, z = i % 2 === 0 ? COR.zebra : null;
      celula(ws, `A${r}`, u.sigla, {negrito:true, fundo:z, alinh:"left", indent:1});
      celula(ws, `B${r}`, u.destino || "", {fundo:z, alinh:"left", indent:1});
      celula(ws, `C${r}`, n0(u.exped), {fundo:z, fmt:"#,##0"});
      celula(ws, `D${r}`, n0(u.entregue), {fundo:z, fmt:"#,##0"});
      celula(ws, `E${r}`, n0(u.noPrazoEnt), {fundo:z, fmt:"#,##0"});
      celula(ws, `F${r}`, n0(u.atrasCli), {fundo:z, fmt:"#,##0"});
      celula(ws, `G${r}`, n0(u.atrasTrans), {fundo:z, fmt:"#,##0"});
      celula(ws, `H${r}`, {formula:`IF((D${r}-F${r})=0,0,E${r}/(D${r}-F${r}))`, result:u.perf}, {negrito:true, fundo:z, fmt:"0.0%"});
    });

    celula(ws, `A${tot}`, "TOTAL", {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    celula(ws, `B${tot}`, null, {fundo:COR.navy});
    [["C","exped",tExp],["D","entregue",tEnt],["E","noPrazoEnt",tNp],["F","atrasCli",tCli],["G","atrasTrans",tTr]].forEach(([L,,v]) =>
      celula(ws, `${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:v}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"#,##0"}));
    celula(ws, `H${tot}`, {formula:`IF((D${tot}-F${tot})=0,0,E${tot}/(D${tot}-F${tot}))`, result:tPerf}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.0%"});
    ws.getRow(tot).height = 22;

    formatacaoMeta(ws, `H${ini}:H${fim}`, p.meta);
    celula(ws, `A${tot + 2}`, "PERF % = No Prazo ÷ (Entregue − Atraso Cliente), igual ao relatório SSW. Verde = dentro da meta; vermelho = abaixo.",
      {tam:9, italico:true, cor:"6B7286", alinh:"left"});

    [8, 30, 12, 12, 12, 17, 16, 11, 4].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:8, showGridLines:false}];
    ws.pageSetup = {orientation:"portrait", fitToPage:true, fitToWidth:1, fitToHeight:0};
    return {tot, tExp, tEnt, tNp, tCli, tTr, tPerf, lista, ini, fim};
  }

  /* ---------------- aba de um SAC ---------------- */
  function montarAbaSac(wb, p, focal, nomeAba){
    const ws = wb.addWorksheet(nomeAba, {views:[{showGridLines:false}]});
    const comDados = focal.linhas.filter(l => !l.semDados);
    const semDados = focal.linhas.filter(l => l.semDados).map(l => l.sigla);

    faixaTitulo(ws, focal.titulo.toUpperCase(), `${p.fontes}  •  ${p.periodo}  •  Meta de Performance: ${Number(p.meta).toFixed(1).replace(".", ",")}%`, 8);

    const cab = ["SIGLA","UNIDADE","ENTREGUE","NO PRAZO","ATRASO CLIENTE","ATRASO TRANSP","SLA","EXPEDIDO"];
    cab.forEach((t, i) => celula(ws, `${colLetra(i+1)}5`, t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
    ws.getRow(5).height = 27.75;

    const ini = 6, fim = ini + comDados.length - 1, tot = fim + 1;
    comDados.forEach((l, i) => {
      const r = ini + i, z = i % 2 === 0 ? COR.zebra : null;
      const rotulo = l.combina && l.combina.length ? `${l.sigla} (${l.combina.join("+")})` : l.sigla;
      const sla = perfCalc(n0(l.entregue), n0(l.atrasCli), n0(l.noPrazoEnt));
      celula(ws, `A${r}`, rotulo, {negrito:true, fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `B${r}`, l.destino || "", {fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `C${r}`, n0(l.entregue), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `D${r}`, n0(l.noPrazoEnt), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `E${r}`, n0(l.atrasCli), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `F${r}`, n0(l.atrasTrans), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `G${r}`, {formula:`IF((C${r}-E${r})=0,0,D${r}/(C${r}-E${r}))`, result:sla}, {negrito:true, fundo:z, fmt:"0.00%", borda:true});
      celula(ws, `H${r}`, n0(l.exped), {fundo:z, fmt:"#,##0", borda:true});
    });

    const soma = k => comDados.reduce((s, l) => s + n0(l[k]), 0);
    const t = {ent:soma("entregue"), np:soma("noPrazoEnt"), cli:soma("atrasCli"), tr:soma("atrasTrans"), exp:soma("exped")};
    t.sla = perfCalc(t.ent, t.cli, t.np);
    celula(ws, `A${tot}`, `TOTAL ${focal.titulo.split("—")[0].trim().toUpperCase()}`, {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    mescla(ws, tot, 1, tot, 2); ws.getCell(tot, 2).fill = preenche(COR.navy);
    [["C",t.ent],["D",t.np],["E",t.cli],["F",t.tr],["H",t.exp]].forEach(([L, v]) =>
      celula(ws, `${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:v}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"#,##0"}));
    celula(ws, `G${tot}`, {formula:`IF((C${tot}-E${tot})=0,0,D${tot}/(C${tot}-E${tot}))`, result:t.sla}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.00%"});
    ws.getRow(tot).height = 22;

    formatacaoMeta(ws, `G${ini}:G${fim}`, p.meta);
    let nota = tot + 2;
    if(semDados.length){
      celula(ws, `A${nota}`, `Sem dados no período: ${semDados.join(", ")}.`, {tam:9, italico:true, cor:"6B7286", alinh:"left"});
      nota++;
    }
    celula(ws, `A${nota}`, "SLA = No Prazo ÷ (Entregue − Atraso Cliente). Siglas do mesmo grupo aparecem somadas numa linha só.", {tam:9, italico:true, cor:"6B7286", alinh:"left"});

    [16, 34, 11, 11, 13, 13, 11, 11].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:5, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    return {tot, t};
  }

  /* ---------------- PRINCIPAL ---------------- */
  function montarPrincipal(wb, p, perf, sacs){
    const ws = wb.addWorksheet(NOME_PRINCIPAL, {views:[{showGridLines:false}]});
    mescla(ws, 1, 1, 1, 15);
    celula(ws, "A1", "RESUMO COMPLETO - EQUIPE SAC", {tam:16, negrito:true});
    ws.getRow(1).height = 24;
    mescla(ws, 3, 6, 3, 12);
    celula(ws, "F3", `SUPERVISORA SAC - ${p.supervisora}`, {tam:16, negrito:true});
    ws.getRow(3).height = 24;
    celula(ws, "A3", `${p.fontes} • ${p.periodo}`, {tam:10, italico:true, cor:"6B7286", alinh:"left"});

    // Total geral (puxa da aba PERF SIGLA)
    const q = aspas(NOME_PERF), T = perf.tot;
    const cab1 = ["EXPEDIDO","Entregue","No Prazo","Fora Do Prazo","Atraso Cliente","Atraso Transportador","SLA"];
    cab1.forEach((t, i) => celula(ws, `${colLetra(5 + i)}4`, t, {negrito:true, fundo:COR.cinza, borda:true, quebra:true}));
    ws.getRow(4).height = 38.25;
    const fora = perf.tCli + perf.tTr, slaG = perfCalc(perf.tEnt, perf.tCli, perf.tNp);
    const g = (ref, f, r, o) => celula(ws, ref, {formula:f, result:r}, Object.assign({borda:true, fmt:"#,##0", tam:11}, o));
    g("E5", `${q}!C${T}`, perf.tExp, {negrito:true, tam:12});
    g("F5", `${q}!D${T}`, perf.tEnt);
    g("G5", `${q}!E${T}`, perf.tNp);
    g("H5", `I5+J5`, fora);
    g("I5", `${q}!F${T}`, perf.tCli);
    g("J5", `${q}!G${T}`, perf.tTr);
    g("K5", `IF((F5-I5)=0,0,G5/(F5-I5))`, slaG, {tam:16, negrito:true, fmt:"0.00%"});
    ws.getRow(5).height = 24;
    formatacaoMeta(ws, "K5", p.meta);

    // Quadros por SAC (2 por linha, 4 linhas de altura cada)
    const inicio = 7;
    const cabSac = ["Entregue","No Prazo","Atraso Cliente","Atraso Transportador","SLA","VALOR"];
    sacs.forEach((s, i) => {
      const linha = inicio + Math.floor(i / 2) * 4;
      const c0 = i % 2 === 0 ? 1 : 8;           // A ou H
      const L = n => colLetra(c0 + n);
      mescla(ws, linha, c0, linha + 1, c0);
      celula(ws, `${L(0)}${linha}`, s.rotulo, {tam:11, negrito:true, quebra:true});
      cabSac.forEach((t, k) => celula(ws, `${L(k + 1)}${linha}`, t, {negrito:true, fundo:COR.cinza, borda:true, quebra:true}));
      ws.getRow(linha).height = 38.25;
      const r = linha + 1, aba = aspas(s.aba), T2 = s.tot;
      const v = (n, f, res) => celula(ws, `${L(n)}${r}`, {formula:f, result:res}, {borda:true, fmt:"#,##0", tam:11});
      v(1, `${aba}!C${T2}`, s.t.ent);
      v(2, `${aba}!D${T2}`, s.t.np);
      v(3, `${aba}!E${T2}`, s.t.cli);
      v(4, `${aba}!F${T2}`, s.t.tr);
      celula(ws, `${L(5)}${r}`, {formula:`IF((${L(1)}${r}-${L(3)}${r})=0,0,${L(2)}${r}/(${L(1)}${r}-${L(3)}${r}))`, result:s.t.sla},
        {borda:true, negrito:true, tam:14, fmt:"0.00%"});
      celula(ws, `${L(6)}${r}`, null, {borda:true, tam:11});
      ws.getRow(r).height = 26;
      formatacaoMeta(ws, `${L(5)}${r}`, p.meta);
    });

    // Quadro do Breno (preenchimento manual)
    const linhasSac = Math.ceil(sacs.length / 2);
    const b0 = inicio + linhasSac * 4 + 1;
    const ocor = ["FALTAS","PENDENCIA SOLUCIONADA","AVARIAS","ESTRAVIOS"];
    mescla(ws, b0, 6, b0 + ocor.length + 1, 6);
    celula(ws, `F${b0}`, "BRENO - FILMAGENS", {tam:11, negrito:true, quebra:true});
    ["OCORRÊNCIA","QTD NFs","VALOR TOTAL R$","% DO TOTAL","VALOR"].forEach((t, k) =>
      celula(ws, `${colLetra(7 + k)}${b0}`, t, {negrito:true, fundo:COR.cinza, borda:true, quebra:true}));
    ws.getRow(b0).height = 30;
    const bTot = b0 + ocor.length + 1;
    ocor.forEach((nome, k) => {
      const r = b0 + 1 + k;
      celula(ws, `G${r}`, nome, {negrito:true, borda:true, alinh:"left", indent:1});
      celula(ws, `H${r}`, null, {borda:true, fundo:COR.amarelo, fmt:"#,##0"});
      celula(ws, `I${r}`, null, {borda:true, fundo:COR.amarelo, fmt:'"R$" #,##0.00'});
      celula(ws, `J${r}`, {formula:`IF(N($I$${bTot})=0,"",I${r}/$I$${bTot})`, result:""}, {borda:true, fmt:"0.0%"});
      celula(ws, `K${r}`, null, {borda:true});
    });
    celula(ws, `G${bTot}`, "TOTAL GERAL", {negrito:true, fundo:COR.cinza, borda:true, alinh:"left", indent:1});
    celula(ws, `H${bTot}`, {formula:`SUM(H${b0 + 1}:H${bTot - 1})`, result:0}, {negrito:true, fundo:COR.cinza, borda:true, fmt:"#,##0"});
    celula(ws, `I${bTot}`, {formula:`SUM(I${b0 + 1}:I${bTot - 1})`, result:0}, {negrito:true, fundo:COR.cinza, borda:true, fmt:'"R$" #,##0.00'});
    celula(ws, `J${bTot}`, null, {fundo:COR.cinza, borda:true});
    celula(ws, `K${bTot}`, null, {fundo:COR.cinza, borda:true});
    celula(ws, `G${bTot + 2}`, "Células amarelas: preencher à mão (QTD de NFs e valor por ocorrência). Total e % calculam sozinhos. A coluna VALOR fica livre, como no modelo.",
      {tam:9, italico:true, cor:"6B7286", alinh:"left"});

    [22, 13, 13, 13, 13, 13, 24, 22, 13, 13, 13, 13, 13, 13, 4].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
  }

  /* ---------------- montagem geral ---------------- */
  window.montarWorkbookFechamento = function(ExcelLib, p){
    const wb = new ExcelLib.Workbook();
    wb.creator = "Painel Tambasa";
    wb.created = new Date();
    wb.calcProperties = {fullCalcOnLoad:true};

    const usados = new Set([NOME_PRINCIPAL.toUpperCase(), NOME_PERF.toUpperCase(), "DASHBOARD", "DASHBOARD RECEITA", "RECEITA"]);
    const focais = (p.focais || []).filter(f => f.linhas.some(l => !l.semDados));

    // abas de DASHBOARD (exportar-dashboard.js) ficam na frente; são criadas vazias aqui
    // (para garantir a ordem) e preenchidas no fim, quando os totais das outras abas já existem.
    const DX = window.DashboardXL;
    const wsDash = DX ? DX.criarAbaDashboard(wb, "DASHBOARD") : null;
    const comReceita = !!(DX && DX.temReceita(p.receita));
    const wsDashRec = comReceita ? DX.criarAbaDashboard(wb, "DASHBOARD RECEITA") : null;

    // a ordem das abas no arquivo: PRINCIPAL, SACs, PERF SIGLA. As abas são criadas
    // na ordem certa; os valores do PRINCIPAL dependem dos totais das demais,
    // então calculamos tudo antes e só escrevemos o PRINCIPAL primeiro.

    // 1) descobre a linha de TOTAL / valores de cada aba, sem escrever ainda
    const qtdSiglas = p.unidades.length;
    const perfPrevio = {tot: 9 + qtdSiglas};
    const soma = k => p.unidades.reduce((s, u) => s + n0(u[k]), 0);
    perfPrevio.tExp = soma("exped"); perfPrevio.tEnt = soma("entregue"); perfPrevio.tNp = soma("noPrazoEnt");
    perfPrevio.tCli = soma("atrasCli"); perfPrevio.tTr = soma("atrasTrans");

    const sacsInfo = focais.map(f => {
      const com = f.linhas.filter(l => !l.semDados);
      const s = k => com.reduce((a, l) => a + n0(l[k]), 0);
      const t = {ent:s("entregue"), np:s("noPrazoEnt"), cli:s("atrasCli"), tr:s("atrasTrans"), exp:s("exped")};
      t.sla = perfCalc(t.ent, t.cli, t.np);
      return {
        rotulo: f.titulo.replace(/\s*—\s*/g, " - ").toUpperCase(),
        aba: nomeAbaUnico(f.titulo.split("—")[0].trim(), usados),
        tot: 6 + com.length, t, focal: f
      };
    });

    // 2) escreve na ordem: PRINCIPAL -> SACs -> PERF SIGLA
    montarPrincipal(wb, p, perfPrevio, sacsInfo);
    sacsInfo.forEach(s => montarAbaSac(wb, p, s.focal, s.aba));
    const perfRes = montarPerfSigla(wb, p);
    if(wsDash) DX.montarPerformance(wb, wsDash, p, {nomePerf:NOME_PERF, perf:perfRes, sacs:sacsInfo});
    if(comReceita){
      const dados = DX.montarReceitaDados(wb, p.receita, p);
      DX.montarReceita(wb, wsDashRec, p.receita, dados, p);
    }
    wb.views = [{activeTab:0}];
    return wb;
  };

  window.exportarFechamento = async function(payload, nomeArquivo){
    if(typeof ExcelJS === "undefined"){
      alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão com a internet e recarregue a página.");
      return;
    }
    if(!payload || !payload.unidades || payload.unidades.length === 0){
      alert("Importe a Performance Geral (VAL e/ou RVA) antes de exportar o fechamento.");
      return;
    }
    try{
      const wb = window.montarWorkbookFechamento(ExcelJS, payload);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo || "Fechamento_SAC.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      console.error("Erro ao exportar fechamento:", err);
      alert("Não foi possível gerar o fechamento: " + (err.message || err));
    }
  };
})();
