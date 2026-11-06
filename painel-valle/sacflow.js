/* =====================================================================
   SACFLOW - Visão operacional > SacFlow
   Dashboard de gestão do SAC (Do Valle) alimentado por texto estruturado exportado do SacFlow.
   Telas: Visão Geral · Atendentes (+ painel individual) · SLA e Violações · Transferências ·
          Avaliações · Evolução · Atendimentos · Importar · Fórmulas e Metas.
   Depende de sacflow-core.js (importação, normalização e cálculos).
   ===================================================================== */
(function(){
  "use strict";
  const SF = window.SF;
  if(!SF) return;

  /* ---------------- utilitários ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const ND = '<span class="sf-nd">não informado</span>';
  const nf = (n, d = 0) => n == null ? null : n.toLocaleString("pt-BR", {minimumFractionDigits: d, maximumFractionDigits: d});
  const pct = (x, d = 1) => x == null ? ND : nf(x, d) + "%";
  const num = (x, d = 0) => x == null ? ND : nf(x, d);
  const nota = x => x == null ? ND : nf(x, 2);
  const fd = iso => { if(!iso) return ""; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}` + (iso.length > 10 ? " " + iso.slice(11, 16) : ""); };
  const fdc = iso => { if(!iso) return ""; const [, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}`; };
  const pp = x => x == null ? "—" : (x > 0 ? "+" : "") + nf(x, 1) + " p.p.";
  const varPct = (a, b) => (b ? (a - b) / b * 100 : null);
  const plural = (n, s, p) => n === 1 ? s : p;
  const ELID = "sec-sacflow";
  const MINTXT = "Poucos registros: leia com cautela";
  const COR = {g: "#4f9d2d", b: "#2f78b8", a: "#b57508", r: "#cf3d35", k: "#667360"};

  /* ---------------- estado da tela ---------------- */
  const V = {
    tab: "geral", att: null, gran: "dia",
    F: {de: "", ate: "", att: "", dep: "", canal: "", stg: ""},
    ord: {}, busca: {}, lim: {}, modal: "",
    imp: {texto: "", nome: "", res: null, valido: null, edit: null, msg: ""}
  };
  let DS = {}, TB = {}, CTX = null;
  let SOMENTE = null;   // quando definido (Set de chaves de atendente), o modo RESUMO considera só esses atendentes

  const TABS = [
    ["geral", "Visão Geral"], ["atendentes", "Atendentes"], ["sla", "SLA e Violações"], ["transf", "Transferências"],
    ["aval", "Avaliações"], ["evolucao", "Evolução"], ["atend", "Atendimentos"], ["importar", "Importar"], ["formulas", "Fórmulas e Metas"]
  ];
  const SEM_FILTRO = ["importar", "formulas"];
  const F_ATT_DET = () => !!V.F.att;   // com um atendente filtrado (que tem detalhe) não se acrescenta o bloco consolidado

  /* ---------------- metas (só valem se configuradas) ---------------- */
  const metas = () => SF.S.metas || {};
  const minReg = () => (metas().minReg != null ? metas().minReg : 5);
  function tagMeta(v, chave, tipo){
    const m = metas()[chave];
    if(v == null || m == null) return "";
    const ok = tipo === "max" ? v <= m : v >= m;
    return ok ? `<span class="sf-tag ok" title="Meta configurada: ${tipo === "max" ? "até " : "mínimo "}${nf(m, 2)}">✓ dentro da meta</span>`
              : `<span class="sf-tag bad" title="Meta configurada: ${tipo === "max" ? "até " : "mínimo "}${nf(m, 2)}">✕ fora da meta</span>`;
  }

  /* ---------------- blocos visuais ---------------- */
  function drill(titulo, cols, rows){
    const id = "d" + Object.keys(DS).length;
    DS[id] = {titulo, cols, rows};
    return id;
  }
  function kpi(label, valor, sub, o = {}){
    const at = o.drill ? ` data-sf="drill" data-v="${o.drill}" tabindex="0" role="button" title="Ver os registros que compõem este número"` : "";
    const bar = o.bar != null ? `<span class="sf-meter"><i style="width:${Math.max(0, Math.min(100, o.bar))}%"></i></span>` : "";
    return `<div class="sf-kpi ${o.tom || ""} ${o.cls || ""} ${o.drill ? "sf-click" : ""}"${at}><span class="l">${esc(label)}</span><b>${valor}</b>${bar}<small>${sub || ""}</small></div>`;
  }
  const semTags = h => String(h == null ? "" : h).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  function secao(titulo, corpo, o = {}){
    const info = o.nota ? `<span class="sf-info" tabindex="0" aria-label="${esc(semTags(o.nota))}" data-tip="${esc(semTags(o.nota))}">i</span>` : "";
    return `<section class="sf-box ${o.cls || ""}" ${o.id ? `id="${o.id}"` : ""}><header><h3>${esc(titulo)}</h3>${info}${o.acao ? `<div class="sf-acao">${o.acao}</div>` : ""}</header>${corpo}</section>`;
  }
  const vazio = txt => `<div class="sf-vazio">${txt}</div>`;
  const aviso = (txt, tom = "") => `<div class="sf-aviso ${tom}">${txt}</div>`;

  function barsH(itens, o = {}){
    if(!itens.length) return vazio("Sem dados para este filtro.");
    const mx = o.max != null ? o.max : Math.max(...itens.map(i => i.v), 1);
    return `<div class="sf-bars">${itens.map(i => `
      <div class="sf-bar" ${i.attr || ""}><span class="n" title="${esc(i.l)}">${esc(i.l)}</span>
        <span class="t"><i style="width:${Math.max(0, Math.min(100, i.v / mx * 100))}%;background:${i.cor || COR.g}"></i></span>
        <span class="v">${i.txt != null ? i.txt : nf(i.v)}${i.sub ? `<em>${i.sub}</em>` : ""}</span></div>`).join("")}</div>`;
  }

  function lineChart(series, o = {}){
    const xs = [...new Set(series.flatMap(s => s.pts.map(p => p.x)))].sort();
    if(!xs.length) return vazio("Sem dados no período.");
    const W = 680, H = o.h || 210, L = 46, R = 14, T = 14, B = 30;
    const vals = series.flatMap(s => s.pts.filter(p => p.y != null).map(p => p.y));
    if(!vals.length) return vazio("Sem valores calculáveis neste período.");
    let mn = o.min != null ? o.min : 0, mx = o.max != null ? o.max : Math.max(...vals) * 1.1;
    if(mx <= mn) mx = mn + 1;
    const X = i => xs.length === 1 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (xs.length - 1);
    const Y = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
    const fmt = o.fmt || (v => nf(v, 0));
    let g = "";
    for(let i = 0; i <= 4; i++){
      const v = mn + (mx - mn) * i / 4, y = Y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="ax">${esc(fmt(v))}</text>`;
    }
    const passo = Math.max(1, Math.ceil(xs.length / 8));
    xs.forEach((x, i) => { if((i % passo === 0 && (xs.length - 1 - i >= passo * 0.7 || i === xs.length - 1)) || i === xs.length - 1) g += `<text x="${X(i)}" y="${H - 9}" text-anchor="middle" class="ax">${esc(o.xl ? o.xl(x) : x)}</text>`; });
    const body = series.map((s, si) => {
      const mapa = new Map(s.pts.map(p => [p.x, p]));
      let d = "", pen = false, circ = "";
      xs.forEach((x, i) => {
        const p = mapa.get(x);
        if(!p || p.y == null){ pen = false; return; }
        d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1) + " "; pen = true;
        circ += `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.4" fill="${s.cor}"><title>${esc(s.nome)} · ${esc(o.xl ? o.xl(x) : x)}: ${esc(fmt(p.y))}${p.t ? " (" + esc(p.t) + ")" : ""}</title></circle>`;
      });
      return `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2.2" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>${circ}`;
    }).join("");
    const leg = series.length > 1 ? `<div class="sf-leg">${series.map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join("")}</div>` : "";
    return `<div class="sf-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.alt || "Gráfico de linhas")}">${g}${body}</svg>${leg}</div>`;
  }

  function colChart(pts, o = {}){
    if(!pts.length) return vazio("Sem dados no período.");
    const W = 680, H = o.h || 190, L = 40, R = 10, T = 12, B = 28;
    const mx = Math.max(...pts.map(p => p.v), 1);
    const bw = (W - L - R) / pts.length;
    let g = "";
    for(let i = 0; i <= 3; i++){
      const v = mx * i / 3, y = T + (H - T - B) * (1 - i / 3);
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 5}" y="${y + 4}" text-anchor="end" class="ax">${nf(v, 0)}</text>`;
    }
    const passo = Math.max(1, Math.ceil(pts.length / 10));
    const bars = pts.map((p, i) => {
      const h = (H - T - B) * p.v / mx, x = L + i * bw + bw * 0.12, y = T + (H - T - B) - h;
      const lab = ((i % passo === 0 && (pts.length - 1 - i >= passo * 0.7)) || i === pts.length - 1) ? `<text x="${x + bw * 0.38}" y="${H - 9}" text-anchor="middle" class="ax">${esc(o.xl ? o.xl(p.x) : p.x)}</text>` : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="2" fill="${o.cor || COR.g}"><title>${esc(o.xl ? o.xl(p.x) : p.x)}: ${nf(p.v)}</title></rect>${lab}`;
    }).join("");
    return `<div class="sf-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.alt || "Gráfico de colunas")}">${g}${bars}</svg></div>`;
  }

  /* ---------------- tabelas (ordenar, buscar, exportar) ---------------- */
  const cmp = (a, b) => {
    if(a == null && b == null) return 0;
    if(a == null) return 1;
    if(b == null) return -1;
    if(typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "pt-BR", {numeric: true});
  };
  function tabela(id, cols, rows, o = {}){
    let R = rows.slice();
    const q = sem(V.busca[id] || "");
    if(o.busca && q) R = R.filter(r => cols.some(c => sem(String(c.v(r) == null ? "" : c.v(r))).includes(q)));
    const ord = V.ord[id] || o.ord;
    if(ord){
      const c = cols.find(c => c.k === ord.k);
      if(c) R.sort((a, b) => { const x = c.v(a), y = c.v(b); if(x == null || y == null) return cmp(x, y); return cmp(x, y) * ord.dir; });
    }
    TB[id] = {cols, rows: R};
    const lim = V.lim[id] || o.lim || 50, vis = R.slice(0, lim);
    const th = cols.map(c => {
      const a = ord && ord.k === c.k ? (ord.dir > 0 ? " ▲" : " ▼") : "";
      return `<th class="${c.num ? "r" : ""}" data-sf="sort" data-v="${id}:${c.k}" title="Ordenar por ${esc(c.l)}" aria-sort="${ord && ord.k === c.k ? (ord.dir > 0 ? "ascending" : "descending") : "none"}">${esc(c.l)}${a}</th>`;
    }).join("");
    const tr = vis.map(r => `<tr ${o.row ? o.row(r) : ""} class="${o.row ? "sf-click" : ""}">${cols.map(c => {
      const v = c.v(r);
      const h = c.h ? c.h(r) : (v == null || v === "" ? (c.num ? ND : '<span class="sf-mut">—</span>') : esc(typeof v === "number" ? nf(v, c.d != null ? c.d : (Number.isInteger(v) ? 0 : 2)) : v));
      return `<td class="${c.num ? "r" : ""}">${h}</td>`;
    }).join("")}</tr>`).join("");
    const busca = o.busca ? `<input type="search" class="sf-q" id="sf-q-${id}" data-sf-q="${id}" placeholder="${esc(o.busca)}" value="${esc(V.busca[id] || "")}">` : "";
    return `<div class="sf-tbl ${o.cls || ""}">
      <div class="sf-tbar">${busca}<span class="c">${R.length} ${plural(R.length, "registro", "registros")}${q ? " (filtrado pela busca)" : ""}</span>
        ${R.length ? `<button type="button" class="sf-btn mini" data-sf="csv" data-v="${id}">Exportar CSV</button>` : ""}</div>
      ${R.length ? `<div class="sf-scroll"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody>${o.foot ? `<tfoot>${o.foot}</tfoot>` : ""}</table></div>` : vazio(o.vazio || "Nenhum registro para este filtro.")}
      ${R.length > lim ? `<div class="sf-more"><button type="button" class="sf-btn mini" data-sf="mais" data-v="${id}">Mostrar mais (${R.length - lim} restantes)</button></div>` : ""}
    </div>`;
  }
  const sem = SF.sem;
  const linkAt = id => `<a href="#" class="sf-lk" data-sf="openat" data-v="${esc(id)}">${esc(id)}</a>`;
  const linkAtt = ak => `<a href="#" class="sf-lk" data-sf="attsel" data-v="${esc(ak)}">${esc(SF.nomeDe(ak))}</a>`;

  /* ---------------- filtros ---------------- */
  function contexto(){
    const F = V.F, N = SF.norm();
    const Dsp = SF.filtDim(F);
    const D = SF.noPeriodo(Dsp, F.de, F.ate);
    CTX = {N, F, Dsp, D, eq: SF.stats(D, null)};
    return CTX;
  }
  function limitesDados(){
    const N = SF.norm(), ds = [];
    [N.atend, N.sla, N.aval, N.transf].forEach(a => a.forEach(r => { if(r.d) ds.push(r.d); }));
    N.resumo.forEach(r => { if(r.per){ ds.push(r.per.ini); ds.push(r.per.fim); } });
    if(!ds.length) return null;
    return {min: ds.reduce((a, b) => a < b ? a : b), max: ds.reduce((a, b) => a > b ? a : b)};
  }
  function filtroHTML(soRes, meta){
    const N = CTX.N, F = V.F;
    const sel = (f, rot, opts) => `<label>${rot}<select data-f="${f}"><option value="">Todos</option>${opts.map(o => `<option value="${esc(o[0])}" ${F[f] === o[0] ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></label>`;
    const ativo = F.de || F.ate || F.att || (!soRes && (F.dep || F.canal || F.stg));
    return `<div class="sf-filtros">
      <label>De<input type="date" data-f="de" value="${esc(F.de)}"></label>
      <label>Até<input type="date" data-f="ate" value="${esc(F.ate)}"></label>
      ${sel("att", "Atendente", N.atts.map(a => [a.k, a.nome]))}
      ${soRes ? "" : sel("dep", "Departamento", N.deps.map(d => [d, d]))}
      ${soRes ? "" : sel("canal", "Canal", N.canais.map(d => [d, d]))}
      ${soRes ? "" : sel("stg", "Status", [["concluido", "Concluído"], ["aberto", "Aberto"], ["pendente", "Pendente"], ["outro", "Outro"], ["nd", "Não informado"]])}
      <div class="rapido"><button type="button" class="sf-btn mini" data-sf="quick" data-v="mes">Último mês</button>
        <button type="button" class="sf-btn mini" data-sf="quick" data-v="mesant">Mês anterior</button>
        ${ativo ? `<button type="button" class="sf-btn mini ghost" data-sf="limpar">Limpar</button>` : ""}</div>
      ${meta ? `<span class="sf-meta">${meta}</span>` : ""}
      ${CTX.D.semData ? `<p class="sf-sd">${CTX.D.semData} ${plural(CTX.D.semData, "registro sem data foi", "registros sem data foram")} desconsiderado(s) pelo filtro de período.</p>` : ""}
    </div>`;
  }

  /* ---------------- estrutura da página ---------------- */
  const TABS_CFG = ["importar", "formulas"];
  function html(){
    const N = SF.norm();
    const tab = V.tab;
    const temDados = N.atend.length || N.sla.length || N.aval.length || N.transf.length || N.resumo.length;
    const imps = SF.S.imports.length;
    const meta = temDados ? `${imps} ${plural(imps, "importação", "importações")} · atualizado ${esc(fd((SF.S.imports[imps - 1] || {}).em))}` : "";
    let corpo;
    if(SEM_FILTRO.includes(tab)){
      corpo = tab === "importar" ? telaImportar() : telaFormulas();
    }else if(!temDados){
      corpo = vazioGeral();
    }else{
      contexto();
      const temDet = N.atend.length || N.sla.length || N.aval.length || N.transf.length;
      /* atendentes que só têm indicadores consolidados (@RESUMO), sem linhas detalhadas */
      const detAks = new Set([].concat(N.atend, N.sla, N.aval).map(x => x.ak).concat(N.transf.map(x => SF.nkey(x.att || ""))));
      const resAks = [...new Set(N.resumo.map(r => r.ak))].filter(k => !detAks.has(k));
      const alvo = V.att || V.F.att;
      const soRes = !temDet || (alvo && resAks.includes(alvo));
      if(soRes) corpo = filtroHTML(true, "") + ((V.att && tab === "atendentes") ? painelResumoInd(V.att) : telaSoResumo(tab));
      else if(V.att && tab === "atendentes") corpo = filtroHTML(false, "") + painelIndividual(V.att);
      else{
        corpo = filtroHTML(false, "") + ({geral: telaGeral, atendentes: telaAtendentes, sla: telaSLA, transf: telaTransf, aval: telaAval, evolucao: telaEvolucao, atend: telaAtendimentos}[tab] || telaGeral)();
        /* importação mista: os atendentes só com @RESUMO também precisam aparecer */
        if(resAks.length && !F_ATT_DET() && ["geral", "sla", "transf", "atendentes"].includes(tab)){
          SOMENTE = new Set(resAks);
          try{
            const nomes = resAks.map(k => esc(SF.nomeDe(k))).join(", ");
            corpo += `<div class="sf-misto">${aviso(`<b>Indicadores consolidados (@RESUMO)</b> — ${nomes} ${resAks.length > 1 ? "vieram" : "veio"} sem lista de atendimentos. Os números aparecem separados abaixo e <b>não entram</b> nos cartões e gráficos acima, que são calculados só dos atendimentos detalhados.`, "warn")}${telaSoResumo(tab)}</div>`;
          }catch(e){ console.error(e); }
          finally{ SOMENTE = null; }
        }
      }
    }
    const lim = temDados ? limitesDados() : null;
    const per = lim ? `${fd(lim.min)} a ${fd(lim.max)}` : "";
    const cab = `<header class="sf-head"><img src="sacflow-logo.png" alt="SacFlow" class="sf-logo"><div class="ttl"><h2>Gestão do SAC</h2><p>Indicadores de atendimento e SLA da equipe</p></div>
      <div class="info">${per ? `<span class="pill"><small>Período dos dados</small><b>${per}</b></span>` : ""}${meta ? `<span class="pill"><small>Base</small><b>${meta}</b></span>` : ""}</div></header>`;
    const btn = t => `<button type="button" role="tab" class="${tab === t[0] ? "on" : ""}" data-sf="tab" data-v="${t[0]}">${t[1]}</button>`;
    return `<div class="sf-wrap">
      ${cab}
      <nav class="sf-tabs" role="tablist">
        <div class="grp">${TABS.filter(t => !TABS_CFG.includes(t[0])).map(btn).join("")}</div>
        <div class="grp cfg">${TABS.filter(t => TABS_CFG.includes(t[0])).map(btn).join("")}</div>
      </nav>
      <div class="sf-corpo">${corpo}</div>
      ${V.modal ? `<div class="sf-modal" data-sf="fechar"><div class="sf-modal-c" role="dialog" aria-modal="true">${V.modal}</div></div>` : ""}
    </div>`;
  }
  function vazioGeral(){
    return `<div class="sf-start"><img src="sacflow-icon.png" alt="" class="sf-start-ic"><h3>Ainda não há dados do SacFlow</h3>
      <p>Cole na aba <b>Importar</b> o texto estruturado extraído do SacFlow. Todos os gráficos, rankings e painéis individuais são calculados a partir dele — nada é preenchido automaticamente.</p>
      <button type="button" class="sf-btn pri" data-sf="tab" data-v="importar">Ir para Importar</button></div>`;
  }


  /* ---------------- MODO RESUMO: indicadores registrados por atendente (@RESUMO) ----------------
     Usado quando a importação traz só os números consolidados do SacFlow (sem lista de atendimentos).
     Contagens são somadas; percentuais da equipe são recalculados (nunca média de percentuais). */
  const RK = {eventos: "sla_eventos", atSla: "atendimentos_com_sla", pct: "sla_cumprimento_percentual", viol: "violacoes_sla", transf: "transferencias",
    pr: {pct: "primeira_resposta_cumprimento_percentual", viol: "primeira_resposta_violacoes", t: "primeira_resposta_tempo_medio_segundos"},
    tr: {pct: "tempo_resposta_cumprimento_percentual", viol: "tempo_resposta_violacoes", t: "tempo_resposta_medio_segundos"},
    rs: {pct: "resolucao_cumprimento_percentual", viol: "resolucao_violacoes", t: "tempo_resolucao_medio_segundos"}};
  /* nomes alternativos aceitos no @RESUMO (modelo exportado do SacFlow) -> nome interno */
  const RK_ALIAS = {
    cumprimento_de_sla: RK.pct, cumprimento_sla: RK.pct, sla_cumprimento: RK.pct,
    tickets_com_registro_de_sla: RK.atSla, atendimentos_com_registro_de_sla: RK.atSla,
    transferencias_registradas: RK.transf, total_de_transferencias: RK.transf,
    sla_primeira_resposta: RK.pr.pct, sla_respostas_subsequentes: RK.tr.pct, sla_resposta: RK.tr.pct, sla_tempo_de_resposta: RK.tr.pct, sla_resolucao: RK.rs.pct,
    total_de_atendimentos_iniciados: "iniciados", atendimentos_iniciados: "iniciados", total_de_atendimentos: "iniciados",
    avaliacao_media: "aval_media", media_de_avaliacao: "aval_media", media_avaliacao: "aval_media", nota_media: "aval_media",
    total_de_avaliacoes_recebidas: "aval_n", avaliacoes_recebidas: "aval_n", total_de_avaliacoes: "aval_n",
    avaliacoes_negativas: "aval_neg", total_de_avaliacoes_negativas: "aval_neg",
    atendimentos_considerados_no_relatorio_de_avaliacoes: "aval_base", atendimentos_considerados_nas_avaliacoes: "aval_base"
  };
  const TIPOS = [["pr", "Primeira resposta"], ["tr", "Tempo de resposta"], ["rs", "Resolução"]];
  const somaN = arr => { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  function segs(x){
    if(x == null) return null;
    x = Math.round(x);
    if(x < 60) return x + " s";
    if(x < 3600) return Math.floor(x / 60) + " min " + (x % 60 ? (x % 60) + " s" : "");
    const h = Math.floor(x / 3600), m = Math.round((x % 3600) / 60);
    return h + " h " + (m ? m + " min" : "");
  }
  function unidadesResumo(){
    const F = V.F, g = new Map();
    CTX.N.resumo.forEach(r => {
      if(F.att && r.ak !== F.att) return;
      if(SOMENTE && !SOMENTE.has(r.ak)) return;
      if(F.de || F.ate){
        if(!r.per) return;
        if((F.ate && r.per.ini > F.ate) || (F.de && r.per.fim < F.de)) return;
      }
      const k = r.ak + "|" + (r.per ? r.per.ini + r.per.fim : "");
      if(!g.has(k)) g.set(k, {ak: r.ak, att: r.att, per: r.per, v: {}});
      const ck = SF.chave(r.chave);
      g.get(k).v[ck] = r.num;
      if(RK_ALIAS[ck] && g.get(k).v[RK_ALIAS[ck]] == null) g.get(k).v[RK_ALIAS[ck]] = r.num;
    });
    const porAt = new Map();
    [...g.values()].forEach(u => { if(!porAt.has(u.ak)) porAt.set(u.ak, []); porAt.get(u.ak).push(u); });
    const unidades = [];
    porAt.forEach(l => {
      l.sort((a, b) => (a.per ? a.per.ini : "") < (b.per ? b.per.ini : "") ? -1 : 1);
      const cl = [];
      l.forEach(u => {
        const c = cl[cl.length - 1];
        if(c && u.per && c.per && u.per.ini <= c.per.fim){ c.m.push(u); if(u.per.fim > c.per.fim) c.per = {ini: c.per.ini, fim: u.per.fim}; }
        else cl.push({per: u.per ? {ini: u.per.ini, fim: u.per.fim} : null, m: [u]});
      });
      cl.forEach(c => {
        const ms = c.m.slice().sort((a, b) => ((a.per ? a.per.fim : "") + (a.per ? a.per.ini : "")) < ((b.per ? b.per.fim : "") + (b.per ? b.per.ini : "")) ? -1 : 1), v = {};
        ms.forEach(m => Object.keys(m.v).forEach(k => { if(m.v[k] != null) v[k] = m.v[k]; }));   // sobreposição: o período mais recente prevalece, sem somar duas vezes
        unidades.push({ak: ms[0].ak, att: ms[ms.length - 1].att, per: c.per, v});
      });
    });
    return unidades.map(u => {
      const v = u.v, o = {ak: u.ak, att: u.att, per: u.per, eventos: v[RK.eventos], atSla: v[RK.atSla], viol: v[RK.viol], transf: v[RK.transf], pct: v[RK.pct], iniciados: v.iniciados, avalMedia: v.aval_media, avalN: v.aval_n, avalNeg: v.aval_neg, avalBase: v.aval_base, tipos: {}, avisos: []};
      TIPOS.forEach(([t, nome]) => {
        const pc = v[RK[t].pct], vi = v[RK[t].viol], tm = v[RK[t].t];
        const n = (pc != null && vi != null && pc < 100) ? Math.round(vi / (1 - pc / 100)) : null;   // eventos do tipo, derivados de violações ÷ (1 − cumprimento)
        o.tipos[t] = {pct: pc, viol: vi, tempo: tm, n};
      });
      const sv = somaN(TIPOS.map(([t]) => o.tipos[t].viol));
      if(o.viol != null && sv != null && sv !== o.viol) o.avisos.push(`violações totais (${o.viol}) ≠ soma por tipo (${sv})`);
      if(o.eventos && o.viol != null && o.pct != null && Math.abs((o.eventos - o.viol) / o.eventos * 100 - o.pct) > 0.2) o.avisos.push(`cumprimento registrado (${nf(o.pct, 2)}%) ≠ calculado (${nf((o.eventos - o.viol) / o.eventos * 100, 2)}%)`);
      return o;
    });
  }
  function agrega(us){
    const pond = (L, f) => { const x = L.filter(u => f(u) != null && u.atSla); const w = x.reduce((a, u) => a + u.atSla, 0); return w ? x.reduce((a, u) => a + f(u) * u.atSla, 0) / w : null; };
    const A = {n: us.length, iniciados: somaN(us.map(u => u.iniciados)), avalN: somaN(us.map(u => u.avalN)), avalNeg: somaN(us.map(u => u.avalNeg)), avalBase: somaN(us.map(u => u.avalBase)), eventos: somaN(us.map(u => u.eventos)), atSla: somaN(us.map(u => u.atSla)), viol: somaN(us.map(u => u.viol)), transf: somaN(us.map(u => u.transf)), tipos: {}};
    const am = us.filter(u => u.avalMedia != null && u.avalN);
    A.avalMedia = am.length ? am.reduce((a, u) => a + u.avalMedia * u.avalN, 0) / am.reduce((a, u) => a + u.avalN, 0) : (us.length === 1 ? us[0].avalMedia : null);
    A.pct = (A.eventos && A.viol != null) ? (A.eventos - A.viol) / A.eventos * 100 : (us.length === 1 ? us[0].pct : pond(us, u => u.pct));
    TIPOS.forEach(([t]) => {
      const L = us.map(u => u.tipos[t]), viol = somaN(L.map(x => x.viol)), todosN = L.length && L.every(x => x.n != null);
      const n = todosN ? somaN(L.map(x => x.n)) : null;
      let pct = null, tempo = null;
      if(todosN && n) pct = (n - viol) / n * 100; else if(L.length === 1) pct = L[0].pct; else pct = pond(us.map((u, i) => ({atSla: u.atSla, p: L[i].pct})), x => x.p);
      if(todosN && n && L.every(x => x.tempo != null)) tempo = L.reduce((a, x) => a + x.tempo * x.n, 0) / n; else if(L.length === 1) tempo = L[0].tempo;
      A.tipos[t] = {pct, viol, tempo, n};
    });
    return A;
  }
  function linhasResumo(){
    const us = unidadesResumo(), por = new Map();
    us.forEach(u => { if(!por.has(u.ak)) por.set(u.ak, []); por.get(u.ak).push(u); });
    const rows = [...por.entries()].map(([ak, l]) => Object.assign(agrega(l), {ak, nome: SF.nomeDe(ak), unid: l}));
    return {us, rows, team: agrega(us)};
  }
  const tipoCel = (x, pctMeta) => x.pct == null ? ND : `${nf(x.pct, 1)}%${x.viol != null ? ` <small class="sf-n">(${x.viol} viol.)</small>` : ""}`;
  function tabelaResumo(rows){
    const team = agrega(unidadesResumo());
    const mr = minReg(), M = metas();
    const rank = new Map([...rows].filter(r => r.pct != null && (r.eventos != null ? r.eventos : r.atSla) != null && (r.eventos != null ? r.eventos : r.atSla) >= mr).sort((x, y) => y.pct - x.pct).map((r, i) => [r.ak, i + 1]));
    const heat = (p, ref) => p == null || ref == null ? "n" : (p >= ref ? "g" : (p >= ref - 10 ? "a" : "r"));
    const mark = {g: "▲", a: "●", r: "▼", n: ""};
    const cel = (x, ref) => {
      if(x.pct == null) return `<div class="sf-hm n"><b>${ND}</b></div>`;
      const c = heat(x.pct, ref);
      return `<div class="sf-hm ${c}"><b><i>${mark[c]}</i>${nf(x.pct, 1)}%</b><small>${x.viol != null ? x.viol + " viol." : "viol. n/i"}${x.tempo != null ? " · " + segs(x.tempo) : ""}</small></div>`;
    };
    const cols = [
      {k: "pos", l: "#", v: r => rank.get(r.ak) || null, h: r => rank.get(r.ak) ? `<span class="sf-pos p${Math.min(rank.get(r.ak), 4)}">${rank.get(r.ak)}º</span>` : '<span class="sf-mut" title="Menos de ' + mr + ' eventos: fora do ranking">—</span>'},
      {k: "nome", l: "Atendente", v: r => r.nome, h: r => `${linkAtt(r.ak)}<small class="sf-sub">${num(r.atSla)} atend. com SLA</small>`},
      {k: "sla", l: "SLA geral", v: r => r.pct, num: 1, h: r => {
        if(r.pct == null) return ND;
        const ref = M.slaMin != null ? M.slaMin : team.pct, c = heat(r.pct, ref);
        return `<div class="sf-sla ${c}"><b>${nf(r.pct, 1)}%</b><span class="bar"><i style="width:${Math.max(0, Math.min(100, r.pct))}%"></i></span><small>${num(r.eventos)} eventos${r.eventos != null && r.eventos < mr ? ' <span class="sf-warn" title="' + MINTXT + '">!</span>' : ""}</small></div>`;
      }},
      {k: "viol", l: "Violações", v: r => r.viol, num: 1, h: r => r.viol == null ? ND : `<b>${nf(r.viol, 0)}</b>${r.eventos ? `<small class="sf-sub r">${nf(r.viol / r.eventos * 100, 1)}% dos eventos</small>` : ""}`},
      {k: "pr", l: "1ª resposta", v: r => r.tipos.pr.pct, num: 1, h: r => cel(r.tipos.pr, team.tipos.pr.pct)},
      {k: "tr", l: "Tempo de resposta", v: r => r.tipos.tr.pct, num: 1, h: r => cel(r.tipos.tr, team.tipos.tr.pct)},
      {k: "rs", l: "Resolução", v: r => r.tipos.rs.pct, num: 1, h: r => cel(r.tipos.rs, team.tipos.rs.pct)},
      {k: "tf", l: "Transf.", v: r => r.transf, num: 1}
    ];
    const T = team.tipos;
    const foot = `<tr class="sf-team"><td></td><td><b>EQUIPE</b><small class="sf-sub">${num(team.atSla)} atend. com SLA</small></td>
      <td class="r"><div class="sf-sla"><b>${nf(team.pct, 1)}%</b><span class="bar"><i style="width:${team.pct || 0}%"></i></span><small>${num(team.eventos)} eventos</small></div></td>
      <td class="r"><b>${num(team.viol)}</b>${team.eventos ? `<small class="sf-sub r">${nf(team.viol / team.eventos * 100, 1)}% dos eventos</small>` : ""}</td>
      ${["pr", "tr", "rs"].map(t => `<td class="r"><div class="sf-hm n"><b>${pct(T[t].pct)}</b><small>${num(T[t].viol)} viol.${T[t].tempo != null ? " · " + segs(T[t].tempo) : ""}</small></div></td>`).join("")}
      <td class="r"><b>${num(team.transf)}</b></td></tr>`;
    return tabela("resumoatt", cols, rows, {busca: "Pesquisar atendente", row: r => `data-sf="attsel" data-v="${esc(r.ak)}"`, ord: {k: "sla", dir: -1}, foot, cls: "sf-perf"});
  }
  const legendaHeat = () => {
    const M = metas();
    return `<span class="sf-leg2"><span><i class="g"></i>≥ equipe</span><span><i class="a"></i>até 10 p.p. abaixo</span><span><i class="r"></i>&gt; 10 p.p. abaixo</span></span>`;
  };
  const barRes = (rows, f, o = {}) => barsH(rows.filter(r => f(r) != null).sort((a, b) => o.asc ? f(a) - f(b) : f(b) - f(a)).slice(0, 12).map(r => ({l: r.nome, v: f(r), txt: o.fmt ? o.fmt(f(r)) : nf(f(r), 1) + "%", sub: o.sub ? " " + o.sub(r) : "", cor: o.cor || COR.g, attr: `data-sf="attsel" data-v="${esc(r.ak)}"`})), {max: o.max});
  function conferencia(us){
    const l = us.filter(u => u.avisos.length);
    return l.length ? `<details class="sf-conf"><summary>Conferência dos números registrados <em>${l.length} ${plural(l.length, "aviso", "avisos")}</em></summary><ul>${l.map(u => `<li><b>${esc(u.att)}</b> — ${u.avisos.map(esc).join("; ")}</li>`).join("")}</ul></details>` : "";
  }
  /* ---------- componentes BI: gauge, anéis, ranking com meta ---------- */
  const stRef = (p, ref) => p == null || ref == null ? "" : (p >= ref ? "g" : (p >= ref - 10 ? "a" : "r"));
  function gaugeSVG(A){
    const M = metas(), p = A.pct, ref = M.slaMin, c = stRef(p, ref);
    const R = 88, cx = 130, cy = 120, len = Math.PI * R;
    const pt = (v, r) => [cx - r * Math.cos(Math.PI * v / 100), cy - r * Math.sin(Math.PI * v / 100)];
    const arc = (v0, v1, r) => { const a0 = pt(v0, r), a1 = pt(v1, r); return `M ${a0[0].toFixed(1)} ${a0[1].toFixed(1)} A ${r} ${r} 0 0 1 ${a1[0].toFixed(1)} ${a1[1].toFixed(1)}`; };
    const zonas = ref != null ? `<path d="${arc(0, Math.max(0, ref - 10), R + 15)}" class="gz r"/><path d="${arc(Math.max(0, ref - 10), ref, R + 15)}" class="gz a"/><path d="${arc(ref, 100, R + 15)}" class="gz g"/>` : "";
    const tick = ref != null ? (() => { const a = pt(ref, R - 12), b = pt(ref, R + 21), t = pt(ref, R + 30); return `<line class="gk" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/><text x="${t[0].toFixed(1)}" y="${(t[1] + 3).toFixed(1)}" class="gmeta" text-anchor="middle">${nf(ref, 0)}%</text>`; })() : "";
    const dot = p != null ? (() => { const d = pt(Math.max(0, Math.min(100, p)), R); return `<circle cx="${d[0].toFixed(1)}" cy="${d[1].toFixed(1)}" r="9" class="gdot"/>`; })() : "";
    const full = arc(0, 100, R);
    return `<div class="sf-gauge ${c}"><svg viewBox="0 0 260 146" role="img" aria-label="Cumprimento de SLA ${p == null ? "não informado" : nf(p, 1) + "%"}">
      ${zonas}<path d="${full}" class="gbg"/>${p == null || p <= 0 ? "" : `<path d="${arc(0, Math.min(100, p), R)}" class="gfg"/>`}${tick}${dot}
      <text x="${cx - R}" y="140" class="gax" text-anchor="middle">0%</text><text x="${cx}" y="26" class="gax" text-anchor="middle" style="display:none">50%</text><text x="${cx + R}" y="140" class="gax" text-anchor="middle">100%</text></svg>
      <div class="gv"><b>${p == null ? ND : nf(p, 1) + "<i>%</i>"}</b><span>Cumprimento geral</span></div></div>`;
  }
  function ringSVG(p, c){
    const r = 34, L = 2 * Math.PI * r;
    return `<svg viewBox="0 0 90 90" class="sf-ring ${c}"><circle cx="45" cy="45" r="${r}" class="rbg"/>${p == null ? "" : `<circle cx="45" cy="45" r="${r}" class="rfg" stroke-dasharray="${(L * Math.max(0, Math.min(100, p)) / 100).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 45 45)"/>`}<text x="45" y="50" text-anchor="middle" class="rt">${p == null ? "n/i" : nf(p, 1) + "%"}</text></svg>`;
  }
  function aneisTipo(A){
    const ref = metas().slaMin;
    return `<div class="sf-aneis">${TIPOS.map(([t, nome]) => {
      const x = A.tipos[t];
      return `<div class="an">${ringSVG(x.pct, stRef(x.pct, ref))}<b>${nome}</b>${x.pct == null ? "<span>não informado</span>" : ""}
        <small>${x.viol != null ? num(x.viol) + " " + plural(x.viol, "violação", "violações") : "violações n/i"}<br>tempo médio ${x.tempo != null ? segs(x.tempo) : "n/i"}</small></div>`;
    }).join("")}</div>`;
  }
  function rankSLA(rows, team){
    const L = rows.filter(r => r.pct != null).sort((a, b) => b.pct - a.pct);
    if(!L.length) return vazio("Sem dados de cumprimento.");
    const ref = metas().slaMin != null ? metas().slaMin : team.pct, refTxt = metas().slaMin != null ? "Meta " + nf(metas().slaMin, 1) + "%" : "Equipe " + (team.pct != null ? nf(team.pct, 1) + "%" : "");
    const lo = Math.max(0, Math.floor((Math.min(...L.map(r => r.pct), ref != null ? ref : 100) - 5) / 10) * 10), sc = v => Math.max(0, Math.min(100, (v - lo) / (100 - lo) * 100));
    const mr = minReg();
    const linhas = L.map(r => { const c = stRef(r.pct, ref), pouco = r.eventos != null && r.eventos < mr;
      return `<div class="rk ${pouco ? "pouco" : ""}" data-sf="attsel" data-v="${esc(r.ak)}" title="${pouco ? MINTXT : "Abrir painel individual"}"><span class="n">${esc(r.nome)}</span>
        <span class="t"><i class="${c}" style="width:${sc(r.pct).toFixed(1)}%"></i>${ref != null ? `<s class="mk" style="left:${sc(ref).toFixed(1)}%"></s>` : ""}</span>
        <span class="v"><b>${nf(r.pct, 1)}%</b><em>${r.eventos != null ? r.eventos + " ev." : ""}</em></span></div>`; }).join("");
    const ticks = [0, 1, 2, 3, 4].map(k => `<span>${nf(lo + k * (100 - lo) / 4, 0)}%</span>`).join("");
    return `<div class="sf-rank">${linhas}<div class="rk ax"><span></span><span class="t2">${ticks}</span><span></span></div>
      ${ref != null ? `<p class="lg"><s></s> ${esc(refTxt)}</p>` : ""}</div>`;
  }
  const ICO = {
    viol: '<svg viewBox="0 0 24 24"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/></svg>',
    ev: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.1"/></svg>',
    at: '<svg viewBox="0 0 24 24"><path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z"/></svg>',
    tr: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>'
  };
  function topoBI(A, rows){
    const M = metas(), ref = M.slaMin;
    const tile = (ico, l, v, sub, tom) => `<div class="sf-kpi ${tom || ""}"><span class="ic">${ICO[ico]}</span><span class="l">${l}</span><b>${v}</b><small>${sub || ""}</small></div>`;
    const ok = A.eventos != null && A.viol != null ? A.eventos - A.viol : null;
    const L = (rows || []).filter(r => r.pct != null && (r.eventos != null ? r.eventos : r.atSla) != null && (r.eventos != null ? r.eventos : r.atSla) >= minReg()).sort((x, y) => y.pct - x.pct);
    const melhor = L[0], menor = L.length > 1 ? L[L.length - 1] : null;
    const chip = ref != null && A.pct != null
      ? `<span class="sf-chip ${A.pct >= ref ? "ok" : "bad"}">${A.pct >= ref ? "▲" : "▼"} ${nf(Math.abs(A.pct - ref), 1)} p.p. ${A.pct >= ref ? "acima" : "abaixo"} da meta</span>`
      : (ref != null ? `<span class="sf-chip">Meta ${nf(ref, 1)}% · cumprimento não informado</span>` : `<span class="sf-chip">Meta não configurada</span>`);
    const lado = (cls, l, v, sub) => `<div class="hs ${cls}"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const split = ok != null && A.eventos ? `<div class="sf-split" title="${num(ok)} dentro do prazo · ${num(A.viol)} violados"><i class="ok" style="width:${(ok / A.eventos * 100).toFixed(2)}%"></i><i class="bad" style="width:${(A.viol / A.eventos * 100).toFixed(2)}%"></i></div>
      <div class="sf-split-l"><span><s class="ok"></s>Dentro do prazo <b>${num(ok)}</b></span><span><s class="bad"></s>Violados <b>${num(A.viol)}</b></span></div>` : "";
    return `<div class="sf-top">
      <section class="sf-box sf-hero"><header><h3>Cumprimento de SLA</h3>${chip}</header>
        <div class="hero-body">${gaugeSVG(A)}
          <div class="hero-side">
            ${ref != null ? lado("", "Meta", nf(ref, 1) + "%") : ""}
            ${melhor ? lado("up", "Melhor resultado", nf(melhor.pct, 1) + "%", esc(melhor.nome)) : ""}
            ${menor ? lado("dn", "Menor resultado", nf(menor.pct, 1) + "%", esc(menor.nome)) : ""}
          </div></div>${split}</section>
      <div class="sf-tiles">
        ${A.viol != null ? tile("viol", "Violações", num(A.viol), A.eventos && A.viol != null ? pct(A.viol / A.eventos * 100) + " dos eventos" : "", A.viol ? "bad" : "") : tile("at", "Atendimentos iniciados", num(A.iniciados), "registrado no SacFlow")}
        ${A.eventos != null ? tile("ev", "Eventos de SLA", num(A.eventos), "base do cumprimento") : tile("ev", "Avaliação média", A.avalMedia != null ? nf(A.avalMedia, 1) : ND, num(A.avalN) + " avaliações")}
        ${tile("at", "Atendimentos com SLA", num(A.atSla), "registrado no SacFlow")}
        ${tile("tr", "Transferências", num(A.transf), "total registrado")}
      </div></div>`;
  }
  function secaoAvalResumo(rows, team){
    const L = rows.filter(r => r.avalMedia != null || r.avalN != null);
    if(!L.length) return "";
    const taxa = r => (r.avalN != null && r.avalBase) ? r.avalN / r.avalBase * 100 : null;
    const cols = [
      {k: "nome", l: "Atendente", v: r => r.nome, h: r => linkAtt(r.ak)},
      {k: "m", l: "Avaliação média", v: r => r.avalMedia, num: 1, h: r => r.avalMedia == null ? ND : `<b>${nf(r.avalMedia, 1)}</b>${r.avalN != null && r.avalN < minReg() ? ' <span class="sf-warn" title="Poucas avaliações: média pouco representativa">!</span>' : ""}`},
      {k: "n", l: "Avaliações recebidas", v: r => r.avalN, num: 1, h: r => num(r.avalN)},
      {k: "neg", l: "Negativas", v: r => r.avalNeg, num: 1, h: r => r.avalNeg == null ? ND : `<span class="${r.avalNeg ? "sf-warn" : ""}">${num(r.avalNeg)}</span>`},
      {k: "b", l: "Atend. no relatório", v: r => r.avalBase, num: 1, h: r => num(r.avalBase)},
      {k: "t", l: "% que avaliou", v: taxa, num: 1, h: r => taxa(r) == null ? ND : nf(taxa(r), 1) + "%"}
    ];
    const foot = `<tr class="sf-team"><td><b>EQUIPE</b></td><td class="r"><b>${team.avalMedia != null ? nf(team.avalMedia, 2) : ND}</b></td><td class="r"><b>${num(team.avalN)}</b></td><td class="r"><b>${num(team.avalNeg)}</b></td><td class="r"><b>${num(team.avalBase)}</b></td><td class="r"><b>${team.avalBase ? nf(L.filter(r => r.avalBase).reduce((x, r) => x + (r.avalN || 0), 0) / team.avalBase * 100, 1) + "%" : ND}</b></td></tr>`;
    return secao("Avaliações dos clientes", tabela("avalres", cols, L, {busca: "Pesquisar atendente", row: r => `data-sf="attsel" data-v="${esc(r.ak)}"`, ord: {k: "m", dir: -1}, foot}), {nota: "Média da equipe ponderada pela quantidade de avaliações de cada atendente. Médias com poucas avaliações têm pouco peso estatístico."});
  }
  function kpisResumo(A, rotulo){
    const M = metas(), tom = M.slaMin != null && A.pct != null ? (A.pct >= M.slaMin ? "ok" : "bad") : "";
    return `<div class="sf-kpis">
      ${kpi("Cumprimento de SLA", pct(A.pct), `${A.viol != null && A.eventos ? num(A.eventos - A.viol) + " de " + num(A.eventos) + " no prazo" : ""} ${tagMeta(A.pct, "slaMin", "min")}`, {tom, bar: A.pct, cls: "hero"})}
      ${A.viol != null ? kpi("Violações", num(A.viol), A.eventos && A.viol != null ? pct(A.viol / A.eventos * 100) + " dos eventos" : "", {tom: A.viol ? "bad" : ""}) : kpi("Atendimentos iniciados", num(A.iniciados), "registrado no SacFlow")}
      ${A.eventos != null ? kpi("Eventos de SLA", num(A.eventos), "base do cumprimento") : ""}
      ${A.avalMedia != null ? kpi("Avaliação média", nf(A.avalMedia, 1), num(A.avalN) + " avaliações" + (A.avalNeg != null ? " · " + num(A.avalNeg) + " negativas" : "")) : ""}
      ${kpi("Atend. com SLA", num(A.atSla), "registrado no SacFlow")}
      ${kpi("Transferências", num(A.transf), "total registrado")}
    </div>`;
  }
  function tiposPanel(A){
    const M = metas();
    const cor = p => p == null ? "" : (M.slaMin == null ? "" : (p >= M.slaMin ? "g" : (p >= M.slaMin - 10 ? "a" : "r")));
    return `<div class="sf-tipos">${TIPOS.map(([t, nome]) => {
      const x = A.tipos[t], c = cor(x.pct);
      return `<div class="sf-tipo ${c}"><div class="h"><span>${nome}</span><b>${x.pct != null ? nf(x.pct, 1) + "%" : ND}</b></div>
        <span class="bar"><i style="width:${x.pct == null ? 0 : Math.max(0, Math.min(100, x.pct))}%"></i></span>
        <small>${x.viol != null ? num(x.viol) + " " + plural(x.viol, "violação", "violações") : "violações n/i"} · tempo médio ${x.tempo != null ? segs(x.tempo) : "n/i"}</small></div>`;
    }).join("")}</div>`;
  }
  function telaSoResumo(tab){
    const {rows, us, team} = linhasResumo();
    if(!rows.length) return aviso("Nenhum indicador registrado cai neste filtro (atendente/período).", "warn");
    const pers = [...new Set(us.map(u => u.per ? fd(u.per.ini) + " a " + fd(u.per.fim) : "não informado"))].join("; ");
    const fonte = `<p class="sf-fonte">Fonte: indicadores consolidados do SacFlow (@RESUMO) · totais e percentuais da equipe recalculados a partir das contagens · período: ${esc(pers)}.</p>`;
    if(tab === "aval" && rows.some(r => r.avalMedia != null || r.avalN != null)){
      return `${secaoAvalResumo(rows, team)}${secao("Média de avaliação por atendente", barRes(rows, r => r.avalMedia, {max: 5, fmt: v => nf(v, 1), cor: COR.g, sub: r => r.avalN != null ? "(" + r.avalN + " aval.)" : ""}))}${fonte}`;
    }
    if(tab === "atend" || tab === "aval" || tab === "evolucao"){
      return aviso({atend: "Não há lista de atendimentos na importação (seção @ATENDIMENTOS).", aval: "Não há avaliações na importação (seção @AVALIACOES ou coluna nota).", evolucao: "A evolução no tempo exige registros com data (@ATENDIMENTOS / @SLA). O @RESUMO traz apenas um valor por período."}[tab]) +
        (tab === "evolucao" ? secao("Períodos importados", tabela("per", [{k: "a", l: "Atendente", v: u => u.att}, {k: "p", l: "Período", v: u => u.per ? u.per.ini : null, h: u => u.per ? `${fd(u.per.ini)} a ${fd(u.per.fim)}` : ND}, {k: "pc", l: "Cumprimento SLA", v: u => u.pct, num: 1, h: u => pct(u.pct)}], us)) : "");
    }
    const maxV = Math.max(...rows.map(r => r.viol || 0), 1);
    const violBars = barRes(rows, r => r.viol, {fmt: v => nf(v, 0), cor: COR.r, max: maxV, sub: r => r.eventos ? nf(r.viol / r.eventos * 100, 1) + "%" : ""});
    if(tab === "transf"){
      return `${secao("Transferências por atendente", barRes(rows, r => r.transf, {fmt: v => nf(v, 0), cor: COR.a, max: Math.max(...rows.map(r => r.transf || 0), 1)}), {nota: `Total da equipe: ${num(team.transf)}. É o número registrado no SacFlow; para fluxo entre departamentos, motivos e atendimentos transferidos mais de uma vez, importe a seção @TRANSFERENCIAS.`})}${fonte}`;
    }
    if(tab === "sla"){
      const tipoRows = TIPOS.map(([t, nome]) => ({nome, ...team.tipos[t]}));
      const tabTipo = `<div class="sf-scroll"><table><thead><tr><th>Tipo de SLA</th><th class="r">Eventos*</th><th class="r">Violações</th><th class="r">Cumprimento</th><th class="r">Tempo médio</th></tr></thead><tbody>${tipoRows.map(t => `<tr><td><b>${t.nome}</b></td><td class="r">${num(t.n)}</td><td class="r">${num(t.viol)}</td><td class="r">${pct(t.pct)}</td><td class="r">${t.tempo != null ? segs(t.tempo) : ND}</td></tr>`).join("")}</tbody></table></div><p class="sf-nota">* Derivado: violações ÷ (1 − cumprimento do tipo). Tempo médio da equipe ponderado por esses eventos.</p>`;
      const porTipo = (t, nome) => secao("Cumprimento — " + nome, barRes(rows, r => r.tipos[t].pct, {max: 100, sub: r => (r.tipos[t].viol != null ? r.tipos[t].viol + " viol." : "")}));
      return `${kpisResumo(team)}
        <div class="sf-grid-imp">
          ${secao("Resultado por tipo de SLA", tabTipo)}
          ${secao("Violações por atendente", violBars)}
        </div>
        <div class="sf-grid3">${TIPOS.map(([t, nome]) => porTipo(t, nome.toLowerCase())).join("")}</div>
        ${secao("Resultado por atendente", tabelaResumo(rows), {acao: legendaHeat()})}${fonte}${conferencia(us)}`;
    }
    /* geral / atendentes */
    return `${topoBI(team, rows)}
      <div class="sf-grid-imp">
        ${secao("Ranking de cumprimento de SLA", rankSLA(rows, team), {nota: `Atendentes ordenados pelo cumprimento geral. O marcador vertical é a meta de SLA (ou a média da equipe, se não houver meta). Esmaecidos = menos de ${minReg()} eventos. Clique para abrir o painel individual.`})}
        ${secao("SLA por tipo", aneisTipo(team), {nota: "Cumprimento da equipe em cada tipo de SLA, com violações e tempo médio. A cor do anel segue a meta de SLA configurada (Fórmulas e Metas)."})}
      </div>
      ${secao("Desempenho por atendente", tabelaResumo(rows), {acao: legendaHeat(), nota: `Ordenado pelo SLA geral. Clique no nome ou na linha para abrir o painel individual. O ranking (#) considera só quem tem ao menos ${minReg()} eventos de SLA.`})}
      ${secaoAvalResumo(rows, team)}
      ${fonte}${conferencia(us)}`;
  }
  function painelResumoInd(ak){
    const {rows, team} = linhasResumo(), r = rows.find(x => x.ak === ak);
    const nome = SF.nomeDe(ak);
    if(!r) return `<button type="button" class="sf-btn" data-sf="voltar">← Voltar à lista</button>` + aviso(`Nenhum indicador de <b>${esc(nome)}</b> no filtro atual.`, "warn");
    const per = r.unid.map(u => u.per ? `${fd(u.per.ini)} a ${fd(u.per.fim)}` : "não informado").join("; ");
    const linhas = TIPOS.map(([t, rot]) => ({rot, a: r.tipos[t], e: team.tipos[t]}));
    const tab = `<div class="sf-scroll"><table class="sf-cmp"><thead><tr><th>Tipo de SLA</th><th class="r">Cumprimento</th><th class="r">Equipe</th><th class="r">Violações</th><th class="r">Tempo médio</th><th class="r">Tempo médio equipe</th></tr></thead><tbody>${linhas.map(l => `<tr><td>${l.rot}</td><td class="r">${pct(l.a.pct)}</td><td class="r">${pct(l.e.pct)}</td><td class="r">${num(l.a.viol)}</td><td class="r">${l.a.tempo != null ? segs(l.a.tempo) : ND}</td><td class="r">${l.e.tempo != null ? segs(l.e.tempo) : ND}</td></tr>`).join("")}</tbody></table></div>`;
    /* diagnóstico (fatos / correlações / hipóteses) */
    const fatos = [], bons = [], abaixo = [], hip = [], sug = [], M = metas();
    if(r.pct != null){
      const dif = team.pct != null ? r.pct - team.pct : null;
      fatos.push(`SLA geral: ${nf(r.pct, 1)}% (${r.viol} violações em ${r.eventos} eventos)${dif != null ? `; equipe ${nf(team.pct, 1)}% (${pp(dif)})` : ""}.`);
      if(M.slaMin != null) (r.pct >= M.slaMin ? bons : abaixo).push(`SLA ${nf(r.pct, 1)}% — meta mínima configurada ${nf(M.slaMin, 1)}%.`);
      else if(dif != null && dif >= 0 && r.eventos >= minReg()) bons.push(`SLA ${nf(r.pct, 1)}%, igual ou acima da equipe (${nf(team.pct, 1)}%).`);
    }
    const ordem = linhas.filter(l => l.a.pct != null).sort((a, b) => a.a.pct - b.a.pct);
    if(ordem.length > 1){
      fatos.push(`Pior cumprimento por tipo: ${ordem[0].rot} (${nf(ordem[0].a.pct, 1)}%); melhor: ${ordem[ordem.length - 1].rot} (${nf(ordem[ordem.length - 1].a.pct, 1)}%).`);
      if(team.tipos && ordem[0].e.pct != null && ordem[0].a.pct < ordem[0].e.pct - 5){
        hip.push(`Hipótese: o gargalo está em "${ordem[0].rot}" (${pp(ordem[0].a.pct - ordem[0].e.pct)} vs equipe). Os números consolidados não dizem a causa — confirme com os atendimentos detalhados.`);
        sug.push(`Priorizar "${ordem[0].rot}": ${ordem[0].rot === "Primeira resposta" ? "revisar tempo de espera na fila e distribuição de novas conversas" : ordem[0].rot === "Resolução" ? "revisar casos longos e dependências de outras áreas" : "revisar a cadência de resposta durante a conversa"}.`);
      }
    }
    TIPOS.forEach(([t, rot]) => { const a = r.tipos[t], e = team.tipos[t]; if(a.tempo != null && e.tempo != null && a.tempo > e.tempo * 1.5) fatos.push(`Tempo médio de ${rot.toLowerCase()}: ${segs(a.tempo)}, mais de 1,5× a equipe (${segs(e.tempo)}).`); });
    if(r.transf != null){
      fatos.push(`Transferências registradas: ${r.transf}${team.transf != null && team.n > 1 ? ` (equipe: ${team.transf} no total, ${nf(team.transf / team.n, 1)} por atendente em média)` : ""}.`);
      if(r.transf && r.atSla) fatos.push(`Há ${r.transf} transferências para ${r.atSla} atendimentos com SLA — mas o painel não sabe se são os mesmos atendimentos; não há taxa calculável sem a lista detalhada.`);
    }
    if(r.eventos != null && r.eventos < minReg()) fatos.push(`Atenção: apenas ${r.eventos} eventos de SLA — pouca sustentação para comparar.`);
    if(!sug.length) sug.push("Sem sugestão específica: os números consolidados não indicam um tipo de SLA muito fora da equipe. Importe os atendimentos detalhados para investigar as violações caso a caso.");
    const ul = (a, vz) => a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="sf-mut">${vz}</p>`;
    const stFake = {sla: {pct: r.pct}, transf: {taxa: null}, aval: {media: null}, mediaDia: null};
    return `<div class="sf-ind-topo">
        <button type="button" class="sf-btn" data-sf="voltar">← Todos os atendentes</button>
        <div class="sf-ind-nome"><h2>${esc(nome)}</h2><p>Período analisado: ${esc(per)}</p></div>
        <label class="sf-trocar">Trocar de atendente<select data-sf-trocar>${CTX.N.atts.map(x => `<option value="${esc(x.k)}" ${x.k === ak ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
      </div>
      ${aviso("Painel montado com os <b>indicadores consolidados</b> (@RESUMO) deste atendente. Lista de atendimentos, avaliações, mensagens e transferências detalhadas aparecem aqui quando forem importadas.")}
      ${secao("Resumo e comparação com a equipe", kpisResumo(r) + tab, {nota: "Equipe = recalculada somando as contagens de todos os atendentes do filtro."})}
      ${secao("Qualidade e oportunidades de melhoria", `<div class="sf-diag">
        <div class="c ok"><h4>Indicadores com bons resultados</h4>${ul(bons, "Nenhum indicador comparável acima da meta/equipe, ou meta não configurada.")}</div>
        <div class="c bad"><h4>Abaixo das metas configuradas</h4>${ul(abaixo, M.slaMin != null ? "Nenhum indicador abaixo da meta." : "Nenhuma meta configurada (aba Fórmulas e Metas).")}</div>
        <div class="c"><h4>Fatos comprovados nos dados</h4>${ul(fatos, "—")}</div>
        <div class="c"><h4>Hipóteses <small>(a validar)</small></h4>${ul(hip, "Sem hipóteses: os números consolidados não sustentam uma explicação.")}</div>
        <div class="c"><h4>Sugestões de melhoria</h4>${ul(sug, "—")}</div></div>` + planoAcao(ak, stFake))}`;
  }

  /* ---------------- VISÃO GERAL ---------------- */
  function cardsResumo(D, ak){
    const st = SF.stats(D, ak), sg = st.sla, tr = st.transf, av = st.aval, N = CTX.N;
    const L = (titulo, cols, rows) => drill(titulo, cols, rows);
    const A = ak ? D.atend.filter(r => r.ak === ak) : D.atend;
    const colsAt = ["ID", "Atendente", "Criado", "Departamento", "Canal", "Status"];
    const rowsAt = A.map(a => [a.id, SF.nomeDe(a.ak), fd(a.criado), a.dep, a.canal, a.status]);
    const Sl = ak ? D.sla.filter(r => r.ak === ak) : D.sla;
    const colsSl = ["ID", "Atendente", "Data", "Tipo de SLA", "Resultado", "Detalhe"];
    const rowsSl = f => Sl.filter(f).map(s => [s.id, SF.nomeDe(s.ak), fd(s.data || s.d), s.tipoRot, s.res === "ok" ? "Dentro do prazo" : "Violado", s.det]);
    const Tr = ak ? D.transf.filter(t => t.dk === ak || t.pk === ak || t.vk === ak) : D.transf;
    const Av = ak ? D.aval.filter(r => r.ak === ak) : D.aval;
    const cards = [
      kpi("Atendimentos", num(st.n), `${num(st.concluido)} concluídos · ${num(st.aberto)} abertos · ${num(st.pendente)} pendentes${st.outro + st.nd ? ` · ${st.outro + st.nd} sem classificação` : ""}`, {drill: L("Atendimentos", colsAt, rowsAt)}),
      kpi("Cumprimento de SLA", sg.n ? pct(sg.pct) : ND, sg.n ? `${sg.ok} dentro de ${sg.n} sujeitos ao SLA ${tagMeta(sg.pct, "slaMin", "min")}` : "sem registros de SLA", {tom: sg.n ? (metas().slaMin != null ? (sg.pct >= metas().slaMin ? "ok" : "bad") : "") : "", drill: sg.n ? L("Registros de SLA", colsSl, rowsSl(() => true)) : null}),
      kpi("Violações de SLA", sg.n ? num(sg.viol) : ND, sg.n ? `${pct(sg.n ? sg.viol / sg.n * 100 : null)} dos ${sg.n} sujeitos ao SLA` : "", {tom: sg.viol ? "bad" : "", drill: sg.viol ? L("Violações de SLA", colsSl, rowsSl(s => s.res === "viol")) : null}),
      kpi("Transferências", tr.eventos || tr.conhecidos ? num(tr.eventos) : ND, tr.conhecidos ? `${tr.atendTransf} de ${tr.conhecidos} atendimentos transferidos (${pct(tr.taxa)})${tr.multi ? ` · ${tr.multi} mais de 1×` : ""}` : "sem dados de transferência",
          {drill: Tr.length ? L("Transferências (eventos)", ["ID", "Data", "De", "Para", "Origem", "Destino", "Motivo"], Tr.map(t => [t.id, fd(t.data || t.d), t.de, t.para, t.depO, t.depD, t.motivo])) : null}),
      kpi("Nota média", av.n ? nota(av.media) : ND, av.n ? `${av.n} ${plural(av.n, "avaliação", "avaliações")} · ${av.pos} pos. · ${av.neu} neutras · ${av.neg} neg. ${tagMeta(av.media, "notaMin", "min")}` : "sem avaliações",
          {drill: av.n ? L("Avaliações", ["ID", "Atendente", "Data", "Nota", "Comentário"], Av.map(v => [v.id, SF.nomeDe(v.ak), fd(v.data || v.d), nf(v.nota, 1), v.coment])) : null}),
      kpi("Taxa de resposta às pesquisas", av.resp != null ? pct(av.resp) : ND, av.resp != null ? `${av.pesqRespondidas} de ${av.pesqEnviadas} pesquisas enviadas` : "exige a coluna pesquisa_enviada nos atendimentos")
    ];
    return {html: `<div class="sf-kpis">${cards.join("")}</div>`, st};
  }

  function rankings(D){
    const N = CTX.N, mr = minReg();
    const ativos = N.atts.map(a => ({k: a.k, nome: a.nome, s: SF.stats(D, a.k)})).filter(x => x.s.n || x.s.sla.n || x.s.aval.n);
    const slaR = ativos.filter(x => x.s.sla.n >= mr), avR = ativos.filter(x => x.s.aval.n >= mr);
    const excl = ativos.length - Math.max(slaR.length, 0);
    const melhores = [...slaR].sort((a, b) => b.s.sla.pct - a.s.sla.pct).slice(0, 5).map(x => ({l: x.nome, v: x.s.sla.pct, txt: pct(x.s.sla.pct), sub: ` ${x.s.sla.n} reg.`, cor: COR.g, attr: `data-sf="attsel" data-v="${esc(x.k)}"`}));
    const piores = [...slaR].sort((a, b) => (b.s.sla.viol / b.s.sla.n) - (a.s.sla.viol / a.s.sla.n)).filter(x => x.s.sla.viol).slice(0, 5).map(x => ({l: x.nome, v: x.s.sla.viol / x.s.sla.n * 100, txt: pct(x.s.sla.viol / x.s.sla.n * 100), sub: ` ${x.s.sla.viol} de ${x.s.sla.n}`, cor: COR.r, attr: `data-sf="attsel" data-v="${esc(x.k)}"`}));
    const notas = [...avR].sort((a, b) => b.s.aval.media - a.s.aval.media).slice(0, 5).map(x => ({l: x.nome, v: x.s.aval.media, txt: nota(x.s.aval.media), sub: ` ${x.s.aval.n} aval.`, cor: COR.b, attr: `data-sf="attsel" data-v="${esc(x.k)}"`}));
    return {melhores, piores, notas, mr, excl: ativos.length - slaR.length, ativos: ativos.length};
  }

  function telaGeral(){
    const {D, Dsp, eq} = CTX;
    const {html: cards, st} = cardsResumo(D, null);
    const gran = granAuto(D);
    const sr = SF.serie(D, null, gran);
    const cm = SF.comparativoMensal(Dsp);

    const porAtt = CTX.N.atts.map(a => ({a, s: SF.stats(D, a.k)})).filter(x => x.s.n).sort((x, y) => y.s.n - x.s.n)
      .map(x => ({l: x.a.nome, v: x.s.n, attr: `data-sf="attsel" data-v="${esc(x.a.k)}"`}));
    const barsFrom = arr => arr.slice(0, 8).map(x => ({l: x.k, v: x.v}));

    const evol = lineChart([{nome: "Atendimentos", cor: COR.g, pts: sr.map(p => ({x: p.k, y: p.vol}))}], {xl: x => xlab(x, gran), alt: "Atendimentos ao longo do tempo"});
    const evolSla = lineChart([{nome: "Cumprimento de SLA (%)", cor: COR.b, pts: sr.map(p => ({x: p.k, y: p.sla, t: p.slaN + " reg."}))}], {min: 0, max: 100, fmt: v => nf(v, 0) + "%", xl: x => xlab(x, gran), alt: "SLA ao longo do tempo"});

    return `${cards}
      <div class="sf-grid2">
        ${secao("Volume de atendimentos", `<div class="sf-gran">${granBtns()}</div>` + colChart(sr.map(p => ({x: p.k, v: p.vol})), {xl: x => xlab(x, gran)}), {nota: st.mediaDia != null ? `Média de ${nf(st.mediaDia, 1)} atendimentos por dia com registro (${st.diasAtivos} ${plural(st.diasAtivos, "dia", "dias")} nos dados).` : ""})}
        ${secao("Cumprimento de SLA no tempo", evolSla, {nota: "Cada ponto é calculado com os registros do próprio período (nunca média de percentuais)."})}
      </div>
      <div class="sf-grid3">
        ${secao("Atendimentos por atendente", barsH(porAtt), {nota: "Volume isolado não mede desempenho — veja SLA, transferências e avaliações."})}
        ${secao("Por departamento", barsH(barsFrom(st.porDep)))}
        ${secao("Por canal", barsH(barsFrom(st.porCanal)))}
      </div>
      ${secao("Mês atual × mês anterior (mesmo intervalo de dias)", cm ? tabelaComparativo(cm, null) : vazio("Sem datas nos dados para comparar meses."), {nota: cm ? `${fd(cm.cur.ini)} a ${fd(cm.cur.fim)} contra ${fd(cm.prev.ini)} a ${fd(cm.prev.fim)}. Respeita os filtros de atendente, departamento, canal e status; ignora o filtro de período.` : ""})}
      ${resumoRegistrado() ? `<details class="sf-det"><summary>Indicadores registrados no SacFlow (valores brutos da importação)</summary>${resumoRegistrado()}</details>` : ""}`;
  }
  const granAuto = D => {
    if(V.gran !== "auto") return V.gran;
    return "dia";
  };
  function granBtns(){
    return [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(g => `<button type="button" class="sf-btn mini ${V.gran === g[0] ? "on" : ""}" data-sf="gran" data-v="${g[0]}">${g[1]}</button>`).join("");
  }
  function xlab(x, gran){
    if(gran === "mes"){ const [y, m] = x.split("-"); return `${m}/${y.slice(2)}`; }
    return fdc(x) + (gran === "semana" ? " (sem.)" : "");
  }

  function tabelaComparativo(cm, ak){
    const a = SF.stats(cm.atual, ak), b = SF.stats(cm.anterior, ak);
    const tA = a.transf.conhecidos || a.transf.eventos, tB = b.transf.conhecidos || b.transf.eventos;
    const linhas = [
      // rótulo, valor atual, valor anterior, tipo de diferença, casas, sentido bom, comparável?
      ["Atendimentos", a.n, b.n, "n", 0, "neutro", true],
      ["Cumprimento de SLA (%)", a.sla.pct, b.sla.pct, "pp", 1, "up", a.sla.pct != null && b.sla.pct != null],
      ["Violações de SLA", a.sla.n ? a.sla.viol : null, b.sla.n ? b.sla.viol : null, "n", 0, "down", a.sla.n > 0 && b.sla.n > 0],
      ["Transferências (eventos)", tA ? a.transf.eventos : null, tB ? b.transf.eventos : null, "n", 0, "down", !!(tA && tB)],
      ["Taxa de transferência (%)", a.transf.taxa, b.transf.taxa, "pp", 1, "down", a.transf.taxa != null && b.transf.taxa != null],
      ["Nota média", a.aval.media, b.aval.media, "n", 2, "up", a.aval.media != null && b.aval.media != null],
      ["Avaliações negativas", a.aval.n ? a.aval.neg : null, b.aval.n ? b.aval.neg : null, "n", 0, "down", a.aval.n > 0 && b.aval.n > 0]
    ];
    const rows = linhas.map(([rot, x, y, tipo, dec, bom, disp]) => {
      let txt = '<span class="sf-mut">—</span>', cls = "";
      if(disp){
        const dl = x - y;
        txt = tipo === "pp" ? pp(dl) : (dl > 0 ? "+" : "") + nf(dl, dec) + (y ? ` (${dl / y * 100 > 0 ? "+" : ""}${nf(dl / y * 100, 0)}%)` : "");
        if(dl !== 0 && bom !== "neutro") cls = ((dl > 0) === (bom === "up")) ? "ok" : "bad";
      }
      const f = v => v == null ? ND : nf(v, dec);
      return `<tr><td>${rot}</td><td class="r">${f(x)}</td><td class="r">${f(y)}</td><td class="r ${cls}">${cls === "ok" ? "▲ melhor " : cls === "bad" ? "▼ pior " : ""}${txt}</td></tr>`;
    }).join("");
    return `<div class="sf-scroll"><table class="sf-cmp"><thead><tr><th>Indicador</th><th class="r">Mês atual</th><th class="r">Mês anterior</th><th class="r">Variação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function resumoRegistrado(ak){
    const N = CTX.N;
    const R = N.resumo.filter(r => !ak || r.ak === ak);
    if(!R.length) return "";
    return secao("Indicadores registrados no SacFlow (valores informados na importação)", tabela("resumo" + (ak || ""), [
      {k: "att", l: "Atendente", v: r => r.att},
      {k: "per", l: "Período", v: r => r.per ? r.per.ini : null, h: r => r.per ? `${fd(r.per.ini)} a ${fd(r.per.fim)}` : '<span class="sf-mut">não informado</span>'},
      {k: "ind", l: "Indicador", v: r => r.chave},
      {k: "val", l: "Valor registrado", v: r => r.bruto}
    ], R, {busca: "Buscar indicador ou atendente", lim: 30}), {nota: "São os números como vieram do SacFlow. Não são recalculados nem somados — compare-os com os indicadores calculados pelo painel acima."});
  }

  /* ---------------- ATENDENTES ---------------- */
  function telaAtendentes(){
    const {D, Dsp, N} = CTX;
    const cm = SF.comparativoMensal(Dsp);
    const linhas = N.atts.map(a => {
      const s = SF.stats(D, a.k);
      if(!(s.n || s.sla.n || s.aval.n || s.transf.eventos)) return null;
      let vVol = null, vSla = null;
      if(cm){
        const x = SF.stats(cm.atual, a.k), y = SF.stats(cm.anterior, a.k);
        vVol = y.n ? varPct(x.n, y.n) : null;
        vSla = (x.sla.pct != null && y.sla.pct != null) ? x.sla.pct - y.sla.pct : null;
      }
      return {k: a.k, nome: a.nome, s, vVol, vSla};
    }).filter(Boolean);
    const rk = rankings(D);
    const cols = [
      {k: "nome", l: "Atendente", v: r => r.nome, h: r => linkAtt(r.k)},
      {k: "n", l: "Atendimentos", v: r => r.s.n, num: 1},
      {k: "c", l: "Concluídos", v: r => r.s.n ? r.s.concluido : null, num: 1},
      {k: "sla", l: "SLA %", v: r => r.s.sla.pct, num: 1, h: r => r.s.sla.pct == null ? ND : `${nf(r.s.sla.pct, 1)}% <small class="sf-n">(${r.s.sla.n} reg.)</small> ${r.s.sla.n < minReg() ? '<span class="sf-warn" title="' + MINTXT + '">!</span>' : ""}`},
      {k: "viol", l: "Violações", v: r => r.s.sla.n ? r.s.sla.viol : null, num: 1},
      {k: "tr", l: "Transf. feitas", v: r => (r.s.transf.eventos || r.s.transf.conhecidos) ? r.s.transf.feitas : null, num: 1},
      {k: "trr", l: "Transf. recebidas", v: r => (r.s.transf.eventos || r.s.transf.conhecidos) ? r.s.transf.recebidas : null, num: 1},
      {k: "tx", l: "Taxa transf.", v: r => r.s.transf.taxa, num: 1, h: r => r.s.transf.taxa == null ? ND : `${nf(r.s.transf.taxa, 1)}% <small class="sf-n">(${r.s.transf.conhecidos} at.)</small>`},
      {k: "nota", l: "Nota média", v: r => r.s.aval.media, num: 1, h: r => r.s.aval.media == null ? ND : `${nf(r.s.aval.media, 2)} ${r.s.aval.n < minReg() ? '<span class="sf-warn" title="' + MINTXT + '">!</span>' : ""}`},
      {k: "na", l: "Nº aval.", v: r => r.s.aval.n || null, num: 1},
      {k: "vv", l: "Var. volume", v: r => r.vVol, num: 1, h: r => r.vVol == null ? '<span class="sf-mut">—</span>' : `${r.vVol > 0 ? "+" : ""}${nf(r.vVol, 0)}%`},
      {k: "vs", l: "Var. SLA", v: r => r.vSla, num: 1, h: r => r.vSla == null ? '<span class="sf-mut">—</span>' : `<span class="${r.vSla >= 0 ? "sf-up" : "sf-dn"}">${r.vSla >= 0 ? "▲" : "▼"} ${pp(r.vSla)}</span>`}
    ];
    return `${secao("Comparativo de atendentes", tabela("comp", cols, linhas, {busca: "Pesquisar atendente", row: r => `data-sf="attsel" data-v="${esc(r.k)}"`, ord: {k: "nome", dir: 1}}),
      {nota: `Clique no nome (ou na linha) para abrir o painel individual. "!" = menos de ${minReg()} registros: não compare. As variações comparam o mês mais recente dos dados com o mesmo intervalo de dias do mês anterior${cm ? " (" + fdc(cm.cur.ini) + "–" + fdc(cm.cur.fim) + " × " + fdc(cm.prev.ini) + "–" + fdc(cm.prev.fim) + ")" : ""}.`})}
      <div class="sf-grid3">
        ${secao("Melhor cumprimento de SLA", barsH(rk.melhores, {max: 100}))}
        ${secao("Maior índice de violação", barsH(rk.piores, {max: 100}))}
        ${secao("Melhores notas médias", barsH(rk.notas, {max: 5}))}
      </div>`;
  }

  /* ---------------- SLA ---------------- */
  function listaViolacoes(D, ak, id){
    const rows = (ak ? D.sla.filter(r => r.ak === ak) : D.sla).filter(s => s.res === "viol");
    const N = CTX.N;
    const cols = [
      {k: "id", l: "Atendimento", v: s => s.id, h: s => linkAt(s.id)},
      {k: "d", l: "Data", v: s => s.data || s.d, h: s => esc(fd(s.data || s.d)) || '<span class="sf-mut">—</span>'},
      ...(ak ? [] : [{k: "att", l: "Atendente", v: s => SF.nomeDe(s.ak), h: s => linkAtt(s.ak)}]),
      {k: "tipo", l: "Tipo de SLA", v: s => s.tipoRot},
      {k: "dep", l: "Departamento", v: s => s.dep},
      {k: "canal", l: "Canal", v: s => s.canal},
      {k: "tc", l: "Transf.", v: s => { const a = N.at.get(s.id); return a && a.tc != null ? a.tc : null; }, num: 1},
      {k: "det", l: "Detalhe informado", v: s => s.det}
    ];
    return tabela(id, cols, rows, {busca: "Buscar atendimento, tipo, detalhe…", ord: {k: "d", dir: -1}, row: s => `data-sf="openat" data-v="${esc(s.id)}"`, vazio: "Nenhuma violação de SLA no filtro atual."});
  }
  function tabelaTipoSLA(st){
    if(!st.sla.porTipo.length) return vazio("Sem registros de SLA.");
    return `<div class="sf-scroll"><table><thead><tr><th>Tipo de SLA / evento</th><th class="r">Sujeitos</th><th class="r">Dentro</th><th class="r">Violações</th><th class="r">Cumprimento</th></tr></thead><tbody>${
      st.sla.porTipo.map(t => `<tr><td>${esc(t.tipo)}</td><td class="r">${t.n}</td><td class="r">${t.ok}</td><td class="r">${t.viol}</td><td class="r">${pct(t.pct)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function telaSLA(){
    const {D, eq, N} = CTX;
    const sg = eq.sla;
    if(!sg.n && !N.sinal.sla) return aviso("Os dados importados não trazem informação de SLA (coluna <code>resultado_sla</code> nos atendimentos ou seção <code>@SLA</code>).");
    const gran = V.gran;
    const sr = SF.serie(D, null, gran);
    const porAtt = N.atts.map(a => ({a, s: SF.stats(D, a.k)})).filter(x => x.s.sla.n);
    const tabAtt = tabela("slaatt", [
      {k: "nome", l: "Atendente", v: r => r.a.nome, h: r => linkAtt(r.a.k)},
      {k: "n", l: "Sujeitos ao SLA", v: r => r.s.sla.n, num: 1},
      {k: "ok", l: "Dentro", v: r => r.s.sla.ok, num: 1},
      {k: "v", l: "Violações", v: r => r.s.sla.viol, num: 1},
      {k: "p", l: "Cumprimento", v: r => r.s.sla.pct, num: 1, h: r => `${nf(r.s.sla.pct, 1)}% ${r.s.sla.n < minReg() ? '<span class="sf-warn" title="' + MINTXT + '">!</span>' : ""} ${tagMeta(r.s.sla.pct, "slaMin", "min")}`}
    ], porAtt, {ord: {k: "p", dir: 1}});
    const rk = rankings(D);
    return `<div class="sf-kpis">${[
        kpi("Cumprimento de SLA", sg.n ? pct(sg.pct) : ND, sg.n ? `${sg.ok} dentro de ${sg.n} sujeitos ${tagMeta(sg.pct, "slaMin", "min")}` : ""),
        kpi("Dentro do prazo", num(sg.n ? sg.ok : null), "registros cumpridos"),
        kpi("Violações", num(sg.n ? sg.viol : null), "registros fora do prazo", {tom: sg.viol ? "bad" : ""})].join("")}</div>
      <div class="sf-grid2">
        ${secao("Evolução do cumprimento", `<div class="sf-gran">${granBtns()}</div>` + lineChart([{nome: "Cumprimento (%)", cor: COR.b, pts: sr.map(p => ({x: p.k, y: p.sla, t: p.slaN + " reg."}))}], {min: 0, max: 100, fmt: v => nf(v, 0) + "%", xl: x => xlab(x, gran)}))}
        ${secao("Violações por período", `<div class="sf-gran">${granBtns()}</div>` + colChart(sr.map(p => ({x: p.k, v: p.viol})), {cor: COR.r, xl: x => xlab(x, gran)}))}
      </div>
      <div class="sf-grid2">
        ${secao("Resultado por tipo de SLA / evento", tabelaTipoSLA(eq))}
        ${secao("Resultado por atendente", tabAtt, {nota: `"!" = menos de ${minReg()} registros.`})}
      </div>
      <div class="sf-grid2">
        ${secao("Melhores resultados", barsH(rk.melhores, {max: 100}))}
        ${secao("Maiores índices de violação", barsH(rk.piores, {max: 100}))}
      </div>
      ${secao("Atendimentos que violaram o prazo", listaViolacoes(D, null, "viol"), {nota: "Clique na linha para ver o atendimento completo. A coluna Transf. indica se houve transferência — nesses casos a responsabilidade pode ser compartilhada."})}`;
  }

  /* ---------------- TRANSFERÊNCIAS ---------------- */
  function listaTransf(D, ak, id){
    const rows = ak ? D.transf.filter(t => t.dk === ak || t.pk === ak || t.vk === ak) : D.transf;
    const cols = [
      {k: "id", l: "Atendimento", v: t => t.id, h: t => linkAt(t.id)},
      {k: "d", l: "Data", v: t => t.data || t.d, h: t => esc(fd(t.data || t.d)) || '<span class="sf-mut">—</span>'},
      {k: "de", l: "De", v: t => t.de || (t.vk ? SF.nomeDe(t.vk) : null)},
      {k: "para", l: "Para", v: t => t.para},
      {k: "o", l: "Dep. origem", v: t => t.depO},
      {k: "dd", l: "Dep. destino", v: t => t.depD},
      {k: "m", l: "Motivo", v: t => t.motivo, h: t => t.motivo ? esc(t.motivo) : ND}
    ];
    if(ak) cols.splice(2, 0, {k: "dir", l: "Papel", v: t => t.dk === ak ? "Realizada" : (t.pk === ak ? "Recebida" : "Vinculada (direção n/i)")});
    return tabela(id, cols, rows, {busca: "Buscar atendimento, atendente, motivo…", ord: {k: "d", dir: -1}, row: t => `data-sf="openat" data-v="${esc(t.id)}"`, vazio: "Nenhuma transferência registrada neste filtro."});
  }
  function fluxoDep(st){
    const f = st.transf.fluxo.filter(x => x.o !== SF.ND || x.d !== SF.ND);
    if(!f.length) return vazio("Sem origem/destino registrados.");
    return barsH(f.slice(0, 10).map(x => ({l: `${x.o} → ${x.d}`, v: x.v, cor: COR.b})));
  }
  function multiplas(D, ak){
    const A = (ak ? D.atend.filter(a => a.ak === ak) : D.atend).filter(a => a.tc != null && a.tc >= 2);
    return tabela("multi" + (ak || ""), [
      {k: "id", l: "Atendimento", v: a => a.id, h: a => linkAt(a.id)},
      ...(ak ? [] : [{k: "att", l: "Atendente", v: a => SF.nomeDe(a.ak), h: a => linkAtt(a.ak)}]),
      {k: "tc", l: "Transferências", v: a => a.tc, num: 1},
      {k: "dep", l: "Departamento", v: a => a.dep},
      {k: "st", l: "Status", v: a => a.status}
    ], A, {ord: {k: "tc", dir: -1}, row: a => `data-sf="openat" data-v="${esc(a.id)}"`, vazio: "Nenhum atendimento transferido mais de uma vez."});
  }
  function telaTransf(){
    const {D, eq, N} = CTX, tr = eq.transf;
    if(!tr.eventos && !tr.conhecidos) return aviso("Os dados importados não trazem transferências (seção <code>@TRANSFERENCIAS</code> ou coluna <code>transferencias</code> nos atendimentos).");
    const porAtt = N.atts.map(a => ({a, s: SF.stats(D, a.k)})).filter(x => x.s.transf.eventos);
    const tabAtt = tabela("trattt", [
      {k: "nome", l: "Atendente", v: r => r.a.nome, h: r => linkAtt(r.a.k)},
      {k: "f", l: "Realizadas", v: r => r.s.transf.feitas, num: 1},
      {k: "r", l: "Recebidas", v: r => r.s.transf.recebidas, num: 1},
      {k: "vi", l: "Vinculadas (direção n/i)", v: r => r.s.transf.vinc, num: 1},
      {k: "at", l: "Atend. transferidos", v: r => r.s.transf.conhecidos ? r.s.transf.atendTransf : null, num: 1},
      {k: "tx", l: "Taxa", v: r => r.s.transf.taxa, num: 1, h: r => r.s.transf.taxa == null ? ND : `${nf(r.s.transf.taxa, 1)}% <small class="sf-n">(${r.s.transf.conhecidos} at.)</small> ${tagMeta(r.s.transf.taxa, "transfMax", "max")}`}
    ], porAtt, {ord: {k: "f", dir: -1}});
    return `<div class="sf-kpis">
        ${kpi("Eventos de transferência", num(tr.eventos), "cada transferência conta uma vez")}
        ${kpi("Atendimentos transferidos", tr.conhecidos ? num(tr.atendTransf) : ND, tr.conhecidos ? `de ${tr.conhecidos} com transferência informada` : "")}
        ${kpi("Taxa de transferência", pct(tr.taxa), "atendimentos transferidos ÷ atendimentos com dado", {})}
        ${kpi("Transferidos mais de 1×", tr.conhecidos ? num(tr.multi) : ND, "possível retrabalho", {tom: tr.multi ? "warn" : ""})}
      </div>
      <div class="sf-grid2">
        ${secao("Por atendente", tabAtt, {nota: "Realizadas = atendente é quem transferiu; Recebidas = atendente recebeu. O mesmo evento aparece como \"realizada\" para um e \"recebida\" para outro, mas é contado uma única vez no total da equipe."})}
        ${secao("Fluxo entre departamentos", fluxoDep(eq))}
      </div>
      <div class="sf-grid2">
        ${secao("Motivos de transferência", tr.motivosInfo ? barsH(tr.motivos.filter(m => m.k !== SF.ND).slice(0, 10).map(m => ({l: m.k, v: m.v, cor: COR.a}))) + (tr.eventos - tr.motivosInfo ? `<p class="sf-nota">${tr.eventos - tr.motivosInfo} transferências sem motivo registrado.</p>` : "") : vazio("Nenhum motivo foi registrado nos dados."))}
        ${secao("Atendimentos transferidos mais de uma vez", multiplas(D, null))}
      </div>
      ${secao("Eventos de transferência", listaTransf(D, null, "trlista"))}`;
  }

  /* ---------------- AVALIAÇÕES ---------------- */
  function distNotas(av){
    return barsH([5, 4, 3, 2, 1].map(n => ({l: n + " ★" + (n >= 4 ? " (positiva)" : n === 3 ? " (neutra)" : " (negativa)"), v: av.dist[n], cor: n >= 4 ? COR.g : n === 3 ? COR.a : COR.r, sub: av.n ? ` ${nf(av.dist[n] / av.n * 100, 0)}%` : ""})), {max: Math.max(...av.dist, 1)});
  }
  function listaAval(D, ak, id){
    const rows = ak ? D.aval.filter(v => v.ak === ak) : D.aval;
    return tabela(id, [
      {k: "id", l: "Atendimento", v: v => v.id, h: v => linkAt(v.id)},
      {k: "d", l: "Data", v: v => v.data || v.d, h: v => esc(fd(v.data || v.d)) || '<span class="sf-mut">—</span>'},
      ...(ak ? [] : [{k: "att", l: "Atendente", v: v => SF.nomeDe(v.ak), h: v => linkAtt(v.ak)}]),
      {k: "n", l: "Nota", v: v => v.nota, num: 1, d: 1, h: v => `<span class="sf-nota-${v.cls}">${nf(v.nota, 1)} ${v.cls === "pos" ? "· positiva" : v.cls === "neu" ? "· neutra" : "· negativa"}</span>`},
      {k: "c", l: "Comentário do cliente", v: v => v.coment, h: v => v.coment ? esc(v.coment) : '<span class="sf-mut">sem comentário</span>'}
    ], rows, {busca: "Buscar atendimento ou comentário…", ord: {k: "d", dir: -1}, row: v => `data-sf="openat" data-v="${esc(v.id)}"`});
  }
  function telaAval(){
    const {D, eq, N} = CTX, av = eq.aval;
    if(!av.n) return aviso("Nenhuma avaliação nos dados importados (seção <code>@AVALIACOES</code> ou coluna <code>nota</code> nos atendimentos).");
    const gran = V.gran, sr = SF.serie(D, null, gran);
    const porAtt = N.atts.map(a => ({a, s: SF.stats(D, a.k)})).filter(x => x.s.aval.n);
    const tabAtt = tabela("avatt", [
      {k: "nome", l: "Atendente", v: r => r.a.nome, h: r => linkAtt(r.a.k)},
      {k: "m", l: "Nota média", v: r => r.s.aval.media, num: 1, h: r => `${nf(r.s.aval.media, 2)} ${r.s.aval.n < minReg() ? '<span class="sf-warn" title="' + MINTXT + '">!</span>' : ""} ${tagMeta(r.s.aval.media, "notaMin", "min")}`},
      {k: "n", l: "Avaliações", v: r => r.s.aval.n, num: 1},
      {k: "p", l: "Positivas", v: r => r.s.aval.pos, num: 1},
      {k: "u", l: "Neutras", v: r => r.s.aval.neu, num: 1},
      {k: "g", l: "Negativas", v: r => r.s.aval.neg, num: 1}
    ], porAtt, {ord: {k: "m", dir: -1}});
    return `<div class="sf-kpis">
        ${kpi("Nota média", nota(av.media), `${av.n} ${plural(av.n, "avaliação", "avaliações")} ${tagMeta(av.media, "notaMin", "min")}`)}
        ${kpi("Positivas (≥ 4)", num(av.pos), pct(av.pos / av.n * 100) + " das avaliações", {tom: "ok"})}
        ${kpi("Neutras (3 a < 4)", num(av.neu), pct(av.neu / av.n * 100) + " das avaliações")}
        ${kpi("Negativas (< 3)", num(av.neg), pct(av.neg / av.n * 100) + " das avaliações", {tom: av.neg ? "bad" : ""})}
        ${kpi("Taxa de resposta", av.resp != null ? pct(av.resp) : ND, av.resp != null ? `${av.pesqRespondidas} de ${av.pesqEnviadas} pesquisas` : "exige a coluna pesquisa_enviada")}
      </div>
      <div class="sf-grid2">
        ${secao("Distribuição das notas", distNotas(av))}
        ${secao("Evolução da nota média", `<div class="sf-gran">${granBtns()}</div>` + lineChart([{nome: "Nota média", cor: COR.a, pts: sr.map(p => ({x: p.k, y: p.nota, t: p.notaN + " aval."}))}], {min: 1, max: 5, fmt: v => nf(v, 1), xl: x => xlab(x, gran)}))}
      </div>
      ${secao("Ranking por atendente", tabAtt, {nota: `"!" = menos de ${minReg()} avaliações.`})}
      ${secao("Avaliações e comentários", listaAval(D, null, "avlista"))}`;
  }

  /* ---------------- EVOLUÇÃO ---------------- */
  function telaEvolucao(){
    const {D, Dsp} = CTX, gran = V.gran, sr = SF.serie(D, null, gran), cm = SF.comparativoMensal(Dsp);
    const xl = x => xlab(x, gran);
    return `<div class="sf-gran big">${granBtns()}</div>
      <div class="sf-grid2">
        ${secao("Atendimentos", colChart(sr.map(p => ({x: p.k, v: p.vol})), {xl}))}
        ${secao("Cumprimento de SLA", lineChart([{nome: "SLA %", cor: COR.b, pts: sr.map(p => ({x: p.k, y: p.sla, t: p.slaN + " reg."}))}], {min: 0, max: 100, fmt: v => nf(v, 0) + "%", xl}))}
        ${secao("Violações de SLA", colChart(sr.map(p => ({x: p.k, v: p.viol})), {cor: COR.r, xl}))}
        ${secao("Transferências", colChart(sr.map(p => ({x: p.k, v: p.tr})), {cor: COR.a, xl}))}
        ${secao("Nota média", lineChart([{nome: "Nota", cor: COR.a, pts: sr.map(p => ({x: p.k, y: p.nota, t: p.notaN + " aval."}))}], {min: 1, max: 5, fmt: v => nf(v, 1), xl}))}
      </div>
      ${secao("Mês atual × mês anterior (mesmo intervalo de dias)", cm ? tabelaComparativo(cm, null) : vazio("Sem datas para comparar."), {nota: cm ? `${fd(cm.cur.ini)} a ${fd(cm.cur.fim)} contra ${fd(cm.prev.ini)} a ${fd(cm.prev.fim)}.` : ""})}`;
  }

  /* ---------------- ATENDIMENTOS ---------------- */
  function idx(N, nome, arr){
    if(!N[nome]){ const m = new Map(); arr.forEach(x => { if(!m.has(x.id)) m.set(x.id, []); m.get(x.id).push(x); }); N[nome] = m; }
    return N[nome];
  }
  function colsAtend(ak){
    const N = CTX.N;
    return [
      {k: "id", l: "ID", v: a => a.id, h: a => linkAt(a.id)},
      {k: "cli", l: "Cliente", v: a => a.cliente},
      {k: "cr", l: "Criado", v: a => a.criado, h: a => fd(a.criado) || '<span class="sf-mut">—</span>'},
      {k: "en", l: "Encerrado", v: a => a.enc, h: a => fd(a.enc) || '<span class="sf-mut">—</span>'},
      ...(ak ? [] : [{k: "att", l: "Atendente", v: a => SF.nomeDe(a.ak), h: a => linkAtt(a.ak)}]),
      {k: "dep", l: "Departamento", v: a => a.dep},
      {k: "canal", l: "Canal", v: a => a.canal},
      {k: "st", l: "Status", v: a => a.status || null},
      {k: "sla", l: "SLA", v: a => { const s = idx(N, "slaPorId", N.sla).get(a.id); if(!s) return null; return s.some(x => x.res === "viol") ? "Violado" : "Dentro"; }, h: a => {
        const s = idx(N, "slaPorId", N.sla).get(a.id);
        if(!s) return '<span class="sf-mut">—</span>';
        const v = s.filter(x => x.res === "viol").length;
        return v ? `<span class="sf-tag bad">✕ ${v} ${plural(v, "violação", "violações")}</span>` : '<span class="sf-tag ok">✓ dentro</span>';
      }},
      {k: "tc", l: "Transf.", v: a => a.tc, num: 1},
      {k: "nota", l: "Nota", v: a => { const v = idx(N, "avalPorId", N.aval).get(a.id); return v ? v[0].nota : null; }, num: 1, d: 1},
      {k: "ult", l: "Última interação", v: a => a.ultima, h: a => fd(a.ultima) || '<span class="sf-mut">—</span>'},
      {k: "res", l: "Resumo", v: a => a.resumo, h: a => a.resumo ? `<span class="sf-resumo" title="${esc(a.resumo)}">${esc(a.resumo)}</span>` : '<span class="sf-mut">—</span>'}
    ];
  }
  function telaAtendimentos(){
    const {D} = CTX;
    return secao("Atendimentos do período", tabela("atlist", colsAtend(null), D.atend, {busca: "Buscar por ID, cliente, atendente, resumo…", ord: {k: "cr", dir: -1}, row: a => `data-sf="openat" data-v="${esc(a.id)}"`, lim: 100}),
      {nota: "Clique em uma linha para abrir o atendimento: mensagens, transferências, SLA e avaliação."});
  }

  /* ---------------- detalhe do atendimento (modal) ---------------- */
  function detalheAt(id){
    const N = SF.norm(), a = N.at.get(id);
    const sl = N.sla.filter(s => s.id === id), tr = N.transf.filter(t => t.id === id), av = N.aval.filter(v => v.id === id), ms = N.msgPorId.get(id) || [];
    const ev = [];
    ms.forEach(m => ev.push({t: m.data || "", tipo: /(evento|sistema)/i.test(m.tipo) ? "Evento" : "Mensagem", txt: `<b>${esc(m.autor || "—")}</b>: ${esc(m.texto)}`}));
    tr.forEach(t => ev.push({t: t.data || "", tipo: "Transferência", txt: `${esc(t.de || (t.vk ? SF.nomeDe(t.vk) : "?"))} → ${esc(t.para || "?")}${t.depO || t.depD ? ` (${esc(t.depO || "?")} → ${esc(t.depD || "?")})` : ""}${t.motivo ? ` · motivo: ${esc(t.motivo)}` : ""}`}));
    sl.forEach(s => ev.push({t: s.data || "", tipo: "SLA", txt: `${esc(s.tipoRot)}: <b class="${s.res === "viol" ? "sf-dn" : "sf-up"}">${s.res === "viol" ? "violado" : "dentro do prazo"}</b>${s.det ? " · " + esc(s.det) : ""}`}));
    av.forEach(v => ev.push({t: v.data || "", tipo: "Avaliação", txt: `nota <b>${nf(v.nota, 1)}</b>${v.coment ? " · “" + esc(v.coment) + "”" : ""}`}));
    ev.sort((x, y) => (x.t || "~") < (y.t || "~") ? -1 : 1);
    const campo = (r, v) => `<div><span>${r}</span><b>${v == null || v === "" ? ND : v}</b></div>`;
    return `<div class="sf-m-h"><h3>Atendimento ${esc(id)}</h3><button type="button" class="sf-x" data-sf="fechar" aria-label="Fechar">×</button></div>
      <div class="sf-m-b">
        ${a ? `<div class="sf-ficha">${campo("Atendente", esc(SF.nomeDe(a.ak)))}${campo("Cliente", esc(a.cliente))}${campo("Criado", esc(fd(a.criado)))}${campo("Encerrado", esc(fd(a.enc)))}${campo("Departamento", esc(a.dep))}${campo("Canal", esc(a.canal))}${campo("Status", esc(a.status))}${campo("Transferências", a.tc != null ? a.tc : null)}${campo("Última interação", esc(fd(a.ultima)))}</div>
          ${a.resumo ? `<p class="sf-res"><b>Resumo:</b> ${esc(a.resumo)}</p>` : ""}`
          : aviso("Este atendimento aparece em seções de detalhe, mas não foi importado na lista de atendimentos.", "warn")}
        <h4>Linha do tempo (${ev.length})</h4>
        ${ev.length ? `<ol class="sf-tl">${ev.map(x => `<li><time>${x.t ? esc(fd(x.t)) : "sem data"}</time><em class="k-${esc(x.tipo)}">${x.tipo}</em><span>${x.txt}</span></li>`).join("")}</ol>` : vazio("Não há mensagens nem eventos importados para este atendimento.")}
        ${a && a.tc != null && tr.length && a.tc !== tr.length ? aviso(`O campo de transferências do atendimento informa ${a.tc}, mas há ${tr.length} evento(s) detalhado(s).`, "warn") : ""}
      </div>`;
  }
  function detalheDrill(id){
    const d = DS[id]; if(!d) return "";
    const max = 500;
    return `<div class="sf-m-h"><h3>${esc(d.titulo)} <small>(${d.rows.length})</small></h3><button type="button" class="sf-x" data-sf="fechar" aria-label="Fechar">×</button></div>
      <div class="sf-m-b"><p class="sf-nota">Registros que compõem o número exibido.${d.rows.length > max ? ` Mostrando os primeiros ${max}.` : ""}</p>
      <div class="sf-scroll"><table><thead><tr>${d.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${d.rows.slice(0, max).map(r => `<tr class="sf-click" data-sf="openat" data-v="${esc(r[0])}">${r.map(c => `<td>${c ? esc(c) : '<span class="sf-mut">—</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  }

  /* ---------------- PAINEL INDIVIDUAL ---------------- */
  function painelIndividual(ak){
    const {D, Dsp, eq, N, F} = CTX;
    const nome = SF.nomeDe(ak);
    const Da = SF.doAtendente(D, ak), st = SF.stats(D, ak);
    const lim = limitesDados();
    const per = (F.de || F.ate) ? `${F.de ? fd(F.de) : "início"} a ${F.ate ? fd(F.ate) : "fim"}` : (lim ? `todo o período importado (${fd(lim.min)} a ${fd(lim.max)})` : "—");
    const cm = SF.comparativoMensal(Dsp.atend ? {atend: Dsp.atend.filter(r => r.ak === ak), sla: Dsp.sla.filter(r => r.ak === ak), aval: Dsp.aval.filter(r => r.ak === ak), transf: Dsp.transf.filter(r => r.dk === ak || r.pk === ak || r.vk === ak)} : Dsp);
    if(!(st.n || st.sla.n || st.aval.n || st.transf.eventos)) return `<button type="button" class="sf-btn" data-sf="voltar">← Voltar à lista</button>` + aviso(`Nenhum registro de <b>${esc(nome)}</b> no filtro atual.`, "warn");
    const gran = V.gran;
    const sr = SF.serie(D, ak, gran);

    /* A */
    const cards = cardsResumo(D, ak).html;
    const eqs = eq;
    const lin = (rot, a, b) => `<tr><td>${rot}</td><td class="r">${a}</td><td class="r">${b}</td></tr>`;
    const compEq = `<div class="sf-scroll"><table class="sf-cmp"><thead><tr><th>Indicador</th><th class="r">${esc(nome)}</th><th class="r">Equipe (todos)</th></tr></thead><tbody>
      ${lin("Cumprimento de SLA", st.sla.pct != null ? `${nf(st.sla.pct, 1)}% <small class="sf-n">(${st.sla.n} reg.)</small>` : ND, eqs.sla.pct != null ? `${nf(eqs.sla.pct, 1)}% <small class="sf-n">(${eqs.sla.n} reg.)</small>` : ND)}
      ${lin("Violações ÷ sujeitos ao SLA", st.sla.n ? pct(st.sla.viol / st.sla.n * 100) : ND, eqs.sla.n ? pct(eqs.sla.viol / eqs.sla.n * 100) : ND)}
      ${lin("Taxa de transferência", st.transf.taxa != null ? `${nf(st.transf.taxa, 1)}% <small class="sf-n">(${st.transf.conhecidos} at.)</small>` : ND, eqs.transf.taxa != null ? `${nf(eqs.transf.taxa, 1)}% <small class="sf-n">(${eqs.transf.conhecidos} at.)</small>` : ND)}
      ${lin("Nota média", st.aval.media != null ? `${nf(st.aval.media, 2)} <small class="sf-n">(${st.aval.n} aval.)</small>` : ND, eqs.aval.media != null ? `${nf(eqs.aval.media, 2)} <small class="sf-n">(${eqs.aval.n} aval.)</small>` : ND)}
      ${lin("Atendimentos por dia ativo", st.mediaDia != null ? nf(st.mediaDia, 1) : ND, eqs.mediaDia != null ? nf(eqs.mediaDia, 1) + " (equipe toda)" : ND)}
    </tbody></table></div>`;

    const outro = N.atts.filter(x => x.k !== ak);
    return `<div class="sf-ind-topo">
        <button type="button" class="sf-btn" data-sf="voltar">← Todos os atendentes</button>
        <div class="sf-ind-nome"><h2>${esc(nome)}</h2><p>Período analisado: ${esc(per)}</p></div>
        <label class="sf-trocar">Trocar de atendente<select data-sf-trocar>${N.atts.map(x => `<option value="${esc(x.k)}" ${x.k === ak ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
      </div>
      <nav class="sf-ancoras">${[["A", "Resumo"], ["B", "Produtividade"], ["C", "SLA"], ["D", "Transferências"], ["E", "Avaliações"], ["F", "Conversas"], ["G", "Diagnóstico"]].map(x => `<a href="#" data-sf="anc" data-v="sf-sec-${x[0]}">${x[0]} · ${x[1]}</a>`).join("")}</nav>

      ${secao("A · Identificação e resumo", cards + compEq + resumoRegistrado(ak), {id: "sf-sec-A", nota: "Comparação com a equipe calculada sobre todos os registros do filtro atual."})}

      ${secao("B · Produtividade", `
        <p class="sf-nota">Métrica usada: <b>atendimentos atribuídos</b> = linhas da lista de atendimentos do SacFlow cujo responsável é ${esc(nome)}. Não representa atendimentos encerrados nem mensagens enviadas${st.n ? ` (${st.concluido} constam como concluídos)` : ""}.</p>
        <div class="sf-gran">${granBtns()}</div>${colChart(sr.map(p => ({x: p.k, v: p.vol})), {xl: x => xlab(x, gran)})}
        <p class="sf-nota">${st.mediaDia != null ? `Média de ${nf(st.mediaDia, 1)} atendimentos por dia com registro (${st.diasAtivos} ${plural(st.diasAtivos, "dia", "dias")} com dados — dias sem registro não entram na média).` : "Sem datas para calcular média diária."}</p>
        <div class="sf-grid2"><div><h4>Por canal</h4>${barsH(st.porCanal.slice(0, 8).map(x => ({l: x.k, v: x.v})))}</div><div><h4>Por departamento</h4>${barsH(st.porDep.slice(0, 8).map(x => ({l: x.k, v: x.v})))}</div></div>
        <h4>Mês atual × mês anterior</h4>${cm ? tabelaComparativo(cm, ak) : vazio("Sem datas para comparar meses.")}`, {id: "sf-sec-B"})}

      ${secao("C · SLA", st.sla.n ? `
        <div class="sf-grid2"><div><h4>Por tipo de SLA / evento</h4>${tabelaTipoSLA(st)}</div>
        <div><h4>Evolução do cumprimento</h4>${lineChart([{nome: nome, cor: COR.b, pts: sr.map(p => ({x: p.k, y: p.sla, t: p.slaN + " reg."}))}, ...(eqs.sla.n ? [{nome: "Equipe", cor: COR.k, dash: 1, pts: SF.serie(D, null, gran).map(p => ({x: p.k, y: p.sla}))}] : [])], {min: 0, max: 100, fmt: v => nf(v, 0) + "%", xl: x => xlab(x, gran)})}</div></div>
        <h4>Atendimentos que violaram o prazo</h4>${listaViolacoes(D, ak, "viol" + ak)}
        <p class="sf-nota">Uma violação não é atribuída automaticamente ao atendente: verifique a coluna <b>Transf.</b> e a linha do tempo do atendimento antes de concluir a responsabilidade.</p>`
        : vazio("Sem registros de SLA para este atendente no filtro."), {id: "sf-sec-C"})}

      ${secao("D · Transferências e retrabalho", (st.transf.eventos || st.transf.conhecidos) ? `
        <div class="sf-kpis">${kpi("Realizadas", num(st.transf.feitas), "o atendente transferiu")}${kpi("Recebidas", num(st.transf.recebidas), "chegaram ao atendente")}${kpi("Vinculadas (direção n/i)", num(st.transf.vinc), "sem de/para informado")}${kpi("Transferidos > 1×", num(st.transf.multi), "dos atendimentos atribuídos", {tom: st.transf.multi ? "warn" : ""})}${kpi("Taxa de transferência", pct(st.transf.taxa), `equipe: ${eqs.transf.taxa != null ? nf(eqs.transf.taxa, 1) + "%" : "n/i"} ${tagMeta(st.transf.taxa, "transfMax", "max")}`)}</div>
        <div class="sf-grid2"><div><h4>Fluxo entre departamentos</h4>${fluxoDep(st)}</div><div><h4>Motivos registrados</h4>${st.transf.motivosInfo ? barsH(st.transf.motivos.filter(m => m.k !== SF.ND).slice(0, 8).map(m => ({l: m.k, v: m.v, cor: COR.a}))) : vazio("Nenhum motivo registrado.")}</div></div>
        <h4>Eventos</h4>${listaTransf(D, ak, "trl" + ak)}<h4>Transferidos mais de uma vez</h4>${multiplas(D, ak)}`
        : vazio("Sem transferências registradas para este atendente."), {id: "sf-sec-D"})}

      ${secao("E · Avaliações dos clientes", st.aval.n ? `
        <div class="sf-grid2"><div><h4>Distribuição das notas</h4>${distNotas(st.aval)}<p class="sf-nota">${st.aval.resp != null ? `Taxa de resposta: ${nf(st.aval.resp, 1)}% (${st.aval.pesqRespondidas} de ${st.aval.pesqEnviadas} pesquisas).` : "Taxa de resposta não disponível (exige pesquisa_enviada)."}</p></div>
        <div><h4>Evolução da nota</h4>${lineChart([{nome: nome, cor: COR.a, pts: sr.map(p => ({x: p.k, y: p.nota, t: p.notaN + " aval."}))}], {min: 1, max: 5, fmt: v => nf(v, 1), xl: x => xlab(x, gran)})}</div></div>
        ${listaAval(D, ak, "avl" + ak)}` : vazio("Sem avaliações para este atendente no filtro."), {id: "sf-sec-E"})}

      ${secao("F · Análise das conversas", tabela("atl" + ak, colsAtend(ak), Da.atend, {busca: "Buscar por ID, cliente, resumo…", ord: {k: "cr", dir: -1}, row: a => `data-sf="openat" data-v="${esc(a.id)}"`}), {id: "sf-sec-F", nota: "Clique em um atendimento para ver mensagens e eventos importados."})}

      ${secao("G · Qualidade e oportunidades de melhoria", diagnostico(ak, D, st, eqs) + planoAcao(ak, st), {id: "sf-sec-G"})}`;
  }

  /* ---------------- diagnóstico individual ---------------- */
  function diagnostico(ak, D, st, eq){
    const N = CTX.N, nome = SF.nomeDe(ak), M = metas();
    const bons = [], abaixo = [], fatos = [], correl = [], hip = [], sug = [];
    const poucos = n => n < minReg();

    /* SLA */
    if(st.sla.n){
      const dif = eq.sla.pct != null ? st.sla.pct - eq.sla.pct : null;
      fatos.push(`SLA: ${nf(st.sla.pct, 1)}% de cumprimento (${st.sla.viol} violações em ${st.sla.n} registros)${dif != null ? `; equipe ${nf(eq.sla.pct, 1)}% (${pp(dif)})` : ""}.`);
      if(M.slaMin != null){ (st.sla.pct >= M.slaMin ? bons : abaixo).push(`SLA ${nf(st.sla.pct, 1)}% — meta mínima configurada ${nf(M.slaMin, 1)}%.`); }
      else if(dif != null && dif >= 0 && !poucos(st.sla.n)) bons.push(`SLA ${nf(st.sla.pct, 1)}%, acima da média da equipe (${nf(eq.sla.pct, 1)}%).`);
      st.sla.porTipo.filter(t => t.viol >= 2).forEach(t => fatos.push(`Violação recorrente em "${t.tipo}": ${t.viol} de ${t.n} registros (${nf(100 - t.pct, 0)}%).`));
      const viol = D.sla.filter(s => s.ak === ak && s.res === "viol");
      const comTr = viol.filter(s => { const a = N.at.get(s.id); return a && a.tc != null && a.tc >= 1; }).length;
      if(viol.length && comTr) fatos.push(`${comTr} de ${viol.length} atendimentos com violação tiveram transferência — a responsabilidade pode ser compartilhada.`);
      /* correlações por dimensão */
      [["dep", "departamento"], ["canal", "canal"]].forEach(([f, rot]) => {
        const g = new Map();
        D.sla.filter(s => s.ak === ak && s[f]).forEach(s => { if(!g.has(s[f])) g.set(s[f], {n: 0, v: 0}); const o = g.get(s[f]); o.n++; if(s.res === "viol") o.v++; });
        g.forEach((o, k) => { if(o.n >= 5 && o.v >= 3 && (o.v / o.n * 100) - (100 - st.sla.pct) >= 15) correl.push(`No ${rot} "${k}" a taxa de violação é ${nf(o.v / o.n * 100, 0)}% (${o.v} de ${o.n}), contra ${nf(100 - st.sla.pct, 0)}% geral do atendente.`); });
      });
      if(correl.length){ hip.push("Hipótese: a violação se concentra em um tipo de demanda/canal específico (falta de fila, treinamento ou regra de roteamento próprios dele). Confirme na linha do tempo dos atendimentos antes de agir."); sug.push("Revisar os atendimentos violados do departamento/canal destacado e verificar tempo de espera na fila e distribuição de carga."); }
      if(st.sla.viol >= 2 && !correl.length) sug.push("Ler a linha do tempo dos atendimentos violados para identificar se o atraso foi de resposta, de resolução ou de espera pelo cliente.");
    }else fatos.push("SLA: não há registros de SLA para este atendente no filtro — nenhuma conclusão possível.");

    /* transferências */
    if(st.transf.taxa != null){
      const dif = eq.transf.taxa != null ? st.transf.taxa - eq.transf.taxa : null;
      fatos.push(`Transferências: taxa ${nf(st.transf.taxa, 1)}% (${st.transf.atendTransf} de ${st.transf.conhecidos} atendimentos)${dif != null ? `; equipe ${nf(eq.transf.taxa, 1)}%` : ""}; ${st.transf.feitas} realizadas e ${st.transf.recebidas} recebidas.`);
      if(M.transfMax != null){ (st.transf.taxa <= M.transfMax ? bons : abaixo).push(`Taxa de transferência ${nf(st.transf.taxa, 1)}% — limite configurado ${nf(M.transfMax, 1)}%.`); }
      else if(dif != null && dif <= 0 && !poucos(st.transf.conhecidos)) bons.push(`Taxa de transferência ${nf(st.transf.taxa, 1)}%, igual ou abaixo da equipe.`);
      if(st.transf.multi) fatos.push(`${st.transf.multi} atendimento(s) foram transferidos mais de uma vez (possível retrabalho).`);
      const mot = st.transf.motivos.filter(m => m.k !== SF.ND);
      if(mot.length) fatos.push(`Motivo mais registrado nas transferências: "${mot[0].k}" (${mot[0].v}).`);
      if(dif != null && dif > 10 && !poucos(st.transf.conhecidos)){ hip.push("Hipótese: parte das transferências pode vir de triagem inicial incerta sobre o departamento correto — correlação a validar com os motivos registrados."); sug.push("Alinhar com o atendente os critérios de roteamento por departamento e criar um guia rápido de assuntos por área."); }
      if(st.transf.multi) sug.push("Revisar os atendimentos transferidos mais de uma vez para achar o ponto em que o caso 'voltou' e evitar o retrabalho.");
    }

    /* avaliações */
    if(st.aval.n){
      const dif = eq.aval.media != null ? st.aval.media - eq.aval.media : null;
      fatos.push(`Avaliações: média ${nf(st.aval.media, 2)} em ${st.aval.n} ${plural(st.aval.n, "avaliação", "avaliações")} (${st.aval.pos} positivas, ${st.aval.neu} neutras, ${st.aval.neg} negativas)${dif != null ? `; equipe ${nf(eq.aval.media, 2)}` : ""}.`);
      if(M.notaMin != null){ (st.aval.media >= M.notaMin ? bons : abaixo).push(`Nota média ${nf(st.aval.media, 2)} — mínimo configurado ${nf(M.notaMin, 2)}.`); }
      else if(dif != null && dif >= 0 && !poucos(st.aval.n)) bons.push(`Nota média ${nf(st.aval.media, 2)}, acima da equipe (${nf(eq.aval.media, 2)}).`);
      const negC = D.aval.filter(v => v.ak === ak && v.cls === "neg" && v.coment).length;
      if(st.aval.neg) sug.push(`Ler as ${st.aval.neg} avaliações negativas${negC ? ` (${negC} com comentário)` : ""} e agrupar os motivos citados pelos clientes.`);
      const negTr = D.aval.filter(v => v.ak === ak && v.cls === "neg").filter(v => { const a = N.at.get(v.id); return a && a.tc != null && a.tc >= 1; }).length;
      if(st.aval.neg && negTr) correl.push(`${negTr} de ${st.aval.neg} avaliações negativas são de atendimentos que tiveram transferência.`);
    }
    if(st.n && poucos(st.n)) fatos.push(`Atenção: apenas ${st.n} atendimentos no filtro — percentuais e médias têm pouca sustentação estatística.`);
    if(!sug.length) sug.push("Sem sugestões específicas: os dados do filtro atual não indicam um ponto de atenção claro. Acompanhe a evolução no período seguinte.");

    const lista = (arr, vz) => arr.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="sf-mut">${vz}</p>`;
    return `<div class="sf-diag">
      <div class="c ok"><h4>Indicadores com bons resultados</h4>${lista(bons, "Nenhum indicador comparável acima da meta/equipe ou meta não configurada.")}</div>
      <div class="c bad"><h4>Indicadores abaixo das metas configuradas</h4>${lista(abaixo, Object.keys(M).filter(k => ["slaMin", "notaMin", "transfMax"].includes(k) && M[k] != null).length ? "Nenhum indicador abaixo das metas configuradas." : "Nenhuma meta configurada (aba Fórmulas e Metas).")}</div>
      <div class="c"><h4>Fatos comprovados nos dados</h4>${lista(fatos, "—")}</div>
      <div class="c warn"><h4>Correlações observadas <small>(não provam causa)</small></h4>${lista(correl, "Nenhuma correlação relevante com os registros disponíveis.")}</div>
      <div class="c"><h4>Hipóteses <small>(a validar)</small></h4>${lista(hip, "Sem hipóteses: os dados não sustentam uma explicação.")}</div>
      <div class="c"><h4>Sugestões de melhoria</h4>${lista(sug, "—")}</div>
    </div>`;
  }

  /* ---------------- plano de ação ---------------- */
  const IND = {sla: "SLA", transf: "Transferências", aval: "Avaliações", prod: "Produtividade", outro: "Outro"};
  function valorInd(ind, st){
    if(ind === "sla") return st.sla.pct;
    if(ind === "transf") return st.transf.taxa;
    if(ind === "aval") return st.aval.media;
    if(ind === "prod") return st.mediaDia;
    return null;
  }
  const fmtInd = (ind, v) => v == null ? "n/i" : (ind === "aval" ? nf(v, 2) : ind === "prod" ? nf(v, 1) : nf(v, 1) + "%");
  function planoAcao(ak, st){
    const P = (SF.S.planos[ak] || []);
    const linhas = P.map(p => `<tr><td>${esc(IND[p.ind] || p.ind)}</td><td>${esc(p.txt)}</td><td>${p.prazo ? esc(fd(p.prazo)) : '<span class="sf-mut">—</span>'}</td>
      <td class="r">${fmtInd(p.ind, p.base)}</td><td class="r">${fmtInd(p.ind, valorInd(p.ind, st))}</td>
      <td><select data-sf-plano="${esc(p.id)}" data-ak="${esc(ak)}">${[["aberta", "Aberta"], ["andamento", "Em andamento"], ["concluida", "Concluída"]].map(s => `<option value="${s[0]}" ${p.status === s[0] ? "selected" : ""}>${s[1]}</option>`).join("")}</select></td>
      <td><button type="button" class="sf-btn mini" data-sf="plano-del" data-v="${esc(p.id)}" data-ak="${esc(ak)}">Excluir</button></td></tr>`).join("");
    return `<h4 class="sf-h4">Plano de ação e acompanhamento</h4>
      <p class="sf-nota">Ações definidas por você. O valor inicial é gravado quando a ação é criada e comparado com o valor atual do filtro.</p>
      ${P.length ? `<div class="sf-scroll"><table><thead><tr><th>Indicador</th><th>Ação</th><th>Prazo</th><th class="r">Valor inicial</th><th class="r">Valor atual</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : vazio("Nenhuma ação cadastrada.")}
      <form class="sf-plano" data-sf-form="plano" data-ak="${esc(ak)}">
        <select name="ind">${Object.keys(IND).map(k => `<option value="${k}">${IND[k]}</option>`).join("")}</select>
        <input name="txt" placeholder="Ação combinada (ex.: revisar atendimentos violados da semana)" required>
        <input name="prazo" type="date" title="Prazo">
        <button class="sf-btn pri" type="submit">Adicionar ação</button>
      </form>`;
  }

  /* ---------------- IMPORTAR ---------------- */
  const MODELO = `// MODELO DO FORMATO — troque tudo pelos dados reais exportados do SacFlow.
// Linhas começadas por // são comentários. Separador de colunas: ; (ponto e vírgula), tab ou |
// Cada bloco começa com @ATENDENTE. Quem não tem dado numa seção simplesmente não a escreve.

@ATENDENTE: NOME DO ATENDENTE (EXEMPLO)
@PERIODO: 01/10/2026 a 31/10/2026

@RESUMO
Total de atendimentos: 0
Cumprimento de SLA (%): 0

@ATENDIMENTOS
id;cliente;criado;encerrado;departamento;canal;status;tipo_sla;resultado_sla;transferencias;nota;pesquisa_enviada;ultima_interacao;resumo
EXEMPLO-001;Nome do cliente;01/10/2026 09:00;01/10/2026 09:40;Financeiro;WhatsApp;Encerrado;Primeira resposta;Dentro;0;5;sim;01/10/2026 09:40;Dúvida sobre boleto

@SLA
id;data;tipo;resultado;detalhe
EXEMPLO-001;01/10/2026 09:05;Primeira resposta;Dentro;

@TRANSFERENCIAS
id;data;de_atendente;para_atendente;departamento_origem;departamento_destino;motivo
EXEMPLO-002;02/10/2026 10:30;NOME DO ATENDENTE (EXEMPLO);OUTRO ATENDENTE;Financeiro;Comercial;Assunto de outra área

@AVALIACOES
id;data;nota;comentario
EXEMPLO-001;01/10/2026;5;Atendimento rápido

@MENSAGENS
id;data_hora;autor;tipo;mensagem
EXEMPLO-001;01/10/2026 09:00;Cliente;mensagem;Bom dia, preciso da segunda via do boleto

@OBSERVACOES
Texto livre opcional.
`;
  /* MODELO 2: só indicadores consolidados (@RESUMO) por atendente. Os nomes das linhas são os reconhecidos pelo painel. */
  const MODELO2 = `// MODELO 2 — INDICADORES CONSOLIDADOS (@RESUMO). Troque os números pelos do SacFlow; um bloco por atendente.
// COPIE O BLOCO (do @ATENDENTE até a última linha) uma vez para cada atendente.
// Use os nomes das linhas exatamente como estão abaixo. Tempos em SEGUNDOS. Percentuais com vírgula ou ponto.
// Linhas começadas por // são comentários.

@ATENDENTE: NOME DO ATENDENTE (EXEMPLO)
@PERIODO: 01/10/2026 a 31/10/2026

@RESUMO
Total de atendimentos iniciados: 120
Atendimentos com registro de SLA: 110
SLA eventos: 200
Violações SLA: 17
Cumprimento de SLA (%): 91,5
Transferências registradas: 3

Primeira resposta cumprimento percentual: 95
Primeira resposta violações: 4
Primeira resposta tempo médio segundos: 75

Tempo resposta cumprimento percentual: 93
Tempo resposta violações: 5
Tempo resposta medio segundos: 210

Resolução cumprimento percentual: 88
Resolução violações: 8
Tempo resolução medio segundos: 5400

Avaliação média: 4,7
Total de avaliações recebidas: 139
Avaliações negativas: 2
`;
  function contarExistentes(editId){
    const N = SF.norm(), s = new Set();
    [["atend", N.atend], ["sla", N.sla.filter(x => !x.deriv)], ["transf", N.transf], ["aval", N.aval.filter(x => !x.deriv)], ["msg", N.msg], ["resumo", N.resumo]]
      .forEach(([t, arr]) => arr.forEach(r => { if(r._imp !== editId) s.add(t + ":" + r._k); }));
    return s;
  }
  function validar(){
    const texto = V.imp.texto;
    const p = SF.parseTexto(texto), ex = contarExistentes(V.imp.edit);
    const cat = {atend: "Atendimentos", sla: "Registros de SLA", transf: "Transferências", aval: "Avaliações", msg: "Mensagens/eventos", resumo: "Indicadores do RESUMO"};
    const linhas = Object.keys(cat).map(t => {
      const recs = p.recs[t], unicos = new Map(recs.map(r => [r._k, r]));
      let novos = 0, atual = 0;
      unicos.forEach((r, k) => { if(ex.has(t + ":" + k)) atual++; else novos++; });
      return {t, nome: cat[t], lidos: recs.length, novos, atual, dupArq: p.dupLocal[t] || 0};
    });
    const nomes = new Set();
    ["atend", "sla", "transf", "aval", "resumo"].forEach(t => p.recs[t].forEach(r => nomes.add(r.att)));
    const erros = p.issues.filter(i => i.nivel === "erro"), avisos = p.issues.filter(i => i.nivel === "aviso");
    const exemplo = /EXEMPLO/i.test(texto);
    const total = linhas.reduce((a, l) => a + l.lidos, 0);
    V.imp.res = {linhas, nomes: [...nomes], erros, avisos, exemplo, total};
    V.imp.valido = texto;
  }
  function telaImportar(){
    const I = V.imp, r = I.res, N = SF.norm();
    const resHtml = r && I.valido === I.texto ? `
      <div class="sf-res-val">
        <h4>Resultado da validação</h4>
        <div class="sf-scroll"><table><thead><tr><th>Categoria</th><th class="r">Linhas lidas</th><th class="r">Novos</th><th class="r">Já existem (serão atualizados)</th><th class="r">Duplicados no texto</th></tr></thead><tbody>
          ${r.linhas.map(l => `<tr><td>${l.nome}</td><td class="r">${l.lidos}</td><td class="r">${l.novos}</td><td class="r">${l.atual}</td><td class="r">${l.dupArq}</td></tr>`).join("")}</tbody></table></div>
        <p class="sf-nota">Atendentes identificados: ${r.nomes.length ? r.nomes.map(esc).join(", ") : "nenhum"}. Duplicados (mesmo ID/chave) são mantidos uma única vez — vale a última ocorrência.</p>
        ${r.erros.length ? `<div class="sf-aviso bad"><b>${r.erros.length} erro(s)</b> — as linhas com erro serão ignoradas:<ul>${r.erros.slice(0, 40).map(i => `<li>${i.ln ? "Linha " + i.ln + ": " : ""}${esc(i.msg)}</li>`).join("")}</ul>${r.erros.length > 40 ? "…" : ""}</div>` : ""}
        ${r.avisos.length ? `<details class="sf-aviso warn" ${r.avisos.length < 8 ? "open" : ""}><summary><b>${r.avisos.length} aviso(s)</b> (campos ausentes ou inconsistentes; o dado ausente fica como "não informado")</summary><ul>${r.avisos.slice(0, 80).map(i => `<li>${i.ln ? "Linha " + i.ln + ": " : ""}${esc(i.msg)}</li>`).join("")}</ul></details>` : ""}
        ${r.exemplo ? aviso("O texto contém a palavra EXEMPLO (dados do modelo). Substitua pelos dados reais antes de importar.", "warn") : ""}
        ${!r.erros.length && !r.avisos.length && r.total ? aviso("Nenhum problema encontrado.", "ok") : ""}
        <button type="button" class="sf-btn pri" data-sf="importar" ${r.total ? "" : "disabled"}>${I.edit ? "Salvar alterações desta importação" : "Importar e incorporar ao painel"}</button>
      </div>` : (r ? aviso("O texto foi alterado depois da última validação. Valide novamente.", "warn") : "");
    const hist = SF.S.imports.length ? tabelaHist() : vazio("Nenhuma importação feita ainda.");
    return `<div class="sf-grid-imp">
      ${secao(I.edit ? "Editar importação" : "Nova importação", `
        ${I.msg ? aviso(I.msg, "ok") : ""}
        <div class="sf-imp-linha"><label>Nome / origem desta importação<input id="sf-imp-nome" value="${esc(I.nome)}" placeholder="ex.: SacFlow – 01 a 15/10/2026"></label>
          <label class="sf-file">Ou carregar arquivo (.txt / .csv)<input type="file" id="sf-imp-file" accept=".txt,.csv,.tsv,text/plain"></label></div>
        <textarea id="sf-imp-texto" spellcheck="false" placeholder="Cole aqui o texto exportado do SacFlow…">${esc(I.texto)}</textarea>
        <div class="sf-imp-btns"><button type="button" class="sf-btn pri" data-sf="validar">Validar</button>
          <button type="button" class="sf-btn" data-sf="modelo" title="Lista de atendimentos, SLA, transferências, avaliações">Inserir Modelo 1 (atendimentos detalhados)</button>
          <button type="button" class="sf-btn" data-sf="modelo2" title="Só indicadores consolidados por atendente (@RESUMO)">Inserir Modelo 2 (indicadores @RESUMO)</button>
          ${I.edit ? `<button type="button" class="sf-btn" data-sf="cancelaredit">Cancelar edição</button>` : ""}</div>
        ${resHtml}`, {nota: "O texto pode ser corrigido aqui mesmo e validado de novo. Nada entra no painel antes de você confirmar."})}
      ${secao("Importações registradas (dados brutos)", hist, {nota: "O texto original de cada importação é guardado. Remover uma importação retira os registros que só ela trouxe."})}
    </div>
    ${secao("Como montar o texto", `<div class="sf-formato">
      <p>Blocos por atendente, com seções iniciadas por <code>@</code>. A primeira linha de cada tabela é o cabeçalho; os nomes de colunas aceitam variações (ex.: <code>id</code>, <code>protocolo</code>, <code>ticket</code>).</p>
      <table><thead><tr><th>Seção</th><th>Colunas (obrigatórias em negrito)</th></tr></thead><tbody>
        <tr><td><code>@ATENDENTE: Nome | PERIODO: 01/10/2026 a 15/10/2026</code></td><td>Abre um bloco. O período também pode vir numa linha <code>@PERIODO:</code> (aceita ainda <code>10/2026</code>).</td></tr>
        <tr><td><code>@RESUMO</code></td><td>Linhas <code>indicador: valor</code> — números registrados no SacFlow (guardados como vieram, sem recalcular).</td></tr>
        <tr><td><code>@ATENDIMENTOS</code></td><td><b>id</b>, cliente, criado, encerrado, atendente, departamento, canal, status, tipo_sla, resultado_sla (dentro/violado), transferencias, nota (1 a 5), pesquisa_enviada (sim/não), ultima_interacao, resumo</td></tr>
        <tr><td><code>@SLA</code></td><td><b>id</b>, data, tipo, <b>resultado</b>, detalhe</td></tr>
        <tr><td><code>@TRANSFERENCIAS</code></td><td><b>id</b>, data, de_atendente, para_atendente, departamento_origem, departamento_destino, motivo</td></tr>
        <tr><td><code>@AVALIACOES</code></td><td><b>id</b>, data, <b>nota</b>, comentario</td></tr>
        <tr><td><code>@MENSAGENS</code></td><td><b>id</b>, data_hora, autor, tipo (mensagem/evento), <b>mensagem</b></td></tr>
        <tr><td><code>@OBSERVACOES</code></td><td>Texto livre.</td></tr></tbody></table>
      <details class="sf-modelo2" open><summary><b>Modelo 2 — indicadores consolidados (@RESUMO)</b></summary>
        <p>Use quando o SacFlow entrega só os totais por atendente. Os nomes das linhas precisam ser iguais aos do modelo; nome diferente aparece como "não informado" no painel. Tempos em segundos.</p>
        <pre>${esc(MODELO2)}</pre>
        <button type="button" class="sf-btn pri" data-sf="modelo2">Inserir este modelo na caixa de importação</button>
      </details>
      <p>Datas: <code>dd/mm/aaaa</code> ou <code>dd/mm/aaaa hh:mm</code> (também <code>aaaa-mm-dd</code>). Campo vazio = não informado (nunca zero). Em transferências sem <code>de</code>/<code>para</code>, o evento fica "vinculado" ao atendente do bloco, sem direção.</p></div>`)}`;
  }
  function tabelaHist(){
    const N = SF.norm();
    const cnt = {};
    ["atend", "sla", "transf", "aval", "msg"].forEach(t => N[t].forEach(r => { if(r._imp){ (cnt[r._imp] = cnt[r._imp] || {atend: 0, sla: 0, transf: 0, aval: 0, msg: 0})[t]++; } }));
    return `<div class="sf-scroll"><table><thead><tr><th>Origem</th><th>Importado em</th><th class="r">Atend.</th><th class="r">SLA</th><th class="r">Transf.</th><th class="r">Aval.</th><th class="r">Msgs</th><th></th></tr></thead><tbody>${
      [...SF.S.imports].reverse().map(i => { const c = cnt[i.id] || {atend: 0, sla: 0, transf: 0, aval: 0, msg: 0};
        return `<tr><td>${esc(i.nome || "(sem nome)")}</td><td>${esc(fd(i.em))}</td><td class="r">${c.atend}</td><td class="r">${c.sla}</td><td class="r">${c.transf}</td><td class="r">${c.aval}</td><td class="r">${c.msg}</td>
        <td class="nw"><button type="button" class="sf-btn mini" data-sf="editimp" data-v="${esc(i.id)}">Editar</button> <button type="button" class="sf-btn mini" data-sf="delimp" data-v="${esc(i.id)}">Remover</button></td></tr>`; }).join("")}</tbody></table></div>`;
  }

  /* ---------------- FÓRMULAS E METAS ---------------- */
  function telaFormulas(){
    const M = metas();
    const campo = (k, rot, ajuda, step) => `<label>${rot}<input type="number" step="${step}" min="0" data-meta="${k}" value="${M[k] != null ? M[k] : ""}" placeholder="não definida"><small>${ajuda}</small></label>`;
    const F = [
      ["Atendimentos", "Quantidade de linhas na lista de atendimentos (IDs únicos) cujo responsável é o atendente, dentro dos filtros. Registrado no SacFlow ≠ calculado aqui."],
      ["Média diária", "Atendimentos com data ÷ dias distintos que têm pelo menos um atendimento. Dias sem registro não entram."],
      ["Cumprimento de SLA", "dentro do prazo ÷ (dentro + violados) × 100. Registros com resultado não reconhecido ficam fora."],
      ["Violações", "Quantidade de registros de SLA com resultado “violado”. Percentual de violação = violações ÷ sujeitos ao SLA."],
      ["Transferências (eventos)", "Cada evento (atendimento + data + de + para + destino) conta uma vez. Realizadas: o atendente é “de”; recebidas: é “para”."],
      ["Taxa de transferência", "atendimentos com ≥ 1 transferência ÷ atendimentos com transferência informada (coluna transferencias, ou bloco com @TRANSFERENCIAS)."],
      ["Transferidos > 1×", "Atendimentos com 2 ou mais transferências."],
      ["Nota média", "Soma das notas ÷ quantidade de avaliações válidas (1 a 5). Notas fora da escala são ignoradas."],
      ["Positiva / neutra / negativa", "Positiva: nota ≥ 4 · neutra: 3 ≤ nota < 4 · negativa: nota < 3."],
      ["Taxa de resposta", "atendimentos com pesquisa enviada que têm nota ÷ atendimentos com pesquisa_enviada = sim. Sem a coluna, fica “não informado”."],
      ["Equipe", "Calculada sobre todos os registros do filtro, nunca pela média das médias nem pela soma de percentuais."],
      ["Mês atual × anterior", "Mês do dado mais recente, do dia 1 até aquele dia, contra o mesmo intervalo do mês anterior."],
      ["Ranking", `Só entram atendentes com pelo menos ${minReg()} registros no indicador; a quantidade de registros aparece ao lado.`]
    ];
    return `${secao("Metas configuráveis", `<p class="sf-nota">Nenhuma meta é assumida. Sem meta definida, o painel não classifica o resultado como dentro ou fora.</p>
        <div class="sf-metas">${campo("slaMin", "Cumprimento de SLA mínimo (%)", "ex.: um valor definido pela gestão", "0.1")}${campo("transfMax", "Taxa de transferência máxima (%)", "limite aceitável", "0.1")}${campo("notaMin", "Nota média mínima (1 a 5)", "mínimo aceitável", "0.1")}${campo("minReg", "Mínimo de registros para ranking", `padrão ${5}`, "1")}</div>
        <button type="button" class="sf-btn pri" data-sf="salvarmetas">Salvar metas</button> ${V.imp.msgMetas ? `<span class="sf-ok-txt">${V.imp.msgMetas}</span>` : ""}`)}
      ${secao("Fórmulas dos indicadores", `<div class="sf-scroll"><table><thead><tr><th>Indicador</th><th>Como é calculado</th></tr></thead><tbody>${F.map(f => `<tr><td><b>${f[0]}</b></td><td>${f[1]}</td></tr>`).join("")}</tbody></table></div>`)}
      ${secao("Camadas de dados", `<ol class="sf-camadas"><li><b>Brutos</b>: o texto importado, guardado integralmente (aba Importar).</li><li><b>Normalizados</b>: registros interpretados, sem duplicidade, com campos ausentes marcados como não informados.</li><li><b>Calculados</b>: indicadores recalculados a cada filtro a partir dos normalizados.</li><li><b>Metas</b>: só as que você configurar acima.</li><li><b>Análises e recomendações</b>: geradas na tela por regras simples, separando fatos, correlações e hipóteses; o plano de ação é seu.</li></ol>
        <p class="sf-nota">Tudo fica salvo neste navegador. Para zerar os dados do SacFlow: <button type="button" class="sf-btn mini" data-sf="limpartudo">Apagar todos os dados do SacFlow</button></p>`)}`;
  }

  /* ---------------- render / eventos ---------------- */
  function raiz(){ return document.getElementById(ELID); }
  function render(focoId){
    const r = raiz(); if(!r) return;
    const y = window.scrollY;
    DS = {}; TB = {};
    r.innerHTML = html();
    if(focoId){ const el = document.getElementById(focoId); if(el){ el.focus(); try{ const n = el.value.length; el.setSelectionRange(n, n); }catch(x){} } }
    window.scrollTo(0, y);
  }
  function csv(id){
    const t = TB[id]; if(!t) return;
    const lin = [t.cols.map(c => c.l)].concat(t.rows.map(r => t.cols.map(c => { const v = c.v(r); return v == null ? "" : (typeof v === "number" ? String(v).replace(".", ",") : String(v)); })));
    const txt = lin.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + txt], {type: "text/csv;charset=utf-8"}));
    a.download = `sacflow-${id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function mesRef(delta){
    const lim = limitesDados(); if(!lim) return;
    let y = +lim.max.slice(0, 4), m = +lim.max.slice(5, 7) + delta;
    while(m < 1){ m += 12; y--; }
    const ini = `${y}-${String(m).padStart(2, "0")}-01`, fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    V.F.de = ini; V.F.ate = fim;
  }

  function onClick(ev){
    const t = ev.target.closest("[data-sf]");
    if(!t || !raiz() || !raiz().contains(t)) return;
    const a = t.dataset.sf, v = t.dataset.v;
    if(a === "fechar"){ if(ev.target.closest(".sf-modal-c") && !ev.target.closest(".sf-x") && t.classList.contains("sf-modal")) return; V.modal = ""; render(); return; }
    if(t.tagName === "A") ev.preventDefault();
    switch(a){
      case "tab": V.tab = v; V.att = null; V.modal = ""; render(); window.scrollTo(0, 0); break;
      case "attsel": V.tab = "atendentes"; V.att = v; V.modal = ""; render(); window.scrollTo(0, 0); break;
      case "voltar": V.att = null; render(); break;
      case "anc": { const el = document.getElementById(v); if(el) el.scrollIntoView({behavior: "smooth", block: "start"}); break; }
      case "sort": { const [id, k] = v.split(":"); const o = V.ord[id]; V.ord[id] = o && o.k === k ? {k, dir: -o.dir} : {k, dir: 1}; render(); break; }
      case "mais": V.lim[v] = (V.lim[v] || 50) + 100; render(); break;
      case "csv": csv(v); break;
      case "gran": V.gran = v; render(); break;
      case "quick": mesRef(v === "mes" ? 0 : -1); render(); break;
      case "limpar": V.F = {de: "", ate: "", att: "", dep: "", canal: "", stg: ""}; render(); break;
      case "drill": V.modal = detalheDrill(v); render(); break;
      case "openat": V.modal = detalheAt(v); render(); break;
      case "validar": lerTela(); validar(); render(); break;
      case "modelo": lerTela(); V.imp.texto = MODELO; V.imp.res = null; V.imp.valido = null; render(); break;
      case "modelo2": lerTela(); V.imp.texto = MODELO2; V.imp.res = null; V.imp.valido = null; render(); break;
      case "cancelaredit": V.imp = {texto: "", nome: "", res: null, valido: null, edit: null, msg: ""}; render(); break;
      case "importar": importar(); break;
      case "editimp": { const i = SF.S.imports.find(x => x.id === v); if(i){ V.imp = {texto: i.texto, nome: i.nome, res: null, valido: null, edit: i.id, msg: ""}; validar(); render(); } break; }
      case "delimp": if(confirm("Remover esta importação? Os registros que só ela trouxe sairão do painel.")){ SF.S.imports = SF.S.imports.filter(x => x.id !== v); SF.invalidar(); SF.salvar(); render(); } break;
      case "salvarmetas": salvarMetas(); break;
      case "limpartudo": if(confirm("Apagar TODOS os dados do SacFlow (importações, metas e planos de ação) deste navegador?")){ SF.S.imports = []; SF.S.metas = {}; SF.S.planos = {}; SF.invalidar(); SF.salvar(); V.att = null; render(); } break;
      case "plano-del": { const ak = t.dataset.ak; SF.S.planos[ak] = (SF.S.planos[ak] || []).filter(p => p.id !== v); SF.salvar(); render(); break; }
    }
  }
  function onKey(ev){
    if(ev.key !== "Enter" && ev.key !== " ") return;
    const t = ev.target.closest && ev.target.closest('[data-sf="drill"]');
    if(t){ ev.preventDefault(); t.click(); }
    if(ev.key === "Escape" && V.modal){ V.modal = ""; render(); }
  }
  function lerTela(){
    const t = document.getElementById("sf-imp-texto"), n = document.getElementById("sf-imp-nome");
    if(t) V.imp.texto = t.value;
    if(n) V.imp.nome = n.value;
  }
  function importar(){
    lerTela();
    if(V.imp.valido !== V.imp.texto){ validar(); }
    const r = V.imp.res;
    if(!r || !r.total){ render(); return; }
    if(r.exemplo && !confirm("O texto contém dados de EXEMPLO. Importar mesmo assim?")) return;
    const antes = JSON.stringify(SF.S.imports);
    if(V.imp.edit){
      const i = SF.S.imports.find(x => x.id === V.imp.edit);
      if(i){ i.texto = V.imp.texto; i.nome = V.imp.nome || i.nome; i.em = new Date().toISOString().slice(0, 16); }
    }else{
      SF.S.imports.push({id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome: V.imp.nome || ("Importação " + fd(new Date().toISOString().slice(0, 10))), em: new Date().toISOString().slice(0, 16), texto: V.imp.texto});
    }
    SF.invalidar();
    if(!SF.salvar()){
      SF.S.imports = JSON.parse(antes); SF.invalidar();
      V.imp.msg = ""; alert("Não foi possível salvar: o armazenamento do navegador está cheio. Remova importações antigas na lista abaixo e tente novamente.");
      render(); return;
    }
    const qtd = r.total;
    V.imp = {texto: "", nome: "", res: null, valido: null, edit: null, msg: `Importação concluída: ${qtd} linha(s) incorporadas. Os painéis já refletem os novos dados.`};
    render();
  }
  function salvarMetas(){
    const M = {};
    raiz().querySelectorAll("[data-meta]").forEach(i => { const n = SF.parseNum(i.value); if(n != null) M[i.dataset.meta] = n; });
    SF.S.metas = M; SF.salvar(); V.imp.msgMetas = "Metas salvas."; render(); V.imp.msgMetas = "";
  }
  function onChange(ev){
    const t = ev.target;
    if(t.dataset && t.dataset.f){
      if(t.type === "date" && t.value && !/^(19|20)\d\d-\d\d-\d\d$/.test(t.value)) return;   // ano ainda sendo digitado (ex.: 0002): não filtra nem redesenha
      V.F[t.dataset.f] = t.value; V.modal = ""; render(); return;
    }
    if(t.matches && t.matches("[data-sf-trocar]")){ V.att = t.value; render(); window.scrollTo(0, 0); return; }
    if(t.dataset && t.dataset.sfPlano){
      const ak = t.dataset.ak, p = (SF.S.planos[ak] || []).find(x => x.id === t.dataset.sfPlano);
      if(p){ p.status = t.value; SF.salvar(); }
      return;
    }
    if(t.id === "sf-imp-file" && t.files && t.files[0]){
      const f = t.files[0], rd = new FileReader();
      rd.onload = () => { V.imp.texto = String(rd.result || ""); if(!V.imp.nome) V.imp.nome = f.name; V.imp.res = null; V.imp.valido = null; render(); };
      rd.readAsText(f, "utf-8");
    }
  }
  function onInput(ev){
    const t = ev.target;
    if(t.dataset && t.dataset.sfQ){ V.busca[t.dataset.sfQ] = t.value; V.lim[t.dataset.sfQ] = 0; render("sf-q-" + t.dataset.sfQ); return; }
    if(t.id === "sf-imp-texto"){ V.imp.texto = t.value; }
    if(t.id === "sf-imp-nome"){ V.imp.nome = t.value; }
  }
  function onSubmit(ev){
    const f = ev.target.closest("[data-sf-form='plano']");
    if(!f) return;
    ev.preventDefault();
    const ak = f.dataset.ak, d = new FormData(f), ind = d.get("ind"), txt = String(d.get("txt") || "").trim();
    if(!txt) return;
    const D = CTX ? CTX.D : null;
    const st = D ? SF.stats(D, ak) : null;
    (SF.S.planos[ak] = SF.S.planos[ak] || []).push({id: Date.now().toString(36), ind, txt, prazo: String(d.get("prazo") || ""), status: "aberta", criada: new Date().toISOString().slice(0, 10), base: st ? valorInd(ind, st) : null});
    SF.salvar(); render();
  }

  function ligar(){
    const r = raiz();
    if(!r || r.__sfLigado) return;
    r.__sfLigado = true;
    r.addEventListener("click", onClick);
    r.addEventListener("keydown", onKey);
    r.addEventListener("change", onChange);
    r.addEventListener("input", onInput);
    r.addEventListener("submit", onSubmit);
  }

  window.sacflowHTML = () => { try{ DS = {}; TB = {}; return html(); }catch(e){ console.error(e); return `<div class="sf-aviso bad">Erro ao montar o SacFlow: ${esc(e.message)}</div>`; } };
  window.attachSacflow = ligar;
  window.sacflowRefresh = () => { SF.carregar(); ligar(); render(); };
})();
