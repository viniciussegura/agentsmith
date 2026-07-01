# #ui-notifications Transient notifications

A transient notification (toast, snackbar) is for a brief, non-critical acknowledgement that needs no action and is safe to miss.
- **Never** use a transient, auto-dismissing notification as the sole surface for an error, or for information the user must act on -- those belong in an inline canonical state (#ui-canonical-states) that persists until resolved.
- A toast **complements**, never replaces, the inline state: it may confirm a successful action, but the durable record of what happened lives in the view.
- Give the user enough time to read a toast and a manual way to dismiss it; **never** stack toasts so they obscure each other or the content beneath.
