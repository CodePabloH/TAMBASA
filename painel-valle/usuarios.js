/* ================= USUÁRIOS (admin) =================
   Tela só do administrador para ACOMPANHAR e CONTROLAR quem usa o painel:
     - quem está online agora (presença do Monitor), último acesso, nº de acessos, IP, dispositivo e tela;
     - nome de boas-vindas e saudação de cada pessoa (ex.: "Olá, Patrícia!") — só o admin altera;
     - incluir um e-mail já criado em Authentication > Users e remover acessos.
   Dados: tabela "perfis" (colunas nome/saudacao, ver supabase-usuarios.sql) + tabela "acessos".
   Também expõe window.AUTH_NOME / AUTH_SAUDACAO (lidos de perfis, só a própria linha) para a tela inicial. */
(function(){
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pad = n => String(n).padStart(2, "0");
  const dh = t => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const KEY = "painel_nome_cache";

  /* ---------- nome do próprio usuário (todos os papéis) ---------- */
  function aplicaNome(email, nome, saud){
    window.AUTH_NOME = nome || ""; window.AUTH_SAUDACAO = saud || "";
    try{ document.dispatchEvent(new CustomEvent("painel-nome", { detail: { email, nome: window.AUTH_NOME, saudacao: window.AUTH_SAUDACAO } })); }catch(e){}
  }
  window.carregarNomeUsuario = async function(cliente, email){
    if(!cliente || !email) return;
    const mail = String(email).toLowerCase();
    try{                                   // cache só para a saudação aparecer sem esperar a rede
      const c = JSON.parse(localStorage.getItem(KEY) || "null");
      if(c && c.email === mail) aplicaNome(mail, c.nome, c.saudacao);
    }catch(e){}
    try{
      const { data, error } = await cliente.from("perfis").select("nome,saudacao").eq("email", mail).maybeSingle();
      if(error) return;                    // colunas ainda não criadas (supabase-usuarios.sql): segue sem nome
      const nome = data && data.nome || "", saud = data && data.saudacao || "";
      try{ localStorage.setItem(KEY, JSON.stringify({ email: mail, nome, saudacao: saud })); }catch(e){}
      aplicaNome(mail, nome, saud);
    }catch(e){}
  };
  window.limparNomeUsuario = function(){ try{ localStorage.removeItem(KEY); }catch(e){} aplicaNome("", "", ""); };

  /* texto da saudação (usado na tela inicial) */
  window.saudacaoPessoal = function(periodo){
    const nome = window.AUTH_NOME || "", sd = window.AUTH_SAUDACAO || "";
    if(sd) return sd.replace(/\{nome\}/gi, nome).replace(/\s+,/g, ",").trim();
    return nome ? periodo + ", " + nome : periodo;
  };

  /* ---------- dispositivo legível ---------- */
  function dispositivo(ua){
    ua = String(ua || "");
    const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Outro";
    const nav = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    return `${nav} · ${so}`;
  }
  const periodoDoDia = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

  /* ---------- tela do admin ---------- */
  let PERFIS = [], ACESSOS = [], ST = { dias: 30, busca: "", msg: "", erro: "", carregando: false, semColunas: false };

  window.usuariosAdminHTML = function(){
    return `
    <div id="usRoot">
      <h2 class="section-title">Usuários</h2>
      <p class="section-desc">Acompanhe quem usa o painel e defina como cada pessoa é cumprimentada. O <strong>nome</strong> aparece na tela inicial (ex.: “Boa tarde, Patrícia.”); a <strong>saudação</strong> é opcional e substitui o “Bom dia/Boa tarde” (use <code>{nome}</code> para inserir o nome). Só o administrador altera.</p>
      <div id="usCards" class="us-cards"></div>
      <div class="panel">
        <div class="panel-header">Quem usa o painel</div>
        <div class="us-barra">
          <label>Acessos dos últimos <select class="small-select" id="usDias"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="180">180 dias</option></select></label>
          <input type="text" id="usBusca" placeholder="Buscar nome, e-mail ou papel...">
          <button type="button" class="btn" id="usAtualiza">Atualizar</button>
        </div>
        <div id="usMsg" class="us-msg"></div>
        <div class="us-scroll" id="usTabela"></div>
      </div>
      <div class="panel">
        <div class="panel-header">Incluir usuário</div>
        <div class="us-barra">
          <input type="email" id="usNovoEmail" placeholder="e-mail (já criado em Authentication > Users)">
          <input type="text" id="usNovoNome" placeholder="nome (ex.: Patrícia)" maxlength="60">
          <select class="small-select" id="usNovoPapel"><option value="leitor">Leitor</option><option value="sac">SAC</option><option value="admin">Admin</option></select>
          <button type="button" class="btn btn-primary" id="usIncluir">Incluir</button>
        </div>
        <div class="us-msg">A senha/conta é criada no Supabase (Authentication &gt; Users). Aqui você só libera o e-mail no painel e escolhe nome e papel. O perfil “só Tambasa” continua definido por e-mail em papeis.js (papel Leitor).</div>
      </div>
    </div>`;
  };

  function online(){ try{ return (window.MONITOR && window.MONITOR.presenca && window.MONITOR.presenca()) || []; }catch(e){ return []; } }

  function linhas(){
    const on = new Map(); online().forEach(u => on.set(String(u.email).toLowerCase(), u));
    const ac = new Map();
    ACESSOS.forEach(r => {                                   // já vem do mais novo para o mais antigo
      const k = String(r.email).toLowerCase(); let o = ac.get(k);
      if(!o){ o = { n: 0, ult: r.criado_em, ua: r.ua, rota: r.rota, ips: new Set() }; ac.set(k, o); }
      o.n++; if(r.ip) o.ips.add(r.ip);
    });
    return PERFIS.map(p => { const k = String(p.email).toLowerCase(); return Object.assign({}, p, { on: on.has(k), a: ac.get(k) || null }); })
      .sort((a, b) => (b.on - a.on) || ((b.a ? +new Date(b.a.ult) : 0) - (a.a ? +new Date(a.a.ult) : 0)) || String(a.email).localeCompare(String(b.email)));
  }
  function filtradas(){
    const q = ST.busca.trim().toLowerCase();
    return linhas().filter(r => !q || [r.nome, r.email, r.papel].join(" ").toLowerCase().includes(q));
  }

  function previa(nome, saud){
    const n = (nome || "").trim(), s = (saud || "").trim();
    return s ? s.replace(/\{nome\}/gi, n).replace(/\s+,/g, ",") : (n ? periodoDoDia() + ", " + n : periodoDoDia());
  }

  function desenha(){
    const raiz = document.getElementById("usRoot"); if(!raiz) return;
    const msg = document.getElementById("usMsg");
    msg.innerHTML = ST.carregando ? "Carregando..." : ST.erro ? `<span class="us-erro">${esc(ST.erro)}</span>` : ST.msg ? `<span class="us-ok">${esc(ST.msg)}</span>` : "";
    const todas = linhas(), lista = filtradas(), eu = String(window.AUTH_EMAIL || "").toLowerCase();
    const ativos = todas.filter(r => r.a).length, nOn = todas.filter(r => r.on).length, semNome = todas.filter(r => !r.nome).length;
    document.getElementById("usCards").innerHTML = [
      ["Online agora", nOn], ["Usuários cadastrados", todas.length], ["Acessaram no período", ativos], ["Sem nome definido", semNome]
    ].map(([t, n]) => `<div class="us-card"><b>${n}</b><span>${t}</span></div>`).join("");

    document.getElementById("usTabela").innerHTML = lista.length ? `<table class="us-tab"><thead><tr>
      <th>Status</th><th>E-mail</th><th>Papel</th><th>Nome</th><th>Saudação (opcional)</th><th>Como aparece</th><th>Último acesso</th><th>Acessos</th><th>IP · Dispositivo</th><th></th></tr></thead><tbody>${
      lista.map(r => {
        const sou = String(r.email).toLowerCase() === eu, a = r.a, e = esc(r.email);
        return `<tr data-email="${e}">
          <td class="nw">${r.on ? '<span class="us-dot on"></span>Online' : '<span class="us-dot"></span>Offline'}</td>
          <td>${e}${sou ? ' <em class="us-eu">(você)</em>' : ""}</td>
          <td><select class="small-select us-papel" ${sou ? "disabled title=\"Você não pode mudar o próprio papel\"" : ""}>${["leitor","sac","admin"].map(p => `<option value="${p}"${r.papel === p ? " selected" : ""}>${p === "sac" ? "SAC" : p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join("")}</select></td>
          <td><input type="text" class="us-nome" maxlength="60" value="${esc(r.nome || "")}" placeholder="ex.: Patrícia"></td>
          <td><input type="text" class="us-saud" maxlength="80" value="${esc(r.saudacao || "")}" placeholder="ex.: Olá, {nome}!"></td>
          <td class="us-previa">${esc(previa(r.nome, r.saudacao))}</td>
          <td class="nw">${a ? dh(a.ult) : "—"}${a && a.rota ? `<br><small>${esc(a.rota)}</small>` : ""}</td>
          <td class="c">${a ? a.n : 0}</td>
          <td>${a ? `${esc([...a.ips].slice(0, 3).join(" · ") || "IP não identificado")}<br><small>${esc(dispositivo(a.ua))}</small>` : "—"}</td>
          <td class="nw"><button type="button" class="btn btn-primary us-salvar">Salvar</button>${sou ? "" : ' <button type="button" class="btn us-remover" title="Tira o acesso ao painel">Remover</button>'}</td></tr>`;
      }).join("")}</tbody></table>` : `<div class="us-msg">${ST.erro ? "" : "Nenhum usuário encontrado."}</div>`;
  }

  async function carrega(){
    ST.carregando = true; ST.erro = ""; desenha();
    try{
      const cl = window.AUTH_CLIENTE;
      if(!cl){ ST.erro = "Conexão com o Supabase indisponível (modo demonstração)."; PERFIS = []; ACESSOS = []; return; }
      let r = await cl.from("perfis").select("email,papel,nome,saudacao").order("email");
      if(r.error && /nome|saudacao|column/i.test(r.error.message || "")){
        ST.semColunas = true;
        r = await cl.from("perfis").select("email,papel").order("email");
      } else ST.semColunas = false;
      if(r.error){ ST.erro = "Não foi possível ler os usuários: " + r.error.message + " (rode supabase-usuarios.sql no Supabase)."; PERFIS = []; }
      else PERFIS = r.data || [];
      if(ST.semColunas) ST.erro = "Falta rodar o arquivo supabase-usuarios.sql no Supabase (SQL Editor) para poder salvar nome e saudação.";
      const desde = new Date(Date.now() - ST.dias * 86400000).toISOString();
      const a = await cl.from("acessos").select("email,criado_em,ip,ua,rota").gte("criado_em", desde).order("id", { ascending: false }).limit(5000);
      ACESSOS = a.error ? [] : (a.data || []);
    }catch(e){ ST.erro = "Erro ao carregar: " + (e.message || e); }
    finally{ ST.carregando = false; desenha(); }
  }

  const aviso = (txt, erro) => { ST.msg = erro ? "" : txt; ST.erro = erro ? txt : ""; desenha(); };

  async function salvar(tr){
    const cl = window.AUTH_CLIENTE; if(!cl) return;
    const email = tr.dataset.email;
    const nome = tr.querySelector(".us-nome").value.trim() || null, saud = tr.querySelector(".us-saud").value.trim() || null;
    const papel = tr.querySelector(".us-papel").value;
    const upd = { nome, saudacao: saud }; if(!tr.querySelector(".us-papel").disabled) upd.papel = papel;
    const { error } = await cl.from("perfis").update(upd).eq("email", email);
    if(error) return aviso("Não foi possível salvar: " + error.message, true);
    const p = PERFIS.find(x => x.email === email); if(p) Object.assign(p, upd);
    if(email.toLowerCase() === String(window.AUTH_EMAIL || "").toLowerCase()) aplicaNome(email, nome, saud);
    aviso("Salvo: " + email + " → “" + previa(nome, saud) + "”.");
  }
  async function remover(tr){
    const email = tr.dataset.email;
    if(!confirm("Tirar o acesso de " + email + " ao painel?\n(A conta no Supabase continua; ela só deixa de ler os dados.)")) return;
    const { error } = await window.AUTH_CLIENTE.from("perfis").delete().eq("email", email);
    if(error) return aviso("Não foi possível remover: " + error.message, true);
    PERFIS = PERFIS.filter(x => x.email !== email); aviso("Acesso removido: " + email + ".");
  }
  async function incluir(){
    const cl = window.AUTH_CLIENTE; if(!cl) return;
    const email = document.getElementById("usNovoEmail").value.trim().toLowerCase();
    const nome = document.getElementById("usNovoNome").value.trim() || null, papel = document.getElementById("usNovoPapel").value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return aviso("Digite um e-mail válido.", true);
    const linha = { email, papel }; if(nome) linha.nome = nome;
    const { error } = await cl.from("perfis").upsert(linha, { onConflict: "email" });
    if(error) return aviso("Não foi possível incluir: " + error.message, true);
    document.getElementById("usNovoEmail").value = ""; document.getElementById("usNovoNome").value = "";
    await carrega(); aviso("Usuário liberado: " + email + ".");
  }

  window.usuariosAdminRefresh = function(){ if(window.AUTH_PAPEL !== "admin") return; carrega(); };

  document.addEventListener("change", ev => { if(ev.target && ev.target.id === "usDias"){ ST.dias = Number(ev.target.value) || 30; carrega(); } });
  document.addEventListener("input", ev => {
    const t = ev.target; if(!t) return;
    if(t.id === "usBusca"){ ST.busca = t.value; const pos = t.selectionStart; desenha(); const n = document.getElementById("usBusca"); if(n){ n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} } return; }
    if(t.classList && (t.classList.contains("us-nome") || t.classList.contains("us-saud"))){          // prévia ao vivo
      const tr = t.closest("tr"); tr.querySelector(".us-previa").textContent = previa(tr.querySelector(".us-nome").value, tr.querySelector(".us-saud").value);
    }
  });
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("button"); if(!b || window.AUTH_PAPEL !== "admin") return;
    if(b.id === "usAtualiza") carrega();
    else if(b.id === "usIncluir") incluir();
    else if(b.classList.contains("us-salvar")) salvar(b.closest("tr"));
    else if(b.classList.contains("us-remover")) remover(b.closest("tr"));
  });
  setInterval(() => { if(document.getElementById("usRoot") && document.getElementById("sec-usuarios") && document.getElementById("sec-usuarios").classList.contains("active") && !(document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName))) desenha(); }, 15000);   // atualiza o "online" sem apagar o que está sendo digitado

  const st = document.createElement("style");
  st.textContent = `
  .us-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 14px}
  .us-card{background:#fff;border:1px solid #e3e7e3;border-left:4px solid #2e7d32;border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
  .us-card b{font-size:26px;line-height:1.1;color:#1a211a}.us-card span{font-size:12px;color:#5a665a}
  .us-barra{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 18px}
  .us-barra input[type=text],.us-barra input[type=email]{flex:1;min-width:200px;padding:7px 10px;border:1px solid #cfd6cf;border-radius:6px}
  .us-scroll{overflow:auto;max-height:640px;padding:0 18px 14px}
  .us-tab{width:100%;border-collapse:collapse;font-size:13px}
  .us-tab th{position:sticky;top:0;background:#1a211a;color:#fff;text-align:left;padding:8px 10px;font-weight:600;white-space:nowrap}
  .us-tab td{padding:7px 10px;border-bottom:1px solid #edf0ed;vertical-align:middle}.us-tab td.nw{white-space:nowrap}.us-tab td.c{text-align:center}
  .us-tab input.us-nome,.us-tab input.us-saud{width:100%;min-width:130px;padding:6px 8px;border:1px solid #cfd6cf;border-radius:6px}
  .us-tab small{color:#6b786b}.us-previa{font-weight:600;color:#1b5e20;min-width:150px}.us-eu{color:#6b786b;font-style:normal}
  .us-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#b7bfb7;margin-right:6px}.us-dot.on{background:#2fbf4a;box-shadow:0 0 0 3px rgba(47,191,74,.25)}
  .us-msg{padding:6px 18px;color:#5a665a;font-size:13px}.us-erro{color:#b91c1c;font-weight:600}.us-ok{color:#1b5e20;font-weight:600}
  @media (prefers-color-scheme: dark){.us-card{background:#161b16;border-color:#2a332a}.us-card b{color:#f1f5f1}.us-card span,.us-msg{color:#9aa79a}.us-tab td{border-color:#242c24}.us-previa{color:#7fd88a}.us-barra input,.us-tab input{background:#0f130f;color:#e8ede8;border-color:#2a332a}}
  `;
  document.head.appendChild(st);
})();
