/* =====================================================================
   TELA INICIAL - ESCOLHA DE ÁREA (v2 · visual "uau")
   Toda vez que o site abre, mostra onde a pessoa quer entrar. Ao escolher,
   o menu mostra SÓ as abas daquela área; o botão "Trocar de área" (topo do
   menu) volta para esta tela. Atalhos de teclado: 1, 2, 3, 4.
   Para mover uma aba de área, troque o campo "group" dela em TABS (app.js).
   ===================================================================== */
(function(){
  "use strict";

  const ICONES = {
    vo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.8"/><path d="M8 20h8M12 16v4"/><path d="M7 12l3-3 2.5 2.5L17 7"/></svg>',
    operacao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/></svg>',
    valle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5.5" r="2.3"/><circle cx="5" cy="18" r="2.3"/><circle cx="19" cy="18" r="2.3"/><path d="M12 8v4M12 12l-6 4M12 12l6 4"/></svg>',
    tambasa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5 12 3l8.5 4.5L12 12z"/><path d="M3.5 7.5V16L12 21l8.5-5V7.5"/><path d="M12 12v9"/></svg>'
  };

  const AREAS = [
    { id: "operacao", titulo: "Visão operacional", sub: "O dia a dia da operação: indicadores, SAC, fechamento e análise gerencial.", primeira: "dashboard", cor: "#4aa3ff", tecla: "1" },
    { id: "valle",    titulo: "Rede Do Valle",     sub: "Telas gerais da rede toda (VAL + RVA): performance, ocorrências e indenização.", primeira: "performance-geral", cor: "#6fcf4a", tecla: "2" },
    { id: "tambasa",  titulo: "Somente Tambasa",   sub: "Tudo o que é exclusivo da operação Tambasa: trocas, entregas, pacotes e faturamento.", primeira: "performance", cor: "#ffb347", tecla: "3" }
  ];

  const css = `
  #areaHub{position:fixed;inset:0;z-index:5000;display:none;overflow:auto;color:#fff;font-family:inherit;background:#080c08}
  #areaHub.on{display:block}
  #areaHub .ah-bg{position:fixed;inset:0;overflow:hidden;pointer-events:none}
  #areaHub .ah-bg i{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;animation:ahFloat 18s ease-in-out infinite}
  #areaHub .ah-bg i:nth-child(1){width:560px;height:560px;left:-120px;top:-140px;background:#2f7d1c}
  #areaHub .ah-bg i:nth-child(2){width:480px;height:480px;right:-100px;top:10%;background:#1d4f86;animation-delay:-6s}
  #areaHub .ah-bg i:nth-child(3){width:440px;height:440px;left:35%;bottom:-200px;background:#8a5a10;animation-delay:-11s;opacity:.35}
  #areaHub .ah-bg::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 20%,transparent 75%);mask-image:radial-gradient(ellipse at 50% 30%,#000 20%,transparent 75%)}
  @keyframes ahFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(50px,40px) scale(1.12)}}
  @keyframes ahUp{from{opacity:0;transform:translateY(26px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes ahPulse{0%{box-shadow:0 0 0 0 rgba(111,207,74,.7)}100%{box-shadow:0 0 0 12px rgba(111,207,74,0)}}
  @keyframes ahBar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
  @keyframes ahShine{from{transform:translateX(-120%)}to{transform:translateX(120%)}}

  #areaHub .ah-wrap{position:relative;min-height:100%;max-width:1120px;margin:0 auto;padding:44px 24px 28px;display:flex;flex-direction:column;gap:26px}
  #areaHub .ah-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;animation:ahUp .6s both}
  #areaHub .ah-head img{height:46px;max-width:60vw;object-fit:contain;background:#fff;padding:6px 10px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.45)}
  #areaHub .ah-data{font-size:13px;color:#9fb09a}
  #areaHub .ah-title{animation:ahUp .6s .08s both}
  #areaHub .ah-title h1{margin:0;font-size:clamp(26px,4vw,40px);font-weight:800;letter-spacing:-.5px;line-height:1.1}
  #areaHub .ah-title h1 span{background:linear-gradient(90deg,#8be36a,#4aa3ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  #areaHub .ah-title p{margin:8px 0 0;font-size:15px;color:#a9b8a4}

  #areaHub .ah-card{all:unset;box-sizing:border-box;position:relative;cursor:pointer;overflow:hidden;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.025));-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
    transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s,border-color .25s;animation:ahUp .6s both;--mx:50%;--my:0%}
  #areaHub .ah-card::before{content:"";position:absolute;inset:0;background:radial-gradient(380px circle at var(--mx) var(--my),color-mix(in srgb,var(--c) 32%,transparent),transparent 65%);opacity:0;transition:opacity .25s}
  #areaHub .ah-card::after{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,var(--c),transparent)}
  #areaHub .ah-card:hover,#areaHub .ah-card:focus-visible{transform:translateY(-6px);border-color:color-mix(in srgb,var(--c) 70%,#fff 0%);box-shadow:0 22px 50px rgba(0,0,0,.55),0 0 0 1px var(--c),0 0 40px color-mix(in srgb,var(--c) 28%,transparent)}
  #areaHub .ah-card:hover::before,#areaHub .ah-card:focus-visible::before{opacity:1}
  #areaHub .ah-card > *{position:relative}
  #areaHub .ah-card .ico{width:50px;height:50px;border-radius:14px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
  #areaHub .ah-card .ico svg{width:26px;height:26px}
  #areaHub .ah-card h2{margin:0;font-size:21px;font-weight:700;letter-spacing:-.2px}
  #areaHub .ah-card p{margin:0;font-size:13.5px;line-height:1.5;color:#b4c2af}
  #areaHub .kbd{position:absolute!important;top:16px;right:16px;font-size:11px;color:#9fb09a;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:2px 7px;background:rgba(0,0,0,.25)}

  /* herói: Visão da Operação */
  #areaHub .ah-hero{display:grid;grid-template-columns:1.25fr 1fr;gap:20px;padding:26px 28px;align-items:center;animation-delay:.16s;--c:#6fcf4a;
    background:linear-gradient(120deg,rgba(111,207,74,.2),rgba(255,255,255,.04) 55%)}
  #areaHub .ah-hero .tag{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:1.2px;color:#8be36a}
  #areaHub .ah-hero .tag b{width:9px;height:9px;border-radius:50%;background:#6fcf4a;animation:ahPulse 1.6s infinite}
  #areaHub .ah-hero h2{font-size:clamp(24px,3vw,32px);margin:8px 0 6px}
  #areaHub .ah-hero .go{margin-top:16px;display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:14px;color:#0b120b;background:linear-gradient(90deg,#8be36a,#6fcf4a);padding:10px 18px;border-radius:999px;position:relative;overflow:hidden;white-space:nowrap}
  #areaHub .ah-hero .go svg{width:18px;height:18px;flex:none}
  #areaHub .ah-hero .go::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:ahShine 2.6s infinite}
  #areaHub .viz{display:flex;align-items:flex-end;gap:7px;height:118px;padding:14px 16px;border-radius:14px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08)}
  #areaHub .viz u{flex:1;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#8be36a,#2f7d1c);transform-origin:bottom;animation:ahBar 2.4s ease-in-out infinite;text-decoration:none}

  /* três áreas */
  #areaHub .ah-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  #areaHub .ah-area{padding:24px 22px 20px;display:flex!important;flex-direction:column;gap:12px;min-height:290px}
  #areaHub .ah-area:nth-child(1){animation-delay:.24s}#areaHub .ah-area:nth-child(2){animation-delay:.32s}#areaHub .ah-area:nth-child(3){animation-delay:.4s}
  #areaHub .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
  #areaHub .chips span{font-size:11.5px;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#d5dfd1}
  #areaHub .chips span.mais{color:var(--c);border-color:color-mix(in srgb,var(--c) 45%,transparent)}
  #areaHub .foot{display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:13px;font-weight:700;color:var(--c)}
  #areaHub .foot em{font-style:normal;color:#9fb09a;font-weight:500;font-size:12px}
  #areaHub .foot svg{width:18px;height:18px;transition:transform .2s}
  #areaHub .ah-card:hover .foot svg{transform:translateX(5px)}

  #areaHub .ah-rodape{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:#7d8d78;margin-top:auto;padding-top:4px;animation:ahUp .6s .5s both}
  #areaHub .ah-rodape button{all:unset;cursor:pointer;color:#9fb09a;text-decoration:underline}
  #areaHub .ah-rodape button:hover{color:#fff}

  /* saída ao escolher */
  #areaHub.saindo{transition:opacity .38s ease,transform .38s ease;opacity:0;transform:scale(1.04)}
  #areaHub.saindo .ah-card:not(.escolhido){opacity:.25;transform:scale(.97)}

  @media(max-width:900px){#areaHub .ah-grid{grid-template-columns:1fr}#areaHub .ah-hero{grid-template-columns:1fr}#areaHub .ah-area{min-height:0}#areaHub .kbd{display:none}}
  @media(prefers-reduced-motion:reduce){#areaHub *,#areaHub *::before,#areaHub *::after{animation:none!important;transition:none!important}}

  nav.side-nav .nav-voltar{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 10px;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:inherit;font-size:13px;cursor:pointer}
  nav.side-nav .nav-voltar:hover{background:rgba(255,255,255,.1)}
  nav.side-nav .nav-voltar svg{width:16px;height:16px;flex:none}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const hub = document.createElement("div");
  hub.id = "areaHub";
  hub.setAttribute("role", "dialog");
  hub.setAttribute("aria-label", "Escolha onde você quer entrar");

  const SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  function saudacao(){
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }

  function montar(){
    const tabsDe = id => (typeof TABS !== "undefined" ? TABS.filter(t => t.group === id && !t.action) : []);
    let dataTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    dataTxt = dataTxt.charAt(0).toUpperCase() + dataTxt.slice(1);
    let armaz = "";
    try{ if(window.LS_BACKUP){ const r = window.LS_BACKUP.resumo(); armaz = "Dados salvos neste navegador · " + r.totalTxt; } }catch(e){}
    const barras = [38, 62, 48, 80, 58, 92, 70, 100, 76, 54].map((h, i) => `<u style="height:${h}%;animation-delay:${(i * .18).toFixed(2)}s"></u>`).join("");

    hub.innerHTML = `
      <div class="ah-bg"><i></i><i></i><i></i></div>
      <div class="ah-wrap">
        <div class="ah-head">
          <img src="logo-dovalle.png" alt="Do Valle">
          <div class="ah-data">${esc(dataTxt)}</div>
        </div>
        <div class="ah-title">
          <h1>${saudacao()}. <span>Onde você quer entrar?</span></h1>
          <p>Escolha uma área. Dentro dela você vê só as telas daquela área.</p>
        </div>

        <button type="button" class="ah-card ah-hero" data-area="vo">
          <div>
            <span class="tag"><b></b>CENTRAL DE COMANDO · TELA CHEIA</span>
            <h2>Visão da Operação</h2>
            <p>A central de comando da operação: índice de saúde, leitura do dia e o que precisa de atenção agora.</p>
            <span class="go">Abrir central ${SETA}</span>
          </div>
          <div class="viz" aria-hidden="true">${barras}</div>
          <span class="kbd">4</span>
        </button>

        <div class="ah-grid">
          ${AREAS.map(a => {
            const t = tabsDe(a.id), vis = t.slice(0, 5), resto = t.length - vis.length;
            return `
          <button type="button" class="ah-card ah-area" data-area="${a.id}" style="--c:${a.cor}">
            <span class="kbd">${a.tecla}</span>
            <div class="ico">${ICONES[a.id]}</div>
            <h2>${a.titulo}</h2>
            <p>${a.sub}</p>
            <div class="chips">${vis.map(x => `<span>${esc(x.label)}</span>`).join("")}${resto > 0 ? `<span class="mais">+${resto}</span>` : ""}</div>
            <div class="foot"><span>Entrar <em>· ${t.length} telas</em></span>${SETA}</div>
          </button>`;
          }).join("")}
        </div>

        <div class="ah-rodape">
          <span>Para voltar aqui depois, use “Trocar de área” no topo do menu. Atalhos: 1, 2, 3 e 4.</span>
          <span>${window.AUTH_USUARIO ? esc(window.AUTH_USUARIO.email) + " · " : ""}${esc(armaz)}${armaz ? " · " : ""}<button type="button" id="ahBackup">Backup dos dados</button>${window.authSair ? ' · <button type="button" id="ahSair">Sair</button>' : ""}</span>
        </div>
      </div>`;

    hub.querySelectorAll("[data-area]").forEach(b => {
      b.addEventListener("click", () => escolher(b.dataset.area, b));
      b.addEventListener("mousemove", e => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--mx", (e.clientX - r.left) + "px");
        b.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
    const sair = hub.querySelector("#ahSair");
    if(sair) sair.addEventListener("click", () => { esconder(); window.authSair(); });
    const bk = hub.querySelector("#ahBackup");
    if(bk) bk.addEventListener("click", () => { const b = document.getElementById("bkBtn"); if(b){ hub.classList.remove("on"); document.body.style.overflow = ""; b.click(); } });
  }

  let ocupado = false;

  function mostrar(){
    montar();
    ocupado = false;
    hub.classList.remove("saindo");
    hub.classList.add("on");
    document.body.style.overflow = "hidden";
    if(typeof window.fecharVisaoOperacao === "function"){ try{ window.fecharVisaoOperacao(); }catch(e){} }
  }
  function esconder(){
    hub.classList.remove("on", "saindo");
    document.body.style.overflow = "";
  }

  function entrar(id){
    if(id === "vo"){
      areaAtual = "operacao";
      switchTab("dashboard");
      esconder();
      if(window.abrirVisaoOperacao) window.abrirVisaoOperacao();
      return;
    }
    const a = AREAS.find(x => x.id === id);
    if(!a) return;
    areaAtual = id;
    renderNav();
    switchTab(a.primeira);
    esconder();
  }

  function escolher(id, btn){
    if(ocupado) return;
    ocupado = true;
    if(btn) btn.classList.add("escolhido");
    hub.classList.add("saindo");
    setTimeout(() => entrar(id), 380);
  }

  // atalhos de teclado enquanto a tela inicial está aberta
  document.addEventListener("keydown", e => {
    if(!hub.classList.contains("on") || e.ctrlKey || e.metaKey || e.altKey) return;
    const mapa = { "1": "operacao", "2": "valle", "3": "tambasa", "4": "vo" };
    if(mapa[e.key]){ const b = hub.querySelector('[data-area="' + mapa[e.key] + '"]'); escolher(mapa[e.key], b); }
  });

  window.mostrarHubAreas = mostrar;

  document.body.appendChild(hub);
  mostrar();
})();
