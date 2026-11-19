# Troubleshooting

## The phone will not go live

The phone version and the laptop version have to match, for example both `0.3.0`. The Stations screen shows **Version mismatch** and the phone explains the two versions. Install the APK from the same GitHub release as the laptop. Punches already on the phone can still be synced or carried back as QR codes. They are not deleted.

## The laptop says a phone clock needs review

The default warning is 2 seconds. The phone clock minus the laptop clock is stored on the station and on each punch. A positive number means the phone is ahead. Open the phone's date and time settings, turn on automatic time, and sync again. The old punches keep the offset they were saved with. Scoring still uses the phone's timestamp. The flag is for the race director to look at, not an automatic correction.

Change the warning under **Stations**. It is labeled "Warn when a phone clock is off by at least (seconds)."

## The phone cannot reach the laptop

Both have to be on the travel router's Wi-Fi. The phone's pairing code contains the laptop address, such as `http://192.168.4.20:8788`. If the laptop has more than one address, the code may have picked the wrong one. Show the code again and choose the router address first.

The hub is plain HTTP on purpose. The race network has no certificates and no internet. The phone allows that cleartext traffic for this app.

Out of range, use the punch codes and the roster code. See [station-guide.md](station-guide.md).

## A QR code will not scan

Move to shade, make the screen brighter, and hold the camera a bit farther back. If there are several codes, scan them in any order until the laptop stops saying a part is missing. Pasting the text under the code works the same way. On the phone, **Or paste the code** is the same idea for the pairing code and the roster code.

## The same number was punched twice

Inside 60 seconds the phone asks. After that it saves. Undo on the phone, or **Void** on the laptop Scoring screen. A voided copy wins even if an older copy arrives later.

## A number was not on the roster

The punch is saved and marked unknown. Add or fix the rider on the laptop, then sync or send a roster code. Scoring still treats a number that is not registered as unknown. The phone never refuses the punch.

## Android closed the station app

While the check is live, the app keeps the screen on and runs a foreground notification. Do not swipe that notification away. If Android asks whether the app may ignore battery optimization, allow it. If the app was swiped out of the recent list, the notification brings it back. Punches that were already saved are still in the phone's files.

The app is built for Android 8 and newer. An older phone will not install it.

## The Windows installer or updater

The station APK is a separate file on the release. `latest.json` still points at the Windows installer only. A missing Android keystore does not stop the Windows build. It publishes `mwhe-station-<version>-debug.apk` instead of a release-signed APK. Debug APKs install for a test. A race weekend should use the signed APK once the keystore secrets exist. See [RELEASING.md](RELEASING.md).
