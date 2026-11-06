/* =====================================================================
   VISÃO DA OPERAÇÃO — tela cheia, estilo "programa".
   Tudo por FOCAL: faturamento, expedição, ocorrência 69, documentos em
   atraso (150), pendências, trocas e SLA.
   Só LÊ os dados que o painel já guarda (nada é gravado aqui) e usa as
   mesmas funções das outras abas, então os números batem com elas.
   ===================================================================== */
(function(){
  "use strict";

  const VERSAO = "2.3";
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
    cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="13" height="11" rx="2"/><path d="M15.500 11l6-3.500v9L15.500 13"/></svg>',
    play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5v15l12-7.500z"/></svg>',
    stop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1.500"/></svg>',
    full:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>',
    ops:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/></svg>'
  };

  const SECOES = [
    {id:"geral", label:"Visão geral", icon:I.grid, titulo:"Visão geral da operação", sub:"todos os números, por focal"},
    {id:"faturamento", label:"Faturamento", icon:I.money, titulo:"Faturamento e receita", sub:"frete faturado por focal e por unidade"},
    {id:"expedicao", label:"Expedição", icon:I.out, titulo:"Expedição por unidade", sub:"o que cada unidade expediu x recebeu"},
    {id:"ocorrencias", label:"Ocorrências", icon:I.alert, titulo:"Ocorrências e documentos em atraso", sub:"ocorrência 69 e atrasos (150) por focal"},
    {id:"pendencias", label:"Pendências", icon:I.clock, titulo:"Pendências, trocas e prazos", sub:"o que ainda está aberto, por focal"},
    {id:"filmagens", label:"Filmagens", icon:I.cam, titulo:"Filmagens — Breno (câmeras)", sub:"levantamento das filmagens, vinculado à Receita pela nota fiscal"}
  ];

  let alertasTodos = false, pres = null, ocAtr = "", ocAtrTodas = false, aberta = false, secao = "geral", focal = "todos", sortCol = "fat", sortDir = -1, root = null, timer = null, D = null, atualizadoEm = new Date(), claro = false, sacView = null, sac = {sub:"resumo", unidade:"", sistema:"", faixa:""}, tipEl = null, fil = {tipo:"", rota:"", conf:"", pagador:"", mes:"", status:""}, filMsg = "";
  const PRES_MS = 20000, SEQ_PRES = ["geral", "faturamento", "expedicao", "ocorrencias", "pendencias"];
  const GOMAP = {"Boletos vencidos":"pendencias", "Filmagens":"filmagens", "Faturamento (frete)":"faturamento", "Ocorrência 69":"ocorrencias", "Docs em atraso (150)":"ocorrencias", "Pendências abertas":"pendencias", "Trocas em aberto":"pendencias"};

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

    return {film: (window.FILM ? window.FILM.dados() : {rows:[], tot:{}, info:{total:0}}), hoje, lista, M, rec, pag, perfData, perfGeral, ocs, atrs, pends, trocas, boletos, bAt,
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
    return `<ul class="vo-bars ${o.sm ? "sm" : ""} ${o.cls || ""}">${itens.map(i => {
      const w = v => Math.max(v > 0 ? 2 : 0, (v || 0) / max * 100);
      const bar = `<u><i class="${o.cor || ""}" style="width:${w(i.v)}%"></i></u>` + (i.v2 !== undefined ? `<u><i class="${o.cor2 || "r"}" style="width:${w(i.v2)}%"></i></u>` : "");
      const val = i.v2 !== undefined ? `<span class="vo-bv stack"><span>${fmt(i.v)}</span><span>${(o.fmt2 || fmt)(i.v2)}</span></span>` : `<span class="vo-bv">${fmt(i.v)}</span>`;
      const nome = i.m ? i.m.key : i.label;
      const tip = [nome, (o.l1 ? o.l1 + ": " : "") + fmt(i.v) + (i.v2 === undefined ? " · " + (i.v / soma * 100).toFixed(1).replace(".", ",") + "% do total" : ""), i.v2 !== undefined ? (o.l2 ? o.l2 + ": " : "") + (o.fmt2 || fmt)(i.v2) : "", i.m && !o.sm ? "Clique para abrir a tela do SAC" : (i.attr ? "Clique para listar os documentos" : "")].filter(Boolean).join("|");
      return `<li data-vo-tip="${esc(tip)}" ${i.m && !o.sm ? `data-vo-det="${esc(i.m.key)}"` : ""} ${i.attr || ""} class="${(i.m && i.m.key === focal) || i.sel ? "sel" : ""}">${i.m ? nomeFocal(i.m) : `<span class="vo-bl"><b>${esc(i.label)}</b><small>${esc(i.sub || "")}</small></span>`}<span class="vo-bt">${bar}</span>${val}</li>`;
    }).join("")}</ul>`;
  }

  function barrasSla(L){
    const itens = L.filter(m => m.perf);
    if(!itens.length) return `<div class="vo-empty">Importe a Performance Geral (VAL/RVA) para ver o SLA por focal.</div>`;
    const x = v => Math.max(0, Math.min(100, ((v || 0) - 90) / 10 * 100));
    return `<ul class="vo-bars">${itens.map(m => { const s = m.perf.sla, t = tone(s), c = t === "ok" ? "" : (t === "warn" ? "a" : "r");
      return `<li data-vo-tip="${esc(m.key + "|SLA: " + pct(s) + "|Meta: " + META_SLA + "%|" + int(m.perf.entregue) + " entregues|Clique para abrir a tela do SAC")}" data-vo-det="${esc(m.key)}" class="${m.key === focal ? "sel" : ""}">${nomeFocal(m)}<span class="vo-bt"><u><i class="${c}" style="width:${x(s)}%"></i></u><span class="meta" style="left:${x(META_SLA)}%"></span></span><span class="vo-bv vo-sla ${t}">${pct(s)}</span></li>`; }).join("")}</ul>
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

  /* ---------------- saúde por focal e pontos de atenção ----------------
     Regras (as mesmas para o placar, o resumo e a matriz):
       CRÍTICO  = SLA abaixo de 95%  ou  2+ problemas graves
       ATENÇÃO  = qualquer problema (SLA abaixo da meta, docs em atraso,
                  ocorrência 69, pendência com +15 dias…)
       EM DIA   = nenhum problema                                         */
  const NIVEL = {ok:"Em dia", warn:"Atenção", bad:"Crítico", na:"Sem dados"}, RANK = {na:-1, ok:0, warn:1, bad:2};
  function saude(m){
    D._sa = D._sa || new Map();
    if(D._sa.has(m.key)) return D._sa.get(m.key);
    const iss = [], s = m.perf ? m.perf.sla : null;
    const velhas = D.pends.filter(p => focalDaSigla(p.filial) === m.key && daysDiff(p.dataSistema, D.hoje) > 15).length;
    if(s !== null && s < 95) iss.push({n:"bad", t:`SLA em ${pct(s)}, abaixo de 95%`, aba:"unidades", w:100 - s});
    else if(s !== null && s < META_SLA) iss.push({n:"warn", t:`SLA em ${pct(s)} (meta ${META_SLA}%)`, aba:"unidades", w:META_SLA - s});
    if(m.atr5) iss.push({n:"bad", t:`${int(m.atr5)} documento(s) com mais de 5 dias de atraso`, aba:"atrasos", w:m.atr5 / 5});
    else if(m.atr) iss.push({n:"warn", t:`${int(m.atr)} documento(s) em atraso (150)`, aba:"atrasos", w:m.atr / 10});
    if(m.trocasAt) iss.push({n:"bad", t:`${int(m.trocasAt)} troca(s) com prazo vencido`, aba:"trocas", w:m.trocasAt});
    if(velhas) iss.push({n:"warn", t:`${int(velhas)} pendência(s) abertas há mais de 15 dias`, aba:"pendencias", w:velhas / 10});
    if(m.oc69) iss.push({n:"warn", t:`${int(m.oc69)} documento(s) com ocorrência 69 (${brlC(m.frete69)} em frete)`, aba:"oc69", w:m.oc69 / 10});
    iss.sort((a, b) => RANK[b.n] - RANK[a.n] || b.w - a.w);
    const bad = iss.filter(i => i.n === "bad").length;
    const r = {iss, bad, warn:iss.length - bad, sla:s, nivel:(s !== null && s < 95) || bad >= 2 ? "bad" : (iss.length ? "warn" : (s === null && !m.fatUn && !m.fatPag ? "na" : "ok"))};
    D._sa.set(m.key, r); return r;
  }

  function alertasOperacao(){
    const A = [];
    D.lista.forEach(m => saude(m).iss.forEach(i => A.push({n:i.n, w:i.w, m, t:i.t, open:m.key + "|" + i.aba})));
    if(D.bAt.length) A.push({n:"bad", w:D.bAt.length, t:`${int(D.bAt.length)} boleto(s) vencido(s) · ${brlC(D.bAt.reduce((s, b) => s + (Number(b.valor) || 0), 0))}`, go:"pendencias"});
    if(!D.perfGeral) A.push({n:"warn", w:0, t:"Performance Geral (VAL/RVA) ainda não importada — SLA indisponível"});
    if(!D.lista.some(m => m.fatUn || m.fatPag)) A.push({n:"warn", w:0, t:"Faturamento ainda não importado (Fechamento-RECEITA)", go:"faturamento"});
    const sf = D.M.get(SEM_FOCAL);
    if(sf && D.lista.includes(sf)) A.push({n:"warn", w:1, m:sf, t:"Há itens sem focal definido — revise em Confirmação de Filiais", open:SEM_FOCAL + "|resumo"});
    return A.sort((a, b) => RANK[b.n] - RANK[a.n] || b.w - a.w);
  }

  function resumoOperacao(){
    const ch = D.lista.map(m => ({m, h:saude(m)})), c = {bad:0, warn:0, ok:0, na:0};
    ch.forEach(x => c[x.h.nivel]++);
    const A = alertasOperacao(), nBad = A.filter(a => a.n === "bad").length, nWarn = A.length - nBad;
    const geral = c.bad || D.bAt.length ? "bad" : (c.warn ? "warn" : (c.ok ? "ok" : "na"));
    const titulo = {bad:"Operação em alerta", warn:"Operação com atenção", ok:"Operação em dia", na:"Aguardando dados"}[geral];
    const vis = alertasTodos ? A : A.slice(0, 6);
    const lis = vis.map(a => {
      const alvo = a.open ? `data-vo-open="${esc(a.open)}"` : (a.go ? `data-vo-go="${a.go}"` : "");
      return `<li class="${a.n} ${alvo ? "click" : ""}" ${alvo}><i></i>${a.m ? `<span class="vo-tag ${a.m.key === SEM_FOCAL ? "x" : ""}">${esc(a.m.curto)}</span>` : `<span class="vo-tag x">Geral</span>`}<span>${esc(a.t)}</span>${alvo ? `<em>Ver ›</em>` : ""}</li>`;
    }).join("");
    return `<section class="vo-sum ${geral}">
      <div class="vo-sum-l">
        <span class="vo-sum-st"><i></i>${titulo}</span>
        <div class="vo-sum-n"><b>${int(nBad)}</b><span>ponto(s) crítico(s)<br>${int(nWarn)} de atenção</span></div>
        <div class="vo-seg" title="SACs por situação">${["bad", "warn", "ok", "na"].filter(k => c[k]).map(k => `<i class="${k}" style="flex:${c[k]}"></i>`).join("")}</div>
        <ul class="vo-segleg"><li><i class="bad"></i>${c.bad} crítico(s)</li><li><i class="warn"></i>${c.warn} em atenção</li><li><i class="ok"></i>${c.ok} em dia</li>${c.na ? `<li><i class="na"></i>${c.na} sem dados</li>` : ""}</ul>
      </div>
      <div class="vo-sum-r"><h3>O que exige atenção agora <span>clique para ir direto ao assunto</span></h3>
        ${A.length ? `<ul class="vo-alerts vo-alerts-g">${lis}</ul>${A.length > 6 ? `<button class="vo-tool vo-ocmais" data-vo-alertas>${alertasTodos ? "Mostrar só os 6 principais" : "Ver todos os " + A.length + " pontos"}</button>` : ""}` : `<div class="vo-empty ok">Nenhum ponto de atenção. Operação dentro da meta.</div>`}
      </div></section>`;
  }

  function gauge(s){
    const C = 2 * Math.PI * 30, k = s === null ? 0 : Math.max(0, Math.min(1, (s - 90) / 10)), t = tone(s);
    return `<span class="vo-gauge ${s === null ? "na" : t}"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" class="bg"/><circle cx="36" cy="36" r="30" class="fg" stroke-dasharray="${(k * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 36 36)"/></svg><b>${s === null ? "—" : pct(s)}</b><small>SLA</small></span>`;
  }

  function placar(){
    const itens = D.lista.map(m => ({m, h:saude(m)})).sort((a, b) => RANK[b.h.nivel] - RANK[a.h.nivel] || b.h.bad - a.h.bad || (a.h.sla === null ? 101 : a.h.sla) - (b.h.sla === null ? 101 : b.h.sla) || (b.m.fatUn + b.m.fatPag) - (a.m.fatUn + a.m.fatPag));
    if(!itens.length) return "";
    return `<div class="vo-card vo-placar-c"><h3>Placar dos SACs <span>do mais crítico ao melhor · clique para abrir a tela do SAC · anel do SLA na escala 90–100%</span></h3>
      <div class="vo-placar">${itens.map(({m, h}) => {
        const tip = [m.key, NIVEL[h.nivel], ...(h.iss.length ? h.iss.slice(0, 5).map(i => "• " + i.t) : ["Nenhum ponto de atenção"]), "Clique para abrir a tela do SAC"].join("|");
        const a = (v, cls) => `<span class="${v ? cls : "z"}">`;
        return `<button class="vo-sac ${h.nivel}" data-vo-det="${esc(m.key)}" data-vo-tip="${esc(tip)}">
          <span class="hd"><span class="nm"><b>${esc(m.curto)}</b><small>${esc(m.nome)}</small></span><span class="vo-st ${h.nivel}">${NIVEL[h.nivel]}</span></span>
          <span class="mid">${gauge(h.sla)}<span class="fat"><small>Faturamento</small><b>${brlC(m.fatUn + m.fatPag)}</b><small>${m.qctrc ? int(m.qctrc) + " CTRCs" : "sem receita importada"}</small></span></span>
          <span class="mini">${a(m.oc69, "w")}<b>${int(m.oc69)}</b>Ocor. 69</span>${a(m.atr, m.atr5 ? "r" : "w")}<b>${int(m.atr)}</b>Atrasos${m.atr5 ? `<i>${int(m.atr5)} +5d</i>` : ""}</span>${a(m.pend, "w")}<b>${int(m.pend)}</b>Pendên.</span>${a(m.trocasAt, "r")}<b>${int(m.trocasAt)}</b>Trocas atr.</span></span>
          <span class="why ${h.iss.length ? h.iss[0].n : (h.nivel === "na" ? "" : "ok")}">${h.iss.length ? esc(h.iss[0].t) : (h.sla === null ? "Sem performance importada para medir o SLA" : "Tudo dentro do esperado")}${h.iss.length > 1 ? ` <em>+${h.iss.length - 1}</em>` : ""}</span></button>`; }).join("")}</div></div>`;
  }

  /* ---------------- SEÇÕES ---------------- */
  function secGeral(){
    const L = metricas(), t = totais(), todos = D.lista;
    const sla = t.perf ? t.perf.sla : null;
    const dif = sla === null ? "" : (sla >= META_SLA ? " (+" : " (") + (sla - META_SLA).toFixed(1).replace(".", ",") + " p.p.)";
    const bolV = D.bAt.length, valBolV = D.bAt.reduce((s, b) => s + (Number(b.valor) || 0), 0), nFilm = D.film.rows ? D.film.rows.length : 0, vFilm = D.film.rows ? D.film.rows.reduce((s, r) => s + (r.valorNf || 0), 0) : 0;
    const kpis = `<div class="vo-kpis vo-kpis-8">
      ${kpi(I.money, "Faturamento (frete)", t.fat, t.qctrc ? int(t.qctrc) + " CTRCs" : "importe a Receita", "", "brl")}
      ${kpi(I.target, "SLA geral", sla === null ? "—" : pct(sla), t.perf ? `${int(t.perf.entregue)} entregues · meta ${META_SLA}%${dif}` : "importe a Performance", sla === null ? "warn" : (tone(sla) === "ok" ? "" : tone(sla)))}
      ${kpi(I.alert, "Ocorrência 69", t.oc69, t.oc69 ? brlC(t.frete69) + " em frete" : "nenhuma importada", t.oc69 ? "warn" : "", "int")}
      ${kpi(I.box, "Docs em atraso (150)", t.atr, t.atr ? t.atr5 + " com +5 dias · " + brlC(t.freteAtr) + " em frete" : "nenhum importado", t.atr5 ? "bad" : (t.atr ? "warn" : ""), "int")}
      ${kpi(I.clock, "Pendências abertas", t.pend, "ainda não resolvidas", t.pend ? "warn" : "", "int")}
      ${kpi(I.swap, "Trocas em aberto", t.trocas, t.trocasAt + " atrasada(s)", t.trocasAt ? "bad" : "", "int")}
      ${kpi(I.card, "Boletos vencidos", bolV, bolV ? brlC(valBolV) + " · débito total " + brlC(D.deb) : "nenhum vencido", bolV ? "bad" : "", "int")}
      ${kpi(I.cam, "Filmagens", nFilm, nFilm ? brlC(vFilm) + " em NFs" : "importe a planilha do Breno", "", "int")}
    </div>`;

    const fat = [...todos].filter(m => m.fatUn + m.fatPag > 0).sort((a, b) => (b.fatUn + b.fatPag) - (a.fatUn + a.fatPag)).map(m => ({m, v:m.fatUn + m.fatPag}));
    const oc = [...todos].filter(m => m.oc69 || m.atr).sort((a, b) => (b.atr + b.oc69) - (a.atr + a.oc69)).map(m => ({m, v:m.oc69, v2:m.atr}));

    const linhas = [...todos].sort((a, b) => {
      const g = m => ({fat:m.fatUn + m.fatPag, qctrc:m.qctrc, sla:m.perf ? m.perf.sla : -1, aberto:m.perf ? m.perf.abertoNoPrazo + m.perf.abertoAtrasado : -1, oc69:m.oc69, atr:m.atr, atr5:m.atr5, pend:m.pend, trocasAt:m.trocasAt, sit:RANK[saude(m).nivel] * 100 + saude(m).iss.length, nome:0}[sortCol]);
      return sortCol === "nome" ? sortDir * a.curto.localeCompare(b.curto, "pt-BR", {numeric:true}) : sortDir * ((g(a) || 0) - (g(b) || 0));
    });
    const mx = f => Math.max(...todos.map(f), 1);
    const mFat = mx(m => m.fatUn + m.fatPag), mOc = mx(m => m.oc69), mAt = mx(m => m.atr), mA5 = mx(m => m.atr5), mPe = mx(m => m.pend), mTr = mx(m => m.trocasAt);
    const cel = (v, max, cls, f) => v ? `<td class="heat ${cls}" style="--h:${(v / max).toFixed(2)}">${(f || int)(v)}</td>` : `<td class="dim">–</td>`;
    const th = (col, txt) => `<th data-vo-sort="${col}" class="${sortCol === col ? "sorted" : ""}">${txt}${sortCol === col ? (sortDir < 0 ? " ▾" : " ▴") : ""}</th>`;
    const matriz = `<div class="vo-card"><h3>Matriz por focal <span>clique no cabeçalho para ordenar · clique na linha para abrir a tela do SAC</span></h3>
      <div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_matriz" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_matriz">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_matriz" class="vo-table"><thead><tr>${th("nome", "Focal")}${th("sit", "Situação")}${th("fat", "Faturamento")}${th("qctrc", "CTRCs")}${th("sla", "SLA")}${th("aberto", "Entregas abertas")}${th("oc69", "Ocor. 69")}${th("atr", "Docs atraso")}${th("atr5", "+5 dias")}${th("pend", "Pendências")}${th("trocasAt", "Trocas atras.")}</tr></thead><tbody>
      ${linhas.map(m => { const s = m.perf ? m.perf.sla : null, ab = m.perf ? m.perf.abertoNoPrazo + m.perf.abertoAtrasado : null, h = saude(m);
        return `<tr data-vo-det="${esc(m.key)}" data-vo-tip="${esc(m.key + "|Clique para abrir a tela do SAC")}" class="${m.key === focal ? "sel" : ""}"><td><span class="nm"><b>${esc(m.curto)}</b><small>${esc(m.nome)}</small></span></td>
          <td><span class="vo-st ${h.nivel}">${NIVEL[h.nivel]}</span></td>
          ${cel(m.fatUn + m.fatPag, mFat, "h-g", brlC)}${m.qctrc ? `<td>${int(m.qctrc)}</td>` : `<td class="dim">–</td>`}
          <td>${s === null ? `<span class="dim">–</span>` : `<span class="vo-sla ${tone(s)}">${pct(s)}</span>`}</td>${ab === null ? `<td class="dim">–</td>` : `<td>${int(ab)}</td>`}
          ${cel(m.oc69, mOc, "h-r")}${cel(m.atr, mAt, "h-r")}${cel(m.atr5, mA5, "h-r")}${cel(m.pend, mPe, "h-r")}${cel(m.trocasAt, mTr, "h-r")}</tr>`; }).join("")}
      </tbody><tfoot><tr><td>Total da operação</td><td></td><td>${brlC(todos.reduce((s, m) => s + m.fatUn + m.fatPag, 0))}</td><td>${int(todos.reduce((s, m) => s + m.qctrc, 0))}</td><td>${D.perfGeral ? `<span class="vo-sla ${tone(D.perfGeral.sla)}">${pct(D.perfGeral.sla)}</span>` : "–"}</td>
        <td>${D.perfGeral ? int(D.perfGeral.abertoNoPrazo + D.perfGeral.abertoAtrasado) : "–"}</td><td>${int(todos.reduce((s, m) => s + m.oc69, 0))}</td><td>${int(todos.reduce((s, m) => s + m.atr, 0))}</td><td>${int(todos.reduce((s, m) => s + m.atr5, 0))}</td><td>${int(todos.reduce((s, m) => s + m.pend, 0))}</td><td>${int(todos.reduce((s, m) => s + m.trocasAt, 0))}</td></tr></tfoot></table></div></div>`;

    return resumoOperacao() + kpis + placar() + `<div class="vo-grid vo-g3">
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
      return `<li data-vo-tip="${esc(m.key + "|Do Valle → unidade: " + brlC(m.fatUn) + "|Pagadora → Do Valle: " + brlC(m.fatPag) + "|Total: " + brlC(tot) + "|Clique para abrir a tela do SAC")}" data-vo-det="${esc(m.key)}" class="${m.key === focal ? "sel" : ""}">${nomeFocal(m)}<span class="vo-bt"><u style="height:12px"><i style="width:${w * m.fatUn / (tot || 1)}%"></i><i class="t" style="left:${w * m.fatUn / (tot || 1)}%;width:${w * m.fatPag / (tot || 1)}%;border-radius:0 6px 6px 0"></i></u></span><span class="vo-bv">${brlC(tot)}</span></li>`; }).join("")}</ul>` : `<div class="vo-empty">Importe o Faturamento Geral na aba Fechamento-RECEITA.</div>`;
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

  /* ---- Principais ocorrências dos documentos em atraso (150) ---- */
  const ocNorm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s*([\/\-])\s*/g, "$1").replace(/\s+/g, " ").trim();
  function ocChave(a){
    let cod = String(a.codOcorrencia || "").trim();
    if(/^\d+$/.test(cod)) cod = String(parseInt(cod, 10));
    return cod ? "C:" + cod : "D:" + ocNorm(a.descrOcorrencia);
  }
  function ocGrupos(atrs){
    const mapa = new Map();
    atrs.forEach(a => {
      const k = ocChave(a);
      if(!mapa.has(k)) mapa.set(k, {key:k, cod:k.startsWith("C:") ? k.slice(2) : "", descrs:new Map(), docs:[], frete:0, dias:0, crit:0});
      const g = mapa.get(k), d = num(a.diasAtraso), ds = String(a.descrOcorrencia || "").trim();
      g.docs.push(a); g.frete += num(a.frete); g.dias += d; if(d > 5) g.crit++;
      if(ds) g.descrs.set(ds, (g.descrs.get(ds) || 0) + 1);
    });
    return [...mapa.values()].map(g => { let melhor = "", n = 0; g.descrs.forEach((q, d) => { if(q > n){ melhor = d; n = q; } }); g.descr = melhor || "Sem descrição"; return g; })
      .sort((a, b) => b.docs.length - a.docs.length || b.frete - a.frete);
  }
  let ocAtrExport = null;
  /* Excel organizado dos documentos de UMA ocorrência: cabeçalho com código e
     nome da ocorrência + resumo, e a tabela com as colunas "Cód. ocorrência"
     e "Ocorrência" em toda linha (números como número de verdade). */
  async function baixarOcorrenciaXlsx(){
    if(!ocAtrExport) return;
    if(!window.ExcelJS){ alert("A biblioteca de Excel ainda não carregou. Atualize a página e tente de novo."); return; }
    const {sel} = ocAtrExport, tb = document.getElementById("voT_ocatr");
    // respeita a busca: se alguma linha está escondida, exporta só as visíveis
    let L = ocAtrExport.L;
    if(tb && [...tb.tBodies[0].rows].some(r => r.style.display === "none")){
      const vis = new Set([...tb.tBodies[0].rows].filter(r => r.style.display !== "none").map(r => r.cells[0].innerText.trim()));
      L = L.filter(a => vis.has(String(a.ctrc || "-")));
    }
    const cod = sel.cod || "—", nome = sel.descr || "Sem descrição";
    const frete = L.reduce((t, a) => t + num(a.frete), 0), crit = L.filter(a => num(a.diasAtraso) > 5).length;
    const media = L.length ? Math.round(L.reduce((t, a) => t + num(a.diasAtraso), 0) / L.length) : 0;
    const AZUL = "FF0F1C47", DOURADO = "FFE8C77A", CINZA = "FFF2F4F8", BORDA = {style:"thin", color:{argb:"FFD5DAE5"}};
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(("Ocorrência " + cod).slice(0, 31), {views:[{state:"frozen", ySplit:10, showGridLines:false}]});
    const cols = [["Cód. ocorrência", 15], ["Ocorrência", 40], ["CTRC", 16], ["NF", 14], ["Sistema", 10], ["Focal", 22], ["Unid. entrega", 14], ["Pagador", 34], ["Destinatário", 34], ["Frete (R$)", 14], ["Prev. entrega", 14], ["Dias de atraso", 12]];
    ws.columns = cols.map(([, w]) => ({width:w}));
    const N = cols.length;
    // título
    ws.mergeCells(1, 1, 1, N);
    const t = ws.getCell(1, 1); t.value = "Documentos em atraso por ocorrência"; t.font = {name:"Arial", size:14, bold:true, color:{argb:"FFFFFFFF"}};
    t.fill = {type:"pattern", pattern:"solid", fgColor:{argb:AZUL}}; t.alignment = {vertical:"middle", indent:1}; ws.getRow(1).height = 28;
    // cabeçalho simples: código e nome da ocorrência
    const info = (r, rot, val, fmt) => {
      const a = ws.getCell(r, 1), b = ws.getCell(r, 2); a.value = rot; b.value = val;
      a.font = {name:"Arial", size:10, bold:true, color:{argb:"FF4A5368"}}; a.fill = {type:"pattern", pattern:"solid", fgColor:{argb:CINZA}};
      b.font = {name:"Arial", size:11, bold:true}; b.alignment = {horizontal:"left"}; if(fmt) b.numFmt = fmt;
      [a, b].forEach(c => c.border = {top:BORDA, bottom:BORDA, left:BORDA, right:BORDA});
    };
    info(3, "Código", /^\d+$/.test(cod) ? Number(cod) : cod);
    info(4, "Ocorrência", nome);
    info(5, "Documentos", L.length, "#,##0");
    info(6, "Valor do frete", frete, '"R$" #,##0.00');
    info(7, "Mais de 5 dias", crit, "#,##0");
    info(8, "Atraso médio (dias)", media, "#,##0");
    ws.getCell(9, 1).value = "Gerado em " + new Date().toLocaleString("pt-BR"); ws.getCell(9, 1).font = {name:"Arial", size:9, italic:true, color:{argb:"FF7A8397"}};
    // tabela
    const h = ws.getRow(10); h.height = 24;
    cols.forEach(([n], i) => { const c = h.getCell(i + 1); c.value = n; c.font = {name:"Arial", size:10, bold:true, color:{argb:"FFFFFFFF"}};
      c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:AZUL}}; c.alignment = {vertical:"middle", horizontal:i === 9 || i === 11 ? "right" : "left", wrapText:true}; });
    L.forEach((a, k) => {
      const f = a.focal || SEM_FOCAL, mm = D.M.get(f), d = num(a.diasAtraso);
      const r = ws.addRow([/^\d+$/.test(cod) ? Number(cod) : cod, nome, a.ctrc || "-", a.nf || "-", a.origem || "-", mm ? mm.curto : f, a.unidade || "-", a.pagador || "-", a.destinatario || "-", num(a.frete), a.prevEntrega || "-", d]);
      r.eachCell((c, i) => { c.font = {name:"Arial", size:10}; c.border = {bottom:BORDA};
        if(k % 2) c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFF8F9FC"}};
        c.alignment = {vertical:"middle", horizontal:i === 1 || i === 12 ? "center" : (i === 10 ? "right" : "left")}; });
      r.getCell(10).numFmt = "#,##0.00";
      if(d > 5){ r.getCell(12).font = {name:"Arial", size:10, bold:true, color:{argb:"FFB42318"}}; r.getCell(12).fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFFDE8E6"}}; }
    });
    const ultima = 10 + L.length;
    const tot = ws.addRow(["TOTAL", "", "", "", "", "", "", "", "", frete, "", ""]); tot.getCell(10).numFmt = "#,##0.00";
    tot.eachCell({includeEmpty:true}, c => { c.font = {name:"Arial", size:10, bold:true}; c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFE9EDF5"}}; c.border = {top:{style:"thin", color:{argb:"FF0F1C47"}}}; });
    tot.getCell(10).alignment = {horizontal:"right"};
    ws.autoFilter = {from:{row:10, column:1}, to:{row:Math.max(ultima, 10), column:N}};
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    a.download = "ocorrencia-" + String(cod).replace(/\W/g, "") + "-" + nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) + "-" + todayISO() + ".xlsx";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function ocAtrasoHTML(atrs){
    if(!atrs.length) return `<div class="vo-card"><h3>Principais ocorrências <span>documentos em atraso (150)</span></h3><div class="vo-empty">Nenhum documento em atraso importado.</div></div>`;
    const G = ocGrupos(atrs), TOP = 8, temMais = G.length > TOP, vis = (ocAtrTodas || !temMais) ? G : G.slice(0, TOP);
    const sel = G.find(g => g.key === ocAtr) || null;
    const itens = vis.map(g => ({label:(g.cod || "—") + " · " + g.descr, sub:int(g.crit) + " com +5 dias · " + brlC(g.frete), v:g.docs.length, sel:g.key === ocAtr, attr:`data-vo-ocatr="${esc(g.key)}"`}));
    if(sel && !vis.includes(sel)) itens.push({label:(sel.cod || "—") + " · " + sel.descr, sub:int(sel.crit) + " com +5 dias · " + brlC(sel.frete), v:sel.docs.length, sel:true, attr:`data-vo-ocatr="${esc(sel.key)}"`});
    const card = `<div class="vo-card"><h3>Principais ocorrências <span>documentos em atraso (150) · clique para ver os documentos</span></h3>
      ${barras(itens, {fmt:int, cor:"r", cls:"vo-ocbars", vazio:"Sem ocorrências."})}
      ${temMais ? `<button class="vo-tool vo-ocmais" data-vo-ocmais>${ocAtrTodas ? "Mostrar só as " + TOP + " principais" : "Ver todas (" + G.length + ")"}</button>` : ""}</div>`;
    if(!sel) return card;
    const id = "voT_ocatr", L = [...sel.docs].sort((a, b) => num(b.diasAtraso) - num(a.diasAtraso));
    ocAtrExport = {sel, L};
    const media = Math.round(sel.dias / sel.docs.length), pctTot = Math.round(sel.docs.length / atrs.length * 100);
    const det = `<div class="vo-card vo-ocdet"><h3><span class="vo-ocdet-t">${esc(sel.cod ? sel.cod + " · " : "")}${esc(sel.descr)}</span> <span>${L.length} documento(s) · ${pctTot}% dos atrasos</span><button class="vo-tool vo-ocfechar" data-vo-ocatr="${esc(sel.key)}" title="Fechar detalhes">✕ Fechar</button></h3>
      <div class="vo-ocmini">
        <div><small>Documentos</small><b>${int(L.length)}</b></div>
        <div><small>Valor de frete</small><b>${brl(sel.frete)}</b></div>
        <div class="${sel.crit ? "bad" : ""}"><small>Mais de 5 dias</small><b>${int(sel.crit)}</b></div>
        <div><small>Atraso médio</small><b>${media} dia(s)</b></div>
      </div><div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="${id}" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-ocxlsx>Exportar Excel</button></div>
      <div class="vo-scroll vo-tall"><table id="${id}" class="vo-table vo-sortable"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Focal</th><th>Unid. entrega</th><th class="tx">Pagador</th><th class="tx">Destinatário</th><th>Frete</th><th>Prev. entrega</th><th>Dias</th></tr></thead><tbody>
      ${L.slice(0, 600).map(a => { const f = a.focal || SEM_FOCAL, mm = D.M.get(f), d = num(a.diasAtraso);
        return `<tr><td><b>${esc(a.ctrc || "-")}</b></td><td>${esc(a.nf || "-")}</td><td>${sistemaTag(a.origem)}</td><td><span class="vo-tag ${f === SEM_FOCAL ? "x" : ""}">${esc(mm ? mm.curto : f)}</span></td><td>${esc(a.unidade || "-")}</td><td class="tx">${esc(a.pagador || "-")}</td><td class="tx">${esc(a.destinatario || "-")}</td><td>${brl(num(a.frete))}</td><td>${esc(a.prevEntrega || "-")}</td><td><span class="vo-pill ${d > 5 ? "late" : "soon"}">${d}</span></td></tr>`; }).join("")}
      </tbody></table></div>${L.length > 600 ? `<div class="vo-note">Mostrando os 600 primeiros — use a busca para refinar.</div>` : ""}</div>`;
    return card + det;
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
    const tab = piores.length ? `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_docs" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_docs">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_docs" class="vo-table vo-sortable"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Focal</th><th>Unid. entrega</th><th class="tx">Pagador</th><th>Frete</th><th>Dias de atraso</th></tr></thead><tbody>
      ${piores.map(a => { const f = a.focal || SEM_FOCAL, mm = D.M.get(f), d = num(a.diasAtraso);
        return `<tr><td><b>${esc(a.ctrc || "-")}</b></td><td>${esc(a.nf || "-")}</td><td>${sistemaTag(a.origem)}</td><td><span class="vo-tag ${f === SEM_FOCAL ? "x" : ""}">${esc(mm ? mm.curto : f)}</span></td><td>${esc(a.unidade || "-")}</td><td style="text-align:left;max-width:150px;overflow:hidden;text-overflow:ellipsis">${esc(a.pagador || "-")}</td><td>${brl(num(a.frete))}</td><td><span class="vo-pill ${d > 5 ? "late" : "soon"}">${d} dia(s)</span></td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="vo-empty">Nenhum documento em atraso importado.</div>`;

    return kpis + `<div class="vo-grid vo-g3">
      <div class="vo-card"><h3>Por focal <span class="lg"><span><i style="background:#f4b740"></i>69</span><span><i style="background:#ff5d55"></i>150</span></span></h3>${barras(porFocal, {fmt:int, cor:"a", cor2:"r", l1:"Ocorrência 69", l2:"Docs em atraso (150)", vazio:"Sem ocorrências ou atrasos importados."})}</div>
      <div class="vo-card"><h3>Tempo de atraso <span>documentos (150)</span></h3>${faixasHtml}</div>
      <div class="vo-card"><h3>Ocorrência 69 por motivo</h3>${donut(motivos, "Nenhuma ocorrência 69 importada.", "ocorrências")}</div>
    </div>
    ${ocAtrasoHTML(atrs)}
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
    const prior = itens.length ? `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="voT_prior" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="voT_prior">Exportar CSV</button></div><div class="vo-scroll"><table id="voT_prior" class="vo-table vo-sortable"><thead><tr><th class="tx">Tipo</th><th>Focal</th><th>Filial</th><th>NF</th><th>Situação</th></tr></thead><tbody>
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

  /* ---------------- TELA COMPLETA DO SAC ---------------- */
  const FAIXAS = [["1–2 dias", 1, 2], ["3–5 dias", 3, 5], ["6–10 dias", 6, 10], ["11–20 dias", 11, 20], ["21+ dias", 21, 99999]];
  const SAC_ABAS = [["resumo", "Resumo"], ["unidades", "Unidades"], ["oc69", "Ocorrência 69"], ["atrasos", "Docs em atraso"], ["pendencias", "Pendências"], ["trocas", "Trocas"]];
  const sUn = x => String(x || "").toUpperCase().trim();

  function dadosSac(key){
    const m = D.M.get(key); if(!m) return null;
    const classif = todasSiglasFocais(), perfMap = {};
    if(D.perfData) D.perfData.unidades.forEach(u => { perfMap[u.sigla] = u; });
    const f = FOCAIS.find(x => x.titulo === key);
    const ocs = D.ocs.filter(o => (o.focal || SEM_FOCAL) === key), atrs = D.atrs.filter(a => (a.focal || SEM_FOCAL) === key);
    const pends = D.pends.filter(p => focalDaSigla(p.filial) === key), trocas = D.trocas.filter(t => focalDaSigla(t.filial) === key);
    const siglas = new Set();
    if(f) f.unidades.forEach(u => siglas.add(u.sigla));
    Object.keys(FOCAIS_ESPECIAIS_POR_UNIDADE).forEach(s => { if(FOCAIS_ESPECIAIS_POR_UNIDADE[s] === key) siglas.add(s); });
    if(key === SEM_FOCAL) Object.keys(D.rec).filter(s => !classif.has(s) && !FOCAIS_ESPECIAIS_POR_UNIDADE[s]).forEach(s => siglas.add(s));
    const doc = {}, ini = s => doc[s] || (doc[s] = {oc:0, at:0, a5:0, pend:0});
    ocs.forEach(o => { const s = sUn(o.unidade); if(s){ siglas.add(s); ini(s).oc++; } });
    atrs.forEach(a => { const s = sUn(a.unidade); if(s){ siglas.add(s); const d = ini(s); d.at++; if(num(a.diasAtraso) > 5) d.a5++; } });
    pends.forEach(p => { const s = sUn(p.filial); if(s){ siglas.add(s); ini(s).pend++; } });
    const unidades = [...siglas].map(s => {
      const c = combinaUnidadeReceita(D.rec[s]), p = perfMap[s], d = doc[s] || {oc:0, at:0, a5:0, pend:0};
      return {s, fat:c.frete, qctrc:c.qctrc, sla:p ? p.sla : null, aberto:p ? p.abertoNoPrazo + p.abertoAtrasado : null, oc:d.oc, at:d.at, a5:d.a5, pend:d.pend};
    }).filter(l => l.fat || l.sla !== null || l.oc || l.at || l.pend).sort((a, b) => b.fat - a.fat || b.at - a.at);
    return {key, m, ocs, atrs, pends, trocas, unidades};
  }

  const optSel = (campo, rot, valores, atual) => `<label class="vo-fl"><span>${rot}</span><select class="vo-select" data-vo-sel="${campo}"><option value="">Todos</option>${valores.map(v => `<option value="${esc(v)}" ${String(v) === String(atual) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  const ferramentas = id => `<div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na tabela…" data-vo-search="${id}" aria-label="Buscar na tabela"><button class="vo-tool" data-vo-csv="${id}">Exportar CSV</button></div>`;
  const dash = "<span class='dim'>–</span>";
  const vazioSac = msg => `<div class="vo-empty">${msg}</div>`;

  function sacKpi(rotulo, valor, sub, estado, aba){
    return `<button class="vo-kpi click ${estado || ""}" data-vo-sacsub="${aba}" title="Abrir a aba ${esc(rotulo)}"><span class="top"><em>${rotulo}</em></span><b>${valor}</b><small>${sub || "&nbsp;"}</small></button>`;
  }

  function sacTabResumo(S){
    const m = S.m, atrs = S.atrs, sla = m.perf ? m.perf.sla : null;
    const faixas = FAIXAS.map(([n, a, b], i) => ({label:n, sub:"", v:atrs.filter(x => { const d = num(x.diasAtraso); return d >= a && d <= b; }).length, attr:`data-vo-sacfaixa="${i}"`}));
    const porUn = S.unidades.filter(u => u.at).sort((a, b) => b.at - a.at).slice(0, 8).map(u => ({label:u.s, sub:u.a5 ? u.a5 + " com +5 dias" : "", v:u.at, attr:`data-vo-sacunit="${esc(u.s)}"`}));
    const piores = [...atrs].sort((a, b) => num(b.diasAtraso) - num(a.diasAtraso)).slice(0, 8);
    const pt = piores.length ? `<div class="vo-scroll"><table class="vo-table"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Unid.</th><th>Frete</th><th>Atraso</th></tr></thead><tbody>${piores.map(a => `<tr><td><b>${esc(a.ctrc || "-")}</b></td><td>${esc(a.nf || "-")}</td><td>${sistemaTag(a.origem)}</td><td>${esc(a.unidade || "-")}</td><td>${brl(num(a.frete))}</td><td><span class="vo-pill ${num(a.diasAtraso) > 5 ? "late" : "soon"}">${num(a.diasAtraso)} dia(s)</span></td></tr>`).join("")}</tbody></table></div>` : vazioSac("Nenhum documento em atraso para este SAC.");
    const alertas = [];
    const ruins = S.unidades.filter(u => u.sla !== null && u.sla < 95);
    if(ruins.length) alertas.push(["bad", `${ruins.length} unidade(s) com SLA abaixo de 95%: ${ruins.slice(0, 4).map(u => u.s + " (" + pct(u.sla) + ")").join(", ")}${ruins.length > 4 ? "…" : ""}`, "unidades"]);
    if(m.atr5) alertas.push(["bad", `${m.atr5} documento(s) com mais de 5 dias de atraso`, "atrasos"]);
    if(m.trocasAt) alertas.push(["bad", `${m.trocasAt} troca(s) com prazo vencido`, "trocas"]);
    const velhas = S.pends.filter(p => daysDiff(p.dataSistema, D.hoje) > 15).length;
    if(velhas) alertas.push(["warn", `${velhas} pendência(s) abertas há mais de 15 dias`, "pendencias"]);
    if(m.oc69) alertas.push(["warn", `${m.oc69} documento(s) com ocorrência 69 (${brlC(m.frete69)} em frete)`, "oc69"]);
    if(!m.perf) alertas.push(["warn", "Sem Performance importada para este SAC — SLA indisponível", null]);
    const al = alertas.length ? `<ul class="vo-alerts">${alertas.map(([t, txt, aba]) => `<li class="${t}"><i></i><span>${esc(txt)}</span>${aba ? `<button data-vo-sacsub="${aba}">Ver ›</button>` : ""}</li>`).join("")}</ul>` : `<div class="vo-empty ok">Nenhum ponto de atenção para este SAC.</div>`;
    return `<div class="vo-grid vo-g3">
      <div class="vo-card"><h3>Atraso por faixa <span>clique para listar</span></h3>${atrs.length ? barras(faixas, {fmt:int, cor:"a", sm:true}) : vazioSac("Nenhum documento em atraso.")}</div>
      <div class="vo-card"><h3>Unidades com mais atraso <span>clique para listar</span></h3>${porUn.length ? barras(porUn, {fmt:int, cor:"r", sm:true}) : vazioSac("Nenhum documento em atraso.")}</div>
      <div class="vo-card"><h3>Pontos de atenção</h3>${al}</div></div>
      <div class="vo-card"><h3>Documentos mais atrasados <span>top 8 · lista completa na aba Docs em atraso</span></h3>${pt}</div>`;
  }

  function sacTabUnidades(S){
    const id = "voT_sac_unid", mx = f => Math.max(...S.unidades.map(f), 1), mA = mx(u => u.at), mO = mx(u => u.oc);
    if(!S.unidades.length) return vazioSac("Nenhuma unidade com dados para este SAC.");
    const t = S.unidades.reduce((a, u) => ({fat:a.fat + u.fat, q:a.q + u.qctrc, oc:a.oc + u.oc, at:a.at + u.at, a5:a.a5 + u.a5, pe:a.pe + u.pend}), {fat:0, q:0, oc:0, at:0, a5:0, pe:0});
    return `<div class="vo-card"><h3>Unidades do SAC <span>clique na linha para ver os documentos em atraso da unidade</span></h3>${ferramentas(id)}<div class="vo-scroll"><table id="${id}" class="vo-table vo-sortable"><thead><tr><th>Unidade</th><th>Faturamento</th><th>CTRCs</th><th>SLA</th><th>Entregas abertas</th><th>Ocor. 69</th><th>Docs atraso</th><th>+5 dias</th><th>Pendências</th></tr></thead><tbody>
      ${S.unidades.map(u => `<tr data-vo-sacunit="${esc(u.s)}" style="cursor:pointer" data-vo-tip="${esc(u.s + "|Clique para listar os documentos em atraso")}"><td><b>${esc(u.s)}</b></td><td>${u.fat ? brl(u.fat) : dash}</td><td>${u.qctrc ? int(u.qctrc) : dash}</td><td>${u.sla === null ? dash : `<span class="vo-sla ${tone(u.sla)}">${pct(u.sla)}</span>`}</td><td>${u.aberto === null ? dash : int(u.aberto)}</td>
        ${u.oc ? `<td class="h-r" style="--h:${(u.oc / mO).toFixed(2)}">${u.oc}</td>` : `<td>${dash}</td>`}${u.at ? `<td class="h-r" style="--h:${(u.at / mA).toFixed(2)}">${u.at}</td>` : `<td>${dash}</td>`}<td>${u.a5 ? `<span style="color:var(--red);font-weight:700">${u.a5}</span>` : dash}</td><td>${u.pend || dash}</td></tr>`).join("")}
      </tbody><tfoot><tr><td>Total</td><td>${brl(t.fat)}</td><td>${int(t.q)}</td><td></td><td></td><td>${t.oc}</td><td>${t.at}</td><td>${t.a5}</td><td>${t.pe}</td></tr></tfoot></table></div></div>`;
  }

  function sacTabOc(S){
    const id = "voT_sac_oc", un = [...new Set(S.ocs.map(o => sUn(o.unidade)).filter(Boolean))].sort();
    const L = S.ocs.filter(o => !sac.unidade || sUn(o.unidade) === sac.unidade).sort((a, b) => num(b.valFrete) - num(a.valFrete));
    if(!S.ocs.length) return vazioSac("Nenhuma ocorrência 69 importada para este SAC.");
    return `<div class="vo-card"><h3>Ocorrência 69 <span>${L.length} de ${S.ocs.length} · frete ${brl(L.reduce((s, o) => s + num(o.valFrete), 0))}</span></h3>
      <div class="vo-filtros">${optSel("unidade", "Unidade", un, sac.unidade)}${(sac.unidade) ? `<button class="vo-tool" data-vo-sacreset style="margin-left:0">Limpar filtros</button>` : ""}</div>${ferramentas(id)}
      <div class="vo-scroll vo-tall"><table id="${id}" class="vo-table vo-sortable"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Unid.</th><th class="tx">Pagador</th><th class="tx">Destinatário</th><th>Frete</th><th class="tx">Ocorrência</th><th class="tx">Pendência</th></tr></thead><tbody>
      ${L.slice(0, 600).map(o => `<tr><td><b>${esc(o.ctrc || "-")}</b></td><td>${esc(o.nf || "-")}</td><td>${sistemaTag(o.origem)}</td><td>${esc(o.unidade || "-")}</td><td class="tx">${esc(o.pagador || "-")}</td><td class="tx">${esc(o.destinatario || "-")}</td><td>${brl(num(o.valFrete))}</td><td class="tx">${esc(o.ocorDescricao || o.ultOcor || "-")}</td><td class="tx">${esc(o.pendencia || o.comple || "-")}</td></tr>`).join("")}
      </tbody></table></div>${L.length > 600 ? `<div class="vo-note">Mostrando os 600 primeiros — use os filtros para refinar.</div>` : ""}</div>`;
  }

  function sacTabAtrasos(S){
    const id = "voT_sac_atr", un = [...new Set(S.atrs.map(a => sUn(a.unidade)).filter(Boolean))].sort();
    const sis = [...new Set(S.atrs.map(a => String(a.origem || "").toUpperCase()).filter(Boolean))].sort();
    const fx = sac.faixa === "" ? null : FAIXAS[+sac.faixa];
    const L = S.atrs.filter(a => (!sac.unidade || sUn(a.unidade) === sac.unidade) && (!sac.sistema || String(a.origem || "").toUpperCase() === sac.sistema) && (!fx || (num(a.diasAtraso) >= fx[1] && num(a.diasAtraso) <= fx[2]))).sort((a, b) => num(b.diasAtraso) - num(a.diasAtraso));
    if(!S.atrs.length) return vazioSac("Nenhum documento em atraso (150) para este SAC.");
    const filtrado = sac.unidade || sac.sistema || sac.faixa !== "";
    return `<div class="vo-card"><h3>Documentos em atraso (150) <span>${L.length} de ${S.atrs.length} · frete ${brl(L.reduce((s, a) => s + num(a.frete), 0))} · ${L.filter(a => num(a.diasAtraso) > 5).length} com +5 dias</span></h3>
      <div class="vo-filtros">${optSel("unidade", "Unidade", un, sac.unidade)}${optSel("sistema", "Sistema", sis, sac.sistema)}
        <label class="vo-fl"><span>Tempo de atraso</span><select class="vo-select" data-vo-sel="faixa"><option value="">Todos</option>${FAIXAS.map((f, i) => `<option value="${i}" ${String(i) === String(sac.faixa) ? "selected" : ""}>${f[0]}</option>`).join("")}</select></label>
        ${filtrado ? `<button class="vo-tool" data-vo-sacreset style="margin-left:0">Limpar filtros</button>` : ""}</div>${ferramentas(id)}
      <div class="vo-scroll vo-tall"><table id="${id}" class="vo-table vo-sortable"><thead><tr><th>CTRC</th><th>NF</th><th>Sistema</th><th>Unid. entrega</th><th class="tx">Pagador</th><th class="tx">Destinatário</th><th>Frete</th><th>Prev. entrega</th><th class="tx">Ocorrência</th><th>Dias</th></tr></thead><tbody>
      ${L.slice(0, 600).map(a => { const d = num(a.diasAtraso); return `<tr><td><b>${esc(a.ctrc || "-")}</b></td><td>${esc(a.nf || "-")}</td><td>${sistemaTag(a.origem)}</td><td>${esc(a.unidade || "-")}</td><td class="tx">${esc(a.pagador || "-")}</td><td class="tx">${esc(a.destinatario || "-")}</td><td>${brl(num(a.frete))}</td><td>${esc(a.prevEntrega || "-")}</td><td class="tx">${esc(a.descrOcorrencia || "-")}</td><td><span class="vo-pill ${d > 5 ? "late" : "soon"}">${d}</span></td></tr>`; }).join("")}
      </tbody></table></div>${L.length > 600 ? `<div class="vo-note">Mostrando os 600 primeiros — use os filtros para refinar.</div>` : ""}</div>`;
  }

  function sacTabPend(S){
    const id = "voT_sac_pend", L = [...S.pends].sort((a, b) => String(a.dataSistema).localeCompare(String(b.dataSistema)));
    if(!L.length) return vazioSac("Nenhuma pendência aberta para este SAC.");
    return `<div class="vo-card"><h3>Pendências abertas <span>${L.length} · da mais antiga para a mais recente</span></h3>${ferramentas(id)}<div class="vo-scroll vo-tall"><table id="${id}" class="vo-table vo-sortable"><thead><tr><th>NF</th><th class="tx">Tipo</th><th>Filial</th><th>Data no sistema</th><th>Dias abertos</th><th class="tx">Observações</th></tr></thead><tbody>
      ${L.map(p => { const d = daysDiff(p.dataSistema, D.hoje); return `<tr><td><b>${esc(p.nf || "-")}</b></td><td class="tx">${esc(p.tipo === "Outros" && p.tipoOutro ? p.tipoOutro : (p.tipo || "-"))}</td><td>${esc(p.filial || "-")}</td><td>${fmtDate(p.dataSistema)}</td><td><span class="vo-pill ${d > 15 ? "late" : "soon"}">${d} dia(s)</span></td><td class="tx">${esc(p.observacoes || "-")}</td></tr>`; }).join("")}
      </tbody></table></div></div>`;
  }

  function sacTabTrocas(S){
    const id = "voT_sac_troca", L = [...S.trocas].sort((a, b) => String(a.dataLimite).localeCompare(String(b.dataLimite)));
    if(!L.length) return vazioSac("Nenhuma troca em aberto para este SAC.");
    return `<div class="vo-card"><h3>Trocas em aberto <span>${L.length} · ${S.m.trocasAt} atrasada(s)</span></h3>${ferramentas(id)}<div class="vo-scroll vo-tall"><table id="${id}" class="vo-table vo-sortable"><thead><tr><th>NF</th><th>Filial</th><th>Data de envio</th><th>Prazo limite</th><th>Situação</th></tr></thead><tbody>
      ${L.map(t => { const d = daysDiff(D.hoje, t.dataLimite), late = d < 0, msg = late ? `Atrasada ${-d} dia(s)` : (d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`); return `<tr><td><b>${esc(t.nf || "-")}</b></td><td>${esc(t.filial || "-")}</td><td>${fmtDate(t.dataEnvio)}</td><td>${fmtDate(t.dataLimite)}</td><td><span class="vo-pill ${late ? "late" : "soon"}">${msg}</span></td></tr>`; }).join("")}
      </tbody></table></div></div>`;
  }

  function sacHTML(){
    const S = dadosSac(sacView);
    if(!S) return "";
    const m = S.m, sla = m.perf ? m.perf.sla : null, idx = D.lista.findIndex(x => x.key === sacView);
    const ant = D.lista[(idx - 1 + D.lista.length) % D.lista.length], prox = D.lista[(idx + 1) % D.lista.length];
    const corpo = {resumo:sacTabResumo, unidades:sacTabUnidades, oc69:sacTabOc, atrasos:sacTabAtrasos, pendencias:sacTabPend, trocas:sacTabTrocas}[sac.sub](S);
    const cont = {resumo:"", unidades:S.unidades.length, oc69:S.ocs.length, atrasos:S.atrs.length, pendencias:S.pends.length, trocas:S.trocas.length};
    return `<div class="vo-sach"><button class="vo-tool" data-vo-sacback style="margin-left:0">‹ Voltar à visão geral</button>
        <div class="tt"><h2>${esc(m.curto)}${m.nome ? " — " + esc(m.nome) : ""}</h2><span>Tudo deste SAC em um só lugar · clique nos cartões para abrir cada assunto</span></div>
        <div class="nv"><button class="vo-tool" data-vo-sacnav="${esc(ant.key)}" title="${esc(ant.key)}" style="margin-left:0">‹ ${esc(ant.curto)}</button><button class="vo-tool" data-vo-sacnav="${esc(prox.key)}" title="${esc(prox.key)}" style="margin-left:0">${esc(prox.curto)} ›</button></div></div>
      <div class="vo-kpis">
        ${sacKpi("Faturamento", brlC(m.fatUn + m.fatPag), int(m.qctrc) + " CTRCs", "", "unidades")}
        ${sacKpi("SLA", sla === null ? "—" : pct(sla), m.perf ? int(m.perf.entregue) + " entregues · meta " + META_SLA + "%" : "sem performance", sla === null ? "warn" : (tone(sla) === "ok" ? "" : tone(sla)), "unidades")}
        ${sacKpi("Ocorrência 69", int(m.oc69), m.oc69 ? brlC(m.frete69) + " em frete" : "nenhuma", m.oc69 ? "warn" : "", "oc69")}
        ${sacKpi("Docs em atraso", int(m.atr), m.atr ? m.atr5 + " com +5 dias" : "nenhum", m.atr5 ? "bad" : (m.atr ? "warn" : ""), "atrasos")}
        ${sacKpi("Pendências", int(m.pend), "abertas", m.pend ? "warn" : "", "pendencias")}
        ${sacKpi("Trocas em aberto", int(m.trocas), m.trocasAt + " atrasada(s)", m.trocasAt ? "bad" : "", "trocas")}
      </div>
      <div class="vo-tabs">${SAC_ABAS.map(([id, nome]) => `<button data-vo-sacsub="${id}" class="${sac.sub === id ? "on" : ""}">${nome}${cont[id] !== "" ? `<small>${cont[id]}</small>` : ""}</button>`).join("")}</div>${corpo}`;
  }

  function abrirSac(key, sub, extra){
    if(!D.M.has(key)) return;
    if(sacView !== key) sac = {sub:"resumo", unidade:"", sistema:"", faixa:""};
    sacView = key; focal = key;
    if(sub) sac.sub = sub;
    if(extra) Object.assign(sac, extra);
    if(tipEl) tipEl.style.display = "none";
    atualizar({topo:true});
  }
  function fecharSac(){ sacView = null; focal = "todos"; sac = {sub:"resumo", unidade:"", sistema:"", faixa:""}; atualizar({topo:true}); }

  /* =====================================================================
     FILMAGENS (BRENO) — câmeras x confirmação de entregas.
     Vínculo pela NOTA FISCAL (e só quando pagador e unidade também batem).
     ===================================================================== */
  const SEM_CONF = "(sem conferente)";
  const VINC = {vinculado:["Vinculada", "ok"], divergente:["Divergente", "warn"], sem_nf:["NF não achada", "bad"], sem_indice:["Sem Receita", "warn"]};
  const mesLabel = ym => { const [y, m] = ym.split("-"); return ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][+m - 1] + "/" + y; };
  const CAMPO_FIL = {tipo:r => r.tipo, rota:r => r.rota || "(sem rota)", conf:r => r.conf || SEM_CONF, pagador:r => r.pagador || "(sem pagador)", mes:r => (r.data || "").slice(0, 7) || "(sem data)",
    status:r => r.status === "vinculado" ? "vinculado" : "semv"};

  function filFiltradas(ignora){
    return D.film.rows.filter(r => Object.keys(fil).every(k => k === "agr" || k === "aba" || k === ignora || !fil[k] || CAMPO_FIL[k](r) === fil[k]));
  }
  function filAgrupar(rows, campo){
    const M = new Map();
    rows.forEach(r => {
      const k = CAMPO_FIL[campo](r);
      const g = M.get(k) || M.set(k, {key:k, n:0, valor:0, frete:0, freteAtr:0, frete69:0, vinc:0, nomes:new Set()}).get(k);
      g.n++; g.valor += r.valorNf; g.frete += r.frete; g.freteAtr += r.freteAtr; g.frete69 += r.frete69; if(r.status === "vinculado") g.vinc++;
      if(campo === "conf" && r.confNome) g.nomes.add(r.confNome);
    });
    return [...M.values()].sort((a, b) => b.valor - a.valor);
  }

  function filChips(){
    const todas = D.film.rows, tipos = filAgrupar(todas, "tipo");
    if(!tipos.length) return `<span class="lbl">Ocorrência</span><span class="vo-note" style="margin:0">importe a planilha do Breno</span>`;
    const algum = Object.keys(fil).some(k => k !== "agr" && k !== "aba" && fil[k]);
    return `<span class="lbl">Ocorrência</span><button class="vo-chip ${algum ? "" : "on"}" data-vo-filclear>Todas<small>${todas.length}</small></button>` +
      tipos.map(g => `<button class="vo-chip ${fil.tipo === g.key ? "on" : ""}" data-vo-fil="tipo:${esc(g.key)}" title="${esc(g.key)}">${esc(g.key.length > 22 ? g.key.slice(0, 21) + "…" : g.key)}<small>${g.n}</small></button>`).join("");
  }

  function filKpi(icone, rotulo, valor, sub, estado, fmt, alvo){
    const raw = typeof valor === "number" && fmt;
    const tag = alvo ? "button" : "div";
    return `<${tag} class="vo-kpi ${estado || ""} ${alvo ? "click" : ""}" ${alvo ? `data-vo-fil="${alvo}"` : ""}><span class="top"><em>${rotulo}</em><span class="ic">${icone}</span></span><b ${raw ? `data-vo-count="${valor}" data-vo-fmt="${fmt}"` : ""}>${raw ? FMT[fmt](valor) : valor}</b><small>${sub || "&nbsp;"}</small></${tag}>`;
  }

  function filBarras(grupos, campo, cor, vazio, limite){
    if(!grupos.length) return `<div class="vo-empty">${vazio}</div>`;
    const L = grupos.slice(0, limite || 12), max = Math.max(...L.map(g => g.valor), 1);
    return `<ul class="vo-bars">${L.map(g => {
      const sel = fil[campo] === g.key, nome = campo === "mes" && /^\d/.test(g.key) ? mesLabel(g.key) : g.key;
      const tip = [nome, "Valor das NFs: " + brl(g.valor), g.n + " filmagem(ns)", "Frete: " + brl(g.frete), "Frete em atraso (150): " + brl(g.freteAtr), "Frete ocorrência 69: " + brl(g.frete69), sel ? "Clique para remover o filtro" : "Clique para filtrar a lista"].join("|");
      const sub = campo === "conf" && g.nomes.size ? [...g.nomes].join(" / ") : g.n + (g.n === 1 ? " NF" : " NFs");
      return `<li data-vo-tip="${esc(tip)}" data-vo-fil="${campo}:${esc(g.key)}" class="${sel ? "sel" : ""}"><span class="vo-bl"><b>${esc(nome)}</b><small>${esc(sub)}</small></span><span class="vo-bt"><u><i class="${cor || ""}" style="width:${Math.max(g.valor > 0 ? 2 : 0, g.valor / max * 100)}%"></i></u></span><span class="vo-bv">${brlC(g.valor)}</span></li>`;
    }).join("")}</ul>${grupos.length > L.length ? `<div class="vo-note">Mostrando ${L.length} de ${grupos.length} — use a tabela de resumo para ver todos.</div>` : ""}`;
  }

  function filImportacao(){
    const F = D.film, i = F.info, receitaTxt = i.total ? `${int(i.total)} NFs lidas da Receita (VAL ${int(i.val || 0)} · RVA ${int(i.rva || 0)})` : "nenhuma NF da Receita lida ainda"; const aviso = i.erro ? `<div class="vo-note" style="color:var(--red)">Atenção: ${esc(i.erro)}.</div>` : "";
    const arq = (kind, rot, cls) => `<label class="vo-tool ${cls || ""}" style="margin-left:0;cursor:pointer">${rot}<input type="file" accept="${kind === "xlsx" ? ".xlsx" : ".csv,.txt,.sswweb"}" data-vo-filfile="${kind}" hidden></label>`;
    return `<div class="vo-card vo-imp"><h3>Importação <span>${int(F.rows.length)} filmagens guardadas · ${receitaTxt}</span></h3>
      <div class="vo-impgrid">
        <div><b>1 · Planilha do Breno</b><small>DATA, ROTA, DESTINATARIO, PAGADOR, OCORRENCIA, NFISCAL, VALOR DE NF. Reimportar atualiza (mesma NF/data/pagador) e mantém os outros meses.</small><div class="vo-impbtn">${arq("xlsx", "Importar planilha (.xlsx)")}<button class="vo-tool" data-vo-filzera="film" style="margin-left:0;color:var(--red)" ${F.rows.length ? "" : "disabled"} title="Apaga todas as filmagens (importadas e editadas)">Limpar / redefinir planilha do Breno</button></div></div>
        <div><b>2 · Arquivo da Receita (o mesmo do Fechamento-RECEITA)</b><small>Só lê a nota fiscal de cada CTRC para vincular — não altera o fechamento. Importar o arquivo na aba Fechamento-RECEITA também já atualiza este índice.</small><div class="vo-impbtn">${arq("receita-val", "Receita VAL (.sswweb/.csv)")}${arq("receita-rva", "Receita RVA (.sswweb/.csv)")}<button class="vo-tool" data-vo-filzera="idx" style="margin-left:0;color:var(--red)" ${i.total ? "" : "disabled"} title="Apaga as NFs lidas da Receita (VAL e RVA)">Limpar / redefinir arquivo da Receita</button></div></div>
      </div>${filMsg ? `<div class="vo-note" style="color:var(--txt)">${esc(filMsg)}</div>` : ""}${aviso}</div>`;
  }

  function focarNovaLinha(){
    setTimeout(() => { const tr = root.querySelector(`tr[data-id="${filEdFocus}"]`); if(!tr) return; if(tr.scrollIntoView) tr.scrollIntoView({block:"nearest"}); const i = tr.querySelector('[data-vo-edit$=":rota"]'); if(i) i.focus(); filEdFocus = ""; }, 30);
  }
  async function importarArquivoFil(input){
    const f = input.files[0], kind = input.dataset.voFilfile; if(!f) return;
    try{
      if(kind === "xlsx"){
        const r = await window.FILM.importarXlsx(f);
        filMsg = `Planilha lida: ${r.lidas} filmagens (${r.novas} novas, ${r.atualizadas} atualizadas). Total guardado: ${r.total}.`;
      } else {
        const buf = await f.arrayBuffer(); let text;
        try{ text = new TextDecoder("utf-8", {fatal:true}).decode(buf); }catch(e){ text = new TextDecoder("windows-1252").decode(buf); }
        const r = window.FILM.indexarReceita(text, kind.slice(8));
        filMsg = r.ok ? `Receita ${kind.slice(8).toUpperCase()}: ${int(r.linhas)} notas fiscais indexadas.` : `Não consegui usar esse arquivo da Receita: ${r.motivo}.`;
      }
    }catch(err){ filMsg = "Não foi possível ler o arquivo (" + (err.message || err) + ")."; }
    input.value = ""; recarregar();
  }

  function filDash(){
    const F = D.film;

    const rows = filFiltradas(), t = {n:rows.length, valor:0, frete:0, atr:0, qAtr:0, f69:0, q69:0, vinc:0, div:0, sem:0};
    rows.forEach(r => { t.valor += r.valorNf; t.frete += r.frete; t.atr += r.freteAtr; t.qAtr += r.qAtr ? 1 : 0; t.f69 += r.frete69; t.q69 += r.q69 ? 1 : 0; if(r.status === "vinculado") t.vinc++; else if(r.status === "divergente") t.div++; else t.sem++; });
    const datas = rows.map(r => r.data).filter(Boolean).sort(), semV = t.div + t.sem;
    const kpis = `<div class="vo-kpis">
      ${filKpi(I.cam, "Filmagens", t.n, datas.length ? fmtDate(datas[0]) + " a " + fmtDate(datas[datas.length - 1]) : "", "", "int")}
      ${filKpi(I.money, "Valor total das NFs", t.valor, t.n ? "média " + brlC(t.valor / t.n) + " por NF" : "", "", "brl")}
      ${filKpi(I.truck, "Frete das NFs", t.frete, t.vinc ? (t.valor ? (t.frete / t.valor * 100).toFixed(2).replace(".", ",") + "% do valor das NFs" : "") : "sem NFs vinculadas", "", "brl")}
      ${filKpi(I.clock, "Frete em atraso (150)", t.atr, t.qAtr + " NF(s) em atraso · 69: " + brlC(t.f69), t.qAtr ? "bad" : "", "brl")}
      ${filKpi(I.target, "Vinculadas à Receita", t.vinc, "de " + int(t.n) + (t.n ? " · " + pct(t.vinc / t.n * 100) : ""), t.vinc === t.n && t.n ? "" : "warn", "int", "status:vinculado")}
      ${filKpi(I.alert, "Sem vínculo", semV, t.div + " divergente(s) · " + t.sem + " sem NF/Receita", semV ? "bad" : "", "int", "status:semv")}
    </div>`;

    const opt = (campo, rot, valores, fmt) => `<label class="vo-fl"><span>${rot}</span><select class="vo-select" data-vo-fsel="${campo}"><option value="">Todos</option>${valores.map(v => `<option value="${esc(v)}" ${fil[campo] === v ? "selected" : ""}>${esc(fmt ? fmt(v) : v)}</option>`).join("")}</select></label>`;
    const valoresDe = c => filAgrupar(F.rows, c).map(g => g.key).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const algum = Object.keys(fil).some(k => k !== "agr" && k !== "aba" && fil[k]);
    const filtros = `<div class="vo-filtros">${opt("mes", "Mês", valoresDe("mes").sort().reverse(), v => /^\d/.test(v) ? mesLabel(v) : v)}${opt("rota", "Unidade (rota)", valoresDe("rota"))}${opt("pagador", "Pagador", valoresDe("pagador"))}${opt("conf", "Conferente", valoresDe("conf"))}
      <label class="vo-fl"><span>Vínculo</span><select class="vo-select" data-vo-fsel="status"><option value="">Todos</option><option value="vinculado" ${fil.status === "vinculado" ? "selected" : ""}>Vinculadas</option><option value="semv" ${fil.status === "semv" ? "selected" : ""}>Sem vínculo</option></select></label>
      ${algum ? `<button class="vo-tool" data-vo-filclear style="margin-left:0">Limpar filtros</button>` : ""}</div>`;

    const gTipo = filAgrupar(filFiltradas("tipo"), "tipo"), gRota = filAgrupar(filFiltradas("rota"), "rota"), gConf = filAgrupar(filFiltradas("conf"), "conf"), gPag = filAgrupar(filFiltradas("pagador"), "pagador"), gMes = filAgrupar(filFiltradas("mes"), "mes").sort((a, b) => a.key.localeCompare(b.key));
    const comConf = gConf.some(g => g.key !== SEM_CONF);
    const barrasConf = comConf ? filBarras(gConf, "conf", "a", "") + `<div class="vo-note">O nome do conferente é lido de "(CONF: nome)" no texto da ocorrência. Nomes abreviados do mesmo primeiro nome ficam juntos.</div>` : `<div class="vo-empty">Nenhum conferente identificado nas ocorrências ("(CONF: nome)").</div>`;
    const graficos = `<div class="vo-grid vo-g3">
      <div class="vo-card"><h3>Por ocorrência <span>valor das NFs · clique para filtrar</span></h3>${filBarras(gTipo, "tipo", "r", "Sem dados.")}</div>
      <div class="vo-card"><h3>Por unidade (rota) <span>valor das NFs · clique para filtrar</span></h3>${filBarras(gRota, "rota", "", "Sem dados.", 10)}</div>
      <div class="vo-card"><h3>Por conferente <span>valor das NFs · clique para filtrar</span></h3>${barrasConf}</div>
    </div><div class="vo-grid vo-g2">
      <div class="vo-card"><h3>Por pagador <span>top 10 · clique para filtrar</span></h3>${filBarras(gPag, "pagador", "a", "Sem dados.", 10)}</div>
      <div class="vo-card"><h3>Por mês <span>data da ocorrência</span></h3>${filBarras(gMes, "mes", "", "Sem dados.", 12)}</div>
    </div>`;

    /* resumo (tabela) — agrupado por ... */
    const agr = fil.agr || "tipo", ABAS = [["tipo", "Ocorrência"], ["rota", "Unidade"], ["conf", "Conferente"], ["pagador", "Pagador"]];
    const grupos = filAgrupar(filFiltradas(agr), agr), idR = "voT_film_resumo";
    const somaG = grupos.reduce((a, g) => ({n:a.n + g.n, valor:a.valor + g.valor, frete:a.frete + g.frete, atr:a.atr + g.freteAtr, f69:a.f69 + g.frete69, vinc:a.vinc + g.vinc}), {n:0, valor:0, frete:0, atr:0, f69:0, vinc:0});
    const resumo = `<div class="vo-card"><h3>Resumo <span>valor das NFs, frete e atraso — clique numa linha para filtrar</span></h3>
      <div class="vo-tabs">${ABAS.map(([k, n]) => `<button data-vo-fil="agr:${k}" class="${agr === k ? "on" : ""}">${n}</button>`).join("")}</div>${ferramentas(idR)}
      <div class="vo-scroll"><table id="${idR}" class="vo-table vo-sortable"><thead><tr><th class="tx">${ABAS.find(a => a[0] === agr)[1]}</th><th>Filmagens</th><th>Valor das NFs</th><th>Frete</th><th>Frete em atraso (150)</th><th>Frete ocorr. 69</th><th>Vinculadas</th></tr></thead><tbody>
      ${grupos.map(g => `<tr style="cursor:pointer" data-vo-fil="${agr}:${esc(g.key)}" data-vo-tip="${esc(g.key + "|Clique para filtrar a lista abaixo")}"><td class="tx"><b>${esc(g.key)}</b></td><td>${int(g.n)}</td><td>${brl(g.valor)}</td><td>${g.frete ? brl(g.frete) : dash}</td><td>${g.freteAtr ? brl(g.freteAtr) : dash}</td><td>${g.frete69 ? brl(g.frete69) : dash}</td><td>${g.vinc}/${g.n}</td></tr>`).join("")}
      </tbody><tfoot><tr><td class="tx">Total dos grupos</td><td>${int(somaG.n)}</td><td>${brl(somaG.valor)}</td><td>${brl(somaG.frete)}</td><td>${brl(somaG.atr)}</td><td>${brl(somaG.f69)}</td><td>${somaG.vinc}/${somaG.n}</td></tr></tfoot></table></div></div>`;

    /* lista completa */
    const idL = "voT_film_lista", LIM = 600;
    const lista = `<div class="vo-card"><h3>Filmagens <span>${rows.length} de ${F.rows.length} · NFs ${brl(t.valor)} · frete ${brl(t.frete)}</span></h3>${ferramentas(idL)}
      <div class="vo-scroll vo-tall"><table id="${idL}" class="vo-table vo-sortable"><thead><tr><th>Data</th><th class="tx">Unidade (rota)</th><th class="tx">Destinatário</th><th class="tx">Pagador</th><th class="tx">Ocorrência</th><th class="tx">Conferente</th><th>NF</th><th>Valor da NF</th><th>Frete</th><th>Frete atraso</th><th class="tx">Vínculo</th></tr></thead><tbody>
      ${rows.slice(0, LIM).map(r => { const v = VINC[r.status];
        return `<tr><td>${r.data ? fmtDate(r.data) : dash}</td><td class="tx">${esc(r.rota || "-")}</td><td class="tx">${esc(r.destinatario || "-")}</td><td class="tx">${esc(r.pagador || "-")}</td><td class="tx" title="${esc(r.ocorrencia)}"><span class="vo-tag x">${esc(r.tipo)}</span> ${esc(r.motivo)}</td><td class="tx">${esc(r.confNome || "") || dash}</td><td><b>${esc(r.nf)}</b></td><td>${brl(r.valorNf)}</td><td>${r.frete ? brl(r.frete) : dash}</td><td>${r.freteAtr ? `<span style="color:var(--red);font-weight:700">${brl(r.freteAtr)}</span>` : dash}</td><td class="tx"><span class="vo-sla ${v[1]}" data-vo-tip="${esc(v[0] + "|" + (r.status === "vinculado" ? "Receita " + r.origemRec + " · " + r.pagadorRec + " · unidade " + r.unidadeRec : r.motivo))}">${v[0]}</span></td></tr>`; }).join("")}
      </tbody></table></div>${rows.length > LIM ? `<div class="vo-note">Mostrando as ${LIM} primeiras — use os filtros para refinar.</div>` : ""}</div>`;

    return filtros + kpis + graficos + resumo + lista;
  }

  /* ---------- editor da planilha (corrigir / acrescentar / apagar) ---------- */
  const FILM_norm = v => String(v || "").toLowerCase().trim();
  let filEdOpen = true, filEdFocus = "";
  const filStatusTag = r => { const v = VINC[r.status]; return `<span class="vo-sla ${v[1]}" data-vo-tip="${esc(v[0] + "|" + (r.status === "vinculado" ? "Receita " + r.origemRec + " · " + r.pagadorRec + " · unidade " + r.unidadeRec : r.motivo))}">${v[0]}</span>`; };
  function filEditor(){
    const rows = D.film.rows;
    const inp = (r, campo, valor, extra) => `<input class="vo-ed" ${extra || 'type="text"'} data-vo-edit="${esc(r.id)}:${campo}" value="${esc(valor)}">`;
    return `<div class="vo-card vo-edit"><h3>Editar planilha <span>${int(rows.length)} linhas — corrija, acrescente ou apague; o dashboard atualiza na hora</span></h3>
      <div class="vo-tools"><input class="vo-search" type="search" placeholder="Buscar na planilha…" data-vo-edsearch aria-label="Buscar na planilha"><button class="vo-tool" data-vo-fadd>+ Adicionar linha</button></div>
      <datalist id="voConfList">${window.FILM.conferentes().map(n => `<option value="${esc(n)}">`).join("")}</datalist><div class="vo-scroll vo-tall"><table class="vo-table vo-edtable" id="voT_film_edit"><thead><tr><th class="tx">Data</th><th class="tx">Unidade (rota)</th><th class="tx">Destinatário</th><th class="tx">Pagador</th><th class="tx">Ocorrência (ex.: FALTA - motivo (CONF: nome))</th><th class="tx">Conferente</th><th class="tx">NF</th><th>Valor da NF (R$)</th><th class="tx">Vínculo</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr data-id="${esc(r.id)}" data-q="${esc((r.data + " " + r.rota + " " + r.destinatario + " " + r.pagador + " " + r.ocorrencia + " " + r.nf).toLowerCase())}">
        <td class="tx">${inp(r, "data", r.data, 'type="date"')}</td><td class="tx">${inp(r, "rota", r.rota)}</td><td class="tx">${inp(r, "destinatario", r.destinatario)}</td><td class="tx">${inp(r, "pagador", r.pagador)}</td><td class="tx">${inp(r, "ocorrencia", r.ocorrencia)}</td><td class="tx">${inp(r, "conf", r.confNome || "", 'type="text" list="voConfList" placeholder="(opcional)"')}</td><td class="tx">${inp(r, "nf", r.nf, 'type="text" inputmode="numeric" style="width:96px"')}</td><td>${inp(r, "valorNf", money(r.valorNf), 'type="text" inputmode="decimal" style="text-align:right;width:112px"')}</td><td class="tx" data-vo-edstatus>${filStatusTag(r)}</td><td><button class="vo-tool" data-vo-fdel="${esc(r.id)}" title="Apagar esta linha" style="margin:0">✕</button></td></tr>`).join("") : `<tr><td colspan="10"><div class="vo-empty">Nenhuma linha ainda — importe a planilha do Breno ou clique em “+ Adicionar linha”.</div></td></tr>`}
      </tbody></table></div>
      <div class="vo-note">Cada alteração é salva ao sair do campo. O tipo de ocorrência e o conferente são lidos do texto da ocorrência. Reimportar a planilha do Breno substitui as linhas com a mesma NF + data + pagador (inclusive as editadas).</div></div>`;
  }

  function secFilmagens(){
    const F = D.film, aba = fil.aba === "editar" ? "editar" : "dash";
    const tabs = `<div class="vo-tabs" style="margin-bottom:14px"><button data-vo-fil="aba:dash" class="${aba === "dash" ? "on" : ""}">Dashboard</button><button data-vo-fil="aba:editar" class="${aba === "editar" ? "on" : ""}">Editar planilha<small>${int(F.rows.length)}</small></button></div>`;
    if(aba === "editar") return tabs + filImportacao() + filEditor();
    if(!F.rows.length) return tabs + filImportacao() + `<div class="vo-empty">Importe a planilha do Breno (ou adicione linhas na aba “Editar planilha”) para ver as filmagens por ocorrência, unidade, conferente e pagador.</div>`;
    return tabs + `<div id="voFilDash">${filDash()}</div>`;
  }

  function editarCelula(el){
    const [id, campo] = [el.dataset.voEdit.slice(0, el.dataset.voEdit.indexOf(":")), el.dataset.voEdit.slice(el.dataset.voEdit.indexOf(":") + 1)];
    if(!window.FILM.editar(id, campo, el.value)){ alert("Não consegui salvar a alteração (sem espaço no navegador?)."); return; }
    D.film = window.FILM.dados();
    const r = D.film.rows.find(x => x.id === id), tr = el.closest("tr");
    if(r && tr){
      if(campo === "valorNf") el.value = money(r.valorNf);
      if(campo === "nf") el.value = r.nf;
      if(campo === "rota") el.value = r.rota;
      tr.querySelector("[data-vo-edstatus]").innerHTML = filStatusTag(r);
      tr.dataset.q = (r.data + " " + r.rota + " " + r.destinatario + " " + r.pagador + " " + r.ocorrencia + " " + r.nf).toLowerCase();
    }
    const dash = document.getElementById("voFilDash"); if(dash) dash.innerHTML = filDash();
    const ch = document.getElementById("voFilter"); if(ch) ch.innerHTML = chips();
  }

  if(window.FILM) window.FILM.onChange = () => { if(aberta && D) recarregar(); };

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
    if(secao === "filmagens" && !sacView) return fil.aba === "editar" ? "" : filChips();
    const total = D.lista.length;
    return `<span class="lbl">Focal</span><button class="vo-chip ${focal === "todos" ? "on" : ""}" data-vo-focal="todos">Todos<small>${total}</small></button>` +
      D.lista.map(m => `<button class="vo-chip ${m.key === focal ? "on" : ""}" data-vo-focal="${esc(m.key)}" title="${esc(m.key)}">${esc(m.curto)}<small>${esc(m.nome.split(" ")[0])}</small></button>`).join("");
  }

  function conteudo(){
    if(sacView && D.M.has(sacView)) return sacHTML();
    const s = SECOES.find(x => x.id === secao);
    const f = focal === "todos" ? null : D.lista.find(m => m.key === focal);
    const corpo = {geral:secGeral, faturamento:secFaturamento, expedicao:secExpedicao, ocorrencias:secOcorrencias, pendencias:secPendencias, filmagens:secFilmagens}[secao]();
    return `<div class="vo-sec-title"><h2>${s.titulo}</h2><span>${s.sub}</span>${f ? `<span class="tag">${esc(f.key)}<button data-vo-focal="todos" title="Limpar filtro">✕</button></span>` : ""}</div>${corpo}`;
  }

  function status(){
    const perf = D.perfData && D.perfData.periodo ? D.perfData.periodo : "sem importação";
    const h = atualizadoEm.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    return `<span><b>Visão da Operação v${VERSAO}</b> · atualizado às ${h}</span><span class="opt">Performance: <b>${esc(perf)}</b></span><span class="opt">Ocorr. 69: <b>${int(D.ocs.length)}</b></span><span class="opt">Docs em atraso: <b>${int(D.atrs.length)}</b></span><span class="sp"></span><span class="opt"><kbd>Esc</kbd> volta</span><span id="voClock"></span>`;
  }

  function montar(){
    return `<header class="vo-top">
        <button class="vo-back" data-vo-close title="Voltar ao menu (Esc)">${I.back}<span>Voltar ao menu</span></button>
        <img class="vo-logo" src="logo-dovalle.png" alt="Do Valle">
        <div class="vo-title"><b>VISÃO DA OPERAÇÃO</b><span>Rede Do Valle / Real Vale</span></div>
        <span class="sp"></span>
        <button class="vo-tbtn" data-vo-present id="voPres" title="Modo TV: passa pelas telas sozinho a cada ${PRES_MS / 1000}s e recarrega os dados">${I.play}<span id="voPresLbl">Apresentar</span></button>
        <button class="vo-tbtn" data-vo-full title="Tela cheia">${I.full}<span>Tela cheia</span></button>
        <button class="vo-tbtn" data-vo-refresh title="Recarregar os dados do painel">${I.refresh}<span>Atualizar</span></button>
        <button class="vo-tbtn" data-vo-theme title="Alternar tema claro / escuro">${I.moon}<span id="voThemeLbl">${claro ? "Tema escuro" : "Tema claro"}</span></button>
        <i class="vo-prog" id="voProg"></i>
      </header>
      <nav class="vo-rail">${SECOES.map(s => `<button data-vo-sec="${s.id}" class="${s.id === secao ? "on" : ""}" title="${s.titulo}">${s.icon}<span>${s.label}</span></button>`).join("")}<span class="sp"></span>
        <button data-vo-close title="Voltar ao menu">${I.back}<span>Menu</span></button></nav>
      <div class="vo-body"><div class="vo-filter" id="voFilter">${chips()}</div><main class="vo-main" id="voMain">${conteudo()}</main></div>
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
    if(tipEl) tipEl.style.display = "none";
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
    try{ LS.setItem("painel_vo_tema", claro ? "claro" : "escuro"); }catch(e){}
  }

  function recarregar(btn){
    D = coletar(); atualizadoEm = new Date();
    if(focal !== "todos" && !D.lista.some(m => m.key === focal)) focal = "todos";
    document.getElementById("voStatus").innerHTML = status(); tick(); atualizar();
    if(sacView && !D.M.has(sacView)) sacView = null;
    if(btn){ btn.classList.add("spin"); setTimeout(() => btn.classList.remove("spin"), 750); }
  }

  function clique(e){
    const alvo = e.target.closest("[data-vo-close],[data-vo-open],[data-vo-alertas],[data-vo-present],[data-vo-full],[data-vo-sec],[data-vo-focal],[data-vo-sort],[data-vo-det],[data-vo-go],[data-vo-refresh],[data-vo-theme],[data-vo-csv],[data-vo-sacsub],[data-vo-sacunit],[data-vo-sacfaixa],[data-vo-sacback],[data-vo-sacnav],[data-vo-sacreset],[data-vo-ocatr],[data-vo-ocxlsx],[data-vo-ocmais],[data-vo-fil],[data-vo-filclear],[data-vo-filzera],[data-vo-fadd],[data-vo-fdel],.vo-sortable th");
    if(!alvo) return;
    if(alvo.matches(".vo-sortable th")) return ordenarTabela(alvo);
    if(alvo.hasAttribute("data-vo-present")) return alternarApresentacao();
    if(alvo.hasAttribute("data-vo-full")) return telaCheia();
    if(alvo.hasAttribute("data-vo-alertas")){ alertasTodos = !alertasTodos; return atualizar({animar:false}); }
    if(alvo.dataset.voOpen){ const i = alvo.dataset.voOpen.lastIndexOf("|"); return abrirSac(alvo.dataset.voOpen.slice(0, i), alvo.dataset.voOpen.slice(i + 1)); }
    if(alvo.hasAttribute("data-vo-fadd")){ filEdFocus = window.FILM.adicionar().id; filEdOpen = true; recarregar(); return focarNovaLinha(); }
    if(alvo.dataset.voFdel !== undefined){ window.FILM.remover(alvo.dataset.voFdel); return recarregar(); }
    if(alvo.hasAttribute("data-vo-filclear")){ fil = {tipo:"", rota:"", conf:"", pagador:"", mes:"", status:"", agr:fil.agr, aba:fil.aba}; return atualizar({animar:false}); }
    if(alvo.hasAttribute("data-vo-filzera")){
      const q = alvo.dataset.voFilzera, txt = {film:"Apagar todas as filmagens importadas/editadas do Breno?", idx:"Apagar o índice de NFs lido da Receita? (você precisará importar o arquivo da Receita de novo para vincular)", tudo:"Limpar tudo: apagar as filmagens do Breno E as NFs lidas da Receita?"}[q];
      if(txt && confirm(txt + "\n\nO Fechamento-RECEITA não é afetado.")){
        if(q !== "idx") window.FILM.limpar();
        if(q !== "film") window.FILM.limparIndice();
        filMsg = {film:"Filmagens apagadas.", idx:"Índice de NFs da Receita apagado.", tudo:"Tudo redefinido: filmagens e índice da Receita apagados."}[q];
        fil = {tipo:"", rota:"", conf:"", pagador:"", mes:"", status:"", agr:fil.agr, aba:fil.aba};
        recarregar();
      }
      return;
    }
    if(alvo.dataset.voFil !== undefined){ const i = alvo.dataset.voFil.indexOf(":"), k = alvo.dataset.voFil.slice(0, i), v = alvo.dataset.voFil.slice(i + 1); fil[k] = (k === "agr" || k === "aba") ? v : (fil[k] === v ? "" : v); return atualizar({animar:false}); }
    if(alvo.hasAttribute("data-vo-csv")) return baixarCsv(alvo.dataset.voCsv);
    if(alvo.hasAttribute("data-vo-refresh")) return recarregar(alvo);
    if(alvo.hasAttribute("data-vo-theme")){ claro = !claro; return aplicarTema(); }
    if(alvo.hasAttribute("data-vo-ocxlsx")) return baixarOcorrenciaXlsx();
    if(alvo.hasAttribute("data-vo-ocmais")){ ocAtrTodas = !ocAtrTodas; return atualizar({animar:false}); }
    if(alvo.dataset.voOcatr !== undefined){
      ocAtr = (ocAtr === alvo.dataset.voOcatr) ? "" : alvo.dataset.voOcatr;
      atualizar({animar:false});
      const det = root.querySelector(".vo-ocdet"); if(det) det.scrollIntoView({behavior:"smooth", block:"nearest"});
      return;
    }
    if(alvo.hasAttribute("data-vo-sacback")) return fecharSac();
    if(alvo.hasAttribute("data-vo-sacreset")){ sac.unidade = ""; sac.sistema = ""; sac.faixa = ""; return atualizar({animar:false}); }
    if(alvo.dataset.voSacnav) return abrirSac(alvo.dataset.voSacnav, sac.sub);
    if(alvo.dataset.voSacsub){ sac.sub = alvo.dataset.voSacsub; return atualizar({topo:true, animar:false}); }
    if(alvo.dataset.voSacunit !== undefined){ sac.sub = "atrasos"; sac.unidade = alvo.dataset.voSacunit; sac.sistema = ""; sac.faixa = ""; return atualizar({topo:true, animar:false}); }
    if(alvo.dataset.voSacfaixa !== undefined){ sac.sub = "atrasos"; sac.faixa = alvo.dataset.voSacfaixa; sac.unidade = ""; sac.sistema = ""; return atualizar({topo:true, animar:false}); }
    if(alvo.dataset.voFocal !== undefined){
      const k = alvo.dataset.voFocal;
      if(k === "todos") return fecharSac();
      return abrirSac(k);
    }
    if(alvo.hasAttribute("data-vo-close")) return fechar();
    if(alvo.dataset.voDet) return abrirSac(alvo.dataset.voDet);
    if(alvo.dataset.voGo){ secao = alvo.dataset.voGo; sacView = null; return atualizar({topo:true}); }
    if(alvo.dataset.voSec){ secao = alvo.dataset.voSec; sacView = null; return atualizar({topo:true}); }
    if(alvo.dataset.voSort){
      const c = alvo.dataset.voSort;
      if(sortCol === c) sortDir = -sortDir; else { sortCol = c; sortDir = c === "nome" ? 1 : -1; }
      return atualizar({animar:false});
    }
  }

  /* ---------------- modo apresentação (TV) e tela cheia ---------------- */
  function marcarProgresso(){
    const el = document.getElementById("voProg"); if(!el) return;
    el.style.animation = "none"; void el.offsetWidth;
    el.style.animation = pres ? `voProg ${PRES_MS}ms linear forwards` : "none";
  }
  function rotuloApresentacao(){
    const b = document.getElementById("voPres"), l = document.getElementById("voPresLbl"); if(!b || !l) return;
    l.textContent = pres ? "Parar apresentação" : "Apresentar"; b.innerHTML = (pres ? I.stop : I.play) + `<span id="voPresLbl">${pres ? "Parar apresentação" : "Apresentar"}</span>`;
    b.classList.toggle("live", !!pres);
  }
  function passoApresentacao(){
    secao = SEQ_PRES[(SEQ_PRES.indexOf(secao) + 1) % SEQ_PRES.length]; sacView = null; focal = "todos";
    recarregar(); const m = document.getElementById("voMain"); if(m) m.scrollTop = 0;
    marcarProgresso();
  }
  function alternarApresentacao(){
    if(pres){ clearInterval(pres); pres = null; }
    else { if(!SEQ_PRES.includes(secao)){ secao = "geral"; atualizar({topo:true}); } sacView = null; pres = setInterval(passoApresentacao, PRES_MS); }
    rotuloApresentacao(); marcarProgresso();
  }
  function pararApresentacao(){ if(pres){ clearInterval(pres); pres = null; } rotuloApresentacao(); marcarProgresso(); }
  function telaCheia(){
    try{
      if(document.fullscreenElement) document.exitFullscreen();
      else if(root.requestFullscreen) root.requestFullscreen();
    }catch(e){}
  }

  function aoTeclar(e){
    if(!aberta || e.key !== "Escape") return;
    e.preventDefault();
    if(sacView) fecharSac(); else fechar();
  }

  function abrir(){
    if(aberta) return;
    D = coletar(); atualizadoEm = new Date();
    if(focal !== "todos" && !D.lista.some(m => m.key === focal)) focal = "todos";
    if(!root){
      try{ claro = LS.getItem("painel_vo_tema") === "claro"; }catch(e){}
      root = document.createElement("div"); root.className = "vo"; root.id = "voRoot"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Visão da Operação");
      tipEl = document.createElement("div"); tipEl.className = "vo-tip"; root.appendChild(tipEl);
      root.addEventListener("click", clique);
      root.addEventListener("mousemove", mostrarTip); root.addEventListener("mouseleave", () => { tipEl.style.display = "none"; });
      root.addEventListener("input", e => {
        if(e.target.dataset && e.target.dataset.voEdsearch !== undefined){ const q = FILM_norm(e.target.value); root.querySelectorAll("#voT_film_edit tbody tr[data-q]").forEach(tr => { tr.style.display = !q || tr.dataset.q.indexOf(q) !== -1 ? "" : "none"; }); return; } if(e.target.dataset && e.target.dataset.voSearch) filtrarTabela(e.target.dataset.voSearch, e.target.value); });
      root.addEventListener("toggle", e => { if(e.target.hasAttribute && e.target.hasAttribute("data-vo-edtoggle")) filEdOpen = e.target.open; }, true);
      root.addEventListener("change", e => {
        if(e.target.dataset && e.target.dataset.voEdit) return editarCelula(e.target);
        if(e.target.dataset && e.target.dataset.voFsel !== undefined){ fil[e.target.dataset.voFsel] = e.target.value; return atualizar({animar:false}); }
        if(e.target.dataset && e.target.dataset.voFilfile){ return importarArquivoFil(e.target); } const s = e.target.dataset && e.target.dataset.voSel; if(s){ sac[s] = e.target.value; atualizar({animar:false}); } });
      document.body.appendChild(root); document.addEventListener("keydown", aoTeclar);
    }
    root.innerHTML = montar(); root.appendChild(tipEl); sacView = null; focal = "todos";
    aplicarTema();
    root.classList.add("on"); document.body.classList.add("vo-open"); aberta = true;
    animarNumeros(); tick(); timer = setInterval(tick, 1000);
    const b = root.querySelector(".vo-back"); if(b) b.focus({preventScroll:true});
  }

  function fechar(){
    if(!aberta) return;
    sacView = null; tipEl.style.display = "none"; pararApresentacao();
    try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
    root.classList.remove("on"); document.body.classList.remove("vo-open"); aberta = false;
    clearInterval(timer); timer = null;
  }

  /* dados resumidos por focal, para o Dashboard Principal (só leitura) */
  window.VO_DADOS = function(){
    const antes = D; D = coletar();
    try{
      return {hoje:D.hoje, perfGeral:D.perfGeral, nOc69:D.ocs.length, lista:D.lista.map(m => { const h = saude(m);
        return {key:m.key, curto:m.curto, nome:m.nome, fat:m.fatUn + m.fatPag, fatUn:m.fatUn, fatPag:m.fatPag, qctrc:m.qctrc, merc:m.merc, perf:m.perf, sla:h.sla,
          oc69:m.oc69, frete69:m.frete69, atr:m.atr, atr5:m.atr5, freteAtr:m.freteAtr, pend:m.pend, trocas:m.trocas, trocasAt:m.trocasAt, nivel:h.nivel, iss:h.iss.map(i => i.t)}; })};
    } finally { D = antes; }
  };
  window.abrirVisaoOperacao = function(key, sub){ abrir(); if(typeof key === "string" && D && D.M.has(key)) abrirSac(key, typeof sub === "string" ? sub : undefined); };
  window.fecharVisaoOperacao = fechar;
  window.VISAO_OPERACAO_ICON = I.grid;
})();
