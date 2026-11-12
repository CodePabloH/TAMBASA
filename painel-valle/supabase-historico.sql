-- =====================================================================
-- HISTÓRICO DE VERSÕES + RESUMO  (rode UMA vez no Supabase > SQL Editor)
-- Rode DEPOIS do supabase-sincronizacao.sql. Pode rodar de novo sem problema.
--
-- Cria as funções que o painel chama:
--   resumo_painel()            -> tamanho de cada item publicado (usado na trava "APAGAR ou REDUZIR")
--   salvar_historico(forcar)   -> guarda uma cópia da versão publicada ANTES de cada publicação
--   listar_historico()         -> lista as cópias guardadas (botão "Restaurar versão anterior")
--   restaurar_historico(versao)-> devolve aos usuários uma cópia guardada
--
-- Espaço: cada cópia ocupa o mesmo que os dados publicados (hoje ~20 MB).
-- O plano Free tem 500 MB, então guardamos só as últimas 8 cópias (mude abaixo se quiser).
-- =====================================================================

-- 0) Limpeza de versões antigas das funções (se você já tentou instalar antes, nomes/assinaturas
--    diferentes causam erro ou ambiguidade). Remove TODAS as variações destes 4 nomes.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('resumo_painel','salvar_historico','listar_historico','restaurar_historico')
  loop
    execute 'drop function ' || r.f;
  end loop;
end $$;

-- 1) Tabelas do histórico (só as funções abaixo mexem nelas; ninguém lê direto)
create table if not exists public.painel_hist_versoes (
  versao    bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  por       text,
  chaves    int    not null,
  tamanho   bigint not null
);
create table if not exists public.painel_hist_dados (
  versao bigint not null references public.painel_hist_versoes(versao) on delete cascade,
  chave  text   not null,
  parte  int    not null,
  valor  text   not null,
  primary key (versao, chave, parte)
);
alter table public.painel_hist_versoes        enable row level security;
alter table public.painel_hist_dados  enable row level security;
-- (sem policies de propósito: acesso só pelas funções security definer abaixo)

-- 2) Resumo do que está publicado: um item por chave
create or replace function public.resumo_painel()
returns table (chave text, partes bigint, tamanho bigint)
language sql stable security definer set search_path = public as $$
  select d.chave, count(*)::bigint, coalesce(sum(length(d.valor)), 0)::bigint
  from public.painel_dados d
  where d.chave <> '__meta'
  group by d.chave;
$$;

-- 3) Guarda uma cópia da versão publicada agora.
--    forcar = false (publicação automática): no máximo 1 cópia a cada 15 minutos.
--    forcar = true  (botão Publicar / Restaurar): sempre guarda.
create or replace function public.salvar_historico(forcar boolean default false)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id      bigint;
  v_chaves  int;
  v_tamanho bigint;
  v_ultima  timestamptz;
  c_manter  constant int := 8;          -- quantas cópias guardar
  c_intervalo constant interval := '15 minutes';
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode guardar histórico.' using errcode = '42501';
  end if;

  select count(distinct chave), coalesce(sum(length(valor)), 0)
    into v_chaves, v_tamanho
    from public.painel_dados where chave <> '__meta';
  if v_chaves = 0 then return null; end if;     -- nada publicado ainda

  select max(criado_em) into v_ultima from public.painel_hist_versoes;
  if not forcar and v_ultima is not null and now() - v_ultima < c_intervalo then
    return null;
  end if;

  insert into public.painel_hist_versoes (por, chaves, tamanho)
    values (lower(auth.jwt() ->> 'email'), v_chaves, v_tamanho)
    returning versao into v_id;

  insert into public.painel_hist_dados (versao, chave, parte, valor)
    select v_id, chave, parte, valor from public.painel_dados where chave <> '__meta';

  -- mantém só as últimas c_manter cópias
  delete from public.painel_hist_versoes
   where versao not in (select versao from public.painel_hist_versoes order by criado_em desc, versao desc limit c_manter);

  return v_id;
end;
$$;

-- 4) Lista as cópias (a mais recente primeiro)
create or replace function public.listar_historico()
returns table (versao bigint, criado_em timestamptz, por text, chaves int, tamanho bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode ver o histórico.' using errcode = '42501';
  end if;
  return query
    select h.versao, h.criado_em, h.por, h.chaves, h.tamanho
    from public.painel_hist_versoes h
    order by h.criado_em desc, h.versao desc;
end;
$$;

-- 5) Restaura uma cópia: os usuários passam a ver essa versão.
--    A versão que estava publicada é guardada antes, então dá para desfazer.
create or replace function public.restaurar_historico(p_versao bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_n      int;
  v_chaves int;
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode restaurar.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.painel_hist_versoes where versao = p_versao) then
    raise exception 'Versão % não encontrada no histórico.', p_versao;
  end if;

  -- copia a versão escolhida para fora do histórico (a limpeza de cópias antigas não pode apagá-la no meio)
  create temp table _restaurar on commit drop as
    select chave, parte, valor from public.painel_hist_dados where versao = p_versao;

  perform public.salvar_historico(true);       -- guarda o que está publicado agora

  delete from public.painel_dados;
  insert into public.painel_dados (chave, parte, valor) select chave, parte, valor from _restaurar;

  select count(*), count(distinct chave) into v_n, v_chaves from _restaurar;

  -- por último, a nova versão (é ela que avisa os leitores)
  insert into public.painel_dados (chave, parte, valor)
  values ('__meta', 0, jsonb_build_object(
    'versao', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'por',    lower(auth.jwt() ->> 'email'),
    'linhas', v_n,
    'chaves', v_chaves
  )::text);
end;
$$;

-- 6) Permissões: só quem está logado pode chamar (e as funções de histórico ainda checam se é admin)
revoke all on function public.resumo_painel()                from public, anon;
revoke all on function public.salvar_historico(boolean)      from public, anon;
revoke all on function public.listar_historico()             from public, anon;
revoke all on function public.restaurar_historico(bigint)    from public, anon;
grant execute on function public.resumo_painel()             to authenticated;
grant execute on function public.salvar_historico(boolean)   to authenticated;
grant execute on function public.listar_historico()          to authenticated;
grant execute on function public.restaurar_historico(bigint) to authenticated;
