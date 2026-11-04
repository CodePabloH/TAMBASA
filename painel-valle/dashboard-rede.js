/* ===================== DASHBOARD · REDE DO VALLE =====================
   Painel resumido da Rede (VAL + RVA), LIGADO à "Performance Teste": usa a mesma base, o mesmo 012
   e o mesmo cálculo (window.PTDados, definido em performance-teste.js). Nada é recalculado aqui por outra regra.

   Tela 1 (visão geral): medidor de performance (mesmo desenho da Performance Teste) + cartões com lupa
          (Entregas previstas, Entregues, Fora do prazo, Abertos em atraso, Aberto no prazo).
          A lupa abre a lista de documentos do cartão.
   Tela 2 (Abertos em atraso): filtro por unidade à esquerda com mini-gráfico por unidade;
          à direita, em cima "Atrasos transportadora" (área grande) e embaixo "Atraso cliente".

   Abertos em atraso: cada documento é ligado pelo CTRC ao relatório 150 (Ocorrências > código 150) e a culpa
   (transportadora x cliente) vem do COD_OCORRENCIA pela tabela de ocorrencias-culpa.js. Ordem: definido à mão >
   código do 150 > código da base > 012. O que ficar sem culpa definida vai para "Transportadora" com a etiqueta "a definir".
   Cada bloco pode ser separado por código de ocorrência (botões com a quantidade).
   Estado da tela (mês, sistema) fica em localStorage "valle_dash_rede_ui_v1". */
(function(){
  "use strict";

  const KUI = "valle_dash_rede_ui_v1";
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const SIS = { "": "Geral", VAL: "Do Valle", RVA: "Real Vale" };
  const LIM_LISTA = 500;

  const ST = { mes: null, sis: "", view: "home", un: "", busca: "", modal: null, mBusca: "", ocTr: "", ocCli: "" };
  try{ const u = JSON.parse(LS.getItem(KUI) || "null"); if(u){ if(typeof u.mes === "string") ST.mes = u.mes; if(u.sis in SIS) ST.sis = u.sis; } }catch(e){}
  const salvarUI = () => { try{ LS.setItem(KUI, JSON.stringify({ mes: ST.mes, sis: ST.sis })); }catch(e){} };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fInt = n => Math.round(n || 0).toLocaleString("pt-BR");
  const fPct = v => (v === null || v === undefined) ? "-" : v.toFixed(1).replace(".", ",") + "%";
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
    imp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>'
  };

  /* ---------- vínculo com a ocorrência 150 (Documentos em atraso) ---------- */
  const KATRASOS = "tambasa_documentos_atraso";                       // mesma lista da aba Ocorrências > código 150
  const chaveDoc = s => String(s == null ? "" : s).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  function indice150(){
    let lista = [];
    try{ lista = JSON.parse(LS.getItem(KATRASOS) || "[]") || []; }catch(e){}
    const m = new Map();
    lista.forEach(a => {
      const k = chaveDoc(a.ctrc); if(!k) return;
      const o = { cod: window.OcorCulpa ? OcorCulpa.cod(a.codOcorrencia) : String(a.codOcorrencia || "").trim(), descr: a.descrOcorrencia || "", dias: a.diasAtraso };
      m.set((a.origem || "") + ":" + k, o);
      if(!m.has(":" + k)) m.set(":" + k, o);                          // sem sistema: vale pelo CTRC
    });
    return { m, total: lista.length };
  }
  // quem é o responsável por um documento ABERTO em atraso.
  // Ordem: 1) definido à mão  2) código da ocorrência 150 + tabela de culpa  3) código da base (se a tabela conhece)  4) 012  5) a definir
  function culpaAberto(D, r, idx){
    const man = D.manual ? D.manual(r) : "";
    const k = chaveDoc(r.x || r.k);
    const h = idx.m.get((r.s || "") + ":" + k) || idx.m.get(":" + k) || null;
    const fonte = h ? "150" : "base";
    const cod = h ? h.cod : (r.c || "");
    const info = window.OcorCulpa ? OcorCulpa.info(cod) : null;
    const oc = cod ? { cod: info ? info.cod : cod, descr: (h && h.descr) || (info ? info.descr : ""), fonte, conhecido: !!info } : null;
    if(man === "cliente" || man === "transp") return { resp: man, oc, via: "manual", aDefinir: false };
    if(info && info.culpa === "baixa") return { resp: "transp", oc, via: "baixa", aDefinir: false, baixaOc: true };   // código de baixa: não é documento aberto
    if(info && (info.culpa === "cliente" || info.culpa === "transp")) return { resp: info.culpa, oc, via: fonte, aDefinir: false };
    const x = D.responsavel(r);                                       // 012
    if(x === "cliente" || x === "transp") return { resp: x, oc, via: "012", aDefinir: false };
    return { resp: "transp", oc, via: "sem", aDefinir: true };
  }
  const ROT_VIA = { "150": "ocorrência 150", base: "código da base", manual: "definido à mão", "012": "relatório 012", baixa: "código de baixa", sem: "sem código na tabela" };

  /* ---------- dados ---------- */
  let CACHE = null;   // { chave, res, docs, unid }
  function dados(){
    const D = window.PTDados;
    if(!D || !D.pronto() || !D.temBase()) return null;
    const meses = D.meses();
    if(ST.mes === null || (ST.mes !== "" && meses.indexOf(ST.mes) === -1)) ST.mes = D.mesPadrao();
    const res = D.calcular({ mes: ST.mes, sistema: ST.sis });
    const hoje = hojeISO();
    const idx150 = indice150();
    const docs = res.detalhe.map(d => {
      const r = d.r;
      let resp = d.resp, oc = null, via = "", baixaOc = false;
      if(d.situacao === "Aberto atrasado"){
        const v = culpaAberto(D, r, idx150); resp = v.resp; oc = v.oc; via = v.via; baixaOc = !!v.baixaOc; d.aDefinir = v.aDefinir;
      }
      return { r, sit: d.situacao, resp, oc, via, baixaOc, aDefinir: !!d.aDefinir, dias: d.situacao === "Aberto atrasado" ? Math.max(1, diasEntre(r.p, hoje)) : (r.d === null || r.d === undefined ? "" : r.d) };
    });
    // unidades (VAL + RVA juntas pela sigla)
    const m = {};
    res.unidades.forEach(u => {
      const a = m[u.sigla] || (m[u.sigla] = { sigla: u.sigla, exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, atrasPend: 0, abertoAtrasado: 0, abertoNoPrazo: 0 });
      ["exped","entregue","noPrazoEnt","atrasCli","atrasTrans","atrasPend","abertoAtrasado","abertoNoPrazo"].forEach(k => a[k] += u[k] || 0);
    });
    const unid = Object.values(m).map(a => Object.assign(a, { sla: PTCore.calcPerformance(a.noPrazoEnt, a.atrasCli, a.entregue) }));
    return { meses, res, docs, unid, tot: res.totais, n150: idx150.total, nBaixaOc: docs.filter(d => d.baixaOc).length };
  }

  /* ---------- helpers de tela ---------- */
  function cartao(id, rotulo, valor, cls, sub, opt){
    opt = opt || {};
    return `<div class="dr-card dr-${cls}">
      <div class="dr-card-top"><span>${esc(rotulo)}</span>
        <button type="button" class="dr-lupa" data-lupa="${id}" title="${esc(opt.lupaTitulo || "Ver os documentos")}" aria-label="Ver os documentos: ${esc(rotulo)}">${ICO.lupa}</button></div>
      <div class="dr-card-val">${fInt(valor)}</div>
      <div class="dr-card-sub">${sub || ""}</div>
    </div>`;
  }

  function filtrosHTML(D){
    return `<div class="dr-filtros">
      <label>Competência
        <select class="small-select" id="drMes">${["", ...D.meses].map(m => `<option value="${m}" ${ST.mes === m ? "selected" : ""}>${esc(rotMes(m))}</option>`).join("")}</select>
      </label>
      <div class="dr-seg" role="tablist" aria-label="Sistema">
        ${Object.keys(SIS).map(k => `<button type="button" role="tab" data-sis="${k}" class="${ST.sis === k ? "on" : ""}">${k ? `<b>${k}</b> ` : ""}${SIS[k]}</button>`).join("")}
      </div>
    </div>`;
  }

  /* ---------- tela 1: visão geral ---------- */
  function renderHome(D){
    const t = D.tot, sla = t.sla;
    const rank = D.unid.filter(u => u.sla !== null && u.entregue > 0).sort((a, b) => a.sla - b.sla).slice(0, 8);
    raiz().innerHTML = `
      <div class="dr-head">
        <div><h2 class="section-title">Dashboard · Rede do Valle</h2>
          <p class="section-desc">Ligado à <strong>Performance Teste</strong>: mesma base, mesmo 012, mesma conta. Competência pela previsão de entrega · ${esc(SIS[ST.sis])}.</p></div>
        ${filtrosHTML(D)}
      </div>
      <div class="dr-grid">
        <div class="panel perf-gauge-panel dr-gauge">
          <div class="gauge-label">Performance — ${esc(ST.sis ? SIS[ST.sis] : "Geral")}</div>
          ${window.gaugeSVG ? window.gaugeSVG(sla) : ""}
          <div class="gauge-pct ${kpiCls(sla)}">${fPct(sla)}</div>
          <div class="gauge-meta">Meta: 98%</div>
        </div>
        <div class="dr-cards">
          ${cartao("previstas", "Entregas previstas", t.exped, "navy", "previsão em " + esc(rotMes(ST.mes)))}
          ${cartao("entregues", "Entregues", t.entregue, "green", fInt(t.noPrazoEnt) + " no prazo")}
          ${cartao("fora", "Fora do prazo", t.foraDoPrazo, "amber", `transportadora ${fInt(t.atrasTrans)} · cliente ${fInt(t.atrasCli)}${t.atrasPend ? " · a definir " + fInt(t.atrasPend) : ""}`)}
          ${cartao("abertos", "Abertos em atraso", t.abertoAtrasado - D.nBaixaOc, "red", "clique na lupa para detalhar por unidade", { lupaTitulo: "Abrir os abertos em atraso" })}
          ${cartao("noprazo", "Abertos no prazo", t.abertoNoPrazo, "navy", "ainda dentro da previsão")}
        </div>
        <div class="panel dr-rank">
          <div class="panel-header">Menores performances por unidade</div>
          ${rank.length ? `<ul>${rank.map(u => `<li><span class="dr-rk-un">${esc(u.sigla)}</span>
              <span class="dr-rk-bar"><i class="${kpiCls(u.sla)}" style="width:${Math.max(2, Math.min(100, u.sla))}%"></i></span>
              <b class="${kpiCls(u.sla)}">${fPct(u.sla)}</b></li>`).join("")}</ul>` : `<div class="empty">Sem entregas baixadas nesta competência.</div>`}
        </div>
      </div>`;
    ligarFiltros();
    raiz().querySelectorAll("[data-lupa]").forEach(b => b.addEventListener("click", () => {
      if(b.dataset.lupa === "abertos"){ ST.view = "abertos"; ST.un = ""; render(); window.scrollTo(0, 0); }
      else abrirModal(b.dataset.lupa);
    }));
  }

  /* ---------- tela 2: abertos em atraso ---------- */
  function renderAbertos(D){
    const ab = D.docs.filter(d => d.sit === "Aberto atrasado" && !d.baixaOc);   // documento com código de baixa na tabela não entra
    const porUn = {};
    ab.forEach(d => { const u = d.r.u; const a = porUn[u] || (porUn[u] = { sigla: u, tr: 0, cli: 0 }); if(d.resp === "cliente") a.cli++; else a.tr++; });
    const lista = Object.values(porUn).sort((a, b) => (b.tr + b.cli) - (a.tr + a.cli) || a.sigla.localeCompare(b.sigla));
    if(ST.un && !porUn[ST.un]) ST.un = "";
    const max = Math.max(1, ...lista.map(u => u.tr + u.cli));
    const vis = ab.filter(d => !ST.un || d.r.u === ST.un);
    const trTodos = vis.filter(d => d.resp !== "cliente"), cliTodos = vis.filter(d => d.resp === "cliente");
    const nDef = trTodos.filter(d => d.aDefinir).length;
    const via150 = ab.filter(d => d.oc && d.oc.fonte === "150").length;
    const filtraOc = (lista, c) => c ? lista.filter(d => (d.oc ? d.oc.cod : "") === c) : lista;
    if(ST.ocTr && !trTodos.some(d => d.oc && d.oc.cod === ST.ocTr)) ST.ocTr = "";
    if(ST.ocCli && !cliTodos.some(d => d.oc && d.oc.cod === ST.ocCli)) ST.ocCli = "";
    const tr = filtraOc(trTodos, ST.ocTr), cli = filtraOc(cliTodos, ST.ocCli);

    raiz().innerHTML = `
      <div class="dr-head">
        <div class="dr-head-l">
          <button type="button" class="btn btn-ghost btn-sm dr-voltar" id="drVoltar">${ICO.voltar}<span>Voltar ao dashboard</span></button>
          <h2 class="section-title">Abertos em atraso</h2>
          <p class="section-desc">${fInt(ab.length)} documento(s) ainda sem baixa e com a previsão vencida · ${esc(rotMes(ST.mes))} · ${esc(SIS[ST.sis])}${ST.un ? " · unidade <strong>" + esc(ST.un) + "</strong>" : ""}</p>
          <p class="section-desc dr-vinculo ${D.n150 ? "" : "sem"}">${D.n150
            ? `Vínculo com a <strong>ocorrência 150</strong>: <b>${fInt(via150)}</b> de ${fInt(ab.length)} documento(s) encontrados no 150 (${fInt(D.n150)} importados). Culpa pela tabela de códigos.`
            : `Nenhum relatório <strong>150</strong> importado ainda — a separação usa o código da base e o 012. Importe o 150 para separar pela ocorrência.`}</p>
        </div>
        <div class="dr-head-r">
          ${filtrosHTML(D)}
          <button type="button" class="btn btn-ghost btn-sm dr-import" id="drImportar" title="Abre Ocorrências > código 150 para importar o relatório de documentos em atraso">${ICO.imp}<span>Importar ocorrência 150</span></button>
          <button type="button" class="btn btn-ghost btn-sm" id="drAbCsv" title="Baixa todos os documentos abertos em atraso (respeita a unidade selecionada), já separados por culpa">Baixar CSV</button>
        </div>
      </div>
      <div class="dr-ab">
        <aside class="panel dr-un">
          <div class="panel-header">Unidade</div>
          <button type="button" class="dr-un-item dr-un-todas ${ST.un ? "" : "on"}" data-un=""><span>Todas as unidades</span><b>${fInt(ab.length)}</b></button>
          <div class="dr-un-lista">
            ${lista.map(u => `<button type="button" class="dr-un-item ${ST.un === u.sigla ? "on" : ""}" data-un="${esc(u.sigla)}" title="${esc(u.sigla)}: transportadora ${u.tr} · cliente ${u.cli}">
              <span class="dr-un-nome">${esc(u.sigla)}</span><b>${fInt(u.tr + u.cli)}</b>
              <span class="dr-un-bar" style="width:${((u.tr + u.cli) / max * 100).toFixed(1)}%">
                <i class="t" style="flex:${u.tr}"></i><i class="c" style="flex:${u.cli}"></i></span>
            </button>`).join("") || `<div class="empty">Nenhum documento aberto em atraso.</div>`}
          </div>
          <div class="dr-un-leg"><span><i class="t"></i>Transportadora</span><span><i class="c"></i>Cliente</span></div>
        </aside>
        <div class="dr-ab-main">
          <section class="panel dr-bloco dr-bloco-tr">
            <div class="panel-header dr-bloco-h"><span>Atrasos transportadora</span><b>${fInt(tr.length)}</b></div>
            ${chipsOc(trTodos, "ocTr", ST.ocTr)}
            ${nDef ? `<div class="dr-aviso"><b>${fInt(nDef)}</b> com código fora da tabela de ocorrências (marcados “a definir”) — contam aqui até serem definidos.</div>` : ""}
            ${tabelaAbertos(tr)}
          </section>
          <section class="panel dr-bloco dr-bloco-cli">
            <div class="panel-header dr-bloco-h"><span>Atraso cliente</span><b>${fInt(cli.length)}</b></div>
            ${chipsOc(cliTodos, "ocCli", ST.ocCli)}
            ${tabelaAbertos(cli)}
          </section>
        </div>
      </div>`;
    ligarFiltros();
    document.getElementById("drVoltar").addEventListener("click", () => { ST.view = "home"; ST.un = ""; render(); });
    raiz().querySelectorAll("[data-un]").forEach(b => b.addEventListener("click", () => { ST.un = b.dataset.un; render(); }));
    raiz().querySelectorAll("[data-oc]").forEach(b => b.addEventListener("click", () => { ST[b.dataset.bloco] = b.dataset.oc; render(); }));
    const imp = document.getElementById("drImportar");
    if(imp) imp.addEventListener("click", () => { if(typeof switchTab === "function"){ switchTab("ocorrencias"); if(typeof trocarAbaOcorrencias === "function") trocarAbaOcorrencias("atrasosDash"); } });
    const csv = document.getElementById("drAbCsv");
    if(csv) csv.addEventListener("click", () => baixarCsvAbertos(vis));
  }

  // botões por código de ocorrência (com a quantidade), para separar o bloco por tipo
  function chipsOc(lista, bloco, sel){
    if(!lista.length) return "";
    const g = {};
    lista.forEach(d => { const c = d.oc ? d.oc.cod : ""; const a = g[c] || (g[c] = { cod: c, descr: d.oc ? d.oc.descr : "sem código", n: 0 }); a.n++; if(!a.descr && d.oc) a.descr = d.oc.descr; });
    const itens = Object.values(g).sort((a, b) => b.n - a.n || a.cod.localeCompare(b.cod));
    return `<div class="dr-chips" role="group" aria-label="Separar por ocorrência">
      <button type="button" class="dr-chip ${sel ? "" : "on"}" data-bloco="${bloco}" data-oc="">Todas <b>${fInt(lista.length)}</b></button>
      ${itens.map(a => `<button type="button" class="dr-chip ${sel === a.cod ? "on" : ""}" data-bloco="${bloco}" data-oc="${esc(a.cod)}" title="${esc(a.descr)}"><i>${esc(a.cod || "—")}</i> ${esc(abrevOc(a.descr))} <b>${fInt(a.n)}</b></button>`).join("")}
    </div>`;
  }
  const abrevOc = t => { t = String(t || "").trim(); return t.length > 26 ? t.slice(0, 25) + "…" : (t || "sem código"); };

  function baixarCsvAbertos(docs){
    const cel = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const linhas = [["Culpa","Sistema","CTRC","NF","Unidade","Remetente","Destinatario","Cidade","Previsao","Dias","Cod. ocorrencia","Descr. ocorrencia","Origem da culpa"].map(cel).join(";")]
      .concat(docs.map(d => { const r = d.r; return [d.resp === "cliente" ? "Cliente" : "Transportadora", r.s, r.x || r.k, r.n, r.u, r.r, r.t, r.y, br(r.p), d.dias, d.oc ? d.oc.cod : "", d.oc ? d.oc.descr : "", ROT_VIA[d.via] || ""].map(cel).join(";"); }));
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "rede-abertos-em-atraso.csv"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function celulaOc(d){
    if(!d.oc) return `<span class="dr-oc-vazio">—</span>`;
    return `<b class="dr-oc-cod">${esc(d.oc.cod)}</b> ${esc(d.oc.descr || "")}<small>${esc(ROT_VIA[d.via] || "")}</small>`;
  }

  function tabelaAbertos(docs){
    if(!docs.length) return `<div class="empty dr-vazio">Nenhum documento.</div>`;
    const ord = docs.slice().sort((a, b) => b.dias - a.dias || a.r.u.localeCompare(b.r.u));
    const mostrar = ord.slice(0, LIM_LISTA);
    return `<div class="table-wrap dr-tab"><table class="perf-table perf-table-simple pt-det-table">
      <thead><tr><th>CTRC</th><th>NF</th><th>Un.</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Ocorrência</th><th>Previsão</th><th>Dias</th></tr></thead>
      <tbody>${mostrar.map(d => { const r = d.r; return `<tr>
        <td>${ST.sis ? "" : `<span class="pt-tag pt-tag-${esc(r.s || "")}">${esc(r.s || "")}</span> `}${esc(r.x || r.k)}${d.aDefinir ? ` <span class="dr-tag-def">a definir</span>` : ""}</td>
        <td>${esc(r.n)}</td><td>${esc(r.u)}</td><td>${esc(r.r)}</td><td>${esc(r.t)}</td><td>${esc(r.y)}</td>
        <td class="dr-oc">${celulaOc(d)}</td><td>${br(r.p)}</td>
        <td><span class="dr-dias ${d.dias >= 10 ? "g" : d.dias >= 5 ? "m" : ""}">${d.dias}</span></td></tr>`; }).join("")}</tbody></table></div>
      ${ord.length > LIM_LISTA ? `<div class="footer-note">Mostrando os ${fInt(LIM_LISTA)} mais atrasados de ${fInt(ord.length)}. Use o filtro de unidade para ver o restante.</div>` : ""}`;
  }

  /* ---------- janela com a lista de documentos (lupa) ---------- */
  const MODAIS = {
    previstas: { t: "Entregas previstas", f: d => true },
    entregues: { t: "Entregues", f: d => /^Entregue|^Atraso/.test(d.sit) },
    fora: { t: "Fora do prazo", f: d => /^Atraso/.test(d.sit) },
    noprazo: { t: "Abertos no prazo", f: d => d.sit === "Aberto no prazo" }
  };
  function abrirModal(id){ ST.modal = id; ST.mBusca = ""; desenharModal(); }
  function fecharModal(){ ST.modal = null; const m = document.getElementById("drModal"); if(m) m.remove(); document.removeEventListener("keydown", escModal); }
  function escModal(e){ if(e.key === "Escape") fecharModal(); }

  function desenharModal(){
    const cfg = MODAIS[ST.modal]; if(!cfg) return;
    const D = dados(); if(!D) return;
    const busca = ST.mBusca.trim().toLowerCase();
    let docs = D.docs.filter(cfg.f);
    const total = docs.length;
    if(busca) docs = docs.filter(d => [d.r.k, d.r.x, d.r.n, d.r.r, d.r.t, d.r.y, d.r.u].some(v => String(v || "").toLowerCase().indexOf(busca) !== -1));
    docs.sort((a, b) => (a.r.p < b.r.p ? -1 : a.r.p > b.r.p ? 1 : a.r.k.localeCompare(b.r.k)));
    const mostrar = docs.slice(0, LIM_LISTA);
    let m = document.getElementById("drModal");
    if(!m){ m = document.createElement("div"); m.id = "drModal"; m.className = "dr-modal"; document.body.appendChild(m); document.addEventListener("keydown", escModal); }
    m.innerHTML = `<div class="dr-modal-box" role="dialog" aria-modal="true" aria-label="${esc(cfg.t)}">
      <div class="dr-modal-h"><div><small>Documentos · ${esc(rotMes(ST.mes))} · ${esc(SIS[ST.sis])}</small><h3>${esc(cfg.t)} — ${fInt(total)}</h3></div>
        <button type="button" class="dr-x" id="drMFechar" aria-label="Fechar">${ICO.x}</button></div>
      <div class="dr-modal-bar"><input type="search" id="drMBusca" class="small-input" placeholder="Buscar CTRC, NF, cliente, cidade, unidade" value="${esc(ST.mBusca)}">
        <button type="button" class="btn btn-ghost btn-sm" id="drMCsv">Baixar CSV</button></div>
      <div class="table-wrap dr-modal-tab">${mostrar.length ? `<table class="perf-table perf-table-simple pt-det-table">
        <thead><tr><th>CTRC</th><th>NF</th><th>Un.</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Previsão</th><th>Baixa</th><th>Situação</th></tr></thead>
        <tbody>${mostrar.map(d => { const r = d.r; return `<tr><td>${ST.sis ? "" : `<span class="pt-tag pt-tag-${esc(r.s || "")}">${esc(r.s || "")}</span> `}${esc(r.x || r.k)}</td>
          <td>${esc(r.n)}</td><td>${esc(r.u)}</td><td>${esc(r.r)}</td><td>${esc(r.t)}</td><td>${esc(r.y)}</td><td>${br(r.p)}</td><td>${r.e ? br(r.e) : "—"}</td><td>${esc(d.sit)}</td></tr>`; }).join("")}</tbody></table>` : `<div class="empty">Nenhum documento.</div>`}</div>
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
    const linhas = [["Sistema","CTRC","NF","Unidade","Remetente","Destinatario","Cidade","Previsao","Baixa","Situacao"].map(cel).join(";")]
      .concat(docs.map(d => { const r = d.r; return [r.s, r.x || r.k, r.n, r.u, r.r, r.t, r.y, br(r.p), r.e ? br(r.e) : "", d.sit].map(cel).join(";"); }));
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "rede-" + titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- geral ---------- */
  function ligarFiltros(){
    const mes = document.getElementById("drMes");
    if(mes) mes.addEventListener("change", () => { ST.mes = mes.value; salvarUI(); render(); });
    raiz().querySelectorAll("[data-sis]").forEach(b => b.addEventListener("click", () => { ST.sis = b.dataset.sis; salvarUI(); render(); }));
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
    if(ST.view === "abertos") renderAbertos(D); else renderHome(D);
    if(ST.modal) desenharModal();
  }

  window.dashRedeHTML = () => `<div id="drWrap" class="dr-wrap"></div>`;
  window.attachDashRede = () => render();
  window.dashRedeRefresh = () => { if(!ST.modal) render(); };
})();
