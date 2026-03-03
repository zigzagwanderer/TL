# Front-End Architecture Rules (MANDATORY)

## 1. No Module System
- We are NOT using Webpack, Vite, or ES Modules.
- We are using **Babel Standalone** in the browser.
- NEVER use `import` or `export` statements. 
- All dependencies are global (e.g., use `React.useState` instead of `useState`).

## 2. Script Loading Dependency Order
- Components must be defined in the global scope via `var` or `function`.
- If Component A uses Component B, Component B MUST be loaded in `index.html` BEFORE Component A.
- Always check `index.html` before adding a new component to ensure the `<script>` tag order is correct.

## 3. Syntax Constraints (Legacy Compatibility)
- Use `var` for variables (avoid `const`/`let` to prevent scope shadowing issues in global scripts).
- Use `function Name() {}` instead of arrow functions `const Name = () => {}`.
- This ensures the Babel Standalone transpiler and global hoisting behave predictably.

## 4. File Referencing
- Always include the `.js` extension in `index.html` script tags.
- Verify that every new file created is manually added to the `index.html` file in the correct dependency block.