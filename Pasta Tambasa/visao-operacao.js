/* =====================================================================
   VISÃO DA OPERAÇÃO — tela cheia, estilo "programa".
   Tudo por FOCAL: faturamento, expedição, ocorrência 69, documentos em
   atraso (150), pendências, trocas e SLA.
   Só LÊ os dados que o painel já guarda (nada é gravado aqui) e usa as
   mesmas funções das outras abas, então os números batem com elas.
   ===================================================================== */
(function(){
  "use strict";

  const VERSAO = "2.1";
  const SEM_FOCAL = "Sem focal definido";
  const META_SLA = 98;

  const I = {
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>',
    money:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v10"/><path d="M14.6 9.6c0-1.1-1.2-1.8-2.6-1.8s-2.6.7-2.6 1.8c0 2.4 5.2 1.2 5.2 3.7 0 1-1.200 1.800-2.600 1.800s-2.600-.8-2.600-1.800"/></svg>',
    truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7.5" width="11" height="9" rx="1"/><path d="M13.5 10.5h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
    alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21 19H3z"/><path d="M12 9.5v4"/><circle cx="12" cy="16" r=".7" fill="currentColor" stroke="none"/></svg>',
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5 12 3l8.5 4.5L12 12z"/><path d="M3.5 7.5V16L12 21l8.5-5V7.5"/><path d="M12 12v9"/></svg>',
    target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/></svg>',
    swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>',
    card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="1.6"/><path d="M3.5 10h17"/><path d="M7 14.5h4"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19V9"/><path d="M5 9l4 4M5 9 1.500 12.500"/><path d="M5 5h14v10"/><path d="M19 15l-3-3"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.6"/><path d="M20 4v7h-7"/></svg>',
    moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
    pulse:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.500-6 4 12 2.500-6H21"/></svg>',
    ops:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/></svg>'
  };

  const SECOES = [
    {id:"geral", label:"Visão geral", icon:I.grid, titulo:"Visão geral da operação", sub:"todos os números, por focal"},
    {id:"faturamento", label:"Faturamento", icon:I.money, titulo:"Faturamento e receita", sub:"frete faturado por focal e por unidade"},
    {id:"expedicao", label:"Expedição", icon:I.out, titulo:"Expedição por unidade", sub:"o que cada unidade expediu x recebeu"},
    {id:"ocorrencias", label:"Ocorrências", icon:I.alert, titulo:"Ocorrências e documentos em atraso", sub:"ocorrência 69 e atrasos (150) por focal"},
    {id:"pendencias", label:"Pendências", icon:I.clock, titulo:"Pendências, trocas e prazos", sub:"o que ainda está aberto, por focal"}
  ];

  let aberta = false, secao = "geral", focal = "todos", sortCol = "fat", sortDir = -1, root = null, timer = null, D = null, atualizadoEm = new Date(), claro = false, detalhe = null, tipEl = null;
  const GOMAP = {"Faturamento (frete)":"faturamento", "Ocorrência 69":"ocorrencias", "Docs em atraso (150)":"ocorrencias", "Pendências abertas":"pendencias", "Trocas em aberto":"pendencias"};

  /* ---------------- helpers ---------------- */
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s));
  const num = v => (typeof numeroOcorrenciaBR === "function" ? numeroOcorrenciaBR(v) : (Number(v) || 0));
  const int = v => Math.round(v || 0).toLocaleString("pt-BR");
  const pct = v => (v === null || v === undefined || isNaN(v)) ? "—" : v.toFixed(1).replace(".", ",") + "%";
  const brl = v => "R$ " + money(v);
  const brlC = v => {
    const a = Math.abs(v || 0);
    if(a >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2}) + " Mi";
    if(a >= 1e4) return "R$ " + (v / 1e3).toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1}) + " mil";
    return "R$ " + money(v);
  };
  const FMT = {int, brl:brlC, pct, dec: v => (v || 0).toFixed(1).replace(".", ",")};
  const tone = sla => sla === null || sla === undefined ? "warn" : (sla >= META_SLA ? "ok" : (sla >= 95 ? "warn" : "bad"));

  function focalDaSigla(sigla){
    const s = String(sigla || "").trim().toUpperCase();
    if(!s) return SEM_FOCAL;
    if(FOCAIS_ESPECIAIS_POR_UNIDADE[s]) return FOCAIS_ESPECIAIS_POR_UNIDADE[s];
    const f = focalPorSigla(s);
    return f ? f.titulo : SEM_FOCAL;
  }

  /* ---------------- coleta de dados ---------------- */
  function coletar(){
    const hoje = todayISO(), M = new Map();
    const novo = (key, curto, nome) => ({key, curto, nome, fatUn:0, fatPag:0, qctrc:0, merc:0, perf:null, oc69:0, frete69:0, atr:0, atr5:0, freteAtr:0, diasSoma:0, pend:0, trocas:0, trocasAt:0});
    const get = key => {
      key = key || SEM_FOCAL;
      if(!M.has(key)){
        if(key === SEM_FOCAL) M.set(key, novo(key, "Sem focal", "a definir"));
        else { const p = key.split("—"); M.set(key, novo(key, p[0].trim(), (p[1] || "focal especial").trim())); }
      }
      return M.get(key);
    };
    FOCAIS.forEach(f => get(f.titulo));
    const classif = todasSiglasFocais();

    /* faturamento — mesma regra da aba Fechamento-RECEITA */
    const rec = loadReceitaData().unidades || {}, pag = loadReceitaPagadoraData().unidades || {};
    FOCAIS.forEach(f => {
      const m = get(f.titulo);
      const a = totaisReceitaDoGrupo({unidades: f.unidades.map(u => u.sigla)}, rec);
      const b = totaisReceitaPagadoraDoGrupo(f.id, pag);
      m.fatUn += a.frete; m.fatPag += b.frete; m.qctrc += a.qctrc + b.qctrc; m.merc += a.vlrMerc + b.vlrMerc;
    });
    Object.keys(rec).filter(s => !classif.has(s)).forEach(s => {
      const c = combinaUnidadeReceita(rec[s]), m = get(focalDaSigla(s));
      m.fatUn += c.frete; m.qctrc += c.qctrc; m.merc += c.vlrMerc;
    });

    /* performance / SLA */
    const val = load(KEYS.performanceGeralVal), rva = load(KEYS.performanceGeralRva);
    const temVal = !!(val && Array.isArray(val.unidades) && val.unidades.length), temRva = !!(rva && Array.isArray(rva.unidades) && rva.unidades.length);
    let perfData = null, perfGeral = null;
    if(temVal || temRva){
      perfData = mesclarPerformanceGeral(temVal ? val : null, temRva ? rva : null);
      const mapa = {}; perfData.unidades.forEach(u => { mapa[u.sigla] = u; });
      FOCAIS.forEach(f => { const g = geralDoFocal(f, mapa); if(g.temDados) get(f.titulo).perf = g.totais; });
      const resto = {};
      perfData.unidades.filter(u => !classif.has(u.sigla)).forEach(u => { (resto[focalDaSigla(u.sigla)] = resto[focalDaSigla(u.sigla)] || []).push(u); });
      Object.keys(resto).forEach(k => { get(k).perf = computeTotais(resto[k]); });
      perfGeral = computeTotais(perfData.unidades);
    }

    /* ocorrência 69 e documentos em atraso (150) */
    const ocs = load(KEYS.ocorrencias), atrs = load(KEYS.atrasos);
    ocs.forEach(o => { const m = get(o.focal); m.oc69++; m.frete69 += num(o.valFrete); });
    atrs.forEach(a => { const m = get(a.focal), d = num(a.diasAtraso); m.atr++; m.freteAtr += num(a.frete); m.diasSoma += d; if(d > 5) m.atr5++; });

    /* pendências e trocas (a filial vira focal pela sigla) */
    const pends = load(KEYS.pendencias).filter(p => p.resolvido !== "sim");
    pends.forEach(p => { get(focalDaSigla(p.filial)).pend++; });
    const trocas = load(KEYS.trocas).filter(t => t.devolvido !== "sim");
    trocas.forEach(t => { const m = get(focalDaSigla(t.filial)); m.trocas++; if(daysDiff(hoje, t.dataLimite) < 0) m.trocasAt++; });
    const boletos = load(KEYS.boletos);
    const bAt = boletos.filter(b => b.prevencao !== "sim" && daysDiff(hoje, b.dataLimiteProcesso) < 0);

    /* só mostra focal "extra" se tiver algum dado; os do cadastro sempre aparecem */
    const cad = new Set(FOCAIS.map(f => f.titulo));
    const tem = m => m.fatUn || m.fatPag || m.perf || m.oc69 || m.atr || m.pend || m.trocas;
    const lista = [...M.values()].filter(m => cad.has(m.key) ? (FOCAIS.find(f => f.titulo === m.key).unidades.length || tem(m)) : tem(m));

    return {hoje, lista, M, rec, pag, perfData, perfGeral, ocs, atrs, pends, trocas, boletos, bAt,
      deb: boletos.reduce((s, b) => s + (Number(b.valor) || 0), 0), prioridades: (typeof dpData === "function" ? dpData().itens : [])};
  }

  const selecionado = key => focal === "todos" || key === focal;
  const metricas = () => D.lista.filter(m => selecionado(m.key));

  function totais(){
    const L = metricas(), t = {fat:0, fatUn:0, fatPag:0, qctrc:0, merc:0, oc69:0, frete69:0, atr:0, atr5:0, freteAtr:0, diasSoma:0, pend:0, trocas:0, trocasAt:0};
    L.forEach(m => { t.fatUn += m.fatUn; t.fatPag += m.fatPag; t.qctrc += m.qctrc; t.merc += m.merc; t.oc69 += m.oc69; t.frete69 += m.frete69;
      t.atr += m.atr; t.atr5 += m.atr5; t.freteAtr += m.freteAtr; t.diasSoma += m.diasSoma; t.pend += m.pend; t.trocas += m.trocas; t.trocasAt += m.trocasAt; });
    t.fat = t.fatUn + t.fatPag;
    const perfs = L.map(m => m.perf).filter(Boolean);
    t.perf = focal === "todos" ? D.perfGeral : (perfs.length ? perfs[0] : null);
    return t;
  }

  /* ---------------- componentes ---------------- */
  function kpi(icone, rotulo, valor, sub, estado, fmt){
    const raw = typeof valor === "number" && fmt, go = secao === "geral" ? GOMAP[rotulo] : null;
    const tag = go ? "button" : "div";
    return `<${tag} class="vo-kpi ${estado || ""} ${go ? "click" : ""}" ${go ? `data-vo-go="${go}" title="Abrir ${esc(SECOES.find(s => s.id === go).label)}"` : ""}><span class="top"><em>${rotulo}</em><span class="ic">${icone}</span></span><b ${raw ? `data-vo-count="${valor}" data-vo-fmt="${fmt}"` : ""}>${raw ? FMT[fmt](valor) : valor}</b><small>${sub || "&nbsp;"}</small>${go ? `<span class="go">Ver detalhes ›</span>` : ""}</${tag}>`;
  }

  const sistemaTag = o => o ? `<span class="vo-tag ${String(o).toUpperCase() === "RVA" ? "x" : ""}" title="${String(o).toUpperCase() === "RVA" ? "Real Vale" : "Rede Do Valle"}">${esc(String(o).toUpperCase())}</span>` : `<span class="dim">–</span>`;

  function nomeFocal(m){ return `<span class="vo-bl"><b>${esc(m.curto)}</b><small>${esc(m.nome)}</small></span>`; }

  /* barras simples ou duplas. itens: {m, v, v2} */
  function barras(itens, o){
    o = o || {};
    if(!itens.length) return `<div class="vo-empty">${o.vazio || "Sem dados para mostrar."}</div>`;
    const max = Math.max(...itens.map(i => Math.max(i.v || 0, i.v2 || 0)), 1), fmt = o.fmt || int;
    const soma = itens.reduce((s, i) => s + (i.v || 0), 0) || 1;
    return `<ul class="vo-bars ${o.sm ? "sm" : ""}">${itens.map(i => {
      const w = v => Math.max(v > 0 ? 2 : 0, (v || 0) / max * 100);
      const bar = `<u><i class="${o.cor || ""}" style="width:${w(i.v)}%"></i></u>` + (i.v2 !== undefined ? `<u><i class="${o.cor2 || "r"}" style="width:${w(i.v2)}%"></i></u>` : "");
      const val = i.v2 !== undefined ? `<span class="vo-bv stack"><span>${fmt(i.v)}</span><span>${(o.fmt2 || fmt)(i.v2)}</span></span>` : `<span class="vo-bv">${fmt(i.v)}</span>`;
      const nome = i.m ? i.m.key : i.label;
      const tip = [nome, (o.l1 ? o.l1 + ": " : "") + fmt(i.v) + (i.v2 === undefined ? " · " + (i.v / soma * 100).toFixed(1).replace(".", ",") + "% do total" : ""), i.v2 !== undefined ? (o.l2 ? o.l2 + ": " : "") + (o.fmt2 || fmt)(i.v2) : "", i.m && !o.sm ? "Clique para ver a ficha" : ""].filter(Boolean).join("|");
      return `<li data-vo-tip="${esc(tip)}" ${i.m && !o.sm ? `data-vo-det="${esc(i.m.key)}"` : ""} class="${i.m && i.m.key === focal ? "sel" : ""}">${i.m ? nomeFocal(i.m) : `<span class="vo-bl"><b>${esc(i.label)}</b><small>${esc(i.sub || "")}</small></span>`}<span class="vo-bt">${bar}</span>${val}</li>`;
    }).join("")}</ul>`;
  }

  function barrasSla(L){
    const itens = L.filter(m => m.perf);
    if(!itens.length) return `<div class="vo-empty">Importe a Performance Geral (VAL/RVA) para ver o SLA por focal.</div>`;
    const x = v => Math.max(0, Math.min(100, ((v || 0) - 90) / 10 * 100));
    return `<ul class="vo-bars">${itens.map(m => { const s = m.perf.sla, t = tone(s), c = t === "ok" ? "" : (t === "warn" ? "a" : "r");
      return `<li data-vo-tip="${esc(m.key + "|SLA: " + pct(s) + "|Meta: " + META_SLA + "%|" + int(m.perf.entregue) + " entregues|Clique para ver a ficha")}" data-vo-det="${esc(m.key)}" class="${m.key === focal ? "sel" : ""}">${nomeFocal(m)}<span class="vo-bt"><u><i class="${c}" style="width:${x(s)}%"></i></u><span class="meta" style="left:${x(META_SLA)}%"></span></span><span class="vo-bv vo-sla ${t}">${pct(s)}</span></li>`; }).join("")}</ul>
      <div class="vo-note">Escala de 90% a 100% · linha branca = meta de ${META_SLA}%</div>`;
  }

  function donut(dados, vazio, rotuloTotal, fmt){
    const tot = dados.reduce((s, x) => s + x.v, 0); fmt = fmt || int;
    if(!tot) return `<div class="vo-empty">${vazio}</div>`;
    const r = 52, C = 2 * Math.PI * r; let off = 0;
    const segs = dados.map(x => { const len = x.v / tot * C; const s = `<circle class="seg" cx="70" cy="70" r="${r}" stroke="${x.cor}" stroke-dasharray="${Math.max(len - 2, .5)} ${C}" stroke-dashoffset="${-off}" data-vo-tip="${esc(x.nome + "|" + fmt(x.v) + " · " + (x.v / tot * 100).toFixed(1).replace(".", ",") + "%")}"></circle>`; off += len; return s; }).join("");
    return `<div class="vo-donut"><div class="ring"><svg viewBox="0 0 140 140"><g transform="rotate(-90 70 70)">${segs}</g></svg><div class="c"><b>${fmt(tot)}</b><small>${rotuloTotal || "total"}</small></div></div>
      <ul class="vo-leg">${dados.map(x => `<li><i style="background:${x.cor}"></i><span>${esc(x.nome)}</span><b>${fmt(x.v)}</b></li>`).join("")}</ul></div>`;
  }
  const PAL = ["#5cb531", "#35c9a0", "#f4b740", "#ff5d55", "#8be04e", "#7f9a77"];

  function ring(p, cor, valor, rotulo){
    const v = Math.max(0, Math.min(100, p || 0)), C = 2 * Math.PI * 38;
    return `<div class="vo-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" class="bg"/><circle cx="50" cy="50" r="38" class="fg" stroke="${cor}" stroke-dasharray="${(v / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
      <div><small style="color:var(--mut);display:block;font-size:11px">${rotulo}</small><b style="font-size:24px">${valor}</b></div></div>`;
  }

  const COR = {ok:"#8be04e", warn:"#f4b740", bad:"#ff5d55"};

  /* ---------------- SEÇÕES ---------------- */
  function secGeral(){
    const L = metricas(), t = totais(), todos = D.lista;
    const sla = t.perf ? t.perf.sla : null;
    const kpis = `<div class="vo-kpis">
      ${kpi(I.money, "Faturamento (frete)", t.fat, t.qctrc ? int(t.qctrc) + " CTRCs" : "importe a Receita", "", "brl")}
      ${kpi(I.target, "SLA geral", sla === null ? "—" : pct(sla), t.perf ? `${int(t.perf.entregue)} entregues · meta ${META_SLA}%` : "importe a Performance", sla === null ? "warn" : (tone(sla) === "ok" ? "" : tone(sla)))}
      ${kpi(I.alert, "Ocorrência 69", t.oc69, t.oc69 ? brlC(t.frete69) + " em frete" : "nenhuma importada", t.oc69 ? "warn" : "", "int")}
      ${kpi(I.box, "Docs em atraso (150)", t.atr, t.atr ? t.atr5 + " com +5 dias" : "nenhum importado", t.atr5 ? "bad" : (t.atr ? "warn" : ""), "int")}
      ${kpi(I.clock, "Pendências abertas", t.pend, "ainda não resolvidas", t.pend ? "warn" : "", "int")}
      ${kpi(I.swap, "Trocas em aberto", t.trocas, t.trocasAt + " atrasada(s)", t.trocasAt ? "bad" : "", "int")}
    </div>`;

    const fat = [...todos].filter(m => m.fatUn + m.fatPag > 0).sort((a, b) => (b.fatUn + b.fatPag) - (a.fatUn + a.fatPag)).map(m => ({m, v:m.fatUn + m.fatPag}));
    const oc = [...todos].filter(m => m.oc69 || m.atr).sort((a, b) => (b.atr + b.oc69) - (a.atr + a.oc69)).map(m => ({m, v:m.oc69, v2:m.atr}));

    const linhas = [...todos].sort((a, b) => {
      const g = m => ({fat:m.fatUn + m.fatPag, qctrc:m.qctrc, sla:m.perf ? m.perf.sla : -1, aberto:m.perf ? m.perf.abertoNoPrazo + m.perf.abertoAtrasado : -1, oc69:m.oc69, atr:m.atr, atr5:m.atr5, pend:m.pend, trocasAt:m.trocasAt, nome:0}[sortCol]);
      return sortCol === "nome" ? sortDir * a.curto.localeCompare(b.curto, "pt-BR", {numeric:true}) : sortDir * ((g(a) || 0) - (g(b) || 0));
    });
    const mx = f => Math.max(...todos.map(f), 1);
    const mFat = mx(m => m.fatUn + m.fatPag), mOc = mx(m => m.oc69), mAt = mx(m => m.atr), mA5 = mx(m => m.atr5), mPe = mx(m => m.pend), mTr = mx(m => m.trocasAt);
    const cel = (v, max, cls, f) => v ? `<td class="heat ${cls}" style="--h:${(v / max).toFixed(2)}">${(f || int)(v)}</td>` : `<td class="dim">–</td>`;
    const th = (col, txt) => `<th data-vo-sort="${col}" class="${sortCol === col ? "sorted" : ""}">${txt}${sortCol === col ? (sortDir < 0 ? " ▾" : " ▴") : ""}</th>`;
    const matriz = `<div class="vo-card"><h3>Matriz por focal <span>clique no cabeçalho para ordenar · clique na linha para abrir a ficha do focal</span></h3>
      <div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_matriz" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_matriz">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_matriz" class="vo-table"><thead><tr>${th("nome", "Focal")}${th("fat", "Faturamento")}${th("qctrc", "CTRCs")}${th("sla", "SLA")}${th("aberto", "Entregas abertas")}${th("oc69", "Ocor. 69")}${th("atr", "Docs atraso")}${th("atr5", "+5 dias")}${th("pend", "Pendências")}${th("trocasAt", "Trocas atras.")}</tr></thead><tbody>
      ${linhas.map(m => { const s = m.perf ? m.perf.sla : null, ab = m.perf ? m.perf.abertoNoPrazo + m.perf.abertoAtrasado : null;
        return `<tr data-vo-det="${esc(m.key)}" data-vo-tip="${esc(m.key + "|Clique para ver a ficha")}" class="${m.key === focal ? "sel" : ""}"><td><span class="nm"><b>${esc(m.curto)}</b><small>${esc(m.nome)}</small></span></td>
          ${cel(m.fatUn + m.fatPag, mFat, "h-g", brlC)}${m.qctrc ? `<td>${int(m.qctrc)}</td>` : `<td class="dim">–</td>`}
          <td>${s === null ? `<span class="dim">–</span>` : `<span class="vo-sla ${tone(s)}">${pct(s)}</span>`}</td>${ab === null ? `<td class="dim">–</td>` : `<td>${int(ab)}</td>`}
          ${cel(m.oc69, mOc, "h-r")}${cel(m.atr, mAt, "h-r")}${cel(m.atr5, mA5, "h-r")}${cel(m.pend, mPe, "h-r")}${cel(m.trocasAt, mTr, "h-r")}</tr>`; }).join("")}
      </tbody><tfoot><tr><td>Total da operação</td><td>${brlC(todos.reduce((s, m) => s + m.fatUn + m.fatPag, 0))}</td><td>${int(todos.reduce((s, m) => s + m.qctrc, 0))}</td><td>${D.perfGeral ? `<span class="vo-sla ${tone(D.perfGeral.sla)}">${pct(D.perfGeral.sla)}</span>` : "–"}</td>
        <td>${D.perfGeral ? int(D.perfGeral.abertoNoPrazo + D.perfGeral.abertoAtrasado) : "–"}</td><td>${int(todos.reduce((s, m) => s + m.oc69, 0))}</td><td>${int(todos.reduce((s, m) => s + m.atr, 0))}</td><td>${int(todos.reduce((s, m) => s + m.atr5, 0))}</td><td>${int(todos.reduce((s, m) => s + m.pend, 0))}</td><td>${int(todos.reduce((s, m) => s + m.trocasAt, 0))}</td></tr></tfoot></table></div></div>`;

    return kpis + `<div class="vo-grid vo-g3">
      <div class="vo-card"><h3>Faturamento por focal <span>frete</span></h3>${barras(fat, {fmt:brlC, vazio:"Importe o Faturamento Geral na aba Fechamento-RECEITA."})}</div>
      <div class="vo-card"><h3>Ocorrência 69 × Docs em atraso <span class="lg"><span><i style="background:#f4b740"></i>69</span><span><i style="background:#ff5d55"></i>150</span></span></h3>${barras(oc, {fmt:int, cor:"a", cor2:"r", l1:"Ocorrência 69", l2:"Docs em atraso (150)", vazio:"Importe Ocorrências (69) e Docs em atraso (150)."})}</div>
      <div class="vo-card"><h3>SLA por focal <span>performance de entrega</span></h3>${barrasSla(todos)}</div>
    </div>` + matriz;
  }

  function secFaturamento(){
    const L = metricas(), t = totais(), todos = D.lista;
    const tk = t.qctrc ? t.fat / t.qctrc : 0;
    const kpis = `<div class="vo-kpis">
      ${kpi(I.money, "Faturamento (frete)", t.fat, focal === "todos" ? "operação toda" : esc(L[0] ? L[0].curto : ""), "", "brl")}
      ${kpi(I.box, "CTRCs faturados", t.qctrc, "documentos emitidos", "", "int")}
      ${kpi(I.card, "Ticket médio", tk, "frete por CTRC", "", "brl")}
      ${kpi(I.truck, "Valor de mercadoria", t.merc, t.merc ? "frete = " + ((t.fat / t.merc) * 100).toFixed(2).replace(".", ",") + "% da mercadoria" : "", "", "brl")}
    </div>`;
    const stack = [...todos].filter(m => m.fatUn + m.fatPag > 0).sort((a, b) => (b.fatUn + b.fatPag) - (a.fatUn + a.fatPag));
    const mx = Math.max(...stack.map(m => m.fatUn + m.fatPag), 1);
    const comp = stack.length ? `<ul class="vo-bars">${stack.map(m => { const tot = m.fatUn + m.fatPag, w = tot / mx * 100;
      return `<li data-vo-tip="${esc(m.key + "|Do Valle → unidade: " + brlC(m.fatUn) + "|Pagadora → Do Valle: " + brlC(m.fatPag) + "|Total: " + brlC(tot) + "|Clique para ver a ficha")}" data-vo-det="${esc(m.key)}" class="${m.key === focal ? "sel" : ""}">${nomeFocal(m)}<span class="vo-bt"><u style="height:12px"><i style="width:${w * m.fatUn / (tot || 1)}%"></i><i class="t" style="left:${w * m.fatUn / (tot || 1)}%;width:${w * m.fatPag / (tot || 1)}%;border-radius:0 6px 6px 0"></i></u></span><span class="vo-bv">${brlC(tot)}</span></li>`; }).join("")}</ul>` : `<div class="vo-empty">Importe o Faturamento Geral na aba Fechamento-RECEITA.</div>`;
    const direcao = donut([{nome:"Do Valle → unidade", v:t.fatUn, cor:PAL[0]}, {nome:"Empresa pagadora → Do Valle", v:t.fatPag, cor:PAL[1]}], "Sem faturamento importado.", "frete total", brlC);

    /* por unidade de entrega (praça) — ignora o pagador; cai para a receita por unidade se não houver */
    let un = [], fonte = "unidade de entrega";
    if(typeof unidadesDestinoComDados === "function") un = unidadesDestinoComDados().map(u => ({sigla:u.sigla, cidade:u.cidade, qctrc:u.qctrc, frete:u.frete, merc:u.vlrMerc}));
    if(!un.length){ fonte = "unidade"; un = Object.keys(D.rec).map(s => { const c = combinaUnidadeReceita(D.rec[s]); return {sigla:s, cidade:"", qctrc:c.qctrc, frete:c.frete, merc:c.vlrMerc}; }); }
    un = un.filter(u => u.frete > 0 && selecionado(focalDaSigla(u.sigla))).sort((a, b) => b.frete - a.frete);
    const totU = un.reduce((s, u) => s + u.frete, 0), mU = Math.max(...un.map(u => u.frete), 1);
    const tabela = un.length ? `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_fat" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_fat">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_fat" class="vo-table vo-sortable"><thead><tr><th>Unidade</th><th>Focal</th><th>CTRCs</th><th>Faturamento</th><th>% do total</th><th style="width:26%"></th></tr></thead><tbody>
      ${un.map(u => { const f = focalDaSigla(u.sigla); const mm = D.M.get(f);
        return `<tr><td><span class="nm"><b>${esc(u.sigla)}</b>${u.cidade ? `<small>${esc(u.cidade)}</small>` : ""}</span></td><td><span class="vo-tag ${f === SEM_FOCAL ? "x" : ""}">${esc(mm ? mm.curto : f)}</span></td><td>${int(u.qctrc)}</td><td>${brl(u.frete)}</td><td>${totU ? (u.frete / totU * 100).toFixed(1).replace(".", ",") : "0,0"}%</td>
          <td><div class="vo-bt"><u><i style="width:${Math.max(2, u.frete / mU * 100)}%"></i></u></div></td></tr>`; }).join("")}
      </tbody><tfoot><tr><td>Total</td><td></td><td>${int(un.reduce((s, u) => s + u.qctrc, 0))}</td><td>${brl(totU)}</td><td>100%</td><td></td></tr></tfoot></table></div>` : `<div class="vo-empty">Nenhum faturamento por unidade importado ainda (Dashboard Principal da Receita).</div>`;

    return kpis + `<div class="vo-grid vo-g21">
      <div class="vo-card"><h3>Faturamento por focal <span class="lg"><span><i style="background:#5cb531"></i>Do Valle → unidade</span><span><i style="background:#35c9a0"></i>pagadora → Do Valle</span></span></h3>${comp}</div>
      <div class="vo-card"><h3>Direção do frete <span>${focal === "todos" ? "operação toda" : "focal selecionado"}</span></h3>${direcao}</div>
    </div>
    <div class="vo-card"><h3>Faturamento por ${fonte} <span>${un.length} unidade(s) · ${focal === "todos" ? "todas as unidades" : "somente do focal filtrado"}</span></h3>${tabela}</div>`;
  }

  function secExpedicao(){
    const dados = (typeof geralExpedidaRecebida === "function" ? geralExpedidaRecebida() : []).filter(u => selecionado(focalDaSigla(u.sigla)));
    const t = dados.reduce((a, u) => ({eq:a.eq + u.expQctrc, ef:a.ef + u.expFrete, rq:a.rq + u.recQctrc, rf:a.rf + u.recFrete}), {eq:0, ef:0, rq:0, rf:0});
    const kpis = `<div class="vo-kpis">
      ${kpi(I.out, "Frete expedido", t.ef, int(t.eq) + " CTRCs expedidos", "", "brl")}
      ${kpi(I.truck, "Frete recebido (entrega)", t.rf, int(t.rq) + " CTRCs recebidos", "", "brl")}
      ${kpi(I.card, "Ticket médio expedido", t.eq ? t.ef / t.eq : 0, "frete por CTRC", "", "brl")}
      ${kpi(I.ops, "Unidades com movimento", dados.length, "expedindo e/ou recebendo", "", "int")}
    </div>`;
    if(!dados.length) return kpis + `<div class="vo-card"><div class="vo-empty">Nenhuma expedição importada (ou nenhuma filial marcada no filtro da aba Expedição). Importe o Faturamento Geral (VAL e/ou RVA) em Fechamento-RECEITA.</div></div>`;

    const porUn = [...dados].sort((a, b) => b.expFrete - a.expFrete).slice(0, 12).map(u => ({label:u.sigla, sub:focalDaSigla(u.sigla).split("—")[0].trim(), v:u.expFrete, v2:u.recFrete}));
    const mapF = {}; dados.forEach(u => { const k = focalDaSigla(u.sigla); mapF[k] = (mapF[k] || 0) + u.expFrete; });
    const porFocal = D.lista.filter(m => mapF[m.key] > 0).sort((a, b) => mapF[b.key] - mapF[a.key]).map(m => ({m, v:mapF[m.key]}));
    const mxx = Math.max(...dados.map(u => Math.max(u.expFrete, u.recFrete)), 1);
    const tab = `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_exp" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_exp">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_exp" class="vo-table vo-sortable"><thead><tr><th>Unidade</th><th>Focal</th><th>CTRCs exp.</th><th>Frete expedido</th><th>CTRCs rec.</th><th>Frete recebido</th><th>Saldo (exp − rec)</th></tr></thead><tbody>
      ${dados.map(u => { const f = focalDaSigla(u.sigla), mm = D.M.get(f), s = u.expFrete - u.recFrete;
        return `<tr><td><b>${esc(u.sigla)}</b></td><td><span class="vo-tag ${f === SEM_FOCAL ? "x" : ""}">${esc(mm ? mm.curto : f)}</span></td><td>${int(u.expQctrc)}</td><td>${brl(u.expFrete)}</td><td>${int(u.recQctrc)}</td><td>${brl(u.recFrete)}</td><td style="color:${s >= 0 ? "var(--g2)" : "var(--amb)"}">${s >= 0 ? "+" : "−"}${brl(Math.abs(s))}</td></tr>`; }).join("")}
      </tbody><tfoot><tr><td>Total</td><td></td><td>${int(t.eq)}</td><td>${brl(t.ef)}</td><td>${int(t.rq)}</td><td>${brl(t.rf)}</td><td>${t.ef - t.rf >= 0 ? "+" : "−"}${brl(Math.abs(t.ef - t.rf))}</td></tr></tfoot></table></div>`;
    return kpis + `<div class="vo-grid vo-g2">
      <div class="vo-card"><h3>Expedido × recebido por unidade <span>top 12 por frete expedido</span><span class="lg"><span><i style="background:#5cb531"></i>expedido</span><span><i style="background:#f4b740"></i>recebido</span></span></h3>${barras(porUn, {fmt:brlC, cor:"", cor2:"a", l1:"Expedido", l2:"Recebido", sm:true})}</div>
      <div class="vo-card"><h3>Frete expedido por focal</h3>${barras(porFocal, {fmt:brlC, vazio:"Sem expedição para este filtro."})}</div>
    </div>
    <div class="vo-card"><h3>Detalhe por unidade <span>aplica o filtro de filiais da aba Expedição</span></h3>${tab}</div>`;
  }

  function secOcorrencias(){
    const L = metricas(), t = totais(), todos = D.lista;
    const ocs = D.ocs.filter(o => selecionado(o.focal || SEM_FOCAL)), atrs = D.atrs.filter(a => selecionado(a.focal || SEM_FOCAL));
    const media = atrs.length ? Math.round(atrs.reduce((s, a) => s + num(a.diasAtraso), 0) / atrs.length) : 0;
    const kpis = `<div class="vo-kpis">
      ${kpi(I.alert, "Ocorrência 69", ocs.length, brlC(ocs.reduce((s, o) => s + num(o.valFrete), 0)) + " em frete", ocs.length ? "warn" : "", "int")}
      ${kpi(I.box, "Docs em atraso (150)", atrs.length, brlC(atrs.reduce((s, a) => s + num(a.frete), 0)) + " em frete", atrs.length ? "warn" : "", "int")}
      ${kpi(I.clock, "Mais de 5 dias", atrs.filter(a => num(a.diasAtraso) > 5).length, "atraso crítico", atrs.some(a => num(a.diasAtraso) > 5) ? "bad" : "", "int")}
      ${kpi(I.target, "Atraso médio", media, "dias por documento", media > 5 ? "bad" : "", "int")}
    </div>`;
    const porFocal = [...todos].filter(m => m.oc69 || m.atr).sort((a, b) => (b.atr + b.oc69) - (a.atr + a.oc69)).map(m => ({m, v:m.oc69, v2:m.atr}));

    const faixas = [["1–2 dias", 1, 2], ["3–5 dias", 3, 5], ["6–10 dias", 6, 10], ["11–20 dias", 11, 20], ["21+ dias", 21, 9999]].map(([n, a, b]) => ({label:n, sub:"", v:atrs.filter(x => { const d = num(x.diasAtraso); return d >= a && d <= b; }).length}));
    const faixasHtml = atrs.length ? barras(faixas.map((f, i) => ({...f})), {fmt:int, cor:"a", sm:true}) : `<div class="vo-empty">Nenhum documento em atraso importado.</div>`;

    const cnt = (lista, fn) => { const m = {}; lista.forEach(x => { const k = fn(x); if(k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const topUn = cnt(atrs, a => String(a.unidade || "").toUpperCase().trim()).slice(0, 8).map(([k, v]) => ({label:k, sub:focalDaSigla(k).split("—")[0].trim(), v}));
    const motivos = cnt(ocs, o => (o.ocorDescricao || o.ultOcor || "Sem descrição").trim()).slice(0, 6).map(([k, v], i) => ({nome:k, v, cor:PAL[i % PAL.length]}));
    const piores = [...atrs].sort((a, b) => num(b.diasAtraso) - num(a.diasAtraso)).slice(0, 12);
    const tab = piores.length ? `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_docs" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_docs">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_docs" class="vo-table vo-sortable"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Focal</th><th>Unid. entrega</th><th>Pagador</th><th>Frete</th><th>Dias de atraso</th></tr></thead><tbody>
      ${piores.map(a => { const f = a.focal || SEM_FOCAL, mm = D.M.get(f), d = num(a.diasAtraso);
        return `<tr><td><b>${esc(a.ctrc || "-")}</b></td><td>${esc(a.nf || "-")}</td><td>${sistemaTag(a.origem)}</td><td><span class="vo-tag ${f === SEM_FOCAL ? "x" : ""}">${esc(mm ? mm.curto : f)}</span></td><td>${esc(a.unidade || "-")}</td><td style="text-align:left;max-width:150px;overflow:hidden;text-overflow:ellipsis">${esc(a.pagador || "-")}</td><td>${brl(num(a.frete))}</td><td><span class="vo-pill ${d > 5 ? "late" : "soon"}">${d} dia(s)</span></td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="vo-empty">Nenhum documento em atraso importado.</div>`;

    return kpis + `<div class="vo-grid vo-g3">
      <div class="vo-card"><h3>Por focal <span class="lg"><span><i style="background:#f4b740"></i>69</span><span><i style="background:#ff5d55"></i>150</span></span></h3>${barras(porFocal, {fmt:int, cor:"a", cor2:"r", l1:"Ocorrência 69", l2:"Docs em atraso (150)", vazio:"Sem ocorrências ou atrasos importados."})}</div>
      <div class="vo-card"><h3>Tempo de atraso <span>documentos (150)</span></h3>${faixasHtml}</div>
      <div class="vo-card"><h3>Ocorrência 69 por motivo</h3>${donut(motivos, "Nenhuma ocorrência 69 importada.", "ocorrências")}</div>
    </div>
    <div class="vo-grid vo-g2">
      <div class="vo-card"><h3>Unidades com mais atraso <span>docs (150) por unid. de entrega</span></h3>${topUn.length ? barras(topUn, {fmt:int, cor:"r", sm:true}) : `<div class="vo-empty">Nenhum documento em atraso importado.</div>`}</div>
      <div class="vo-card"><h3>Documentos mais atrasados <span>top 12</span></h3>${tab}</div>
    </div>`;
  }

  function secPendencias(){
    const L = metricas(), t = totais(), todos = D.lista;
    const pends = D.pends.filter(p => selecionado(focalDaSigla(p.filial)));
    const bol = focal === "todos";
    const kpis = `<div class="vo-kpis">
      ${kpi(I.clock, "Pendências abertas", pends.length, "ainda não resolvidas", pends.length ? "warn" : "", "int")}
      ${kpi(I.swap, "Trocas em aberto", t.trocas, t.trocasAt + " atrasada(s)", t.trocasAt ? "bad" : "", "int")}
      ${kpi(I.alert, "Boletos vencidos", bol ? D.bAt.length : "—", bol ? int(D.boletos.length) + " boleto(s) no total" : "boletos não têm focal", bol && D.bAt.length ? "bad" : "")}
      ${kpi(I.card, "Valor em débito", bol ? D.deb : "—", bol ? "soma dos boletos" : "visível em “Todos”", "", bol ? "brl" : "")}
    </div>`;
    const pf = [...todos].filter(m => m.pend).sort((a, b) => b.pend - a.pend).map(m => ({m, v:m.pend}));
    const tp = {}; pends.forEach(p => { const k = p.tipo === "Outros" && p.tipoOutro ? p.tipoOutro : (p.tipo || "Outros"); tp[k] = (tp[k] || 0) + 1; });
    const tipos = Object.entries(tp).sort((a, b) => b[1] - a[1]).map(([n, v], i) => ({nome:n, v, cor:PAL[i % PAL.length]}));
    const tr = [...todos].filter(m => m.trocas).sort((a, b) => b.trocasAt - a.trocasAt || b.trocas - a.trocas).map(m => ({m, v:m.trocas, v2:m.trocasAt}));
    const itens = D.prioridades.filter(i => i.tipo === "Troca" ? selecionado(focalDaSigla(i.filial)) : bol);
    const prior = itens.length ? `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_prior" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_prior">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_prior" class="vo-table vo-sortable"><thead><tr><th>Tipo</th><th>Focal</th><th>Filial</th><th>NF</th><th>Situação</th></tr></thead><tbody>
      ${itens.slice(0, 40).map(i => { const f = i.filial && i.filial !== "-" ? focalDaSigla(i.filial) : null, mm = f ? D.M.get(f) : null, late = i.d < 0, msg = late ? `Atrasado ${-i.d} dia(s)` : (i.d === 0 ? "Vence hoje" : `Vence em ${i.d} dia(s)`);
        return `<tr><td style="text-align:left"><b>${esc(i.tipo)}</b></td><td>${f ? `<span class="vo-tag ${f === SEM_FOCAL ? "x" : ""}">${esc(mm ? mm.curto : f)}</span>` : `<span class="dim">–</span>`}</td><td>${esc(i.filial || "-")}</td><td>${esc(String(i.ref ?? "-"))}</td><td><span class="vo-pill ${late ? "late" : "soon"}">${msg}</span></td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="vo-empty">Nenhuma prioridade crítica no momento.</div>`;
    return kpis + `<div class="vo-grid vo-g3">
      <div class="vo-card"><h3>Pendências abertas por focal</h3>${barras(pf, {fmt:int, cor:"a", vazio:"Nenhuma pendência aberta."})}</div>
      <div class="vo-card"><h3>Pendências por tipo</h3>${donut(tipos, "Nenhuma pendência aberta.", "pendências")}</div>
      <div class="vo-card"><h3>Trocas em aberto por focal <span class="lg"><span><i style="background:#5cb531"></i>abertas</span><span><i style="background:#ff5d55"></i>atrasadas</span></span></h3>${barras(tr, {fmt:int, cor:"", cor2:"r", l1:"Abertas", l2:"Atrasadas", vazio:"Nenhuma troca em aberto."})}</div>
    </div>
    <div class="vo-card"><h3>Prioridades <span>vencidas ou com prazo em até 2 dias</span></h3>${prior}</div>`;
  }

  /* ---------------- ficha do focal (gaveta) ---------------- */
  function fichaFocal(key){
    const m = D.M.get(key); if(!m) return "";
    const classif = todasSiglasFocais(), perfMap = {};
    if(D.perfData) D.perfData.unidades.forEach(u => { perfMap[u.sigla] = u; });
    const f = FOCAIS.find(x => x.titulo === key);
    const siglas = new Set();
    if(f) f.unidades.forEach(u => siglas.add(u.sigla));
    Object.keys(FOCAIS_ESPECIAIS_POR_UNIDADE).forEach(s => { if(FOCAIS_ESPECIAIS_POR_UNIDADE[s] === key) siglas.add(s); });
    const doc = {};   // documentos agrupados pelo focal gravado (soma bate com a tela)
    const marca = (lista, campo) => lista.filter(x => (x.focal || SEM_FOCAL) === key).forEach(x => { const s = String(x.unidade || "").toUpperCase().trim(); if(!s) return; siglas.add(s); (doc[s] = doc[s] || {oc:0, at:0, a5:0})[campo]++; if(campo === "at" && num(x.diasAtraso) > 5) doc[s].a5++; });
    marca(D.ocs, "oc"); marca(D.atrs, "at");
    if(key === SEM_FOCAL){ Object.keys(D.rec).filter(s => !classif.has(s) && !FOCAIS_ESPECIAIS_POR_UNIDADE[s]).forEach(s => siglas.add(s)); }
    const pendU = {}; D.pends.forEach(p => { if(focalDaSigla(p.filial) === key){ const s = String(p.filial).toUpperCase(); pendU[s] = (pendU[s] || 0) + 1; siglas.add(s); } });
    const linhas = [...siglas].map(s => {
      const c = combinaUnidadeReceita(D.rec[s]), p = perfMap[s], d = doc[s] || {oc:0, at:0, a5:0};
      return {s, fat:c.frete, qctrc:c.qctrc, sla:p ? p.sla : null, oc:d.oc, at:d.at, a5:d.a5, pend:pendU[s] || 0};
    }).filter(l => l.fat || l.sla !== null || l.oc || l.at || l.pend).sort((a, b) => b.fat - a.fat || b.at - a.at);
    const sla = m.perf ? m.perf.sla : null;
    const mini = `<div class="vo-mini">
      <div><em>Faturamento</em><b>${brlC(m.fatUn + m.fatPag)}</b></div>
      <div><em>SLA</em><b class="vo-sla ${sla === null ? "" : tone(sla)}">${pct(sla)}</b></div>
      <div><em>CTRCs</em><b>${int(m.qctrc)}</b></div>
      <div><em>Ocorrência 69</em><b>${int(m.oc69)}</b></div>
      <div><em>Docs atraso (150)</em><b>${int(m.atr)}</b></div>
      <div><em>Mais de 5 dias</em><b style="color:${m.atr5 ? "var(--red)" : "inherit"}">${int(m.atr5)}</b></div>
      <div><em>Pendências</em><b>${int(m.pend)}</b></div>
      <div><em>Trocas abertas</em><b>${int(m.trocas)}</b></div>
      <div><em>Trocas atrasadas</em><b style="color:${m.trocasAt ? "var(--red)" : "inherit"}">${int(m.trocasAt)}</b></div></div>`;
    const tab = linhas.length ? `<div class="vo-scroll" style="max-height:none"><table class="vo-table vo-sortable"><thead><tr><th>Unidade</th><th>Fatur.</th><th>SLA</th><th>69</th><th>150</th><th>Pend.</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td><b>${esc(l.s)}</b></td><td>${l.fat ? brlC(l.fat) : "<span class='dim'>–</span>"}</td><td>${l.sla === null ? "<span class='dim'>–</span>" : `<span class="vo-sla ${tone(l.sla)}">${pct(l.sla)}</span>`}</td><td>${l.oc || "<span class='dim'>–</span>"}</td><td>${l.at ? l.at + (l.a5 ? ` <small style="color:var(--red)">(${l.a5} +5d)</small>` : "") : "<span class='dim'>–</span>"}</td><td>${l.pend || "<span class='dim'>–</span>"}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="vo-empty">Nenhuma unidade com dados para este focal.</div>`;
    const piores = D.atrs.filter(a => (a.focal || SEM_FOCAL) === key).sort((a, b) => num(b.diasAtraso) - num(a.diasAtraso)).slice(0, 5);
    const docs = piores.length ? `<div><h4>Documentos mais atrasados</h4><table class="vo-table"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Unid.</th><th>Frete</th><th>Atraso</th></tr></thead><tbody>${piores.map(a => `<tr><td><b>${esc(a.ctrc || "-")}</b></td><td>${esc(a.nf || "-")}</td><td>${sistemaTag(a.origem)}</td><td>${esc(a.unidade || "-")}</td><td>${brl(num(a.frete))}</td><td><span class="vo-pill ${num(a.diasAtraso) > 5 ? "late" : "soon"}">${num(a.diasAtraso)} dia(s)</span></td></tr>`).join("")}</tbody></table></div>` : "";
    return `<div class="vo-dh"><div><h3>${esc(m.curto)}${m.nome ? " — " + esc(m.nome) : ""}</h3><small>Ficha do focal · números do período importado</small></div><button class="x" data-vo-dclose title="Fechar (Esc)">✕</button></div>
      <div class="vo-db">${mini}<div><h4>Por unidade <span style="text-transform:none;letter-spacing:0">(clique no cabeçalho para ordenar)</span></h4>${tab}</div>${docs}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="vo-btn" data-vo-focal="${esc(key)}" data-vo-dclose>${focal === key ? "Filtro já aplicado" : "Filtrar a tela por este focal"}</button><button class="vo-btn ghost" data-vo-dclose>Fechar</button></div></div>`;
  }

  function abrirFicha(key){
    detalhe = key; if(tipEl) tipEl.style.display = "none"; document.getElementById("voDrawer").innerHTML = fichaFocal(key); root.classList.add("dr");
    const b = root.querySelector(".vo-drawer .x"); if(b) b.focus({preventScroll:true});
  }
  function fecharFicha(){ detalhe = null; if(root) root.classList.remove("dr"); }

  /* ---------------- tooltip ---------------- */
  function mostrarTip(e){
    const el = e.target.closest ? e.target.closest("[data-vo-tip]") : null;
    if(!el){ tipEl.style.display = "none"; return; }
    const l = el.dataset.voTip.split("|");
    tipEl.innerHTML = `<b>${esc(l[0])}</b>` + l.slice(1).map(x => esc(x)).join("<br>");
    tipEl.style.display = "block";
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + "px";
    tipEl.style.top = Math.min(e.clientY + 14, window.innerHeight - h - 8) + "px";
  }

  /* ---------------- tabelas: CSV, busca, ordenação ---------------- */
  function baixarCsv(id){
    const t = document.getElementById(id); if(!t) return;
    const linhas = [...t.querySelectorAll("tr")].filter(tr => tr.style.display !== "none").map(tr => [...tr.children].map(c => '"' + c.innerText.replace(/\s+/g, " ").trim().replace(/"/g, '""') + '"').join(";"));
    const blob = new Blob(["\ufeff" + linhas.join("\r\n")], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "visao-operacao-" + id.replace("voT_", "") + "-" + todayISO() + ".csv";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function filtrarTabela(id, q){
    const t = document.getElementById(id); if(!t) return;
    q = q.toLowerCase().trim();
    t.querySelectorAll("tbody tr").forEach(tr => { tr.style.display = !q || tr.innerText.toLowerCase().includes(q) ? "" : "none"; });
  }
  const valorCelula = td => { const s = td.innerText.trim(); const n = parseFloat(s.replace(/R\$|\s|mil|Mi/g, "").replace(/\./g, "").replace(",", ".")); return isNaN(n) || !/\d/.test(s) ? s.toLowerCase() : n; };
  function ordenarTabela(th){
    const t = th.closest("table"), i = [...th.parentNode.children].indexOf(th), asc = th.dataset.dir !== "asc";
    th.parentNode.querySelectorAll("th").forEach(x => { x.classList.remove("sorted"); delete x.dataset.dir; x.textContent = x.textContent.replace(/ [▴▾]$/, ""); });
    th.dataset.dir = asc ? "asc" : "desc"; th.classList.add("sorted"); th.textContent += asc ? " ▴" : " ▾";
    const tb = t.tBodies[0], rows = [...tb.rows];
    rows.sort((a, b) => { const x = valorCelula(a.cells[i]), y = valorCelula(b.cells[i]); const r = (typeof x === "number" && typeof y === "number") ? x - y : String(x).localeCompare(String(y), "pt-BR", {numeric:true}); return asc ? r : -r; });
    rows.forEach(r => tb.appendChild(r));
  }

  /* ---------------- montagem da janela ---------------- */
  function chips(){
    const total = D.lista.length;
    return `<span class="lbl">Focal</span><button class="vo-chip ${focal === "todos" ? "on" : ""}" data-vo-focal="todos">Todos<small>${total}</small></button>` +
      D.lista.map(m => `<button class="vo-chip ${m.key === focal ? "on" : ""}" data-vo-focal="${esc(m.key)}" title="${esc(m.key)}">${esc(m.curto)}<small>${esc(m.nome.split(" ")[0])}</small></button>`).join("");
  }

  function conteudo(){
    const s = SECOES.find(x => x.id === secao);
    const f = focal === "todos" ? null : D.lista.find(m => m.key === focal);
    const corpo = {geral:secGeral, faturamento:secFaturamento, expedicao:secExpedicao, ocorrencias:secOcorrencias, pendencias:secPendencias}[secao]();
    return `<div class="vo-sec-title"><h2>${s.titulo}</h2><span>${s.sub}</span>${f ? `<span class="tag">${esc(f.key)}<button data-vo-focal="todos" title="Limpar filtro">✕</button></span>` : ""}</div>${corpo}`;
  }

  function status(){
    const perf = D.perfData && D.perfData.periodo ? D.perfData.periodo : "sem importação";
    const h = atualizadoEm.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    return `<span><b>Visão da Operação v${VERSAO}</b> · atualizado às ${h}</span><span class="opt">Performance: <b>${esc(perf)}</b></span><span class="opt">Ocorr. 69: <b>${int(D.ocs.length)}</b></span><span class="opt">Docs em atraso: <b>${int(D.atrs.length)}</b></span><span class="sp"></span><span class="opt"><kbd>Esc</kbd> fecha a ficha / volta ao menu</span><span id="voClock"></span>`;
  }

  function montar(){
    return `<header class="vo-top">
        <button class="vo-back" data-vo-close title="Voltar ao menu (Esc)">${I.back}<span>Voltar ao menu</span></button>
        <img class="vo-logo" src="logo-dovalle.png" alt="Do Valle">
        <div class="vo-title"><b>VISÃO DA OPERAÇÃO</b><span>Rede Do Valle / Real Vale</span></div>
        <span class="sp"></span>
        <button class="vo-tbtn" data-vo-refresh title="Recarregar os dados do painel">${I.refresh}<span>Atualizar</span></button>
        <button class="vo-tbtn" data-vo-theme title="Alternar tema claro / escuro">${I.moon}<span id="voThemeLbl">${claro ? "Tema escuro" : "Tema claro"}</span></button>
      </header>
      <nav class="vo-rail">${SECOES.map(s => `<button data-vo-sec="${s.id}" class="${s.id === secao ? "on" : ""}" title="${s.titulo}">${s.icon}<span>${s.label}</span></button>`).join("")}<span class="sp"></span>
        <button data-vo-close title="Voltar ao menu">${I.back}<span>Menu</span></button></nav>
      <div class="vo-body"><div class="vo-filter" id="voFilter">${chips()}</div><main class="vo-main" id="voMain">${conteudo()}</main>
        <div class="vo-scrim" id="voScrim" data-vo-dclose></div><aside class="vo-drawer" id="voDrawer" aria-label="Ficha do focal"></aside></div>
      <footer class="vo-status" id="voStatus">${status()}</footer>`;
  }

  function animarNumeros(){
    const reduz = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.querySelectorAll("[data-vo-count]").forEach(el => {
      const alvo = Number(el.dataset.voCount) || 0, f = FMT[el.dataset.voFmt] || int;
      if(reduz || !alvo){ el.textContent = f(alvo); return; }
      const ini = performance.now(), passo = t => { const k = Math.min(1, (t - ini) / 550); el.textContent = f(alvo * (1 - Math.pow(1 - k, 3))); if(k < 1) requestAnimationFrame(passo); };
      requestAnimationFrame(passo);
    });
  }

  function tick(){
    const c = document.getElementById("voClock"); if(!c){ return; }
    const a = new Date();
    c.textContent = a.toLocaleDateString("pt-BR", {weekday:"long", day:"2-digit", month:"long"}) + " · " + a.toLocaleTimeString("pt-BR");
  }

  function atualizar(opts){
    opts = opts || {};
    const main = document.getElementById("voMain"), top = main.scrollTop;
    document.getElementById("voFilter").innerHTML = chips();
    main.innerHTML = conteudo();
    main.scrollTop = opts.topo ? 0 : top;
    root.querySelectorAll("[data-vo-sec]").forEach(b => b.classList.toggle("on", b.dataset.voSec === secao));
    if(opts.animar !== false) animarNumeros(); else root.querySelectorAll("[data-vo-count]").forEach(el => { el.textContent = (FMT[el.dataset.voFmt] || int)(Number(el.dataset.voCount) || 0); });
  }

  function aplicarTema(){
    root.classList.toggle("vo-light", claro);
    const l = document.getElementById("voThemeLbl"); if(l) l.textContent = claro ? "Tema escuro" : "Tema claro";
    try{ localStorage.setItem("painel_vo_tema", claro ? "claro" : "escuro"); }catch(e){}
  }

  function recarregar(btn){
    D = coletar(); atualizadoEm = new Date();
    if(focal !== "todos" && !D.lista.some(m => m.key === focal)) focal = "todos";
    document.getElementById("voStatus").innerHTML = status(); tick(); atualizar();
    if(detalhe && D.M.has(detalhe)) document.getElementById("voDrawer").innerHTML = fichaFocal(detalhe); else fecharFicha();
    if(btn){ btn.classList.add("spin"); setTimeout(() => btn.classList.remove("spin"), 750); }
  }

  function clique(e){
    const alvo = e.target.closest("[data-vo-close],[data-vo-sec],[data-vo-focal],[data-vo-sort],[data-vo-det],[data-vo-go],[data-vo-dclose],[data-vo-refresh],[data-vo-theme],[data-vo-csv],.vo-sortable th");
    if(!alvo) return;
    if(alvo.matches(".vo-sortable th")) return ordenarTabela(alvo);
    if(alvo.hasAttribute("data-vo-csv")) return baixarCsv(alvo.dataset.voCsv);
    if(alvo.hasAttribute("data-vo-refresh")) return recarregar(alvo);
    if(alvo.hasAttribute("data-vo-theme")){ claro = !claro; return aplicarTema(); }
    if(alvo.dataset.voFocal !== undefined){
      focal = alvo.dataset.voFocal;
      if(alvo.hasAttribute("data-vo-dclose")) fecharFicha();
      return atualizar();
    }
    if(alvo.hasAttribute("data-vo-dclose")) return fecharFicha();
    if(alvo.hasAttribute("data-vo-close")) return fechar();
    if(alvo.dataset.voDet) return abrirFicha(alvo.dataset.voDet);
    if(alvo.dataset.voGo){ secao = alvo.dataset.voGo; return atualizar({topo:true}); }
    if(alvo.dataset.voSec){ secao = alvo.dataset.voSec; fecharFicha(); return atualizar({topo:true}); }
    if(alvo.dataset.voSort){
      const c = alvo.dataset.voSort;
      if(sortCol === c) sortDir = -sortDir; else { sortCol = c; sortDir = c === "nome" ? 1 : -1; }
      return atualizar({animar:false});
    }
  }

  function aoTeclar(e){
    if(!aberta || e.key !== "Escape") return;
    e.preventDefault();
    if(detalhe) fecharFicha(); else fechar();
  }

  function abrir(){
    if(aberta) return;
    D = coletar(); atualizadoEm = new Date();
    if(focal !== "todos" && !D.lista.some(m => m.key === focal)) focal = "todos";
    if(!root){
      try{ claro = localStorage.getItem("painel_vo_tema") === "claro"; }catch(e){}
      root = document.createElement("div"); root.className = "vo"; root.id = "voRoot"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Visão da Operação");
      tipEl = document.createElement("div"); tipEl.className = "vo-tip"; root.appendChild(tipEl);
      root.addEventListener("click", clique);
      root.addEventListener("mousemove", mostrarTip); root.addEventListener("mouseleave", () => { tipEl.style.display = "none"; });
      root.addEventListener("input", e => { if(e.target.dataset && e.target.dataset.voSearch) filtrarTabela(e.target.dataset.voSearch, e.target.value); });
      document.body.appendChild(root); document.addEventListener("keydown", aoTeclar);
    }
    root.innerHTML = montar(); root.appendChild(tipEl); detalhe = null;
    aplicarTema();
    root.classList.add("on"); document.body.classList.add("vo-open"); aberta = true;
    animarNumeros(); tick(); timer = setInterval(tick, 1000);
    const b = root.querySelector(".vo-back"); if(b) b.focus({preventScroll:true});
  }

  function fechar(){
    if(!aberta) return;
    fecharFicha(); tipEl.style.display = "none";
    root.classList.remove("on"); document.body.classList.remove("vo-open"); aberta = false;
    clearInterval(timer); timer = null;
  }

  window.abrirVisaoOperacao = abrir;
  window.fecharVisaoOperacao = fechar;
  window.VISAO_OPERACAO_ICON = I.grid;
})();
