/* =====================================================================
   BACKUP DOS DADOS (exportar / importar) - botão no rodapé do menu
   Usa window.LS_BACKUP (storage-idb.js).
   ===================================================================== */
(function(){
  "use strict";
  if(!window.LS_BACKUP) return;

  const css = `
  #bkBtn{display:block;width:100%;margin-top:10px;padding:7px 10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;border-radius:8px;font-size:12px;cursor:pointer;text-align:center}
  #bkBtn:hover{background:rgba(255,255,255,.1)}
  #bkOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px}
  #bkOverlay.on{display:flex}
  #bkBox{background:#fff;color:#1f2933;border-radius:12px;max-width:520px;width:100%;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:inherit;max-height:90vh;overflow:auto}
  #bkBox h3{margin:0 0 4px;font-size:18px}
  #bkBox p{margin:6px 0;font-size:13px;line-height:1.45;color:#52606d}
  #bkBox .bk-info{background:#f1f5f2;border:1px solid #d5e2d8;border-radius:8px;padding:10px 12px;font-size:12.5px;margin:12px 0;color:#1f2933}
  #bkBox .bk-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  #bkBox button{padding:9px 14px;border-radius:8px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;font-size:13px;cursor:pointer}
  #bkBox button.sec{background:#fff;color:#2e7d32}
  #bkBox button.fechar{border-color:#cbd2d9;background:#fff;color:#52606d;margin-left:auto}
  #bkBox label.bk-opt{display:block;font-size:12.5px;margin:4px 0;color:#1f2933}
  #bkMsg{font-size:13px;margin-top:10px;min-height:18px}
  #bkMsg.ok{color:#1b5e20}#bkMsg.erro{color:#b71c1c}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const overlay = document.createElement("div");
  overlay.id = "bkOverlay";
  overlay.innerHTML = `
    <div id="bkBox" role="dialog" aria-modal="true" aria-label="Backup dos dados">
      <h3>Backup dos dados</h3>
      <p>Os dados do painel ficam guardados neste navegador (IndexedDB). Faça um backup de vez em quando, principalmente antes de limpar os dados do site ou trocar de computador.</p>
      <div class="bk-info" id="bkInfo"></div>
      <div class="bk-row">
        <button type="button" id="bkExp">Exportar backup</button>
        <button type="button" class="sec" id="bkImp">Importar backup…</button>
        <button type="button" class="fechar" id="bkFechar">Fechar</button>
      </div>
      <div style="margin-top:12px">
        <label class="bk-opt"><input type="radio" name="bkModo" value="mesclar" checked> Importar e <b>mesclar</b> (o backup sobrescreve só as chaves que ele contém)</label>
        <label class="bk-opt"><input type="radio" name="bkModo" value="substituir"> Importar e <b>substituir tudo</b> (apaga o que está salvo agora)</label>
      </div>
      <input type="file" id="bkFile" accept=".json,application/json" style="display:none">
      <div id="bkMsg"></div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = id => document.getElementById(id);
  const msg = (t, cls) => { const m = $("bkMsg"); m.textContent = t || ""; m.className = cls || ""; };

  function atualizar(){
    const r = window.LS_BACKUP.resumo();
    $("bkInfo").innerHTML = "Armazenamento: <b>" + r.modo + "</b> · " + r.chaves + " itens salvos · <b>" + r.totalTxt + "</b> no total" +
      (r.maiores.length ? "<br>Maiores: " + r.maiores.join(", ") : "");
  }
  function abrir(){ atualizar(); msg(""); overlay.classList.add("on"); }
  function fechar(){ overlay.classList.remove("on"); }

  $("bkExp").addEventListener("click", () => { window.LS_BACKUP.exportar(); msg("Backup gerado. Guarde o arquivo em um lugar seguro.", "ok"); });
  $("bkImp").addEventListener("click", () => { $("bkFile").value = ""; $("bkFile").click(); });
  $("bkFechar").addEventListener("click", fechar);
  overlay.addEventListener("click", e => { if(e.target === overlay) fechar(); });
  $("bkFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const modo = (document.querySelector('input[name="bkModo"]:checked') || {}).value || "mesclar";
    if(modo === "substituir" && !confirm("Isso apaga os dados atuais e deixa só o que está no backup. Continuar?")) return;
    try{
      const n = await window.LS_BACKUP.importar(f, modo);
      atualizar();
      msg(n + " itens importados. Recarregando a página para aplicar…", "ok");
      setTimeout(() => location.reload(), 1200);
    }catch(err){ msg(err.message || String(err), "erro"); }
  });

  // botão no rodapé do menu lateral
  const rodape = document.querySelector(".sidebar-footer");
  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "bkBtn"; btn.textContent = "Backup dos dados";
  btn.title = "Exportar ou importar uma cópia de segurança dos dados salvos";
  btn.addEventListener("click", abrir);
  (rodape || document.body).appendChild(btn);
})();
