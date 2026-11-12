-- =====================================================================
-- MONITOR EM TEMPO REAL (erros de TODOS os usuários)
-- Rode UMA vez no Supabase > SQL Editor, DEPOIS do supabase-sincronizacao.sql
-- e do supabase-seguranca.sql (usa as funções eh_admin() e eh_usuario()).
-- Pode rodar de novo sem problema.
--
-- O que faz:
--   1) Tabela monitor_eventos: cada navegador (admin ou leitor) grava aqui seus
--      erros/avisos (script, rede, sincronização...). Só ERROS e AVISOS são gravados
--      (poucas linhas), nunca dados do painel.
--   2) Só o ADMIN lê e apaga. Leitor só consegue INSERIR eventos com o próprio e-mail.
--   3) Liga o Realtime da tabela: o admin recebe cada erro na hora, sem recarregar.
--   4) Canal privado "painel-presenca" (quem está online agora): só quem está em
--      "perfis" entra. Não grava nada no banco.
-- =====================================================================

-- 1) Tabela
create table if not exists public.monitor_eventos (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),   -- quando chegou ao servidor
  ocorreu_em  timestamptz not null default now(),   -- quando aconteceu no navegador
  email       text not null,
  papel       text,
  sessao      text,                                  -- identifica a aba/navegador
  src         text not null,                         -- js, site, supabase, sync, cdn, rede, console...
  nivel       text not null check (nivel in ('erro','aviso','info','ok')),
  msg         text not null,
  det         text,
  n           int  not null default 1,               -- quantas vezes se repetiu
  rota        text,                                  -- tela do painel em que estava
  versao      text,                                  -- versão dos dados deste navegador
  ua          text,                                  -- navegador / sistema
  url         text,
  constraint monitor_msg_tam check (char_length(msg) <= 500),
  constraint monitor_det_tam check (det is null or char_length(det) <= 3000)
);

create index if not exists monitor_eventos_ocorreu_idx on public.monitor_eventos (ocorreu_em desc);
create index if not exists monitor_eventos_email_idx   on public.monitor_eventos (lower(email), ocorreu_em desc);

alter table public.monitor_eventos enable row level security;

-- inserir: qualquer usuário cadastrado em "perfis", e só com o PRÓPRIO e-mail
drop policy if exists monitor_inserir on public.monitor_eventos;
create policy monitor_inserir on public.monitor_eventos
  for insert to authenticated
  with check (public.eh_usuario() and lower(email) = lower(auth.jwt() ->> 'email'));

-- ler e apagar: só admin
drop policy if exists monitor_ler_admin on public.monitor_eventos;
create policy monitor_ler_admin on public.monitor_eventos
  for select to authenticated using (public.eh_admin());

drop policy if exists monitor_apagar_admin on public.monitor_eventos;
create policy monitor_apagar_admin on public.monitor_eventos
  for delete to authenticated using (public.eh_admin());

-- 2) Realtime: o admin recebe cada INSERT na hora
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'monitor_eventos'
  ) then
    alter publication supabase_realtime add table public.monitor_eventos;
  end if;
exception when others then
  raise notice 'Não consegui ligar o Realtime por SQL (%). Ligue em Database > Replication > supabase_realtime > monitor_eventos.', sqlerrm;
end $$;

-- 3) Canal privado de presença ("usuários online agora")
do $$
begin
  execute 'drop policy if exists painel_presenca_ler on realtime.messages';
  execute 'create policy painel_presenca_ler on realtime.messages
             for select to authenticated
             using (public.eh_usuario() and (select realtime.topic()) = ''painel-presenca'')';
  execute 'drop policy if exists painel_presenca_enviar on realtime.messages';
  execute 'create policy painel_presenca_enviar on realtime.messages
             for insert to authenticated
             with check (public.eh_usuario() and (select realtime.topic()) = ''painel-presenca'')';
exception when others then
  raise notice 'Não consegui criar as regras do canal de presença (%). O monitor funciona, só não mostra "usuários online".', sqlerrm;
end $$;

-- 4) Limpeza: o painel apaga sozinho (quando o admin abre) eventos com mais de 7 dias.
--    Se quiser apagar agora:   delete from public.monitor_eventos where criado_em < now() - interval '7 days';
