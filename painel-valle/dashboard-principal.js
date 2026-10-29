/* Dashboard principal — visual interativo (cartões coloridos, gráfico, rosquinhas, anéis).
   Usa os mesmos dados das demais abas; só a apresentação mudou. */
let dpAba = (() => { try{ return LS.getItem("painel_dp_aba") || "resumo"; }catch(e){ return "resumo"; } })(), dpPeriod = 30, dpHidden = new Set(), dpFiltro = "todas", dpD = null, dpTimer = null, dpDon = {};
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

function dashboardHTML(){
  dpDon = {}; dpD = dpData(); const D = dpD;
  const tipos = {}; D.pAb.forEach(p => { const k = p.tipo || "Outros"; tipos[k] = (tipos[k]||0) + 1; });
  const dTipos = Object.entries(tipos).sort((a,b) => b[1]-a[1]).map(([n,v],i) => ({nome:n, v, cor:DPC.pal[i % 6]}));
  const fil = {}; D.tAb.forEach(t => { const k = t.filial || "—"; fil[k] = (fil[k]||0) + 1; });
  let fl = Object.entries(fil).sort((a,b) => b[1]-a[1]); const rest = fl.slice(5).reduce((s,x) => s + x[1], 0);
  const dFil = fl.slice(0,5).map(([n,v],i) => ({nome:n, v, cor:DPC.pal[i]})); if(rest) dFil.push({nome:"Outras", v:rest, cor:DPC.pal[5]});
  const pf = D.perf && D.perf.unidades && D.perf.unidades.length ? D.perf : null;
  const tot = pf ? computeTotais(pf.unidades) : null;
  const piores = pf ? [...pf.unidades].sort((a,b) => (a.sla ?? 999) - (b.sla ?? 999)).slice(0,5) : [];
  const pctEnv = D.conf.length ? D.env / D.conf.length * 100 : 0;
  const crit = D.tAt.length + D.bAt.length + D.crit;

  /* ---- dados do restante da operação (SACs, receita, performance, ocorrências) ---- */
  const V = window.VO_DADOS ? window.VO_DADOS() : null, LV = V ? V.lista : [];
  const soma = f => LV.reduce((s, m) => s + (f(m) || 0), 0);
  const nSac = {bad:LV.filter(m => m.nivel === "bad").length, warn:LV.filter(m => m.nivel === "warn").length, ok:LV.filter(m => m.nivel === "ok").length};
  const fat = soma(m => m.fat), qctrc = soma(m => m.qctrc), merc = soma(m => m.merc), n69 = soma(m => m.oc69), atr5 = D.crit;
  const pg = V ? V.perfGeral : null, slaRede = pg ? pg.sla : null;
  const corSla = v => v === null || v === undefined ? DPC.org : (v >= 98 ? DPC.ok : (v >= 95 ? DPC.org : DPC.red));
  const tAtr = D.tAt.length + D.bAt.length;

  const area = (aba, cor, rot, valor, sub, estado) => `<button type="button" class="dp-area ${estado || ""}" data-dp-aba="${aba}" style="--ac:${cor}"><em>${rot}</em><b>${valor}</b><small>${sub}</small><span class="go">Abrir ›</span></button>`;
  const areas = `<div class="dp-areas">
      ${area("tambasa", DPC.ok, "Tambasa", D.tAb.length + " trocas", `${D.tAt.length} atrasada(s) · ${D.bAt.length} boleto(s) vencido(s) · ${D.pAb.length} pendência(s)`, tAtr ? "bad" : "")}
      ${area("sacs", DPC.blue, "SACs", LV.length + " focais", V ? `${nSac.bad} crítico(s) · ${nSac.warn} em atenção · ${nSac.ok} em dia` : "sem dados", nSac.bad ? "bad" : (nSac.warn ? "warn" : ""))}
      ${area("fechamento", DPC.navy, "Fechamento", fat ? dpBrl(fat) : "—", fat ? fmtInt(qctrc) + " CTRCs faturados" : "importe a Receita", "")}
      ${area("performance", DPC.org, "Performance", slaRede === null ? "—" : fmtPct(slaRede), slaRede === null ? "importe a Performance" : "SLA da rede · meta 98%", slaRede !== null && slaRede < 95 ? "bad" : (slaRede !== null && slaRede < 98 ? "warn" : ""))}
      ${area("ocorrencias", DPC.red, "Ocorrências", fmtInt(D.atr.length) + " docs", `${atr5} com +5 dias · ${fmtInt(n69)} com ocorrência 69`, atr5 ? "bad" : (D.atr.length ? "warn" : ""))}
    </div>`;

  const atencao = [];
  LV.filter(m => m.nivel === "bad" || m.nivel === "warn").sort((a, b) => (a.nivel === "bad" ? 0 : 1) - (b.nivel === "bad" ? 0 : 1) || (a.sla ?? 101) - (b.sla ?? 101))
    .forEach(m => atencao.push({n:m.nivel, tag:m.curto, txt:m.iss.slice(0, 2).join(" · "), sac:m.key}));
  if(D.bAt.length) atencao.push({n:"bad", tag:"Tambasa", txt:D.bAt.length + " boleto(s) vencido(s)", aba:"tambasa"});
  if(D.tAt.length) atencao.push({n:"bad", tag:"Tambasa", txt:D.tAt.length + " troca(s) com prazo vencido", aba:"tambasa"});
  atencao.sort((a, b) => (a.n === "bad" ? 0 : 1) - (b.n === "bad" ? 0 : 1));
  const atencaoHTML = atencao.length ? `<ul class="dp-att">${atencao.slice(0, 8).map(a => `<li class="${a.n}" ${a.sac ? `data-dp-sac="${escHtml(a.sac)}"` : `data-dp-aba="${a.aba}"`}><i></i><span class="dp-tag">${escHtml(a.tag)}</span><span>${escHtml(a.txt)}</span><em>Ver ›</em></li>`).join("")}</ul>` : `<div class="dp-empty ok">Nenhum ponto de atenção no momento.</div>`;

  /* SACs */
  const NIV = {ok:"Em dia", warn:"Atenção", bad:"Crítico", na:"Sem dados"}, RK = {bad:2, warn:1, ok:0, na:-1};
  const sacs = [...LV].sort((a, b) => RK[b.nivel] - RK[a.nivel] || (a.sla ?? 101) - (b.sla ?? 101) || b.fat - a.fat);
  const sacCard = m => `<button type="button" class="dp-sac ${m.nivel}" data-dp-sac="${escHtml(m.key)}">
      <span class="hd"><span class="nm"><b>${escHtml(m.curto)}</b><small>${escHtml(m.nome)}</small></span><em class="dp-st ${m.nivel}">${NIV[m.nivel]}</em></span>
      <span class="mid"><span class="k"><small>SLA</small><b style="color:${m.sla === null ? "var(--muted)" : corSla(m.sla)}">${m.sla === null ? "—" : fmtPct(m.sla)}</b></span><span class="k"><small>Faturamento</small><b>${m.fat ? dpBrl(m.fat) : "—"}</b></span></span>
      <span class="mini"><span class="${m.oc69 ? "w" : ""}"><b>${m.oc69}</b>Ocor. 69</span><span class="${m.atr5 ? "r" : (m.atr ? "w" : "")}"><b>${m.atr}</b>Atrasos</span><span class="${m.pend ? "w" : ""}"><b>${m.pend}</b>Pendên.</span><span class="${m.trocasAt ? "r" : ""}"><b>${m.trocasAt}</b>Trocas atr.</span></span>
      <span class="why ${m.iss.length ? "" : "ok"}">${m.iss.length ? escHtml(m.iss[0]) + (m.iss.length > 1 ? ` <em>+${m.iss.length - 1}</em>` : "") : (m.nivel === "na" ? "Sem dados importados" : "Tudo dentro do esperado")}</span></button>`;

  /* barras simples */
  const barras = (itens, fmt, cor, vazio, attr) => { if(!itens.length) return `<div class="dp-empty">${vazio}</div>`; const mx = Math.max(...itens.map(i => i.v), 1);
    return itens.map(i => `<${attr && i.attr ? "button type=\"button\"" : "div"} class="dp-bar wide" ${i.attr || ""}><span title="${escHtml(i.nome || i.l)}">${escHtml(i.l)}</span><i><u style="width:${Math.max(2, i.v / mx * 100)}%;background:${i.cor || cor}"></u></i><b style="${i.cor ? "color:" + i.cor : ""}">${fmt(i.v)}</b></${attr && i.attr ? "button" : "div"}>`).join(""); };

  /* Fechamento */
  let topUn = []; try{ if(typeof unidadesDestinoComDados === "function") topUn = unidadesDestinoComDados().filter(u => u.frete > 0).sort((a, b) => b.frete - a.frete).slice(0, 6); }catch(e){}
  if(!topUn.length){ try{ const r = loadReceitaData().unidades || {}; topUn = Object.keys(r).map(k => ({sigla:k, frete:combinaUnidadeReceita(r[k]).frete})).filter(u => u.frete > 0).sort((a, b) => b.frete - a.frete).slice(0, 6); }catch(e){} }
  const fatSac = [...LV].filter(m => m.fat > 0).sort((a, b) => b.fat - a.fat).map(m => ({l:m.curto, nome:m.key, v:m.fat, attr:`data-dp-sac="${escHtml(m.key)}"`}));
  const fatUn = soma(m => m.fatUn), fatPag = soma(m => m.fatPag);
  const pFechamento = `
    <div class="dp-kpis">
      ${dpKpi("fechamento-receita", "#141a14", "#3b8a1f", "fechamento-receita", "Faturamento (frete)", fat, "money", fmtInt(qctrc) + " CTRCs")}
      ${dpKpi("fechamento-receita", "#3d86c6", "#5fa3dc", "boletos", "Ticket médio", qctrc ? fat / qctrc : 0, "money", "frete por CTRC")}
      ${dpKpi("fechamento-receita", "#4f9d2d", "#6ab83f", "entregas", "Valor de mercadoria", merc, "money", merc ? "frete = " + (fat / merc * 100).toFixed(2).replace(".", ",") + "% da mercadoria" : "")}
    </div>
    <div class="dp-row dp-r2b">
      <div class="dp-card"><div class="dp-h"><b>Faturamento por SAC</b><span>frete · clique para abrir o SAC</span></div>${barras(fatSac, dpBrl, DPC.ok, "Importe o Faturamento Geral em Fechamento-RECEITA.", true)}</div>
      <div class="dp-card"><div class="dp-h"><b>Direção do frete</b><span>quem fatura quem</span></div>${barras([{l:"Do Valle → unidade", v:fatUn, cor:DPC.ok}, {l:"Pagadora → Do Valle", v:fatPag, cor:DPC.blue}].filter(x => x.v > 0), dpBrl, DPC.ok, "Sem faturamento importado.")}</div>
      <div class="dp-card"><div class="dp-h"><b>Maiores unidades</b><span>por frete recebido</span></div>${barras(topUn.map(u => ({l:u.sigla, nome:u.cidade || u.sigla, v:u.frete})), dpBrl, DPC.blue, "Sem faturamento por unidade importado.")}</div>
    </div>
    <div class="dp-link"><button type="button" class="dp-go" data-go="fechamento-receita">Abrir Fechamento-RECEITA completo ›</button></div>`;

  /* Performance */
  const slaSac = LV.filter(m => m.sla !== null).sort((a, b) => a.sla - b.sla).map(m => ({l:m.curto, nome:m.key, v:m.sla, cor:corSla(m.sla), attr:`data-dp-sac="${escHtml(m.key)}"`}));
  const pPerformance = `
    <div class="dp-kpis">
      ${dpKpi("performance-geral", "#4f9d2d", "#6ab83f", "performance-geral", "SLA da rede", pg && pg.sla !== null ? Math.round(pg.sla * 10) / 10 : 0, "pct", pg ? fmtInt(pg.entregue) + " entregues · meta 98%" : "importe a Performance Geral")}
      ${dpKpi("performance", "#3d86c6", "#5fa3dc", "performance", "SLA Tambasa", tot && tot.sla !== null ? Math.round(tot.sla * 10) / 10 : 0, "pct", pf ? fmtInt(tot.entregue) + " entregues" : "importe a Performance")}
      ${dpKpi("performance-geral", "#d9534f", "#e8655e", "ocorrencias", "Abertas e atrasadas", pg ? pg.abertoAtrasado : 0, "int", pg ? fmtInt(pg.abertoNoPrazo) + " abertas no prazo" : "—")}
      ${dpKpi("performance-geral", "#e2ad45", "#edc067", "entregas", "Fora do prazo", pg ? pg.foraDoPrazo : 0, "int", pg ? fmtInt(pg.atrasCli) + " cliente · " + fmtInt(pg.atrasTrans) + " transportadora" : "—")}
    </div>
    <div class="dp-row dp-r2b">
      <div class="dp-card"><div class="dp-h"><b>SLA por SAC</b><span>do menor para o maior · meta 98%</span></div>${barras(slaSac, v => fmtPct(v), DPC.ok, "Importe a Performance Geral (VAL/RVA).", true)}</div>
      <div class="dp-card"><div class="dp-h"><b>Menores SLA por unidade</b><span>Tambasa · meta 98%</span></div>
        ${pf ? piores.map(u => { const c = slaKpiClass(u.sla), cor = c === "ok" ? DPC.ok : (c === "warn" ? DPC.org : DPC.red), w = Math.max(2, Math.min(100, u.sla || 0));
          return `<button type="button" class="dp-bar" data-go="performance-geral" title="${fmtInt(u.entregue)} / ${fmtInt(u.total)} entregues"><span>${escHtml(u.sigla)}</span><i><u style="width:${w}%;background:${cor}"></u></i><b style="color:${cor}">${fmtPct(u.sla)}</b></button>`; }).join("") : `<div class="dp-empty">Nenhum relatório de performance importado</div>`}</div>
      <div class="dp-card dp-rings"><div class="dp-h"><b>Indicadores</b></div>
        <button type="button" class="dp-ringbtn" data-go="performance-geral">${pg ? dpRing(pg.sla, corSla(pg.sla), fmtPct(pg.sla), "SLA da rede · meta 98%") : `<div class="dp-empty">Importe a Performance</div>`}</button>
        <button type="button" class="dp-ringbtn" data-go="confirmacao">${dpRing(pctEnv, DPC.ok, D.env + " / " + D.conf.length, "Filiais enviaram")}</button></div>
    </div>
    <div class="dp-link"><button type="button" class="dp-go" data-go="performance-geral">Abrir Performance Geral completa ›</button></div>`;

  /* Ocorrências */
  const faixas = [["1–2 dias", 1, 2], ["3–5 dias", 3, 5], ["6–10 dias", 6, 10], ["11–20 dias", 11, 20], ["21+ dias", 21, 99999]].map(([l, a, b], i) => ({l, v:D.atr.filter(x => { const d = Number(x.diasAtraso) || 0; return d >= a && d <= b; }).length, cor:i >= 2 ? DPC.red : DPC.org}));
  const ocSac = LV.filter(m => m.atr || m.oc69).sort((a, b) => b.atr - a.atr || b.oc69 - a.oc69).map(m => ({l:m.curto, nome:m.key, v:m.atr, attr:`data-dp-sac="${escHtml(m.key)}" data-dp-sub="atrasos"`}));
  const piorDocs = [...D.atr].sort((a, b) => (Number(b.diasAtraso) || 0) - (Number(a.diasAtraso) || 0)).slice(0, 6);
  const freteRisco = soma(m => m.freteAtr) + soma(m => m.frete69);
  const pOcorrencias = `
    <div class="dp-kpis">
      ${dpKpi("ocorrencias", "#e2ad45", "#edc067", "ocorrencias", "Documentos em atraso", D.atr.length, "int", "ocorrência 150")}
      ${dpKpi("ocorrencias", "#d9534f", "#e8655e", "pendencias", "Mais de 5 dias", atr5, "int", "atraso crítico")}
      ${dpKpi("ocorrencias", "#7a6bd1", "#9a8ee0", "ocorrencias", "Ocorrência 69", n69, "int", "documentos")}
      ${dpKpi("ocorrencias", "#141a14", "#3b8a1f", "boletos", "Frete em risco", Math.round(freteRisco), "brlc", "atrasos + ocorrência 69")}
    </div>
    <div class="dp-row dp-r2b">
      <div class="dp-card"><div class="dp-h"><b>Atrasos por SAC</b><span>clique para listar</span></div>${barras(ocSac, v => fmtInt(v), DPC.red, "Nenhum documento em atraso importado.", true)}</div>
      <div class="dp-card"><div class="dp-h"><b>Tempo de atraso</b><span>documentos (150)</span></div>${D.atr.length ? barras(faixas, v => fmtInt(v), DPC.org, "") : `<div class="dp-empty">Nenhum documento em atraso importado.</div>`}</div>
      <div class="dp-card"><div class="dp-h"><b>Documentos mais atrasados</b><span>top 6</span></div>
        ${piorDocs.length ? piorDocs.map(a => { const d = Number(a.diasAtraso) || 0; return `<button type="button" class="dp-doc" data-go="ocorrencias"><span><b>${escHtml(String(a.ctrc || a.nf || "-"))}</b><small>${escHtml(String(a.unidade || "-"))} · ${escHtml(String(a.pagador || "-").slice(0, 24))}</small></span><em class="dp-pill ${d > 5 ? "late" : "soon"}">${d} dia(s)</em></button>`; }).join("") : `<div class="dp-empty ok">Nenhum documento em atraso.</div>`}</div>
    </div>
    <div class="dp-link"><button type="button" class="dp-go" data-go="ocorrencias">Abrir Ocorrências completas ›</button><button type="button" class="dp-go" data-dp-vo="ocorrencias">Ver na Visão da Operação ›</button></div>`;

  /* Tambasa (somente Tambasa: trocas, boletos, pendências) */
  const pTambasa = `
    <div class="dp-kpis">
      ${dpKpi("trocas","#4f9d2d","#6ab83f","trocas","Trocas em aberto",D.tAb.length,"int",D.tAt.length + " atrasada(s)")}
      ${dpKpi("boletos","#3d86c6","#5fa3dc","boletos","Valor em débito",D.deb,"money",D.boletos.length + " boleto(s) · " + D.bAt.length + " vencido(s)")}
      ${dpKpi("pendencias","#d9534f","#e8655e","pendencias","Pendências abertas",D.pAb.length,"int","ainda não resolvidas")}
    </div>
    <div class="dp-row dp-r1">
      <div class="dp-card"><div class="dp-h"><b>Movimentação</b><span>novos registros por dia</span><div class="dp-seg-btns sm" id="dpPeriodo">${[7,30,90].map(n => `<button type="button" data-p="${n}" class="${dpPeriod===n?'on':''}">${n} dias</button>`).join("")}</div></div>
        <div class="dp-chips" id="dpChips"></div><div class="dp-chart" id="dpChart"></div></div>
      <div class="dp-card dp-rings"><div class="dp-h"><b>Indicadores</b><span>clique para abrir</span></div>
        <button type="button" class="dp-ringbtn" data-go="confirmacao">${dpRing(pctEnv, DPC.ok, D.env + " / " + D.conf.length, "Filiais enviaram")}</button>
        <button type="button" class="dp-ringbtn" data-go="boletos">${dpRing(D.boletos.length ? (D.boletos.length - D.bAt.length) / D.boletos.length * 100 : 100, D.bAt.length ? DPC.red : DPC.ok, (D.boletos.length - D.bAt.length) + " / " + D.boletos.length, "Boletos em dia")}</button>
      </div>
    </div>
    <div class="dp-row dp-r3b">
      <div class="dp-card"><div class="dp-h"><b>Pendências por tipo</b><span>abertas</span></div>${dpDonut("tipo", dTipos, "Nenhuma pendência aberta")}</div>
      <div class="dp-card"><div class="dp-h"><b>Trocas em aberto por filial</b><span>top 5</span></div>${dpDonut("fil", dFil, "Nenhuma troca em aberto")}</div>
    </div>
    <div class="dp-card"><div class="dp-h"><b>Prioridades</b><span>vencidas ou com prazo em até 2 dias</span>
      <div class="dp-seg-btns sm" id="dpFiltro">${[["todas","Todas"],["Troca","Trocas"],["Boleto","Boletos"]].map(([k,l]) => `<button type="button" data-f="${k}" class="${dpFiltro===k?'on':''}">${l}</button>`).join("")}</div></div>
      <div id="dpTabela"></div></div>`;

  const pResumo = areas + `<div class="dp-row dp-r1">
      <div class="dp-card"><div class="dp-h"><b>O que exige atenção agora</b><span>clique para ir direto ao assunto</span></div>${atencaoHTML}</div>
      <div class="dp-card dp-rings"><div class="dp-h"><b>Indicadores</b><span>clique para abrir</span></div>
        <button type="button" class="dp-ringbtn" data-dp-aba="performance">${pg ? dpRing(pg.sla, corSla(pg.sla), fmtPct(pg.sla), "SLA da rede · meta 98%") : `<div class="dp-empty">Importe a Performance para ver o SLA</div>`}</button>
        <button type="button" class="dp-ringbtn" data-dp-aba="sacs">${V && LV.length ? dpRing(nSac.ok / LV.length * 100, nSac.bad ? DPC.red : (nSac.warn ? DPC.org : DPC.ok), nSac.ok + " / " + LV.length, "SACs em dia") : ""}</button>
      </div></div>`;

  const ABAS = [["resumo", "Operação geral", "tudo num relance", 0], ["tambasa", "Tambasa", "trocas, boletos, pendências", tAtr], ["sacs", "SACs", "um cartão por focal", nSac.bad], ["fechamento", "Fechamento", "faturamento / receita", 0], ["performance", "Performance", "SLA e entregas", 0], ["ocorrencias", "Ocorrências", "69 e docs em atraso", atr5]];
  if(!ABAS.some(a => a[0] === dpAba)) dpAba = "resumo";
  const PAINEIS = {resumo:pResumo, tambasa:pTambasa, sacs:`<div class="dp-sacs">${sacs.length ? sacs.map(sacCard).join("") : `<div class="dp-empty">Nenhum SAC com dados ainda.</div>`}</div><div class="dp-link"><button type="button" class="dp-go" data-dp-vo="">Abrir a Visão da Operação (tela cheia) ›</button></div>`, fechamento:pFechamento, performance:pPerformance, ocorrencias:pOcorrencias};

  return `<div class="dp">
    <div class="dp-hello"><div><h2>Olá! Visão geral da operação</h2>
      <p><span class="dp-live"></span><span id="dpClock"></span> · ${crit === 0 ? "nenhum ponto crítico" : crit + " ponto(s) crítico(s) exigindo atenção"}</p></div>
      <button type="button" class="dp-vo-btn" data-vo-open title="Abrir a visão completa da operação, por focal"><span class="ico">${window.VISAO_OPERACAO_ICON || ""}</span><span>Visão da Operação<small>tudo por focal · tela cheia</small></span><span class="arr">›</span></button></div>
    <nav class="dp-tabs" id="dpTabs" role="tablist">${ABAS.map(([id, nome, sub, n]) => `<button type="button" role="tab" data-dp-aba="${id}" class="${dpAba === id ? "on" : ""}" aria-selected="${dpAba === id}"><b>${nome}</b><small>${sub}</small>${n ? `<i class="dp-badge">${n}</i>` : ""}</button>`).join("")}</nav>
    ${ABAS.map(([id]) => `<section class="dp-panel" data-dp-painel="${id}" ${dpAba === id ? "" : "hidden"}>${PAINEIS[id]}</section>`).join("")}
  </div>`;
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
  root.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.go)));
  const irAba = id => { dpAba = id; try{ LS.setItem("painel_dp_aba", id); }catch(e){}
    root.querySelectorAll("#dpTabs button").forEach(b => { const on = b.dataset.dpAba === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    root.querySelectorAll("[data-dp-painel]").forEach(p => { p.hidden = p.dataset.dpPainel !== id; });
    const t = document.getElementById("dpTabs"); if(t && t.getBoundingClientRect().top < 0) t.scrollIntoView({block:"start"}); };
  root.querySelectorAll("[data-dp-aba]").forEach(b => b.addEventListener("click", () => irAba(b.dataset.dpAba)));
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
  dpDrawChart(); dpDrawTable();
  const tick = () => { const c = document.getElementById("dpClock"); if(!c){ clearInterval(dpTimer); dpTimer = null; return; }
    const a = new Date(); c.textContent = a.toLocaleDateString("pt-BR", {weekday:"long", day:"2-digit", month:"long"}) + " · " + a.toLocaleTimeString("pt-BR"); };
  tick(); if(dpTimer) clearInterval(dpTimer); dpTimer = setInterval(tick, 1000);
}
