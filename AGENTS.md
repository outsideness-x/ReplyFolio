# ReplyFolio

- Build an Instagram Direct automation application for one EdTech business, without AI.
- Keep every independently completed change in a separate Git commit, as requested by the owner. Never squash existing commits without permission.
- Frontend: React, TypeScript, Vite. Hosting target: Cloudflare Pages. Backend: Supabase Free and official Meta Instagram API.
- Clearly distinguish local demonstration data from connected production data. Never report a real Instagram connection or delivery without evidence.
- Keep secrets out of source, browser bundles, public database schemas, and logs.
- Enforce workspace membership in database policies and server endpoints. Webhooks require Meta signatures; scheduled workers require a separate secret.
- Persist incoming events and outbound work before acknowledging them. Do not blindly retry an outbound request whose result is ambiguous.
- Verify substantive changes with relevant tests and a production build. Verify the UI in a browser.
- Cloud projects and Instagram credentials do not exist yet. Prepare migrations, functions, setup instructions, and local simulation; do not invent credentials or create external projects.

- Visual direction: minimalist, aesthetic application UI inspired by the simplicity of Muse. Do not derive the palette or layout from photos in its Instagram feed. Use restrained colors, generous spacing, readable typography, and few decorative elements.
- Updated direction: exceptionally polished Arc/Linear-inspired landing and workspace. Keep team email addresses out of every repository file and browser asset; provisioning lives outside this repository. Closed-team access is enforced server-side, with email proof and mandatory MFA. Never promise invulnerability or claim cloud security was verified without a deployed environment.
- Final visual preference: strict, minimal Muse/Linear/Arc feel, no gradients, no handwritten fonts. Remove the decorative welcome banner from the dashboard; start with real metrics and working sections. Create an original composition.
- Expanded product: add iOS/Android product analytics, Instagram insights, and cross-channel relationships. For now these are clearly labeled UI previews with no invented measurements or new data integrations. Keep the current brand until the owner chooses its broader replacement.
