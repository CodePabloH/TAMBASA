/* ===================== PERFORMANCE TESTE — tela =====================
   Quadro de performance por UNIDADE RECEPTORA, calculado pela PREVISÃO DE ENTREGA do mês de competência.
   Mesmo layout da aba "Performance". As regras de cálculo estão em performance-teste-core.js.

   ONDE FICAM OS DADOS (neste navegador):
   - Base de entregas (milhares de CTRCs) ........ IndexedDB  "painel_valle_perf_teste"
   - Relatórios 012 (um por dia) e preferências ... localStorage (valle_perf_teste_*)
   Nada disso mexe nas outras abas.
*/
(function(){
  "use strict";

  const K = { dias: "valle_perf_teste_012_v1", imps: "valle_perf_teste_imports_v1", ui: "valle_perf_teste_ui_v1" };
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const COLS = [
    {id:"unidade",       label:"Unidade (Sigla)",    width:150},
    {id:"entregue",      label:"Entregue",           width:104},
    {id:"noprazo",       label:"No Prazo",           width:96},
    {id:"foraprazo",     label:"Fora Do Prazo",      width:100},
    {id:"cliente",       label:"Cliente",            width:92},
    {id:"transp",        label:"Transportadora",     width:130},
    {id:"sla",           label:"Performance",        width:108},
    {id:"previstas",     label:"Entregas Previstas", width:112},
    {id:"abertoatraso",  label:"Aberto Atrasado",    width:104},
    {id:"abertonoprazo", label:"Aberto No Prazo",    width:104}
  ];
  const SIS = { VAL: "Do Valle", RVA: "Real Vale" };
  const SIS_LISTA = ["VAL", "RVA"];
  const FS_MIN = 11, FS_MAX = 26, FS_DEF = 15;

  const PT = {
    base: new Map(),          // CTRC -> registro
    dias: { VAL: {}, RVA: {} },   // sistema -> "AAAA-MM-DD" -> {arquivos:[], importadoEm, unidades:{SIGLA:{np,ac,at,cli:[]}}}
    clienteSet: new Set(),    // "SIS:CTRC" com asterisco (culpa do cliente) em qualquer 012
    diasSet: new Set(),       // "SIS:AAAA-MM-DD" dos dias que têm 012 importado
    imps: [],                 // histórico de planilhas importadas
    ui: { mes: null, sort: "padrao", fs: FS_DEF, larg: {}, dia012: "todos", busca: "", focal: "", perf: "todas", atraso: "todos", de: "", ate: "", visao: "geral", impSis: "VAL", unidades: [] },
    det: { sigla: null, sis: "", filtro: "todos" },
    resultado: null,
    unidAberto: false, unidScroll: 0,
    db: null, dbOk: false, pronto: false
  };

  /* ---------- armazenamento ---------- */
  function lsGet(k, def){ try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : def; }catch(e){ return def; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
  function salvarUI(){ lsSet(K.ui, PT.ui); }

  function idbAbrir(){
    return new Promise(resolve => {
      if(!window.indexedDB){ resolve(null); return; }
      let rq;
      try{ rq = indexedDB.open("painel_valle_perf_teste", 1); }catch(e){ resolve(null); return; }
      rq.onupgradeneeded = () => { const db = rq.result; if(!db.objectStoreNames.contains("ctrcs")) db.createObjectStore("ctrcs", {keyPath: "k"}); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    });
  }
  function idbTudo(db){
    return new Promise(resolve => {
      try{
        const rq = db.transaction("ctrcs", "readonly").objectStore("ctrcs").getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => resolve([]);
      }catch(e){ resolve([]); }
    });
  }
  function idbGravar(db, lista){
    return new Promise((resolve, reject) => {
      try{
        const tx = db.transaction("ctrcs", "readwrite"), st = tx.objectStore("ctrcs");
        lista.forEach(r => st.put(r));
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error("falha ao gravar"));
      }catch(e){ reject(e); }
    });
  }
  function idbLimpar(db){
    return new Promise((resolve, reject) => {
      try{
        const tx = db.transaction("ctrcs", "readwrite");
        tx.objectStore("ctrcs").clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error("falha ao limpar"));
      }catch(e){ reject(e); }
    });
  }

  /* ---------- helpers ---------- */
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])));
  const fInt = n => Math.round(n || 0).toLocaleString("pt-BR");
  const fPct = v => (v === null || v === undefined) ? "-" : v.toFixed(2).replace(".", ",") + "%";
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const br = iso => PTCore.brDeISO(iso);
  function rotuloMes(m){
    if(!m) return "Todos os meses";
    const p = m.split("-"); return MESES[Number(p[1]) - 1] + "/" + p[0];
  }
  function recalcularIndices(){
    PT.clienteSet = new Set(); PT.diasSet = new Set();
    SIS_LISTA.forEach(sis => {
      const dd = PT.dias[sis] || {};
      Object.keys(dd).forEach(dia => {
        PT.diasSet.add(sis + ":" + dia);
        const us = dd[dia].unidades;
        Object.keys(us).forEach(u => (us[u].cli || []).forEach(c => PT.clienteSet.add(sis + ":" + c)));
      });
    });
  }
  const totalDias = () => SIS_LISTA.reduce((n, s) => n + Object.keys(PT.dias[s] || {}).length, 0);
  function decodificar(buf){
    try{ return new TextDecoder("utf-8", {fatal: true}).decode(buf); }
    catch(e){ return new TextDecoder("windows-1252").decode(buf); }
  }

  /* =====================================================================
     HTML da aba
     ===================================================================== */
  window.performanceTesteHTML = function(){
    return `
      <h2 class="section-title">Performance Teste — por Unidade Receptora</h2>
      <p class="section-desc">Quadro de performance calculado pela <strong>previsão de entrega</strong> dentro do mês de competência, por <strong>Unidade Receptora</strong>.
      Performance = (entregas no prazo + atrasos por culpa do cliente) ÷ total de entregas feitas.
      Baixas: ocorrência <strong>01</strong>, <strong>69</strong> e <strong>46</strong> (esta só na unidade GNA).
      Atrasado com <strong>asterisco (*)</strong> no relatório 012 = culpa do <strong>cliente</strong>; sem asterisco = culpa da <strong>transportadora</strong>.</p>

      <div class="panel" id="ptImportPanel">
        <div class="panel-header">Importar arquivos (por sistema: Do Valle VAL · Real Vale RVA)</div>
        <div class="pt-sis-tabs" id="ptSisTabs">
          <span>Importando para:</span>
          ${SIS_LISTA.map(k => `<button type="button" data-isis="${k}"><b>${k}</b> ${SIS[k]}<small id="ptSisN_${k}"></small></button>`).join("")}
        </div>
        <div class="pt-import-grid">
          <section class="pt-card" data-caixa="base">
            <header><span class="pt-num">1</span><div><b>Base de entregas <em class="pt-sis-nome"></em></b><small>Planilha de CTRCs do SSW filtrada por <u>previsão de entrega</u> (.sswweb / .csv). Pode soltar várias.</small></div></header>
            <label class="pt-drop" data-drop="base" for="ptFilesBase">
              <input type="file" id="ptFilesBase" multiple accept=".sswweb,.csv,.txt,text/plain">
              <b>Solte aqui ou clique</b><span>planilha(s) por previsão de entrega</span>
            </label>
            <div class="pt-status" id="ptStatusBase"></div>
            <ul class="pt-log" id="ptLogBase"></ul>
            <footer><button type="button" class="link-btn danger" id="ptLimparBase">Limpar base</button></footer>
          </section>
          <section class="pt-card" data-caixa="012">
            <header><span class="pt-num">2</span><div><b>Relatórios 012 <em class="pt-sis-nome"></em> (um por dia)</b><small>“012 - Performance dos CTRCs entregues”. Solte <u>vários de uma vez</u>: cada arquivo = documentos baixados naquele dia. Servem para separar atraso do <u>cliente (*)</u> × <u>transportadora</u>.</small></div></header>
            <label class="pt-drop" data-drop="012" for="ptFiles012">
              <input type="file" id="ptFiles012" multiple accept=".sswweb,.csv,.txt,text/plain">
              <b>Solte aqui ou clique</b><span>um ou vários relatórios 012</span>
            </label>
            <div class="pt-status" id="ptStatus012"></div>
            <ul class="pt-log" id="ptLog012"></ul>
            <footer><button type="button" class="link-btn danger" id="ptLimpar012">Limpar relatórios 012</button></footer>
          </section>
        </div>
        <div class="footer-note pt-aviso-import" id="ptResumoImport"></div>
      </div>

      <div id="ptWrap"><div class="empty">Carregando dados salvos…</div></div>
      <div id="ptDetalhe"></div>
      <div id="ptDias"></div>
    `;
  };

  /* =====================================================================
     IMPORTAÇÃO
     ===================================================================== */
  // alvo: "base" ou "012" (cada caixa tem o seu próprio registro)
  function logar(alvo, tipo, html){
    const ul = document.getElementById(alvo === "012" ? "ptLog012" : "ptLogBase"); if(!ul) return;
    const li = document.createElement("li"); li.className = "pt-log-" + tipo; li.innerHTML = html;
    ul.appendChild(li);
  }

  async function processarArquivos(fileList, caixa){
    const files = Array.from(fileList || []);
    if(!files.length) return;
    { const u = document.getElementById(caixa === "012" ? "ptLog012" : "ptLogBase"); if(u) u.innerHTML = ""; }
    files.sort((a, b) => a.name.localeCompare(b.name));
    let mudouBase = false, mudou012 = false;
    const sis = PT.ui.impSis;

    for(const f of files){
      try{
        const texto = decodificar(await f.arrayBuffer());
        const tipo = PTCore.detectarTipo(texto);
        if(tipo === "012"){
          const r = PTCore.parse012(texto);
          if(!r.dia || !r.total){ logar("012", "err", `<b>${esc(f.name)}</b> — relatório 012 sem data ou sem documentos; ignorado. ${esc((r.avisos||[]).join(" "))}`); continue; }
          const dd = PT.dias[sis] || (PT.dias[sis] = {});
          const d = dd[r.dia] || (dd[r.dia] = {arquivos: [], importadoEm: "", unidades: {}});
          Object.keys(r.unidades).forEach(s => { d.unidades[s] = r.unidades[s]; });
          if(d.arquivos.indexOf(f.name) === -1) d.arquivos.push(f.name);
          d.importadoEm = hojeISO();
          mudou012 = true;
          logar("012", r.avisos.length ? "warn" : "ok",
            `${caixa === "base" ? "↪ estava na caixa 1, registrado aqui · " : ""}<b>${esc(f.name)}</b> — relatório 012 <b>${sis}</b> do dia <b>${br(r.dia)}</b>: ${fInt(r.total)} baixas · ${fInt(r.ac)} atraso do cliente (*) · ${fInt(r.at)} atraso da transportadora · ${Object.keys(r.unidades).length} unidades.${r.avisos.length ? " ⚠ " + esc(r.avisos.join(" ")) : ""}`);
        }else if(tipo === "base"){
          const r = PTCore.parseBase(texto);
          if(r.erro){ logar("base", "err", `<b>${esc(f.name)}</b> — ${esc(r.erro)}`); continue; }
          let novos = 0, atual = 0, mantidos = 0; const mudados = [];
          r.registros.forEach(n => {
            n.s = sis; n.x = n.k; n.k = sis + ":" + n.x;
            const ex = PT.base.get(n.k);
            if(ex){
              // baixa não "volta atrás": se já estava baixado, uma planilha mais antiga não reabre o documento
              if(PTCore.ehBaixa(ex.c, ex.u) && !PTCore.ehBaixa(n.c, n.u)){ mantidos++; return; }
              atual++;
            }else novos++;
            PT.base.set(n.k, n); mudados.push(n);
          });
          if(PT.db){
            try{ await idbGravar(PT.db, mudados); }
            catch(e){ logar("base", "err", `Não consegui gravar <b>${esc(f.name)}</b> no navegador (${esc(e && e.message || e)}). Os dados valem só até fechar a página.`); PT.dbOk = false; }
          }
          PT.imps.unshift({sis, nome: f.name, periodo: r.periodo, linhas: r.registros.length, novos, atualizados: atual, em: hojeISO()});
          PT.imps = PT.imps.slice(0, 200); lsSet(K.imps, PT.imps);
          mudouBase = true;
          const ig = r.ignorados;
          logar("base", "ok", `${caixa === "012" ? "↪ estava na caixa 2, registrado aqui · " : ""}<b>${esc(f.name)}</b> — base <b>${sis}</b>${r.periodo ? " (previsão " + esc(r.periodo) + ")" : ""}: ${fInt(r.registros.length)} documentos · ${fInt(novos)} novos · ${fInt(atual)} atualizados${mantidos ? " · " + fInt(mantidos) + " já baixados mantidos" : ""}${ig.cancelados ? " · " + fInt(ig.cancelados) + " cancelados ignorados" : ""}.`);
          if(r.divergenciaDatas) logar("base", "warn", `${fInt(r.divergenciaDatas)} documento(s) de <b>${esc(f.name)}</b> têm data de entrega diferente da previsão mas 0 dias de atraso (ex.: sábado) — o sistema segue a coluna “Quantidade de Dias de Atraso” do SSW (dias úteis).`);
        }else{
          logar(caixa === "012" ? "012" : "base", "err", `<b>${esc(f.name)}</b> — não reconheci o arquivo (esperado: relatório 012 ou planilha de CTRCs com “Serie/Numero CTRC”).`);
        }
      }catch(e){
        console.error(e);
        logar(caixa === "012" ? "012" : "base", "err", `<b>${esc(f.name)}</b> — erro ao ler: ${esc(e && e.message || e)}`);
      }
    }
    if(mudou012){ lsSet(K.dias, PT.dias); recalcularIndices(); }
    if(mudouBase || mudou012) render();
  }

  /* =====================================================================
     RENDER
     ===================================================================== */
  function render(){
    renderResumoImport();
    renderDash();
    renderDetalhe();
    renderDias();
  }

  function renderResumoImport(){
    const sis = PT.ui.impSis;
    document.querySelectorAll("#ptSisTabs button").forEach(b => {
      b.classList.toggle("on", b.dataset.isis === sis);
      const k = b.dataset.isis, n = contarBase(k), nd = Object.keys(PT.dias[k] || {}).length;
      const el = document.getElementById("ptSisN_" + k);
      if(el) el.textContent = `${fInt(n)} docs · ${nd} dia(s) 012`;
    });
    document.querySelectorAll(".pt-sis-nome").forEach(e => { e.textContent = "— " + SIS[sis] + " (" + sis + ")"; });
    const eb = document.getElementById("ptStatusBase"), e0 = document.getElementById("ptStatus012");
    const n = contarBase(sis);
    if(eb){
      if(n){
        const m = PTCore.mesesDisponiveis(Array.from(PT.base.values()).filter(r => r.s === sis)).slice().reverse().map(rotuloMes).join(", ");
        eb.innerHTML = `${sis}: <b>${fInt(n)}</b> documentos · previsões em ${esc(m)} · ${PT.imps.filter(i => (i.sis || "VAL") === sis).length} planilha(s)`;
      }else eb.innerHTML = `${sis}: nenhuma planilha importada ainda.`;
    }
    if(e0){
      const lista = Object.keys(PT.dias[sis] || {}).sort();
      e0.innerHTML = lista.length ? `${sis}: <b>${lista.length}</b> dia(s): ${lista.map(d => br(d).slice(0, 5)).join(", ")}` : `${sis}: nenhum relatório 012 importado ainda.`;
    }
    const lb = document.getElementById("ptLimparBase"), l0 = document.getElementById("ptLimpar012");
    if(lb) lb.textContent = "Limpar base " + sis; if(l0) l0.textContent = "Limpar relatórios 012 " + sis;
    const el = document.getElementById("ptResumoImport");
    if(el) el.innerHTML = PT.dbOk ? "" : `<span class="pt-aviso-txt">⚠ Armazenamento do navegador indisponível: a base não ficará salva ao fechar a página.</span>`;
  }
  function contarBase(sis){ let n = 0; PT.base.forEach(r => { if(r.s === sis) n++; }); return n; }

  function filtrosAtivos(){
    const u = PT.ui;
    return (u.busca.trim() ? 1 : 0) + (u.focal ? 1 : 0) + (u.perf !== "todas" ? 1 : 0) + (u.atraso !== "todos" ? 1 : 0) + (u.de ? 1 : 0) + (u.ate ? 1 : 0) + (u.unidades && u.unidades.length ? 1 : 0);
  }
  function filtrarUnidades(lista){
    const u = PT.ui;
    const termos = u.busca.toUpperCase().split(/[\s,;]+/).filter(Boolean);
    let siglasFocal = null;
    if(u.focal && typeof FOCAIS !== "undefined"){
      const f = FOCAIS.find(x => x.id === u.focal);
      siglasFocal = new Set(f ? f.unidades.map(x => x.sigla) : []);
    }
    const marc = (u.unidades && u.unidades.length) ? new Set(u.unidades) : null;
    return lista.filter(x => {
      if(marc && !marc.has(x.sigla)) return false;
      if(termos.length && !termos.some(t => x.sigla.indexOf(t) !== -1)) return false;
      if(siglasFocal && !siglasFocal.has(x.sigla)) return false;
      if(u.perf === "abaixo" && !(x.sla !== null && x.sla < 98)) return false;
      if(u.perf === "meta" && !(x.sla !== null && x.sla >= 98)) return false;
      if(u.perf === "sem" && x.entregue > 0) return false;
      if(u.atraso === "fora" && !(x.foraDoPrazo > 0)) return false;
      if(u.atraso === "cliente" && !(x.atrasCli > 0)) return false;
      if(u.atraso === "transp" && !(x.atrasTrans > 0)) return false;
      if(u.atraso === "aberto" && !(x.abertoAtrasado > 0)) return false;
      return true;
    });
  }
  function somar(lista){
    const t = lista.reduce((a, u) => {
      ["exped", "entregue", "noPrazoEnt", "atrasCli", "atrasTrans", "foraDoPrazo", "abertoAtrasado", "abertoNoPrazo"].forEach(k => a[k] += u[k]);
      return a;
    }, { exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, foraDoPrazo: 0, abertoAtrasado: 0, abertoNoPrazo: 0 });
    t.sla = t.entregue > 0 ? ((t.noPrazoEnt + t.atrasCli) / t.entregue * 100) : null;
    return t;
  }

  function ordenar(lista){
    const l = lista.slice();
    if(PT.ui.sort === "sla-desc") l.sort((a, b) => (b.sla ?? -1) - (a.sla ?? -1));
    else if(PT.ui.sort === "sla-asc") l.sort((a, b) => (a.sla ?? 999) - (b.sla ?? 999));
    else if(PT.ui.sort === "sistema") l.sort((a, b) => a.sistema.localeCompare(b.sistema) || b.exped - a.exped);
    else if(PT.ui.sort === "sistema-rva") l.sort((a, b) => b.sistema.localeCompare(a.sistema) || b.exped - a.exped);
    else if(PT.ui.sort === "sigla") l.sort((a, b) => a.sigla.localeCompare(b.sigla));
    return l;   // "padrao" = Entregas Previstas (maior → menor), já vem assim do cálculo
  }

  function renderDash(){
    const wrap = document.getElementById("ptWrap"); if(!wrap) return;
    if(!PT.pronto){ wrap.innerHTML = `<div class="empty">Carregando dados salvos…</div>`; return; }
    if(!PT.base.size){
      wrap.innerHTML = `<div class="empty">Nenhuma planilha de entregas importada ainda.<br>Abra <b>Importar arquivos</b> acima e solte a planilha por previsão de entrega (e os relatórios 012 dos dias).</div>`;
      PT.resultado = null; return;
    }
    const meses = PTCore.mesesDisponiveis(PT.base);
    if(PT.ui.mes === null || (PT.ui.mes !== "" && meses.indexOf(PT.ui.mes) === -1)) PT.ui.mes = meses[0] || "";
    if(["geral", "VAL", "RVA"].indexOf(PT.ui.visao) === -1) PT.ui.visao = "geral";
    const visao = PT.ui.visao, visaoNome = visao === "geral" ? "Geral (Do Valle + Real Vale)" : SIS[visao];
    const base = {mes: PT.ui.mes, de: PT.ui.de, ate: PT.ui.ate};
    const resAll = PTCore.calcular(PT.base, PT.clienteSet, PT.diasSet, Object.assign({sistema: ""}, base));
    const res = visao === "geral" ? resAll : PTCore.calcular(PT.base, PT.clienteSet, PT.diasSet, Object.assign({sistema: visao}, base));
    PT.resultado = res;
    const porSis = {};
    SIS_LISTA.forEach(k => { porSis[k] = somar(resAll.unidades.filter(u => u.sistema === k)); });
    const cardsSis = [["geral", "Geral", somar(resAll.unidades)]].concat(SIS_LISTA.map(k => [k, SIS[k], porSis[k]]));
    const todas = res.unidades;
    const filtradas = filtrarUnidades(todas);
    const t = somar(filtradas), un = ordenar(filtradas);
    const nFiltros = filtrosAtivos();
    const todasSemFiltroUnid = todas;

    const avisos = [];
    if(res.atrasosSem012 > 0){
      const dias = Object.keys(res.semDia012).sort();
      const fmtD = k => { const p = k.split(" "); return p.length > 1 ? p[0] + " " + br(p[1]).slice(0, 5) : br(p[0]).slice(0, 5); };
      avisos.push(`⚠ <b>${fInt(res.atrasosSem012)}</b> atraso(s) foram baixados em dia(s) <b>sem relatório 012</b> importado (${dias.slice(0, 8).map(fmtD).join(", ")}${dias.length > 8 ? "…" : ""}). Enquanto o 012 desses dias não for importado, eles entram como culpa da <b>Transportadora</b>.`);
    }
    if(!Array.from(PT.diasSet).some(k => visao === "geral" || k.indexOf(visao + ":") === 0)) avisos.push(`⚠ Nenhum relatório 012 importado para esta visão: todo atraso está sendo contado como culpa da <b>Transportadora</b>.`);

    wrap.innerHTML = `
      <div class="pt-visao">
        <div class="pt-visao-tit">Visão</div>
        ${cardsSis.map(([k, nome, tt]) => `
          <button type="button" class="pt-vcard ${visao === k ? "on" : ""} pt-v-${k}" data-visao="${k}">
            <span class="pt-vnome">${esc(nome)}${k !== "geral" ? ` <i>${k}</i>` : ""}</span>
            <span class="pt-vpct ${slaKpiClass(tt.sla)}">${fPct(tt.sla)}</span>
            <span class="pt-vsub">${fInt(tt.entregue)} entregues · ${fInt(tt.exped)} previstas</span>
          </button>`).join("")}
      </div>
      ${avisos.length ? `<div class="pt-aviso">${avisos.map(a => `<div>${a}</div>`).join("")}</div>` : ""}
      <div class="perf-layout">
        <div class="perf-side">
          <div class="panel perf-gauge-panel">
            <div class="gauge-label">Performance — ${esc(visao === "geral" ? "Geral" : SIS[visao])}</div>
            ${gaugeSVG(t.sla)}
            <div class="gauge-pct ${slaKpiClass(t.sla)}">${fPct(t.sla)}</div>
            <div class="gauge-meta">Meta: 98%</div>
          </div>
          <div class="perf-stat perf-stat-navy"><div class="perf-stat-label">Entregue</div><div class="perf-stat-value">${fInt(t.entregue)}</div></div>
          <div class="perf-stat perf-stat-green"><div class="perf-stat-label">Entregas no Prazo</div><div class="perf-stat-value">${fInt(t.noPrazoEnt)}</div></div>
          <div class="perf-stat perf-stat-red"><div class="perf-stat-label">Entregas Fora do Prazo</div><div class="perf-stat-value">${fInt(t.foraDoPrazo)}</div></div>
          <div class="perf-stat perf-stat-amber"><div class="perf-stat-label">Transportadora</div><div class="perf-stat-value">${fInt(t.atrasTrans)}</div></div>
          <div class="perf-stat perf-stat-amber"><div class="perf-stat-label">Cliente</div><div class="perf-stat-value">${fInt(t.atrasCli)}</div></div>
          <div class="perf-stat perf-stat-red"><div class="perf-stat-label">Aberto Atrasado</div><div class="perf-stat-value">${fInt(t.abertoAtrasado)}</div></div>
          ${typeof performanceSideWidgetsHTML === "function" ? performanceSideWidgetsHTML(filtradas, t) : ""}
        </div>
        <div class="perf-main">
          <div class="panel" id="ptTablePanel">
            <div class="panel-header perf-header">
              <div class="perf-header-org">Previsão de entrega · Unidade Receptora</div>
              <div class="perf-header-title">Performance Teste por Unidade — ${esc(visaoNome)} — Competência: ${esc(rotuloMes(PT.ui.mes))}</div>
            </div>
            <div class="toolbar">
              <span class="pt-filtros">
                <label class="check-inline">Competência:
                  <select class="small-select" id="ptMes">
                    ${meses.map(m => `<option value="${m}" ${PT.ui.mes === m ? "selected" : ""}>${esc(rotuloMes(m))}</option>`).join("")}
                    ${meses.length > 1 ? `<option value="" ${PT.ui.mes === "" ? "selected" : ""}>Todos os meses</option>` : ""}
                  </select>
                </label>
                <label class="check-inline">Ordenar por:
                  <select class="small-select" id="ptSort">
                    <option value="padrao" ${PT.ui.sort === "padrao" ? "selected" : ""}>Padrão (Entregas Previstas)</option>
                    <option value="sla-desc" ${PT.ui.sort === "sla-desc" ? "selected" : ""}>Performance — maior para menor</option>
                    <option value="sla-asc" ${PT.ui.sort === "sla-asc" ? "selected" : ""}>Performance — menor para maior</option>
                    <option value="sistema" ${PT.ui.sort === "sistema" ? "selected" : ""}>Sistema (VAL, depois RVA)</option>
                    <option value="sistema-rva" ${PT.ui.sort === "sistema-rva" ? "selected" : ""}>Sistema (RVA, depois VAL)</option>
                    <option value="sigla" ${PT.ui.sort === "sigla" ? "selected" : ""}>Sigla (A–Z)</option>
                  </select>
                </label>
              </span>
              <div class="toolbar-actions">
                <button type="button" class="btn btn-ghost btn-sm" id="ptExport" title="Baixar esta tabela em Excel (.xlsx) com as mesmas cores">Exportar Excel</button>
                <span class="perf-fs-ctrl" title="Tamanho dos números da tabela">
                  <button type="button" class="btn btn-ghost btn-sm" id="ptFsDown" aria-label="Diminuir números">A−</button>
                  <button type="button" class="btn btn-ghost btn-sm" id="ptFsUp" aria-label="Aumentar números">A+</button>
                </span>
                <button type="button" class="btn btn-ghost btn-sm" id="ptResetCols" title="Restaurar as larguras originais das colunas">↺ Larguras</button>
                <button type="button" class="btn btn-ghost btn-sm" id="ptFull">Tela cheia</button>
              </div>
            </div>
            <div class="pt-filtros2">
              <label>Sistema <select class="small-select" id="ptSisFiltro">
                <option value="geral" ${visao === "geral" ? "selected" : ""}>Geral (VAL + RVA)</option>
                <option value="VAL" ${visao === "VAL" ? "selected" : ""}>Do Valle (VAL)</option>
                <option value="RVA" ${visao === "RVA" ? "selected" : ""}>Real Vale (RVA)</option>
              </select></label>
              <div class="pt-multi-wrap"><span class="pt-multi-lbl">Marcar unidades</span>
                <details class="pt-multi" id="ptUnidMulti" ${PT.unidAberto ? "open" : ""}>
                  <summary>${PT.ui.unidades.length ? PT.ui.unidades.length + " marcada(s)" : "Todas as unidades"}</summary>
                  <div class="pt-multi-box">
                    <div class="pt-multi-acoes"><button type="button" class="link-btn" id="ptUnidTodas">Marcar todas</button><button type="button" class="link-btn" id="ptUnidNenhuma">Limpar</button></div>
                    <div class="pt-multi-lista" id="ptUnidLista">
                      ${Array.from(new Set(todasSemFiltroUnid.map(x => x.sigla))).sort().map(sg => `<label><input type="checkbox" value="${esc(sg)}" ${PT.ui.unidades.indexOf(sg) > -1 ? "checked" : ""}> ${esc(sg)}</label>`).join("")}
                    </div>
                  </div>
                </details></div>
              <label>Unidade <input type="search" id="ptBusca" class="small-input" placeholder="sigla (ex.: GAN, ROT)" value="${esc(PT.ui.busca)}"></label>
              ${typeof FOCAIS !== "undefined" ? `<label>Focal <select class="small-select" id="ptFocal"><option value="">Todos</option>${FOCAIS.map(f => `<option value="${esc(f.id)}" ${PT.ui.focal === f.id ? "selected" : ""}>${esc(f.titulo)}</option>`).join("")}</select></label>` : ""}
              <label>Performance <select class="small-select" id="ptPerf">
                <option value="todas" ${PT.ui.perf === "todas" ? "selected" : ""}>Todas</option>
                <option value="abaixo" ${PT.ui.perf === "abaixo" ? "selected" : ""}>Abaixo da meta (&lt; 98%)</option>
                <option value="meta" ${PT.ui.perf === "meta" ? "selected" : ""}>Meta atingida (≥ 98%)</option>
                <option value="sem" ${PT.ui.perf === "sem" ? "selected" : ""}>Sem entregas feitas</option>
              </select></label>
              <label>Atrasos <select class="small-select" id="ptAtraso">
                <option value="todos" ${PT.ui.atraso === "todos" ? "selected" : ""}>Todos</option>
                <option value="fora" ${PT.ui.atraso === "fora" ? "selected" : ""}>Com entrega fora do prazo</option>
                <option value="cliente" ${PT.ui.atraso === "cliente" ? "selected" : ""}>Com atraso do cliente</option>
                <option value="transp" ${PT.ui.atraso === "transp" ? "selected" : ""}>Com atraso da transportadora</option>
                <option value="aberto" ${PT.ui.atraso === "aberto" ? "selected" : ""}>Com aberto atrasado</option>
              </select></label>
              <label>Previsão de <input type="date" id="ptDe" class="small-input" value="${esc(PT.ui.de)}"></label>
              <label>até <input type="date" id="ptAte" class="small-input" value="${esc(PT.ui.ate)}"></label>
              <button type="button" class="btn btn-ghost btn-sm" id="ptLimparFiltros" ${nFiltros ? "" : "disabled"}>Limpar filtros${nFiltros ? " (" + nFiltros + ")" : ""}</button>
              <span class="pt-conta">${filtradas.length} de ${todas.length} unidades</span>
            </div>
            <p class="col-resize-hint">Clique numa unidade para ver os documentos em atraso. Arraste a borda direita de uma coluna para ajustar a largura.</p>
            <div class="table-wrap perf-table-wrap">
              <table class="perf-table perf-table-full" id="ptTable">
                <colgroup>${COLS.map(c => `<col data-col="${c.id}">`).join("")}</colgroup>
                <thead><tr>${COLS.map(c => `<th class="th-${c.id}" data-col="${c.id}">${c.label}<span class="col-resizer" data-col="${c.id}"></span></th>`).join("")}</tr></thead>
                <tbody>
                  ${un.map(u => `
                    <tr class="pt-linha ${PT.det.sigla === u.sigla && PT.det.sis === u.sistema ? "pt-sel" : ""}" data-sigla="${esc(u.sigla)}" data-sis="${esc(u.sistema)}" title="Ver documentos em atraso de ${esc(u.sigla)}">
                      <td class="perf-unidade">${esc(u.sigla)}${visao === "geral" && u.sistema ? ` <span class="pt-tag pt-tag-${u.sistema}">${u.sistema}</span>` : ""}</td>
                      <td class="perf-entregue">${u.entregue}</td>
                      <td class="perf-noprazo">${u.noPrazoEnt}</td>
                      <td class="perf-foraprazo">${u.foraDoPrazo}</td>
                      <td class="perf-cliente">${u.atrasCli}</td>
                      <td class="perf-transp">${u.atrasTrans}</td>
                      <td class="${slaClass(u.sla)}">${fPct(u.sla)}</td>
                      <td class="perf-previstas">${u.exped}</td>
                      <td class="perf-abertoatraso">${u.abertoAtrasado || ""}</td>
                      <td class="perf-abertonoprazo">${u.abertoNoPrazo}</td>
                    </tr>`).join("")}
                </tbody>
                <tfoot>
                  <tr class="perf-total-row">
                    <td>${visao === "geral" ? "TOTAL GERAL" : "TOTAL " + visao}</td><td>${t.entregue}</td><td>${t.noPrazoEnt}</td><td>${t.foraDoPrazo}</td><td>${t.atrasCli}</td><td>${t.atrasTrans}</td>
                    <td>${fPct(t.sla)}</td><td>${t.exped}</td><td>${t.abertoAtrasado || ""}</td><td>${t.abertoNoPrazo}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="footer-note">Performance = (No Prazo + Cliente) ÷ Entregue. Entregue = baixas 01, 69 e 46 (só GNA). Fora do Prazo = baixa atrasada (Cliente = CTRC com * no relatório 012; Transportadora = sem *). Aberto = ainda sem baixa. Atraso conforme “Quantidade de Dias de Atraso” do SSW.</div>
          </div>
        </div>
      </div>`;

    ligarEventosDash();
  }

  function ligarEventosDash(){
    const $ = id => document.getElementById(id);
    $("ptMes").addEventListener("change", e => { PT.ui.mes = e.target.value; PT.det.sigla = null; salvarUI(); render(); });
    const reDash = () => { salvarUI(); PT.det.sigla = PT.det.sigla; renderDash(); renderDetalhe(); };
    let tBusca = null;
    $("ptBusca").addEventListener("input", e => {
      PT.ui.busca = e.target.value; clearTimeout(tBusca);
      tBusca = setTimeout(() => { reDash(); const b = $("ptBusca"); if(b){ b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 250);
    });
    if($("ptFocal")) $("ptFocal").addEventListener("change", e => { PT.ui.focal = e.target.value; reDash(); });
    $("ptPerf").addEventListener("change", e => { PT.ui.perf = e.target.value; reDash(); });
    $("ptAtraso").addEventListener("change", e => { PT.ui.atraso = e.target.value; reDash(); });
    $("ptDe").addEventListener("change", e => { PT.ui.de = e.target.value; reDash(); });
    $("ptAte").addEventListener("change", e => { PT.ui.ate = e.target.value; reDash(); });
    $("ptLimparFiltros").addEventListener("click", () => { Object.assign(PT.ui, {busca: "", focal: "", perf: "todas", atraso: "todos", de: "", ate: "", unidades: []}); reDash(); });
    $("ptSisFiltro").addEventListener("change", e => { PT.ui.visao = e.target.value; PT.det.sigla = null; salvarUI(); render(); });
    document.querySelectorAll(".pt-vcard").forEach(b => b.addEventListener("click", () => { PT.ui.visao = b.dataset.visao; PT.det.sigla = null; salvarUI(); render(); }));
    const det = $("ptUnidMulti"), lista = $("ptUnidLista");
    if(det){
      det.addEventListener("toggle", () => { PT.unidAberto = det.open; });
      if(lista) lista.scrollTop = PT.unidScroll || 0;
      lista.querySelectorAll("input[type=checkbox]").forEach(cb => cb.addEventListener("change", () => {
        PT.unidScroll = lista.scrollTop;
        PT.ui.unidades = Array.from(lista.querySelectorAll("input:checked")).map(x => x.value);
        reDash();
      }));
      $("ptUnidTodas").addEventListener("click", () => { PT.unidScroll = lista.scrollTop; PT.ui.unidades = Array.from(lista.querySelectorAll("input")).map(x => x.value); reDash(); });
      $("ptUnidNenhuma").addEventListener("click", () => { PT.ui.unidades = []; reDash(); });
    }
    $("ptSort").addEventListener("change", e => { PT.ui.sort = e.target.value; salvarUI(); renderDash(); });
    $("ptFull").addEventListener("click", () => toggleFullscreen("ptTablePanel"));
    updateFullscreenBtnLabel("ptTablePanel", "ptFull");
    $("ptFsDown").addEventListener("click", () => mudarFonte(-1));
    $("ptFsUp").addEventListener("click", () => mudarFonte(1));
    $("ptResetCols").addEventListener("click", () => { PT.ui.larg = {}; salvarUI(); aplicarLarguras(); });
    $("ptExport").addEventListener("click", () => {
      const p = $("ptTablePanel");
      exportarTabelasExcel([{
        nome: "Performance Teste",
        titulo: p.querySelector(".perf-header-title").textContent.trim(),
        subtitulo: p.querySelector(".perf-header-org").textContent.trim(),
        tabela: $("ptTable"),
        rodape: p.querySelector(".footer-note").textContent.trim()
      }], `Performance_Teste_${dataParaArquivo()}.xlsx`);
    });
    document.querySelectorAll("#ptTable tbody tr.pt-linha").forEach(tr => {
      tr.addEventListener("click", () => {
        const mesma = PT.det.sigla === tr.dataset.sigla && PT.det.sis === tr.dataset.sis;
        PT.det.sigla = mesma ? null : tr.dataset.sigla; PT.det.sis = tr.dataset.sis;
        PT.det.filtro = "todos";
        document.querySelectorAll("#ptTable tbody tr.pt-linha").forEach(x => x.classList.toggle("pt-sel", PT.det.sigla !== null && x.dataset.sigla === PT.det.sigla && x.dataset.sis === PT.det.sis));
        renderDetalhe();
        if(PT.det.sigla){ const d = document.getElementById("ptDetalhe"); if(d) d.scrollIntoView({behavior: "smooth", block: "start"}); }
      });
    });
    aplicarFonte(); aplicarLarguras(); ligarResize();
  }

  /* ---------- tamanho dos números e larguras ---------- */
  function aplicarFonte(){
    const t = document.getElementById("ptTable"); if(!t) return;
    const v = Number(PT.ui.fs); t.style.setProperty("--perf-fs", ((v >= FS_MIN && v <= FS_MAX) ? v : FS_DEF) + "px");
  }
  function mudarFonte(d){
    const v = Number(PT.ui.fs) || FS_DEF;
    PT.ui.fs = Math.max(FS_MIN, Math.min(FS_MAX, v + d)); salvarUI(); aplicarFonte();
  }
  function aplicarLarguras(){
    const t = document.getElementById("ptTable"); if(!t) return;
    const w = PT.ui.larg || {};
    t.querySelectorAll("colgroup col[data-col]").forEach(col => {
      const def = COLS.find(c => c.id === col.dataset.col);
      col.style.width = (w[col.dataset.col] || (def ? def.width : 90)) + "px";
    });
    const total = COLS.reduce((s, c) => s + (w[c.id] || c.width), 0);
    t.style.width = total + "px"; t.style.minWidth = total + "px";
  }
  function ligarResize(){
    const t = document.getElementById("ptTable"); if(!t) return;
    t.querySelectorAll(".col-resizer").forEach(h => {
      h.addEventListener("mousedown", e => {
        e.preventDefault(); e.stopPropagation();
        const col = t.querySelector(`colgroup col[data-col="${h.dataset.col}"]`); if(!col) return;
        const x0 = e.clientX, w0 = col.getBoundingClientRect().width;
        document.body.style.userSelect = "none";
        const mv = ev => {
          col.style.width = Math.max(48, Math.round(w0 + ev.clientX - x0)) + "px";
          const tot = Array.from(t.querySelectorAll("colgroup col")).reduce((s, c) => s + parseFloat(c.style.width || 0), 0);
          t.style.width = tot + "px"; t.style.minWidth = tot + "px";
        };
        const up = () => {
          document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up);
          document.body.style.userSelect = "";
          const w = {};
          t.querySelectorAll("colgroup col[data-col]").forEach(c => { w[c.dataset.col] = Math.round(parseFloat(c.style.width)); });
          PT.ui.larg = w; salvarUI();
        };
        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
      });
    });
  }

  /* ---------- detalhe: documentos em atraso da unidade ---------- */
  const FILTROS_DET = [
    ["todos", "Todos os atrasados"],
    ["transp", "Entregue atrasado — Transportadora"],
    ["cliente", "Entregue atrasado — Cliente"],
    ["aberto", "Aberto atrasado"]
  ];
  function renderDetalhe(){
    const el = document.getElementById("ptDetalhe"); if(!el) return;
    if(!PT.det.sigla || !PT.resultado){ el.innerHTML = ""; return; }
    const sig = PT.det.sigla;
    let docs = PT.resultado.detalhe.filter(d => d.r.u === sig && (d.r.s || "") === PT.det.sis);
    const total = docs.length;
    const casa = { transp: "Atraso - transportadora", cliente: "Atraso - cliente", aberto: "Aberto atrasado" };
    if(PT.det.filtro !== "todos") docs = docs.filter(d => d.situacao === casa[PT.det.filtro]);
    docs.sort((a, b) => (a.r.p < b.r.p ? -1 : a.r.p > b.r.p ? 1 : a.r.k.localeCompare(b.r.k)));
    const LIM = 1000, mostrar = docs.slice(0, LIM);
    el.innerHTML = `
      <div class="panel" id="ptDetPanel">
        <div class="panel-header perf-header">
          <div class="perf-header-org">Documentos em atraso · ${esc(rotuloMes(PT.ui.mes))}</div>
          <div class="perf-header-title">Unidade ${esc(sig)}${PT.det.sis ? " (" + PT.det.sis + ")" : ""} — ${fInt(total)} documento(s) em atraso</div>
        </div>
        <div class="toolbar">
          <label class="check-inline">Mostrar:
            <select class="small-select" id="ptDetFiltro">${FILTROS_DET.map(([v, l]) => `<option value="${v}" ${PT.det.filtro === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          </label>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="ptDetExport">Exportar Excel</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ptDetFechar">Fechar</button>
          </div>
        </div>
        <div class="table-wrap">
          ${mostrar.length ? `
          <table class="perf-table perf-table-simple pt-det-table" id="ptDetTable">
            <thead><tr><th>CTRC</th><th>NF</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Previsão</th><th>Entrega</th><th>Dias</th><th>Situação</th></tr></thead>
            <tbody>${mostrar.map(({r, situacao}) => `
              <tr class="pt-sit-${situacao.indexOf("cliente") > -1 ? "cli" : situacao.indexOf("Aberto") === 0 ? "ab" : "tr"}">
                <td>${esc(r.x || r.k)}</td><td>${esc(r.n)}</td><td>${esc(r.r)}</td><td>${esc(r.t)}</td><td>${esc(r.y)}</td>
                <td>${br(r.p)}</td><td>${r.e ? br(r.e) : "—"}</td><td>${r.d === null ? "" : r.d}</td><td>${esc(situacao)}</td>
              </tr>`).join("")}</tbody>
          </table>` : `<div class="empty">Nenhum documento nesse filtro.</div>`}
        </div>
        <div class="footer-note">${docs.length > LIM ? `Mostrando os primeiros ${fInt(LIM)} de ${fInt(docs.length)}. ` : ""}Situação “Atraso - cliente” = CTRC com asterisco no relatório 012.</div>
      </div>`;
    document.getElementById("ptDetFiltro").addEventListener("change", e => { PT.det.filtro = e.target.value; renderDetalhe(); });
    document.getElementById("ptDetFechar").addEventListener("click", () => {
      PT.det.sigla = null; renderDetalhe();
      document.querySelectorAll("#ptTable tbody tr.pt-linha").forEach(x => x.classList.remove("pt-sel"));
    });
    document.getElementById("ptDetExport").addEventListener("click", () => {
      const tb = document.getElementById("ptDetTable"); if(!tb) return;
      const p = document.getElementById("ptDetPanel");
      exportarTabelasExcel([{
        nome: "Atrasos " + sig,
        titulo: p.querySelector(".perf-header-title").textContent.trim(),
        subtitulo: p.querySelector(".perf-header-org").textContent.trim(),
        tabela: tb, rodape: p.querySelector(".footer-note").textContent.trim()
      }], `Atrasos_${sig}_${dataParaArquivo()}.xlsx`);
    });
  }

  /* ---------- baixas por dia (relatórios 012) ---------- */
  function renderDias(){
    const el = document.getElementById("ptDias"); if(!el) return;
    const visao = SIS_LISTA.indexOf(PT.ui.visao) > -1 ? PT.ui.visao : "geral";
    const sisVis = visao === "geral" ? SIS_LISTA : [visao];
    // lista de "SIS|dia"
    const itens = [];
    sisVis.forEach(sv => Object.keys(PT.dias[sv] || {}).forEach(d => itens.push({sis: sv, dia: d})));
    itens.sort((a, b) => a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.sis.localeCompare(b.sis));
    const nomeVis = visao === "geral" ? "Geral" : SIS[visao];
    if(!itens.length){
      el.innerHTML = `<div class="panel"><div class="panel-header">Baixas por dia — relatórios 012 (${esc(nomeVis)})</div><div class="empty">Nenhum relatório 012 importado para esta visão. Cada arquivo 012 traz os documentos baixados em <b>um dia</b>; os atrasos com asterisco (*) viram “culpa do cliente” no quadro acima.</div></div>`;
      return;
    }
    const diasUnicos = Array.from(new Set(itens.map(i => i.dia)));
    if(PT.ui.dia012 !== "todos" && diasUnicos.indexOf(PT.ui.dia012) === -1) PT.ui.dia012 = "todos";
    const sel = PT.ui.dia012 === "todos" ? itens : itens.filter(i => i.dia === PT.ui.dia012);
    const agg = {};
    sel.forEach(({sis, dia}) => {
      const us = PT.dias[sis][dia].unidades;
      Object.keys(us).forEach(u => {
        const k = sis + "|" + u;
        const a = agg[k] || (agg[k] = {sigla: u, sis, np: 0, ac: 0, at: 0});
        a.np += us[u].np; a.ac += us[u].ac; a.at += us[u].at;
      });
    });
    const linhas = Object.values(agg).sort((a, b) => (b.np + b.ac + b.at) - (a.np + a.ac + a.at) || a.sigla.localeCompare(b.sigla));
    const T = linhas.reduce((a, l) => { a.np += l.np; a.ac += l.ac; a.at += l.at; return a; }, {np: 0, ac: 0, at: 0});
    const tot = T.np + T.ac + T.at;
    let semBase = 0;
    if(PT.base.size) PT.clienteSet.forEach(c => { if(sisVis.indexOf(c.split(":")[0]) > -1 && !PT.base.has(c)) semBase++; });
    const nCli = Array.from(PT.clienteSet).filter(c => sisVis.indexOf(c.split(":")[0]) > -1).length;

    el.innerHTML = `
      <div class="panel" id="ptDiasPanel">
        <div class="panel-header perf-header">
          <div class="perf-header-org">Relatório 012 · documentos baixados no dia · ${esc(nomeVis)}</div>
          <div class="perf-header-title">Baixas por dia — ${PT.ui.dia012 === "todos" ? diasUnicos.length + " dia(s) somados" : br(PT.ui.dia012)}</div>
        </div>
        <div class="toolbar">
          <label class="check-inline">Dia:
            <select class="small-select" id="ptDiaSel">
              <option value="todos" ${PT.ui.dia012 === "todos" ? "selected" : ""}>Todos os dias importados (${diasUnicos.length})</option>
              ${diasUnicos.slice().sort().reverse().map(d => `<option value="${d}" ${PT.ui.dia012 === d ? "selected" : ""}>${br(d)}</option>`).join("")}
            </select>
          </label>
          <div class="toolbar-actions"><button type="button" class="btn btn-ghost btn-sm" id="ptDiasExport">Exportar Excel</button></div>
        </div>
        <div class="table-wrap">
          <table class="perf-table perf-table-simple pt-dias-table" id="ptDiasTable">
            <thead><tr><th>Unidade</th><th>No prazo</th><th>Atrasado — Cliente (*)</th><th>Atrasado — Transportadora</th><th>Total de baixas</th></tr></thead>
            <tbody>${linhas.map(l => `<tr><td class="perf-unidade">${esc(l.sigla)}${visao === "geral" ? ` <span class="pt-tag pt-tag-${l.sis}">${l.sis}</span>` : ""}</td><td>${l.np}</td><td>${l.ac}</td><td>${l.at}</td><td>${l.np + l.ac + l.at}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td>TOTAL</td><td>${T.np}</td><td>${T.ac}</td><td>${T.at}</td><td>${tot}</td></tr></tfoot>
          </table>
        </div>
        <div class="pt-dias-chips">
          <span>Dias importados:</span>
          ${itens.map(({sis, dia}) => `<span class="pt-chip">${visao === "geral" ? `<i class="pt-tag pt-tag-${sis}">${sis}</i> ` : ""}${br(dia).slice(0, 5)} · ${Object.values(PT.dias[sis][dia].unidades).reduce((x, u) => x + u.np + u.ac + u.at, 0)}<button type="button" data-rm="${sis}|${dia}" title="Remover o relatório ${sis} de ${br(dia)}" aria-label="Remover ${br(dia)}">×</button></span>`).join("")}
        </div>
        <div class="footer-note">${fInt(nCli)} CTRC(s) com asterisco no total${PT.base.size ? ` · ${fInt(semBase)} ainda sem correspondência na base de entregas (fora do período importado)` : ""}. Reimportar o 012 do mesmo dia e sistema substitui as unidades daquele arquivo.</div>
      </div>`;
    document.getElementById("ptDiaSel").addEventListener("change", e => { PT.ui.dia012 = e.target.value; salvarUI(); renderDias(); });
    el.querySelectorAll("button[data-rm]").forEach(b => b.addEventListener("click", () => {
      const [sv, d] = b.dataset.rm.split("|");
      if(!confirm("Remover o relatório 012 " + sv + " do dia " + br(d) + "?")) return;
      delete PT.dias[sv][d]; lsSet(K.dias, PT.dias); recalcularIndices(); render();
    }));
    document.getElementById("ptDiasExport").addEventListener("click", () => {
      const p = document.getElementById("ptDiasPanel");
      exportarTabelasExcel([{
        nome: "Baixas por dia 012",
        titulo: p.querySelector(".perf-header-title").textContent.trim(),
        subtitulo: p.querySelector(".perf-header-org").textContent.trim(),
        tabela: document.getElementById("ptDiasTable"), rodape: p.querySelector(".footer-note").textContent.trim()
      }], `Baixas_por_dia_012_${dataParaArquivo()}.xlsx`);
    });
  }

  /* =====================================================================
     INICIALIZAÇÃO
     ===================================================================== */
  window.attachPerformanceTeste = function(){
    const ui = lsGet(K.ui, null);
    if(ui && typeof ui === "object") PT.ui = Object.assign(PT.ui, ui);
    let dd = lsGet(K.dias, {}) || {};
    if(Array.isArray(dd)) dd = {};
    // versão anterior guardava os dias direto (sem sistema): vira tudo VAL
    if(Object.keys(dd).some(k => /^\d{4}-/.test(k))) dd = { VAL: dd, RVA: {} };
    PT.dias = { VAL: dd.VAL || {}, RVA: dd.RVA || {} };
    lsSet(K.dias, PT.dias);
    PT.imps = lsGet(K.imps, []) || [];
    recalcularIndices();

    ["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => updateFullscreenBtnLabel("ptTablePanel", "ptFull")));

    ["base", "012"].forEach(cx => {
      const inp = document.getElementById(cx === "base" ? "ptFilesBase" : "ptFiles012");
      const drop = document.querySelector(`.pt-drop[data-drop="${cx}"]`);
      if(inp) inp.addEventListener("change", async () => { await processarArquivos(inp.files, cx); inp.value = ""; });
      if(drop){
        ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("pt-drop-on"); }));
        ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("pt-drop-on"); }));
        drop.addEventListener("drop", e => { if(e.dataTransfer && e.dataTransfer.files) processarArquivos(e.dataTransfer.files, cx); });
      }
    });
    document.querySelectorAll("#ptSisTabs button").forEach(b => b.addEventListener("click", () => { PT.ui.impSis = b.dataset.isis; salvarUI(); renderResumoImport(); }));
    document.getElementById("ptLimpar012").addEventListener("click", () => {
      const sv = PT.ui.impSis;
      if(!confirm("Apagar TODOS os relatórios 012 de " + SIS[sv] + " (" + sv + ")? Os atrasos dele voltam a ser contados como Transportadora.")) return;
      PT.dias[sv] = {}; lsSet(K.dias, PT.dias); recalcularIndices(); render();
    });
    document.getElementById("ptLimparBase").addEventListener("click", async () => {
      const sv = PT.ui.impSis;
      if(!confirm("Apagar TODA a base de entregas de " + SIS[sv] + " (" + sv + ")? Os relatórios 012 são mantidos.")) return;
      const sai = []; PT.base.forEach((r, k) => { if(r.s === sv) sai.push(k); });
      sai.forEach(k => PT.base.delete(k));
      PT.imps = PT.imps.filter(i => (i.sis || "VAL") !== sv); lsSet(K.imps, PT.imps); PT.det.sigla = null;
      if(PT.db){ try{ await idbLimpar(PT.db); await idbGravar(PT.db, Array.from(PT.base.values())); }catch(e){ console.error(e); } }
      render();
    });

    render();   // mostra o estado vazio/"carregando" enquanto abre o banco
    (async () => {
      PT.db = await idbAbrir(); PT.dbOk = !!PT.db;
      if(PT.db){
        const tudo = await idbTudo(PT.db);
        // versão anterior não tinha sistema: migra tudo para VAL
        const velhos = tudo.filter(r => !r.s);
        tudo.forEach(r => { if(!r.s){ r.s = "VAL"; r.x = r.k; r.k = "VAL:" + r.x; } PT.base.set(r.k, r); });
        if(velhos.length){ try{ await idbLimpar(PT.db); await idbGravar(PT.db, Array.from(PT.base.values())); }catch(e){ console.error(e); } }
      }
      PT.pronto = true; render();
    })();
  };

  window.performanceTesteRefresh = function(){ if(PT.pronto) render(); };
})();
