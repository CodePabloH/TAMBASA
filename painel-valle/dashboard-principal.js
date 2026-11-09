/* Dashboard principal — visual interativo (cartões coloridos, gráfico, rosquinhas, anéis).
   Usa os mesmos dados das demais abas; só a apresentação mudou. */
let dpAba = (() => { try{ return LS.getItem("painel_dp_aba") || "resumo"; }catch(e){ return "resumo"; } })(), dpPeriod = 30, dpHidden = new Set(), dpFiltro = "todas", dpD = null, dpTimer = null, dpDon = {}, dpU = [], dpSort = {k:"sla", d:1}, dpBusca = "";
const DPC = {ok:"#4f9d2d", blue:"#3d86c6", red:"#d9534f", org:"#e2ad45", navy:"#141a14", pal:["#3d86c6","#4f9d2d","#e2ad45","#d9534f","#7a6bd1","#9aa595"]};

function dpBrl(v){
  const a = Math.abs(v || 0);
  if(a >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2}) + " Mi";
  if(a >= 1e4) return "R$ " + (v / 1e3).toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1}) + " mil";
  return "R$ " + money(v);
}

function dpData(){
  const hoje = todayISO(), trocas = load(KEYS.trocas), boletos = load(KEYS.boletos), pend = load(KEYS.pendencias);
  const conf = ensureConfirmacoes(), atr = load(KEYS.atrasos);
  const tAb = trocas.filter(t => t.devolvido !== "sim");
  const tAt = tAb.filter(t => daysDiff(hoje, t.dataLimite) < 0);
  const bAt = boletos.filter(b => b.prevencao !== "sim" && daysDiff(hoje, b.dataLimiteProcesso) < 0);
  const itens = [];
  tAb.forEach(t => { const d = daysDiff(hoje, t.dataLimite); if(d <= 2) itens.push({tipo:"Troca", ref:t.nf, filial:t.filial || "-", d, tab:"trocas"}); });
  boletos.forEach(b => { if(b.prevencao === "sim") return; const d = daysDiff(hoje, b.dataLimiteProcesso); if(d <= 2) itens.push({tipo:"Boleto", ref:b.nf, filial:"-", d, tab:"boletos"}); });
  itens.sort((a,b) => a.d - b.d);
  return {hoje, trocas, boletos, pend, conf, atr, tAb, tAt, bAt, itens,
    pAb: pend.filter(p => p.resolvido !== "sim"), env: conf.filter(c => c.enviado === "sim").length,
    crit: atr.filter(d => (Number(d.diasAtraso)||0) > 5).length,
    deb: boletos.reduce((s,b) => s + (Number(b.valor)||0), 0), perf: load(KEYS.performance)};
}

function dpKpi(go, g1, g2, icon, label, count, fmt, badge){
  return `<button type="button" class="dp-kpi" data-go="${go}" style="--g1:${g1};--g2:${g2}">
    <span class="dp-kpi-ico">${NAV_ICONS[icon] || ""}</span>
    <span class="dp-kpi-txt"><em>${label}</em><b><i data-count="${count}" data-format="${fmt}">0</i></b><small>${badge}</small></span></button>`;
}

function dpRing(pct, cor, val, label){
  const p = Math.max(0, Math.min(100, pct || 0)), C = 2 * Math.PI * 38;
  return `<div class="dp-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" class="bg"/>
    <circle cx="50" cy="50" r="38" class="fg" stroke="${cor}" stroke-dasharray="${(p/100*C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
    <div><small>${label}</small><b>${val}</b></div></div>`;
}

function dpDonut(id, dados, vazio){
  const tot = dados.reduce((s,x) => s + x.v, 0);
  if(!tot) return `<div class="dp-empty">${vazio}</div>`;
  dpDon[id] = {dados, tot};
  const r = 52, C = 2 * Math.PI * r; let off = 0;
  const segs = dados.map((x,i) => { const len = x.v / tot * C;
    const s = `<circle class="dp-seg" data-d="${id}" data-i="${i}" cx="70" cy="70" r="${r}" stroke="${x.cor}" stroke-dasharray="${Math.max(len-2,0.5)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len; return s; }).join("");
  return `<div class="dp-donut-wrap"><div class="dp-donut"><svg viewBox="0 0 140 140"><g transform="rotate(-90 70 70)">${segs}</g></svg>
    <div class="dp-donut-c" id="dc-${id}"><b>${tot}</b><small>total</small></div></div>
    <ul class="dp-leg">${dados.map((x,i) => `<li data-d="${id}" data-i="${i}"><i style="background:${x.cor}"></i><span>${escHtml(x.nome)}</span><b>${x.v}</b></li>`).join("")}</ul></div>`;
}

/* ===== v3.0 — Central de comando da operação (sem SAC) ===== */
function dpGauge(p, cor){
  const L = Math.PI * 80, v = p === null || p === undefined ? 0 : Math.max(0, Math.min(100, p)), a = Math.PI * 0.02;
  const x1 = 100 + 68 * Math.cos(a), y1 = 100 - 68 * Math.sin(a), x2 = 100 + 93 * Math.cos(a), y2 = 100 - 93 * Math.sin(a);
  return `<svg viewBox="0 0 200 120"><path d="M20,100 A80,80 0 0 1 180,100" class="gbg"/><path d="M20,100 A80,80 0 0 1 180,100" class="gfg" stroke="${cor}" style="--L:${L.toFixed(1)};--v:${(v / 100 * L).toFixed(1)}"/>
    <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="gm"/><text x="100" y="92" class="gv">${p === null || p === undefined ? "—" : fmtPct(p)}</text><text x="100" y="112" class="gt">SLA da rede · meta 98%</text></svg>`;
}

/* Uma linha por unidade (sigla), juntando performance, atrasos (150), ocorrência 69, trocas, pendências e faturamento */
function dpUnidades(D, unids){
  const val = load(KEYS.performanceGeralVal), rva = load(KEYS.performanceGeralRva), ok = x => !!(x && Array.isArray(x.unidades) && x.unidades.length);
  const pd = (ok(val) || ok(rva)) ? mesclarPerformanceGeral(ok(val) ? val : null, ok(rva) ? rva : null) : null, M = {};
  const g = s => { s = String(s || "").trim().toUpperCase(); if(!s) return null; return M[s] = M[s] || {sigla:s, cidade:"", sla:null, entregue:0, total:0, abAtr:0, atr:0, atr5:0, o69:0, tr:0, pend:0, fat:0}; };
  if(pd) pd.unidades.forEach(u => { const m = g(u.sigla); if(!m) return; m.cidade = u.destino || ""; m.sla = u.sla; m.entregue = u.entregue || 0; m.total = u.total || 0; m.abAtr = u.abertoAtrasado || 0; });
  D.atr.forEach(a => { const m = g(a.unidade); if(m){ m.atr++; if((Number(a.diasAtraso) || 0) > 5) m.atr5++; } });
  load(KEYS.ocorrencias).forEach(o => { const m = g(o.unidade); if(m) m.o69++; });
  D.tAb.forEach(t => { const m = g(t.filial); if(m) m.tr++; });
  D.pAb.forEach(p => { const m = g(p.filial); if(m) m.pend++; });
  unids.forEach(u => { const m = g(u.sigla); if(m){ m.fat = u.frete; if(!m.cidade) m.cidade = u.cidade || ""; } });
  return {pd, lista:Object.values(M)};
}

function dashboardHTML(){
  dpDon = {}; dpD = dpData(); const D = dpD;
  if(dpAba === "sacs") return dpSacsHTML();
  const tipos = {}; D.pAb.forEach(p => { const k = p.tipo || "Outros"; tipos[k] = (tipos[k] || 0) + 1; });
  const dTipos = Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([n, v], i) => ({nome:n, v, cor:DPC.pal[i % 6]}));
  const fil = {}; D.tAb.forEach(t => { const k = t.filial || "—"; fil[k] = (fil[k] || 0) + 1; });
  const fl = Object.entries(fil).sort((a, b) => b[1] - a[1]), rest = fl.slice(5).reduce((s, x) => s + x[1], 0);
  const dFil = fl.slice(0, 5).map(([n, v], i) => ({nome:n, v, cor:DPC.pal[i]})); if(rest) dFil.push({nome:"Outras", v:rest, cor:DPC.pal[5]});
  const pf = D.perf && D.perf.unidades && D.perf.unidades.length ? D.perf : null, tot = pf ? computeTotais(pf.unidades) : null;
  const piores = pf ? [...pf.unidades].sort((a, b) => (a.sla ?? 999) - (b.sla ?? 999)).slice(0, 5) : [];
  const pctEnv = D.conf.length ? D.env / D.conf.length * 100 : 0, crit = D.tAt.length + D.bAt.length + D.crit;
  const corSla = v => v === null || v === undefined ? DPC.org : (v >= 98 ? DPC.ok : (v >= 95 ? DPC.org : DPC.red));

  /* faturamento por unidade de entrega (mesma regra de antes) */
  let unids = []; try{ if(typeof unidadesDestinoComDados === "function") unids = unidadesDestinoComDados().filter(u => u.frete > 0); }catch(e){}
  let fatFonte = "Por Unidade de Entrega (sem pagador)";
  if(!unids.length){ try{ const r = loadReceitaData().unidades || {}; unids = Object.keys(r).map(k => ({sigla:k, cidade:"", ...combinaUnidadeReceita(r[k])})).filter(u => u.frete > 0); fatFonte = "Fechamento-RECEITA por unidade"; }catch(e){} }
  unids.sort((a, b) => b.frete - a.frete);
  const fat = unids.reduce((s, u) => s + u.frete, 0), qctrc = unids.reduce((s, u) => s + (u.qctrc || 0), 0), merc = unids.reduce((s, u) => s + (u.vlrMerc || 0), 0);

  const U = dpUnidades(D, unids); dpU = U.lista; const pg = U.pd ? computeTotais(U.pd.unidades) : null, slaRede = pg ? pg.sla : null;
  const n69 = load(KEYS.ocorrencias).length, atr5 = D.crit, tAtr = D.tAt.length + D.bAt.length;
  const abaixo = dpU.filter(u => u.sla !== null && u.sla < 95).length, naMeta = dpU.filter(u => u.sla !== null && u.sla >= 98).length, comSla = dpU.filter(u => u.sla !== null).length;
  const nvl = (crit > 10 || (slaRede !== null && slaRede < 95)) ? "bad" : ((crit > 0 || (slaRede !== null && slaRede < 98)) ? "warn" : "ok");
  const NV = {ok:"Operação estável", warn:"Operação em atenção", bad:"Operação crítica"};
  const freteRisco = D.atr.reduce((s, a) => s + (num(a.frete) || 0), 0);

  const hero = `<div class="dp-hero ${nvl}"><div class="hl"><span class="dp-pillst ${nvl}"><i></i>${NV[nvl]}</span><h2>Central da Operação</h2>
      <p><span class="dp-live"></span><span id="dpClock"></span></p><p class="sub">${crit === 0 ? "Nenhum ponto crítico agora" : "<b>" + crit + "</b> ponto(s) crítico(s) exigindo atenção"}</p>
      <button type="button" class="dp-vo-btn" data-vo-open title="Abrir a visão completa da operação, por focal"><span class="ico">${window.VISAO_OPERACAO_ICON || ""}</span><span>Visão da Operação<small>tudo por focal · tela cheia</small></span><span class="arr">›</span></button></div>
    <button type="button" class="hg" data-dp-aba="performance">${dpGauge(slaRede, corSla(slaRede))}</button>
    <div class="hs">
      <div><small>Entregues</small><b>${pg ? fmtInt(pg.entregue) : "—"}</b></div>
      <div><small>Unidades na meta</small><b>${comSla ? naMeta + "<u>/" + comSla + "</u>" : "—"}</b></div>
      <div class="${pg && pg.abertoAtrasado ? "r" : ""}"><small>Abertos em atraso</small><b>${pg ? fmtInt(pg.abertoAtrasado) : "—"}</b></div>
      <div class="${abaixo ? "r" : ""}"><small>Unidades &lt; 95%</small><b>${comSla ? abaixo : "—"}</b></div>
    </div></div>`;

  const area = (aba, cor, rot, valor, sub, estado) => `<button type="button" class="dp-area ${estado || ""}" data-dp-aba="${aba}" style="--ac:${cor}"><em>${rot}</em><b>${valor}</b><small>${sub}</small><span class="go">Abrir ›</span></button>`;
  const areas = `<div class="dp-areas">
      ${area("tambasa", DPC.ok, "Tambasa", D.tAb.length + " trocas", `${D.tAt.length} atrasada(s) · ${D.bAt.length} boleto(s) vencido(s) · ${D.pAb.length} pendência(s)`, tAtr ? "bad" : "")}
      ${area("performance", DPC.org, "Performance", slaRede === null ? "—" : fmtPct(slaRede), slaRede === null ? "importe a Performance" : `${naMeta} de ${comSla} unidades na meta de 98%`, slaRede !== null && slaRede < 95 ? "bad" : (slaRede !== null && slaRede < 98 ? "warn" : ""))}
      ${area("ocorrencias", DPC.red, "Ocorrências", fmtInt(D.atr.length) + " docs", `${atr5} com +5 dias · ${fmtInt(n69)} com ocorrência 69`, atr5 ? "bad" : (D.atr.length ? "warn" : ""))}
      ${area("fechamento", DPC.navy, "Fechamento", fat ? dpBrl(fat) : "—", fat ? fmtInt(qctrc) + " CTRCs faturados" : "importe a Receita", "")}
    </div>`;

  const atencao = [];
  if(D.bAt.length) atencao.push({n:"bad", tag:"Tambasa", txt:D.bAt.length + " boleto(s) vencido(s)", aba:"tambasa"});
  if(D.tAt.length) atencao.push({n:"bad", tag:"Tambasa", txt:D.tAt.length + " troca(s) com prazo vencido", aba:"tambasa"});
  if(slaRede !== null && slaRede < 98) atencao.push({n:slaRede < 95 ? "bad" : "warn", tag:"Performance", txt:"SLA da rede em " + fmtPct(slaRede) + " (meta 98%)", aba:"performance"});
  if(abaixo) atencao.push({n:"bad", tag:"Unidades", txt:abaixo + " unidade(s) abaixo de 95% de SLA", aba:"unidades"});
  if(pg && pg.abertoAtrasado) atencao.push({n:"warn", tag:"Performance", txt:fmtInt(pg.abertoAtrasado) + " entrega(s) abertas e atrasadas", aba:"performance"});
  if(atr5) atencao.push({n:"bad", tag:"Ocorrências", txt:atr5 + " documento(s) com mais de 5 dias de atraso", aba:"ocorrencias"});
  if(D.conf.length && D.env < D.conf.length) atencao.push({n:"warn", tag:"Filiais", txt:(D.conf.length - D.env) + " filial(is) ainda não enviaram os dados", aba:"tambasa"});
  atencao.sort((a, b) => (a.n === "bad" ? 0 : 1) - (b.n === "bad" ? 0 : 1));
  const atencaoHTML = atencao.length ? `<ul class="dp-att">${atencao.slice(0, 8).map(a => `<li class="${a.n}" data-dp-aba="${a.aba}"><i></i><span class="dp-tag">${escHtml(a.tag)}</span><span>${escHtml(a.txt)}</span><em>Ver ›</em></li>`).join("")}</ul>` : `<div class="dp-empty ok">Nenhum ponto de atenção no momento.</div>`;

  const barras = (itens, fmt, cor, vazio, attr) => { if(!itens.length) return `<div class="dp-empty">${vazio}</div>`; const mx = Math.max(...itens.map(i => i.v), 1);
    return itens.map(i => `<${attr && i.attr ? "button type=\"button\"" : "div"} class="dp-bar wide" ${i.attr || ""}><span title="${escHtml(i.nome || i.l)}">${escHtml(i.l)}</span><i><u style="width:${Math.max(2, i.v / mx * 100)}%;background:${i.cor || cor}"></u></i><b style="${i.cor ? "color:" + i.cor : ""}">${fmt(i.v)}</b></${attr && i.attr ? "button" : "div"}>`).join(""); };

  /* situação das entregas (rede) */
  const dSit = pg ? [{nome:"Entregues no prazo", v:pg.noPrazoEnt, cor:DPC.ok}, {nome:"Atraso cliente", v:pg.atrasCli, cor:DPC.blue}, {nome:"Atraso transportadora", v:pg.atrasTrans, cor:DPC.red}, {nome:"Abertas no prazo", v:pg.abertoNoPrazo, cor:DPC.org}, {nome:"Abertas atrasadas", v:pg.abertoAtrasado, cor:"#7a6bd1"}].filter(x => x.v > 0) : [];
  const cardSit = id => `<div class="dp-card"><div class="dp-h"><b>Situação das entregas</b><span>rede VAL + RVA</span></div>${dpDonut(id, dSit, "Importe a Performance Geral (VAL/RVA).")}</div>`;
  const rankU = [...dpU].filter(u => u.sla !== null).sort((a, b) => a.sla - b.sla);
  const barU = lista => lista.map(u => ({l:u.sigla, nome:(u.cidade || u.sigla) + " — " + fmtInt(u.entregue) + " entregues", v:u.sla, cor:corSla(u.sla), attr:`data-dp-aba="unidades" data-dp-q="${escHtml(u.sigla)}"`}));

  const pResumo = hero + areas + `<div class="dp-row dp-r1">
      <div class="dp-card"><div class="dp-h"><b>O que exige atenção agora</b><span>clique para ir direto ao assunto</span></div>${atencaoHTML}</div>
      <div class="dp-card dp-rings"><div class="dp-h"><b>Indicadores</b><span>clique para abrir</span></div>
        <button type="button" class="dp-ringbtn" data-dp-aba="performance">${pg ? dpRing(pg.sla, corSla(pg.sla), fmtPct(pg.sla), "SLA da rede · meta 98%") : `<div class="dp-empty">Importe a Performance para ver o SLA</div>`}</button>
        <button type="button" class="dp-ringbtn" data-go="confirmacao">${dpRing(pctEnv, DPC.ok, D.env + " / " + D.conf.length, "Filiais enviaram")}</button>
        <button type="button" class="dp-ringbtn" data-go="boletos">${dpRing(D.boletos.length ? (D.boletos.length - D.bAt.length) / D.boletos.length * 100 : 100, D.bAt.length ? DPC.red : DPC.ok, (D.boletos.length - D.bAt.length) + " / " + D.boletos.length, "Boletos em dia")}</button></div></div>
    <div class="dp-row dp-r3b">${cardSit("sit1")}
      <div class="dp-card"><div class="dp-h"><b>Unidades que mais precisam de atenção</b><span>menor SLA · clique para detalhar</span></div>${barras(barU(rankU.slice(0, 7)), v => fmtPct(v), DPC.ok, "Importe a Performance Geral (VAL/RVA).", true)}</div></div>`;

  /* aba Unidades — mapa de calor */
  const pUnidades = `<div class="dp-card"><div class="dp-h"><b>Mapa de calor da rede</b><span>${dpU.length} unidade(s) · clique no título da coluna para ordenar</span>
      <input type="search" id="dpBusca" class="dp-busca" placeholder="Buscar unidade ou cidade…" value="${escHtml(dpBusca)}"></div><div id="dpUn"></div></div>`;

  /* Tambasa */
  const hojeISO = D.hoje, venc = D.boletos.map(b => ({b, d:daysDiff(hojeISO, b.dataVencimento)})).filter(x => x.b.dataVencimento);
  const valSoma = f => venc.filter(f).reduce((s, x) => s + (Number(x.b.valor) || 0), 0), cnt = f => venc.filter(f).length;
  const faixasB = [["Vencidos há +15 dias", x => x.d < -15, DPC.red], ["Vencidos 8–15 dias", x => x.d >= -15 && x.d < -7, "#e8655e"], ["Vencidos até 7 dias", x => x.d >= -7 && x.d < 0, DPC.org], ["Vencem em até 7 dias", x => x.d >= 0 && x.d <= 7, DPC.blue], ["Vencem depois", x => x.d > 7, DPC.ok]]
    .map(([l, f, cor]) => ({l, nome:l + " — " + cnt(f) + " boleto(s)", v:valSoma(f), cor, n:cnt(f)}));
  const debVenc = valSoma(x => x.d < 0);
  const pTambasa = `
    <div class="dp-kpis">
      ${dpKpi("trocas", "#4f9d2d", "#6ab83f", "trocas", "Trocas em aberto", D.tAb.length, "int", D.tAt.length + " atrasada(s)")}
      ${dpKpi("boletos", "#3d86c6", "#5fa3dc", "boletos", "Valor em débito", D.deb, "money", D.boletos.length + " boleto(s) · " + D.bAt.length + " vencido(s)")}
      ${dpKpi("boletos", "#141a14", "#3b8a1f", "boletos", "Débito já vencido", debVenc, "money", cnt(x => x.d < 0) + " boleto(s)")}
      ${dpKpi("pendencias", "#d9534f", "#e8655e", "pendencias", "Pendências abertas", D.pAb.length, "int", "ainda não resolvidas")}
    </div>
    <div class="dp-row dp-r1">
      <div class="dp-card"><div class="dp-h"><b>Movimentação</b><span>novos registros por dia</span><div class="dp-seg-btns sm" id="dpPeriodo">${[7, 30, 90].map(n => `<button type="button" data-p="${n}" class="${dpPeriod === n ? 'on' : ''}">${n} dias</button>`).join("")}</div></div>
        <div class="dp-chips" id="dpChips"></div><div class="dp-chart" id="dpChart"></div></div>
      <div class="dp-card dp-rings"><div class="dp-h"><b>Indicadores</b><span>clique para abrir</span></div>
        <button type="button" class="dp-ringbtn" data-go="confirmacao">${dpRing(pctEnv, DPC.ok, D.env + " / " + D.conf.length, "Filiais enviaram")}</button>
        <button type="button" class="dp-ringbtn" data-go="boletos">${dpRing(D.boletos.length ? (D.boletos.length - D.bAt.length) / D.boletos.length * 100 : 100, D.bAt.length ? DPC.red : DPC.ok, (D.boletos.length - D.bAt.length) + " / " + D.boletos.length, "Boletos em dia")}</button></div>
    </div>
    <div class="dp-row dp-r3b">
      <div class="dp-card"><div class="dp-h"><b>Débito por vencimento</b><span>valor dos boletos</span></div>${D.boletos.length ? barras(faixasB, v => dpBrl(v), DPC.blue, "") : `<div class="dp-empty">Nenhum boleto cadastrado.</div>`}</div>
      <div class="dp-card"><div class="dp-h"><b>Pendências por tipo</b><span>abertas</span></div>${dpDonut("tipo", dTipos, "Nenhuma pendência aberta")}</div>
    </div>
    <div class="dp-row dp-r3b">
      <div class="dp-card"><div class="dp-h"><b>Trocas em aberto por filial</b><span>top 5</span></div>${dpDonut("fil", dFil, "Nenhuma troca em aberto")}</div>
      <div class="dp-card"><div class="dp-h"><b>Prioridades</b><span>vencidas ou com prazo em até 2 dias</span>
        <div class="dp-seg-btns sm" id="dpFiltro">${[["todas", "Todas"], ["Troca", "Trocas"], ["Boleto", "Boletos"]].map(([k, l]) => `<button type="button" data-f="${k}" class="${dpFiltro === k ? 'on' : ''}">${l}</button>`).join("")}</div></div>
        <div id="dpTabela"></div></div>
    </div>`;

  /* Performance */
  const pPerformance = `
    <div class="dp-kpis">
      ${dpKpi("performance-geral", "#4f9d2d", "#6ab83f", "performance-geral", "SLA da rede", pg && pg.sla !== null ? Math.round(pg.sla * 10) / 10 : 0, "pct", pg ? fmtInt(pg.entregue) + " entregues · meta 98%" : "importe a Performance Geral")}
      ${dpKpi("performance", "#3d86c6", "#5fa3dc", "performance", "SLA Tambasa", tot && tot.sla !== null ? Math.round(tot.sla * 10) / 10 : 0, "pct", pf ? fmtInt(tot.entregue) + " entregues" : "importe a Performance")}
      ${dpKpi("performance-geral", "#d9534f", "#e8655e", "ocorrencias", "Abertas e atrasadas", pg ? pg.abertoAtrasado : 0, "int", pg ? fmtInt(pg.abertoNoPrazo) + " abertas no prazo" : "—")}
      ${dpKpi("performance-geral", "#e2ad45", "#edc067", "entregas", "Fora do prazo", pg ? pg.foraDoPrazo : 0, "int", pg ? fmtInt(pg.atrasCli) + " cliente · " + fmtInt(pg.atrasTrans) + " transportadora" : "—")}
    </div>
    <div class="dp-row dp-r2b">
      <div class="dp-card"><div class="dp-h"><b>SLA por unidade</b><span>rede · do menor para o maior · meta 98%</span></div><div class="dp-unlist">${barras(barU(rankU), v => fmtPct(v), DPC.ok, "Importe a Performance Geral (VAL/RVA).", true)}</div></div>
      ${cardSit("sit2")}
      <div class="dp-card"><div class="dp-h"><b>Menores SLA por unidade</b><span>Tambasa · meta 98%</span></div>
        ${pf ? piores.map(u => { const c = slaKpiClass(u.sla), cor = c === "ok" ? DPC.ok : (c === "warn" ? DPC.org : DPC.red), w = Math.max(2, Math.min(100, u.sla || 0));
          return `<button type="button" class="dp-bar" data-go="performance-geral" title="${fmtInt(u.entregue)} / ${fmtInt(u.total)} entregues"><span>${escHtml(u.sigla)}</span><i><u style="width:${w}%;background:${cor}"></u></i><b style="color:${cor}">${fmtPct(u.sla)}</b></button>`; }).join("") : `<div class="dp-empty">Nenhum relatório de performance importado</div>`}</div>
    </div>
    <div class="dp-link"><button type="button" class="dp-go" data-go="performance-geral">Abrir Performance Geral completa ›</button></div>`;

  /* Ocorrências */
  const faixas = [["1–2 dias", 1, 2], ["3–5 dias", 3, 5], ["6–10 dias", 6, 10], ["11–20 dias", 11, 20], ["21+ dias", 21, 99999]].map(([l, a, b], i) => ({l, v:D.atr.filter(x => { const d = Number(x.diasAtraso) || 0; return d >= a && d <= b; }).length, cor:i >= 2 ? DPC.red : DPC.org}));
  const ocUn = dpU.filter(u => u.atr || u.o69).sort((a, b) => b.atr - a.atr || b.o69 - a.o69).slice(0, 12).map(u => ({l:u.sigla, nome:(u.cidade || u.sigla) + " — " + u.o69 + " com ocorrência 69", v:u.atr, attr:`data-dp-aba="unidades" data-dp-q="${escHtml(u.sigla)}"`}));
  const codigos = {}; D.atr.forEach(a => { const k = String(a.codOcorrencia || "").trim() || "—", d = String(a.descrOcorrencia || "").trim(); const c = codigos[k] = codigos[k] || {n:0, d}; c.n++; if(!c.d) c.d = d; });
  const dCod = Object.entries(codigos).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, c], i) => ({nome:(k === "—" ? "Sem código" : k) + (c.d ? " · " + c.d.slice(0, 26) : ""), v:c.n, cor:DPC.pal[i % 6]}));
  const piorDocs = [...D.atr].sort((a, b) => (Number(b.diasAtraso) || 0) - (Number(a.diasAtraso) || 0)).slice(0, 6);
  const freteRisco2 = freteRisco + load(KEYS.ocorrencias).reduce((s, o) => s + (num(o.valFrete) || 0), 0);
  const pOcorrencias = `
    <div class="dp-kpis">
      ${dpKpi("ocorrencias", "#e2ad45", "#edc067", "ocorrencias", "Documentos em atraso", D.atr.length, "int", "ocorrência 150")}
      ${dpKpi("ocorrencias", "#d9534f", "#e8655e", "pendencias", "Mais de 5 dias", atr5, "int", "atraso crítico")}
      ${dpKpi("ocorrencias", "#7a6bd1", "#9a8ee0", "ocorrencias", "Ocorrência 69", n69, "int", "documentos")}
      ${dpKpi("ocorrencias", "#141a14", "#3b8a1f", "boletos", "Frete em risco", Math.round(freteRisco2), "brlc", "atrasos + ocorrência 69")}
    </div>
    <div class="dp-row dp-r2b">
      <div class="dp-card"><div class="dp-h"><b>Atrasos por unidade</b><span>clique para detalhar</span></div>${barras(ocUn, v => fmtInt(v), DPC.red, "Nenhum documento em atraso importado.", true)}</div>
      <div class="dp-card"><div class="dp-h"><b>Tempo de atraso</b><span>documentos (150)</span></div>${D.atr.length ? barras(faixas, v => fmtInt(v), DPC.org, "") : `<div class="dp-empty">Nenhum documento em atraso importado.</div>`}</div>
      <div class="dp-card"><div class="dp-h"><b>Atrasos por ocorrência</b><span>código do último evento</span></div>${dpDonut("cod", dCod, "Nenhum documento em atraso importado.")}</div>
      <div class="dp-card"><div class="dp-h"><b>Documentos mais atrasados</b><span>top 6</span></div>
        ${piorDocs.length ? piorDocs.map(a => { const d = Number(a.diasAtraso) || 0; return `<button type="button" class="dp-doc" data-go="ocorrencias"><span><b>${escHtml(String(a.ctrc || a.nf || "-"))}</b><small>${escHtml(String(a.unidade || "-"))} · ${escHtml(String(a.pagador || "-").slice(0, 24))}</small></span><em class="dp-pill ${d > 5 ? "late" : "soon"}">${d} dia(s)</em></button>`; }).join("") : `<div class="dp-empty ok">Nenhum documento em atraso.</div>`}</div>
    </div>
    <div class="dp-link"><button type="button" class="dp-go" data-go="ocorrencias">Abrir Ocorrências completas ›</button></div>`;

  /* Fechamento */
  const maxU = unids.length ? unids[0].frete : 1;
  const unidLinhas = unids.map(u => `<div class="dp-bar wide" title="${escHtml((u.cidade || u.sigla) + " — " + fmtMoeda(u.frete))}"><span>${escHtml(u.sigla)}${u.cidade ? `<small class="dp-cid"> ${escHtml(u.cidade)}</small>` : ""}</span><i><u style="width:${Math.max(2, u.frete / maxU * 100)}%;background:${DPC.ok}"></u></i><b>${fmtMoeda(u.frete)}</b><em class="dp-pctu">${(u.frete / fat * 100).toFixed(1).replace(".", ",")}%</em></div>`).join("");
  const pFechamento = `
    <div class="dp-kpis">
      ${dpKpi("fechamento-receita", "#141a14", "#3b8a1f", "fechamento-receita", "Faturamento (frete)", fat, "money", fmtInt(qctrc) + " CTRCs · " + unids.length + " unidades")}
      ${dpKpi("fechamento-receita", "#3d86c6", "#5fa3dc", "boletos", "Ticket médio", qctrc ? fat / qctrc : 0, "money", "frete por CTRC")}
      ${dpKpi("fechamento-receita", "#4f9d2d", "#6ab83f", "entregas", "Valor de mercadoria", merc, "money", merc ? "frete = " + (fat / merc * 100).toFixed(2).replace(".", ",") + "% da mercadoria" : "")}
    </div>
    <div class="dp-card"><div class="dp-h"><b>Faturamento por unidade de entrega</b><span>frete · ${unids.length} unidade(s) · ${fatFonte}</span></div>
      ${unids.length ? `<div class="dp-unlist">${unidLinhas}</div><div class="dp-untot"><span>Total de todas as unidades</span><b>${fmtMoeda(fat)}</b></div>` : `<div class="dp-empty">Importe o faturamento por unidade de entrega (Fechamento-RECEITA).</div>`}
    </div>
    <div class="dp-link"><button type="button" class="dp-go" data-go="fechamento-receita">Abrir Fechamento-RECEITA completo ›</button></div>`;

  const ABAS = [["resumo", "Visão geral", "a operação num relance", 0], ["unidades", "Unidades", "mapa de calor da rede", abaixo], ["tambasa", "Tambasa", "trocas, boletos, pendências", tAtr], ["performance", "Performance", "SLA e entregas", 0], ["ocorrencias", "Ocorrências", "69 e docs em atraso", atr5], ["fechamento", "Fechamento", "faturamento por unidade", 0]];
  if(!ABAS.some(a => a[0] === dpAba)) dpAba = "resumo";
  const PAINEIS = {unidades:pUnidades, tambasa:pTambasa, performance:pPerformance, ocorrencias:pOcorrencias, fechamento:pFechamento};
  return `<div class="dp">
    <nav class="dp-tabs" id="dpTabs" role="tablist">${ABAS.map(([id, nome, sub, n]) => `<button type="button" role="tab" data-dp-aba="${id}" class="${dpAba === id ? "on" : ""}" aria-selected="${dpAba === id}"><b>${nome}</b><small>${sub}</small>${n ? `<i class="dp-badge">${n}</i>` : ""}</button>`).join("")}</nav>
    <section class="dp-panel" data-dp-painel="resumo" ${dpAba === "resumo" ? "" : "hidden"}>${pResumo}</section>
    ${ABAS.slice(1).map(([id]) => `<section class="dp-panel" data-dp-painel="${id}" ${dpAba === id ? "" : "hidden"}>${PAINEIS[id]}</section>`).join("")}
  </div>`;
}

/* Acompanhamento de SAC — continua só pelo menu "Acompanhamento de SAC" (fora do Dashboard da operação) */
function dpSacsHTML(){
  const V = window.VO_DADOS ? window.VO_DADOS() : null, LV = V ? V.lista : [];
  const corSla = v => v === null || v === undefined ? DPC.org : (v >= 98 ? DPC.ok : (v >= 95 ? DPC.org : DPC.red));
  const NIV = {ok:"Em dia", warn:"Atenção", bad:"Crítico", na:"Sem dados"}, RK = {bad:2, warn:1, ok:0, na:-1};
  const sacs = [...LV].sort((a, b) => RK[b.nivel] - RK[a.nivel] || (a.sla ?? 101) - (b.sla ?? 101) || b.fat - a.fat);
  const sacCard = m => `<button type="button" class="dp-sac ${m.nivel}" data-dp-sac="${escHtml(m.key)}">
      <span class="hd"><span class="nm"><b>${escHtml(m.curto)}</b><small>${escHtml(m.nome)}</small></span><em class="dp-st ${m.nivel}">${NIV[m.nivel]}</em></span>
      <span class="mid"><span class="k"><small>SLA</small><b style="color:${m.sla === null ? "var(--muted)" : corSla(m.sla)}">${m.sla === null ? "—" : fmtPct(m.sla)}</b></span><span class="k"><small>Faturamento</small><b>${m.fat ? dpBrl(m.fat) : "—"}</b></span></span>
      <span class="mini"><span class="${m.oc69 ? "w" : ""}"><b>${m.oc69}</b>Ocor. 69</span><span class="${m.atr5 ? "r" : (m.atr ? "w" : "")}"><b>${m.atr}</b>Atrasos</span><span class="${m.pend ? "w" : ""}"><b>${m.pend}</b>Pendên.</span><span class="${m.trocasAt ? "r" : ""}"><b>${m.trocasAt}</b>Trocas atr.</span></span>
      <span class="why ${m.iss.length ? "" : "ok"}">${m.iss.length ? escHtml(m.iss[0]) + (m.iss.length > 1 ? ` <em>+${m.iss.length - 1}</em>` : "") : (m.nivel === "na" ? "Sem dados importados" : "Tudo dentro do esperado")}</span></button>`;
  return `<div class="dp"><div class="dp-hello"><div><h2>Acompanhamento de SAC</h2><p>um cartão por focal</p></div><button type="button" class="dp-go" data-dp-aba="resumo">‹ Voltar ao Dashboard da operação</button></div>
    <div class="dp-sacs">${sacs.length ? sacs.map(sacCard).join("") : `<div class="dp-empty">Nenhum SAC com dados ainda.</div>`}</div>
    <div class="dp-link"><button type="button" class="dp-go" data-dp-vo="">Abrir a Visão da Operação (tela cheia) ›</button></div></div>`;
}

/* tabela/mapa de calor das unidades */
function dpDrawUn(){
  const el = document.getElementById("dpUn"); if(!el) return;
  const q = dpBusca.trim().toUpperCase(), K = dpSort.k;
  const lista = dpU.filter(u => !q || u.sigla.includes(q) || (u.cidade || "").toUpperCase().includes(q));
  const val = u => K === "sigla" ? u.sigla : (u[K] === null ? 999 : u[K]);
  lista.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * dpSort.d * (K === "sla" || K === "sigla" ? 1 : -1) || a.sigla.localeCompare(b.sigla); });
  const mx = k => Math.max(1, ...dpU.map(u => u[k] || 0));
  const heat = (k, v, cor) => `<span class="c" style="--h:${(v / mx(k)).toFixed(2)};--hc:${cor}">${v ? fmtInt(v) : "·"}</span>`;
  const COLS = [["sigla", "Unidade"], ["sla", "SLA"], ["entregue", "Entregues"], ["abAtr", "Abertos atrasados"], ["atr", "Docs em atraso"], ["atr5", "+5 dias"], ["o69", "Ocor. 69"], ["tr", "Trocas"], ["pend", "Pendências"], ["fat", "Frete faturado"]];
  const slaCel = u => u.sla === null ? `<span class="c sla">—</span>` : `<span class="c sla ${u.sla >= 98 ? "ok" : (u.sla >= 95 ? "warn" : "bad")}"><i style="width:${Math.max(3, Math.min(100, u.sla))}%"></i><b>${fmtPct(u.sla)}</b></span>`;
  el.innerHTML = `<div class="dp-hm"><div class="dp-hr head">${COLS.map(([k, l]) => `<button type="button" data-sk="${k}" class="${K === k ? "on" : ""}">${l}${K === k ? (dpSort.d > 0 ? " ▲" : " ▼") : ""}</button>`).join("")}</div>`
    + (lista.length ? lista.map(u => `<div class="dp-hr"><span class="u"><b>${escHtml(u.sigla)}</b><small>${escHtml(u.cidade || "")}</small></span>${slaCel(u)}${heat("entregue", u.entregue, "#4f9d2d")}${heat("abAtr", u.abAtr, "#d9534f")}${heat("atr", u.atr, "#e2ad45")}${heat("atr5", u.atr5, "#d9534f")}${heat("o69", u.o69, "#7a6bd1")}${heat("tr", u.tr, "#e2ad45")}${heat("pend", u.pend, "#d9534f")}<span class="c f">${u.fat ? dpBrl(u.fat) : "·"}</span></div>`).join("") : `<div class="dp-empty">Nenhuma unidade encontrada. Importe a Performance Geral (VAL/RVA).</div>`) + `</div>`;
  el.querySelectorAll("[data-sk]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.sk; dpSort = dpSort.k === k ? {k, d:-dpSort.d} : {k, d:1}; dpDrawUn(); }));
}

function dpDrawTable(){
  const el = document.getElementById("dpTabela"); if(!el) return;
  const lista = dpD.itens.filter(i => dpFiltro === "todas" || i.tipo === dpFiltro);
  if(!lista.length){ el.innerHTML = `<div class="dp-empty ok">Nenhuma pendência crítica no momento.</div>`; return; }
  el.innerHTML = `<div class="dp-trow head"><span>Filial</span><span>Tipo</span><span>NF</span><span>Situação</span></div>` + lista.map(i => {
    const late = i.d < 0, msg = late ? `Atrasado ${-i.d} dia(s)` : (i.d === 0 ? "Vence hoje" : `Vence em ${i.d} dia(s)`);
    const h = [...String(i.filial)].reduce((s,c) => s + c.charCodeAt(0), 0);
    return `<button type="button" class="dp-trow" data-go="${i.tab}"><span><i class="dp-av" style="background:${DPC.pal[h % 5]}">${escHtml(String(i.filial).slice(0,2).toUpperCase())}</i>${escHtml(String(i.filial))}</span>
      <span>${i.tipo}</span><span>${escHtml(String(i.ref ?? "-"))}</span><span><em class="dp-pill ${late ? 'late' : 'soon'}">${msg}</em></span></button>`; }).join("");
}

function dpDrawChart(){
  const el = document.getElementById("dpChart"), chips = document.getElementById("dpChips"); if(!el) return;
  const dias = []; for(let i = dpPeriod - 1; i >= 0; i--) dias.push(addDaysISO(dpD.hoje, -i));
  const cnt = (l, f) => { const m = {}; l.forEach(x => { if(x[f]) m[x[f]] = (m[x[f]]||0) + 1; }); return dias.map(d => m[d] || 0); };
  const S = [{id:"t", nome:"Trocas", cor:DPC.ok, v:cnt(dpD.trocas,"dataEnvio")}, {id:"b", nome:"Boletos", cor:DPC.blue, v:cnt(dpD.boletos,"dataRecebimento")}, {id:"p", nome:"Pendências", cor:DPC.red, v:cnt(dpD.pend,"dataSistema")}];
  chips.innerHTML = S.map(s => `<button type="button" data-s="${s.id}" class="${dpHidden.has(s.id) ? 'off' : ''}"><i style="background:${s.cor}"></i>${s.nome}<b>${s.v.reduce((a,b) => a+b, 0)}</b></button>`).join("");
  const vis = S.filter(s => !dpHidden.has(s.id)), W = 720, H = 250, L = 30, R = 10, T = 12, B = 26;
  const mx = Math.max(4, ...vis.flatMap(s => s.v)), top = Math.ceil(mx / 4) * 4, n = dias.length;
  const X = i => L + (n > 1 ? i * (W - L - R) / (n - 1) : 0), Y = v => T + (H - T - B) * (1 - v / top);
  const path = v => { const p = v.map((y,i) => [X(i), Y(y)]); let d = `M${p[0][0]},${p[0][1]}`;
    for(let i = 0; i < p.length - 1; i++){ const a = p[i-1] || p[i], b = p[i], c = p[i+1], e = p[i+2] || c;
      d += `C${b[0]+(c[0]-a[0])/6},${Math.min(H-B, b[1]+(c[1]-a[1])/6)} ${c[0]-(e[0]-b[0])/6},${Math.min(H-B, c[1]-(e[1]-b[1])/6)} ${c[0]},${c[1]}`; } return d; };
  const grid = [0,1,2,3,4].map(k => { const v = top / 4 * k, y = Y(v); return `<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" class="gl"/><text x="${L-6}" y="${y+4}" text-anchor="end">${v}</text>`; }).join("");
  const step = Math.ceil(n / 6), xl = dias.map((d,i) => (i % step === 0 || i === n-1) ? `<text x="${X(i)}" y="${H-8}" text-anchor="middle">${d.slice(8)}/${d.slice(5,7)}</text>` : "").join("");
  const lines = vis.map(s => `<defs><linearGradient id="g${s.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.cor}" stop-opacity=".25"/><stop offset="1" stop-color="${s.cor}" stop-opacity="0"/></linearGradient></defs>
    <path d="${path(s.v)}L${X(n-1)},${Y(0)}L${X(0)},${Y(0)}Z" fill="url(#g${s.id})"/><path d="${path(s.v)}" fill="none" stroke="${s.cor}" stroke-width="2.6" stroke-linecap="round" class="dp-line"/>`).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${xl}${lines}<line class="dp-cross" y1="${T}" y2="${H-B}" style="display:none"/>${vis.map(s => `<circle class="dp-dot" data-s="${s.id}" r="4.5" fill="#fff" stroke="${s.cor}" stroke-width="2.5" style="display:none"/>`).join("")}<rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent" class="dp-hit"/></svg><div class="dp-tip" style="display:none"></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".dp-tip"), cross = el.querySelector(".dp-cross");
  const sai = () => { tip.style.display = cross.style.display = "none"; el.querySelectorAll(".dp-dot").forEach(c => c.style.display = "none"); };
  el.querySelector(".dp-hit").addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, i = Math.max(0, Math.min(n-1, Math.round((x - L) / ((W-L-R) / Math.max(1,n-1)))));
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = "";
    el.querySelectorAll(".dp-dot").forEach(c => { const s = S.find(q => q.id === c.dataset.s); c.setAttribute("cx", X(i)); c.setAttribute("cy", Y(s.v[i])); c.style.display = ""; });
    tip.innerHTML = `<strong>${fmtDate(dias[i])}</strong>` + vis.map(s => `<div><i style="background:${s.cor}"></i>${s.nome}: <b>${s.v[i]}</b></div>`).join("");
    tip.style.display = ""; const px = X(i) / W * r.width; tip.style.left = (px > r.width * .7 ? px - tip.offsetWidth - 12 : px + 12) + "px";
  });
  el.querySelector(".dp-hit").addEventListener("mouseleave", sai);
  chips.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { const k = b.dataset.s; dpHidden.has(k) ? dpHidden.delete(k) : dpHidden.add(k); dpDrawChart(); }));
}

function dashAfterRender(){
  const root = document.getElementById("sec-dashboard"); if(!root || !root.querySelector(".dp")) return;
  root.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { if(TABS.some(t => t.id === b.dataset.go)) switchTab(b.dataset.go); }));
  const irAba = (id, q) => {
    const veioDeSac = dpAba === "sacs"; dpAba = id; try{ LS.setItem("painel_dp_aba", id); }catch(e){}
    if(veioDeSac){ root.innerHTML = dashboardHTML(); dashAfterRender(); const pt = document.getElementById("pageTitle"); if(pt) pt.textContent = "Dashboard"; if(typeof renderNav === "function") renderNav(); return; }
    if(q !== undefined){ dpBusca = q; const bi = document.getElementById("dpBusca"); if(bi) bi.value = q; dpDrawUn(); }
    root.querySelectorAll("#dpTabs button").forEach(b => { const on = b.dataset.dpAba === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    root.querySelectorAll("[data-dp-painel]").forEach(p => { p.hidden = p.dataset.dpPainel !== id; });
    const t = document.getElementById("dpTabs"); if(t && t.getBoundingClientRect().top < 0) t.scrollIntoView({block:"start"}); };
  root.querySelectorAll("[data-dp-aba]").forEach(b => b.addEventListener("click", () => irAba(b.dataset.dpAba, b.dataset.dpQ)));
  const bu = document.getElementById("dpBusca"); if(bu) bu.addEventListener("input", () => { dpBusca = bu.value; dpDrawUn(); });
  root.querySelectorAll("[data-dp-sac]").forEach(b => b.addEventListener("click", () => { if(window.abrirVisaoOperacao) window.abrirVisaoOperacao(b.dataset.dpSac, b.dataset.dpSub); }));
  root.querySelectorAll("[data-dp-vo]").forEach(b => b.addEventListener("click", () => { if(window.abrirVisaoOperacao) window.abrirVisaoOperacao(); }));
  root.querySelectorAll("[data-vo-open]").forEach(b => b.addEventListener("click", () => { if(window.abrirVisaoOperacao) window.abrirVisaoOperacao(); }));
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach(el => {
    const alvo = Number(el.dataset.count) || 0, money_ = el.dataset.format === "money", pct_ = el.dataset.format === "pct", brlc_ = el.dataset.format === "brlc";
    const f = v => brlc_ ? dpBrl(v) : money_ ? "R$ " + money(v) : (pct_ ? (alvo ? v.toFixed(1).replace(".", ",") + "%" : "—") : Math.round(v).toLocaleString("pt-BR"));
    if(reduz || !alvo){ el.textContent = f(alvo); return; }
    const ini = performance.now(), passo = t => { const k = Math.min(1, (t - ini) / 900); el.textContent = f(alvo * (1 - Math.pow(1 - k, 3))); if(k < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
  root.querySelectorAll("#dpPeriodo button").forEach(b => b.addEventListener("click", () => { dpPeriod = +b.dataset.p; root.querySelectorAll("#dpPeriodo button").forEach(x => x.classList.toggle("on", x === b)); dpDrawChart(); }));
  root.querySelectorAll("#dpFiltro button").forEach(b => b.addEventListener("click", () => { dpFiltro = b.dataset.f; root.querySelectorAll("#dpFiltro button").forEach(x => x.classList.toggle("on", x === b)); dpDrawTable(); }));
  root.querySelectorAll("[data-d]").forEach(el => {
    const mostra = on => { const d = dpDon[el.dataset.d], x = d && d.dados[el.dataset.i], c = document.getElementById("dc-" + el.dataset.d); if(!x || !c) return;
      c.innerHTML = on ? `<b>${x.v}</b><small>${escHtml(x.nome)} · ${(x.v / d.tot * 100).toFixed(0)}%</small>` : `<b>${d.tot}</b><small>total</small>`;
      root.querySelectorAll(`[data-d="${el.dataset.d}"]`).forEach(o => o.classList.toggle("dim", on && o.dataset.i !== el.dataset.i)); };
    el.addEventListener("mouseenter", () => mostra(true)); el.addEventListener("mouseleave", () => mostra(false));
  });
  dpDrawChart(); dpDrawTable(); dpDrawUn();
  const tick = () => { const c = document.getElementById("dpClock"); if(!c){ clearInterval(dpTimer); dpTimer = null; return; }
    const a = new Date(); c.textContent = a.toLocaleDateString("pt-BR", {weekday:"long", day:"2-digit", month:"long"}) + " · " + a.toLocaleTimeString("pt-BR"); };
  tick(); if(dpTimer) clearInterval(dpTimer); dpTimer = setInterval(tick, 1000);
}


/* ===== v3.0 — CSS embutido (este arquivo sozinho já traz o visual novo) ===== */
(function(){
  if(document.getElementById("dp-v3-css")) return;
  const st = document.createElement("style"); st.id = "dp-v3-css";
  st.textContent = `/* ===== v3.0 — Central da Operação (hero com medidor, aba Unidades com mapa de calor) ===== */
.dp-hero{ position:relative; overflow:hidden; display:grid; grid-template-columns:1.25fr minmax(220px,300px) 1.2fr; gap:22px; align-items:center; padding:24px 28px; border-radius:22px; color:#fff; background:linear-gradient(135deg,#0b110b 0%,#16300f 55%,#2b6a1a 100%); box-shadow:0 18px 36px -18px rgba(20,60,15,.7); }
.dp-hero.warn{ background:linear-gradient(135deg,#14110a 0%,#3a2d0c 55%,#8a6410 100%); } .dp-hero.bad{ background:linear-gradient(135deg,#150a0a 0%,#3a1111 55%,#8c2a26 100%); }
.dp-hero::before,.dp-hero::after{ content:""; position:absolute; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
.dp-hero::before{ width:340px; height:340px; right:-90px; top:-170px; } .dp-hero::after{ width:200px; height:200px; left:34%; bottom:-120px; }
.dp-hero > *{ position:relative; z-index:1; }
.dp-hero h2{ margin:10px 0 2px; font-size:28px; letter-spacing:-.01em; color:#fff; }
.dp-hero p{ margin:3px 0 0; font-size:13px; color:rgba(255,255,255,.75); } .dp-hero p.sub{ font-size:14px; color:#fff; } .dp-hero p.sub b{ font-size:17px; }
.dp-hero .dp-vo-btn{ margin:16px 0 0; }
.dp-pillst{ display:inline-flex; align-items:center; gap:8px; padding:5px 13px; border-radius:20px; font-size:12px; font-weight:700; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); }
.dp-pillst i{ width:9px; height:9px; border-radius:50%; background:#6ee05a; animation:dpPulse 1.8s infinite; } .dp-pillst.warn i{ background:#f2c14e; } .dp-pillst.bad i{ background:#ff6b63; }
.dp .hg{ border-radius:18px; padding:4px; transition:background .15s; } .dp .hg:hover{ background:rgba(255,255,255,.07); }
.hg svg{ width:100%; height:auto; display:block; overflow:visible; }
.gbg,.gfg{ fill:none; stroke-width:14; stroke-linecap:round; } .gbg{ stroke:rgba(255,255,255,.14); }
.gfg{ stroke-dasharray:var(--v) var(--L); animation:dpGauge 1.3s ease; filter:drop-shadow(0 0 7px currentColor); }
@keyframes dpGauge{ from{ stroke-dasharray:0 var(--L); } }
.gm{ stroke:#fff; stroke-width:2.5; stroke-linecap:round; opacity:.9; }
.gv{ fill:#fff; font-size:31px; font-weight:800; text-anchor:middle; } .gt{ fill:rgba(255,255,255,.7); font-size:9.5px; text-anchor:middle; }
.hs{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.hs > div{ padding:12px 14px; border-radius:14px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.1); }
.hs small{ display:block; font-size:11.5px; color:rgba(255,255,255,.7); } .hs b{ font-size:26px; font-variant-numeric:tabular-nums; line-height:1.25; } .hs b u{ text-decoration:none; font-size:14px; opacity:.65; }
.hs .r b{ color:#ff9a92; }
@media (max-width:1100px){ .dp-hero{ grid-template-columns:1fr; } .hg{ max-width:300px; } }

.dp-busca{ margin-left:auto; padding:8px 13px; border:1px solid var(--line); border-radius:10px; font:inherit; font-size:13px; min-width:220px; background:var(--card); color:var(--text); }
.dp-hm{ overflow-x:auto; padding-bottom:4px; }
.dp-hr{ display:grid; grid-template-columns:minmax(140px,1.3fr) minmax(130px,1.4fr) repeat(7,minmax(74px,1fr)) minmax(104px,1.1fr); gap:6px; align-items:center; min-width:960px; padding:4px 2px; border-bottom:1px solid var(--line); }
.dp-hr:not(.head):hover{ background:var(--gray-bg); }
.dp-hr.head{ position:sticky; top:0; z-index:2; background:var(--card); border-bottom:2px solid var(--gray-bg); }
.dp .dp-hr.head button{ padding:8px 4px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); text-align:center; border-radius:8px; } .dp .dp-hr.head button:first-child{ text-align:left; }
.dp .dp-hr.head button:hover{ background:var(--gray-bg); } .dp .dp-hr.head button.on{ color:var(--navy); background:var(--gray-bg); }
.dp-hr .u{ display:flex; flex-direction:column; line-height:1.15; padding-left:6px; } .dp-hr .u b{ font-size:14px; color:var(--navy); } .dp-hr .u small{ font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dp-hr .c{ position:relative; display:block; text-align:center; padding:8px 4px; border-radius:8px; font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; background:color-mix(in srgb, var(--hc, transparent) calc(var(--h, 0) * 42%), transparent); color:var(--text); }
.dp-hr .c.f{ background:none; font-weight:700; text-align:right; padding-right:8px; }
.dp-hr .c.sla{ background:var(--gray-bg); overflow:hidden; text-align:center; } .dp-hr .c.sla i{ position:absolute; left:0; top:0; bottom:0; opacity:.28; border-radius:8px; } .dp-hr .c.sla b{ position:relative; }
.dp-hr .c.sla.ok i{ background:#4f9d2d; } .dp-hr .c.sla.warn i{ background:#e2ad45; } .dp-hr .c.sla.bad i{ background:#d9534f; }
.dp-hr .c.sla.ok b{ color:#2f7a14; } .dp-hr .c.sla.warn b{ color:#a8710a; } .dp-hr .c.sla.bad b{ color:#b3261e; }
`;
  document.head.appendChild(st);
  /* Clicar em "Dashboard" no menu volta para a Visão geral (o SAC abre só por "Acompanhamento de SAC") */
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('button[data-tab="dashboard"]');
    if(b && dpAba === "sacs"){ dpAba = "resumo"; try{ LS.setItem("painel_dp_aba", "resumo"); }catch(e){} }
  }, true);
})();
