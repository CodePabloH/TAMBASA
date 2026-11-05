/* =====================================================================
   BRENO (FILMAGENS) NA SUB-ABA "POR FOCAL" DO FECHAMENTO
   - Mostra o Breno como mais um botão ao lado dos SACs.
   - Usa a MESMA base da Visão da Operação (window.FILM): o que for editado
     aqui aparece lá, e o que for editado lá aparece aqui.
   - O Exportar Fechamento (Excel) lê essa mesma base: aba BRENO + quadro
     do Breno no PRINCIPAL (FALTAS, PENDENCIA SOLUCIONADA, AVARIAS, ESTRAVIOS).
   ===================================================================== */
(function(){
  "use strict";
  const CATS = ["FALTAS","PENDENCIA SOLUCIONADA","AVARIAS","ESTRAVIOS"];
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const semAc = v => String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
  const brl = n => (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const num = n => (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const int = n => (Number(n)||0).toLocaleString("pt-BR");

  function categoria(tipo){
    const t = semAc(tipo);
    if(/^FALTA/.test(t)) return "FALTAS";
    if(/PENDENC/.test(t)) return "PENDENCIA SOLUCIONADA";
    if(/AVARIA/.test(t)) return "AVARIAS";
    if(/ESTRAV|EXTRAV/.test(t)) return "ESTRAVIOS";
    return t || "SEM OCORRENCIA";
  }

  let busca = "", msg = "", msgErro = false, aba = "filmagens", msgConf = "";

  function resumoHTML(rows){
    const linhas = rows.map(r => ({cat:categoria(r.tipo), v:Number(r.valorNf)||0}));
    const cats = [...CATS];
    linhas.forEach(l => { if(cats.indexOf(l.cat) === -1) cats.push(l.cat); });
    const tot = linhas.reduce((s,l) => s + l.v, 0);
    const corpo = cats.map(c => {
      const x = linhas.filter(l => l.cat === c), v = x.reduce((s,l) => s + l.v, 0);
      return `<tr><td class="tx"><b>${esc(c)}</b></td><td>${int(x.length)}</td><td>${brl(v)}</td><td>${tot ? num(v/tot*100) : "0,00"}%</td></tr>`;
    }).join("");
    return `
      <div class="bf-kpis">
        <div class="bf-kpi"><span>NFs com ocorrência</span><b>${int(rows.length)}</b></div>
        <div class="bf-kpi"><span>Valor total das NFs</span><b>${brl(tot)}</b></div>
        ${CATS.map(c => { const x = linhas.filter(l => l.cat === c); return `<div class="bf-kpi bf-sm"><span>${esc(c)}</span><b>${int(x.length)}</b><small>${brl(x.reduce((s,l)=>s+l.v,0))}</small></div>`; }).join("")}
      </div>
      <div class="bf-scroll"><table class="bf-table"><thead><tr><th class="tx">Ocorrência</th><th>Qtd NFs</th><th>Valor total</th><th>% do total</th></tr></thead>
      <tbody>${corpo}<tr class="bf-total"><td class="tx">TOTAL</td><td>${int(rows.length)}</td><td>${brl(tot)}</td><td>100,00%</td></tr></tbody></table></div>
      <div style="margin-top:14px">${painelConfHTML(rows)}</div>`;
  }

  function painelConfHTML(rows){
    const ls = rows.map(r => ({conf:String(r.confNome || r.conf || "").replace(/\s+/g," ").trim().toUpperCase(), cat:categoria(r.tipo), v:Number(r.valorNf)||0}));
    const confs = [...new Set(ls.map(l => l.conf))].sort((a,b) => (a==="")-(b==="") || a.localeCompare(b));
    const cats = [...CATS]; ls.forEach(l => { if(cats.indexOf(l.cat) === -1) cats.push(l.cat); });
    const corpo = [];
    confs.forEach(cf => cats.forEach(ct => {
      const x = ls.filter(l => l.conf === cf && l.cat === ct); if(!x.length) return;
      corpo.push(`<tr><td class="tx"><b>${esc(cf || "(sem conferente)")}</b></td><td class="tx">${esc(ct)}</td><td>${int(x.length)}</td><td>${brl(x.reduce((s,l)=>s+l.v,0))}</td></tr>`);
    }));
    return `<h4 class="bf-h4">Conferente x ocorrência</h4><div class="bf-scroll"><table class="bf-table"><thead><tr><th class="tx">Conferente</th><th class="tx">Ocorrência</th><th>Qtd NFs</th><th>Valor da NF (R$)</th></tr></thead><tbody>${corpo.join("") || `<tr><td colspan="4"><div class="empty">Sem dados.</div></td></tr>`}</tbody></table></div>`;
  }

  function tabelaHTML(rows){
    const inp = (r, campo, valor, extra) => `<input class="bf-ed" ${extra || 'type="text"'} data-bf-edit="${esc(r.id)}:${campo}" value="${esc(valor)}">`;
    const ord = rows.slice().sort((a,b) => String(b.data).localeCompare(String(a.data)));
    return ord.length ? ord.map(r => `<tr data-id="${esc(r.id)}" data-q="${esc((r.data+" "+r.rota+" "+r.destinatario+" "+r.pagador+" "+r.ocorrencia+" "+r.nf).toLowerCase())}">
      <td>${inp(r,"data",r.data,'type="date"')}</td><td>${inp(r,"rota",r.rota,'type="text" style="width:120px"')}</td><td>${inp(r,"destinatario",r.destinatario)}</td><td>${inp(r,"pagador",r.pagador)}</td>
      <td>${inp(r,"ocorrencia",r.ocorrencia,'type="text" style="min-width:240px"')}</td><td>${inp(r,"conf",r.confNome || "",'type="text" list="bfConfList" placeholder="(opcional)" style="min-width:140px"')}</td><td>${inp(r,"nf",r.nf,'type="text" inputmode="numeric" style="width:96px"')}</td>
      <td>${inp(r,"valorNf",num(r.valorNf),'type="text" inputmode="decimal" style="text-align:right;width:110px"')}</td>
      <td><button type="button" class="bf-del" data-bf-del="${esc(r.id)}" title="Apagar esta linha">✕</button></td></tr>`).join("")
      : `<tr><td colspan="9"><div class="empty">Nenhuma linha ainda — importe a planilha do Breno ou clique em “+ Adicionar linha”.</div></td></tr>`;
  }

  function confTabHTML(rows){
    const lista = window.FILM.conferentes();
    const usados = new Map();
    rows.forEach(r => { const n = String(r.confNome || "").trim().toUpperCase(); if(n) usados.set(n, (usados.get(n)||0) + 1); });
    const linhas = lista.map(n => `<tr><td class="tx"><b>${esc(n)}</b></td><td>${int(usados.get(n)||0)}</td><td><button type="button" class="bf-del" data-bf-confdel="${esc(n)}" title="Remover do cadastro">✕</button></td></tr>`).join("");
    const soNasNfs = [...usados.keys()].filter(n => lista.indexOf(n) === -1);
    return `
      <p class="section-desc" style="padding:0 18px;">Cadastro <strong>opcional</strong> de conferentes: só preencha quando houver. Os nomes cadastrados aparecem como sugestão na coluna <strong>Conferente</strong> da aba Filmagens (e da Visão da Operação), e o nome digitado vai para a coluna CONFERENTE e para o painel <strong>Conferente x Ocorrência</strong> da aba BRENO do Excel.</p>
      <div class="bf-bar"><input type="text" class="bf-search" id="bfConfNome" placeholder="Nome do conferente" style="min-width:260px"><button type="button" class="bf-btn" id="bfConfAdd">+ Cadastrar conferente</button><span class="bf-msg bf-err" id="bfConfMsg">${esc(msgConf)}</span></div>
      <div class="bf-scroll" style="margin:0 18px 12px;"><table class="bf-table"><thead><tr><th class="tx">Conferente cadastrado</th><th>NFs vinculadas</th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="3"><div class="empty">Nenhum conferente cadastrado (não é obrigatório).</div></td></tr>`}</tbody></table></div>
      ${soNasNfs.length ? `<p class="section-desc" style="padding:0 18px 14px;">Também aparecem nas NFs (lidos do texto da ocorrência) e ainda não estão cadastrados: ${soNasNfs.map(n => `<button type="button" class="bf-btn" data-bf-confquick="${esc(n)}">+ ${esc(n)}</button>`).join(" ")}</p>` : ""}`;
  }

  function html(){
    if(!window.FILM) return `<div class="panel"><div class="empty">Módulo de filmagens não carregou.</div></div>`;
    const rows = window.FILM.carregar();
    const abas = `<div class="bf-tabs"><button type="button" class="bf-tab ${aba==="filmagens"?"on":""}" data-bf-aba="filmagens">Filmagens</button><button type="button" class="bf-tab ${aba==="conferentes"?"on":""}" data-bf-aba="conferentes">Conferentes</button></div>`;
    if(aba === "conferentes") return `<div class="panel bf-panel" id="bfPanel"><div class="panel-header">Breno — Conferentes</div>${abas}${confTabHTML(rows)}</div>`;
    return `<datalist id="bfConfList">${window.FILM.conferentes().map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    ${html2(rows, abas)}`;
  }
  function html2(rows, abas){
    return `
    <div class="panel bf-panel" id="bfPanel">
      <div class="panel-header">Breno — Filmagens (câmeras) <span class="bf-sub">focal com quadro por tipo de ocorrência</span></div>
      ${abas}
      <p class="section-desc" style="padding:0 18px;">Tudo aqui é <strong>editável</strong> e é a <strong>mesma base</strong> da Visão da Operação (Filmagens): o que você corrigir aqui aparece lá e vai direto para o <strong>Exportar Fechamento (Excel)</strong> — aba <strong>BRENO</strong> e quadro do Breno na aba <strong>PRINCIPAL</strong>. No Excel entram só as NFs do mês do fechamento.</p>
      <div class="bf-bar">
        <label class="bf-file">Importar planilha do Breno (.xlsx)<input type="file" accept=".xlsx" id="bfFile" hidden></label>
        <button type="button" class="bf-btn" id="bfAdd">+ Adicionar linha</button>
        <button type="button" class="bf-btn bf-red" id="bfClear" ${rows.length ? "" : "disabled"}>Limpar planilha do Breno</button>
        <span class="bf-msg ${msgErro ? "bf-err" : ""}" id="bfMsg">${esc(msg)}</span>
      </div>
      <div id="bfResumo" style="padding:0 18px 6px;">${resumoHTML(rows)}</div>
      <div class="bf-bar"><input type="search" class="bf-search" id="bfSearch" placeholder="Buscar na planilha…" value="${esc(busca)}"></div>
      <div class="bf-scroll bf-tall" style="margin:0 18px 18px;"><table class="bf-table bf-edtable"><thead><tr><th class="tx">Data</th><th class="tx">Unidade (rota)</th><th class="tx">Destinatário</th><th class="tx">Pagador</th><th class="tx">Ocorrência (ex.: FALTA - motivo (CONF: nome))</th><th class="tx">Conferente</th><th class="tx">NF</th><th>Valor da NF (R$)</th><th></th></tr></thead>
      <tbody id="bfBody">${tabelaHTML(rows)}</tbody></table></div>
    </div>`;
  }

  function filtrar(){
    const q = busca.toLowerCase().trim();
    document.querySelectorAll("#bfBody tr[data-q]").forEach(tr => { tr.style.display = !q || tr.dataset.q.indexOf(q) !== -1 ? "" : "none"; });
  }
  const atualizaResumo = () => { const el = document.getElementById("bfResumo"); if(el) el.innerHTML = resumoHTML(window.FILM.carregar()); };

  function attach(rerender){
    const p = document.getElementById("bfPanel"); if(!p) return;
    p.addEventListener("change", e => {
      const el = e.target.closest("[data-bf-edit]"); if(!el) return;
      const [id, campo] = el.dataset.bfEdit.split(":");
      if(!window.FILM.editar(id, campo, el.value)){ alert("Não consegui salvar a alteração (sem espaço no navegador?)."); return; }
      const r = window.FILM.carregar().find(x => x.id === id);
      if(r && campo === "valorNf") el.value = num(r.valorNf);
      if(r && campo === "nf") el.value = r.nf;
      if(r && campo === "conf") el.value = r.confNome || "";
      const tr = el.closest("tr"); if(tr && r) tr.dataset.q = (r.data+" "+r.rota+" "+r.destinatario+" "+r.pagador+" "+r.ocorrencia+" "+r.nf).toLowerCase();
      atualizaResumo();
    });
    p.addEventListener("click", e => {
      const ab = e.target.closest("[data-bf-aba]"); if(ab){ aba = ab.dataset.bfAba; return rerender(); }
      const cdel = e.target.closest("[data-bf-confdel]"); if(cdel){ window.FILM.removerConferente(cdel.dataset.bfConfdel); return rerender(); }
      const cq = e.target.closest("[data-bf-confquick]"); if(cq){ window.FILM.addConferente(cq.dataset.bfConfquick); return rerender(); }
      if(e.target.closest("#bfConfAdd")){
        const i = document.getElementById("bfConfNome"), nome = i ? i.value : "";
        msgConf = !String(nome).trim() ? "Digite o nome." : (window.FILM.addConferente(nome) ? "" : "Esse conferente já está cadastrado.");
        return rerender();
      }
      const del = e.target.closest("[data-bf-del]");
      if(del){ window.FILM.remover(del.dataset.bfDel); msg = ""; return rerender(); }
      if(e.target.closest("#bfAdd")){ window.FILM.adicionar(); busca = ""; msg = ""; return rerender(); }
      if(e.target.closest("#bfClear")){
        if(confirm("Apagar todas as filmagens do Breno (importadas e editadas)?")){ window.FILM.limpar(); msg = "Filmagens apagadas."; msgErro = false; rerender(); }
      }
    });
    const s = document.getElementById("bfSearch");
    if(s) s.addEventListener("input", () => { busca = s.value; filtrar(); });
    const f = document.getElementById("bfFile");
    if(f) f.addEventListener("change", async () => {
      const file = f.files && f.files[0]; if(!file) return;
      try{ const r = await window.FILM.importarXlsx(file); msg = `Planilha lida: ${r.lidas} filmagens (${r.novas} novas, ${r.atualizadas} atualizadas). Total guardado: ${r.total}.`; msgErro = false; }
      catch(err){ msg = "Não consegui ler a planilha: " + (err && err.message || err); msgErro = true; }
      rerender();
    });
    filtrar();
  }

  window.BRENO_FOCAL = {html, attach};
})();
