# Station setup and race day

This is for the person running the race, not for a programmer. The laptop is the hub. Each checkpoint gets one Android phone. The phones and the laptop join the travel router's Wi-Fi. That network has no internet, and it does not need any.

The phone app is MWHE Station. The laptop app is MWHE Race Scorer. They have to be the same version. A phone on a different version can still send punches it already saved, but it is not allowed to go live.

## Before the weekend

1. Install MWHE Race Scorer on the laptop. The steps are in [install-windows.md](install-windows.md).
2. On each phone, download `mwhe-station-<version>.apk` from the same GitHub release as the laptop installer. Android will ask you to allow installs from the browser or Files. That is expected. There is no Play Store listing. Phones that still have the 0.3.0 test build must uninstall that app once, then install the signed 0.4.0 APK. Android will not update a debug test build in place, and two debug builds cannot update each other.
3. The phone needs Android 8 or newer.
4. Set the phone's date and time to automatic, from the network or from GPS. The punch time is the phone's own clock. The laptop does not replace it.
5. Charge the phones. Bring a battery pack for a check that sits out all day.

## Saturday morning, at the trailer

1. Turn on the travel router. Join the laptop and the phones to its Wi-Fi. Do not join a phone hotspot.
2. On the laptop, import the event if it is not already there. Register day-of riders before you send people to the checks. A phone only learns about a new rider at its next sync, or from a roster code.
3. Open **Stations**. The laptop listens for phones on port 8788. The screen lists the addresses, such as `http://192.168.4.20:8788`. If more than one address is listed, pick the one that belongs to the travel router before you show a code.
4. For each phone, choose the race and the station: Start, a check, or Finish. Finish uses the last check on the course. Then **Show pairing code**. Hand the phone to that station. On the phone, **Scan laptop code**. The phone locks to that station. One code is one phone. A second phone needs its own code.
5. The phone shows how far its clock is from the laptop. If it says the clock is off by 2 seconds or more, fix the phone's time before **Go live**. Two seconds is the default warning. You can change it on the Stations screen. The punch is still saved either way. The laptop flags it for review.
6. **Go live** on the phone. The screen stays on. Android shows a notification, "MWHE Station is recording", so it is less likely to close the app. Leave that notification alone.
7. If the phone says the versions do not match, do not go live. Install the APK that matches the laptop.

## Start station and finish station

A phone is locked to one job when you pair it: **Start**, a **Check**, or **Finish**. It stays that job, the same way a check phone stays on its check.

**Start.** The laptop sends the race's start rows, in order, with the row label and the classes on that row. No rider names. The phone shows a big **Row N go** button for each row. One tap records that row's departure from the phone's clock. That time replaces the planned row clock for every rider in the row. If the same row is tapped again, the phone asks before it saves another time. **Late starter** is the keypad: type a number and press **Start**. That rider's own start overrides their row. Undo voids the last start. It is saved on the phone before the screen clears, and it syncs like a punch, including the QR codes when the phone is out of range.

**Finish.** The finish is the last checkpoint on the course. The phone is the same keypad as a check, with **Finish** on the button. On a lap race a rider can pass the finish once per lap. Every pass is saved. The laptop decides which ones count.

**Checks and the finish on a lap race.** A rider can be punched at the same check on each lap. The phone still asks before a second punch inside the double-tap window (60 seconds unless you change it). The laptop also flags a repeat of the same check that is closer than 2 minutes, so it can be reviewed. It does not throw the time away.

## Updating a phone

When the phone is not recording, it looks for a newer signed release. On the race Wi-Fi it asks the laptop. The laptop has to have downloaded that APK earlier, while it still had internet. When the phone itself has internet, it also looks at the GitHub release. It does not ask while you are punched in and the station is live.

If a newer version is there, the phone shows **Download update**. You tap it, then you tap **Install** on the Android screen. The app does not install itself. If the download is bad, or the check cannot reach the laptop or GitHub, the phone stays quiet.

A debug test build says so on the setup screen and does not offer an update. Uninstall it and install the signed APK from the release.

## At the check

- Type the rider number on the big keypad and press **Punch**. The punch is saved on the phone before anything else happens. Killing the app or rebooting the phone does not delete it.
- If the number is not on the roster, the phone says so and saves the punch anyway. Do not turn the rider around. Fix the roster on the laptop later.
- If the same number is punched again within 60 seconds, the phone asks before it saves a second punch. 60 seconds is the default. The checker can change it on the phone. Set it to 0 to turn the question off.
- **Undo last punch** voids that punch. It stays in the file. The laptop will not score it.
- **Roster** on the phone is name, number, and class only. Birthdays, phone numbers, email, and emergency contacts are not on the phone.

## Getting punches back to the laptop

When the phone can see the travel router, open **Sync** and press **Sync with the laptop**. The phone sends every punch. The laptop sends roster changes the phone does not have yet. Syncing twice does not double the punches.

When the phone is out of range:

1. On the phone, open **Sync**. It shows one or more punch codes. If there is more than one, they are numbered.
2. On the laptop, **Stations**, **Scan with camera**, and scan each code. You can also paste the text under the phone's code. A missing part is kept until you scan the rest. Nothing is dropped.
3. To send new riders out to that phone, **Roster code** on that phone's row. Ask the checker what roster version the phone shows, type it, and let the phone scan the code. Version 0 sends the whole roster. The phone adds and changes riders. It does not wipe the list.

## After the race

Open **Scoring** on the laptop. Phone punches and paper punches are in one list. A paper sheet is entered under **Paper backup**: number, check, and the time written on the sheet. Void a punch there if a checker recorded a mistake and the phone already left.

A punch after the rider's time limit is stored and is not scored. That rule was already in the scoring engine. Lap counts are not enforced.

Emergency contacts stay on the laptop. They are not in the station sync, the results, or the logs.
