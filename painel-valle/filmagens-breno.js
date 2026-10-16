/* =====================================================================
   FILMAGENS (BRENO) — levantamento das câmeras x confirmação de entregas.
   - Importa a planilha do Breno (.xlsx): DATA, ROTA, DESTINATARIO, PAGADOR,
     OCORRENCIA, NFISCAL, VALOR DE NF.
   - REAPROVEITA o arquivo CSV do Fechamento-RECEITA só para ler a nota fiscal
     de cada CTRC. Não altera nada do fechamento: o índice de NFs é guardado
     numa chave própria do navegador.
   - Vínculo: pela NOTA FISCAL, e só vale quando o PAGADOR e a UNIDADE
     (rota) também batem. Atrasos (150) e Ocorrência 69 usam a mesma regra.
   ===================================================================== */
(function(){
  "use strict";

  const KEY_FILM = "tambasa_filmagens_breno";
  const KEY_IDX  = "tambasa_receita_nf_index";
  const KEY_CONF = "tambasa_filmagens_conferentes";

  /* rotas (cidade) -> sigla da unidade, para os casos em que a sigla não é as 3 primeiras letras */
  const ROTA_SIGLA = {"CRISTALINA":"CRT", "LUZIANIA":"LZI", "ANAPOLIS":"ANP", "GOIANESIA":"GNA", "SANTA TEREZINHA":"STZ", "URUACU":"URU", "RIANAPOLIS":"RIA"};

  const semAcento = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const norm = s => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const nfNorm = v => String(v == null ? "" : v).replace(/\D/g, "").replace(/^0+/, "");
  const toNum = v => {
    if(typeof v === "number") return v;
    if(typeof numeroOcorrenciaBR === "function") return numeroOcorrenciaBR(v);
    return Number(String(v || "").replace(/\./g, "").replace(",", ".")) || 0;
  };
  const lerKey = k => { try{ const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }catch(e){ return null; } };
  const gravar = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } };

  /* ---------------- regras de comparação ---------------- */
  const STOP_PAG = new Set(["LTDA","ME","EPP","EIRELI","SA","S","A","DE","DA","DO","DAS","DOS","E","LT","LTD","CIA"]);
  const toks = s => norm(s).split(" ").filter(t => t && !STOP_PAG.has(t));
  const tokEq = (x, y) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));

  function pagadorBate(a, b){
    const ta = toks(a), tb = toks(b);
    if(!ta.length || !tb.length) return false;
    const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if(curto.every(t => longo.some(u => tokEq(t, u)))) return true;
    const comuns = curto.filter(t => longo.some(u => tokEq(t, u))).length;
    return tokEq(ta[0], tb[0]) && comuns / new Set([...ta, ...tb]).size >= 0.5;
  }

  const STOP_CID = new Set(["D","DE","DO","DA","DOS","DAS"]);
  const cidade = s => norm(s).split(" ").filter(t => t && !STOP_CID.has(t)).join(" ");

  /* rota (cidade da unidade) x [cidade de entrega | sigla da unidade receptora] */
  function unidadeBate(rota, cidadeEntrega, sigla){
    const r = cidade(rota), c = cidade(cidadeEntrega), s = norm(sigla).slice(0, 3);
    if(!r) return false;
    if(c && (r === c || (r.length >= 5 && c.length >= 5 && (c.includes(r) || r.includes(c))))) return true;
    if(s && (ROTA_SIGLA[r] === s || r.slice(0, 3) === s)) return true;
    return false;
  }

  /* ---------------- ocorrência: tipo, motivo e conferente ---------------- */
  function destrinchar(texto){
    const t = String(texto || "").replace(/\s+/g, " ").trim();
    let conf = "", confNome = "";
    const m = t.match(/\(?\s*CONF(?:ERENTE)?\s*[:.-]\s*([^)]+?)\s*\)?\s*$/i);
    if(m){ confNome = m[1].trim().toUpperCase(); conf = confNome.split(" ")[0]; }
    const corpo = m ? t.slice(0, m.index).trim() : t;
    const p = corpo.split(/\s*[-–—]\s+|\s*[-–—]\s*(?=[A-ZÀ-Ú])/);
    const tipo = (p[0] || "").trim().toUpperCase() || "SEM OCORRÊNCIA";
    const motivo = corpo.slice(p[0].length).replace(/^\s*[-–—]\s*/, "").trim();
    return {tipo, motivo, conf, confNome};
  }

  /* ---------------- planilha do Breno ---------------- */
  const ehData = v => Object.prototype.toString.call(v) === "[object Date]";
  const valorCelula = v => (v && typeof v === "object" && !ehData(v)) ? (v.result !== undefined ? v.result : (v.text !== undefined ? v.text : (v.richText ? v.richText.map(x => x.text).join("") : ""))) : v;
  const isoData = v => {
    v = valorCelula(v);
    if(ehData(v)) return v.toISOString().slice(0, 10);
    const m = String(v || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };

  async function importarXlsx(file){
    if(typeof ExcelJS === "undefined") throw new Error("biblioteca de Excel não carregou (confira a internet)");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if(!ws) throw new Error("planilha vazia");

    let hRow = 0, col = {};
    ws.eachRow((row, n) => {
      if(hRow) return;
      const mapa = {};
      row.eachCell((cell, c) => { mapa[norm(valorCelula(cell.value))] = c; });
      if(mapa["NFISCAL"] || mapa["NF"] || mapa["NOTA FISCAL"]){ hRow = n; col = mapa; }
    });
    if(!hRow) throw new Error("não achei o cabeçalho (DATA, ROTA, DESTINATARIO, PAGADOR, OCORRENCIA, NFISCAL, VALOR DE NF)");
    const c = (...nomes) => { for(const n of nomes) if(col[n]) return col[n]; return 0; };
    const cData = c("DATA"), cRota = c("ROTA", "UNIDADE"), cDest = c("DESTINATARIO"), cPag = c("PAGADOR"), cOco = c("OCORRENCIA"), cNf = c("NFISCAL", "NF", "NOTA FISCAL"), cVal = c("VALOR DE NF", "VALOR NF", "VALOR");

    const lidas = [];
    for(let n = hRow + 1; n <= ws.rowCount; n++){
      const row = ws.getRow(n), g = k => k ? valorCelula(row.getCell(k).value) : "";
      const nf = nfNorm(g(cNf));
      if(!nf) continue;                                   // linha em branco / "VALOR TOTAL"
      const oco = destrinchar(g(cOco));
      lidas.push({
        data: isoData(g(cData)), rota: String(g(cRota) || "").trim().toUpperCase(),
        destinatario: String(g(cDest) || "").trim(), pagador: String(g(cPag) || "").trim(),
        ocorrencia: String(g(cOco) || "").replace(/\s+/g, " ").trim(),
        tipo: oco.tipo, motivo: oco.motivo, conf: oco.conf, confNome: oco.confNome,
        nf, valorNf: toNum(g(cVal))
      });
    }
    if(!lidas.length) throw new Error("nenhuma linha com nota fiscal");

    /* reimportar atualiza (mesma NF + data + pagador); o que já existia de outros meses fica */
    const chave = r => [r.nf, r.data, norm(r.pagador)].join("|");
    const mapa = new Map(carregar().map(r => [chave(r), r]));
    let novas = 0, atualizadas = 0;
    lidas.forEach(r => { const k = chave(r), ant = mapa.get(k); if(ant){ atualizadas++; r.id = ant.id; if(ant.confManual && !r.confNome){ r.confNome = ant.confNome; r.conf = ant.conf; r.confManual = true; } } else { novas++; r.id = novoId(); } mapa.set(k, r); });
    if(!gravar(KEY_FILM, [...mapa.values()])) throw new Error("sem espaço no navegador para guardar");
    return {lidas: lidas.length, novas, atualizadas, total: mapa.size};
  }

  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function carregar(){
    const l = lerKey(KEY_FILM); if(!Array.isArray(l)) return [];
    if(l.some(r => !r.id)){ l.forEach(r => { if(!r.id) r.id = novoId(); }); gravar(KEY_FILM, l); }
    return l;
  }
  /* ---------------- edição manual (tabela de edição da seção Filmagens) ---------------- */
  const paraNumero = v => { v = String(v == null ? "" : v).replace(/R\$|\s/g, ""); if(!v) return 0; return v.indexOf(",") !== -1 ? (Number(v.replace(/\./g, "").replace(",", ".")) || 0) : (Number(v) || 0); };
  function editar(id, campo, valor){
    const l = carregar(), r = l.find(x => x.id === id); if(!r) return false;
    if(campo === "nf") r.nf = nfNorm(valor);
    else if(campo === "valorNf") r.valorNf = paraNumero(valor);
    else if(campo === "ocorrencia"){
      const o = destrinchar(valor); r.ocorrencia = String(valor || "").replace(/\s+/g, " ").trim();
      r.tipo = o.tipo; r.motivo = o.motivo;
      if(o.confNome || !r.confManual){ r.conf = o.conf; r.confNome = o.confNome; }
    }
    else if(campo === "conf"){
      const nome = String(valor || "").replace(/\s+/g, " ").trim().toUpperCase();
      r.confNome = nome; r.conf = nome.split(" ")[0] || ""; r.confManual = !!nome;
    }
    else if(campo === "rota") r.rota = String(valor || "").trim().toUpperCase();
    else if(campo === "data" || campo === "destinatario" || campo === "pagador") r[campo] = String(valor || "").trim();
    else return false;
    r.editado = true;
    return gravar(KEY_FILM, l);
  }
  function adicionar(){
    const l = carregar(), r = {id:novoId(), data:new Date().toISOString().slice(0, 10), rota:"", destinatario:"", pagador:"", ocorrencia:"", tipo:"SEM OCORRÊNCIA", motivo:"", conf:"", confNome:"", nf:"", valorNf:0, editado:true};
    l.push(r); gravar(KEY_FILM, l); return r;
  }
  function remover(id){ const l = carregar().filter(x => x.id !== id); return gravar(KEY_FILM, l); }
  function limpar(){ try{ localStorage.removeItem(KEY_FILM); }catch(e){} }
  /* ---------------- cadastro de conferentes (opcional) ---------------- */
  function conferentes(){ const l = lerKey(KEY_CONF); return Array.isArray(l) ? l : []; }
  function addConferente(nome){
    nome = String(nome || "").replace(/\s+/g, " ").trim().toUpperCase(); if(!nome) return false;
    const l = conferentes(); if(l.indexOf(nome) !== -1) return false;
    l.push(nome); l.sort((a, b) => a.localeCompare(b)); return gravar(KEY_CONF, l);
  }
  function removerConferente(nome){ return gravar(KEY_CONF, conferentes().filter(x => x !== nome)); }
  /* apaga só o índice de NFs lido da Receita (o fechamento não é afetado) */
  function limparIndice(){ ORIG = {}; INDICE = null; erroPersist = ""; persistir(); }

  /* ---------------- índice de NFs do arquivo da Receita ---------------- */
  const COLS_NF = ["NOTA FISCAL", "NOTAS FISCAIS", "NRO NF", "NUMERO NF", "NR NF", "NUM NF", "NUMERO DA NOTA FISCAL", "NRO NOTA FISCAL", "NF", "NOTA"];

  function indexarReceita(text, origem){
    text = String(text || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
    const linhas = text.split("\n");
    const h = linhas.findIndex(l => /Cliente Pagador/i.test(l) && /Valor do Frete/i.test(l));
    if(h === -1) return {ok:false, motivo:"não é o CSV com Cliente Pagador / Valor do Frete"};
    const cab = linhas[h].split(";").map(norm);
    const col = (...ns) => { for(const n of ns){ const i = cab.indexOf(norm(n)); if(i !== -1) return i; } return -1; };
    let iNf = col(...COLS_NF);
    if(iNf === -1) iNf = cab.findIndex(x => /NOTA FISCAL|NOTAS FISCAIS|(^| )NF($| )/.test(x));
    if(iNf === -1) return {ok:false, motivo:"o arquivo não tem coluna de nota fiscal"};
    const iPag = col("Cliente Pagador"), iRec = col("Unidade Receptora"), iPra = col("Praca Expedidora", "Praça Expedidora"),
          iFre = col("Valor do Frete"), iMer = col("Valor da Mercadoria"), iCid = col("Cidade de Entrega"), iCan = col("Data do Cancelamento"), iCon = cab.findIndex(x => x.indexOf("CONFERENTE") !== -1);

    const P = [], C = [], pi = new Map(), ci = new Map();
    const dic = (arr, mp, v) => { v = String(v || "").trim(); if(!mp.has(v)){ mp.set(v, arr.length); arr.push(v); } return mp.get(v); };
    const R = [];
    for(let li = h + 1; li < linhas.length; li++){
      const c = linhas[li].split(";");
      if(c.length < cab.length - 2 || String(c[0]).trim() !== "2") continue;
      if(iCan !== -1 && String(c[iCan] || "").trim()) continue;
      const frete = toNum(c[iFre]), merc = iMer !== -1 ? toNum(c[iMer]) : 0;
      const nfs = String(c[iNf] || "").split(/[,;]| - /).map(p => nfNorm(p.indexOf("/") !== -1 ? p.slice(p.lastIndexOf("/") + 1) : p)).filter(Boolean);
      if(!nfs.length) continue;
      const rec = norm(iRec !== -1 ? c[iRec] : (iPra !== -1 ? c[iPra] : "")).slice(0, 3);
      nfs.forEach(nf => R.push([nf, Math.round(frete * 100) / 100, Math.round(merc * 100) / 100, dic(P, pi, c[iPag]), dic(C, ci, iCid !== -1 ? c[iCid] : ""), rec, iCon !== -1 ? String(c[iCon] || "").trim() : ""]));
    }
    if(!R.length) return {ok:false, motivo:"nenhuma nota fiscal preenchida nas linhas de CTRC"};

    /* guarda o índice de cada origem (VAL / RVA) separado: reimportar uma não apaga a outra.
       Fica em memória + IndexedDB (o arquivo tem dezenas de milhares de linhas, não cabe no localStorage). */
    ORIG[origem || "val"] = {p:P, c:C, r:R, em:new Date().toISOString()};
    INDICE = null;
    persistir();
    return {ok:true, linhas:R.length, origem:origem || "val", motivo:""};
  }

  /* ---------------- persistência (IndexedDB) ---------------- */
  let ORIG = {}, INDICE = null, erroPersist = "";
  const abrirDb = () => new Promise((res, rej) => {
    if(typeof indexedDB === "undefined") return rej(new Error("sem IndexedDB"));
    const q = indexedDB.open("tambasa_filmagens", 1);
    q.onupgradeneeded = () => q.result.createObjectStore("kv");
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  function persistir(){
    abrirDb().then(db => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(ORIG, "porOrigem");
      tx.oncomplete = () => { erroPersist = ""; db.close(); avisar(); }; tx.onerror = () => { erroPersist = "não consegui guardar o índice no navegador"; db.close(); avisar(); };
    }).catch(() => { erroPersist = "o navegador não permite guardar o índice (vale só até fechar a página)"; avisar(); });
  }
  function restaurar(){
    try{ localStorage.removeItem(KEY_IDX); }catch(e){}
    abrirDb().then(db => { const r = db.transaction("kv").objectStore("kv").get("porOrigem");
      r.onsuccess = () => { if(r.result && Object.keys(ORIG).length === 0){ ORIG = r.result; INDICE = null; } db.close(); avisar(); };
      r.onerror = () => db.close();
    }).catch(() => {});
  }
  function avisar(){ try{ if(typeof window.FILM.onChange === "function") window.FILM.onChange(); }catch(e){} }

  function montarIndice(){
    if(INDICE) return INDICE;
    const mapa = new Map(), info = {total:0, val:0, rva:0, em:"", erro:erroPersist};
    Object.keys(ORIG).forEach(o => {
      const x = ORIG[o]; info[o] = x.r.length; info.total += x.r.length; if(x.em > info.em) info.em = x.em;
      x.r.forEach(l => {
        const it = {frete:l[1], merc:l[2], pagador:x.p[l[3]], cidade:x.c[l[4]], recept:l[5], conf:l[6], origem:o};
        const a = mapa.get(l[0]); if(a) a.push(it); else mapa.set(l[0], [it]);
      });
    });
    return (INDICE = {mapa, info});
  }

  /* ---------------- vínculo e totais ---------------- */
  function dados(){
    const base = carregar(), {mapa, info} = montarIndice();
    const atrs = (typeof load === "function" && typeof KEYS !== "undefined") ? load(KEYS.atrasos) : [];
    const ocs  = (typeof load === "function" && typeof KEYS !== "undefined") ? load(KEYS.ocorrencias) : [];
    const porNf = lista => { const m = new Map(); lista.forEach(x => { const k = nfNorm(x.nf); if(k) (m.get(k) || m.set(k, []).get(k)).push(x); }); return m; };
    const mA = porNf(atrs), mO = porNf(ocs);
    const casa = (x, r) => pagadorBate(x.pagador, r.pagador) && (!String(x.unidade || "").trim() || unidadeBate(r.rota, "", x.unidade));

    const rows = base.map(r => {
      const x = Object.assign({}, r, {status:"sem_nf", motivo:"", frete:0, merc:0, pagadorRec:"", unidadeRec:"", origemRec:"", freteAtr:0, diasAtr:0, qAtr:0, frete69:0, q69:0});
      if(!info.total){ x.status = "sem_indice"; x.motivo = "Importe o CSV da Receita para vincular"; }
      else {
        const achadas = mapa.get(r.nf) || [];
        if(achadas.length){
          const boa = achadas.find(a => pagadorBate(a.pagador, r.pagador) && unidadeBate(r.rota, a.cidade, a.recept));
          if(boa){
            Object.assign(x, {status:"vinculado", frete:boa.frete, merc:boa.merc, pagadorRec:boa.pagador, unidadeRec:boa.recept, origemRec:boa.origem});
            if(boa.conf && !x.conf){ x.conf = norm(boa.conf).split(" ")[0]; x.confNome = boa.conf.toUpperCase(); }
          } else {
            const a = achadas[0], pOk = achadas.some(z => pagadorBate(z.pagador, r.pagador)), uOk = achadas.some(z => unidadeBate(r.rota, z.cidade, z.recept));
            x.status = "divergente";
            x.motivo = "NF existe na Receita, mas " + (!pOk && !uOk ? "pagador e unidade não batem" : (!pOk ? "o pagador não bate" : "a unidade não bate")) + " (Receita: " + a.pagador + " · " + a.recept + (a.cidade ? " · " + a.cidade : "") + ")";
          }
        } else x.motivo = "NF não encontrada na Receita";
      }
      const at = (mA.get(r.nf) || []).filter(a => casa(a, r));
      x.qAtr = at.length; x.freteAtr = at.reduce((s, a) => s + toNum(a.frete), 0); x.diasAtr = at.reduce((m, a) => Math.max(m, toNum(a.diasAtraso)), 0);
      const o6 = (mO.get(r.nf) || []).filter(a => casa(a, r));
      x.q69 = o6.length; x.frete69 = o6.reduce((s, a) => s + toNum(a.valFrete), 0);
      return x;
    }).sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.valorNf - a.valorNf);

    const tot = {qtd:rows.length, valorNf:0, frete:0, merc:0, vinc:0, div:0, semNf:0, semIdx:0, freteAtr:0, qAtr:0, frete69:0, q69:0};
    rows.forEach(r => {
      tot.valorNf += r.valorNf; tot.frete += r.frete; tot.merc += r.merc; tot.freteAtr += r.freteAtr; tot.qAtr += r.qAtr ? 1 : 0; tot.frete69 += r.frete69; tot.q69 += r.q69 ? 1 : 0;
      if(r.status === "vinculado") tot.vinc++; else if(r.status === "divergente") tot.div++; else if(r.status === "sem_indice") tot.semIdx++; else tot.semNf++;
    });
    return {rows, tot, info};
  }

  restaurar();
  window.FILM = {onChange:null, importarXlsx, indexarReceita, dados, limpar, carregar, norm, editar, adicionar, remover, limparIndice, conferentes, addConferente, removerConferente, _t:{destrinchar, pagadorBate, unidadeBate}};
})();
