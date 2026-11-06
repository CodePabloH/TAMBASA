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
  };
})();
