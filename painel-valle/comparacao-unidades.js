/* =====================================================================
   COMPARAÇÃO POR UNIDADE — mês x mês, por Unidade Receptora (Visão operacional).
   Aba INDEPENDENTE: guarda os próprios dados (chave valle_cmpunid_v1) e não altera nenhuma outra tela.

   Arquivo 1 (modelo): planilha do SSW "CTRCs EXPEDIDOS E RECEBIDOS" (.sswweb / .csv, separador ;).
     Unidade      = coluna "Unidade Receptora"
     Frete        = coluna "Valor do Frete"
     Peso         = coluna "Peso Real em Kg"
     Volumes      = coluna "Quantidade de Volumes"
     CT-e         = 1 por linha (CTRC) — linhas com Data do Cancelamento preenchida NÃO contam
     Mês/dia      = coluna "Data de Autorizacao"
   Os números são guardados DIA A DIA por unidade (leve) — reimportar um período substitui só os dias dele.
   Assim o mês parcial (mês atual) pode ser comparado com o MESMO período do mês anterior (dias 1 a N).

   Performance (arquivo 2 — ainda será definido): colunas já existem; por enquanto podem ser digitadas na tabela.
   ===================================================================== */
(function(){
  "use strict";

  const KEY = "valle_cmpunid_v1";
  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

  function padrao(){ return {dias:{}, arqs:[], perf:{}, cfg:{a:"", b:"", mesmoPeriodo:true, limite:5, quedaPerf:1}}; }
  function carregar(){
    try{
      const o = JSON.parse(localStorage.getItem(KEY) || "null");
      if(o && o.dias){ const p = padrao(); return {dias:o.dias, arqs:o.arqs||[], perf:o.perf||{}, cfg:Object.assign(p.cfg, o.cfg||{})}; }
    }catch(e){}
    return padrao();
  }
  let D = carregar();
  function salvar(){ try{ localStorage.setItem(KEY, JSON.stringify(D)); }catch(e){ alert("Não foi possível salvar no navegador (espaço cheio)."); } }

  let ordem = {k:"fB", dir:-1};
  let msg = null;

  /* ---------------- util ---------------- */
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])));
  function num(s){
    s = String(s == null ? "" : s).replace(/\s/g, "");
    if(!s) return 0;
    if(s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  const f0 = n => Math.round(n).toLocaleString("pt-BR");
  const f2 = n => n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  const brl = n => "R$ " + f2(n);
  const sinal = (txt, n) => (n > 0 ? "+" : "") + txt;
  function rotMes(m){ const [a, b] = m.split("-"); return MESES[+b - 1] + "/" + a.slice(2); }
  function diasNoMes(m){ const [a, b] = m.split("-").map(Number); return new Date(a, b, 0).getDate(); }
  function iso(dd, mm, aa){ aa = +aa; if(aa < 100) aa += 2000; return aa + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0"); }

  /* ---------------- leitura do arquivo SSW ---------------- */
  function lerTexto(buf){
    try{ return new TextDecoder("windows-1252").decode(buf); }catch(e){ return new TextDecoder("latin1").decode(buf); }
  }
  function normaliza(s){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }

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
    if(!cab) throw new Error("Não achei a linha de cabeçalho (tipo 1). Este é o arquivo do SSW \"CTRCs expedidos e recebidos\"?");
    const ix = {}; cab.forEach((n, i) => ix[normaliza(n)] = i);
    const need = ["unidade receptora", "valor do frete", "peso real em kg", "quantidade de volumes", "data de autorizacao"];
    const falta = need.filter(n => ix[n] == null);
    if(falta.length) throw new Error("Faltam colunas no arquivo: " + falta.join(", "));
    const iCan = ix["data do cancelamento"], iCt = ix["serie/numero ctrc"];
    const dias = {}, vistos = new Set();
    let lidos = 0, cancel = 0, dup = 0, semData = 0, semUnid = 0;
    for(const c of dados){
      lidos++;
      if(iCan != null && (c[iCan] || "").trim()){ cancel++; continue; }
      const chave = iCt != null ? (c[iCt] || "").trim() : "";
      if(chave){ if(vistos.has(chave)){ dup++; continue; } vistos.add(chave); }
      const m = /(\d{2})\/(\d{2})\/(\d{2,4})/.exec(c[ix["data de autorizacao"]] || "");
      if(!m){ semData++; continue; }
      const un = (c[ix["unidade receptora"]] || "").trim().toUpperCase();
      if(!un){ semUnid++; continue; }
      const dia = iso(m[1], m[2], m[3]);
      const d = dias[dia] || (dias[dia] = {});
      const u = d[un] || (d[un] = {c:0, f:0, p:0, v:0});
      u.c++; u.f += num(c[ix["valor do frete"]]); u.p += num(c[ix["peso real em kg"]]); u.v += num(c[ix["quantidade de volumes"]]);
    }
    return {nome, periodo: per.trim(), dias, lidos, cancel, dup, semData, semUnid};
  }

  function aplicar(r){
    // reimportar substitui os dias do arquivo
    Object.keys(r.dias).forEach(dia => {
      Object.keys(r.dias[dia]).forEach(u => { const x = r.dias[dia][u]; x.f = Math.round(x.f * 100) / 100; x.p = Math.round(x.p * 1000) / 1000; });
      D.dias[dia] = r.dias[dia];
    });
    const ds = Object.keys(r.dias).sort();
    D.arqs = D.arqs.filter(a => a.nome !== r.nome);
    D.arqs.push({nome: r.nome, periodo: r.periodo, de: ds[0], ate: ds[ds.length - 1], dias: ds.length, lidos: r.lidos, cancel: r.cancel, dup: r.dup, em: new Date().toISOString()});
    const ms = meses();
    if(!D.cfg.b || ms.indexOf(D.cfg.b) < 0) D.cfg.b = ms[ms.length - 1] || "";
    if(!D.cfg.a || ms.indexOf(D.cfg.a) < 0){ const i = ms.indexOf(D.cfg.b); D.cfg.a = i > 0 ? ms[i - 1] : ""; }
    salvar();
  }

  /* ---------------- agregação ---------------- */
  function meses(){ return [...new Set(Object.keys(D.dias).map(d => d.slice(0, 7)))].sort(); }
  function diasDoMes(m){ return Object.keys(D.dias).filter(d => d.startsWith(m)).sort(); }

  function agregar(m, ate){
    const out = {};
    diasDoMes(m).forEach(dia => {
      if(ate && +dia.slice(8) > ate) return;
      const d = D.dias[dia];
      Object.keys(d).forEach(u => {
        const o = out[u] || (out[u] = {c:0, f:0, p:0, v:0});
        o.c += d[u].c; o.f += d[u].f; o.p += d[u].p; o.v += d[u].v;
      });
    });
    return out;
  }

  function contexto(){
    const a = D.cfg.a, b = D.cfg.b;
    if(!a || !b) return null;
    const dB = diasDoMes(b);
    const ultB = dB.length ? +dB[dB.length - 1].slice(8) : 0;
    const parcialB = ultB > 0 && (ultB < diasNoMes(b) || dB.length < ultB);
    const corte = (D.cfg.mesmoPeriodo && parcialB) ? ultB : 0;
    const A = agregar(a, corte), B = agregar(b, 0);
    const un = [...new Set([...Object.keys(A), ...Object.keys(B)])];
    const z = {c:0, f:0, p:0, v:0};
    const linhas = un.map(u => {
      const x = A[u] || z, y = B[u] || z;
      const pa = (D.perf[a] || {})[u], pb = (D.perf[b] || {})[u];
      return {u, cA:x.c, cB:y.c, fA:x.f, fB:y.f, pA:x.p, pB:y.p, vA:x.v, vB:y.v,
        perfA: pa == null ? null : pa, perfB: pb == null ? null : pb};
    });
    return {a, b, corte, ultB, parcialB, linhas, diasB: dB.length};
  }

  function derivar(l){
    const r = Object.assign({}, l);
    r.dF = l.fB - l.fA; r.pctF = l.fA ? (r.dF / l.fA) * 100 : null;
    r.dC = l.cB - l.cA;
    r.pesoTot = l.pA + l.pB; r.dP = l.pB - l.pA;
    r.rcA = l.cA ? l.fA / l.cA : null; r.rcB = l.cB ? l.fB / l.cB : null;
    r.dRc = (r.rcA != null && r.rcB != null) ? r.rcB - r.rcA : null;
    r.dV = l.vB - l.vA;
    r.dPerf = (l.perfA != null && l.perfB != null) ? l.perfB - l.perfA : null;
    const lim = +D.cfg.limite || 5;
    r.status = !l.fA && l.fB ? "Novo" : (l.fA && !l.fB ? "Sem movimento" : r.pctF == null ? "—" : r.pctF >= lim ? "Em alta" : r.pctF <= -lim ? "Em queda" : "Estável");
    const q = +D.cfg.quedaPerf || 1;
    r.alerta = r.dPerf == null ? "—" : r.dPerf <= -q ? "Queda" : r.dPerf >= q ? "Melhora" : "Estável";
    return r;
  }

  /* ---------------- tela ---------------- */
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
    {k:"perfA", t:"A", g:"Performance", f:n => f2(n) + "%", perf:"A"},
    {k:"perfB", t:"B", g:"Performance", f:n => f2(n) + "%", perf:"B"},
    {k:"dPerf", t:"Δ p.p.", g:"Performance", f:n => f2(n), v:1},
    {k:"status", t:"Status do frete", g:"", st:1},
    {k:"alerta", t:"Alerta de performance", g:"", st:1}
  ];

  function cel(col, r){
    const val = r[col.k];
    if(col.perf){
      const m = col.perf === "A" ? D.cfg.a : D.cfg.b;
      return `<td class="cu-n"><input class="cu-in" data-perf="${esc(m)}|${esc(r.u)}" value="${val == null ? "" : String(val).replace(".", ",")}" placeholder="—" inputmode="decimal"></td>`;
    }
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
    const t = {u:"TOTAL", cA:0, cB:0, fA:0, fB:0, pA:0, pB:0, vA:0, vB:0, perfA:null, perfB:null};
    rs.forEach(r => { t.cA += r.cA; t.cB += r.cB; t.fA += r.fA; t.fB += r.fB; t.pA += r.pA; t.pB += r.pB; t.vA += r.vA; t.vB += r.vB; });
    // performance do total: média ponderada por CT-e das unidades que têm o dado
    ["A", "B"].forEach(s => {
      let soma = 0, peso = 0;
      rs.forEach(r => { const p = r["perf" + s]; if(p != null){ const w = s === "A" ? r.cA : r.cB; soma += p * w; peso += w; } });
      if(peso) t["perf" + s] = soma / peso;
    });
    return derivar(t);
  }

  function kpis(T, ctx){
    const k = (tit, a, b, d, p, f) => `<div class="cu-kpi"><div class="cu-kt">${tit}</div><div class="cu-kv">${f(b)}</div><div class="cu-ks">${rotMes(ctx.a)}: ${f(a)}</div><div class="cu-kd ${d > 0 ? "cu-pos" : d < 0 ? "cu-neg" : ""}">${sinal(f(d), d)}${p != null ? " · " + sinal(f2(p) + "%", p) : ""}</div></div>`;
    const pc = (a, b) => a ? ((b - a) / a) * 100 : null;
    return `<div class="cu-kpis">`
      + k("Frete", T.fA, T.fB, T.dF, T.pctF, brl)
      + k("CT-e", T.cA, T.cB, T.dC, pc(T.cA, T.cB), f0)
      + k("Peso (kg)", T.pA, T.pB, T.dP, pc(T.pA, T.pB), f0)
      + k("Volumes", T.vA, T.vB, T.dV, pc(T.vA, T.vB), f0)
      + k("R$ / CT-e", T.rcA || 0, T.rcB || 0, T.dRc || 0, pc(T.rcA, T.rcB), brl)
      + `</div>`;
  }

  function opcoesMes(sel){
    return meses().map(m => `<option value="${m}" ${m === sel ? "selected" : ""}>${rotMes(m)}</option>`).join("");
  }

  function html(){
    return `<h2 class="section-title">Comparação por Unidade — mês × mês</h2><div id="cuRoot"></div>`;
  }

  function render(){
    const root = document.getElementById("cuRoot"); if(!root) return;
    const ms = meses();
    const ctx = contexto();
    let h = "";

    // importação
    const arq = D.arqs.slice().sort((x, y) => (x.de || "").localeCompare(y.de || "")).map(a =>
      `<tr><td>${esc(a.nome)}</td><td>${esc(a.periodo || "")}</td><td class="cu-n">${a.de ? a.de.split("-").reverse().join("/") : ""} a ${a.ate ? a.ate.split("-").reverse().join("/") : ""}</td><td class="cu-n">${f0(a.lidos)}</td><td class="cu-n">${f0(a.cancel)}</td></tr>`).join("");
    h += `<details class="cu-imp" ${ms.length ? "" : "open"}><summary>Importar planilha do SSW <span class="cu-sub">(CTRCs expedidos e recebidos · .sswweb / .csv)</span></summary>
      <div class="cu-imp-b">
        <div class="cu-drop" id="cuDrop"><input type="file" id="cuFile" multiple accept=".sswweb,.csv,.txt"><span>Selecione um ou mais arquivos (um por mês/período). Reimportar um período substitui os mesmos dias.</span></div>
        ${msg ? `<div class="cu-msg ${msg.ok ? "ok" : "err"}">${msg.t}</div>` : ""}
        ${arq ? `<div class="table-wrap"><table class="cu-table cu-mini"><thead><tr><th>Arquivo</th><th>Período do relatório</th><th>Dias com emissão</th><th>Linhas</th><th>Canceladas</th></tr></thead><tbody>${arq}</tbody></table></div>
        <div class="cu-acoes"><button type="button" class="btn btn-ghost btn-sm" id="cuLimpar">Apagar todos os dados desta aba</button></div>` : ""}
      </div></details>`;

    if(!ms.length){
      root.innerHTML = h + `<div class="cu-vazio">Importe a planilha do SSW para montar o comparativo.</div>`;
      ligar(); return;
    }

    h += `<div class="cu-ctl">
      <label>Mês A (base) <select id="cuA">${opcoesMes(D.cfg.a)}</select></label>
      <label>Mês B (atual) <select id="cuB">${opcoesMes(D.cfg.b)}</select></label>
      <label class="cu-chk"><input type="checkbox" id="cuMesmo" ${D.cfg.mesmoPeriodo ? "checked" : ""}> Comparar o mesmo período (dias 1 a N)</label>
      <label>Alta/queda a partir de <input type="number" id="cuLim" value="${D.cfg.limite}" min="0" step="1" style="width:56px"> %</label>
      <label>Alerta de performance a partir de <input type="number" id="cuQp" value="${D.cfg.quedaPerf}" min="0" step="0.5" style="width:56px"> p.p.</label>
      <button type="button" class="btn btn-sm" id="cuExcel">Exportar Excel</button>
    </div>`;

    if(!ctx || D.cfg.a === D.cfg.b){
      root.innerHTML = h + `<div class="cu-vazio">Escolha dois meses diferentes (A e B).</div>`; ligar(); return;
    }

    if(ctx.parcialB){
      h += `<div class="cu-aviso">${rotMes(ctx.b)} está <b>parcial</b> (dados até o dia ${ctx.ultB}, ${ctx.diasB} dia(s) com emissão). ${ctx.corte
        ? `${rotMes(ctx.a)} foi cortado nos mesmos dias (1 a ${ctx.corte}) para a comparação ser justa.`
        : `${rotMes(ctx.a)} está inteiro — a comparação mostra o mês anterior completo contra o parcial.`}</div>`;
    }
    if(ctx.a > ctx.b) h += `<div class="cu-aviso">O mês A é posterior ao mês B — as variações estão invertidas.</div>`;

    let rs = ctx.linhas.map(derivar);
    const T = totalLinha(rs);
    const ord = ordem;
    rs.sort((x, y) => {
      const a = x[ord.k], b = y[ord.k];
      if(typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b), "pt-BR") * ord.dir;
      return ((a == null ? -Infinity : a) - (b == null ? -Infinity : b)) * ord.dir;
    });

    h += kpis(T, ctx);

    // cabeçalho em 2 níveis
    const seta = k => ord.k === k ? (ord.dir > 0 ? " ▲" : " ▼") : "";
    const grupos = [];
    COLS.forEach(c => { const u = grupos[grupos.length - 1]; if(c.g && u && u.g === c.g) u.n++; else grupos.push({g: c.g || c.t, n:1, solo: !c.g, k: c.k}); });
    const rot = c => c.t === "A" ? rotMes(ctx.a) : c.t === "B" ? rotMes(ctx.b) : c.t === "A (kg)" ? rotMes(ctx.a) + " (kg)" : c.t === "B (kg)" ? rotMes(ctx.b) + " (kg)" : c.t;
    const th1 = grupos.map(g => g.solo
      ? `<th rowspan="2" class="cu-th1 ${g.k === "u" ? "cu-sticky" : ""}" data-ord="${g.k}">${esc(g.g)}${seta(g.k)}</th>`
      : `<th colspan="${g.n}" class="cu-th1 cu-gr">${esc(g.g)}</th>`).join("");
    const th2 = COLS.filter(c => c.g).map(c => `<th class="cu-th2" data-ord="${c.k}">${esc(rot(c))}${seta(c.k)}</th>`).join("");

    const corpo = rs.map(r => `<tr>${COLS.map(c => cel(c, r)).join("")}</tr>`).join("");
    const tot = `<tr class="cu-tot">${COLS.map(c => c.perf ? `<td class="cu-n">${T[c.k] == null ? "—" : f2(T[c.k]) + "%"}</td>` : cel(c, T)).join("")}</tr>`;
    h += `<div class="table-wrap cu-wrap"><table class="cu-table"><thead><tr>${th1}</tr><tr>${th2}</tr></thead><tbody>${corpo}${tot}</tbody></table></div>
      <div class="cu-nota">Δ = mês B − mês A. Peso total = A + B. R$/CT-e = frete ÷ quantidade de CT-e. Performance: digite o valor (%) nas células até o 2º arquivo ser definido; o total é a média ponderada por CT-e.
      Cancelados não entram. Frete/peso/volumes vêm das colunas Valor do Frete, Peso Real em Kg e Quantidade de Volumes, agrupadas pela Unidade Receptora.</div>`;

    root.innerHTML = h;
    ligar(ctx, rs, T);
  }

  /* ---------------- eventos ---------------- */
  async function importar(files){
    const ok = [], err = [];
    for(const f of files){
      try{
        const r = lerSSW(lerTexto(await f.arrayBuffer()), f.name);
        if(!Object.keys(r.dias).length) throw new Error("nenhuma linha válida");
        aplicar(r);
        ok.push(`<b>${esc(f.name)}</b>: ${f0(r.lidos)} linhas, ${Object.keys(r.dias).length} dia(s)` + (r.cancel ? `, ${r.cancel} cancelada(s) ignorada(s)` : "") + (r.dup ? `, ${r.dup} duplicada(s) ignorada(s)` : ""));
      }catch(e){ err.push(`<b>${esc(f.name)}</b>: ${esc(e.message || e)}`); }
    }
    msg = {ok: !err.length, t: [...ok, ...err].join("<br>")};
    render();
  }

  function ligar(ctx, rs, T){
    const g = id => document.getElementById(id);
    if(g("cuFile")) g("cuFile").onchange = e => { const fs = [...e.target.files]; if(fs.length) importar(fs); };
    if(g("cuLimpar")) g("cuLimpar").onclick = () => { if(confirm("Apagar todos os dados importados desta aba (inclusive performances digitadas)?")){ D = padrao(); salvar(); msg = null; render(); } };
    if(g("cuA")) g("cuA").onchange = e => { D.cfg.a = e.target.value; salvar(); render(); };
    if(g("cuB")) g("cuB").onchange = e => { D.cfg.b = e.target.value; salvar(); render(); };
    if(g("cuMesmo")) g("cuMesmo").onchange = e => { D.cfg.mesmoPeriodo = e.target.checked; salvar(); render(); };
    if(g("cuLim")) g("cuLim").onchange = e => { D.cfg.limite = Math.max(0, +e.target.value || 0); salvar(); render(); };
    if(g("cuQp")) g("cuQp").onchange = e => { D.cfg.quedaPerf = Math.max(0, +e.target.value || 0); salvar(); render(); };
    if(g("cuExcel")) g("cuExcel").onclick = () => exportar(ctx, rs, T);
    document.querySelectorAll("#cuRoot [data-ord]").forEach(th => th.onclick = () => {
      const k = th.dataset.ord; ordem = {k, dir: ordem.k === k ? -ordem.dir : (k === "u" || k === "status" || k === "alerta" ? 1 : -1)}; render();
    });
    document.querySelectorAll("#cuRoot input[data-perf]").forEach(inp => inp.onchange = () => {
      const [m, u] = inp.dataset.perf.split("|");
      const s = inp.value.trim().replace(",", ".");
      D.perf[m] = D.perf[m] || {};
      if(s === "" || !isFinite(+s)) delete D.perf[m][u]; else D.perf[m][u] = +s;
      salvar(); render();
    });
  }

  /* ---------------- Excel ---------------- */
  async function exportar(ctx, rs, T){
    if(!ctx || typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregou (precisa de internet)."); return; }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Comparação por unidade", {views:[{state:"frozen", xSplit:1, ySplit:2}]});
    const nA = rotMes(ctx.a), nB = rotMes(ctx.b);
    const r1 = [], r2 = [];
    COLS.forEach(c => { r1.push(c.g || c.t); r2.push(c.g ? (c.t === "A" ? nA : c.t === "B" ? nB : c.t.replace("A (kg)", nA + " (kg)").replace("B (kg)", nB + " (kg)")) : ""); });
    ws.addRow(r1); ws.addRow(r2);
    let ini = 1;
    while(ini <= COLS.length){
      let fim = ini; const g = r1[ini - 1];
      while(fim < COLS.length && COLS[fim].g && COLS[fim].g === g) fim++;
      if(!COLS[ini - 1].g) ws.mergeCells(1, ini, 2, ini); else if(fim > ini) ws.mergeCells(1, ini, 1, fim);
      ini = fim + 1;
    }
    [1, 2].forEach(n => ws.getRow(n).eachCell(c => { c.font = {bold:true, color:{argb:"FFFFFFFF"}}; c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF2D6A17"}}; c.alignment = {horizontal:"center", vertical:"middle", wrapText:true}; }));
    const fm = {fA:"R$ #,##0.00", fB:"R$ #,##0.00", dF:"R$ #,##0.00;[Red]-R$ #,##0.00", pctF:'0.00"%"', rcA:"R$ #,##0.00", rcB:"R$ #,##0.00", dRc:"R$ #,##0.00;[Red]-R$ #,##0.00",
      perfA:'0.00"%"', perfB:'0.00"%"', dPerf:"0.00;[Red]-0.00"};
    const linha = r => COLS.map(c => { const v = r[c.k]; return (v == null || (typeof v === "number" && !isFinite(v))) ? "" : v; });
    rs.forEach(r => ws.addRow(linha(r)));
    const t = ws.addRow(linha(T)); t.font = {bold:true}; t.eachCell(c => c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFE8F4E1"}});
    COLS.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.txt ? 12 : c.st ? 18 : 15; if(fm[c.k]) col.numFmt = fm[c.k]; else if(!c.txt && !c.st) col.numFmt = c.v ? "#,##0;[Red]-#,##0" : "#,##0"; });
    ws.getRow(1).height = 22; ws.getRow(2).height = 22;
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    a.download = `comparacao-unidades_${ctx.a}_x_${ctx.b}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------------- API ---------------- */
  window.comparacaoUnidadesHTML = html;
  window.attachComparacaoUnidades = function(){ render(); };
  window.comparacaoUnidadesRefresh = function(){ D = carregar(); render(); };
  window.__cu = {lerSSW, num, estado: () => D, contexto};
})();
