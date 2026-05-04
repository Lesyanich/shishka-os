# /api/vault — vault edit endpoints

Two Vercel Functions that let the admin Pages tab edit `vault/*.md` files
directly via GitHub commits.

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/vault/page?path=<path>` | GET | Fetch live content + sha for the editor |
| `/api/vault/save` | POST | Commit edits with sha-based conflict guard |

Both require `Authorization: Bearer <jwt>` and reject anyone whose `staff.app_role`
is not `owner`.

## Vercel env vars

Set these in the Vercel project (Settings → Environment Variables):

| Variable | Required | Value |
|---|---|---|
| `GITHUB_TOKEN` | yes | GitHub Personal Access Token (or App installation token) with **Contents: write** scope on the repo |
| `GITHUB_REPO_OWNER` | optional | defaults to `Lesyanich` |
| `GITHUB_REPO_NAME` | optional | defaults to `shishka-os` |
| `GITHUB_DEFAULT_BRANCH` | optional | defaults to `main` |

The `SUPABASE_*` vars are already configured (used by the chef API too).

## Setup — PAT (Personal Access Token, recommended for v1)

1. Go to https://github.com/settings/tokens?type=beta — "Generate new token"
2. Token name: `shishka-os vault editor`
3. Resource owner: `Lesyanich`
4. Repository access: only `shishka-os`
5. Permissions: **Contents → Read and Write**, leave the rest as no access
6. Expiration: 1 year (rotate annually)
7. Generate, copy the `github_pat_...` value
8. In Vercel project: add env var `GITHUB_TOKEN` for **Production** + **Preview** environments
9. Redeploy

Once set, the editor's `Save` button will commit to `main`. Vercel auto-redeploys
on the new commit, and the next `vault.json` build picks up the change.

## Future upgrade — GitHub App

PAT works fine for solo CEO. When the team grows or auto-rotation matters,
swap to a GitHub App:

1. Create an App at https://github.com/settings/apps
2. Permissions: Contents (read/write)
3. Install on `Lesyanich/shishka-os`
4. Generate private key, save the App ID and Installation ID
5. Replace these two lines in `save.ts` and `page.ts`:
   ```ts
   const octokit = new Octokit({ auth: token })
   ```
   with `@octokit/auth-app` flow that mints an installation token from the
   App credentials.

The API contract doesn't change.

## Conflict handling

If the file has been modified between editor open and save, the API returns
`409 Conflict` with `{ currentSha }`. The admin shows "File changed since you
opened the editor — refresh and reapply." No data loss; the user reopens
fresh and re-applies their edits.
