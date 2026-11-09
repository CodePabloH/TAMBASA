/* ===================== ABA "DASHBOARD REDE" (Dashboard de Performance) =====================
   Painel no estilo do relatório de performance (faixa de KPIs + Previstos Atrasados + Previstos No Prazo + gráficos por
   unidade destino / tipo de ocorrência), usando os MESMOS cartões do "Dashboard Rede" (.dr-card).

   Usa a mesma base e o mesmo cálculo da Performance Teste (window.PTDados.calcular): nada é recalculado por outra regra.
     CT-e ................ todos os documentos com previsão na competência
     Entregue ............ baixados (01 / 69 / 46 em GNA)  ·  no prazo / fora do prazo (cliente × transportadora × a definir)
     Previsto ............ ainda NÃO baixados = Previstos Fora do Prazo (atrasados) + Previstos No Prazo
     % SLA ............... entregues no prazo ÷ (entregues − atraso do cliente)  (mesma conta do SSW)
   Previstos atrasados por faixa de dias de atraso (hoje − previsão) · previstos no prazo por dia (Hoje, D+1 … Acima 5 dias).

   FUNCIONALIDADE (como no relatório de referência):
   - Filtros: Competência (mês da previsão), Sistema (origem), Destino (unidade), Pagador, Remetente · "Limpar filtros".
   - Clicar numa faixa (cartão) filtra os gráficos daquela seção; clicar numa barra de unidade filtra o painel inteiro.
   - Lupa em cada cartão abre a lista de documentos (pesquisa + CSV).
   - Gráficos com abas "Unidade Destino" / "Tipo Ocorrência".
   Estado da tela em localStorage "valle_perf_dash_ui_v1". */
(function(){
  "use strict";

  const KUI = "valle_perf_dash_ui_v1";
  const KIMPS = "valle_perf_teste_imports_v1";
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const SIS = { "": "Todos", VAL: "Do Valle", RVA: "Real Vale" };
  const LIM_LISTA = 500;
  const META = 98;

  const ST = { fonte: "teste", mes: null, sis: "", un: [], pag: [], rem: [], selUn: "", faixaAt: "", faixaNo: "", abaAt: "un", abaNo: "un", abre: {}, q: {} };
  try{
    const u = JSON.parse(LS.getItem(KUI) || "null");
    if(u){
      if(typeof u.mes === "string") ST.mes = u.mes;
      if(u.sis in SIS) ST.sis = u.sis;
      if(u.fonte === "geral" || u.fonte === "teste") ST.fonte = u.fonte;
      ["un", "pag", "rem"].forEach(k => { if(Array.isArray(u[k])) ST[k] = u[k]; });
      if(u.abaAt === "oc") ST.abaAt = "oc";
      if(u.abaNo === "oc") ST.abaNo = "oc";
    }
  }catch(e){}
  const salvar = () => { try{ LS.setItem(KUI, JSON.stringify({ fonte: ST.fonte, mes: ST.mes, sis: ST.sis, un: ST.un, pag: ST.pag, rem: ST.rem, abaAt: ST.abaAt, abaNo: ST.abaNo })); }catch(e){} };

  /* ---------- utilidades ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fInt = n => Math.round(n || 0).toLocaleString("pt-BR");
  const fPct = v => (v === null || v === undefined) ? "-" : v.toFixed(2).replace(".", ",") + "%";
  const semAc = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const br = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—";
  const rotMes = m => { if(!m) return "Todos os meses"; const p = m.split("-"); return MESES[+p[1] - 1] + "/" + p[0]; };
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const diasEntre = (aISO, bISO) => Math.round((Date.UTC(+bISO.slice(0, 4), +bISO.slice(5, 7) - 1, +bISO.slice(8, 10)) - Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10))) / 864e5);
  const kpiCls = v => (v === null || v === undefined) ? "warn" : v >= 98 ? "ok" : v >= 95 ? "warn" : "alert";
  const raiz = () => document.getElementById("perfDashWrap");

  const ICO = {
    lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
    caminhao: '<svg viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h24v17H3z"/><path d="M27 12h10l7 7v4H27z"/><circle cx="13" cy="25" r="3.4" fill="currentColor"/><circle cx="37" cy="25" r="3.4" fill="currentColor"/></svg>',
    limpar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>'
  };

  // faixas (dias de atraso = hoje − previsão; dias para vencer = previsão − hoje)
  const FX_AT = [
    { id: "a3",   rot: "Até 03 dias",    sub: "1 a 3 dias",   min: 1,  max: 3,        cor: "#e0a800" },
    { id: "a5",   rot: "Até 05 dias",    sub: "4 a 5 dias",   min: 4,  max: 5,        cor: "#e07a22" },
    { id: "a8",   rot: "Até 08 dias",    sub: "6 a 8 dias",   min: 6,  max: 8,        cor: "#d4404a" },
    { id: "a15",  rot: "Até 15 dias",    sub: "9 a 15 dias",  min: 9,  max: 15,       cor: "#a8162a" },
    { id: "a30",  rot: "Até 30 dias",    sub: "16 a 30 dias", min: 16, max: 30,       cor: "#7d0f1f" },
    { id: "a30p", rot: "Acima 30 dias",  sub: "31 dias ou +", min: 31, max: Infinity, cor: "#161616" }
  ];
  const FX_NO = [
    { id: "n0", rot: "Hoje",          sub: "vence hoje",    min: 0, max: 0,        cor: "#128038" },
    { id: "n1", rot: "D + 1",         sub: "amanhã",        min: 1, max: 1,        cor: "#17893d" },
    { id: "n2", rot: "D + 2",         sub: "em 2 dias",     min: 2, max: 2,        cor: "#1d9344" },
    { id: "n3", rot: "D + 3",         sub: "em 3 dias",     min: 3, max: 3,        cor: "#239d4b" },
    { id: "n4", rot: "D + 4",         sub: "em 4 dias",     min: 4, max: 4,        cor: "#2aa752" },
    { id: "n5", rot: "Acima 5 dias",  sub: "5 dias ou +",   min: 5, max: Infinity, cor: "#31b159" }
  ];
  const COR = { ct: "#5f6b76", ent: "#1f6fc5", entno: "#2f8a2a", entfora: "#c8372f", prev: "#1d4a86", atrasados: "#c8372f", noprazo: "#1e9a49" };

  /* ---------- dados ---------- */
  // FONTE "GERAL": relatório 084 importado na aba Performance Geral (VAL e/ou RVA), já somado por unidade.
  // Não tem mês, pagador, remetente, faixas de dias nem lista de documentos: valem Sistema e Destino (unidade).
  function dadosGeral(){
    const ld = k => { try{ return typeof load === "function" && typeof KEYS !== "undefined" ? load(KEYS[k]) : null; }catch(e){ return null; } };
    const vd = ld("performanceGeralVal"), rd = ld("performanceGeralRva");
    const tem = x => !!(x && Array.isArray(x.unidades) && x.unidades.length);
    const useV = tem(vd) && ST.sis !== "RVA", useR = tem(rd) && ST.sis !== "VAL";
    const mg = (useV || useR) && typeof mesclarPerformanceGeral === "function" ? mesclarPerformanceGeral(useV ? vd : null, useR ? rd : null) : { unidades: [], periodo: "" };
    const sg = u => String(u.sigla || "").toUpperCase().trim();
    const listaUn = mg.unidades.map(u => ({ chave: sg(u), nome: sg(u), n: u.exped || 0 })).filter(a => a.chave).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if(ST.selUn && !listaUn.some(a => a.chave === ST.selUn)) ST.selUn = "";
    const sUn = new Set(ST.un);
    const base = mg.unidades.filter(u => !sUn.size || sUn.has(sg(u)));
    const us = base.filter(u => !ST.selUn || sg(u) === ST.selUn);
    const z = { exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, atrasPend: 0, abertoAtrasado: 0, abertoNoPrazo: 0 };
    us.forEach(u => Object.keys(z).forEach(k => { z[k] += u[k] || 0; }));
    const c = typeof calcularCamposPerformance === "function" ? calcularCamposPerformance(Object.assign({}, z)) : z;
    z.foraDoPrazo = z.atrasCli + z.atrasTrans + z.atrasPend;
    z.sla = c.perf === undefined ? null : c.perf;
    const linhas = campo => base.map(u => [sg(u), u[campo] || 0]).filter(l => l[0] && l[1] > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    return { estado: "ok", geral: true, temRel: useV || useR, periodo: mg.periodo || "", res: { totais: z }, todos: [], todosAll: [], listaUn, listaPag: [], listaRem: [], hoje: hojeISO(), meses: [],
      linAt: linhas("abertoAtrasado"), linNo: linhas("abertoNoPrazo") };
  }

  function dados(){
    if(ST.fonte === "geral") return dadosGeral();
    const D = window.PTDados;
    if(!D || !D.pronto()) return { estado: "carregando" };
    if(!D.temBase()) return { estado: "vazio" };
    const meses = D.meses();
    if(ST.mes === null || (ST.mes !== "" && meses.indexOf(ST.mes) === -1)) ST.mes = D.mesPadrao();

    // listas dos filtros (competência + sistema escolhidos)
    const regs = D.registros().filter(r => (!ST.sis || r.s === ST.sis) && (!ST.mes || r.p.slice(0, 7) === ST.mes));
    const cont = (fn) => { const m = new Map(); regs.forEach(r => { const k = fn(r); if(k === "" || k == null) return; m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const listaUn = Array.from(cont(r => r.u)).map(([k, n]) => ({ chave: k, nome: k, n })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const listaRem = Array.from(cont(r => r.r || "")).map(([k, n]) => ({ chave: k, nome: k, n })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const listaPag = D.pagadores(ST.mes, ST.sis).map(a => ({ chave: a.chave, nome: a.nome, n: a.docs })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    // limpa marcas que não existem mais
    const ok = (arr, lista) => arr.filter(k => lista.some(a => a.chave === k));
    ST.un = ok(ST.un, listaUn); ST.rem = ok(ST.rem, listaRem); ST.pag = ok(ST.pag, listaPag);
    if(ST.selUn && !listaUn.some(a => a.chave === ST.selUn)) ST.selUn = "";

    const sUn = new Set(ST.un), sPag = new Set(ST.pag), sRem = new Set(ST.rem);
    const filtroBase = r => (!sUn.size || sUn.has(r.u)) && (!sPag.size || sPag.has(D.pagChave(r))) && (!sRem.size || sRem.has(r.r || ""));
    const calc = (extra) => D.calcular({ mes: ST.mes, sistema: ST.sis, filtroReg: r => filtroBase(r) && (!extra || extra(r)) });
    const res = calc(ST.selUn ? (r => r.u === ST.selUn) : null);       // cartões: com a unidade clicada
    const resAll = ST.selUn ? calc(null) : res;                          // gráfico por unidade: todas as unidades (a clicada fica destacada)

    const hoje = hojeISO();
    const mapa = d => {
      const r = d.r;
      if(d.situacao === "Aberto atrasado") return Object.assign({}, d, { dias: Math.max(1, diasEntre(r.p, hoje)) });
      if(d.situacao === "Aberto no prazo") return Object.assign({}, d, { dias: Math.max(0, diasEntre(hoje, r.p)) });
      return Object.assign({}, d, { dias: (r.d !== null && r.d !== undefined && r.d > 0) ? r.d : (r.e && r.p && r.e > r.p ? diasEntre(r.p, r.e) : "") });
    };
    const lista = x => x.detalhe.map(mapa);
    return { estado: "ok", D, meses, res, resAll, todos: lista(res), todosAll: lista(resAll), listaUn, listaPag, listaRem, hoje };
  }
  const ehAt = d => d.situacao === "Aberto atrasado";
  const ehNo = d => d.situacao === "Aberto no prazo";
  const ehFora = d => /^Atraso/.test(d.situacao);
  const ehEnt = d => d.situacao === "Entregue no prazo" || ehFora(d);
  const naFaixa = (d, f) => d.dias >= f.min && d.dias <= f.max;

  /* ---------- componentes ---------- */
  function cartao(key, rotulo, valor, sub, cor, opt){
    opt = opt || {};
    return `<div class="dr-card pd-card ${opt.cls || ""}" style="--c:${cor}" ${opt.sel === undefined ? "" : `data-faixa="${opt.faixa}" role="button" tabindex="0" aria-pressed="${opt.sel ? "true" : "false"}"`}>
      <div class="dr-card-top"><span>${esc(rotulo)}</span>
        ${opt.semLupa ? "" : `<button type="button" class="dr-lupa" data-lupa="${key}" title="Ver os documentos" aria-label="Ver os documentos: ${esc(rotulo)}">${ICO.lupa}</button>`}</div>
      <div class="dr-card-val">${fInt(valor)}</div>
      <div class="dr-card-sub">${sub || ""}</div>
    </div>`;
  }

  function multiHTML(kind, rotulo, lista, sel, todos, off){
    if(off) return `<div class="pd-f"><span class="pd-f-lbl">${rotulo}</span><div class="pd-multi-off" title="${esc(off)}">${todos}</div></div>`;
    const n = sel.length, q = ST.q[kind] || "";
    const un = n === 1 ? (lista.find(a => a.chave === sel[0]) || {}).nome : "";
    return `<div class="pd-f"><span class="pd-f-lbl">${rotulo}</span>
      <details class="pd-multi" data-kind="${kind}" ${ST.abre[kind] ? "open" : ""}>
        <summary>${n ? (n === 1 ? esc(un || sel[0]) : n + " marcados") : todos}</summary>
        <div class="pd-multi-box">
          <input type="search" class="small-input pd-mq" placeholder="Pesquisar… (use ; para vários)" value="${esc(q)}" autocomplete="off">
          <div class="pd-multi-acoes"><button type="button" class="link-btn" data-mvis>Marcar os que aparecem</button><button type="button" class="link-btn" data-mnada>Limpar</button></div>
          <div class="pd-mlista">${lista.map(a => `<label data-n="${esc(semAc(a.nome + " " + a.chave))}"><input type="checkbox" value="${esc(a.chave)}" ${sel.indexOf(a.chave) > -1 ? "checked" : ""}> <span>${esc(a.nome)}</span>${a.n ? ` <small>${fInt(a.n)}</small>` : ""}</label>`).join("") || `<div class="empty">Nada para filtrar.</div>`}</div>
        </div>
      </details></div>`;
  }

  // gráfico de barras (rolagem horizontal) · tipo "un" (unidade destino) ou "oc" (tipo de ocorrência)
  function graficoHTML(docs, aba, cor, rotuloVazio, destaque, pre){
    const m = new Map(pre || []);
    (pre ? [] : docs).forEach(d => {
      const k = aba === "un" ? d.r.u : (d.r.c || "—");
      m.set(k, (m.get(k) || 0) + 1);
    });
    const linhas = Array.from(m).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true }));
    if(!linhas.length) return `<div class="empty pd-vazio">${rotuloVazio}</div>`;
    const max = Math.max(1, ...linhas.map(l => l[1]));
    const OC = window.OcorCulpa;
    return `<div class="pd-chart"><div class="pd-chart-in">${linhas.map(([k, n]) => {
      const alt = Math.max(3, Math.round(n / max * 100));
      let tip = k + ": " + fInt(n);
      if(aba === "oc" && OC && OC.info && k !== "—"){ const i = OC.info(OC.cod(k)); if(i && i.descr) tip = k + " · " + i.descr + ": " + fInt(n); }
      const dim = aba === "un" && destaque && destaque !== k;
      return `<button type="button" class="pd-bar ${dim ? "dim" : ""} ${aba === "un" && destaque === k ? "on" : ""}" ${aba === "un" ? `data-selun="${esc(k)}"` : "disabled"} title="${esc(tip)}" style="--c:${cor}">
        <b>${fInt(n)}</b><i style="height:${alt}%"></i><span>${esc(k)}</span></button>`;
    }).join("")}</div></div>`;
  }

  /* ---------- tela ---------- */
  function ultimaAtualizacao(){
    try{ const l = JSON.parse(LS.getItem(KIMPS) || "[]") || []; const d = l.map(x => x.em).filter(Boolean).sort().pop(); return d ? br(d) : ""; }catch(e){ return ""; }
  }

  function render(){
    const w = raiz(); if(!w) return;
    const V = dados();
    if(V.estado === "carregando"){ w.innerHTML = `<div class="empty">Carregando dados salvos…</div>`; return; }
    const G = !!V.geral;
    if(V.estado === "vazio"){ w.innerHTML = `<div class="empty">Nenhuma planilha de entregas importada ainda.<br>Abra <b>Importação e controle</b> e solte a planilha por previsão de entrega (e os relatórios 012).</div>`; return; }

    const AB = window.drAbertos ? window.drAbertos() : null;      // abertos em atraso (ocorrência 150), separados por culpa
    V.ab = AB;
    const P69 = window.drPend69 ? window.drPend69() : null;       // pendências · ocorrência 69 (entrega realizada com ressalva)
    V.p69 = P69;
    const t = V.res.totais, sla = t.sla;
    const prev = t.abertoAtrasado + t.abertoNoPrazo;
    const lupa = (key, rot) => G ? "" : `<button type="button" class="dr-lupa" data-lupa="${key}" title="Ver os documentos" aria-label="Ver os documentos: ${esc(rot)}">${ICO.lupa}</button>`;
    const at = V.todos.filter(ehAt), no = V.todos.filter(ehNo);
    const fxAt = FX_AT.map(f => Object.assign({}, f, { n: at.filter(d => naFaixa(d, f)).length }));
    const fxNo = FX_NO.map(f => Object.assign({}, f, { n: no.filter(d => naFaixa(d, f)).length }));
    const fAt = G ? null : FX_AT.find(f => f.id === ST.faixaAt), fNo = G ? null : FX_NO.find(f => f.id === ST.faixaNo);
    const abaAt = G ? "un" : ST.abaAt, abaNo = G ? "un" : ST.abaNo;

    // gráficos: a unidade clicada não restringe o gráfico por unidade (fica só destacada); a faixa clicada restringe
    const atG = V.todosAll.filter(ehAt).filter(d => !fAt || naFaixa(d, fAt));
    const noG = V.todosAll.filter(ehNo).filter(d => !fNo || naFaixa(d, fNo));
    const atGoc = V.todos.filter(ehAt).filter(d => !fAt || naFaixa(d, fAt));
    const noGoc = V.todos.filter(ehNo).filter(d => !fNo || naFaixa(d, fNo));

    const nFiltros = ST.un.length + (G ? 0 : ST.pag.length + ST.rem.length) + (ST.sis ? 1 : 0) + (ST.selUn ? 1 : 0) + (ST.faixaAt ? 1 : 0) + (ST.faixaNo ? 1 : 0);
    const upd = ultimaAtualizacao();
    const semFaixas = `<div class="pd-semfx">O relatório 084 (Performance Geral) não traz as faixas de dias de atraso nem a lista de documentos. Mude para <b>Teste</b> para ver as faixas.</div>`;

    w.innerHTML = `
      <div class="pd-top">
        <div class="pd-top-t"><h3>Dashboard Rede — Performance Geral · Previsão</h3>
          <small>${G ? "Fonte: aba Performance Geral (relatório 084" + (V.periodo ? " · " + esc(V.periodo) : "") + ")" : (upd ? "Última atualização da base: " + esc(upd) + " · " : "") + "mesma base e mesmo cálculo da Performance Teste"} · Hoje: ${esc(br(V.hoje))}</small></div>
        <div class="pd-top-r">
          <button type="button" class="pd-limpar" id="pdLimpar" ${nFiltros ? "" : "disabled"} title="Tira todos os filtros e seleções">${ICO.limpar}<span>Limpar filtros${nFiltros ? " (" + nFiltros + ")" : ""}</span></button>
          <div class="pd-modo" role="tablist" aria-label="Data de referência">
            <button type="button" role="tab" disabled title="A base importada não traz a data de emissão">Emissão</button>
            <button type="button" role="tab" class="on" aria-selected="true">Previsão</button>
          </div>
        </div>
      </div>

      <div class="pd-filtros">
        <div class="pd-f"><span class="pd-f-lbl">Performance</span>
          <div class="pd-seg" role="tablist" aria-label="Fonte da performance" title="Teste = Performance Teste (base de entregas + 012) · Geral = aba Performance Geral (relatório 084)">
            <button type="button" role="tab" data-fonte="teste" class="${G ? "" : "on"}">Teste</button>
            <button type="button" role="tab" data-fonte="geral" class="${G ? "on" : ""}">Geral</button></div></div>
        <div class="pd-f"><span class="pd-f-lbl">Previsão (competência)</span>
          <select class="small-select" id="pdMes" ${G ? 'disabled title="A Performance Geral usa o período do relatório importado"' : ""}>${["", ...V.meses].map(m => `<option value="${m}" ${ST.mes === m ? "selected" : ""}>${esc(rotMes(m))}</option>`).join("")}</select></div>
        <div class="pd-f"><span class="pd-f-lbl">Origem (sistema)</span>
          <select class="small-select" id="pdSis">${Object.keys(SIS).map(k => `<option value="${k}" ${ST.sis === k ? "selected" : ""}>${k ? k + " · " : ""}${SIS[k]}</option>`).join("")}</select></div>
        ${multiHTML("un", "Destino (unidade)", V.listaUn, ST.un, "Todos")}
        ${multiHTML("pag", "Pagador", V.listaPag, ST.pag, "Todos", G ? "O relatório 084 não traz pagador" : "")}
        ${multiHTML("rem", "Remetente", V.listaRem, ST.rem, "Todos", G ? "O relatório 084 não traz remetente" : "")}
      </div>
      ${ST.selUn ? `<div class="pd-chip">Unidade selecionada no gráfico: <b>${esc(ST.selUn)}</b> <button type="button" class="link-btn" id="pdTiraUn">tirar seleção</button></div>` : ""}

      <div class="pd-kpis">
        ${cartao("ct", "CT-e", t.exped, G ? "expedidos no relatório" : "documentos com previsão em " + esc(rotMes(ST.mes)), COR.ct, { semLupa: G })}
        ${cartao("ent", "Entregue", t.entregue, `${fPct(t.exped ? t.entregue / t.exped * 100 : null)} dos CT-e`, COR.ent, { semLupa: G })}
        ${cartao("entno", "Entregue no prazo", t.noPrazoEnt, `${fPct(t.entregue ? t.noPrazoEnt / t.entregue * 100 : null)} das entregues`, COR.entno, { semLupa: G })}
        <div class="dr-card pd-card pd-fora" style="--c:${COR.entfora}">
          <div class="dr-card-top"><span>Entregue fora do prazo</span>
            ${lupa("fora", "Entregue fora do prazo")}</div>
          <div class="pd-fora-body"><div class="dr-card-val">${fInt(t.foraDoPrazo)}</div>
            <ul><li><b>${fInt(t.atrasCli)}</b> Cliente</li><li><b>${fInt(t.atrasTrans)}</b> Transp.</li>${t.atrasPend ? `<li><b>${fInt(t.atrasPend)}</b> A definir</li>` : ""}</ul></div>
        </div>
        ${cartao("prev", "Previsto", prev, `${fInt(t.abertoAtrasado)} atrasados · ${fInt(t.abertoNoPrazo)} no prazo`, COR.prev, { semLupa: G })}
        <div class="panel pd-gauge">
          <div class="pd-gauge-t">% SLA <small>meta ${META}%</small></div>
          ${window.gaugeSVG ? window.gaugeSVG(sla) : ""}
          <div class="gauge-pct ${kpiCls(sla)}">${fPct(sla)}</div>
        </div>
      </div>

      <div class="pd-secoes">
        <section class="pd-sec pd-sec-at">
          <div class="pd-sec-tab">${AB ? "Abertos em Atraso" : "Previstos Atrasados"}</div>
          <div class="pd-sec-corpo">
            <div class="dr-card pd-big" style="--c:${COR.atrasados}">
              <div class="dr-card-top"><span></span>${AB
                ? `<button type="button" class="dr-lupa" data-lupa="ab" title="Ver os abertos em atraso por unidade" aria-label="Ver os documentos: Abertos em atraso">${ICO.lupa}</button>`
                : lupa("at", "Previstos fora do prazo")}</div>
              <div class="pd-big-ico">${ICO.caminhao}</div>
              <div class="pd-big-r">${AB ? "Abertos em Atraso" : "Previstos Fora do Prazo"}</div>
              <div class="dr-card-val">${fInt(AB ? AB.ab.length : t.abertoAtrasado)}</div>
              <div class="dr-card-sub">${AB ? (AB.n150 ? "da ocorrência 150" : "nenhum relatório 150 importado") : fPct(prev ? t.abertoAtrasado / prev * 100 : null) + " dos previstos"}</div>
            </div>
            <div class="pd-faixas">${G ? semFaixas : fxAt.map(f => cartao("at:" + f.id, f.rot, f.n, f.sub, f.cor, { faixa: f.id, sel: ST.faixaAt === f.id, cls: ST.faixaAt === f.id ? "sel" : (ST.faixaAt ? "dim" : "") })).join("")}</div>
          </div>
        </section>
        <section class="pd-sec pd-sec-no">
          <div class="pd-sec-tab">Previstos No Prazo</div>
          <div class="pd-sec-corpo">
            <div class="dr-card pd-big" style="--c:${COR.noprazo}">
              <div class="dr-card-top"><span></span>${lupa("no", "Previstos no prazo")}</div>
              <div class="pd-big-ico">${ICO.caminhao}</div>
              <div class="pd-big-r">Previstos No Prazo</div>
              <div class="dr-card-val">${fInt(t.abertoNoPrazo)}</div>
              <div class="dr-card-sub">${fPct(prev ? t.abertoNoPrazo / prev * 100 : null)} dos previstos</div>
            </div>
            <div class="pd-faixas">${G ? semFaixas : fxNo.map(f => cartao("no:" + f.id, f.rot, f.n, f.sub, f.cor, { faixa: f.id, sel: ST.faixaNo === f.id, cls: ST.faixaNo === f.id ? "sel" : (ST.faixaNo ? "dim" : "") })).join("")}</div>
          </div>
        </section>
      </div>

      ${AB ? abertosHTML(AB, P69) : ""}

      <div class="pd-graficos">
        <section class="pd-gr pd-gr-at">
          <div class="pd-gr-abas">
            <button type="button" data-aba="at:un" class="${abaAt === "un" ? "on" : ""}">Unidade Destino</button>
            <button type="button" data-aba="at:oc" ${G ? "disabled" : ""} class="${abaAt === "oc" ? "on" : ""}">Tipo Ocorrência</button></div>
          <div class="pd-gr-t">Previsto Fora do Prazo por ${abaAt === "un" ? "Unidade Destino" : "Tipo de Ocorrência"}${fAt ? ` <small>· faixa: ${esc(fAt.rot)} <button type="button" class="link-btn" data-tirafx="at">tirar</button></small>` : ""}</div>
          ${graficoHTML(abaAt === "un" ? atG : atGoc, abaAt, "#c8372f", "Nenhum previsto fora do prazo.", ST.selUn, G ? V.linAt : null)}
        </section>
        <section class="pd-gr pd-gr-no">
          <div class="pd-gr-abas">
            <button type="button" data-aba="no:un" class="${abaNo === "un" ? "on" : ""}">Unidade Destino</button>
            <button type="button" data-aba="no:oc" ${G ? "disabled" : ""} class="${abaNo === "oc" ? "on" : ""}">Tipo Ocorrência</button></div>
          <div class="pd-gr-t">Previsto No Prazo por ${abaNo === "un" ? "Unidade Destino" : "Tipo de Ocorrência"}${fNo ? ` <small>· faixa: ${esc(fNo.rot)} <button type="button" class="link-btn" data-tirafx="no">tirar</button></small>` : ""}</div>
          ${graficoHTML(abaNo === "un" ? noG : noGoc, abaNo, "#1e9a49", "Nenhum previsto no prazo.", ST.selUn, G ? V.linNo : null)}
        </section>
      </div>
      <p class="footer-note pd-nota">Clique numa faixa para filtrar o gráfico da seção · clique numa barra de unidade para filtrar o painel · ${G ? "" : "a lupa abre os documentos. "}Atrasados contam dias desde a previsão; no prazo contam dias até a previsão.</p>`;

    ligar(V);
  }

  // cartão "Pendências · ocorrência 69" (entrega realizada com ressalva): total, divisão VAL × RVA e lupa com a lista
  function cartao69(P){
    const cor = "#8a5a00";
    if(!P) return cartao("ab69", "Pendências · ocorrência 69", 0, "indisponível", cor, { semLupa: true });
    const n = P.length, v = P.filter(d => d.r.s === "VAL").length, r = P.filter(d => d.r.s === "RVA").length;
    const pv = n ? v / n * 100 : 0, pr = n ? r / n * 100 : 0;
    return `<div class="dr-card pd-card pd-69" style="--c:${cor}">
      <div class="dr-card-top"><span>Pendências · ocorrência 69</span>
        <button type="button" class="dr-lupa" data-lupa="ab69" title="Ver os documentos" aria-label="Ver os documentos: Pendências ocorrência 69">${ICO.lupa}</button></div>
      <div class="dr-card-val">${fInt(n)}</div>
      <div class="dr-card-sub">${n ? "entrega realizada com ressalva" : "nenhuma importada na aba Ocorrências (código 69)"}</div>
      ${n ? `<div class="pd-69-bar" aria-hidden="true"><i class="v" style="width:${pv}%"></i><i class="r" style="width:${pr}%"></i></div>
      <div class="pd-69-leg"><span><b>${fInt(v)}</b> Do Valle</span><span><b>${fInt(r)}</b> Real Vale</span></div>` : ""}
    </div>`;
  }

  // seção "Abertos em atraso" (ocorrência 150): total, culpa da transportadora × cliente e tempo em aberto
  function abertosHTML(AB, P69){
    const n = AB.ab.length, p = (a) => fPct(n ? a / n * 100 : null);
    const ab5 = AB.ab.filter(d => d.dias >= 5).length, ab10 = AB.ab.filter(d => d.dias >= 10).length;
    return `<section class="pd-ab">
      <div class="pd-ab-h"><div class="pd-ab-tab">Pendências · ocorrência 150 e 69</div>
        <div class="pd-ab-acoes">
          <button type="button" class="btn btn-ghost btn-sm" data-drview="abertos">Ver por unidade</button>
          <button type="button" class="btn btn-ghost btn-sm" data-drview="ocor" title="Define quem é o culpado (transportadora / cliente) de cada código de ocorrência">Ocorrências · culpa ${AB.nDef ? `<b class="pd-ab-def">${fInt(AB.nDef)} a definir</b>` : ""}</button></div></div>
      ${AB.n150 ? "" : `<div class="pd-ab-aviso">Nenhum relatório <b>150</b> importado ainda — os abertos em atraso vêm dele (Ocorrências &gt; código 150).</div>`}
      <div class="pd-ab-cards">
        ${cartao("abtr", "Abertos · culpa transportadora", AB.abTr.length, `${p(AB.abTr.length)} dos abertos em atraso`, "#b8265a")}
        ${cartao("abcli", "Abertos · culpa cliente", AB.abCli.length, `${p(AB.abCli.length)} dos abertos em atraso`, "#7448c0")}
        ${cartao("ab5", "Abertos há +5 dias", ab5, `${p(ab5)} dos abertos em atraso`, "#7a1f2b")}
        ${cartao("ab10", "Pendências há +10 dias", ab10, `10 dias ou mais · ${p(ab10)} dos abertos`, "#4a1018")}
        ${cartao69(P69)}
      </div>
    </section>`;
  }

  /* ---------- eventos ---------- */
  function refazer(){ salvar(); render(); }
  function ligar(V){
    const w = raiz();
    const $ = id => document.getElementById(id);
    w.querySelectorAll("[data-fonte]").forEach(b => b.addEventListener("click", () => { if(ST.fonte === b.dataset.fonte) return; ST.fonte = b.dataset.fonte; ST.selUn = ""; ST.faixaAt = ""; ST.faixaNo = ""; ST.q = {}; refazer(); }));
    $("pdMes").addEventListener("change", e => { ST.mes = e.target.value; ST.selUn = ""; refazer(); });
    $("pdSis").addEventListener("change", e => { ST.sis = e.target.value; ST.selUn = ""; refazer(); });
    $("pdLimpar").addEventListener("click", () => { ST.sis = ""; ST.un = []; ST.pag = []; ST.rem = []; ST.selUn = ""; ST.faixaAt = ""; ST.faixaNo = ""; ST.q = {}; refazer(); });
    const tu = $("pdTiraUn"); if(tu) tu.addEventListener("click", () => { ST.selUn = ""; refazer(); });

    // filtros com pesquisa e várias marcas
    w.querySelectorAll(".pd-multi").forEach(det => {
      const kind = det.dataset.kind, alvo = kind;
      det.addEventListener("toggle", () => { ST.abre[kind] = det.open; });
      const labels = Array.from(det.querySelectorAll(".pd-mlista label"));
      const filtra = () => {
        const q = semAc(ST.q[kind] || "");
        const termos = q.split(";").map(s => s.trim()).filter(Boolean);
        labels.forEach(l => { l.hidden = !!termos.length && !termos.some(t => l.dataset.n.indexOf(t) > -1); });
      };
      filtra();
      det.querySelector(".pd-mq").addEventListener("input", e => { ST.q[kind] = e.target.value; filtra(); });
      det.addEventListener("change", e => {
        if(e.target.type !== "checkbox") return;
        ST[alvo] = Array.from(det.querySelectorAll(".pd-mlista input:checked")).map(i => i.value);
        ST.selUn = ""; ST.abre[kind] = true; refazer();
      });
      det.querySelector("[data-mvis]").addEventListener("click", () => {
        const s = new Set(ST[alvo]);
        labels.forEach(l => { if(!l.hidden) s.add(l.querySelector("input").value); });
        ST[alvo] = Array.from(s); ST.selUn = ""; ST.abre[kind] = true; refazer();
      });
      det.querySelector("[data-mnada]").addEventListener("click", () => { ST[alvo] = []; ST.q[kind] = ""; ST.selUn = ""; ST.abre[kind] = true; refazer(); });
    });

    // faixas: clique filtra o gráfico da seção
    w.querySelectorAll("[data-faixa]").forEach(c => {
      const alterna = () => {
        const id = c.dataset.faixa, k = id[0] === "a" ? "faixaAt" : "faixaNo";
        ST[k] = ST[k] === id ? "" : id; render();
      };
      c.addEventListener("click", e => { if(e.target.closest(".dr-lupa")) return; alterna(); });
      c.addEventListener("keydown", e => { if((e.key === "Enter" || e.key === " ") && !e.target.closest(".dr-lupa")){ e.preventDefault(); alterna(); } });
    });
    w.querySelectorAll("[data-tirafx]").forEach(b => b.addEventListener("click", () => { ST[b.dataset.tirafx === "at" ? "faixaAt" : "faixaNo"] = ""; render(); }));
    w.querySelectorAll("[data-aba]").forEach(b => b.addEventListener("click", () => {
      const [sec, aba] = b.dataset.aba.split(":"); ST[sec === "at" ? "abaAt" : "abaNo"] = aba; refazer();
    }));
    w.querySelectorAll("[data-selun]").forEach(b => b.addEventListener("click", () => { ST.selUn = ST.selUn === b.dataset.selun ? "" : b.dataset.selun; render(); }));
    w.querySelectorAll("[data-lupa]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      if(b.dataset.lupa === "ab" && window.drAbrirView) window.drAbrirView("abertos"); else abrirLista(V, b.dataset.lupa);
    }));
    w.querySelectorAll("[data-drview]").forEach(b => b.addEventListener("click", () => { if(window.drAbrirView) window.drAbrirView(b.dataset.drview); }));
  }
  // fecha os filtros abertos ao clicar fora
  document.addEventListener("click", e => {
    const w = raiz(); if(!w) return;
    w.querySelectorAll(".pd-multi[open]").forEach(d => { if(!d.contains(e.target)){ d.open = false; ST.abre[d.dataset.kind] = false; } });
  });

  /* ---------- lista de documentos (lupa) ---------- */
  function docsDoCartao(V, key){
    const T = V.todos;
    if(key.indexOf("ab") === 0 && V.ab){
      const m = d => Object.assign({}, d, { situacao: "Aberto em atraso" });
      const A = V.ab;
      if(key === "ab") return { t: "Abertos em atraso (ocorrência 150)", docs: A.ab.map(m) };
      if(key === "abtr") return { t: "Abertos · culpa da transportadora", docs: A.abTr.map(m) };
      if(key === "abcli") return { t: "Abertos · culpa do cliente", docs: A.abCli.map(m) };
      if(key === "ab5") return { t: "Abertos há +5 dias", docs: A.ab.filter(d => d.dias >= 5).map(m) };
      if(key === "ab10") return { t: "Pendências há +10 dias", docs: A.ab.filter(d => d.dias >= 10).map(m) };
    }
    if(key === "ab69") return { t: "Pendências · ocorrência 69 (entrega realizada com ressalva)", docs: (V.p69 || []).map(d => Object.assign({}, d, { situacao: "Entrega realizada com ressalva" })) };
    if(key === "ct") return { t: "CT-e", docs: T };
    if(key === "ent") return { t: "Entregue", docs: T.filter(ehEnt) };
    if(key === "entno") return { t: "Entregue no prazo", docs: T.filter(d => d.situacao === "Entregue no prazo") };
    if(key === "fora") return { t: "Entregue fora do prazo", docs: T.filter(ehFora) };
    if(key === "prev") return { t: "Previsto (ainda não entregues)", docs: T.filter(d => ehAt(d) || ehNo(d)) };
    if(key === "at") return { t: "Previstos fora do prazo", docs: T.filter(ehAt) };
    if(key === "no") return { t: "Previstos no prazo", docs: T.filter(ehNo) };
    if(key.indexOf("at:") === 0){ const f = FX_AT.find(x => x.id === key.slice(3)); return { t: "Previstos fora do prazo · " + f.rot, docs: T.filter(ehAt).filter(d => naFaixa(d, f)) }; }
    if(key.indexOf("no:") === 0){ const f = FX_NO.find(x => x.id === key.slice(3)); return { t: "Previstos no prazo · " + f.rot, docs: T.filter(ehNo).filter(d => naFaixa(d, f)) }; }
    return { t: "Documentos", docs: [] };
  }
  const RESP = { cliente: "Cliente", transp: "Transportadora" };
  const linhaDoc = d => {
    const r = d.r, OC = window.OcorCulpa;
    const info = OC && OC.info && r.c ? OC.info(OC.cod(r.c)) : null;
    if(d.oc) return { ctrc: r.x || r.k, nf: r.n || "", rem: r.r || "", dest: r.t || "", cid: r.y || "", un: r.u || "", prev: br(r.p), ent: "", dias: d.dias === "" ? "" : d.dias,
      oc: (d.oc.cod || "") + (d.oc.descr ? " · " + d.oc.descr : ""), pag: r.g || "", sit: d.situacao + " (" + (RESP[d.resp] || d.resp) + ")" + (d.aDefinir ? " · culpa a definir" : ""), sis: r.s || "" };
    return { ctrc: r.x || r.k, nf: r.n || "", rem: r.r || "", dest: r.t || "", cid: r.y || "", un: r.u || "", prev: br(r.p), ent: r.e ? br(r.e) : "",
      dias: d.dias === "" ? "" : d.dias, oc: (r.c || "") + (info && info.descr ? " · " + info.descr : ""), pag: r.g || "", sit: d.situacao + (d.resp ? " (" + (RESP[d.resp] || d.resp) + ")" : ""), sis: r.s || "" };
  };

  function abrirLista(V, key){
    const { t, docs } = docsDoCartao(V, key);
    const rot = ST.mes ? rotMes(ST.mes) : "Todos os meses";
    fecharLista();
    const m = document.createElement("div"); m.className = "dr-modal"; m.id = "pdModal";
    m.innerHTML = `<div class="dr-modal-box" role="dialog" aria-modal="true" aria-label="${esc(t)}">
      <div class="dr-modal-h"><div><small>Dashboard de Performance · ${esc(rot)} · ${esc(SIS[ST.sis])}${ST.selUn ? " · " + esc(ST.selUn) : ""}</small><h3>${esc(t)} — ${fInt(docs.length)}</h3></div>
        <button type="button" class="dr-x" id="pdFecha" aria-label="Fechar">${ICO.x}</button></div>
      <div class="dr-modal-bar"><input type="search" class="small-input" id="pdBusca" placeholder="Pesquisar CTRC, NF, cliente, cidade, unidade, ocorrência…" autocomplete="off">
        <button type="button" class="btn btn-ghost btn-sm dr-btn-ico" id="pdCsv">${ICO.csv}<span>Baixar CSV</span></button></div>
      <div class="dr-modal-tab" id="pdTab"></div>
      <div class="footer-note" id="pdRod"></div></div>`;
    (document.fullscreenElement || document.body).appendChild(m);
    const linhas = docs.map(linhaDoc);
    const pinta = () => {
      const q = semAc(m.querySelector("#pdBusca").value).trim();
      const vis = q ? linhas.filter(l => semAc(Object.values(l).join(" ")).indexOf(q) > -1) : linhas;
      m.querySelector("#pdTab").innerHTML = vis.length ? `<table class="dr-table dr-table-modal"><thead><tr>
        <th>CTRC</th><th>Sis.</th><th>NF</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Unid.</th><th>Previsão</th><th>Entrega</th><th class="r">Dias</th><th>Ocorrência</th><th>Pagador</th><th>Situação</th></tr></thead><tbody>
        ${vis.slice(0, LIM_LISTA).map(l => `<tr><td class="dr-ctrc">${esc(l.ctrc)}</td><td>${esc(l.sis)}</td><td>${esc(l.nf)}</td><td>${esc(l.rem)}</td><td>${esc(l.dest)}</td><td>${esc(l.cid)}</td><td>${esc(l.un)}</td><td>${esc(l.prev)}</td><td>${esc(l.ent)}</td><td class="r">${l.dias === "" ? "—" : `<span class="dr-dias ${l.dias >= 10 ? "g" : l.dias >= 5 ? "m" : ""}">${esc(l.dias)}</span>`}</td><td>${esc(l.oc)}</td><td>${esc(l.pag)}</td><td>${esc(l.sit)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty dr-vazio">Nenhum documento.</div>`;
      m.querySelector("#pdRod").textContent = vis.length > LIM_LISTA ? `Mostrando ${fInt(LIM_LISTA)} de ${fInt(vis.length)} — pesquise para afinar ou baixe o CSV com todos.` : `${fInt(vis.length)} documento(s).`;
      m._vis = vis;
    };
    pinta();
    m.querySelector("#pdBusca").addEventListener("input", pinta);
    m.querySelector("#pdFecha").addEventListener("click", fecharLista);
    m.addEventListener("mousedown", e => { if(e.target === m) fecharLista(); });
    m.querySelector("#pdCsv").addEventListener("click", () => baixarCsv(m._vis || linhas, t));
    m.querySelector("#pdBusca").focus();
  }
  function fecharLista(){ const m = document.getElementById("pdModal"); if(m) m.remove(); }
  document.addEventListener("keydown", e => { if(e.key === "Escape") fecharLista(); });

  function baixarCsv(linhas, titulo){
    const cab = ["CTRC", "Sistema", "NF", "Remetente", "Destinatário", "Cidade", "Unidade", "Previsão", "Entrega", "Dias", "Ocorrência", "Pagador", "Situação"];
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const corpo = linhas.map(l => [l.ctrc, l.sis, l.nf, l.rem, l.dest, l.cid, l.un, l.prev, l.ent, l.dias, l.oc, l.pag, l.sit].map(q).join(";"));
    const blob = new Blob(["﻿" + [cab.map(q).join(";")].concat(corpo).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Dashboard_Performance_" + semAc(titulo).replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") + "_" + hojeISO() + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // filtros que as telas "Abertos em atraso" e "Ocorrências · culpa" (dashboard-rede.js) herdam deste dashboard
  window.perfDashFiltros = () => ({ sis: ST.sis, un: ST.selUn ? [ST.selUn] : ST.un.slice(), pag: ST.fonte === "geral" ? [] : ST.pag.slice(), mes: ST.fonte === "geral" ? "" : (ST.mes || "") });
  window.perfDashRender = render;
})();
