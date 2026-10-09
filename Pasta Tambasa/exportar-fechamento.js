/* ================= EXPORTAR FECHAMENTO (Excel) =================
   Gera a planilha de fechamento no mesmo modelo da "Dashboard_Performance_SIGLA":

     DASHBOARD   -> painel visual (cartões, gráficos, Top 5) — vem de exportar-dashboard.js
     PRINCIPAL   -> resumo da supervisora (total geral) + um quadro por SAC + quadro do Breno (por tipo de ocorrência)
     BRENO       -> aba do Breno: resumo por tipo (qtd e valor) + lista das NFs filmadas (só se houver planilha importada)
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
  const MOEDA = '"R$" #,##0.00';
  const fmtR = v => "R$ " + n0(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
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

  /* ---------------- SAC com empresa pagadora ----------------
     Cada aba de SAC que tem empresa pagadora (grupo paga para nós) fica com TRÊS tabelas:
       1) UNIDADES   — mercadoria saindo do Do Valle para o grupo (Do Valle paga), uma linha por unidade
       2) PAGADORAS  — o grupo como pagador: UMA linha por empresa pagadora (sem abrir por filial)
       3) GERAL      — unidades + pagadoras somadas numa linha só
     Nada disso muda o PRINCIPAL (ele continua puxando só o TOTAL/GERAL de cada aba).
     As linhas são calculadas aqui ANTES de escrever, porque o PRINCIPAL precisa saber em
     qual linha está o GERAL de cada SAC. */
  const NCOL = 9;   // A..I (I = faturamento/frete da unidade ou da pagadora)

  function somaLinhas(linhas){
    const s = k => linhas.reduce((a, l) => a + n0(l[k]), 0);
    const t = {ent:s("entregue"), np:s("noPrazoEnt"), cli:s("atrasCli"), tr:s("atrasTrans"), exp:s("exped"), fat:s("frete")};
    t.sla = perfCalc(t.ent, t.cli, t.np);
    return t;
  }

  // Tabela 2: uma linha por EMPRESA pagadora (soma de todas as unidades de entrega dela).
  function layoutPremium(focal, totNormal){
    const prem = focal.premium;
    if(!prem || !prem.clientes || prem.clientes.length === 0) return null;
    const porLinha = prem.clientes.map(c => {
      const s = k => c.linhas.reduce((a, l) => a + n0(l[k]), 0);
      return {sigla:c.grupo || c.sigla, pagador:c.pagador, entregue:s("entregue"), noPrazoEnt:s("noPrazoEnt"),
        atrasCli:s("atrasCli"), atrasTrans:s("atrasTrans"), exped:s("exped"), frete:n0(c.frete)};
    });
    // siglas do mesmo grupo (ex.: CMG + CW3) viram UMA linha de pagador
    const linhas = [];
    porLinha.forEach(l => {
      const ja = linhas.find(x => x.sigla === l.sigla);
      if(!ja){ linhas.push(l); return; }
      ["entregue","noPrazoEnt","atrasCli","atrasTrans","exped","frete"].forEach(k => ja[k] += l[k]);
    });
    const r = totNormal + 5;                       // espaço para as notas da tabela de unidades
    const ini = r + 2, fim = ini + linhas.length - 1, tot = fim + 1;
    return {r, ini, fim, tot, linhas, t:somaLinhas(linhas), geralR:tot + 3};
  }

  function somaTotais(lista){
    const t = {ent:0, np:0, cli:0, tr:0, exp:0, fat:0};
    lista.forEach(x => { t.ent += x.ent; t.np += x.np; t.cli += x.cli; t.tr += x.tr; t.exp += x.exp; t.fat += n0(x.fat); });
    t.sla = perfCalc(t.ent, t.cli, t.np);
    return t;
  }

  // Tabela 3: GERAL do SAC = unidades + pagadoras, tudo somado com fórmulas.
  function montarBlocoGeral(ws, p, nomeSac, bl, totNormal, tNormal){
    const r = bl.geralR, T = r + 2;
    const refs = [totNormal, bl.tot];
    const t = somaTotais([tNormal, bl.t]);
    mescla(ws, r, 1, r, NCOL);
    celula(ws, `A${r}`, `GERAL ${nomeSac}  (unidades + pagadoras)`, {tam:11, negrito:true, cor:"FFFFFF", fundo:COR.verde, alinh:"left", indent:1});
    for(let c = 1; c <= NCOL; c++) ws.getCell(r, c).fill = preenche(COR.verde);
    ws.getRow(r).height = 20;
    ["SAC","","ENTREGUE","NO PRAZO","ATRASO CLIENTE","ATRASO TRANSP","SLA","EXPEDIDO","FATURAMENTO (FRETE)"].forEach((tx, i) =>
      celula(ws, `${colLetra(i+1)}${r+1}`, tx, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
    ws.getRow(r+1).height = 27.75;
    celula(ws, `A${T}`, `GERAL ${nomeSac}`, {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    celula(ws, `B${T}`, null, {fundo:COR.navy});
    [["C","ent"],["D","np"],["E","cli"],["F","tr"],["H","exp"]].forEach(([L,k]) =>
      celula(ws, `${L}${T}`, {formula:refs.map(x => `${L}${x}`).join("+"), result:t[k]}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"#,##0"}));
    celula(ws, `G${T}`, {formula:`IF((C${T}-E${T})=0,0,D${T}/(C${T}-E${T}))`, result:t.sla}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.00%"});
    celula(ws, `I${T}`, {formula:refs.map(x => `I${x}`).join("+"), result:t.fat}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:MOEDA});
    ws.getRow(T).height = 22;
    formatacaoMeta(ws, `G${T}`, p.meta);
    return {tot:T, t};
  }

  // Tabela 2: o grupo como pagador — uma linha por empresa (ex.: ALL CARGO), sem filiais.
  function montarBlocoPagadoras(ws, p, nomeSac, bl){
    mescla(ws, bl.r, 1, bl.r, NCOL);
    celula(ws, `A${bl.r}`, `PAGADORAS — GRUPO PAGA PARA NÓS  (${nomeSac})`, {tam:11, negrito:true, cor:"FFFFFF", fundo:COR.slate, alinh:"left", indent:1});
    for(let c = 1; c <= NCOL; c++) ws.getCell(bl.r, c).fill = preenche(COR.slate);
    ws.getRow(bl.r).height = 20;

    ["SIGLA","PAGADOR","ENTREGUE","NO PRAZO","ATRASO CLIENTE","ATRASO TRANSP","SLA","EXPEDIDO","FATURAMENTO (FRETE)"].forEach((t, i) =>
      celula(ws, `${colLetra(i+1)}${bl.r + 1}`, t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
    ws.getRow(bl.r + 1).height = 27.75;

    bl.linhas.forEach((l, i) => {
      const r = bl.ini + i, z = i % 2 === 0 ? COR.zebra : null;
      const sla = perfCalc(n0(l.entregue), n0(l.atrasCli), n0(l.noPrazoEnt));
      celula(ws, `A${r}`, l.sigla, {negrito:true, fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `B${r}`, (l.pagador || "").toUpperCase(), {fundo:z, alinh:"left", indent:1, borda:true});
      celula(ws, `C${r}`, n0(l.entregue), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `D${r}`, n0(l.noPrazoEnt), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `E${r}`, n0(l.atrasCli), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `F${r}`, n0(l.atrasTrans), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `G${r}`, {formula:`IF((C${r}-E${r})=0,0,D${r}/(C${r}-E${r}))`, result:sla}, {negrito:true, fundo:z, fmt:"0.00%", borda:true});
      celula(ws, `H${r}`, n0(l.exped), {fundo:z, fmt:"#,##0", borda:true});
      celula(ws, `I${r}`, n0(l.frete), {fundo:z, fmt:MOEDA, borda:true});
    });

    const t = bl.t, T = bl.tot;
    celula(ws, `A${T}`, "TOTAL PAGADORAS", {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
    mescla(ws, T, 1, T, 2); ws.getCell(T, 2).fill = preenche(COR.navy);
    [["C",t.ent],["D",t.np],["E",t.cli],["F",t.tr],["H",t.exp]].forEach(([L, v]) =>
      celula(ws, `${L}${T}`, {formula:`SUM(${L}${bl.ini}:${L}${bl.fim})`, result:v}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"#,##0"}));
    celula(ws, `G${T}`, {formula:`IF((C${T}-E${T})=0,0,D${T}/(C${T}-E${T}))`, result:t.sla}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.00%"});
    celula(ws, `I${T}`, {formula:`SUM(I${bl.ini}:I${bl.fim})`, result:t.fat}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:MOEDA});
    ws.getRow(T).height = 22;
    formatacaoMeta(ws, `G${bl.ini}:G${bl.fim}`, p.meta);
  }

  /* ---------------- aba de um SAC ---------------- */
  function linhasUnidadesSac(focal, temPagadora){
    const comDados = focal.linhas.filter(l => !l.semDados);
    if(comDados.length || !temPagadora) return {linhas:comDados, vazia:false};
    // SAC com pagadora mas sem unidade importada: mantém a tabela 1 (zerada) para o SAC ter as 3 tabelas
    return {linhas:[{sigla:"—", destino:"Sem unidades com dados neste SAC"}], vazia:true};
  }

  function montarAbaSac(wb, p, focal, nomeAba, bl){
    const ws = wb.addWorksheet(nomeAba, {views:[{showGridLines:false}]});
    const un = linhasUnidadesSac(focal, !!bl);
    const comDados = un.linhas;
    const semDados = focal.linhas.filter(l => l.semDados).map(l => l.sigla);
    const nomeCurto = focal.titulo.split("—")[0].trim().toUpperCase();

    faixaTitulo(ws, focal.titulo.toUpperCase(), `${p.fontes}  •  ${p.periodo}  •  Meta de Performance: ${Number(p.meta).toFixed(1).replace(".", ",")}%`, NCOL);

    // faturamento que este focal trouxe (vem da Fechamento-RECEITA) — linha 4, logo abaixo do título
    const fat = focal.faturamento;
    if(fat && fat.temDados){
      const pctTxt = p.faturamentoTotal > 0 ? `  •  ${(fat.total / p.faturamentoTotal * 100).toFixed(1).replace(".", ",")}% do faturamento total` : "";
      mescla(ws, 4, 1, 4, 2);
      celula(ws, "A4", "FATURAMENTO PELO FOCAL", {negrito:true, cor:"FFFFFF", fundo:COR.slate, alinh:"left", indent:1});
      ws.getCell(4, 2).fill = preenche(COR.slate);
      mescla(ws, 4, 3, 4, 4);
      celula(ws, "C4", fat.total, {negrito:true, tam:12, fundo:COR.amarelo, fmt:MOEDA, borda:true});
      ws.getCell(4, 4).fill = preenche(COR.amarelo);
      mescla(ws, 4, 5, 4, NCOL);
      celula(ws, "E4", pctTxt.replace(/^\s*•\s*/, ""), {tam:9, italico:true, cor:"6B7286", alinh:"left", indent:1});
      ws.getRow(4).height = 22;
    }

    let tot = null, t = null;
    if(comDados.length){
      const cab = ["SIGLA","UNIDADE","ENTREGUE","NO PRAZO","ATRASO CLIENTE","ATRASO TRANSP","SLA","EXPEDIDO","FATURAMENTO DA UNIDADE (FRETE)"];
      cab.forEach((tx, i) => celula(ws, `${colLetra(i+1)}5`, tx, {negrito:true, cor:"FFFFFF", fundo:COR.navy, quebra:true}));
      ws.getRow(5).height = 40;

      const ini = 6, fim = ini + comDados.length - 1;
      tot = fim + 1;
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
        celula(ws, `I${r}`, n0(l.frete), {fundo:z, fmt:MOEDA, borda:true});
      });

      t = somaLinhas(comDados);
      celula(ws, `A${tot}`, `TOTAL ${nomeCurto}`, {negrito:true, cor:"FFFFFF", fundo:COR.navy, alinh:"left", indent:1});
      mescla(ws, tot, 1, tot, 2); ws.getCell(tot, 2).fill = preenche(COR.navy);
      [["C",t.ent],["D",t.np],["E",t.cli],["F",t.tr],["H",t.exp]].forEach(([L, v]) =>
        celula(ws, `${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:v}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"#,##0"}));
      celula(ws, `G${tot}`, {formula:`IF((C${tot}-E${tot})=0,0,D${tot}/(C${tot}-E${tot}))`, result:t.sla}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:"0.00%"});
      celula(ws, `I${tot}`, {formula:`SUM(I${ini}:I${fim})`, result:t.fat}, {negrito:true, cor:"FFFFFF", fundo:COR.navy, fmt:MOEDA});
      ws.getRow(tot).height = 22;

      if(!un.vazia) formatacaoMeta(ws, `G${ini}:G${fim}`, p.meta);
      let nota = tot + 2;
      if(semDados.length && !un.vazia){
        celula(ws, `A${nota}`, `Sem dados no período: ${semDados.join(", ")}.`, {tam:9, italico:true, cor:"6B7286", alinh:"left"});
        nota++;
      }
      celula(ws, `A${nota}`, "SLA = No Prazo ÷ (Entregue − Atraso Cliente). Siglas do mesmo grupo aparecem somadas numa linha só. Faturamento = frete que a unidade faturou (Fechamento-RECEITA).", {tam:9, italico:true, cor:"6B7286", alinh:"left"});
    }

    let geral = null;
    if(bl){
      montarBlocoPagadoras(ws, p, nomeCurto, bl);
      geral = montarBlocoGeral(ws, p, nomeCurto, bl, tot, t);
      celula(ws, `A${geral.tot + 2}`, "Tabela 1 = mercadoria saindo do Do Valle para o grupo (Do Valle paga). Tabela 2 = grupo como pagador (empresa paga para nós), uma linha por empresa. GERAL = tabela 1 + tabela 2.",
        {tam:9, italico:true, cor:"6B7286", alinh:"left"});
    }

    [16, 34, 11, 11, 13, 13, 11, 11, 20].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:comDados.length ? 5 : 3, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    return {tot:geral ? geral.tot : tot, t:geral ? geral.t : t};
  }


  /* ---------------- BRENO (filmagens) ----------------
     O Breno é focal, mas o quadro dele é por TIPO DE OCORRÊNCIA (faltas, avarias, estravios...):
     quantidade de NFs e valor total das NFs. Vem da planilha dele importada na Visão da Operação
     (payload.breno). A aba BRENO guarda o resumo + a lista completa; o PRINCIPAL puxa o resumo daqui. */
  const NOME_BRENO = "BRENO";
  const CATS_BRENO = ["FALTAS","PENDENCIA SOLUCIONADA","AVARIAS","ESTRAVIOS"];
  const semAc = v => String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

  function categoriaBreno(tipo){
    const t = semAc(tipo);
    if(/^FALTA/.test(t)) return "FALTAS";
    if(/PENDENC/.test(t)) return "PENDENCIA SOLUCIONADA";
    if(/AVARIA/.test(t)) return "AVARIAS";
    if(/ESTRAV|EXTRAV/.test(t)) return "ESTRAVIOS";
    return t || "SEM OCORRENCIA";
  }

  function dataBR(iso){
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
  }

  // calcula as linhas de cada aba ANTES de escrever (o PRINCIPAL precisa saber onde está o resumo)
  function layoutBreno(b){
    if(!b || !Array.isArray(b.linhas) || !b.linhas.length) return null;
    const linhas = b.linhas.map(l => Object.assign({}, l, {cat:categoriaBreno(l.tipo), valorNf:n0(l.valorNf)}))
      .sort((a, c) => String(a.data).localeCompare(String(c.data)) || String(a.rota).localeCompare(String(c.rota)) || String(a.nf).localeCompare(String(c.nf)));
    const cats = [...CATS_BRENO];
    linhas.forEach(l => { if(cats.indexOf(l.cat) === -1) cats.push(l.cat); });
    const resumo = cats.map(c => { const x = linhas.filter(l => l.cat === c); return {cat:c, qtd:x.length, valor:x.reduce((s, l) => s + l.valorNf, 0)}; });
    // painel CONFERENTE x OCORRÊNCIA (qtd + valor em R$): só conferentes que aparecem; sem nome vira "(SEM CONFERENTE)"
    const SEM_CONF = "(SEM CONFERENTE)";
    linhas.forEach(l => { l.confTxt = String(l.confNome || l.conf || "").replace(/\s+/g, " ").trim().toUpperCase(); });
    const confs = [...new Set(linhas.map(l => l.confTxt))].sort((a, c) => (a === "") - (c === "") || a.localeCompare(c));
    const painel = [];
    confs.forEach(cf => cats.forEach(ct => {
      const x = linhas.filter(l => l.confTxt === cf && l.cat === ct);
      if(x.length) painel.push({conf:cf, rotulo:cf || SEM_CONF, cat:ct, qtd:x.length, valor:x.reduce((s, l) => s + l.valorNf, 0)});
    }));
    const sumHdr = 5, sumIni = 6, sumFim = sumIni + cats.length - 1, sumTot = sumFim + 1;
    const panFim = sumIni + painel.length;           // última linha do painel (linha de TOTAL)
    const detTit = Math.max(sumTot, panFim) + 3, detHdr = detTit + 1, detIni = detHdr + 1, detFim = detIni + linhas.length - 1;
    return {linhas, cats, resumo, painel, panFim, sumHdr, sumIni, sumFim, sumTot, detTit, detHdr, detIni, detFim,
      qtd:linhas.length, valor:linhas.reduce((s, l) => s + l.valorNf, 0), filtrado:!!b.filtrado};
  }

  function montarAbaBreno(wb, p, L, nome){
    const ws = wb.addWorksheet(nome, {views:[{showGridLines:false}]});
    const NC = 10;
    faixaTitulo(ws, "BRENO — FILMAGENS (CÂMERAS)",
      `${p.fontes}  •  ${p.periodo}  •  ${L.qtd} NFs com ocorrência  •  ${L.filtrado ? "somente o período do fechamento" : "todos os registros importados"}`, NC);

    // ---- resumo por tipo de ocorrência (mesmo quadro da aba PRINCIPAL) ----
    mescla(ws, L.sumHdr - 1, 1, L.sumHdr - 1, 6);
    celula(ws, `A${L.sumHdr - 1}`, "RESUMO POR TIPO DE OCORRÊNCIA", {tam:11, negrito:true, cor:"FFFFFF", fundo:COR.slate, alinh:"left", indent:1});
    for(let c = 1; c <= 6; c++) ws.getCell(L.sumHdr - 1, c).fill = preenche(COR.slate);
    caixa(ws, L.sumHdr, 1, L.sumHdr, 3, "OCORRÊNCIA", {negrito:true, cor:"FFFFFF", fundo:COR.navy, borda:true});
    [["QTD NFs", 4], ["VALOR TOTAL R$", 5], ["% DO TOTAL", 6]].forEach(([t, c]) => celula(ws, `${colLetra(c)}${L.sumHdr}`, t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, borda:true, quebra:true}));
    ws.getRow(L.sumHdr).height = 28;

    const rngCat = `$C$${L.detIni}:$C$${L.detFim}`, rngVal = `$E$${L.detIni}:$E$${L.detFim}`;
    L.resumo.forEach((x, i) => {
      const r = L.sumIni + i, z = i % 2 === 0 ? COR.zebra : null;
      caixa(ws, r, 1, r, 3, x.cat, {negrito:true, fundo:z, borda:true, alinh:"left", indent:1});
      celula(ws, `D${r}`, {formula:`COUNTIF(${rngCat},$A${r})`, result:x.qtd}, {fundo:z, borda:true, fmt:"#,##0"});
      celula(ws, `E${r}`, {formula:`SUMIF(${rngCat},$A${r},${rngVal})`, result:x.valor}, {fundo:z, borda:true, fmt:MOEDA});
      celula(ws, `F${r}`, {formula:`IF($E$${L.sumTot}=0,0,E${r}/$E$${L.sumTot})`, result:L.valor ? x.valor / L.valor : 0}, {fundo:z, borda:true, fmt:"0.0%"});
      ws.getRow(r).height = 20;
    });
    const T = L.sumTot, tot = {negrito:true, cor:"FFFFFF", fundo:COR.navy, borda:true};
    caixa(ws, T, 1, T, 3, "TOTAL GERAL", Object.assign({alinh:"left", indent:1}, tot));
    celula(ws, `D${T}`, {formula:`SUM(D${L.sumIni}:D${L.sumFim})`, result:L.qtd}, Object.assign({fmt:"#,##0"}, tot));
    celula(ws, `E${T}`, {formula:`SUM(E${L.sumIni}:E${L.sumFim})`, result:L.valor}, Object.assign({fmt:MOEDA}, tot));
    celula(ws, `F${T}`, {formula:`SUM(F${L.sumIni}:F${L.sumFim})`, result:L.valor ? 1 : 0}, Object.assign({fmt:"0.0%"}, tot));
    ws.getRow(T).height = 22;
    // ---- painel CONFERENTE x OCORRÊNCIA (ocupa o espaço à direita do resumo, colunas G..J) ----
    mescla(ws, L.sumHdr - 1, 7, L.sumHdr - 1, 10);
    celula(ws, `G${L.sumHdr - 1}`, "CONFERENTE x OCORRÊNCIA", {tam:11, negrito:true, cor:"FFFFFF", fundo:COR.slate, alinh:"left", indent:1});
    for(let c = 7; c <= 10; c++) ws.getCell(L.sumHdr - 1, c).fill = preenche(COR.slate);
    [["CONFERENTE", 7], ["OCORRÊNCIA", 8], ["QTD NFs", 9], ["VALOR DA NF (R$)", 10]].forEach(([t, c]) =>
      celula(ws, `${colLetra(c)}${L.sumHdr}`, t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, borda:true, quebra:true}));
    const rngConf = `$F$${L.detIni}:$F$${L.detFim}`;
    L.painel.forEach((x, i) => {
      const r = L.sumIni + i, z = i % 2 === 0 ? COR.zebra : null;
      const critConf = x.conf ? `"${x.conf.replace(/"/g, '""')}"` : '""';
      celula(ws, `G${r}`, x.rotulo, {fundo:z, borda:true, negrito:true, alinh:"left", indent:1});
      celula(ws, `H${r}`, x.cat, {fundo:z, borda:true, alinh:"left", indent:1});
      celula(ws, `I${r}`, {formula:`COUNTIFS(${rngConf},${critConf},${rngCat},$H${r})`, result:x.qtd}, {fundo:z, borda:true, fmt:"#,##0"});
      celula(ws, `J${r}`, {formula:`SUMIFS(${rngVal},${rngConf},${critConf},${rngCat},$H${r})`, result:x.valor}, {fundo:z, borda:true, fmt:MOEDA});
    });
    const PT = L.sumIni + L.painel.length;
    caixa(ws, PT, 7, PT, 8, "TOTAL", Object.assign({alinh:"left", indent:1}, tot));
    celula(ws, `I${PT}`, {formula:`SUM(I${L.sumIni}:I${Math.max(L.sumIni, PT - 1)})`, result:L.qtd}, Object.assign({fmt:"#,##0"}, tot));
    celula(ws, `J${PT}`, {formula:`SUM(J${L.sumIni}:J${Math.max(L.sumIni, PT - 1)})`, result:L.valor}, Object.assign({fmt:MOEDA}, tot));
    celula(ws, `G${PT + 1}`, "Conferente digitado na coluna CONFERENTE da lista abaixo (opcional).", {tam:9, italico:true, cor:"6B7286", alinh:"left"});

    celula(ws, `A${T + 1}`, "Quantidade e valor calculados pela lista abaixo (coluna TIPO). Se corrigir um tipo ou um valor lá, o resumo e o PRINCIPAL atualizam sozinhos.",
      {tam:9, italico:true, cor:"6B7286", alinh:"left"});

    // ---- lista completa ----
    mescla(ws, L.detTit, 1, L.detTit, NC);
    celula(ws, `A${L.detTit}`, "NOTAS FISCAIS COM OCORRÊNCIA (levantamento das câmeras)", {tam:11, negrito:true, cor:"FFFFFF", fundo:COR.slate, alinh:"left", indent:1});
    for(let c = 1; c <= NC; c++) ws.getCell(L.detTit, c).fill = preenche(COR.slate);
    ws.getRow(L.detTit).height = 20;
    ["DATA","ROTA","TIPO","NF","VALOR DA NF","CONFERENTE","DESTINATÁRIO","PAGADOR","OCORRÊNCIA (TEXTO ORIGINAL)"].forEach((t, i) =>
      celula(ws, `${colLetra(i + 1)}${L.detHdr}`, t, {negrito:true, cor:"FFFFFF", fundo:COR.navy, borda:true, quebra:true}));
    ws.getRow(L.detHdr).height = 28;
    L.linhas.forEach((l, i) => {
      const r = L.detIni + i, z = i % 2 === 0 ? COR.zebra : null;
      celula(ws, `A${r}`, dataBR(l.data), {fundo:z, borda:true});
      celula(ws, `B${r}`, l.rota || "", {fundo:z, borda:true, alinh:"left", indent:1});
      celula(ws, `C${r}`, l.cat, {fundo:z, borda:true, negrito:true, alinh:"left", indent:1});
      celula(ws, `D${r}`, l.nf || "", {fundo:z, borda:true});
      celula(ws, `E${r}`, l.valorNf, {fundo:z, borda:true, fmt:MOEDA});
      celula(ws, `F${r}`, l.confNome || l.conf || "", {fundo:z, borda:true, alinh:"left", indent:1});
      celula(ws, `G${r}`, l.destinatario || "", {fundo:z, borda:true, alinh:"left", indent:1});
      celula(ws, `H${r}`, l.pagador || "", {fundo:z, borda:true, alinh:"left", indent:1});
      celula(ws, `I${r}`, l.ocorrencia || "", {fundo:z, borda:true, alinh:"left", indent:1, tam:9});
    });

    [12, 18, 24, 12, 17, 22, 34, 34, 48, 20].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:3, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    return {nome, T};
  }

  /* ---------------- PRINCIPAL ----------------
     Grade de 15 colunas:  A..G = quadro da esquerda | H = separador | I..O = quadro da direita
       A/I = nome do SAC   B/J = SLA   C/K = Entregue   D/L = No Prazo
       E/M = Atraso Cliente   F/N = Atraso Transportador   G/O = VALOR                        */
  function nomeSac(titulo){
    // SAC 13 é da Keslley (o cadastro antigo salvo no navegador ainda pode vir só como "SAC 13")
    if(/^\s*SAC\s*13\s*$/i.test(titulo)) return "SAC 13 — Keslley";
    return titulo;
  }

  // mescla um intervalo e aplica o mesmo estilo (borda/fundo) em TODAS as células dele
  function caixa(ws, r1, c1, r2, c2, valor, o){
    if(r1 !== r2 || c1 !== c2) mescla(ws, r1, c1, r2, c2);
    for(let r = r1; r <= r2; r++) for(let c = c1; c <= c2; c++){
      const ref = `${colLetra(c)}${r}`;
      celula(ws, ref, (r === r1 && c === c1) ? valor : null, o);
    }
  }

  function montarPrincipal(wb, p, perf, sacs, LB, abaBreno){
    const ws = wb.addWorksheet(NOME_PRINCIPAL, {views:[{showGridLines:false}]});
    const ULT = 15, COL_SEP = 8, COL_DIR = 9;

    [21, 12.5, 12.5, 12.5, 12.5, 15.5, 14.5, 2.5, 21, 12.5, 12.5, 12.5, 12.5, 15.5, 14.5].forEach((w, i) => ws.getColumn(i + 1).width = w);

    // título, período e supervisora: tudo centralizado na largura toda
    caixa(ws, 1, 1, 1, ULT, "RESUMO COMPLETO - EQUIPE SAC", {tam:20, negrito:true});
    ws.getRow(1).height = 32;
    caixa(ws, 2, 1, 2, ULT, `${p.fontes} • ${p.periodo}`, {tam:10, italico:true, cor:"6B7286"});
    caixa(ws, 3, 1, 3, ULT, `SUPERVISORA SAC - ${p.supervisora}`, {tam:20, negrito:true});
    ws.getRow(3).height = 32;

    // ---- Total geral (puxa da aba PERF SIGLA) — mesma grade dos quadros de SAC ----
    const q = aspas(NOME_PERF), T = perf.tot;
    const cab = {tam:10.5, negrito:true, fundo:COR.cinza, borda:true, quebra:true};
    caixa(ws, 4, 1, 5, 1, "TOTAL GERAL", {tam:14, negrito:true, quebra:true});
    ["EXPEDIDO","Entregue","No Prazo","Fora Do Prazo","Atraso Cliente","Atraso Transportador"]
      .forEach((t, i) => celula(ws, `${colLetra(2 + i)}4`, t, cab));
    caixa(ws, 4, COL_DIR, 5, COL_DIR, "RESULTADO", {tam:14, negrito:true, quebra:true});
    caixa(ws, 4, 10, 4, 12, "SLA", cab);
    caixa(ws, 4, 13, 4, 15, "FATURAMENTO TOTAL", cab);
    ws.getRow(4).height = 44;

    const fora = perf.tCli + perf.tTr, slaG = perfCalc(perf.tEnt, perf.tCli, perf.tNp);
    const g = (ref, f, r, o) => celula(ws, ref, {formula:f, result:r}, Object.assign({borda:true, fmt:"#,##0", tam:16, negrito:true}, o));
    g("B5", `${q}!C${T}`, perf.tExp, {tam:18});
    g("C5", `${q}!D${T}`, perf.tEnt);
    g("D5", `${q}!E${T}`, perf.tNp);
    g("E5", `F5+G5`, fora);
    g("F5", `${q}!F${T}`, perf.tCli);
    g("G5", `${q}!G${T}`, perf.tTr);
    caixa(ws, 5, 10, 5, 12, {formula:`IF((C5-F5)=0,0,D5/(C5-F5))`, result:slaG}, {borda:true, negrito:true, tam:26, fmt:"0.00%"});
    caixa(ws, 5, 13, 5, 15, n0(p.faturamentoTotal), {borda:true, negrito:true, tam:20, fmt:MOEDA, fundo:COR.amarelo});
    ws.getRow(5).height = 40;
    ws.getRow(6).height = 22;   // faixa de respiro: separa o total da supervisora dos quadros dos SACs
    formatacaoMeta(ws, "J5:L5", p.meta);

    // ---- Quadros por SAC (2 por linha; entre eles a coluna H fica vazia só para separar) ----
    const inicio = 7;
    const cabSac = ["SLA","Entregue","No Prazo","Atraso Cliente","Atraso Transportador","VALOR"];
    sacs.forEach((s, i) => {
      const linha = inicio + Math.floor(i / 2) * 4;
      const c0 = i % 2 === 0 ? 1 : COL_DIR;
      const L = n => colLetra(c0 + n);
      caixa(ws, linha, c0, linha + 1, c0, s.rotulo, {tam:13, negrito:true, quebra:true});
      cabSac.forEach((t, k) => celula(ws, `${L(k + 1)}${linha}`, t, cab));
      ws.getRow(linha).height = 40;
      const r = linha + 1, aba = aspas(s.aba), T2 = s.tot;
      const v = (n, f, res) => celula(ws, `${L(n)}${r}`, {formula:f, result:res}, {borda:true, fmt:"#,##0", tam:15, negrito:true});
      v(2, `${aba}!C${T2}`, s.t.ent);
      v(3, `${aba}!D${T2}`, s.t.np);
      v(4, `${aba}!E${T2}`, s.t.cli);
      v(5, `${aba}!F${T2}`, s.t.tr);
      celula(ws, `${L(1)}${r}`, {formula:`IF((${L(2)}${r}-${L(4)}${r})=0,0,${L(3)}${r}/(${L(2)}${r}-${L(4)}${r}))`, result:s.t.sla},
        {borda:true, negrito:true, tam:18, fmt:"0.00%"});
      celula(ws, `${L(6)}${r}`, null, {borda:true, tam:11});
      ws.getRow(r).height = 32;
      formatacaoMeta(ws, `${L(1)}${r}`, p.meta);

      // linha extra: faturamento do focal (valor em B..D, % do total em E..G — fecha a largura do quadro)
      const fat = s.focal && s.focal.faturamento, rf = r + 1;
      celula(ws, `${L(0)}${rf}`, "FATURAMENTO PELO FOCAL", {tam:11, negrito:true, quebra:true, fundo:COR.slate, cor:"FFFFFF", borda:true});
      caixa(ws, rf, c0 + 1, rf, c0 + 3, fat && fat.temDados ? fat.total : null,
        {borda:true, negrito:true, tam:15, fmt:MOEDA, fundo:COR.amarelo});
      caixa(ws, rf, c0 + 4, rf, c0 + 6,
        fat && fat.temDados && n0(p.faturamentoTotal) > 0
          ? {formula:`IF(N($M$5)=0,"",${L(1)}${rf}/$M$5)`, result:fat.total / p.faturamentoTotal} : null,
        {borda:true, tam:13, negrito:true, fmt:'0.0%" do total"'});
      ws.getRow(rf).height = 28;
      ws.getRow(rf + 1).height = 12;   // respiro entre uma fileira de quadros e a próxima
    });

    // ---- Quadro do Breno (focal das filmagens), centralizado sob a grade ----
    // Com a planilha dele importada: tipo de ocorrência, quantidade e valor total vêm da aba BRENO.
    // Sem importação: continua o quadro manual (células amarelas).
    const linhasSac = Math.ceil(sacs.length / 2);
    const b0 = inicio + linhasSac * 4 + 1;
    const ocor = LB ? LB.cats : CATS_BRENO;
    const bTot = b0 + ocor.length + 1;
    const qB = LB ? aspas(abaBreno) : null;
    // colunas: C:D nome | E:H ocorrência | I qtd | J valor total | K % | L valor
    caixa(ws, b0, 3, bTot, 4, "BRENO - FILMAGENS", {tam:13, negrito:true, quebra:true});
    caixa(ws, b0, 5, b0, 8, "OCORRÊNCIA", cab);
    [["QTD NFs", 9], ["VALOR TOTAL R$", 10], ["% DO TOTAL", 11], ["VALOR", 12]].forEach(([t, c]) => celula(ws, `${colLetra(c)}${b0}`, t, cab));
    ws.getRow(b0).height = 34;
    ocor.forEach((nome, k) => {
      const r = b0 + 1 + k, x = LB ? LB.resumo[k] : null;
      caixa(ws, r, 5, r, 8, nome, {negrito:true, tam:12, borda:true, alinh:"left", indent:1});
      if(LB){
        const rr = LB.sumIni + k;
        celula(ws, `I${r}`, {formula:`${qB}!D${rr}`, result:x.qtd}, {borda:true, tam:12, negrito:true, fmt:"#,##0"});
        celula(ws, `J${r}`, {formula:`${qB}!E${rr}`, result:x.valor}, {borda:true, tam:12, negrito:true, fmt:MOEDA});
      } else {
        celula(ws, `I${r}`, null, {borda:true, tam:12, fundo:COR.amarelo, fmt:"#,##0"});
        celula(ws, `J${r}`, null, {borda:true, fundo:COR.amarelo, fmt:MOEDA});
      }
      celula(ws, `K${r}`, {formula:`IF(N($J$${bTot})=0,"",J${r}/$J$${bTot})`, result:(LB && LB.valor) ? x.valor / LB.valor : ""}, {borda:true, fmt:"0.0%"});
      celula(ws, `L${r}`, null, {borda:true});
      ws.getRow(r).height = 22;
    });
    const tot = {negrito:true, tam:12, fundo:COR.cinza, borda:true};
    caixa(ws, bTot, 5, bTot, 8, "TOTAL GERAL", Object.assign({alinh:"left", indent:1}, tot));
    celula(ws, `I${bTot}`, {formula:`SUM(I${b0 + 1}:I${bTot - 1})`, result:LB ? LB.qtd : 0}, Object.assign({fmt:"#,##0"}, tot));
    celula(ws, `J${bTot}`, {formula:`SUM(J${b0 + 1}:J${bTot - 1})`, result:LB ? LB.valor : 0}, Object.assign({fmt:MOEDA}, tot));
    celula(ws, `K${bTot}`, null, tot);
    celula(ws, `L${bTot}`, null, tot);
    ws.getRow(bTot).height = 22;
    caixa(ws, bTot + 2, 3, bTot + 2, 12,
      LB ? `Dados do Breno vindos da aba ${abaBreno} (planilha de filmagens importada). Corrigindo a aba ${abaBreno}, este quadro atualiza sozinho. A coluna VALOR fica livre, como no modelo.`
         : "Células amarelas: preencher à mão (QTD de NFs e valor por ocorrência). Total e % calculam sozinhos. A coluna VALOR fica livre, como no modelo.",
      {tam:10, italico:true, cor:"6B7286", quebra:true});
    ws.getRow(bTot + 2).height = 28;

    // imprime SÓ o PRINCIPAL e em UMA folha (tudo ajustado a 1 página de largura x 1 de altura)
    ws.pageSetup = {orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:1,
      margins:{left:0.3, right:0.3, top:0.4, bottom:0.4, header:0.2, footer:0.2}, horizontalCentered:true};
    ws.pageSetup.printArea = `A1:O${bTot + 3}`;
  }

  /* ---------------- montagem geral ---------------- */
  window.montarWorkbookFechamento = function(ExcelLib, p){
    const wb = new ExcelLib.Workbook();
    wb.creator = "Painel Tambasa";
    wb.created = new Date();
    wb.calcProperties = {fullCalcOnLoad:true};

    const usados = new Set([NOME_PRINCIPAL.toUpperCase(), NOME_PERF.toUpperCase(), NOME_BRENO.toUpperCase(), "DASHBOARD", "DASHBOARD RECEITA", "RECEITA"]);
    // um SAC entra no fechamento se tiver dados normais OU clientes premium importados
    // (ex.: SAC 5 = EP Distribuidora + Favorita só tem importação de pagador)
    const temPremium = f => !!(f.premium && f.premium.clientes && f.premium.clientes.length);
    const focais = (p.focais || []).filter(f => f.linhas.some(l => !l.semDados) || temPremium(f));

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

    // cada SAC vira UMA aba; o PRINCIPAL ganha um quadro pelo SAC (tabela normal) e, se houver
    // clientes premium, mais um quadro com o GERAL premium do SAC (ex.: SAC 5 = EP + Favorita).
    const abasSac = [];
    const sacsInfo = [];
    focais.forEach(f => {
      const un = linhasUnidadesSac(f, temPremium(f));
      const aba = nomeAbaUnico(f.titulo.split("—")[0].trim(), usados);
      const totNormal = 6 + un.linhas.length;
      const bl = layoutPremium(f, totNormal);
      const rotulo = nomeSac(f.titulo).replace(/\s*—\s*/g, " - ").toUpperCase();
      abasSac.push({focal:f, aba, blocos:bl});
      // UM quadro por SAC no PRINCIPAL: unidades + pagadoras somados (só números)
      const tNormal = un.linhas.length ? somaLinhas(un.linhas) : null;
      let tot = totNormal, t = tNormal;
      if(bl){
        t = somaTotais([tNormal, bl.t].filter(Boolean));
        tot = bl.geralR + 2;
      }
      if(t) sacsInfo.push({rotulo, aba, tot, t, focal:f});
    });

    // 2) escreve na ordem: PRINCIPAL -> SACs -> PERF SIGLA
    const LB = layoutBreno(p.breno);
    montarPrincipal(wb, p, perfPrevio, sacsInfo, LB, NOME_BRENO);
    abasSac.forEach(s => montarAbaSac(wb, p, s.focal, s.aba, s.blocos));
    if(LB) montarAbaBreno(wb, p, LB, NOME_BRENO);   // aba do Breno logo depois dos SACs
    const perfRes = montarPerfSigla(wb, p);
    if(wsDash) DX.montarPerformance(wb, wsDash, p, {nomePerf:NOME_PERF, perf:perfRes, sacs:sacsInfo});
    if(comReceita){
      const dados = DX.montarReceitaDados(wb, p.receita, p);
      DX.montarReceita(wb, wsDashRec, p.receita, dados, p);
      // abas EXPEDIDORA e GERAL EXP x REC (o que cada unidade expediu / expedida x recebida)
      if(p.receita.expedicao && window.montarAbasExpedicao) window.montarAbasExpedicao(wb, p.receita.expedicao, usados);
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
