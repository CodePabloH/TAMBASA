/* ================= DASHBOARD DE ENTREGAS (SSW) — sub-aba de "Controle de Entregas" =================
   Importa a planilha do SSW (.sswweb / .csv) e mostra a situação das entregas:
   entregues, em rota, paradas na filial, fora de rota, atrasadas e previstas para hoje (com volumes).
   Regras:
   - Remetente TAMBASA = CNPJ 17359233000188 / 17359233000935 ou nome "TEC E ARM MIGUEL BARTOLOMEU" /
     "TECIDOS E ARMARINHOS MIGUEL BA" — tudo junto. Os demais remetentes são juntados quando têm o MESMO NOME
     (ignorando pontuação) ou a MESMA RAIZ DE CNPJ (8 primeiros dígitos) com a primeira palavra do nome igual.
   - Baixa (entregue) = COD ULT OCORRENC 1, 69 ou 25. Cód. 93 é desconsiderado (marque "incluir 93" para ver).
   - Em rota = cód. 74. Parada na filial (sem seguir rota) = cód. 84. Outro código pendente = fora de rota.
   - Atrasada = não baixada com DATA PREV ENTREGA anterior a hoje. Prevista hoje = DATA PREV ENTREGA igual a hoje. */
(function(){
  "use strict";
  const K = "tambasa_prev_ssw", K_ACOES = "tambasa_prev_ssw_acoes", K_ANT = "tambasa_prev_ssw_anterior";
  const BAIXA = [1, 69, 25], IGNORA = [93], POR_PAGINA = 50;
  const TAM_CNPJ = ["17359233000188", "17359233000935"];
  const RX_TAM = /^(TEC E ARM|TECIDOS E ARMARINHOS)\s+MIGUEL\s+BA/;
  const COD_NOME = {0: "Sem ocorrência registrada", 74: "Saída para entrega (em rota)", 84: "Chegada na unidade (parada na filial)",
    82: "Saída da unidade / em transferência", 1: "Entrega normal", 69: "Entrega com ressalva", 25: "Baixa (cód. 25)", 93: "CTRC emitido p/ frete (ignorado)"};
  const COR = {entregue: "#3b8a1f", rota: "#2f78b8", parada: "#b57508", fora: "#9aa596"};

  const e = s => (typeof escHtml === "function") ? escHtml(s == null ? "" : s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const jget = (k, d) => { try{ const r = LS.getItem(k); return r ? JSON.parse(r) : d; }catch(x){ return d; } };
  const jset = (k, v) => LS.setItem(k, JSON.stringify(v));
  const pad = n => String(n).padStart(2, "0");
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const dd = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
  const br = iso => { if(!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const brCurto = iso => { if(!iso) return "—"; const [, m, d] = iso.split("-"); return `${d}/${m}`; };
  const parseBR = s => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if(!m) return ""; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2]}-${m[1]}`; };
  const dig = s => String(s || "").replace(/\D/g, "");
  const norm = s => String(s == null ? "" : s).replace(/ /g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const fmt = n => Number(n || 0).toLocaleString("pt-BR");
  const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "0%";
  const plural = (n, s, p) => n === 1 ? s : p;
  const FILTROS_LIMPOS = () => ({rem: ["TAMBASA"], pagador: [], un: [], oc: [], rota: "", baixa: "", prev: "", busca: "", inc93: false, vista: "todas", pg: 1, kpi: "", sem: "", acomp: "", mov: "", sort: {k: "prio", d: 1}, exp: "", pacote: []});
  let AC = {}, HOJE = "";                               // AC = acompanhamento (cobranças) por CTRC; HOJE = data de referência
  let st = {...FILTROS_LIMPOS(), open: ""};

  /* ---------- leitura da planilha do SSW ---------- */
  function parse(texto){
    const linhas = String(texto || "").replace(/�/g, " ").split(/\r?\n/);
    const iH = linhas.findIndex(l => l.startsWith("1;") && l.includes("CTRC/SUBCON"));
    if(iH < 0) throw new Error("Cabeçalho não encontrado (precisa da coluna CTRC/SUBCON).");
    const ix = {};
    linhas[iH].split(";").forEach((n, i) => { n = norm(n); if(n && !(n in ix)) ix[n] = i; });
    const falta = ["CTRC/SUBCON", "CNPJ REMETENTE", "COD ULT OCORRENC"].filter(c => !(c in ix));
    if(falta.length) throw new Error("Faltam colunas na planilha: " + falta.join(", "));
    const out = [];
    linhas.slice(iH + 1).forEach(l => {
      const c = l.split(";");
      if(c.length < 20 || c[0].trim() !== "3") return;
      const g = n => (n in ix && c[ix[n]] != null) ? c[ix[n]].replace(/ /g, " ").trim() : "";
      const ctrc = g("CTRC/SUBCON"); if(!ctrc) return;
      const cod = parseInt(g("COD ULT OCORRENC"), 10), pagNome = g("NOME PAGADOR").replace(/GOYAS/g, "GOIAS");
      out.push({
        ctrc, cnpj: dig(g("CNPJ REMETENTE")), remOrig: g("NOME REMETENTE"),
        pag: norm(pagNome) || dig(g("CNPJ PAGADOR")), pagNome,
        dest: g("NOME DESTINATARIO"), praca: g("PRACA").toUpperCase(), un: g("PRACA").slice(0, 3).toUpperCase() || "—",
        cidade: g("CIDADE DESTINO"), nf: g("NFISCAL"), vol: parseInt(g("QTDE VOL"), 10) || 0,
        cod: isNaN(cod) ? 0 : cod, ocor: g("ULTIMA OCORRENC"), dataOcor: parseBR(g("DATA ULT OCOR")),
        prev: parseBR(g("DATA PREV ENTREGA")), ent: parseBR(g("DATA ENTREGA REALIZADA")), atrasoArq: g("ATRASO"),
        local: g("LOCALIZACAO ATUAL"), emissao: parseBR(g("EMISSAO")),
        endereco: g("ENDERECO ENTREGA"), cidadeEnt: g("CIDADE ENTREGA"), agendada: parseBR(g("DATA ENTREGA AGENDADA")), recebido: g("RECEBIDO POR"),
        romaneio: g("ULTIMO ROMANEIO"), placa: g("PLACA"), valor: g("VAL.MERCADORIA"), demais: g("DEMAIS NOTAS FISCAIS"), pend: g("DESCRICAO ULT PEND")
      });
    });
    const per = (linhas[0].match(/PERIODO:\s*([^;]+)/i) || [])[1] || "";
    return {linhas: out, periodo: per.trim()};
  }

  /* ---------- junta remetentes: mesmo nome (sem pontuação) ou mesma raiz de CNPJ + 1ª palavra igual ---------- */
  const nomeChave = n => norm(n).replace(/[.,\-\/&]/g, " ").replace(/\b(LTDA|EIRELI|EPP|ME)\b/g, " ").replace(/\s+/g, " ").trim();
  function agrupaRemetentes(linhas){
    const pai = new Map();
    const find = x => { while(pai.get(x) !== x){ pai.set(x, pai.get(pai.get(x))); x = pai.get(x); } return x; };
    const une = (a, b) => { if(!pai.has(a)) pai.set(a, a); if(!pai.has(b)) pai.set(b, b); pai.set(find(a), find(b)); };
    linhas.forEach(r => {
      if(r.tam) return;
      const nk = "N:" + nomeChave(r.remOrig), prim = nomeChave(r.remOrig).split(" ")[0];
      une(nk, nk);
      if(r.cnpj.length === 14) une(nk, "R:" + r.cnpj.slice(0, 8) + ":" + prim);
    });
    const nomes = new Map();                                   // grupo -> contagem por grafia (para escolher o nome exibido)
    linhas.forEach(r => {
      if(r.tam){ r.rem = "TAMBASA"; r.remNome = "TAMBASA (Miguel Bartolomeu)"; return; }
      const g = find("N:" + nomeChave(r.remOrig)); r.rem = g;
      const m = nomes.get(g) || nomes.set(g, new Map()).get(g); m.set(r.remOrig, (m.get(r.remOrig) || 0) + 1);
    });
    linhas.forEach(r => { if(!r.tam){ const m = nomes.get(r.rem); r.remNome = [...m].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0]; } });
  }

  /* ---------- classificação ---------- */
  function classifica(r, h){
    const baixa = BAIXA.includes(r.cod);
    const rota = baixa ? "entregue" : r.cod === 74 ? "rota" : r.cod === 84 ? "parada" : "outra";
    let prazo = "ok", dias = 0;
    if(!baixa){
      if(!r.prev) prazo = "sem";
      else { dias = dd(r.prev, h); prazo = dias > 0 ? "atraso" : dias === 0 ? "hoje" : "prazo"; }
    }
    const diasUn = (rota === "parada" && r.dataOcor) ? Math.max(0, dd(r.dataOcor, h)) : 0;
    const diasMov = (!baixa && r.dataOcor) ? Math.max(0, dd(r.dataOcor, h)) : null;      // dias sem movimento (pendentes)
    const noPrazo = (baixa && r.ent && r.prev) ? r.ent <= r.prev : null;                  // entregue dentro do prazo?
    return {...r, baixa, rota, prazo, dias: Math.max(0, dias), diasUn, diasMov, noPrazo};
  }
  const codLabel = r => { const n = COD_NOME[r.cod]; return (n || (r.ocor ? r.ocor.charAt(0) + r.ocor.slice(1).toLowerCase() : "Ocorrência")).slice(0, 70); };
  const fora = r => !r.baixa && r.rota !== "rota";                      // "não está em rota" = pendente que não é 74

  let cache = null;
  function movDe(r, mapa){
    if(!mapa) return "";
    const p = mapa[r.ctrc]; if(p === undefined) return "nova"; if(p === r.cod) return "";
    if(r.baixa && !BAIXA.includes(p)) return "baixou"; if(r.cod === 74) return "rota"; if(r.cod === 84) return "parada"; return "mudou";
  }
  function dados(){
    const h = hoje(), db = jget(K, {linhas: []}), ant = jget(K_ANT, null), chave = (db.importadoEm || "") + h + (ant ? ant.em : "");
    if(cache && cache.chave === chave) return cache;
    const linhas = (db.linhas || []).map(r => ({...r, tam: TAM_CNPJ.includes(r.cnpj) || RX_TAM.test(norm(r.remOrig))}));
    agrupaRemetentes(linhas);
    return cache = {chave, db, h, ant, todas: linhas.map(r => { const c = classifica(r, h); c.mov = movDe(c, ant && ant.mapa); return c; })};
  }
  /* ---------- vínculo com os PACOTES (pela nota fiscal) ----------
     Lê os pacotes que já estão no painel: "Acompanhamento de Pacotes" (aba Pacotes) e "Entregas Previstas" (Mapa de Entrega).
     A NF do CTRC (e as "demais notas fiscais") é cruzada com as NFs de cada pacote. Só leitura: nada é alterado nessas abas. */
  const nfKey = x => dig(x).replace(/^0+/, "");
  let PM = new Map();                                                  // NF -> [{pacote, envio, prazo, arq}]
  function montaPacotes(){
    const m = new Map(), add = (nf, o) => { const k = nfKey(nf); if(!k) return; const l = m.get(k) || m.set(k, []).get(k); if(!l.some(x => x.pacote === o.pacote)) l.push(o); };
    const cfg = jget("tambasa_acomp_pacotes", {});
    Object.entries(cfg).forEach(([n, c]) => {
      const dias = Number(c.dias) || 6, prazo = c.envio ? new Date(Date.parse(c.envio + "T00:00:00Z") + dias * 864e5).toISOString().slice(0, 10) : "";
      (c.nfs || []).forEach(x => add(x.nf || x, {pacote: n, envio: c.envio || "", prazo, arq: !!c.removido}));
    });
    jget("tambasa_previstas", []).forEach(p => add(p.nf, {pacote: String(p.pacote), envio: p.dataRota || "", prazo: "", arq: false, rel: p.relnum || ""}));
    PM = m;
  }
  const pacOf = r => {
    const ks = [nfKey(r.nf), ...((r.demais || "").match(/\d{4,}/g) || []).map(nfKey)], out = [];
    ks.forEach(k => (PM.get(k) || []).forEach(o => { if(!out.some(x => x.pacote === o.pacote)) out.push(o); }));
    return out;
  };
  // acompanhamento (cobrança) de cada CTRC — fica salvo entre importações
  const aco = r => AC[r.ctrc] || {};
  const aCobrar = r => !r.baixa && (r.prazo === "atraso" || r.rota === "parada") && !aco(r).s;
  const cobrado = r => !!aco(r).s;
  const vencido = r => { const a = aco(r); return !r.baixa && !!a.ret && a.ret < HOJE && a.s !== "resolvido"; };
  const sel = (arr, v) => !arr.length || arr.includes(v);
  const passaPacote = r => { if(!st.pacote.length) return true; const p = pacOf(r); return p.length ? p.some(o => st.pacote.includes(o.pacote)) : st.pacote.includes("_none"); };
  function base(todas){            // escopo dos números (sem rota/baixa/previsão, para o painel mostrar a divisão)
    const q = norm(st.busca);
    return todas.filter(r =>
      (st.inc93 || !IGNORA.includes(r.cod)) && sel(st.rem, r.rem) && sel(st.pagador, r.pag) && sel(st.un, r.un) && sel(st.oc, String(r.cod)) && passaPacote(r) &&
      (!q || norm([r.ctrc, r.nf, r.dest, r.remOrig, r.cidade, r.cidadeEnt, r.placa, r.romaneio, pacOf(r).map(o => o.pacote).join(" ")].join(" ")).includes(q)));
  }
  function tabela(b){
    return b.filter(r =>
      (!st.rota || (st.rota === "nrota" ? fora(r) : r.rota === st.rota)) &&
      (!st.baixa || (st.baixa === "baixadas" ? r.baixa : !r.baixa)) &&
      (!st.prev || r.prazo === st.prev) &&
      (!st.sem || (!r.baixa && r.diasMov != null && r.diasMov >= Number(st.sem))) &&
      (!st.acomp || (st.acomp === "acobrar" ? aCobrar(r) : st.acomp === "cobrados" ? cobrado(r) : vencido(r))) &&
      (!st.mov || r.mov === st.mov) &&
      (st.vista !== "atencao" || r.prazo === "atraso" || r.prazo === "hoje" || r.rota === "parada"));
  }
  const soma = l => l.reduce((s, r) => s + r.vol, 0);

  /* ---------- tela ---------- */
  window.pvSswHTML = function(){
    return `
    <div class="panel" data-bi-deco="1"><div class="panel-header">Importar planilha do SSW (.sswweb / .csv)</div>
      <form class="add-form" id="sswForm">
        <div class="field"><label>Escolha o arquivo — ele é lido na hora</label><input type="file" id="sswArq" accept=".csv,.sswweb,.txt,text/plain"></div>
        <div class="field" style="max-width:200px;"><button type="submit" class="btn btn-primary">Processar planilha</button></div>
      </form>
      <div class="footer-note" id="sswStatus"></div>
    </div>
    <div id="sswRoot" class="sw"></div>`;
  };

  // lista com caixas de marcar (várias opções), com contagem
  function multi(key, titulo, ops, marcados, todosTxt){
    const txt = !marcados.length ? todosTxt : marcados.length === 1 ? (ops.find(o => o.v === marcados[0]) || {t: marcados[0]}).t : `${marcados.length} selecionados`;
    return `<details class="sw-ms" data-k="${key}"${st.open === key ? " open" : ""}><summary><span class="sw-ms-t">${titulo}</span><span class="sw-ms-v">${e(txt)}</span></summary>
      <div class="sw-ms-p">${ops.map(o => `<label class="sw-ms-o"><input type="checkbox" data-sw-f="${key}" value="${e(o.v)}"${marcados.includes(o.v) ? " checked" : ""}><span>${e(o.t)}</span><em>${fmt(o.n)}</em></label>`).join("")}
        ${marcados.length ? `<button type="button" class="link-btn" data-sw-clr="${key}">Limpar seleção</button>` : ""}</div></details>`;
  }
  function conta(todas, campo, rotulo){
    const m = new Map();
    todas.forEach(r => { if(!st.inc93 && IGNORA.includes(r.cod)) return; const k = campo(r), o = m.get(k) || m.set(k, {v: k, t: rotulo(r), n: 0}).get(k); o.n++; });
    return [...m.values()];
  }
  function barraFiltros(todas, b){
    const rems = conta(todas, r => r.rem, r => r.remNome).sort((a, c) => (c.v === "TAMBASA") - (a.v === "TAMBASA") || c.n - a.n);
    const pags = conta(todas, r => r.pag, r => r.pagNome || r.pag).sort((a, c) => c.n - a.n);
    const uns = conta(todas, r => r.un, r => r.un).sort((a, c) => a.t.localeCompare(c.t));
    const ocs = conta(todas, r => String(r.cod), r => pad(r.cod) + " – " + codLabel(r)).sort((a, c) => Number(a.v) - Number(c.v));
    const pcs = new Map(); let semPac = 0;
    todas.forEach(r => { if(!st.inc93 && IGNORA.includes(r.cod)) return; const p = pacOf(r); if(!p.length){ semPac++; return; } p.forEach(o => { const x = pcs.get(o.pacote) || pcs.set(o.pacote, {v: o.pacote, t: "Pacote " + o.pacote + (o.envio ? " · envio " + brCurto(o.envio) : ""), n: 0, d: o.envio || ""}).get(o.pacote); x.n++; }); });
    const pacOps = [{v: "_none", t: "Sem pacote vinculado", n: semPac}, ...[...pcs.values()].sort((a, c) => c.d.localeCompare(a.d) || c.v.localeCompare(a.v))];
    const cnt = f => b.filter(f).length;
    const seg = (key, rot, ops) => `<div class="sw-seg-g"><span class="sw-lab">${rot}</span><div class="sw-seg">${ops.map(([v, t, n]) => `<button type="button" class="${st[key] === v ? "on" : ""}" data-sw-seg="${key}" data-v="${v}">${t}${n != null ? `<i>${fmt(n)}</i>` : ""}</button>`).join("")}</div></div>`;
    const ativos = (st.rem.length !== 1 || st.rem[0] !== "TAMBASA") || st.pagador.length || st.un.length || st.oc.length || st.rota || st.baixa || st.prev || st.busca || st.inc93 || st.sem || st.acomp || st.mov || st.pacote.length;
    return `<div class="sw-card sw-filtros">
      <div class="sw-f-row">
        ${multi("rem", "Remetente", rems, st.rem, "Todos")}
        ${multi("pagador", "Pagador", pags, st.pagador, "Todos")}
        ${multi("un", "Unidade", uns, st.un, "Todas")}
        ${multi("oc", "Ocorrência", ocs, st.oc, "Todas")}
        ${multi("pacote", "Pacote", pacOps, st.pacote, "Todos")}
        <label class="sw-busca"><span class="sw-lab">Buscar</span><input type="text" id="sswBusca" value="${e(st.busca)}" placeholder="CTRC, NF, destinatário, cidade, placa, romaneio..." autocomplete="off"></label>
      </div>
      <div class="sw-f-row">
        ${seg("rota", "Rota", [["", "Todas", null], ["rota", "Em rota", cnt(r => r.rota === "rota")], ["nrota", "Não em rota", cnt(fora)], ["parada", "Parada na filial", cnt(r => r.rota === "parada")]])}
        ${seg("baixa", "Baixa", [["", "Todas", null], ["baixadas", "Baixadas", cnt(r => r.baixa)], ["pendentes", "Não baixadas", cnt(r => !r.baixa)]])}
        ${seg("prev", "Previsão", [["", "Todas", null], ["atraso", "Atrasadas", cnt(r => r.prazo === "atraso")], ["hoje", "Hoje", cnt(r => r.prazo === "hoje")], ["prazo", "No prazo", cnt(r => r.prazo === "prazo")], ["sem", "Sem previsão", cnt(r => r.prazo === "sem")]])}
      </div>
      <div class="sw-f-row">
        ${seg("sem", "Sem movimento", [["", "Todos", null], ["2", "há 2+ dias", cnt(r => !r.baixa && r.diasMov != null && r.diasMov >= 2)], ["4", "há 4+ dias", cnt(r => !r.baixa && r.diasMov != null && r.diasMov >= 4)]])}
        ${seg("acomp", "Cobrança", [["", "Todas", null], ["acobrar", "A cobrar", cnt(aCobrar)], ["cobrados", "Já cobradas", cnt(cobrado)], ["vencido", "Retorno vencido", cnt(vencido)]])}
        <label class="sw-chk"><input type="checkbox" id="sswInc93"${st.inc93 ? " checked" : ""}> incluir cód. 93</label>
        ${ativos ? `<button type="button" class="link-btn sw-limpar" id="sswLimparF">Limpar filtros</button>` : ""}
      </div></div>`;
  }

  /* ---------- ordenação ---------- */
  const SIT = {parada: 0, rota: 1, outra: 2, entregue: 3};
  const CMP = {
    prio: (a, c) => (c.prazo === "atraso") - (a.prazo === "atraso") || c.dias - a.dias || (c.rota === "parada") - (a.rota === "parada") || (c.prazo === "hoje") - (a.prazo === "hoje") || (c.diasMov || 0) - (a.diasMov || 0) || a.un.localeCompare(c.un),
    ctrc: (a, c) => a.ctrc.localeCompare(c.ctrc), rem: (a, c) => a.remNome.localeCompare(c.remNome), dest: (a, c) => a.dest.localeCompare(c.dest), un: (a, c) => a.un.localeCompare(c.un),
    nf: (a, c) => (parseInt(a.nf, 10) || 0) - (parseInt(c.nf, 10) || 0), vol: (a, c) => a.vol - c.vol, cod: (a, c) => a.cod - c.cod,
    prev: (a, c) => (a.prev || "9999").localeCompare(c.prev || "9999"), mov: (a, c) => (a.diasMov == null ? -1 : a.diasMov) - (c.diasMov == null ? -1 : c.diasMov), sit: (a, c) => SIT[a.rota] - SIT[c.rota]
  };
  const ACOMP_TXT = {cobrado: "Cobrada da filial", retorno: "Aguardando retorno", cliente: "Com o cliente / agendando", resolvido: "Resolvida"};

  /* ---------- texto de cobrança (para colar no WhatsApp / e-mail) ---------- */
  function textoCobranca(todas, b, h, uni){
    const itens = b.filter(r => !r.baixa && (r.prazo === "atraso" || r.rota === "parada" || r.prazo === "hoje") && (!uni || r.un === uni)).sort(CMP.prio);
    const rotulo = st.rem.length === 1 ? ((todas.find(r => r.rem === st.rem[0]) || {}).remNome || "") : st.rem.length ? "Remetentes selecionados" : "Todos os remetentes";
    if(!itens.length) return `COBRANÇA ${uni ? uni + " — " : ""}${rotulo} — ${br(h)}\nNenhuma entrega atrasada, parada na filial ou prevista para hoje.`;
    const por = new Map(); itens.forEach(r => (por.get(r.un) || por.set(r.un, []).get(r.un)).push(r));
    const linha = r => {
      const info = r.prazo === "atraso" ? `prev ${brCurto(r.prev)} (${r.dias}d de atraso)` : r.rota === "parada" ? `PARADA na filial${r.diasUn ? " há " + r.diasUn + "d" : ""}${r.prev ? ", prev " + brCurto(r.prev) : ""}` : "prevista HOJE";
      const a = aco(r), nota = a.s ? ` [${ACOMP_TXT[a.s] || a.s}${a.ret ? " até " + brCurto(a.ret) : ""}]` : "";
      const pk = pacOf(r), pkt = pk.length ? " | pacote " + pk.map(o => o.pacote).join("/") : "";
      return `• ${r.ctrc} | NF ${r.nf}${pkt} | ${r.dest} | ${r.vol} vol | ${info}${nota}`;
    };
    return `COBRANÇA ${uni ? uni + " — " : ""}${rotulo} — ${br(h)}\n` + [...por].sort((a, c) => a[0].localeCompare(c[0])).map(([u, l]) =>
      `\n▶ ${u} — ${l.filter(r => r.prazo === "atraso").length} atrasada(s), ${l.filter(r => r.rota === "parada").length} parada(s) na filial, ${l.filter(r => r.prazo === "hoje").length} prevista(s) hoje\n` + l.map(linha).join("\n")).join("\n");
  }
  function copia(texto){
    const ok = () => toast("Copiado! Cole no WhatsApp ou e-mail."), falha = () => { const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); ok(); }catch(x){ toast("Não consegui copiar automaticamente."); } ta.remove(); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, falha); else falha();
  }
  function toast(msg){ const t = document.getElementById("sswToast"); if(!t) return; t.textContent = msg; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2800); }

  /* ---------- detalhe + acompanhamento de um CTRC ---------- */
  function detalhe(r, cols){
    const a = aco(r), campo = (l, v) => v ? `<div><span>${l}</span><b>${e(v)}</b></div>` : "";
    return `<tr class="sw-det"><td colspan="${cols}"><div class="sw-det-g">
      <div class="sw-det-c">
        ${campo("Destinatário", r.dest)}${campo("Endereço de entrega", [r.endereco, r.cidadeEnt].filter(Boolean).join(" — "))}${campo("Remetente", r.remOrig + (r.cnpj ? " · CNPJ " + r.cnpj : ""))}${campo("Pagador", r.pagNome)}
        ${campo("Valor da mercadoria", r.valor ? "R$ " + r.valor : "")}${campo("NF", r.nf + (r.demais ? " (+ " + r.demais + ")" : ""))}${campo("Volumes", String(r.vol))}${campo("Pacote(s)", pacOf(r).map(o => o.pacote + (o.envio ? " (envio " + br(o.envio) + (o.prazo ? ", prazo " + br(o.prazo) : "") + ")" : "") + (o.arq ? " — arquivado" : "")).join(" · "))}
      </div>
      <div class="sw-det-c">
        ${campo("Última ocorrência", `${pad(r.cod)} – ${r.ocor || COD_NOME[r.cod] || ""}${r.dataOcor ? " (" + br(r.dataOcor) + ")" : ""}`)}${campo("Localização atual", r.local)}${campo("Último romaneio / placa", [r.romaneio, r.placa].filter(Boolean).join(" · "))}
        ${campo("Emissão", r.emissao ? br(r.emissao) : "")}${campo("Previsão de entrega", r.prev ? br(r.prev) : "")}${campo("Entrega agendada", r.agendada ? br(r.agendada) : "")}
        ${campo("Entrega realizada", r.ent ? br(r.ent) + (r.noPrazo === true ? " — no prazo" : r.noPrazo === false ? " — fora do prazo" : "") : "")}${campo("Recebido por", r.recebido)}${campo("Pendência", r.pend)}
      </div>
      <div class="sw-det-f"><span class="sw-lab">Acompanhamento ${a.t ? `<small>— atualizado em ${e(new Date(a.t).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}))}</small>` : ""}</span>
        <select data-sw-as>${[["", "Sem ação"], ...Object.entries(ACOMP_TXT)].map(([v, t]) => `<option value="${v}"${(a.s || "") === v ? " selected" : ""}>${t}</option>`).join("")}</select>
        <label>Retorno até <input type="date" data-sw-ar value="${e(a.ret || "")}"></label>
        <textarea data-sw-an rows="3" placeholder="O que foi feito / combinado (quem falou, resposta da filial, motivo...)">${e(a.n || "")}</textarea>
        <div class="sw-det-b"><button type="button" class="btn btn-primary btn-sm" data-sw-save="${e(r.ctrc)}">Salvar</button><button type="button" class="link-btn" data-sw-close>Fechar</button></div>
      </div></div></td></tr>`;
  }

  function render(refazFiltros){
    const root = document.getElementById("sswRoot"); if(!root) return;
    AC = jget(K_ACOES, {}); montaPacotes();
    const {db, h, todas, ant} = dados(); HOJE = h;
    if(!todas.length){ root.innerHTML = `<div class="sw-card"><div class="empty">Importe a planilha do SSW para ver o dashboard de entregas.</div></div>`; return; }
    const b = base(todas);
    if(refazFiltros || !document.getElementById("sswFiltros")){
      root.innerHTML = `<div class="sw-top"><div><div class="sw-t1">Situação das entregas</div><div class="sw-t2">${e(db.arquivo || "")}${db.periodo ? " · período " + e(db.periodo) : ""} · hoje: <b>${br(h)}</b>${st.inc93 ? "" : " · cód. 93 desconsiderado"}</div></div>
        <div class="sw-top-a"><button type="button" class="btn btn-ghost btn-sm" id="sswCopiarTodas">Copiar cobrança</button><button type="button" class="btn btn-ghost btn-sm" id="sswExp">Exportar Excel</button><button type="button" class="link-btn danger" id="sswLimpar">Remover planilha</button></div></div>
        <div id="sswFiltros">${barraFiltros(todas, b)}</div><div id="sswOut"></div><div id="sswToast" class="sw-toast"></div>`;
    }else{
      const foco = document.activeElement && document.activeElement.id === "sswBusca";
      document.getElementById("sswFiltros").innerHTML = barraFiltros(todas, b);
      if(foco){ const i = document.getElementById("sswBusca"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }
    const n = f => b.filter(f);
    const entregue = n(r => r.baixa), rota = n(r => r.rota === "rota"), parada = n(r => r.rota === "parada"), outra = n(r => r.rota === "outra");
    const nrota = n(fora), atraso = n(r => r.prazo === "atraso"), hojeL = n(r => r.prazo === "hoje"), atrasoRota = atraso.filter(r => r.rota === "rota");
    const cobrar = n(aCobrar), venc = n(vencido), sem2 = n(r => !r.baixa && r.diasMov != null && r.diasMov >= 2);
    const T = b.length, comData = entregue.filter(r => r.noPrazo !== null), noPrazoN = comData.filter(r => r.noPrazo).length;

    const kpi = (k, cor, lab, l, extra) => `<button type="button" class="sw-k${st.kpi === k ? " sel" : ""}" data-sw-kpi="${k}" style="--c:${cor}"><span class="sw-k-l">${lab}</span><span class="sw-k-v">${fmt(l.length)}</span><span class="sw-k-s">${fmt(soma(l))} vol. · ${pct(l.length, T)}${extra ? " · " + extra : ""}</span></button>`;
    const seg = (cls, v) => v ? `<i class="${cls}" style="flex:${v}" title="${v}"></i>` : "";
    const leg = (cor, t, v) => `<span><b style="background:${cor}"></b>${t} <strong>${fmt(v)}</strong> <em>${pct(v, T)}</em></span>`;

    // por unidade
    const uns = new Map();
    b.forEach(r => { const u = uns.get(r.un) || uns.set(r.un, {un: r.un, tot: 0, ent: 0, rota: 0, parada: 0, outra: 0, atr: 0, hoje: 0, cob: 0, vol: 0}).get(r.un);
      u.tot++; u.vol += r.vol; u[r.rota === "entregue" ? "ent" : r.rota]++; if(r.prazo === "atraso") u.atr++; if(r.prazo === "hoje") u.hoje++; if(aCobrar(r)) u.cob++; });
    const un = [...uns.values()].sort((a, c) => c.tot - a.tot || a.un.localeCompare(c.un)), max = Math.max(...un.map(u => u.tot), 1);
    const uRow = u => `<button type="button" class="sw-u${st.un.length === 1 && st.un[0] === u.un ? " sel" : ""}" data-sw-un="${e(u.un)}">
      <span class="sw-u-n">${e(u.un)}</span>
      <span class="sw-u-bar"><span class="sw-stack" style="width:${(u.tot / max * 100).toFixed(1)}%">${seg("e", u.ent)}${seg("r", u.rota)}${seg("p", u.parada)}${seg("o", u.outra)}</span></span>
      <span class="sw-u-t"><strong>${fmt(u.tot)}</strong><small>${fmt(u.vol)} vol.</small></span>
      <span class="sw-u-c">${u.atr ? `<span class="sw-tag red">${u.atr} atras.</span>` : ""}${u.hoje ? `<span class="sw-tag amb">${u.hoje} hoje</span>` : ""}${u.parada ? `<span class="sw-tag amb">${u.parada} parada${u.parada > 1 ? "s" : ""}</span>` : ""}${u.cob ? `<span class="sw-tag dk">${u.cob} a cobrar</span>` : ""}</span>
      <span class="sw-cp" data-sw-cp="${e(u.un)}" title="Copiar a lista de cobrança desta unidade">Copiar</span></button>`;

    // por ocorrência
    const ocs = new Map();
    b.forEach(r => { const o = ocs.get(r.cod) || ocs.set(r.cod, {cod: r.cod, lab: codLabel(r), q: 0, vol: 0}).get(r.cod); o.q++; o.vol += r.vol; });
    const oc = [...ocs.values()].sort((a, c) => c.q - a.q), maxO = Math.max(...oc.map(o => o.q), 1);
    const oRow = o => `<button type="button" class="sw-o${st.oc.length === 1 && st.oc[0] === String(o.cod) ? " sel" : ""}" data-sw-oc="${o.cod}">
      <span class="sw-cod ${BAIXA.includes(o.cod) ? "ok" : o.cod === 74 ? "rt" : o.cod === 84 ? "wa" : ""}">${pad(o.cod)}</span><span class="sw-o-l">${e(o.lab)}</span>
      <span class="sw-o-bar"><i style="width:${(o.q / maxO * 100).toFixed(1)}%"></i></span><strong>${fmt(o.q)}</strong></button>`;

    // o que mudou desde a planilha anterior
    const mv = k => b.filter(r => r.mov === k).length;
    const mvBtn = (k, t) => `<button type="button" class="sw-mv${st.mov === k ? " on" : ""}" data-sw-mov="${k}"><strong>${fmt(mv(k))}</strong><span>${t}</span></button>`;
    const painelMov = ant ? `<div class="sw-card sw-mov"><div class="sw-h">O que mudou desde a planilha anterior <small>anterior importada em ${e(new Date(ant.em).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}))} · clique para filtrar</small></div>
      <div class="sw-mov-r">${mvBtn("nova", "novas na planilha")}${mvBtn("baixou", "foram entregues")}${mvBtn("rota", "saíram para rota")}${mvBtn("parada", "chegaram na filial (84)")}${mvBtn("mudou", "outras mudanças")}</div></div>` : "";

    // tabela (50 por página, clique na linha abre o detalhe/cobrança)
    const dir = st.sort.d, cmp = CMP[st.sort.k] || CMP.prio;
    const t = tabela(b).sort((a, c) => cmp(a, c) * dir);
    const paginas = Math.max(1, Math.ceil(t.length / POR_PAGINA)); st.pg = Math.min(Math.max(1, st.pg), paginas);
    const pagina = t.slice((st.pg - 1) * POR_PAGINA, st.pg * POR_PAGINA);
    const chipRota = r => r.rota === "rota" ? `<span class="sw-chip rt">Em rota</span>` : r.rota === "parada" ? `<span class="sw-chip wa">Parada na filial${r.diasUn ? " · " + r.diasUn + "d" : ""}</span>` : r.baixa ? `<span class="sw-chip ok">Entregue${r.noPrazo === false ? " c/ atraso" : ""}</span>` : `<span class="sw-chip fo">Fora de rota</span>`;
    const chipPrev = r => r.prazo === "atraso" ? `<span class="sw-chip rd">${r.dias} ${plural(r.dias, "dia", "dias")} atraso</span>` : r.prazo === "hoje" ? `<span class="sw-chip wa">Hoje</span>` : "";
    const chipPac = r => { const p = pacOf(r); return p.length ? `<span class="sw-chip pk" title="${e(p.map(o => "Pacote " + o.pacote + (o.envio ? " · envio " + br(o.envio) : "") + (o.prazo ? " · prazo " + br(o.prazo) : "")).join("\n"))}">${e(p[0].pacote)}${p.length > 1 ? " +" + (p.length - 1) : ""}</span>` : `<span class="sw-sempac">—</span>`; };
    const chipAco = r => { const a = aco(r); if(!a.s) return aCobrar(r) ? `<span class="sw-chip rd">A cobrar</span>` : ""; return `<span class="sw-chip ${vencido(r) ? "rd" : a.s === "resolvido" ? "ok" : "rt"}" title="${e(a.n || "")}">${vencido(r) ? "Retorno vencido" : ACOMP_TXT[a.s]}${a.n ? " 📝" : ""}</span>`; };
    const verRem = st.rem.length !== 1, nCols = verRem ? 12 : 11;       // com 1 remetente só, a coluna Remetente é redundante
    const th = (k, lab, cls) => `<th class="sw-sort${cls ? " " + cls : ""}${st.sort.k === k ? " on" : ""}" data-sw-sort="${k}">${lab}${st.sort.k === k ? (dir === 1 ? " ▲" : " ▼") : ""}</th>`;
    const linhaT = r => `<tr data-sw-row="${e(r.ctrc)}" class="sw-row ${st.exp === r.ctrc ? "open " : ""}${r.prazo === "atraso" ? "r-red" : r.prazo === "hoje" || r.rota === "parada" ? "r-amb" : ""}">
            <td class="nw"><strong>${e(r.ctrc)}</strong>${r.mov ? ` <span class="sw-new" title="Mudou desde a planilha anterior">●</span>` : ""}</td>${verRem ? `<td class="rem" title="${e(r.remOrig)}">${e(r.remNome)}</td>` : ""}<td class="dst" title="${e(r.dest)}">${e(r.dest)}</td><td class="c">${e(r.un)}</td><td class="nw">${e(r.nf)}</td><td class="nw">${chipPac(r)}</td><td class="c">${fmt(r.vol)}</td>
            <td class="oc"><span class="sw-cod ${r.baixa ? "ok" : r.cod === 74 ? "rt" : r.cod === 84 ? "wa" : ""}">${pad(r.cod)}</span> <span class="sw-oc" title="${e(r.ocor || COD_NOME[r.cod] || "")}">${e(r.ocor || COD_NOME[r.cod] || "")}</span></td>
            <td class="nw">${brCurto(r.prev)} ${chipPrev(r)}</td><td class="c nw">${r.diasMov == null ? "—" : r.diasMov === 0 ? "hoje" : r.diasMov + "d"}</td><td>${chipRota(r)}</td><td>${chipAco(r)}</td></tr>${st.exp === r.ctrc ? detalhe(r, nCols) : ""}`;

    document.getElementById("sswOut").innerHTML = `
      ${parada.length || atrasoRota.length || venc.length ? `<div class="sw-alerta"><b>Atenção:</b> ${[parada.length ? `${fmt(parada.length)} ${plural(parada.length, "entrega parada", "entregas paradas")} na filial sem seguir rota (cód. 84)` : "", atrasoRota.length ? `${fmt(atrasoRota.length)} em rota já ${plural(atrasoRota.length, "atrasada", "atrasadas")}` : "", venc.length ? `${fmt(venc.length)} com retorno da filial vencido` : ""].filter(Boolean).join(" · ")}.
        <button type="button" class="link-btn" data-sw-vista="atencao">Ver só o que precisa de atenção</button></div>` : ""}
      <div class="sw-hero sw-card">
        <div class="sw-hero-n"><span>Total de entregas</span><strong>${fmt(T)}</strong><small>${fmt(soma(b))} volumes</small></div>
        <div class="sw-hero-b"><div class="sw-hbar">${seg("e", entregue.length)}${seg("r", rota.length)}${seg("p", parada.length)}${seg("o", outra.length)}</div>
          <div class="sw-leg">${leg(COR.entregue, "Entregues", entregue.length)}${leg(COR.rota, "Em rota", rota.length)}${leg(COR.parada, "Paradas na filial", parada.length)}${leg(COR.fora, "Outras fora de rota", outra.length)}</div></div>
      </div>
      <div class="sw-kpis">
        ${kpi("rota", COR.rota, "Em rota", rota)}
        ${kpi("nrota", COR.parada, "Não estão em rota", nrota, `${fmt(parada.length)} paradas`)}
        ${kpi("entregue", COR.entregue, "Entregues", entregue, comData.length ? `${pct(noPrazoN, comData.length)} no prazo` : "")}
        ${kpi("atraso", "#cf3d35", "Atrasadas", atraso)}
        ${kpi("hoje", "#b57508", "Previstas hoje", hojeL)}
        ${kpi("sem2", "#6b4fa3", "Sem movimento 2+ dias", sem2)}
        ${kpi("acobrar", "#1c231c", "A cobrar (sem ação)", cobrar)}
      </div>
      ${painelMov}
      <div class="sw-cols">
        <div class="sw-card"><div class="sw-h">Por unidade <small>clique para filtrar · “Copiar” gera a cobrança</small></div><div class="sw-list">${un.map(uRow).join("")}</div></div>
        <div class="sw-card"><div class="sw-h">Por ocorrência <small>clique para filtrar</small></div><div class="sw-list">${oc.map(oRow).join("")}</div></div>
      </div>
      <div class="sw-card sw-tb">
        <div class="sw-h sw-h-tb"><span>Entregas <b class="sw-badge">${fmt(t.length)}</b> <small>${fmt(soma(t))} volumes · ${fmt(t.filter(r => pacOf(r).length).length)} com pacote vinculado · clique numa linha para ver tudo e registrar a cobrança${st.sort.k !== "prio" ? ` · <a href="#" class="link-btn" data-sw-sort="prio">voltar à ordem por prioridade</a>` : ""}</small></span>
          <div class="sw-seg"><button type="button" class="${st.vista === "todas" ? "on" : ""}" data-sw-vista="todas">Todas</button><button type="button" class="${st.vista === "atencao" ? "on" : ""}" data-sw-vista="atencao">Precisa de atenção</button></div></div>
        <div class="table-wrap"><table class="sw-tab"><thead><tr>${th("ctrc", "CTRC/SUBCON")}${verRem ? th("rem", "Remetente") : ""}${th("dest", "Destinatário")}${th("un", "Unid.", "c")}${th("nf", "NFiscal")}<th>Pacote</th>${th("vol", "Vol.", "c")}${th("cod", "Ocorrência")}${th("prev", "Prev. entrega")}${th("mov", "Sem mov.", "c")}${th("sit", "Situação")}<th>Cobrança</th></tr></thead><tbody>
          ${pagina.map(linhaT).join("") || `<tr><td colspan="${nCols}" class="empty">Nenhuma entrega com estes filtros.</td></tr>`}
        </tbody></table></div>
        ${paginas > 1 ? `<div class="sw-pg"><button type="button" class="btn btn-ghost btn-sm" data-sw-pg="-1"${st.pg === 1 ? " disabled" : ""}>‹ Anterior</button><span>Página ${st.pg} de ${paginas} · ${(st.pg - 1) * POR_PAGINA + 1}–${Math.min(st.pg * POR_PAGINA, t.length)} de ${fmt(t.length)}</span><button type="button" class="btn btn-ghost btn-sm" data-sw-pg="1"${st.pg === paginas ? " disabled" : ""}>Próxima ›</button></div>` : ""}
      </div>`;
  }

  /* ---------- exportação (Resumo por unidade + Entregas filtradas + A cobrar) ---------- */
  async function exporta(){
    if(typeof ExcelJS === "undefined"){ alert("Biblioteca de Excel não carregou (verifique a internet)."); return; }
    AC = jget(K_ACOES, {}); montaPacotes();
    const {h, todas} = dados(); HOJE = h;
    const b = base(todas), t = tabela(b).sort(CMP.prio);
    if(!t.length){ alert("Não há entregas para exportar."); return; }
    const wb = new ExcelJS.Workbook();
    const rotaTxt = r => r.rota === "rota" ? "Em rota" : r.rota === "parada" ? "Parada na filial" : r.baixa ? (r.noPrazo === false ? "Entregue c/ atraso" : "Entregue") : "Fora de rota";
    const prevTxt = r => ({atraso: "Atrasada", hoje: "Prevista hoje", prazo: "No prazo", sem: "Sem previsão", ok: "—"})[r.prazo];
    const estilo = ws => { const hd = ws.getRow(1); hd.font = {bold: true, color: {argb: "FFFFFFFF"}}; hd.fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF2D6A17"}}; ws.views = [{state: "frozen", ySplit: 1}]; };
    // 1) resumo por unidade
    const ws0 = wb.addWorksheet("Resumo por unidade");
    ws0.columns = [["Unidade", 10], ["Total", 9], ["Entregues", 11], ["Em rota", 9], ["Paradas na filial", 15], ["Fora de rota", 12], ["Atrasadas", 11], ["Previstas hoje", 13], ["A cobrar", 10], ["Volumes", 10]].map(([header, width]) => ({header, width}));
    const uns = new Map();
    b.forEach(r => { const u = uns.get(r.un) || uns.set(r.un, [r.un, 0, 0, 0, 0, 0, 0, 0, 0, 0]).get(r.un); u[1]++; if(r.baixa) u[2]++; else if(r.rota === "rota") u[3]++; else if(r.rota === "parada") u[4]++; else u[5]++; if(r.prazo === "atraso") u[6]++; if(r.prazo === "hoje") u[7]++; if(aCobrar(r)) u[8]++; u[9] += r.vol; });
    [...uns.values()].sort((a, c) => c[1] - a[1]).forEach(u => ws0.addRow(u));
    ws0.addRow(["TOTAL", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [...uns.values()].reduce((s, u) => s + u[i], 0))]).font = {bold: true};
    estilo(ws0);
    // 2) entregas (filtro atual) e 3) a cobrar
    const cols = [["CTRC/SUBCON", 16], ["Nome remetente", 32], ["CNPJ remetente", 18], ["Pagador", 30], ["Nome destinatário", 38], ["Endereço de entrega", 44], ["Cidade entrega", 20], ["Unidade", 9], ["Praça", 9], ["NFiscal", 12], ["Pacote", 14], ["Qtde vol", 9], ["Valor mercadoria", 15],
      ["Cód. ocorrência", 11], ["Última ocorrência", 46], ["Data últ. ocorrência", 14], ["Dias sem movimento", 12], ["Prev. entrega", 13], ["Dias de atraso", 11], ["Rota", 20], ["Previsão", 16], ["Entrega realizada", 14], ["Romaneio", 14], ["Placa", 10], ["Cobrança", 22], ["Retorno até", 12], ["Observação da cobrança", 50]];
    const linha = r => { const a = aco(r); return [r.ctrc, r.remNome, r.cnpj, r.pagNome, r.dest, r.endereco, r.cidadeEnt, r.un, r.praca, r.nf, pacOf(r).map(o => o.pacote).join(" / "), r.vol, r.valor, r.cod, r.ocor, r.dataOcor ? br(r.dataOcor) : "", r.diasMov == null ? "" : r.diasMov, br(r.prev), r.dias, rotaTxt(r), prevTxt(r), r.ent ? br(r.ent) : "", r.romaneio, r.placa, a.s ? ACOMP_TXT[a.s] : (aCobrar(r) ? "A COBRAR" : ""), a.ret ? br(a.ret) : "", a.n || ""]; };
    [["Entregas", t], ["A cobrar", b.filter(r => !r.baixa && (r.prazo === "atraso" || r.rota === "parada" || r.prazo === "hoje")).sort((a, c) => a.un.localeCompare(c.un) || CMP.prio(a, c))]].forEach(([nome, lista]) => {
      const ws = wb.addWorksheet(nome); ws.columns = cols.map(([header, width]) => ({header, width})); lista.forEach(r => ws.addRow(linha(r))); estilo(ws);
      ws.autoFilter = {from: "A1", to: String.fromCharCode(64 + cols.length) + "1"};
      ws.eachRow((row, i) => { if(i > 1 && row.getCell(21).value === "Atrasada") row.getCell(21).font = {bold: true, color: {argb: "FFCF3D35"}}; });
    });
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    a.download = `Entregas_SSW_${h}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- eventos ---------- */
  const lerArquivo = f => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => err(r.error || new Error("Falha ao ler o arquivo")); r.readAsText(f, "ISO-8859-1"); });
  const RESET = {rota: "", baixa: "", prev: "", sem: "", acomp: "", mov: ""};
  const KPI = {rota: {rota: "rota"}, nrota: {rota: "nrota"}, entregue: {baixa: "baixadas"}, atraso: {prev: "atraso"}, hoje: {prev: "hoje"}, sem2: {sem: "2"}, acobrar: {acomp: "acobrar"}};
  const mapaDe = linhas => Object.fromEntries((linhas || []).map(r => [r.ctrc, r.cod]));

  window.pvSswInit = function(){
    const sec = document.getElementById("sswForm"); if(!sec) return;
    const status = document.getElementById("sswStatus");
    function importa(texto, nome){
      const p = parse(texto);
      if(!p.linhas.length) return null;
      const velho = jget(K, {linhas: []}), novoMapa = mapaDe(p.linhas), velhoMapa = mapaDe(velho.linhas);
      const igual = Object.keys(novoMapa).length === Object.keys(velhoMapa).length && Object.keys(novoMapa).every(k => velhoMapa[k] === novoMapa[k]);
      if(velho.linhas && velho.linhas.length && !igual) jset(K_ANT, {em: velho.importadoEm || new Date().toISOString(), mapa: velhoMapa});   // guarda a planilha anterior para mostrar o que mudou
      jset(K, {importadoEm: new Date().toISOString(), arquivo: nome, periodo: p.periodo, linhas: p.linhas});   // a planilha do SSW é a foto atual: substitui a anterior
      cache = null;
      const rs = new Set(dados().todas.map(r => r.rem)), tam = p.linhas.filter(r => TAM_CNPJ.includes(r.cnpj) || RX_TAM.test(norm(r.remOrig))).length;
      status.textContent = `${p.linhas.length} CTRC(s) importados (${tam} da Tambasa, ${p.linhas.length - tam} de outros remetentes; ${rs.size} remetentes após juntar nomes iguais). As cobranças já registradas foram mantidas.`;
      st = {...FILTROS_LIMPOS(), open: ""}; render(true);
      return status.textContent;
    }
    // o importador antigo do Controle de Entregas chama isto quando recebe este modelo de planilha
    window.pvSswImportText = function(texto, nome){
      try{
        const msg = importa(texto, nome || "planilha SSW"); if(!msg) return null;
        const b = document.querySelector('#entSubtabs [data-ent-sub="ssw"]'); if(b) b.click();
        return msg;
      }catch(x){ return null; }
    };
    document.getElementById("sswArq").addEventListener("change", () => { if(document.getElementById("sswArq").files[0]) sec.requestSubmit(); });
    sec.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = document.getElementById("sswArq").files[0];
      if(!f){ status.textContent = "Selecione a planilha."; return; }
      try{
        if(importa(await lerArquivo(f), f.name)) document.getElementById("sswArq").value = "";
        else status.textContent = "Nenhuma linha de CTRC encontrada na planilha.";
      }catch(err){ status.textContent = "Não foi possível ler a planilha: " + (err.message || err); }
    });

    const r = document.getElementById("sec-entregas");
    const muda = (refaz = true) => { st.pg = 1; st.kpi = ""; st.exp = ""; render(refaz); };
    r.addEventListener("click", ev => {
      const t = ev.target;
      const sb = t.closest("[data-ent-sub]");
      if(sb){
        r.querySelectorAll("#entSubtabs .pg-subtab-btn").forEach(x => x.classList.toggle("active", x === sb));
        ["ssw", "controle"].forEach(id => { const v = document.getElementById("entSub-" + id); if(v) v.classList.toggle("active", id === sb.dataset.entSub); });
        return;
      }
      if(!t.closest("#sswRoot")) return;
      const sv = t.closest("[data-sw-save]");
      if(sv){                                         // salva o acompanhamento do CTRC
        const box = sv.closest(".sw-det"), ctrc = sv.dataset.swSave, ac = jget(K_ACOES, {});
        const reg = {s: box.querySelector("[data-sw-as]").value, ret: box.querySelector("[data-sw-ar]").value, n: box.querySelector("[data-sw-an]").value.trim(), t: new Date().toISOString()};
        if(!reg.s && !reg.ret && !reg.n) delete ac[ctrc]; else ac[ctrc] = reg;
        jset(K_ACOES, ac); toast("Acompanhamento salvo."); render(false); return;
      }
      if(t.closest("[data-sw-close]")){ st.exp = ""; render(false); return; }
      if(t.closest("#sswCopiarTodas")){ const d = dados(); AC = jget(K_ACOES, {}); montaPacotes(); HOJE = d.h; copia(textoCobranca(d.todas, base(d.todas), d.h, "")); return; }
      const cp = t.closest("[data-sw-cp]"); if(cp){ const d = dados(); AC = jget(K_ACOES, {}); montaPacotes(); HOJE = d.h; copia(textoCobranca(d.todas, base(d.todas), d.h, cp.dataset.swCp)); return; }
      const k = t.closest("[data-sw-kpi]"); if(k){ const mesmo = st.kpi === k.dataset.swKpi; Object.assign(st, RESET, mesmo ? {} : KPI[k.dataset.swKpi], {kpi: mesmo ? "" : k.dataset.swKpi, pg: 1, exp: ""}); render(true); return; }
      const seg = t.closest("[data-sw-seg]"); if(seg){ st[seg.dataset.swSeg] = seg.dataset.v; muda(); return; }
      const mv = t.closest("[data-sw-mov]"); if(mv){ st.mov = st.mov === mv.dataset.swMov ? "" : mv.dataset.swMov; muda(); return; }
      const so = t.closest("[data-sw-sort]"); if(so){ ev.preventDefault(); const k2 = so.dataset.swSort; st.sort = k2 === "prio" ? {k: "prio", d: 1} : {k: k2, d: st.sort.k === k2 ? -st.sort.d : 1}; st.pg = 1; render(false); return; }
      const v = t.closest("[data-sw-vista]"); if(v){ st.vista = v.dataset.swVista; muda(false); return; }
      const u = t.closest("[data-sw-un]"); if(u){ const x = u.dataset.swUn; st.un = (st.un.length === 1 && st.un[0] === x) ? [] : [x]; muda(); return; }
      const o = t.closest("[data-sw-oc]"); if(o){ const x = o.dataset.swOc; st.oc = (st.oc.length === 1 && st.oc[0] === x) ? [] : [x]; muda(); return; }
      const pg = t.closest("[data-sw-pg]"); if(pg){ st.pg += Number(pg.dataset.swPg); st.exp = ""; render(false); document.getElementById("sswOut").scrollIntoView({block: "start"}); return; }
      const cl = t.closest("[data-sw-clr]"); if(cl){ st[cl.dataset.swClr] = []; muda(); return; }
      if(t.closest("#sswLimparF")){ st = {...FILTROS_LIMPOS(), open: ""}; render(true); return; }
      if(t.closest("#sswExp")){ exporta(); return; }
      if(t.closest("#sswLimpar")){ if(confirm("Remover a planilha do SSW importada? (as cobranças registradas são mantidas)")){ jset(K, {linhas: []}); jset(K_ANT, null); cache = null; render(true); } return; }
      const row = t.closest("tr[data-sw-row]");        // clique na linha: abre/fecha o detalhe
      if(row && !t.closest("a,button,input,select,textarea,label")){ st.exp = st.exp === row.dataset.swRow ? "" : row.dataset.swRow; render(false); }
    });
    r.addEventListener("change", ev => {
      const el = ev.target;
      if(el.dataset && el.dataset.swF){            // caixas de marcar dos filtros (várias opções)
        const k = el.dataset.swF, a = new Set(st[k]); el.checked ? a.add(el.value) : a.delete(el.value); st[k] = [...a];
        st.open = k; muda();
      }else if(el.id === "sswInc93"){ st.inc93 = el.checked; st.oc = []; muda(); }
    });
    r.addEventListener("input", ev => { if(ev.target.id === "sswBusca"){ st.busca = ev.target.value; st.pg = 1; st.kpi = ""; st.exp = ""; render(false); } });
    document.addEventListener("click", ev => {     // fecha a lista aberta ao clicar fora
      const ms = ev.target.closest && ev.target.closest(".sw-ms");
      if(ms){ document.querySelectorAll(".sw-ms[open]").forEach(d => { if(d !== ms) d.removeAttribute("open"); }); return; }
      document.querySelectorAll(".sw-ms[open]").forEach(d => d.removeAttribute("open")); st.open = "";
    });
    render(true);
  };
})();
