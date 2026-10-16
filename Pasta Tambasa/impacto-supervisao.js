/* =====================================================================
   IMPACTO DA SUPERVISÃO — comparativo ANTES x DEPOIS da entrada de uma supervisora.
   Aba independente das demais (guarda os próprios dados, mês a mês).

   Indicadores comparados (VAL = Rede Do Valle, RVA = Real Vale):
     • Performance (VAL e RVA)   — Entregue, no prazo, atraso cliente/transportadora, PERF%
     • Indenizações              — quantidade e valor, por quem pagou (Matriz, Filiais, Valle, G5…)
     • Faturamento Geral         — CTRCs, frete e valor de mercadoria
     • Faturamento por Focal     — frete por Focal (os Focais vêm da "Confirmação de Filiais")

   TUDO É EDITÁVEL: data de entrada, quantos meses antes/depois e cada número das tabelas.
   A importação (arquivo ou texto colado) só preenche as tabelas — o que importar errado é só
   corrigir na célula.

   Janela de meses: N meses ANTES do mês de entrada e N meses DEPOIS. Se a supervisora entrou
   no dia 1, o mês de entrada já conta como 1º mês "depois". Se entrou no meio do mês, esse mês
   aparece como "Entrada (parcial)" e fica FORA das médias (nem antes, nem depois).
   ===================================================================== */
(function(){
  "use strict";

  const KEY = "tambasa_impacto_supervisao";
  const FONTES = ["val", "rva"];
  const FONTE_NOME = {val:"VAL", rva:"RVA"};
  const MESES_ABR = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const SUBS = [
    {id:"dados", label:"Período e Importação"},
    {id:"geral", label:"Visão Geral"},
    {id:"perf", label:"Performance (VAL e RVA)"},
    {id:"ind", label:"Indenizações"},
    {id:"fat", label:"Faturamento Geral"},
    {id:"focal", label:"Faturamento por Focal"}
  ];
  const COR = {val:"#3fa1f5", rva:"#ffa30a", geral:"#0f1c47", antes:"#9aa3b8", depois:"#00c389", marca:"#c99a2e"};

  /* ---------------- armazenamento ---------------- */
  function padrao(){
    return {cfg:{anterior:"Supervisão anterior", atual:"Supervisora atual", entrada:"2026-07-01", antes:3, depois:3},
            perf:{}, ind:{}, fat:{}};
  }
  function carregar(){
    try{
      const o = JSON.parse(localStorage.getItem(KEY) || "null");
      if(o && o.cfg){
        const p = padrao();
        return {cfg:Object.assign(p.cfg, o.cfg), perf:o.perf || {}, ind:o.ind || {}, fat:o.fat || {}};
      }
    }catch(e){ /* ignora */ }
    return padrao();
  }
  let D = carregar();
  let sub = "dados";
  let msg = {};          // mensagens de importação por tipo
  function gravar(){
    try{ localStorage.setItem(KEY, JSON.stringify(D)); }
    catch(e){ alert("Não consegui salvar no navegador (espaço cheio?)."); }
  }

  /* ---------------- utilidades ---------------- */
  const esc = s => (typeof escHtml === "function") ? escHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const fN = v => num(v).toLocaleString("pt-BR", {maximumFractionDigits:0});
  const fM = v => "R$ " + num(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  const fP = v => (v == null || !isFinite(v)) ? "—" : v.toFixed(1).replace(".", ",") + "%";
  const fMc = v => { v = num(v); const a = Math.abs(v);
    if(a >= 1e6) return "R$ " + (v/1e6).toLocaleString("pt-BR", {maximumFractionDigits:2}) + " mi";
    if(a >= 1e3) return "R$ " + (v/1e3).toLocaleString("pt-BR", {maximumFractionDigits:1}) + " mil";
    return "R$ " + v.toLocaleString("pt-BR", {maximumFractionDigits:0}); };
  const mesKey = n => Math.floor(n/12) + "-" + String(n % 12 + 1).padStart(2, "0");
  const mesRot = k => { const [y, m] = k.split("-"); return MESES_ABR[+m - 1] + "/" + y; };
  const fData = iso => { if(!iso) return "—"; const [y, m, d] = iso.split("-"); return d + "/" + m + "/" + y; };
  function lerNum(txt){
    let t = String(txt == null ? "" : txt).trim().replace(/[R$\s%]/g, "");
    if(t === "") return null;
    if(t.indexOf(",") !== -1) t = t.replace(/\./g, "").replace(",", ".");
    else if(/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");      // 9.999 = nove mil novecentos e noventa e nove
    const n = Number(t);
    return isFinite(n) ? n : null;
  }
  async function lerArquivo(file){
    const buf = await file.arrayBuffer();
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(buf); }
    catch(e){ return new TextDecoder("windows-1252").decode(buf); }
  }

  /* ---------------- janela de meses ---------------- */
  function janela(){
    const c = D.cfg;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.entrada || "") || /^(\d{4})-(\d{2})-(\d{2})$/.exec("2026-07-01");
    const y = +m[1], mm = +m[2], d = +m[3];
    const base = y * 12 + (mm - 1);
    const nA = Math.max(1, Math.min(24, parseInt(c.antes, 10) || 3));
    const nD = Math.max(1, Math.min(24, parseInt(c.depois, 10) || 3));
    const antes = [], depois = [];
    for(let i = nA; i >= 1; i--) antes.push(mesKey(base - i));
    const parcial = d > 1;
    const ini = parcial ? base + 1 : base;
    for(let i = 0; i < nD; i++) depois.push(mesKey(ini + i));
    const cols = antes.map(k => ({k, tipo:"antes"}));
    if(parcial) cols.push({k:mesKey(base), tipo:"trans"});
    depois.forEach(k => cols.push({k, tipo:"depois"}));
    return {antes, depois, parcial, mesEntrada:mesKey(base), cols, marca:antes.length};
  }
  const ROT_TIPO = {antes:"Antes", trans:"Entrada (parcial)", depois:"Depois"};

  /* ---------------- dados por mês ---------------- */
  const ZP = () => ({exped:0, entregue:0, noPrazoEnt:0, atrasCli:0, atrasTrans:0});
  function somaPerf(lista){
    let achou = false; const t = ZP();
    lista.forEach(o => { if(!o) return; achou = true; Object.keys(t).forEach(k => t[k] += num(o[k])); });
    return achou ? t : null;
  }
  const perfFonte = (m, f) => (D.perf[m] && D.perf[m][f]) || null;
  const perfMes = (m, f) => f === "geral" ? somaPerf(FONTES.map(x => perfFonte(m, x))) : perfFonte(m, f);
  const perfPct = o => { if(!o) return null; const den = num(o.entregue) - num(o.atrasCli); return den > 0 ? num(o.noPrazoEnt) / den * 100 : null; };
  const perfPeriodo = (meses, f) => somaPerf(meses.map(m => perfMes(m, f)));

  const ZI = () => ({qtd:0, valor:0, matriz:0, filiais:0, valle:0, g5:0, outros:0});
  function somaGen(lista, zero){
    let achou = false; const t = zero();
    lista.forEach(o => { if(!o) return; achou = true; Object.keys(t).forEach(k => t[k] += num(o[k])); });
    return achou ? t : null;
  }
  const indMes = m => somaGen(FONTES.map(f => D.ind[m] && D.ind[m][f]), ZI);
  const ZF = () => ({qctrc:0, frete:0, vlrMerc:0});
  const fatMes = m => somaGen(FONTES.map(f => D.fat[m] && D.fat[m][f]), ZF);

  // média mensal (só dos meses que têm dado) de um campo
  function mediaMeses(meses, getter, campo){
    const v = meses.map(getter).filter(Boolean).map(o => num(o[campo]));
    return v.length ? {media:v.reduce((a, b) => a + b, 0) / v.length, n:v.length} : {media:null, n:0};
  }

  /* ---------------- focais (vêm da Confirmação de Filiais) ---------------- */
  function focalDe(sigla){
    sigla = String(sigla || "").toUpperCase();
    try{
      const f = (typeof focalPorSigla === "function") ? focalPorSigla(sigla) : null;
      if(f) return f.titulo;
      if(typeof FOCAIS_ESPECIAIS_POR_UNIDADE !== "undefined" && FOCAIS_ESPECIAIS_POR_UNIDADE[sigla]) return FOCAIS_ESPECIAIS_POR_UNIDADE[sigla];
    }catch(e){ /* ignora */ }
    return "Sem focal";
  }
  function focaisLista(){
    const l = [];
    try{ if(typeof FOCAIS !== "undefined") FOCAIS.forEach(f => l.push(f.titulo)); }catch(e){ /* ignora */ }
    try{ if(typeof FOCAIS_ESPECIAIS_POR_UNIDADE !== "undefined") Object.values(FOCAIS_ESPECIAIS_POR_UNIDADE).forEach(n => { if(!l.includes(n)) l.push(n); }); }catch(e){ /* ignora */ }
    const usados = new Set();
    Object.keys(D.fat).forEach(m => {
      FONTES.forEach(f => { const o = D.fat[m][f]; if(o && o.porSigla) Object.keys(o.porSigla).forEach(s => usados.add(focalDe(s))); });
      if(D.fat[m].focalOv) Object.keys(D.fat[m].focalOv).forEach(t => usados.add(t));
    });
    usados.forEach(t => { if(!l.includes(t)) l.push(t); });
    return l;
  }
  // frete de um focal num mês (VAL+RVA); o ajuste manual da célula vale mais que o importado
  function focalMes(m, titulo){
    const d = D.fat[m];
    if(!d) return null;
    if(d.focalOv && d.focalOv[titulo] != null) return num(d.focalOv[titulo]);
    let achou = false, t = 0;
    FONTES.forEach(f => {
      const o = d[f];
      if(!o || !o.porSigla) return;
      Object.keys(o.porSigla).forEach(s => { if(focalDe(s) === titulo){ achou = true; t += num(o.porSigla[s].frete); } });
    });
    return achou ? t : null;
  }

  /* ---------------- gráfico (SVG) ---------------- */
  function grafico(o){
    const W = o.W || 760, H = o.H || 292, pl = 58, pr = 16, pt = 34, pb = 52;
    const n = o.cols.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
    const todos = [];
    o.series.forEach(s => s.vals.forEach(v => { if(v != null) todos.push(v); }));
    if(!todos.length) return `<div class="cs-vazio">Sem dados nos meses desta comparação — importe ou digite na tabela abaixo.</div>`;
    let mx = Math.max.apply(null, todos), mn = o.tipo === "bar" ? 0 : Math.min.apply(null, todos);
    if(o.tipo === "bar") mx *= 1.14;      // folga no topo p/ o rótulo do maior valor
    if(o.tipo === "line"){ const pad = (mx - mn) * 0.2 || 1; mn = Math.max(0, mn - pad); mx = Math.min(o.teto || Infinity, mx + pad); }
    if(mx === mn) mx = mn + 1;
    const y = v => pt + ih - (v - mn) / (mx - mn) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="cs-chart" role="img" aria-label="${esc(o.titulo || "")}">`;
    // faixas antes / depois
    const xm = pl + bw * o.marca;
    s += `<rect x="${pl}" y="${pt}" width="${xm - pl}" height="${ih}" class="cs-faixa-antes"/>`;
    s += `<rect x="${xm}" y="${pt}" width="${W - pr - xm}" height="${ih}" class="cs-faixa-depois"/>`;
    s += `<text x="${pl + 8}" y="${pt - 12}" class="cs-chart-lab">ANTES${o.nomeAntes ? " · " + esc(o.nomeAntes) : ""}</text>`;
    s += `<text x="${xm + 8}" y="${pt - 12}" class="cs-chart-lab dep">DEPOIS${o.nomeDepois ? " · " + esc(o.nomeDepois) : ""}</text>`;
    // grade + eixo Y
    for(let i = 0; i <= 4; i++){
      const v = mn + (mx - mn) * i / 4, yy = y(v);
      s += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="cs-grid"/><text x="${pl - 8}" y="${yy + 4}" class="cs-eixo" text-anchor="end">${esc(o.fmtEixo(v))}</text>`;
    }
    // meses
    o.cols.forEach((c, i) => { s += `<text x="${pl + bw * i + bw / 2}" y="${H - 30}" class="cs-eixo" text-anchor="middle">${mesRot(c.k)}</text>`; });
    const ns = o.series.length;
    if(o.tipo === "bar"){
      const g = Math.min(34, bw * 0.7 / ns);
      o.series.forEach((se, si) => se.vals.forEach((v, i) => {
        if(v == null) return;
        const x = pl + bw * i + bw / 2 - g * ns / 2 + g * si, yy = y(v);
        s += `<rect x="${x + 1}" y="${yy}" width="${g - 2}" height="${Math.max(0, pt + ih - yy)}" rx="3" fill="${se.cor}"><title>${esc(se.nome)} · ${mesRot(o.cols[i].k)}: ${esc(o.fmtVal(v))}</title></rect>`;
        if(n <= 8 && ns <= 2) s += `<text x="${x + g / 2}" y="${yy - 5}" class="cs-val" text-anchor="middle">${esc(o.fmtCurto ? o.fmtCurto(v) : o.fmtVal(v))}</text>`;
      }));
    } else {
      o.series.forEach(se => {
        let d = "", ult = false;
        se.vals.forEach((v, i) => {
          if(v == null){ ult = false; return; }
          d += (ult ? "L" : "M") + (pl + bw * i + bw / 2).toFixed(1) + " " + y(v).toFixed(1) + " "; ult = true;
        });
        s += `<path d="${d}" fill="none" stroke="${se.cor}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
        se.vals.forEach((v, i) => {
          if(v == null) return;
          const cx = pl + bw * i + bw / 2;
          s += `<circle cx="${cx}" cy="${y(v)}" r="4.2" fill="${se.cor}" stroke="#fff" stroke-width="1.5"><title>${esc(se.nome)} · ${mesRot(o.cols[i].k)}: ${esc(o.fmtVal(v))}</title></circle>`;
          if(n <= 8 && ns <= 2) s += `<text x="${cx}" y="${y(v) - 9}" class="cs-val" text-anchor="middle">${esc(o.fmtVal(v))}</text>`;
        });
      });
    }
    // linha da entrada
    s += `<line x1="${xm}" x2="${xm}" y1="${pt - 6}" y2="${pt + ih}" class="cs-marca-linha"/>`;
    s += `<text x="${xm}" y="${H - 4}" class="cs-marca-txt" text-anchor="middle">▲ entrada ${fData(D.cfg.entrada)}</text>`;
    s += "</svg>";
    const leg = o.series.length > 1 ? `<div class="cs-leg">${o.series.map(se => `<span><i style="background:${se.cor}"></i>${esc(se.nome)}</span>`).join("")}</div>` : "";
    return `<div class="cs-chart-wrap">${s}${leg}</div>`;
  }

  /* ---------------- cartões de comparação ---------------- */
  // tipo "pct": variação em pontos percentuais; demais: variação em %.
  function cartao(titulo, antes, depois, o){
    o = o || {};
    const fmt = o.fmt || fN, melhor = o.melhor || "maior";
    if(antes == null || depois == null){
      return `<div class="cs-card cs-neutro"><span class="cs-card-t">${esc(titulo)}</span>
        <div class="cs-card-par"><div><small>Antes</small><b>${antes == null ? "—" : fmt(antes)}</b></div><div><small>Depois</small><b>${depois == null ? "—" : fmt(depois)}</b></div></div>
        <span class="cs-chip">sem dados dos dois lados</span>${o.nota ? `<small class="cs-card-n">${esc(o.nota)}</small>` : ""}</div>`;
    }
    const delta = depois - antes;
    let txt;
    if(o.tipo === "pct") txt = (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(1).replace(".", ",") + " p.p.";
    else if(antes === 0) txt = delta === 0 ? "0%" : "novo";
    else { const p = delta / Math.abs(antes) * 100; txt = (p >= 0 ? "+" : "−") + Math.abs(p).toFixed(1).replace(".", ",") + "%"; }
    const bom = Math.abs(delta) < 1e-9 ? null : (melhor === "maior" ? delta > 0 : delta < 0);
    const cls = bom == null ? "cs-neutro" : (bom ? "cs-bom" : "cs-ruim");
    const seta = delta > 1e-9 ? "▲" : (delta < -1e-9 ? "▼" : "■");
    return `<div class="cs-card ${cls}"><span class="cs-card-t">${esc(titulo)}</span>
      <div class="cs-card-par"><div><small>Antes</small><b>${fmt(antes)}</b></div><div class="cs-seta">→</div><div><small>Depois</small><b>${fmt(depois)}</b></div></div>
      <span class="cs-chip">${seta} ${txt}</span>${o.nota ? `<small class="cs-card-n">${esc(o.nota)}</small>` : ""}</div>`;
  }
  const notaMeses = (a, d) => `${a} mês(es) antes · ${d} depois com dados`;

  /* ---------------- tabelas (tela editável e versão estática p/ Excel) ---------------- */
  const inp = (path, valor, ed, fmt) => ed
    ? `<td class="cs-n"><input class="cs-in" data-cs="${esc(path)}" value="${valor == null ? "" : esc(fN(valor))}" placeholder="—" inputmode="decimal"></td>`
    : `<td class="cs-n"${valor == null ? "" : ` data-xlnum="${num(valor)}" data-xlfmt="#,##0"`}>${valor == null ? "—" : esc(fN(valor))}</td>`;
  const inpM = (path, valor, ed) => ed
    ? `<td class="cs-n"><input class="cs-in cs-in-m" data-cs="${esc(path)}" value="${valor == null ? "" : esc(num(valor).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2}))}" placeholder="—" inputmode="decimal"></td>`
    : `<td class="cs-n"${valor == null ? "" : ` data-xlnum="${num(valor)}"`}>${valor == null ? "—" : esc(fM(valor))}</td>`;
  const tdN = v => `<td class="cs-n"${v == null ? "" : ` data-xlnum="${num(v)}" data-xlfmt="#,##0"`}>${v == null ? "—" : esc(fN(v))}</td>`;
  const tdM = v => `<td class="cs-n"${v == null ? "" : ` data-xlnum="${num(v)}"`}>${v == null ? "—" : esc(fM(v))}</td>`;
  const tdP = v => `<td class="cs-n cs-perf">${fP(v)}</td>`;
  const tdMes = c => `<td class="cs-mes cel-texto">${mesRot(c.k)} <span class="cs-badge cs-b-${c.tipo}">${ROT_TIPO[c.tipo]}</span></td>`;
  const marcaRow = (cols, J) => `<tr class="cs-marca"><td colspan="${cols}" class="cel-texto">▼ Entrada da supervisora — ${fData(D.cfg.entrada)} ▼</td></tr>`;

  function linhasComMarca(J, nCols, fnLinha){
    let h = "";
    J.cols.forEach((c, i) => { if(i === J.marca) h += marcaRow(nCols, J); h += fnLinha(c); });
    return h;
  }

  function tabelaPerf(ed, J){
    const cab = f => `<th colspan="5" class="cs-g-${f}">${FONTE_NOME[f]}</th>`;
    const cab2 = ["Entregue", "No prazo", "Atraso cli.", "Atraso transp.", "PERF %"];
    let h = `<table class="cs-table" id="${ed ? "csTabPerf" : "csTabPerfX"}"><thead>`;
    if(ed){
      h += `<tr><th rowspan="2" class="cs-th-mes">Mês</th>${cab("val")}${cab("rva")}<th rowspan="2">PERF % Geral</th></tr><tr>${cab2.concat(cab2).map(t => `<th>${t}</th>`).join("")}</tr>`;
    } else {
      h += `<tr><th>Mês</th>${FONTES.map(f => cab2.map(t => `<th>${FONTE_NOME[f]} · ${t}</th>`).join("")).join("")}<th>PERF % Geral</th></tr>`;
    }
    h += `</thead><tbody>`;
    const n = 12;
    h += linhasComMarca(J, n, c => {
      let r = `<tr class="cs-r-${c.tipo}">${tdMes(c)}`;
      FONTES.forEach(f => {
        const o = perfFonte(c.k, f);
        r += inp(`perf|${c.k}|${f}|entregue`, o ? o.entregue : null, ed) + inp(`perf|${c.k}|${f}|noPrazoEnt`, o ? o.noPrazoEnt : null, ed)
           + inp(`perf|${c.k}|${f}|atrasCli`, o ? o.atrasCli : null, ed) + inp(`perf|${c.k}|${f}|atrasTrans`, o ? o.atrasTrans : null, ed) + tdP(perfPct(o));
      });
      return r + tdP(perfPct(perfMes(c.k, "geral"))) + "</tr>";
    });
    // resumo do período
    const lin = (rot, meses, cls) => {
      let r = `<tr class="${cls}"><td class="cel-texto">${rot}</td>`;
      FONTES.forEach(f => { const o = perfPeriodo(meses, f); r += tdN(o && o.entregue) + tdN(o && o.noPrazoEnt) + tdN(o && o.atrasCli) + tdN(o && o.atrasTrans) + tdP(perfPct(o)); });
      return r + tdP(perfPct(perfPeriodo(meses, "geral"))) + "</tr>";
    };
    h += `</tbody><tfoot>${lin("Total ANTES", J.antes, "cs-tot-antes")}${lin("Total DEPOIS", J.depois, "cs-tot-depois")}</tfoot></table>`;
    return h;
  }

  function tabelaInd(ed, J){
    const cols = ["Qtd VAL", "Valor VAL", "Qtd RVA", "Valor RVA", "Total (R$)", "Matriz", "Filiais", "Do Valle / Real Vale", "Parceiras G5", "Outros (revisar)"];
    let h = `<table class="cs-table" id="${ed ? "csTabInd" : "csTabIndX"}"><thead><tr><th class="cs-th-mes">Mês</th>${cols.map(t => `<th>${t}</th>`).join("")}</tr></thead><tbody>`;
    h += linhasComMarca(J, 11, c => {
      const v = D.ind[c.k] && D.ind[c.k].val, r = D.ind[c.k] && D.ind[c.k].rva, t = indMes(c.k);
      return `<tr class="cs-r-${c.tipo}">${tdMes(c)}${inp(`ind|${c.k}|val|qtd`, v ? v.qtd : null, ed)}${inpM(`ind|${c.k}|val|valor`, v ? v.valor : null, ed)}`
        + `${inp(`ind|${c.k}|rva|qtd`, r ? r.qtd : null, ed)}${inpM(`ind|${c.k}|rva|valor`, r ? r.valor : null, ed)}`
        + `${tdM(t && t.valor)}${tdM(t && t.matriz)}${tdM(t && t.filiais)}${tdM(t && t.valle)}${tdM(t && t.g5)}${tdM(t && t.outros)}</tr>`;
    });
    const lin = (rot, meses, cls) => {
      const g = f => somaGen(meses.map(m => D.ind[m] && D.ind[m][f]), ZI), v = g("val"), r = g("rva"), t = somaGen(meses.map(indMes), ZI);
      return `<tr class="${cls}"><td class="cel-texto">${rot}</td>${tdN(v && v.qtd)}${tdM(v && v.valor)}${tdN(r && r.qtd)}${tdM(r && r.valor)}${tdM(t && t.valor)}${tdM(t && t.matriz)}${tdM(t && t.filiais)}${tdM(t && t.valle)}${tdM(t && t.g5)}${tdM(t && t.outros)}</tr>`;
    };
    h += `</tbody><tfoot>${lin("Total ANTES", J.antes, "cs-tot-antes")}${lin("Total DEPOIS", J.depois, "cs-tot-depois")}</tfoot></table>`;
    return h;
  }

  function tabelaFat(ed, J){
    const cols = ["CTRCs VAL", "Frete VAL", "Vlr. mercad. VAL", "CTRCs RVA", "Frete RVA", "Vlr. mercad. RVA", "CTRCs total", "Frete total", "Vlr. mercad. total"];
    let h = `<table class="cs-table" id="${ed ? "csTabFat" : "csTabFatX"}"><thead><tr><th class="cs-th-mes">Mês</th>${cols.map(t => `<th>${t}</th>`).join("")}</tr></thead><tbody>`;
    h += linhasComMarca(J, 10, c => {
      let r = `<tr class="cs-r-${c.tipo}">${tdMes(c)}`;
      FONTES.forEach(f => { const o = D.fat[c.k] && D.fat[c.k][f];
        r += inp(`fat|${c.k}|${f}|qctrc`, o ? o.qctrc : null, ed) + inpM(`fat|${c.k}|${f}|frete`, o ? o.frete : null, ed) + inpM(`fat|${c.k}|${f}|vlrMerc`, o ? o.vlrMerc : null, ed); });
      const t = fatMes(c.k);
      return r + tdN(t && t.qctrc) + tdM(t && t.frete) + tdM(t && t.vlrMerc) + "</tr>";
    });
    const lin = (rot, meses, cls) => {
      const g = f => somaGen(meses.map(m => D.fat[m] && D.fat[m][f]), ZF), v = g("val"), r = g("rva"), t = somaGen(meses.map(fatMes), ZF);
      return `<tr class="${cls}"><td class="cel-texto">${rot}</td>${tdN(v && v.qctrc)}${tdM(v && v.frete)}${tdM(v && v.vlrMerc)}${tdN(r && r.qctrc)}${tdM(r && r.frete)}${tdM(r && r.vlrMerc)}${tdN(t && t.qctrc)}${tdM(t && t.frete)}${tdM(t && t.vlrMerc)}</tr>`;
    };
    h += `</tbody><tfoot>${lin("Total ANTES", J.antes, "cs-tot-antes")}${lin("Total DEPOIS", J.depois, "cs-tot-depois")}</tfoot></table>`;
    return h;
  }

  // Focal x meses (frete). Linhas = focais da Confirmação de Filiais; colunas = meses da janela.
  function dadosFocal(J){
    return focaisLista().map(t => {
      const porMes = {}; J.cols.forEach(c => { porMes[c.k] = focalMes(c.k, t); });
      const a = mediaMeses(J.antes, m => (porMes[m] != null ? {v:porMes[m]} : null), "v");
      const d = mediaMeses(J.depois, m => (porMes[m] != null ? {v:porMes[m]} : null), "v");
      const pct = (a.media != null && d.media != null && a.media !== 0) ? (d.media - a.media) / a.media * 100 : null;
      return {titulo:t, porMes, a:a.media, d:d.media, pct, tem:J.cols.some(c => porMes[c.k] != null)};
    }).filter(x => x.tem);
  }
  function tabelaFocal(ed, J){
    const dados = dadosFocal(J);
    let h = `<table class="cs-table" id="${ed ? "csTabFocal" : "csTabFocalX"}"><thead><tr><th class="cs-th-mes">Focal</th>`;
    J.cols.forEach((c, i) => { if(i === J.marca) h += `<th class="cs-th-marca">▼ ${fData(D.cfg.entrada)}</th>`; h += `<th class="cs-th-${c.tipo}">${mesRot(c.k)}<br><small>${ROT_TIPO[c.tipo]}</small></th>`; });
    h += `<th>Média antes</th><th>Média depois</th><th>Variação</th></tr></thead><tbody>`;
    if(!dados.length) h += `<tr><td class="cel-texto" colspan="${J.cols.length + 5}">Sem faturamento importado nos meses desta comparação.</td></tr>`;
    dados.forEach(x => {
      h += `<tr><td class="cs-mes cel-texto">${esc(x.titulo)}</td>`;
      J.cols.forEach((c, i) => {
        if(i === J.marca) h += `<td class="cs-marca-col"></td>`;
        h += inpM(`focal|${c.k}|${x.titulo}`, x.porMes[c.k], ed);
      });
      const cl = x.pct == null ? "" : (x.pct >= 0 ? "cs-pos" : "cs-neg");
      h += `${tdM(x.a)}${tdM(x.d)}<td class="cs-n ${cl}">${x.pct == null ? "—" : (x.pct >= 0 ? "+" : "−") + Math.abs(x.pct).toFixed(1).replace(".", ",") + "%"}</td></tr>`;
    });
    // total
    const tot = c => { let t = null; dados.forEach(x => { if(x.porMes[c] != null) t = (t || 0) + x.porMes[c]; }); return t; };
    h += `</tbody><tfoot><tr class="cs-tot-antes"><td class="cel-texto">TOTAL</td>`;
    J.cols.forEach((c, i) => { if(i === J.marca) h += `<td></td>`; h += tdM(tot(c.k)); });
    const ta = mediaMeses(J.antes, m => (tot(m) != null ? {v:tot(m)} : null), "v").media, td = mediaMeses(J.depois, m => (tot(m) != null ? {v:tot(m)} : null), "v").media;
    const tp = (ta != null && td != null && ta !== 0) ? (td - ta) / ta * 100 : null;
    h += `${tdM(ta)}${tdM(td)}<td class="cs-n">${tp == null ? "—" : (tp >= 0 ? "+" : "−") + Math.abs(tp).toFixed(1).replace(".", ",") + "%"}</td></tr></tfoot></table>`;
    return h;
  }

  /* ---------------- sub-abas ---------------- */
  const painel = (titulo, corpo, extra) => `<div class="panel"><div class="panel-header cs-ph"><span>${titulo}</span>${extra || ""}</div><div class="cs-pbody">${corpo}</div></div>`;

  function resumoPeriodoTxt(J){
    const a = J.antes, d = J.depois;
    return `Antes: <b>${mesRot(a[0])}</b> a <b>${mesRot(a[a.length - 1])}</b> · Depois: <b>${mesRot(d[0])}</b> a <b>${mesRot(d[d.length - 1])}</b>`
      + (J.parcial ? ` · <b>${mesRot(J.mesEntrada)}</b> (mês da entrada) fica de fora das médias` : "");
  }

  function subDados(J){
    const c = D.cfg;
    const cfg = `
      <form class="cs-form" id="csCfg" onsubmit="return false">
        <label>Supervisão anterior<input type="text" data-cfg="anterior" value="${esc(c.anterior)}"></label>
        <label>Supervisão atual<input type="text" data-cfg="atual" value="${esc(c.atual)}"></label>
        <label>Data de entrada da atual<input type="date" data-cfg="entrada" value="${esc(c.entrada)}"></label>
        <label>Meses ANTES<input type="number" min="1" max="24" data-cfg="antes" value="${esc(c.antes)}"></label>
        <label>Meses DEPOIS<input type="number" min="1" max="24" data-cfg="depois" value="${esc(c.depois)}"></label>
      </form>
      <p class="cs-hint">${resumoPeriodoTxt(J)}. Mude qualquer campo e a janela de meses se ajusta na hora.</p>`;

    const opcoes = J.cols.map(x => `<option value="${x.k}">${mesRot(x.k)} — ${ROT_TIPO[x.tipo]}</option>`).join("");
    const imp = `
      <div class="cs-imp">
        <label>O que importar
          <select id="csImpTipo"><option value="perf">Performance</option><option value="ind">Indenizações</option><option value="fat">Faturamento</option></select></label>
        <label>Sistema
          <select id="csImpFonte"><option value="val">VAL — Rede Do Valle</option><option value="rva">RVA — Real Vale</option></select></label>
        <label>Mês <span class="cs-sm" id="csImpMesDica"></span>
          <select id="csImpMes">${opcoes}</select></label>
        <label class="cs-imp-arq">Arquivo<input type="file" id="csImpArq" accept=".csv,.sswweb,.txt,text/plain"></label>
        <button type="button" class="btn btn-primary" id="csImpBtn">Importar arquivo</button>
      </div>
      <button type="button" class="link-btn" id="csImpToggle">ou colar o texto manualmente</button>
      <div id="csImpColar" style="display:none">
        <textarea id="csImpTxt" rows="6" placeholder="Cole aqui o conteúdo do arquivo..."></textarea>
        <button type="button" class="btn btn-ghost btn-sm" id="csImpTxtBtn">Importar texto colado</button>
      </div>
      <div class="cs-msg" id="csImpMsg">${esc(msg.ultima || "")}</div>
      <p class="cs-hint">Performance = o mesmo relatório 084 da Performance Geral · Indenizações = o mesmo CSV da aba Indenização · Faturamento = “CTRCs expedidos e recebidos” (o mesmo do Fechamento-RECEITA, CSV ou .sswweb). Reimportar um mês/sistema <b>substitui</b> o que já estava lá. Nas telas Performance, Indenizações e Faturamento você pode corrigir ou digitar os números direto nas células. Indenizações: se o arquivo tiver vários meses, cada indenização cai no mês da data de pagamento; o mês escolhido acima só vale para linhas sem data.</p>`;

    // situação dos dados
    const ok = b => b ? `<span class="cs-ok">✓</span>` : `<span class="cs-no">—</span>`;
    let sit = `<div class="table-wrap"><table class="cs-table cs-sit"><thead><tr><th class="cs-th-mes">Mês</th><th>Perf. VAL</th><th>Perf. RVA</th><th>Indeniz. VAL</th><th>Indeniz. RVA</th><th>Fatur. VAL</th><th>Fatur. RVA</th><th></th></tr></thead><tbody>`;
    sit += linhasComMarca(J, 8, x => `<tr class="cs-r-${x.tipo}">${tdMes(x)}`
      + `<td>${ok(perfFonte(x.k, "val"))}</td><td>${ok(perfFonte(x.k, "rva"))}</td>`
      + `<td>${ok(D.ind[x.k] && D.ind[x.k].val)}</td><td>${ok(D.ind[x.k] && D.ind[x.k].rva)}</td>`
      + `<td>${ok(D.fat[x.k] && D.fat[x.k].val)}</td><td>${ok(D.fat[x.k] && D.fat[x.k].rva)}</td>`
      + `<td><button type="button" class="link-btn danger" data-limpar="${x.k}">limpar mês</button></td></tr>`);
    sit += `</tbody></table></div>`;

    return painel("1 · Período da comparação", cfg)
      + painel("2 · Importar dados de um mês", imp)
      + painel("3 · Situação dos dados na janela", sit);
  }

  /* ---------- Visão Geral: dashboard na tela ---------- */
  const chipCmp = c => `<span class="cs-chip ${c.cls === "bom" ? "bom" : (c.cls === "ruim" ? "ruim" : "")}">${c.seta ? c.seta + " " : ""}${esc(c.txt)}</span>`;
  function mini(m){
    const c = comparar(m.a, m.d, m.tipo, m.melhor);
    return `<div class="cs-mini"><small>${esc(m.nome)}</small><div class="cs-mini-v"><span>${m.a == null ? "—" : m.fmt(m.a)}</span><i>→</i><b>${m.d == null ? "—" : m.fmt(m.d)}</b></div>${chipCmp(c)}</div>`;
  }
  function frente(icone, titulo, sub, m, minis, grafHtml){
    const c = comparar(m.a, m.d, m.tipo, m.melhor);
    return `<div class="cs-front ${c.cls}">
      <div class="cs-front-h"><span class="cs-front-ico">${icone}</span><div><b>${esc(titulo)}</b><small>${esc(sub)}</small></div></div>
      <div class="cs-front-main">
        <div><small>${esc(m.nome)} — depois</small><div class="cs-big">${m.d == null ? "—" : m.fmt(m.d)}</div><div class="cs-antes">antes: <b>${m.a == null ? "—" : m.fmt(m.a)}</b></div></div>
        <div class="cs-delta ${c.cls}"><span>${c.seta || "■"}</span><b>${esc(c.txt)}</b></div>
      </div>
      ${grafHtml}
      <div class="cs-minis">${minis.map(mini).join("")}</div>
    </div>`;
  }
  const ICO = {
    perf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M4 15.5 9.5 10l3.5 3 6-6.5"/></svg>',
    ind:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.3 7 9 4.1-1.7 7-4.8 7-9V6z"/><path d="M12 8.5v6"/></svg>',
    fat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M14.7 9.8c0-1.1-1.2-1.9-2.7-1.9s-2.7.8-2.7 1.8c0 2.6 5.4 1.3 5.4 3.9 0 1-1.2 1.8-2.7 1.8s-2.7-.8-2.7-1.9"/></svg>',
    foc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 11a2.7 2.7 0 1 0 0-5.4"/><path d="M17.5 14.2c2 .5 3 2.2 3 4.8"/></svg>'
  };

  function subGeral(J){
    const M = metricasDash(J);
    const cmps = M.map(m => comparar(m.a, m.d, m.tipo, m.melhor));
    const bons = cmps.filter(c => c.cls === "bom").length, ruins = cmps.filter(c => c.cls === "ruim").length, comDados = cmps.filter(c => c.delta != null).length;
    const seg = M.map((m, i) => `<i class="${cmps[i].cls}" title="${esc(m.nome)}: ${esc(cmps[i].txt)}"></i>`).join("");
    const linha = J.cols.map((c, i) => (i === J.marca ? `<span class="cs-tl-marca" title="Entrada ${fData(D.cfg.entrada)}">▼</span>` : "") + `<span class="cs-tl-mes ${c.tipo}">${mesRot(c.k)}</span>`).join("");
    const hero = `<div class="cs-hero">
      <div class="cs-hero-l">
        <small>IMPACTO DA SUPERVISÃO</small>
        <h3>${esc(D.cfg.anterior)} <i>→</i> ${esc(D.cfg.atual)}</h3>
        <p>Entrada em <b>${fData(D.cfg.entrada)}</b> · ${resumoPeriodoTxt(J).replace(/<\/?b>/g, "")}</p>
        <div class="cs-tl">${linha}</div>
      </div>
      <div class="cs-hero-r">
        <div class="cs-score"><b>${bons}</b><span>de ${comDados || M.length}</span></div>
        <div class="cs-score-t">indicadores melhoraram${ruins ? `<br><em>${ruins} pioraram</em>` : ""}</div>
        <div class="cs-seg">${seg}</div>
      </div>
    </div>`;

    const gp = grafico(graficoBase(J, {tipo:"line", titulo:"Performance por mês", teto:100, W:640, H:250, nomeAntes:"", nomeDepois:"",
      series:[{nome:"VAL", cor:COR.val, vals:J.cols.map(c => perfPct(perfMes(c.k, "val")))}, {nome:"RVA", cor:COR.rva, vals:J.cols.map(c => perfPct(perfMes(c.k, "rva")))}, {nome:"Geral", cor:COR.geral, vals:J.cols.map(c => perfPct(perfMes(c.k, "geral")))}],
      fmtVal:v => fP(v), fmtEixo:v => v.toFixed(0) + "%"}));
    const gi = grafico(graficoBase(J, {tipo:"bar", titulo:"Indenizações por mês", W:640, H:250, nomeAntes:"", nomeDepois:"",
      series:[{nome:"Valor indenizado", cor:"#f0506e", vals:J.cols.map(c => { const t = indMes(c.k); return t ? t.valor : null; })}], fmtVal:fM, fmtCurto:fMc, fmtEixo:fMc}));
    const gf = grafico(graficoBase(J, {tipo:"bar", titulo:"Frete por mês", W:640, H:250, nomeAntes:"", nomeDepois:"",
      series:[{nome:"Frete VAL + RVA", cor:COR.val, vals:J.cols.map(c => { const t = fatMes(c.k); return t ? t.frete : null; })}], fmtVal:fM, fmtCurto:fMc, fmtEixo:fMc}));

    // focais
    const dados = dadosFocal(J).filter(x => x.pct != null).sort((a, b) => b.pct - a.pct);
    const maxAbs = Math.max(1, ...dados.map(x => Math.abs(x.pct)));
    const subiu = dados.filter(x => x.pct >= 0).length;
    const barras = dados.length ? `<div class="cs-bars">${dados.map(x => `<div class="cs-bar-row"><span class="cs-bar-nome" title="${esc(x.titulo)}">${esc(x.titulo)}</span><div class="cs-bar-trilho"><i class="${x.pct >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(x.pct) / maxAbs * 50).toFixed(1)}%;${x.pct >= 0 ? "left:50%" : "right:50%"}"></i></div><b class="${x.pct >= 0 ? "cs-pos" : "cs-neg"}">${(x.pct >= 0 ? "+" : "−") + Math.abs(x.pct).toFixed(1).replace(".", ",")}%</b></div>`).join("")}</div>` : `<div class="cs-vazio">Importe o faturamento dos meses antes e depois para ver a variação por Focal.</div>`;
    const focal = `<div class="cs-front ${dados.length && subiu >= dados.length / 2 ? "bom" : (dados.length ? "ruim" : "neutro")}">
      <div class="cs-front-h"><span class="cs-front-ico">${ICO.foc}</span><div><b>Faturamento por Focal</b><small>variação da média mensal de frete</small></div></div>
      <div class="cs-front-main"><div><small>focais que faturaram mais</small><div class="cs-big">${dados.length ? subiu + " <span>de " + dados.length + "</span>" : "—"}</div></div></div>
      ${barras}</div>`;

    const fr = [
      frente(ICO.perf, "Performance de entregas", "NO PRAZO ÷ (ENTREGUE − ATRASO CLIENTE)", M[0], [M[1], M[2]], gp),
      frente(ICO.ind, "Indenizações", "quanto foi pago por mês — menos é melhor", M[3], [M[4]], gi),
      frente(ICO.fat, "Faturamento", "frete médio por mês (VAL + RVA)", M[5], [M[6], M[7]], gf),
      focal
    ];
    const frases = [M[0], M[3], M[5]].map(m => { const c = comparar(m.a, m.d, m.tipo, m.melhor); if(c.delta == null) return `${m.nome}: faltam dados para comparar.`; return `<b>${esc(m.nome)}</b> ${c.cls === "neutro" ? "ficou estável" : (c.cls === "bom" ? "melhorou" : "piorou")}: ${m.fmt(m.a)} → ${m.fmt(m.d)} (${esc(c.txt)})`; });
    const dica = `<p class="cs-hint">Cada indicador compara a média dos meses <b>antes</b> com a dos meses <b>depois</b> (só meses com dado). Verde = melhorou, vermelho = piorou. Para o Excel de impressão, use <b>Exportar Excel</b>.</p>`;
    return hero + `<div class="cs-frases">${frases.map(f => `<div>${f}</div>`).join("")}</div><div class="cs-grid2">${fr.join("")}</div>` + dica;
  }

  function graficoBase(J, extra){
    return Object.assign({cols:J.cols, marca:J.marca, nomeAntes:D.cfg.anterior, nomeDepois:D.cfg.atual}, extra);
  }

  function subPerf(J){
    const serie = (nome, cor, f) => ({nome, cor, vals:J.cols.map(c => perfPct(perfMes(c.k, f)))});
    const g = grafico(graficoBase(J, {tipo:"line", titulo:"Performance por mês", teto:100,
      series:[serie("VAL", COR.val, "val"), serie("RVA", COR.rva, "rva"), serie("Geral", COR.geral, "geral")],
      fmtVal:v => fP(v), fmtEixo:v => v.toFixed(0) + "%"}));
    const cards = `<div class="cs-cards">${["geral", "val", "rva"].map(f =>
      cartao("PERF % " + (f === "geral" ? "Geral (VAL+RVA)" : FONTE_NOME[f]), perfPct(perfPeriodo(J.antes, f)), perfPct(perfPeriodo(J.depois, f)), {tipo:"pct", fmt:fP})).join("")}</div>`;
    return painel("Performance de entregas — VAL e RVA", cards + g)
      + painel("Números por mês <span class='cs-sm'>(clique na célula para editar)</span>", `<div class="table-wrap">${tabelaPerf(true, J)}</div>
        <p class="cs-hint">PERF % = NO PRAZO ÷ (ENTREGUE − ATRASO CLIENTE), a mesma conta da aba Performance Geral.</p>`);
  }

  function subInd(J){
    const g = grafico(graficoBase(J, {tipo:"bar", titulo:"Indenizações por mês",
      series:[{nome:"Valor indenizado", cor:"#f0506e", vals:J.cols.map(c => { const t = indMes(c.k); return t ? t.valor : null; })}],
      fmtVal:fM, fmtCurto:fMc, fmtEixo:fMc}));
    const m = (ms, c) => mediaMeses(ms, indMes, c);
    const cards = `<div class="cs-cards">
      ${cartao("Valor total / mês", m(J.antes, "valor").media, m(J.depois, "valor").media, {fmt:fMc, melhor:"menor", nota:notaMeses(m(J.antes, "valor").n, m(J.depois, "valor").n)})}
      ${cartao("Quantidade / mês", m(J.antes, "qtd").media, m(J.depois, "qtd").media, {fmt:fN, melhor:"menor"})}
      ${cartao("Matriz / mês", m(J.antes, "matriz").media, m(J.depois, "matriz").media, {fmt:fMc, melhor:"menor"})}
      ${cartao("Filiais / mês", m(J.antes, "filiais").media, m(J.depois, "filiais").media, {fmt:fMc, melhor:"menor"})}
      ${cartao("Do Valle / Real Vale / mês", m(J.antes, "valle").media, m(J.depois, "valle").media, {fmt:fMc, melhor:"menor"})}
    </div>`;
    return painel("Indenizações — quanto foi pago", cards + g)
      + painel("Números por mês <span class='cs-sm'>(quantidade e valor de VAL e RVA são editáveis)</span>", `<div class="table-wrap">${tabelaInd(true, J)}</div>
        <p class="cs-hint">As colunas Matriz / Filiais / Do Valle / G5 / Outros vêm da classificação automática da aba Indenização no momento da importação. Se você editar o valor na mão, elas não mudam.</p>`);
  }

  function subFat(J){
    const g = grafico(graficoBase(J, {tipo:"bar", titulo:"Frete por mês",
      series:[{nome:"VAL", cor:COR.val, vals:J.cols.map(c => D.fat[c.k] && D.fat[c.k].val ? num(D.fat[c.k].val.frete) : null)},
              {nome:"RVA", cor:COR.rva, vals:J.cols.map(c => D.fat[c.k] && D.fat[c.k].rva ? num(D.fat[c.k].rva.frete) : null)}],
      fmtVal:fM, fmtCurto:fMc, fmtEixo:fMc}));
    const m = (ms, c) => mediaMeses(ms, fatMes, c);
    const cards = `<div class="cs-cards">
      ${cartao("Frete (VAL+RVA) / mês", m(J.antes, "frete").media, m(J.depois, "frete").media, {fmt:fMc, nota:notaMeses(m(J.antes, "frete").n, m(J.depois, "frete").n)})}
      ${cartao("CTRCs / mês", m(J.antes, "qctrc").media, m(J.depois, "qctrc").media, {fmt:fN})}
      ${cartao("Valor de mercadoria / mês", m(J.antes, "vlrMerc").media, m(J.depois, "vlrMerc").media, {fmt:fMc})}
    </div>`;
    return painel("Faturamento geral", cards + g)
      + painel("Números por mês <span class='cs-sm'>(clique na célula para editar)</span>", `<div class="table-wrap">${tabelaFat(true, J)}</div>`);
  }

  function subFocal(J){
    const dados = dadosFocal(J);
    const comVar = dados.filter(x => x.pct != null);
    const subiu = comVar.filter(x => x.pct >= 0).length;
    const maxAbs = Math.max(1, ...comVar.map(x => Math.abs(x.pct)));
    const barras = comVar.length ? `<div class="cs-bars">${comVar.slice().sort((a, b) => b.pct - a.pct).map(x => `
      <div class="cs-bar-row"><span class="cs-bar-nome">${esc(x.titulo)}</span>
      <div class="cs-bar-trilho"><i class="${x.pct >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(x.pct) / maxAbs * 50).toFixed(1)}%;${x.pct >= 0 ? "left:50%" : "right:50%"}"></i></div>
      <b class="${x.pct >= 0 ? "cs-pos" : "cs-neg"}">${(x.pct >= 0 ? "+" : "−") + Math.abs(x.pct).toFixed(1).replace(".", ",")}%</b></div>`).join("")}</div>` : `<div class="cs-vazio">Sem dados dos dois lados (antes e depois) para calcular a variação por focal.</div>`;
    const resumo = comVar.length ? `<p class="cs-hint cs-top"><b>${subiu}</b> de <b>${comVar.length}</b> focais faturaram mais (média mensal de frete) depois da entrada da supervisora.</p>` : "";
    return painel("Faturamento (frete) por Focal — variação da média mensal", resumo + barras)
      + painel("Frete por Focal, mês a mês <span class='cs-sm'>(clique para editar)</span>", `<div class="table-wrap">${tabelaFocal(true, J)}</div>
        <p class="cs-hint">Os Focais e as unidades de cada um vêm da aba <b>Confirmação de Filiais</b>. Unidade sem Focal cadastrado cai em "Sem focal". A importação guarda o frete por unidade, então se você mudar o cadastro dos Focais, a tabela se reorganiza sozinha.</p>`);
  }

  /* ---------------- montagem ---------------- */
  function conteudoSub(J){
    switch(sub){
      case "geral": return subGeral(J);
      case "perf": return subPerf(J);
      case "ind": return subInd(J);
      case "fat": return subFat(J);
      case "focal": return subFocal(J);
      default: return subDados(J);
    }
  }

  function renderizar(){
    const raiz = document.getElementById("csRoot");
    if(!raiz) return;
    const J = janela();
    raiz.querySelector("#csSubnav").innerHTML = SUBS.map(t => `<button type="button" class="pg-subtab-btn ${sub === t.id ? "active" : ""}" data-cssub="${t.id}">${t.label}</button>`).join("");
    raiz.querySelector("#csConteudo").innerHTML = conteudoSub(J);
    ligarSub();
  }

  function impactoHTML(){
    return `<div id="csRoot">
      <div class="cs-topo">
        <div>
          <h2 class="section-title">Impacto da Supervisão — Antes × Depois</h2>
          <p class="section-desc">Compara os meses <strong>antes</strong> e <strong>depois</strong> da entrada da nova supervisão: Performance (VAL e RVA), Indenizações e Faturamento (geral e por Focal). Aba independente — tem importação própria, não mexe nas outras telas.</p>
        </div>
        <button type="button" class="btn btn-primary" id="csExportar" title="Baixar todas as comparações em um Excel (.xlsx)">Exportar Excel</button>
      </div>
      <div class="pg-subtabs" id="csSubnav"></div>
      <div id="csConteudo"></div>
    </div>`;
  }

  /* ---------------- eventos ---------------- */
  function setPath(path, valor){
    const p = path.split("|");
    if(p[0] === "focal"){
      const m = p[1], t = p.slice(2).join("|");
      D.fat[m] = D.fat[m] || {};
      D.fat[m].focalOv = D.fat[m].focalOv || {};
      if(valor == null) delete D.fat[m].focalOv[t]; else D.fat[m].focalOv[t] = valor;
      return;
    }
    const [tipo, mes, fonte, campo] = p;
    const raiz = D[tipo];
    raiz[mes] = raiz[mes] || {};
    if(valor == null){
      if(raiz[mes][fonte]){ delete raiz[mes][fonte][campo]; }
      return;
    }
    if(!raiz[mes][fonte]){
      raiz[mes][fonte] = tipo === "perf" ? ZP() : (tipo === "ind" ? ZI() : ZF());
    }
    raiz[mes][fonte][campo] = valor;
  }

  function ligarSub(){
    const raiz = document.getElementById("csRoot");
    raiz.querySelectorAll("[data-cssub]").forEach(b => b.onclick = () => { sub = b.dataset.cssub; renderizar(); });
    raiz.querySelectorAll("input[data-cs]").forEach(i => {
      i.onchange = () => {
        const txt = i.value.trim();
        const v = txt === "" ? null : lerNum(txt);
        if(txt !== "" && v == null){ i.value = ""; return; }
        setPath(i.dataset.cs, v);
        gravar(); renderizar();
      };
      i.onfocus = () => i.select();
    });
    raiz.querySelectorAll("[data-cfg]").forEach(i => {
      i.onchange = () => {
        const k = i.dataset.cfg;
        D.cfg[k] = (k === "antes" || k === "depois") ? Math.max(1, Math.min(24, parseInt(i.value, 10) || 1)) : i.value;
        if(k === "entrada" && !i.value) D.cfg.entrada = padrao().cfg.entrada;
        gravar(); renderizar();
      };
    });
    raiz.querySelectorAll("[data-limpar]").forEach(b => b.onclick = () => {
      const m = b.dataset.limpar;
      if(!confirm("Apagar tudo que está guardado em " + mesRot(m) + " (Performance, Indenizações e Faturamento)?")) return;
      delete D.perf[m]; delete D.ind[m]; delete D.fat[m];
      gravar(); renderizar();
    });
    if(sub === "dados") ligarImportacao();
  }

  function ligarImportacao(){
    const $ = id => document.getElementById(id);
    const dica = () => {
      const t = $("csImpTipo").value;
      $("csImpMesDica").textContent = t === "perf" ? "(detectado do arquivo, se vier)" : (t === "fat" ? "(detectado do período, se vier)" : "(só p/ linhas sem data)");
    };
    $("csImpTipo").onchange = dica; dica();
    $("csImpToggle").onclick = () => { const w = $("csImpColar"); w.style.display = w.style.display === "none" ? "block" : "none"; };
    $("csImpBtn").onclick = async () => {
      const f = $("csImpArq").files[0];
      if(!f){ aviso("Selecione um arquivo."); return; }
      try{ processar(await lerArquivo(f)); $("csImpArq").value = ""; }
      catch(e){ aviso("Não consegui ler o arquivo: " + (e.message || e)); }
    };
    $("csImpTxtBtn").onclick = () => {
      const t = $("csImpTxt").value;
      if(!t.trim()){ aviso("Cole o texto antes de importar."); return; }
      processar(t); $("csImpTxt").value = "";
    };
  }
  function aviso(t, ok){
    msg.ultima = t;
    const el = document.getElementById("csImpMsg");
    if(el){ el.textContent = t; el.className = "cs-msg" + (ok ? " cs-msg-ok" : " cs-msg-err"); }
  }

  function processar(texto){
    const tipo = document.getElementById("csImpTipo").value;
    const fonte = document.getElementById("csImpFonte").value;
    let mes = document.getElementById("csImpMes").value;
    const nome = FONTE_NOME[fonte];
    try{
      if(tipo === "perf"){
        if(typeof parseSswResumoGeral !== "function") return aviso("Leitor de Performance indisponível.");
        const p = parseSswResumoGeral(texto);
        if(!p.encontrouResumo) return aviso("Não achei a seção RESUMO (última página). Confira se é o relatório 084 - Performance de Entregas completo, ou cole só a última página.");
        if(!p.rows.length) return aviso("Não encontrei linhas de unidade na seção RESUMO.");
        const dm = /(\d{1,2})\/(\d{4})/.exec(p.periodo || "");
        if(dm) mes = dm[2] + "-" + dm[1].padStart(2, "0");
        const agg = aggregatePerformanceGeral(p.rows), t = ZP();
        agg.forEach(u => { t.exped += num(u.exped); t.entregue += num(u.entregue); t.noPrazoEnt += num(u.noPrazoEnt); t.atrasCli += num(u.atrasCli); t.atrasTrans += num(u.atrasTrans); });
        D.perf[mes] = D.perf[mes] || {}; D.perf[mes][fonte] = t;
        gravar(); renderizar();
        return aviso(`Performance ${nome} de ${mesRot(mes)} importada: ${agg.length} unidade(s), PERF ${fP(perfPct(t))}.`, true);
      }
      if(tipo === "ind"){
        const api = window.__indenizacao;
        if(!api) return aviso("Leitor de Indenizações indisponível.");
        const p = api.parseIndenizacoes(texto, fonte);
        if(!p.ok) return aviso(nome + ": " + p.erro);
        if(!p.linhas.length) return aviso(nome + ": nenhuma indenização encontrada no arquivo.");
        let manual = {};
        try{ manual = JSON.parse(localStorage.getItem("tambasa_indenizacao_manual") || "{}") || {}; }catch(e){ manual = {}; }
        const porMes = {};
        p.linhas.forEach(r => {
          const c = Object.assign({}, r, api.classificar(r, manual));
          const m = c.indeniz ? c.indeniz.slice(0, 7) : mes;
          (porMes[m] = porMes[m] || []).push(c);
        });
        const ms = Object.keys(porMes).sort();
        ms.forEach(m => {
          const l = porMes[m], s = f => l.filter(x => x.classe === f).reduce((a, x) => a + num(x.valor), 0);
          D.ind[m] = D.ind[m] || {};
          D.ind[m][fonte] = {qtd:l.length, valor:l.reduce((a, x) => a + num(x.valor), 0), matriz:s("matriz"), filiais:s("filial"), valle:s("valle"), g5:s("g5"), outros:s("outros")};
        });
        gravar(); renderizar();
        return aviso(`Indenizações ${nome}: ${p.linhas.length} registro(s) em ${ms.map(mesRot).join(", ")}.`, true);
      }
      if(tipo === "fat"){
        if(typeof parseSswFaturamentoCsv !== "function" || typeof parseSswFaturamentoDetalhado !== "function") return aviso("Leitor de Faturamento indisponível.");
        // mesmo relatório do Fechamento-RECEITA: CSV (;) ou .sswweb / texto
        const p = ehCsvFaturamento(texto) ? parseSswFaturamentoCsv(texto) : parseSswFaturamentoDetalhado(texto);
        if(!p.encontrou) return aviso("Não encontrei linhas de CTRC. Confira se é o relatório \"CTRCs Expedidos e Recebidos\" completo (.sswweb ou CSV).");
        const dm = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(p.periodo || "");
        if(dm) mes = (dm[3].length === 2 ? "20" + dm[3] : dm[3]) + "-" + dm[2].padStart(2, "0");
        const porSigla = {};
        [p.porSigla, p.porPagador].forEach(mp => Object.keys(mp || {}).forEach(s => {
          const o = porSigla[s] = porSigla[s] || {frete:0, vlrMerc:0, qctrc:0};
          o.frete += num(mp[s].frete); o.vlrMerc += num(mp[s].vlrMerc); o.qctrc += num(mp[s].qctrc);
        }));
        const tot = Object.keys(porSigla).reduce((a, k) => ({frete:a.frete + porSigla[k].frete, vlrMerc:a.vlrMerc + porSigla[k].vlrMerc, qctrc:a.qctrc + porSigla[k].qctrc}), {frete:0, vlrMerc:0, qctrc:0});
        D.fat[mes] = D.fat[mes] || {};
        D.fat[mes][fonte] = {frete:tot.frete, vlrMerc:tot.vlrMerc, qctrc:tot.qctrc, porSigla};
        gravar(); renderizar();
        return aviso(`Faturamento ${nome} de ${mesRot(mes)} importado: ${fN(tot.qctrc)} CTRCs, frete ${fM(tot.frete)}.`, true);
      }
    }catch(e){
      console.error(e);
      aviso("Erro ao importar: " + (e.message || e));
    }
  }

  /* ---------------- exportar ---------------- */
  /* =====================================================================
     DASHBOARD DO EXCEL (aba "Dashboard", feita para IMPRIMIR em A4 retrato, 1 página)
     Visual sóbrio: fundo branco, azul-marinho como cor de marca, cinza nos textos de apoio
     e verde/vermelho só onde há julgamento (melhorou / piorou). Gráficos entram como imagem.
     ===================================================================== */
  const X = {navy:"0F1C47", navy2:"1B2A5E", gold:"C99A2E", cinza:"6B7286", linha:"DDE1EE", card:"F7F8FC", txt:"1C2333",
             verde:"1E7D3C", verdeBg:"E6F4EA", verm:"B3261E", vermBg:"FBE9E7", neutroBg:"EEF0F6",
             val:"2B5FA8", rva:"C99A2E", antes:"A3ABC0", depois:"0F1C47", trans:"DCC57F"};
  const FX = "Arial";

  function comparar(antes, depois, tipo, melhor){
    if(antes == null || depois == null) return {txt:"sem dados dos dois lados", cls:"neutro", seta:""};
    const delta = depois - antes;
    let txt;
    if(tipo === "pct") txt = (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(1).replace(".", ",") + " p.p.";
    else if(antes === 0) txt = delta === 0 ? "0%" : "novo";
    else { const p = delta / Math.abs(antes) * 100; txt = (p >= 0 ? "+" : "−") + Math.abs(p).toFixed(1).replace(".", ",") + "%"; }
    const bom = Math.abs(delta) < 1e-9 ? null : ((melhor || "maior") === "maior" ? delta > 0 : delta < 0);
    return {txt, cls:bom == null ? "neutro" : (bom ? "bom" : "ruim"), seta:delta > 1e-9 ? "▲" : (delta < -1e-9 ? "▼" : "■"), delta};
  }

  function metricasDash(J){
    const cont = (ms, f) => ms.filter(m => f(m)).length;
    const nPerf = ms => cont(ms, m => perfMes(m, "geral"));
    const pf = f => ({a:perfPct(perfPeriodo(J.antes, f)), d:perfPct(perfPeriodo(J.depois, f))});
    const med = (g, c) => ({a:mediaMeses(J.antes, g, c), d:mediaMeses(J.depois, g, c)});
    const iv = med(indMes, "valor"), iq = med(indMes, "qtd"), fr = med(fatMes, "frete"), ct = med(fatMes, "qctrc"), vm = med(fatMes, "vlrMerc");
    const nota = (a, d) => `${a}/${J.antes.length} meses antes · ${d}/${J.depois.length} depois`;
    const L = [];
    const pe = (nome, f) => { const r = pf(f); L.push({nome, a:r.a, d:r.d, tipo:"pct", fmt:fP, melhor:"maior", nota:nota(f === "geral" ? nPerf(J.antes) : cont(J.antes, m => perfMes(m, f)), f === "geral" ? nPerf(J.depois) : cont(J.depois, m => perfMes(m, f)))}); };
    pe("Performance Geral", "geral"); pe("Performance VAL", "val"); pe("Performance RVA", "rva");
    L.push({nome:"Indenizações · valor/mês", a:iv.a.media, d:iv.d.media, tipo:"m", fmt:fMc, melhor:"menor", nota:nota(iv.a.n, iv.d.n)});
    L.push({nome:"Indenizações · qtd/mês", a:iq.a.media, d:iq.d.media, tipo:"n", fmt:fN, melhor:"menor", nota:nota(iq.a.n, iq.d.n)});
    L.push({nome:"Faturamento (frete) · mês", a:fr.a.media, d:fr.d.media, tipo:"m", fmt:fMc, melhor:"maior", nota:nota(fr.a.n, fr.d.n)});
    L.push({nome:"CTRCs · mês", a:ct.a.media, d:ct.d.media, tipo:"n", fmt:fN, melhor:"maior", nota:nota(ct.a.n, ct.d.n)});
    L.push({nome:"Valor de mercadoria · mês", a:vm.a.media, d:vm.d.media, tipo:"m", fmt:fMc, melhor:"maior", nota:nota(vm.a.n, vm.d.n)});
    return L;
  }

  /* ---------- gráficos (SVG com estilo embutido -> PNG) ---------- */
  const sv = (w, h, corpo) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial, Helvetica, sans-serif"><rect width="${w}" height="${h}" fill="#fff"/>${corpo}</svg>`;
  const xe = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // eixo com valores "redondos" (0, 10, 20... em vez de 11,8 / 23,5 / 35,3)
  function eixoNice(mn, mx, n){
    const raw = (mx - mn) / n || 1, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const passo = [1, 2, 2.5, 5, 10].map(f => f * mag).find(v => v >= raw);
    const lo = Math.floor(mn / passo + 1e-9) * passo, hi = Math.ceil(mx / passo - 1e-9) * passo, ticks = [];
    for(let v = lo; v <= hi + passo / 2; v += passo) ticks.push(v);
    return {mn:lo, mx:hi, ticks};
  }

  function svgSerie(o){
    const W = o.W, H = o.H, pl = 56, pr = 14, pt = 30, pb = 40, n = o.cols.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
    const todos = []; (o.stack ? [{vals:o.totais}] : o.series).forEach(s => s.vals.forEach(v => { if(v != null) todos.push(v); }));
    if(!todos.length) return sv(W, H, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#6B7286">Sem dados neste período</text>`);
    let mx = Math.max.apply(null, todos), mn = o.tipo === "bar" ? 0 : Math.min.apply(null, todos);
    if(o.tipo === "line"){ const p = (mx - mn) * 0.25 || 1; mn = Math.max(0, mn - p); mx = Math.min(100, mx + p); }
    else mx = mx * 1.1;
    if(mx === mn) mx = mn + 1;
    const nz = eixoNice(mn, mx, 4); mn = nz.mn; mx = nz.mx;
    const y = v => pt + ih - (v - mn) / (mx - mn) * ih;
    const xm = pl + bw * o.marca;
    let s = `<rect x="${pl}" y="${pt}" width="${xm - pl}" height="${ih}" fill="#F4F5F9"/><rect x="${xm}" y="${pt}" width="${W - pr - xm}" height="${ih}" fill="#EEF5F0"/>`;
    s += `<text x="${pl + 6}" y="${pt - 11}" font-size="10" font-weight="bold" fill="#6B7286">ANTES</text><text x="${xm + 6}" y="${pt - 11}" font-size="10" font-weight="bold" fill="#1E7D3C">DEPOIS</text>`;
    for(const v of nz.ticks){
      const yy = y(v);
      s += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="#DDE1EE" stroke-width="1"/><text x="${pl - 7}" y="${yy + 4}" font-size="10" fill="#6B7286" text-anchor="end">${xe(o.fmtEixo(v))}</text>`;
    }
    o.cols.forEach((c, i) => { s += `<text x="${pl + bw * i + bw / 2}" y="${H - 20}" font-size="10" fill="#4B5470" text-anchor="middle">${mesRot(c.k)}</text>`; });
    if(o.tipo === "bar"){
      const g = Math.min(46, bw * 0.62), se = o.series[0];
      if(o.stack){
        o.cols.forEach((c, i) => {
          let acc = 0; const x = pl + bw * i + (bw - g) / 2;
          o.series.forEach(sr => { const v = sr.vals[i]; if(v == null) return; const y0 = y(acc + v), y1 = y(acc);
            s += `<rect x="${x}" y="${y0}" width="${g}" height="${Math.max(0, y1 - y0)}" fill="#${sr.cor}" stroke="#fff" stroke-width="1"/>`; acc += v; });
          if(o.totais[i] != null) s += `<text x="${x + g / 2}" y="${y(acc) - 5}" font-size="10" font-weight="bold" fill="#1C2333" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke">${xe(o.fmtVal(o.totais[i]))}</text>`;
        });
        let lx = pl; o.series.forEach(sr => { s += `<rect x="${lx}" y="${H - 9}" width="14" height="8" fill="#${sr.cor}"/><text x="${lx + 19}" y="${H - 2}" font-size="10" fill="#4B5470">${xe(sr.nome)}</text>`; lx += 70; });
      } else
      se.vals.forEach((v, i) => {
        if(v == null) return;
        const x = pl + bw * i + (bw - g) / 2, yy = y(v), cor = X[o.cols[i].tipo === "antes" ? "antes" : (o.cols[i].tipo === "trans" ? "trans" : "depois")];
        s += `<rect x="${x}" y="${yy}" width="${g}" height="${Math.max(0, pt + ih - yy)}" rx="2" fill="#${cor}"/><text x="${x + g / 2}" y="${yy - 5}" font-size="10" font-weight="bold" fill="#1C2333" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke">${xe(o.fmtVal(v))}</text>`;
      });
      // linhas da média de cada período
      [["antes", o.mediaA, 0, o.marca], ["depois", o.mediaD, o.marca, o.cols.length]].forEach(([k, m, i0, i1]) => {
        if(m == null) return;
        const yy = y(m);
        s += `<line x1="${pl + bw * i0 + 4}" x2="${pl + bw * i1 - 4}" y1="${yy}" y2="${yy}" stroke="#${X.gold}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
      });
    } else {
      o.series.forEach(se => {
        let d = "", up = false;
        se.vals.forEach((v, i) => { if(v == null){ up = false; return; } d += (up ? "L" : "M") + (pl + bw * i + bw / 2).toFixed(1) + " " + y(v).toFixed(1) + " "; up = true; });
        s += `<path d="${d}" fill="none" stroke="#${se.cor}" stroke-width="${se.destaque ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"${se.destaque ? "" : ` stroke-dasharray="${se.tracejado || ""}"`}/>`;
        se.vals.forEach((v, i) => {
          if(v == null) return;
          const cx = pl + bw * i + bw / 2;
          s += `<circle cx="${cx}" cy="${y(v)}" r="${se.destaque ? 4.5 : 3.3}" fill="#${se.cor}" stroke="#fff" stroke-width="1.4"/>`;
          if(se.destaque) s += `<text x="${cx}" y="${y(v) - 11}" font-size="10" font-weight="bold" fill="#${se.cor}" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke">${xe(o.fmtVal(v))}</text>`;
        });
      });
      let lx = pl;
      o.series.forEach(se => { s += `<rect x="${lx}" y="${H - 9}" width="14" height="3" fill="#${se.cor}"/><text x="${lx + 19}" y="${H - 5}" font-size="10" fill="#4B5470">${xe(se.nome)}</text>`; lx += 70; });
    }
    s += `<line x1="${xm}" x2="${xm}" y1="${pt - 4}" y2="${pt + ih}" stroke="#${X.gold}" stroke-width="2" stroke-dasharray="5 4"/>`;
    return sv(W, H, s);
  }

  function svgFocal(itens, W, H){
    if(!itens.length) return sv(W, H, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#6B7286">Sem dados dos dois lados para calcular a variação</text>`);
    const nome = 190, vw = 58, cx = nome + (W - nome - vw) / 2, meia = (W - nome - vw) / 2 - 8;
    const maxAbs = Math.max(1, ...itens.map(x => Math.abs(x.pct))), lh = Math.min(26, (H - 16) / itens.length);
    let s = `<line x1="${cx}" x2="${cx}" y1="4" y2="${H - 4}" stroke="#B6BCCD" stroke-width="1"/>`;
    itens.forEach((x, i) => {
      const yy = 8 + i * lh, w = Math.abs(x.pct) / maxAbs * meia, pos = x.pct >= 0, cor = pos ? X.verde : X.verm;
      const t = x.titulo.length > 30 ? x.titulo.slice(0, 29) + "…" : x.titulo;
      s += `<text x="${nome - 10}" y="${yy + lh / 2 + 3}" font-size="10.5" fill="#1C2333" text-anchor="end">${xe(t)}</text>`;
      s += `<rect x="${pos ? cx : cx - w}" y="${yy + 3}" width="${Math.max(1, w)}" height="${lh - 8}" rx="2" fill="#${cor}"/>`;
      s += `<text x="${W - 4}" y="${yy + lh / 2 + 3}" font-size="10.5" font-weight="bold" fill="#${cor}" text-anchor="end">${(pos ? "+" : "−") + Math.abs(x.pct).toFixed(1).replace(".", ",")}%</text>`;
    });
    return sv(W, H, s);
  }

  function svgParaPng(svg, w, h){
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas"); cv.width = w * 2; cv.height = h * 2;
        const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height);
        ok(cv.toDataURL("image/png").split(",")[1]);
      };
      img.onerror = () => erro(new Error("Falha ao desenhar um gráfico"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  /* ---------- gráficos extras ---------- */
  // antes x depois com "halteres": ponto cinza (antes) ligado ao ponto azul (depois), eixo curto
  function svgHalteres(itens, fmt, W, H){
    const vs = []; itens.forEach(i => { if(i.a != null) vs.push(i.a); if(i.d != null) vs.push(i.d); });
    if(!vs.length) return sv(W, H, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#6B7286">Sem dados</text>`);
    const nz = eixoNice(Math.min.apply(null, vs) - 2, Math.max.apply(null, vs) + 2, 4), pl = 78, pr = 30, pt = 34, pb = 20, iw = W - pl - pr, lh = (H - pt - pb) / itens.length;
    const x = v => pl + (v - nz.mn) / (nz.mx - nz.mn) * iw;
    let s = `<text x="${pl}" y="16" font-size="10" font-weight="bold" fill="#A3ABC0">● ANTES</text><text x="${pl + 80}" y="16" font-size="10" font-weight="bold" fill="#0F1C47">● DEPOIS</text>`;
    nz.ticks.forEach(t => { s += `<line x1="${x(t)}" x2="${x(t)}" y1="${pt - 6}" y2="${H - pb}" stroke="#E6E9F2"/><text x="${x(t)}" y="${H - 6}" font-size="10" fill="#6B7286" text-anchor="middle">${xe(fmt(t))}</text>`; });
    itens.forEach((it, i) => {
      const cy = pt + lh * i + lh / 2;
      s += `<text x="${pl - 10}" y="${cy + 4}" font-size="12" font-weight="bold" fill="#1C2333" text-anchor="end">${xe(it.nome)}</text>`;
      if(it.a != null && it.d != null){
        const bom = it.d >= it.a, cor = bom ? X.verde : X.verm;
        s += `<line x1="${x(it.a)}" x2="${x(it.d)}" y1="${cy}" y2="${cy}" stroke="#${cor}" stroke-width="5" stroke-linecap="round" opacity=".85"/>`;
      }
      if(it.a != null) s += `<circle cx="${x(it.a)}" cy="${cy}" r="8" fill="#A3ABC0" stroke="#fff" stroke-width="2"/><text x="${x(it.a)}" y="${cy + (it.d != null && it.d < it.a ? 24 : -14)}" font-size="11" fill="#6B7286" text-anchor="middle" font-weight="bold">${xe(fmt(it.a))}</text>`;
      if(it.d != null) s += `<circle cx="${x(it.d)}" cy="${cy}" r="9.5" fill="#0F1C47" stroke="#fff" stroke-width="2"/><text x="${x(it.d)}" y="${cy + (it.a != null && it.d < it.a ? -15 : 26)}" font-size="12" fill="#0F1C47" text-anchor="middle" font-weight="bold">${xe(fmt(it.d))}</text>`;
    });
    return sv(W, H, s);
  }

  // composição (média mensal) antes x depois: duas barras horizontais empilhadas
  function svgComposicao(segs, fmt, W, H, nomeA, nomeD){
    const totA = segs.reduce((a, g) => a + num(g.a), 0), totD = segs.reduce((a, g) => a + num(g.d), 0), mx = Math.max(totA, totD);
    if(!mx) return sv(W, H, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13" fill="#6B7286">Sem dados</text>`);
    const pl = 64, pr = 78, iw = W - pl - pr, bh = 44;
    const barra = (y0, rot, campo, tot, cor0) => {
      let s = `<text x="${pl - 8}" y="${y0 + bh / 2 + 4}" font-size="12" font-weight="bold" fill="${cor0}" text-anchor="end">${rot}</text>`, x = pl;
      segs.forEach(g => {
        const w = num(g[campo]) / mx * iw; if(w <= 0) return;
        s += `<rect x="${x}" y="${y0}" width="${w}" height="${bh}" fill="#${g.cor}" stroke="#fff" stroke-width="1.5"/>`;
        if(w > 44) s += `<text x="${x + w / 2}" y="${y0 + bh / 2 + 4}" font-size="10" font-weight="bold" fill="${g.claro ? "#1C2333" : "#fff"}" text-anchor="middle">${xe(fmt(g[campo]))}</text>`;
        x += w;
      });
      return s + `<text x="${x + 6}" y="${y0 + bh / 2 + 4}" font-size="12" font-weight="bold" fill="#1C2333">${xe(fmt(tot))}</text>`;
    };
    let s = barra(34, "ANTES", "a", totA, "#6B7286") + barra(34 + bh + 22, "DEPOIS", "d", totD, "#0F1C47");
    let lx = pl; const ly = H - 26;
    segs.forEach(g => { s += `<rect x="${lx}" y="${ly}" width="11" height="11" fill="#${g.cor}"/><text x="${lx + 16}" y="${ly + 10}" font-size="10.5" fill="#4B5470">${xe(g.nome)}</text>`; lx += 24 + g.nome.length * 6.4; });
    return sv(W, H, s);
  }

  /* ---------- folhas ---------- */
  const PX_COL = 105;                                          // largura de 1 coluna (14,3 caracteres) em px
  function novaFolha(wb, nome, titulo, sub){
    const ws = wb.addWorksheet(nome, {views:[{showGridLines:false}]});
    const NC = 12, C0 = 2, F = {ws, NC, C0, r:1};
    ws.getColumn(1).width = 2; ws.getColumn(NC + 2).width = 2;
    for(let c = C0; c < C0 + NC; c++) ws.getColumn(c).width = 14.3;
    F.fill = hex => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF" + hex}});
    F.lado = (hex, st) => ({style:st || "thin", color:{argb:"FF" + hex}});
    F.alt = (r, h) => { ws.getRow(r).height = h; };
    F.txt = (r, c1, c2, valor, o) => {
      o = o || {};
      if(c2 > c1 || (o.r2 && o.r2 > r)) ws.mergeCells(r, c1, o.r2 || r, c2);
      const cel = ws.getCell(r, c1);
      cel.value = valor;
      cel.font = {name:FX, size:o.tam || 10, bold:!!o.neg, italic:!!o.it, color:{argb:"FF" + (o.cor || X.txt)}};
      cel.alignment = {vertical:"middle", horizontal:o.h || "left", wrapText:!!o.wrap, indent:o.ind || 0};
      if(o.fundo) for(let rr = r; rr <= (o.r2 || r); rr++) for(let cc = c1; cc <= c2; cc++) ws.getCell(rr, cc).fill = F.fill(o.fundo);
      return cel;
    };
    F.secao = (r, c1, c2, t) => { F.txt(r, c1, c2, t, {tam:10, neg:true, cor:X.navy}); for(let c = c1; c <= c2; c++) ws.getCell(r, c).border = {bottom:F.lado(X.navy, "medium")}; };
    // cabeçalho
    F.alt(1, 6);
    F.alt(2, 32); F.txt(2, C0, C0 + NC - 1, "IMPACTO DA SUPERVISÃO  ·  " + titulo, {tam:19, neg:true, cor:"FFFFFF", fundo:X.navy, ind:1});
    F.alt(3, 20); F.txt(3, C0, C0 + NC - 1, sub, {tam:10, cor:"D9DEEF", fundo:X.navy, ind:1});
    F.alt(4, 3); for(let c = C0; c < C0 + NC; c++) ws.getCell(4, c).fill = F.fill(X.gold);
    F.alt(5, 12);
    F.r = 6;
    // imagem de gráfico: ocupa N linhas de 20pt
    F.imagem = (png, col, wpx, hpx, offset) => {
      const n = Math.ceil(hpx / 26.67);
      for(let i = 0; i < n; i++) F.alt(F.r + i, 20);
      ws.addImage(wb.addImage({base64:png, extension:"png"}), {tl:{col:C0 - 1 + col + 0.02, row:F.r - 1 + (offset || 0)}, ext:{width:wpx, height:hpx}});
      return n;
    };
    F.fim = () => {
      F.alt(F.r, 8); F.r++;
      F.alt(F.r, 14); F.txt(F.r, C0, C0 + NC - 1, "Emitido em " + new Date().toLocaleString("pt-BR") + " — Painel de Controle", {tam:8, it:true, cor:X.cinza, h:"right"});
      ws.pageSetup = {paperSize:9, orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:1, horizontalCentered:true,
        margins:{left:0.35, right:0.35, top:0.4, bottom:0.45, header:0.2, footer:0.2}};
      ws.headerFooter = {oddFooter:"&L&8Impacto da Supervisão · Antes × Depois"};   // (sem o nome da aba no rodapé: "&8"+"2 ·..." virava fonte tamanho 82)
      ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + C0 + NC)}${F.r}`;
      ws.properties.tabColor = {argb:"FF" + X.navy};
    };
    return F;
  }

  // cartão grande de indicador: ANTES → DEPOIS + faixa de variação
  function heroCard(F, r0, c0, w, m){
    const cmp = comparar(m.a, m.d, m.tipo, m.melhor), ws = F.ws;
    const corL = cmp.cls === "bom" ? X.verde : (cmp.cls === "ruim" ? X.verm : X.cinza), bgV = cmp.cls === "bom" ? X.verdeBg : (cmp.cls === "ruim" ? X.vermBg : X.neutroBg);
    [20, 12, 38, 24, 14].forEach((h, i) => F.alt(r0 + i, h));
    for(let i = 0; i < 5; i++) for(let c = c0; c < c0 + w; c++){
      const cel = ws.getCell(r0 + i, c); cel.fill = F.fill(X.card);
      const b = {}; if(c === c0) b.left = F.lado(corL, "thick"); if(c === c0 + w - 1) b.right = F.lado("FFFFFF", "thick");
      if(i === 0) b.top = F.lado(X.linha); if(i === 4) b.bottom = F.lado(X.linha); cel.border = b;
    }
    const meio = c0 + Math.floor(w / 2) - 1;
    F.txt(r0, c0, c0 + w - 1, m.nome.toUpperCase(), {tam:9, neg:true, cor:X.cinza, ind:1});
    F.txt(r0 + 1, c0, meio, "ANTES", {tam:7, cor:X.cinza, ind:1}); F.txt(r0 + 1, meio + 1, c0 + w - 1, "DEPOIS", {tam:7, cor:X.cinza, ind:1});
    F.txt(r0 + 2, c0, meio, (m.a == null ? "—" : m.fmt(m.a)) + "   →", {tam:15, neg:true, cor:"8A93AB", ind:1});
    F.txt(r0 + 2, meio + 1, c0 + w - 1, m.d == null ? "—" : m.fmt(m.d), {tam:24, neg:true, cor:X.navy, ind:1});
    F.txt(r0 + 3, c0, c0 + w - 1, cmp.seta ? `${cmp.seta}  ${cmp.txt}` : cmp.txt, {tam:13, neg:true, cor:corL, h:"center", fundo:bgV});
    F.txt(r0 + 4, c0, c0 + w - 1, m.nota, {tam:7, it:true, cor:X.cinza, ind:1});
  }

  function tabelaMeses(F, colunas, linhasFn, J){
    // colunas: [{t, c1, c2, h}], linhasFn(c) -> array de valores
    const r0 = F.r;
    F.alt(r0, 20); colunas.forEach(k => F.txt(r0, k.c1, k.c2, k.t.toUpperCase(), {tam:8, neg:true, cor:"FFFFFF", fundo:X.navy2, h:k.h || "right", ind:k.h === "left" || (k.h || "right") === "right" ? 1 : 0}));
    F.r++;
    J.cols.forEach((c, i) => {
      if(i === J.marca){ F.alt(F.r, 14); F.txt(F.r, F.C0, F.C0 + F.NC - 1, `▼  ENTRADA DA SUPERVISORA  ·  ${fData(D.cfg.entrada)}  ▼`, {tam:8, neg:true, cor:X.navy, fundo:X.gold, h:"center"}); F.r++; }
      const bg = c.tipo === "antes" ? "F4F5F9" : (c.tipo === "trans" ? "FBF3DC" : "ECF4EE");
      F.alt(F.r, 17);
      const v = linhasFn(c);
      colunas.forEach((k, j) => F.txt(F.r, k.c1, k.c2, v[j], {tam:9, neg:j === 0, cor:j === 0 ? X.navy : X.txt, fundo:bg, h:k.h || "right", ind:k.h === "left" || (k.h || "right") === "right" ? 1 : 0}));
      for(let cc = F.C0; cc < F.C0 + F.NC; cc++) F.ws.getCell(F.r, cc).border = {bottom:F.lado("FFFFFF")};
      F.r++;
    });
  }

  /* ---------- montagem do Excel ---------- */
  async function montarDashboardXL(wb, J){
    const M = metricasDash(J);
    const sub = `${D.cfg.anterior}  →  ${D.cfg.atual}   |   entrada em ${fData(D.cfg.entrada)}   |   Antes: ${mesRot(J.antes[0])} a ${mesRot(J.antes[J.antes.length - 1])}   ·   Depois: ${mesRot(J.depois[0])} a ${mesRot(J.depois[J.depois.length - 1])}`;
    const png = (svg, w, h) => svgParaPng(svg, w, h);
    const base = (w, h) => ({cols:J.cols, marca:J.marca, W:w, H:h});
    const dadosPerf = f => J.cols.map(c => perfPct(perfMes(c.k, f)));
    const totInd = m => { const t = indMes(m); return t ? {x:t.valor} : null; }, totFat = m => { const t = fatMes(m); return t ? {x:t.frete} : null; };
    const serInd = () => J.cols.map(c => { const t = indMes(c.k); return t ? t.valor : null; });
    const serFat = f => J.cols.map(c => { const o = f === "tot" ? fatMes(c.k) : (D.fat[c.k] && D.fat[c.k][f]); return o ? num(o.frete) : null; });
    const perfSeries = () => [{nome:"VAL", cor:X.val, vals:dadosPerf("val")}, {nome:"RVA", cor:X.rva, vals:dadosPerf("rva")}, {nome:"Geral", cor:X.navy, vals:dadosPerf("geral"), destaque:true}];
    let fo = dadosFocal(J).filter(x => x.pct != null).sort((a, b) => b.pct - a.pct);
    const focais = fo.length > 12 ? fo.slice(0, 6).concat(fo.slice(-6)) : fo;
    const med = (g, c) => ({a:mediaMeses(J.antes, g, c).media, d:mediaMeses(J.depois, g, c).media});
    const pctTxt = p => (p >= 0 ? "+" : "−") + Math.abs(p).toFixed(1).replace(".", ",") + "%";

    /* ===== 1 · VISÃO GERAL ===== */
    {
      const F = novaFolha(wb, "1 · Visão Geral", "VISÃO GERAL", sub), C0 = F.C0 || 2;
      F.C0 = 2;
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "O QUE MUDOU  (média dos meses antes × média dos meses depois)"); F.r += 2; F.alt(F.r - 1, 6);
      const pilar = (c0, titulo, principal, linhas, svg) => {
        const cmp = comparar(principal.a, principal.d, principal.tipo, principal.melhor), r0 = F.r;
        const cor = cmp.cls === "bom" ? X.verde : (cmp.cls === "ruim" ? X.verm : X.cinza), bg = cmp.cls === "bom" ? X.verdeBg : (cmp.cls === "ruim" ? X.vermBg : X.neutroBg);
        F.alt(r0, 22); F.txt(r0, c0, c0 + 3, titulo, {tam:11, neg:true, cor:"FFFFFF", fundo:X.navy, ind:1});
        F.alt(r0 + 1, 48); F.txt(r0 + 1, c0, c0 + 3, cmp.seta ? `${cmp.seta} ${cmp.txt}` : cmp.txt, {tam:30, neg:true, cor, fundo:bg, h:"center"});
        F.alt(r0 + 2, 18); F.txt(r0 + 2, c0, c0 + 3, principal.nome + (cmp.cls === "bom" ? " · melhorou" : (cmp.cls === "ruim" ? " · piorou" : "")), {tam:9, neg:true, cor, fundo:bg, h:"center"});
        linhas.forEach((l, i) => {
          F.alt(r0 + 3 + i, 17);
          F.txt(r0 + 3 + i, c0, c0 + 1, l[0], {tam:9, cor:X.cinza, fundo:X.card, ind:1});
          F.txt(r0 + 3 + i, c0 + 2, c0 + 3, l[1], {tam:9, neg:true, cor:X.navy, fundo:X.card, h:"right", ind:1});
        });
      };
      const r0 = F.r;
      pilar(2, "PERFORMANCE DE ENTREGAS", M[0], [["PERF Geral", `${fP(M[0].a)} → ${fP(M[0].d)}`], ["VAL", `${fP(M[1].a)} → ${fP(M[1].d)}`], ["RVA", `${fP(M[2].a)} → ${fP(M[2].d)}`]]);
      F.r = r0; pilar(6, "INDENIZAÇÕES", M[3], [["Valor / mês", `${fMc(M[3].a)} → ${fMc(M[3].d)}`], ["Qtd / mês", `${fN(M[4].a)} → ${fN(M[4].d)}`], ["Menos é melhor", ""]]);
      F.r = r0; pilar(10, "FATURAMENTO", M[5], [["Frete / mês", `${fMc(M[5].a)} → ${fMc(M[5].d)}`], ["CTRCs / mês", `${fN(M[6].a)} → ${fN(M[6].d)}`], ["Vlr. mercadoria / mês", `${fMc(M[7].a)} → ${fMc(M[7].d)}`]]);
      F.r = r0 + 6; F.alt(F.r++, 8);
      // 3 mini-gráficos
      const w3 = 412, h3 = 213;
      const g1 = svgSerie(Object.assign(base(w3, h3), {tipo:"line", fmtVal:fP, fmtEixo:v => v.toFixed(0) + "%", series:[{nome:"Geral", cor:X.navy, vals:dadosPerf("geral"), destaque:true}]}));
      const g2 = svgSerie(Object.assign(base(w3, h3), {tipo:"bar", fmtVal:fMc, fmtEixo:fMc, series:[{vals:serInd()}], mediaA:mediaMeses(J.antes, totInd, "x").media, mediaD:mediaMeses(J.depois, totInd, "x").media}));
      const g3 = svgSerie(Object.assign(base(w3, h3), {tipo:"bar", fmtVal:fMc, fmtEixo:fMc, series:[{vals:serFat("tot")}], mediaA:mediaMeses(J.antes, totFat, "x").media, mediaD:mediaMeses(J.depois, totFat, "x").media}));
      const ps = await Promise.all([png(g1, w3, h3), png(g2, w3, h3), png(g3, w3, h3)]);
      const rr = F.r; F.imagem(ps[0], 0, w3, h3); F.imagem(ps[1], 4, w3, h3); F.imagem(ps[2], 8, w3, h3);
      F.r = rr + Math.ceil(h3 / 26.67); F.alt(F.r++, 8); F.alt(F.r++, 10);
      // leitura rápida
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "LEITURA RÁPIDA"); F.r += 2; F.alt(F.r - 1, 4);
      const frase = m => { const c = comparar(m.a, m.d, m.tipo, m.melhor); if(m.a == null || m.d == null) return `${m.nome}: faltam dados em um dos períodos.`;
        return `${m.nome} ${c.cls === "neutro" ? "ficou estável" : (c.cls === "bom" ? "melhorou" : "piorou")}: ${m.fmt(m.a)} → ${m.fmt(m.d)} (${c.txt}).`; };
      const linhas = [frase(M[0]), frase(M[3]), frase(M[5])];
      if(fo.length) linhas.push(`Faturamento por Focal — maior alta: ${fo[0].titulo} (${pctTxt(fo[0].pct)}); maior queda: ${fo[fo.length - 1].titulo} (${pctTxt(fo[fo.length - 1].pct)}).`);
      const cob = (ms, f) => ms.filter(f).length;
      const nA = Math.min(cob(J.antes, m => perfMes(m, "geral")), cob(J.antes, indMes), cob(J.antes, fatMes)), nD = Math.min(cob(J.depois, m => perfMes(m, "geral")), cob(J.depois, indMes), cob(J.depois, fatMes));
      if(nA < J.antes.length || nD < J.depois.length) linhas.push(`Atenção: nem todos os meses têm dado nos três indicadores (menor cobertura: ${nA}/${J.antes.length} antes e ${nD}/${J.depois.length} depois). As médias usam só os meses com dado.`);
      linhas.forEach(t => { F.alt(F.r, 17); F.txt(F.r, 2, 13, "•  " + t, {tam:10, wrap:true, ind:1}); F.r++; });
      F.fim();
    }

    /* ===== 2 · PERFORMANCE ===== */
    {
      const F = novaFolha(wb, "2 · Performance", "PERFORMANCE DE ENTREGAS", sub);
      F.C0 = 2;
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "PERF % = NO PRAZO ÷ (ENTREGUE − ATRASO CLIENTE)  ·  total de cada período"); F.r += 2; F.alt(F.r - 1, 6);
      [[M[0], 2], [M[1], 6], [M[2], 10]].forEach(([m, c]) => heroCard(F, F.r, c, 4, m)); F.r += 5; F.alt(F.r++, 10);
      F.alt(F.r, 18); F.secao(F.r, 2, 9, "EVOLUÇÃO MENSAL"); F.secao(F.r, 10, 13, "ANTES × DEPOIS"); F.r += 2; F.alt(F.r - 1, 4);
      const wA = 835, wB = 410, h = 267;
      const gA = svgSerie(Object.assign(base(wA, h), {tipo:"line", fmtVal:fP, fmtEixo:v => v.toFixed(0) + "%", series:perfSeries()}));
      const gB = svgHalteres([{nome:"Geral", a:M[0].a, d:M[0].d}, {nome:"VAL", a:M[1].a, d:M[1].d}, {nome:"RVA", a:M[2].a, d:M[2].d}], fP, wB, h);
      const ps = await Promise.all([png(gA, wA, h), png(gB, wB, h)]);
      const rr = F.r; F.imagem(ps[0], 0, wA, h); F.imagem(ps[1], 8, wB, h); F.r = rr + Math.ceil(h / 26.67); F.alt(F.r++, 8); F.alt(F.r++, 10);
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "NÚMEROS MÊS A MÊS"); F.r += 2; F.alt(F.r - 1, 4);
      tabelaMeses(F, [{t:"Mês", c1:2, c2:3, h:"left"}, {t:"Período", c1:4, c2:4, h:"center"}, {t:"PERF VAL", c1:5, c2:6}, {t:"PERF RVA", c1:7, c2:8}, {t:"PERF Geral", c1:9, c2:10}, {t:"Entregues", c1:11, c2:11}, {t:"Atrasos", c1:12, c2:13}],
        c => { const g = perfMes(c.k, "geral"); return [mesRot(c.k), ROT_TIPO[c.tipo], fP(perfPct(perfMes(c.k, "val"))), fP(perfPct(perfMes(c.k, "rva"))), fP(perfPct(g)), g ? fN(g.entregue) : "—", g ? fN(g.atrasCli + g.atrasTrans) : "—"]; }, J);
      F.fim();
    }

    /* ===== 3 · INDENIZAÇÕES ===== */
    {
      const F = novaFolha(wb, "3 · Indenizações", "INDENIZAÇÕES", sub);
      F.C0 = 2;
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "QUANTO FOI PAGO DE INDENIZAÇÃO  ·  menos é melhor"); F.r += 2; F.alt(F.r - 1, 6);
      const pago = {a:null, d:null}, ma = med(indMes, "matriz"), fa = med(indMes, "filiais");
      if(ma.a != null && fa.a != null) pago.a = ma.a + fa.a; if(ma.d != null && fa.d != null) pago.d = ma.d + fa.d;
      heroCard(F, F.r, 2, 4, M[3]); heroCard(F, F.r, 6, 4, M[4]);
      heroCard(F, F.r, 10, 4, {nome:"Pago pela operação (Matriz + Filiais) / mês", a:pago.a, d:pago.d, tipo:"m", fmt:fMc, melhor:"menor", nota:M[3].nota});
      F.r += 5; F.alt(F.r++, 10);
      F.alt(F.r, 18); F.secao(F.r, 2, 9, "VALOR INDENIZADO POR MÊS"); F.secao(F.r, 10, 13, "QUEM PAGOU  (média mensal)"); F.r += 2; F.alt(F.r - 1, 4);
      const wA = 835, wB = 410, h = 267;
      const gA = svgSerie(Object.assign(base(wA, h), {tipo:"bar", fmtVal:fMc, fmtEixo:fMc, series:[{vals:serInd()}], mediaA:mediaMeses(J.antes, totInd, "x").media, mediaD:mediaMeses(J.depois, totInd, "x").media}));
      const cls = [["Matriz", "matriz", "0F1C47"], ["Filiais", "filiais", "3F5A9E"], ["Valle/Real Vale", "valle", "8EA2CE"], ["G5", "g5", "C99A2E"], ["Outros", "outros", "D5D9E6", 1]];
      const segs = cls.map(([nome, c, cor, claro]) => { const m = med(indMes, c); return {nome, cor, claro:!!claro || c === "valle", a:m.a, d:m.d}; });
      const gB = svgComposicao(segs, fMc, wB, h, "", "");
      const ps = await Promise.all([png(gA, wA, h), png(gB, wB, h)]);
      const rr = F.r; F.imagem(ps[0], 0, wA, h); F.imagem(ps[1], 8, wB, h); F.r = rr + Math.ceil(h / 26.67); F.alt(F.r++, 8); F.alt(F.r++, 10);
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "NÚMEROS MÊS A MÊS"); F.r += 2; F.alt(F.r - 1, 4);
      tabelaMeses(F, [{t:"Mês", c1:2, c2:3, h:"left"}, {t:"Período", c1:4, c2:4, h:"center"}, {t:"Qtd", c1:5, c2:5}, {t:"Valor total", c1:6, c2:7}, {t:"Matriz", c1:8, c2:8}, {t:"Filiais", c1:9, c2:9}, {t:"Valle/RV", c1:10, c2:10}, {t:"G5", c1:11, c2:11}, {t:"Outros", c1:12, c2:13}],
        c => { const t = indMes(c.k); const f = k => t ? fMc(t[k]) : "—"; return [mesRot(c.k), ROT_TIPO[c.tipo], t ? fN(t.qtd) : "—", f("valor"), f("matriz"), f("filiais"), f("valle"), f("g5"), f("outros")]; }, J);
      F.fim();
    }

    /* ===== 4 · FATURAMENTO ===== */
    {
      const F = novaFolha(wb, "4 · Faturamento", "FATURAMENTO", sub);
      F.C0 = 2;
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "FRETE FATURADO (VAL + RVA)  ·  média mensal antes × depois"); F.r += 2; F.alt(F.r - 1, 6);
      [[M[5], 2], [M[6], 6], [M[7], 10]].forEach(([m, c]) => heroCard(F, F.r, c, 4, m)); F.r += 5; F.alt(F.r++, 10);
      F.alt(F.r, 18); F.secao(F.r, 2, 9, "FRETE POR MÊS · VAL e RVA"); F.secao(F.r, 10, 13, "PESO DE CADA SISTEMA  (frete médio/mês)"); F.r += 2; F.alt(F.r - 1, 4);
      const wA = 835, wB = 410, h = 240;
      const sv1 = serFat("val"), sv2 = serFat("rva");
      const gA = svgSerie(Object.assign(base(wA, h), {tipo:"bar", stack:true, fmtVal:fMc, fmtEixo:fMc, series:[{nome:"VAL", cor:X.navy, vals:sv1}, {nome:"RVA", cor:X.rva, vals:sv2}], totais:serFat("tot"),
        mediaA:mediaMeses(J.antes, totFat, "x").media, mediaD:mediaMeses(J.depois, totFat, "x").media}));
      const gv = f => m => (D.fat[m] && D.fat[m][f]) || null;
      const va = {a:mediaMeses(J.antes, gv("val"), "frete").media, d:mediaMeses(J.depois, gv("val"), "frete").media}, ra = {a:mediaMeses(J.antes, gv("rva"), "frete").media, d:mediaMeses(J.depois, gv("rva"), "frete").media};
      const gB = svgComposicao([{nome:"VAL", cor:X.navy, a:va.a, d:va.d}, {nome:"RVA", cor:X.rva, a:ra.a, d:ra.d, claro:true}], fMc, wB, h, "", "");
      const ps = await Promise.all([png(gA, wA, h), png(gB, wB, h)]);
      const rr = F.r; F.imagem(ps[0], 0, wA, h); F.imagem(ps[1], 8, wB, h); F.r = rr + Math.ceil(h / 26.67); F.alt(F.r++, 8); F.alt(F.r++, 10);
      F.alt(F.r, 18); F.secao(F.r, 2, 13, "VARIAÇÃO DO FRETE POR FOCAL  (média mensal depois × antes)"); F.r += 2; F.alt(F.r - 1, 4);
      const hf = Math.max(120, Math.min(300, 26 * Math.max(1, focais.length) + 16)), wf = 1245;
      const gF = svgFocal(focais, wf, hf);
      const pf = await png(gF, wf, hf);
      F.imagem(pf, 0, wf, hf); F.r += Math.ceil(hf / 26.67);
      F.fim();
    }
  }

  async function exportar(){
    const J = janela();
    const area = document.createElement("div");
    area.className = "cs-export-area";
    area.innerHTML = `<div id="csExpRoot">${tabelaPerf(false, J)}${tabelaInd(false, J)}${tabelaFat(false, J)}${tabelaFocal(false, J)}</div>`;
    document.body.appendChild(area);
    const sub = `${D.cfg.anterior} × ${D.cfg.atual} · entrada em ${fData(D.cfg.entrada)} · ${resumoTxtPlano(J)}`;
    const rod = "Antes e depois da supervisão — Painel de Controle";
    try{
      if(typeof exportarTabelasExcel !== "function"){ alert("Exportador de Excel indisponível."); return; }
      await exportarTabelasExcel([
        {nome:"Dados Performance", titulo:"Performance (VAL e RVA) — antes x depois", subtitulo:sub, tabela:area.querySelector("#csTabPerfX"), rodape:rod},
        {nome:"Dados Indenizações", titulo:"Indenizações — antes x depois", subtitulo:sub, tabela:area.querySelector("#csTabIndX"), rodape:rod},
        {nome:"Dados Faturamento", titulo:"Faturamento Geral — antes x depois", subtitulo:sub, tabela:area.querySelector("#csTabFatX"), rodape:rod},
        {nome:"Dados Fat. por Focal", titulo:"Faturamento (frete) por Focal — antes x depois", subtitulo:sub, tabela:area.querySelector("#csTabFocalX"), rodape:rod}
      ], `Impacto_Supervisao_${(typeof dataParaArquivo === "function") ? dataParaArquivo() : new Date().toISOString().slice(0, 10)}.xlsx`,
      {antes: wb => montarDashboardXL(wb, J)});
    } finally { area.remove(); }
  }
  const resumoTxtPlano = J => `antes ${mesRot(J.antes[0])}–${mesRot(J.antes[J.antes.length - 1])}, depois ${mesRot(J.depois[0])}–${mesRot(J.depois[J.depois.length - 1])}`;

  window.impactoSupervisaoHTML = impactoHTML;
  window.attachImpactoSupervisao = function(){
    const b = document.getElementById("csExportar");
    if(b) b.onclick = exportar;
    renderizar();
  };
  window.impactoSupervisaoRefresh = renderizar;
})();
