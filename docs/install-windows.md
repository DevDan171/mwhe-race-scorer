# Install MWHE Race Scorer on Windows

This is the laptop app for race day. You do not need Node, pnpm, or Rust. You need the installer from a GitHub Release.

The app is **MWHE Race Scorer**. After it is installed it works offline. It only uses the network to sign in, import or re-import an event, and upload new series riders to [midwesthardenduro.com](https://midwesthardenduro.com).

## Download

1. Open the [Releases](https://github.com/DevDan171/mwhe-race-scorer/releases) page.
2. Open the newest release, such as `v0.1.0`.
3. Download the file whose name ends in `_x64-setup.exe`. It looks like `MWHE-Race-Scorer_0.2.1_x64-setup.exe`.

Leave the other files. Those are for development.

## Windows protected your PC

The installer is not code-signed yet, so Windows does not recognize it. That warning is expected.

1. Double-click the downloaded file.
2. If a blue window says **Windows protected your PC**, click **More info**.
3. Click **Run anyway**.

The browser may also say the download is uncommon. Choose **Keep** (or **Keep anyway**) so the file is not deleted.

On some Windows 11 laptops, Smart App Control blocks unsigned apps and does not offer **Run anyway**. That setting is under **Windows Security → App & browser control → Smart App Control**. It has to be off for this unsigned build. Signing the app later removes the need for that.

## Install

The installer does not ask for an administrator password. It installs only for the Windows user who runs it.

1. Click through the installer.
2. Leave **Create desktop shortcut** checked. It is already checked.
3. Finish.

The Start menu gets **MWHE Race Scorer** as well. Open the app from the desktop icon or the Start menu.

The first install on a fresh Windows 10 or Windows 11 laptop includes the WebView2 bootstrapper. Windows 11 and updated Windows 10 already have WebView2, so this step is quiet. If the laptop does not have it yet, the installer downloads it. That step needs the internet once. After that, race day does not.

## What stays on the laptop

Races, riders, and emergency contacts are not stored in the program folder. They live in the Windows profile for this user:

`%APPDATA%\com.midwesthardenduro.scorer\mwhe-hub.db`

The sign-in token and the key that locks emergency contacts are in Windows Credential Manager, under the name **MWHE Race Scorer**. The emergency key is the entry `rider-private-key`. Signing out of the app removes the sign-in token only. It does not remove races or the emergency key.

Close the app and open it again. The event you imported is still there.

## Update

When the laptop is online, the app looks for a newer release at startup and again every few hours. It does not look, and it does not ask, while a race is underway: the Scoring screen is open, or a planned start is still inside that race’s window. A failed check stays quiet. Scoring keeps working with no network.

If a newer version exists, a banner says **Version X.Y.Z is available**. **Update now** downloads it, shows the progress, installs it, and restarts. **Later** hides the banner until the next time you open the app. Races stay on the laptop. The installer is the same per-user install and does not remove the database.

**Settings → About → Check for updates** says whether this copy is up to date, that a version is available, that it is downloading, or why a check failed. It waits, and says so, while a race is underway.

You can also install a newer `_x64-setup.exe` over the copy that is already there. The races stay either way.

The version number is at the bottom of the sidebar, on the sign-in screen, and under **Settings → About**.

## Uninstall

**Settings → Apps → Installed apps → MWHE Race Scorer → Uninstall.**

Leave **Delete the application data** unchecked. The races, the database, and the Credential Manager entries stay, so a later install sees them again.

Check that box only when you mean to erase the races on this laptop. Checking it also removes the sign-in token and the emergency-contact key from Credential Manager.
