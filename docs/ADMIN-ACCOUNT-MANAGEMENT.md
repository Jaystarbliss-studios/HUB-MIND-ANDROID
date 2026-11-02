# Administrator account management and Jess configuration

## Required production environment variable

The role-change and account-deletion endpoint uses Firebase's administrative REST APIs. The frontend Firebase web API key is not sufficient to delete or disable other users.

Set **FIREBASE_SERVICE_ACCOUNT_JSON** in the Hub-Mind server/Netlify site's environment variables to the JSON content of a dedicated Firebase service-account key for the same Firebase project. It must have the permissions required to read/update Firestore user profiles and manage Firebase Authentication accounts. Never put this JSON in the repository, browser bundle, local storage, or a public environment variable.

Also ensure **FIREBASE_WEB_API_KEY** and **FIREBASE_PROJECT_ID** are configured in the server environment. Redeploy after adding or rotating the secret. If the service-account secret is missing or invalid, the endpoint fails closed and the admin UI reports the error; it must not pretend an operation succeeded.

## What the admin controls do

- Role changes update the users/{uid}.role profile field (admin or staff).
- Status changes support active, suspended, and inactive. The existing authentication provider blocks inactive/suspended profiles.
- Account deletion first disables the Firebase Authentication account, then deletes the users/{uid} profile, then deletes the Authentication account. If a step fails, the response reports failure; disabling happens first so a partial failure does not silently leave a normal active account.
- The bootstrap administrator emails are protected, administrators cannot delete themselves, and the API protects the last active administrator.
- Each successful role/status change and deletion attempts to write an activityLogs audit record.
- Authored workspace content is retained. The operation removes the login account and profile, not all documents/tasks/projects authored by that person.

Deleting only a Firestore profile is not enough to guarantee that a person cannot sign in again. The Firebase Authentication account must also be disabled/deleted. After deletion, existing ID tokens can remain cryptographically valid until expiry, but the missing active user profile causes the Firestore workspace membership rules to deny workspace data access.

## Jess system settings

The Admin Centre's Jess Settings tab writes administrator-only policy to systemSettings/jess and a limited set of safe capability flags to systemSettings/jessPublic. The public document contains only toggles required by the client UI; it must not contain administrator instructions or credentials.

The production /api/chat function loads the administrator guidance on the server when FIREBASE_SERVICE_ACCOUNT_JSON is available. Other settings are not proof that a capability has been implemented: the voice-mode router and Wheelhouse bridge remain separate engineering and acceptance-test gates.