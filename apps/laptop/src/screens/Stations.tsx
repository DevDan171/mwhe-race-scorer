import {
  clockOffsetWarning,
  formatClockOffset,
  primaryRace,
  worstClockOffset,
  type StationPairing,
} from "@mwhe/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatWhen } from "../format";
import { messageOf } from "../message";
import { QrImage } from "../sync/qr-image";
import { useSync } from "../sync/provider";
import { useHub } from "../use-hub";
import { Banner, Field } from "../ui";

export function Stations() {
  const hub = useHub();
  const sync = useSync();
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<StationPairing | null>(null);
  const [raceId, setRaceId] = useState("");
  const [checkId, setCheckId] = useState("");
  const [hubUrl, setHubUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [scanned, setScanned] = useState<string[]>([]);
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [since, setSince] = useState(0);
  const [rosterCodes, setRosterCodes] = useState<string[]>([]);
  const [rosterIndex, setRosterIndex] = useState(0);
  const [warnSeconds, setWarnSeconds] = useState("2");

  const state = hub.state;
  const view = sync.view;
  const eventId = state?.race.event.id;
  const stations = useMemo(
    () => (view?.stations ?? []).filter((station) => station.eventId === eventId),
    [view, eventId],
  );
  const punches = useMemo(
    () =>
      (view?.punches ?? []).filter(
        (punch) => !eventId || !punch.eventId || punch.eventId === eventId,
      ),
    [view, eventId],
  );

  if (!state) {
    return (
      <div className="stack">
        <h1>Stations</h1>
        <Banner tone="info">Import an event before pairing a phone.</Banner>
      </div>
    );
  }

  const race =
    state.race.races.find(
      (entry) => entry.id === (raceId || primaryRace(state.race.races).id),
    ) ?? primaryRace(state.race.races);
  const urls = view?.listeningUrls ?? [];
  const selectedUrl =
    hubUrl || urls.find((url) => !url.includes("127.0.0.1")) || urls[0] || "";
  const threshold = view?.settings.clockOffsetWarnMs ?? 2000;

  async function run(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Stations · {state.race.event.name}</h1>
          <p className="lede">
            Pair each phone to one check. The phone pushes punches. This laptop sends
            roster changes back. A phone on a different app version cannot go live.
          </p>
        </div>
      </header>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {sync.error ? <Banner tone="error">{sync.error}</Banner> : null}
      {!sync.ready ? <Banner tone="info">Opening the station listener…</Banner> : null}

      <section className="card" style={{ padding: 16 }}>
        <h2>Listener</h2>
        {urls.length === 0 ? (
          <p className="hint">
            This copy is not listening on the network. The Windows app listens on port
            8788 for phones on the travel router.
          </p>
        ) : (
          <ul>
            {urls.map((url) => (
              <li key={url}>
                <code>{url}</code>
              </li>
            ))}
          </ul>
        )}
        <Field
          label="Warn when a phone clock is off by at least (seconds)"
          hint="Default is 2 seconds. The punch time is still the phone's own clock."
        >
          <input
            type="number"
            min={0}
            step={1}
            value={warnSeconds}
            onChange={(event) => setWarnSeconds(event.target.value)}
          />
        </Field>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            void run(async () => {
              const seconds = Number(warnSeconds);
              if (!Number.isFinite(seconds) || seconds < 0) {
                throw new Error("Enter zero or more seconds.");
              }
              await sync.setClockWarnMs(Math.round(seconds * 1000));
            })
          }
        >
          Save clock warning
        </button>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2>Pair a phone</h2>
        <div className="row">
          <Field label="Race">
            <select value={race.id} onChange={(event) => setRaceId(event.target.value)}>
              {state.race.races.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Check">
            <select
              value={checkId || race.checks[0]?.id || ""}
              onChange={(event) => setCheckId(event.target.value)}
            >
              {race.checks.map((check) => (
                <option key={check.id} value={check.id}>
                  {check.order}. {check.name}
                </option>
              ))}
            </select>
          </Field>
          {urls.length > 1 ? (
            <Field label="Address on the QR code">
              <select
                value={selectedUrl}
                onChange={(event) => setHubUrl(event.target.value)}
              >
                {urls.map((url) => (
                  <option key={url} value={url}>
                    {url}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={!selectedUrl || !sync.ready}
          onClick={() =>
            void run(async () => {
              const check = race.checks.find(
                (entry) => entry.id === (checkId || race.checks[0]?.id),
              );
              if (!check) throw new Error("Pick a check.");
              const payload = await sync.createPairing({
                hubUrl: selectedUrl,
                eventId: state.race.event.id,
                eventName: state.race.event.name,
                raceId: race.id,
                raceName: race.name,
                checkId: check.id,
                checkName: check.name,
              });
              setPairing(payload);
            })
          }
        >
          Show pairing code
        </button>
        {pairing ? (
          <div className="stack">
            <p>
              {pairing.checkName} · {pairing.raceName}. One phone scans this code. The
              code is the password for that phone.
            </p>
            <QrImage text={JSON.stringify(pairing)} label="Station pairing code" />
            <textarea readOnly value={JSON.stringify(pairing)} rows={4} />
          </div>
        ) : null}
      </section>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CHECK</th>
              <th>PHONE</th>
              <th>LAST SYNC</th>
              <th>PUNCHES</th>
              <th>CLOCK</th>
              <th>APP</th>
              <th>BATTERY</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stations.length === 0 ? (
              <tr>
                <td colSpan={8}>No phones paired for this event yet.</td>
              </tr>
            ) : (
              stations.map((station) => {
                const mine = punches.filter(
                  (punch) => punch.deviceId === station.deviceId,
                );
                const active = mine.filter((punch) => !punch.voided).length;
                const offset = worstClockOffset([
                  station.clockOffsetMs,
                  ...mine.map((punch) => punch.clockOffsetMs),
                ]);
                const warn = clockOffsetWarning(offset, threshold);
                const mismatch = station.deviceId !== null && !station.goLiveAllowed;
                return (
                  <tr key={station.pairingId}>
                    <td>
                      {station.checkName}
                      <div className="hint">{station.raceName}</div>
                    </td>
                    <td>{station.deviceId ? station.deviceId.slice(0, 8) : "Waiting"}</td>
                    <td>
                      {station.lastSyncAt ? formatWhen(station.lastSyncAt) : "Never"}
                    </td>
                    <td>
                      {active}
                      {mine.length - active > 0
                        ? ` (${mine.length - active} voided)`
                        : ""}
                    </td>
                    <td>
                      {offset === null ? "—" : formatClockOffset(offset)}
                      {warn ? <div className="tag warn">Review</div> : null}
                    </td>
                    <td>
                      {station.appVersion ?? "—"}
                      {mismatch ? <div className="tag bad">Version mismatch</div> : null}
                    </td>
                    <td>
                      {station.batteryPercent === null
                        ? "—"
                        : `${station.batteryPercent}%`}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          setRosterFor(station.pairingId);
                          setSince(station.rosterVersion);
                          setRosterCodes([]);
                        }}
                      >
                        Roster code
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {rosterFor ? (
        <section className="card" style={{ padding: 16 }}>
          <h2>Roster code for a phone that is out of range</h2>
          <Field
            label="Phone already has roster version"
            hint="The phone shows this on its Sync screen. 0 sends the whole roster."
          >
            <input
              type="number"
              min={0}
              step={1}
              value={since}
              onChange={(event) => setSince(Number(event.target.value))}
            />
          </Field>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              void run(async () => {
                const codes = await sync.rosterQr(state.race.event.id, since);
                setRosterCodes(codes);
                setRosterIndex(0);
              })
            }
          >
            Show roster code
          </button>
          {rosterCodes[rosterIndex] ? (
            <div className="stack">
              <QrImage text={rosterCodes[rosterIndex]} label="Roster update code" />
              <p>
                Code {rosterIndex + 1} of {rosterCodes.length}
              </p>
              {rosterCodes.length > 1 ? (
                <div className="row">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setRosterIndex((index) => Math.max(0, index - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      setRosterIndex((index) =>
                        Math.min(rosterCodes.length - 1, index + 1),
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card" style={{ padding: 16 }}>
        <h2>Import punches from a phone that is out of range</h2>
        <p className="lede">
          Scan the phone's code with this laptop's camera, or paste the text under the
          code.
        </p>
        <PunchScanner
          onCode={(text) =>
            void run(async () => {
              const next = scanned.includes(text) ? scanned : [...scanned, text];
              setScanned(next);
              await sync.importPunchText(next.join("\n\n"));
              setScanned([]);
            })
          }
        />
        {scanned.length > 0 ? (
          <p className="hint">
            Holding {scanned.length} code{scanned.length === 1 ? "" : "s"}. Scan the next
            one, or paste the whole set.
          </p>
        ) : null}
        <Field label="Pasted punch code">
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={4}
          />
        </Field>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void run(async () => {
              await sync.importPunchText(importText);
              setImportText("");
            })
          }
        >
          Import pasted punches
        </button>
      </section>
    </div>
  );
}

function PunchScanner({ onCode }: { onCode: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      <button
        type="button"
        className="btn small"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close camera" : "Scan with camera"}
      </button>
      {open ? <Camera onCode={onCode} /> : null}
    </div>
  );
}

function Camera({ onCode }: { onCode: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!video) return;
    let stop = false;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let last = "";
    void (async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stop) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const tick = () => {
          if (stop || !context) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height);
            if (code?.data && code.data !== last) {
              last = code.data;
              onCodeRef.current(code.data);
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        if (!stop) setError("The camera did not start. Paste the code instead.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [video]);

  return (
    <div className="stack">
      {error ? <Banner tone="error">{error}</Banner> : null}
      <video
        ref={setVideo}
        muted
        playsInline
        style={{ width: "100%", maxWidth: 420, background: "#000" }}
      />
    </div>
  );
}
