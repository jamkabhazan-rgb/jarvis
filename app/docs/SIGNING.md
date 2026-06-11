# macOS code signing & notarization

Goal: ship a `.dmg` that opens on any Mac without the "unidentified
developer" warning. You need a paid Apple Developer account, a **Developer
ID Application** certificate, and notarization credentials. Everything below
plugs into the existing `.github/workflows/release.yml` via GitHub secrets.

## 1. Create the Developer ID Application certificate (on a Mac)

Easiest path — Xcode:
1. Install Xcode → open it → Settings (⌘,) → **Accounts** → add your Apple ID.
2. Select your team → **Manage Certificates…** → click **+** → **Developer ID Application**.
3. The certificate + private key now live in your **login keychain**.

No-Xcode path — Developer portal + Keychain Access:
1. Keychain Access → menu **Certificate Assistant → Request a Certificate From a Certificate Authority**. Enter your email, select **Saved to disk**, save the `.certSigningRequest` (CSR).
2. https://developer.apple.com/account → **Certificates** → **+** → **Developer ID Application** → upload the CSR → download the `.cer`.
3. Double-click the `.cer` to import it into Keychain Access.

## 2. Export it as a .p12

1. Keychain Access → **My Certificates** → find **"Developer ID Application: Your Name (TEAMID)"** (it must show a disclosure triangle with a private key under it).
2. Right-click → **Export "Developer ID Application…"** → format **Personal Information Exchange (.p12)** → save → set a password (remember it).

## 3. Turn the .p12 into a GitHub secret

In Terminal:
```sh
base64 -i Certificates.p12 | pbcopy   # base64 is now on your clipboard
```

## 4. Collect the other values

- **Team ID** — https://developer.apple.com/account → **Membership** → "Team ID" (10 chars, e.g. `AB12CD34EF`).
- **Signing identity** — the exact string from Keychain, e.g. `Developer ID Application: Your Name (AB12CD34EF)`.
- **App-specific password** (for notarization) — https://appleid.apple.com → **Sign-In and Security → App-Specific Passwords → Generate** (looks like `abcd-efgh-ijkl-mnop`). This is NOT your normal Apple ID password.

## 5. Add the GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | the base64 string from step 3 |
| `APPLE_CERTIFICATE_PASSWORD` | the .p12 password from step 2 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | the app-specific password from step 4 |
| `APPLE_TEAM_ID` | your 10-char Team ID |

## 6. Turn signing back on in the workflow

Re-add this `env:` block to the `Build + publish release` step in
`.github/workflows/release.yml` (it was removed so unsigned builds work):

```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

tauri-action imports the cert, signs with the Developer ID identity, and —
because `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` are present —
notarizes and staples the `.dmg`. The next release downloads open with no
warning.

## Windows (separate, optional)

Windows "unknown publisher" is a different system — it needs an OV/EV
code-signing certificate from a CA (DigiCard, Sectigo, etc.), not Apple.
Until then the `.exe` works via SmartScreen → More info → Run anyway.
