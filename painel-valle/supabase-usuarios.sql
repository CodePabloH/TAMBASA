-- =====================================================================
-- USUÁRIOS: nome de boas-vindas + gestão pelo ADMIN (tela "Usuários (admin)")
-- Rode UMA vez no Supabase > SQL Editor, DEPOIS de supabase-sincronizacao.sql,
-- supabase-seguranca.sql e supabase-sac.sql. Pode rodar de novo sem problema.
--
-- O que faz:
--   1) Acrescenta em "perfis" as colunas  nome  e  saudacao  (texto livre, opcional).
--      Ex.: nome = 'Patrícia'  ->  a tela inicial mostra "Boa tarde, Patrícia."
--           saudacao = 'Olá, {nome}!'  ->  mostra "Olá, Patrícia!"  ({nome} é trocado pelo nome)
--   2) O ADMIN passa a ler/alterar/incluir/apagar linhas de "perfis" (só pela tela de Usuários).
--      Cada pessoa continua lendo só a própria linha (política perfis_ler_proprio) e
--      NÃO consegue alterar nada — quem controla é você.
--   3) O admin nunca consegue apagar o próprio perfil por engano.
-- =====================================================================

alter table public.perfis add column if not exists nome     text;
alter table public.perfis add column if not exists saudacao text;

alter table public.perfis drop constraint if exists perfis_nome_tam;
alter table public.perfis add constraint perfis_nome_tam
  check (nome is null or char_length(nome) <= 60);
alter table public.perfis drop constraint if exists perfis_saudacao_tam;
alter table public.perfis add constraint perfis_saudacao_tam
  check (saudacao is null or char_length(saudacao) <= 80);

-- admin enxerga todos os perfis (os demais só a própria linha, política já existente)
drop policy if exists perfis_admin_ler on public.perfis;
create policy perfis_admin_ler on public.perfis
  for select to authenticated using (public.eh_admin());

drop policy if exists perfis_admin_inserir on public.perfis;
create policy perfis_admin_inserir on public.perfis
  for insert to authenticated with check (public.eh_admin());

drop policy if exists perfis_admin_alterar on public.perfis;
create policy perfis_admin_alterar on public.perfis
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists perfis_admin_apagar on public.perfis;
create policy perfis_admin_apagar on public.perfis
  for delete to authenticated
  using (public.eh_admin() and lower(email) <> lower(auth.jwt() ->> 'email'));

-- Patrícia usa o login tambasa@transdovalle.com.br: já deixa o nome dela definido
-- (depois você muda quando quiser pela tela "Usuários (admin)", sem mexer no SQL)
update public.perfis set nome = 'Patrícia' where lower(email) = 'tambasa@transdovalle.com.br';
select email, papel, nome, saudacao from public.perfis order by papel, email;
