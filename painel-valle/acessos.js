/* ================= ACESSOS (IP + dispositivo) =================
   1) registrarAcesso(cliente, evento): chama a função registrar_acesso() do Supabase (ver supabase-acessos.sql).
      O IP é lido pelo SERVIDOR (o navegador não envia nem consegue falsificar). Nunca trava o painel:
      se a função ainda não existir no Supabase, o erro é ignorado em silêncio.
   2) Tela "Acessos (admin)": quem entrou, de qual IP, em qual dispositivo, quando. Só o admin enxerga. */
(function(){
  "use strict";
  const esc = s => (typeof escHtml === "function") ? escHtml(s == null ? "" : s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pad = n => String(n).padStart(2, "0");
  const dh = t => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  /* ---------- gravação (todos os usuários logados) ---------- */
  function sessaoId(){
    try{ let s = sessionStorage.getItem("painel_sessao_id"); if(!s){ s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem("painel_sessao_id", s); } return s; }catch(e){ return "sem-sessao"; }
  }
  window.registrarAcesso = function(cliente, evento, email){
    try{
      if(!cliente || !cliente.rpc || !email) return;
      const chave = "painel_acesso_reg_" + String(email).toLowerCase();
      if(evento !== "login" && sessionStorage.getItem(chave)) return;      // reabertura: só 1 registro por aba
      sessionStorage.setItem(chave, "1");
      const rota = (window.location.hash || "").slice(1) || "inicio";
      Promise.resolve(cliente.rpc("registrar_acesso", { p_evento: evento, p_sessao: sessaoId(), p_ua: navigator.userAgent || "", p_rota: rota })).catch(() => {});
    }catch(e){}
  };
  window.limparMarcaAcesso = function(email){ try{ sessionStorage.removeItem("painel_acesso_reg_" + String(email || "").toLowerCase()); }catch(e){} };

  /* ---------- dispositivo legível ---------- */
  function dispositivo(ua){
    ua = String(ua || "");
    const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Outro";
    const nav = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    return `${nav} · ${so}`;
  }

  /* ---------- tela do admin ---------- */
  let DADOS = [], ST = { dias: 7, busca: "", erro: "", carregando: false };

  window.acessosAdminHTML = function(){
    return `
    <div id="acRoot">
      <h2 class="section-title">Acessos ao painel</h2>
      <p class="section-desc">Cada entrada no painel registra e-mail, <strong>IP</strong> e dispositivo. O IP é lido pelo servidor (não dá para falsificar pelo navegador). Os registros são mantidos por 180 dias. Só o administrador vê esta tela.</p>
      <div id="acCards" class="ac-cards"></div>
      <div class="panel">
        <div class="panel-header">Últimos acessos</div>
        <div class="ac-barra">
          <label>Período <select class="small-select" id="acDias"><option value="1">24 horas</option><option value="7" selected>7 dias</option><option value="30">30 dias</option><option value="180">180 dias</option></select></label>
          <input type="text" id="acBusca" placeholder="Buscar e-mail, IP ou dispositivo...">
          <button type="button" class="btn" id="acAtualiza">Atualizar</button>
          <button type="button" class="btn btn-primary" id="acExcel">Exportar Excel</button>
        </div>
        <div id="acMsg" class="ac-msg"></div>
        <div class="ac-scroll" id="acTabela"></div>
      </div>
      <div class="panel">
        <div class="panel-header">IPs por usuário (mais de um IP no período merece atenção)</div>
        <div class="ac-scroll" id="acPorUsuario"></div>
      </div>
    </div>`;
  };

  function filtrados(){
    const q = ST.busca.trim().toLowerCase();
    return !q ? DADOS : DADOS.filter(r => [r.email, r.ip, dispositivo(r.ua), r.papel].join(" ").toLowerCase().includes(q));
  }

  function desenha(){
    const raiz = document.getElementById("acRoot"); if(!raiz) return;
    const msg = document.getElementById("acMsg");
    if(ST.carregando){ msg.textContent = "Carregando..."; }
    else if(ST.erro){ msg.innerHTML = `<span class="ac-erro">${esc(ST.erro)}</span>`; }
    else msg.textContent = "";
    const lista = filtrados();
    const hoje0 = new Date(); hoje0.setHours(0,0,0,0);
    const deHoje = DADOS.filter(r => new Date(r.criado_em) >= hoje0);
    const ips = new Set(DADOS.map(r => r.ip).filter(Boolean)), us = new Set(DADOS.map(r => r.email));
    document.getElementById("acCards").innerHTML = [
      ["Acessos hoje", deHoje.length], ["Usuários no período", us.size], ["IPs diferentes no período", ips.size], ["Registros no período", DADOS.length]
    ].map(([t, n]) => `<div class="ac-card"><b>${n}</b><span>${t}</span></div>`).join("");

    document.getElementById("acTabela").innerHTML = lista.length
      ? `<table class="ac-tab"><thead><tr><th>Data/hora</th><th>E-mail</th><th>Papel</th><th>IP</th><th>Dispositivo</th><th>Tipo</th></tr></thead><tbody>${
          lista.slice(0, 500).map(r => `<tr><td class="nw">${dh(r.criado_em)}</td><td>${esc(r.email)}</td><td>${esc(r.papel || "—")}</td><td class="nw"><strong>${esc(r.ip || "não identificado")}</strong></td><td title="${esc(r.ua)}">${esc(dispositivo(r.ua))}</td><td>${r.evento === "login" ? "Login" : "Reabriu"}</td></tr>`).join("")
        }</tbody></table>${lista.length > 500 ? `<div class="ac-msg">Mostrando 500 de ${lista.length}. Use a busca ou exporte para o Excel.</div>` : ""}`
      : `<div class="ac-msg">${ST.erro ? "" : "Nenhum acesso encontrado."}</div>`;

    const mp = new Map();
    DADOS.forEach(r => { const o = mp.get(r.email) || { email: r.email, ips: new Map(), n: 0, ult: 0 }; o.n++; o.ult = Math.max(o.ult, +new Date(r.criado_em)); if(r.ip) o.ips.set(r.ip, (o.ips.get(r.ip) || 0) + 1); mp.set(r.email, o); });
    const us2 = [...mp.values()].sort((a, b) => b.ips.size - a.ips.size || b.n - a.n);
    document.getElementById("acPorUsuario").innerHTML = us2.length
      ? `<table class="ac-tab"><thead><tr><th>E-mail</th><th>Acessos</th><th>Último</th><th>IPs usados (quantidade de acessos)</th></tr></thead><tbody>${
          us2.map(o => `<tr class="${o.ips.size > 2 ? "ac-alerta" : ""}"><td>${esc(o.email)}</td><td class="c">${o.n}</td><td class="nw">${dh(o.ult)}</td><td>${[...o.ips].map(([ip, n]) => `${esc(ip)} (${n})`).join(" · ") || "—"}</td></tr>`).join("")
        }</tbody></table>`
      : `<div class="ac-msg">Sem dados.</div>`;
  }

  async function carrega(){
    ST.carregando = true; ST.erro = ""; desenha();
    try{
      const cl = window.AUTH_CLIENTE;
      if(!cl){ ST.erro = "Conexão com o Supabase indisponível (modo demonstração)."; DADOS = []; return; }
      const desde = new Date(Date.now() - ST.dias * 86400000).toISOString();
      const { data, error } = await cl.from("acessos").select("*").gte("criado_em", desde).order("id", { ascending: false }).limit(5000);
      if(error){
        ST.erro = /relation|does not exist|schema cache/i.test(error.message || "")
          ? "A tabela de acessos ainda não existe: rode o arquivo supabase-acessos.sql no Supabase (SQL Editor) uma vez."
          : "Não foi possível ler os acessos: " + error.message;
        DADOS = [];
      } else DADOS = data || [];
    }catch(e){ ST.erro = "Erro ao carregar: " + (e.message || e); DADOS = []; }
    finally{ ST.carregando = false; desenha(); }
  }

  async function exportaExcel(){
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregou (verifique a internet)."); return; }
    const lista = filtrados(); if(!lista.length){ alert("Não há acessos para exportar."); return; }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Acessos");
    ws.addRow(["Data/hora", "E-mail", "Papel", "IP", "Dispositivo", "Tipo", "Tela"]);
    const h = ws.getRow(1); h.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A211A" } };
    lista.forEach(r => ws.addRow([dh(r.criado_em), r.email, r.papel || "", r.ip || "", dispositivo(r.ua), r.evento === "login" ? "Login" : "Reabriu", r.rota || ""]));
    ws.columns.forEach((c, i) => { c.width = [18, 34, 10, 18, 22, 10, 22][i]; c.font = { name: "Arial", size: 10 }; });
    ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: "A1", to: { row: 1, column: 7 } };
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const d = new Date(), a = document.createElement("a"); a.href = url; a.download = `Acessos_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.acessosAdminRefresh = function(){
    if(window.AUTH_PAPEL !== "admin") return;
    carrega();
  };

  document.addEventListener("change", ev => { if(ev.target && ev.target.id === "acDias"){ ST.dias = Number(ev.target.value) || 7; carrega(); } });
  document.addEventListener("input", ev => { if(ev.target && ev.target.id === "acBusca"){ ST.busca = ev.target.value; desenha(); } });
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("button"); if(!b) return;
    if(b.id === "acAtualiza") carrega();
    else if(b.id === "acExcel") exportaExcel();
  });

  const st = document.createElement("style");
  st.textContent = `
  .ac-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 14px}
  .ac-card{background:#fff;border:1px solid #e3e7e3;border-left:4px solid #2e7d32;border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
  .ac-card b{font-size:26px;line-height:1.1;color:#1a211a}.ac-card span{font-size:12px;color:#5a665a}
  .ac-barra{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 18px}
  .ac-barra input{flex:1;min-width:220px;padding:7px 10px;border:1px solid #cfd6cf;border-radius:6px}
  .ac-scroll{overflow:auto;max-height:560px;padding:0 18px 14px}
  .ac-tab{width:100%;border-collapse:collapse;font-size:13px}
  .ac-tab th{position:sticky;top:0;background:#1a211a;color:#fff;text-align:left;padding:8px 10px;font-weight:600}
  .ac-tab td{padding:7px 10px;border-bottom:1px solid #edf0ed}.ac-tab td.nw{white-space:nowrap}.ac-tab td.c{text-align:center}
  .ac-alerta td{background:#fff4e0}
  .ac-msg{padding:6px 18px;color:#5a665a;font-size:13px}.ac-erro{color:#b91c1c;font-weight:600}
  @media (prefers-color-scheme: dark){.ac-card{background:#161b16;border-color:#2a332a}.ac-card b{color:#f1f5f1}.ac-card span,.ac-msg{color:#9aa79a}.ac-tab td{border-color:#242c24}.ac-alerta td{background:#3a2e12}.ac-barra input{background:#0f130f;color:#e8ede8;border-color:#2a332a}}
  `;
  document.head.appendChild(st);
})();
