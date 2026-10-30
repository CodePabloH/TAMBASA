/* ================= ATRASOS · RESPONSABILIDADE DA TRANSPORTADORA =================
   Sub aba dentro de Performance (Tambasa). Importa o relatório SSW 124
   "PERFORMANCE DE ENTREGA - RELAÇÃO DOS CTRCS ATRASADOS / RESPONSABILIDADE DA TRANSPORTADORA"
   (.sswweb), agrupa por filial (unidade de entrega = 3 primeiras letras da PRAÇA) e gera um
   Excel organizado com a logo da Do Valle.
   Não altera nenhuma outra parte do painel. Dados salvos em "tambasa_atrasos_transp". */
(function(){
  const KEY = "tambasa_atrasos_transp";
  const VERDE = "2F8A2A", ESCURO = "141A14", ZEBRA = "F3F7F3", LINHA = "D9E2D9", VERM = "B42318";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const num = s => { const n = parseFloat(String(s || "").trim().replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
  const brl = v => (v || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  const n0 = v => (v || 0).toLocaleString("pt-BR", {maximumFractionDigits:0});
  const n1 = v => (v || 0).toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1});
  const iso = d => { const m = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(d || ""); return m ? `20${m[3]}-${m[2]}-${m[1]}` : ""; };
  const dataBR = d => { const m = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(d || ""); return m ? new Date(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1])) : null; };

  /* ---------- armazenamento ---------- */
  function carregar(){
    try{ const r = JSON.parse(LS.getItem(KEY) || "null"); return r && Array.isArray(r.docs) ? r : {docs:[], arquivos:[]}; }
    catch(e){ return {docs:[], arquivos:[]}; }
  }
  function salvar(d){ try{ LS.setItem(KEY, JSON.stringify(d)); return true; }catch(e){ console.error(e); return false; } }

  /* ---------- parser SSW 124 ---------- */
  function parseAtrasos(texto){
    const linhas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    let grupo = "", periodo = "", visao = "", resp = "";
    const docs = [], avisos = [];
    const reRight = /^([A-Z]{2})\s+(\d+)\s+([\d.]+)\s+([\d.,]+)\s+([\d.,]+)\s+(\d\d\/\d\d\/\d\d)\s+(\d\d\/\d\d\/\d\d)?\s+(\d+)\s*(\d{1,3})?\s*(.*)$/;
    for(const l of linhas){
      let m;
      if((m = /RESPONSABILIDADE\s+(.+?)\s*$/.exec(l)) && !/^[A-Z]{3}\d/.test(l)) resp = m[1].trim();
      if((m = /^GRUPO:\s*([\d./-]+)?\s*(.*?)\s*$/.exec(l))) grupo = (m[2] || m[1] || "").trim();
      if((m = /PERIODO EMISSAO:\s*(\d\d\/\d\d\/\d\d)\s*A\s*(\d\d\/\d\d\/\d\d)\s*(.*)$/i.exec(l))){ periodo = `${m[1]} a ${m[2]}`; visao = (m[3] || "").trim(); }
      if(!/^[A-Z]{3}\d{4,}-\d/.test(l)) continue;
      const r = reRight.exec(l.slice(84).trim());
      if(!r){ avisos.push("Linha não lida: " + l.slice(0, 40)); continue; }
      const prac = l.slice(69, 73).trim();
      docs.push({
        ctrc: l.slice(0, 11).trim(), emissao: l.slice(12, 20).trim(), remetente: l.slice(21, 36).trim(),
        pagador: l.slice(36, 51).trim(), destinatario: l.slice(51, 68).trim(), prac,
        unidade: prac.slice(0, 3), cidade: l.slice(74, 84).trim(), uf: r[1], nf: r[2],
        peso: num(r[3]), frete: num(r[4]), vlrMerc: num(r[5]), previsao: r[6], realizado: r[7] || "",
        atraso: parseInt(r[8], 10) || 0, codOc: r[9] || "", ocorrencia: (r[10] || "").trim(),
        grupo, periodo, visao
      });
    }
    return {docs, avisos, resp, grupo, periodo};
  }

  function importar(parsed, nomeArquivo){
    const base = carregar();
    const mapa = new Map(base.docs.map(d => [d.ctrc, d]));
    let novos = 0, atual = 0;
    parsed.docs.forEach(d => { if(mapa.has(d.ctrc)) atual++; else novos++; mapa.set(d.ctrc, d); });
    base.docs = Array.from(mapa.values());
    base.arquivos = (base.arquivos || []).concat([{nome:nomeArquivo || "texto colado", grupo:parsed.grupo, periodo:parsed.periodo, qtd:parsed.docs.length, em:new Date().toISOString()}]).slice(-30);
    if(!salvar(base)) return null;
    return {novos, atual};
  }

  /* ---------- filtros / agregações ---------- */
  const estado = {grupo:"", pagador:"", unidade:"", busca:""};

  function filtrados(){
    const b = estado.busca.trim().toLowerCase();
    return carregar().docs.filter(d =>
      (!estado.grupo || d.grupo === estado.grupo) && (!estado.pagador || d.pagador === estado.pagador) &&
      (!estado.unidade || d.unidade === estado.unidade) &&
      (!b || [d.ctrc, d.nf, d.destinatario, d.cidade, d.remetente, d.ocorrencia].join(" ").toLowerCase().includes(b)));
  }
  function somar(lista){
    const t = {qtd:lista.length, peso:0, frete:0, vlrMerc:0, dias:0, maior:0};
    lista.forEach(d => { t.peso += d.peso; t.frete += d.frete; t.vlrMerc += d.vlrMerc; t.dias += d.atraso; t.maior = Math.max(t.maior, d.atraso); });
    t.media = t.qtd ? t.dias / t.qtd : 0;
    return t;
  }
  function porUnidade(lista){
    const m = new Map();
    lista.forEach(d => { const k = d.unidade || "-"; if(!m.has(k)) m.set(k, []); m.get(k).push(d); });
    return Array.from(m.entries()).map(([un, docs]) => {
      docs.sort((a, b) => b.atraso - a.atraso || iso(a.previsao).localeCompare(iso(b.previsao)));
      const cid = Array.from(new Set(docs.map(x => x.cidade))).join(", ");
      return Object.assign({un, cidades:cid, docs}, somar(docs));
    }).sort((a, b) => b.qtd - a.qtd || a.un.localeCompare(b.un));
  }
  function topOcorrencias(lista){
    const m = new Map();
    lista.forEach(d => { const k = d.codOc ? `${d.codOc} - ${d.ocorrencia}` : "Sem ocorrência informada"; m.set(k, (m.get(k) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }

  /* ---------- tela ---------- */
  window.atrasosTranspHTML = function(){
    return `
    <div class="atr-wrap">
      <h2 class="section-title">Atrasos por culpa da transportadora</h2>
      <p class="section-desc">Importe o relatório de <strong>CTRCs atrasados – responsabilidade da transportadora</strong> (.sswweb do SSW, opção 124). Pode importar vários arquivos (um por cliente/grupo): os documentos são somados e reimportar atualiza pelo CTRC. A filial é a unidade de entrega (3 primeiras letras da praça).</p>
      <div class="panel">
        <div class="panel-header">Importar relatório de atrasos</div>
        <div class="atr-import">
          <input type="file" id="atrArquivo" accept=".sswweb,.txt,text/plain" multiple>
          <button type="button" class="btn btn-primary" id="atrProcessar">Processar arquivo(s)</button>
          <button type="button" class="link-btn" id="atrToggleTexto">ou colar o texto</button>
        </div>
        <div id="atrTextoWrap" style="display:none;padding:0 18px 14px;">
          <textarea id="atrTexto" rows="6" class="atr-textarea" placeholder="Cole aqui o conteúdo do relatório..."></textarea>
          <button type="button" class="btn btn-ghost btn-sm" id="atrProcessarTexto">Processar texto colado</button>
        </div>
        <div class="footer-note-row"><div class="footer-note" id="atrStatus"></div>
          <button type="button" class="link-btn danger" id="atrLimpar">Limpar dados importados</button></div>
      </div>
      <div id="atrConteudo"></div>
    </div>`;
  };

  function opcoes(lista, atual, rotulo){
    return `<option value="">${rotulo}</option>` + lista.map(v => `<option value="${esc(v)}"${v === atual ? " selected" : ""}>${esc(v)}</option>`).join("");
  }

  function renderizar(){
    const alvo = document.getElementById("atrConteudo");
    if(!alvo) return;
    const base = carregar();
    if(!base.docs.length){ alvo.innerHTML = `<div class="empty">Nenhum relatório de atrasos importado ainda.</div>`; return; }
    const lista = filtrados(), tot = somar(lista), unid = porUnidade(lista);
    const grupos = Array.from(new Set(base.docs.map(d => d.grupo).filter(Boolean))).sort();
    const pagadores = Array.from(new Set(base.docs.map(d => d.pagador).filter(Boolean))).sort();
    const unidades = Array.from(new Set(base.docs.map(d => d.unidade).filter(Boolean))).sort();
    const periodos = Array.from(new Set(base.docs.map(d => d.periodo).filter(Boolean))).join(" | ");
    const oc = topOcorrencias(lista).slice(0, 6);
    const maxQ = unid.length ? unid[0].qtd : 1;

    alvo.innerHTML = `
      <div class="atr-filtros">
        <select id="atrFGrupo" class="small-select">${opcoes(grupos, estado.grupo, "Todos os clientes")}</select>
        <select id="atrFPagador" class="small-select">${opcoes(pagadores, estado.pagador, "Todos os pagadores")}</select>
        <select id="atrFUnidade" class="small-select">${opcoes(unidades, estado.unidade, "Todas as filiais")}</select>
        <input id="atrFBusca" class="atr-busca" type="search" placeholder="Buscar CTRC, NF, destinatário, cidade..." value="${esc(estado.busca)}">
        <button type="button" class="btn btn-primary" id="atrExportar">Exportar Excel</button>
      </div>
      <div class="atr-periodo">Período de emissão: <strong>${esc(periodos || "-")}</strong> · ${base.arquivos.length} importação(ões)</div>
      <div class="atr-kpis">
        <div class="atr-kpi"><span>CTRCs em atraso</span><b>${n0(tot.qtd)}</b></div>
        <div class="atr-kpi"><span>Filiais afetadas</span><b>${n0(unid.length)}</b></div>
        <div class="atr-kpi"><span>Frete</span><b>${brl(tot.frete)}</b></div>
        <div class="atr-kpi"><span>Valor de mercadoria</span><b>${brl(tot.vlrMerc)}</b></div>
        <div class="atr-kpi"><span>Peso (kg)</span><b>${n0(tot.peso)}</b></div>
        <div class="atr-kpi"><span>Atraso médio</span><b>${n1(tot.media)} dia(s)</b></div>
      </div>
      <div class="panel">
        <div class="panel-header">Resumo por filial</div>
        <div class="table-wrap"><table class="atr-tab">
          <thead><tr><th>Filial</th><th>Cidade(s)</th><th class="n">CTRCs</th><th>Participação</th><th class="n">Peso (kg)</th><th class="n">Frete</th><th class="n">Vlr. mercadoria</th><th class="n">Atraso médio</th><th class="n">Maior atraso</th></tr></thead>
          <tbody>${unid.map(u => `<tr>
            <td><strong>${esc(u.un)}</strong></td><td>${esc(u.cidades)}</td><td class="n">${n0(u.qtd)}</td>
            <td><div class="atr-barra"><i style="width:${Math.round(u.qtd / maxQ * 100)}%"></i><span>${(u.qtd / tot.qtd * 100).toFixed(1).replace(".", ",")}%</span></div></td>
            <td class="n">${n0(u.peso)}</td><td class="n">${brl(u.frete)}</td><td class="n">${brl(u.vlrMerc)}</td><td class="n">${n1(u.media)}</td><td class="n">${u.maior}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td colspan="2">TOTAL</td><td class="n">${n0(tot.qtd)}</td><td></td><td class="n">${n0(tot.peso)}</td><td class="n">${brl(tot.frete)}</td><td class="n">${brl(tot.vlrMerc)}</td><td class="n">${n1(tot.media)}</td><td class="n">${tot.maior}</td></tr></tfoot>
        </table></div>
      </div>
      ${oc.length ? `<div class="panel"><div class="panel-header">Principais últimas ocorrências</div><div class="atr-oc">${oc.map(([k, q]) => `<div><span>${esc(k)}</span><b>${q}</b></div>`).join("")}</div></div>` : ""}
      <div class="panel"><div class="panel-header">Documentos por filial</div>
        ${unid.map(u => `<details class="atr-det"><summary><strong>${esc(u.un)}</strong> · ${esc(u.cidades)} <em>${u.qtd} CTRC(s) · ${brl(u.frete)}</em></summary>
          <div class="table-wrap"><table class="atr-tab">
            <thead><tr><th>CTRC</th><th>Emissão</th><th>Remetente</th><th>Pagador</th><th>Destinatário</th><th>Cidade</th><th>NF</th><th class="n">Peso</th><th class="n">Frete</th><th class="n">Vlr. merc.</th><th>Previsão</th><th>Realizado</th><th class="n">Atraso</th><th>Última ocorrência</th></tr></thead>
            <tbody>${u.docs.map(d => `<tr><td>${esc(d.ctrc)}</td><td>${esc(d.emissao)}</td><td>${esc(d.remetente)}</td><td>${esc(d.pagador)}</td><td>${esc(d.destinatario)}</td><td>${esc(d.cidade)}</td><td>${esc(d.nf)}</td><td class="n">${n0(d.peso)}</td><td class="n">${brl(d.frete)}</td><td class="n">${brl(d.vlrMerc)}</td><td>${esc(d.previsao)}</td><td>${esc(d.realizado)}</td><td class="n"><b class="atr-dias">${d.atraso}d</b></td><td>${esc(d.codOc ? d.codOc + " - " + d.ocorrencia : "")}</td></tr>`).join("")}</tbody>
          </table></div></details>`).join("")}
      </div>`;

    const ref = () => renderizar();
    document.getElementById("atrFGrupo").onchange = e => { estado.grupo = e.target.value; ref(); };
    document.getElementById("atrFPagador").onchange = e => { estado.pagador = e.target.value; ref(); };
    document.getElementById("atrFUnidade").onchange = e => { estado.unidade = e.target.value; ref(); };
    const b = document.getElementById("atrFBusca");
    b.oninput = e => { estado.busca = e.target.value; clearTimeout(b._t); b._t = setTimeout(() => { ref(); const nb = document.getElementById("atrFBusca"); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); }, 250); };
    document.getElementById("atrExportar").onclick = exportarExcel;
  }

  function status(msg){ const el = document.getElementById("atrStatus"); if(el) el.textContent = msg; }

  function processar(texto, nome){
    const p = parseAtrasos(texto);
    if(!p.docs.length){ status(`${nome}: não encontrei CTRCs. Confira se é o relatório de CTRCs atrasados (SSW 124).`); return false; }
    if(p.resp && !/TRANSPORTADORA/i.test(p.resp)){ status(`${nome}: este relatório é "RESPONSABILIDADE ${p.resp}" — importe apenas o de responsabilidade da TRANSPORTADORA.`); return false; }
    const r = importar(p, nome);
    if(!r){ status("Não foi possível salvar (armazenamento cheio). Exporte um backup e limpe dados antigos."); return false; }
    status(`${nome}: ${p.docs.length} CTRC(s) lidos — ${r.novos} novo(s), ${r.atual} atualizado(s).` + (p.avisos.length ? ` ${p.avisos.length} linha(s) ignorada(s).` : ""));
    return true;
  }

  window.atrasosTranspInit = function(){
    const f = document.getElementById("atrProcessar");
    if(!f) return;
    f.onclick = async () => {
      const arqs = Array.from(document.getElementById("atrArquivo").files);
      if(!arqs.length){ status("Selecione ao menos um arquivo."); return; }
      for(const a of arqs){
        try{ const buf = await a.arrayBuffer(); processar(new TextDecoder("latin1").decode(buf), a.name); }
        catch(e){ status(`${a.name}: erro ao ler (${e.message || e}).`); }
      }
      document.getElementById("atrArquivo").value = "";
      renderizar();
    };
    document.getElementById("atrToggleTexto").onclick = () => { const w = document.getElementById("atrTextoWrap"); w.style.display = w.style.display === "none" ? "block" : "none"; };
    document.getElementById("atrProcessarTexto").onclick = () => {
      const t = document.getElementById("atrTexto").value;
      if(!t.trim()){ status("Cole o texto antes de processar."); return; }
      if(processar(t, "texto colado")) document.getElementById("atrTexto").value = "";
      renderizar();
    };
    document.getElementById("atrLimpar").onclick = () => {
      if(!confirm("Apagar todos os atrasos importados desta aba?")) return;
      salvar({docs:[], arquivos:[]}); Object.assign(estado, {grupo:"", pagador:"", unidade:"", busca:""});
      status("Dados apagados."); renderizar();
    };
    renderizar();
  };

  /* ---------- Excel (ExcelJS) ---------- */
  const fill = c => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF" + c}});
  const fino = {style:"thin", color:{argb:"FF" + LINHA}};
  const bordas = {top:fino, bottom:fino, left:fino, right:fino};

  function cabecalhoPagina(wb, ws, titulo, sub, larguraCols){
    ws.views = [{showGridLines:false}];
    for(let r = 1; r <= 4; r++) ws.getRow(r).height = 20;
    ws.mergeCells(1, 3, 2, larguraCols); ws.mergeCells(3, 3, 4, larguraCols);
    const t = ws.getCell(1, 3); t.value = titulo; t.font = {name:"Arial", size:16, bold:true, color:{argb:"FF" + ESCURO}}; t.alignment = {vertical:"middle"};
    const s = ws.getCell(3, 3); s.value = sub; s.font = {name:"Arial", size:10, color:{argb:"FF5B665B"}}; s.alignment = {vertical:"middle", wrapText:true};
    if(window.ATR_LOGO_B64){
      const id = wb.addImage({base64:window.ATR_LOGO_B64, extension:"png"});
      ws.addImage(id, {tl:{col:0.15, row:0.15}, ext:{width:96, height:78}, editAs:"oneCell"});
    }
    for(let c = 1; c <= larguraCols; c++) ws.getCell(5, c).fill = fill(VERDE);
    ws.getRow(5).height = 5;
  }

  function tabela(ws, linha0, cols, linhas, totais){
    const h = ws.getRow(linha0); h.height = 24;
    cols.forEach((c, i) => { const x = h.getCell(i + 1); x.value = c.t; x.font = {name:"Arial", size:10, bold:true, color:{argb:"FFFFFFFF"}}; x.fill = fill(ESCURO); x.alignment = {horizontal:c.h || "left", vertical:"middle", wrapText:true}; x.border = bordas; });
    linhas.forEach((l, k) => {
      const r = ws.getRow(linha0 + 1 + k); r.height = 18;
      cols.forEach((c, i) => { const x = r.getCell(i + 1); x.value = l[i]; x.numFmt = c.f || "@"; x.font = {name:"Arial", size:10, color:{argb:c.cor && c.cor(l) || "FF222222"}, bold:!!c.neg}; x.fill = fill(k % 2 ? ZEBRA : "FFFFFF"); x.alignment = {horizontal:c.h || "left", vertical:"middle"}; x.border = bordas; });
    });
    let fim = linha0 + linhas.length;
    if(totais){
      fim++; const r = ws.getRow(fim); r.height = 22;
      cols.forEach((c, i) => { const x = r.getCell(i + 1); x.value = totais[i]; x.numFmt = c.f || "@"; x.font = {name:"Arial", size:10, bold:true, color:{argb:"FFFFFFFF"}}; x.fill = fill(VERDE); x.alignment = {horizontal:c.h || "left", vertical:"middle"}; x.border = bordas; });
    }
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
    return fim;
  }

  function configPagina(ws){
    ws.pageSetup = {paperSize:9, orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, horizontalCentered:true, margins:{left:0.3, right:0.3, top:0.4, bottom:0.4, header:0.2, footer:0.2}};
    ws.headerFooter = {oddFooter:"&LDo Valle Transportadora&RPágina &P de &N"};
  }

  const colsDoc = [
    {t:"CTRC", w:14}, {t:"Emissão", w:11, h:"center"}, {t:"Remetente", w:18}, {t:"Pagador", w:18}, {t:"Destinatário", w:22}, {t:"Cidade", w:14},
    {t:"NF", w:10, h:"center"}, {t:"Peso (kg)", w:10, h:"right", f:"#,##0"}, {t:"Frete", w:13, h:"right", f:'"R$" #,##0.00'}, {t:"Vlr. mercadoria", w:15, h:"right", f:'"R$" #,##0.00'},
    {t:"Previsão", w:11, h:"center"}, {t:"Realizado", w:11, h:"center"}, {t:"Dias atraso", w:9, h:"center", f:"0", neg:true, cor:() => "FF" + VERM}, {t:"Última ocorrência", w:42}
  ];
  const linhaDoc = d => [d.ctrc, dataBR(d.emissao), d.remetente, d.pagador, d.destinatario, d.cidade, d.nf, d.peso, d.frete, d.vlrMerc, dataBR(d.previsao), dataBR(d.realizado), d.atraso, d.codOc ? d.codOc + " - " + d.ocorrencia : ""];
  // colunas de data usam formato de data
  colsDoc[1].f = colsDoc[10].f = colsDoc[11].f = "dd/mm/yyyy";

  async function exportarExcel(){
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca do Excel (ExcelJS) não carregou. Verifique a internet e recarregue o painel."); return; }
    const lista = filtrados();
    if(!lista.length){ alert("Não há documentos para exportar."); return; }
    const tot = somar(lista), unid = porUnidade(lista), oc = topOcorrencias(lista);
    const periodos = Array.from(new Set(lista.map(d => d.periodo).filter(Boolean))).join(" | ");
    const clientes = Array.from(new Set(lista.map(d => d.grupo).filter(Boolean))).join(" / ");
    const hoje = new Date().toLocaleDateString("pt-BR");
    const sub = `Cliente: ${clientes || "-"}  ·  Período de emissão: ${periodos || "-"}  ·  Gerado em ${hoje}`;

    const wb = new ExcelJS.Workbook(); wb.creator = "Do Valle Transportadora";
    // --- Resumo
    const ws = wb.addWorksheet("Resumo", {properties:{tabColor:{argb:"FF" + VERDE}}});
    const colsRes = [
      {t:"Filial", w:10, neg:true}, {t:"Cidade(s)", w:30}, {t:"CTRCs", w:10, h:"center", f:"0"}, {t:"% do total", w:11, h:"center", f:"0.0%"},
      {t:"Peso (kg)", w:12, h:"right", f:"#,##0"}, {t:"Frete", w:15, h:"right", f:'"R$" #,##0.00'}, {t:"Vlr. mercadoria", w:17, h:"right", f:'"R$" #,##0.00'},
      {t:"Atraso médio (dias)", w:12, h:"center", f:"0.0"}, {t:"Maior atraso (dias)", w:12, h:"center", f:"0"}
    ];
    cabecalhoPagina(wb, ws, "ATRASOS · RESPONSABILIDADE DA TRANSPORTADORA", sub, colsRes.length);
    // KPIs
    const kp = [["CTRCs em atraso", tot.qtd, "#,##0"], ["Filiais afetadas", unid.length, "0"], ["Frete", tot.frete, '"R$" #,##0.00'], ["Vlr. mercadoria", tot.vlrMerc, '"R$" #,##0.00'], ["Atraso médio (dias)", tot.media, "0.0"]];
    const pos = [[1, 2], [3, 4], [5, 6], [7, 7], [8, 9]];
    ws.getRow(7).height = 16; ws.getRow(8).height = 26;
    kp.forEach((k, i) => {
      const [a, b] = pos[i]; if(b > a){ ws.mergeCells(7, a, 7, b); ws.mergeCells(8, a, 8, b); }
      const l = ws.getCell(7, a), v = ws.getCell(8, a);
      l.value = k[0]; l.font = {name:"Arial", size:9, color:{argb:"FF5B665B"}}; l.alignment = {horizontal:"center", vertical:"middle"};
      v.value = k[1]; v.numFmt = k[2]; v.font = {name:"Arial", size:15, bold:true, color:{argb:"FF" + ESCURO}}; v.alignment = {horizontal:"center", vertical:"middle"};
      for(let c = a; c <= b; c++){ ws.getCell(7, c).fill = ws.getCell(8, c).fill = fill("EAF7EE"); ws.getCell(7, c).border = {top:{style:"medium", color:{argb:"FF" + VERDE}}}; }
    });
    const linhasRes = unid.map(u => [u.un, u.cidades, u.qtd, u.qtd / tot.qtd, u.peso, u.frete, u.vlrMerc, u.media, u.maior]);
    let fim = tabela(ws, 10, colsRes, linhasRes, ["TOTAL", "", tot.qtd, 1, tot.peso, tot.frete, tot.vlrMerc, tot.media, tot.maior]);
    // ocorrências
    const r0 = fim + 2;
    ws.mergeCells(r0, 1, r0, 4); const tt = ws.getCell(r0, 1); tt.value = "Principais últimas ocorrências"; tt.font = {name:"Arial", size:11, bold:true, color:{argb:"FF" + ESCURO}};
    oc.slice(0, 8).forEach(([k, q], i) => {
      const r = ws.getRow(r0 + 1 + i); ws.mergeCells(r0 + 1 + i, 1, r0 + 1 + i, 3);
      const a = r.getCell(1), b = r.getCell(4);
      a.value = k; b.value = q; b.alignment = {horizontal:"center"};
      [a, b].forEach(x => { x.font = {name:"Arial", size:10}; x.border = bordas; x.fill = fill(i % 2 ? ZEBRA : "FFFFFF"); });
    });
    configPagina(ws);

    // --- Todos os CTRCs
    const wt = wb.addWorksheet("Todos os CTRCs", {properties:{tabColor:{argb:"FF" + ESCURO}}});
    cabecalhoPagina(wb, wt, "TODOS OS CTRCs EM ATRASO", sub, colsDoc.length);
    const todos = [].concat(...unid.map(u => u.docs.map(d => [d.unidade].concat(linhaDoc(d)))));
    const colsTodos = [{t:"Filial", w:8, neg:true, h:"center"}].concat(colsDoc);
    const fimT = tabela(wt, 7, colsTodos, todos, null);
    wt.autoFilter = {from:{row:7, column:1}, to:{row:7, column:colsTodos.length}};
    wt.views = [{showGridLines:false, state:"frozen", ySplit:7}];
    configPagina(wt);

    // --- uma aba por filial
    const usados = new Set(["resumo", "todos os ctrcs"]);
    unid.forEach(u => {
      let nome = u.un.replace(/[\[\]:*?\/\\]/g, " ").slice(0, 28) || "Filial", f = nome, i = 2;
      while(usados.has(f.toLowerCase())) f = nome + " (" + i++ + ")";
      usados.add(f.toLowerCase());
      const w = wb.addWorksheet(f);
      cabecalhoPagina(wb, w, `FILIAL ${u.un} · ${u.cidades}`, `${u.qtd} CTRC(s) em atraso  ·  Frete ${brl(u.frete)}  ·  Vlr. mercadoria ${brl(u.vlrMerc)}  ·  Atraso médio ${n1(u.media)} dia(s)  ·  ${sub}`, colsDoc.length);
      tabela(w, 7, colsDoc, u.docs.map(linhaDoc), ["TOTAL", "", "", "", "", "", u.qtd + " CTRC(s)", u.peso, u.frete, u.vlrMerc, "", "", u.media, ""]);
      w.views = [{showGridLines:false, state:"frozen", ySplit:7}];
      configPagina(w);
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Atrasos Resp Transportadora " + hoje.replace(/\//g, "-") + ".xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  window.ATRASOS_TRANSP = {parse:parseAtrasos};
})();
