# Local search UI QA

Tested against the optimized 9.82M decision index at localhost:3002/tck.html.
No cloud deployment or source-index modification was performed.

Changes:
- Added previous/next result pages using the existing offset/has_more API.
- Paging retains the submitted filters; editing filters clears stale results.
- AbortController plus a request generation check prevents outdated responses
  from rendering after mode switches or subsequent searches.
- Highlighting uses search text only, not court/date/filter labels.
- Arrow-key tab navigation keeps focus on the selected tab.
- Paging scrolls to the beginning of the new results.

Browser checks:
- Court browse returned 20 records; next page showed 21-40 with a different
  first decision; previous restored the original first decision.
- Full-text search for tarim sigortaliligi returned 20 results and highlighted
  terms in the decision excerpts.
- Switching from a running sanik search to citation mode left no stale results.
- TCK 125 + 4. Ceza Dairesi + 2025 returned matching decisions.
- Reversed date bounds showed a validation message and cleared results.
- A nonexistent term showed the empty state and hid pagination.
- Cmd+F selected text search; ArrowRight retained focus on the selected tab.
- Screenshots inspected at 390x844 and 1440x900; no horizontal page overflow.
- Browser error log empty during these checks.

Additional readiness checks:
- Status starts as checking and reflects the main index metadata returned by
  the options API; it is no longer a static ready label.
- Disabled-index server showed unavailable status, retry and disabled text input.
- Stopping the actual local server during use produced a readable connection
  error, a retry control, and an enabled search button (no stuck busy state).
- Restart and retry without page reload restored ready state, kept the selected
  court, retained 55 options without duplicates, and returned 20 decisions.
- Three automated tests cover missing-index recovery, network retry, and stale
  options responses. Options requests time out after 10 seconds.

Limits: this is local browser QA, not a concurrency/load test or target-host
benchmark. Live deployment checks remain pending.
