/* PAPEIS (admin / leitor) — esconde as telas de IMPORTACAO para quem nao e admin.
   O papel vem do Supabase (tabela "perfis"), carregado pelo auth-login.js.
   Sem papel definido = leitor (fail-closed): a importacao so aparece depois que o admin e confirmado.
   ATENCAO: isto controla a TELA. A protecao real dos dados e a Fase 2 (dados no Supabase com RLS). */
(function(){
  "use strict";
  document.body.classList.add("papel-leitor");           // padrao: leitor (admin remove a classe)

  const st = document.createElement("style");
  st.textContent = "body.papel-leitor .pp-oculto{display:none!important}";
  document.head.appendChild(st);

  const RX_PAINEL = /^\s*(\d+\s*[·.\-]\s*)?(importar|importação|importacao)/i;
  const RX_BOTAO = /^\s*(importar|limpar todos|limpar dados)/i;
  const marca = el => { if(el) el.classList.add("pp-oculto"); };

  function varrer(){
    document.querySelectorAll(".panel > .panel-header").forEach(h => {
      if(RX_PAINEL.test(h.textContent.replace(/\s+/g, " ").trim())) marca(h.parentElement);
    });
    document.querySelectorAll('input[type="file"]').forEach(i => {
      if(i.closest("#loginTela")) return;
      const p = i.closest(".panel, .receita-import-slot, .import-slot, label");
      marca(p || i);
    });
    document.querySelectorAll("button, a.link-btn, .pill, [role=tab]").forEach(b => {
      if(b.closest("#loginTela")) return;
      if(RX_BOTAO.test(b.textContent.replace(/\s+/g, " ").trim())) marca(b);
    });
  }

  let ag = false;
  const agenda = () => { if(ag) return; ag = true; requestAnimationFrame(() => { ag = false; varrer(); }); };
  new MutationObserver(agenda).observe(document.body, {childList:true, subtree:true});
  agenda();

  window.definirPapel = function(papel){
    window.AUTH_PAPEL = papel === "admin" ? "admin" : "leitor";
    document.body.classList.toggle("papel-leitor", window.AUTH_PAPEL !== "admin");
    varrer();
    try{ if(typeof renderNav === "function" && typeof areaAtual !== "undefined" && areaAtual) renderNav(); }catch(e){}   // mostra/esconde a aba Monitor (só admin)
    try{ if(window.monitorAdminRefresh && document.getElementById("sec-monitor") && document.getElementById("sec-monitor").classList.contains("active")) window.monitorAdminRefresh(); }catch(e){}
  };

  /* Abertura sem "piscar": se este navegador já tem sessão salva e o servidor já confirmou admin antes,
     o painel abre direto como admin (só a TELA; o servidor continua confirmando em segundo plano e corrige se mudou). */
  (function(){
    try{
      const c = JSON.parse(localStorage.getItem("painel_papel_cache") || "null");
      if(!c || c.papel !== "admin" || !c.email) return;
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(!/^sb-.+-auth-token$/.test(k)) continue;
        const o = JSON.parse(localStorage.getItem(k) || "null");
        if(o && o.user && String(o.user.email || "").toLowerCase() === c.email){ window.definirPapel("admin"); return; }
      }
    }catch(e){}
  })();
})();
