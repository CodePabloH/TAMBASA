/* =====================================================================
   VISÃO OPERACIONAL POR UNIDADE — painel de BI  (v3.0)   id interno da aba: "detalhe-filial"
   Só admin e supervisao@gmail.com veem (papeis.js). SÓ LÊ o que o painel já tem — não importa nada aqui:
   o que é importado no Fechamento-RECEITA (e Performance / Ocorrências) muda esta página na próxima abertura.

   Fontes
     Faturamento .... Fechamento-RECEITA: unidade de entrega (recebido) e unidade expedidora (expedido): CT-e, volumes, peso, valor da mercadoria, frete
     Performance .... ESCOLHA: "Performance Teste" (PTDados) ou "Performance Geral" (VAL/RVA do resumo) — e sistema Geral / Do Valle / Real Vale
     Pendências ..... Ocorrências 150 (atraso) e 69; focal responsável = cadastro de Focais
     Dia a dia ...... entregas feitas (Performance Teste) + CT-e emitidos por dia (Faturamento Geral)
   Gráficos em SVG próprio (sem biblioteca externa). Tudo clicável: ranking troca a unidade, cartões abrem a aba, legenda liga/desliga série.
   ===================================================================== */
(function(){
  "use strict";

  const META_SLA = 98;
  const s3 = x => String(x == null ? "" : x).trim().toUpperCase().slice(0, 3);
  const num = x => Number(x) || 0;
  const int = n => (Number(n) || 0).toLocaleString("pt-BR");
  const dec = (n, d) => (Number(n) || 0).toLocaleString("pt-BR", {minimumFractionDigits:d, maximumFractionDigits:d});
  const pct = (v, d) => v === null || v === undefined || isNaN(v) ? "—" : (Number(v).toFixed(d == null ? 2 : d).replace(".", ",") + "%");
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])));
  const moeda = v => (typeof fmtMoeda === "function" ? fmtMoeda(v) : "R$ " + dec(v, 2));
  const moedaK = v => { v = num(v); return Math.abs(v) >= 1e6 ? "R$ " + dec(v / 1e6, 2) + " mi" : Math.abs(v) >= 1e4 ? "R$ " + dec(v / 1e3, 1) + " mil" : moeda(v); };
  const kg = v => dec(v, 0) + " kg";
  const brIso = iso => { const p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] : ""; };
  const DIA_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const diaSem = iso => { const d = new Date(iso + "T12:00:00"); return isNaN(d) ? "" : DIA_SEM[d.getDay()]; };
  const ticket = (frete, qtd) => qtd > 0 ? frete / qtd : null;
  const moedaOuTraco = v => v === null || v === undefined ? "—" : moeda(v);
  const mesRot = m => (m && typeof frMesRotulo === "function" && /^\d{4}-\d{2}$/.test(m)) ? frMesRotulo(m) : (m || "—");

  const COR = {rec:"#3b8a1f", exp:"#2f6fb3", ticket:"#D4A017", ruim:"#c0392b", ok:"#2f8a2a", neutro:"#8a9885", dia:"#7a5cc0"};

  /* ---------- estado (lembrado neste navegador) ---------- */
  const LSK = "painel_vou_ui_v1";
  const ST = {fonte:"", sistema:"", aba:"visao", metrica:"frecv", ocultas:[], comp:[]};
  try{ Object.assign(ST, JSON.parse(localStorage.getItem(LSK) || "{}") || {}); }catch(e){}
  const salvarST = () => { try{ localStorage.setItem(LSK, JSON.stringify({fonte:ST.fonte, sistema:ST.sistema, aba:ST.aba, metrica:ST.metrica})); }catch(e){} };

  let sigla = "";
  let cache = null;   // zerado a cada abertura da página (dados podem ter mudado)

  /* ---------- fontes: Faturamento ---------- */
  function totais(u){
    const t = {qctrc:0, qtvol:0, peso:0, frete:0, vlrMerc:0, origens:[], dias:{}, por:{}};
    if(!u) return t;
    ["val", "rva"].forEach(o => {
      const x = u[o]; if(!x) return;
      const O = o.toUpperCase();
      t.origens.push(O);
      t.por[O] = {qctrc:num(x.qctrc), qtvol:num(x.qtvol), frete:num(x.frete), vlrMerc:num(x.vlrMerc)};
      t.qctrc += num(x.qctrc); t.qtvol += num(x.qtvol); t.peso += num(x.peso); t.frete += num(x.frete); t.vlrMerc += num(x.vlrMerc);
      if(x.dias) Object.keys(x.dias).forEach(k => { t.dias[k] = (t.dias[k] || 0) + num(x.dias[k]); });
    });
    return t;
  }

  /* ---------- fontes: Performance (Teste ou Geral) ---------- */
  const slaGeral = t => { const den = t.entregue - t.atrasCli; return den > 0 ? t.noPrazoEnt / den * 100 : (t.entregue > 0 ? 0 : null); };
  const slaTeste = t => (window.PTCore && window.PTCore.calcPerformance) ? window.PTCore.calcPerformance(t.noPrazoEnt, t.atrasCli, t.entregue) : slaGeral(t);
  const CAMPOS = ["exped", "entregue", "noPrazoEnt", "atrasCli", "atrasTrans", "atrasPend", "abertoAtrasado", "abertoNoPrazo"];
  const novoPerf = () => { const t = {}; CAMPOS.forEach(k => { t[k] = 0; }); return t; };
  function fechaPerf(t, fonte){ t.foraDoPrazo = t.atrasCli + t.atrasTrans + t.atrasPend; t.sla = fonte === "teste" ? slaTeste(t) : slaGeral(t); return t; }

  function temTeste(){ try{ return !!(window.PTDados && window.PTDados.pronto() && window.PTDados.temBase()); }catch(e){ return false; } }
  function temGeral(){ try{ const v = load(KEYS.performanceGeralVal), r = load(KEYS.performanceGeralRva); return !!((v && v.unidades && v.unidades.length) || (r && r.unidades && r.unidades.length)); }catch(e){ return false; } }

  function perfDaFonte(fonte, sistema, mesRec){
    const out = {fonte, mapa:{}, rotulo:"", mes:"", ok:false, tot:null, res:null};
    if(fonte === "teste"){
      if(!temTeste()) return out;
      const D = window.PTDados, meses = D.meses();
      const mes = meses.indexOf(mesRec) > -1 ? mesRec : D.mesPadrao();
      const res = D.calcular({mes, sistema});
      res.unidades.forEach(u => { const sg = s3(u.sigla); const t = out.mapa[sg] || (out.mapa[sg] = novoPerf()); CAMPOS.forEach(k => { t[k] += num(u[k]); }); });
      out.mes = mes; out.res = res; out.rotulo = "Performance Teste · " + mesRot(mes); out.ok = true;
    }else{
      if(!temGeral()) return out;
      const v = load(KEYS.performanceGeralVal), r = load(KEYS.performanceGeralRva);
      const m = mesclarPerformanceGeral(sistema === "RVA" ? null : v, sistema === "VAL" ? null : r);
      m.unidades.forEach(u => { const sg = s3(u.sigla); const t = out.mapa[sg] || (out.mapa[sg] = novoPerf()); CAMPOS.forEach(k => { t[k] += num(u[k]); }); });
      out.rotulo = "Performance Geral" + (m.periodo ? " · " + m.periodo : ""); out.ok = Object.keys(out.mapa).length > 0;
    }
    const tot = novoPerf();
    Object.keys(out.mapa).forEach(sg => { fechaPerf(out.mapa[sg], fonte); CAMPOS.forEach(k => { tot[k] += out.mapa[sg][k]; }); });
    out.tot = fechaPerf(tot, fonte);
    return out;
  }

  /* ---------- fontes: Pendências / focal ---------- */
  const listaPend = () => {
    let a150 = [], a69 = [];
    try{ a150 = load(KEYS.atrasos) || []; }catch(e){}
    try{ a69 = load(KEYS.ocorrencias) || []; }catch(e){}
    return {a150, a69};
  };
  function atendentes(sg){
    const lista = [];
    try{ const f = focalPorSigla(sg); if(f) lista.push(f.titulo); }catch(e){}
    try{ if(typeof FOCAIS_ESPECIAIS_POR_UNIDADE !== "undefined" && FOCAIS_ESPECIAIS_POR_UNIDADE[sg]) lista.push(FOCAIS_ESPECIAIS_POR_UNIDADE[sg] + " (unidade especial)"); }catch(e){}
    return lista;
  }
  const diasAtraso = r => num(String(r.diasAtraso || "").replace(/\D/g, ""));
  const topN = (mapa, n) => Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, n);

  /* ---------- a "rede": todas as unidades de uma vez (base de ranking e comparação) ---------- */
  function montarRede(){
    const mesRec = (typeof frMesAtual === "function" && frMesAtual()) || "";
    const chave = [ST.fonte, ST.sistema, mesRec].join("|");
    if(cache && cache.chave === chave) return cache;

    const ud = (typeof loadUnidadeDestinoData === "function" ? loadUnidadeDestinoData().unidades : {}) || {};
    const ue = (typeof loadUnidadeExpedidoraData === "function" ? loadUnidadeExpedidoraData().unidades : {}) || {};
    const perf = perfDaFonte(ST.fonte, ST.sistema, mesRec);
    const P = listaPend();

    const un = {};
    const U = sg => un[sg] || (un[sg] = {sg, cidade:"", rec:totais(null), exp:totais(null), perf:null, n150:0, n69:0, mais5:0});
    Object.values(ud).forEach(u => { const x = U(s3(u.sigla)); x.rec = totais(u); if(u.cidade) x.cidade = u.cidade; });
    Object.values(ue).forEach(u => { U(s3(u.sigla)).exp = totais(u); });
    Object.keys(perf.mapa).forEach(sg => { U(sg).perf = perf.mapa[sg]; });
    P.a150.forEach(r => { const x = U(s3(r.unidade)); if(!s3(r.unidade)){ delete un[""]; return; } x.n150++; if(diasAtraso(r) > 5) x.mais5++; });
    P.a69.forEach(r => { if(!s3(r.unidade)) return; U(s3(r.unidade)).n69++; });
    delete un[""];

    const lista = Object.values(un);
    const rede = {lista, mapa:un, mesRec, perf, chave,
      rec:{qctrc:0, qtvol:0, frete:0, vlrMerc:0}, exp:{qctrc:0, qtvol:0, frete:0, vlrMerc:0}, nFrete:0};
    lista.forEach(u => {
      ["qctrc", "qtvol", "frete", "vlrMerc"].forEach(k => { rede.rec[k] += u.rec[k]; rede.exp[k] += u.exp[k]; });
      if(u.rec.frete > 0) rede.nFrete++;
    });
    cache = rede;
    return rede;
  }

  const METRICAS = [
    {id:"frecv", rot:"Faturamento (frete recebido)", get:u => u.rec.frete, fmt:moedaK, vazio:u => !(u.rec.frete > 0)},
    {id:"fexp",  rot:"Frete expedido",               get:u => u.exp.frete, fmt:moedaK, vazio:u => !(u.exp.frete > 0)},
    {id:"cte",   rot:"CT-e (recebidos + expedidos)", get:u => u.rec.qctrc + u.exp.qctrc, fmt:int, vazio:u => !(u.rec.qctrc + u.exp.qctrc)},
    {id:"vol",   rot:"Volumes",                      get:u => u.rec.qtvol + u.exp.qtvol, fmt:int, vazio:u => !(u.rec.qtvol + u.exp.qtvol)},
    {id:"tick",  rot:"Ticket médio (recebido)",      get:u => ticket(u.rec.frete, u.rec.qctrc), fmt:moeda, vazio:u => !(u.rec.qctrc > 0)},
    {id:"sla",   rot:"Performance (SLA)",            get:u => u.perf && u.perf.entregue > 0 ? u.perf.sla : null, fmt:v => pct(v), vazio:u => !(u.perf && u.perf.entregue > 0), escala:100},
    {id:"pend",  rot:"Pendências 150 + 69 (mais críticas primeiro)", get:u => u.n150 + u.n69, fmt:int, vazio:u => !(u.n150 + u.n69)}
  ];
  const metDe = id => METRICAS.find(m => m.id === id) || METRICAS[0];
  function rankear(rede, met){
    return rede.lista.filter(u => !met.vazio(u)).map(u => ({u, v:met.get(u)})).filter(x => x.v !== null).sort((a, b) => b.v - a.v || a.u.sg.localeCompare(b.u.sg));
  }
  const posicao = (rede, met, sg) => { const r = rankear(rede, met); const i = r.findIndex(x => x.u.sg === sg); return {pos:i + 1, de:r.length}; };

  /* ---------- peças gráficas (SVG / HTML) ---------- */
  const tip = t => `data-dtip="${esc(t)}"`;

  function gauge(valor, meta, tam){
    const cx = 110, cy = 105, r = 84, min = 70, max = 100;
    const frac = v => Math.max(0, Math.min(1, (v - min) / (max - min)));
    const pt = (f, rr) => { const a = Math.PI * (1 - f); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    const arco = (f0, f1, rr) => { const [x0, y0] = pt(f0, rr), [x1, y1] = pt(f1, rr); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rr} ${rr} 0 ${0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    const tem = valor !== null && valor !== undefined && !isNaN(valor);
    const f = tem ? frac(valor) : 0, ok = tem && valor >= meta;
    const [mx0, my0] = pt(frac(meta), r - 13), [mx1, my1] = pt(frac(meta), r + 11);
    return `<svg class="dfb-gauge" viewBox="0 0 220 128" role="img" aria-label="Performance ${tem ? pct(valor) : "sem dados"}">
      <path d="${arco(0, 1, r)}" fill="none" stroke="#e4e9e0" stroke-width="15" stroke-linecap="round"/>
      ${tem ? `<path d="${arco(0, Math.max(f, 0.015), r)}" fill="none" stroke="${ok ? COR.ok : COR.ruim}" stroke-width="15" stroke-linecap="round"/>` : ""}
      <line x1="${mx0.toFixed(1)}" y1="${my0.toFixed(1)}" x2="${mx1.toFixed(1)}" y2="${my1.toFixed(1)}" stroke="#141a14" stroke-width="2.5"/>
      <text x="${cx}" y="${cy - 14}" text-anchor="middle" class="dfb-g-v">${tem ? pct(valor) : "—"}</text>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="dfb-g-s">meta ${META_SLA}%</text>
      <text x="${cx - r}" y="${cy + 20}" text-anchor="middle" class="dfb-g-t">${min}%</text>
      <text x="${cx + r}" y="${cy + 20}" text-anchor="middle" class="dfb-g-t">${max}%</text>
    </svg>`;
  }

  function donut(partes, centro, sub){
    const tot = partes.reduce((s, p) => s + p.v, 0);
    if(!(tot > 0)) return `<div class="dfb-vazio">Sem valores para exibir.</div>`;
    let acc = 0;
    const arcos = partes.filter(p => p.v > 0).map(p => {
      const f = p.v / tot * 100, seg = `<circle class="dfb-seg" cx="21" cy="21" r="15.9155" fill="none" stroke="${p.c}" stroke-width="6.2" stroke-dasharray="${Math.max(f - 0.6, 0.4).toFixed(2)} ${(100 - f + 0.6).toFixed(2)}" stroke-dashoffset="${(25 - acc).toFixed(2)}" ${tip(p.t + "\n" + pct(f, 1) + " do total")}/>`;
      acc += f; return seg;
    }).join("");
    return `<div class="dfb-donut"><svg viewBox="0 0 42 42" role="img">${arcos}
      <text x="21" y="20.4" text-anchor="middle" class="dfb-d-v">${centro}</text><text x="21" y="25.6" text-anchor="middle" class="dfb-d-s">${sub}</text></svg>
      <ul class="dfb-leg">${partes.map(p => `<li><i style="background:${p.c}"></i><span>${esc(p.t)}</span><b>${p.f}</b></li>`).join("")}</ul></div>`;
  }

  // Barras horizontais (ranking). itens: {sg, v, rot, destaque}
  function barrasRank(itens, fmt, escala){
    if(!itens.length) return `<div class="dfb-vazio">Sem dados para este indicador.</div>`;
    const max = escala || Math.max.apply(null, itens.map(i => i.v)) || 1;
    return `<ol class="dfb-rank">${itens.map(i => `<li><button type="button" class="${i.destaque ? "sel" : ""}" data-sg="${esc(i.sg)}" ${tip(i.sg + (i.cidade ? " — " + i.cidade : "") + "\n" + fmt(i.v) + "\nClique para abrir esta unidade")}>
      <em>${i.pos}º</em><span class="n">${esc(i.sg)}</span><span class="b"><i style="width:${Math.max(i.v / max * 100, 2)}%"></i></span><b>${fmt(i.v)}</b></button></li>`).join("")}</ol>`;
  }

  // Duas barras lado a lado (unidade x referência)
  function duelo(rot, a, b, fmt, rotA, rotB, corA, corB){
    const m = Math.max(num(a), num(b)) || 1;
    return `<div class="dfb-duelo"><div class="dfb-duelo-t">${rot}</div>
      <div class="dfb-duelo-l" ${tip(rotA + ": " + fmt(a))}><span>${rotA}</span><span class="b"><i style="width:${num(a) / m * 100}%;background:${corA}"></i></span><b>${fmt(a)}</b></div>
      <div class="dfb-duelo-l" ${tip(rotB + ": " + fmt(b))}><span>${rotB}</span><span class="b"><i style="width:${num(b) / m * 100}%;background:${corB}"></i></span><b>${fmt(b)}</b></div></div>`;
  }

  function delta(v, ref, inverso, sufixo){
    if(v === null || ref === null || v === undefined || ref === undefined || !(ref > 0) || !(v >= 0)) return "";
    const d = (v - ref) / ref * 100, bom = inverso ? d <= 0 : d >= 0;
    return `<span class="dfb-dl ${bom ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${dec(Math.abs(d), 1)}% ${sufixo || "vs rede"}</span>`;
  }

  function spark(mapa, cor){
    const ks = Object.keys(mapa).sort(); if(ks.length < 2) return "";
    const vs = ks.map(k => num(mapa[k])), mx = Math.max.apply(null, vs) || 1, w = 100, h = 26;
    const pts = vs.map((v, i) => `${(i / (vs.length - 1) * w).toFixed(1)},${(h - 2 - v / mx * (h - 4)).toFixed(1)}`);
    return `<svg class="dfb-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts.join(" ")} ${w},${h} 0,${h}" fill="${cor}" fill-opacity=".14" stroke="none"/><polyline points="${pts.join(" ")}" fill="none" stroke="${cor}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // Série temporal com tooltip por dia e legenda que liga/desliga
  function graficoDias(dias, series){
    const W = 920, H = 270, mL = 44, mR = 14, mT = 14, mB = 30, iw = W - mL - mR, ih = H - mT - mB;
    const vis = series.filter(s => ST.ocultas.indexOf(s.k) === -1);
    const mx = Math.max.apply(null, [1].concat(vis.map(s => Math.max.apply(null, dias.map(d => num(s.d[d])))))), topo = Math.ceil(mx * 1.1);
    const X = i => mL + (dias.length === 1 ? iw / 2 : i / (dias.length - 1) * iw), Y = v => mT + ih - v / topo * ih;
    const grades = [0, .25, .5, .75, 1].map(f => { const v = topo * f, y = Y(v); return `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="#e4e9e0"/><text x="${mL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="dfb-ax">${int(Math.round(v))}</text>`; }).join("");
    const passo = Math.ceil(dias.length / 12);
    const rotX = dias.map((d, i) => (i % passo === 0 || (i === dias.length - 1 && (i % passo) >= Math.ceil(passo / 2))) ? `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="dfb-ax">${brIso(d)}</text>` : "").join("");
    const linhas = vis.map(s => {
      const pts = dias.map((d, i) => `${X(i).toFixed(1)},${Y(num(s.d[d])).toFixed(1)}`).join(" ");
      const area = s.area ? `<polygon points="${X(0).toFixed(1)},${Y(0)} ${pts} ${X(dias.length - 1).toFixed(1)},${Y(0)}" fill="${s.c}" fill-opacity=".10"/>` : "";
      return `${area}<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` + dias.map((d, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(num(s.d[d])).toFixed(1)}" r="2.6" fill="#fff" stroke="${s.c}" stroke-width="1.6"/>`).join("");
    }).join("");
    const larg = dias.length > 1 ? iw / (dias.length - 1) : iw;
    const hits = dias.map((d, i) => `<g class="dfb-hit"><line class="x" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${mT}" y2="${mT + ih}"/><rect x="${(X(i) - larg / 2).toFixed(1)}" y="${mT}" width="${larg.toFixed(1)}" height="${ih}" fill="transparent" ${tip(brIso(d) + " (" + diaSem(d) + ")\n" + series.map(s => s.n + ": " + int(s.d[d])).join("\n"))}/></g>`).join("");
    const leg = series.map(s => `<button type="button" class="dfb-lg ${ST.ocultas.indexOf(s.k) > -1 ? "off" : ""}" data-serie="${s.k}"><i style="background:${s.c}"></i>${esc(s.n)}</button>`).join("");
    return `<div class="dfb-legbar">${leg}<span class="dfb-hint">clique na legenda para ligar/desligar · passe o mouse nos dias</span></div>
      <svg class="dfb-line" viewBox="0 0 ${W} ${H}" role="img">${grades}${rotX}${linhas}${hits}</svg>`;
  }

  /* ---------- peças de layout ---------- */
  const card = (tit, corpo, cls, acao) => `<section class="dfb-card ${cls || ""}"><header><h3>${tit}</h3>${acao || ""}</header><div class="dfb-cb">${corpo}</div></section>`;
  function kpi(rot, valor, sub, extra, o){
    o = o || {};
    return `<button type="button" class="dfb-kpi ${o.cls || ""}" ${o.aba ? `data-aba="${o.aba}"` : "disabled"} ${o.tip ? tip(o.tip) : ""}><span class="l">${rot}</span><span class="v">${valor}</span><span class="s">${sub || "&nbsp;"}</span><span class="x">${extra || ""}</span></button>`;
  }
  function selectOpts(lista, atual){ return lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(atual) ? "selected" : ""}>${esc(t)}</option>`).join(""); }

  /* ---------- dados da unidade escolhida ---------- */
  function dadosUnidade(rede, sg){
    const u = rede.mapa[sg] || {sg, cidade:"", rec:totais(null), exp:totais(null), perf:null, n150:0, n69:0, mais5:0};
    const P = listaPend();
    const f150 = P.a150.filter(r => s3(r.unidade) === sg), f69 = P.a69.filter(r => s3(r.unidade) === sg);
    const focal = {};
    const toca = (l, k) => l.forEach(r => { const f = r.focal || "Sem focal"; (focal[f] || (focal[f] = {n150:0, n69:0}))[k]++; });
    toca(f150, "n150"); toca(f69, "n69");
    const oc150 = {}, oc69 = {};
    f150.forEach(r => { const k = ((r.codOcorrencia ? r.codOcorrencia + " · " : "") + (r.descrOcorrencia || "")).trim() || "Sem descrição"; oc150[k] = (oc150[k] || 0) + 1; });
    f69.forEach(r => { const k = (r.pendencia || r.busca || r.ultOcor || "").trim() || "Sem descrição"; oc69[k] = (oc69[k] || 0) + 1; });
    let abertos = {}, entDia = {};
    if(ST.fonte === "teste" && rede.perf.ok && rede.perf.res){
      rede.perf.res.detalhe.forEach(d => { if(s3(d.r.u) === sg && /^Aberto/.test(d.situacao)){ const c = d.r.c || "—"; abertos[c] = (abertos[c] || 0) + 1; } });
      try{ window.PTDados.registros().forEach(r => { if(s3(r.u) === sg && r.e && window.PTCore.ehBaixa(r.c, r.u)){ entDia[r.e] = (entDia[r.e] || 0) + 1; } }); }catch(e){}
    }
    return {u, focal, oc150, oc69, abertos, entDia, ats:atendentes(sg)};
  }

  /* ---------- abas ---------- */
  const ABAS = [["visao", "Visão geral"], ["fat", "Faturamento"], ["perf", "Performance"], ["pend", "Pendências"], ["dia", "Dia a dia"], ["comp", "Comparar unidades"]];

  function leituraRapida(rede, D){
    const u = D.u, it = [];
    const mov = u.rec.qctrc + u.exp.qctrc, movF = u.rec.frete + u.exp.frete;
    const tickU = ticket(movF, mov), tickR = ticket(rede.rec.frete + rede.exp.frete, rede.rec.qctrc + rede.exp.qctrc);
    const p = u.perf;
    if(p && p.entregue > 0){
      const d = p.sla - META_SLA;
      it.push([d >= 0 ? "ok" : "ruim", `Performance de <b>${pct(p.sla)}</b>, ${d >= 0 ? "acima" : "abaixo"} da meta em <b>${dec(Math.abs(d), 2)} p.p.</b>`]);
      if(p.abertoAtrasado > 0) it.push(["warn", `<b>${int(p.abertoAtrasado)}</b> documentos abertos já estão em atraso.`]);
    }
    if(tickU && tickR){ const d = (tickU - tickR) / tickR * 100; it.push([d >= 0 ? "ok" : "warn", `Ticket médio de <b>${moeda(tickU)}</b>, ${dec(Math.abs(d), 1)}% ${d >= 0 ? "acima" : "abaixo"} da rede (${moeda(tickR)}).`]); }
    const pf = posicao(rede, metDe("frecv"), u.sg);
    if(pf.pos) it.push(["info", `<b>${pf.pos}º</b> de ${pf.de} unidades em faturamento recebido (${pct(rede.rec.frete > 0 ? u.rec.frete / rede.rec.frete * 100 : null, 1)} da rede).`]);
    if(u.rec.qctrc > 0 && u.exp.qctrc > 0){ const r = u.rec.qctrc / u.exp.qctrc; it.push(["info", r >= 1 ? `Recebe <b>${dec(r, 1)}x</b> mais CT-e do que expede.` : `Expede <b>${dec(1 / r, 1)}x</b> mais CT-e do que recebe.`]); }
    if(u.mais5 > 0) it.push(["ruim", `<b>${int(u.mais5)}</b> pendências 150 com mais de 5 dias de atraso.`]);
    else if(u.n150 + u.n69 === 0 && (u.rec.qctrc || u.exp.qctrc)) it.push(["ok", "Sem pendências 150/69 em aberto."]);
    const dr = u.rec.dias, ks = Object.keys(dr);
    if(ks.length){ const pico = ks.sort((a, b) => dr[b] - dr[a])[0]; it.push(["info", `Pico de recebimento em <b>${brIso(pico)} (${diaSem(pico)})</b> com ${int(dr[pico])} CT-e.`]); }
    return `<ul class="dfb-ins">${it.map(([t, h]) => `<li class="${t}"><i></i><span>${h}</span></li>`).join("") || `<li class="info"><i></i><span>Sem dados suficientes para gerar leitura.</span></li>`}</ul>`;
  }

  function rankingCard(rede, sg){
    const met = metDe(ST.metrica), r = rankear(rede, met);
    let ex = r.slice(0, 10), pos = r.findIndex(x => x.u.sg === sg);
    const itens = ex.map((x, i) => ({sg:x.u.sg, cidade:x.u.cidade, v:x.v, pos:i + 1, destaque:x.u.sg === sg}));
    if(pos >= 10) itens.push({sg, cidade:r[pos].u.cidade, v:r[pos].v, pos:pos + 1, destaque:true});
    const sel = `<select id="dfbMet" aria-label="Indicador do ranking">${selectOpts(METRICAS.map(m => [m.id, m.rot]), ST.metrica)}</select>`;
    return card("Ranking da rede", barrasRank(itens, met.fmt, met.escala), "dfb-span2", sel) ;
  }

  function abaVisao(rede, D){
    const u = D.u, p = u.perf, mov = u.rec.frete + u.exp.frete;
    const gcard = card("Performance (SLA)", `<div class="dfb-gw">${gauge(p && p.entregue > 0 ? p.sla : null, META_SLA)}<ul class="dfb-mini">
      <li><span>Entregues</span><b>${p ? int(p.entregue) : "—"}</b></li><li><span>No prazo</span><b>${p ? int(p.noPrazoEnt) : "—"}</b></li><li><span>Fora do prazo</span><b>${p ? int(p.foraDoPrazo) : "—"}</b></li><li><span>Abertos em atraso</span><b>${p ? int(p.abertoAtrasado) : "—"}</b></li></ul></div>`
      + (p ? "" : `<div class="dfb-vazio">Sem dados de performance desta unidade em <b>${esc(rede.perf.rotulo || (ST.fonte === "teste" ? "Performance Teste" : "Performance Geral"))}</b>. Troque a fonte lá em cima.</div>`), "", `<a class="dfb-link" data-aba="perf">detalhar ›</a>`);
    const dcard = card("Quem fatura: recebido x expedido", donut([
      {t:"Frete recebido", v:u.rec.frete, c:COR.rec, f:moedaK(u.rec.frete)}, {t:"Frete expedido", v:u.exp.frete, c:COR.exp, f:moedaK(u.exp.frete)}], moedaK(mov), "movimento"), "", `<a class="dfb-link" data-aba="fat">detalhar ›</a>`);
    const dias = Object.keys(u.rec.dias).concat(Object.keys(u.exp.dias)).filter((d, i, a) => a.indexOf(d) === i).sort();
    const miniDia = dias.length ? `<div class="dfb-minis"><div><span>CT-e recebidos por dia</span>${spark(u.rec.dias, COR.rec)}</div><div><span>CT-e expedidos por dia</span>${spark(u.exp.dias, COR.exp)}</div></div>` : `<div class="dfb-vazio">Sem emissões por dia neste mês.</div>`;
    return `<div class="dfb-grid">
      ${gcard}${dcard}${card("Leitura rápida", leituraRapida(rede, D))}
      ${rankingCard(rede, u.sg)}
      ${card("Ritmo diário", miniDia, "", `<a class="dfb-link" data-aba="dia">abrir ›</a>`)}
    </div>`;
  }

  function abaFat(rede, D){
    const u = D.u, R = rede, rt = ticket(R.rec.frete, R.rec.qctrc), et = ticket(R.exp.frete, R.exp.qctrc);
    const linha = (rot, a, b, fmt) => `<tr><td>${rot}</td><td class="r">${fmt(a)}</td><td class="r">${fmt(b)}</td></tr>`;
    const tabela = `<table class="dfb-tab"><thead><tr><th>Indicador</th><th class="r"><i class="c" style="background:${COR.exp}"></i>Expedido</th><th class="r"><i class="c" style="background:${COR.rec}"></i>Recebido</th></tr></thead><tbody>
      ${linha("CT-e (CTRCs)", u.exp.qctrc, u.rec.qctrc, int)}
      ${linha("Volumes", u.exp.qtvol, u.rec.qtvol, int)}
      <tr><td>Peso</td><td class="r dim">—</td><td class="r">${kg(u.rec.peso)}</td></tr>
      ${linha("Valor da mercadoria", u.exp.vlrMerc, u.rec.vlrMerc, moeda)}
      <tr class="tot"><td>Faturamento (frete)</td><td class="r">${moeda(u.exp.frete)}</td><td class="r">${moeda(u.rec.frete)}</td></tr>
      ${linha("Ticket médio (frete ÷ CT-e)", ticket(u.exp.frete, u.exp.qctrc), ticket(u.rec.frete, u.rec.qctrc), moedaOuTraco)}
      ${linha("Frete sobre a mercadoria", u.exp.vlrMerc > 0 ? u.exp.frete / u.exp.vlrMerc * 100 : null, u.rec.vlrMerc > 0 ? u.rec.frete / u.rec.vlrMerc * 100 : null, v => v === null ? "—" : pct(v))}
      ${linha("Volumes por CT-e", u.exp.qctrc > 0 ? u.exp.qtvol / u.exp.qctrc : null, u.rec.qctrc > 0 ? u.rec.qtvol / u.rec.qctrc : null, v => v === null ? "—" : dec(v, 1))}
      </tbody></table>`;
    const saldo = u.rec.frete - u.exp.frete;
    const duelos = `${duelo("Ticket médio recebido", ticket(u.rec.frete, u.rec.qctrc), rt, moedaOuTraco, esc(u.sg), "Rede", COR.rec, COR.neutro)}
      ${duelo("Ticket médio expedido", ticket(u.exp.frete, u.exp.qctrc), et, moedaOuTraco, esc(u.sg), "Rede", COR.exp, COR.neutro)}
      ${duelo("Frete recebido x média por unidade", u.rec.frete, R.nFrete ? R.rec.frete / R.nFrete : 0, moedaK, esc(u.sg), "Média", COR.rec, COR.neutro)}
      <div class="dfb-saldo ${saldo >= 0 ? "pos" : "neg"}"><span>Saldo (recebido − expedido)</span><b>${saldo >= 0 ? "+" : "−"} ${moeda(Math.abs(saldo))}</b></div>`;
    const origem = (u.rec.origens.length ? donut(Object.keys(u.rec.por).map((o, i) => ({t:o === "VAL" ? "Do Valle (VAL)" : "Real Vale (RVA)", v:u.rec.por[o].frete, c:o === "VAL" ? COR.ticket : COR.dia, f:moedaK(u.rec.por[o].frete)})), moedaK(u.rec.frete), "recebido") : `<div class="dfb-vazio">Sem dados de recebimento.</div>`);
    return `<div class="dfb-grid">
      ${card("Expedido x Recebido", tabela, "dfb-span2")}
      ${card("Comparativo com a rede", duelos)}
      ${card("Recebido por sistema", origem)}
      ${rankingCard(rede, u.sg)}
    </div>`;
  }

  function abaPerf(rede, D){
    const u = D.u, p = u.perf, rt = rede.perf.tot;
    if(!p || !(p.exped || p.entregue)){
      return `<div class="dfb-grid">${card("Performance", `<div class="dfb-vazio">Esta unidade não tem dados em <b>${esc(rede.perf.rotulo || "esta fonte")}</b>${rede.perf.ok ? "" : " (fonte sem dados)"}. Use o seletor <b>Fonte da performance</b> para trocar entre Performance Teste e Performance Geral.</div>`, "dfb-span3")}${rankingCard(rede, u.sg)}</div>`;
    }
    const tot = p.entregue + p.abertoNoPrazo + p.abertoAtrasado || 1;
    const seg = [["No prazo", p.noPrazoEnt, COR.ok], ["Atraso cliente", p.atrasCli, COR.ticket], ["Atraso transportadora", p.atrasTrans, COR.ruim], ["Atraso (pendência)", p.atrasPend, "#8e3b8e"], ["Aberto no prazo", p.abertoNoPrazo, COR.exp], ["Aberto atrasado", p.abertoAtrasado, "#7a1f16"]].filter(s => s[1] > 0);
    const barra = `<div class="dfb-stack">${seg.map(s => `<i style="width:${s[1] / tot * 100}%;background:${s[2]}" ${tip(s[0] + "\n" + int(s[1]) + " · " + pct(s[1] / tot * 100, 1))}></i>`).join("")}</div>
      <ul class="dfb-leg dfb-leg-h">${seg.map(s => `<li><i style="background:${s[2]}"></i><span>${s[0]}</span><b>${int(s[1])}</b></li>`).join("")}</ul>
      <ul class="dfb-mini dfb-mini-3" style="margin-top:16px"><li><span>% no prazo</span><b>${pct(p.noPrazoEnt / tot * 100, 1)}</b></li><li><span>% fora do prazo (cliente + transp. + pendência)</span><b>${pct(p.foraDoPrazo / tot * 100, 1)}</b></li><li><span>% aberto em atraso</span><b>${pct(p.abertoAtrasado / tot * 100, 1)}</b></li></ul>`;
    const ab = topN(D.abertos, 8).map(([c, n]) => [`Cód. ${c}`, n]);
    const maxA = ab.length ? ab[0][1] : 1;
    const abertos = ST.fonte === "teste" ? (ab.length ? `<ul class="dfb-bars">${ab.map(([k, v]) => `<li><span class="n">${esc(k)}</span><span class="b"><i style="width:${v / maxA * 100}%"></i></span><b>${int(v)}</b></li>`).join("")}</ul>` : `<div class="dfb-vazio">Sem documentos abertos na base.</div>`) : `<div class="dfb-vazio">A última ocorrência dos abertos só existe na fonte <b>Performance Teste</b>.</div>`;
    return `<div class="dfb-grid">
      ${card("Performance da unidade", `<div class="dfb-gw">${gauge(p.sla, META_SLA)}<ul class="dfb-mini"><li><span>Previstas</span><b>${int(p.exped)}</b></li><li><span>Entregues</span><b>${int(p.entregue)}</b></li><li><span>No prazo</span><b>${int(p.noPrazoEnt)}</b></li><li><span>Fora do prazo</span><b>${int(p.foraDoPrazo)}</b></li></ul></div>`)}
      ${card("Composição das entregas", barra, "dfb-span2")}
      ${card("Unidade x rede x meta", duelo("Performance (SLA)", p.sla, rt ? rt.sla : null, v => pct(v), esc(u.sg), "Rede", p.sla >= META_SLA ? COR.ok : COR.ruim, COR.neutro) + duelo("Meta", META_SLA, rt ? rt.sla : null, v => pct(v), "Meta", "Rede", "#141a14", COR.neutro), "")}
      ${card("Última ocorrência dos abertos", abertos)}
      ${rankingCardSLA(rede, u.sg)}
    </div>`;
  }
  function rankingCardSLA(rede, sg){
    const met = metDe("sla");
    const todos = rankear(rede, met);
    const piores = todos.slice(Math.max(8, todos.length - 8)).map(x => ({sg:x.u.sg, cidade:x.u.cidade, v:x.v, pos:todos.indexOf(x) + 1, destaque:x.u.sg === sg}));
    const melhores = todos.slice(0, 8).map((x, i) => ({sg:x.u.sg, cidade:x.u.cidade, v:x.v, pos:i + 1, destaque:x.u.sg === sg}));
    return card("Performance: melhores e piores unidades", `<div class="dfb-2col"><div><h4>Top 8</h4>${barrasRank(melhores, v => pct(v), 100)}</div>${piores.length ? `<div><h4>Últimas ${piores.length}</h4>${barrasRank(piores, v => pct(v), 100)}</div>` : ""}</div>`, "dfb-span3");
  }

  function abaPend(rede, D){
    const u = D.u;
    const focais = Object.entries(D.focal).sort((a, b) => (b[1].n150 + b[1].n69) - (a[1].n150 + a[1].n69));
    const bars = (pares, vazio) => { if(!pares.length) return `<div class="dfb-vazio">${vazio}</div>`; const m = pares[0][1] || 1; return `<ul class="dfb-bars">${pares.map(([k, v]) => `<li><span class="n" title="${esc(k)}">${esc(k)}</span><span class="b"><i style="width:${v / m * 100}%"></i></span><b>${int(v)}</b></li>`).join("")}</ul>`; };
    const tabFocal = focais.length ? `<table class="dfb-tab"><thead><tr><th>Atendente (Focal) dos pendentes</th><th class="r">150</th><th class="r">69</th></tr></thead><tbody>${focais.map(([f, v]) => `<tr><td>${esc(f)}</td><td class="r">${int(v.n150)}</td><td class="r">${int(v.n69)}</td></tr>`).join("")}</tbody></table>` : `<div class="dfb-vazio">Nenhuma pendência 150/69 desta unidade.</div>`;
    return `<div class="dfb-grid">
      ${card("Focal responsável", `<p class="dfb-focal">${D.ats.length ? D.ats.map(a => `<span class="dfb-chip">${esc(a)}</span>`).join("") : "Unidade sem Focal cadastrado."}</p>${tabFocal}`, "dfb-span2")}
      ${card("Resumo", `<ul class="dfb-mini dfb-mini-big"><li><span>Pendências 150</span><b class="${u.n150 ? "ruim" : ""}">${int(u.n150)}</b></li><li><span>Com mais de 5 dias</span><b class="${u.mais5 ? "ruim" : ""}">${int(u.mais5)}</b></li><li><span>Pendências 69</span><b class="${u.n69 ? "ruim" : ""}">${int(u.n69)}</b></li></ul>`)}
      ${card("Pendências 150 (atraso)", bars(topN(D.oc150, 8), "Sem pendências 150."))}
      ${card("Pendências 69", bars(topN(D.oc69, 8), "Sem pendências 69."))}
      ${rankingCard(rede, u.sg)}
    </div>`;
  }

  function abaDia(rede, D){
    const u = D.u;
    const dias = Object.keys(u.rec.dias).concat(Object.keys(u.exp.dias), Object.keys(D.entDia)).filter((d, i, a) => a.indexOf(d) === i).sort();
    if(!dias.length) return `<div class="dfb-grid">${card("Dia a dia", `<div class="dfb-vazio">Sem movimento por dia para esta unidade no período.</div>`, "dfb-span3")}</div>`;
    const ult = dias.slice(-31);
    const series = [{k:"rec", n:"CT-e recebidos (emissão)", c:COR.rec, d:u.rec.dias, area:true}, {k:"exp", n:"CT-e expedidos (emissão)", c:COR.exp, d:u.exp.dias}];
    if(Object.keys(D.entDia).length) series.push({k:"ent", n:"Entregas feitas", c:COR.dia, d:D.entDia});
    // padrão por dia da semana (média de CT-e recebidos)
    const sem = [0, 0, 0, 0, 0, 0, 0], qt = [0, 0, 0, 0, 0, 0, 0];
    Object.keys(u.rec.dias).forEach(d => { const w = new Date(d + "T12:00:00").getDay(); if(!isNaN(w)){ sem[w] += u.rec.dias[d]; qt[w]++; } });
    const med = sem.map((v, i) => qt[i] ? v / qt[i] : 0), mm = Math.max.apply(null, med) || 1;
    const ord = [1, 2, 3, 4, 5, 6, 0];
    const wk = `<div class="dfb-wk">${ord.map(i => `<div ${tip(DIA_SEM[i] + ": média de " + dec(med[i], 1) + " CT-e recebidos/dia")}><i style="height:${med[i] / mm * 100}%"></i><b>${dec(med[i], 0)}</b><span>${DIA_SEM[i]}</span></div>`).join("")}</div>`;
    const soma = m => Object.values(m).reduce((a, b) => a + b, 0);
    const tot = `<ul class="dfb-mini dfb-mini-big"><li><span>CT-e recebidos</span><b>${int(soma(u.rec.dias))}</b></li><li><span>CT-e expedidos</span><b>${int(soma(u.exp.dias))}</b></li><li><span>Entregas feitas</span><b>${Object.keys(D.entDia).length ? int(soma(D.entDia)) : "—"}</b></li><li><span>Dias com movimento</span><b>${dias.length}</b></li></ul>`;
    return `<div class="dfb-grid">
      ${card("Movimento diário (últimos " + ult.length + " dias com movimento)", graficoDias(ult, series), "dfb-span3")}
      ${card("Média por dia da semana", wk, "dfb-span2")}
      ${card("Totais do período", tot)}
    </div>`;
  }

  function abaComp(rede, D){
    const u = D.u;
    // padrão: a unidade escolhida + as duas vizinhas no ranking de faturamento
    if(!ST.comp.length || ST.comp.indexOf(u.sg) === -1){
      const r = rankear(rede, metDe("frecv")), i = Math.max(r.findIndex(x => x.u.sg === u.sg), 0);
      ST.comp = [u.sg].concat(r.slice(Math.max(i - 1, 0), i + 3).map(x => x.u.sg).filter(x => x !== u.sg)).slice(0, 4);
    }
    const sel = ST.comp.map(sg => rede.mapa[sg]).filter(Boolean);
    const linhas = [
      ["Faturamento (frete recebido)", x => x.rec.frete, moedaK, 1], ["Frete expedido", x => x.exp.frete, moedaK, 1],
      ["Ticket médio recebido", x => ticket(x.rec.frete, x.rec.qctrc), moedaOuTraco, 1], ["Ticket médio expedido", x => ticket(x.exp.frete, x.exp.qctrc), moedaOuTraco, 1],
      ["CT-e recebidos", x => x.rec.qctrc, int, 1], ["CT-e expedidos", x => x.exp.qctrc, int, 1],
      ["Volumes recebidos", x => x.rec.qtvol, int, 1], ["Volumes expedidos", x => x.exp.qtvol, int, 1],
      ["Performance (SLA)", x => x.perf && x.perf.entregue > 0 ? x.perf.sla : null, v => pct(v), 1],
      ["Abertos em atraso", x => x.perf ? x.perf.abertoAtrasado : null, v => v === null ? "—" : int(v), -1],
      ["Pendências 150", x => x.n150, int, -1], ["Pendências 69", x => x.n69, int, -1]
    ];
    const corpo = linhas.map(([rot, get, fmt, sentido]) => {
      const vs = sel.map(get), vv = vs.filter(v => v !== null && v !== undefined);
      const mx = Math.max.apply(null, [0].concat(vv)) || 1;
      const melhor = vv.length > 1 ? (sentido > 0 ? Math.max.apply(null, vv) : Math.min.apply(null, vv)) : null;
      return `<tr><th>${rot}</th>${vs.map((v, i) => `<td class="${melhor !== null && v === melhor ? "best" : ""} ${sel[i].sg === u.sg ? "me" : ""}"><span class="b"><i style="width:${v ? v / mx * 100 : 0}%"></i></span><b>${fmt(v)}</b></td>`).join("")}</tr>`;
    }).join("");
    const todas = rede.lista.map(x => x.sg).sort();
    const chips = ST.comp.map(sg => `<span class="dfb-chip ${sg === u.sg ? "me" : ""}">${esc(sg)}${sg === u.sg ? "" : `<button type="button" data-comp-rem="${esc(sg)}" aria-label="Remover ${esc(sg)}">×</button>`}</span>`).join("");
    const add = ST.comp.length < 5 ? `<select id="dfbCompAdd"><option value="">+ adicionar unidade</option>${todas.filter(x => ST.comp.indexOf(x) === -1).map(x => `<option>${esc(x)}</option>`).join("")}</select>` : "";
    return `<div class="dfb-grid">${card("Comparar unidades (até 5)", `<div class="dfb-chips">${chips}${add}</div>
      <div class="dfb-scroll"><table class="dfb-cmp"><thead><tr><th>Indicador</th>${sel.map(x => `<th class="${x.sg === u.sg ? "me" : ""}">${esc(x.sg)}<small>${esc(x.cidade || "")}</small></th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table></div>
      <p class="dfb-nota">Destaque verde = melhor valor entre as unidades escolhidas (para pendências e abertos atrasados, o menor).</p>`, "dfb-span3")}</div>`;
  }

  /* ---------- página ---------- */
  function html(){
    const rede = montarRede();
    const lista = rede.lista.slice().sort((a, b) => a.sg.localeCompare(b.sg));
    if(!lista.length){
      return `<div class="dfb"><h2 class="section-title">Visão operacional por unidade</h2><div class="panel"><div class="empty">Ainda não há dados. Importe o Faturamento Geral (Fechamento-RECEITA) e/ou a base da Performance.</div></div></div>`;
    }
    const pedida = s3(window.DF_SIGLA || "");
    if(pedida && rede.mapa[pedida]) sigla = pedida;
    else if(!sigla || !rede.mapa[sigla]){ const r = rankear(rede, metDe("frecv")); sigla = (r[0] && r[0].u.sg) || lista[0].sg; }
    window.DF_SIGLA = sigla;

    const D = dadosUnidade(rede, sigla), u = D.u, p = u.perf;
    const meses = (typeof frMesesDisponiveis === "function") ? frMesesDisponiveis() : [];
    const movCte = u.rec.qctrc + u.exp.qctrc, movVol = u.rec.qtvol + u.exp.qtvol, movFrete = u.rec.frete + u.exp.frete;
    const tickU = ticket(movFrete, movCte), tickR = ticket(rede.rec.frete + rede.exp.frete, rede.rec.qctrc + rede.exp.qctrc);
    const sla = p && p.entregue > 0 ? p.sla : null;
    const pF = posicao(rede, metDe("frecv"), sigla), pT = posicao(rede, metDe("tick"), sigla), pS = posicao(rede, metDe("sla"), sigla);
    const status = sla === null ? ["sem", "Sem performance"] : (sla >= META_SLA ? ["ok", "Dentro da meta"] : ["ruim", "Abaixo da meta"]);
    const idx = lista.findIndex(x => x.sg === sigla);
    const fonteBtn = (v, t, tem) => `<button type="button" class="${ST.fonte === v ? "on" : ""}" data-fonte="${v}" ${tem ? "" : 'disabled title="Sem dados nesta fonte"'}>${t}</button>`;
    const sisBtn = (v, t) => `<button type="button" class="${ST.sistema === v ? "on" : ""}" data-sis="${v}">${t}</button>`;

    const kpis = `<div class="dfb-kpis">
      ${kpi("Faturamento do mês", moeda(u.rec.frete), pF.pos ? `${pF.pos}º de ${pF.de} · ${pct(rede.rec.frete > 0 ? u.rec.frete / rede.rec.frete * 100 : null, 1)} da rede` : "frete recebido na unidade", "", {cls:"k-rec", aba:"fat", tip:"Frete recebido na unidade de entrega (mesma regra da aba Por Unidade)"})}
      ${kpi("Expedido faturando", moeda(u.exp.frete), `${int(u.exp.qctrc)} CT-e despachados`, "", {cls:"k-exp", aba:"fat"})}
      ${kpi("Ticket médio da operação", moedaOuTraco(tickU), `recebido ${moedaOuTraco(ticket(u.rec.frete, u.rec.qctrc))} · expedido ${moedaOuTraco(ticket(u.exp.frete, u.exp.qctrc))}`, delta(tickU, tickR), {cls:"k-tk", aba:"fat", tip:"Frete (recebido + expedido) ÷ CT-e (recebidos + expedidos)"})}
      ${kpi("CT-e", int(movCte), `${int(u.rec.qctrc)} recebidos · ${int(u.exp.qctrc)} expedidos`, spark(u.rec.dias, COR.rec), {aba:"dia"})}
      ${kpi("Volumes", int(movVol), `${int(u.rec.qtvol)} recebidos · ${int(u.exp.qtvol)} expedidos`, "", {aba:"fat"})}
      ${kpi("Performance (SLA)", sla === null ? "—" : pct(sla), sla === null ? "sem dados na fonte escolhida" : `meta ${META_SLA}% · ${sla >= META_SLA ? "+" : "−"}${dec(Math.abs(sla - META_SLA), 2)} p.p.${pS.pos ? " · " + pS.pos + "º de " + pS.de : ""}`, "", {cls:sla === null ? "" : (sla >= META_SLA ? "k-ok" : "k-ruim"), aba:"perf"})}
      ${kpi("Pendências 150 + 69", int(u.n150 + u.n69), `${int(u.n150)} em 150 (${int(u.mais5)} com +5 dias) · ${int(u.n69)} em 69`, "", {cls:u.n150 + u.n69 ? "k-ruim" : "k-ok", aba:"pend"})}
      ${kpi("Abertos em atraso", p ? int(p.abertoAtrasado) : "—", p ? `${int(p.abertoNoPrazo)} abertos no prazo` : "sem dados na fonte escolhida", "", {cls:p && p.abertoAtrasado ? "k-ruim" : "", aba:"perf"})}
    </div>`;

    const corpoAba = {visao:abaVisao, fat:abaFat, perf:abaPerf, pend:abaPend, dia:abaDia, comp:abaComp}[ST.aba] || abaVisao;

    return `<div class="dfb">
      <div class="dfb-hero">
        <div class="dfb-nav"><button type="button" data-nav="-1" aria-label="Unidade anterior" ${idx <= 0 ? "disabled" : ""}>‹</button><button type="button" data-nav="1" aria-label="Próxima unidade" ${idx >= lista.length - 1 ? "disabled" : ""}>›</button></div>
        <div class="dfb-id"><div class="dfb-sg">${esc(sigla)}</div><div><div class="dfb-city">${esc(u.cidade || "Unidade")}</div>
          <div class="dfb-sub">Focal: <b>${D.ats.length ? D.ats.map(esc).join(" · ") : "não cadastrado"}</b></div></div></div>
        <div class="dfb-badges"><span class="dfb-st ${status[0]}">${status[1]}</span>
          ${pF.pos ? `<span class="dfb-rk" ${tip("Posição entre as unidades")}>Faturamento <b>${pF.pos}º</b></span>` : ""}${pT.pos ? `<span class="dfb-rk">Ticket <b>${pT.pos}º</b></span>` : ""}${pS.pos ? `<span class="dfb-rk">SLA <b>${pS.pos}º</b></span>` : ""}</div>
      </div>
      <div class="dfb-bar">
        <div class="dfb-f"><label for="dfSel">Filial</label><select id="dfSel">${lista.map(x => `<option value="${esc(x.sg)}" ${x.sg === sigla ? "selected" : ""}>${esc(x.sg)}${x.cidade ? " — " + esc(x.cidade) : ""}</option>`).join("")}</select></div>
        ${meses.length ? `<div class="dfb-f"><label for="dfMes">Mês (faturamento)</label><select id="dfMes">${meses.map(m => `<option value="${m}" ${m === rede.mesRec ? "selected" : ""}>${esc(mesRot(m))}</option>`).join("")}</select></div>` : ""}
        <div class="dfb-f"><label>Fonte da performance</label><div class="dfb-seg2">${fonteBtn("teste", "Performance Teste", temTeste())}${fonteBtn("geral", "Performance Geral", temGeral())}</div></div>
        <div class="dfb-f"><label>Sistema</label><div class="dfb-seg2">${sisBtn("", "Geral")}${sisBtn("VAL", "Do Valle")}${sisBtn("RVA", "Real Vale")}</div></div>
        <div class="dfb-f dfb-fonte"><span>${esc(rede.perf.rotulo || "Performance: sem dados na fonte escolhida")}</span></div>
      </div>
      ${kpis}
      <nav class="dfb-tabs" role="tablist">${ABAS.map(([id, t]) => `<button type="button" role="tab" class="${ST.aba === id ? "on" : ""}" data-aba="${id}">${t}</button>`).join("")}</nav>
      <div class="dfb-body">${corpoAba(rede, D)}</div>
      <div class="dfb-tipbox" id="dfbTip" hidden></div>
    </div>`;
  }

  /* ---------- eventos ---------- */
  function escolherFonteInicial(){
    const t = temTeste(), g = temGeral();
    if(ST.fonte === "teste" && !t && g) ST.fonte = "geral";
    else if(ST.fonte === "geral" && !g && t) ST.fonte = "teste";
    else if(ST.fonte !== "teste" && ST.fonte !== "geral") ST.fonte = t ? "teste" : (g ? "geral" : "teste");
    if(["", "VAL", "RVA"].indexOf(ST.sistema) === -1) ST.sistema = "";
  }

  function ligar(){
    const w = document.getElementById("sec-detalhe-filial"); if(!w) return;
    const on = (sel, ev, fn) => w.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
    on("#dfSel", "change", e => { window.DF_SIGLA = e.target.value; desenhar(); });
    on("#dfMes", "change", e => { try{ frDefinirMes(e.target.value); }catch(x){} cache = null; desenhar(); });
    on("[data-fonte]", "click", e => { ST.fonte = e.currentTarget.dataset.fonte; salvarST(); cache = null; desenhar(); });
    on("[data-sis]", "click", e => { ST.sistema = e.currentTarget.dataset.sis; salvarST(); cache = null; desenhar(); });
    on("[data-aba]", "click", e => { ST.aba = e.currentTarget.dataset.aba; salvarST(); desenhar(); const t = w.querySelector(".dfb-tabs"); if(t && t.getBoundingClientRect().top < 0) t.scrollIntoView({block:"start"}); });
    on("[data-nav]", "click", e => {
      const l = montarRede().lista.slice().sort((a, b) => a.sg.localeCompare(b.sg)), i = l.findIndex(x => x.sg === sigla) + Number(e.currentTarget.dataset.nav);
      if(l[i]){ window.DF_SIGLA = l[i].sg; desenhar(); }
    });
    on("#dfbMet", "change", e => { ST.metrica = e.target.value; salvarST(); desenhar(); });
    on(".dfb-rank button[data-sg]", "click", e => { window.DF_SIGLA = e.currentTarget.dataset.sg; desenhar(); });
    on("[data-serie]", "click", e => { const k = e.currentTarget.dataset.serie, i = ST.ocultas.indexOf(k); if(i > -1) ST.ocultas.splice(i, 1); else ST.ocultas.push(k); desenhar(); });
    on("[data-comp-rem]", "click", e => { ST.comp = ST.comp.filter(x => x !== e.currentTarget.dataset.compRem); desenhar(); });
    on("#dfbCompAdd", "change", e => { if(e.target.value && ST.comp.indexOf(e.target.value) === -1) ST.comp.push(e.target.value); desenhar(); });

    // tooltip único (texto puro; não interpreta HTML)
    const box = document.getElementById("dfbTip"); if(!box) return;
    const raiz = w.querySelector(".dfb");
    raiz.addEventListener("mousemove", e => {
      const el = e.target.closest && e.target.closest("[data-dtip]");
      if(!el){ box.hidden = true; return; }
      box.textContent = el.getAttribute("data-dtip"); box.hidden = false;
      const r = raiz.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 16;
      if(x + box.offsetWidth > r.width - 6) x = e.clientX - r.left - box.offsetWidth - 12;
      box.style.left = Math.max(x, 4) + "px"; box.style.top = y + "px";
    });
    raiz.addEventListener("mouseleave", () => { box.hidden = true; });
  }
  function desenhar(){
    const w = document.getElementById("sec-detalhe-filial"); if(!w) return;
    const y = window.scrollY;
    escolherFonteInicial();
    w.innerHTML = html();
    ligar();
    window.scrollTo(0, y);
  }

  window.detalheFilialHTML = () => "";
  window.detalheFilialRefresh = function(){ cache = null; desenhar(); };   // a cada abertura: lê tudo de novo
})();
