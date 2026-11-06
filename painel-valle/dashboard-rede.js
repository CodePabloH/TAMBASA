/* ===================== DASHBOARD · REDE DO VALLE =====================
   Painel resumido da Rede (VAL + RVA), LIGADO à "Performance Teste": usa a mesma base, o mesmo 012
   e o mesmo cálculo (window.PTDados, definido em performance-teste.js). Nada é recalculado aqui por outra regra.

   Telas (abas no topo: Visão geral e Ocorrências · culpa; "Abertos em atraso" abre pela lupa):
   1) Visão geral        : medidor de performance (canto superior esquerdo) + 10 cartões coloridos com lupa
                           (a lupa abre a lista de documentos do cartão).
   2) Abertos em atraso  : abre pela lupa do cartão. Painel de unidades à esquerda (clique numa unidade); à direita os
                           documentos em duas tabelas: Transportadora (em cima) e Cliente (embaixo).
   3) Ocorrências · culpa: para cada código de ocorrência o usuário define Transportadora / Cliente / Baixa / A definir.

   FONTE DA PERFORMANCE (seletor "Performance: Teste | Geral"):
   - Teste: Performance Teste (base de entregas + 012), com mês, pagador e unidade.
   - Geral: relatório da aba Performance Geral (084 importado, VAL e/ou RVA). Não tem mês, pagador, faixas de dias nem lista de
     documentos: valem Sistema e Unidade; os cartões de faixa de atraso saem e os de entregas ficam sem lupa.
   Os cartões de ABERTOS EM ATRASO vêm do 150; o cartão de ocorrência 69 vem da aba Ocorrências (código 69 - entrega realizada com ressalva).
   FILTROS (Pagador e Unidade, vários de cada): valem para o dashboard inteiro.
   - PERFORMANCE GERAL (medidor, ranking e cartões de entregas) vem da Performance Teste, com o filtro aplicado.
   - ABERTOS EM ATRASO vêm das OCORRÊNCIAS · CÓDIGO 150 (a lista importada), também com o filtro aplicado
     (pagador e unidade do próprio 150; se o CTRC existir na base, usa os da base).

   Abertos em atraso: cada documento é ligado pelo CTRC ao relatório 150 (Ocorrências > código 150) e a culpa
   vem do COD_OCORRENCIA pela tabela de ocorrencias-culpa.js (padrão do arquivo + ajustes da tela 3).
   Ordem: definido à mão (Performance Teste) > código do 150 > código da base > 012. Sem definição = "Transportadora · a definir".
   Todos os documentos do 150 entram (a contagem por unidade é igual à de Ocorrências). Código marcado como "Baixa" só muda a culpa (vai em Transportadora).
   Estado da tela (mês, sistema) fica em localStorage "valle_dash_rede_ui_v1". */
(function(){
  "use strict";

  const KUI = "valle_dash_rede_ui_v1";
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const SIS = { "": "Geral", VAL: "Do Valle", RVA: "Real Vale" };
  const LIM_LISTA = 500;

  const ST = { mes: null, sis: "", view: "home", modal: null, mBusca: "", ocVer: "todos", unAb: "", pag: [], unF: [], abre: {}, q: {}, fonte: "teste" };
  try{ const u = JSON.parse(LS.getItem(KUI) || "null"); if(u){ if(typeof u.mes === "string") ST.mes = u.mes; if(u.sis in SIS) ST.sis = u.sis; if(Array.isArray(u.pag)) ST.pag = u.pag; if(Array.isArray(u.unF)) ST.unF = u.unF; if(u.fonte === "geral" || u.fonte === "teste") ST.fonte = u.fonte; } }catch(e){}
  const salvarUI = () => { try{ LS.setItem(KUI, JSON.stringify({ mes: ST.mes, sis: ST.sis, pag: ST.pag, unF: ST.unF, fonte: ST.fonte })); }catch(e){} };
  // Com a fonte "Teste", competência / sistema / pagador / unidade são OS MESMOS da aba Performance Teste:
  // o que se escolhe aqui vale lá e vice-versa (é isso que faz os números baterem).
  const empurrarParaPT = () => {
    if(ST.fonte !== "teste" || !window.PTDados || !window.PTDados.definirUi) return;
    window.PTDados.definirUi({ mes: ST.mes, visao: ST.sis || "geral", pagadores: ST.pag.slice(), unidades: ST.unF.slice() });
  };
  const doPT = D => {   // lê do quadro da Performance Teste o que ela está mostrando agora
    const u = D.ui(), meses = D.meses();
    if(u.mes === null || (u.mes !== "" && meses.indexOf(u.mes) === -1)) u.mes = meses[0] || "";
    ST.mes = u.mes; ST.sis = (u.visao === "VAL" || u.visao === "RVA") ? u.visao : "";
    ST.pag = (u.pagadores || []).slice(); ST.unF = (u.unidades || []).slice();
  };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fInt = n => Math.round(n || 0).toLocaleString("pt-BR");
  const fPct = v => (v === null || v === undefined) ? "-" : v.toFixed(1).replace(".", ",") + "%";
  const pct = (a, b) => b > 0 ? a / b * 100 : null;
  const br = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—";
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const diasEntre = (aISO, bISO) => Math.round((Date.UTC(+bISO.slice(0,4), +bISO.slice(5,7)-1, +bISO.slice(8,10)) - Date.UTC(+aISO.slice(0,4), +aISO.slice(5,7)-1, +aISO.slice(8,10))) / 864e5);
  const rotMes = m => { if(!m) return "Todos os meses"; const p = m.split("-"); return MESES[+p[1] - 1] + "/" + p[0]; };
  const kpiCls = v => (v === null || v === undefined) ? "warn" : v >= 98 ? "ok" : v >= 95 ? "warn" : "alert";
  const raiz = () => document.getElementById("drWrap");

  const ICO = {
    lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    imp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>',
    csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>'
  };

  // uma cor por cartão (c = cor forte, s = fundo suave)
  const COR = {
    previstas: { c: "#2f6fa8", s: "#ffffff" },
    entregues: { c: "#2f8a2a", s: "#ffffff" },
    entnoprazo: { c: "#0f8b8d", s: "#ffffff" },
    fora:      { c: "#c08a12", s: "#ffffff" },
    mais2:     { c: "#d9661f", s: "#ffffff" },
    abertos:   { c: "#c8372f", s: "#ffffff" },
    abtr:      { c: "#b8265a", s: "#ffffff" },
    abcli:     { c: "#7448c0", s: "#ffffff" },
    ab5:       { c: "#7a1f2b", s: "#ffffff" },
    ab10:      { c: "#4a1018", s: "#ffffff" },
    ab69:      { c: "#8a5a00", s: "#ffffff" },
    e12:       { c: "#3f9b3a", s: "#ffffff" },
    e35:       { c: "#d49a12", s: "#ffffff" },
    e610:      { c: "#d9661f", s: "#ffffff" },
    e10:       { c: "#b3261e", s: "#ffffff" },
    noprazo:   { c: "#4558b8", s: "#ffffff" }
  };

  /* ---------- vínculo com a ocorrência 150 (Documentos em atraso) ---------- */
  const KATRASOS = "tambasa_documentos_atraso";                       // mesma lista da aba Ocorrências > código 150
  const chaveDoc = s => String(s == null ? "" : s).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const OC = () => window.OcorCulpa;
  function indice150(){
    let lista = [];
    try{ lista = JSON.parse(LS.getItem(KATRASOS) || "[]") || []; }catch(e){}
    const m = new Map(), descr = {};
    lista.forEach(a => {
      const k = chaveDoc(a.ctrc); if(!k) return;
      const cod = OC() ? OC().cod(a.codOcorrencia) : String(a.codOcorrencia || "").trim();
      const o = { cod, descr: String(a.descrOcorrencia || "").trim(), dias: a.diasAtraso };
      m.set((a.origem || "") + ":" + k, o);
      if(!m.has(":" + k)) m.set(":" + k, o);                          // sem sistema: vale pelo CTRC
      if(cod && o.descr && !descr[cod]) descr[cod] = o.descr;
    });
    return { m, descr, total: lista.length, lista };
  }
  // quem é o responsável por um documento ABERTO em atraso.
  // Ordem: 1) definido à mão  2) código do 150 + tabela de culpa  3) código da base (se o doc não está no 150)  4) 012  5) a definir
  function culpaAberto(D, r, idx){
    const man = D.manual ? D.manual(r) : "";
    const k = chaveDoc(r.x || r.k);
    const h = idx.m.get((r.s || "") + ":" + k) || idx.m.get(":" + k) || null;
    const fonte = h ? "150" : "base";
    const cod = h ? h.cod : (OC() ? OC().cod(r.c || "") : (r.c || ""));
    const info = OC() && cod ? OC().info(cod) : null;
    const oc = cod ? { cod, descr: (h && h.descr) || (info && info.descr) || idx.descr[cod] || "", fonte } : null;
    if(man === "cliente" || man === "transp") return { resp: man, oc, via: "manual", aDefinir: false };
    if(info && info.culpa === "baixa") return { resp: "transp", oc, via: "baixa", aDefinir: false, baixaOc: true };   // código de baixa: não é documento aberto
    if(info && (info.culpa === "cliente" || info.culpa === "transp")) return { resp: info.culpa, oc, via: fonte, aDefinir: false };
    const x = D.responsavel(r);                                       // 012
    if(x === "cliente" || x === "transp") return { resp: x, oc, via: "012", aDefinir: false };
    return { resp: "transp", oc, via: "sem", aDefinir: true };
  }
  const ROT_VIA = { "150": "ocorrência 150", base: "código da base", manual: "definido à mão", "012": "relatório 012", baixa: "código de baixa", sem: "culpa ainda não definida" };

  /* ---------- dados ---------- */
  const isoBR = t => { const m = String(t || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/); if(!m) return ""; let a = +m[3]; if(a < 100) a += 2000; return a + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0"); };

  // documentos ABERTOS EM ATRASO = a lista da ocorrência 150 INTEIRA (sem mês e sem tirar códigos de baixa), só com os filtros de sistema, pagador e unidade
  function docs150(D, idx, filtro){
    const bi = new Map();
    D.registros().forEach(r => { const k = chaveDoc(r.x || r.k); bi.set((r.s || "") + ":" + k, r); if(!bi.has(":" + k)) bi.set(":" + k, r); });
    const hoje = hojeISO(), out = [];
    idx.lista.forEach(a => {
      const k = chaveDoc(a.ctrc); if(!k) return;
      const s0 = String(a.origem || "").toUpperCase().trim();
      const b = bi.get(s0 + ":" + k) || bi.get(":" + k) || null;
      const sis = s0 || (b && b.s) || "";
      const un = String(a.unidade || (b && b.u) || "").toUpperCase().trim();      // unidade do próprio 150 (igual à tela Ocorrências)
      const p = isoBR(a.prevEntrega) || (b && b.p) || "";
      const pagNome = String(a.pagador || (b && b.g) || "").trim();
      if(ST.sis && sis !== ST.sis) return;
      if(filtro.un.size && !filtro.un.has(un)) return;
      if(filtro.pag.size && !filtro.pag.has(D.pagChaveNome(pagNome))) return;
      const r = b ? Object.assign({}, b, { p: p || b.p, u: un }) : { s: sis, k: sis + ":" + a.ctrc, x: a.ctrc, n: a.nf || "", r: a.remetente || "", t: a.destinatario || "", y: "", u: un, p, e: "", c: "", d: null, g: pagNome };
      const v = culpaAberto(D, r, idx);
      const dn = parseInt(String(a.diasAtraso || "").replace(/[^\d-]/g, ""), 10);
      const dias = dn > 0 ? dn : (p ? Math.max(1, diasEntre(p, hoje)) : 0);
      out.push({ r, sit: "Aberto atrasado", resp: v.resp, oc: v.oc, via: v.via, baixaOc: !!v.baixaOc, aDefinir: v.aDefinir, dias });
    });
    return out;
  }

  // Pendências · ocorrência 69 = a lista da aba OCORRÊNCIAS (código 69 — Entrega realizada com ressalva), importada para VAL e RVA.
  // Só os filtros de sistema, pagador e unidade do dashboard; o total sem filtro é igual ao contador da aba Ocorrências.
  const KOC69 = "tambasa_ocorrencias";
  function docs69(D, filtro){
    let lista = [];
    try{ lista = JSON.parse(LS.getItem(KOC69) || "[]") || []; }catch(e){}
    const bi = new Map();
    D.registros().forEach(r => { const k = chaveDoc(r.x || r.k); bi.set((r.s || "") + ":" + k, r); if(!bi.has(":" + k)) bi.set(":" + k, r); });
    const out = [];
    lista.forEach(o => {
      const k = chaveDoc(o.ctrc);
      const s0 = String(o.origem || "").toUpperCase().trim();
      const b = bi.get(s0 + ":" + k) || bi.get(":" + k) || null;
      const sis = s0 || (b && b.s) || "";
      const un = String(o.unidade || (b && b.u) || "").toUpperCase().trim();
      if(ST.sis && sis !== ST.sis) return;
      if(filtro.un.size && !filtro.un.has(un)) return;
      if(filtro.pag.size && !filtro.pag.has(D.pagChaveNome(String(o.pagador || (b && b.g) || "").trim()))) return;
      const r = { s: sis, k: sis + ":" + o.ctrc, x: o.ctrc, n: o.nf || (b && b.n) || "", r: o.remetente || (b && b.r) || "", t: o.destinatario || (b && b.t) || "",
        y: o.destino || (b && b.y) || "", u: un, p: (b && b.p) || "", e: (b && b.e) || "", c: "69", d: null, g: o.pagador || (b && b.g) || "" };
      out.push({ r, sit: "Entrega com ressalva", resp: "", oc: { cod: "69", descr: o.busca || o.ultOcor || "Entrega realizada com ressalva", fonte: "ocorrências" }, via: "ocorrencias", baixaOc: false, aDefinir: false, dias: "" });
    });
    return out;
  }

  function dados(){
    const D = window.PTDados;
    if(!D || !D.pronto() || !D.temBase()) return null;
    const meses = D.meses();
    if(ST.fonte === "teste" && D.ui) doPT(D);
    if(ST.mes === null || (ST.mes !== "" && meses.indexOf(ST.mes) === -1)) ST.mes = D.mesPadrao();
    const idx150 = indice150();

    // listas dos filtros (base + 150), e limpeza de marcas que não existem mais
    const pagM = new Map();
    D.pagadores(ST.mes, ST.sis).forEach(a => pagM.set(a.chave, { chave: a.chave, nome: a.nome, n: a.docs }));
    const unM = new Map();
    D.registros().forEach(r => { if((!ST.sis || r.s === ST.sis) && (!ST.mes || r.p.slice(0, 7) === ST.mes) && r.u){ const a = unM.get(r.u) || { chave: r.u, nome: r.u, n: 0 }; a.n++; unM.set(r.u, a); } });
    idx150.lista.forEach(a => {
      const pn = String(a.pagador || "").trim(); if(pn){ const c = D.pagChaveNome(pn); if(!pagM.has(c)) pagM.set(c, { chave: c, nome: pn, n: 0 }); }
      const u = String(a.unidade || "").toUpperCase().trim(); if(u && !unM.has(u)) unM.set(u, { chave: u, nome: u, n: 0 });
    });
    try{ ["performanceGeralVal", "performanceGeralRva"].forEach(k => { const x = typeof load === "function" && typeof KEYS !== "undefined" ? load(KEYS[k]) : null; ((x && x.unidades) || []).forEach(u => { const sg = String(u.sigla || "").toUpperCase().trim(); if(sg && !unM.has(sg)) unM.set(sg, { chave: sg, nome: sg, n: 0 }); }); }); }catch(e){}
    const listaPag = Array.from(pagM.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const listaUn = Array.from(unM.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const filtro = { pag: new Set(ST.pag), un: new Set(ST.unF) };

    let res, docs, unid, geral = null, extrasPT = [];
    if(ST.fonte === "geral"){
      // PERFORMANCE GERAL (aba Performance Geral): relatório 084 por unidade, VAL e/ou RVA
      const vd = typeof load === "function" && typeof KEYS !== "undefined" ? load(KEYS.performanceGeralVal) : null;
      const rd = typeof load === "function" && typeof KEYS !== "undefined" ? load(KEYS.performanceGeralRva) : null;
      const tem = x => !!(x && Array.isArray(x.unidades) && x.unidades.length);
      const useV = tem(vd) && ST.sis !== "RVA", useR = tem(rd) && ST.sis !== "VAL";
      const mg = (useV || useR) && typeof mesclarPerformanceGeral === "function" ? mesclarPerformanceGeral(useV ? vd : null, useR ? rd : null) : { unidades: [], periodo: "" };
      const us = mg.unidades.filter(u => !filtro.un.size || filtro.un.has(String(u.sigla).toUpperCase().trim()));
      const z = { exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, atrasPend: 0, abertoAtrasado: 0, abertoNoPrazo: 0 };
      us.forEach(u => Object.keys(z).forEach(k => { z[k] += u[k] || 0; }));
      const c = typeof calcularCamposPerformance === "function" ? calcularCamposPerformance(Object.assign({}, z)) : z;
      z.foraDoPrazo = z.atrasCli + z.atrasTrans; z.sla = c.perf === undefined ? null : c.perf;
      res = { totais: z, unidades: [] };
      docs = [];
      unid = us.map(u => Object.assign({}, u, { sla: u.perf === undefined ? u.sla : u.perf }));
      geral = { periodo: mg.periodo, tem: useV || useR };
    }else{
    // PERFORMANCE TESTE: o MESMO quadro da aba (D.quadro), com os mesmos filtros e a mesma conta
    const q = D.quadro();
    extrasPT = q.extras;
    res = { totais: q.totais, unidades: q.unidades, detalhe: q.detalhe };
    docs = q.detalhe.map(d => {
      const r = d.r;
      let dias;
      if(/^Atraso/.test(d.situacao)) dias = (r.d !== null && r.d !== undefined && r.d > 0) ? r.d : (r.e && r.p ? Math.max(1, diasEntre(r.p, r.e)) : "");   // dias de atraso na entrega
      else dias = (r.d === null || r.d === undefined) ? "" : r.d;
      return { r, sit: d.situacao, resp: d.resp, oc: null, via: "", baixaOc: false, aDefinir: false, dias };
    });
    unid = q.unidades.map(a => Object.assign({}, a, { sla: a.sla }));
    }

    // ABERTOS EM ATRASO: vêm da ocorrência 150
    const abAll = docs150(D, idx150, filtro);
    const ab = abAll;                                                            // fiel ao 150: todos os documentos importados (com os filtros da tela)
    return {
      meses, res, docs, unid, geral, extrasPT, fonte: ST.fonte, tot: res.totais, n150: idx150.total, listaPag, listaUn,
      d69: docs69(D, filtro),
      abAll, ab, abTr: ab.filter(d => d.resp !== "cliente"), abCli: ab.filter(d => d.resp === "cliente"),
      nBaixaOc: abAll.length - ab.length,
      nDef: ab.filter(d => d.aDefinir).length,
      via150: ab.filter(d => d.oc && d.oc.fonte === "150").length,
      manual: D.manual, responsavel: D.responsavel, registros: D.registros, pagChaveNome: D.pagChaveNome
    };
  }

  /* ---------- helpers de tela ---------- */
  function cartao(id, rotulo, valor, sub, opt){
    opt = opt || {};
    const k = COR[id] || COR.previstas;
    return `<div class="dr-card" style="--c:${k.c};--cs:${k.s}">
      <div class="dr-card-top"><span>${esc(rotulo)}</span>
        ${opt.semLupa ? "" : `<button type="button" class="dr-lupa" data-lupa="${id}" title="${esc(opt.lupaTitulo || "Ver os documentos")}" aria-label="Ver os documentos: ${esc(rotulo)}">${ICO.lupa}</button>`}</div>
      <div class="dr-card-val">${fInt(valor)}</div>
      <div class="dr-card-sub">${sub || ""}</div>
    </div>`;
  }

  // seletor com pesquisa e várias marcas (Pagador / Unidade)
  function multiHTML(kind, rotulo, lista, sel, larg){
    const n = sel.length, q = ST.q[kind] || "";
    const un = n === 1 ? (lista.find(a => a.chave === sel[0]) || {}).nome : "";
    return `<div class="pt-multi-wrap dr-multi"><span class="pt-multi-lbl">${rotulo}</span>
      <details class="pt-multi dr-det" data-kind="${kind}" ${ST.abre[kind] ? "open" : ""}>
        <summary>${n ? (n === 1 ? esc(un || sel[0]) : n + " marcados") : (kind === "pag" ? "Todos os pagadores" : "Todas as unidades")}</summary>
        <div class="pt-multi-box dr-multi-box ${larg}">
          <input type="search" class="small-input dr-mq" placeholder="Pesquisar… (use ; para vários)" value="${esc(q)}" autocomplete="off">
          <div class="pt-multi-acoes"><button type="button" class="link-btn" data-mvis>Marcar os que aparecem</button><button type="button" class="link-btn" data-mnada>Limpar</button></div>
          <div class="dr-mlista">${lista.map(a => `<label data-n="${esc(semAc(a.nome + " " + a.chave))}"><input type="checkbox" value="${esc(a.chave)}" ${sel.indexOf(a.chave) > -1 ? "checked" : ""}> <span>${esc(a.nome)}</span>${a.n ? ` <small>${fInt(a.n)}</small>` : ""}</label>`).join("") || `<div class="empty">Nada para filtrar.</div>`}</div>
          <div class="pt-pagm-rod">${n} marcado(s) · ${fInt(lista.length)}</div>
        </div>
      </details></div>`;
  }
  const semAc = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  function filtrosHTML(D){
    const ativos = ST.pag.length + ST.unF.length;
    return `<div class="dr-filtros">
      <label>Competência
        <select class="small-select" id="drMes" ${ST.fonte === "geral" ? "disabled title=\"A Performance Geral usa o período do relatório importado\"" : ""}>${["", ...D.meses].map(m => `<option value="${m}" ${ST.mes === m ? "selected" : ""}>${esc(rotMes(m))}</option>`).join("")}</select>
      </label>
      <div class="pt-multi-wrap dr-multi"><span class="pt-multi-lbl">Performance</span>
        <div class="dr-seg" role="tablist" aria-label="Fonte da performance" title="Teste = Performance Teste (base + 012) · Geral = aba Performance Geral (relatório 084). Abertos em atraso e 69 não mudam.">
          <button type="button" role="tab" data-fonte="teste" class="${ST.fonte === "teste" ? "on" : ""}">Teste</button>
          <button type="button" role="tab" data-fonte="geral" class="${ST.fonte === "geral" ? "on" : ""}">Geral</button>
        </div></div>
      <div class="dr-seg" role="tablist" aria-label="Sistema">
        ${Object.keys(SIS).map(k => `<button type="button" role="tab" data-sis="${k}" class="${ST.sis === k ? "on" : ""}">${k ? `<b>${k}</b> ` : ""}${SIS[k]}</button>`).join("")}
      </div>
      ${multiHTML("pag", "Pagador", D.listaPag, ST.pag, "dr-box-pag")}
      ${multiHTML("un", "Unidade", D.listaUn, ST.unF, "dr-box-un")}
      ${ativos ? `<button type="button" class="btn btn-ghost btn-sm" id="drLimparF" title="Tira os filtros de pagador e unidade">Limpar filtros (${ativos})</button>` : ""}
    </div>`;
  }

  function cabecalho(D, desc){
    return `<div class="dr-head">
      <div><h2 class="section-title">Dashboard · Rede do Valle</h2>
        <p class="section-desc">${desc}</p></div>
      ${filtrosHTML(D)}
    </div>
    <nav class="dr-nav" role="tablist" aria-label="Seções do dashboard">
      ${ST.view === "abertos" ? `<button type="button" class="dr-voltar" data-view="home">${ICO.voltar}<span>Voltar ao dashboard</span></button>
        <span class="dr-nav-t">Abertos em atraso</span>
        <span class="dr-nav-r">
        <button type="button" class="btn btn-ghost btn-sm dr-btn-ico" id="drImportar" title="Abre Ocorrências > código 150 para importar o relatório de documentos em atraso">${ICO.imp}<span>Importar ocorrência 150</span></button>
        <button type="button" class="btn btn-ghost btn-sm dr-btn-ico" id="drAbCsv" title="Baixa os documentos abertos em atraso (respeita a unidade escolhida), já separados por culpa">${ICO.csv}<span>Baixar CSV</span></button></span>`
      : `<button type="button" role="tab" data-view="home" class="${ST.view === "home" ? "on" : ""}">Visão geral</button>
        <button type="button" role="tab" data-view="ocor" class="${ST.view === "ocor" ? "on" : ""}">Ocorrências · culpa ${D.nDef ? `<b class="alert">${fInt(D.nDef)} a definir</b>` : `<b class="ok">ok</b>`}</button>`}
    </nav>`;
  }

  function topo(){ const w = raiz(); if(w && w.scrollIntoView) w.scrollIntoView({ block: "start" }); }

  /* ---------- tela 1: visão geral ---------- */
  function renderHome(D){
    const t = D.tot, sla = t.sla;
    const rank = D.unid.filter(u => u.sla !== null && u.entregue > 0).sort((a, b) => a.sla - b.sla).slice(0, 8);
    const atr = D.docs.filter(d => /^Atraso/.test(d.sit));
    const nFx = (a, b) => atr.filter(d => Number(d.dias) >= a && Number(d.dias) <= b).length;
    const e12 = nFx(1, 2), e35 = nFx(3, 5), e610 = nFx(6, 10), e10 = nFx(11, 99999);
    const ab5 = D.ab.filter(d => d.dias >= 5).length, ab10 = D.ab.filter(d => d.dias >= 10).length;
    const d69 = D.d69;
    const v69 = d69.filter(d => d.r.s === "VAL").length, r69 = d69.filter(d => d.r.s === "RVA").length;
    const G = D.fonte === "geral", SL = { semLupa: G };
    const descTopo = G
      ? `Performance vinda da aba <strong>Performance Geral</strong> (relatório 084${D.geral && D.geral.periodo ? " · " + esc(D.geral.periodo) : ""}) · ${esc(SIS[ST.sis])}. Abertos em atraso vêm do 150 e a ocorrência 69 da aba Ocorrências.`
      : `Performance vinda da <strong>Performance Teste</strong>: mesmo quadro, mesmos filtros (competência, sistema, pagador, unidade, período), mesmo 012, mesma conta — o que muda lá muda aqui. Abertos em atraso vêm do 150 e a ocorrência 69 da aba Ocorrências.`;
    const avisoPT = (!G && D.extrasPT && D.extrasPT.length)
      ? `<div class="dr-aviso-pt">Filtros ativos na <strong>Performance Teste</strong> (os números daqui seguem exatamente o quadro dela): ${D.extrasPT.map(esc).join(" · ")}. <button type="button" class="link-btn" id="drLimpaPT">Limpar esses filtros</button></div>` : "";
    raiz().innerHTML = cabecalho(D, descTopo) + avisoPT + `
      <div class="dr-grid">
        <div class="dr-left">
          <div class="panel perf-gauge-panel dr-gauge">
            <div class="gauge-label">Performance ${G ? "Geral" : "Teste"} — ${esc(ST.sis ? SIS[ST.sis] : "VAL + RVA")}</div>
            ${window.gaugeSVG ? window.gaugeSVG(sla) : ""}
            <div class="gauge-pct ${kpiCls(sla)}">${fPct(sla)}</div>
            <div class="gauge-meta">Meta: 98%</div>
          </div>
          <div class="panel dr-rank">
            <div class="panel-header">Menores performances por unidade</div>
            ${rank.length ? `<ul>${rank.map(u => `<li><span class="dr-rk-un">${esc(u.sigla)}</span>
                <span class="dr-rk-bar"><i class="${kpiCls(u.sla)}" style="width:${Math.max(2, Math.min(100, u.sla))}%"></i></span>
                <b class="${kpiCls(u.sla)}">${fPct(u.sla)}</b></li>`).join("")}</ul>` : `<div class="empty">${G && !(D.geral && D.geral.tem) ? "Nenhum relatório importado na aba Performance Geral." : "Sem entregas baixadas nesta competência."}</div>`}
          </div>
        </div>
        <div class="dr-right">
          <div class="dr-cards">
            ${cartao("previstas", "Entregas previstas", t.exped, G ? "expedidas no relatório" : "previsão em " + esc(rotMes(ST.mes)), SL)}
            ${cartao("entregues", "Entregues", t.entregue, `${fInt(t.noPrazoEnt)} no prazo · ${fInt(t.foraDoPrazo)} fora`, SL)}
            ${cartao("entnoprazo", "Entregues no prazo", t.noPrazoEnt, `${fPct(pct(t.noPrazoEnt, t.entregue))} das entregues`, SL)}
            ${cartao("fora", "Fora do prazo", t.foraDoPrazo, `transportadora ${fInt(t.atrasTrans)} · cliente ${fInt(t.atrasCli)}${t.atrasPend ? " · a definir " + fInt(t.atrasPend) : ""}`, SL)}
            ${G ? "" : `${cartao("e12", "Entregues com até 2 dias de atraso", e12, `${fPct(pct(e12, t.foraDoPrazo))} dos fora do prazo`)}
            ${cartao("e35", "Entregues com 3 a 5 dias de atraso", e35, `${fPct(pct(e35, t.foraDoPrazo))} dos fora do prazo`)}
            ${cartao("e610", "Entregues com 6 a 10 dias de atraso", e610, `${fPct(pct(e610, t.foraDoPrazo))} dos fora do prazo`)}
            ${cartao("e10", "Entregues com +10 dias de atraso", e10, `${fPct(pct(e10, t.foraDoPrazo))} dos fora do prazo`)}`}
            ${cartao("noprazo", "Abertos no prazo", t.abertoNoPrazo, "ainda dentro da previsão", SL)}
            ${cartao("abtr", "Abertos · culpa transportadora", D.abTr.length, `${fPct(pct(D.abTr.length, D.ab.length))} dos abertos em atraso`)}
            ${cartao("abertos", "Abertos em atraso", D.ab.length, "da ocorrência 150" + (D.n150 ? "" : " (nenhum importado)"), { lupaTitulo: "Abrir os abertos em atraso" })}
        ${cartao("abcli", "Abertos · culpa cliente", D.abCli.length, `${fPct(pct(D.abCli.length, D.ab.length))} dos abertos em atraso`)}
        ${cartao("ab5", "Abertos há +5 dias", ab5, `${fPct(pct(ab5, D.ab.length))} dos abertos em atraso`)}
        ${cartao("ab10", "Pendências há +10 dias", ab10, `10 dias ou mais em aberto · ${fPct(pct(ab10, D.ab.length))} dos abertos`)}
        ${cartao("ab69", "Pendências · ocorrência 69", d69.length, d69.length ? `entrega realizada com ressalva · VAL ${fInt(v69)} · RVA ${fInt(r69)}` : "nenhuma importada na aba Ocorrências (código 69)")}
          </div>
        </div>
      </div>`;
    ligarGeral();
    raiz().querySelectorAll("[data-lupa]").forEach(b => b.addEventListener("click", () => {
      if(b.dataset.lupa === "abertos"){ ST.view = "abertos"; ST.unAb = ""; render(); topo(); }
      else abrirModal(b.dataset.lupa);
    }));
  }

  /* ---------- tela 2: abertos em atraso (só os documentos) ---------- */
  function renderAbertos(D){
    // unidades à esquerda (clicáveis); à direita os documentos da unidade escolhida
    const porUn = {};
    D.ab.forEach(d => { const u = d.r.u; const a = porUn[u] || (porUn[u] = { sigla: u, tr: 0, cli: 0 }); if(d.resp === "cliente") a.cli++; else a.tr++; });
    const lista = Object.values(porUn).sort((a, b) => (b.tr + b.cli) - (a.tr + a.cli) || a.sigla.localeCompare(b.sigla));
    if(ST.unAb && !porUn[ST.unAb]) ST.unAb = "";
    const max = Math.max(1, ...lista.map(u => u.tr + u.cli));
    const vis = D.ab.filter(d => !ST.unAb || d.r.u === ST.unAb);
    const tr = vis.filter(d => d.resp !== "cliente"), cli = vis.filter(d => d.resp === "cliente");
    const nDef = tr.filter(d => d.aDefinir).length;
    const nBaixa = D.abAll.filter(d => d.baixaOc && (!ST.unAb || d.r.u === ST.unAb)).length;
    raiz().innerHTML = cabecalho(D, `${fInt(D.ab.length)} documento(s) da ocorrência 150 (todos os importados) · ${esc(SIS[ST.sis])}${ST.unAb ? " · unidade <strong>" + esc(ST.unAb) + "</strong>" : ""}`) + `
      <div class="dr-ab">
        <aside class="panel dr-un">
          <div class="panel-header">Unidades</div>
          <button type="button" class="dr-un-item dr-un-todas ${ST.unAb ? "" : "on"}" data-un=""><span>Todas as unidades</span><b>${fInt(D.ab.length)}</b></button>
          <div class="dr-un-lista">
            ${lista.map(u => `<button type="button" class="dr-un-item ${ST.unAb === u.sigla ? "on" : ""}" data-un="${esc(u.sigla)}" title="${esc(u.sigla)}: transportadora ${u.tr} · cliente ${u.cli}">
              <span class="dr-un-nome">${esc(u.sigla)}</span><b>${fInt(u.tr + u.cli)}</b>
              <span class="dr-un-bar" style="width:${((u.tr + u.cli) / max * 100).toFixed(1)}%"><i class="t" style="flex:${u.tr}"></i><i class="c" style="flex:${u.cli}"></i></span>
            </button>`).join("") || `<div class="empty">Nenhum documento aberto em atraso.</div>`}
          </div>
          <div class="dr-un-leg"><span><i class="t"></i>Transportadora</span><span><i class="c"></i>Cliente</span></div>
        </aside>
        <div class="dr-ab-main">
          <div class="dr-resumo">
            <div class="dr-tile" style="--c:${COR.abertos.c}"><b>${fInt(vis.length)}</b><span>Abertos em atraso${ST.unAb ? " · " + esc(ST.unAb) : ""}</span></div>
            <div class="dr-tile" style="--c:${COR.abtr.c}"><b>${fInt(tr.length)}</b><span>Culpa da transportadora</span></div>
            <div class="dr-tile" style="--c:${COR.abcli.c}"><b>${fInt(cli.length)}</b><span>Culpa do cliente</span></div>
            <div class="dr-tile dr-tile-neutro"><b>${fInt(nBaixa)}</b><span>Com código de baixa (já contados)</span></div>
          </div>
          <p class="dr-vinculo ${D.n150 ? "" : "sem"}">${D.n150
            ? `Ligado à <strong>ocorrência 150</strong> pelo CTRC: <b>${fInt(D.via150)}</b> de ${fInt(D.ab.length)} documentos vêm do 150 (${fInt(D.n150)} importados no total). A culpa vem da aba <a href="#" data-view="ocor">Ocorrências · culpa</a>.`
            : `Nenhum relatório <strong>150</strong> importado ainda — os abertos em atraso vêm dele. Use <b>Importar ocorrência 150</b>.`}</p>
          <section class="panel dr-bloco dr-bloco-tr">
            <div class="panel-header dr-bloco-h"><span>Atrasos transportadora</span><b>${fInt(tr.length)}</b></div>
            ${nDef ? `<div class="dr-aviso"><b>${fInt(nDef)}</b> com código ainda sem culpa definida (etiqueta “a definir”) — contam aqui até você definir em <a href="#" data-view="ocor">Ocorrências · culpa</a>.</div>` : ""}
            ${tabelaAbertos(tr)}
          </section>
          <section class="panel dr-bloco dr-bloco-cli">
            <div class="panel-header dr-bloco-h"><span>Atraso cliente</span><b>${fInt(cli.length)}</b></div>
            ${tabelaAbertos(cli)}
          </section>
        </div>
      </div>`;
    ligarGeral();
    raiz().querySelectorAll("[data-un]").forEach(b => b.addEventListener("click", () => { ST.unAb = b.dataset.un; mantendoRolagem(() => render()); }));
    const imp = document.getElementById("drImportar");
    if(imp) imp.addEventListener("click", () => { if(typeof switchTab === "function"){ switchTab("ocorrencias"); if(typeof trocarAbaOcorrencias === "function") trocarAbaOcorrencias("atrasosDash"); } });
    const csv = document.getElementById("drAbCsv");
    if(csv) csv.addEventListener("click", () => baixarCsvAbertos(vis));
  }

  function celulaOc(d){
    if(!d.oc) return `<span class="dr-oc-vazio">sem código</span>`;
    return `<b class="dr-oc-cod">${esc(d.oc.cod)}</b><span class="dr-oc-txt">${esc(d.oc.descr || "—")}</span>`;
  }

  function tabelaAbertos(docs){
    if(!docs.length) return `<div class="empty dr-vazio">Nenhum documento.</div>`;
    const ord = docs.slice().sort((a, b) => b.dias - a.dias || a.r.u.localeCompare(b.r.u));
    const mostrar = ord.slice(0, LIM_LISTA);
    return `<div class="dr-scroll"><table class="dr-table">
      <colgroup><col style="width:196px"><col style="width:78px"><col style="width:48px"><col><col><col style="width:11%"><col style="width:22%"><col style="width:98px"><col style="width:58px"></colgroup>
      <thead><tr><th>CTRC</th><th>NF</th><th>Un.</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Ocorrência</th><th>Previsão</th><th class="r">Dias</th></tr></thead>
      <tbody>${mostrar.map(d => { const r = d.r; return `<tr>
        <td class="dr-ctrc" title="${esc(r.x || r.k)}">${ST.sis ? "" : `<span class="pt-tag pt-tag-${esc(r.s || "")}">${esc(r.s || "")}</span> `}${esc(r.x || r.k)}${d.aDefinir ? ` <span class="dr-tag-def">a definir</span>` : ""}</td>
        <td title="${esc(r.n)}">${esc(r.n)}</td><td><b>${esc(r.u)}</b></td>
        <td title="${esc(r.r)}">${esc(r.r)}</td><td title="${esc(r.t)}">${esc(r.t)}</td><td title="${esc(r.y)}">${esc(r.y)}</td>
        <td class="dr-oc" title="${esc(d.oc ? d.oc.cod + " · " + (d.oc.descr || "") + " · culpa: " + (ROT_VIA[d.via] || "") : "")}">${celulaOc(d)}</td>
        <td>${br(r.p)}</td>
        <td class="r"><span class="dr-dias ${d.dias >= 10 ? "g" : d.dias >= 5 ? "m" : ""}">${d.dias}</span></td></tr>`; }).join("")}</tbody></table></div>
      ${ord.length > LIM_LISTA ? `<div class="footer-note">Mostrando os ${fInt(LIM_LISTA)} mais atrasados de ${fInt(ord.length)}. O CSV leva todos.</div>` : ""}`;
  }

  function baixarCsvAbertos(docs){
    const cel = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const linhas = [["Culpa","Sistema","CTRC","NF","Unidade","Remetente","Destinatario","Cidade","Previsao","Dias","Cod. ocorrencia","Descr. ocorrencia","Origem da culpa"].map(cel).join(";")]
      .concat(docs.slice().sort((a, b) => (a.resp === "cliente") - (b.resp === "cliente") || b.dias - a.dias).map(d => { const r = d.r; return [d.resp === "cliente" ? "Cliente" : "Transportadora", r.s, r.x || r.k, r.n, r.u, r.r, r.t, r.y, br(r.p), d.dias, d.oc ? d.oc.cod : "", d.oc ? d.oc.descr : "", ROT_VIA[d.via] || ""].map(cel).join(";"); }));
    baixar("rede-abertos-em-atraso.csv", linhas);
  }
  function baixar(nome, linhas){
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- tela 3: ocorrências · culpa ---------- */
  const OPC = [["transp", "Transportadora"], ["cliente", "Cliente"], ["baixa", "Baixa"], ["definir", "A definir"]];

  // todos os códigos: os da tabela (padrão + criados) e os que aparecem nos abertos em atraso, com a quantidade de documentos
  function codigosOcor(D){
    const m = new Map();
    OC().codigos().forEach(x => m.set(x.cod, Object.assign({ n: 0 }, x)));
    let semCod = 0;
    D.abAll.forEach(d => {
      if(!d.oc){ semCod++; return; }
      let x = m.get(d.oc.cod);
      if(!x){ x = { cod: d.oc.cod, descr: d.oc.descr || "", tipo: "", culpa: "", padrao: null, editado: false, novo: true, n: 0 }; m.set(x.cod, x); }
      x.n++; if(!x.descr && d.oc.descr) x.descr = d.oc.descr;
    });
    const lista = Array.from(m.values()).sort((a, b) => b.n - a.n || a.cod.localeCompare(b.cod, "pt-BR", { numeric: true }));
    return { lista, semCod };
  }

  function renderOcor(D){
    const { lista, semCod } = codigosOcor(D);
    const comDoc = lista.filter(x => x.n > 0);
    const pend = lista.filter(x => !x.culpa);
    const pendDoc = pend.reduce((a, x) => a + x.n, 0);
    const ver = ST.ocVer;
    const vis = lista.filter(x => ver === "definir" ? !x.culpa : ver === "docs" ? x.n > 0 : true);
    const rotCul = v => v === "transp" ? "Transportadora" : v === "cliente" ? "Cliente" : v === "baixa" ? "Baixa" : "";

    raiz().innerHTML = cabecalho(D, `Defina, para cada <strong>código de ocorrência</strong>, de quem é a culpa. É isso que separa os <strong>Abertos em atraso</strong> entre transportadora e cliente.`) + `
      <div class="dr-resumo">
        <div class="dr-tile dr-tile-neutro"><b>${fInt(lista.length)}</b><span>Códigos listados</span></div>
        <div class="dr-tile" style="--c:${COR.entregues.c};--cs:${COR.entregues.s}"><b>${fInt(lista.length - pend.length)}</b><span>Com culpa definida</span></div>
        <div class="dr-tile" style="--c:${COR.fora.c};--cs:${COR.fora.s}"><b>${fInt(pend.length)}</b><span>A definir${pendDoc ? ` · ${fInt(pendDoc)} documento(s)` : ""}</span></div>
        <div class="dr-tile" style="--c:${COR.abertos.c};--cs:${COR.abertos.s}"><b>${fInt(comDoc.reduce((a, x) => a + x.n, 0))}</b><span>Docs abertos em atraso (${fInt(comDoc.length)} códigos)</span></div>
      </div>
      <div class="dr-legenda">
        <span><i class="k-transp"></i><b>Transportadora</b> atraso por culpa da transportadora</span>
        <span><i class="k-cliente"></i><b>Cliente</b> atraso por culpa do cliente</span>
        <span><i class="k-baixa"></i><b>Baixa</b> o código encerra o documento — ele sai de Abertos em atraso</span>
        <span><i class="k-definir"></i><b>A definir</b> ainda sem culpa (aparece em Transportadora com a etiqueta “a definir”)</span>
      </div>
      <section class="panel">
        <div class="panel-header dr-bloco-h"><span>Códigos de ocorrência</span><b>${fInt(vis.length)}</b></div>
        <div class="dr-toolbar">
          <div class="dr-seg" role="tablist" aria-label="Mostrar">
            <button type="button" data-ocver="todos" class="${ver === "todos" ? "on" : ""}">Todos</button>
            <button type="button" data-ocver="definir" class="${ver === "definir" ? "on" : ""}">Só a definir (${fInt(pend.length)})</button>
            <button type="button" data-ocver="docs" class="${ver === "docs" ? "on" : ""}">Só com documentos (${fInt(comDoc.length)})</button>
          </div>
          <input type="search" id="drOcBusca" class="small-input" placeholder="Buscar código ou descrição">
          <span class="dr-toolbar-r">
            <button type="button" class="btn btn-ghost btn-sm" id="drOcNovo">+ Novo código</button>
            <button type="button" class="btn btn-ghost btn-sm" id="drOcPadrao" ${OC().qtdAjustes() ? "" : "disabled"} title="Desfaz todos os ajustes e volta à tabela do arquivo">Voltar ao padrão</button>
          </span>
        </div>
        <form class="dr-novo" id="drOcForm" style="display:none">
          <input type="text" id="drOcFCod" class="small-input" placeholder="Código (ex.: 74)" maxlength="4" required>
          <input type="text" id="drOcFDesc" class="small-input" placeholder="Descrição (opcional)">
          <select id="drOcFCul" class="small-select"><option value="transp">Transportadora</option><option value="cliente">Cliente</option><option value="baixa">Baixa</option><option value="definir">A definir</option></select>
          <button type="submit" class="btn btn-primary btn-sm">Salvar</button>
        </form>
        <div class="dr-scroll dr-scroll-ocor"><table class="dr-table dr-table-oc">
          <colgroup><col style="width:70px"><col><col style="width:110px"><col style="width:400px"><col style="width:130px"></colgroup>
          <thead><tr><th>Código</th><th>Descrição</th><th class="r">Docs abertos</th><th>Culpa</th><th>Origem</th></tr></thead>
          <tbody>${vis.length ? vis.map(x => `<tr data-txt="${esc((x.cod + " " + x.descr).toLowerCase())}" class="${x.culpa ? "" : "pend"}">
            <td><b class="dr-oc-cod">${esc(x.cod)}</b></td>
            <td title="${esc(x.descr)}">${esc(x.descr || "—")}${x.padrao && x.editado && x.padrao !== x.culpa ? `<small>padrão: ${esc(rotCul(x.padrao))}</small>` : ""}</td>
            <td class="r">${x.n ? `<b>${fInt(x.n)}</b>` : `<span class="dr-oc-vazio">—</span>`}</td>
            <td><div class="dr-culpa" role="radiogroup" aria-label="Culpa do código ${esc(x.cod)}">${OPC.map(o => `<button type="button" role="radio" aria-checked="${(x.culpa || "definir") === o[0]}" class="k-${o[0]} ${(x.culpa || "definir") === o[0] ? "on" : ""}" data-cod="${esc(x.cod)}" data-culpa="${o[0]}" data-descr="${esc(x.descr)}">${o[1]}</button>`).join("")}</div></td>
            <td class="dr-orig">${x.novo ? "fora da tabela" : x.editado ? "ajustado" : "tabela padrão"}${x.editado ? ` <button type="button" class="link-btn" data-volta="${esc(x.cod)}" title="${x.novo ? "Remover este ajuste" : "Voltar ao padrão do arquivo"}">↺</button>` : ""}</td>
          </tr>`).join("") : `<tr><td colspan="5" class="empty">Nenhum código nesta lista.</td></tr>`}</tbody></table></div>
        ${semCod ? `<div class="footer-note">${fInt(semCod)} documento(s) aberto(s) em atraso estão sem código de ocorrência (nem no 150 nem na base) — não dá para separar por código.</div>` : ""}
      </section>`;
    ligarGeral();
    const w = raiz();
    w.querySelectorAll("[data-ocver]").forEach(b => b.addEventListener("click", () => { ST.ocVer = b.dataset.ocver; render(); }));
    const busca = document.getElementById("drOcBusca");
    busca.addEventListener("input", () => {                         // só esconde linhas (não redesenha)
      const q = busca.value.trim().toLowerCase();
      w.querySelectorAll(".dr-table-oc tbody tr[data-txt]").forEach(tr => { tr.hidden = !!q && tr.dataset.txt.indexOf(q) === -1; });
    });
    const form = document.getElementById("drOcForm");
    document.getElementById("drOcNovo").addEventListener("click", () => { form.style.display = form.style.display === "none" ? "" : "none"; if(form.style.display !== "none") document.getElementById("drOcFCod").focus(); });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const c = OC().cod(document.getElementById("drOcFCod").value);
      if(!c) return;
      OC().definir(c, document.getElementById("drOcFCul").value, document.getElementById("drOcFDesc").value);
      mantendoRolagem(() => render());
    });
    document.getElementById("drOcPadrao").addEventListener("click", () => {
      if(confirm("Voltar todos os códigos ao padrão do arquivo? Os ajustes e os códigos criados por você serão apagados.")){ OC().restaurar(); mantendoRolagem(() => render()); }
    });
    w.querySelectorAll(".dr-culpa button").forEach(b => b.addEventListener("click", () => {
      OC().definir(b.dataset.cod, b.dataset.culpa, b.dataset.descr);
      mantendoRolagem(() => render());
    }));
    w.querySelectorAll("[data-volta]").forEach(b => b.addEventListener("click", () => { OC().voltarAoPadrao(b.dataset.volta); mantendoRolagem(() => render()); }));
  }

  // redesenha sem deixar a página "pular" (guarda a rolagem da janela e do contêiner que rola)
  function mantendoRolagem(fn){
    const pais = [];
    for(let el = raiz(); el; el = el.parentElement){ if(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) pais.push([el, el.scrollTop]); }
    const y = window.scrollY, sc = (document.querySelector(".dr-scroll-ocor") || {}).scrollTop || 0, su = (document.querySelector(".dr-un-lista") || {}).scrollTop || 0;
    fn();
    pais.forEach(p => { p[0].scrollTop = p[1]; });
    window.scrollTo(0, y);
    const n = document.querySelector(".dr-scroll-ocor"); if(n) n.scrollTop = sc;
    const u = document.querySelector(".dr-un-lista"); if(u) u.scrollTop = su;
  }

  /* ---------- janela com a lista de documentos (lupa) ---------- */
  const aberto = d => d.sit === "Aberto atrasado";
  const MODAIS = {
    previstas: { t: "Entregas previstas", f: d => true },
    entregues: { t: "Entregues", f: d => /^Entregue|^Atraso/.test(d.sit) },
    entnoprazo: { t: "Entregues no prazo", f: d => d.sit === "Entregue no prazo" },
    fora: { t: "Fora do prazo", f: d => /^Atraso/.test(d.sit) },
    mais2: { t: "Entregues com +2 dias de atraso", f: d => /^Atraso/.test(d.sit) && Number(d.dias) > 2, dias: true },
    abertos: { src: "ab", t: "Abertos em atraso", f: aberto, oc: true, dias: true },
    e12: { t: "Entregues com até 2 dias de atraso", f: d => /^Atraso/.test(d.sit) && Number(d.dias) >= 1 && Number(d.dias) <= 2, dias: true },
    e35: { t: "Entregues com 3 a 5 dias de atraso", f: d => /^Atraso/.test(d.sit) && Number(d.dias) >= 3 && Number(d.dias) <= 5, dias: true },
    e610: { t: "Entregues com 6 a 10 dias de atraso", f: d => /^Atraso/.test(d.sit) && Number(d.dias) >= 6 && Number(d.dias) <= 10, dias: true },
    e10: { t: "Entregues com +10 dias de atraso", f: d => /^Atraso/.test(d.sit) && Number(d.dias) > 10, dias: true },
    ab69: { src: "d69", t: "Pendências · ocorrência 69 (entrega realizada com ressalva)", f: d => true, oc: true },
    abtr: { src: "ab", t: "Abertos em atraso · culpa transportadora", f: d => aberto(d) && d.resp !== "cliente", oc: true, dias: true },
    abcli: { src: "ab", t: "Abertos em atraso · culpa cliente", f: d => aberto(d) && d.resp === "cliente", oc: true, dias: true },
    ab5: { src: "ab", t: "Abertos há +5 dias", f: d => aberto(d) && d.dias >= 5, oc: true, dias: true },
    ab10: { src: "ab", t: "Pendências há +10 dias (10 dias ou mais em aberto)", f: d => aberto(d) && d.dias >= 10, oc: true, dias: true },
    noprazo: { t: "Abertos no prazo", f: d => d.sit === "Aberto no prazo" }
  };
  function abrirModal(id){ ST.modal = id; ST.mBusca = ""; desenharModal(); }
  function fecharModal(){ ST.modal = null; const m = document.getElementById("drModal"); if(m) m.remove(); document.removeEventListener("keydown", escModal); }
  function escModal(e){ if(e.key === "Escape") fecharModal(); }

  function desenharModal(){
    const cfg = MODAIS[ST.modal]; if(!cfg) return;
    const D = dados(); if(!D) return;
    const busca = ST.mBusca.trim().toLowerCase();
    let docs = (cfg.src === "ab" ? D.ab : cfg.src === "abAll" ? D.abAll : cfg.src === "d69" ? D.d69 : D.docs).filter(cfg.f);
    const total = docs.length;
    if(busca) docs = docs.filter(d => [d.r.k, d.r.x, d.r.n, d.r.r, d.r.t, d.r.y, d.r.u, d.oc && d.oc.cod, d.oc && d.oc.descr].some(v => String(v || "").toLowerCase().indexOf(busca) !== -1));
    docs.sort((a, b) => (a.r.p < b.r.p ? -1 : a.r.p > b.r.p ? 1 : a.r.k.localeCompare(b.r.k)));
    const mostrar = docs.slice(0, LIM_LISTA);
    let m = document.getElementById("drModal");
    if(!m){ m = document.createElement("div"); m.id = "drModal"; m.className = "dr-modal"; document.body.appendChild(m); document.addEventListener("keydown", escModal); }
    m.innerHTML = `<div class="dr-modal-box" role="dialog" aria-modal="true" aria-label="${esc(cfg.t)}">
      <div class="dr-modal-h"><div><small>Documentos · ${esc(rotMes(ST.mes))} · ${esc(SIS[ST.sis])}</small><h3>${esc(cfg.t)} — ${fInt(total)}</h3></div>
        <button type="button" class="dr-x" id="drMFechar" aria-label="Fechar">${ICO.x}</button></div>
      <div class="dr-modal-bar"><input type="search" id="drMBusca" class="small-input" placeholder="Buscar CTRC, NF, cliente, cidade, unidade${cfg.oc ? ", ocorrência" : ""}" value="${esc(ST.mBusca)}">
        <button type="button" class="btn btn-ghost btn-sm" id="drMCsv">Baixar CSV</button></div>
      <div class="dr-modal-tab">${mostrar.length ? `<table class="dr-table dr-table-modal">
        <thead><tr><th>CTRC</th><th>NF</th><th>Un.</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Previsão</th><th>Baixa</th>${cfg.dias ? `<th class="r">Dias</th>` : ""}${cfg.oc ? `<th>Ocorrência</th>` : `<th>Situação</th>`}</tr></thead>
        <tbody>${mostrar.map(d => { const r = d.r; return `<tr><td class="dr-ctrc">${ST.sis ? "" : `<span class="pt-tag pt-tag-${esc(r.s || "")}">${esc(r.s || "")}</span> `}${esc(r.x || r.k)}</td>
          <td>${esc(r.n)}</td><td><b>${esc(r.u)}</b></td><td>${esc(r.r)}</td><td>${esc(r.t)}</td><td>${esc(r.y)}</td><td>${br(r.p)}</td><td>${r.e ? br(r.e) : "—"}</td>
          ${cfg.dias ? `<td class="r"><span class="dr-dias ${d.dias >= 10 ? "g" : d.dias >= 5 ? "m" : ""}">${d.dias}</span></td>` : ""}
          ${cfg.oc ? `<td class="dr-oc">${celulaOc(d)}</td>` : `<td>${esc(d.sit)}</td>`}</tr>`; }).join("")}</tbody></table>` : `<div class="empty">Nenhum documento.</div>`}</div>
      <div class="footer-note">${docs.length > LIM_LISTA ? `Mostrando os primeiros ${fInt(LIM_LISTA)} de ${fInt(docs.length)} — o CSV leva todos. ` : ""}${docs.length !== total ? `${fInt(docs.length)} de ${fInt(total)} na busca.` : ""}</div>
    </div>`;
    m.onclick = e => { if(e.target === m) fecharModal(); };
    document.getElementById("drMFechar").onclick = fecharModal;
    document.getElementById("drMBusca").addEventListener("input", e => {
      ST.mBusca = e.target.value; const pos = e.target.selectionStart; desenharModal();
      const n = document.getElementById("drMBusca"); if(n){ n.focus(); try{ n.setSelectionRange(pos, pos); }catch(_){} }
    });
    document.getElementById("drMCsv").onclick = () => baixarCsv(cfg.t, docs);
  }

  function baixarCsv(titulo, docs){
    const cel = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const linhas = [["Sistema","CTRC","NF","Unidade","Remetente","Destinatario","Cidade","Previsao","Baixa","Dias","Situacao","Cod. ocorrencia","Descr. ocorrencia"].map(cel).join(";")]
      .concat(docs.map(d => { const r = d.r; return [r.s, r.x || r.k, r.n, r.u, r.r, r.t, r.y, br(r.p), r.e ? br(r.e) : "", d.dias, d.sit, d.oc ? d.oc.cod : "", d.oc ? d.oc.descr : ""].map(cel).join(";"); }));
    baixar("rede-" + titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv", linhas);
  }

  /* ---------- filtros Pagador / Unidade ---------- */
  function ligarMulti(kind, atual, set){
    const det = raiz().querySelector('details.dr-det[data-kind="' + kind + '"]'); if(!det) return;
    const lista = det.querySelector(".dr-mlista"), q = det.querySelector(".dr-mq");
    det.addEventListener("toggle", () => { ST.abre[kind] = det.open; });
    const filtra = () => {
      const t = semAc(q.value).split(";").map(x => x.trim()).filter(Boolean);
      lista.querySelectorAll("label").forEach(l => { l.hidden = t.length > 0 && !t.some(x => l.dataset.n.indexOf(x) !== -1); });
      ST.q[kind] = q.value;
    };
    q.addEventListener("input", filtra); filtra();
    const aplicar = arr => {
      set(arr); salvarUI(); empurrarParaPT();
      const sc = lista.scrollTop;
      render();
      const nova = raiz() && raiz().querySelector('details.dr-det[data-kind="' + kind + '"] .dr-mlista'); if(nova) nova.scrollTop = sc;
    };
    lista.addEventListener("change", () => aplicar(Array.from(lista.querySelectorAll("input:checked")).map(x => x.value)));
    det.querySelector("[data-mvis]").addEventListener("click", () => {
      const S = new Set(atual); lista.querySelectorAll("label:not([hidden]) input").forEach(i => S.add(i.value)); aplicar(Array.from(S));
    });
    det.querySelector("[data-mnada]").addEventListener("click", () => aplicar([]));
  }
  if(!window.__drMultiFecha){ window.__drMultiFecha = true; document.addEventListener("click", e => { document.querySelectorAll("details.dr-det[open]").forEach(d => { if(!d.contains(e.target)){ d.open = false; } }); }); }

  /* ---------- geral ---------- */
  function ligarGeral(){
    const w = raiz();
    const mes = document.getElementById("drMes");
    if(mes) mes.addEventListener("change", () => { ST.mes = mes.value; salvarUI(); empurrarParaPT(); render(); });
    ligarMulti("pag", ST.pag, v => { ST.pag = v; });
    ligarMulti("un", ST.unF, v => { ST.unF = v; });
    const lf = document.getElementById("drLimparF");
    if(lf) lf.addEventListener("click", () => { ST.pag = []; ST.unF = []; ST.q = {}; salvarUI(); empurrarParaPT(); render(); });
    const lpt = document.getElementById("drLimpaPT");
    if(lpt) lpt.addEventListener("click", () => { if(window.PTDados && window.PTDados.limparFiltrosQuadro) window.PTDados.limparFiltrosQuadro(); render(); });
    w.querySelectorAll("[data-fonte]").forEach(b => b.addEventListener("click", () => { ST.fonte = b.dataset.fonte; salvarUI(); render(); }));
    w.querySelectorAll("[data-sis]").forEach(b => b.addEventListener("click", () => { ST.sis = b.dataset.sis; salvarUI(); empurrarParaPT(); render(); }));
    w.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); if(ST.view !== b.dataset.view){ ST.view = b.dataset.view; if(ST.view !== "abertos") ST.unAb = ""; render(); topo(); } }));
  }

  function render(){
    const w = raiz(); if(!w) return;
    const D = dados();
    if(!D){
      const pronto = window.PTDados && window.PTDados.pronto();
      w.innerHTML = `<div class="dr-head"><div><h2 class="section-title">Dashboard · Rede do Valle</h2></div></div>
        <div class="panel"><div class="empty">${pronto ? "Nenhuma base de entregas importada ainda.<br>Importe a planilha por previsão de entrega (e os relatórios 012) na aba <b>Performance Teste</b> — este dashboard usa os mesmos dados." : "Carregando dados da Performance Teste…"}</div></div>`;
      return;
    }
    if(ST.view === "abertos") renderAbertos(D); else if(ST.view === "ocor") renderOcor(D); else renderHome(D);
    if(ST.modal) desenharModal();
  }

  window.dashRedeHTML = () => `<div id="drWrap" class="dr-wrap"></div>`;
  window.attachDashRede = () => render();
  window.dashRedeRefresh = () => { if(!ST.modal) render(); };
})();
