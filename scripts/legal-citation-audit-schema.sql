alter table public.legal_citations
  add column if not exists source_method text not null default 'hf_tag',
  add column if not exists confidence text not null default 'medium',
  add column if not exists quality_status text not null default 'unreviewed',
  add column if not exists conflict_flags jsonb not null default '[]'::jsonb,
  add column if not exists audit_method text not null default '',
  add column if not exists audited_at timestamptz;

create index if not exists idx_legal_citations_quality_status on public.legal_citations (quality_status);
create index if not exists idx_legal_citations_source_method on public.legal_citations (source_method);
create index if not exists idx_legal_citations_audited_at on public.legal_citations (audited_at desc);
