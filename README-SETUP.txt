VILLA CAETANO PROPERTY MANAGEMENT APP
====================================

Fresh static app: HTML/CSS/JavaScript + Supabase.
No Node.js, npm, Firebase, Google OAuth, or service-role key is required.

1. CREATE SUPABASE PROJECT
--------------------------
Create a new Supabase project.

2. GET PROJECT URL + PUBLISHABLE KEY
-------------------------------------
In Supabase, open Project Settings → API.
Copy:
- Project URL
- Publishable key

Open supabase.js and replace:
PASTE_YOUR_SUPABASE_PROJECT_URL_HERE
PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE

Do NOT paste a service_role/secret key.

3. RUN THE DATABASE SCHEMA
--------------------------
Open Supabase → SQL Editor.
Open schema.sql.
Paste the entire file and Run.

4. AUTHENTICATION SETTINGS
--------------------------
Open Supabase → Authentication → URL Configuration.

Set Site URL to:
https://villacaetano.com/villa-caetano-app/

Add the same URL to Redirect URLs.

For local testing, you may also add:
http://localhost:8000/

5. EMAIL/PASSWORD AUTH
----------------------
Supabase Authentication should have Email provider enabled.

This app uses native email/password authentication only.

To invite a user:
Supabase → Authentication → Users → Invite user.

The invitation/recovery link returns to the app, where the user can set a password.

6. FIRST OWNER
-------------
The database trigger automatically creates a profile with the default Reporter role.

After creating your first user, run this ONCE in Supabase SQL Editor:

update public.profiles
set role = 'owner',
    full_name = 'YOUR NAME'
where email = 'YOUR EMAIL';

Replace the values.

7. GITHUB PAGES
---------------
Upload these files to:
villa-caetano-app/

Expected structure:
villa-caetano-app/
  index.html
  style.css
  app.js
  supabase.js
  logo.svg
  schema.sql
  README-SETUP.txt

Enable GitHub Pages for the repository/branch containing the folder.

The target URL is:
https://villacaetano.com/villa-caetano-app/

8. TEST
-------
A. Login
B. Dashboard
C. Create maintenance issue
D. Assign a user
E. Upload JPG/PDF
F. Create recurring task and complete it
G. Create a bill and use Pay Bill
H. Create manual expense
I. Check dashboard actual vs projected numbers
J. Test a caretaker/contractor/reporter account
K. Test DELETE and confirm it requires DELETE

9. SECURITY
-----------
The browser contains only:
- Supabase Project URL
- Supabase publishable key

Never place:
- service_role
- secret
- admin API key
in any frontend file.

RLS is enabled for application tables and private storage.

10. IMPORTANT LIMITATION
------------------------
Supabase's client-side frontend cannot securely delete users from
Authentication. The Admin screen therefore disables/enables their
application profile instead. Actual Auth-user deletion should be done
from Supabase Authentication → Users or via a future secure Edge
Function if you later want that workflow.

11. BRANDING
------------
logo.svg is a temporary Villa Caetano-style logo. If you provide the
real Villa Caetano logo later, replace logo.svg with the real asset.

12. NO BUILD PROCESS
-------------------
This is a static site. There is no npm install, Node.js, bundler, or
build command.


UI UPDATE
The dashboard now uses an InApp-inspired Bootstrap-style layout and Villa Caetano branding. Uploaded issue photos/documents can be viewed from the maintenance Actions menu or the issue edit window.
