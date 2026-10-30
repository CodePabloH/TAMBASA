-- =====================================================================
-- SINCRONIZAÇÃO ADMIN -> USUÁRIOS  (rode UMA vez no Supabase > SQL Editor)
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

-- 1) Tabela de perfis (se você já tem, nada muda)
create table if not exists public.perfis (
  email text primary key,
  papel text not null default 'leitor' check (papel in ('admin','leitor'))
);
alter table public.perfis enable row level security;

-- cada pessoa logada lê apenas a própria linha (o painel precisa disso para saber o papel)
drop policy if exists perfis_ler_proprio on public.perfis;
create policy perfis_ler_proprio on public.perfis
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- >>> TROQUE pelo SEU e-mail de admin (e adicione os demais usuários como 'leitor'):
insert into public.perfis (email, papel) values
  ('phpablo09@gmail.com', 'admin'),
  ('supervisao@gmail.com', 'leitor')
  on conflict (email) do update set papel = excluded.papel;

-- 2) Função: "o usuário logado é admin?"
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis
    where lower(email) = lower(auth.jwt() ->> 'email') and papel = 'admin'
  );
$$;
grant execute on function public.eh_admin() to authenticated;

-- 3) Tabela dos dados publicados
create table if not exists public.painel_dados (
  chave text not null,
  parte int  not null default 0,
  valor text not null,
  atualizado_em timestamptz not null default now(),
  primary key (chave, parte)
);
alter table public.painel_dados enable row level security;

drop policy if exists dados_ler on public.painel_dados;
create policy dados_ler on public.painel_dados
  for select to authenticated using (true);

drop policy if exists dados_admin_inserir on public.painel_dados;
create policy dados_admin_inserir on public.painel_dados
  for insert to authenticated with check (public.eh_admin());

drop policy if exists dados_admin_alterar on public.painel_dados;
create policy dados_admin_alterar on public.painel_dados
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists dados_admin_apagar on public.painel_dados;
create policy dados_admin_apagar on public.painel_dados
  for delete to authenticated using (public.eh_admin());
