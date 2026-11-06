/* ================= OCORRÊNCIAS › SLA ACOMPANHAMENTO (v2) =================
   Sub-aba SEM importação própria de pendências: ela lê o que é importado em "Código 69" e "Código 150"
   (VAL e RVA) — cada importação dessas abas é uma "foto" que alimenta o acompanhamento.
   Só a BASE DE ENTREGAS (denominador do %) tem importação própria, no fim da tela.

   COMO A PENDÊNCIA FUNCIONA
   • Os arquivos são importados 1 ou 2x por dia nas abas 69 e 150 (VAL = Rede Do Valle, RVA = Real Vale).
   • 69 (entrega realizada com ressalva)  -> SEMPRE pendência para o SAC resolver.
   • 150 (documentos em atraso)           -> o CÓDIGO da ocorrência define: SAC, Filial ou Ambos
                                             (tabela editável na tela; "A definir" enquanto não classificado).
   • A pendência é identificada pela NF (sem NF, pelo CTRC). A mesma NF NUNCA vira duas pendências:
        - NF nova na foto                         -> abre pendência (guarda quando apareceu)
        - NF que continua na foto seguinte        -> continua a MESMA pendência (só atualiza)
        - NF que saiu do relatório (do mesmo sistema e do mesmo tipo) -> RESOLVIDA (guarda quando)
        - NF resolvida que volta ao relatório     -> REABRE a mesma pendência (conta reabertura)
   • Base de entregas (VAL/RVA): total de CTRCs por unidade de entrega, para o percentual
     "quanto das entregas da unidade virou pendência SAC".   */

const SLA_KEY = () => KEYS.slaAcomp;
const SLA_CLASSES = {SAC:"SAC", FILIAL:"Filial", AMBOS:"Ambos", DEFINIR:"A definir"};

const slaNum = v => (typeof numeroOcorrenciaBR === "function") ? numeroOcorrenciaBR(v) : (Number(String(v||"").replace(/\./g,"").replace(",", ".")) || 0);
const slaDias = v => (typeof numeroAtrasoBR === "function") ? numeroAtrasoBR(v) : (parseInt(String(v||"").replace(/[^\d-]/g,""), 10) || 0);
const slaUn = u => String(u || "").trim().toUpperCase().slice(0, 3);   // mesma regra da base (praça de 3 letras)
const slaPct = (a, b) => b ? (a / b * 100).toFixed(1).replace(".", ",") + "%" : "—";
const slaDataBR = iso => { if(!iso) return "—"; const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}); };

/* ---------- códigos do 150: SAC / Filial / Ambos ---------- */
function slaCodigosLoad(){ const r = load(KEYS.slaCodigos); return (r && !Array.isArray(r)) ? r : {}; }
function slaNormCod(c){ c = String(c == null ? "" : c).trim(); return /^\d+$/.test(c) ? String(parseInt(c, 10)) : c.toUpperCase(); }

// Classe da pendência: 69 = sempre SAC; 150 = pelo código (tabela do usuário).
function slaClasse(d, tabela){
  if(d.tipo === "69") return "SAC";
  const t = tabela || slaCodigosLoad();
  const e = t[slaNormCod(d.codigo)];
  return (e && SLA_CLASSES[e.resp]) ? e.resp : "DEFINIR";
}
const slaEhSac = c => c === "SAC" || c === "AMBOS";

/* ---------- normalização das linhas vindas das abas 69 e 150 ---------- */
const slaNorm150 = r => ({tipo:"150", ctrc:r.ctrc, nf:r.nf, remetente:r.remetente, destinatario:r.destinatario, pagador:r.pagador,
  cnpjPagador:r.cnpjPagador, unidade:r.unidade, frete:r.frete, valMercad:r.valorNf, prevEntrega:r.prevEntrega,
  diasAtraso:String(slaDias(r.diasAtraso)), codigo:slaNormCod(r.codOcorrencia), descricao:r.descrOcorrencia || "", pendencia:""});
const slaNorm69 = r => ({tipo:"69", ctrc:r.ctrc, nf:r.nf, remetente:r.remetente, destinatario:r.destinatario, pagador:r.pagador,
  cnpjPagador:r.cnpjPagador, unidade:r.unidade, frete:r.valFrete, valMercad:r.valMercad, prevEntrega:"", diasAtraso:"",
  codigo:"69", descricao:r.busca || r.ultOcor || "Entrega realizada com ressalva", pendencia:r.pendencia || r.comple || ""});

// Chamada pelas importações das abas 69 e 150 (app.js): cada importação é uma foto.
function slaSincronizarImportacao(tipo, rowsBrutos, origem, totalArquivo){
  const norm = tipo === "69" ? slaNorm69 : slaNorm150;
  const res = slaImportar({escopo:tipo, rows:(rowsBrutos || []).map(norm), totalArquivo:totalArquivo || (rowsBrutos || []).length}, origem);
  try{ if(document.getElementById("slaKpiWrap")) slaRefresh(); }catch(e){}
  try{ const c = document.getElementById("ocorTabCountSla"); if(c) slaAtualizarContador(); }catch(e){}
  return res;
}

// Traz para o acompanhamento o que JÁ estava importado em 69 e 150 antes deste recurso (só adiciona; nunca resolve).
function slaCarregarExistentes(){
  const agora = new Date().toISOString(), lista = load(SLA_KEY()), porChave = new Map(lista.map(d => [d.chave, d]));
  let novos = 0;
  [["69", load(KEYS.ocorrencias), slaNorm69], ["150", load(KEYS.atrasos), slaNorm150]].forEach(([tipo, itens, norm]) => {
    (Array.isArray(itens) ? itens : []).forEach(it => {
      const origem = String(it.origem || "").toUpperCase(), r = norm(it), chave = slaChave(r, origem);
      if(porChave.has(chave)) return;
      porChave.set(chave, {id:uid(), ...r, chave, origem, focal:it.focal || "Sem focal definido", focalOrigem:it.focalOrigem || "indefinido", ultimaVez:agora, status:"aberta", primeiraVez:agora, resolvidaEm:null, reaberturas:0});
      novos++;
    });
  });
  save(SLA_KEY(), Array.from(porChave.values()));
  return novos;
}

// Chave da pendência: NF (sem NF, CTRC), separada por sistema e tipo. Mesma NF = mesma pendência.
const slaChave = (r, origem) => r.tipo + "|" + String(origem || "").toUpperCase() + "|" + (String(r.nf || "").trim() || ("CTRC:" + String(r.ctrc || "").trim()));

function slaImportar(parsed, origem, agoraISO){
  const agora = agoraISO || new Date().toISOString();
  const res = {escopo:parsed.escopo, totalArquivo:parsed.totalArquivo, novos:0, mantidas:0, resolvidas:0, reabertas:0, repetidas:0, semEfeito:false};
  if(!parsed.rows.length){ res.semEfeito = true; return res; }   // arquivo vazio/errado: nunca resolve nada

  const lista = load(SLA_KEY());
  const porChave = new Map(lista.map(d => [d.chave, d]));
  const vistos = new Set();
  parsed.rows.forEach(r => {
    const chave = slaChave(r, origem);
    if(vistos.has(chave)){ res.repetidas++; return; }          // mesma NF 2x no mesmo arquivo = 1 pendência
    vistos.add(chave);
    const f = definirFocalOcorrencia(r.pagador, r.unidade, r.cnpjPagador);
    const dados = {...r, chave, origem:String(origem || "").toUpperCase(), focal:f.titulo, focalOrigem:f.origem, ultimaVez:agora};
    const atual = porChave.get(chave);
    if(!atual){
      porChave.set(chave, {id:uid(), ...dados, status:"aberta", primeiraVez:agora, resolvidaEm:null, reaberturas:0}); res.novos++;
    } else if(atual.status === "resolvida"){
      Object.assign(atual, dados, {status:"aberta", resolvidaEm:null, reaberturas:(atual.reaberturas || 0) + 1}); res.reabertas++;
    } else { Object.assign(atual, dados); res.mantidas++; }
  });
  // Saiu do relatório (mesmo sistema + mesmo tipo da foto) => resolvida.
  porChave.forEach(d => {
    if(d.origem === String(origem || "").toUpperCase() && d.tipo === parsed.escopo && d.status === "aberta" && !vistos.has(d.chave)){
      d.status = "resolvida"; d.resolvidaEm = agora; res.resolvidas++;
    }
  });
  save(SLA_KEY(), Array.from(porChave.values()));
  const log = load(KEYS.slaImportacoes); const logArr = Array.isArray(log) ? log : [];
  logArr.push({em:agora, origem:String(origem || "").toUpperCase(), escopo:parsed.escopo, linhas:parsed.rows.length, novos:res.novos, resolvidas:res.resolvidas, reabertas:res.reabertas});
  save(KEYS.slaImportacoes, logArr.slice(-300));
  return res;
}

function slaResumoTexto(res){
  if(!res) return "";
  if(res.semEfeito) return "SLA: nada alterado (sem linhas do tipo " + res.escopo + ").";
  const p = [`${res.novos} pendência(s) nova(s)`, `${res.mantidas} mantida(s)`, `${res.resolvidas} resolvida(s) (saíram do relatório)`];
  if(res.reabertas) p.push(`${res.reabertas} reaberta(s)`);
  if(res.repetidas) p.push(`${res.repetidas} NF repetida(s) contada(s) 1 vez`);
  return "SLA Acompanhamento — " + p.join(" · ") + ".";
}

/* ---------- base de entregas (denominador do %) ---------- */
function slaBaseLoad(){ const r = load(KEYS.slaBase); return (r && !Array.isArray(r) && r.unidades) ? r : {unidades:{}}; }

function slaImportarBase(text, origem){
  const p = ehCsvFaturamento(text) ? parseSswFaturamentoCsv(text) : parseSswFaturamentoDetalhado(text);
  if(!p || !p.encontrou) return {ok:false};
  const o = String(origem).toLowerCase(), base = slaBaseLoad(), agora = new Date().toISOString();
  Object.values(base.unidades).forEach(u => { delete u[o]; });                       // a foto nova substitui a do mesmo sistema
  Object.keys(p.porPraca).forEach(sig => {
    const u = base.unidades[sig] || (base.unidades[sig] = {sigla:sig});
    u[o] = {qctrc:p.porPraca[sig].qctrc, periodo:p.periodo || "", atualizadoEm:agora};
  });
  Object.keys(base.unidades).forEach(k => { if(!base.unidades[k].val && !base.unidades[k].rva) delete base.unidades[k]; });
  save(KEYS.slaBase, base);
  return {ok:true, unidades:Object.keys(p.porPraca).length, ctrcs:p.totalLinhas, periodo:p.periodo};
}
function slaRelatarBase(res, el){
  el.textContent = res && res.ok
    ? `Base lida: ${res.ctrcs} CTRC(s) em ${res.unidades} unidade(s)${res.periodo ? " — período " + res.periodo : ""}. Substituiu a base anterior deste sistema.`
    : "Não reconheci o arquivo. Use o mesmo relatório \"CTRCs Expedidos e Recebidos\" da Fechamento-RECEITA.";
}
const slaBaseUnidade = (base, sig) => { const u = base.unidades[sig]; return u ? (Number(u.val && u.val.qctrc) || 0) + (Number(u.rva && u.rva.qctrc) || 0) : 0; };
function slaFocalDaUnidade(sig){
  const f = focalPorSigla(sig);
  return f ? f.titulo : (FOCAIS_ESPECIAIS_POR_UNIDADE[sig] || "");
}

/* ---------- filtro de período + agregação ---------- */
function slaFiltrados(){
  const de = (document.getElementById("slaDe") || {}).value, ate = (document.getElementById("slaAte") || {}).value;
  return load(SLA_KEY()).filter(d => {
    const dia = String(d.primeiraVez || "").slice(0, 10);
    return (!de || dia >= de) && (!ate || dia <= ate);
  });
}

function slaVazio(){ return {q69:0, q150sac:0, q150ambos:0, filial:0, definir:0, abertas:0, resolvidas:0, totalSac:0, somaRes:0, nRes:0}; }
function slaSomar(g, d, tabela){
  const c = slaClasse(d, tabela);
  if(c === "FILIAL"){ g.filial++; return; }
  if(c === "DEFINIR"){ g.definir++; return; }
  if(d.tipo === "69") g.q69++; else if(c === "SAC") g.q150sac++; else g.q150ambos++;
  g.totalSac++;
  if(d.status === "resolvida"){ g.resolvidas++; g.somaRes += (new Date(d.resolvidaEm) - new Date(d.primeiraVez)) / 86400000; g.nRes++; }
  else g.abertas++;
}

function slaAgregar(lista){
  const tabela = slaCodigosLoad(), base = slaBaseLoad();
  const porUn = new Map(), porFocal = new Map();
  const get = (m, k, extra) => { if(!m.has(k)) m.set(k, {...slaVazio(), chave:k, entregas:0, ...extra}); return m.get(k); };
  Object.keys(base.unidades).forEach(sig => { get(porUn, sig, {focal:slaFocalDaUnidade(sig)}).entregas = slaBaseUnidade(base, sig); });
  lista.forEach(d => {
    const sig = slaUn(d.unidade) || "—";
    slaSomar(get(porUn, sig, {focal:slaFocalDaUnidade(sig)}), d, tabela);
    slaSomar(get(porFocal, d.focal || "Sem focal definido", {semFocal:d.focalOrigem === "indefinido"}), d, tabela);
  });
  // entregas do focal = soma da base das unidades que pertencem a ele
  FOCAIS.forEach(f => {
    const ent = f.unidades.reduce((s, u) => s + slaBaseUnidade(base, u.sigla), 0);
    if(ent) get(porFocal, f.titulo, {semFocal:false}).entregas = ent;
  });
  Object.keys(FOCAIS_ESPECIAIS_POR_UNIDADE).forEach(sig => {
    const t = FOCAIS_ESPECIAIS_POR_UNIDADE[sig], ent = slaBaseUnidade(base, sig);
    if(ent && !focalPorSigla(sig)) get(porFocal, t, {semFocal:false}).entregas += ent;
  });
  const fin = m => Array.from(m.values()).map(g => ({...g, mediaDias:g.nRes ? g.somaRes / g.nRes : 0}))
    .filter(g => g.entregas || g.totalSac || g.filial || g.definir)
    .sort((a, b) => ((a.semFocal ? 1 : 0) - (b.semFocal ? 1 : 0)) || b.totalSac - a.totalSac || b.entregas - a.entregas || String(a.chave).localeCompare(String(b.chave)));
  return {porUnidade:fin(porUn), porFocal:fin(porFocal), tabela, base};
}

/* ---------- tela ---------- */
function slaHTML(){
  const bloco = (titulo, pre) => blocoImportacaoDocumentoHTML({titulo, formId:`form${pre}Arquivo`, inputId:`${pre}ArquivoInput`,
    toggleId:`toggle${pre}ColarTexto`, wrapId:`${pre}ColarTextoWrap`, textareaId:`${pre}TextoManual`, processarId:`processar${pre}TextoManual`, statusId:`${pre}ImportStatus`});
  return `
    <p class="section-desc"><strong>SLA Acompanhamento</strong> é o painel geral das abas <strong>Código 69</strong> e <strong>Código 150</strong>: <u>não tem importação de pendências</u> — ele pega sozinho o que você importa lá (VAL e RVA), 1 ou 2 vezes ao dia. <strong>69 é sempre pendência do SAC</strong>; nos <strong>documentos em atraso</strong> o <strong>código</strong> da ocorrência define se é SAC, Filial ou Ambos. A pendência é controlada pela <strong>NF</strong>: se continua no relatório seguinte é a mesma pendência (nunca duplica); se saiu do relatório, foi <strong>resolvida</strong>.</p>

    <div id="slaKpiWrap"></div>

    <div class="panel" id="slaPainelFocal">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <span>Acompanhamento — quanto o SAC trabalha em pendência</span>
        <div class="toolbar-actions">
          <label class="check-inline">Pendências que apareceram de <input type="date" class="small-input" id="slaDe"> até <input type="date" class="small-input" id="slaAte"></label>
          <button type="button" class="btn btn-primary btn-sm" id="slaExportBtn">Exportar Excel (supervisora)</button>
        </div>
      </div>
      <div class="ocor-subtabs" style="padding:10px 18px 0;"><div class="ocor-seg">
        <button type="button" class="ocor-seg-btn slaVisaoBtn active" data-v="focal">Por Focal</button>
        <button type="button" class="ocor-seg-btn slaVisaoBtn" data-v="unidade">Por Unidade</button></div></div>
      <div class="table-wrap" id="slaTabelaWrap"></div>
      <div class="footer-note">Total SAC = 69 + 150 de código SAC + 150 de código Ambos. % = Total SAC ÷ entregas da base. Por Focal: as pendências são do focal responsável (CNPJ/pagador/unidade) e as entregas são a soma das unidades do focal — focais com clientes premium podem ter % acima do real; use Por Unidade para a leitura exata.</div>
    </div>

    <div class="panel"><div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"><span>Códigos dos documentos em atraso — SAC, Filial ou Ambos</span><button type="button" class="btn btn-ghost btn-sm" id="slaCodigosToggle">Mostrar / ocultar</button></div>
      <div id="slaCodigosCorpo"><div id="slaCodigosWrap"></div></div>
    </div>

    <div class="panel"><div class="panel-header">Sincronização com as abas 69 e 150</div>
      <div class="footer-note" id="slaUltimasWrap"></div>
      <div style="padding:0 18px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="btn btn-ghost btn-sm" id="slaCarregarBtn" title="Traz para o acompanhamento o que já estava importado em 69 e 150 antes deste recurso (só adiciona, nunca resolve)">Trazer o que já está importado em 69 e 150</button>
        <button type="button" class="link-btn danger" id="slaLimparBtn">Limpar histórico do SLA</button>
        <span class="footer-note" id="slaCarregarStatus" style="padding:0;"></span>
      </div>
    </div>

    <div class="panel"><div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"><span>Importar base de entregas por unidade (para o % de pendência)</span></div>
      <p class="section-desc" style="padding:0 18px;">Total de entregas de cada unidade no período (relatório <strong>CTRCs Expedidos e Recebidos</strong>, o mesmo da Fechamento-RECEITA — aqui é uma importação separada). Serve de base: <em>de 5 mil entregas da ANP, quantas viraram pendência SAC</em>. Cada importação substitui a base anterior do mesmo sistema.</p>
      ${bloco("Base de entregas VAL — Rede Do Valle", "slaBaseVal")}
      ${bloco("Base de entregas RVA — Real Vale", "slaBaseRva")}
      <div class="footer-note" id="slaBaseResumo"></div>
    </div>`;
}

function slaRenderUltimas(){
  const el = document.getElementById("slaUltimasWrap"); if(!el) return;
  const log = load(KEYS.slaImportacoes), arr = Array.isArray(log) ? log : [];
  const ult = {};
  arr.forEach(l => { ult[l.origem + " " + l.escopo] = l; });
  const itens = Object.keys(ult).sort().map(k => `${k.replace(" ", " · ")}: ${slaDataBR(ult[k].em)} (${ult[k].linhas} linhas, ${ult[k].novos} nova(s), ${ult[k].resolvidas} resolvida(s))`);
  el.textContent = itens.length ? "Últimas importações recebidas das abas 69/150 — " + itens.join("  |  ") : "Nenhuma importação recebida ainda — importe os relatórios nas abas Código 69 / Código 150 (ou use o botão abaixo para trazer o que já está lá).";
}

function slaRenderCodigos(lista){
  const wrap = document.getElementById("slaCodigosWrap"); if(!wrap) return;
  const tabela = slaCodigosLoad(), cods = new Map();
  lista.filter(d => d.tipo === "150").forEach(d => {
    const c = slaNormCod(d.codigo) || "(sem código)";
    if(!cods.has(c)) cods.set(c, {cod:c, descr:d.descricao || "", qtd:0, abertas:0});
    const g = cods.get(c); g.qtd++; if(d.status === "aberta") g.abertas++;
    if(!g.descr && d.descricao) g.descr = d.descricao;
  });
  Object.keys(tabela).forEach(c => { if(!cods.has(c)) cods.set(c, {cod:c, descr:tabela[c].descr || "", qtd:0, abertas:0}); });
  const arr = Array.from(cods.values()).sort((a, b) => b.qtd - a.qtd || a.cod.localeCompare(b.cod, "pt-BR", {numeric:true}));
  if(!arr.length){ wrap.innerHTML = `<div class="empty">Importe documentos em atraso (150) — os códigos aparecem aqui para você marcar quais são SAC, Filial ou Ambos.</div>`; return; }
  const semClasse = arr.filter(g => !(tabela[g.cod] && SLA_CLASSES[tabela[g.cod].resp])).length;
  wrap.innerHTML = `${semClasse ? `<div class="ocor-status-banner"><div><div class="ocor-status-title">${semClasse} código(s) ainda "A definir"</div><div class="ocor-status-sub">Enquanto não classificar, esses documentos não entram como pendência SAC nem Filial (aparecem em "A definir"). A mudança vale para tudo que já foi importado.</div></div></div>` : ""}
    <div class="table-wrap"><table><thead><tr><th>Código</th><th>Descrição</th><th>Docs (total)</th><th>Abertos</th><th>Quem resolve</th></tr></thead><tbody>
    ${arr.map(g => { const r = (tabela[g.cod] || {}).resp || "DEFINIR"; return `<tr class="${r === "DEFINIR" ? "row-warn" : ""}"><td><strong>${escHtml(g.cod)}</strong></td><td>${escHtml(g.descr || "—")}</td><td>${g.qtd}</td><td>${g.abertas}</td>
      <td><select class="small-select slaCodSel ${r === "DEFINIR" ? "campo-pendente" : ""}" data-cod="${escHtml(g.cod)}" data-descr="${escHtml(g.descr)}">
        ${Object.keys(SLA_CLASSES).map(k => `<option value="${k}" ${k === r ? "selected" : ""}>${SLA_CLASSES[k]}</option>`).join("")}</select></td></tr>`; }).join("")}
    </tbody></table></div>`;
  wrap.querySelectorAll(".slaCodSel").forEach(sel => sel.addEventListener("change", () => {
    const t = slaCodigosLoad();
    if(sel.value === "DEFINIR") delete t[sel.dataset.cod]; else t[sel.dataset.cod] = {resp:sel.value, descr:sel.dataset.descr};
    save(KEYS.slaCodigos, t); slaRefresh();
  }));
}

function slaRenderKpis(lista){
  const wrap = document.getElementById("slaKpiWrap"); if(!wrap) return;
  const tabela = slaCodigosLoad(), g = slaVazio();
  lista.forEach(d => slaSomar(g, d, tabela));
  const base = slaBaseLoad(), ent = Object.keys(base.unidades).reduce((s, k) => s + slaBaseUnidade(base, k), 0);
  wrap.innerHTML = `<div class="kpi-grid">
    <div class="kpi-card ${g.abertas ? "alert" : "ok"}"><div class="label">Pendentes com o SAC</div><div class="value">${g.abertas}</div><div class="hint">Do total recebido: ${g.q69} ocor. 69 · ${g.q150sac} 150 SAC · ${g.q150ambos} 150 Ambos</div></div>
    <div class="kpi-card ok"><div class="label">Resolvidas pelo SAC</div><div class="value">${g.resolvidas}</div><div class="hint">${g.totalSac ? slaPct(g.resolvidas, g.totalSac) + " do que o SAC recebeu" : "—"}${g.nRes ? " · média " + (g.somaRes / g.nRes).toFixed(1).replace(".", ",") + " dia(s)" : ""}</div></div>
    <div class="kpi-card"><div class="label">SAC trabalhou (total)</div><div class="value">${g.totalSac}</div><div class="hint">${ent ? slaPct(g.totalSac, ent) + " de " + ent.toLocaleString("pt-BR") + " entregas" : "Importe a base de entregas para ver o %"}</div></div>
    <div class="kpi-card ${g.definir ? "alert" : ""}"><div class="label">Filial · A definir</div><div class="value">${g.filial} <span style="font-size:13px; opacity:.65;">· ${g.definir}</span></div><div class="hint">Filial · código ainda sem classificação</div></div>
  </div>`;
}

let slaVisao = "focal";
function slaRenderTabela(ag){
  const wrap = document.getElementById("slaTabelaWrap"); if(!wrap) return;
  const arr = slaVisao === "focal" ? ag.porFocal : ag.porUnidade;
  if(!arr.length){ wrap.innerHTML = `<div class="empty">Importe as pendências (e a base de entregas) para ver o acompanhamento.</div>`; return; }
  const tot = arr.reduce((t, g) => { Object.keys(slaVazio()).forEach(k => { if(k !== "somaRes" && k !== "nRes") t[k] += g[k]; }); t.entregas += g.entregas; return t; }, {...slaVazio(), entregas:0});
  const linha = (g, forte) => `<tr class="${g.semFocal ? "row-warn" : ""}" ${forte ? 'style="font-weight:700; background:#f4f7f1;"' : ""}>
    <td><strong>${escHtml(forte ? "TOTAL" : g.chave)}</strong></td>${slaVisao === "unidade" ? `<td>${escHtml(forte ? "" : (g.focal || "—"))}</td>` : ""}
    <td>${g.entregas ? g.entregas.toLocaleString("pt-BR") : "—"}</td><td>${g.q69}</td><td>${g.q150sac}</td><td>${g.q150ambos}</td><td><strong>${g.totalSac}</strong></td>
    <td>${g.abertas}</td><td>${g.resolvidas}</td><td><strong>${slaPct(g.totalSac, g.entregas)}</strong></td><td>${g.filial}</td><td>${g.definir}</td></tr>`;
  wrap.innerHTML = `<table><thead><tr><th>${slaVisao === "focal" ? "Focal" : "Unidade"}</th>${slaVisao === "unidade" ? "<th>Focal</th>" : ""}<th>Entregas (base)</th><th>69</th><th>150 SAC</th><th>150 Ambos</th><th>Total SAC<br><small>(trabalhou)</small></th><th>Pendentes<br><small>(abertas)</small></th><th>Resolvidas<br><small>(fez)</small></th><th>% das entregas</th><th>Filial</th><th>A definir</th></tr></thead>
    <tbody>${arr.map(g => linha(g, false)).join("")}${linha(tot, true)}</tbody></table>`;
}

function slaRenderBaseResumo(){
  const el = document.getElementById("slaBaseResumo"); if(!el) return;
  const b = slaBaseLoad(), un = Object.values(b.unidades);
  const q = o => un.reduce((s, u) => s + (Number(u[o] && u[o].qctrc) || 0), 0);
  const per = [...new Set(un.flatMap(u => [u.val && u.val.periodo, u.rva && u.rva.periodo]).filter(Boolean))].join(" / ");
  el.textContent = un.length ? `Base atual: ${un.length} unidade(s) · VAL ${q("val").toLocaleString("pt-BR")} CTRCs · RVA ${q("rva").toLocaleString("pt-BR")} CTRCs${per ? " · período " + per : ""}.` : "Base de entregas ainda não importada.";
}

function slaRefresh(){
  const todas = load(SLA_KEY()), lista = slaFiltrados();
  slaRenderUltimas(); slaRenderCodigos(todas); slaRenderKpis(lista); slaRenderTabela(slaAgregar(lista)); slaRenderBaseResumo();
  slaAtualizarContador();
}
function slaAtualizarContador(){
  const c = document.getElementById("ocorTabCountSla"); if(!c) return;
  const t = slaCodigosLoad(); c.textContent = load(SLA_KEY()).filter(d => d.status === "aberta" && slaEhSac(slaClasse(d, t))).length;
}

function attachSlaEvents(){
  const base = {parseFn:t => t, importFn:slaImportarBase, relatarFn:slaRelatarBase, refreshFn:slaRefresh};
  const ids = pre => ({formId:`form${pre}Arquivo`, inputId:`${pre}ArquivoInput`, toggleId:`toggle${pre}ColarTexto`, wrapId:`${pre}ColarTextoWrap`, textareaId:`${pre}TextoManual`, processarId:`processar${pre}TextoManual`, statusId:`${pre}ImportStatus`});
  wireImportacaoDocumento({...base, ...ids("slaBaseVal"), nomeFonte:"VAL"});
  wireImportacaoDocumento({...base, ...ids("slaBaseRva"), nomeFonte:"RVA"});
  const cod = document.getElementById("slaCodigosToggle"), corpo = document.getElementById("slaCodigosCorpo");
  if(cod && corpo) cod.addEventListener("click", () => { corpo.style.display = corpo.style.display === "none" ? "" : "none"; });
  document.querySelectorAll(".slaVisaoBtn").forEach(b => b.addEventListener("click", () => {
    slaVisao = b.dataset.v; document.querySelectorAll(".slaVisaoBtn").forEach(x => x.classList.toggle("active", x === b)); slaRefresh();
  }));
  ["slaDe", "slaAte"].forEach(id => { const e = document.getElementById(id); if(e) e.addEventListener("change", slaRefresh); });
  const car = document.getElementById("slaCarregarBtn");
  if(car) car.addEventListener("click", () => {
    const n = slaCarregarExistentes(); slaRefresh();
    const st = document.getElementById("slaCarregarStatus"); if(st) st.textContent = n ? `${n} pendência(s) trazida(s) de 69/150.` : "Nada novo para trazer.";
  });
  const lim = document.getElementById("slaLimparBtn");
  if(lim) lim.addEventListener("click", () => {
    if(!confirm("Apagar o histórico de pendências do SLA (abertas, resolvidas e datas), a base de entregas e o log de importações? A classificação dos códigos é mantida e as abas Código 69 / 150 não são afetadas.")) return;
    save(SLA_KEY(), []); save(KEYS.slaBase, {unidades:{}}); save(KEYS.slaImportacoes, []); slaRefresh();
  });
  const exp = document.getElementById("slaExportBtn");
  if(exp) exp.addEventListener("click", slaExportarExcel);
  slaRefresh();
}

/* ---------- Excel para a supervisora ---------- */
(function(root){
  const FONTE = "Arial", MOEDA = '"R$" #,##0.00', DH = "dd/mm/yyyy hh:mm";
  const NAVY = "0F1C47", GOLD = "C99A2E", VERM = "B42318", ZEBRA = "F4F6FB";
  const fill = hex => ({type:"pattern", pattern:"solid", fgColor:{argb:"FF" + hex}});
  const fino = {style:"thin", color:{argb:"FFD5DAE6"}}, borda = {top:fino, bottom:fino, left:fino, right:fino};
  const letra = n => { let s = ""; while(n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  function nomeAba(nome, usados){
    const base = String(nome || "Planilha").replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Planilha";
    let final = base, i = 2;
    while(usados.has(final.toLowerCase())){ const suf = " (" + i++ + ")"; final = base.slice(0, 31 - suf.length) + suf; }
    usados.add(final.toLowerCase()); return final;
  }
  function faixa(ws, r, n, texto, o){
    ws.mergeCells(r, 1, r, n);
    for(let c = 1; c <= n; c++) ws.getCell(r, c).fill = fill(o.fundo);
    const cel = ws.getCell(r, 1); cel.value = texto;
    cel.font = {name:FONTE, size:o.tam, bold:true, color:{argb:"FF" + o.cor}};
    cel.alignment = {vertical:"middle", horizontal:"left", indent:1}; ws.getRow(r).height = o.altura;
  }
  function cabecalho(ws, r, titulos){
    titulos.forEach((t, i) => { const c = ws.getCell(r, i + 1); c.value = t; c.fill = fill(NAVY); c.border = borda;
      c.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.alignment = {vertical:"middle", horizontal:"center", wrapText:true}; });
    ws.getRow(r).height = 32;
  }

  /* resumo por focal / por unidade (mesmas colunas) */
  function abaResumo(wb, nome, titulo, sub, arr, porUnidade, cor){
    const ws = wb.addWorksheet(nome, {views:[{showGridLines:false, state:"frozen", ySplit:5}]});
    ws.properties.tabColor = {argb:"FF" + cor};
    const cols = [porUnidade ? "Unidade" : "Focal"].concat(porUnidade ? ["Focal"] : [], ["Entregas\n(base)", "Ocor. 69", "150 código\nSAC", "150 código\nAmbos", "Total SAC\n(trabalhou)", "Pendentes\n(abertas)", "Resolvidas\n(fez)", "% resolvidas", "% das\nentregas", "Tempo médio p/\nresolver (dias)", "150 Filial", "150 A definir"]);
    const n = cols.length, off = porUnidade ? 1 : 0;
    faixa(ws, 1, n, titulo, {fundo:NAVY, cor:"FFFFFF", tam:14, altura:30});
    faixa(ws, 2, n, sub, {fundo:GOLD, cor:NAVY, tam:11, altura:24});
    ws.mergeCells(3, 1, 3, n);
    const r3 = ws.getCell(3, 1);
    r3.value = "Total SAC = tudo que o SAC trabalhou: 69 + 150 de código SAC + 150 de código Ambos. Resolvidas = o que o SAC já fez (NF saiu do relatório); Pendentes = ainda aberto. % das entregas = Total SAC ÷ entregas da unidade/focal na base. Resolvida = a NF saiu do relatório.";
    r3.font = {name:FONTE, size:9, italic:true, color:{argb:"FF6B7286"}}; ws.getRow(4).height = 6;
    cabecalho(ws, 5, cols);
    ws.getColumn(1).width = porUnidade ? 12 : 30; if(porUnidade) ws.getColumn(2).width = 26;
    for(let c = 2 + off; c <= n; c++) ws.getColumn(c).width = 13;
    const p0 = 6, pU = 5 + arr.length, rt = pU + 1;
    const C = k => letra(2 + off + k);                       // 0 entregas,1 q69,2 sac,3 ambos,4 total,5 abertas,6 resolv,7 %res,8 %ent,9 tempo,10 filial,11 definir
    arr.forEach((g, k) => {
      const r = p0 + k, cor = g.semFocal ? "FF" + VERM : "FF000000";
      const v = [g.chave].concat(porUnidade ? [g.focal || ""] : [], [g.entregas || 0, g.q69, g.q150sac, g.q150ambos,
        {formula:`${C(1)}${r}+${C(2)}${r}+${C(3)}${r}`, result:g.totalSac}, g.abertas, g.resolvidas,
        {formula:`IF(${C(4)}${r}=0,0,${C(6)}${r}/${C(4)}${r})`, result:g.totalSac ? g.resolvidas / g.totalSac : 0},
        {formula:`IF(${C(0)}${r}=0,0,${C(4)}${r}/${C(0)}${r})`, result:g.entregas ? g.totalSac / g.entregas : 0},
        g.nRes ? Math.round(g.mediaDias * 10) / 10 : 0, g.filial, g.definir]);
      v.forEach((val, i) => { const c = ws.getCell(r, i + 1); c.value = val; c.border = borda;
        c.font = {name:FONTE, size:10, bold:i === 0 || i === 2 + off + 3, color:{argb:cor}}; if(k % 2) c.fill = fill(ZEBRA);
        c.alignment = {vertical:"middle", horizontal:i < 1 + off ? "left" : "center"};
        if(i === 2 + off + 6 || i === 2 + off + 7) c.numFmt = "0.0%"; if(i === 2 + off + 8) c.numFmt = "0.0";
        if(i === 1 + off) c.numFmt = "#,##0"; });
    });
    for(let c = 1; c <= n; c++){ const cel = ws.getCell(rt, c); cel.fill = fill(NAVY); cel.border = borda;
      cel.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}}; cel.alignment = {vertical:"middle", horizontal:c <= 1 + off ? "left" : "center"}; }
    ws.getCell(rt, 1).value = "TOTAL GERAL";
    [0, 1, 2, 3, 4, 5, 6, 10, 11].forEach(k => { const L = C(k); ws.getCell(rt, 2 + off + k).value = arr.length ? {formula:`SUM(${L}${p0}:${L}${pU})`, result:0} : 0; });
    ws.getCell(rt, 2 + off + 7).value = {formula:`IF(${C(4)}${rt}=0,0,${C(6)}${rt}/${C(4)}${rt})`, result:0};
    ws.getCell(rt, 2 + off + 8).value = {formula:`IF(${C(0)}${rt}=0,0,${C(4)}${rt}/${C(0)}${rt})`, result:0};
    [7, 8].forEach(k => ws.getCell(rt, 2 + off + k).numFmt = "0.0%"); ws.getCell(rt, 2 + off).numFmt = "#,##0";
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
    return {ws, rt};
  }

  const DET = (tabela) => [
    {t:"Status",          w:11, f:d => d.status === "resolvida" ? "Resolvida" : "Aberta", centro:true},
    {t:"Tipo",            w:12, f:d => d.tipo === "69" ? "69 - Ressalva" : "150 - Atraso", centro:true},
    {t:"Quem resolve",    w:13, f:d => SLA_CLASSES[slaClasse(d, tabela)], centro:true},
    {t:"Focal",           w:24, f:d => d.focal || ""},
    {t:"CTRC",            w:16, f:d => String(d.ctrc || ""), txt:true},
    {t:"Nota Fiscal",     w:13, f:d => String(d.nf || ""), txt:true},
    {t:"Pagador",         w:32, f:d => d.pagador || ""},
    {t:"Destinatário",    w:30, f:d => d.destinatario || ""},
    {t:"Unidade",         w:10, f:d => d.unidade || "", centro:true},
    {t:"Cód.",            w:8,  f:d => d.codigo || "", centro:true},
    {t:"Ocorrência",      w:30, f:d => d.descricao || ""},
    {t:"Pendência / Compl.", w:28, f:d => d.pendencia || ""},
    {t:"Apareceu em",     w:17, f:d => d.primeiraVez ? new Date(d.primeiraVez) : "", dh:true, centro:true},
    {t:"Resolvida em",    w:17, f:d => d.resolvidaEm ? new Date(d.resolvidaEm) : "", dh:true, centro:true},
    {t:"Dias em aberto /\naté resolver", w:14, f:d => { const fim = d.resolvidaEm ? new Date(d.resolvidaEm) : new Date(); return Math.round((fim - new Date(d.primeiraVez)) / 86400000 * 10) / 10; }, centro:true, dec:true},
    {t:"Dias de atraso\n(último relat.)", w:13, f:d => d.tipo === "150" ? slaDias(d.diasAtraso) : "", centro:true},
    {t:"Reaberturas",     w:11, f:d => d.reaberturas || 0, centro:true},
    {t:"Frete",           w:14, f:d => slaNum(d.frete), moeda:true},
    {t:"Sistema",         w:9,  f:d => d.origem || "", centro:true}
  ];

  function abaDetalhe(wb, nome, titulo, sub, itens, tabela, cor){
    const ws = wb.addWorksheet(nome, {views:[{showGridLines:false, state:"frozen", ySplit:4}]});
    ws.properties.tabColor = {argb:"FF" + cor};
    const cols = DET(tabela), n = cols.length;
    faixa(ws, 1, n, titulo, {fundo:NAVY, cor:"FFFFFF", tam:14, altura:30});
    faixa(ws, 2, n, sub, {fundo:cor === VERM ? VERM : GOLD, cor:cor === VERM ? "FFFFFF" : NAVY, tam:12, altura:24});
    ws.getRow(3).height = 6; cabecalho(ws, 4, cols.map(c => c.t));
    cols.forEach((c, i) => ws.getColumn(i + 1).width = c.w);
    const ord = itens.slice().sort((a, b) => (a.status === b.status ? 0 : (a.status === "aberta" ? -1 : 1)) || (a.tipo === b.tipo ? 0 : (a.tipo === "150" ? -1 : 1)) || new Date(a.primeiraVez) - new Date(b.primeiraVez));
    ord.forEach((d, k) => { const r = 5 + k;
      cols.forEach((c, i) => { const cel = ws.getCell(r, i + 1); cel.value = c.f(d); cel.font = {name:FONTE, size:10}; cel.border = borda;
        if(k % 2) cel.fill = fill(ZEBRA); cel.alignment = {vertical:"middle", horizontal:c.centro ? "center" : "left"};
        if(c.moeda) cel.numFmt = MOEDA; if(c.dh) cel.numFmt = DH; if(c.dec) cel.numFmt = "0.0"; if(c.txt) cel.numFmt = "@"; });
      if(d.status === "resolvida") ws.getCell(r, 1).font = {name:FONTE, size:10, bold:true, color:{argb:"FF14633A"}};
      else ws.getCell(r, 1).font = {name:FONTE, size:10, bold:true, color:{argb:"FF" + VERM}};
    });
    const ult = 4 + ord.length, rt = ult + 1, cf = cols.findIndex(c => c.moeda) + 1;
    if(ord.length) ws.autoFilter = {from:{row:4, column:1}, to:{row:ult, column:n}};
    for(let c = 1; c <= n; c++){ const cel = ws.getCell(rt, c); cel.fill = fill(GOLD); cel.border = borda; cel.font = {name:FONTE, size:10, bold:true, color:{argb:"FF" + NAVY}}; }
    ws.getCell(rt, 1).value = "TOTAL";
    ws.getCell(rt, 5).value = ord.length ? {formula:`SUBTOTAL(103,E5:E${ult})`, result:ord.length} : 0;
    ws.getCell(rt, cf).value = ord.length ? {formula:`SUBTOTAL(109,${letra(cf)}5:${letra(cf)}${ult})`, result:0} : 0; ws.getCell(rt, cf).numFmt = MOEDA;
    ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
  }

  function montar(ExcelJSlib, lista, ag, quando, filtroTxt){
    const wb = new ExcelJSlib.Workbook(); wb.creator = "Painel Tambasa"; wb.created = quando || new Date(); wb.calcProperties = {fullCalcOnLoad:true};
    const dia = (quando || new Date()).toLocaleDateString("pt-BR"), tabela = ag.tabela;
    const subBase = `Pendências que o SAC resolve (69 + 150 SAC/Ambos)  •  posição de ${dia}${filtroTxt ? "  •  " + filtroTxt : ""}`;
    const usados = new Set(["por focal", "por unidade", "códigos 150", "todos"]);
    abaResumo(wb, "POR FOCAL", "SLA ACOMPANHAMENTO — PENDÊNCIA SAC POR FOCAL", subBase, ag.porFocal, false, GOLD);
    abaResumo(wb, "POR UNIDADE", "SLA ACOMPANHAMENTO — PENDÊNCIA SAC POR UNIDADE", subBase, ag.porUnidade, true, GOLD);

    // abas por focal: só o que é do SAC (69 + 150 SAC/Ambos); o resto fica na aba TODOS
    ag.porFocal.filter(g => g.totalSac > 0).forEach(g => {
      const itens = lista.filter(d => (d.focal || "Sem focal definido") === g.chave && slaEhSac(slaClasse(d, tabela)));
      abaDetalhe(wb, nomeAba(g.chave, usados), "SLA ACOMPANHAMENTO — " + g.chave,
        `${g.chave}  •  ${g.totalSac} pendência(s) SAC  •  ${g.abertas} aberta(s)  •  ${g.resolvidas} resolvida(s)`, itens, tabela, g.semFocal ? VERM : NAVY);
    });
    abaDetalhe(wb, "TODOS", "SLA ACOMPANHAMENTO — TODAS AS PENDÊNCIAS (inclui Filial e A definir)", `${lista.length} registro(s)  •  filtre por Status, Quem resolve ou Focal`, lista, tabela, "6B7286");

    // códigos usados (transparência da classificação)
    const wc = wb.addWorksheet("CÓDIGOS 150", {views:[{showGridLines:false}]}); wc.properties.tabColor = {argb:"FF6B7286"};
    faixa(wc, 1, 4, "CLASSIFICAÇÃO DOS CÓDIGOS (documentos em atraso 150)", {fundo:NAVY, cor:"FFFFFF", tam:14, altura:30});
    cabecalho(wc, 3, ["Código", "Descrição", "Quem resolve", "Documentos"]);
    [10, 44, 16, 13].forEach((w, i) => wc.getColumn(i + 1).width = w);
    const cont = new Map(); lista.filter(d => d.tipo === "150").forEach(d => { const c = slaNormCod(d.codigo) || "(sem código)"; const g = cont.get(c) || {descr:d.descricao || "", q:0}; g.q++; cont.set(c, g); });
    Array.from(cont.entries()).sort((a, b) => b[1].q - a[1].q).forEach(([cod, g], k) => {
      const e = tabela[cod]; [cod, g.descr, e && SLA_CLASSES[e.resp] ? SLA_CLASSES[e.resp] : "A definir", g.q].forEach((v, i) => { const c = wc.getCell(4 + k, i + 1); c.value = v; c.border = borda; c.font = {name:FONTE, size:10}; c.alignment = {horizontal:i === 1 ? "left" : "center"}; });
    });
    return wb;
  }

  async function exportar(){
    const lista = slaFiltrados();
    if(!lista.length){ alert("Importe os relatórios (VAL e/ou RVA) antes de exportar o SLA Acompanhamento."); return; }
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregada. Verifique a conexão e recarregue a página."); return; }
    const de = (document.getElementById("slaDe") || {}).value, ate = (document.getElementById("slaAte") || {}).value;
    const filtro = (de || ate) ? `Pendências que apareceram ${de ? "de " + de.split("-").reverse().join("/") : ""} ${ate ? "até " + ate.split("-").reverse().join("/") : ""}`.trim() : "";
    const wb = montar(ExcelJS, lista, slaAgregar(lista), new Date(), filtro);
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    a.download = `SLA_Acompanhamento_${typeof dataParaArquivo === "function" ? dataParaArquivo() : new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  root.slaExportarExcel = exportar;
  root.__slaMontarXlsx = montar;   // usado nos testes
})(typeof window !== "undefined" ? window : globalThis);
