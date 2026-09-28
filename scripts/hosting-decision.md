# Hosting assessment, 2026-09-26

Working dataset: 9.82M Yargitay decisions. Optimized SQLite files require about
27.42 GB together. Allow roughly 80-100 GB for the OS, current release,
replacement release, and staged archives. This is an operational estimate,
not a vendor minimum. Build indexes locally and upload validated artifacts;
do not rebuild or redownload the corpus at each web-service startup.

## Preferred zero-cost trial

Oracle Always Free A1: current documentation lists 1,500 OCPU hours and 9,000
GB memory-hours per month, equivalent to 2 OCPUs and 12 GB RAM continuously.
The combined boot/block-volume allowance is 200 GB in the home region.
Our storage requirement fits this allowance. Use an Always Free-eligible
Ubuntu A1 instance with 100 GB total disk as an initial deployment target,
then benchmark the actual workload before treating it as production-ready.

Capacity is not guaranteed in the chosen home region. Oracle may reclaim idle
free instances; keep validated backups independently. No instance was created,
no account was upgraded, and no billing commitment was made.

Source: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Alternatives

Render's Free web service cannot attach a persistent disk. Repeatedly downloading
about 13 GB at startup is unsuitable for this release. Paid persistent disks
are listed at $0.25/GB/month, so 80 GB costs $20/month before compute and other
charges. This is convenient but does not meet the zero-cost goal.

Sources: https://render.com/docs/free and https://render.com/docs/disks
Pricing: https://render.com/pricing

Hetzner is a paid fallback. Its June 2026 price-adjustment table lists CX33 at
EUR 8.49/month in Germany/Finland, excluding IPv4 and VAT. Confirm the current
order screen, disk size and total at purchase time; no server was ordered.

Source: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/

## Deployment work remaining

1. Check available Oracle account and eligible capacity in its home region.
2. Install Node and verify sqlite3/FTS5 on the target ARM runtime.
3. Upload both release artifacts and verify the decompressed hashes.
4. Set LEGAL_INDEX_DB_PATH and LEGAL_FULLTEXT_DB_PATH to persistent local files.
5. Run the app with an early-bound port and explicit index readiness checks.
6. Validate filtering, full-text ranking/snippets, concurrency, and memory.
7. Switch traffic only after validation, retaining the old deployment for rollback.

Metadata audit backfill and its evidence store are still a separate release task.
