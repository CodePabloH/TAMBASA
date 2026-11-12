-- =====================================================================
-- PERFIL "SAC" (departamento SAC)  —  rode UMA vez no Supabase > SQL Editor
-- Pode rodar de novo sem problema.
--
-- O que faz: permite o papel 'sac' na tabela "perfis" e cadastra o e-mail do SAC.
-- O painel já sabe o que o SAC pode ver:
--    Rede Do Valle > Dashboard Rede, Performance Teste, Ocorrências e SacFlow  (o resto fica com cadeado)
--
-- ANTES de rodar (passo manual, o SQL não cria o login):
--    Supabase > Authentication > Users > Add user > Create new user
--      e-mail: sac@transdovalle.com.br     senha: (a que você escolher)
--      marque "Auto Confirm User"
--
-- Para tirar o acesso depois:
--    delete from public.perfis where lower(email) = 'sac@transdovalle.com.br';
-- =====================================================================

-- 1) a tabela passa a aceitar o papel 'sac'
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis
  add constraint perfis_papel_check check (papel in ('admin', 'leitor', 'sac'));

-- 2) cadastra o SAC (entra em "perfis", então o painel libera a leitura dos dados publicados)
insert into public.perfis (email, papel) values ('sac@transdovalle.com.br', 'sac')
  on conflict (email) do update set papel = 'sac';

-- conferência: deve listar o SAC com papel 'sac'
select email, papel from public.perfis order by papel, email;
