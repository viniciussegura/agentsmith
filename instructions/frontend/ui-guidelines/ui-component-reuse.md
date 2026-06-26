# #ui-component-reuse Component reuse

Before creating a UI element (button, modal, form field, icon, list, empty / loading / error state), search the component library for an existing one and use it (#swe-reuse).
Extract a shared component the second time a markup-and-behavior block is needed -- never copy-paste a component to vary it; parameterize the original.
A one-off built where a shared component already exists, or a second copy that should have been extracted, is a defect.
This binds the abstract #swe-reuse mandate to concrete front-end artifacts: components, hooks, and CSS classes.
