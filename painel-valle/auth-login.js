/* =====================================================================
   LOGIN (e-mail + senha) - tela que aparece ANTES de tudo
   ---------------------------------------------------------------------
   COMO CONECTAR NO SUPABASE (depois):
     1) Preencha AUTH_CONFIG logo abaixo com a URL do projeto e a chave "anon"
        (Supabase > Project Settings > API). Só isso: o login passa a usar o
        Supabase (signInWithPassword) e o modo demonstração desliga sozinho.
     2) Crie os usuários em Supabase > Authentication > Users.
   ENQUANTO NÃO CONECTAR: modo DEMONSTRAÇÃO. Aceita qualquer e-mail válido e
   senha com 6+ caracteres. NÃO é segurança de verdade (só a tela).
   ===================================================================== */
(function(){
  "use strict";

  const AUTH_CONFIG = {
    supabaseUrl: "https://jmhztnfnzylajrtlwnox.supabase.co",
    supabaseAnonKey: "sb_publishable_agBu2FdLUafa8bJ7WKeeNw_l10EhDBs",   // chave pública (publishable)
    supabaseLib: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"
  };
  const MODO = (AUTH_CONFIG.supabaseUrl && AUTH_CONFIG.supabaseAnonKey) ? "supabase" : "demo";
  const KEY_DEMO = "painel_auth_demo";

  let cliente = null;       // cliente do Supabase (modo supabase)
  let usuario = null;       // { email }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  /* ---------- papel do usuario (admin / leitor) ---------- */
  async function carregarPapel(email){
    let papel = "leitor";
    if(MODO !== "supabase") papel = "admin";             // demonstração: sem segurança, não esconde nada
    else{
      try{
        const { data } = await cliente.from("perfis").select("papel").eq("email", String(email).toLowerCase()).maybeSingle();
        if(data && data.papel === "admin") papel = "admin";
      }catch(e){ papel = "leitor"; }
    }
    if(window.definirPapel) window.definirPapel(papel);
  }

  /* ---------- camada de autenticação (troca só aqui) ---------- */
  function carregarLib(){
    return new Promise((res, rej) => {
      if(window.supabase && window.supabase.createClient) return res();
      const s = document.createElement("script");
      s.src = AUTH_CONFIG.supabaseLib; s.onload = res; s.onerror = () => rej(new Error("Não foi possível carregar o Supabase (sem internet?)."));
      document.head.appendChild(s);
    });
  }
  async function iniciar(){
    if(MODO === "supabase"){
      await carregarLib();
      cliente = window.supabase.createClient(AUTH_CONFIG.supabaseUrl, AUTH_CONFIG.supabaseAnonKey);
      const { data } = await cliente.auth.getSession();
      usuario = data && data.session ? { email: data.session.user.email } : null;
      if(usuario) await carregarPapel(usuario.email);
      cliente.auth.onAuthStateChange((_ev, sessao) => {
        usuario = sessao ? { email: sessao.user.email } : null;
        window.AUTH_USUARIO = usuario;
        if(!usuario){ if(window.definirPapel) window.definirPapel("leitor"); mostrar(); }
      });
    }else{
      try{ const o = JSON.parse(LS.getItem(KEY_DEMO) || "null"); usuario = o && o.email ? { email: o.email } : null; }catch(e){ usuario = null; }
    }
    window.AUTH_USUARIO = usuario;
  }
  async function entrarAuth(email, senha){
    if(MODO === "supabase"){
      const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if(error){
        const m = (error.message || "").toLowerCase();
        if(m.includes("invalid login")) throw new Error("E-mail ou senha incorretos.");
        if(m.includes("email not confirmed")) throw new Error("Confirme seu e-mail antes de entrar (veja a caixa de entrada).");
        if(m.includes("rate") || m.includes("too many")) throw new Error("Muitas tentativas. Aguarde um pouco e tente de novo.");
        throw new Error("Não foi possível entrar: " + error.message);
      }
      usuario = { email: data.user.email };
      await carregarPapel(usuario.email);
    }else{
      if(window.definirPapel) window.definirPapel("admin");
      if(senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      LS.setItem(KEY_DEMO, JSON.stringify({ email, em: new Date().toISOString() }));
      usuario = { email };
    }
    window.AUTH_USUARIO = usuario;
  }
  async function sairAuth(){
    if(MODO === "supabase" && cliente){ try{ await cliente.auth.signOut(); }catch(e){} }
    LS.removeItem(KEY_DEMO);
    usuario = null; window.AUTH_USUARIO = null;
    if(window.definirPapel) window.definirPapel("leitor");
  }
  async function recuperarSenha(email){
    if(MODO !== "supabase") throw new Error("A recuperação de senha funciona depois que o Supabase for conectado.");
    const { error } = await cliente.auth.resetPasswordForEmail(email);
    if(error) throw new Error("Não foi possível enviar o e-mail: " + error.message);
  }

  /* ---------- visual ---------- */
  const css = `
  #loginTela{position:fixed;inset:0;z-index:6000;display:none;align-items:center;justify-content:center;padding:20px;overflow:auto;background:#080c08;color:#fff;font-family:inherit}
  #loginTela.on{display:flex}
  #loginTela .lg-bg{position:fixed;inset:0;overflow:hidden;pointer-events:none}
  #loginTela .lg-bg i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;animation:lgFloat 18s ease-in-out infinite}
  #loginTela .lg-bg i:nth-child(1){width:520px;height:520px;left:-120px;top:-120px;background:#2f7d1c}
  #loginTela .lg-bg i:nth-child(2){width:460px;height:460px;right:-100px;bottom:-120px;background:#1d4f86;animation-delay:-7s}
  #loginTela .lg-bg::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 50% 40%,#000 15%,transparent 70%);mask-image:radial-gradient(ellipse at 50% 40%,#000 15%,transparent 70%)}
  @keyframes lgFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(44px,34px) scale(1.12)}}
  @keyframes lgUp{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes lgShake{0%,100%{transform:none}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  @keyframes lgSpin{to{transform:rotate(360deg)}}
  #loginTela .lg-card{position:relative;width:100%;max-width:410px;padding:34px 32px 28px;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.03));-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 30px 70px rgba(0,0,0,.55);animation:lgUp .6s both}
  #loginTela .lg-card.erro{animation:lgShake .4s}
  #loginTela .lg-card::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;border-radius:20px 20px 0 0;background:linear-gradient(90deg,#6fcf4a,#4aa3ff)}
  #loginTela .lg-logo{display:block;height:48px;max-width:80%;margin:0 auto 18px;object-fit:contain;background:#fff;padding:6px 12px;border-radius:12px}
  #loginTela h1{margin:0;text-align:center;font-size:23px;font-weight:800;letter-spacing:-.3px}
  #loginTela .lg-sub{margin:6px 0 22px;text-align:center;font-size:13.5px;color:#a9b8a4}
  #loginTela label{display:block;font-size:12.5px;font-weight:600;color:#c9d6c5;margin:14px 0 6px}
  #loginTela .lg-campo{position:relative}
  #loginTela input{box-sizing:border-box;width:100%;padding:12px 14px;border-radius:11px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.32);color:#fff;font-size:15px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s}
  #loginTela input::placeholder{color:#6f7f6b}
  #loginTela input:focus{border-color:#6fcf4a;box-shadow:0 0 0 3px rgba(111,207,74,.22)}
  #loginTela .lg-campo input[type=password],#loginTela .lg-campo input.vis{padding-right:74px}
  #loginTela .lg-ver{position:absolute;right:8px;top:50%;transform:translateY(-50%);all:unset;cursor:pointer;font-size:12px;color:#9fb09a;padding:6px 8px;border-radius:7px;position:absolute;right:6px;top:50%;margin-top:-14px}
  #loginTela .lg-ver:hover{color:#fff;background:rgba(255,255,255,.08)}
  #loginTela .lg-btn{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:22px;padding:13px;border-radius:12px;font-weight:700;font-size:15px;color:#0b120b;background:linear-gradient(90deg,#8be36a,#6fcf4a);box-shadow:0 8px 22px rgba(111,207,74,.28);transition:transform .15s,box-shadow .15s,opacity .15s}
  #loginTela .lg-btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(111,207,74,.4)}
  #loginTela .lg-btn[disabled]{opacity:.7;cursor:wait;transform:none}
  #loginTela .lg-spin{width:16px;height:16px;border:2px solid rgba(11,18,11,.3);border-top-color:#0b120b;border-radius:50%;animation:lgSpin .7s linear infinite;display:none}
  #loginTela .lg-btn[disabled] .lg-spin{display:inline-block}
  #loginTela .lg-msg{min-height:20px;margin-top:14px;font-size:13px;text-align:center;color:#ff8a80}
  #loginTela .lg-msg.ok{color:#8be36a}
  #loginTela .lg-links{display:flex;justify-content:center;margin-top:6px}
  #loginTela .lg-link{all:unset;cursor:pointer;font-size:12.5px;color:#9fb09a;text-decoration:underline}
  #loginTela .lg-link:hover{color:#fff}
  #loginTela .lg-demo{margin-top:18px;padding:9px 12px;border-radius:10px;font-size:12px;line-height:1.4;color:#ffd58a;background:rgba(255,179,71,.1);border:1px solid rgba(255,179,71,.3);text-align:center}
  @media(prefers-reduced-motion:reduce){#loginTela *,#loginTela *::before,#loginTela *::after{animation:none!important;transition:none!important}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const tela = document.createElement("div");
  tela.id = "loginTela";
  tela.setAttribute("role", "dialog");
  tela.setAttribute("aria-label", "Entrar no painel");
  tela.innerHTML = `
    <div class="lg-bg"><i></i><i></i></div>
    <div class="lg-card" id="lgCard">
      <img class="lg-logo" src="logo-dovalle.png" alt="Do Valle">
      <h1>Entrar no painel</h1>
      <p class="lg-sub">Use seu e-mail e senha para acessar.</p>
      <div id="lgForm">
        <label for="lgEmail">E-mail</label>
        <div class="lg-campo"><input id="lgEmail" type="email" inputmode="email" autocomplete="username" placeholder="voce@empresa.com.br" spellcheck="false" autocapitalize="off"></div>
        <label for="lgSenha">Senha</label>
        <div class="lg-campo"><input id="lgSenha" type="password" autocomplete="current-password" placeholder="Sua senha"><button type="button" class="lg-ver" id="lgVer" aria-label="Mostrar ou ocultar a senha">Mostrar</button></div>
        <button type="button" class="lg-btn" id="lgEntrar"><span class="lg-spin"></span><span id="lgBtnTxt">Entrar</span></button>
        <div class="lg-msg" id="lgMsg" role="alert" aria-live="polite"></div>
        <div class="lg-links"><button type="button" class="lg-link" id="lgEsqueci">Esqueci minha senha</button></div>
      </div>
      ${MODO === "demo" ? '<div class="lg-demo"><b>Modo demonstração.</b> O Supabase ainda não está conectado: qualquer e-mail válido com senha de 6+ caracteres entra. Isto não protege os dados.</div>' : ""}
    </div>`;
  document.body.appendChild(tela);

  const $ = id => tela.querySelector("#" + id);
  const msg = (t, ok) => { const m = $("lgMsg"); m.textContent = t || ""; m.className = "lg-msg" + (ok ? " ok" : ""); };
  const ocupado = on => { $("lgEntrar").disabled = on; $("lgBtnTxt").textContent = on ? "Entrando…" : "Entrar"; };
  const tremer = () => { const c = $("lgCard"); c.classList.remove("erro"); void c.offsetWidth; c.classList.add("erro"); };

  function mostrar(){
    tela.classList.add("on");
    document.body.style.overflow = "hidden";
    msg(""); ocupado(false);
    setTimeout(() => { const e = $("lgEmail"); if(e && !e.value) e.focus(); else $("lgSenha").focus(); }, 60);
  }
  function esconder(){
    tela.classList.remove("on");
    // não destrava a rolagem se a tela inicial (escolha de área) estiver aberta por baixo
    const hub = document.getElementById("areaHub");
    if(!(hub && hub.classList.contains("on"))) document.body.style.overflow = "";
    $("lgSenha").value = "";
  }

  async function enviar(){
    const email = $("lgEmail").value.trim().toLowerCase(), senha = $("lgSenha").value;
    if(!emailOk(email)){ msg("Digite um e-mail válido."); tremer(); $("lgEmail").focus(); return; }
    if(!senha){ msg("Digite sua senha."); tremer(); $("lgSenha").focus(); return; }
    ocupado(true); msg("");
    try{
      await entrarAuth(email, senha);
      esconder();
      if(window.mostrarHubAreas) window.mostrarHubAreas();   // depois do login, escolhe a área
    }catch(err){
      msg(err.message || "Não foi possível entrar."); tremer(); ocupado(false);
      $("lgSenha").select();
    }
  }

  $("lgEntrar").addEventListener("click", enviar);
  tela.addEventListener("keydown", e => { if(e.key === "Enter" && tela.classList.contains("on")){ e.preventDefault(); enviar(); } });
  $("lgVer").addEventListener("click", () => {
    const i = $("lgSenha"), ver = i.type === "password";
    i.type = ver ? "text" : "password";
    i.classList.toggle("vis", ver);
    $("lgVer").textContent = ver ? "Ocultar" : "Mostrar";
    i.focus();
  });
  $("lgEsqueci").addEventListener("click", async () => {
    const email = $("lgEmail").value.trim().toLowerCase();
    if(!emailOk(email)){ msg("Digite seu e-mail acima para receber o link."); $("lgEmail").focus(); return; }
    try{ await recuperarSenha(email); msg("Enviamos um link para redefinir a senha no seu e-mail.", true); }
    catch(err){ msg(err.message); }
  });

  window.authSair = async function(){
    await sairAuth();
    $("lgEmail").value = ""; $("lgSenha").value = "";
    mostrar();
  };
  window.AUTH_MODO = MODO;

  // botão "Sair" no rodapé do menu lateral
  const rodape = document.querySelector(".sidebar-footer");
  if(rodape){
    const b = document.createElement("button");
    b.type = "button"; b.id = "authSairBtn"; b.textContent = "Sair";
    b.style.cssText = "display:block;width:100%;margin-top:8px;padding:7px 10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;border-radius:8px;font-size:12px;cursor:pointer;text-align:center";
    b.addEventListener("click", () => window.authSair());
    rodape.appendChild(b);
  }

  // mostra o login já na abertura (antes de saber se há sessão) para o painel não aparecer por um instante
  mostrar();
  iniciar().then(() => {
    if(usuario){ esconder(); if(window.mostrarHubAreas) window.mostrarHubAreas(); }   // já estava logado: segue direto para a escolha de área (redesenha com o e-mail e o botão Sair)
  }).catch(err => {
    msg((err && err.message) || "Falha ao iniciar o login.");
  });
})();
