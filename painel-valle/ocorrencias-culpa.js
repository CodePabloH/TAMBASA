/* ===================== TABELA DE OCORRÊNCIAS × CULPA =====================
   Vem do arquivo "relação ocorrência" (códigos do SSW). Para cada código diz:
     tipo  : como o SSW classifica (BAIXA, ENTREGA, CLIENTE, INFORMATIVO, PENDENCIA, GERAL)
     culpa : "cliente" | "transp" | "baixa"  (baixa = o código é uma baixa, não tem culpa)
   Usado pelo Dashboard Rede (Abertos em atraso) para separar Transportadora x Cliente
   a partir do COD_OCORRENCIA do relatório 150 (Documentos em atraso).
   Para mudar a culpa de um código, edite a linha dele aqui. */
(function(){
  "use strict";

  const T = {
    "01": ["ENTREGA REALIZADA NORMALMENTE", "ENTREGA", "baixa"],
    "02": ["DOCUMENTO EMITIDO EM DUPLICIDADE", "BAIXA", "baixa"],
    "03": ["MERCADORIA DEVOLVIDA AO REMETENTE", "ENTREGA", "baixa"],
    "04": ["CLIENTE RETIRA MERCADORIA", "CLIENTE", "cliente"],
    "05": ["CLIENTE ALEGA MERCAD DESACORDO C/ PEDIDO", "CLIENTE", "cliente"],
    "06": ["DESCONSIDERAR OCORRENCIA ANTERIOR/LANCAM", "INFORMATIVO", "transp"],
    "07": ["CLIENTE RECUSA PAGAR O FRETE", "CLIENTE", "cliente"],
    "08": ["REMETENTE RECUSA RECEBER DEVOLUCAO", "CLIENTE", "cliente"],
    "09": ["LOCAL DE ENTREGA FECHADO/AUSENTE", "CLIENTE", "cliente"],
    "10": ["ENDERECO DE ENTREGA NAO LOCALIZADO", "CLIENTE", "cliente"],
    "11": ["AGUARDANDO AUTORIZACAO PARA REENTREGA", "CLIENTE", "cliente"],
    "15": ["ENTREGA AGENDADA", "INFORMATIVO", "transp"],               // se estiver em atraso, culpa da transportadora
    "16": ["MERCADORIA RETIDA ATE SEGUNDA ORDEM", "CLIENTE", "cliente"],
    "18": ["MERCADORIA ENTREGUE NA TRANSP. REDESPACH", "ENTREGA", "baixa"],
    "19": ["COMPROVANTES / BO / ETC", "INFORMATIVO", "transp"],
    "20": ["REGIAO DE ENTREGA NAO ATENDIDA PELA FILIAL", "INFORMATIVO", "transp"],
    "21": ["AGUARDANDO RETORNO FORN/REDESPACHO", "CLIENTE", "cliente"],
    "23": ["FRETE DO CTRC DE ORIGEM RECEBIDO", "INFORMATIVO", "cliente"],
    "24": ["GREVE OU PARALIZACAO", "CLIENTE", "cliente"],
    "25": ["MERCADORIA EM PROCESSO DEVOLUCAO", "BAIXA", "baixa"],
    "26": ["MERCADORIA TROCADA", "INFORMATIVO", "transp"],
    "27": ["AGUARDANDO AUTORIZACAO P/ DEVOLUCAO", "CLIENTE", "cliente"],
    "28": ["FALTA EM PROCESSO DE BUSCAS", "PENDENCIA", "transp"],
    "29": ["DEVOLUCAO AUTORIZADA", "INFORMATIVO", "transp"],
    "30": ["EXCESSO DE VEICULOS NA ENTREGA", "CLIENTE", "cliente"],
    "31": ["LIMPEZA DE RELATORIO, EMISSAO INTERNA E", "BAIXA", "baixa"],
    "32": ["SEGUNDA TENTATIVA DE ENTREGA", "CLIENTE", "cliente"],
    "33": ["AVARIA NA TRANSFERENCIA", "PENDENCIA", "transp"]
  };

  const cod2 = c => { c = String(c == null ? "" : c).trim(); return /^\d+$/.test(c) ? c.padStart(2, "0") : c; };

  window.OcorCulpa = {
    tabela: T,
    cod: cod2,
    // { cod, descr, tipo, culpa } ou null se o código não está na tabela
    info(c){
      const k = cod2(c), x = T[k];
      return x ? { cod: k, descr: x[0], tipo: x[1], culpa: x[2] } : null;
    }
  };
})();
