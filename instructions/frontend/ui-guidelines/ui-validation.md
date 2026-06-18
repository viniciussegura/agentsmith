# #ui-validation Validation errors stay close to their cause, appear at the right time

**Placement.** Render validation errors next to the input that caused them, using #ui-canonical-states if not handled by the input itself.
Do not surface a top-of-form summary banner unless the error is genuinely cross-cutting (touches multiple fields and cannot be pinned to one).

**Timing.** Validate on blur, not on keystroke; once a field is in error, re-validate on every keystroke so the error clears the moment it is fixed; always re-validate the whole form on submit.

**Why.** When a field is invalid, the user looks at the field, not the top of the form.
Validating too early (keystroke) trains users to ignore inline errors; too late (submit-only) hides problems until it is too late to course-correct.
