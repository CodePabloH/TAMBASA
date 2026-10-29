/* =====================================================================
   COMPARAÇÃO POR UNIDADE — mês x mês, por Unidade (Visão operacional).  (v2)
   Aba INDEPENDENTE: guarda os próprios dados (chave valle_cmpunid_v2) e não altera nenhuma outra tela.

   Cada mês precisa de 2 tipos de planilha, e cada tipo é importado para os DOIS sistemas
   (VAL = Rede Do Valle, RVA = Real Vale) — igual ao Fechamento-RECEITA e à Performance Geral:

   1) FRETE / CT-e / VOLUMES / PESO  ->  planilha 455 "CTRCs expedidos e recebidos" (.csv / .sswweb com ";"),
      MESMO arquivo do Fechamento-RECEITA (Importação Geral).
        Unidade   = coluna "Unidade Receptora" (3 primeiras letras: GNAP/GNAI viram GNA)
        Frete     = "Valor do Frete"        Peso    = "Peso Real em Kg"
        Volumes   = "Quantidade de Volumes"  CT-e    = 1 por CTRC
        Dia       = "Data de Autorizacao" (o mês vem das datas — o arquivo pode ter qualquer período)
      Cancelados (Data do Cancelamento) e CTRC repetido no mesmo arquivo não contam; linha sem frete e sem
      mercadoria também não conta (igual ao Fechamento-RECEITA, para os números baterem).
      Os números ficam guardados DIA A DIA — reimportar um período substitui só os dias dele, naquele sistema.

   2) PERFORMANCE  ->  relatório 084 "Performance de Entregas", MESMO modelo da Performance Geral:
      lê a unidade na seção RESUMO (última página). O mês vem do "MES: MM/AA" do relatório.
      Performance = No prazo ÷ (Entregues − Atraso cliente) — a mesma fórmula do SSW / Performance Geral.
      Com VAL + RVA, somam-se as contagens das duas e a % é recalculada (nunca média de %).
   ===================================================================== */
(function(){
  "use strict";

  const KEY = "valle_cmpunid_v2", KEY_V1 = "valle_cmpunid_v1";
  const SIS = ["VAL", "RVA"];
  // Unidades da Rede Do Valle (as 17 siglas usadas nos filtros e nas exportações).
  const UN_VALLE = ["ITA","STZ","CRI","RUB","ANP","JAR","GAN","RIA","URU","NIQ","PIR","ROT","GNA","GYN","ALE","LZI","CRT"];
  // Parceiras do grupo G5 (mesma lista da aba Indenização). Dá para editar na janela de exportação.
  const UN_G5 = ["AL2","EGO","CMG","CW3","IVC","NWF","RIT","SPR","TLC","TNG","TOP","USE","ALF","EPD","FAV"];
  const NOME_SIS = {VAL:"Rede Do Valle", RVA:"Real Vale"};
  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const CAMPOS_PERF = ["exped","entregue","noPrazoEnt","atrasCli","atrasTrans","abertoNoPrazo","abertoAtrasado"];

  function padrao(){ return {dias:{}, perf:{}, cfg:{a:"", b:"", mesmoPeriodo:true, limite:5, quedaPerf:1, sis:"GERAL", aba:"dash", ocultos:[], busca:"", fStatus:"", fAlerta:"", g5:UN_G5.slice(), expSel:[], selUn:[]}}; }
  const chaveUn = s => String(s || "").trim().toUpperCase().slice(0, 3);

  // Versão 1 guardava dia → unidade (sem sistema). Os dados antigos entram como VAL.
  function migrarV1(){
    try{
      const o = JSON.parse(LS.getItem(KEY_V1) || "null");
      if(!o || !o.dias) return null;
      const n = padrao();
      Object.keys(o.dias).forEach(dia => {
        const v = {};
        Object.keys(o.dias[dia]).forEach(u => {
          const k = chaveUn(u), x = o.dias[dia][u], t = v[k] || (v[k] = {c:0, f:0, p:0, v:0});
          t.c += x.c; t.f += x.f; t.p += x.p; t.v += x.v;
        });
        n.dias[dia] = {VAL: v};
      });
      const c = o.cfg || {};
      n.cfg = Object.assign(n.cfg, {a:c.a || "", b:c.b || "", mesmoPeriodo:c.mesmoPeriodo !== false, limite:c.limite == null ? 5 : c.limite, quedaPerf:c.quedaPerf == null ? 1 : c.quedaPerf});
      return n;
    }catch(e){ return null; }
  }
  function carregar(){
    try{
      const o = JSON.parse(LS.getItem(KEY) || "null");
      if(o && o.dias){ const p = padrao(); return {dias:o.dias, perf:o.perf || {}, cfg:Object.assign(p.cfg, o.cfg || {})}; }
    }catch(e){}
    return migrarV1() || padrao();
  }
  let D = carregar();
  function salvar(){ try{ LS.setItem(KEY, JSON.stringify(D)); }catch(e){ alert("Não foi possível salvar no navegador (espaço cheio)."); } }

  let ordem = {k:"fB", dir:-1};
  let msg = null;
  let impAberto = null;      // null = automático (aberto se ainda não há dados)

  /* ---------------- util ---------------- */
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])));
  function num(s){
    s = String(s == null ? "" : s).replace(/\s/g, "");
    if(!s) return 0;
    if(s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  const f0 = n => Math.round(n).toLocaleString("pt-BR");
  const f1 = n => n.toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1});
  const f2 = n => n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  const brl = n => "R$ " + f2(n);
  const pct1 = n => f1(n) + "%";
  const sinal = (txt, n) => (n > 0 ? "+" : "") + txt;
  function rotMes(m){ const [a, b] = m.split("-"); return MESES[+b - 1] + "/" + a.slice(2); }
  function diasNoMes(m){ const [a, b] = m.split("-").map(Number); return new Date(a, b, 0).getDate(); }
  function iso(dd, mm, aa){ aa = +aa; if(aa < 100) aa += 2000; return aa + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0"); }
  const ddmm = d => d.slice(8) + "/" + d.slice(5, 7);
  function nomeSis(s){ return s === "GERAL" ? "VAL + RVA" : s; }
  const listaG5 = () => ((D.cfg.g5 && D.cfg.g5.length) ? D.cfg.g5 : UN_G5).map(chaveUn);
  // Lista de unidades com caixinha + busca (usada na tela e na janela de exportação)
  function infoUnidades(rs){
    const g5 = listaG5(), tem = new Set(rs.map(r => r.u)), out = [];
    const add = (u, grp) => { if(!out.some(x => x.u === u)) out.push({u, grp, off: !tem.has(u)}); };
    UN_VALLE.forEach(u => add(u, "Valle")); g5.forEach(u => add(u, "G5"));
    [...tem].sort().forEach(u => add(u, "Outras"));
    return out;
  }
  const termos = t => String(t || "").toUpperCase().split(/[\s;,]+/).filter(Boolean);
  function checklistHTML(units, sel, termo){
    const t = termos(termo), vis = units.filter(x => !t.length || t.some(k => x.u.indexOf(k) >= 0));
    if(!vis.length) return `<div class="cu-ckvz">Nenhuma unidade encontrada.</div>`;
    return ["Valle", "G5", "Outras"].map(g => {
      const l = vis.filter(x => x.grp === g); if(!l.length) return "";
      return `<div class="cu-ckg">${g === "Valle" ? "Unidades do Valle" : g === "G5" ? "Grupo G5" : "Outras unidades"}</div>`
        + l.map(x => `<label class="cu-ck ${x.off ? "off" : ""}"><input type="checkbox" data-ck="${esc(x.u)}" ${sel.has(x.u) ? "checked" : ""} ${x.off ? "disabled" : ""}><span>${esc(x.u)}</span>${x.off ? "<em>sem dados</em>" : ""}</label>`).join("");
    }).join("");
  }
  const visiveisCk = (units, termo) => { const t = termos(termo); return units.filter(x => !x.off && (!t.length || t.some(k => x.u.indexOf(k) >= 0))).map(x => x.u); };
  const subUn = (rs, lista) => rs.filter(r => lista.indexOf(r.u) >= 0);
  const txtLista = l => l.length > 18 ? l.slice(0, 18).join(", ") + " … (+" + (l.length - 18) + ")" : l.join(", ");

  // Performance do SSW: No prazo ÷ (Entregues − Atraso cliente); quociente em 2 casas e exibido em 1 casa.
  function calcPerf(c){
    if(!c) return null;
    const den = c.entregue - c.atrasCli;
    if(den > 0){
      const r2 = Math.round((c.noPrazoEnt / den) * 100 * 100) / 100;
      return Math.round(r2 * 10 + 1e-9) / 10;
    }
    return c.entregue > 0 ? 0 : null;
  }
  const zeroPerf = () => ({exped:0, entregue:0, noPrazoEnt:0, atrasCli:0, atrasTrans:0, abertoNoPrazo:0, abertoAtrasado:0});
  function somaPerf(dest, o){ CAMPOS_PERF.forEach(k => dest[k] += (o[k] || 0)); return dest; }

  /* ---------------- leitura ---------------- */
  function lerTexto(buf){
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(buf); }catch(e){}
    try{ return new TextDecoder("windows-1252").decode(buf); }catch(e){ return new TextDecoder("latin1").decode(buf); }
  }
  function normaliza(s){ return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }

  // Planilha 455 (CTRCs expedidos e recebidos, CSV ";"): frete, CT-e, peso e volumes por dia e por unidade.
  function lerSSW(texto, nome){
    const linhas = texto.split(/\r?\n/);
    let cab = null, per = "";
    const dados = [];
    for(const ln of linhas){
      if(!ln) continue;
      const c = ln.split(";");
      if(c[0] === "0") per = c[3] || "";
      else if(c[0] === "1") cab = c;
      else if(c[0] === "2") dados.push(c);
    }
    if(!cab){
      if(/^\s*TP\s+CTRC/m.test(texto)) throw new Error("este é o relatório em colunas fixas (.sswweb). Exporte a planilha 455 em CSV (com \";\"), a mesma usada na Importação Geral do Fechamento-RECEITA.");
      throw new Error("não achei a linha de cabeçalho. Este é o arquivo da planilha 455 \"CTRCs expedidos e recebidos\"?");
    }
    const ix = {}; cab.forEach((n, i) => ix[normaliza(n)] = i);
    const need = ["unidade receptora", "valor do frete", "data de autorizacao"];
    const falta = need.filter(n => ix[n] == null);
    if(falta.length) throw new Error("faltam colunas no arquivo: " + falta.join(", "));
    const iCan = ix["data do cancelamento"], iCt = ix["serie/numero ctrc"], iMerc = ix["valor da mercadoria"];
    const iPeso = ix["peso real em kg"], iVol = ix["quantidade de volumes"], iExp = ix["praca expedidora"];
    const dias = {}, vistos = new Set();
    let lidos = 0, cancel = 0, dup = 0, semData = 0, semUnid = 0, zerados = 0;
    for(const c of dados){
      lidos++;
      if(iCan != null && (c[iCan] || "").trim()){ cancel++; continue; }
      const chave = iCt != null ? (c[iCt] || "").trim() : "";
      if(chave){ if(vistos.has(chave)){ dup++; continue; } vistos.add(chave); }
      const m = /(\d{2})\/(\d{2})\/(\d{2,4})/.exec(c[ix["data de autorizacao"]] || "");
      if(!m){ semData++; continue; }
      const frete = num(c[ix["valor do frete"]]), merc = iMerc != null ? num(c[iMerc]) : 0;
      if(!frete && !merc){ zerados++; continue; }                 // igual ao Fechamento-RECEITA
      const un = chaveUn(c[ix["unidade receptora"]]) || (iExp != null ? chaveUn(c[iExp]) : "");
      if(!un){ semUnid++; continue; }
      const dia = iso(m[1], m[2], m[3]);
      const d = dias[dia] || (dias[dia] = {});
      const u = d[un] || (d[un] = {c:0, f:0, p:0, v:0});
      u.c++; u.f += frete; u.p += iPeso != null ? num(c[iPeso]) : 0; u.v += iVol != null ? num(c[iVol]) : 0;
    }
    return {nome, periodo: per.trim(), dias, lidos, cancel, dup, semData, semUnid, zerados, semVol: iVol == null, semPeso: iPeso == null};
  }

  // Mês do relatório 084: "MES: 09/26" (ou, na falta, o início do "PERIODO EMISSAO: dd/mm/aa A ...").
  function mesDoRelatorio(texto, periodoLido){
    let m = /(\d{1,2})\/(\d{2,4})\s*$/.exec(String(periodoLido || "").trim());
    if(m){ const a = +m[2] < 100 ? 2000 + +m[2] : +m[2]; return a + "-" + String(m[1]).padStart(2, "0"); }
    m = /PERIODO EMISSAO:\s*(\d{2})\/(\d{2})\/(\d{2,4})/i.exec(texto);
    if(m){ const a = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return a + "-" + m[2]; }
    return "";
  }

  // Relatório 084 — usa o MESMO leitor da Performance Geral (seção RESUMO, uma linha por unidade).
  function lerPerformance(texto, nome, mesManual){
    if(typeof parseSswResumoGeral !== "function") throw new Error("leitor da Performance Geral não carregou (recarregue a página).");
    const p = parseSswResumoGeral(texto);
    if(!p.encontrouResumo) throw new Error("não encontrei a seção RESUMO (última página). Confira se é o relatório 084 - Performance de Entregas completo.");
    if(!p.rows.length) throw new Error("não encontrei linhas de unidade na seção RESUMO.");
    const mes = mesDoRelatorio(texto, p.periodo) || mesManual || "";
    if(!mes) throw new Error("o arquivo não informa o mês. Preencha \"Mês do arquivo\" e importe de novo.");
    const un = {};
    p.rows.forEach(r => { const k = chaveUn(r.sigla); somaPerf(un[k] || (un[k] = zeroPerf()), r); });
    return {nome, mes, periodo: p.periodo, un, linhas: p.rows.length};
  }

  function aplicarFrete(r, sis){
    Object.keys(r.dias).forEach(dia => {
      Object.keys(r.dias[dia]).forEach(u => { const x = r.dias[dia][u]; x.f = Math.round(x.f * 100) / 100; x.p = Math.round(x.p * 1000) / 1000; });
      (D.dias[dia] = D.dias[dia] || {})[sis] = r.dias[dia];       // reimportar substitui os dias, só naquele sistema
    });
    escolherMeses();
    salvar();
  }
  function aplicarPerf(r, sis){
    const m = (D.perf[r.mes] = D.perf[r.mes] || {});
    const s = (m[sis] = m[sis] || {});
    Object.keys(r.un).forEach(u => { s[u] = r.un[u]; });           // upsert por unidade
    escolherMeses();
    salvar();
  }
  function escolherMeses(){
    const ms = meses(), c = D.cfg;
    const ok = m => m && ms.indexOf(m) >= 0;
    // escolha do usuário é mantida; se faltar um dos meses (ou forem iguais), valem os dois últimos meses importados
    if(ok(c.a) && ok(c.b) && c.a !== c.b) return;
    c.b = ms[ms.length - 1] || "";
    c.a = ms.length > 1 ? ms[ms.length - 2] : "";
  }

  /* ---------------- agregação ---------------- */
  function meses(){
    const s = new Set(Object.keys(D.dias).map(d => d.slice(0, 7)));
    Object.keys(D.perf).forEach(m => s.add(m));
    return [...s].sort();
  }
  function diasDoMes(m, sis){
    return Object.keys(D.dias).filter(d => d.startsWith(m) && (!sis || (D.dias[d][sis] && Object.keys(D.dias[d][sis]).length))).sort();
  }
  const listaSis = sel => sel === "VAL" || sel === "RVA" ? [sel] : SIS;

  function agregar(m, ate, sel){
    const out = {};
    diasDoMes(m).forEach(dia => {
      if(ate && +dia.slice(8) > ate) return;
      listaSis(sel).forEach(s => {
        const d = D.dias[dia][s]; if(!d) return;
        Object.keys(d).forEach(u => {
          const o = out[u] || (out[u] = {c:0, f:0, p:0, v:0});
          o.c += d[u].c; o.f += d[u].f; o.p += d[u].p; o.v += d[u].v;
        });
      });
    });
    return out;
  }
  function agregarPerf(m, sel){
    const out = {};
    listaSis(sel).forEach(s => {
      const o = (D.perf[m] || {})[s]; if(!o) return;
      Object.keys(o).forEach(u => somaPerf(out[u] || (out[u] = zeroPerf()), o[u]));
    });
    return out;
  }

  function contexto(){
    const a = D.cfg.a, b = D.cfg.b, sel = D.cfg.sis;
    if(!a || !b) return null;
    // mês parcial: usa os dias do sistema(s) escolhido(s)
    const dB = [...new Set(listaSis(sel).flatMap(s => diasDoMes(b, s)))].sort();
    const ultB = dB.length ? +dB[dB.length - 1].slice(8) : 0;
    const parcialB = ultB > 0 && (ultB < diasNoMes(b) || dB.length < ultB);
    const corte = (D.cfg.mesmoPeriodo && parcialB) ? ultB : 0;
    const A = agregar(a, corte, sel), B = agregar(b, 0, sel);
    const PA = agregarPerf(a, sel), PB = agregarPerf(b, sel);
    const un = [...new Set([...Object.keys(A), ...Object.keys(B), ...Object.keys(PA), ...Object.keys(PB)])];
    const z = {c:0, f:0, p:0, v:0};
    const linhas = un.map(u => {
      const x = A[u] || z, y = B[u] || z;
      return {u, cA:x.c, cB:y.c, fA:x.f, fB:y.f, pA:x.p, pB:y.p, vA:x.v, vB:y.v,
        ctA: PA[u] || null, ctB: PB[u] || null, perfA: calcPerf(PA[u]), perfB: calcPerf(PB[u])};
    });
    return {a, b, sel, corte, ultB, parcialB, linhas, diasB: dB.length,
      temFrete: Object.keys(A).length + Object.keys(B).length > 0, temPerf: Object.keys(PA).length + Object.keys(PB).length > 0,
      faltaPerfA: !Object.keys(PA).length, faltaPerfB: !Object.keys(PB).length,
      faltaFreteA: !Object.keys(A).length, faltaFreteB: !Object.keys(B).length};
  }

  function derivar(l){
    const r = Object.assign({}, l);
    r.dF = l.fB - l.fA; r.pctF = l.fA ? (r.dF / l.fA) * 100 : null;
    r.dC = l.cB - l.cA;
    r.pesoTot = l.pA + l.pB; r.dP = l.pB - l.pA;
    r.rcA = l.cA ? l.fA / l.cA : null; r.rcB = l.cB ? l.fB / l.cB : null;
    r.dRc = (r.rcA != null && r.rcB != null) ? r.rcB - r.rcA : null;
    r.dV = l.vB - l.vA;
    r.dPerf = (l.perfA != null && l.perfB != null) ? Math.round((l.perfB - l.perfA) * 10) / 10 : null;
    const lim = +D.cfg.limite || 5;
    r.status = !l.fA && l.fB ? "Novo" : (l.fA && !l.fB ? "Sem movimento" : r.pctF == null ? "—" : r.pctF >= lim ? "Em alta" : r.pctF <= -lim ? "Em queda" : "Estável");
    const q = +D.cfg.quedaPerf || 1;
    r.alerta = r.dPerf == null ? "—" : r.dPerf <= -q ? "Queda" : r.dPerf >= q ? "Melhora" : "Estável";
    return r;
  }

  /* ======================================================================
     TELA  (v3): barra de filtros (meses / sistema) + 3 abas: Dashboard · Tabela comparativa · Importar
     ====================================================================== */
  const COLS = [
    {k:"u", t:"Unidade", g:"", txt:1},
    {k:"fA", t:"A", g:"Frete", f:brl},
    {k:"fB", t:"B", g:"Frete", f:brl},
    {k:"dF", t:"Δ R$", g:"Frete", f:brl, v:1},
    {k:"pctF", t:"Δ %", g:"Frete", f:n => f2(n) + "%", v:1},
    {k:"cA", t:"A", g:"CT-e", f:f0},
    {k:"cB", t:"B", g:"CT-e", f:f0},
    {k:"dC", t:"Δ", g:"CT-e", f:f0, v:1},
    {k:"pA", t:"A (kg)", g:"Peso", f:f0},
    {k:"pB", t:"B (kg)", g:"Peso", f:f0},
    {k:"pesoTot", t:"Total (kg)", g:"Peso", f:f0},
    {k:"dP", t:"Δ (kg)", g:"Peso", f:f0, v:1},
    {k:"rcA", t:"A", g:"R$ / CT-e", f:brl},
    {k:"rcB", t:"B", g:"R$ / CT-e", f:brl},
    {k:"dRc", t:"Δ", g:"R$ / CT-e", f:brl, v:1},
    {k:"vA", t:"A", g:"Volumes", f:f0},
    {k:"vB", t:"B", g:"Volumes", f:f0},
    {k:"dV", t:"Δ", g:"Volumes", f:f0, v:1},
    {k:"perfA", t:"A", g:"Performance", f:pct1},
    {k:"perfB", t:"B", g:"Performance", f:pct1},
    {k:"dPerf", t:"Δ p.p.", g:"Performance", f:n => f1(n), v:1},
    {k:"status", t:"Status do frete", g:"", st:1},
    {k:"alerta", t:"Alerta de performance", g:"", st:1}
  ];
  const GRUPOS = ["Frete", "CT-e", "Peso", "R$ / CT-e", "Volumes", "Performance"];
  const visiveis = () => COLS.filter(c => !c.g || (D.cfg.ocultos || []).indexOf(c.g) < 0);

  function cel(col, r){
    const val = r[col.k];
    if(col.st){
      const cls = {"Em alta":"up","Em queda":"dn","Estável":"eq","Novo":"up","Sem movimento":"dn","Queda":"dn","Melhora":"up"}[val] || "na";
      return `<td class="cu-st"><span class="cu-tag ${cls}">${esc(val)}</span></td>`;
    }
    if(col.txt) return `<td class="cu-u">${esc(val)}</td>`;
    if(val == null || (typeof val === "number" && !isFinite(val))) return `<td class="cu-n cu-na">—</td>`;
    let cls = "cu-n";
    if(col.v){ cls += val > 0.0001 ? " cu-pos" : val < -0.0001 ? " cu-neg" : " cu-zero"; }
    return `<td class="${cls}">${col.v ? sinal(col.f(val), val) : col.f(val)}</td>`;
  }

  function totalLinha(rs){
    const t = {u:"TOTAL", cA:0, cB:0, fA:0, fB:0, pA:0, pB:0, vA:0, vB:0, ctA:zeroPerf(), ctB:zeroPerf()};
    let temA = false, temB = false;
    rs.forEach(r => {
      t.cA += r.cA; t.cB += r.cB; t.fA += r.fA; t.fB += r.fB; t.pA += r.pA; t.pB += r.pB; t.vA += r.vA; t.vB += r.vB;
      if(r.ctA){ somaPerf(t.ctA, r.ctA); temA = true; }
      if(r.ctB){ somaPerf(t.ctB, r.ctB); temB = true; }
    });
    // performance do total: soma das contagens das unidades e recálculo (nunca média de %)
    t.perfA = temA ? calcPerf(t.ctA) : null; t.perfB = temB ? calcPerf(t.ctB) : null;
    return derivar(t);
  }

  function ordenar(rs){
    const ord = ordem;
    return rs.slice().sort((x, y) => {
      const a = x[ord.k], b = y[ord.k];
      if(typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b), "pt-BR") * ord.dir;
      return ((a == null ? -Infinity : a) - (b == null ? -Infinity : b)) * ord.dir;
    });
  }

  /* ---------- dados do dashboard (os mesmos para tela e PDF) ---------- */
  function dadosDash(rs, T){
    const comPerf = rs.filter(r => r.perfA != null && r.perfB != null);
    const cont = {"Em alta":0, "Estável":0, "Em queda":0, "Novo":0, "Sem movimento":0};
    rs.forEach(r => { if(cont[r.status] != null) cont[r.status]++; });
    const totB = T.fB || 0;
    const porB = rs.filter(r => r.fB > 0).sort((a, b) => b.fB - a.fB);
    const top = porB.slice(0, 6).map(r => ({n:r.u, v:r.fB, p: totB ? r.fB / totB * 100 : 0}));
    const resto = porB.slice(6).reduce((s, r) => s + r.fB, 0);
    if(resto > 0) top.push({n:"Outras (" + (porB.length - 6) + ")", v:resto, p: totB ? resto / totB * 100 : 0});
    return {
      topFrete: rs.filter(r => r.fA || r.fB).sort((a, b) => Math.max(b.fA, b.fB) - Math.max(a.fA, a.fB)).slice(0, 10),
      altas: rs.filter(r => r.dF > 0).sort((a, b) => b.dF - a.dF).slice(0, 5),
      quedas: rs.filter(r => r.dF < 0).sort((a, b) => a.dF - b.dF).slice(0, 5),
      perf: comPerf.slice().sort((a, b) => a.dPerf - b.dPerf).slice(0, 12),
      nPerf: comPerf.length,
      alertPerf: rs.filter(r => r.alerta === "Queda").sort((a, b) => a.dPerf - b.dPerf),
      alertFrete: rs.filter(r => r.status === "Em queda" || r.status === "Sem movimento").sort((a, b) => a.dF - b.dF),
      cont, share: top
    };
  }

  /* ---------- peças visuais ---------- */
  const chip = (d, txt) => `<span class="cu-chip ${d > 0.0001 ? "up" : d < -0.0001 ? "dn" : "eq"}">${txt}</span>`;

  function kpiCard(tit, a, b, d, p, f, ctx, unidade){
    const dd = d == null ? null : d;
    return `<div class="cu-kpi"><div class="cu-kt">${tit}</div><div class="cu-kv">${b == null ? "—" : f(b)}</div>
      <div class="cu-kfoot"><span class="cu-ks">${rotMes(ctx.a)}: ${a == null ? "—" : f(a)}</span>${dd == null ? "" : chip(dd, sinal(unidade ? f1(dd) + " p.p." : f(dd), dd) + (p != null ? " · " + sinal(f1(p) + "%", p) : ""))}</div></div>`;
  }
  function kpisHTML(T, ctx){
    const pc = (a, b) => a ? ((b - a) / a) * 100 : null;
    return `<div class="cu-kpis">`
      + kpiCard("Frete total", T.fA, T.fB, T.dF, T.pctF, brl, ctx)
      + kpiCard("CT-e", T.cA, T.cB, T.dC, pc(T.cA, T.cB), f0, ctx)
      + kpiCard("Volumes", T.vA, T.vB, T.dV, pc(T.vA, T.vB), f0, ctx)
      + kpiCard("Peso (kg)", T.pA, T.pB, T.dP, pc(T.pA, T.pB), f0, ctx)
      + kpiCard("R$ / CT-e", T.rcA || 0, T.rcB || 0, T.dRc || 0, pc(T.rcA, T.rcB), brl, ctx)
      + kpiCard("Performance", T.perfA, T.perfB, T.dPerf, null, pct1, ctx, true)
      + `</div>`;
  }

  function barrasPar(items, nA, nB, get, fmt, max, extra){
    const mx = max || Math.max(1e-9, ...items.map(i => Math.max(get(i)[0] || 0, get(i)[1] || 0)));
    const bar = (v, c) => v == null ? `<div class="cu-bt"><i class="${c}" style="width:0"></i><span class="cu-na">—</span></div>` : `<div class="cu-bt"><i class="${c}" style="width:${Math.max(0.6, v / mx * 100)}%"></i><span>${fmt(v)}</span></div>`;
    return `<div class="cu-bp"><div class="cu-leg"><span><i class="a"></i>${esc(nA)}</span><span><i class="b"></i>${esc(nB)}</span></div>`
      + items.map(i => { const [a, b] = get(i); return `<div class="cu-bp-r" data-u="${esc(i.u)}"><div class="cu-bp-n">${esc(i.u)}</div><div class="cu-bp-b">${bar(a, "a")}${bar(b, "b")}</div>${extra ? extra(i) : ""}</div>`; }).join("") + `</div>`;
  }
  function barrasDelta(items, get, fmt, neg){
    const mx = Math.max(1e-9, ...items.map(i => Math.abs(get(i))));
    if(!items.length) return `<div class="cu-vazio-s">Nenhuma unidade.</div>`;
    return `<div class="cu-bd">` + items.map(i => { const v = get(i); return `<div class="cu-bd-r"><div class="cu-bp-n">${esc(i.u)}</div><div class="cu-bd-t"><i class="${neg ? "dn" : "up"}" style="width:${Math.max(1, Math.abs(v) / mx * 100)}%"></i></div><div class="cu-bd-v ${neg ? "cu-neg" : "cu-pos"}">${sinal(fmt(v), v)}</div></div>`; }).join("") + `</div>`;
  }

  function dashboardHTML(ctx, rs, T){
    const d = dadosDash(rs, T), nA = rotMes(ctx.a), nB = rotMes(ctx.b);
    const lim = +D.cfg.limite || 5, q = +D.cfg.quedaPerf || 1;
    const card = (tit, sub, corpo, cls) => `<section class="cu-card ${cls || ""}"><header><b>${tit}</b>${sub ? `<span>${sub}</span>` : ""}</header>${corpo}</section>`;

    const totSt = Object.values(d.cont).reduce((s, x) => s + x, 0) || 1;
    const cores = {"Em alta":"#2f8a2a", "Estável":"#9aa593", "Em queda":"#cf3d35", "Novo":"#4f9d2d", "Sem movimento":"#e0a526"};
    const status = `<div class="cu-stk">${Object.keys(d.cont).filter(k => d.cont[k]).map(k => `<i style="width:${d.cont[k] / totSt * 100}%;background:${cores[k]}" title="${k}: ${d.cont[k]}"></i>`).join("")}</div>
      <div class="cu-stk-l">${Object.keys(d.cont).map(k => `<span><i style="background:${cores[k]}"></i>${k} <b>${d.cont[k]}</b></span>`).join("")}</div>`;

    const alertas = (tit, itens, linha, vazio) => `<div class="cu-al"><div class="cu-al-t">${tit} <b>${itens.length}</b></div>${itens.length ? itens.slice(0, 8).map(linha).join("") : `<div class="cu-vazio-s">${vazio}</div>`}${itens.length > 8 ? `<div class="cu-vazio-s">+ ${itens.length - 8} na tabela</div>` : ""}</div>`;

    const perfCorpo = d.perf.length
      ? barrasPar(d.perf, nA, nB, i => [i.perfA, i.perfB], pct1, 100, i => `<div class="cu-bp-d">${chip(i.dPerf, sinal(f1(i.dPerf), i.dPerf) + " p.p.")}</div>`)
      : `<div class="cu-vazio-s">Sem performance nos dois meses para comparar. Importe o relatório 084 de ${nA} e ${nB}.</div>`;

    return kpisHTML(T, ctx) + `
      <div class="cu-grid">
        ${card("Frete por unidade", `${nA} × ${nB} · 10 maiores`, barrasPar(d.topFrete, nA, nB, i => [i.fA, i.fB], brl), "cu-w6")}
        <div class="cu-col cu-w6">
          ${card("Maiores altas de frete", `${nB} − ${nA}`, barrasDelta(d.altas, i => i.dF, brl, false))}
          ${card("Maiores quedas de frete", `${nB} − ${nA}`, barrasDelta(d.quedas, i => i.dF, brl, true))}
        </div>
        ${card("Performance por unidade", `${nA} × ${nB} · piores variações${d.nPerf > 12 ? " (12 de " + d.nPerf + ")" : ""}`, perfCorpo, "cu-w6")}
        ${card("Alertas", `frete ±${lim}% · performance ±${q} p.p.`,
          alertas("Performance em queda", d.alertPerf, r => `<div class="cu-al-r"><b>${esc(r.u)}</b><span>${pct1(r.perfA)} → ${pct1(r.perfB)}</span>${chip(r.dPerf, sinal(f1(r.dPerf), r.dPerf) + " p.p.")}</div>`, "Nenhuma unidade caiu além do limite.")
          + alertas("Frete em queda", d.alertFrete, r => `<div class="cu-al-r"><b>${esc(r.u)}</b><span>${r.status === "Sem movimento" ? "sem movimento em " + nB : sinal(f1(r.pctF) + "%", r.pctF)}</span>${chip(r.dF, sinal(brl(r.dF), r.dF))}</div>`, "Nenhuma unidade em queda."), "cu-w6")}
        ${card("Status do frete", `${rs.length} unidade(s)`, status, "cu-w6")}
        ${card("Participação no frete", `${nB}`, `<div class="cu-bd">` + d.share.map(i => `<div class="cu-bd-r"><div class="cu-bp-n">${esc(i.n)}</div><div class="cu-bd-t"><i class="up" style="width:${Math.max(1, i.p)}%"></i></div><div class="cu-bd-v">${f1(i.p)}%</div></div>`).join("") + `</div>`, "cu-w6")}
      </div>`;
  }

  /* ---------- tabela ---------- */
  function filtrarLinhas(rs){
    const t = (D.cfg.busca || "").trim().toUpperCase().split(/[;, ]+/).filter(Boolean);
    const su = D.cfg.selUn || [];
    return rs.filter(r => (!su.length || su.indexOf(r.u) >= 0) && (!t.length || t.some(x => r.u.indexOf(x) === 0 || r.u.indexOf(x) >= 0))
      && (!D.cfg.fStatus || r.status === D.cfg.fStatus) && (!D.cfg.fAlerta || r.alerta === D.cfg.fAlerta));
  }
  function tabelaHTML(ctx, rsAll){
    const rsF = ordenar(filtrarLinhas(rsAll));
    const T = totalLinha(rsF), cols = visiveis();
    const ord = ordem, seta = k => ord.k === k ? (ord.dir > 0 ? " ▲" : " ▼") : "";
    const grupos = [];
    cols.forEach(c => { const u = grupos[grupos.length - 1]; if(c.g && u && u.g === c.g) u.n++; else grupos.push({g: c.g || c.t, n:1, solo: !c.g, k: c.k}); });
    const rot = c => c.t === "A" ? rotMes(ctx.a) : c.t === "B" ? rotMes(ctx.b) : c.t === "A (kg)" ? rotMes(ctx.a) + " (kg)" : c.t === "B (kg)" ? rotMes(ctx.b) + " (kg)" : c.t;
    const th1 = grupos.map(g => g.solo
      ? `<th rowspan="2" class="cu-th1 ${g.k === "u" ? "cu-sticky" : ""}" data-ord="${g.k}">${esc(g.g)}${seta(g.k)}</th>`
      : `<th colspan="${g.n}" class="cu-th1 cu-gr">${esc(g.g)}</th>`).join("");
    const th2 = cols.filter(c => c.g).map(c => `<th class="cu-th2" data-ord="${c.k}">${esc(rot(c))}${seta(c.k)}</th>`).join("");
    const corpo = rsF.map(r => `<tr>${cols.map(c => cel(c, r)).join("")}</tr>`).join("")
      || `<tr><td colspan="${cols.length}" class="cu-vazio-s">Nenhuma unidade com esse filtro.</td></tr>`;
    const filtrado = rsF.length !== rsAll.length;
    const tot = `<tr class="cu-tot">${cols.map(c => c.txt ? `<td class="cu-u">${filtrado ? "TOTAL (filtro)" : "TOTAL"}</td>` : cel(c, T)).join("")}</tr>`;
    return {rsF, T, html: `<div class="cu-cont">${rsF.length} de ${rsAll.length} unidade(s)</div>
      <div class="table-wrap cu-wrap"><table class="cu-table"><thead><tr>${th1}</tr><tr>${th2}</tr></thead><tbody>${corpo}${tot}</tbody></table></div>
      <div class="cu-nota">Sistema: <b>${esc(nomeSis(ctx.sel))}</b>. Δ = ${rotMes(ctx.b)} − ${rotMes(ctx.a)}. Frete, CT-e, peso e volumes: planilha 455 por Unidade Receptora (cancelados não entram).
      Performance = No prazo ÷ (Entregues − Atraso cliente), aba RESUMO do 084; no TOTAL somam-se as contagens e a % é recalculada.</div>`};
  }
  function resumoUn(){ const n = (D.cfg.selUn || []).length; return n ? n + " selecionada" + (n > 1 ? "s" : "") : "Todas"; }
  function tabelaToolbar(){
    const c = D.cfg, sel = (id, v, ops) => `<select id="${id}">${ops.map(o => `<option value="${esc(o[0])}" ${v === o[0] ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
    return `<div class="cu-tb">
      <label>Buscar unidade <input type="search" id="cuBusca" placeholder="ex.: GNA; ANP" value="${esc(c.busca || "")}" autocomplete="off"></label>
      <label>Status do frete ${sel("cuFSt", c.fStatus || "", [["", "Todos"], ["Em alta", "Em alta"], ["Estável", "Estável"], ["Em queda", "Em queda"], ["Novo", "Novo"], ["Sem movimento", "Sem movimento"]])}</label>
      <label>Alerta de performance ${sel("cuFAl", c.fAlerta || "", [["", "Todos"], ["Queda", "Queda"], ["Estável", "Estável"], ["Melhora", "Melhora"]])}</label>
      <div class="cu-un"><span class="cu-fl">Unidades</span><details id="cuUnDet"><summary id="cuUnSum">${resumoUn()}</summary><div class="cu-unpop">
        <input type="search" id="cuUnBusca" placeholder="Pesquisar unidade (ex.: ITA)" autocomplete="off">
        <div class="cu-unrap"><button type="button" class="btn btn-sm" data-rap="valle">Só unidades do Valle</button><button type="button" class="btn btn-sm" data-rap="g5">Grupo G5</button><button type="button" class="btn btn-ghost btn-sm" data-rap="todas">Limpar</button></div>
        <div id="cuUnList" class="cu-cklist"></div></div></details></div>
      <div class="cu-gchips"><span>Colunas</span>${GRUPOS.map(g => `<button type="button" class="cu-gc ${(c.ocultos || []).indexOf(g) < 0 ? "on" : ""}" data-g="${esc(g)}">${esc(g)}</button>`).join("")}</div>
    </div>`;
  }

  /* ---------- importar ---------- */
  function resumoImportado(){
    const ms = meses().slice().reverse();
    if(!ms.length) return `<div class="cu-vazio-s">Nada importado ainda.</div>`;
    const celF = (m, s) => {
      const ds = diasDoMes(m, s);
      if(!ds.length) return `<td class="cu-vz">—</td>`;
      let ct = 0; ds.forEach(d => Object.keys(D.dias[d][s]).forEach(u => ct += D.dias[d][s][u].c));
      const ult = ds[ds.length - 1], inteiro = +ult.slice(8) >= diasNoMes(m);
      return `<td class="cu-ok"><b>${f0(ct)}</b> CT-e<br><span class="cu-sub">${inteiro ? "mês completo" : "até " + ddmm(ult)} · ${ds.length} dia(s)</span><button type="button" class="cu-x" data-del="frete" data-m="${m}" data-s="${s}" title="Apagar">✕</button></td>`;
    };
    const celP = (m, s) => {
      const o = (D.perf[m] || {})[s], n = o ? Object.keys(o).length : 0;
      return n ? `<td class="cu-ok"><b>${n}</b> unidade(s)<br><span class="cu-sub">aba RESUMO</span><button type="button" class="cu-x" data-del="perf" data-m="${m}" data-s="${s}" title="Apagar">✕</button></td>` : `<td class="cu-vz">—</td>`;
    };
    return `<div class="table-wrap"><table class="cu-table cu-mini"><thead>
      <tr><th rowspan="2">Mês</th><th colspan="2" class="cu-gr2">Frete · CT-e · Volumes (455)</th><th colspan="2" class="cu-gr2">Performance (084)</th></tr>
      <tr><th>VAL</th><th>RVA</th><th>VAL</th><th>RVA</th></tr></thead><tbody>
      ${ms.map(m => `<tr><td><b>${rotMes(m)}</b></td>${celF(m, "VAL")}${celF(m, "RVA")}${celP(m, "VAL")}${celP(m, "RVA")}</tr>`).join("")}
      </tbody></table></div>`;
  }
  function slot(tipo, s, acc){
    return `<label class="cu-slot" data-tipo="${tipo}" data-sis="${s}"><span class="cu-slot-s">${s}</span><span class="cu-slot-n">${NOME_SIS[s]}</span><span class="cu-slot-h">Clique ou arraste o(s) arquivo(s)</span><input type="file" multiple accept="${acc}" data-imp="${tipo}" data-sis="${s}"></label>`;
  }
  function importarHTML(){
    return `<div class="cu-passos">
        <section class="cu-passo"><header><i>1</i><div><b>Frete, CT-e, volumes e peso</b><span>Planilha 455 "CTRCs expedidos e recebidos" em CSV — a mesma do Fechamento-RECEITA. O mês vem da data de autorização.</span></div></header>
          <div class="cu-slots">${SIS.map(s => slot("frete", s, ".csv,.sswweb,.txt")).join("")}</div></section>
        <section class="cu-passo"><header><i>2</i><div><b>Performance</b><span>Relatório 084 — como na Performance Geral, a unidade vem da aba RESUMO. O mês vem do "MES: MM/AA".</span></div></header>
          <div class="cu-slots">${SIS.map(s => slot("perf", s, ".sswweb,.txt,.csv")).join("")}</div>
          <label class="cu-mesman">Mês do arquivo <small>(só se o relatório não informar)</small> <input type="month" id="cuMesPerf"></label></section>
      </div>
      ${msg ? `<div class="cu-msg ${msg.ok ? "ok" : "err"}">${msg.t}</div>` : ""}
      <section class="cu-card"><header><b>O que já foi importado</b><span>${meses().length} mês(es)</span></header>${resumoImportado()}
        ${meses().length ? `<div class="cu-acoes"><button type="button" class="btn btn-ghost btn-sm" id="cuLimpar">Apagar todos os dados desta aba</button></div>` : ""}</section>`;
  }

  /* ---------- esqueleto ---------- */
  function html(){
    return `<h2 class="section-title">Comparação por Unidade — mês × mês</h2><div id="cuRoot"></div>`;
  }
  function opcoesMes(sel){
    return meses().map(m => `<option value="${m}" ${m === sel ? "selected" : ""}>${rotMes(m)}</option>`).join("");
  }
  function atalhos(){
    const ms = meses(), n = ms.length, out = [];
    if(n >= 2) out.push({t:"Último × anterior", a:ms[n - 2], b:ms[n - 1]});
    const b = ms[n - 1]; if(b){ const aa = (+b.slice(0, 4) - 1) + b.slice(4); if(ms.indexOf(aa) >= 0) out.push({t:"Último × mesmo mês do ano anterior", a:aa, b}); }
    return out;
  }

  let ultimo = null;   // {ctx, rsAll, T} da última renderização (para exportar)

  function render(){
    const root = document.getElementById("cuRoot"); if(!root) return;
    const ms = meses(), ctx = contexto(), c = D.cfg;
    if(["dash", "tabela", "importar"].indexOf(c.aba) < 0) c.aba = "dash";
    if(!ms.length) c.aba = "importar";
    const pronto = !!ctx && c.a !== c.b;
    ultimo = null;

    let h = "";
    if(ms.length){
      const at = atalhos();
      h += `<div class="cu-top">
        <div class="cu-filtro">
          <div class="cu-fg"><span class="cu-fl">Comparar</span>
            <select id="cuA" title="Mês A (base)">${opcoesMes(c.a)}</select><b class="cu-vs">×</b><select id="cuB" title="Mês B (atual)">${opcoesMes(c.b)}</select>
            ${at.map((x, i) => `<button type="button" class="cu-atalho" data-at="${i}">${esc(x.t)}</button>`).join("")}</div>
          <div class="cu-fg"><span class="cu-fl">Sistema</span><div class="cu-seg">
            ${[["GERAL", "VAL + RVA"], ["VAL", "VAL"], ["RVA", "RVA"]].map(s => `<button type="button" data-sis="${s[0]}" class="${c.sis === s[0] ? "on" : ""}">${s[1]}</button>`).join("")}</div></div>
          <label class="cu-chk"><input type="checkbox" id="cuMesmo" ${c.mesmoPeriodo ? "checked" : ""}> Mesmo período (dias 1 a N)</label>
          <details class="cu-ajustes"><summary>Ajustes</summary><div>
            <label>Alta/queda a partir de <input type="number" id="cuLim" value="${c.limite}" min="0" step="1"> %</label>
            <label>Alerta de performance a partir de <input type="number" id="cuQp" value="${c.quedaPerf}" min="0" step="0.5"> p.p.</label></div></details>
          <div class="cu-exp"><button type="button" class="btn btn-sm" id="cuExcel" ${pronto ? "" : "disabled"}>Exportar Excel</button><button type="button" class="btn btn-sm btn-primary" id="cuPdf" ${pronto ? "" : "disabled"}>Exportar PDF</button></div>
        </div></div>`;
    }
    h += `<div class="cu-tabs">${[["dash", "Dashboard"], ["tabela", "Tabela comparativa"], ["importar", "Importar planilhas"]].map(t => `<button type="button" data-aba="${t[0]}" class="${c.aba === t[0] ? "on" : ""}" ${(!ms.length && t[0] !== "importar") ? "disabled" : ""}>${t[1]}</button>`).join("")}</div>`;

    if(c.aba === "importar"){
      h += `<div class="cu-pane">${importarHTML()}</div>`;
      root.innerHTML = h; ligar(); return;
    }

    if(!pronto){
      root.innerHTML = h + `<div class="cu-vazio">Escolha dois meses diferentes (A e B) no filtro acima.</div>`; ligar(); return;
    }

    // avisos
    let av = "";
    if(ctx.parcialB) av += `<div class="cu-aviso">${rotMes(ctx.b)} está <b>parcial</b> (frete até o dia ${ctx.ultB}). ${ctx.corte
      ? `${rotMes(ctx.a)} foi cortado nos mesmos dias (1 a ${ctx.corte}). A performance não é cortada: vale o que o 084 de cada mês trouxe.`
      : `${rotMes(ctx.a)} está inteiro contra o parcial.`}</div>`;
    if(ctx.a > ctx.b) av += `<div class="cu-aviso">O mês A é posterior ao mês B — as variações estão invertidas.</div>`;
    const falta = [];
    if(ctx.faltaFreteA) falta.push(`frete de ${rotMes(ctx.a)}`);
    if(ctx.faltaFreteB) falta.push(`frete de ${rotMes(ctx.b)}`);
    if(ctx.faltaPerfA) falta.push(`performance de ${rotMes(ctx.a)}`);
    if(ctx.faltaPerfB) falta.push(`performance de ${rotMes(ctx.b)}`);
    if(falta.length) av += `<div class="cu-aviso">Sem dados (${esc(nomeSis(ctx.sel))}) para: <b>${falta.join(", ")}</b>. <a href="#" data-aba="importar">Importar agora</a></div>`;

    const rsAll = ctx.linhas.map(derivar), T = totalLinha(rsAll);
    ultimo = {ctx, rsAll, T};
    if(c.aba === "dash") h += av + `<div class="cu-pane">${dashboardHTML(ctx, rsAll, T)}</div>`;
    else { const tb = tabelaHTML(ctx, rsAll); h += av + `<div class="cu-pane">${tabelaToolbar()}<div id="cuTabWrap">${tb.html}</div></div>`; }
    root.innerHTML = h;
    ligar();
  }

  /* ---------- eventos ---------- */
  async function importar(files, tipo, sis){
    const ok = [], err = [];
    const mesManual = (document.getElementById("cuMesPerf") || {}).value || "";
    for(const f of files){
      try{
        const texto = lerTexto(await f.arrayBuffer());
        if(tipo === "frete"){
          const r = lerSSW(texto, f.name);
          if(!Object.keys(r.dias).length) throw new Error("nenhuma linha válida");
          aplicarFrete(r, sis);
          const ms = [...new Set(Object.keys(r.dias).map(d => d.slice(0, 7)))].sort().map(rotMes).join(", ");
          ok.push(`<b>${esc(f.name)}</b> → frete ${sis}: ${f0(r.lidos)} linhas, ${Object.keys(r.dias).length} dia(s) (${ms})`
            + (r.cancel ? `, ${r.cancel} cancelada(s) ignorada(s)` : "") + (r.dup ? `, ${r.dup} duplicada(s) ignorada(s)` : "")
            + (r.semVol ? `. <b>Atenção:</b> sem a coluna "Quantidade de Volumes"` : ""));
        } else {
          const r = lerPerformance(texto, f.name, mesManual);
          aplicarPerf(r, sis);
          ok.push(`<b>${esc(f.name)}</b> → performance ${sis} de ${rotMes(r.mes)}: ${Object.keys(r.un).length} unidade(s) da aba RESUMO`);
        }
      }catch(e){ err.push(`<b>${esc(f.name)}</b>: ${esc(e.message || e)}`); }
    }
    msg = {ok: !err.length, t: [...ok, ...err].join("<br>")};
    D.cfg.aba = "importar";
    render();
  }

  function ligar(){
    const g = id => document.getElementById(id), root = g("cuRoot");
    const q = (s, fn) => root.querySelectorAll(s).forEach(fn);
    q("input[data-imp]", inp => inp.onchange = e => { const fs = [...e.target.files]; if(fs.length) importar(fs, inp.dataset.imp, inp.dataset.sis); });
    q(".cu-slot", l => {
      l.ondragover = e => { e.preventDefault(); l.classList.add("drag"); };
      l.ondragleave = () => l.classList.remove("drag");
      l.ondrop = e => { e.preventDefault(); l.classList.remove("drag"); const fs = [...e.dataTransfer.files]; if(fs.length) importar(fs, l.dataset.tipo, l.dataset.sis); };
    });
    q("[data-aba]", b => b.onclick = e => { e.preventDefault(); D.cfg.aba = b.dataset.aba; salvar(); render(); });
    q("[data-del]", b => b.onclick = () => {
      const {del, m, s} = b.dataset;
      if(!confirm(`Apagar ${del === "frete" ? "o frete" : "a performance"} ${s} de ${rotMes(m)}?`)) return;
      if(del === "frete"){
        Object.keys(D.dias).filter(d => d.startsWith(m)).forEach(d => { delete D.dias[d][s]; if(!Object.keys(D.dias[d]).length) delete D.dias[d]; });
      } else if(D.perf[m]){ delete D.perf[m][s]; if(!Object.keys(D.perf[m]).length) delete D.perf[m]; }
      escolherMeses(); salvar(); msg = null; render();
    });
    if(g("cuLimpar")) g("cuLimpar").onclick = () => { if(confirm("Apagar todos os dados importados desta aba (frete e performance, VAL e RVA)?")){ const cfg = D.cfg; D = padrao(); D.cfg = Object.assign(D.cfg, cfg, {a:"", b:""}); salvar(); msg = null; render(); } };
    if(g("cuA")) g("cuA").onchange = e => { D.cfg.a = e.target.value; salvar(); render(); };
    if(g("cuB")) g("cuB").onchange = e => { D.cfg.b = e.target.value; salvar(); render(); };
    q("[data-at]", b => b.onclick = () => { const x = atalhos()[+b.dataset.at]; D.cfg.a = x.a; D.cfg.b = x.b; salvar(); render(); });
    q(".cu-seg [data-sis]", b => b.onclick = () => { D.cfg.sis = b.dataset.sis; salvar(); render(); });
    if(g("cuMesmo")) g("cuMesmo").onchange = e => { D.cfg.mesmoPeriodo = e.target.checked; salvar(); render(); };
    if(g("cuLim")) g("cuLim").onchange = e => { D.cfg.limite = Math.max(0, +e.target.value || 0); salvar(); render(); };
    if(g("cuQp")) g("cuQp").onchange = e => { D.cfg.quedaPerf = Math.max(0, +e.target.value || 0); salvar(); render(); };
    if(g("cuExcel")) g("cuExcel").onclick = () => ultimo && abrirExport("excel");
    if(g("cuPdf")) g("cuPdf").onclick = () => ultimo && abrirExport("pdf");
    // tabela
    const religaTab = () => {
      q("#cuTabWrap [data-ord]", th => th.onclick = () => {
        const k = th.dataset.ord; ordem = {k, dir: ordem.k === k ? -ordem.dir : (k === "u" || k === "status" || k === "alerta" ? 1 : -1)}; redesenhaTabela();
      });
    };
    const redesenhaTabela = () => { if(!ultimo) return; g("cuTabWrap").innerHTML = tabelaHTML(ultimo.ctx, ultimo.rsAll).html; religaTab(); };
    if(g("cuTabWrap")){
      religaTab();
      const pintaUn = () => {
        const sel = new Set(D.cfg.selUn || []);
        g("cuUnList").innerHTML = checklistHTML(infoUnidades(ultimo.rsAll), sel, g("cuUnBusca").value);
        g("cuUnSum").textContent = resumoUn();
      };
      const aplicaUn = lista => { D.cfg.selUn = lista; salvar(); pintaUn(); redesenhaTabela(); };
      pintaUn();
      g("cuUnBusca").oninput = pintaUn;
      g("cuUnList").onchange = e => {
        const u = e.target.dataset && e.target.dataset.ck; if(!u) return;
        const o = new Set(D.cfg.selUn || []); e.target.checked ? o.add(u) : o.delete(u); aplicaUn([...o]);
      };
      q("[data-rap]", b => b.onclick = () => {
        const k = b.dataset.rap, rs = ultimo.rsAll;
        aplicaUn(k === "valle" ? subUn(rs, UN_VALLE).map(r => r.u) : k === "g5" ? subUn(rs, listaG5()).map(r => r.u) : []);
      });
      let tm = null;
      g("cuBusca").oninput = e => { D.cfg.busca = e.target.value; clearTimeout(tm); tm = setTimeout(() => { salvar(); redesenhaTabela(); }, 150); };
      g("cuFSt").onchange = e => { D.cfg.fStatus = e.target.value; salvar(); redesenhaTabela(); };
      g("cuFAl").onchange = e => { D.cfg.fAlerta = e.target.value; salvar(); redesenhaTabela(); };
      q(".cu-gc", b => b.onclick = () => {
        const o = new Set(D.cfg.ocultos || []); o.has(b.dataset.g) ? o.delete(b.dataset.g) : o.add(b.dataset.g);
        D.cfg.ocultos = [...o]; salvar(); b.classList.toggle("on", !o.has(b.dataset.g)); redesenhaTabela();
      });
    }
    // clicar numa unidade do dashboard abre a tabela filtrada nela
    q(".cu-bp-r[data-u]", r => r.onclick = () => { D.cfg.busca = r.dataset.u; D.cfg.aba = "tabela"; salvar(); render(); });
  }

  /* ---------- janela "O que exportar?" ---------- */
  function abrirExport(tipo){
    if(!ultimo) return;
    const rs = ultimo.rsAll, todas = rs.map(r => r.u), units = infoUnidades(rs);
    const nomeTipo = tipo === "pdf" ? "PDF" : "Excel";
    // se a tabela da tela já está filtrada por caixinhas, a janela começa com essa escolha
    let sel = new Set((D.cfg.selUn || []).filter(u => todas.indexOf(u) >= 0));
    let modo = sel.size ? "custom" : "tudo";
    const ov = document.createElement("div"); ov.className = "cu-modal";
    ov.innerHTML = `<div class="cu-mbox" role="dialog" aria-modal="true">
      <div class="cu-mh"><b>Exportar ${nomeTipo}</b><button type="button" class="cu-mx" data-m="fechar" title="Fechar">✕</button></div>
      <div class="cu-mb">
        <div class="cu-mlbl">O que você quer exportar?</div>
        <div id="cuMModos" class="cu-opts"></div>
        <div id="cuMCustom" class="cu-mcustom" hidden>
          <input type="search" id="cuMBusca" placeholder="Pesquisar unidade (ex.: ITA)" autocomplete="off">
          <div class="cu-ckbar"><a href="#" data-ca="vis">marcar as que aparecem</a><a href="#" data-ca="none">limpar</a><span id="cuMCont"></span></div>
          <div id="cuMList" class="cu-cklist cu-cklist-m"></div>
        </div>
        <div class="cu-minfo" id="cuMInfo"></div>
        <details class="cu-mg5"><summary>Editar siglas do Grupo G5</summary>
          <input type="text" id="cuMG5" autocomplete="off"><small>Vale para o atalho "Grupo G5" e para a tabela do G5 no PDF/Excel.</small></details>
      </div>
      <div class="cu-mf"><button type="button" class="btn btn-ghost btn-sm" data-m="fechar">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" id="cuMOk" data-m="ok">Exportar ${nomeTipo}</button></div></div>`;
    document.body.appendChild(ov);
    const $ = id => ov.querySelector("#" + id);
    const parse = txt => String(txt || "").toUpperCase().split(/[\s;,]+/).filter(Boolean).map(chaveUn);
    const esc2 = e => { if(e.key === "Escape") fechar(); };
    const fechar = () => { document.removeEventListener("keydown", esc2); ov.remove(); };
    document.addEventListener("keydown", esc2);
    $("cuMG5").value = listaG5().join(", ");
    const listaModo = () => modo === "valle" ? subUn(rs, UN_VALLE).map(r => r.u) : modo === "g5" ? subUn(rs, listaG5()).map(r => r.u) : modo === "custom" ? [...sel] : [];

    const pintaLista = () => { $("cuMList").innerHTML = checklistHTML(units, sel, $("cuMBusca").value); };
    function pinta(soLista){
      if(!soLista){
        const n = {valle: subUn(rs, UN_VALLE).length, g5: subUn(rs, listaG5()).length};
        const ops = [["tudo", "Tudo (sem filtro)", `3 tabelas: Unidades do Valle · Grupo G5 · Geral (${todas.length} unidades)`],
          ["valle", "Só unidades do Valle", `${n.valle} de ${UN_VALLE.length} unidades com dados`],
          ["g5", "Só Grupo G5", `${n.g5} unidade(s) com dados`],
          ["custom", "Escolher unidades", "pesquise e marque uma ou mais"]];
        $("cuMModos").innerHTML = ops.map(o => `<button type="button" class="cu-opt ${modo === o[0] ? "on" : ""}" data-modo="${o[0]}"><i></i><span><b>${o[1]}</b><small>${o[2]}</small></span></button>`).join("");
        $("cuMCustom").hidden = modo !== "custom";
        if(modo === "custom") pintaLista();
      }
      const lista = listaModo();
      $("cuMCont").textContent = sel.size + " marcada" + (sel.size === 1 ? "" : "s");
      $("cuMInfo").innerHTML = modo === "tudo" ? `Vai exportar <b>tudo</b>, em 3 tabelas: Unidades do Valle, Grupo G5 e Geral.`
        : lista.length ? `Vai exportar <b>${lista.length}</b> unidade(s) em uma única tabela: ${esc(txtLista(lista))}.`
        : modo === "custom" ? `Nenhuma unidade marcada ainda. Pesquise e marque as caixinhas.` : `Nenhuma unidade deste grupo tem dados nos meses comparados.`;
      $("cuMOk").disabled = modo !== "tudo" && !lista.length;
    }
    $("cuMBusca").oninput = pintaLista;
    $("cuMList").onchange = e => { const u = e.target.dataset && e.target.dataset.ck; if(!u) return; e.target.checked ? sel.add(u) : sel.delete(u); pinta(true); };
    $("cuMG5").onchange = () => { const g = parse($("cuMG5").value); D.cfg.g5 = g.length ? g : UN_G5.slice(); salvar(); pinta(); };
    ov.onclick = e => {
      if(e.target === ov) return fechar();
      const t = e.target.closest("[data-m],[data-modo],[data-ca]"); if(!t) return;
      if(t.dataset.ca){ e.preventDefault(); if(t.dataset.ca === "none") sel.clear(); else visiveisCk(units, $("cuMBusca").value).forEach(u => sel.add(u)); pintaLista(); return pinta(true); }
      if(t.dataset.modo){ modo = t.dataset.modo; return pinta(); }
      if(t.dataset.m === "fechar") return fechar();
      if(t.dataset.m === "ok"){
        const g = parse($("cuMG5").value); D.cfg.g5 = g.length ? g : UN_G5.slice(); salvar();
        const filtro = modo === "tudo" ? [] : listaModo(); fechar();
        try{ tipo === "pdf" ? exportarPdf(ultimo, filtro) : exportarExcel(ultimo, filtro); }
        catch(err){ alert("Não consegui gerar o " + nomeTipo + ": " + (err.message || err)); }
      }
    };
    pinta();
    if(modo === "custom") $("cuMBusca").focus();
  }

  /* ---------- Excel ---------- */
  function tabelaExport(rs){ return ordenar(rs); }

  async function exportarExcel({ctx, rsAll, T}, filtro){
    const filtrado = !!(filtro && filtro.length);
    if(filtrado){ rsAll = rsAll.filter(r => filtro.indexOf(r.u) >= 0); T = totalLinha(rsAll); }
    const g5 = listaG5(), txtFiltro = filtrado ? txtLista(filtro) : "";
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregou (precisa de internet)."); return; }
    const wb = new ExcelJS.Workbook(); wb.creator = "Painel Do Valle";
    const nA = rotMes(ctx.a), nB = rotMes(ctx.b), VERDE = "FF2D6A17";
    const hdr = row => row.eachCell(c => { c.font = {bold:true, color:{argb:"FFFFFFFF"}}; c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:VERDE}}; c.alignment = {horizontal:"center", vertical:"middle", wrapText:true}; });
    const d = dadosDash(rsAll, T);

    /* --- aba 1: Resumo --- */
    const rs1 = wb.addWorksheet("Resumo");
    rs1.addRow([`Comparação por unidade — ${nA} × ${nB}`]).font = {bold:true, size:15, color:{argb:VERDE}};
    rs1.addRow([`Sistema: ${nomeSis(ctx.sel)}${ctx.corte ? ` · mesmo período (dias 1 a ${ctx.corte})` : ""} · gerado em ${new Date().toLocaleString("pt-BR")}${filtrado ? " · Unidades: " + txtFiltro : ""}`]).font = {color:{argb:"FF6E7869"}};
    rs1.addRow([]);
    hdr(rs1.addRow(["Indicador", nA, nB, "Variação", "Variação %"]));
    const pc = (a, b) => a ? (b - a) / a : null;
    const kp = [["Frete total", T.fA, T.fB, T.dF, pc(T.fA, T.fB), "R$ #,##0.00"], ["CT-e", T.cA, T.cB, T.dC, pc(T.cA, T.cB), "#,##0"],
      ["Volumes", T.vA, T.vB, T.dV, pc(T.vA, T.vB), "#,##0"], ["Peso (kg)", T.pA, T.pB, T.dP, pc(T.pA, T.pB), "#,##0"],
      ["R$ / CT-e", T.rcA, T.rcB, T.dRc, pc(T.rcA, T.rcB), "R$ #,##0.00"]];
    kp.forEach(k => { const r = rs1.addRow([k[0], k[1], k[2], k[3], k[4]]); [2, 3, 4].forEach(i => r.getCell(i).numFmt = k[5]); r.getCell(5).numFmt = "0.0%"; });
    const rp = rs1.addRow(["Performance (%)", T.perfA, T.perfB, T.dPerf, null]); [2, 3].forEach(i => rp.getCell(i).numFmt = '0.0"%"'); rp.getCell(4).numFmt = '0.0" p.p."';
    rs1.addRow([]);
    const bloco = (tit, itens, cab, lin) => {
      rs1.addRow([tit]).font = {bold:true, color:{argb:VERDE}, size:12};
      hdr(rs1.addRow(cab));
      if(!itens.length) rs1.addRow(["—"]); else itens.forEach(i => rs1.addRow(lin(i)));
      rs1.addRow([]);
    };
    bloco("Maiores altas de frete", d.altas, ["Unidade", nA, nB, "Variação R$", "Variação %"], r => [r.u, r.fA, r.fB, r.dF, r.pctF == null ? null : r.pctF / 100]);
    bloco("Maiores quedas de frete", d.quedas, ["Unidade", nA, nB, "Variação R$", "Variação %"], r => [r.u, r.fA, r.fB, r.dF, r.pctF == null ? null : r.pctF / 100]);
    bloco("Alerta: performance em queda", d.alertPerf, ["Unidade", nA + " (%)", nB + " (%)", "Variação p.p."], r => [r.u, r.perfA, r.perfB, r.dPerf]);
    bloco("Alerta: frete em queda / sem movimento", d.alertFrete, ["Unidade", nA, nB, "Variação R$", "Status"], r => [r.u, r.fA, r.fB, r.dF, r.status]);
    rs1.columns = [{width:34}, {width:18}, {width:18}, {width:18}, {width:18}];
    rs1.eachRow(row => row.eachCell((c, i) => { if(typeof c.value === "number" && !c.numFmt){ c.numFmt = i === 5 ? "0.0%" : "R$ #,##0.00;[Red]-R$ #,##0.00"; } }));

    const abaComp = (nomeAba, rs) => {
      const Tg = totalLinha(rs);
    /* --- abas de comparação --- */
      const ws = wb.addWorksheet(nomeAba, {views:[{state:"frozen", xSplit:1, ySplit:2}]});
      const r1 = [], r2 = [];
      COLS.forEach(c => { r1.push(c.g || c.t); r2.push(c.g ? (c.t === "A" ? nA : c.t === "B" ? nB : c.t.replace("A (kg)", nA + " (kg)").replace("B (kg)", nB + " (kg)")) : ""); });
      ws.addRow(r1); ws.addRow(r2);
      let ini = 1;
      while(ini <= COLS.length){
        let fim = ini; const gg = r1[ini - 1];
        while(fim < COLS.length && COLS[fim].g && COLS[fim].g === gg) fim++;
        if(!COLS[ini - 1].g) ws.mergeCells(1, ini, 2, ini); else if(fim > ini) ws.mergeCells(1, ini, 1, fim);
        ini = fim + 1;
      }
      hdr(ws.getRow(1)); hdr(ws.getRow(2));
      const fm = {fA:"R$ #,##0.00", fB:"R$ #,##0.00", dF:"R$ #,##0.00;[Red]-R$ #,##0.00", pctF:'0.00"%";[Red]-0.00"%"', rcA:"R$ #,##0.00", rcB:"R$ #,##0.00", dRc:"R$ #,##0.00;[Red]-R$ #,##0.00",
        perfA:'0.0"%"', perfB:'0.0"%"', dPerf:"0.0;[Red]-0.0"};
      const linha = r => COLS.map(c => { const v = r[c.k]; return (v == null || (typeof v === "number" && !isFinite(v))) ? "" : v; });
      tabelaExport(rs).forEach(r => ws.addRow(linha(r)));
      if(!rs.length) ws.addRow(["Nenhuma unidade deste grupo tem dados nos meses comparados."]);
      const t = ws.addRow(linha(Tg)); t.font = {bold:true}; t.eachCell(c => c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFE8F4E1"}});
      COLS.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.txt ? 12 : c.st ? 18 : 15; if(fm[c.k]) col.numFmt = fm[c.k]; else if(!c.txt && !c.st) col.numFmt = c.v ? "#,##0;[Red]-#,##0" : "#,##0"; });
      ws.getRow(1).height = 22; ws.getRow(2).height = 22;
      ws.autoFilter = {from:{row:2, column:1}, to:{row:2 + rs.length, column:COLS.length}};
    };
    if(filtrado) abaComp("Unidades selecionadas", rsAll);
    else { abaComp("Unidades do Valle", subUn(rsAll, UN_VALLE)); abaComp("Grupo G5", subUn(rsAll, g5)); abaComp("Geral", rsAll); }

    const buf = await wb.xlsx.writeBuffer();
    baixar(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), `comparacao-unidades_${ctx.a}_x_${ctx.b}_${ctx.sel === "GERAL" ? "VAL-RVA" : ctx.sel}${filtrado ? "_filtro" : ""}.xlsx`);
  }
  function baixar(blob, nome){
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  /* ---------- PDF (A4 paisagem) ---------- */
  // jsPDF usa fonte padrão (sem Δ, →, ≥): no PDF escrevemos "Var.", "->" e ">=".
  function exportarPdf({ctx, rsAll, T}, filtro){
    const filtrado = !!(filtro && filtro.length);
    if(filtrado){ rsAll = rsAll.filter(r => filtro.indexOf(r.u) >= 0); T = totalLinha(rsAll); }
    const g5 = listaG5(), txtFiltro = filtrado ? txtLista(filtro) : "";
    const J = window.jspdf && window.jspdf.jsPDF;
    if(!J){ alert("A biblioteca de PDF (jsPDF) não carregou. Confira a internet e recarregue a página."); return; }
    const doc = new J({orientation:"landscape", unit:"mm", format:"a4"});
    if(typeof doc.autoTable !== "function"){ alert("A biblioteca de tabelas do PDF (autoTable) não carregou. Recarregue a página."); return; }
    const W = 297, M = 10, nA = rotMes(ctx.a), nB = rotMes(ctx.b), d = dadosDash(rsAll, T);
    const VERDE = [45, 106, 23], VERDE2 = [59, 138, 31], CLARO = [232, 244, 225], CINZA = [110, 120, 105], VERM = [207, 61, 53], OK = [47, 138, 42], LINHA = [216, 224, 211], BA = [163, 190, 156];
    const sgn = (t, n) => (n > 0 ? "+" : "") + t;
    const lim = +D.cfg.limite || 5, q = +D.cfg.quedaPerf || 1;

    const cabecalho = (sub) => {
      doc.setFillColor(...VERDE); doc.rect(0, 0, W, 17, "F");
      doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(`Comparação por Unidade — ${nA} x ${nB}`, M, 8.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(sub || `Sistema: ${nomeSis(ctx.sel)}${ctx.corte ? ` · mesmo período (dias 1 a ${ctx.corte})` : ""} · gerado em ${new Date().toLocaleString("pt-BR")}${filtrado ? " · Unidades: " + txtFiltro : ""}`, M, 14);
    };
    const card = (x, y, w, h, tit, sub) => {
      doc.setDrawColor(...LINHA); doc.setFillColor(255); doc.roundedRect(x, y, w, h, 2, 2, "FD");
      doc.setTextColor(...VERDE); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(tit, x + 4, y + 6);
      if(sub){ doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(sub, x + w - 4, y + 6, {align:"right"}); }
    };
    const legenda = (x, y) => {
      doc.setFontSize(7); doc.setTextColor(...CINZA); doc.setFont("helvetica", "normal");
      doc.setFillColor(...BA); doc.rect(x, y - 2.2, 3, 2.4, "F"); doc.text(nA, x + 4.5, y);
      doc.setFillColor(...VERDE2); doc.rect(x + 20, y - 2.2, 3, 2.4, "F"); doc.text(nB, x + 24.5, y);
    };
    const barrasParPdf = (x, y, w, itens, get, fmt, max, passo) => {
      const mx = max || Math.max(1e-9, ...itens.map(i => Math.max(get(i)[0] || 0, get(i)[1] || 0)));
      const bx = x + 16, bw = w - 16 - 28;
      itens.forEach((i, k) => {
        const yy = y + k * passo, [a, b] = get(i);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(30); doc.text(String(i.u), x, yy + 3.6);
        [[a, BA, 0], [b, VERDE2, 3.1]].forEach(([v, cor, off]) => {
          if(v == null){ doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...CINZA); doc.text("—", bx, yy + off + 2.2); return; }
          const ww = Math.max(0.4, v / mx * bw);
          doc.setFillColor(...cor); doc.rect(bx, yy + off, ww, 2.6, "F");
          doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(60); doc.text(fmt(v), bx + ww + 1.5, yy + off + 2.2);
        });
      });
    };
    const barrasDeltaPdf = (x, y, w, itens, get, fmt, neg, passo) => {
      if(!itens.length){ doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text("Nenhuma unidade.", x, y + 3); return; }
      const mx = Math.max(1e-9, ...itens.map(i => Math.abs(get(i)))), bx = x + 16, bw = w - 16 - 34;
      itens.forEach((i, k) => {
        const yy = y + k * passo, v = get(i), ww = Math.max(0.5, Math.abs(v) / mx * bw);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(30); doc.text(String(i.u), x, yy + 3);
        doc.setFillColor(...(neg ? VERM : OK)); doc.rect(bx, yy, ww, 3.2, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...(neg ? VERM : OK)); doc.text(sgn(fmt(v), v), bx + ww + 1.5, yy + 2.8);
      });
    };

    /* ---- página 1: KPIs + frete ---- */
    cabecalho();
    const pc = (a, b) => a ? (b - a) / a * 100 : null;
    const kp = [["FRETE TOTAL", T.fA, T.fB, T.dF, T.pctF, brl], ["CT-e", T.cA, T.cB, T.dC, pc(T.cA, T.cB), f0], ["VOLUMES", T.vA, T.vB, T.dV, pc(T.vA, T.vB), f0],
      ["PESO (KG)", T.pA, T.pB, T.dP, pc(T.pA, T.pB), f0], ["R$ / CT-e", T.rcA || 0, T.rcB || 0, T.dRc || 0, pc(T.rcA, T.rcB), brl], ["PERFORMANCE", T.perfA, T.perfB, T.dPerf, null, pct1]];
    const kw = (W - 2 * M - 5 * 3) / 6;
    kp.forEach((k, i) => {
      const x = M + i * (kw + 3), y = 22;
      doc.setDrawColor(...LINHA); doc.setFillColor(255); doc.roundedRect(x, y, kw, 23, 2, 2, "FD");
      doc.setFillColor(...VERDE2); doc.rect(x, y + 2, 1.2, 19, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...CINZA); doc.text(k[0], x + 4, y + 5.5);
      doc.setFontSize(i === 0 || i === 4 ? 11.5 : 13); doc.setTextColor(...VERDE); doc.text(k[2] == null ? "—" : k[5](k[2]), x + 4, y + 12.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...CINZA); doc.text(`${nA}: ${k[1] == null ? "—" : k[5](k[1])}`, x + 4, y + 17);
      if(k[3] != null){
        const pp = i === 5; doc.setFont("helvetica", "bold"); doc.setFontSize(7.2); doc.setTextColor(...(k[3] > 0.0001 ? OK : k[3] < -0.0001 ? VERM : CINZA));
        doc.text(sgn(pp ? f1(k[3]) + " p.p." : k[5](k[3]), k[3]) + (k[4] != null ? "  (" + sgn(f1(k[4]) + "%", k[4]) + ")" : ""), x + 4, y + 20.8);
      }
    });
    const hw = (W - 2 * M - 4) / 2, y0 = 50;
    const qIni = y0 + 15 + Math.max(d.altas.length, 1) * 6.4 + 7;
    const h1 = Math.max(26 + d.topFrete.length * 8.2, qIni + Math.max(d.quedas.length, 1) * 6.4 + 6 - y0, 60);
    card(M, y0, hw, h1, "Frete por unidade", "10 maiores"); legenda(M + 4, y0 + 11);
    barrasParPdf(M + 4, y0 + 15, hw - 8, d.topFrete, i => [i.fA, i.fB], brl, 0, 8.2);
    card(M + hw + 4, y0, hw, h1, "Maiores altas e quedas de frete", `${nB} - ${nA}`);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...OK); doc.text("ALTAS", M + hw + 8, y0 + 12);
    barrasDeltaPdf(M + hw + 8, y0 + 15, hw - 8, d.altas, i => i.dF, brl, false, 6.4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...VERM); doc.text("QUEDAS", M + hw + 8, qIni - 3);
    barrasDeltaPdf(M + hw + 8, qIni, hw - 8, d.quedas, i => i.dF, brl, true, 6.4);

    /* ---- página 2: performance + alertas ---- */
    doc.addPage(); cabecalho(`Performance e alertas · Sistema: ${nomeSis(ctx.sel)}`);
    const h2 = Math.max(26 + d.perf.length * 7.4, 24 + (Math.min(9, d.alertPerf.length) || 1) * 4.6 + (Math.min(9, d.alertFrete.length) || 1) * 4.6 + 22, 55);
    card(M, 22, hw, h2, "Performance por unidade", `piores variações${d.nPerf > 12 ? " (12 de " + d.nPerf + ")" : ""}`);
    if(d.perf.length){
      legenda(M + 4, 33);
      barrasParPdf(M + 4, 37, hw - 8, d.perf, i => [i.perfA, i.perfB], pct1, 100, 7.4);
      d.perf.forEach((r, k) => { doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...(r.dPerf < -0.0001 ? VERM : r.dPerf > 0.0001 ? OK : CINZA)); doc.text(sgn(f1(r.dPerf), r.dPerf) + " p.p.", M + hw - 5, 37 + k * 7.4 + 4, {align:"right"}); });
    } else { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text("Sem performance nos dois meses para comparar.", M + 4, 40); }
    card(M + hw + 4, 22, hw, h2, "Alertas", `frete +/-${lim}% · performance +/-${q} p.p.`);
    let ya = 34;
    const lista = (tit, itens, fn) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...VERDE); doc.text(`${tit} (${itens.length})`, M + hw + 8, ya); ya += 4.5;
      if(!itens.length){ doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text("Nenhuma unidade.", M + hw + 8, ya); ya += 6; }
      itens.slice(0, 9).forEach(r => { fn(r, ya); ya += 4.6; });
      if(itens.length > 9){ doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(`+ ${itens.length - 9} na tabela`, M + hw + 8, ya); ya += 4.6; }
      ya += 3;
    };
    const xi = M + hw + 8, xf = M + hw + hw - 5;
    lista("Performance em queda", d.alertPerf, (r, y) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(30); doc.text(r.u, xi, y);
      doc.setFont("helvetica", "normal"); doc.text(`${pct1(r.perfA)} -> ${pct1(r.perfB)}`, xi + 20, y);
      doc.setTextColor(...VERM); doc.setFont("helvetica", "bold"); doc.text(sgn(f1(r.dPerf), r.dPerf) + " p.p.", xf, y, {align:"right"});
    });
    lista("Frete em queda / sem movimento", d.alertFrete, (r, y) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(30); doc.text(r.u, xi, y);
      doc.setFont("helvetica", "normal"); doc.text(r.status === "Sem movimento" ? "sem movimento" : sgn(f1(r.pctF) + "%", r.pctF), xi + 20, y);
      doc.setTextColor(...VERM); doc.setFont("helvetica", "bold"); doc.text(sgn(brl(r.dF), r.dF), xf, y, {align:"right"});
    });
    // status
    const ys = 22 + h2 + 4;
    card(M, ys, W - 2 * M, 22, "Status do frete", `${rsAll.length} unidade(s)`);
    const cores = {"Em alta":[47, 138, 42], "Estável":[154, 165, 147], "Em queda":[207, 61, 53], "Novo":[79, 157, 45], "Sem movimento":[224, 165, 38]};
    const tot = Object.values(d.cont).reduce((s, x) => s + x, 0) || 1; let xs = M + 4; const bw = W - 2 * M - 8;
    Object.keys(d.cont).forEach(k => { if(!d.cont[k]) return; const w = d.cont[k] / tot * bw; doc.setFillColor(...cores[k]); doc.rect(xs, ys + 8, w, 4, "F"); xs += w; });
    let xl = M + 4; doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    Object.keys(d.cont).forEach(k => { doc.setFillColor(...cores[k]); doc.rect(xl, ys + 15, 2.6, 2.6, "F"); doc.setTextColor(60); doc.text(`${k}: ${d.cont[k]}`, xl + 4, ys + 17.2); xl += 42; });

    /* ---- tabelas comparativas: sem filtro = Valle + G5 + Geral; com filtro = só as unidades escolhidas ---- */
    const tabelaPdf = (titulo, rs) => {
      doc.addPage(); cabecalho(`Tabela comparativa — ${titulo} · Sistema: ${nomeSis(ctx.sel)}`);
      if(!rs.length){
        doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...CINZA);
        doc.text("Nenhuma unidade deste grupo tem dados nos meses comparados.", M, 30); return;
      }
      const Tg = totalLinha(rs);
      const linhas = tabelaExport(rs).concat([Object.assign({}, Tg, {u:"TOTAL"})]);
      const corpo = linhas.map(r => [r.u, brl(r.fA), brl(r.fB), sgn(brl(r.dF), r.dF), r.pctF == null ? "—" : sgn(f1(r.pctF) + "%", r.pctF),
        f0(r.cA), f0(r.cB), sgn(f0(r.dC), r.dC), f0(r.vA), f0(r.vB), sgn(f0(r.dV), r.dV), f0(r.pB),
        r.rcA == null ? "—" : brl(r.rcA), r.rcB == null ? "—" : brl(r.rcB),
        r.perfA == null ? "—" : pct1(r.perfA), r.perfB == null ? "—" : pct1(r.perfB), r.dPerf == null ? "—" : sgn(f1(r.dPerf), r.dPerf), r.status, r.alerta]);
      const cabec = [
        [{content:"Unidade", rowSpan:2}, {content:"Frete", colSpan:4}, {content:"CT-e", colSpan:3}, {content:"Volumes", colSpan:3}, {content:"Peso (kg)", colSpan:1}, {content:"R$ / CT-e", colSpan:2}, {content:"Performance", colSpan:3}, {content:"Status frete", rowSpan:2}, {content:"Alerta perf.", rowSpan:2}],
        [nA, nB, "Var. R$", "Var. %", nA, nB, "Var.", nA, nB, "Var.", nB, nA, nB, nA, nB, "Var. p.p."]
      ];
      doc.autoTable({
        startY: 21, head: cabec, body: corpo, theme: "grid", margin: {top: 21, left: M, right: M, bottom: 12},
        styles: {fontSize: 6.3, cellPadding: 1.2, halign: "right", lineColor: LINHA, lineWidth: 0.1, textColor: 30},
        headStyles: {fillColor: VERDE, textColor: 255, halign: "center", valign: "middle", fontSize: 6.5},
        columnStyles: {0: {halign:"left", fontStyle:"bold"}, 17: {halign:"center"}, 18: {halign:"center"}},
        didParseCell: h => {
          if(h.section === "body"){
            const last = h.row.index === corpo.length - 1;
            if(last){ h.cell.styles.fillColor = CLARO; h.cell.styles.fontStyle = "bold"; }
            const t = String(h.cell.raw);
            if([3, 4, 7, 10, 16].indexOf(h.column.index) >= 0){ if(t.startsWith("+")) h.cell.styles.textColor = OK; else if(t.startsWith("-")) h.cell.styles.textColor = VERM; }
            if(h.column.index === 17 || h.column.index === 18){ if(/queda|sem mov/i.test(t)) h.cell.styles.textColor = VERM; else if(/alta|melhora|novo/i.test(t)) h.cell.styles.textColor = OK; }
          }
        }
      });
    };
    if(filtrado) tabelaPdf(`Unidades selecionadas (${rsAll.length})`, rsAll);
    else {
      const tv = subUn(rsAll, UN_VALLE), tg = subUn(rsAll, g5);
      tabelaPdf(`Unidades do Valle (${tv.length})`, tv);
      tabelaPdf(`Grupo G5 (${tg.length})`, tg);
      tabelaPdf(`Geral — todas as unidades (${rsAll.length})`, rsAll);
    }
    const np = doc.getNumberOfPages();
    for(let i = 1; i <= np; i++){ doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(`Painel Do Valle · Comparação por Unidade · página ${i} de ${np}`, W / 2, 205, {align:"center"}); }
    baixar(doc.output("blob"), `comparacao-unidades_${ctx.a}_x_${ctx.b}_${ctx.sel === "GERAL" ? "VAL-RVA" : ctx.sel}${filtrado ? "_filtro" : ""}.pdf`);
  }

  /* ---------------- API ---------------- */
  document.addEventListener("click", e => { const d = document.getElementById("cuUnDet"); if(d && d.open && !d.contains(e.target)) d.open = false; });
  window.comparacaoUnidadesHTML = html;
  window.attachComparacaoUnidades = function(){ render(); };
  window.comparacaoUnidadesRefresh = function(){ D = carregar(); render(); };
  window.__cu = {infoUnidades, checklistHTML, exportarPdf, exportarExcel, totalLinha, derivar, UN_VALLE, UN_G5, lerSSW, lerPerformance, calcPerf, num, estado: () => D, contexto, dadosDash};
})();
