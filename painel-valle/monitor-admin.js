/* =====================================================================
   MONITOR DO SISTEMA (somente administrador)  v1.0
   ---------------------------------------------------------------------
   1) CAPTURA (sempre ligada, carrega ANTES de todos os outros arquivos):
      erros de JavaScript, promessas rejeitadas, arquivos que não carregaram,
      console.error / console.warn, TODAS as chamadas de rede (fetch): Supabase,
      CDNs (cdnjs/jsdelivr) e o próprio site, internet caiu/voltou, e os eventos
      da sincronização (sync-supabase.js chama MONITOR.log).
      Fica na memória e em sessionStorage (sobrevive a recarregar a página).
   2) TELA (aba "Monitor", só admin): cartões de situação ao vivo, sincronização
      (versão local x publicada, comparação de tamanhos), site/Cloudflare (status,
      cf-ray, cache, versão nova publicada, teste de todos os arquivos) e a lista
      de eventos em tempo real com filtro, busca, copiar e baixar.
   O que o navegador NÃO enxerga: logs internos do Supabase (Postgres/Auth) e do
   painel da Cloudflare (deploys, Workers). Esses ficam nos painéis deles; aqui
   aparece o que o painel OBSERVOU (status HTTP, mensagem de erro, latência).
   ===================================================================== */
(function(){
  "use strict";
  if(window.MONITOR) return;

  const MAX = 500, SK = "__monitor_log_v1";
  let ev = [], seq = 0;
  const subs = [];
  const stats = {};
  ["supabase", "site", "cdn", "rede"].forEach(k => { stats[k] = { n: 0, erros: 0, ms: 0, ult: null, cf: "", cache: "", server: "", sbid: "" }; });
  const net = { online: (typeof navigator !== "undefined" ? navigator.onLine : true) };
  const carregouEm = Date.now();

  try{
    const r = JSON.parse(sessionStorage.getItem(SK) || "[]");
    if(Array.isArray(r)){ ev = r.slice(-150); seq = ev.reduce((m, x) => Math.max(m, x.id || 0), 0); }
  }catch(e){}

  let tPers = null;
  function persistir(){
    if(tPers) return;
    tPers = setTimeout(() => { tPers = null; try{ sessionStorage.setItem(SK, JSON.stringify(ev.slice(-150))); }catch(e){} }, 1000);
  }
  function avisar(x){ subs.forEach(f => { try{ f(x); }catch(e){} }); }

  const str = a => { try{ if(a instanceof Error) return a.stack || a.message || String(a); if(typeof a === "string") return a; if(a && a.message) return String(a.message); return JSON.stringify(a); }catch(e){ return String(a); } };
  const limpa = u => { try{ const x = new URL(u, location.href); return x.host + x.pathname + (x.search ? x.search.slice(0, 80) : ""); }catch(e){ return String(u).slice(0, 120); } };

  function log(src, nivel, msg, det){
    try{
      msg = String(msg == null ? "" : msg).slice(0, 400);
      det = det == null ? "" : String(det).slice(0, 2000);
      const u = ev[ev.length - 1];
      if(u && u.src === src && u.nivel === nivel && u.msg === msg){ u.n = (u.n || 1) + 1; u.t = Date.now(); if(det) u.det = det; }
      else{
        ev.push({ id: ++seq, t: Date.now(), src, nivel, msg, det, n: 1 });
        if(ev.length > MAX) ev.splice(0, ev.length - MAX);
      }
      persistir(); avisar(ev[ev.length - 1]);
    }catch(e){}
  }

  /* ---------- console.error / console.warn ---------- */
  ["error", "warn"].forEach(nv => {
    const o = console[nv];
    console[nv] = function(){
      try{
        const m = [].slice.call(arguments).map(str).join(" ");
        log(/^\s*\[sync\]/i.test(m) ? "sync" : "console", nv === "error" ? "erro" : "aviso", m.split("\n")[0], m);
      }catch(e){}
      return o.apply(console, arguments);
    };
  });

  /* ---------- erros de script e arquivos que não carregaram ---------- */
  window.addEventListener("error", e => {
    try{
      const t = e.target;
      if(t && t !== window && t.tagName){
        const u = t.src || t.href || "";
        if(u) log(/cdnjs|jsdelivr|unpkg/.test(u) ? "cdn" : "site", "erro", "Falha ao carregar arquivo: " + limpa(u), t.tagName + " " + u);
        return;
      }
      log("js", "erro", e.message || "Erro de script", (e.filename ? e.filename + ":" + e.lineno + ":" + e.colno + "\n" : "") + ((e.error && e.error.stack) || ""));
    }catch(x){}
  }, true);
  window.addEventListener("unhandledrejection", e => {
    try{ const r = e.reason; log("js", "erro", "Promessa rejeitada: " + String((r && r.message) || str(r)).split("\n")[0], str(r)); }catch(x){}
  });
  window.addEventListener("online", () => { net.online = true; log("rede", "ok", "Internet voltou"); });
  window.addEventListener("offline", () => { net.online = false; log("rede", "erro", "Internet caiu (navegador offline)"); });

  /* ---------- toda chamada de rede (fetch) ---------- */
  function classe(u){
    try{
      const x = new URL(u, location.href), h = x.hostname;
      if(/supabase\.(co|in)$/.test(h)) return "supabase";
      if(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(h)) return "cdn";
      if(x.origin === location.origin) return "site";
      return "rede";
    }catch(e){ return "rede"; }
  }
  function anota(c, status, ms, h){
    const s = stats[c] || stats.rede;
    s.n++; if(!(status > 0 && status < 400)) s.erros++;
    s.ms += ms; s.ult = { status, ms, t: Date.now() };
    if(h){ try{ s.cf = h.get("cf-ray") || s.cf; s.cache = h.get("cf-cache-status") || s.cache; s.server = h.get("server") || s.server; s.sbid = h.get("sb-request-id") || s.sbid; }catch(e){} }
  }
  if(typeof window.fetch === "function"){
    const f0 = window.fetch.bind(window);
    window.fetch = function(input, init){
      let url = ""; try{ url = typeof input === "string" ? input : ((input && input.url) || String(input)); }catch(e){}
      const metodo = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const c = classe(url), ini = performance.now();
      return f0(input, init).then(r => {
        try{
          const ms = Math.round(performance.now() - ini);
          anota(c, r.status, ms, r.headers);
          if(!r.ok && !/\/cdn-cgi\//.test(url)){
            const t = metodo + " " + limpa(url);
            r.clone().text().then(tx => log(c, "erro", "HTTP " + r.status + " " + t, (tx || "").slice(0, 500)), () => log(c, "erro", "HTTP " + r.status + " " + t));
          }else if(ms > 5000) log(c, "aviso", "Resposta lenta (" + ms + " ms): " + metodo + " " + limpa(url));
        }catch(e){}
        return r;
      }, err => {
        try{
          anota(c, 0, Math.round(performance.now() - ini));
          if(!(err && err.name === "AbortError")) log(c, "erro", "Falha de rede: " + metodo + " " + limpa(url), str(err));
        }catch(e){}
        throw err;
      });
    };
  }

  /* ---------- explicação em português ---------- */
  function dica(e){
    const m = (e.msg + " " + e.det).toLowerCase();
    if(/could not find the function|pgrst202|does not exist/.test(m)) return "Função/tabela do banco não encontrada: rode o supabase-sincronizacao.sql no SQL Editor do Supabase.";
    if(/row-level security|42501|permission denied|http 40[13]\b/.test(m)) return "Sem permissão no Supabase: a sessão expirou (saia e entre de novo) ou a regra de segurança (RLS) bloqueou.";
    if(/http 429|too many/.test(m)) return "Muitas requisições em pouco tempo (limite do Supabase/Cloudflare). Aguarde alguns minutos.";
    if(/http 413|payload|too large/.test(m)) return "Envio grande demais: o lote da publicação passou do limite.";
    if(/http 5\d\d\b|timeout|timed out/.test(m)) return "Servidor lento ou fora do ar (erro 5xx / Cloudflare 52x). Costuma voltar sozinho.";
    if(/http 404/.test(m)) return "Endereço não existe: arquivo não publicado no site ou tabela/função do Supabase não criada.";
    if(/failed to fetch|networkerror|load failed|falha de rede/.test(m)) return "Sem conexão com o servidor: internet caiu, bloqueio (antivírus/firewall/extensão) ou serviço fora do ar.";
    if(/falha ao carregar arquivo/.test(m)) return "Um arquivo do site não carregou: publicação incompleta na Cloudflare, cache antigo (Ctrl+F5) ou biblioteca externa bloqueada.";
    if(/quota|no space|sem espa/.test(m)) return "Sem espaço de armazenamento no navegador.";
    if(/publicação automática parada|vai reduzir|vai apagar/.test(m)) return "A trava de segurança impediu a publicação automática: confira os tamanhos em \"Comparar local × publicado\" e use \"Publicar para usuários\".";
    return "";
  }

  window.MONITOR = {
    log,
    eventos: () => ev,
    stats: () => stats,
    net: () => net,
    dica,
    carregouEm,
    on: f => { if(typeof f === "function") subs.push(f); },
    off: f => { const i = subs.indexOf(f); if(i > -1) subs.splice(i, 1); },
    limpar: () => { ev = []; try{ sessionStorage.removeItem(SK); }catch(e){} avisar(null); }
  };
  log("monitor", "info", "Monitor iniciado");
})();

/* =====================================================================
   TELA DO MONITOR (aba só para admin)
   ===================================================================== */
(function(){
  "use strict";
  const M = window.MONITOR;
  if(!M) return;

  const S = {
    filtro: "todos", busca: "", pausado: false, aberto: new Set(),
    ping: null, site: null, trace: null, diag: null, diagCarregando: false, arquivos: null, testando: false,
    novaVersao: false, hashBase: null, storage: null, ultVerifSite: 0
  };
  let tickT = null, rafT = null, ativoUI = false;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const limpa = u => { try{ const x = new URL(u, location.href); return x.host + x.pathname + (x.search ? x.search.slice(0, 80) : ""); }catch(e){ return String(u).slice(0, 120); } };
  const hms = t => new Date(t).toLocaleTimeString("pt-BR");
  const dh = t => new Date(t).toLocaleString("pt-BR");
  const mb = n => n === null || n === undefined ? "—" : (n / 1048576).toFixed(2).replace(".", ",") + " MB";
  const ehAdmin = () => window.AUTH_PAPEL === "admin";
  const $ = id => document.getElementById(id);
  const ativa = () => { const s = $("sec-monitor"); return !!(s && s.classList.contains("active")); };
  const ha = t => { if(!t) return "—"; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? "há " + s + " s" : s < 3600 ? "há " + Math.floor(s / 60) + " min" : "há " + Math.floor(s / 3600) + " h"; };

  const hash = s => { let h = 2166136261 >>> 0; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return s.length + ":" + h.toString(36); };

  /* ---------- verificações ---------- */
  async function verificarSupabase(){
    if(!window.SYNC || !window.SYNC.ping){ S.ping = { ok: false, semConexao: true, motivo: window.AUTH_MODO === "demo" ? "Modo demonstração (sem Supabase)" : "Ainda sem login/conexão" }; return; }
    try{ S.ping = Object.assign({ t: Date.now() }, await window.SYNC.ping()); }catch(e){ S.ping = { ok: false, t: Date.now(), erro: String((e && e.message) || e) }; }
  }
  async function verificarSite(){
    S.ultVerifSite = Date.now();
    if(location.protocol === "file:"){ S.site = { local: true, t: Date.now() }; return; }
    const r0 = { t: Date.now() };
    try{
      const ini = performance.now();
      const r = await fetch(location.pathname + "?_mon=" + Date.now(), { method: "HEAD", cache: "no-store" });
      r0.ms = Math.round(performance.now() - ini); r0.status = r.status; r0.ok = r.ok;
      ["server", "cf-ray", "cf-cache-status", "age", "last-modified", "etag", "cache-control"].forEach(h => { r0[h] = r.headers.get(h) || ""; });
    }catch(e){ r0.ok = false; r0.erro = String((e && e.message) || e); }
    S.site = r0;
    try{
      const tr = await fetch("/cdn-cgi/trace", { cache: "no-store" });
      if(tr.ok){ const tx = await tr.text(), o = {}; tx.split("\n").forEach(l => { const i = l.indexOf("="); if(i > 0) o[l.slice(0, i)] = l.slice(i + 1); }); S.trace = { ok: true, colo: o.colo, loc: o.loc, http: o.http, tls: o.tls, warp: o.warp }; }
      else S.trace = { ok: false, status: tr.status };
    }catch(e){ S.trace = { ok: false, erro: String((e && e.message) || e) }; }
    try{
      const tx = await (await fetch(location.pathname, { cache: "no-store" })).text(), h = hash(tx);
      if(S.hashBase === null) S.hashBase = h; else S.novaVersao = S.hashBase !== h;
    }catch(e){}
  }
  async function verificarStorage(){
    try{
      if(navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); S.storage = { uso: e.usage, cota: e.quota, persistente: navigator.storage.persisted ? await navigator.storage.persisted() : null }; }
    }catch(e){}
  }
  async function testarArquivos(){
    if(S.testando) return;
    if(location.protocol === "file:"){ S.arquivos = { local: true }; return desenhar(); }
    S.testando = true; S.arquivos = { itens: [], total: 0 }; desenhar();
    const urls = new Set();
    document.querySelectorAll("script[src]").forEach(s => urls.add(s.src));
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(l => urls.add(l.href));
    const lista = Array.from(urls); S.arquivos.total = lista.length;
    let i = 0;
    const worker = async () => {
      while(i < lista.length){
        const u = lista[i++], ini = performance.now();
        const it = { url: u, curto: limpa(u).replace(location.host, "") };
        try{ const r = await fetch(u, { method: "GET", cache: "no-store" }); it.status = r.status; it.ok = r.ok; it.ms = Math.round(performance.now() - ini); it.cf = r.headers.get("cf-cache-status") || ""; const b = await r.blob(); it.bytes = b.size; }
        catch(e){ it.ok = false; it.status = 0; it.erro = "bloqueado ou sem acesso"; it.ms = Math.round(performance.now() - ini); }
        S.arquivos.itens.push(it); agendar();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    S.testando = false;
    const ruins = S.arquivos.itens.filter(x => !x.ok).length;
    M.log("site", ruins ? "erro" : "ok", "Teste dos arquivos do site: " + (S.arquivos.itens.length - ruins) + " OK, " + ruins + " com problema");
    desenhar();
  }
  async function compararSync(){
    if(!window.SYNC || !window.SYNC.diagnostico) return;
    S.diagCarregando = true; S.diag = null; desenhar();
    try{ S.diag = await window.SYNC.diagnostico(); }catch(e){ S.diag = { erro: String((e && e.message) || e) }; }
    S.diagCarregando = false; desenhar();
  }

  /* ---------- HTML ---------- */
  window.monitorAdminHTML = () => `
    <h2 class="section-title">Monitor do sistema <span class="mon-tag">somente administrador</span></h2>
    <p class="section-desc">Erros e situação em tempo real: site, Supabase, sincronização, rede e Cloudflare. A captura fica ligada o tempo todo (mesmo com esta aba fechada); aqui você vê tudo desde que a página foi aberta.</p>
    <div id="monRestrito" class="panel" hidden><div class="empty">Acesso restrito ao administrador.</div></div>
    <div id="monCorpo">
      <div class="mon-cards" id="monCards"></div>
      <div class="mon-grid">
        <div class="panel"><div class="panel-header">Sincronização · Supabase</div><div class="mon-body" id="monSync"></div></div>
        <div class="panel"><div class="panel-header">Site · Cloudflare</div><div class="mon-body" id="monHost"></div></div>
      </div>
      <div class="panel">
        <div class="panel-header">Eventos em tempo real</div>
        <div class="mon-body">
          <div class="mon-tools">
            <div class="mon-chips" id="monChips"></div>
            <input type="search" class="small-input" id="monBusca" placeholder="Buscar no log…" autocomplete="off">
            <button type="button" class="btn btn-ghost btn-sm" id="monPausa">Pausar</button>
            <button type="button" class="btn btn-ghost btn-sm" id="monCopiar">Copiar relatório</button>
            <button type="button" class="btn btn-ghost btn-sm" id="monBaixar">Baixar .txt</button>
            <button type="button" class="btn btn-ghost btn-sm" id="monTeste" title="Registra um evento de teste para conferir a captura">Evento de teste</button>
            <button type="button" class="btn btn-ghost btn-sm" id="monLimpar">Limpar</button>
          </div>
          <div class="mon-log" id="monLog"></div>
          <div class="mon-rodape" id="monRodape"></div>
        </div>
      </div>
      <div class="panel"><div class="panel-header">Ambiente deste navegador</div><div class="mon-body" id="monAmb"></div></div>
    </div>`;

  const card = (cls, titulo, valor, sub) => `<div class="mon-card ${cls}"><span class="mon-dot"></span><div><small>${esc(titulo)}</small><b>${esc(valor)}</b><em>${esc(sub || "")}</em></div></div>`;
  const kv = linhas => `<table class="mon-kv">${linhas.filter(Boolean).map(l => `<tr><th>${esc(l[0])}</th><td>${l[1]}</td></tr>`).join("")}</table>`;

  function estadoSync(){ try{ return window.SYNC && window.SYNC.estado ? window.SYNC.estado() : null; }catch(e){ return null; } }

  function cartoes(){
    const out = [];
    out.push(M.net().online ? card("ok", "Internet", "Online", "navegador conectado") : card("err", "Internet", "OFFLINE", "sem conexão"));
    const p = S.ping, ss = M.stats().supabase;
    if(!p) out.push(card("off", "Supabase", "Verificando…", ""));
    else if(p.semConexao) out.push(card("off", "Supabase", "Sem conexão", p.motivo));
    else if(!p.ok) out.push(card("err", "Supabase", "ERRO", (p.erro || "falhou") + " · " + ha(p.t)));
    else out.push(card(p.ms > 2500 ? "warn" : "ok", "Supabase", p.ms + " ms", (p.ms > 2500 ? "lento" : "respondendo") + " · " + ha(p.t)));
    const sy = estadoSync();
    if(!sy || !sy.ativo) out.push(card("off", "Sincronização", "Inativa", "faça login"));
    else if(sy.ocupado) out.push(card("warn", "Sincronização", "Publicando…", sy.papel));
    else if(sy.aviso) out.push(card("warn", "Sincronização", "Atenção", sy.aviso.slice(0, 70)));
    else if(sy.sujo) out.push(card("warn", "Sincronização", "Pendente", "alterações a publicar"));
    else out.push(card("ok", "Sincronização", sy.papel === "admin" ? "Em dia" : "Leitor", sy.ultimoOk || ""));
    const st = S.site, tr = S.trace;
    if(!st) out.push(card("off", "Site · Cloudflare", "Verificando…", ""));
    else if(st.local) out.push(card("off", "Site · Cloudflare", "Arquivo local", "aberto por file:// (sem hospedagem)"));
    else if(!st.ok) out.push(card("err", "Site · Cloudflare", st.status ? "HTTP " + st.status : "ERRO", st.erro || ""));
    else out.push(card(S.novaVersao ? "warn" : "ok", "Site · Cloudflare", S.novaVersao ? "Versão nova" : "HTTP " + st.status, S.novaVersao ? "publicada: use Ctrl+F5" : (st.ms + " ms" + (tr && tr.ok ? " · " + tr.colo : ""))));
    const agora = Date.now(), evs = M.eventos();
    const e1h = evs.filter(x => x.nivel === "erro" && agora - x.t < 3600000).reduce((n, x) => n + (x.n || 1), 0);
    const a1h = evs.filter(x => x.nivel === "aviso" && agora - x.t < 3600000).reduce((n, x) => n + (x.n || 1), 0);
    out.push(card(e1h ? "err" : a1h ? "warn" : "ok", "Erros (última hora)", String(e1h), a1h + " aviso(s)"));
    const sg = S.storage;
    if(sg && sg.cota){ const pc = sg.uso / sg.cota * 100; out.push(card(pc > 80 ? "err" : pc > 50 ? "warn" : "ok", "Armazenamento", mb(sg.uso), pc.toFixed(1).replace(".", ",") + "% da cota")); }
    else out.push(card("off", "Armazenamento", "—", ""));
    return out.join("");
  }

  function painelSync(){
    const sy = estadoSync(), p = S.ping, s = M.stats().supabase;
    let h = "";
    if(!sy){ h += `<div class="empty">Sincronização ainda não iniciada (faça login).</div>`; }
    else{
      const alinhado = p && p.ok ? (p.versaoRemota ? (p.versaoRemota === sy.versaoLocal ? "sim" : "NÃO — este navegador difere do publicado") : "nada publicado ainda") : "—";
      h += kv([
        ["Papel", esc(sy.papel) + " · " + esc(sy.email || "")],
        ["Estado", sy.ocupado ? "Publicando…" : (sy.aviso ? `<span class="mon-t-warn">${esc(sy.aviso)}</span>` : (sy.sujo ? "Alterações pendentes" : "Em dia"))],
        ["Publicação automática", sy.papel === "admin" ? (sy.autoAgendado ? "agendada" : "aguardando alterações") : "— (só admin)"],
        ["Última publicação OK", esc(sy.ultimoOk || "—")],
        ["Versão deste navegador", esc(sy.versaoLocal || "—")],
        ["Versão publicada", p && p.ok ? esc(p.versaoRemota || "—") + (p.por ? " · por " + esc(p.por) : "") : "—"],
        ["Alinhado com o publicado", esc(alinhado)],
        ["Chamadas ao Supabase", s.n + " (" + s.erros + " com erro) · média " + (s.n ? Math.round(s.ms / s.n) : 0) + " ms" + (s.ult ? " · última HTTP " + s.ult.status + " " + ha(s.ult.t) : "")],
        ["Borda Cloudflare do Supabase", esc(s.cf || "não exposto pelo navegador") + (s.sbid ? " · req " + esc(s.sbid) : "")]
      ]);
    }
    h += `<div class="mon-acoes">
      <button type="button" class="btn btn-ghost btn-sm" data-mon="ping">Verificar agora</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mon="diag" ${S.diagCarregando ? "disabled" : ""}>${S.diagCarregando ? "Comparando…" : "Comparar local × publicado"}</button>
      ${sy && sy.papel === "admin" ? `<button type="button" class="btn btn-ghost btn-sm" data-mon="pub">Publicar agora</button>` : ""}
    </div>`;
    const d = S.diag;
    if(d){
      if(d.erro) h += `<div class="mon-erro">Não consegui comparar: ${esc(d.erro)}</div>`;
      else{
        const rk = new Set(); (d.risco.apagar || []).forEach(x => rk.add(String(x).split(" ")[0])); (d.risco.reduzir || []).forEach(x => rk.add(String(x).split(":")[0]));
        h += `<div class="mon-diag-t">${d.risco.risco ? `<b class="mon-t-warn">A trava de segurança vai avisar (${d.risco.apagar.length} a apagar, ${d.risco.reduzir.length} a reduzir)</b>` : `<b class="mon-t-ok">Nenhuma redução relevante: a publicação não será travada.</b>`}</div>
        <div class="mon-scroll"><table class="mon-tab"><tr><th>Item</th><th>Neste navegador</th><th>Publicado</th><th>Diferença</th></tr>${
          d.linhas.sort((a, b) => (b.publicado || 0) - (a.publicado || 0)).map(l => {
            const dif = (l.local === null ? "só publicado" : l.publicado === null ? "novo" : ((l.local - l.publicado) / 1048576).toFixed(2).replace(".", ",") + " MB");
            const ruim = rk.has(l.chave) ? "mon-linha-ruim" : "";
            return `<tr class="${ruim}"><td>${esc(l.chave)}</td><td>${mb(l.local)}</td><td>${mb(l.publicado)}</td><td>${esc(dif)}</td></tr>`;
          }).join("")}</table></div>`;
      }
    }
    return h;
  }

  function painelHost(){
    const st = S.site, tr = S.trace;
    let h = "";
    if(!st) h += `<div class="empty">Verificando…</div>`;
    else if(st.local) h += `<div class="empty">O painel está aberto como arquivo local (file://). Verificações de hospedagem/Cloudflare só funcionam com o site publicado.</div>`;
    else h += kv([
      ["Endereço", esc(location.origin + location.pathname)],
      ["Resposta do site", st.ok ? `HTTP ${st.status} · ${st.ms} ms` : `<span class="mon-t-err">${esc(st.erro || "HTTP " + st.status)}</span>`],
      ["Servidor", esc(st.server || "—")],
      ["Cloudflare (cf-ray)", esc(st["cf-ray"] || "não detectado")],
      ["Cache da Cloudflare", esc(st["cf-cache-status"] || "—") + (st.age ? " · idade " + esc(st.age) + " s" : "")],
      ["Data-center / país", tr && tr.ok ? esc((tr.colo || "") + " / " + (tr.loc || "")) + " · HTTP " + esc(tr.http || "") + " · " + esc(tr.tls || "") : "indisponível (" + esc(tr ? (tr.status || tr.erro || "") : "") + ")"],
      ["Versão do site", S.novaVersao ? `<b class="mon-t-warn">Existe versão nova publicada — aperte Ctrl+F5 para carregar</b>` : "esta é a versão publicada"],
      ["Última verificação", ha(st.t)]
    ]);
    const a = S.arquivos;
    h += `<div class="mon-acoes">
      <button type="button" class="btn btn-ghost btn-sm" data-mon="site">Verificar agora</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mon="arq" ${S.testando ? "disabled" : ""}>${S.testando ? "Testando…" : "Testar todos os arquivos do site"}</button>
    </div>`;
    if(a && a.local) h += `<div class="empty">Teste indisponível em arquivo local.</div>`;
    else if(a){
      const ruins = a.itens.filter(x => !x.ok), ok = a.itens.length - ruins.length;
      h += `<div class="mon-diag-t"><b class="${ruins.length ? "mon-t-err" : "mon-t-ok"}">${ok} de ${a.total} arquivos OK${ruins.length ? " · " + ruins.length + " COM PROBLEMA" : ""}</b>${S.testando ? " (testando…)" : ""}</div>`;
      if(ruins.length) h += `<div class="mon-scroll"><table class="mon-tab"><tr><th>Arquivo</th><th>Resultado</th></tr>${ruins.map(x => `<tr class="mon-linha-ruim"><td>${esc(x.curto)}</td><td>${x.status ? "HTTP " + x.status : esc(x.erro || "falhou")}</td></tr>`).join("")}</table></div>`;
    }
    return h;
  }

  function ambiente(){
    const sg = S.storage, ne = navigator.connection || {};
    return kv([
      ["Aberto desde", dh(M.carregouEm) + " (" + ha(M.carregouEm) + ")"],
      ["Usuário", esc((window.AUTH_USUARIO && window.AUTH_USUARIO.email) || "—") + " · " + esc(window.AUTH_PAPEL || "leitor")],
      ["Modo de login", esc(window.AUTH_MODO || "—")],
      ["Navegador", esc(navigator.userAgent)],
      ["Tela / janela", screen.width + "×" + screen.height + " / " + innerWidth + "×" + innerHeight],
      ["Conexão", esc((ne.effectiveType || "—") + (ne.downlink ? " · " + ne.downlink + " Mb/s" : "") + (ne.rtt ? " · rtt " + ne.rtt + " ms" : ""))],
      ["Armazenamento", sg && sg.cota ? mb(sg.uso) + " de " + mb(sg.cota) + (sg.persistente === null ? "" : (sg.persistente ? " · persistente" : " · pode ser limpo pelo navegador")) : "—"],
      ["Arquivos .js carregados", String(document.querySelectorAll("script[src]").length)],
      ["Memória do log", M.eventos().length + " eventos"]
    ]);
  }

  /* ---------- log ---------- */
  const GRUPOS = {
    todos: () => true,
    erros: e => e.nivel === "erro",
    avisos: e => e.nivel === "aviso",
    supabase: e => e.src === "supabase",
    sync: e => e.src === "sync",
    site: e => e.src === "js" || e.src === "site" || e.src === "console",
    rede: e => e.src === "cdn" || e.src === "rede"
  };
  const ROT = { todos: "Todos", erros: "Erros", avisos: "Avisos", supabase: "Supabase", sync: "Sincronização", site: "Site (JS)", rede: "Rede / CDN" };
  const ROTSRC = { supabase: "Supabase", sync: "Sync", js: "JS", site: "Site", console: "Console", cdn: "CDN", rede: "Rede", monitor: "Monitor" };

  function filtrados(){
    const g = GRUPOS[S.filtro] || GRUPOS.todos, q = S.busca.trim().toLowerCase();
    return M.eventos().filter(e => g(e) && (!q || (e.msg + " " + e.det + " " + e.src).toLowerCase().indexOf(q) > -1)).slice().reverse();
  }
  function desenharLog(){
    const wrap = $("monLog"); if(!wrap) return;
    const lista = filtrados(), top = wrap.scrollTop;
    wrap.innerHTML = lista.slice(0, 300).map(e => {
      const d = M.dica(e), aberto = S.aberto.has(e.id);
      return `<div class="mon-row n-${e.nivel}" data-id="${e.id}">
        <div class="mon-l1"><span class="mon-h">${hms(e.t)}</span><span class="mon-src s-${esc(e.src)}">${esc(ROTSRC[e.src] || e.src)}</span><span class="mon-msg">${esc(e.msg)}</span>${e.n > 1 ? `<b class="mon-n">×${e.n}</b>` : ""}</div>
        ${d ? `<div class="mon-dica">${esc(d)}</div>` : ""}
        ${aberto && e.det ? `<pre class="mon-det">${esc(e.det)}</pre>` : ""}
      </div>`;
    }).join("") || `<div class="empty">Nenhum evento neste filtro.</div>`;
    wrap.scrollTop = top;
    const rod = $("monRodape");
    if(rod) rod.textContent = lista.length + " evento(s)" + (lista.length > 300 ? " (mostrando os 300 mais recentes)" : "") + (S.pausado ? " · ATUALIZAÇÃO PAUSADA" : " · ao vivo");
    const ch = $("monChips");
    if(ch) ch.innerHTML = Object.keys(ROT).map(k => { const n = M.eventos().filter(GRUPOS[k]).length; return `<button type="button" class="mon-chip ${S.filtro === k ? "on" : ""} c-${k}" data-f="${k}">${ROT[k]} <i>${n}</i></button>`; }).join("");
  }

  function relatorio(){
    const sy = estadoSync(), s = M.stats();
    const cab = [
      "RELATÓRIO DO MONITOR — " + dh(Date.now()),
      "Endereço: " + location.href.split("?")[0],
      "Navegador: " + navigator.userAgent,
      "Usuário: " + ((window.AUTH_USUARIO && window.AUTH_USUARIO.email) || "-") + " (" + (window.AUTH_PAPEL || "leitor") + ")",
      "Online: " + (M.net().online ? "sim" : "NÃO"),
      "Sync: " + (sy ? JSON.stringify(sy) : "inativa"),
      "Supabase: " + s.supabase.n + " chamadas, " + s.supabase.erros + " erros" + (S.ping ? " · ping " + (S.ping.ok ? S.ping.ms + " ms" : "FALHOU " + (S.ping.erro || S.ping.motivo || "")) : ""),
      "Site: " + (S.site ? (S.site.local ? "arquivo local" : (S.site.ok ? "HTTP " + S.site["status"] + " cf-ray " + (S.site["cf-ray"] || "-") : "ERRO " + (S.site.erro || S.site.status))) : "-") + (S.novaVersao ? " · VERSÃO NOVA PUBLICADA" : ""),
      "-----"
    ].join("\n");
    const corpo = M.eventos().map(e => "[" + dh(e.t) + "] " + e.nivel.toUpperCase() + " " + e.src + (e.n > 1 ? " x" + e.n : "") + " — " + e.msg + (e.det && e.det !== e.msg ? "\n    " + e.det.replace(/\n/g, "\n    ") : "")).join("\n");
    return cab + "\n" + corpo + "\n";
  }
  async function copiar(txt){
    try{ await navigator.clipboard.writeText(txt); return true; }
    catch(e){ try{ const t = document.createElement("textarea"); t.value = txt; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; }catch(x){ return false; } }
  }

  /* ---------- desenho geral ---------- */
  function desenhar(){
    if(!$("monCards")) return;
    const adm = ehAdmin();
    $("monRestrito").hidden = adm; $("monCorpo").hidden = !adm;
    if(!adm) return;
    $("monCards").innerHTML = cartoes();
    $("monSync").innerHTML = painelSync();
    $("monHost").innerHTML = painelHost();
    $("monAmb").innerHTML = ambiente();
    if(!S.pausado) desenharLog();
  }
  function agendar(){
    if(rafT || !ativoUI) return;
    rafT = requestAnimationFrame(() => { rafT = null; if(!ativa()) return; if(S.pausado){ const c = $("monCards"); if(c) c.innerHTML = cartoes(); return; } desenhar(); });
  }

  function badge(){
    const b = document.querySelector('#tabsNav [data-tab="monitor"]'); if(!b) return;
    const n = M.eventos().filter(x => x.nivel === "erro" && Date.now() - x.t < 3600000).reduce((s, x) => s + (x.n || 1), 0);
    let i = b.querySelector(".mon-badge");
    if(!n){ if(i) i.remove(); return; }
    if(!i){ i = document.createElement("b"); i.className = "mon-badge"; b.appendChild(i); }
    i.textContent = n > 99 ? "99+" : n;
  }
  window.monitorBadge = badge;

  async function rodada(completa){
    await Promise.all([verificarSupabase(), verificarStorage()]);
    if(completa || Date.now() - S.ultVerifSite > 60000) await verificarSite();
    if(ativa()) desenhar();
  }
  function tick(){
    if(!ativa() || !ehAdmin()){ clearInterval(tickT); tickT = null; ativoUI = false; return; }
    tickN++;
    if(tickN % 15 === 0) rodada(false);
    const c = $("monCards"); if(c) c.innerHTML = cartoes();      // só os cartões a cada segundo (tempos "há X s"); o log muda quando chega evento
  }
  let tickN = 0;

  window.monitorAdminRefresh = function(){
    ativoUI = true; desenhar();
    if(!ehAdmin()) return;
    rodada(true);
    if(!tickT){ tickN = 0; tickT = setInterval(tick, 1000); }
  };

  window.attachMonitorAdmin = function(){
    M.on(e => { badge(); if(ativa()) agendar(); });
    // linha de base da versão do site (para avisar quando sair uma versão nova)
    if(location.protocol !== "file:") setTimeout(() => { fetch(location.pathname).then(r => r.text()).then(t => { if(S.hashBase === null) S.hashBase = hash(t); }).catch(() => {}); }, 4000);
    const w = $("sec-monitor"); if(!w) return;
    w.addEventListener("click", ev => {
      const b = ev.target.closest("[data-mon]");
      if(b){
        const a = b.dataset.mon;
        if(a === "ping") rodada(false);
        else if(a === "diag") compararSync();
        else if(a === "site") rodada(true);
        else if(a === "arq") testarArquivos();
        else if(a === "pub" && window.SYNC && window.SYNC.publicar) window.SYNC.publicar();
        return;
      }
      const c = ev.target.closest("[data-f]"); if(c){ S.filtro = c.dataset.f; desenharLog(); return; }
      const r = ev.target.closest(".mon-row"); if(r){ const id = Number(r.dataset.id); if(S.aberto.has(id)) S.aberto.delete(id); else S.aberto.add(id); desenharLog(); return; }
      if(ev.target.id === "monPausa"){ S.pausado = !S.pausado; ev.target.textContent = S.pausado ? "Retomar" : "Pausar"; if(!S.pausado) desenhar(); else desenharLog(); return; }
      if(ev.target.id === "monCopiar"){ copiar(relatorio()).then(ok => { ev.target.textContent = ok ? "Copiado!" : "Não consegui copiar"; setTimeout(() => { ev.target.textContent = "Copiar relatório"; }, 1800); }); return; }
      if(ev.target.id === "monBaixar"){ const bl = new Blob([relatorio()], { type: "text/plain;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "monitor-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".txt"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return; }
      if(ev.target.id === "monTeste"){ M.log("monitor", "aviso", "Evento de teste (pode ignorar)", "Gerado pelo botão Evento de teste em " + dh(Date.now())); return; }
      if(ev.target.id === "monLimpar"){ if(confirm("Limpar o log de eventos desta sessão?")){ M.limpar(); S.aberto.clear(); desenhar(); } return; }
    });
    w.addEventListener("input", ev => { if(ev.target.id === "monBusca"){ S.busca = ev.target.value; desenharLog(); } });
    desenhar();
  };
})();
