VILLA CAETANO - SUPABASE VERSION

1. Create a Supabase project.
2. Open Project Settings -> API.
3. Copy Project URL and Publishable key.
4. Open supabase.js and replace the two PASTE_... values.
5. In Supabase -> SQL Editor, paste ALL of schema.sql and click Run.
6. In Supabase -> Authentication -> Providers -> Google, enable Google.
   You will need the Supabase Email/Password authentication Client ID and Secret from Google Cloud.
7. In Supabase -> Authentication -> URL Configuration:
   Site URL: https://villacaetano.com/villa-caetano-app/
   Redirect URL: https://villacaetano.com/villa-caetano-app/
   Also add http://localhost:... only if testing locally.
8. Upload index.html, app.js, supabase.js, style.css to the GitHub Pages folder/repository.
9. Open https://villacaetano.com/villa-caetano-app/
10. Sign in with email and password. The FIRST user who signs up becomes Owner automatically.
11. Open Admin. Add/manage other users there and set roles:
    Owner, Property Manager, Caretaker, Contractor, Reporter.

FILES:
- index.html: app UI
- app.js: application logic
- supabase.js: Supabase URL/key
- style.css: UI
- schema.sql: tables, RLS, storage bucket and security

PHOTO / BILL UPLOADS:
- Issues: upload photos/documents
- Recurring tasks: upload proof/documents
- Bills: upload bill/receipt PDF or image
- Expenses: upload receipt/invoice
Files are stored in a PRIVATE Supabase Storage bucket named property-files.
The app generates temporary signed URLs to view files.

IMPORTANT SECURITY:
Only use the Supabase Publishable key in the browser. NEVER put a service_role/secret key into supabase.js.
RLS policies protect database access. Storage is private and also protected by Storage policies.

GOOGLE OAUTH NOTE:
In Google Cloud Console, the OAuth redirect URI must be the Supabase callback URL shown in Supabase Authentication -> Providers -> Google. Do not guess it; copy the exact URL shown by Supabase.


LOGIN METHOD
This version uses native Supabase Email/Password authentication. Do not configure Google OAuth. Invite users from Supabase Dashboard -> Authentication -> Users -> Add user -> Send invitation. The invited user sets a password from the invitation email and then signs into the app with their email and password.


PASSWORD / INVITATION FLOW
- The app now handles Supabase invite links and password-reset links.
- Add the production app URL to Supabase Auth -> URL Configuration -> Redirect URLs:
  https://villacaetano.com/villa-caetano-app/
- When an invited user clicks the invitation, they are returned to the app and shown a Set your password screen.
- When Forgot password is used, the reset link returns to the app and shows the same password form.
- Do not put the Supabase secret/service-role key in the browser.
