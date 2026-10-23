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

  const K = { dias: "valle_perf_teste_012_v1", imps: "valle_perf_teste_imports_v1", ui: "valle_perf_teste_ui_v1", resp: "valle_perf_teste_resp_v1" };
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const COLS = [
    {id:"unidade",       label:"Unidade (Sigla)",    width:150},
    {id:"entregue",      label:"Entregue",           width:104},
    {id:"noprazo",       label:"No Prazo",           width:96},
    {id:"foraprazo",     label:"Fora Do Prazo",      width:100},
    {id:"cliente",       label:"Cliente",            width:92},
    {id:"transp",        label:"Transportadora",     width:130},
    {id:"apend",         label:"A definir",          width:96},
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
    transpSet: new Set(),     // "SIS:CTRC" atrasado SEM asterisco em qualquer 012 (culpa da transportadora)
    diasLegado: new Set(),    // "SIS:AAAA-MM-DD" de 012 importados numa versão antiga (sem lista de CTRCs da transportadora)
    manual: {},               // "SIS:CTRC" -> "cliente" | "transp"  (responsável definido à mão)
    diasSet: new Set(),       // "SIS:AAAA-MM-DD" dos dias que têm 012 importado
    imps: [],                 // histórico de planilhas importadas
    ui: { mes: null, sort: "padrao", fs: FS_DEF, larg: {}, dia012: "todos", busca: "", focal: "", perf: "todas", atraso: "todos", de: "", ate: "", visao: "geral", impSis: "VAL", unidades: [], sub: "quadro", pagador: "", pagBusca: "", pagSort: "previstas", ctrlMes: null, cobraSab: true, cobraDom: false, dispensados: { VAL: [], RVA: [] } },
    det: { sigla: null, sis: "", filtro: "todos" },
    sem: { aberto: false, dia: "todos" },
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
    PT.clienteSet = new Set(); PT.diasSet = new Set(); PT.transpSet = new Set(); PT.diasLegado = new Set();
    SIS_LISTA.forEach(sis => {
      const dd = PT.dias[sis] || {};
      Object.keys(dd).forEach(dia => {
        PT.diasSet.add(sis + ":" + dia);
        const us = dd[dia].unidades;
        Object.keys(us).forEach(u => {
          (us[u].cli || []).forEach(c => PT.clienteSet.add(sis + ":" + c));
          (us[u].tr || []).forEach(c => PT.transpSet.add(sis + ":" + c));
          if(!Array.isArray(us[u].tr) && us[u].at > 0) PT.diasLegado.add(sis + ":" + dia);
        });
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
      <strong>Atraso = Data da Entrega Realizada maior que a Previsão de Entrega</strong> (a base manda). O relatório 012 só define o responsável: com <strong>asterisco (*)</strong> = <strong>cliente</strong>; sem asterisco = <strong>transportadora</strong>; atrasado na base e ausente do 012 = <strong>A definir</strong> (você edita).</p>

      <div class="ocor-nav">
        <div class="ocor-subtabs" role="tablist" aria-label="Performance Teste">
          <span class="ocor-subtabs-label">Aba</span>
          <div class="ocor-seg">
            <button type="button" role="tab" class="ocor-seg-btn" data-ptsub="quadro">Quadro de performance</button>
            <button type="button" role="tab" class="ocor-seg-btn" data-ptsub="pagador">Performance por pagador</button>
            <button type="button" role="tab" class="ocor-seg-btn" data-ptsub="controle">Importação e controle <span class="pt-badge" id="ptBadge" hidden></span></button>
          </div>
        </div>
      </div>

      <div id="ptSubControle">
      <div class="panel" id="ptImportPanel">
        <div class="panel-header">Enviar arquivos (por sistema: Do Valle VAL · Real Vale RVA)</div>
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
      <div id="ptControle"></div>
      </div>

      <div id="ptSubPagador">
        <div id="ptPagador"></div>
      </div>

      <div id="ptSubQuadro">
      <div id="ptWrap"><div class="empty">Carregando dados salvos…</div></div>
      <div id="ptPerfil"></div>
      <div id="ptSem012"></div>
      <div id="ptConc"></div>
      <div id="ptDetalhe"></div>
      <div id="ptDias"></div>
      </div>
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
          const jaTem = dd[r.dia];
          if(jaTem && jaTem.arquivos.indexOf(f.name) > -1 && Object.values(jaTem.unidades).reduce((x, u) => x + u.np + u.ac + u.at, 0) === r.total && Object.values(jaTem.unidades).every(u => Array.isArray(u.tr) || !u.at)){
            logar("012", "warn", `<b>${esc(f.name)}</b> — já estava importado (${sis} · ${br(r.dia)}). Ignorado, nada foi contado duas vezes.`);
            continue;
          }
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
          const temPag = r.registros.some(x => x.g || x.j);
          if(PT.imps.some(i => (i.sis || "VAL") === sis && i.nome === f.name && i.linhas === r.registros.length && (i.pag || !temPag))){
            logar("base", "warn", `<b>${esc(f.name)}</b> — essa planilha já foi importada em ${sis}. Ignorada, nada foi contado duas vezes.`);
            continue;
          }
          let novos = 0, atual = 0, mantidos = 0; const mudados = [];
          r.registros.forEach(n => {
            n.s = sis; n.x = n.k; n.k = sis + ":" + n.x;
            const ex = PT.base.get(n.k);
            if(ex){
              // baixa não "volta atrás": se já estava baixado, uma planilha mais antiga não reabre o documento
              if(PTCore.ehBaixa(ex.c, ex.u) && !PTCore.ehBaixa(n.c, n.u)){
                mantidos++;
                if(!ex.g && !ex.j && (n.g || n.j)){ ex.g = n.g; ex.j = n.j; mudados.push(ex); }   // só completa o pagador
                return;
              }
              atual++;
            }else novos++;
            PT.base.set(n.k, n); mudados.push(n);
          });
          if(PT.db){
            try{ await idbGravar(PT.db, mudados); }
            catch(e){ logar("base", "err", `Não consegui gravar <b>${esc(f.name)}</b> no navegador (${esc(e && e.message || e)}). Os dados valem só até fechar a página.`); PT.dbOk = false; }
          }
          PT.imps.unshift({sis, nome: f.name, periodo: r.periodo, linhas: r.registros.length, novos, atualizados: atual, em: hojeISO(), pag: temPag});
          PT.imps = PT.imps.slice(0, 200); lsSet(K.imps, PT.imps);
          mudouBase = true;
          const ig = r.ignorados;
          logar("base", "ok", `${caixa === "012" ? "↪ estava na caixa 2, registrado aqui · " : ""}<b>${esc(f.name)}</b> — base <b>${sis}</b>${r.periodo ? " (previsão " + esc(r.periodo) + ")" : ""}: ${fInt(r.registros.length)} documentos · ${fInt(novos)} novos · ${fInt(atual)} atualizados${mantidos ? " · " + fInt(mantidos) + " já baixados mantidos" : ""}${ig.cancelados ? " · " + fInt(ig.cancelados) + " cancelados ignorados" : ""}.`);
          if(!r.colunaPagador) logar("base", "warn", `<b>${esc(f.name)}</b> — não achei a coluna do <b>pagador</b> nesta planilha, então o filtro por pagador fica vazio. Colunas encontradas: ${esc(r.cabecalhos.join(" · "))}. Exporte do SSW incluindo a coluna <b>Cliente Pagador</b> (e <b>CNPJ Pagador</b>).`);
          else logar("base", "ok", `Pagador lido da coluna <b>${esc(r.colunaPagador)}</b> da base de entregas.`);
          if(r.divergenciaDatas) logar("base", "warn", `${fInt(r.divergenciaDatas)} documento(s) de <b>${esc(f.name)}</b> têm entrega depois da previsão mas 0 dias úteis de atraso no SSW (ex.: baixa em sábado/domingo) — o painel conta como <b>atraso</b>, porque Data da Entrega Realizada &gt; Previsão.`);
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
    renderSub();
    renderResumoImport();
    renderControle();
    renderDash();
    renderPagador();
    renderPerfil();
    renderSem012();
    renderConc();
    renderDetalhe();
    renderDias();
  }
  function renderSub(){
    if(["quadro", "pagador", "controle"].indexOf(PT.ui.sub) === -1) PT.ui.sub = "quadro";
    const alvo = { quadro: "ptSubQuadro", pagador: "ptSubPagador", controle: "ptSubControle" };
    Object.keys(alvo).forEach(k => { const el = document.getElementById(alvo[k]); if(el) el.style.display = PT.ui.sub === k ? "" : "none"; });
    document.querySelectorAll("[data-ptsub]").forEach(b => b.classList.toggle("active", b.dataset.ptsub === PT.ui.sub));
  }
  function irPara(sub){ PT.ui.sub = sub; salvarUI(); renderSub(); window.scrollTo(0, 0); }

  function renderResumoImport(){
    const sis = PT.ui.impSis;
    document.querySelectorAll("[data-ptsub]").forEach(b => b.addEventListener("click", () => irPara(b.dataset.ptsub)));
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

  /* ---------- campo de data digitada (dd/mm/aaaa) ----------
     Só aplica o filtro quando a data está COMPLETA e válida (ou vazia): enquanto a pessoa
     digita, nada é recarregado — era isso que bagunçava o campo. */
  function dataDigitadaParaISO(t){
    const m = String(t).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if(!m) return null;
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mes = Number(m[2]), dia = Number(m[1]);
    const d = new Date(ano, mes - 1, dia);
    if(d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
    return ano + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
  }
  function ligarCampoData(el, chave, aplicar){
    if(!el) return;
    const tentar = (forcar) => {
      const t = el.value.trim();
      if(!t){ el.classList.remove("pt-data-erro"); if(PT.ui[chave]){ PT.ui[chave] = ""; aplicar(); } return; }
      const iso = dataDigitadaParaISO(t);
      if(!iso){ el.classList.toggle("pt-data-erro", !!forcar || t.length >= 10); el.title = "Data inválida — use dd/mm/aaaa (ex.: 10/10/2026)"; return; }
      el.classList.remove("pt-data-erro"); el.title = "";
      if(PT.ui[chave] !== iso){ PT.ui[chave] = iso; aplicar(); }
    };
    el.addEventListener("input", () => {
      const d = el.value.replace(/\D/g, "").slice(0, 8);
      let v = d;
      if(d.length > 4) v = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
      else if(d.length > 2) v = d.slice(0, 2) + "/" + d.slice(2);
      if(v !== el.value) el.value = v;
      el.classList.remove("pt-data-erro");
      if(d.length === 8) tentar(false);        // completa (dd/mm/aaaa): aplica na hora
      else if(d.length === 0) tentar(false);   // apagou tudo: limpa o filtro
    });
    el.addEventListener("blur", () => tentar(true));          // dd/mm/aa também vale ao sair do campo
    el.addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); tentar(true); } });
  }

  function filtrosAtivos(){
    const u = PT.ui;
    return (u.busca.trim() ? 1 : 0) + (u.focal ? 1 : 0) + (u.perf !== "todas" ? 1 : 0) + (u.atraso !== "todos" ? 1 : 0) + (u.de ? 1 : 0) + (u.ate ? 1 : 0) + (u.unidades && u.unidades.length ? 1 : 0) + (u.pagador ? 1 : 0);
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
      if(u.atraso === "pend" && !(x.atrasPend > 0)) return false;
      if(u.atraso === "aberto" && !(x.abertoAtrasado > 0)) return false;
      return true;
    });
  }
  function somar(lista){
    const t = lista.reduce((a, u) => {
      ["exped", "entregue", "noPrazoEnt", "atrasCli", "atrasTrans", "atrasPend", "foraDoPrazo", "abertoAtrasado", "abertoNoPrazo"].forEach(k => a[k] += u[k]);
      return a;
    }, { exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, atrasPend: 0, foraDoPrazo: 0, abertoAtrasado: 0, abertoNoPrazo: 0 });
    t.sla = t.entregue > 0 ? ((t.noPrazoEnt + t.atrasCli) / t.entregue * 100) : null;
    return t;
  }

  // visão Geral: junta VAL + RVA da mesma sigla numa linha só (soma os números e recalcula a performance)
  const CHAVES_SOMA = ["exped", "entregue", "noPrazoEnt", "atrasCli", "atrasTrans", "atrasPend", "foraDoPrazo", "abertoAtrasado", "abertoNoPrazo"];
  function mesclarPorSigla(lista){
    const m = {};
    lista.forEach(u => {
      const a = m[u.sigla] || (m[u.sigla] = Object.assign({ sigla: u.sigla, sistema: "" }, ...CHAVES_SOMA.map(k => ({[k]: 0}))));
      CHAVES_SOMA.forEach(k => { a[k] += u[k] || 0; });
    });
    return Object.values(m).map(a => Object.assign(a, { total: a.exped, sla: a.entregue > 0 ? (a.noPrazoEnt + a.atrasCli) / a.entregue * 100 : null }))
      .sort((a, b) => b.exped - a.exped || a.sigla.localeCompare(b.sigla));
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
    const base = {mes: PT.ui.mes, de: PT.ui.de, ate: PT.ui.ate, transpSet: PT.transpSet, diasLegado: PT.diasLegado, manual: PT.manual, filtroReg: filtroPagadorReg()};
    const listaPagadores = listarPagadores(visao === "geral" ? "" : visao);
    const resAll = PTCore.calcular(PT.base, PT.clienteSet, PT.diasSet, Object.assign({sistema: ""}, base));
    const res = visao === "geral" ? resAll : PTCore.calcular(PT.base, PT.clienteSet, PT.diasSet, Object.assign({sistema: visao}, base));
    PT.resultado = res;
    // os cartões Geral / Do Valle / Real Vale também seguem os filtros (unidade, focal, performance, atrasos, datas)
    const resAllFiltrado = filtrarUnidades(resAll.unidades);
    const porSis = {};
    SIS_LISTA.forEach(k => { porSis[k] = somar(resAllFiltrado.filter(u => u.sistema === k)); });
    const cardsSis = [["geral", "Geral", somar(resAllFiltrado)]].concat(SIS_LISTA.map(k => [k, SIS[k], porSis[k]]));
    const todas = visao === "geral" ? mesclarPorSigla(res.unidades) : res.unidades;
    const filtradas = filtrarUnidades(todas);
    const t = somar(filtradas), un = ordenar(filtradas);
    const nFiltros = filtrosAtivos();
    const todasSemFiltroUnid = todas;

    const avisos = [];
    if(res.atrasosSem012 > 0){
      const dias = Object.keys(res.semDia012).sort();
      const fmtD = k => { const p = k.split(" "); return p.length > 1 ? p[0] + " " + br(p[1]).slice(0, 5) : br(p[0]).slice(0, 5); };
      avisos.push(`⚠ <b>${fInt(res.atrasosSem012)}</b> documento(s) com <b>atraso na base de entregas que não aparecem no relatório 012</b> (baixas em ${dias.slice(0, 8).map(fmtD).join(", ")}${dias.length > 8 ? "…" : ""}). Eles ficam como <b>“A definir”</b> até você escolher o responsável (ou importar o 012 do dia). <button type="button" class="link-btn" data-sem012="1">Ver e definir o responsável</button>`);
    }
    { const pend = pendentesDoMes(PT.ui.mes || "", visao); if(pend.total) avisos.push(`📅 Faltam relatórios 012 de <b>${pend.total}</b> dia(s) no mês (${pend.resumo}). <button type="button" class="link-btn" data-goto="controle">Abrir controle de importação</button>`); }
    if(!Array.from(PT.diasSet).some(k => visao === "geral" || k.indexOf(visao + ":") === 0)) avisos.push(`⚠ Nenhum relatório 012 importado para esta visão: todo atraso baixado fica como <b>“A definir”</b> (o responsável vem do 012 ou da sua edição).`);

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
      <div class="panel pt-filtros-panel">
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
                <option value="pend" ${PT.ui.atraso === "pend" ? "selected" : ""}>Com atraso a definir (sem 012)</option>
                <option value="aberto" ${PT.ui.atraso === "aberto" ? "selected" : ""}>Com aberto atrasado</option>
              </select></label>
              <label>Pagador <select class="small-select pt-pag-sel" id="ptPagadorFiltro" title="Filtra o quadro pelo Cliente Pagador (nomes iguais são juntados)">${opcaoPagadorHTML(listaPagadores)}</select></label>
              <label>Previsão de <input type="text" inputmode="numeric" id="ptDe" class="small-input pt-data" placeholder="dd/mm/aaaa" maxlength="10" autocomplete="off" value="${esc(PT.ui.de ? br(PT.ui.de) : "")}"></label>
              <label>até <input type="text" inputmode="numeric" id="ptAte" class="small-input pt-data" placeholder="dd/mm/aaaa" maxlength="10" autocomplete="off" value="${esc(PT.ui.ate ? br(PT.ui.ate) : "")}"></label>
              <button type="button" class="btn btn-ghost btn-sm" id="ptLimparFiltros" ${nFiltros ? "" : "disabled"}>Limpar filtros${nFiltros ? " (" + nFiltros + ")" : ""}</button>
              <span class="pt-conta">${filtradas.length} de ${todas.length} unidades</span>
            </div>
            <p class="col-resize-hint">Clique numa unidade para ver os documentos em atraso. Arraste a borda direita de uma coluna para ajustar a largura.</p>
      </div>
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
          <div class="perf-stat perf-stat-red"><div class="perf-stat-label">A definir (sem 012)</div><div class="perf-stat-value">${fInt(t.atrasPend)}</div></div>
          <div class="perf-stat perf-stat-red"><div class="perf-stat-label">Aberto Atrasado</div><div class="perf-stat-value">${fInt(t.abertoAtrasado)}</div></div>
        </div>
        <div class="perf-main">
          <div class="panel" id="ptTablePanel">
            <div class="panel-header perf-header">
              <div class="perf-header-org">Previsão de entrega · Unidade Receptora</div>
              <div class="perf-header-title">Performance Teste por Unidade — ${esc(visaoNome)} — Competência: ${esc(rotuloMes(PT.ui.mes))}</div>
            </div>
            <div class="table-wrap perf-table-wrap">
              <table class="perf-table perf-table-full" id="ptTable">
                <colgroup>${COLS.map(c => `<col data-col="${c.id}">`).join("")}</colgroup>
                <thead><tr>${COLS.map(c => `<th class="th-${c.id}" data-col="${c.id}">${c.label}<span class="col-resizer" data-col="${c.id}"></span></th>`).join("")}</tr></thead>
                <tbody>
                  ${un.map(u => `
                    <tr class="pt-linha ${PT.det.sigla === u.sigla && PT.det.sis === u.sistema ? "pt-sel" : ""}" data-sigla="${esc(u.sigla)}" data-sis="${esc(u.sistema)}" title="Ver documentos em atraso de ${esc(u.sigla)}">
                      <td class="perf-unidade">${esc(u.sigla)}${""}</td>
                      <td class="perf-entregue">${u.entregue}</td>
                      <td class="perf-noprazo">${u.noPrazoEnt}</td>
                      <td class="perf-foraprazo">${u.foraDoPrazo}</td>
                      <td class="perf-cliente">${u.atrasCli}</td>
                      <td class="perf-transp">${u.atrasTrans}</td>
                      <td class="perf-apend">${u.atrasPend || ""}</td>
                      <td class="${slaClass(u.sla)}">${fPct(u.sla)}</td>
                      <td class="perf-previstas">${u.exped}</td>
                      <td class="perf-abertoatraso">${u.abertoAtrasado || ""}</td>
                      <td class="perf-abertonoprazo">${u.abertoNoPrazo}</td>
                    </tr>`).join("")}
                </tbody>
                <tfoot>
                  <tr class="perf-total-row">
                    <td>${visao === "geral" ? "TOTAL GERAL" : "TOTAL " + visao}</td><td>${t.entregue}</td><td>${t.noPrazoEnt}</td><td>${t.foraDoPrazo}</td><td>${t.atrasCli}</td><td>${t.atrasTrans}</td><td>${t.atrasPend || ""}</td>
                    <td>${fPct(t.sla)}</td><td>${t.exped}</td><td>${t.abertoAtrasado || ""}</td><td>${t.abertoNoPrazo}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="footer-note">Performance = (No Prazo + Cliente) ÷ Entregue. Entregue = baixas 01, 69 e 46 (só GNA). Fora do Prazo = baixa atrasada (Cliente = CTRC com * no relatório 012; Transportadora = sem *). A definir = atrasado na base, mas ausente do 012: o responsável é você quem edita (conta como fora do prazo e NÃO como cliente até ser definido). Aberto = ainda sem baixa. Atraso = Data da Entrega Realizada maior que a Previsão de Entrega (comparação de datas, igual à base).</div>
          </div>
        </div>
      </div>`;

    ligarEventosDash();
    wrap.querySelectorAll("[data-sem012]").forEach(b => b.addEventListener("click", () => { PT.sem.aberto = true; PT.sem.dia = "todos"; renderSem012(); }));
    wrap.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => irPara(b.dataset.goto)));
  }


  /* =====================================================================
     PERFORMANCE POR PAGADOR
     O sistema lê o campo "Cliente Pagador" de toda a base e agrupa pelo NOME:
     CNPJs diferentes com o mesmo nome (ignorando maiúsculas, acentos, pontuação e
     espaços repetidos) viram UM pagador só. Nomes diferentes nunca são juntados.
     Mesmo cálculo do quadro: (No prazo + Cliente) ÷ Entregue.
     ===================================================================== */
  const SEM_PAGADOR = "(SEM PAGADOR)";
  const pagNormMemo = new Map();
  function pagChave(r){
    const g = r.g || "";
    if(!g) return SEM_PAGADOR;
    let k = pagNormMemo.get(g);
    if(k === undefined){
      k = g.replace(/\u00a0/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[.,;\-\/]/g, " ").replace(/\s+/g, " ").trim() || SEM_PAGADOR;
      pagNormMemo.set(g, k);
    }
    return k;
  }
  // lista de pagadores (nome unificado) do mês/sistema escolhidos: chave -> {chave, nome, docs, cnpjs}
  function listarPagadores(sisFiltro){
    const m = new Map();
    PT.base.forEach(r => {
      if(sisFiltro && r.s !== sisFiltro) return;
      if(PT.ui.mes && r.p.slice(0, 7) !== PT.ui.mes) return;
      const k = pagChave(r);
      let a = m.get(k); if(!a){ a = { chave: k, nome: k === SEM_PAGADOR ? SEM_PAGADOR : "", nomes: {}, docs: 0, cnpjs: new Set() }; m.set(k, a); }
      a.docs++; if(r.j) a.cnpjs.add(r.j);
      if(r.g) a.nomes[r.g] = (a.nomes[r.g] || 0) + 1;
    });
    m.forEach(a => {      // nome de exibição = a grafia mais usada no arquivo
      if(a.chave !== SEM_PAGADOR) a.nome = Object.keys(a.nomes).sort((x, y) => a.nomes[y] - a.nomes[x])[0] || a.chave;
    });
    return Array.from(m.values()).sort((a, b) => b.docs - a.docs || a.nome.localeCompare(b.nome));
  }
  const filtroPagadorReg = () => PT.ui.pagador ? (r => pagChave(r) === PT.ui.pagador) : null;
  function opcaoPagadorHTML(lista){
    return `<option value="">Todos os pagadores</option>` + lista.map(a => `<option value="${esc(a.chave)}" ${PT.ui.pagador === a.chave ? "selected" : ""}>${esc(a.nome)} (${fInt(a.docs)})</option>`).join("");
  }

  function renderPagador(){
    const wrap = document.getElementById("ptPagador"); if(!wrap) return;
    if(!PT.pronto){ wrap.innerHTML = `<div class="empty">Carregando dados salvos…</div>`; return; }
    if(!PT.base.size){
      wrap.innerHTML = `<div class="empty">Nenhuma planilha de entregas importada ainda.<br>Abra <b>Importação e controle</b> e solte a planilha de CTRCs por previsão de entrega.</div>`;
      return;
    }
    const meses = PTCore.mesesDisponiveis(PT.base);
    if(PT.ui.mes === null || (PT.ui.mes !== "" && meses.indexOf(PT.ui.mes) === -1)) PT.ui.mes = meses[0] || "";
    if(["geral", "VAL", "RVA"].indexOf(PT.ui.visao) === -1) PT.ui.visao = "geral";
    const visao = PT.ui.visao, visaoNome = visao === "geral" ? "Geral (Do Valle + Real Vale)" : SIS[visao];
    const sisF = visao === "geral" ? "" : visao;

    const pagadores = listarPagadores(sisF);
    const nomePorChave = {}; pagadores.forEach(a => { nomePorChave[a.chave] = a; });
    const semPagador = (nomePorChave[SEM_PAGADOR] || {}).docs || 0;

    const res = PTCore.calcular(PT.base, PT.clienteSet, PT.diasSet, {
      mes: PT.ui.mes, de: PT.ui.de, ate: PT.ui.ate, sistema: sisF,
      transpSet: PT.transpSet, diasLegado: PT.diasLegado, manual: PT.manual,
      agrupar: pagChave
    });
    const porChave = mesclarPorSigla(res.unidades);        // "sigla" aqui = nome do pagador (VAL + RVA somados)
    const termos = (PT.ui.pagBusca || "").toUpperCase().split(/[;]+/).map(x => x.trim()).filter(Boolean);
    let linhas = porChave.map(u => Object.assign({}, u, { nome: (nomePorChave[u.sigla] || {}).nome || u.sigla, ncnpj: (nomePorChave[u.sigla] || { cnpjs: new Set() }).cnpjs.size }));
    if(PT.ui.pagador) linhas = linhas.filter(u => u.sigla === PT.ui.pagador);
    if(termos.length) linhas = linhas.filter(u => termos.some(t => u.sigla.indexOf(t) !== -1));
    const ord = PT.ui.pagSort || "previstas";
    if(ord === "sla-asc") linhas.sort((a, b) => (a.sla ?? 999) - (b.sla ?? 999));
    else if(ord === "sla-desc") linhas.sort((a, b) => (b.sla ?? -1) - (a.sla ?? -1));
    else if(ord === "nome") linhas.sort((a, b) => a.nome.localeCompare(b.nome));
    else linhas.sort((a, b) => b.exped - a.exped || a.nome.localeCompare(b.nome));
    const t = somar(linhas);

    const avisos = [];
    if(semPagador > 0) avisos.push(`⚠ <b>${fInt(semPagador)}</b> documento(s) estão <b>sem Cliente Pagador</b> (planilha importada antes desta aba, ou campo vazio). Para preencher, solte de novo a planilha em <b>Importação e controle</b> — os dados e as edições de responsável são mantidos. Eles aparecem na linha <b>${esc(SEM_PAGADOR)}</b>.`);
    if(res.atrasosSem012 > 0) avisos.push(`⚠ Há atrasos <b>“A definir”</b> (sem relatório 012) no mês: eles pesam contra a performance até o responsável ser definido na aba <b>Quadro de performance</b>.`);

    wrap.innerHTML = `
      <h3 class="pt-pag-tit">Performance por pagador</h3>
      <p class="section-desc">Lê o <b>Cliente Pagador</b> de toda a base e calcula a performance de cada um — <b>(No Prazo + Cliente) ÷ Entregue</b>. Pagadores com <b>o mesmo nome</b> (mesmo com CNPJs diferentes) são <b>juntados</b>; nomes diferentes ficam separados. Competência e sistema valem também para o Quadro de performance.</p>
      ${avisos.length ? `<div class="pt-aviso">${avisos.map(a => `<div>${a}</div>`).join("")}</div>` : ""}
      <div class="panel pt-filtros-panel">
        <div class="toolbar">
          <span class="pt-filtros">
            <label class="check-inline">Competência:
              <select class="small-select" id="ptPagMes">
                ${meses.map(m => `<option value="${m}" ${PT.ui.mes === m ? "selected" : ""}>${esc(rotuloMes(m))}</option>`).join("")}
                ${meses.length > 1 ? `<option value="" ${PT.ui.mes === "" ? "selected" : ""}>Todos os meses</option>` : ""}
              </select>
            </label>
            <label class="check-inline">Sistema:
              <select class="small-select" id="ptPagSis">
                <option value="geral" ${visao === "geral" ? "selected" : ""}>Geral (VAL + RVA)</option>
                <option value="VAL" ${visao === "VAL" ? "selected" : ""}>Do Valle (VAL)</option>
                <option value="RVA" ${visao === "RVA" ? "selected" : ""}>Real Vale (RVA)</option>
              </select>
            </label>
            <label class="check-inline">Nome do pagador:
              <select class="small-select pt-pag-sel" id="ptPagSel">${opcaoPagadorHTML(pagadores)}</select>
            </label>
            <label class="check-inline">Buscar nome:
              <input type="search" id="ptPagBusca" class="small-input" placeholder="parte do nome (use ; para vários)" value="${esc(PT.ui.pagBusca || "")}">
            </label>
            <label class="check-inline">Ordenar por:
              <select class="small-select" id="ptPagSort">
                <option value="previstas" ${ord === "previstas" ? "selected" : ""}>Entregas previstas</option>
                <option value="sla-asc" ${ord === "sla-asc" ? "selected" : ""}>Performance — menor para maior</option>
                <option value="sla-desc" ${ord === "sla-desc" ? "selected" : ""}>Performance — maior para menor</option>
                <option value="nome" ${ord === "nome" ? "selected" : ""}>Nome (A–Z)</option>
              </select>
            </label>
          </span>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="ptPagLimpar" ${(PT.ui.pagador || termos.length) ? "" : "disabled"}>Limpar filtro</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ptPagExport" title="Baixar esta tabela em Excel (.xlsx)">Exportar Excel</button>
          </div>
        </div>
        <p class="col-resize-hint">${fInt(linhas.length)} de ${fInt(pagadores.length)} pagadores · ${fInt(pagadores.filter(a => a.cnpjs.size > 1).length)} com mais de um CNPJ juntados pelo nome.</p>
      </div>
      <div class="panel" id="ptPagPanel">
        <div class="panel-header perf-header">
          <div class="perf-header-org">Previsão de entrega · Cliente Pagador</div>
          <div class="perf-header-title">Performance por Pagador — ${esc(visaoNome)} — Competência: ${esc(rotuloMes(PT.ui.mes))}</div>
        </div>
        <div class="pt-pag-kpi"><span>Performance${PT.ui.pagador || termos.length ? " do filtro" : " geral"}</span><b class="${slaKpiClass(t.sla)}">${fPct(t.sla)}</b><small>${fInt(t.entregue)} entregues · ${fInt(t.exped)} previstas · meta 98%</small></div>
        <div class="table-wrap perf-table-wrap">
          <table class="perf-table perf-table-full pt-pag-table" id="ptPagTable">
            <thead><tr>${COLS.map((c, i) => `<th class="th-${c.id}">${i === 0 ? "Pagador (nome)" : c.label}</th>`).join("")}</tr></thead>
            <tbody>
              ${linhas.length ? linhas.map(u => `
                <tr>
                  <td class="perf-unidade" title="${esc(u.nome)}${u.ncnpj > 1 ? " — " + u.ncnpj + " CNPJs juntados" : ""}">${esc(u.nome)}${u.ncnpj > 1 ? ` <small class="pt-pag-nome">${u.ncnpj} CNPJs juntados</small>` : ""}</td>
                  <td class="perf-entregue">${u.entregue}</td>
                  <td class="perf-noprazo">${u.noPrazoEnt}</td>
                  <td class="perf-foraprazo">${u.foraDoPrazo}</td>
                  <td class="perf-cliente">${u.atrasCli}</td>
                  <td class="perf-transp">${u.atrasTrans}</td>
                  <td class="perf-apend">${u.atrasPend || ""}</td>
                  <td class="${slaClass(u.sla)}">${fPct(u.sla)}</td>
                  <td class="perf-previstas">${u.exped}</td>
                  <td class="perf-abertoatraso">${u.abertoAtrasado || ""}</td>
                  <td class="perf-abertonoprazo">${u.abertoNoPrazo}</td>
                </tr>`).join("") : `<tr><td colspan="${COLS.length}" class="empty">Nenhum pagador encontrado com esse filtro.</td></tr>`}
            </tbody>
            <tfoot>
              <tr class="perf-total-row">
                <td>TOTAL</td><td>${t.entregue}</td><td>${t.noPrazoEnt}</td><td>${t.foraDoPrazo}</td><td>${t.atrasCli}</td><td>${t.atrasTrans}</td><td>${t.atrasPend || ""}</td>
                <td>${fPct(t.sla)}</td><td>${t.exped}</td><td>${t.abertoAtrasado || ""}</td><td>${t.abertoNoPrazo}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="footer-note">Performance = (No Prazo + Cliente) ÷ Entregue. Entregue = baixas 01, 69 e 46 (só GNA). Fora do Prazo = baixa atrasada (Cliente = CTRC com * no relatório 012; Transportadora = sem *). A definir = atrasado na base e ausente do 012. Pagadores são unidos só quando o nome é igual (sem diferenciar maiúsculas, acentos e pontuação).</div>
      </div>`;

    const $ = id => document.getElementById(id);
    $("ptPagMes").addEventListener("change", e => { PT.ui.mes = e.target.value; PT.det.sigla = null; salvarUI(); render(); });
    $("ptPagSis").addEventListener("change", e => { PT.ui.visao = e.target.value; PT.det.sigla = null; salvarUI(); render(); });
    $("ptPagSel").addEventListener("change", e => { PT.ui.pagador = e.target.value; salvarUI(); render(); });
    $("ptPagSort").addEventListener("change", e => { PT.ui.pagSort = e.target.value; salvarUI(); renderPagador(); });
    let tB = null;
    $("ptPagBusca").addEventListener("input", e => {
      PT.ui.pagBusca = e.target.value; clearTimeout(tB);
      tB = setTimeout(() => { salvarUI(); renderPagador(); const b = $("ptPagBusca"); if(b){ b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 250);
    });
    $("ptPagLimpar").addEventListener("click", () => { PT.ui.pagador = ""; PT.ui.pagBusca = ""; salvarUI(); render(); });
    $("ptPagExport").addEventListener("click", () => {
      const p = $("ptPagPanel");
      exportarTabelasExcel([{
        nome: "Performance por pagador",
        titulo: p.querySelector(".perf-header-title").textContent.trim(),
        subtitulo: p.querySelector(".perf-header-org").textContent.trim(),
        tabela: $("ptPagTable"),
        rodape: "Performance = (No Prazo + Cliente) ÷ Entregue. Pagadores com o mesmo nome foram unidos."
      }], `Performance_Pagador_${dataParaArquivo()}.xlsx`);
    });
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
    $("ptPagadorFiltro").addEventListener("change", e => { PT.ui.pagador = e.target.value; salvarUI(); render(); });
    $("ptAtraso").addEventListener("change", e => { PT.ui.atraso = e.target.value; reDash(); });
    ligarCampoData($("ptDe"), "de", reDash);
    ligarCampoData($("ptAte"), "ate", reDash);
    $("ptLimparFiltros").addEventListener("click", () => { Object.assign(PT.ui, {busca: "", focal: "", perf: "todas", atraso: "todos", de: "", ate: "", unidades: [], pagador: ""}); salvarUI(); render(); });
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

  /* ---------- PERFIL DAS ENTREGAS: previsão × dia da baixa (adiantadas / no dia / atrasadas) ---------- */
  const BUCKETS = [
    ["ant3", "3+ dias antes", "pt-b-ant"], ["ant2", "2 dias antes", "pt-b-ant"], ["ant1", "1 dia antes", "pt-b-ant"],
    ["dia", "No dia previsto", "pt-b-dia"],
    ["at1", "1 dia atrasado", "pt-b-at"], ["at2", "2 dias atrasado", "pt-b-at"], ["at3", "3+ dias atrasado", "pt-b-at3"]
  ];
  const TIPOS_BAIXA = { "01": "01 · Entrega realizada", "69": "69 · Entrega com ressalva", "46": "46 · Entrega (GNA)" };
  function diffUteis(p, e){          // dias úteis (seg–sex) entre previsão e baixa; negativo = adiantado
    if(p === e) return 0;
    const pos = e > p, ini = pos ? p : e, fim = pos ? e : p;
    const d = new Date(ini + "T00:00:00"), f = new Date(fim + "T00:00:00"); let n = 0;
    while(d < f){ d.setDate(d.getDate() + 1); const w = d.getDay(); if(w !== 0 && w !== 6) n++; }
    return pos ? n : -n;
  }
  function bucketDe(r){
    if(PTCore.estaAtrasado(r, hojeISO())){
      const n = r.e ? Math.max(1, diffUteis(r.p, r.e)) : ((r.d !== null && r.d !== undefined && r.d > 0) ? r.d : 1);
      return n >= 3 ? "at3" : n === 2 ? "at2" : "at1";
    }
    const n = r.e ? diffUteis(r.p, r.e) : 0;
    return n <= -3 ? "ant3" : n === -2 ? "ant2" : n === -1 ? "ant1" : "dia";
  }
  const COR_B = { ant3: "#1f7a36", ant2: "#4fae5a", ant1: "#a6d9a0", dia: "#b9c2b6", at1: "#f0c35a", at2: "#e58a3a", at3: "#c23b2e" };
  function barraEmpilhada(c, altura, rotulos){
    const tot = BUCKETS.reduce((a, b) => a + c[b[0]], 0) || 1;
    return `<div class="pt-stack" style="height:${altura}px">${BUCKETS.filter(b => c[b[0]] > 0).map(([k, nome]) => {
      const p = c[k] / tot * 100;
      return `<i data-tip="<b>${nome}</b><br>${fInt(c[k])} entrega(s) · ${p.toFixed(1).replace(".", ",")}%" style="flex:${c[k]};background:${COR_B[k]}">${rotulos && p >= 7 ? `<span>${p.toFixed(0)}%</span>` : ""}</i>`;
    }).join("")}</div>`;
  }
  function renderPerfil(){
    const el = document.getElementById("ptPerfil"); if(!el) return;
    if(!PT.pronto || !PT.base.size || !PT.resultado){ el.innerHTML = ""; return; }
    const visao = PT.ui.visao, mes = PT.ui.mes || "";
    const ok = new Set(filtrarUnidades(PT.resultado.unidades).map(u => u.sistema + "|" + u.sigla));
    const cont = () => ({ant3: 0, ant2: 0, ant1: 0, dia: 0, at1: 0, at2: 0, at3: 0, n: 0 });
    const geral = cont(), porTipo = {}, porDia = {}; let abertos = 0, previstos = 0;
    PT.base.forEach(r => {
      if(visao !== "geral" && r.s !== visao) return;
      if(mes && r.p.slice(0, 7) !== mes) return;
      if(PT.ui.de && r.p < PT.ui.de) return;
      if(PT.ui.ate && r.p > PT.ui.ate) return;
      if(!ok.has((r.s || "") + "|" + r.u)) return;
      previstos++;
      const dia = porDia[r.p] || (porDia[r.p] = Object.assign(cont(), {prev: 0, ab: 0}));
      dia.prev++;
      if(!PTCore.ehBaixa(r.c, r.u)){ abertos++; dia.ab++; return; }
      const b = bucketDe(r);
      geral[b]++; geral.n++; dia[b]++; dia.n++;
      const t = porTipo[r.c] || (porTipo[r.c] = cont()); t[b]++; t.n++;
    });
    if(!geral.n){ el.innerHTML = ""; return; }
    const pf = (v, t, d) => t ? (v / t * 100).toFixed(d == null ? 1 : d).replace(".", ",") + "%" : "–";
    const antes = geral.ant3 + geral.ant2 + geral.ant1, atras = geral.at1 + geral.at2 + geral.at3;
    const dias = Object.keys(porDia).sort();
    const noPrazoDia = x => (x.ant3 + x.ant2 + x.ant1 + x.dia);
    const mostrarPctCol = dias.length <= 16;
    const nomeVis = visao === "geral" ? "Geral" : SIS[visao];

    el.innerHTML = `
      <div class="panel pt-pf" id="ptPerfilPanel">
        <div class="panel-header perf-header">
          <div class="perf-header-org">Previsão × dia da baixa · ${esc(nomeVis)} · ${esc(rotuloMes(PT.ui.mes))}</div>
          <div class="perf-header-title">Perfil das entregas — quando foram entregues em relação à previsão</div>
        </div>

        <div class="pt-pf-tiles">
          <div class="pt-tile" style="--c:${COR_B.ant2}"><span>Entregues antes da previsão</span><b>${fInt(antes)}</b><em>${pf(antes, geral.n)} das entregas</em></div>
          <div class="pt-tile" style="--c:${COR_B.dia}"><span>Entregues no dia previsto</span><b>${fInt(geral.dia)}</b><em>${pf(geral.dia, geral.n)} das entregas</em></div>
          <div class="pt-tile" style="--c:${COR_B.at2}"><span>Entregues com atraso</span><b>${fInt(atras)}</b><em>${pf(atras, geral.n)} das entregas</em></div>
          <div class="pt-tile" style="--c:#8a6d1a"><span>Ainda sem baixa</span><b>${fInt(abertos)}</b><em>de ${fInt(previstos)} previstas</em></div>
        </div>

        <div class="pt-pf-sec">
          <div class="pt-pf-tit">Como as ${fInt(geral.n)} entregas se distribuem</div>
          ${barraEmpilhada(geral, 34, true)}
          <div class="pt-leg">${BUCKETS.map(([k, nome]) => `<span><i style="background:${COR_B[k]}"></i>${nome} <b>${fInt(geral[k])}</b> <small>${pf(geral[k], geral.n)}</small></span>`).join("")}</div>
          <div class="pt-pf-dica">Verde = antes da previsão · cinza = no dia · laranja/vermelho = atraso</div>
        </div>

        <div class="pt-pf-sec">
          <div class="pt-pf-tit">Dia a dia, por data de previsão <small>(100% = entregas baixadas daquela previsão; o número em cima é o % entregue no prazo)</small></div>
          <div class="pt-cols" style="--n:${dias.length}">
            <div class="pt-cols-grade">
              ${dias.map(d => { const x = porDia[d]; return `<div class="pt-col">
                <div class="pt-col-top">${mostrarPctCol && x.n ? pf(noPrazoDia(x), x.n, 0) : ""}</div>
                <div class="pt-col-barra" data-tip="<b>Previsão ${br(d)}</b><br>${fInt(x.prev)} previstas · ${fInt(x.n)} baixadas · ${fInt(x.ab)} sem baixa<br>${pf(noPrazoDia(x), x.n)} no prazo">${x.n ? barraEmpilhada(x, 0, false).replace('style="height:0px"', 'style="height:100%"') : ""}</div>
                <div class="pt-col-x">${br(d).slice(0, 5)}</div></div>`; }).join("")}
            </div>
          </div>
        </div>

        <div class="pt-pf-sec pt-pf-2col">
          <div>
            <div class="pt-pf-tit">Por tipo de baixa</div>
            ${Object.keys(porTipo).sort().map(c => { const t = porTipo[c]; return `<div class="pt-tipo"><div class="pt-tipo-top"><b>${esc(TIPOS_BAIXA[c] || c)}</b><span>${fInt(t.n)} entregas · ${pf(t.ant1 + t.ant2 + t.ant3 + t.dia, t.n)} no prazo</span></div>${barraEmpilhada(t, 14, false)}</div>`; }).join("")}
          </div>
          <div>
            <div class="pt-pf-tit">Atrasos por tamanho</div>
            ${[["at1", "1 dia"], ["at2", "2 dias"], ["at3", "3 dias ou mais"]].map(([k, n]) => `<div class="pt-tipo"><div class="pt-tipo-top"><b>${n} de atraso</b><span>${fInt(geral[k])} entregas · ${pf(geral[k], atras)} dos atrasos</span></div><div class="pt-stack" style="height:14px"><i data-tip="<b>${n}</b><br>${fInt(geral[k])}" style="flex:${geral[k] || 0.0001};background:${COR_B[k]}"></i><i style="flex:${Math.max(atras - geral[k], 0.0001)};background:#eef1ec"></i></div></div>`).join("")}
          </div>
        </div>

        <details class="pt-pf-det">
          <summary>Ver tabela por dia de previsão</summary>
          <div class="toolbar"><div class="toolbar-actions"><button type="button" class="btn btn-ghost btn-sm" id="ptPerfilExport">Exportar Excel</button></div></div>
          <div class="table-wrap">
            <table class="perf-table perf-table-simple pt-dias-table pt-pf-tab" id="ptPerfilTable">
              <thead><tr><th>Previsão</th><th>Previstas</th><th>3+ dias antes</th><th>2 dias antes</th><th>1 dia antes</th><th>No dia</th><th>1 dia atraso</th><th>2 dias atraso</th><th>3+ atraso</th><th>Sem baixa</th><th>% no prazo</th></tr></thead>
              <tbody>${dias.map(d => { const x = porDia[d]; return `<tr><td class="perf-unidade">${br(d)}</td><td>${x.prev}</td><td>${x.ant3 || ""}</td><td>${x.ant2 || ""}</td><td>${x.ant1 || ""}</td><td>${x.dia || ""}</td><td>${x.at1 || ""}</td><td>${x.at2 || ""}</td><td>${x.at3 || ""}</td><td>${x.ab || ""}</td><td>${pf(noPrazoDia(x), x.n)}</td></tr>`; }).join("")}</tbody>
            </table>
          </div>
        </details>
        <div class="footer-note">Previsão de Entrega × Data da Entrega Realizada em dias úteis (seg–sex). Considera só documentos baixados (01, 69 e 46 na GNA); atraso = Data da Entrega Realizada maior que a Previsão (sábado/domingo contam como atraso mesmo com 0 dia útil; entram em “1 dia atrasado”). Respeita os filtros da tabela acima.</div>
      </div>`;
    const ex = document.getElementById("ptPerfilExport");
    if(ex) ex.addEventListener("click", () => {
      exportarTabelasExcel([{ nome: "Perfil das entregas", titulo: "Perfil das entregas — " + nomeVis + " — " + rotuloMes(PT.ui.mes), subtitulo: "Previsão × dia da baixa", tabela: document.getElementById("ptPerfilTable"), rodape: "Dias úteis (seg–sex)." }], `Perfil_entregas_${dataParaArquivo()}.xlsx`);
    });
  }

  /* dica flutuante dos gráficos (um único elemento para a página toda) */
  (function(){
    let tip = null;
    document.addEventListener("mouseover", e => {
      const a = e.target.closest && e.target.closest("[data-tip]");
      if(!a){ if(tip) tip.style.display = "none"; return; }
      if(!tip){ tip = document.createElement("div"); tip.className = "pt-tip"; document.body.appendChild(tip); }
      tip.innerHTML = a.getAttribute("data-tip"); tip.style.display = "block";
    });
    document.addEventListener("mousemove", e => {
      if(!tip || tip.style.display === "none") return;
      const w = tip.offsetWidth, x = Math.min(e.clientX + 14, window.innerWidth - w - 8);
      tip.style.left = x + "px"; tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 12) + "px";
    });
  })();

  /* ---------- responsável pelo atraso (editável) ---------- */
  function salvarResp(){ lsSet(K.resp, PT.manual); }
  function respSelect(r, resp, origem){
    if(!resp) return "";                       // aberto: ainda não há responsável
    const v = PT.manual[r.k] || (resp === "pend" ? "" : resp);
    const nota = origem === "manual" ? "editado por você" : origem === "012" ? "vem do 012" : origem === "012 antigo" ? "012 importado em versão antiga (reimporte para confirmar)" : "não aparece no 012";
    return `<select class="small-select pt-resp pt-resp-${resp}" data-resp="${esc(r.k)}" title="${esc(nota)}">
      <option value="" ${v === "" ? "selected" : ""}>A definir</option>
      <option value="cliente" ${v === "cliente" ? "selected" : ""}>Cliente</option>
      <option value="transp" ${v === "transp" ? "selected" : ""}>Transportadora</option></select>${origem === "manual" ? ` <button type="button" class="link-btn" data-resp-volta="${esc(r.k)}" title="Voltar ao que diz o 012">↺</button>` : ""}`;
  }
  function ligarRespSelects(raiz){
    raiz.querySelectorAll("select[data-resp]").forEach(sel => sel.addEventListener("change", () => {
      const k = sel.dataset.resp;
      if(sel.value) PT.manual[k] = sel.value; else delete PT.manual[k];
      salvarResp(); render();
    }));
    raiz.querySelectorAll("[data-resp-volta]").forEach(b => b.addEventListener("click", () => { delete PT.manual[b.dataset.respVolta]; salvarResp(); render(); }));
  }

  /* ---------- CONFERÊNCIA: o 012 diz "atrasado", mas a base não conta como atraso — e por quê ---------- */
  function conferenciaMotivos(){
    const mes = PT.ui.mes || "", out = [];
    SIS_LISTA.forEach(sis => {
      const outro = sis === "VAL" ? "RVA" : "VAL";
      Object.keys(PT.dias[sis] || {}).forEach(dia => {
        const us = PT.dias[sis][dia].unidades;
        Object.keys(us).forEach(un => {
          const marcar = (lista, tipo) => (lista || []).forEach(c => {
            const r = PT.base.get(sis + ":" + c);
            let motivo = "";
            if(!r){
              motivo = PT.base.get(outro + ":" + c)
                ? `Está na base de ${outro}, mas este 012 foi importado em ${sis}. Reimporte o 012 no sistema certo.`
                : "CTRC não existe na base importada (a base é filtrada por previsão de entrega: importe a planilha que contém a previsão dele).";
            }else if(!PTCore.ehBaixa(r.c, r.u)){
              motivo = `Na base o código da última ocorrência é ${r.c || "(vazio)"}, que não é baixa (01/69, ou 46 só na GNA). Por isso entra como “Aberto”, não como Entregue.`;
            }else if(!PTCore.estaAtrasado(r, hojeISO())){
              motivo = `Na base a entrega (${r.e ? br(r.e) : "sem data"}) não é posterior à previsão (${br(r.p)}). Pela regra, não é atraso — base atualizada ou 012 desatualizado.`;
            }else if(mes && r.p.slice(0, 7) !== mes){
              motivo = `Previsão ${br(r.p)} é de outro mês que o filtro de competência (${rotuloMes(mes)}).`;
            }
            if(motivo) out.push({sis, dia, un, ctrc: c, tipo, r, motivo});
          });
          marcar(us[un].cli, "Cliente (*)"); marcar(us[un].tr, "Transportadora");
        });
      });
    });
    return out;
  }
  function renderConc(){
    const el = document.getElementById("ptConc"); if(!el) return;
    if(!PT.pronto || !PT.base.size || !totalDias()){ el.innerHTML = ""; return; }
    const lista = conferenciaMotivos();
    const aberto = PT.concAberto ? "open" : "";
    if(!lista.length){ el.innerHTML = `<details class="panel pt-hist"><summary class="panel-header">Conferência 012 × base — tudo bate ✔</summary><div class="footer-note">Todo CTRC marcado como atrasado nos relatórios 012 importados também está como atraso (baixado) na base.</div></details>`; return; }
    const q = (PT.concBusca || "").trim().toUpperCase().replace(/\s+/g, "");
    const vis = q ? lista.filter(x => x.ctrc.indexOf(q) > -1) : lista;
    el.innerHTML = `
      <details class="panel pt-hist" id="ptConcDet" ${aberto}>
        <summary class="panel-header">Conferência 012 × base — ${fInt(lista.length)} CTRC(s) atrasados no 012 que a base NÃO conta como atraso baixado</summary>
        <div class="toolbar"><span class="pt-filtros"><label class="check-inline">Buscar CTRC: <input type="search" id="ptConcBusca" class="small-input" placeholder="ex.: GYS289021" value="${esc(PT.concBusca || "")}"></label></span></div>
        <div class="table-wrap"><table class="perf-table perf-table-simple pt-det-table">
          <thead><tr><th>Sistema</th><th>Dia do 012</th><th>Filial destino</th><th>CTRC</th><th>No 012</th><th>Previsão (base)</th><th>Entrega (base)</th><th>Cód. (base)</th><th>Por que não aparece como atraso</th></tr></thead>
          <tbody>${vis.slice(0, 500).map(x => `<tr><td>${x.sis}</td><td>${br(x.dia)}</td><td>${esc(x.un)}</td><td>${esc(x.ctrc)}</td><td>${x.tipo}</td><td>${x.r ? br(x.r.p) : "—"}</td><td>${x.r && x.r.e ? br(x.r.e) : "—"}</td><td>${x.r ? esc(x.r.c) : "—"}</td><td style="text-align:left;white-space:normal;min-width:340px">${esc(x.motivo)}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="footer-note">A base é quem manda: o 012 só dá o responsável. Se o motivo for “não existe na base”, importe a planilha por previsão que contém esses CTRCs.${vis.length > 500 ? " Mostrando 500 primeiros." : ""}</div>
      </details>`;
    const det = document.getElementById("ptConcDet");
    det.addEventListener("toggle", () => { PT.concAberto = det.open; });
    document.getElementById("ptConcBusca").addEventListener("input", e => {
      PT.concBusca = e.target.value; PT.concAberto = true; renderConc();
      const b = document.getElementById("ptConcBusca"); b.focus(); b.setSelectionRange(b.value.length, b.value.length);
    });
  }

  /* ---------- atrasos baixados que NÃO aparecem no 012 (responsável "A definir") ---------- */
  function renderSem012(){
    const el = document.getElementById("ptSem012"); if(!el) return;
    if(!PT.sem.aberto || !PT.resultado){ el.innerHTML = ""; document.body.classList.remove("pt-modal-aberto"); return; }
    // respeita os filtros de unidade/focal/etc. da tabela
    const ok = new Set(filtrarUnidades(PT.resultado.unidades).map(u => u.sistema + "|" + u.sigla));
    if(!Array.isArray(PT.resultado.docsSem012)){
      el.innerHTML = `<div class="pt-aviso">⚠ O navegador está usando uma versão antiga do arquivo de cálculo. Atualize a página com <b>Ctrl + F5</b> (ou Ctrl + Shift + R) e tente de novo.</div>`; return;
    }
    const todos = PT.resultado.docsSem012.filter(r => ok.has((r.s || "") + "|" + r.u));
    if(!todos.length){ el.innerHTML = ""; PT.sem.aberto = false; document.body.classList.remove("pt-modal-aberto"); return; }
    const porDia = {}; todos.forEach(r => { porDia[r.e] = (porDia[r.e] || 0) + 1; });
    const dias = Object.keys(porDia).sort();
    if(PT.sem.dia !== "todos" && !porDia[PT.sem.dia]) PT.sem.dia = "todos";
    let docs = PT.sem.dia === "todos" ? todos : todos.filter(r => r.e === PT.sem.dia);
    docs = docs.slice().sort((a, b) => (a.e < b.e ? -1 : a.e > b.e ? 1 : (a.s + a.u + a.x).localeCompare(b.s + b.u + b.x)));
    const LIM = 1000, mostrar = docs.slice(0, LIM);
    el.innerHTML = `
      <div class="pt-modal" id="ptSemModal"><div class="pt-modal-box">
      <div class="panel" id="ptSemPanel">
        <div class="panel-header perf-header">
          <div class="perf-header-org">Atrasados na base de entregas e ausentes do relatório 012 · responsável “A definir”</div>
          <div class="perf-header-title">${fInt(todos.length)} documento(s) — escolha o responsável de cada um (ou importe o 012 do dia)</div>
        </div>
        <div class="toolbar">
          <label class="check-inline">Dia da baixa:
            <select class="small-select" id="ptSemDia">
              <option value="todos" ${PT.sem.dia === "todos" ? "selected" : ""}>Todos os dias (${dias.length})</option>
              ${dias.map(d => `<option value="${d}" ${PT.sem.dia === d ? "selected" : ""}>${br(d)} — ${porDia[d]} doc(s)</option>`).join("")}
            </select>
          </label>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="ptSemTodosCli" title="Define Cliente em todos os documentos listados (respeita o filtro de dia)">Todos → Cliente</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ptSemTodosTr" title="Define Transportadora em todos os documentos listados (respeita o filtro de dia)">Todos → Transportadora</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ptSemExport">Exportar Excel</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ptSemFechar">Fechar</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="perf-table perf-table-simple pt-det-table pt-sem-table" id="ptSemTable">
            <thead><tr><th>Sistema</th><th>Unidade</th><th>CTRC</th><th>NF</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Cód.</th><th>Previsão</th><th>Data da baixa</th><th>Dias de atraso</th><th>Responsável</th></tr></thead>
            <tbody>${mostrar.map(r => `<tr>
              <td>${esc(r.s || "")}</td><td>${esc(r.u)}</td><td>${esc(r.x || r.k)}</td><td>${esc(r.n)}</td><td>${esc(r.r)}</td><td>${esc(r.t)}</td><td>${esc(r.y)}</td>
              <td>${esc(r.c)}</td><td>${br(r.p)}</td><td>${br(r.e)}</td><td>${r.d === null ? "" : r.d}</td><td>${respSelect(r, "pend", "sem 012")}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="footer-note">${docs.length > LIM ? `Mostrando os primeiros ${fInt(LIM)} de ${fInt(docs.length)}. ` : ""}Data da baixa = “Data da Entrega Realizada” da planilha. Se o documento aparecer num 012 importado depois, o responsável vem do 012 (a não ser que você já tenha editado aqui). Se uma nova base mostrar que o atraso foi corrigido, o documento sai desta lista sozinho.</div>
      </div></div></div>`;
    document.body.classList.add("pt-modal-aberto");
    const fecha = () => { PT.sem.aberto = false; renderSem012(); };
    document.getElementById("ptSemModal").addEventListener("click", e => { if(e.target.id === "ptSemModal") fecha(); });
    document.addEventListener("keydown", function esc1(e){ if(e.key === "Escape"){ document.removeEventListener("keydown", esc1); if(PT.sem.aberto) fecha(); } });
    document.getElementById("ptSemDia").addEventListener("change", e => { PT.sem.dia = e.target.value; renderSem012(); });
    document.getElementById("ptSemFechar").addEventListener("click", fecha);
    ligarRespSelects(el);
    const emMassa = (v) => {
      if(!confirm("Definir " + (v === "cliente" ? "CLIENTE" : "TRANSPORTADORA") + " como responsável por " + docs.length + " documento(s) listado(s)?")) return;
      docs.forEach(r => { PT.manual[r.k] = v; }); salvarResp(); render();
    };
    document.getElementById("ptSemTodosCli").addEventListener("click", () => emMassa("cliente"));
    document.getElementById("ptSemTodosTr").addEventListener("click", () => emMassa("transp"));
    document.getElementById("ptSemExport").addEventListener("click", () => {
      const p = document.getElementById("ptSemPanel");
      exportarTabelasExcel([{
        nome: "Atrasos sem 012",
        titulo: p.querySelector(".perf-header-title").textContent.trim(),
        subtitulo: p.querySelector(".perf-header-org").textContent.trim(),
        tabela: document.getElementById("ptSemTable"), rodape: p.querySelector(".footer-note").textContent.trim()
      }], `Atrasos_sem_012_${dataParaArquivo()}.xlsx`);
    });
  }

  /* ---------- detalhe: documentos em atraso da unidade ---------- */
  const FILTROS_DET = [
    ["todos", "Todos os atrasados"],
    ["transp", "Entregue atrasado — Transportadora"],
    ["cliente", "Entregue atrasado — Cliente"],
    ["pend", "Entregue atrasado — A definir (sem 012)"],
    ["aberto", "Aberto atrasado"]
  ];
  function renderDetalhe(){
    const el = document.getElementById("ptDetalhe"); if(!el) return;
    if(!PT.det.sigla || !PT.resultado){ el.innerHTML = ""; return; }
    const sig = PT.det.sigla;
    let docs = PT.resultado.detalhe.filter(d => d.r.u === sig && (!PT.det.sis || (d.r.s || "") === PT.det.sis));
    const total = docs.length;
    const casa = { transp: "Atraso - transportadora", cliente: "Atraso - cliente", pend: "Atraso - a definir", aberto: "Aberto atrasado" };
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
            <thead><tr><th>CTRC</th><th>NF</th><th>Remetente</th><th>Destinatário</th><th>Cidade</th><th>Cód.</th><th>Previsão</th><th>Data da baixa</th><th>Dias</th><th>Situação</th><th>Responsável</th></tr></thead>
            <tbody>${mostrar.map(({r, situacao, resp, origem}) => `
              <tr class="pt-sit-${situacao.indexOf("cliente") > -1 ? "cli" : situacao.indexOf("Aberto") === 0 ? "ab" : situacao.indexOf("definir") > -1 ? "pend" : "tr"}">
                <td>${PT.det.sis ? "" : `<span class="pt-tag pt-tag-${esc(r.s || "")}">${esc(r.s || "")}</span> `}${esc(r.x || r.k)}</td><td>${esc(r.n)}</td><td>${esc(r.r)}</td><td>${esc(r.t)}</td><td>${esc(r.y)}</td>
                <td>${esc(r.c)}</td><td>${br(r.p)}</td><td>${r.e ? br(r.e) : "—"}</td><td>${r.d === null ? "" : r.d}</td><td>${esc(situacao)}</td><td>${respSelect(r, resp, origem)}</td>
              </tr>`).join("")}</tbody>
          </table>` : `<div class="empty">Nenhum documento nesse filtro.</div>`}
        </div>
        <div class="footer-note">${docs.length > LIM ? `Mostrando os primeiros ${fInt(LIM)} de ${fInt(docs.length)}. ` : ""}Responsável: * no 012 = Cliente; sem * = Transportadora; ausente do 012 = “A definir” (escolha você). Mudar o responsável aqui recalcula o quadro na hora.</div>
      </div>`;
    document.getElementById("ptDetFiltro").addEventListener("change", e => { PT.det.filtro = e.target.value; renderDetalhe(); });
    ligarRespSelects(el);
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

  /* ---------- CONTROLE DE IMPORTAÇÃO: quais dias já têm 012 / base ---------- */
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  function diasDoMes(mes){
    const [a, m] = mes.split("-").map(Number); const n = new Date(a, m, 0).getDate(); const out = [];
    for(let d = 1; d <= n; d++) out.push(a + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
    return out;
  }
  const dowDe = iso => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d).getDay(); };
  function baseContagemPorDia(sis){
    const o = {}; PT.base.forEach(r => { if(r.s === sis) o[r.p] = (o[r.p] || 0) + 1; }); return o;
  }
  // situação de cada dia do mês para um sistema
  function statusDoMes(sis, mes){
    const hoje = hojeISO(), dd = PT.dias[sis] || {}, disp = (PT.ui.dispensados && PT.ui.dispensados[sis]) || [];
    const base = baseContagemPorDia(sis);
    const temDados = contarBase(sis) > 0 || Object.keys(dd).length > 0;   // sistema sem nenhum dado não cobra nada
    return diasDoMes(mes).map(iso => {
      const dow = dowDe(iso), d = dd[iso];
      const tem = !!d, total = tem ? Object.values(d.unidades).reduce((x, u) => x + u.np + u.ac + u.at, 0) : 0;
      let exige = iso < hoje && !(dow === 0 && !PT.ui.cobraDom) && !(dow === 6 && !PT.ui.cobraSab);
      const dispensado = disp.indexOf(iso) > -1;
      return { iso, dow, tem, total, baseN: base[iso] || 0, exige, dispensado, pendente: temDados && !tem && exige && !dispensado, futuro: iso >= hoje };
    });
  }
  function pendentesDoMes(mes, visao){
    if(!mes) mes = hojeISO().slice(0, 7);
    const lista = visao === "geral" ? SIS_LISTA : [visao];
    let total = 0; const partes = [];
    lista.forEach(sv => {
      if(!contarBase(sv) && !Object.keys(PT.dias[sv] || {}).length) return;   // sistema sem nenhum dado: não cobra
      const falt = statusDoMes(sv, mes).filter(x => x.pendente);
      total += falt.length;
      if(falt.length) partes.push(sv + ": " + falt.slice(0, 6).map(x => br(x.iso).slice(0, 5)).join(", ") + (falt.length > 6 ? "…" : ""));
    });
    return { total, resumo: partes.join(" · ") };
  }
  function mesesControle(){
    const set = new Set([hojeISO().slice(0, 7)]);
    PT.base.forEach(r => set.add(r.p.slice(0, 7)));
    SIS_LISTA.forEach(sv => Object.keys(PT.dias[sv] || {}).forEach(d => set.add(d.slice(0, 7))));
    return Array.from(set).sort().reverse();
  }
  function renderControle(){
    const el = document.getElementById("ptControle"); if(!el) return;
    const meses = mesesControle();
    if(!PT.ui.ctrlMes || meses.indexOf(PT.ui.ctrlMes) === -1) PT.ui.ctrlMes = (PT.ui.mes && meses.indexOf(PT.ui.mes) > -1) ? PT.ui.mes : meses[0];
    const mes = PT.ui.ctrlMes;
    let pendTotal = 0;
    const cards = SIS_LISTA.map(sv => {
      const st = statusDoMes(sv, mes);
      const temDados = contarBase(sv) || Object.keys(PT.dias[sv] || {}).length;
      const exigidos = st.filter(x => x.exige && !x.dispensado || x.tem);
      const feitos = st.filter(x => x.tem).length, falt = st.filter(x => x.pendente);
      if(temDados) pendTotal += falt.length;
      const pri = st[0].dow, vazios = (pri + 6) % 7;     // semana começa na segunda
      const celulas = [];
      for(let i = 0; i < vazios; i++) celulas.push(`<div class="pt-cal-vazio"></div>`);
      st.forEach(x => {
        const cls = x.tem ? "ok" : x.pendente ? "falta" : x.dispensado ? "disp" : x.futuro ? "fut" : "opc";
        const rot = x.tem ? `012 · ${fInt(x.total)}` : x.pendente ? "faltando" : x.dispensado ? "dispensado" : x.futuro ? "—" : "opcional";
        const tit = x.tem ? `012 de ${br(x.iso)} importado (${fInt(x.total)} baixas)` : x.pendente ? `Falta o 012 de ${br(x.iso)} — clique para dispensar (sem movimento)` : x.dispensado ? `Dispensado — clique para voltar a cobrar` : x.futuro ? "Ainda não gerado" : "Não exigido (fim de semana)";
        const clicavel = (!x.tem && (x.pendente || x.dispensado));
        celulas.push(`<div class="pt-cal-dia pt-cal-${cls} ${clicavel ? "pt-cal-click" : ""}" ${clicavel ? `data-disp="${sv}|${x.iso}"` : ""} title="${esc(tit)}">
          <b>${Number(x.iso.slice(8))}</b><span>${rot}</span><em>${x.baseN ? "base " + fInt(x.baseN) : ""}</em></div>`);
      });
      return `<div class="pt-cal-card">
        <div class="pt-cal-head"><b><span class="pt-tag pt-tag-${sv}">${sv}</span> ${SIS[sv]}</b>
          <span class="${falt.length && temDados ? "pt-cal-pend" : "pt-cal-okt"}">${temDados ? (falt.length ? `${falt.length} dia(s) faltando` : "em dia ✔") : "sem dados"}</span></div>
        <div class="pt-cal-sub">012 importado em <b>${feitos}</b> dia(s)${temDados && falt.length ? ` · faltam: <b>${falt.map(x => br(x.iso).slice(0, 5)).join(", ")}</b>` : ""}</div>
        <div class="pt-cal-grade">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(n => `<div class="pt-cal-dow">${n}</div>`).join("")}${celulas.join("")}</div>
        ${falt.length ? `<button type="button" class="btn btn-ghost btn-sm" data-copiar="${sv}">Copiar lista dos dias faltando</button>` : ""}
      </div>`;
    });
    el.innerHTML = `
      <div class="panel" id="ptCtrlPanel">
        <div class="panel-header">Controle dos relatórios 012 — quais dias já foram importados</div>
        <div class="toolbar">
          <span class="pt-filtros">
            <label class="check-inline">Mês:
              <select class="small-select" id="ptCtrlMes">${meses.map(m => `<option value="${m}" ${m === mes ? "selected" : ""}>${esc(rotuloMes(m))}</option>`).join("")}</select>
            </label>
            <label class="check-inline"><input type="checkbox" id="ptCobraSab" ${PT.ui.cobraSab ? "checked" : ""}> cobrar sábados</label>
            <label class="check-inline"><input type="checkbox" id="ptCobraDom" ${PT.ui.cobraDom ? "checked" : ""}> cobrar domingos</label>
          </span>
        </div>
        <div class="pt-cal-wrap">${cards.join("")}</div>
        <div class="pt-legenda">
          <span><i class="pt-cal-ok"></i> 012 importado</span><span><i class="pt-cal-falta"></i> faltando (dia já passou)</span>
          <span><i class="pt-cal-disp"></i> dispensado por você</span><span><i class="pt-cal-opc"></i> não exigido</span><span><i class="pt-cal-fut"></i> ainda não gerado</span>
        </div>
        <div class="footer-note">O 012 de um dia só existe a partir do dia seguinte. Clique num dia “faltando” para dispensar (ex.: feriado ou sem movimento) e ele deixa de ser cobrado. “base N” = documentos da base com previsão naquele dia. Importar o mesmo arquivo de novo não duplica nada.</div>
      </div>
      <details class="pt-hist panel"><summary class="panel-header">Histórico dos arquivos importados</summary>${historicoHTML()}</details>`;
    const bd = document.getElementById("ptBadge");
    if(bd){ const tot = pendentesGeralTotal(); bd.textContent = tot; bd.hidden = !tot; }
    document.getElementById("ptCtrlMes").addEventListener("change", e => { PT.ui.ctrlMes = e.target.value; salvarUI(); renderControle(); });
    document.getElementById("ptCobraSab").addEventListener("change", e => { PT.ui.cobraSab = e.target.checked; salvarUI(); render(); });
    document.getElementById("ptCobraDom").addEventListener("change", e => { PT.ui.cobraDom = e.target.checked; salvarUI(); render(); });
    el.querySelectorAll("[data-disp]").forEach(c => c.addEventListener("click", () => {
      const [sv, iso] = c.dataset.disp.split("|");
      const l = PT.ui.dispensados[sv] || (PT.ui.dispensados[sv] = []); const i = l.indexOf(iso);
      if(i > -1) l.splice(i, 1); else l.push(iso);
      salvarUI(); render();
    }));
    el.querySelectorAll("[data-copiar]").forEach(b => b.addEventListener("click", () => {
      const sv = b.dataset.copiar, txt = statusDoMes(sv, mes).filter(x => x.pendente).map(x => br(x.iso)).join("\n");
      const ok = () => { b.textContent = "Copiado ✔"; setTimeout(() => { b.textContent = "Copiar lista dos dias faltando"; }, 1500); };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sv + " — faltam 012 de:\n" + txt).then(ok, () => {});
    }));
  }
  function pendentesGeralTotal(){
    // soma o que falta no mês selecionado no controle, só dos sistemas que já têm dados
    const mes = PT.ui.ctrlMes || hojeISO().slice(0, 7); let t = 0;
    SIS_LISTA.forEach(sv => { if(contarBase(sv) || Object.keys(PT.dias[sv] || {}).length) t += statusDoMes(sv, mes).filter(x => x.pendente).length; });
    return t;
  }
  function historicoHTML(){
    const linhas = [];
    SIS_LISTA.forEach(sv => Object.keys(PT.dias[sv] || {}).forEach(d => linhas.push({tipo: "012", sis: sv, ref: br(d), chave: d, arq: PT.dias[sv][d].arquivos.join(", "), em: PT.dias[sv][d].importadoEm || ""})));
    PT.imps.forEach(i => linhas.push({tipo: "Base", sis: i.sis || "VAL", ref: i.periodo || "—", chave: "", arq: i.nome, em: i.em || ""}));
    linhas.sort((a, b) => (b.em || "").localeCompare(a.em || "") || (b.chave || "").localeCompare(a.chave || ""));
    if(!linhas.length) return `<div class="empty">Nada importado ainda.</div>`;
    return `<div class="table-wrap"><table class="perf-table perf-table-simple pt-dias-table"><thead><tr><th>Tipo</th><th>Sistema</th><th>Dia / período</th><th>Arquivo</th><th>Importado em</th></tr></thead>
      <tbody>${linhas.slice(0, 300).map(l => `<tr><td>${l.tipo}</td><td>${l.sis}</td><td>${esc(l.ref)}</td><td style="text-align:left">${esc(l.arq)}</td><td>${l.em ? br(l.em) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
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
    PT.manual = lsGet(K.resp, {}) || {};
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
