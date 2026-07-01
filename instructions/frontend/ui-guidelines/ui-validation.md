# #ui-validation Validation errors stay close to their cause, appear at the right time

**Placement.** Render validation errors next to the input that caused them, using #ui-canonical-states if not handled by the input itself.
Do not surface a top-of-form summary banner unless the error is genuinely cross-cutting (touches multiple fields and cannot be pinned to one).

**Timing.** Validate on blur, not on keystroke; once a field is in error, re-validate on every keystroke so the error clears the moment it is fixed; always re-validate the whole form on submit.

**Multi-step flows.** In a wizard or step-based form, validate each step's fields before allowing progression to the next step.
Do not defer all validation to the final submit; the user should be able to correct a step before losing its context.

**Async field validation.** When a field requires a server round-trip (e.g. username availability), debounce the check and show an inline busy indicator during the request.
The field **MUST NOT** be submittable while the async check is in-flight.
On resolution, show the inline error or clear it immediately -- never wait for the form submit.

**Server-returned errors.** When the server returns field-level errors, map them back to the originating fields and display them inline, not as a generic top-of-form banner.
Only use the banner for errors that cannot be attributed to a specific field.

**Why.** When a field is invalid, the user looks at the field, not the top of the form.
Validating too early (keystroke) trains users to ignore inline errors; too late (submit-only) hides problems until it is too late to course-correct.
