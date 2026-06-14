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

-- Open read+write is intentional: the anon key already scopes per-deployment and Choco only
-- stores label + address. Lock to authenticated users with a wallet claim if RLS is added later.
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts for select using (true);

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert with check (true);

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update using (true) with check (true);

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete using (true);
