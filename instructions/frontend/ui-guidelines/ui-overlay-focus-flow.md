# #ui-overlay-focus-flow Overlays preserve and restore context

When a dialog, drawer, or popover opens, move focus to its first actionable element (or the container) and trap focus within it while open.
On close, return focus to the element that opened it -- or the nearest logical predecessor if it is gone -- and restore the page's scroll position.
Escape closes the topmost overlay; on mobile or SPA routing, the back gesture closes the overlay rather than navigating away from the page.
This is the user-control concern; #front-a11y covers the ARIA mechanics. An overlay that drops the user's place forces them to re-find their task.
