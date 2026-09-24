/* ================= DASHBOARD PARA O EXCEL ================= 
   Monta abas de DASHBOARD (fundo escuro, cartões de KPI, gráficos e Top 5) dentro do
   Excel exportado, no estilo dos modelos de dashboard de Excel.

   Como funciona:
   - CARTÕES (KPI) e TABELAS "Top 5" são células de verdade, com FÓRMULAS ligadas às outras
     abas (PERF SIGLA / RECEITA): se você corrigir um número lá, o cartão atualiza.
   - GRÁFICOS (barras e rosca) são desenhados em canvas no navegador e entram como IMAGEM.
     O ExcelJS não cria gráfico nativo, então eles são uma "foto" dos dados no momento da
     exportação (não se atualizam se você editar as células depois).

   Expõe: window.DashboardXL = { criarAbaDashboard, montarPerformance, temReceita,
                                 montarReceitaDados, montarReceita }
   e window.exportarReceitaExcel(payload, nomeArquivo).

   payload da RECEITA = {
     periodo: "Agosto/2026", supervisora: "CAMILA BORGES",
     grupos: [ {titulo:"SAC 1 — Jéssica", unidades:[{sigla, val:{qctrc,qtvol,frete,vlrMerc}|null, rva:{...}|null}]} ]
   }
*/
(function(root){
  const FONTE = "Arial";                                   // fonte das células
  const FC = '"Segoe UI", Arial, Helvetica, sans-serif';    // fonte dos gráficos (canvas)

  // paleta do dashboard (hex sem "#")
  const T = {
    bg:"0B1226", card:"131C38", card2:"1B2649", zebra:"16203F", linha:"2A3A6B",
    txt:"FFFFFF", mudo:"93A3CC", ouro:"D4A017",
    verde:"22C55E", vermelho:"EF4444", azul:"3B82F6", roxo:"8B5CF6",
    ambar:"F59E0B", rosa:"EC4899", ciano:"06B6D4", cinza:"64748B"
  };
  const PALETA = [T.azul, T.roxo, T.verde, T.ambar, T.rosa, T.ciano, T.cinza];

  // grade da planilha: A = margem | B..U = 20 colunas de conteúdo | V = margem
  const N_COLS = 20, COL_PX = 60, MARG_PX = 16, ULT_COL = N_COLS + 2;
  const C0 = 2;                                             // primeira coluna de conteúdo (B)
  const px2pt = px => px * 0.75;                            // altura de linha: pt = px * 0.75

  /* ------------------------- utilidades ------------------------- */
  const n0 = v => Number(v) || 0;
  const nf = (v, d) => Number(v).toLocaleString("pt-BR", {minimumFractionDigits:d||0, maximumFractionDigits:d||0});
  const pct1 = v => nf(v * 100, 1) + "%";
  function moedaCompacta(v){
    v = n0(v);
    if(Math.abs(v) >= 1e6) return "R$ " + nf(v / 1e6, 2) + " mi";
    if(Math.abs(v) >= 1e3) return "R$ " + nf(v / 1e3, 1) + " mil";
    return "R$ " + nf(v, 0);
  }
  const colLetra = n => { let s = ""; while(n > 0){ const m = (n-1) % 26; s = String.fromCharCode(65+m) + s; n = Math.floor((n-1)/26); } return s; };
  const aspas = nome => "'" + String(nome).replace(/'/g, "''") + "'";
  const preencher = hex => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF"+hex}});
  const perfCalc = (ent, cli, np) => (ent - cli) === 0 ? 0 : np / (ent - cli);
  const partesTitulo = t => { const i = String(t).indexOf("—"); return i < 0 ? [String(t).trim()] : [String(t).slice(0,i).trim(), String(t).slice(i+1).trim()]; };

  /* ------------------------- desenho (canvas) ------------------------- */
  function novoCanvas(w, h){
    const E = 2;                                            // 2x = nítido em tela de alta resolução
    const cv = document.createElement("canvas");
    cv.width = w * E; cv.height = h * E;
    const ctx = cv.getContext("2d");
    ctx.scale(E, E);
    return {cv, ctx};
  }
  function retArredondado(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function cortarTexto(ctx, txt, maxW){
    txt = String(txt);
    if(ctx.measureText(txt).width <= maxW) return txt;
    while(txt.length > 1 && ctx.measureText(txt + "…").width > maxW) txt = txt.slice(0, -1);
    return txt + "…";
  }
  function clarear(hex, f){                                 // mistura com branco (f de 0 a 1)
    const c = [0,2,4].map(i => parseInt(hex.substr(i,2), 16));
    return "#" + c.map(v => Math.round(v + (255 - v) * f).toString(16).padStart(2,"0")).join("");
  }
  function fundoCartao(ctx, w, h, titulo, sub){
    ctx.fillStyle = "#" + T.bg; ctx.fillRect(0, 0, w, h);   // mesma cor das células ao redor
    retArredondado(ctx, 3, 3, w - 6, h - 6, 14);
    ctx.fillStyle = "#" + T.card; ctx.fill();
    ctx.strokeStyle = "#" + T.linha; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#" + T.ouro; retArredondado(ctx, 20, 19, 4, 16, 2); ctx.fill();
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 14px " + FC;
    ctx.fillText(String(titulo).toUpperCase(), 32, 27);
    if(sub){ ctx.fillStyle = "#" + T.mudo; ctx.font = "11px " + FC; ctx.fillText(sub, 32, 46); }
  }
  function niceCeil(v){
    if(v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v))), f = v / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function textoComContorno(ctx, txt, x, y, cor){           // texto legível mesmo sobre linhas
    ctx.lineWidth = 3; ctx.strokeStyle = "#" + T.card; ctx.lineJoin = "round";
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = cor; ctx.fillText(txt, x, y);
  }

  /* Barras (simples, com cor por barra) ou empilhadas, com linha de meta opcional.
     o = {w,h,titulo,subtitulo,cats:[texto|[l1,l2]], series:[{nome,cor,valores,cores?}],
          empilhado, meta, metaRotulo, eixoMin, eixoMax, fmt(v), fmtEixo(v), fmtSeg(v)} */
  function graficoBarras(o){
    const w = o.w, h = o.h, {cv, ctx} = novoCanvas(w, h);
    fundoCartao(ctx, w, h, o.titulo, o.subtitulo);
    const duasLinhas = o.cats.some(Array.isArray);
    const fmtEixo = o.fmtEixo || (v => nf(v));
    const fmt = o.fmt || (v => nf(v));
    const R = 26, TOP = 74, B = duasLinhas ? 54 : 40;
    const ph = h - TOP - B, n = o.cats.length;
    const soma = i => o.series.reduce((s, se) => s + n0(se.valores[i]), 0);
    const topos = o.cats.map((_, i) => o.empilhado ? soma(i) : Math.max(...o.series.map(se => n0(se.valores[i]))));
    const min = o.eixoMin !== undefined ? o.eixoMin : 0;
    const max = o.eixoMax !== undefined ? o.eixoMax : niceCeil(Math.max(...topos, n0(o.meta), 1) * 1.1);
    // margem esquerda = largura do maior rótulo do eixo (evita corte de "R$ 750 mil" etc.)
    ctx.font = "10px " + FC;
    const L = Math.max(50, Math.ceil(Math.max(...[0, 1, 2, 3, 4].map(i => ctx.measureText(fmtEixo(min + (max - min) * i / 4)).width))) + 22);
    const pw = w - L - R;
    const y = v => TOP + ph - ph * Math.max(0, Math.min(1, (v - min) / (max - min || 1)));

    // linhas de grade + rótulos do eixo
    ctx.font = "10px " + FC; ctx.textBaseline = "middle";
    for(let i = 0; i <= 4; i++){
      const v = min + (max - min) * i / 4, yy = TOP + ph - ph * i / 4;
      ctx.strokeStyle = "#" + T.linha; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(w - R, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#" + T.mudo; ctx.textAlign = "right"; ctx.fillText(fmtEixo(v), L - 8, yy);
    }

    // barras
    const slot = pw / Math.max(1, n), bw = Math.min(64, slot * 0.56);
    o.cats.forEach((cat, i) => {
      const x0 = L + slot * i + (slot - bw) / 2;
      let base = min, yTopo = y(min);
      o.series.forEach((se, k) => {
        const v = n0(se.valores[i]);
        if(v <= 0) return;
        const cor = (se.cores && se.cores[i]) || se.cor;
        const yA = y(base + v), yB = y(base);
        const alt = Math.max(0, yB - yA);
        if(alt > 0){
          const g = ctx.createLinearGradient(0, yA, 0, yB);
          g.addColorStop(0, clarear(cor, 0.18)); g.addColorStop(1, "#" + cor);
          ctx.fillStyle = g;
          if(!o.empilhado){
            const r = Math.min(7, bw / 2, alt);
            ctx.beginPath(); ctx.moveTo(x0, yB); ctx.lineTo(x0, yA + r); ctx.arcTo(x0, yA, x0 + r, yA, r);
            ctx.lineTo(x0 + bw - r, yA); ctx.arcTo(x0 + bw, yA, x0 + bw, yA + r, r); ctx.lineTo(x0 + bw, yB); ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(x0, yA, bw, alt);
            if(o.fmtSeg && alt >= 20 && bw >= 44){
              ctx.font = "bold 10px " + FC; ctx.textAlign = "center"; ctx.fillStyle = "#FFFFFF";
              ctx.fillText(o.fmtSeg(v), x0 + bw / 2, yA + alt / 2);
            }
          }
        }
        base += v; yTopo = yA;
      });
      // valor no topo da barra
      if(topos[i] > 0){
        ctx.font = "bold 12px " + FC; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        const corTxt = o.empilhado ? "#FFFFFF" : "#" + ((o.series[0].cores && o.series[0].cores[i]) || o.series[0].cor);
        textoComContorno(ctx, fmt(topos[i]), x0 + bw / 2, yTopo - 8, corTxt);
        ctx.textBaseline = "middle";
      }
      // rótulo da categoria (1 ou 2 linhas)
      const linhas = Array.isArray(cat) ? cat : [cat];
      ctx.textAlign = "center"; ctx.fillStyle = "#" + T.mudo;
      linhas.forEach((ln, k) => {
        ctx.font = (k === 0 ? "bold 11px " : "11px ") + FC;
        ctx.fillStyle = k === 0 ? "#FFFFFF" : "#" + T.mudo;
        ctx.fillText(cortarTexto(ctx, ln, slot - 6), L + slot * i + slot / 2, TOP + ph + 16 + k * 14);
      });
    });

    // linha de meta
    if(o.meta !== undefined && o.meta !== null){
      const ym = y(o.meta);
      ctx.strokeStyle = "#" + T.ouro; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(L, ym); ctx.lineTo(w - R, ym); ctx.stroke(); ctx.setLineDash([]);
    }

    // legenda (canto superior direito)
    const itens = [];
    if(o.empilhado || o.series.length > 1) o.series.forEach(se => itens.push({cor:se.cor, nome:se.nome, tipo:"q"}));
    if(o.meta !== undefined && o.meta !== null) itens.push({cor:T.ouro, nome:o.metaRotulo || "Meta", tipo:"l"});
    ctx.font = "11px " + FC; ctx.textBaseline = "middle";
    let xl = w - 22;
    for(let i = itens.length - 1; i >= 0; i--){
      const it = itens[i], tw = ctx.measureText(it.nome).width;
      ctx.textAlign = "right"; ctx.fillStyle = "#" + T.mudo; ctx.fillText(it.nome, xl, 27);
      xl -= tw + 6;
      if(it.tipo === "q"){ ctx.fillStyle = "#" + it.cor; retArredondado(ctx, xl - 10, 22, 10, 10, 2); ctx.fill(); xl -= 10 + 16; }
      else { ctx.strokeStyle = "#" + it.cor; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xl - 18, 27); ctx.lineTo(xl, 27); ctx.stroke(); ctx.setLineDash([]); xl -= 18 + 16; }
    }
    return cv.toDataURL("image/png");
  }

  /* Rosca com total no centro e legenda.
     o = {w,h,titulo,subtitulo,fatias:[{rotulo,valor,cor}],centroValor,centroRotulo,fmtValor(v)} */
  function graficoRosca(o){
    const w = o.w, h = o.h, {cv, ctx} = novoCanvas(w, h);
    fundoCartao(ctx, w, h, o.titulo, o.subtitulo);
    const fatias = o.fatias.filter(f => n0(f.valor) > 0);
    const total = fatias.reduce((s, f) => s + f.valor, 0);
    const topo = o.subtitulo ? 58 : 50;
    const D = Math.min(h - topo - 16, w * 0.5), R = D / 2, r = R * 0.62;
    const cx = 26 + R, cy = topo + (h - topo - 12) / 2;
    const fmtValor = o.fmtValor || (v => nf(v));

    if(total <= 0){
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fillStyle = "#" + T.card2; ctx.fill("evenodd");
    } else {
      let a0 = -Math.PI / 2;
      const gap = fatias.length > 1 ? 0.035 : 0;
      fatias.forEach(f => {
        const ang = f.valor / total * Math.PI * 2, a1 = a0 + ang;
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0 + gap / 2, a1 - gap / 2);
        ctx.arc(cx, cy, r, a1 - gap / 2, a0 + gap / 2, true);
        ctx.closePath(); ctx.fillStyle = "#" + f.cor; ctx.fill();
        if(f.valor / total >= 0.07){
          const am = (a0 + a1) / 2, rr = (R + r) / 2;
          ctx.font = "bold 11px " + FC; ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(nf(f.valor / total * 100, 0) + "%", cx + Math.cos(am) * rr, cy + Math.sin(am) * rr);
        }
        a0 = a1;
      });
    }
    // centro: encolhe a fonte até caber no buraco
    let tam = 26; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    do { ctx.font = "bold " + tam + "px " + FC; tam -= 1; } while(ctx.measureText(o.centroValor).width > r * 1.7 && tam > 9);
    ctx.fillStyle = "#FFFFFF"; ctx.fillText(o.centroValor, cx, cy - 6);
    ctx.font = "11px " + FC; ctx.fillStyle = "#" + T.mudo; ctx.fillText(o.centroRotulo || "", cx, cy + 14);

    // legenda
    const xl = cx + R + 30, disp = h - topo - 14;
    const alt = Math.min(38, disp / Math.max(1, o.fatias.length));
    let yl = topo + (disp - alt * o.fatias.length) / 2 + alt / 2;
    const umaLinha = alt < 32;                                // muitas fatias: 1 linha por item
    o.fatias.forEach(f => {
      const pc = total > 0 ? nf(n0(f.valor) / total * 100, 1) + "%" : "";
      ctx.fillStyle = "#" + f.cor; retArredondado(ctx, xl, (umaLinha ? yl - 5 : yl - 12), 10, 10, 2); ctx.fill();
      ctx.textBaseline = "middle";
      if(umaLinha){
        ctx.font = "11px " + FC; ctx.textAlign = "right"; ctx.fillStyle = "#" + T.mudo; ctx.fillText(pc, w - 20, yl);
        const wpc = ctx.measureText(pc).width;
        ctx.font = "bold 11px " + FC; ctx.textAlign = "left"; ctx.fillStyle = "#FFFFFF";
        ctx.fillText(cortarTexto(ctx, f.rotulo, w - xl - 18 - wpc - 30), xl + 18, yl);
      } else {
        ctx.textAlign = "left";
        ctx.font = "bold 12px " + FC; ctx.fillStyle = "#FFFFFF";
        ctx.fillText(cortarTexto(ctx, f.rotulo, w - xl - 34), xl + 18, yl - 7);
        ctx.font = "11px " + FC; ctx.fillStyle = "#" + T.mudo;
        ctx.fillText(cortarTexto(ctx, fmtValor(n0(f.valor)) + (pc ? " • " + pc : ""), w - xl - 34), xl + 18, yl + 9);
      }
      yl += alt;
    });
    return cv.toDataURL("image/png");
  }

  /* ------------------------- células (Excel) ------------------------- */
  const GAP = {style:"thick", color:{argb:"FF" + T.bg}};    // "vão" entre cartões (borda da cor do fundo)

  function criarAbaDashboard(wb, nome){
    const ws = wb.addWorksheet(nome, {views:[{showGridLines:false, zoomScale:100}]});
    ws.properties.tabColor = {argb:"FF" + T.ouro};
    return ws;
  }

  function prepararGrade(ws, alturas){
    ws.getColumn(1).width = MARG_PX / 7;
    for(let c = C0; c < C0 + N_COLS; c++) ws.getColumn(c).width = COL_PX / 7;
    ws.getColumn(ULT_COL).width = MARG_PX / 7;
    const ultima = Math.max(...Object.keys(alturas).map(Number));
    for(let r = 1; r <= ultima; r++){
      const row = ws.getRow(r);
      row.height = px2pt(alturas[r] || 24);
      for(let c = 1; c <= ULT_COL; c++) row.getCell(c).fill = preencher(T.bg);
    }
    return ultima;
  }

  /* Escreve num bloco (mescla c1..c2 na linha r) com estilo. Bordas laterais "vão" nas pontas. */
  function bloco(ws, r, c1, c2, valor, o){
    o = o || {};
    if(c2 > c1) ws.mergeCells(r, c1, r, c2);
    for(let c = c1; c <= c2; c++){
      const cel = ws.getCell(r, c);
      cel.fill = preencher(o.fundo || T.card);
      const b = {};
      if(o.top) b.top = o.top;
      if(o.bottom) b.bottom = o.bottom;
      if(c === c1 && !o.semVao) b.left = GAP;
      if(c === c2 && !o.semVao) b.right = GAP;
      cel.border = b;
    }
    const m = ws.getCell(r, c1);
    if(valor !== undefined && valor !== null) m.value = valor;
    m.font = {name:FONTE, size:o.tam || 10, bold:!!o.neg, italic:!!o.itl, color:{argb:"FF" + (o.cor || T.txt)}};
    m.alignment = {vertical:"middle", horizontal:o.alinh || "left", indent:o.indent === undefined ? 1 : o.indent, shrinkToFit:!!o.encolher, wrapText:!!o.quebra};
    if(o.fmt) m.numFmt = o.fmt;
    return m;
  }

  function cartaoKpi(ws, r, c1, c2, k){
    const acento = {style:"medium", color:{argb:"FF" + k.acento}};
    bloco(ws, r, c1, c2, k.rot, {tam:9, neg:true, cor:T.mudo, top:acento});
    const ref = colLetra(c1) + (r + 1);
    const m = bloco(ws, r + 1, c1, c2, k.valor, {tam:24, neg:true, fmt:k.fmt});
    bloco(ws, r + 2, c1, c2, k.hint, {tam:9, cor:T.mudo, fmt:k.hintFmt});
    return ref;
  }

  /* Tabela "Top N" dentro de um cartão. cols = [{t, span, alinh, fmt, cor}], linhas = [[valor,...]] */
  function tabelaCard(ws, r0, c0, titulo, corTitulo, cols, linhas, alturaLinha){
    const cTotal = c0 + cols.reduce((s, c) => s + c.span, 0) - 1;
    ws.getRow(r0).height = px2pt(28); ws.getRow(r0 + 1).height = px2pt(26);
    bloco(ws, r0, c0, cTotal, titulo, {tam:11, neg:true, cor:corTitulo, top:{style:"medium", color:{argb:"FF" + corTitulo}}});
    let c = c0;
    cols.forEach(col => {
      bloco(ws, r0 + 1, c, c + col.span - 1, col.t, {tam:9, neg:true, cor:T.mudo, fundo:T.card2, alinh:col.alinh || "center", indent:col.alinh === "left" ? 1 : 0,
        bottom:{style:"thin", color:{argb:"FF" + T.linha}}, semVao:true});
      c += col.span;
    });
    // vão lateral só nas pontas do cabeçalho
    ws.getCell(r0 + 1, c0).border = Object.assign({}, ws.getCell(r0 + 1, c0).border, {left:GAP});
    ws.getCell(r0 + 1, cTotal).border = Object.assign({}, ws.getCell(r0 + 1, cTotal).border, {right:GAP});
    linhas.forEach((lin, i) => {
      const r = r0 + 2 + i;
      ws.getRow(r).height = px2pt(alturaLinha || 26);
      let cc = c0;
      cols.forEach((col, k) => {
        const primeira = k === 0, ultima = k === cols.length - 1;
        const cel = bloco(ws, r, cc, cc + col.span - 1, lin[k], {
          tam:10, neg:!!col.neg, cor:col.cor || T.txt, fundo:i % 2 === 0 ? T.card : T.zebra,
          alinh:col.alinh || "center", indent:col.alinh === "left" ? 1 : 0, fmt:col.fmt, encolher:!!col.encolher,
          bottom:{style:"thin", color:{argb:"FF" + T.linha}}, semVao:true});
        if(primeira) ws.getCell(r, cc).border = Object.assign({}, ws.getCell(r, cc).border, {left:GAP});
        if(ultima) ws.getCell(r, cc + col.span - 1).border = Object.assign({}, ws.getCell(r, cc + col.span - 1).border, {right:GAP});
        cc += col.span;
      });
    });
    return {primeiraLinha:r0 + 2, ultimaLinha:r0 + 1 + linhas.length, colInicial:c0};
  }

  function corCondicional(ws, ref, limite, corBom, corRuim){
    ws.addConditionalFormatting({ref, rules:[
      {type:"cellIs", operator:"greaterThanOrEqual", formulae:[String(limite)], style:{font:{bold:true, color:{argb:"FF" + corBom}}}, priority:1},
      {type:"cellIs", operator:"lessThan", formulae:[String(limite)], style:{font:{bold:true, color:{argb:"FF" + corRuim}}}, priority:2}
    ]});
  }

  // Ancora a imagem nos DOIS cantos (tl = canto sup. esquerdo, br = canto inf. direito, em células)
  // — assim ela preenche exatamente o bloco de células, mesmo que a largura de coluna varie
  // um pouco entre computadores/zoom. w e h só definem a proporção usada no desenho.
  function inserirImagem(wb, ws, dataUrl, colIdx0, rowIdx0, w, h){
    const id = wb.addImage({base64:dataUrl, extension:"png"});
    ws.addImage(id, {tl:{col:colIdx0, row:rowIdx0}, br:{col:colIdx0 + Math.round(w / COL_PX), row:rowIdx0 + Math.round(h / 24)}, editAs:"oneCell"});
  }

  function configurarImpressao(ws, ultima){
    ws.pageSetup = {paperSize:9, orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:1, horizontalCentered:true,
      margins:{left:0.2, right:0.2, top:0.2, bottom:0.2, header:0, footer:0}, printArea:"A1:" + colLetra(ULT_COL) + ultima};
  }

  // cabeçalho comum (linhas 2 e 3): título à esquerda, período/meta à direita
  function cabecalho(ws, titulo, sub, dir1, dir2){
    const meio = C0 + 11, fim = C0 + N_COLS - 1;
    bloco(ws, 2, C0, meio, titulo, {tam:20, neg:true, fundo:T.bg, semVao:true, indent:0});
    bloco(ws, 2, meio + 1, fim, dir1, {tam:13, neg:true, cor:T.ouro, fundo:T.bg, alinh:"right", semVao:true, indent:0});
    const linhaOuro = {style:"medium", color:{argb:"FF" + T.ouro}};
    bloco(ws, 3, C0, meio, sub, {tam:10, cor:T.mudo, fundo:T.bg, semVao:true, indent:0, bottom:linhaOuro});
    bloco(ws, 3, meio + 1, fim, dir2, {tam:10, cor:T.mudo, fundo:T.bg, alinh:"right", semVao:true, indent:0, bottom:linhaOuro});
  }

  const ALTURAS = (() => {
    const a = {1:14, 2:40, 3:20, 4:14, 5:22, 6:46, 7:22, 8:14, 27:14, 28:28, 29:26, 35:14, 36:18, 37:18, 38:14};
    for(let r = 9; r <= 26; r++) a[r] = 24;
    for(let r = 30; r <= 34; r++) a[r] = 26;
    return a;
  })();
  const LARG_ESQ = 12 * COL_PX, LARG_DIR = 8 * COL_PX, ALT_GRAF = 18 * 24;

  /* =====================================================================
     DASHBOARD DE PERFORMANCE (aba DASHBOARD)
     ctx = {nomePerf, perf:{lista,ini,fim,tot,tExp,tEnt,tNp,tCli,tTr,tPerf}, sacs:[{focal,t}]}
     ===================================================================== */
  function montarPerformance(wb, ws, p, ctx){
    const P = ctx.perf, q = aspas(ctx.nomePerf), lim = p.meta / 100, tot = P.tot;
    const metaTxt = nf(p.meta, 1) + "%";
    const nSiglas = P.lista.length;
    const naMeta = P.lista.filter(u => u.perf >= lim).length;
    const ultima = prepararGrade(ws, ALTURAS);

    cabecalho(ws, "DASHBOARD DE PERFORMANCE DE ENTREGAS",
      `${p.fontes}  •  Consolidado por SIGLA` + (p.supervisora ? `  •  Supervisora: ${p.supervisora}` : ""),
      p.periodo, `Meta de performance: ${metaTxt}`);

    // ---- cartões de KPI (linhas 5-7) ----
    const w5 = 5;
    const refK1 = cartaoKpi(ws, 5, C0, C0 + w5 - 1, {
      rot:"PERFORMANCE GERAL", acento:P.tPerf >= lim ? T.verde : T.vermelho, fmt:"0.0%",
      valor:{formula:`${q}!H${tot}`, result:P.tPerf}, hint:null
    });
    // dica do cartão 1 (fórmula de texto; FIXED não depende do idioma do Excel)
    ws.getCell(7, C0).value = {
      formula:`"Meta ${metaTxt}  •  "&IF(${refK1}>=${lim},"▲ ","▼ ")&FIXED(ABS(${refK1}-${lim})*100,1)&" p.p."`,
      result:`Meta ${metaTxt}  •  ${P.tPerf >= lim ? "▲ " : "▼ "}${nf(Math.abs(P.tPerf - lim) * 100, 1)} p.p.`
    };
    corCondicional(ws, refK1, lim, T.verde, T.vermelho);

    cartaoKpi(ws, 5, C0 + w5, C0 + 2 * w5 - 1, {
      rot:"ENTREGUE (TOTAL)", acento:T.azul, fmt:"#,##0",
      valor:{formula:`${q}!D${tot}`, result:P.tEnt},
      hint:{formula:`${q}!C${tot}`, result:P.tExp}, hintFmt:'"Expedido: "#,##0'
    });
    const refK3 = cartaoKpi(ws, 5, C0 + 2 * w5, C0 + 3 * w5 - 1, {
      rot:"SIGLAS NA META", acento:naMeta === nSiglas ? T.verde : T.ambar, fmt:`0" / ${nSiglas}"`,
      valor:{formula:`COUNTIF(${q}!H${P.ini}:H${P.fim},">="&${lim})`, result:naMeta},
      hint:null
    });
    ws.getCell(7, C0 + 2 * w5).value = {formula:`${nSiglas}-${refK3}`, result:nSiglas - naMeta};
    ws.getCell(7, C0 + 2 * w5).numFmt = '"Abaixo da meta: "0';
    cartaoKpi(ws, 5, C0 + 3 * w5, C0 + 4 * w5 - 1, {
      rot:"ATRASOS (FORA DO PRAZO)", acento:T.ambar, fmt:"#,##0",
      valor:{formula:`${q}!F${tot}+${q}!G${tot}`, result:P.tCli + P.tTr},
      hint:{formula:`"Cliente: "&FIXED(${q}!F${tot},0)&"  •  Transp.: "&FIXED(${q}!G${tot},0)`,
            result:`Cliente: ${nf(P.tCli)}  •  Transp.: ${nf(P.tTr)}`}
    });

    // ---- gráficos (imagens) ----
    const sacs = ctx.sacs.filter(s => s.t.ent > 0);
    const cats = sacs.map(s => partesTitulo(s.focal.titulo)).concat([["GERAL", "todas as siglas"]]);
    const vals = sacs.map(s => s.t.sla).concat([P.tPerf]);
    const cores = vals.map((v, i) => i === vals.length - 1 ? T.azul : (v >= lim ? T.verde : T.vermelho));
    const lo = Math.max(0, Math.floor((Math.min(...vals, lim) - 0.04) * 20) / 20);
    const hi = Math.max(1, Math.ceil(Math.max(...vals) * 20) / 20);
    inserirImagem(wb, ws, graficoBarras({
      w:LARG_ESQ, h:ALT_GRAF, titulo:"Performance por SAC vs. meta",
      subtitulo:"PERF % = No Prazo ÷ (Entregue − Atraso Cliente)  •  eixo começa em " + pct1(lo),
      cats, series:[{nome:"Performance", cor:T.verde, valores:vals, cores}],
      meta:lim, metaRotulo:"Meta " + metaTxt, eixoMin:lo, eixoMax:hi, fmt:pct1, fmtEixo:v => nf(v * 100, 1) + "%"
    }), C0 - 1, 8, LARG_ESQ, ALT_GRAF);

    inserirImagem(wb, ws, graficoRosca({
      w:LARG_DIR, h:ALT_GRAF / 2, titulo:"Siglas na meta", subtitulo:"Meta " + metaTxt,
      fatias:[{rotulo:"Na meta", valor:naMeta, cor:T.verde}, {rotulo:"Abaixo da meta", valor:nSiglas - naMeta, cor:T.vermelho}],
      centroValor:nf(nSiglas), centroRotulo:"siglas", fmtValor:v => nf(v) + " siglas"
    }), C0 - 1 + 12, 8, LARG_DIR, ALT_GRAF / 2);

    const outros = Math.max(0, P.tEnt - P.tNp - P.tCli - P.tTr);
    inserirImagem(wb, ws, graficoRosca({
      w:LARG_DIR, h:ALT_GRAF / 2, titulo:"Composição das entregas", subtitulo:"Total entregue no período",
      fatias:[{rotulo:"No prazo", valor:P.tNp, cor:T.verde}, {rotulo:"Atraso cliente", valor:P.tCli, cor:T.ambar},
              {rotulo:"Atraso transportador", valor:P.tTr, cor:T.vermelho}].concat(outros > 0 ? [{rotulo:"Outros", valor:outros, cor:T.cinza}] : []),
      centroValor:nf(P.tEnt), centroRotulo:"entregues", fmtValor:v => nf(v)
    }), C0 - 1 + 12, 8 + 9, LARG_DIR, ALT_GRAF / 2);

    // ---- Top 5 / Atenção (células ligadas à aba PERF SIGLA) ----
    const ativos = P.lista.map((u, i) => Object.assign({}, u, {row:P.ini + i})).filter(u => n0(u.entregue) > 0);
    const melhores = [...ativos].sort((a, b) => (b.perf - a.perf) || (b.entregue - a.entregue)).slice(0, 5);
    const piores = [...ativos].sort((a, b) => (a.perf - b.perf) || (b.entregue - a.entregue)).slice(0, 5);
    const linhasDe = lista => Array.from({length:5}, (_, i) => {
      const u = lista[i];
      if(!u) return ["", "", "", "", "", ""];
      return [i + 1,
        {formula:`${q}!A${u.row}`, result:u.sigla}, {formula:`${q}!B${u.row}`, result:u.destino || ""},
        {formula:`${q}!D${u.row}`, result:n0(u.entregue)}, {formula:`${q}!H${u.row}`, result:u.perf},
        {formula:`(${q}!H${u.row}-${lim})*100`, result:(u.perf - lim) * 100}];
    });
    const cols = [
      {t:"#", span:1}, {t:"SIGLA", span:1, alinh:"left", neg:true}, {t:"UNIDADE", span:3, alinh:"left", encolher:true},
      {t:"ENTREGUE", span:1, fmt:"#,##0"}, {t:"PERFORMANCE", span:2, fmt:"0.0%", neg:true},
      {t:"VS. META", span:2, fmt:'+0.0" p.p.";-0.0" p.p.";0.0" p.p."'}
    ];
    const t1 = tabelaCard(ws, 28, C0, "TOP 5 — MELHOR PERFORMANCE", T.verde, cols, linhasDe(melhores));
    const t2 = tabelaCard(ws, 28, C0 + 10, "ATENÇÃO — 5 MENORES PERFORMANCES", T.vermelho, cols, linhasDe(piores));
    [t1, t2].forEach(t => {
      const c = colLetra(t.colInicial + 6);                         // coluna PERFORMANCE
      corCondicional(ws, `${c}${t.primeiraLinha}:${c}${t.ultimaLinha}`, lim, T.verde, T.vermelho);
      const d = colLetra(t.colInicial + 8);                         // coluna VS. META
      corCondicional(ws, `${d}${t.primeiraLinha}:${d}${t.ultimaLinha}`, 0, T.verde, T.vermelho);
    });

    bloco(ws, 36, C0, C0 + N_COLS - 1, "Cartões e tabelas usam fórmulas ligadas às abas PERF SIGLA e SAC. Os gráficos são imagens geradas no momento da exportação (não se atualizam se você editar as células). Siglas sem entregas no período ficam fora do Top 5.",
      {tam:8, itl:true, cor:T.mudo, fundo:T.bg, semVao:true, indent:0});
    bloco(ws, 37, C0, C0 + N_COLS - 1, "Exportado em " + new Date().toLocaleString("pt-BR") + " — Painel Tambasa",
      {tam:8, itl:true, cor:T.mudo, fundo:T.bg, semVao:true, indent:0});
    configurarImpressao(ws, ultima);
  }

  /* =====================================================================
     RECEITA: aba de dados (RECEITA) + DASHBOARD RECEITA
     ===================================================================== */
  function somarOrigem(o){ return {qctrc:n0(o && o.qctrc), qtvol:n0(o && o.qtvol), frete:n0(o && o.frete), vlrMerc:n0(o && o.vlrMerc)}; }
  function linhasReceita(rec){
    const out = [];
    (rec.grupos || []).forEach(g => (g.unidades || []).forEach(u => {
      const v = somarOrigem(u.val), r = somarOrigem(u.rva);
      if(!u.val && !u.rva) return;
      out.push({focal:g.titulo, sigla:u.sigla, qctrc:v.qctrc + r.qctrc, qtvol:v.qtvol + r.qtvol,
        freteVal:v.frete, freteRva:r.frete, frete:v.frete + r.frete, vlrMerc:v.vlrMerc + r.vlrMerc,
        ctrcVal:v.qctrc, ctrcRva:r.qctrc});
    }));
    return out;
  }
  const temReceita = rec => !!rec && linhasReceita(rec).length > 0;

  function montarReceitaDados(wb, rec, p){
    const ws = wb.addWorksheet("RECEITA", {views:[{showGridLines:false}]});
    const linhas = linhasReceita(rec);
    const fino = {style:"thin", color:{argb:"FFBFBFBF"}};
    const cel = (ref, valor, o) => {
      o = o || {}; const c = ws.getCell(ref);
      if(valor !== undefined && valor !== null) c.value = valor;
      c.font = {name:FONTE, size:o.tam || 10, bold:!!o.neg, italic:!!o.itl, color:{argb:"FF" + (o.cor || "1C2333")}};
      if(o.fundo) c.fill = preencher(o.fundo);
      c.alignment = {vertical:"middle", horizontal:o.alinh || "center", indent:o.indent || 0, wrapText:!!o.quebra};
      if(o.fmt) c.numFmt = o.fmt;
      if(o.borda) c.border = {top:fino, bottom:fino, left:fino, right:fino};
      return c;
    };
    ws.mergeCells(1, 1, 2, 9);
    cel("A1", "FECHAMENTO DE RECEITA — FATURAMENTO POR UNIDADE", {tam:16, neg:true, cor:"FFFFFF", fundo:"0F172A", alinh:"left", indent:1});
    for(let c = 1; c <= 9; c++){ ws.getCell(1, c).fill = preencher("0F172A"); ws.getCell(2, c).fill = preencher("0F172A"); }
    ws.mergeCells(3, 1, 3, 9);
    cel("A3", `${p.periodo || ""}  •  VAL (Rede Do Valle) + RVA (Real Vale)`, {tam:10, cor:"FFFFFF", fundo:"D4A017", alinh:"left", indent:1});
    for(let c = 1; c <= 9; c++) ws.getCell(3, c).fill = preencher("D4A017");

    const cab = ["SAC / FOCAL", "SIGLA", "CTRCs", "VOLUMES", "FRETE VAL (R$)", "FRETE RVA (R$)", "FRETE TOTAL (R$)", "VLR MERCADORIA (R$)", "FRETE / CTRC (R$)"];
    cab.forEach((t, i) => cel(colLetra(i + 1) + "5", t, {neg:true, cor:"FFFFFF", fundo:"0F172A", quebra:true}));
    ws.getRow(5).height = 30;

    const ini = 6, fim = ini + linhas.length - 1, tot = fim + 1, MOEDA = '"R$" #,##0.00';
    linhas.forEach((l, i) => {
      const r = ini + i, z = i % 2 === 0 ? "F1F5F9" : null;
      l.row = r;
      cel(`A${r}`, l.focal, {fundo:z, alinh:"left", indent:1, borda:true});
      cel(`B${r}`, l.sigla, {fundo:z, neg:true, borda:true});
      cel(`C${r}`, l.qctrc, {fundo:z, fmt:"#,##0", borda:true});
      cel(`D${r}`, l.qtvol, {fundo:z, fmt:"#,##0", borda:true});
      cel(`E${r}`, l.freteVal, {fundo:z, fmt:MOEDA, borda:true});
      cel(`F${r}`, l.freteRva, {fundo:z, fmt:MOEDA, borda:true});
      cel(`G${r}`, {formula:`E${r}+F${r}`, result:l.frete}, {fundo:z, fmt:MOEDA, neg:true, borda:true});
      cel(`H${r}`, l.vlrMerc, {fundo:z, fmt:MOEDA, borda:true});
      cel(`I${r}`, {formula:`IF(C${r}=0,0,G${r}/C${r})`, result:l.qctrc ? l.frete / l.qctrc : 0}, {fundo:z, fmt:MOEDA, borda:true});
    });
    const S = k => linhas.reduce((s, l) => s + l[k], 0);
    const T_ = {qctrc:S("qctrc"), qtvol:S("qtvol"), freteVal:S("freteVal"), freteRva:S("freteRva"), frete:S("frete"), vlrMerc:S("vlrMerc")};
    cel(`A${tot}`, "TOTAL", {neg:true, cor:"FFFFFF", fundo:"0F172A", alinh:"left", indent:1});
    cel(`B${tot}`, null, {fundo:"0F172A"});
    [["C", "qctrc", "#,##0"], ["D", "qtvol", "#,##0"], ["E", "freteVal", MOEDA], ["F", "freteRva", MOEDA], ["G", "frete", MOEDA], ["H", "vlrMerc", MOEDA]].forEach(([L, k, f]) =>
      cel(`${L}${tot}`, {formula:`SUM(${L}${ini}:${L}${fim})`, result:T_[k]}, {neg:true, cor:"FFFFFF", fundo:"0F172A", fmt:f}));
    cel(`I${tot}`, {formula:`IF(C${tot}=0,0,G${tot}/C${tot})`, result:T_.qctrc ? T_.frete / T_.qctrc : 0}, {neg:true, cor:"FFFFFF", fundo:"0F172A", fmt:MOEDA});
    ws.getRow(tot).height = 22;
    cel(`A${tot + 2}`, "CTRCs, volumes e mercadoria somam VAL + RVA de cada unidade. Só aparecem unidades com dados importados.", {tam:9, itl:true, cor:"6B7286", alinh:"left"});
    [24, 10, 12, 12, 18, 18, 19, 21, 17].forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.views = [{state:"frozen", ySplit:5, showGridLines:false}];
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    return {ws, ini, fim, tot, linhas, totais:T_};
  }

  function montarReceita(wb, ws, rec, dados, p){
    const q = aspas("RECEITA"), D = dados, Tt = D.totais, tot = D.tot;
    const ultima = prepararGrade(ws, ALTURAS);
    cabecalho(ws, "DASHBOARD DE FATURAMENTO (RECEITA)", "VAL + RVA  •  Faturamento = FRETE" + (rec.supervisora ? `  •  Supervisora: ${rec.supervisora}` : ""),
      rec.periodo || p.periodo || "", `${nf(D.linhas.length)} unidade(s) com dados`);

    const w5 = 5, MOEDA = '"R$" #,##0.00';
    cartaoKpi(ws, 5, C0, C0 + w5 - 1, {
      rot:"FATURAMENTO (FRETE)", acento:T.verde, fmt:MOEDA, valor:{formula:`${q}!G${tot}`, result:Tt.frete},
      hint:{formula:`"VAL: R$ "&FIXED(${q}!E${tot},0)&"  •  RVA: R$ "&FIXED(${q}!F${tot},0)`, result:`VAL: R$ ${nf(Tt.freteVal)}  •  RVA: R$ ${nf(Tt.freteRva)}`}
    });
    cartaoKpi(ws, 5, C0 + w5, C0 + 2 * w5 - 1, {
      rot:"VALOR DE MERCADORIA", acento:T.azul, fmt:MOEDA, valor:{formula:`${q}!H${tot}`, result:Tt.vlrMerc},
      hint:{formula:`IF(${q}!H${tot}=0,0,${q}!G${tot}/${q}!H${tot})`, result:Tt.vlrMerc ? Tt.frete / Tt.vlrMerc : 0}, hintFmt:'"Frete = "0.00%" da mercadoria"'
    });
    cartaoKpi(ws, 5, C0 + 2 * w5, C0 + 3 * w5 - 1, {
      rot:"CTRCs EMITIDOS", acento:T.roxo, fmt:"#,##0", valor:{formula:`${q}!C${tot}`, result:Tt.qctrc},
      hint:{formula:`${q}!I${tot}`, result:Tt.qctrc ? Tt.frete / Tt.qctrc : 0}, hintFmt:'"Ticket médio: R$ "#,##0.00'
    });
    cartaoKpi(ws, 5, C0 + 3 * w5, C0 + 4 * w5 - 1, {
      rot:"VOLUMES", acento:T.ambar, fmt:"#,##0", valor:{formula:`${q}!D${tot}`, result:Tt.qtvol},
      hint:{formula:`IF(${q}!C${tot}=0,0,${q}!D${tot}/${q}!C${tot})`, result:Tt.qctrc ? Tt.qtvol / Tt.qctrc : 0}, hintFmt:'"Média de "0.0" volumes por CTRC"'
    });

    // agrega por focal
    const porFocal = [];
    D.linhas.forEach(l => {
      let g = porFocal.find(x => x.focal === l.focal);
      if(!g){ g = {focal:l.focal, freteVal:0, freteRva:0, frete:0}; porFocal.push(g); }
      g.freteVal += l.freteVal; g.freteRva += l.freteRva; g.frete += l.frete;
    });
    const focaisOrd = porFocal.filter(g => g.frete > 0);

    inserirImagem(wb, ws, graficoBarras({
      w:LARG_ESQ, h:ALT_GRAF, titulo:"Faturamento por SAC", subtitulo:"FRETE (R$)  •  VAL x RVA",
      cats:focaisOrd.map(g => partesTitulo(g.focal)),
      series:[{nome:"VAL", cor:T.azul, valores:focaisOrd.map(g => g.freteVal)}, {nome:"RVA", cor:T.verde, valores:focaisOrd.map(g => g.freteRva)}],
      empilhado:true, fmt:moedaCompacta, fmtSeg:moedaCompacta,
      fmtEixo:v => v >= 1e6 ? nf(v / 1e6, 2) + " mi" : (v >= 1e3 ? nf(v / 1e3, 0) + " mil" : nf(v, 0))
    }), C0 - 1, 8, LARG_ESQ, ALT_GRAF);

    const ord = [...focaisOrd].sort((a, b) => b.frete - a.frete);
    const fatias = ord.slice(0, 5).map((g, i) => ({rotulo:partesTitulo(g.focal).join(" — "), valor:g.frete, cor:PALETA[i]}));
    const resto = ord.slice(5).reduce((s, g) => s + g.frete, 0);
    if(resto > 0) fatias.push({rotulo:"Demais", valor:resto, cor:T.cinza});
    inserirImagem(wb, ws, graficoRosca({
      w:LARG_DIR, h:ALT_GRAF / 2, titulo:"Participação por SAC", subtitulo:"Faturamento (FRETE)",
      fatias, centroValor:moedaCompacta(Tt.frete), centroRotulo:"faturamento", fmtValor:moedaCompacta
    }), C0 - 1 + 12, 8, LARG_DIR, ALT_GRAF / 2);

    const cV = D.linhas.reduce((s, l) => s + l.ctrcVal, 0), cR = D.linhas.reduce((s, l) => s + l.ctrcRva, 0);
    inserirImagem(wb, ws, graficoRosca({
      w:LARG_DIR, h:ALT_GRAF / 2, titulo:"Origem dos CTRCs", subtitulo:"VAL (Rede Do Valle) x RVA (Real Vale)",
      fatias:[{rotulo:"VAL — Rede Do Valle", valor:cV, cor:T.azul}, {rotulo:"RVA — Real Vale", valor:cR, cor:T.verde}],
      centroValor:nf(cV + cR), centroRotulo:"CTRCs", fmtValor:v => nf(v) + " CTRCs"
    }), C0 - 1 + 12, 8 + 9, LARG_DIR, ALT_GRAF / 2);

    // Top 5 (células ligadas à aba RECEITA)
    const top = (chave) => [...D.linhas].sort((a, b) => (b[chave] - a[chave]) || (b.frete - a.frete)).slice(0, 5);
    const linhasDe = lista => Array.from({length:5}, (_, i) => {
      const l = lista[i];
      if(!l) return ["", "", "", "", "", ""];
      return [i + 1, {formula:`${q}!B${l.row}`, result:l.sigla}, {formula:`${q}!A${l.row}`, result:l.focal},
        {formula:`${q}!C${l.row}`, result:l.qctrc}, {formula:`${q}!D${l.row}`, result:l.qtvol}, {formula:`${q}!G${l.row}`, result:l.frete}];
    });
    const cols = [
      {t:"#", span:1}, {t:"SIGLA", span:1, alinh:"left", neg:true}, {t:"SAC", span:2, alinh:"left", encolher:true},
      {t:"CTRCs", span:2, fmt:"#,##0"}, {t:"VOLUMES", span:2, fmt:"#,##0"}, {t:"FRETE", span:2, fmt:MOEDA, neg:true}
    ];
    tabelaCard(ws, 28, C0, "TOP 5 UNIDADES — FATURAMENTO", T.verde, cols, linhasDe(top("frete")));
    tabelaCard(ws, 28, C0 + 10, "TOP 5 UNIDADES — VOLUMES", T.ambar, cols, linhasDe(top("qtvol")));

    bloco(ws, 36, C0, C0 + N_COLS - 1, "Cartões e tabelas usam fórmulas ligadas à aba RECEITA. Os gráficos são imagens geradas no momento da exportação (não se atualizam se você editar as células).",
      {tam:8, itl:true, cor:T.mudo, fundo:T.bg, semVao:true, indent:0});
    bloco(ws, 37, C0, C0 + N_COLS - 1, "Exportado em " + new Date().toLocaleString("pt-BR") + " — Painel Tambasa",
      {tam:8, itl:true, cor:T.mudo, fundo:T.bg, semVao:true, indent:0});
    configurarImpressao(ws, ultima);
  }

  /* Excel só da RECEITA (botão da aba Fechamento-RECEITA) */
  async function exportarReceitaExcel(payload, nomeArquivo){
    if(typeof ExcelJS === "undefined"){
      alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão com a internet e recarregue a página.");
      return;
    }
    if(!temReceita(payload)){
      alert("Importe os dados de Receita (VAL e/ou RVA) antes de exportar.");
      return;
    }
    try{
      const wb = new ExcelJS.Workbook();
      wb.creator = "Painel Tambasa"; wb.created = new Date();
      wb.calcProperties = {fullCalcOnLoad:true};
      const wsDash = criarAbaDashboard(wb, "DASHBOARD RECEITA");
      const dados = montarReceitaDados(wb, payload, payload);
      montarReceita(wb, wsDash, payload, dados, payload);
      wb.views = [{activeTab:0}];
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo || "Fechamento_Receita.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){
      console.error("Erro ao exportar receita:", err);
      alert("Não foi possível gerar o Excel de Receita: " + (err.message || err));
    }
  }

  root.DashboardXL = {criarAbaDashboard, montarPerformance, temReceita, montarReceitaDados, montarReceita};
  root.exportarReceitaExcel = exportarReceitaExcel;
})(typeof window !== "undefined" ? window : globalThis);
