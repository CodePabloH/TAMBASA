/* Dashboard principal — visual interativo (cartões coloridos, gráfico, rosquinhas, anéis).
   Usa os mesmos dados das demais abas; só a apresentação mudou. */
let dpPeriod = 30, dpHidden = new Set(), dpFiltro = "todas", dpD = null, dpTimer = null, dpDon = {};
const DPC = {ok:"#00c389", blue:"#3fa1f5", red:"#f0506e", org:"#ffa30a", navy:"#0f1c47", pal:["#3fa1f5","#00c389","#ffa30a","#f0506e","#7c5cff","#9aa3b8"]};

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

  return `<div class="dp">
    <div class="dp-hello"><div><h2>Olá! Visão geral da operação</h2>
      <p><span class="dp-live"></span><span id="dpClock"></span> · ${crit === 0 ? "nenhum ponto crítico" : crit + " ponto(s) crítico(s) exigindo atenção"}</p></div>
      <button type="button" class="dp-vo-btn" data-vo-open title="Abrir a visão completa da operação, por focal"><span class="ico">${window.VISAO_OPERACAO_ICON || ""}</span><span>Visão da Operação<small>tudo por focal · tela cheia</small></span><span class="arr">›</span></button>
      <div class="dp-seg-btns" id="dpPeriodo">${[7,30,90].map(n => `<button type="button" data-p="${n}" class="${dpPeriod===n?'on':''}">${n} dias</button>`).join("")}</div></div>

    <div class="dp-kpis">
      ${dpKpi("trocas","#00c389","#12d8a0","trocas","Trocas em aberto",D.tAb.length,"int",D.tAt.length + " atrasada(s)")}
      ${dpKpi("boletos","#3fa1f5","#5bb5ff","boletos","Valor em débito",D.deb,"money",D.boletos.length + " boleto(s) · " + D.bAt.length + " vencido(s)")}
      ${dpKpi("pendencias","#f0506e","#ff7a90","pendencias","Pendências abertas",D.pAb.length,"int","ainda não resolvidas")}
      ${dpKpi("ocorrencias","#ffa30a","#ffbf47","ocorrencias","Documentos em atraso",D.atr.length,"int",D.crit + " com +5 dias")}
    </div>

    <div class="dp-row dp-r1">
      <div class="dp-card"><div class="dp-h"><b>Movimentação</b><span>novos registros por dia</span></div>
        <div class="dp-chips" id="dpChips"></div><div class="dp-chart" id="dpChart"></div></div>
      <div class="dp-card dp-rings"><div class="dp-h"><b>Indicadores</b><span>clique para abrir</span></div>
        <button type="button" class="dp-ringbtn" data-go="confirmacao">${dpRing(pctEnv, DPC.ok, D.env + " / " + D.conf.length, "Filiais enviaram")}</button>
        <button type="button" class="dp-ringbtn" data-go="performance-geral">${pf ? dpRing(tot.sla, tot.sla >= 98 ? DPC.ok : (tot.sla >= 95 ? DPC.org : DPC.red), fmtPct(tot.sla), "SLA · meta 98%") : `<div class="dp-empty">Importe a Performance para ver o SLA</div>`}</button>
      </div>
    </div>

    <div class="dp-row dp-r2">
      <div class="dp-card"><div class="dp-h"><b>Pendências por tipo</b><span>abertas</span></div>${dpDonut("tipo", dTipos, "Nenhuma pendência aberta")}</div>
      <div class="dp-card"><div class="dp-h"><b>Trocas em aberto por filial</b><span>top 5</span></div>${dpDonut("fil", dFil, "Nenhuma troca em aberto")}</div>
      <div class="dp-card"><div class="dp-h"><b>Menores SLA por unidade</b><span>meta 98%</span></div>
        ${pf ? piores.map(u => { const c = slaKpiClass(u.sla), cor = c === "ok" ? DPC.ok : (c === "warn" ? DPC.org : DPC.red), w = Math.max(2, Math.min(100, u.sla || 0));
          return `<button type="button" class="dp-bar" data-go="performance-geral" title="${fmtInt(u.entregue)} / ${fmtInt(u.total)} entregues"><span>${escHtml(u.sigla)}</span><i><u style="width:${w}%;background:${cor}"></u></i><b style="color:${cor}">${fmtPct(u.sla)}</b></button>`; }).join("") : `<div class="dp-empty">Nenhum relatório de performance importado</div>`}
      </div>
    </div>

    <div class="dp-card"><div class="dp-h"><b>Prioridades</b><span>vencidas ou com prazo em até 2 dias</span>
      <div class="dp-seg-btns sm" id="dpFiltro">${[["todas","Todas"],["Troca","Trocas"],["Boleto","Boletos"]].map(([k,l]) => `<button type="button" data-f="${k}" class="${dpFiltro===k?'on':''}">${l}</button>`).join("")}</div></div>
      <div id="dpTabela"></div></div>
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
  root.querySelectorAll("[data-vo-open]").forEach(b => b.addEventListener("click", () => { if(window.abrirVisaoOperacao) window.abrirVisaoOperacao(); }));
  const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach(el => {
    const alvo = Number(el.dataset.count) || 0, money_ = el.dataset.format === "money";
    const f = v => money_ ? "R$ " + money(v) : Math.round(v).toLocaleString("pt-BR");
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
