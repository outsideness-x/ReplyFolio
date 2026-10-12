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
