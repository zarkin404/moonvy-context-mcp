export const CREDENTIALS_MISSING =
  "MOONVY_CREDENTIALS_MISSING: Moonvy credentials are not configured. Set MOONVY_TOKEN or MOONVY_AUTHORIZATION in the MCP environment, or specify an environment file with --env-file, then restart the MCP server. Explain the cause to the user; do not guess missing design information.";
export const TOOL_DESCRIPTION =
  "Read a Moonvy design and return HTML/CSS or Tailwind, a local reference asset manifest, design tokens, implementation guidance and a preview.";
export const URL_INPUT_DESCRIPTION =
  "Full Moonvy design file URL: https://moonvy.com/project/<projectId>/<dirId>/<fileId>.";
export const guide = (name: string) => `Design: ${name}
1. Inspect the target repository, framework, styling, components, fonts and tokens before adapting the reference.
2. Preserve geometry, colors and typography. Apply responsive behavior according to product requirements.
3. Follow the target project's asset conventions and skill constraints. Consider image resolution, completeness and intended use when choosing whether to reuse listed images or replace them with user-provided high-resolution assets. Do not redraw subtrees already covered by a slice.
4. Load all fallback CSS supplied with Tailwind. Do not use the runtime Tailwind CDN.
5. Review conversion diagnostics and compare approximated features with the preview. Tokens are supplementary.
6. Implement interactions, APIs and state only from explicit requirements.
7. Check the finished implementation against the original preview using the project's verification tools when needed.`;
