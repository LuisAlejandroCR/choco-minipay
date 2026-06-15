-- Choco MiniPay contacts. Supabase scope is INTENTIONALLY narrow: only contacts ("Receipts")
-- per MiniPay user. Transaction history lives on-chain (Swap + cKES Transfer events) and the
-- audit trail lives in ChocoAuditLog. Do not add tables for transactions or receipts-as-invoices
-- here -- that breaks the on-chain source-of-truth invariant.

drop table if exists public.transactions cascade;
drop table if exists public.receipts cascade;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text not null,
  label text not null,
  wallet_address text not null,
  payment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One label per MiniPay user (case-insensitive). "dad" and "Dad" collide on purpose.
create unique index if not exists contacts_owner_label_idx
  on public.contacts (owner_wallet, lower(label));

create index if not exists contacts_owner_idx on public.contacts (owner_wallet);
create index if not exists contacts_owner_address_idx on public.contacts (owner_wallet, wallet_address);

create or replace function public.contacts_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.contacts_touch_updated_at();

alter table public.contacts enable row level security;

-- Each wallet owner can only see and modify their own contacts.
-- The wallet_address claim is written into app_metadata by the auth-wallet Edge Function
-- when the user signs in with their wallet (EIP-191 personal_sign). Never use user_metadata
-- here because users can edit their own user_metadata — app_metadata is server-controlled.
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts
  for select to authenticated
  using (owner_wallet = (auth.jwt() -> 'app_metadata' ->> 'wallet_address'));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (owner_wallet = (auth.jwt() -> 'app_metadata' ->> 'wallet_address'));

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update to authenticated
  using (owner_wallet = (auth.jwt() -> 'app_metadata' ->> 'wallet_address'))
  with check (owner_wallet = (auth.jwt() -> 'app_metadata' ->> 'wallet_address'));

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete to authenticated
  using (owner_wallet = (auth.jwt() -> 'app_metadata' ->> 'wallet_address'));
