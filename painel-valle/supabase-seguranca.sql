-- =====================================================================
-- SEGURANÇA: só quem está na tabela "perfis" lê os dados  (rode UMA vez no SQL Editor)
-- Rode DEPOIS do supabase-sincronizacao.sql e do supabase-historico.sql.
-- Pode rodar de novo sem problema.
--
-- Antes: qualquer pessoa LOGADA lia todos os dados publicados.
-- Agora: só lê quem tem o e-mail na tabela "perfis" (admin ou leitor).
--
-- Para dar acesso a alguém novo:  crie o usuário em Authentication > Users e rode
--     insert into public.perfis (email, papel) values ('fulano@empresa.com', 'leitor');
-- Para tirar o acesso:
--     delete from public.perfis where lower(email) = 'fulano@empresa.com';
-- =====================================================================

-- 1) Ninguém perde acesso hoje: quem já existe em Authentication entra em "perfis" como leitor
--    (se já estiver lá, nada muda — admin continua admin).
insert into public.perfis (email, papel)
  select lower(u.email), 'leitor'
  from auth.users u
  where u.email is not null
  on conflict (email) do nothing;

-- seu e-mail sempre como admin
insert into public.perfis (email, papel) values ('phpablo09@gmail.com', 'admin')
  on conflict (email) do update set papel = 'admin';

-- 2) Função: "o usuário logado está na lista de perfis?"
create or replace function public.eh_usuario() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.eh_usuario() from public, anon;
grant execute on function public.eh_usuario() to authenticated;

-- 3) Leitura dos dados: só para quem está em perfis
drop policy if exists dados_ler on public.painel_dados;
create policy dados_ler on public.painel_dados
  for select to authenticated using (public.eh_usuario());

-- (as regras de gravar continuam só para admin, e o histórico só pelas funções de admin)
