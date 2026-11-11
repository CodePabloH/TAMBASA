-- =====================================================================
-- REGISTRO DE ACESSOS (IP + dispositivo) — só o ADMIN consulta
-- Rode UMA vez no Supabase > SQL Editor, DEPOIS de supabase-sincronizacao.sql
-- e supabase-seguranca.sql (usa eh_admin() e eh_usuario()). Pode rodar de novo.
--
-- Como funciona:
--   * O navegador chama registrar_acesso() ao entrar (login) e ao reabrir o painel
--     com a sessão já aberta (1 vez por aba).
--   * O IP NÃO vem do navegador: a própria função lê o IP que o servidor viu
--     (cabeçalho cf-connecting-ip / x-real-ip), então ninguém consegue falsificar.
--   * E-mail e papel vêm do login (JWT), não do que o navegador mandar.
--   * Só o admin lê/apaga. Limpeza automática dos registros com mais de 180 dias.
-- =====================================================================

create table if not exists public.acessos (
  id        bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  email     text not null,
  papel     text,
  evento    text not null check (evento in ('login','sessao')),
  ip        text,
  ua        text,
  sessao    text,
  rota      text,
  constraint acessos_ua_tam check (ua is null or char_length(ua) <= 400)
);

create index if not exists acessos_criado_idx on public.acessos (criado_em desc);
create index if not exists acessos_email_idx  on public.acessos (lower(email), criado_em desc);
create index if not exists acessos_ip_idx     on public.acessos (ip);

alter table public.acessos enable row level security;

-- ninguém insere direto na tabela (só pela função); só admin lê e apaga
drop policy if exists acessos_ler_admin on public.acessos;
create policy acessos_ler_admin on public.acessos
  for select to authenticated using (public.eh_admin());

drop policy if exists acessos_apagar_admin on public.acessos;
create policy acessos_apagar_admin on public.acessos
  for delete to authenticated using (public.eh_admin());

create or replace function public.registrar_acesso(p_evento text, p_sessao text, p_ua text, p_rota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h      json;
  v_ip   text;
  v_mail text := lower(auth.jwt() ->> 'email');
  v_pap  text;
begin
  if v_mail is null or not public.eh_usuario() then return; end if;
  if p_evento not in ('login','sessao') then return; end if;

  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  v_ip := nullif(trim(coalesce(
            h ->> 'cf-connecting-ip',
            h ->> 'x-real-ip',
            split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)
          )), '');

  begin select papel into v_pap from public.perfis where lower(email) = v_mail limit 1;
  exception when others then v_pap := null; end;

  insert into public.acessos (email, papel, evento, ip, ua, sessao, rota)
  values (v_mail, v_pap, p_evento, v_ip, left(p_ua, 400), left(p_sessao, 60), left(p_rota, 80));

  -- limpeza: mantém 180 dias
  delete from public.acessos where criado_em < now() - interval '180 days' and random() < 0.02;
end;
$$;

revoke all on function public.registrar_acesso(text, text, text, text) from public, anon;
grant execute on function public.registrar_acesso(text, text, text, text) to authenticated;
