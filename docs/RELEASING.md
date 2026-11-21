# Releasing MWHE Race Scorer

Tags are `vMAJOR.MINOR.PATCH`, for example `v0.2.0`. Pushing the tag runs `.github/workflows/release.yml`. That builds the NSIS installer on `windows-latest`, builds the web bundles, and publishes a GitHub Release with the installer attached.

Pull requests do not publish a release. The Windows workflow on the PR uploads the installer as a downloadable Actions artifact so you can try it before the tag.

`schemaVersion` in `@mwhe/core` is still separate from the tag. See [release.md](release.md).

The installer is per user (`currentUser`). It does not need an administrator password. It adds a Start menu shortcut and, on the last installer page, a desktop shortcut that is checked by default. The product name is **MWHE Race Scorer**.

## Cut a release

From a clean `main` that already contains the public updater key, if you are using updates:

```powershell
git checkout main
git pull
git tag v0.2.0
git push origin v0.2.0
```

Wait for the **Release** workflow. The release page then has `MWHE-Race-Scorer_<version>_x64-setup.exe`. The name has hyphens, not spaces, because GitHub would otherwise rename the file and the in-app update URL would miss it. A tag with a hyphen, such as `v0.2.1-rc.1`, is published as a prerelease. Prereleases are not what installed copies treat as "latest", so they do not become the in-app update.

You do not edit `package.json` for this. The workflow sets the installer version from the tag.

## Try a build before the tag

Open the pull request, then **Checks → Windows installer** (or the Actions run). Download the artifact named `mwhe-race-scorer-windows`. That file is the same kind of installer. Its version is the one in `tauri.conf.json` unless the run was a tag.

## Updater keys

The updater has its own minisign key. It is not the Windows code-signing certificate. The public key is already in `apps/laptop/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Its key id is `E92861B175B03B52`. The private key and its password are GitHub Actions secrets, and they are not in the repo:

| Secret                               | What to paste                                                |
| ------------------------------------ | ------------------------------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | The whole private key file, including the first comment line |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you chose when generating the key               |

The installer still builds when those secrets are missing. The workflow then skips `latest.json` and the `.sig` file, so installed copies have nothing to apply. When both secrets are saved, a version tag attaches `latest.json` and the `.sig` next to the setup exe. The app reads:

`https://github.com/DevDan171/mwhe-race-scorer/releases/latest/download/latest.json`

Save both secrets before you tag `v0.2.0`. A build of 0.2.0 is the first one that can verify later releases. Copies from 0.1.1 and earlier do not have this public key, so they will not update themselves.

To rotate the key later, generate a new pair on your own PC. The private key never goes in git.

1. Install Node 22 and pnpm if this PC does not have them yet. This is only for generating the key. Race directors do not do this.
2. Open PowerShell in the repo:

```powershell
cd C:\path\to\mwhe-race-scorer
pnpm install
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.tauri" | Out-Null
pnpm --filter @mwhe/laptop exec tauri signer generate -w "$env:USERPROFILE\.tauri\mwhe-race-scorer.key"
```

3. When it asks for a password, type one and remember it. Do not leave it blank. GitHub cannot store an empty secret, and a later build would not be able to unlock the key.
4. The command writes two files next to each other:
   - `%USERPROFILE%\.tauri\mwhe-race-scorer.key` is the private key.
   - `%USERPROFILE%\.tauri\mwhe-race-scorer.key.pub` is the public key. It is one block of text starting with `dW50cnVzdGVk`. That whole block is what the app needs.

5. Print the public key as a JSON string and copy that whole line, quotes included:

```powershell
node -e "const fs=require('fs'); const p=fs.readFileSync(process.env.USERPROFILE+'\\.tauri\\mwhe-race-scorer.key.pub','utf8').trim(); console.log(JSON.stringify(p));"
```

6. Replace `plugins.updater.pubkey` in `apps/laptop/src-tauri/tauri.conf.json` with that line, quotes included. Commit that change. Do not commit the `.key` file. `.gitignore` already ignores `*.key`.
7. On GitHub open **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: the whole private key. In PowerShell:

```powershell
Get-Content -Raw "$env:USERPROFILE\.tauri\mwhe-race-scorer.key" | Set-Clipboard
```

Paste that into the secret and save. Then create `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with the password from step 3. Tag the next release only after the new public key is on `main`.

The repository has to stay public, or `latest.json` has to be downloadable without a login. The app does not send a GitHub token. It does not check, download, or prompt while Scoring is open or while a planned start is still inside that race’s window. A check that cannot reach GitHub changes nothing.

## Android station APK

The same version tag attaches the phone APK next to the Windows installer. The signed file name is `mwhe-station-<version>.apk` (hyphens, no spaces), for example `mwhe-station-0.4.0.apk`. When the keystore secrets are missing, the file is `mwhe-station-<version>-debug.apk` instead. A missing keystore does not fail the build and does not change `latest.json`. `latest.json` is still only the Windows installer.

A signed release also publishes `station-update.json` next to the APK. It is three fields: `version`, `url`, and `sha256`. Phones and the laptop read it. A debug APK does not get that file. Debug builds are signed with a throwaway key that changes from computer to computer, so one debug APK cannot install over another, and a signed APK cannot install over a debug one. The phone says so on its setup screen.

Pull requests upload the APK as the artifact `mwhe-station-android`. That artifact is a debug build unless the four secrets are set on the repository.

The laptop package and the station package are both `0.4.0` in this tree. Bump them together before you tag. A phone whose version does not match the laptop is refused at go-live.

Phones that still have the 0.3.0 test build must be uninstalled once before the signed 0.4.0 APK will install. After that, the phone can update itself. It asks only when it is not recording. The person holding the phone taps Install. Nothing installs by itself. Android checks that the new file is signed with the same key as the app already on the phone.

The laptop downloads the station APK for its own version the first time it can reach GitHub, then keeps that file. At the race, with no internet, a phone gets the update from the laptop over the travel-router Wi-Fi. Do that download at home before you leave. If the laptop has never been online since this version was released, it has no APK to hand out.

### Make the signing key, on your Windows PC

Do this once. The keystore never goes in git. `.gitignore` already ignores `*.jks` and `*.keystore`.

Back up the keystore file and both passwords somewhere safe, such as a USB stick you keep at home. If you lose them, every phone has to uninstall the app before a new key will install. Do not paste the keystore, the base64, or the passwords into chat, email, or a GitHub issue.

1. Install a JDK if you do not have one. [Temurin 21](https://adoptium.net/) is enough. Android Studio also includes `keytool`, at `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`. The steps below use `keytool` from a JDK that is on your PATH. If Windows says it cannot find `keytool`, use the full Android Studio path in the command instead.
2. Open PowerShell.
3. Create the key. It will ask for a store password, then a key password, then your name. The name can be `MWHE`. The other name fields can be left blank by pressing Enter. Type `yes` when it asks if the information is correct.

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.android" | Out-Null
keytool -genkeypair -v -keystore "$env:USERPROFILE\.android\mwhe-station.jks" -alias mwhe-station -keyalg RSA -keysize 2048 -validity 10000
```

4. Write down three things and put them with the backup: the store password, the key password, and the alias `mwhe-station`. They can be the same password if you want one thing to remember. Do not leave either password blank.
5. Turn the keystore into one line of base64 and copy it. This is the only time that line should be on the clipboard. Paste it into the GitHub secret, then clear the clipboard.

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.android\mwhe-station.jks")) | Set-Clipboard
```

6. On GitHub open the repository, then **Settings → Secrets and variables → Actions → New repository secret**. Add all four secrets. The names have to match exactly:

| Secret                      | What to paste                                      |
| --------------------------- | -------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | The base64 from step 5, one long line              |
| `ANDROID_KEYSTORE_PASSWORD` | The store password from step 3                     |
| `ANDROID_KEY_ALIAS`         | `mwhe-station`, unless you typed a different alias |
| `ANDROID_KEY_PASSWORD`      | The key password from step 3                       |

If any one of those four is missing, the release attaches the debug APK and does not publish `station-update.json`. Phones cannot update from that debug file.

The phone install is a sideload. There is no Play Store listing. The APK's oldest Android is Android 8. The first time a phone installs an update from inside the app, Android asks you to allow MWHE Station to install unknown apps. Allow it, go back, and tap Download update again. You still confirm Install on the system screen.

## Azure Artifact Signing later

Windows Authenticode signing is off. The build stays unsigned, and the race-day install steps stay "More info → Run anyway", until all of these Actions secrets exist. If any one of them is missing, signing is skipped. If some are set and some are not, the build fails on purpose so a half-configured release is not published as if it were signed.

| Secret                              | What it is                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| `AZURE_CLIENT_ID`                   | Application (client) ID of the app registration                 |
| `AZURE_CLIENT_SECRET`               | A client secret from that app registration                      |
| `AZURE_TENANT_ID`                   | Directory (tenant) ID                                           |
| `AZURE_SIGNING_ENDPOINT`            | Regional endpoint, such as `https://wus2.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT`             | Artifact Signing account name                                   |
| `AZURE_SIGNING_CERTIFICATE_PROFILE` | Certificate profile name inside that account                    |

The endpoint, account, and profile are names, not private keys. They are secrets here so the workflow can see the whole set in one place. Nothing in `tauri.conf.json` has to change when you add them.

Setup, once, in Azure:

1. Create an Artifact Signing account (this is the service formerly called Trusted Signing) and a certificate profile in the region you will use. Note the endpoint for that region, the account name, and the profile name.
2. In Microsoft Entra ID, create an app registration. Note the client ID and tenant ID. Create a client secret and copy the value immediately.
3. On the certificate profile, give that app the **Artifact Signing Certificate Profile Signer** role.
4. Add the six secrets above.

The Windows runner then installs `artifact-signing-cli` and passes it to Tauri as `bundle.windows.signCommand` before the installer is packed. The command Tauri runs is:

```text
artifact-signing-cli -e <endpoint> -a <account> -c <profile> -d "MWHE Race Scorer" %1
```

`%1` is the file Tauri is signing. Tauri signs the app and the installer, and the updater signature is taken after that, so the `.sig` matches the signed bytes.

`windows-latest` already has .NET, the Windows SDK `signtool`, and the Azure CLI, which is what `artifact-signing-cli` expects. The three `AZURE_CLIENT_*` values are the environment variables that tool reads. No certificate file is stored in GitHub.

A newly signed app can still show SmartScreen until the certificate has reputation. The "More info → Run anyway" step goes away only after Windows trusts the signature. Signing does not change the per-user install or the rule that uninstall keeps race data.

## What the packaged app is allowed to reach

Checked in `apps/laptop/src/release/packaged-shell.test.ts` and the shell config:

- The window loads the Vite build from the app bundle (`frontendDist`), not `http://localhost:1420`. That address is only `devUrl`, used by `tauri dev`.
- A production build sets `import.meta.env.DEV` to false, so the mock-site controls are not in the window and the default site is `https://midwesthardenduro.com`.
- Google sign-in does not run inside the webview. The app opens the system browser and a Rust listener on `127.0.0.1` receives `http://127.0.0.1:<port>/callback`. The content-security policy does not have to allow the website. The native HTTP client does, and its capability list includes `https://midwesthardenduro.com/*`, `https://*.midwesthardenduro.com/*`, and `https://base44.app/*` (login), plus loopback for the dev mock.
- The vault commands `credential_get_vault` and `credential_set_vault` are in the capability, so emergency contacts can be unlocked in the installed app. The key stays in Credential Manager entry `rider-private-key`. `keyring` is built with `windows-native`. Without that feature the packaged app's credential commands use an in-memory mock: the token looks saved, then the next read finds nothing.
- WebView2 is embedded as the bootstrapper (`embedBootstrapper`, silent). The installer is about 2 MB larger and can install the runtime when the laptop is online and does not already have it.

## Checklist on a Windows laptop

Use a build from the PR artifact or from the release.

1. Install. No administrator password. Start menu and desktop shortcut are **MWHE Race Scorer**.
2. SmartScreen: **More info → Run anyway**.
3. Sign in (Google, or email). The browser opens, and the app continues on its own.
4. Pick an event and import it.
5. Re-import that event.
6. Race setup. Add a rider.
7. Rider lookup, including emergency contact.
8. Close the app and open it again. The event and the rider are still there.
9. Note the version under **Settings → About** (and at the bottom of the sidebar).
10. Uninstall with **Delete the application data** left unchecked. Install again. The event is still there.
11. If an update is published, **Update available** installs it and the event is still there.
