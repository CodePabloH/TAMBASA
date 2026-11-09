/* ================= PERFORMANCE GERAL · ATRASOS (RESP. TRANSPORTADORA) POR UNIDADE =================
   Sub-aba de "Performance Geral". Importa o relatório SSW 085 (ssw0088)
   "PERFORMANCE DE ENTREGA DA CIDADE DESTINO - RELACAO DOS CTRCS ATRASADOS" (.sswweb),
   agrupa os documentos pela "UNIDADE DESTINO: SIGLA - NOME" (a mesma unidade pode aparecer em
   várias páginas: é somada pela sigla) e CONFRONTA a quantidade com a coluna "Transportadora"
   da tabela "Por Unidade" (Performance Geral). Exporta Excel (resumo + uma aba por unidade).
   Importa VAL e RVA separadamente (cada um com seu arquivo); a mesma sigla nos dois é SOMADA, como na
   Performance Geral. Dados salvos em "valle_pg_atrasos_transp_v2". Não altera nenhuma outra importação. */
(function(){
  const KEY = "valle_pg_atrasos_transp_v2";
  const SIS = {VAL:"Transportadora do Vale (VAL)", RVA:"Real Vale (RVA)"};
  const VERDE = "2F8A2A", ESCURO = "141A14", ZEBRA = "F3F7F3", LINHA = "D9E2D9", VERM = "B42318", AMBAR = "B54708";
  // limites das colunas do relatório (posição dos "+" na linha de separação)
  const B = [11,27,43,46,62,66,77,80,90,96,105,116,128,134,141,150,159,168];

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const num = s => { const n = parseFloat(String(s || "").trim().replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
  const brl = v => (v || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  const n0 = v => (v || 0).toLocaleString("pt-BR", {maximumFractionDigits:0});
  const n2 = v => (v || 0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});

  const ST = {unidade:"", busca:"", aviso:""};   // estado da tela

  /* ---------- armazenamento ---------- */
  const vazio = () => ({docs:[], nomes:{}, fontes:{}});   // fontes: {VAL:{periodo,arquivo,importadoEm}, RVA:{...}}
  function carregar(){
    try{ const r = JSON.parse(localStorage.getItem(KEY) || "null"); return r && Array.isArray(r.docs) ? Object.assign(vazio(), r) : vazio(); }
    catch(e){ return vazio(); }
  }
  function salvar(d){ localStorage.setItem(KEY, JSON.stringify(d)); }

  /* ---------- parser SSW 085 ---------- */
  function fatia(l, i){ const ini = i === 0 ? 0 : B[i-1] + 1; return (l.slice(ini, i < B.length ? B[i] : l.length) || "").trim(); }
  function parse(texto){
    const linhas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const docs = [], avisos = [], nomes = {}, totMerc = {};
    let sigla = "", periodo = "", ultSep = false, empresa = "";
    for(const l of linhas){
      let m;
      if(!l.trim()) continue;
      if(!empresa && !/^\s*(ssw|MES:|-)/i.test(l) && !/^[A-Z]{3}\d{6}-/.test(l)){ if(/REAL VALE/i.test(l)) empresa = "RVA"; else if(/TRANSPORTADORA DO VALE/i.test(l)) empresa = "VAL"; }
      if((m = /MES:\s*([\d/]+)/i.exec(l)) && !periodo) periodo = m[1];
      if((m = /^UNIDADE DESTINO:\s*([A-Z0-9]{2,5})\s*-\s*(.*?)\s*$/.exec(l))){ sigla = m[1]; if(!nomes[sigla]) nomes[sigla] = m[2]; ultSep = false; continue; }
      if(/^-{5,}\+/.test(l)){ ultSep = true; continue; }
      if((m = /^TOTAL CTRC:.*TOTAL MERC:\s*([\d.,]+)/.exec(l))){
        // o TOTAL logo depois de uma linha separadora é o total GERAL do relatório (não é de unidade)
        if(!ultSep && sigla) totMerc[sigla] = (totMerc[sigla] || 0) + num(m[1]);
        ultSep = false; continue;
      }
      ultSep = false;
      if(!/^[A-Z]{3}\d{6}-\d/.test(l)) continue;
      if(!sigla){ avisos.push("Documento antes de uma unidade: " + l.slice(0, 12)); continue; }
      const vm = fatia(l,11);
      const d = {
        unidade: sigla, ctrc: fatia(l,0), remetente: fatia(l,1), pagador: fatia(l,2), destinatario: fatia(l,4),
        set: fatia(l,5), cidade: fatia(l,6), uf: fatia(l,7), nf: fatia(l,8), peso: num(fatia(l,9)), frete: num(fatia(l,10)),
        vlrMerc: num(vm), chegada: fatia(l,12), prazo: fatia(l,13), semana: fatia(l,14),
        prevEntr: fatia(l,15), prevEntr2: fatia(l,16), entregue: fatia(l,17), atraso: parseInt(fatia(l,18), 10) || 0
      };
      if(/\*/.test(vm)){ d.vlrMerc = 0; d.mercEstourou = true; }   // o SSW imprime ********** quando o valor não cabe na coluna
      docs.push(d);
    }
    // Valor que "estourou" a coluna: se for o único da unidade, recupera pelo TOTAL MERC da unidade
    const porUn = {};
    docs.forEach(d => { (porUn[d.unidade] = porUn[d.unidade] || []).push(d); });
    Object.keys(porUn).forEach(u => {
      const ov = porUn[u].filter(d => d.mercEstourou);
      if(!ov.length) return;
      if(ov.length === 1 && totMerc[u]){
        const resto = totMerc[u] - porUn[u].reduce((a, d) => a + d.vlrMerc, 0);
        if(resto > 0){ ov[0].vlrMerc = Math.round(resto * 100) / 100; ov[0].mercInferido = true; return; }
      }
      avisos.push(`Valor da mercadoria não coube na coluna do SSW (${ov.map(d => d.ctrc).join(", ")}); ficou zerado.`);
    });
    return {docs, avisos, periodo, nomes, empresa};
  }

  function importar(p, arquivo, sis){
    const base = carregar();
    const siglas = new Set(p.docs.map(d => d.unidade));
    p.docs.forEach(d => { d.sistema = sis; });
    const mantidos = base.docs.filter(d => d.sistema !== sis);   // reimportar VAL (ou RVA) substitui só os docs desse sistema; o outro fica intacto
    const nomes = Object.assign({}, p.nomes, base.nomes || {});
    const fontes = Object.assign({}, base.fontes || {}); fontes[sis] = {periodo: p.periodo || "", arquivo, importadoEm: new Date().toISOString().slice(0,10)};
    salvar({docs: mantidos.concat(p.docs), nomes, fontes});
    return siglas.size;
  }

  /* ---------- agrupamento + vínculo com a Performance ---------- */
  function perfPorUnidade(){
    const mapa = {};
    try{
      const v = load(KEYS.performanceGeralVal), r = load(KEYS.performanceGeralRva);
      const tv = v && Array.isArray(v.unidades) && v.unidades.length, tr = r && Array.isArray(r.unidades) && r.unidades.length;
      if(tv || tr) mesclarPerformanceGeral(tv ? v : null, tr ? r : null).unidades.forEach(u => { mapa[u.sigla] = u; });
    }catch(e){ console.error("pgAtrasos perf:", e); }
    return mapa;
  }
  function agrupar(dados){
    const perf = perfPorUnidade();
    const g = {};
    dados.docs.forEach(d => {
      const u = g[d.unidade] || (g[d.unidade] = {sigla:d.unidade, nome:(dados.nomes || {})[d.unidade] || "", docs:[], peso:0, frete:0, merc:0, qtVal:0, qtRva:0});
      u.docs.push(d); if(d.sistema === "RVA") u.qtRva++; else u.qtVal++; u.peso += d.peso; u.frete += d.frete; u.merc += d.vlrMerc;
    });
    // unidades que têm "Transportadora" na Performance mas não vieram no arquivo 085 (só quando há arquivo)
    if(dados.docs.length) Object.keys(perf).forEach(s => { if(!g[s] && perf[s].atrasTrans > 0) g[s] = {sigla:s, nome:perf[s].destino || "", docs:[], peso:0, frete:0, merc:0, qtVal:0, qtRva:0}; });
    return Object.values(g).map(u => {
      const p = perf[u.sigla] || null;
      const qt = u.docs.length;
      const atr = p ? p.atrasTrans : null;
      return Object.assign(u, {perf:p, qt, atrasTrans: atr, dif: p ? qt - atr : null, aberto: p ? p.abertoAtrasado : null});
    }).sort((a, b) => a.sigla.localeCompare(b.sigla));
  }
  const status = u => !u.perf ? {t:"Sem Performance", c:"#5b665b"} : u.dif === 0 ? {t:"Confere", c:"#1a7f37"} : {t:(u.dif > 0 ? "+" : "") + u.dif + " (085 " + (u.dif > 0 ? "maior" : "menor") + ")", c:"#b42318"};

  /* ---------- tela ---------- */
  function linhaImport(sis){
    return `<div class="atr-import" style="align-items:center;gap:10px;flex-wrap:wrap">
        <b style="min-width:200px">${SIS[sis]}</b>
        <input type="file" id="pgAtrFile${sis}" accept=".sswweb,.txt,text/plain">
        <button type="button" class="btn btn-primary" data-pgatr-proc="${sis}">Processar</button>
        <button type="button" class="link-btn danger" data-pgatr-limpar="${sis}">Limpar ${sis}</button>
        <span class="footer-note" id="pgAtrStatus${sis}" style="flex-basis:100%;margin:0"></span>
      </div>`;
  }
  function html(){
    return `
    <div class="panel">
      <div class="panel-header">Importar relatório 085 — CTRCs atrasados (responsabilidade da transportadora)</div>
      ${linhaImport("VAL")}
      ${linhaImport("RVA")}
      <div class="atr-import">
        <button type="button" class="link-btn" id="pgAtrToggle">ou colar o texto</button>
        <button type="button" class="link-btn danger" id="pgAtrLimpar" style="margin-left:auto">Limpar tudo (VAL + RVA)</button>
      </div>
      <div id="pgAtrTextoWrap" style="display:none;padding:0 18px 12px"><textarea class="atr-textarea" id="pgAtrTexto" rows="6" placeholder="Cole aqui o texto do relatório..."></textarea>
        <select id="pgAtrTextoSis"><option value="VAL">Colar como VAL</option><option value="RVA">Colar como RVA</option></select>
        <button type="button" class="btn btn-ghost btn-sm" id="pgAtrProcTexto">Processar texto colado</button></div>
      <div class="footer-note">A mesma unidade nos dois arquivos é somada (igual à Performance Geral). Reimportar VAL ou RVA substitui só os documentos daquele sistema.</div>
    </div>
    <div id="pgAtrConteudo"></div>`;
  }

  function conteudo(){
    const dados = carregar();
    if(!dados.docs.length) return `<div class="empty">Nenhum relatório 085 importado ainda. Importe o arquivo acima para ver os documentos em atraso por unidade.</div>`;
    const grupos = agrupar(dados);
    if(ST.unidade && !grupos.some(g => g.sigla === ST.unidade)) ST.unidade = "";
    const tot = grupos.reduce((a, g) => ({qt:a.qt + g.qt, frete:a.frete + g.frete, merc:a.merc + g.merc, peso:a.peso + g.peso, atr:a.atr + (g.atrasTrans || 0)}), {qt:0, frete:0, merc:0, peso:0, atr:0});
    const comPerf = grupos.filter(g => g.perf), ok = comPerf.filter(g => g.dif === 0).length;
    const temPerf = comPerf.length > 0;

    const kpi = (r, v, extra) => `<div class="atr-kpi"${extra || ""}><span>${r}</span><b>${v}</b></div>`;
    const linhas = grupos.map(g => {
      const s = status(g);
      return `<tr class="pgatr-lin ${ST.unidade === g.sigla ? "pgatr-sel" : ""}" data-sig="${esc(g.sigla)}" style="cursor:pointer" title="Ver os documentos de ${esc(g.sigla)}">
        <td><b>${esc(g.sigla)}</b></td><td>${esc(g.nome)}</td>
        <td class="n"><b>${n0(g.qt)}</b></td>
        <td class="n">${n0(g.qtVal)}</td><td class="n">${n0(g.qtRva)}</td>
        <td class="n">${g.perf ? n0(g.atrasTrans) : "—"}</td>
        <td class="n">${g.perf ? n0(g.perf.entregue) : "—"}</td>
        <td class="n">${g.perf ? (g.perf.sla == null ? "—" : n2(g.perf.sla) + "%") : "—"}</td>
        <td class="n">${g.perf ? n0(g.aberto) : "—"}</td>
        <td style="color:${s.c};font-weight:700">${esc(s.t)}</td>
        <td class="n">${n0(g.peso)}</td><td class="n">${brl(g.frete)}</td><td class="n">${brl(g.merc)}</td></tr>`;
    }).join("");

    const sel = ST.unidade ? grupos.find(g => g.sigla === ST.unidade) : null;
    const busca = ST.busca.trim().toLowerCase();
    const lista = (sel ? [sel] : grupos).map(g => {
      const ds = busca ? g.docs.filter(d => [d.ctrc, d.remetente, d.pagador, d.destinatario, d.cidade, d.nf].join(" ").toLowerCase().includes(busca)) : g.docs;
      if(!ds.length && (busca || !sel)) return "";
      const s = status(g);
      return `<details class="atr-det" ${sel || busca ? "open" : ""}>
        <summary><b>${esc(g.sigla)}</b> — ${esc(g.nome)} <em>${g.qt} doc(s) (VAL ${g.qtVal} · RVA ${g.qtRva})${g.perf ? " · Performance (Transportadora): " + g.atrasTrans : ""} · <span style="color:${s.c}">${esc(s.t)}</span> · ${brl(g.frete)} frete</em>
          <button type="button" class="btn btn-ghost btn-sm" data-xl-un="${esc(g.sigla)}" style="float:right">Exportar ${esc(g.sigla)}</button></summary>
        <div class="table-wrap"><table class="atr-tab"><thead><tr><th>Sist.</th><th>CTRC</th><th>Remetente</th><th>Pagador</th><th>Destinatário</th><th>Cidade</th><th>NF</th><th class="n">Peso</th><th class="n">Frete</th><th class="n">Vlr Merc</th><th>Chegada</th><th>Prazo</th><th>Prev. Entr.</th><th>Prev. 2</th><th>Entregue</th><th class="n">Atraso (dias)</th></tr></thead>
        <tbody>${ds.map(d => `<tr><td>${esc(d.sistema || "")}</td><td>${esc(d.ctrc)}</td><td>${esc(d.remetente)}</td><td>${esc(d.pagador)}</td><td>${esc(d.destinatario)}</td><td>${esc(d.cidade)}</td><td>${esc(d.nf)}</td><td class="n">${n0(d.peso)}</td><td class="n">${n2(d.frete)}</td><td class="n">${n2(d.vlrMerc)}</td><td>${esc(d.chegada)}</td><td>${esc(d.prazo)}</td><td>${esc(d.prevEntr)}</td><td>${esc(d.prevEntr2)}</td><td>${esc(d.entregue)}</td><td class="n atr-dias">${d.atraso}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="7">TOTAL ${esc(g.sigla)} — ${ds.length} documento(s)</td><td class="n">${n0(ds.reduce((a, d) => a + d.peso, 0))}</td><td class="n">${n2(ds.reduce((a, d) => a + d.frete, 0))}</td><td class="n">${n2(ds.reduce((a, d) => a + d.vlrMerc, 0))}</td><td colspan="6"></td></tr></tfoot></table></div></details>`;
    }).join("");

    return `
    <div class="atr-periodo">${["VAL","RVA"].map(k => { const f = (dados.fontes || {})[k]; return k + ": " + (f ? `período ${esc(f.periodo || "-")} · ${esc(f.arquivo || "-")} · importado em ${esc(f.importadoEm || "-")}` : "não importado"); }).join("  |  ")}</div>
    <div class="atr-kpis">
      ${kpi("Documentos atrasados (085)", n0(tot.qt))}
      ${kpi("Unidades", n0(grupos.length))}
      ${temPerf ? kpi("Transportadora (Performance)", n0(tot.atr)) : ""}
      ${temPerf ? kpi("Unidades que conferem", ok + " de " + comPerf.length, ok === comPerf.length ? ' style="border-left-color:#1a7f37"' : ' style="border-left-color:#b42318"') : ""}
      ${kpi("Frete", brl(tot.frete))}
      ${kpi("Valor mercadoria", brl(tot.merc))}
    </div>
    ${temPerf ? "" : `<div class="footer-note" style="margin-bottom:10px">Importe a Performance (VAL/RVA) em "Dashboard Principal" para o confronto com a coluna Transportadora.</div>`}
    <div class="panel">
      <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <span>Documentos em atraso por unidade × Performance Geral</span>
        <button type="button" class="btn btn-ghost btn-sm" id="pgAtrXlTudo">Exportar Excel (todas as unidades)</button>
      </div>
      <div class="table-wrap"><table class="atr-tab"><thead><tr><th>Unidade</th><th>Destino</th><th class="n">Docs 085</th><th class="n">VAL</th><th class="n">RVA</th><th class="n">Transportadora (Perf.)</th><th class="n">Entregue (Perf.)</th><th class="n">Perf. %</th><th class="n">Aberto Atrasado</th><th>Confronto</th><th class="n">Peso</th><th class="n">Frete</th><th class="n">Vlr Merc</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="2">TOTAL</td><td class="n">${n0(tot.qt)}</td><td class="n">${n0(grupos.reduce((a, g) => a + g.qtVal, 0))}</td><td class="n">${n0(grupos.reduce((a, g) => a + g.qtRva, 0))}</td><td class="n">${temPerf ? n0(tot.atr) : "—"}</td><td colspan="4"></td><td class="n">${n0(tot.peso)}</td><td class="n">${brl(tot.frete)}</td><td class="n">${brl(tot.merc)}</td></tr></tfoot></table></div>
      <div class="footer-note">Clique numa unidade para ver só os documentos dela. "Confronto" compara os documentos do 085 com a coluna Transportadora da tabela Por Unidade (mesma sigla).</div>
    </div>
    <div class="atr-filtros">
      <button type="button" class="pill ${ST.unidade ? "" : "active"}" data-pgatr-un="">Todas as unidades</button>
      ${grupos.map(g => `<button type="button" class="pill ${ST.unidade === g.sigla ? "active" : ""}" data-pgatr-un="${esc(g.sigla)}">${esc(g.sigla)} <small>${g.qt}</small></button>`).join("")}
      <input class="atr-busca" id="pgAtrBusca" placeholder="Buscar CTRC, cliente, cidade, NF..." value="${esc(ST.busca)}">
    </div>
    <div class="panel" id="pgAtrDocs">${lista || `<div class="empty">Nada encontrado.</div>`}</div>`;
  }

  function render(){
    const w = document.getElementById("pgAtrConteudo"); if(!w) return;
    w.innerHTML = conteudo();
    w.querySelectorAll(".pgatr-lin").forEach(tr => tr.addEventListener("click", () => { ST.unidade = tr.dataset.sig; render(); const d = document.getElementById("pgAtrDocs"); if(d && d.scrollIntoView) d.scrollIntoView({behavior:"smooth", block:"start"}); }));
    w.querySelectorAll("[data-pgatr-un]").forEach(b => b.addEventListener("click", () => { ST.unidade = b.dataset.pgatrUn; render(); }));
    const bu = document.getElementById("pgAtrBusca");
    if(bu) bu.addEventListener("input", e => { ST.busca = e.target.value; clearTimeout(bu._t); bu._t = setTimeout(() => { render(); const n = document.getElementById("pgAtrBusca"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
    w.querySelectorAll("[data-xl-un]").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); exportar(b.dataset.xlUn); }));
    const x = document.getElementById("pgAtrXlTudo"); if(x) x.addEventListener("click", () => exportar(null));
  }

  /* ---------- ligações (importação) ---------- */
  function ligar(){
    const $ = id => document.getElementById(id);
    const raiz = $("pgAtrTexto"); if(!raiz || raiz._ok) return; raiz._ok = true;
    const status = (sis, t) => { const e = $("pgAtrStatus" + sis); if(e) e.textContent = t; };
    const atualizaStatus = () => { const d = carregar(); ["VAL","RVA"].forEach(k => { const n = d.docs.filter(x => x.sistema === k).length; if(n && !($("pgAtrStatus" + k) || {}).textContent) status(k, `${n} documento(s) importados${(d.fontes[k] || {}).periodo ? " — período " + d.fontes[k].periodo : ""}.`); }); };
    const proc = (texto, sis, nomeArq) => {
      const p = parse(texto);
      if(!p.docs.length){ status(sis, "Não encontrei documentos nesse arquivo. Confira se é o relatório 085 (CTRCs atrasados)."); return false; }
      if(p.empresa && p.empresa !== sis){ status(sis, `Esse arquivo é do ${p.empresa}, mas foi escolhido na linha do ${sis}. Use a linha do ${p.empresa}.`); return false; }
      let n; try{ n = importar(p, nomeArq, sis); }catch(e){ status(sis, "Não foi possível salvar: " + (e.message || e)); return false; }
      status(sis, `${p.docs.length} documento(s) em ${n} unidade(s) importados (período ${p.periodo || "-"})` + (p.avisos.length ? ` — ${p.avisos.length} aviso(s): ${p.avisos.slice(0, 3).join("; ")}` : ""));
      ST.unidade = ""; render(); return true;
    };
    document.querySelectorAll("[data-pgatr-proc]").forEach(b => b.addEventListener("click", async () => {
      const sis = b.dataset.pgatrProc, inp = $("pgAtrFile" + sis), f = inp.files[0];
      if(!f){ status(sis, "Selecione o arquivo do " + sis + "."); return; }
      try{ if(proc(await f.text(), sis, f.name)) inp.value = ""; }catch(e){ status(sis, "Não foi possível ler o arquivo: " + (e.message || e)); }
    }));
    document.querySelectorAll("[data-pgatr-limpar]").forEach(b => b.addEventListener("click", () => {
      const sis = b.dataset.pgatrLimpar;
      if(!confirm(`Apagar os atrasos importados do ${sis} (085)? O outro sistema e a Performance Geral não são afetados.`)) return;
      const d = carregar(); d.docs = d.docs.filter(x => x.sistema !== sis); delete d.fontes[sis]; salvar(d);
      ST.unidade = ""; status(sis, "Atrasos do " + sis + " removidos."); render();
    }));
    $("pgAtrToggle").addEventListener("click", () => { const w = $("pgAtrTextoWrap"); w.style.display = w.style.display === "none" ? "block" : "none"; });
    $("pgAtrProcTexto").addEventListener("click", () => { const t = $("pgAtrTexto").value, sis = $("pgAtrTextoSis").value; if(!t.trim()){ status(sis, "Cole o texto antes de processar."); return; } if(proc(t, sis, "texto colado")) $("pgAtrTexto").value = ""; });
    $("pgAtrLimpar").addEventListener("click", () => { if(!confirm("Apagar TODOS os atrasos importados (VAL e RVA)? A Performance Geral não é afetada.")) return; localStorage.removeItem(KEY); ST.unidade = ""; ["VAL","RVA"].forEach(k => status(k, "Atrasos removidos.")); render(); });
    atualizaStatus();
  }

  /* ---------- Excel ---------- */
  const borda = {style:"thin", color:{argb:"FF" + LINHA}};
  const bordas = {top:borda, bottom:borda, left:borda, right:borda};
  function cab(ws, row, cols){ row.height = 24; for(let c = 1; c <= cols; c++){ const x = row.getCell(c); x.font = {bold:true, color:{argb:"FFFFFFFF"}, size:10}; x.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF" + ESCURO}}; x.alignment = {vertical:"middle", horizontal:"center", wrapText:true}; x.border = bordas; } }
  function titulo(wb, ws, texto, sub, cols){
    ws.mergeCells(1, 2, 1, cols); ws.mergeCells(2, 2, 2, cols);
    ws.getCell(1, 2).value = texto; ws.getCell(1, 2).font = {bold:true, size:15, color:{argb:"FF" + ESCURO}};
    ws.getCell(2, 2).value = sub; ws.getCell(2, 2).font = {size:10, color:{argb:"FF5B665B"}};
    ws.getRow(1).height = 30; ws.getRow(2).height = 22;
    if(window.ATR_LOGO_B64){ const id = wb.addImage({base64:window.ATR_LOGO_B64, extension:"png"}); ws.addImage(id, {tl:{col:0.1, row:0.1}, ext:{width:90, height:60}, editAs:"oneCell"}); }
  }
  async function exportar(sigla){
    try{
      if(typeof ExcelJS === "undefined"){ alert("A biblioteca de Excel não carregou. Verifique a conexão e recarregue a página."); return; }
      const dados = carregar(); const grupos = agrupar(dados).filter(g => !sigla || g.sigla === sigla);
      if(!grupos.length){ alert("Não há dados para exportar."); return; }
      const wb = new ExcelJS.Workbook(); wb.creator = "Do Valle Transportadora";
      const per = ["VAL","RVA"].filter(k => (dados.fontes || {})[k]).map(k => k + " " + (dados.fontes[k].periodo || "-")).join(" · ") || "-";
      const sub = `Período ${per} · CTRCs atrasados — responsabilidade da transportadora · gerado em ${new Date().toLocaleDateString("pt-BR")}`;

      // --- Resumo
      const rs = wb.addWorksheet("Resumo", {views:[{showGridLines:false, state:"frozen", ySplit:4}]});
      const hR = ["Unidade","Destino","Docs 085","VAL","RVA","Transportadora (Performance)","Diferença","Confronto","Entregue (Perf.)","Perf. %","Aberto Atrasado","Peso (kg)","Frete (R$)","Vlr Mercadoria (R$)"];
      titulo(wb, rs, "Atrasos — Responsabilidade da Transportadora por Unidade", sub, hR.length);
      const hr = rs.getRow(4); hR.forEach((t, i) => hr.getCell(i + 1).value = t); cab(rs, hr, hR.length);
      [10,34,11,8,8,18,11,22,13,10,13,12,15,18].forEach((w, i) => rs.getColumn(i + 1).width = w);
      let r = 5; const tot = {qt:0, val:0, rva:0, atr:0, peso:0, frete:0, merc:0};
      grupos.forEach((g, i) => {
        const s = status(g), row = rs.getRow(r++);
        [g.sigla, g.nome, g.qt, g.qtVal, g.qtRva, g.perf ? g.atrasTrans : "—", g.perf ? g.dif : "—", s.t, g.perf ? g.perf.entregue : "—", g.perf && g.perf.sla != null ? g.perf.sla / 100 : "—", g.perf ? g.aberto : "—", g.peso, g.frete, g.merc].forEach((v, c) => row.getCell(c + 1).value = v);
        row.eachCell(x => { x.border = bordas; x.font = {size:10}; if(i % 2) x.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF" + ZEBRA}}; });
        row.getCell(10).numFmt = "0.00%"; row.getCell(12).numFmt = "#,##0"; row.getCell(13).numFmt = '"R$" #,##0.00'; row.getCell(14).numFmt = '"R$" #,##0.00';
        row.getCell(1).font = {bold:true, size:10}; row.getCell(3).font = {bold:true, size:10};
        row.getCell(8).font = {bold:true, size:10, color:{argb: !g.perf ? "FF5B665B" : g.dif === 0 ? "FF1A7F37" : "FF" + VERM}};
        tot.qt += g.qt; tot.val += g.qtVal; tot.rva += g.qtRva; tot.atr += g.atrasTrans || 0; tot.peso += g.peso; tot.frete += g.frete; tot.merc += g.merc;
      });
      const tr = rs.getRow(r); ["TOTAL","",tot.qt,tot.val,tot.rva,tot.atr,"","","","",tot.peso,tot.frete,tot.merc].forEach((v, c) => tr.getCell(c + 1).value = v);
      tr.eachCell({includeEmpty:true}, (x, c) => { if(c > 14) return; x.font = {bold:true, color:{argb:"FFFFFFFF"}, size:10}; x.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF" + VERDE}}; x.border = bordas; });
      tr.getCell(12).numFmt = "#,##0"; tr.getCell(13).numFmt = '"R$" #,##0.00'; tr.getCell(14).numFmt = '"R$" #,##0.00';
      rs.autoFilter = {from:{row:4, column:1}, to:{row:4, column:hR.length}};

      // --- Uma aba por unidade
      const hD = ["Sistema","CTRC","Remetente","Pagador","Destinatário","Cidade","UF","NF","Peso (kg)","Frete (R$)","Vlr Mercadoria (R$)","Chegada","Prazo","Prev. Entrega","Prev. Entrega 2","Entregue","Atraso (dias)"];
      const larg = [9,13,18,18,22,15,5,12,10,12,16,12,7,12,12,12,10];
      grupos.forEach(g => {
        const ws = wb.addWorksheet(g.sigla.slice(0, 31), {views:[{showGridLines:false, state:"frozen", ySplit:4}]});
        const perfTxt = g.perf ? ` · Performance Geral (Transportadora): ${g.atrasTrans} · ${status(g).t}` : "";
        titulo(wb, ws, `${g.sigla} — ${g.nome}`, `${g.qt} documento(s) em atraso (VAL ${g.qtVal} · RVA ${g.qtRva}) · período ${per}${perfTxt}`, hD.length);
        const h = ws.getRow(4); hD.forEach((t, i) => h.getCell(i + 1).value = t); cab(ws, h, hD.length);
        larg.forEach((w, i) => ws.getColumn(i + 1).width = w);
        let k = 5;
        g.docs.forEach((d, i) => {
          const row = ws.getRow(k++);
          [d.sistema || "", d.ctrc, d.remetente, d.pagador, d.destinatario, d.cidade, d.uf, d.nf, d.peso, d.frete, d.vlrMerc, d.chegada, d.prazo, d.prevEntr, d.prevEntr2, d.entregue, d.atraso].forEach((v, c) => row.getCell(c + 1).value = v);
          row.eachCell(x => { x.border = bordas; x.font = {size:10}; if(i % 2) x.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF" + ZEBRA}}; });
          row.getCell(9).numFmt = "#,##0"; row.getCell(10).numFmt = '"R$" #,##0.00'; row.getCell(11).numFmt = '"R$" #,##0.00';
          row.getCell(17).font = {bold:true, size:10, color:{argb:"FF" + VERM}};
        });
        const t = ws.getRow(k); t.getCell(1).value = `TOTAL ${g.sigla} — ${g.qt} documento(s)`;
        t.getCell(9).value = g.peso; t.getCell(10).value = g.frete; t.getCell(11).value = g.merc;
        t.eachCell({includeEmpty:true}, (x, c) => { if(c > hD.length) return; x.font = {bold:true, color:{argb:"FFFFFFFF"}, size:10}; x.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF" + VERDE}}; x.border = bordas; });
        t.getCell(9).numFmt = "#,##0"; t.getCell(10).numFmt = '"R$" #,##0.00'; t.getCell(11).numFmt = '"R$" #,##0.00';
        ws.autoFilter = {from:{row:4, column:1}, to:{row:4, column:hD.length}};
      });

      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      a.download = `Atrasos_Transportadora_${sigla || "Todas_Unidades"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }catch(err){ console.error("Exportar atrasos:", err); alert("Não foi possível gerar o Excel: " + (err && err.message || err)); }
  }

  /* ---------- API pública ---------- */
  window.pgAtrasosHTML = html;
  window.pgAtrasosRender = function(){ ligar(); render(); };
  window.pgAtrasosParse = parse;   // usado em testes
  // Clique na coluna "Transportadora" da tabela Por Unidade -> abre a sub-aba com os documentos da unidade
  window.pgAtrasosIrParaUnidade = function(sigla){
    ST.unidade = sigla; ST.busca = "";
    if(typeof perfGeralSubTab !== "undefined") perfGeralSubTab = "atrasos";
    const nav = document.getElementById("pgSubtabsNav");
    const alvo = nav && nav.querySelector('[data-pgsub="atrasos"]'); if(alvo) alvo.click();
    render();
    setTimeout(() => { const d = document.getElementById("pgAtrDocs"); if(d && d.scrollIntoView) d.scrollIntoView({behavior:"smooth", block:"start"}); }, 40);
  };
})();
