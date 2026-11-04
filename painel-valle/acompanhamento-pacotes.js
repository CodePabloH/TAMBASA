/* ================= ACOMPANHAMENTO DE PACOTES (sub-aba da aba Pacotes) =================
   Objetivo: garantir que TODAS as notas de cada pacote estejam baixadas dentro do prazo (6 dias
   a partir do envio). Funciona assim:
   1) Você escolhe quais pacotes acompanhar: importando o mesmo PDF do Mapa de Entrega usado em "Entregas Previstas"
      (pode ser mais de um) ou puxando pacotes já importados lá. O pacote fica salvo até você excluir.
   2) A situação em tempo real vem da planilha do SSW (.sswweb / .csv) importada aqui. O sistema só
      considera os CTRCs cujo CNPJ REMETENTE seja o da TEC E ARM MIGUEL BARTOLOMEU (2 CNPJs).
   3) Cada NF do pacote é cruzada com a coluna NFISCAL da planilha.
   Baixa = COD ULT OCORRENC 1 (entrega normal) ou 69 (entrega com ressalva). Qualquer outro código
   (inclusive 93 - CTRC emitido para efeito de frete/imposto) continua pendente e segue o prazo. */
(function(){
  const K_SHEET = "tambasa_acomp_planilha", K_CFG = "tambasa_acomp_pacotes", K_PREV = "tambasa_previstas";
  const DIAS_PRAZO = 6;
  const REMETENTES = {"17359233000935":"TEC E ARM MIGUEL BARTOLOMEU", "17359233000188":"TEC E ARM MIGUEL BARTOLOMEU"};
  const COD_BAIXA = [1, 69];

  const e = s => (typeof escHtml === "function") ? escHtml(s == null ? "" : s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const jget = (k, d) => { try{ const r = LS.getItem(k); return r ? JSON.parse(r) : d; }catch(x){ return d; } };
  const jset = (k, v) => LS.setItem(k, JSON.stringify(v));
  const pad = n => String(n).padStart(2, "0");
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const dd = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
  const add = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const br = iso => { if(!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const brCurto = iso => { if(!iso) return "—"; const [, m, d] = iso.split("-"); return `${d}/${m}`; };
  const parseBR = s => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if(!m) return ""; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2]}-${m[1]}`; };
  const soDigitos = s => String(s || "").replace(/\D/g, "");
  const nfKey = s => soDigitos(s).replace(/^0+/, "");
  const plural = (n, s, p) => n === 1 ? s : p;

  let st = {sub: "mapa", pacote: "", situacao: "todas", praca: "", busca: ""};

  /* ---------- leitura da planilha do SSW ---------- */
  function parsePlanilha(texto){
    const linhas = texto.split(/\r?\n/);
    const iH = linhas.findIndex(l => l.includes("NFISCAL") && l.includes("CTRC/SUBCON"));
    if(iH < 0) throw new Error("Cabeçalho não encontrado (precisa das colunas CTRC/SUBCON e NFISCAL).");
    const ix = {};
    linhas[iH].split(";").forEach((n, i) => { n = n.trim(); if(n && !(n in ix)) ix[n] = i; });
    const falta = ["CTRC/SUBCON", "NFISCAL", "CNPJ REMETENTE", "COD ULT OCORRENC"].filter(c => !(c in ix));
    if(falta.length) throw new Error("Faltam colunas na planilha: " + falta.join(", "));
    const out = []; let lidas = 0, ignoradas = 0;
    linhas.slice(iH + 1).forEach(l => {
      const c = l.split(";");
      if(c.length < 20 || c[0].trim() !== "3") return;
      lidas++;
      const g = n => (n in ix && c[ix[n]] != null) ? c[ix[n]].replace(/\u00a0/g, " ").trim() : "";
      const cnpj = soDigitos(g("CNPJ REMETENTE"));
      if(!REMETENTES[cnpj]){ ignoradas++; return; }
      const extras = (g("DEMAIS NOTAS FISCAIS").match(/\d{4,}/g) || []).map(nfKey).filter(Boolean);
      out.push({
        k: g("CTRC/SUBCON"), emis: parseBR(g("EMISSAO")), rem: g("NOME REMETENTE"), cnpj,
        dest: g("NOME DESTINATARIO"), praca: g("PRACA").slice(0, 3).toUpperCase(),
        cidade: g("CIDADE DESTINO"), km: g("DISTANCIA KM"),
        nf: nfKey(g("NFISCAL")), nfs: extras,
        cod: g("COD ULT OCORRENC"), ocor: g("ULTIMA OCORRENC"),
        prev: parseBR(g("DATA PREV ENTREGA")), ent: parseBR(g("DATA ENTREGA REALIZADA")), atraso: g("ATRASO"),
        ctrcOrig: g("NUMERO CTRC ORIGEM"), emisOrig: parseBR(g("EMISSAO CTRC ORIGEM")),
        romaneio: g("ULTIMO ROMANEIO"), emisRom: parseBR(g("EMISSAO ULT ROMANEIO")), placa: g("PLACA"),
        // PACOTE ARQ = pacote do faturamento (preenchido => ja faturou) | CAPA DE REMESSA (preenchida => filial enviou para a MTZ)
        pacoteArq: ("PACOTE ARQ" in ix) ? g("PACOTE ARQ") : undefined,
        capa: ("CAPA DE REMESSA" in ix) ? g("CAPA DE REMESSA") : undefined
      });
    });
    const per = (texto.split(/\r?\n/)[0].match(/PERIODO:\s*([^;]+)/i) || [])[1] || "";
    return {linhas: out, lidas, ignoradas, periodo: per.trim()};
  }

  function importaPlanilha(parsed, arquivo){
    const atual = jget(K_SHEET, {linhas: []}), mapa = new Map(atual.linhas.map(r => [r.k, r]));
    let novas = 0, atualizadas = 0;
    parsed.linhas.forEach(r => { if(mapa.has(r.k)) atualizadas++; else novas++; mapa.set(r.k, r); });
    jset(K_SHEET, {importadoEm: new Date().toISOString(), arquivo, periodo: parsed.periodo, linhas: [...mapa.values()]});
    return {novas, atualizadas};
  }

  /* ---------- leitura de PDF: "Entregas Previstas - UNIDADE" (exportado do próprio painel) ----------
     Layout: Seq | Pacote / Relação ("3145071 / REL: 58") | Nota Fiscal | Cliente | Peso/Volume | Prazo | Unidade.
     Não depende da ordem em que o leitor de PDF devolve as células: cada registro começa em "pacote / REL: n"
     e a nota fiscal é o primeiro número de 5+ dígitos logo depois. */
  function parseEntregasPrevistasPdf(texto, nomeArquivo){
    texto = String(texto || "").replace(/\r\n/g, "\n");
    const rotaTxt = ((texto.match(/Rota\(s\):\s*([^\n|]+)/i) || [])[1] || "").trim();
    let dataRota = "";
    const f = String(nomeArquivo || "").match(/(\d{2})[-_.](\d{2})[-_.](\d{4})/);
    if(f) dataRota = `${f[3]}-${f[2]}-${f[1]}`;
    else{
      const r = rotaTxt.match(/(\d{2})-(\d{2})\s*$/);
      if(r){ const hojeD = new Date(); let y = hojeD.getFullYear(); const iso = `${y}-${r[2]}-${r[1]}`; dataRota = dd(hoje(), iso) > 60 ? `${y - 1}-${r[2]}-${r[1]}` : iso; }
    }
    const marcas = [...texto.matchAll(/(\d{4,})\s*\/\s*REL:\s*(\d+)/g)], pacotes = [];
    marcas.forEach((m, i) => {
      const chunk = texto.slice(m.index + m[0].length, i + 1 < marcas.length ? marcas[i + 1].index : texto.length);
      const nf = (chunk.match(/(?:^|[\s])(\d{5,9})(?=\s|$)/) || [])[1]; if(!nf) return;
      const linhas = chunk.split("\n").map(l => l.trim()).filter(Boolean);
      const iNf = linhas.findIndex(l => new RegExp("(^|\\s)" + nf + "(\\s|$)").test(l));
      const resto = (linhas[iNf] || "").replace(nf, "").trim();
      const cliente = resto || (linhas[iNf + 1] || "");
      const iKg = linhas.findIndex((l, j) => j > iNf && /kg\s*$/i.test(l));
      const antesKg = iKg > 0 ? linhas[iKg - 1] : "";
      const k = antesKg.lastIndexOf(" - ");
      pacotes.push({pacote: m[1], relnum: m[2], nf, cliente, cidade: k < 0 ? "" : antesKg.slice(k + 3).trim(), rota: rotaTxt, dataRota});
    });
    return {rota: rotaTxt, dataRota, pacotes};
  }

  // Lê o PDF aceitando os dois layouts (Mapa de Entrega do TransFlow e "Entregas Previstas - UNIDADE").
  function lerPdfPacotes(texto, nomeArquivo){
    if(!/ENTREGAS PREVISTAS\s*-\s*[A-Z]{2,4}/i.test(texto) && typeof parseMapaPrevistas === "function"){
      try{ const r = parseMapaPrevistas(texto); if(r && r.pacotes && r.pacotes.length) return r; }catch(x){}
    }
    return parseEntregasPrevistasPdf(texto, nomeArquivo);
  }

  /* ---------- pacotes ---------- */
  function listaPacotes(){
    const prev = jget(K_PREV, []), cfg = jget(K_CFG, {}), m = new Map();
    Object.entries(cfg).forEach(([n, c]) => {
      const o = {pacote: n, arq: !!c.removido, removidoEm: c.removidoEm || "", nfs: new Map(), envio: c.envio || "", dias: Number(c.dias) || DIAS_PRAZO, rotas: new Set(c.rotas || [])};
      (c.nfs || []).forEach(x => { const k = nfKey(x.nf || x); if(k && !o.nfs.has(k)) o.nfs.set(k, {nf: k, cliente: x.cliente || "", cidade: x.cidade || "", oculta: !!x.oculta, final: !!x.final, relnum: x.relnum || "", tipoVenda: x.tipoVenda || "", volumes: x.volumes || 0, peso: x.peso || 0, m3: x.m3 || 0}); });
      m.set(n, o);
    });
    return [...m.values()].map(o => ({...o, prazo: o.envio ? add(o.envio, o.dias) : ""}))
      .sort((a, b) => (b.envio || "").localeCompare(a.envio || "") || b.pacote.localeCompare(a.pacote));
  }

  // Guarda (ou complementa) um pacote acompanhado a partir de entregas lidas do Mapa de Entrega.
  function adicionaPacotes(entregas){
    const cfg = jget(K_CFG, {}), vistos = new Set(); let novas = 0;
    entregas.forEach(p => {
      const n = String(p.pacote || "").trim(), k = nfKey(p.nf); if(!n || !k) return;
      const c = cfg[n] = cfg[n] || {envio: "", dias: DIAS_PRAZO, nfs: [], rotas: []};
      if(c.removido){ c.removido = false; delete c.removidoEm; } // importou de novo: volta para o acompanhamento
      const extra = {relnum: p.relnum || "", tipoVenda: p.tipoVenda || "", volumes: p.volumes || 0, peso: p.peso || 0, m3: p.m3 || 0}; // usados no PDF do pacote
      const ex = c.nfs.find(x => (x.nf || x) === k);
      if(!ex){ c.nfs.push({nf: k, cliente: p.cliente || "", cidade: p.cidade || "", ...extra}); novas++; }
      else if(typeof ex === "object" && !ex.relnum && extra.relnum) Object.assign(ex, extra);
      if(p.dataRota && !c.envioManual && (!c.envio || p.dataRota < c.envio)) c.envio = p.dataRota; // data corrigida a mao nunca e sobrescrita
      if(p.rota && !c.rotas.includes(p.rota)) c.rotas.push(p.rota);
      vistos.add(n);
    });
    jset(K_CFG, cfg);
    return {pacotes: vistos.size, notas: novas};
  }

  /* ---------- classificação de cada NF ---------- */
  const codNum = c => parseInt(String(c).replace(/\D/g, ""), 10);
  const ehBaixa = r => COD_BAIXA.includes(codNum(r.cod));

  function classifica(r, prazo, T, x){
    if(x && x.final && !(r && ehBaixa(r))) return {grupo: "baixado", nivel: "final", texto: "Finalizada manualmente", dias: 9999, rank: 6};
    if(!r) return {grupo: "sem_info", nivel: "sem_info", texto: "Não consta na planilha", dias: 9999, rank: 4};
    if(ehBaixa(r)){
      if(!prazo || !r.ent) return {grupo: "baixado", nivel: "ok", texto: "Baixado", dias: 9999, rank: 6};
      const fora = dd(prazo, r.ent);
      return fora > 0
        ? {grupo: "baixado", nivel: "ok_fora", texto: `Baixado fora do prazo (+${fora}d)`, dias: 9999, rank: 5}
        : {grupo: "baixado", nivel: "ok", texto: "Baixado no prazo", dias: 9999, rank: 6};
    }
    if(!prazo) return {grupo: "pendente", nivel: "semprazo", texto: "Defina a data de envio", dias: 9998, rank: 3};
    const falta = dd(T, prazo);
    if(falta < 0) return {grupo: "pendente", nivel: "vencido", texto: `VENCIDO há ${-falta} ${plural(-falta, "dia", "dias")}`, dias: falta, rank: 0};
    if(falta === 0) return {grupo: "pendente", nivel: "urgente", texto: "Vence HOJE", dias: 0, rank: 1};
    if(falta === 1) return {grupo: "pendente", nivel: "urgente", texto: "Vence amanhã", dias: 1, rank: 1};
    if(falta <= 3) return {grupo: "pendente", nivel: "atencao", texto: `Faltam ${falta} dias`, dias: falta, rank: 2};
    return {grupo: "pendente", nivel: "noprazo", texto: `Faltam ${falta} dias`, dias: falta, rank: 3};
  }

  function melhorLinha(lista){
    if(!lista || !lista.length) return null;
    return lista.slice().sort((a, b) =>
      (a.sec - b.sec) || (ehBaixa(b.r) - ehBaixa(a.r)) || (b.r.emis || "").localeCompare(a.r.emis || ""))[0].r;
  }

  function analisa(arq){
    const T = hoje(), sheet = jget(K_SHEET, {linhas: []}), idx = new Map();
    sheet.linhas.forEach(r => [r.nf, ...(r.nfs || [])].forEach((k, i) => {
      if(!k) return; const a = idx.get(k) || []; a.push({r, sec: i > 0 ? 1 : 0}); idx.set(k, a);
    }));
    const pacs = listaPacotes().filter(p => p.arq === !!arq), itens = [], ocultas = [];
    const prevIdx = new Map(jget(K_PREV, []).map(q => [String(q.pacote).trim() + "|" + nfKey(q.nf), q])); // dados do Mapa de Entrega (REL, volumes, peso)
    pacs.forEach(p => {
      const todos = [...p.nfs.values()].map(x => {
        const r = melhorLinha(idx.get(x.nf)), c = classifica(r, p.prazo, T, x);
        const pv = prevIdx.get(p.pacote + "|" + x.nf) || {};
        const divergDias = r && r.emis && r.emisOrig && r.emis !== r.emisOrig ? dd(r.emisOrig, r.emis) : null;
        let atrasoPrev = 0;
        if(r && r.prev){
          if(ehBaixa(r) && r.ent) atrasoPrev = Math.max(0, dd(r.prev, r.ent));
          else if(!ehBaixa(r)) atrasoPrev = Math.max(0, dd(r.prev, T));
        }
        return {pacote: p.pacote, prazo: p.prazo, nf: x.nf, cliente: x.cliente, cidade: x.cidade, oculta: !!x.oculta, final: !!x.final, r, ...c, divergDias, atrasoPrev,
          relnum: x.relnum || pv.relnum || "", tipoVenda: x.tipoVenda || pv.tipoVenda || "", volumes: x.volumes || pv.volumes || 0, peso: x.peso || pv.peso || 0, m3: x.m3 || pv.m3 || 0};
      });
      // nota oculta some de tudo (contagens, tabela, KPIs) como se nao existisse; so aparece no filtro "Ocultas"
      p.itens = todos.filter(i => !i.oculta); p.ocultas = todos.filter(i => i.oculta);
      itens.push(...p.itens); ocultas.push(...p.ocultas);
      const n = p.itens.length, cnt = f => p.itens.filter(f).length;
      p.res = {
        total: n, baixadas: cnt(i => i.grupo === "baixado"), pend: cnt(i => i.grupo === "pendente"), semInfo: cnt(i => i.grupo === "sem_info"),
        vencidas: cnt(i => i.nivel === "vencido"), urgentes: cnt(i => i.nivel === "urgente"),
        foraPrazo: cnt(i => i.nivel === "ok_fora"), diverg: cnt(i => i.divergDias !== null)
      };
      p.res.pct = n ? Math.round(p.res.baixadas * 100 / n) : 0;
      p.diasPrazo = p.prazo ? dd(T, p.prazo) : null;
    });
    return {T, sheet, pacs, itens, ocultas};
  }

  /* ---------- tela ---------- */
  window.acompPacotesHTML = function(){
    return `
    <div class="ap-root" id="apRoot">
      <p class="section-desc">Controle <strong>100%</strong> das notas de cada pacote: o prazo para baixar tudo é de <strong>${DIAS_PRAZO} dias</strong> a partir do envio.
        Importe a planilha do SSW — o sistema usa só os CTRCs com remetente <strong>TEC E ARM MIGUEL BARTOLOMEU</strong> (CNPJ 17.359.233/0009-35 e 17.359.233/0001-88),
        cruza a coluna <strong>NFISCAL</strong> com as notas de cada pacote e mostra o que já foi baixado e o que precisa baixar com urgência.
        Baixa = ocorrência <strong>01</strong> (entrega realizada normalmente) ou <strong>69</strong> (entrega com ressalva).</p>
      <div class="panel"><div class="panel-header">Importar planilha do SSW (situação em tempo real)</div>
        <form class="add-form" id="apFormPlan">
          <div class="field"><label>Arquivo(s) .sswweb / .csv</label><input type="file" id="apPlanInput" accept=".sswweb,.csv,.txt" multiple></div>
          <div class="field" style="max-width:200px;"><button type="submit" class="btn btn-primary">Importar planilha</button></div>
        </form>
        <div class="footer-note" id="apPlanStatus"></div></div>
      <div class="panel"><div class="panel-header">Importar pacotes para acompanhar</div>
        <p class="ap-hint">Aceita o PDF do <em>Mapa de Entrega</em> e também o PDF <em>Entregas Previstas</em> (exportado pelo painel, com várias unidades). Pode selecionar vários arquivos de uma vez. Cada pacote fica na lista até você excluir.</p>
        <form class="add-form" id="apFormPac">
          <div class="field"><label>Arquivo(s) PDF (Mapa de Entrega ou Entregas Previstas)</label><input type="file" id="apPacPdf" accept="application/pdf" multiple></div>
          <div class="field" style="max-width:200px;"><button type="submit" class="btn btn-primary">Importar pacote(s)</button></div>
        </form>
        <div class="toolbar" style="margin-top:4px;">
          <label class="check-inline">Ou puxar de Entregas Previstas: <select class="small-select" id="apPrevSel"></select></label>
          <button type="button" class="btn btn-ghost btn-sm" id="apPrevAdd">Acompanhar este pacote</button>
          <button type="button" class="btn btn-ghost btn-sm" id="apPrevAddTodos">Acompanhar todos</button>
        </div>
        <details class="ap-manual"><summary>Adicionar pacote digitando as notas</summary>
          <form class="add-form" id="apFormMan">
            <div class="field" style="max-width:180px;"><label>Nº do pacote</label><input type="text" id="apPacNum" placeholder="Ex: 339710"></div>
            <div class="field" style="max-width:180px;"><label>Data do envio</label><input type="date" id="apPacEnvio"></div>
            <div class="field full"><label>Notas fiscais (separe por espaço, vírgula ou linha)</label><textarea id="apPacNfs" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;"></textarea></div>
            <div class="field" style="max-width:200px;"><button type="submit" class="btn btn-ghost">Adicionar pacote</button></div>
          </form></details>
        <div class="footer-note" id="apPacStatus"></div></div>
      <div id="apResumo"></div>
    </div>`;
  };

  function badgeCod(r){
    if(!r) return "—";
    const n = codNum(r.cod), cls = COD_BAIXA.includes(n) ? "ok" : n === 93 ? "cinza" : "warn";
    return `<span class="ap-cod ap-cod-${cls}" title="${e(r.ocor)}">${e(r.cod)}</span><small class="ap-ocor">${e(r.ocor.slice(0, 48))}</small>`;
  }
  const nivelCls = n => ({vencido: "red", urgente: "red", atencao: "amber", noprazo: "gray", semprazo: "gray", sem_info: "gray", ok_fora: "amber", final: "green", ok: "green"}[n] || "gray");

  function renderResumo(){
    const box = document.getElementById("apResumo"); if(!box) return;
    const A = analisa(), {pacs, itens, sheet, T} = A;
    const nSheet = sheet.linhas.length;
    const selPrev = document.getElementById("apPrevSel");
    if(selPrev){ const v = selPrev.value, ps = [...new Set(jget(K_PREV, []).map(p => String(p.pacote)))].sort();
      selPrev.innerHTML = ps.length ? ps.map(n => `<option ${n === v ? "selected" : ""}>${e(n)}</option>`).join("") : `<option value="">(nenhum importado)</option>`; }
    const stEl = document.getElementById("apPlanStatus");
    if(stEl && !stEl.dataset.msg){
      stEl.textContent = nSheet ? `Planilha carregada: ${nSheet} CTRC(s) dos remetentes Tambasa${sheet.periodo ? " · " + sheet.periodo : ""}${sheet.importadoEm ? " · importada em " + new Date(sheet.importadoEm).toLocaleString("pt-BR") : ""}.` : "Nenhuma planilha importada ainda.";
    }
    if(!pacs.length){ box.innerHTML = `<div class="panel"><div class="empty">Nenhum pacote sendo acompanhado. Importe o PDF do Mapa de Entrega acima (ou puxe de Entregas Previstas).</div></div>`; return; }

    const tot = pacs.reduce((s, p) => ({n: s.n + p.res.total, b: s.b + p.res.baixadas, v: s.v + p.res.vencidas, u: s.u + p.res.urgentes}), {n: 0, b: 0, v: 0, u: 0});
    const kpi = (cls, label, val, hint) => `<div class="kpi-card ${cls}"><div class="kpi-top"><div class="label">${label}</div></div><div class="value">${val}</div><div class="hint">${hint}</div></div>`;
    const cards = `<div class="kpi-grid">
      ${kpi("", "Pacotes acompanhados", pacs.length, `${tot.n} nota(s) no total`)}
      ${kpi("ok", "Notas baixadas", tot.b, tot.n ? Math.round(tot.b * 100 / tot.n) + "% do total" : "")}
      ${kpi(tot.v ? "alert" : "ok", "Vencidas (passou do prazo)", tot.v, "baixar imediatamente")}
      ${kpi(tot.u ? "warn" : "ok", "Vencem hoje / amanhã", tot.u, "prioridade máxima")}
    </div>`;

    const linhasPac = pacs.map(p => {
      const r = p.res;
      const nivel = !p.prazo ? "gray" : r.pend + r.semInfo === 0 ? "green" : r.vencidas ? "red" : r.urgentes ? "red" : p.diasPrazo <= 3 ? "amber" : "gray";
      const sit = !r.total ? "Sem notas ativas" : r.baixadas === r.total ? "CONCLUÍDO" : !p.prazo ? "Defina o envio" : p.diasPrazo < 0 ? `Prazo vencido há ${-p.diasPrazo}d` : p.diasPrazo === 0 ? "Prazo vence HOJE" : `Faltam ${p.diasPrazo}d`;
      return `<tr class="${st.pacote === p.pacote ? "ap-sel" : ""}">
        <td><strong>${e(p.pacote)}</strong><br><small>${[...p.rotas].map(e).join(", ")}</small><br><button type="button" class="ap-pdf" data-ap-pdf="${e(p.pacote)}" title="PDF simples do pacote por unidade: baixa (01), faturamento (PACOTE ARQ) e capa de remessa">PDF</button><button type="button" class="ap-pdf" data-ap-xls="${e(p.pacote)}" title="Excel do pacote por unidade">Excel</button></td>
        <td><input type="date" class="small-input" data-ap-envio="${e(p.pacote)}" value="${e(p.envio)}"></td>
        <td class="c"><input type="number" min="1" max="60" class="small-input" style="width:58px" data-ap-dias="${e(p.pacote)}" value="${p.dias}"></td>
        <td class="c"><strong>${br(p.prazo)}</strong></td>
        <td class="c">${r.total}${p.ocultas.length ? `<br><small class="ap-nodata">+${p.ocultas.length} oculta(s)</small>` : ""}</td>
        <td class="c ap-t-green">${r.baixadas}</td>
        <td class="c"><span class="ap-abx"><b>${r.pend}</b>${r.vencidas ? `<span class="ap-pill ap-red">${r.vencidas} venc.</span>` : ""}${r.urgentes ? `<span class="ap-pill ap-red">${r.urgentes} urg.</span>` : ""}</span></td>
        <td class="c">${r.semInfo || "—"}</td>
        <td class="c">${r.diverg ? `<span class="ap-pill ap-amber">${r.diverg}</span>` : "—"}</td>
        <td style="min-width:120px"><div class="ap-bar"><i style="width:${r.pct}%"></i></div><small>${r.pct}% baixado</small></td>
        <td><span class="ap-pill ap-${nivel}">${e(sit)}</span></td>
        <td class="nowrap ap-acts"><button type="button" class="ap-fin ${r.total && r.baixadas === r.total ? "ap-fin-ok" : ""}" data-ap-ver="${e(p.pacote)}" title="Clique para ver as notas deste pacote">${r.baixadas}/${r.total} finalizadas</button>
          <button type="button" class="link-btn danger" data-ap-del="${e(p.pacote)}" title="O pacote vai para a aba Arquivo de pacotes (busca por NF); nada é apagado">Arquivar pacote</button></td></tr>`;
    }).join("");

    const pracas = [...new Set(itens.map(i => i.r && i.r.praca).filter(Boolean))].sort();
    const sel = (v, arr) => arr.map(([val, lab]) => `<option value="${e(val)}" ${v === val ? "selected" : ""}>${e(lab)}</option>`).join("");

    box.innerHTML = `${cards}
      <div class="panel"><div class="panel-header">Pacotes e prazos</div>
        <div class="table-wrap"><table class="ap-table"><thead><tr><th>Pacote</th><th>Envio</th><th class="c">Prazo (dias)</th><th class="c">Baixar até</th><th class="c">NFs</th><th class="c">Baixadas</th><th class="c">A baixar</th><th class="c">Sem info</th><th class="c">Emissão diverg.</th><th>Progresso</th><th>Situação</th><th></th></tr></thead><tbody>${linhasPac}</tbody></table></div>
        <div class="footer-note">O prazo é a data do envio + ${DIAS_PRAZO} dias (ajustável por pacote). A data do envio vem da data da rota do Mapa de Entrega e pode ser corrigida aqui. O pacote permanece nesta lista até você clicar em Arquivar pacote — ele não é apagado: vai para a aba <strong>Arquivo de pacotes</strong>, onde dá para pesquisar qualquer NF antiga.</div></div>
      <div class="panel"><div class="panel-header">Notas do pacote</div>
        <div class="toolbar">
          <label class="check-inline">Pacote: <select class="small-select" id="apFPacote">${sel(st.pacote, [["", "Todos os pacotes"], ...pacs.map(p => [p.pacote, p.pacote])])}</select></label>
          <label class="check-inline">Mostrar: <select class="small-select" id="apFSit">${sel(st.situacao, [["todas", "Todas"], ["abaixar", "A baixar (pendentes)"], ["urgentes", "Urgentes e vencidas"], ["baixados", "Já baixadas"], ["fora", "Baixadas fora do prazo"], ["sem_info", "Não constam na planilha"], ["diverg", "Emissão divergente"], ["atraso", "Atraso na previsão de entrega"], ["final", "Finalizadas manualmente"], ["ocultas", "Ocultas (para restaurar)"]])}</select></label>
          <label class="check-inline">Praça: <select class="small-select" id="apFPraca">${sel(st.praca, [["", "Todas"], ...pracas.map(x => [x, x])])}</select></label>
          <label class="check-inline">Buscar: <input type="text" class="small-input" id="apFBusca" value="${e(st.busca)}" placeholder="NF, CTRC, cliente, placa..." style="width:190px;"></label>
          <span class="toolbar-actions"><button type="button" class="btn btn-ghost btn-sm" id="apExport">Exportar Excel</button>
          <button type="button" class="link-btn danger" id="apLimparPlan">Limpar planilha importada</button></span>
        </div>
        <div class="table-wrap" id="apDetalhe"></div></div>`;
    renderDetalhe(A);
    ["apFPacote", "apFSit", "apFPraca"].forEach(id => document.getElementById(id).addEventListener("change", ev => {
      st[{apFPacote: "pacote", apFSit: "situacao", apFPraca: "praca"}[id]] = ev.target.value; renderDetalhe(analisa()); realcaPacote();
    }));
    document.getElementById("apFBusca").addEventListener("input", ev => { st.busca = ev.target.value; renderDetalhe(analisa()); });
  }

  function realcaPacote(){
    document.querySelectorAll("#apRoot .ap-table tbody tr").forEach(tr => {
      const b = tr.querySelector("[data-ap-ver]"); tr.classList.toggle("ap-sel", !!b && b.dataset.apVer === st.pacote);
    });
  }

  function filtraItens(A){
    const q = String(st.busca || "").toLowerCase();
    return (st.situacao === "ocultas" ? A.ocultas : A.itens).filter(i => {
      if(st.pacote && i.pacote !== st.pacote) return false;
      if(st.praca && (!i.r || i.r.praca !== st.praca)) return false;
      const s = st.situacao;
      if(s === "abaixar" && i.grupo !== "pendente") return false;
      if(s === "urgentes" && !["vencido", "urgente"].includes(i.nivel)) return false;
      if(s === "baixados" && i.grupo !== "baixado") return false;
      if(s === "fora" && i.nivel !== "ok_fora") return false;
      if(s === "sem_info" && i.grupo !== "sem_info") return false;
      if(s === "final" && i.nivel !== "final") return false;
      if(s === "diverg" && i.divergDias === null) return false;
      if(s === "atraso" && !i.atrasoPrev) return false;
      if(q){
        const txt = [i.nf, i.pacote, i.cliente, i.r && [i.r.k, i.r.dest, i.r.cidade, i.r.placa, i.r.romaneio, i.r.ctrcOrig].join(" ")].join(" ").toLowerCase();
        if(!txt.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.rank - b.rank) || (a.dias - b.dias) || a.pacote.localeCompare(b.pacote) || a.nf.localeCompare(b.nf));
  }

  const acoesNf = i => {
    const d = `data-ap-pac="${e(i.pacote)}" data-ap-nf="${e(i.nf)}"`;
    if(i.oculta) return `<div class="ap-nf-acts"><button type="button" class="ap-mini" data-ap-act="restaura" ${d}>Restaurar nota</button></div>`;
    const fin = i.final ? `<button type="button" class="ap-mini" data-ap-act="desfaz" ${d} title="Voltar a seguir a situação da planilha">Desfazer finalização</button>`
      : i.grupo === "baixado" ? "" : `<button type="button" class="ap-mini ap-mini-ok" data-ap-act="final" ${d} title="Marcar esta nota como finalizada (conta como baixada)">✓ Finalizar</button>`;
    return `<div class="ap-nf-acts">${fin}<button type="button" class="ap-mini" data-ap-act="oculta" ${d} title="Esconde a nota de tudo, como se não existisse (dá para restaurar)">Ocultar</button></div>`;
  };

  function renderDetalhe(A){
    const box = document.getElementById("apDetalhe"); if(!box) return;
    const lista = filtraItens(A);
    if(!lista.length){ box.innerHTML = `<div class="empty">Nenhuma nota para esse filtro.${A.sheet.linhas.length ? "" : " Importe a planilha do SSW acima."}</div>`; return; }
    const cab = ["Situação / prazo / ações", "Pacote", "CTRC/SUBCON", "Emissão", "Remetente", "Destinatário", "Praça", "Cidade destino", "Km", "NF", "Cód. ocorrência", "Prev. entrega", "Entrega realizada", "Atraso", "CTRC origem", "Emissão origem", "Divergência", "Último romaneio", "Emissão últ. romaneio", "Placa"];
    box.innerHTML = `<div class="ap-count">${lista.length} nota(s)</div><table class="ap-table ap-notas"><thead><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${lista.map(i => {
      const r = i.r;
      if(!r) return `<tr class="ap-row-gray"><td>${i.oculta ? `<span class="ap-tag">oculta</span> ` : ""}<span class="ap-pill ap-gray">${e(i.texto)}</span>${acoesNf(i)}</td><td>${e(i.pacote)}</td><td>—</td><td>—</td><td>—</td><td>${e(i.cliente)}</td><td class="c">—</td><td>—</td><td class="c">—</td><td><strong>${e(i.nf)}</strong></td><td colspan="10" class="ap-nodata">Sem dados na planilha do SSW</td></tr>`;
      const atr = i.atrasoPrev ? `<span class="ap-pill ap-red">${i.atrasoPrev} ${plural(i.atrasoPrev, "dia", "dias")}</span>` : (i.grupo === "baixado" ? `<span class="ap-t-green">no prazo</span>` : "—");
      const div = i.divergDias === null ? "—" : `<span class="ap-pill ap-amber" title="Emissão nossa ${br(r.emis)} × emissão origem ${br(r.emisOrig)}">${i.divergDias > 0 ? "+" : ""}${i.divergDias}d</span>`;
      return `<tr class="ap-row-${nivelCls(i.nivel)}">
        <td>${i.oculta ? `<span class="ap-tag">oculta</span> ` : ""}<span class="ap-pill ap-${nivelCls(i.nivel)}">${e(i.texto)}</span>${acoesNf(i)}</td>
        <td>${e(i.pacote)}</td><td class="nowrap">${e(r.k)}</td><td>${br(r.emis)}</td>
        <td title="${e(r.rem)}">${e(r.rem)}</td><td title="${e(r.dest)}">${e(r.dest)}</td><td class="c"><strong>${e(r.praca)}</strong></td><td title="${e(r.cidade)}">${e(r.cidade)}</td><td class="c">${e(r.km)}</td>
        <td><strong>${e(r.nf)}</strong></td><td>${badgeCod(r)}</td>
        <td>${br(r.prev)}</td><td>${br(r.ent)}</td><td class="c">${atr}</td>
        <td class="nowrap">${e(r.ctrcOrig)}</td><td>${br(r.emisOrig)}</td><td class="c">${div}</td>
        <td class="nowrap">${e(r.romaneio) || "—"}</td><td>${br(r.emisRom)}</td><td>${e(r.placa) || "—"}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  /* ---------- exportação ---------- */
  async function exportaExcel(){
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregou (verifique a internet)."); return; }
    const A = analisa(), lista = filtraItens(A);
    if(!lista.length){ alert("Não há notas para exportar."); return; }
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Acompanhamento");
    const cab = ["Pacote", "Prazo (baixar até)", "Situação", "CTRC/SUBCON", "Emissão", "Nome remetente", "Nome destinatário", "Praça", "Cidade destino", "Distância km", "NF", "Cód. ult. ocorrência", "Última ocorrência", "Data prev. entrega", "Data entrega realizada", "Atraso (dias)", "Nº CTRC origem", "Emissão CTRC origem", "Emissão divergente", "Último romaneio", "Emissão últ. romaneio", "Placa"];
    ws.addRow(cab);
    const h = ws.getRow(1); h.font = {bold: true, color: {argb: "FFFFFFFF"}}; h.fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF1A211A"}};
    const cor = {red: "FFFDECEA", amber: "FFFFF4E0", green: "FFEAF7EE", gray: "FFF4F5F3"};
    lista.forEach(i => {
      const r = i.r || {};
      const row = ws.addRow([i.pacote, i.prazo ? br(i.prazo) : "", i.texto, r.k || "", r.emis ? br(r.emis) : "", r.rem || i.cliente || "", r.dest || "", r.praca || "", r.cidade || "", r.km || "", i.nf, r.cod || "", r.ocor || "", r.prev ? br(r.prev) : "", r.ent ? br(r.ent) : "", i.atrasoPrev || 0, r.ctrcOrig || "", r.emisOrig ? br(r.emisOrig) : "", i.divergDias === null ? "" : `${i.divergDias}d`, r.romaneio || "", r.emisRom ? br(r.emisRom) : "", r.placa || ""]);
      row.fill = {type: "pattern", pattern: "solid", fgColor: {argb: cor[nivelCls(i.nivel)]}};
    });
    ws.columns.forEach(c => { c.width = 18; }); ws.views = [{state: "frozen", ySplit: 1}]; ws.autoFilter = {from: "A1", to: {row: 1, column: cab.length}};
    const buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a = document.createElement("a"); a.href = url; a.download = `Acompanhamento_Pacotes_${hoje()}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }


  /* ---------- PDF DO PACOTE (separado por unidade) ----------
     Regras de leitura da planilha do SSW:
       PACOTE ARQ preenchido     => o faturamento JA FATUROU
       CAPA DE REMESSA preenchida => a filial ENVIOU o documento para a MTZ
       Capa SEM pacote           => a MTZ nao faturou (alerta)
       Sempre mostra se o documento esta baixado (ocorrencia 01/69, igual a tela)
       Documentos cuja ULTIMA OCORRENC = "CTRC EMITIDO PARA EFEITO DE FRETE/IMPOSTO" sao desconsiderados. */
  const vazio = s => !s || /^[\s0]*$/.test(String(s));
  const ehFreteImposto = r => !!r && (/EFEITO DE FRETE\s*\/?\s*IMPOSTO/i.test(r.ocor || "") || codNum(r.cod) === 93);
  function situacaoMtz(r){
    if(!r) return {txt: "Sem informação na planilha", cor: "gray", fat: false, capa: false};
    const fat = !vazio(r.pacoteArq), capa = !vazio(r.capa);
    if(fat && capa) return {txt: "Enviado e faturado", cor: "green", fat, capa};
    if(capa) return {txt: "Enviado à MTZ - NÃO faturou", cor: "red", fat, capa};
    if(fat) return {txt: "Faturado - sem capa de remessa", cor: "amber", fat, capa};
    return {txt: "Filial não enviou - não faturou", cor: "red", fat, capa};
  }
  function unidadeDoItem(i){
    if(i.r && i.r.praca) return i.r.praca;
    try{
      const reg = jget("tambasa_cidade_filial", null), cid = String(i.cidade || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
      if(reg && reg[cid]) return reg[cid];
    }catch(x){}
    return "SEM UNIDADE";
  }

  function dadosPacote(numPacote){
    const A = analisa(false), p = A.pacs.find(x => x.pacote === numPacote);
    if(!p){ alert("Pacote não encontrado."); return null; }
    if(!A.sheet.linhas.length){ alert("Importe a planilha do SSW (.sswweb / .csv) antes de exportar o pacote."); return null; }
    if(A.sheet.linhas.every(r => r.pacoteArq === undefined && r.capa === undefined)){
      alert("A planilha salva foi importada antes desta função e não guardou as colunas PACOTE ARQ e CAPA DE REMESSA.\n\nImporte a planilha do SSW novamente (botão \"Importar planilha\") e exporte de novo.");
      return null;
    }
    // desconsidera "CTRC emitido para efeito de frete/imposto"; agrupa por unidade
    const validos = p.itens.filter(i => !ehFreteImposto(i.r)), excl = p.itens.length - validos.length;
    const mapa = new Map();
    validos.forEach(i => { const u = unidadeDoItem(i); if(!mapa.has(u)) mapa.set(u, []); mapa.get(u).push({i, m: situacaoMtz(i.r)}); });
    const unidades = [...mapa.keys()].sort((a, b) => a === "SEM UNIDADE" ? 1 : b === "SEM UNIDADE" ? -1 : a.localeCompare(b));
    const resumo = lista => ({n: lista.length, baix: lista.filter(x => x.i.grupo === "baixado").length, fat: lista.filter(x => x.m.fat).length,
      capa: lista.filter(x => x.m.capa).length, capaSemPac: lista.filter(x => x.m.capa && !x.m.fat).length});
    const baixaTxt = i => i.nivel === "final" ? "Baixada (manual)" : i.grupo === "baixado" ? "Baixada " + String(i.r.cod).trim() + (i.r.ent ? " em " + brCurto(i.r.ent) : "")
      : i.r ? "A baixar - " + String(i.r.cod).trim() + " " + String(i.r.ocor || "").slice(0, 38) : "A baixar (sem dados)";
    return {p, mapa, unidades, excl, resumo, baixaTxt, sheet: A.sheet};
  }

  // PDF simples, so para controle: uma tabela, com uma faixa por unidade
  function exportaPdfPacote(numPacote){
    const D = dadosPacote(numPacote); if(!D) return;
    const J = window.jspdf && window.jspdf.jsPDF;
    if(!J){ alert("Biblioteca de PDF não carregou (verifique a internet)."); return; }
    const doc = new J({orientation: "landscape", unit: "mm", format: "a4"});
    if(typeof doc.autoTable !== "function"){ alert("Biblioteca de tabelas do PDF não carregou (verifique a internet)."); return; }
    const L = s => String(s == null ? "" : s).replace(/[–—]/g, "-").replace(/[^\u0000-ÿ]/g, "");
    const {p, mapa, unidades, excl, resumo, baixaTxt} = D;
    const tot = resumo([...mapa.values()].flat());
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(L(`Pacote ${p.pacote} - controle por unidade`), 10, 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
    doc.text(L(`Envio ${br(p.envio)} · baixar até ${br(p.prazo)} · ${tot.n} NFs · baixadas ${tot.baix} · faturadas ${tot.fat} · com capa ${tot.capa} · capa sem pacote ${tot.capaSemPac} · gerado ${new Date().toLocaleString("pt-BR")}` + (excl ? ` · ${excl} doc. de frete/imposto fora` : "")), 10, 17);
    const vermelho = [185, 28, 28], verde = [30, 110, 50];
    const body = [];
    unidades.forEach(u => {
      const lista = mapa.get(u), s = resumo(lista);
      body.push([{content: L(`${u}  -  ${s.n} NFs · baixadas ${s.baix} · faturadas ${s.fat} · com capa ${s.capa}` + (s.capaSemPac ? ` · CAPA SEM PACOTE ${s.capaSemPac}` : "")), colSpan: 7, styles: {fillColor: [225, 229, 225], fontStyle: "bold", textColor: [20, 20, 20]}}]);
      lista.forEach(({i, m}) => {
        const r = i.r;
        body.push([L(i.nf), L([(r && r.dest) || i.cliente, (r && r.cidade) || i.cidade].filter(Boolean).join(" - ")), L(r ? r.k : "-"), L(baixaTxt(i)),
          m.fat ? L(r.pacoteArq) : "NAO", m.capa ? L(r.capa) : "NAO", L(m.txt)]);
      });
    });
    doc.autoTable({
      head: [["NF", "Cliente - Cidade", "CTRC", "Baixa (01)", "Pacote ARQ (faturou)", "Capa de remessa (MTZ)", "Situacao"]],
      body, startY: 21, margin: {top: 10, left: 10, right: 10, bottom: 10}, theme: "plain", rowPageBreak: "avoid",
      styles: {font: "helvetica", fontSize: 7.5, cellPadding: 1.1, textColor: [30, 30, 30], lineColor: [215, 215, 215], lineWidth: {bottom: 0.15}},
      headStyles: {fillColor: [40, 48, 40], textColor: [255, 255, 255], fontStyle: "bold"},
      columnStyles: {0: {cellWidth: 20, fontStyle: "bold"}, 1: {cellWidth: "auto"}, 2: {cellWidth: 25}, 3: {cellWidth: 46}, 4: {cellWidth: 30}, 5: {cellWidth: 30}, 6: {cellWidth: 46}},
      didParseCell: d => {
        if(d.section !== "body" || d.cell.colSpan > 1) return;
        const t = String(d.cell.raw || ""), c = d.column.index;
        if(c === 3) d.cell.styles.textColor = /^Baixada/.test(t) ? verde : vermelho;
        if(c === 4 || c === 5) d.cell.styles.textColor = t === "NAO" ? vermelho : verde;
        if(c === 6) d.cell.styles.textColor = /^Enviado e faturado/.test(t) ? verde : vermelho;
      }
    });
    const n = doc.internal.getNumberOfPages(), PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    for(let k = 1; k <= n; k++){ doc.setPage(k); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130); doc.text(`${k}/${n}`, PW - 10, PH - 5, {align: "right"}); }
    const d = new Date();
    doc.save(`Pacote ${String(p.pacote).replace(/[\\/:*?"<>|]+/g, "-")} - ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}.pdf`);
  }

  // Excel do pacote: aba "Controle" (todas as notas, filtro por unidade) + aba "Resumo"
  async function exportaExcelPacote(numPacote){
    const D = dadosPacote(numPacote); if(!D) return;
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregou (verifique a internet)."); return; }
    const {p, mapa, unidades, resumo, baixaTxt} = D;
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Controle");
    const cab = ["Unidade", "NF", "Cliente", "Cidade", "CTRC/SUBCON", "Baixada (01/69)", "Baixa / ocorrência", "Pacote ARQ (faturou?)", "Capa de remessa (filial enviou?)", "Situação MTZ"];
    ws.addRow(cab);
    const h = ws.getRow(1); h.font = {bold: true, color: {argb: "FFFFFFFF"}}; h.fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF1A211A"}};
    const cor = {green: "FFEAF7EE", red: "FFFDECEA", amber: "FFFFF4E0", gray: "FFF4F5F3"};
    unidades.forEach(u => mapa.get(u).forEach(({i, m}) => {
      const r = i.r || {};
      const row = ws.addRow([u, i.nf, r.dest || i.cliente || "", r.cidade || i.cidade || "", r.k || "", i.grupo === "baixado" ? "SIM" : "NÃO", baixaTxt(i), m.fat ? r.pacoteArq : "NÃO", m.capa ? r.capa : "NÃO", m.txt]);
      row.getCell(10).fill = {type: "pattern", pattern: "solid", fgColor: {argb: cor[m.cor]}};
      if(i.grupo !== "baixado") row.getCell(6).font = {color: {argb: "FFB91C1C"}, bold: true};
    }));
    [9, 12, 38, 22, 16, 14, 40, 22, 26, 32].forEach((w, k) => { ws.getColumn(k + 1).width = w; });
    ws.views = [{state: "frozen", ySplit: 1}]; ws.autoFilter = {from: "A1", to: {row: 1, column: cab.length}};
    const w2 = wb.addWorksheet("Resumo");
    w2.addRow(["Unidade", "NFs", "Baixadas", "A baixar", "Faturadas", "Não faturadas", "Com capa", "Sem capa", "Capa sem pacote"]);
    w2.getRow(1).font = {bold: true};
    const linhaRes = (nome, lista) => { const s = resumo(lista); return [nome, s.n, s.baix, s.n - s.baix, s.fat, s.n - s.fat, s.capa, s.n - s.capa, s.capaSemPac]; };
    unidades.forEach(u => w2.addRow(linhaRes(u, mapa.get(u))));
    w2.addRow(linhaRes("TOTAL", [...mapa.values()].flat())).font = {bold: true};
    w2.columns.forEach(c => { c.width = 16; });
    w2.addRow([]); w2.addRow([`Pacote ${p.pacote} · envio ${br(p.envio)} · baixar até ${br(p.prazo)}${D.excl ? ` · ${D.excl} doc. de frete/imposto desconsiderado(s)` : ""}`]);
    const buf = await wb.xlsx.writeBuffer(), url = URL.createObjectURL(new Blob([buf], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a = document.createElement("a"); a.href = url; a.download = `Pacote ${p.pacote} - controle ${hoje()}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- ARQUIVO DE PACOTES + BUSCA POR NF (nada é apagado: pacote arquivado continua pesquisável) ---------- */
  window.acompArquivoHTML = function(){
    return `<div class="ap-root" id="apArq">
      <p class="section-desc">Aqui fica o <strong>banco de notas</strong>: todo pacote que você arquivou (e os que ainda estão em acompanhamento). Digite uma <strong>NF</strong> — mesmo antiga — e o sistema mostra a qual <strong>pacote</strong> ela pertence, a data de envio e a situação.</p>
      <div class="panel"><div class="panel-header">Pesquisar nota fiscal</div>
        <div class="toolbar"><label class="check-inline">Buscar: <input type="text" class="small-input" id="apArqBusca" placeholder="NF, nº do pacote, cliente, cidade, CTRC..." style="width:300px;" autocomplete="off"></label>
        <span class="ap-count" id="apArqInfo"></span></div>
        <div class="table-wrap" id="apArqRes"></div></div>
      <div class="panel"><div class="panel-header">Pacotes arquivados</div><div class="table-wrap" id="apArqLista"></div></div>
    </div>`;
  };

  function renderArquivo(){
    const res = document.getElementById("apArqRes"), lista = document.getElementById("apArqLista"); if(!res || !lista) return;
    const at = analisa(false), ar = analisa(true), todos = [...at.pacs, ...ar.pacs];
    const info = document.getElementById("apArqInfo");
    const nTot = todos.reduce((n, p) => n + p.itens.length + p.ocultas.length, 0);
    if(info) info.textContent = `Banco: ${nTot} nota(s) em ${todos.length} pacote(s) (${ar.pacs.length} arquivado(s)).`;
    const q = String(st.arqBusca || "").trim().toLowerCase(), qd = nfKey(q);
    if(!q) res.innerHTML = `<div class="empty">Digite uma NF (ou parte dela) para descobrir em qual pacote ela está.</div>`;
    else{
      const rows = [];
      todos.forEach(p => [...p.itens, ...p.ocultas].forEach(i => {
        const r = i.r, txt = [i.pacote, i.cliente, i.cidade, r && [r.k, r.dest, r.cidade, r.placa, r.ctrcOrig].join(" ")].join(" ").toLowerCase();
        if((qd && i.nf.includes(qd)) || txt.includes(q)) rows.push({p, i});
      }));
      rows.sort((a, b) => (b.p.envio || "").localeCompare(a.p.envio || "") || a.i.nf.localeCompare(b.i.nf));
      res.innerHTML = !rows.length ? `<div class="empty">Nenhuma nota encontrada para "${e(q)}".</div>`
        : `<div class="ap-count">${rows.length} resultado(s)${rows.length > 200 ? " (mostrando os 200 primeiros)" : ""}</div><table class="ap-table"><thead><tr><th>NF</th><th>Pacote</th><th>Pacote está</th><th>Envio</th><th>Baixar até</th><th>Cliente</th><th>Cidade</th><th>Situação da nota</th><th>CTRC</th><th>Ocorrência</th><th>Entrega realizada</th><th></th></tr></thead><tbody>${rows.slice(0, 200).map(({p, i}) => {
          const r = i.r;
          const onde = p.arq ? `<span class="ap-pill ap-gray">Arquivado${p.removidoEm ? " em " + br(p.removidoEm.slice(0, 10)) : ""}</span>` : `<span class="ap-pill ap-green">Em acompanhamento</span>`;
          const bt = p.arq ? `<button type="button" class="ap-mini ap-mini-ok" data-ap-arq-restaura="${e(p.pacote)}">Restaurar pacote</button>` : `<button type="button" class="ap-mini" data-ap-goto="${e(p.pacote)}" data-ap-goto-oculta="${i.oculta ? 1 : ""}">Abrir no acompanhamento</button>`;
          return `<tr><td><strong>${e(i.nf)}</strong></td><td><strong>${e(p.pacote)}</strong></td><td>${onde}</td><td>${br(p.envio)}</td><td>${br(p.prazo)}</td><td title="${e(i.cliente)}">${e((r && r.dest) || i.cliente || "—")}</td><td>${e((r && r.cidade) || i.cidade || "—")}</td>
            <td>${i.oculta ? `<span class="ap-tag">oculta</span> ` : ""}<span class="ap-pill ap-${nivelCls(i.nivel)}">${e(i.texto)}</span></td><td class="nowrap">${e(r ? r.k : "—")}</td><td>${r ? badgeCod(r) : "—"}</td><td>${r ? br(r.ent) : "—"}</td><td class="nowrap">${bt}</td></tr>`;
        }).join("")}</tbody></table>`;
    }
    lista.innerHTML = !ar.pacs.length ? `<div class="empty">Nenhum pacote arquivado ainda. Quando você clicar em "Arquivar pacote" no Acompanhamento, ele aparece aqui.</div>`
      : `<table class="ap-table"><thead><tr><th>Pacote</th><th>Envio</th><th class="c">NFs</th><th class="c">Baixadas</th><th>Arquivado em</th><th></th></tr></thead><tbody>${ar.pacs.slice().sort((a, b) => (b.removidoEm || "").localeCompare(a.removidoEm || "")).map(p => `<tr>
          <td><strong>${e(p.pacote)}</strong></td><td>${br(p.envio)}</td><td class="c">${p.res.total}${p.ocultas.length ? ` <small class="ap-nodata">(+${p.ocultas.length} oculta(s))</small>` : ""}</td><td class="c ap-t-green">${p.res.baixadas}</td>
          <td>${p.removidoEm ? br(p.removidoEm.slice(0, 10)) : "—"}</td>
          <td class="nowrap ap-acts"><button type="button" class="ap-mini ap-mini-ok" data-ap-arq-restaura="${e(p.pacote)}">Restaurar pacote</button>
          <button type="button" class="link-btn danger" data-ap-arq-apagar="${e(p.pacote)}">Apagar definitivamente</button></td></tr>`).join("")}</tbody></table>`;
  }

  /* ---------- eventos ---------- */
  const envioValido = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); const y = m ? +m[1] : 0; return !!m && y >= 2000 && y <= 2100 && !isNaN(Date.parse(v + "T00:00:00Z")); };
  function setNf(pacote, nf, patch){
    const c = jget(K_CFG, {}), p = c[pacote]; if(!p) return;
    p.nfs = (p.nfs || []).map(x => { const o = (x && typeof x === "object") ? x : {nf: x}; return nfKey(o.nf) === nf ? {...o, ...patch} : o; });
    jset(K_CFG, c);
  }
  // redesenha mantendo a posição da rolagem (a tabela de notas é longa)
  function redesenha(){
    const d = document.getElementById("apDetalhe"), t = d ? d.scrollTop : 0, y = window.scrollY;
    renderResumo();
    const d2 = document.getElementById("apDetalhe"); if(d2) d2.scrollTop = t; window.scrollTo(0, y);
  }
  function salvaCfg(pacote, patch){ const c = jget(K_CFG, {}); c[pacote] = {...(c[pacote] || {}), ...patch}; jset(K_CFG, c); }
  const mostraSub = s => {
    st.sub = s;
    document.querySelectorAll("#pacSubtabs .pg-subtab-btn").forEach(b => b.classList.toggle("active", b.dataset.pacSub === s));
    ["mapa", "acomp", "arq"].forEach(id => { const v = document.getElementById("pacSub-" + id); if(v) v.classList.toggle("active", id === s); });
    if(s === "acomp") renderResumo();
    if(s === "arq") renderArquivo();
  };

  window.__apParsePdf = lerPdfPacotes;
  window.acompPacotesRefresh = function(){ if(st.sub === "acomp") renderResumo(); else if(st.sub === "arq") renderArquivo(); };

  window.attachAcompPacotes = function(){
    const root = document.getElementById("sec-pacotes"); if(!root) return;
    root.addEventListener("click", async ev => {
      const sb = ev.target.closest("[data-pac-sub]"); if(sb){ mostraSub(sb.dataset.pacSub); return; }
      const b = ev.target.closest("button"); if(!b || !(root.querySelector("#apRoot").contains(b) || root.querySelector("#apArq").contains(b))) return;
      if(b.dataset.apAct){
        const {apPac: pac, apNf: nf} = b.dataset, a = b.dataset.apAct;
        if(a === "oculta") setNf(pac, nf, {oculta: true});
        else if(a === "restaura") setNf(pac, nf, {oculta: false});
        else if(a === "final") setNf(pac, nf, {final: true});
        else if(a === "desfaz") setNf(pac, nf, {final: false});
        redesenha(); return;
      }
      if(b.dataset.apArqRestaura !== undefined){ const c = jget(K_CFG, {}), n = b.dataset.apArqRestaura; if(c[n]){ c[n].removido = false; delete c[n].removidoEm; jset(K_CFG, c); } renderArquivo(); return; }
      if(b.dataset.apArqApagar !== undefined){ const n = b.dataset.apArqApagar; if(confirm(`Apagar DEFINITIVAMENTE o pacote ${n} e suas notas do banco? Depois disso a NF não será mais encontrada na busca.`)){ const c = jget(K_CFG, {}); delete c[n]; jset(K_CFG, c); renderArquivo(); } return; }
      if(b.dataset.apGoto !== undefined){ st.pacote = b.dataset.apGoto; st.situacao = b.dataset.apGotoOculta ? "ocultas" : "todas"; mostraSub("acomp"); const d = document.getElementById("apDetalhe"); if(d) d.scrollIntoView({behavior: "smooth", block: "start"}); return; }
      if(b.dataset.apVer !== undefined){ st.pacote = st.pacote === b.dataset.apVer ? "" : b.dataset.apVer; renderResumo(); document.getElementById("apDetalhe").scrollIntoView({behavior: "smooth", block: "start"}); }
      else if(b.dataset.apPdf !== undefined){ exportaPdfPacote(b.dataset.apPdf); }
      else if(b.dataset.apXls !== undefined){ exportaExcelPacote(b.dataset.apXls); }
      else if(b.dataset.apDel !== undefined){ if(confirm(`Arquivar o pacote ${b.dataset.apDel}?\n\nEle sai do acompanhamento e vai para a aba "Arquivo de pacotes" — nada é apagado e você ainda encontra qualquer NF dele pela busca.`)){ const c = jget(K_CFG, {}); if(c[b.dataset.apDel]){ c[b.dataset.apDel].removido = true; c[b.dataset.apDel].removidoEm = new Date().toISOString(); jset(K_CFG, c); } if(st.pacote === b.dataset.apDel) st.pacote = ""; renderResumo(); } }
      else if(b.id === "apExport") exportaExcel();
      else if(b.id === "apPrevAdd" || b.id === "apPrevAddTodos"){
        const v = document.getElementById("apPrevSel").value, todos = b.id === "apPrevAddTodos";
        const l = jget(K_PREV, []).filter(p => todos || String(p.pacote) === v);
        if(!l.length){ alert("Nenhum pacote em Entregas Previstas."); return; }
        const r = adicionaPacotes(l); document.getElementById("apPacStatus").textContent = `${r.pacotes} pacote(s) em acompanhamento (${r.notas} nota(s) nova(s)).`; renderResumo();
      }
      else if(b.id === "apLimparPlan"){ if(confirm("Remover a planilha do SSW importada? (os pacotes e prazos são mantidos)")){ LS.removeItem(K_SHEET); document.getElementById("apPlanStatus").dataset.msg = ""; renderResumo(); } }
    });
    root.addEventListener("focusout", ev => {
      const t = ev.target;
      if(!(t && t.dataset && t.dataset.apEnvio !== undefined)) return;
      if(!envioValido(t.value) && t.value === "" && !t.validity.badInput) salvaCfg(t.dataset.apEnvio, {envio: "", envioManual: true}); // campo limpo de proposito
      delete t.dataset.apPend;
      setTimeout(renderResumo, 0); // atualiza prazos/situacao; se a data ficou incompleta, volta a ultima valida
    });
    root.addEventListener("keydown", ev => {
      const t = ev.target;
      if(ev.key === "Enter" && t && t.dataset && t.dataset.apEnvio !== undefined) t.blur();
    });
    root.addEventListener("change", ev => {
      const t = ev.target;
      if(t.dataset && t.dataset.apEnvio !== undefined){
        // NAO redesenha a tela enquanto a data e digitada (o campo perdia o foco a cada segmento e a data saia errada).
        // So grava quando a data esta completa e valida; a tela atualiza ao sair do campo (ou Enter).
        if(envioValido(t.value)){
          salvaCfg(t.dataset.apEnvio, {envio: t.value, envioManual: true});
          const tr = t.closest("tr"), td = tr && tr.children[3], dI = tr && tr.querySelector("[data-ap-dias]");
          if(td) td.innerHTML = `<strong>${br(add(t.value, Number(dI && dI.value) || DIAS_PRAZO))}</strong>`;
          t.dataset.apPend = "1";
        }
      }
      else if(t.dataset && t.dataset.apDias !== undefined){ salvaCfg(t.dataset.apDias, {dias: Math.max(1, Number(t.value) || DIAS_PRAZO)}); renderResumo(); }
    });
    document.getElementById("apArqBusca").addEventListener("input", ev => { st.arqBusca = ev.target.value; renderArquivo(); });
    document.getElementById("apFormPlan").addEventListener("submit", async ev => {
      ev.preventDefault();
      const files = [...document.getElementById("apPlanInput").files], stEl = document.getElementById("apPlanStatus");
      if(!files.length){ stEl.dataset.msg = ""; stEl.textContent = "Selecione o arquivo da planilha."; return; }
      const msgs = [];
      try{
        for(const f of files){
          const texto = new TextDecoder("windows-1252").decode(await f.arrayBuffer());
          const p = parsePlanilha(texto), r = importaPlanilha(p, f.name);
          msgs.push(`${f.name}: ${p.lidas} CTRC(s) lidos, ${p.linhas.length} do remetente Tambasa (${r.novas} novo(s), ${r.atualizadas} atualizado(s)), ${p.ignoradas} de outros remetentes ignorado(s).`);
        }
        document.getElementById("apPlanInput").value = "";
        stEl.dataset.msg = "1"; stEl.innerHTML = msgs.map(e).join("<br>");
      }catch(err){ stEl.dataset.msg = "1"; stEl.textContent = "Não foi possível ler a planilha: " + (err.message || err); }
      renderResumo();
    });
    document.getElementById("apFormPac").addEventListener("submit", async ev => {
      ev.preventDefault();
      const files = [...document.getElementById("apPacPdf").files], stEl = document.getElementById("apPacStatus");
      if(!files.length){ stEl.textContent = "Selecione o PDF."; return; }
      if(typeof extractPdfText !== "function"){ stEl.textContent = "Leitor de PDF indisponível."; return; }
      stEl.textContent = "Lendo o PDF..."; const msgs = [];
      try{
        for(const f of files){
          const parsed = lerPdfPacotes(await extractPdfText(f), f.name), r = adicionaPacotes(parsed.pacotes.map(p => ({...p, rota: parsed.rota || p.rota, dataRota: parsed.dataRota || p.dataRota})));
          msgs.push(`${f.name}: rota ${parsed.rota || "-"} — ${parsed.pacotes.length} entrega(s) lida(s), ${r.pacotes} pacote(s), ${r.notas} nota(s) nova(s).`);
        }
        document.getElementById("apPacPdf").value = ""; stEl.innerHTML = msgs.map(e).join("<br>");
      }catch(err){ stEl.textContent = "Não foi possível ler o PDF: " + (err.message || err); }
      renderResumo();
    });
    document.getElementById("apFormMan").addEventListener("submit", ev => {
      ev.preventDefault();
      const n = document.getElementById("apPacNum").value.trim(), envio = document.getElementById("apPacEnvio").value;
      const nfs = (document.getElementById("apPacNfs").value.match(/\d{3,}/g) || []);
      if(!n || !nfs.length){ alert("Informe o número do pacote e ao menos uma nota fiscal."); return; }
      const c = jget(K_CFG, {}), ant = c[n] || {nfs: []};
      c[n] = {...ant, envio: envio || ant.envio || "", envioManual: envio ? true : !!ant.envioManual, dias: ant.dias || DIAS_PRAZO, nfs: [...ant.nfs, ...nfs.filter(x => !ant.nfs.some(y => (y.nf || y) === nfKey(x))).map(x => ({nf: nfKey(x)}))]}; jset(K_CFG, c);
      ev.target.reset(); st.pacote = n; renderResumo();
    });
    renderResumo();
  };
})();
