/* =====================================================================
   SACFLOW - NÚCLEO DE DADOS (importação, normalização e indicadores)
   Camadas mantidas separadas (ver LEIA-ME-ALTERACOES.txt):
     1) DADOS BRUTOS     -> S.imports[].texto   (texto exatamente como foi colado/importado)
     2) NORMALIZADOS     -> norm()              (registros interpretados, sem duplicidade)
     3) CALCULADOS       -> stats(), serie()... (sempre recalculados a partir dos normalizados)
     4) METAS            -> S.metas             (só existem se o usuário configurar)
     5) ANÁLISES         -> feitas na tela, a partir dos calculados
   Ausência de informação NUNCA vira zero: fica null ("não informado").
   ===================================================================== */
(function(root){
  "use strict";

  const KEY = "valle_sacflow_v1";

  /* ---------------- armazenamento ---------------- */
  let S = {imports: [], metas: {}, planos: {}};
  function carregar(){
    try{
      const r = JSON.parse(localStorage.getItem(KEY) || "null");
      if(r && typeof r === "object") S = Object.assign({imports: [], metas: {}, planos: {}}, r);
    }catch(x){}
    NC = null;
  }
  function salvar(){
    try{ localStorage.setItem(KEY, JSON.stringify(S)); return true; }
    catch(x){ return false; }
  }

  /* ---------------- utilitários de texto ---------------- */
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const chave = s => sem(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const limpa = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const nkey = s => sem(limpa(s)).replace(/\s+/g, " ").replace(/\.+$/, "");   // "Pablo H" e "Pablo H." = mesmo atendente

  function parseNum(v){
    if(v == null) return null;
    let s = String(v).replace(/%/g, "").replace(/\s/g, "");
    if(!s || !/\d/.test(s)) return null;
    if(s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if(s.includes(",")) s = s.replace(",", ".");
    else if((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  const p2 = n => String(n).padStart(2, "0");
  function dataValida(y, m, d){
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  /* devolve "YYYY-MM-DD" ou "YYYY-MM-DDTHH:MM" ; null se vazio/inválido */
  function parseDT(v){
    const s = limpa(v);
    if(!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ,]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
    let y, mo, d, hh, mi;
    if(m){ y = +m[1]; mo = +m[2]; d = +m[3]; hh = m[4]; mi = m[5]; }
    else{
      m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:[T ,]+(?:às\s*)?(\d{1,2})[:h](\d{2})(?::\d{2})?)?/i);
      if(!m) return null;
      d = +m[1]; mo = +m[2]; y = +m[3]; if(m[3].length === 2) y += 2000; hh = m[4]; mi = m[5];
    }
    if(!dataValida(y, mo, d)) return null;
    const dia = `${y}-${p2(mo)}-${p2(d)}`;
    if(hh != null && +hh < 24 && +mi < 60) return `${dia}T${p2(hh)}:${mi}`;
    return dia;
  }
  const diaDe = iso => iso ? iso.slice(0, 10) : "";

  /* período: "01/10/2026 a 15/10/2026", "2026-10-01 até 2026-10-15", "10/2026", "2026-10", "01/10/2026" */
  function parsePeriodo(v){
    const s = limpa(v);
    if(!s) return null;
    const mm = s.match(/^(\d{1,2})\/(\d{4})$/) || null;
    if(mm){ const mo = +mm[1], y = +mm[2]; if(mo >= 1 && mo <= 12) return {ini: `${y}-${p2(mo)}-01`, fim: fimMes(y, mo)}; }
    const m2 = s.match(/^(\d{4})-(\d{2})$/);
    if(m2){ const y = +m2[1], mo = +m2[2]; if(mo >= 1 && mo <= 12) return {ini: `${y}-${p2(mo)}-01`, fim: fimMes(y, mo)}; }
    const partes = s.split(/\s+(?:a|até|ate|to|-|–|—)\s+/i);
    if(partes.length >= 2){
      const a = diaDe(parseDT(partes[0])), b = diaDe(parseDT(partes[1]));
      if(a && b) return a <= b ? {ini: a, fim: b} : {ini: b, fim: a};
      return null;
    }
    const u = diaDe(parseDT(s));
    return u ? {ini: u, fim: u} : null;
  }
  function fimMes(y, mo){ return `${y}-${p2(mo)}-${p2(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`; }

  /* ---------------- classificações ---------------- */
  function classStatus(v){
    const s = sem(v);
    if(!s) return "nd";
    if(/(conclu|encerr|finaliz|fechad|resolvid|solucion)/.test(s)) return "concluido";
    if(/(pendent|aguard|espera|retorno)/.test(s)) return "pendente";
    if(/(abert|andamento|atendimento|ativo|novo|fila|em curso)/.test(s)) return "aberto";
    return "outro";
  }
  function classSLA(v){
    const s = sem(v);
    if(!s) return null;
    if(/(viol|fora|estour|descump|nao cump|nao atend|atras|vencid|^nao$|^n$|^no$)/.test(s)) return "viol";
    if(/(dentro|cump|no prazo|ok|atendid|^sim$|^s$|^yes$)/.test(s)) return "ok";
    return "unk";
  }
  function classSimNao(v){
    const s = sem(v);
    if(!s) return null;
    if(/^(sim|s|yes|y|1|true|enviada|enviado)$/.test(s)) return true;
    if(/^(nao|n|no|0|false)$/.test(s)) return false;
    return null;
  }
  const NOTA_MIN = 1, NOTA_MAX = 5;
  const classNota = n => n >= 4 ? "pos" : (n >= 3 ? "neu" : "neg");

  /* ---------------- leitura do texto estruturado ---------------- */
  const SECOES = {
    atendente: "atendente", operador: "atendente", agente: "atendente",
    periodo: "periodo",
    resumo: "resumo", indicadores: "resumo", indicadores_gerais: "resumo",
    atendimentos: "atend", conversas: "atend", atendimento: "atend",
    sla: "sla", violacoes: "sla", violacoes_sla: "sla",
    transferencias: "transf", transferencia: "transf",
    avaliacoes: "aval", avaliacao: "aval", pesquisas: "aval", pesquisa: "aval",
    mensagens: "msg", historico: "msg", eventos: "msg",
    observacoes: "obs", observacao: "obs", obs: "obs"
  };
  const ALIAS = {
    atend: {
      id: ["id", "id_atendimento", "atendimento", "protocolo", "ticket", "numero", "n"],
      cliente: ["cliente", "nome_cliente", "contato", "identificacao", "cliente_id"],
      criado: ["criado", "criado_em", "data_criacao", "criacao", "abertura", "data_abertura", "inicio", "data", "data_hora"],
      enc: ["encerrado", "encerrado_em", "data_encerramento", "encerramento", "fechamento", "fim", "data_fim"],
      att: ["atendente", "responsavel", "agente", "operador"],
      dep: ["departamento", "setor", "fila", "dep"],
      canal: ["canal", "via", "origem_canal"],
      status: ["status", "situacao"],
      slaTipo: ["tipo_sla", "sla_tipo", "sla", "evento_sla"],
      slaRes: ["resultado_sla", "sla_resultado", "cumprimento_sla", "resultado", "cumprimento"],
      slaDet: ["detalhe_sla", "detalhe_violacao"],
      tcCol: ["transferencias", "qtd_transferencias", "n_transferencias", "num_transferencias"],
      nota: ["nota", "avaliacao", "nota_cliente", "rating"],
      ultima: ["ultima_interacao", "ultima_msg", "ultima_mensagem_em", "ultimo_contato"],
      resumo: ["resumo", "resumo_conversa", "assunto"],
      pesq: ["pesquisa_enviada", "pesquisa", "enviou_pesquisa"]
    },
    sla: {
      id: ["id", "id_atendimento", "atendimento", "protocolo", "ticket"],
      data: ["data", "data_hora", "datahora", "quando", "data_violacao"],
      tipo: ["tipo", "tipo_sla", "sla", "evento", "evento_sla"],
      res: ["resultado", "resultado_sla", "cumprimento", "status"],
      det: ["detalhe", "detalhes", "observacao", "obs", "motivo"],
      att: ["atendente", "responsavel", "agente"]
    },
    transf: {
      id: ["id", "id_atendimento", "atendimento", "protocolo", "ticket"],
      data: ["data", "data_hora", "datahora", "quando"],
      de: ["de_atendente", "de", "atendente_origem", "origem_atendente", "transferido_por"],
      para: ["para_atendente", "para", "atendente_destino", "destino_atendente", "transferido_para"],
      depO: ["departamento_origem", "origem_departamento", "dep_origem", "origem", "setor_origem"],
      depD: ["departamento_destino", "destino_departamento", "dep_destino", "destino", "setor_destino"],
      motivo: ["motivo", "razao", "justificativa"],
      att: ["atendente", "responsavel", "agente"]
    },
    aval: {
      id: ["id", "id_atendimento", "atendimento", "protocolo", "ticket"],
      data: ["data", "data_hora", "datahora", "quando", "data_avaliacao"],
      nota: ["nota", "avaliacao", "rating", "valor"],
      coment: ["comentario", "comentarios", "feedback", "texto", "observacao"],
      att: ["atendente", "responsavel", "agente"]
    },
    msg: {
      id: ["id", "id_atendimento", "atendimento", "protocolo", "ticket"],
      data: ["data_hora", "datahora", "data", "quando", "hora"],
      autor: ["autor", "remetente", "quem", "de"],
      tipo: ["tipo", "evento", "categoria"],
      texto: ["mensagem", "texto", "conteudo", "descricao"],
      att: ["atendente", "responsavel", "agente"]
    }
  };
  const OBRIG = {atend: ["id"], sla: ["id", "res"], transf: ["id"], aval: ["id", "nota"], msg: ["id", "texto"]};
  const NOME_SEC = {atend: "ATENDIMENTOS", sla: "SLA", transf: "TRANSFERENCIAS", aval: "AVALIACOES", msg: "MENSAGENS", resumo: "RESUMO", obs: "OBSERVACOES"};

  function detectarSep(linha){
    const c = {";": 0, "\t": 0, "|": 0, ",": 0};
    let q = false;
    for(const ch of linha){ if(ch === '"') q = !q; else if(!q && ch in c) c[ch]++; }
    if(c[";"] || c["\t"] || c["|"]){
      return Object.keys(c).filter(k => k !== ",").sort((a, b) => c[b] - c[a])[0];
    }
    return c[","] >= 2 ? "," : ";";
  }
  function quebraLinha(linha, sep){
    const out = []; let cur = "", q = false;
    for(let i = 0; i < linha.length; i++){
      const ch = linha[i];
      if(ch === '"'){ if(q && linha[i + 1] === '"'){ cur += '"'; i++; } else q = !q; }
      else if(ch === sep && !q){ out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim());
  }
  function mapaCabecalho(cells, sec){
    const al = ALIAS[sec], map = {}, desconhecidas = [];
    cells.forEach((c, i) => {
      const k = chave(c);
      let achou = null;
      for(const campo in al){ if(al[campo].includes(k) && !(campo in map)){ achou = campo; break; } }
      if(achou) map[achou] = i; else if(k) desconhecidas.push(c);
    });
    return {map, desconhecidas};
  }

  /* Interpreta um texto e devolve {recs, issues, stats}. Não altera nenhum armazenamento. */
  function parseTexto(texto){
    const R = {atend: [], sla: [], transf: [], aval: [], msg: [], resumo: [], obs: []};
    const issues = [];
    const issue = (nivel, ln, msg) => issues.push({nivel, ln, msg});
    const linhas = String(texto || "").split(/\r?\n/);
    let att = "", per = null, perGlobal = null, sec = null, hdr = null, sep = ";", blk = {};
    const dupLocal = {atend: 0, sla: 0, transf: 0, aval: 0, msg: 0, resumo: 0};
    const vistos = {atend: new Set(), sla: new Set(), transf: new Set(), aval: new Set(), msg: new Set(), resumo: new Set()};

    const novoBloco = () => { blk = {transfSec: false}; };
    novoBloco();

    for(let i = 0; i < linhas.length; i++){
      const ln = i + 1, bruta = linhas[i], l = bruta.trim();
      if(!l || l.startsWith("//")) continue;

      /* cabeçalho de seção: @NOME[: valor]  ou  [NOME[: valor]] */
      let m = l.match(/^@\s*([^:\s][^:]*?)\s*(?::\s*(.*))?$/) || l.match(/^\[\s*([^:\]]+?)\s*(?::\s*(.*?))?\s*\]$/);
      if(m){
        const nomeSec = SECOES[chave(m[1])];
        const val = (m[2] || "").trim();
        if(!nomeSec){ issue("erro", ln, `Seção desconhecida: "${m[1]}". Use ATENDENTE, PERIODO, RESUMO, ATENDIMENTOS, SLA, TRANSFERENCIAS, AVALIACOES, MENSAGENS ou OBSERVACOES.`); sec = "ignorar"; hdr = null; continue; }
        if(nomeSec === "atendente"){
          const partes = val.split("|").map(x => x.trim());
          att = limpa(partes[0]);
          if(!att) issue("erro", ln, "ATENDENTE sem nome.");
          per = perGlobal; novoBloco();
          partes.slice(1).forEach(p => {
            const kv = p.match(/^([^:]+):\s*(.*)$/);
            if(kv && chave(kv[1]) === "periodo"){
              const pp = parsePeriodo(kv[2]);
              if(pp) per = pp; else issue("erro", ln, `Período inválido: "${kv[2]}".`);
            }
          });
          sec = null; hdr = null; continue;
        }
        if(nomeSec === "periodo"){
          const pp = parsePeriodo(val);
          if(!pp) issue("erro", ln, `Período inválido: "${val}". Exemplos: 01/10/2026 a 31/10/2026, 10/2026.`);
          else{ per = pp; if(!att) perGlobal = pp; }
          sec = null; hdr = null; continue;
        }
        sec = nomeSec; hdr = null;
        if(sec === "transf") blk.transfSec = true;
        if(!att && sec !== "ignorar") issue("aviso", ln, `Seção ${NOME_SEC[sec]} antes de qualquer ATENDENTE: cada linha precisará da coluna "atendente".`);
        continue;
      }

      if(sec === "ignorar") continue;
      if(!sec){ issue("aviso", ln, `Linha ignorada (fora de qualquer seção): "${l.slice(0, 60)}"`); continue; }

      /* RESUMO: chave: valor */
      if(sec === "resumo"){
        const kv = l.match(/^([^:;\t]+?)\s*[:;\t]\s*(.+)$/);
        if(!kv){ issue("aviso", ln, `Linha do RESUMO sem "indicador: valor": "${l.slice(0, 50)}"`); continue; }
        if(!att){ issue("erro", ln, "RESUMO sem ATENDENTE definido."); continue; }
        const rec = {att, ak: nkey(att), per: per, chave: limpa(kv[1]), bruto: limpa(kv[2]), num: parseNum(kv[2]), _ln: ln};
        if(!per) issue("aviso", ln, `Indicador "${rec.chave}" sem PERIODO definido.`);
        const k = [rec.ak, per ? per.ini + per.fim : "", chave(rec.chave)].join("|");
        if(vistos.resumo.has(k)) dupLocal.resumo++; vistos.resumo.add(k);
        rec._k = k; R.resumo.push(rec);
        continue;
      }
      if(sec === "obs"){
        R.obs.push({att, ak: nkey(att), per, texto: l, _ln: ln});
        continue;
      }

      /* seções em tabela */
      if(!hdr){
        sep = detectarSep(l);
        const cells = quebraLinha(l, sep);
        const h = mapaCabecalho(cells, sec);
        const obr = OBRIG[sec].filter(c => !(c in h.map));
        if(obr.length){
          issue("erro", ln, `Cabeçalho de ${NOME_SEC[sec]} sem a(s) coluna(s) obrigatória(s): ${obr.join(", ")}. Cabeçalho lido: "${l.slice(0, 80)}"`);
          sec = "ignorar"; continue;
        }
        if(h.desconhecidas.length) issue("aviso", ln, `Colunas não reconhecidas em ${NOME_SEC[sec]} (ignoradas): ${h.desconhecidas.join(", ")}`);
        hdr = h.map; hdr._n = cells.length; continue;
      }
      let cells = quebraLinha(l, sep);
      if(cells.length > hdr._n){   // texto com separador dentro: a última coluna absorve o excesso
        const ult = Math.max(...Object.values(hdr).filter(v => typeof v === "number"));
        if(ult === hdr._n - 1){ cells = cells.slice(0, ult).concat([cells.slice(ult).join(sep)]); }
      }
      const g = c => (c in hdr && cells[hdr[c]] != null) ? limpa(cells[hdr[c]]) : "";
      const tem = c => c in hdr;
      const id = g("id");
      if(!id){ issue("erro", ln, `Linha de ${NOME_SEC[sec]} sem ID de atendimento — linha ignorada.`); continue; }
      const dono = g("att") || att;
      if(!dono){ issue("erro", ln, `Atendimento ${id}: sem atendente (nem no bloco, nem na coluna) — linha ignorada.`); continue; }
      const datasInv = (campo, rotulo) => {
        const bruto = g(campo); if(!bruto) return null;
        const d = parseDT(bruto);
        if(!d) issue("aviso", ln, `Atendimento ${id}: ${rotulo} inválida ("${bruto}") — tratada como não informada.`);
        return d;
      };

      if(sec === "atend"){
        const criado = datasInv("criado", "data de criação"), enc = datasInv("enc", "data de encerramento");
        if(criado && enc && enc < criado) issue("aviso", ln, `Atendimento ${id}: encerramento anterior à criação.`);
        if(!criado && !enc) issue("aviso", ln, `Atendimento ${id}: sem data de criação/encerramento — ficará fora dos filtros de período.`);
        let nota = tem("nota") ? parseNum(g("nota")) : null;
        if(g("nota") && (nota == null || nota < NOTA_MIN || nota > NOTA_MAX)){
          issue("aviso", ln, `Atendimento ${id}: nota "${g("nota")}" fora da escala ${NOTA_MIN}–${NOTA_MAX} — ignorada.`); nota = null;
        }
        let tcCol = g("tcCol") !== "" ? parseNum(g("tcCol")) : null;
        if(g("tcCol") !== "" && (tcCol == null || tcCol < 0)){ issue("aviso", ln, `Atendimento ${id}: nº de transferências inválido ("${g("tcCol")}").`); tcCol = null; }
        const rec = {
          id, att: dono, ak: nkey(dono), cliente: g("cliente"), criado, enc, dep: g("dep"), canal: g("canal"),
          status: g("status"), stg: classStatus(g("status")), tcCol, blkRef: blk, nota,
          ultima: datasInv("ultima", "última interação"), resumo: g("resumo"), pesq: classSimNao(g("pesquisa") || g("pesq")),
          slaTipo: g("slaTipo"), slaRes: g("slaRes"), slaDet: g("slaDet"), per, _ln: ln
        };
        if(tem("slaRes") && g("slaRes") && classSLA(g("slaRes")) === "unk") issue("aviso", ln, `Atendimento ${id}: resultado de SLA não reconhecido ("${g("slaRes")}") — fora do cálculo.`);
        if(vistos.atend.has(id)) dupLocal.atend++; vistos.atend.add(id);
        rec._k = id; R.atend.push(rec);
      }
      else if(sec === "sla"){
        const res = classSLA(g("res"));
        if(res === "unk" || res == null){ issue("aviso", ln, `SLA do atendimento ${id}: resultado não reconhecido ("${g("res")}") — registro ignorado no cálculo.`); }
        const data = datasInv("data", "data");
        const rec = {id, att: dono, ak: nkey(dono), data, tipo: g("tipo"), res: res === "unk" ? null : res, resBruto: g("res"), det: g("det"), per, _ln: ln};
        const k = [id, chave(rec.tipo), diaDe(data)].join("|");
        if(vistos.sla.has(k)) dupLocal.sla++; vistos.sla.add(k);
        rec._k = k; R.sla.push(rec);
      }
      else if(sec === "transf"){
        const data = datasInv("data", "data");
        let de = g("de"), para = g("para");
        if(!de && para && nkey(para) !== nkey(dono)) de = dono;
        const rec = {id, att: dono, de, para, depO: g("depO"), depD: g("depD"), motivo: g("motivo"), data,
                     dk: nkey(de), pk: nkey(para), vk: (!de && !para) ? nkey(dono) : "", per, _ln: ln};
        if(!de && !para) issue("aviso", ln, `Transferência do atendimento ${id}: sem "de"/"para" — direção não informada (contada como "vinculada" ao atendente do bloco).`);
        const k = [id, diaDe(data), rec.dk, rec.pk, chave(rec.depD)].join("|");
        if(vistos.transf.has(k)) dupLocal.transf++; vistos.transf.add(k);
        rec._k = k; R.transf.push(rec);
      }
      else if(sec === "aval"){
        const nota = parseNum(g("nota"));
        if(nota == null || nota < NOTA_MIN || nota > NOTA_MAX){ issue("erro", ln, `Avaliação do atendimento ${id}: nota "${g("nota")}" fora da escala ${NOTA_MIN}–${NOTA_MAX} — linha ignorada.`); continue; }
        const rec = {id, att: dono, ak: nkey(dono), data: datasInv("data", "data"), nota, coment: g("coment"), per, _ln: ln};
        if(vistos.aval.has(id)) dupLocal.aval++; vistos.aval.add(id);
        rec._k = id; R.aval.push(rec);
      }
      else if(sec === "msg"){
        const rec = {id, att: dono, data: datasInv("data", "data/hora"), autor: g("autor"), tipo: g("tipo"), texto: g("texto"), _ln: ln};
        const k = [id, rec.data || "", chave(rec.autor), rec.texto.slice(0, 40)].join("|");
        if(vistos.msg.has(k)) dupLocal.msg++; vistos.msg.add(k);
        rec._k = k; R.msg.push(rec);
      }
    }
    if(!att && !R.atend.length && !R.sla.length && !R.transf.length && !R.aval.length && !R.msg.length && !R.resumo.length)
      issue("erro", 0, "Nenhum dado reconhecido. Veja o modelo do formato em \"Copiar modelo\".");
    return {recs: R, issues, dupLocal};
  }

  /* ---------------- normalização (junta todas as importações) ---------------- */
  let NC = null;
  function norm(){
    if(NC) return NC;
    const M = {atend: new Map(), sla: new Map(), transf: new Map(), aval: new Map(), msg: new Map(), resumo: new Map()};
    const obs = [], nomes = new Map();
    S.imports.forEach(imp => {
      const p = parseTexto(imp.texto);
      ["atend", "sla", "transf", "aval", "msg", "resumo"].forEach(t => {
        p.recs[t].forEach(r => { r._imp = imp.id; M[t].set(r._k, r); });
      });
      p.recs.obs.forEach(o => { o._imp = imp.id; obs.push(o); });
    });
    const atend = [...M.atend.values()], at = new Map(atend.map(a => [a.id, a]));
    const reg = (nome, k) => { if(k && !nomes.has(k)) nomes.set(k, limpa(nome)); };
    atend.forEach(a => reg(a.att, a.ak));

    /* transferências: contagem por atendimento e enriquecimento */
    const transf = [...M.transf.values()];
    const evCount = new Map();
    transf.forEach(t => { evCount.set(t.id, (evCount.get(t.id) || 0) + 1); });
    atend.forEach(a => {
      a.d = diaDe(a.criado || a.enc);
      a.tc = a.tcCol != null ? a.tcCol : (a.blkRef && a.blkRef.transfSec ? (evCount.get(a.id) || 0) : (evCount.has(a.id) ? evCount.get(a.id) : null));
    });
    transf.forEach(t => {
      const a = at.get(t.id);
      t.d = diaDe(t.data) || (a ? a.d : "");
      t.dep = a ? a.dep : ""; t.canal = a ? a.canal : ""; t.stg = a ? a.stg : "nd";
      [t.de, t.para, t.att].forEach(n => reg(n, nkey(n)));
    });

    /* SLA: registros explícitos + derivados da linha do atendimento (sem duplicar) */
    const sla = [...M.sla.values()].filter(s => s.res);
    const comExplicito = new Set([...M.sla.values()].map(s => s.id));
    atend.forEach(a => {
      const r = classSLA(a.slaRes);
      if(!r || r === "unk" || comExplicito.has(a.id)) return;
      sla.push({id: a.id, att: a.att, ak: a.ak, data: a.criado || a.enc, tipo: a.slaTipo, res: r, resBruto: a.slaRes, det: a.slaDet, deriv: true, per: a.per, _ln: a._ln, _imp: a._imp});
    });
    sla.forEach(s => {
      const a = at.get(s.id);
      s.d = diaDe(s.data) || (a ? a.d : "");
      s.dep = a ? a.dep : ""; s.canal = a ? a.canal : ""; s.stg = a ? a.stg : "nd";
      s.tipoRot = s.tipo || "Tipo de SLA não informado";
      reg(s.att, s.ak);
    });

    /* avaliações: explícitas + nota da linha do atendimento */
    const aval = [...M.aval.values()];
    const avalIds = new Set(aval.map(v => v.id));
    atend.forEach(a => {
      if(a.nota != null && !avalIds.has(a.id))
        aval.push({id: a.id, att: a.att, ak: a.ak, data: a.criado || a.enc, nota: a.nota, coment: "", deriv: true, per: a.per, _ln: a._ln, _imp: a._imp});
    });
    aval.forEach(v => {
      const a = at.get(v.id);
      v.d = diaDe(v.data) || (a ? a.d : "");
      v.dep = a ? a.dep : ""; v.canal = a ? a.canal : ""; v.stg = a ? a.stg : "nd";
      v.cls = classNota(v.nota); reg(v.att, v.ak);
    });
    const msg = [...M.msg.values()];
    const msgPorId = new Map();
    msg.forEach(m => { if(!msgPorId.has(m.id)) msgPorId.set(m.id, []); msgPorId.get(m.id).push(m); });

    const sinal = {}; // quais categorias existem nos dados
    sinal.sla = sla.length > 0; sinal.transf = transf.length > 0 || atend.some(a => a.tc != null);
    sinal.aval = aval.length > 0; sinal.pesq = atend.some(a => a.pesq != null);
    const resumo = [...M.resumo.values()];
    resumo.forEach(r => reg(r.att, r.ak));

    NC = {atend, at, sla, transf, aval, msg, msgPorId, resumo, obs, nomes, sinal,
          deps: uniq(atend.map(a => a.dep)), canais: uniq(atend.map(a => a.canal)),
          atts: [...nomes.entries()].map(([k, n]) => ({k, nome: n})).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))};
    return NC;
  }
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const nomeDe = k => (norm().nomes.get(k)) || k;

  /* ---------------- filtros ---------------- */
  function passaDim(r, F, tipo){
    if(F.dep && r.dep !== F.dep && !(tipo === "transf" && (r.depO === F.dep || r.depD === F.dep))) return false;
    if(F.canal && r.canal !== F.canal) return false;
    if(F.stg && r.stg !== F.stg) return false;
    return true;
  }
  /* dimensões (atendente/depto/canal/status), sem o período */
  function filtDim(F){
    const N = norm();
    const att = F.att || "";
    return {
      atend: N.atend.filter(r => (!att || r.ak === att) && passaDim(r, F, "atend")),
      sla: N.sla.filter(r => (!att || r.ak === att) && passaDim(r, F, "sla")),
      aval: N.aval.filter(r => (!att || r.ak === att) && passaDim(r, F, "aval")),
      transf: N.transf.filter(r => (!att || r.dk === att || r.pk === att || r.vk === att || (!r.de && !r.para && r.att && nkey(r.att) === att)) && passaDim(r, F, "transf"))
    };
  }
  function noPeriodo(D, ini, fim){
    let semData = 0;
    const ok = r => {
      if(!ini && !fim) return true;
      if(!r.d){ semData++; return false; }
      return (!ini || r.d >= ini) && (!fim || r.d <= fim);
    };
    const out = {atend: D.atend.filter(ok), sla: D.sla.filter(ok), aval: D.aval.filter(ok), transf: D.transf.filter(ok)};
    out.semData = semData;
    return out;
  }
  const filtrar = F => noPeriodo(filtDim(F), F.de, F.ate);
  /* restringe um conjunto já filtrado a um atendente */
  function doAtendente(D, ak){
    return {
      atend: D.atend.filter(r => r.ak === ak), sla: D.sla.filter(r => r.ak === ak), aval: D.aval.filter(r => r.ak === ak),
      transf: D.transf.filter(r => r.dk === ak || r.pk === ak || r.vk === ak)
    };
  }

  /* ---------------- indicadores ---------------- */
  const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  const mapArr = m => [...m.entries()].map(([k, v]) => ({k, v})).sort((a, b) => b.v - a.v);
  const ND = "Não informado";

  /* ak = null -> equipe inteira (calculada sobre os registros, nunca somando percentuais) */
  function stats(D, ak){
    const A = ak ? D.atend.filter(r => r.ak === ak) : D.atend;
    const Sl = ak ? D.sla.filter(r => r.ak === ak) : D.sla;
    const Av = ak ? D.aval.filter(r => r.ak === ak) : D.aval;
    const Tr = ak ? D.transf.filter(r => r.dk === ak || r.pk === ak || r.vk === ak) : D.transf;

    const st = {n: A.length, concluido: 0, aberto: 0, pendente: 0, outro: 0, nd: 0};
    const dias = new Set(), porDia = new Map(), porCanal = new Map(), porDep = new Map();
    A.forEach(a => {
      st[a.stg]++;
      if(a.d){ dias.add(a.d); inc(porDia, a.d); }
      inc(porCanal, a.canal || ND); inc(porDep, a.dep || ND);
    });
    st.diasAtivos = dias.size;
    st.mediaDia = dias.size ? A.filter(a => a.d).length / dias.size : null;
    st.porDia = porDia; st.porCanal = mapArr(porCanal); st.porDep = mapArr(porDep);

    /* SLA */
    const ok = Sl.filter(s => s.res === "ok").length, viol = Sl.filter(s => s.res === "viol").length;
    const porTipo = new Map();
    Sl.forEach(s => {
      if(!porTipo.has(s.tipoRot)) porTipo.set(s.tipoRot, {tipo: s.tipoRot, ok: 0, viol: 0});
      porTipo.get(s.tipoRot)[s.res]++;
    });
    st.sla = {n: ok + viol, ok, viol, pct: (ok + viol) ? ok / (ok + viol) * 100 : null,
              porTipo: [...porTipo.values()].map(t => Object.assign(t, {n: t.ok + t.viol, pct: (t.ok + t.viol) ? t.ok / (t.ok + t.viol) * 100 : null})).sort((a, b) => b.viol - a.viol || b.n - a.n)};

    /* transferências */
    const conh = A.filter(a => a.tc != null), transfAt = conh.filter(a => a.tc >= 1), multi = conh.filter(a => a.tc >= 2);
    const feitas = ak ? Tr.filter(t => t.dk === ak).length : Tr.length;
    const recebidas = ak ? Tr.filter(t => t.pk === ak).length : Tr.length;
    const vinc = ak ? Tr.filter(t => t.vk === ak).length : 0;
    const fluxo = new Map(), motivos = new Map();
    Tr.forEach(t => {
      inc(fluxo, `${t.depO || ND}\u0001${t.depD || ND}`);
      inc(motivos, t.motivo || ND);
    });
    st.transf = {eventos: Tr.length, feitas, recebidas, vinc, conhecidos: conh.length, atendTransf: transfAt.length, multi: multi.length,
                 taxa: conh.length ? transfAt.length / conh.length * 100 : null,
                 fluxo: mapArr(fluxo).map(x => ({o: x.k.split("\u0001")[0], d: x.k.split("\u0001")[1], v: x.v})),
                 motivos: mapArr(motivos), motivosInfo: Tr.filter(t => t.motivo).length};

    /* avaliações */
    const dist = [0, 0, 0, 0, 0, 0];
    let soma = 0, pos = 0, neu = 0, neg = 0;
    Av.forEach(v => { soma += v.nota; dist[Math.round(v.nota)]++; if(v.cls === "pos") pos++; else if(v.cls === "neu") neu++; else neg++; });
    const pesqDen = A.filter(a => a.pesq === true).length;
    const avIds = new Set(D.aval.filter(v => !v.deriv).map(v => v.id));
    const pesqNum = A.filter(a => a.pesq === true && (a.nota != null || avIds.has(a.id))).length;
    st.aval = {n: Av.length, media: Av.length ? soma / Av.length : null, pos, neu, neg, dist, pesqEnviadas: pesqDen, pesqRespondidas: pesqNum,
               resp: pesqDen ? pesqNum / pesqDen * 100 : null};
    return st;
  }

  /* séries por dia / semana / mês */
  function bucket(d, gran){
    if(gran === "mes") return d.slice(0, 7);
    if(gran === "semana"){
      const dt = new Date(d + "T00:00:00Z"), wd = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - wd);
      return dt.toISOString().slice(0, 10);
    }
    return d;
  }
  function serie(D, ak, gran){
    const B = new Map();
    const get = k => { if(!B.has(k)) B.set(k, {k, n: 0, ok: 0, viol: 0, tr: 0, soma: 0, na: 0}); return B.get(k); };
    const A = ak ? D.atend.filter(r => r.ak === ak) : D.atend;
    A.forEach(a => { if(a.d) get(bucket(a.d, gran)).n++; });
    (ak ? D.sla.filter(r => r.ak === ak) : D.sla).forEach(s => { if(s.d){ const b = get(bucket(s.d, gran)); b[s.res]++; } });
    (ak ? D.transf.filter(r => r.dk === ak || r.pk === ak || r.vk === ak) : D.transf).forEach(t => { if(t.d) get(bucket(t.d, gran)).tr++; });
    (ak ? D.aval.filter(r => r.ak === ak) : D.aval).forEach(v => { if(v.d){ const b = get(bucket(v.d, gran)); b.soma += v.nota; b.na++; } });
    return [...B.values()].sort((a, b) => a.k < b.k ? -1 : 1).map(b => ({
      k: b.k, vol: b.n, slaN: b.ok + b.viol, sla: (b.ok + b.viol) ? b.ok / (b.ok + b.viol) * 100 : null, viol: b.viol,
      tr: b.tr, nota: b.na ? b.soma / b.na : null, notaN: b.na
    }));
  }

  /* mês mais recente vs mês anterior, no mesmo intervalo de dias (equivalente) */
  function comparativoMensal(Dsp){
    const datas = [];
    ["atend", "sla", "aval", "transf"].forEach(t => Dsp[t].forEach(r => { if(r.d) datas.push(r.d); }));
    if(!datas.length) return null;
    const ult = datas.reduce((a, b) => a > b ? a : b);
    const y = +ult.slice(0, 4), mo = +ult.slice(5, 7), dia = +ult.slice(8, 10);
    const ym = mo === 1 ? [y - 1, 12] : [y, mo - 1];
    const diaPrev = Math.min(dia, new Date(Date.UTC(ym[0], ym[1], 0)).getUTCDate());
    const cur = {ini: `${y}-${p2(mo)}-01`, fim: ult}, prev = {ini: `${ym[0]}-${p2(ym[1])}-01`, fim: `${ym[0]}-${p2(ym[1])}-${p2(diaPrev)}`};
    return {cur, prev, atual: noPeriodo(Dsp, cur.ini, cur.fim), anterior: noPeriodo(Dsp, prev.ini, prev.fim)};
  }

  root.SF = {
    KEY, NOTA_MIN, NOTA_MAX, ND,
    get S(){ return S; }, carregar, salvar, invalidar(){ NC = null; },
    sem, chave, limpa, nkey, parseNum, parseDT, parsePeriodo, diaDe, classSLA, classStatus, classNota,
    parseTexto, norm, nomeDe, filtDim, noPeriodo, filtrar, doAtendente, stats, serie, comparativoMensal, bucket
  };
  if(typeof localStorage !== "undefined") carregar();
})(typeof window !== "undefined" ? window : globalThis);
