# #ai-done Agent additions to done

An AI agent's delivered item (#swe-done) is done only when #swe-done holds and, additionally:

1. Every technical debt (#swe-technical-debts) and future-work item (#swe-future-work) raised during this item is re-read and still true -- updated or deleted otherwise.
2. Anything committed to in conversation but never written to an artifact is either landed or recorded (#swe-future-work); the transcript is not a backlog.
3. Remaining open questions are stated explicitly in the final message -- silence is not resolution.
