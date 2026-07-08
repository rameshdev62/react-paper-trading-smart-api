<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Environment Security Rule

Do not share environment variables, credentials, API keys, or secrets publicly. Ensure `.env` files are listed in `.gitignore` and never committed to version control. Always use `.env.example` with dummy values for public sharing or repository check-ins.
