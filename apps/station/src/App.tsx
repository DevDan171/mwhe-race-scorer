import {
  clockOffsetWarning,
  formatClockOffset,
  readRosterFrames,
  stationPairingSchema,
} from "@mwhe/core";
import { useEffect, useRef, useState } from "react";

import { setStationAwake } from "./keep-awake";
import { QrCamera } from "./qr-camera";
import { QrImage } from "./qr-image";
import { Keypad } from "./screens/Keypad";
import { StartBoard } from "./screens/Start";
import { openStationStorage, type KvStorage } from "./storage";
import {
  clearSetup,
  decidePunch,
  endLive,
  exportPunchQr,
  exportStartQr,
  goLive,
  goLiveBlock,
  importRosterQr,
  loadStation,
  lockSetup,
  persistStation,
  recordRiderStart,
  recordRowGo,
  riderLabel,
  setDoubleTapWindow,
  stationRole,
  voidLatestPunch,
  voidLatestStart,
  type StationState,
} from "./station-state";
import { syncWithHub } from "./sync";
import { APP_VERSION } from "./version";

type Panel = "punch" | "roster" | "sync";
type CameraMode = "pair" | "roster" | null;

export function App() {
  const storageRef = useRef<KvStorage | null>(null);
  const stateRef = useRef<StationState | null>(null);
  const queue = useRef(Promise.resolve());
  const [state, setState] = useState<StationState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("punch");
  const [digits, setDigits] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [doubleTap, setDoubleTap] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [camera, setCamera] = useState<CameraMode>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrIndex, setQrIndex] = useState(0);
  const digitsRef = useRef(digits);
  digitsRef.current = digits;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const storage = await openStationStorage();
        const loaded = await loadStation(storage);
        if (cancelled) return;
        storageRef.current = storage;
        stateRef.current = loaded;
        setState(loaded);
      } catch (caught) {
        if (!cancelled)
          setBootError(
            caught instanceof Error ? caught.message : "Could not open the punch file.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state?.live || !state.setup) return;
    const body = `${state.setup.checkName}. Punches stay on this phone.`;
    void setStationAwake(true, body);
    const onVisible = () => {
      if (document.visibilityState === "visible") void setStationAwake(true, body);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void setStationAwake(false, body);
    };
  }, [state?.live, state?.setup]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!stateRef.current?.live || panel !== "punch") return;
      if (event.key >= "0" && event.key <= "9") {
        setDigits((current) => `${current}${event.key}`.replace(/^0+/, "").slice(0, 6));
      } else if (event.key === "Backspace") {
        setDigits((current) => current.slice(0, -1));
      } else if (event.key === "Enter") {
        if (stateRef.current.setup?.role === "start") void startRider(false);
        else void punch(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  function commit(recipe: (current: StationState) => StationState): Promise<void> {
    const run = queue.current.then(async () => {
      const storage = storageRef.current;
      const current = stateRef.current;
      if (!storage || !current) throw new Error("The punch file is not open.");
      const saved = await persistStation(storage, recipe(current));
      stateRef.current = saved;
      setState(saved);
    });
    queue.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function punch(confirm: boolean) {
    if (busy) return;
    const entered = digitsRef.current;
    let savedLabel: string | null = null;
    let savedFlash: string | null = null;
    let warned = false;
    setBusy(true);
    try {
      await commit((current) => {
        const decision = decidePunch(current, entered, new Date().toISOString(), confirm);
        if (!decision.ok) {
          warned = decision.reason === "double_tap";
          return current;
        }
        const rosterReady = (decision.state.roster?.version ?? 0) > 0;
        savedLabel = !rosterReady
          ? `${decision.punch.riderNumber} saved. The roster is not on this phone yet.`
          : decision.unknown
            ? `${decision.punch.riderNumber} is not on the roster. Saved anyway.`
            : `${decision.punch.riderNumber} ${riderLabel(decision.state, decision.punch.riderNumber)}`;
        savedFlash = decision.unknown
          ? `${decision.punch.riderNumber}\nNot on roster\nSaved`
          : `${decision.punch.riderNumber}\nSaved`;
        return decision.state;
      });
      if (savedFlash) {
        setDigits("");
        setDoubleTap(null);
        setError(null);
        setNotice(savedLabel);
        setFlash(savedFlash);
        window.setTimeout(() => setFlash(null), 600);
      } else if (warned) {
        setDoubleTap(entered);
      } else {
        setError("Enter the rider number, then punch.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The punch did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function startRow(order: number, confirm: boolean) {
    if (busy) return;
    let saved = false;
    let warned = false;
    setBusy(true);
    try {
      await commit((current) => {
        const decision = recordRowGo(current, order, new Date().toISOString(), confirm);
        if (!decision.ok) {
          warned = decision.reason === "already";
          return current;
        }
        saved = true;
        setNotice(`${decision.label} go saved.`);
        setFlash(`${decision.label}\nGo`);
        window.setTimeout(() => setFlash(null), 600);
        return decision.state;
      });
      if (saved) {
        setDoubleTap(null);
        setError(null);
      } else if (warned) {
        setDoubleTap(`row:${order}`);
      } else {
        setError("That row is not on this start station.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The row start did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function startRider(confirm: boolean) {
    if (busy) return;
    const entered = digitsRef.current;
    let saved = false;
    let warned = false;
    setBusy(true);
    try {
      await commit((current) => {
        const decision = recordRiderStart(
          current,
          entered,
          new Date().toISOString(),
          confirm,
        );
        if (!decision.ok) {
          warned = decision.reason === "already";
          return current;
        }
        saved = true;
        setNotice(
          decision.unknown
            ? `${decision.label} is not on the roster. Start saved anyway.`
            : `${decision.label} start saved.`,
        );
        setFlash(`${decision.label}\nStart`);
        window.setTimeout(() => setFlash(null), 600);
        return decision.state;
      });
      if (saved) {
        setDigits("");
        setDoubleTap(null);
        setError(null);
      } else if (warned) {
        setDoubleTap(entered);
      } else {
        setError("Enter the rider number, then start.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The start did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function applyPairing(text: string) {
    const parsed = stationPairingSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error("That is not a station code from the laptop.");
    await commit((current) =>
      lockSetup(current, parsed.data, new Date().toISOString(), APP_VERSION),
    );
    setCamera(null);
    setPaste("");
    setNotice(
      parsed.data.role === "start"
        ? "This phone is locked as the start station."
        : parsed.data.role === "finish"
          ? "This phone is locked as the finish."
          : "This phone is locked to that check.",
    );
  }

  async function applyRoster(text: string) {
    await commit((current) => importRosterQr(current, readRosterFrames(text)));
    setCamera(null);
    setPaste("");
    setNotice("Roster updated.");
  }

  async function syncNow() {
    const current = stateRef.current;
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await syncWithHub(current, {
        deviceNow: new Date().toISOString(),
        batteryPercent: await readBattery(),
      });
      await commit((current) => ({
        ...current,
        roster: outcome.state.roster,
        setup: outcome.state.setup,
        lastSyncAt: outcome.state.lastSyncAt,
        live: outcome.state.setup?.goLiveAllowed ? current.live : false,
      }));
      if (outcome.ok) setNotice(outcome.message);
      else setError(outcome.message);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Can't reach the laptop. Punches stay on this phone.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (bootError) {
    return (
      <main className="app">
        <h1>Punches could not be opened</h1>
        <p className="banner bad">{bootError}</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="app">
        <h1>Opening punches…</h1>
      </main>
    );
  }

  const block = goLiveBlock(state, APP_VERSION);
  const offsetWarn = state.setup
    ? clockOffsetWarning(state.setup.clockOffsetMs, state.setup.clockOffsetWarnMs)
    : null;
  const frames =
    state.setup && panel === "sync"
      ? state.setup.role === "start"
        ? exportStartQr(state, state.lastSyncAt ?? new Date().toISOString())
        : exportPunchQr(state, state.lastSyncAt ?? new Date().toISOString())
      : [];
  const frame = frames[Math.min(qrIndex, Math.max(frames.length - 1, 0))] ?? null;

  return (
    <main className="app">
      <header className="top">
        <p className="eyebrow">{state.setup ? state.setup.checkName : "MWHE Station"}</p>
        <p className="eyebrow">v{APP_VERSION}</p>
      </header>
      {error ? <p className="banner bad">{error}</p> : null}
      {offsetWarn ? <p className="banner warn">{offsetWarn}</p> : null}
      {notice ? <p className="banner ok">{notice}</p> : null}

      {!state.setup ? (
        <section className="stack">
          <h1>Set up this check</h1>
          <p>Scan the code on the laptop. This phone then stays on that check.</p>
          {camera === "pair" ? (
            <QrCamera
              onCode={(text) => {
                void applyPairing(text).catch((caught) =>
                  setError(
                    caught instanceof Error ? caught.message : "That code did not work.",
                  ),
                );
              }}
              onClose={() => setCamera(null)}
            />
          ) : (
            <button type="button" className="wide" onClick={() => setCamera("pair")}>
              Scan laptop code
            </button>
          )}
          <label className="field">
            Or paste the code
            <textarea
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              rows={4}
            />
          </label>
          <button
            type="button"
            className="wide alt"
            onClick={() => {
              void applyPairing(paste).catch((caught) =>
                setError(
                  caught instanceof Error ? caught.message : "That code did not work.",
                ),
              );
            }}
          >
            Use pasted code
          </button>
        </section>
      ) : null}

      {state.setup && !state.live ? (
        <section className="stack">
          <h1>{state.setup.checkName}</h1>
          <p>
            {state.setup.eventName} · {state.setup.raceName}
          </p>
          <p className="banner">
            Clock {formatClockOffset(state.setup.clockOffsetMs)}
            {state.setup.offsetConfirmed
              ? ""
              : " from the QR time. Sync to measure it against the laptop."}
          </p>
          {block ? <p className="banner bad">{block}</p> : null}
          <button
            type="button"
            className="wide"
            disabled={Boolean(block) || busy}
            onClick={() => {
              void commit((current) => goLive(current, APP_VERSION))
                .then(() =>
                  setNotice(
                    state.setup?.role === "start"
                      ? "The start is live. Times save on this phone immediately."
                      : state.setup?.role === "finish"
                        ? "The finish is live. Times save on this phone immediately."
                        : "This check is live. Punches save on this phone immediately.",
                  ),
                )
                .catch((caught) =>
                  setError(caught instanceof Error ? caught.message : "Cannot go live."),
                );
            }}
          >
            Go live
          </button>
          <button
            type="button"
            className="wide alt"
            disabled={busy}
            onClick={() => void syncNow()}
          >
            {busy ? "Syncing…" : "Sync with the laptop"}
          </button>
          <DoubleTapField
            seconds={state.settings.doubleTapWindowMs / 1000}
            onChange={(seconds) => {
              void commit((current) =>
                setDoubleTapWindow(current, Math.round(seconds * 1000)),
              ).catch((caught) =>
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not save that window.",
                ),
              );
            }}
          />
          {state.punches.length === 0 &&
          state.rowStarts.length === 0 &&
          state.riderStarts.length === 0 ? (
            <button
              type="button"
              className="wide alt"
              onClick={() => {
                void commit((current) => clearSetup(current)).catch((caught) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "This phone stays on this check.",
                  ),
                );
              }}
            >
              Start over
            </button>
          ) : (
            <p>
              {state.setup.role === "start"
                ? state.rowStarts.length + state.riderStarts.length
                : state.punches.length}{" "}
              times are already on this phone.
            </p>
          )}
        </section>
      ) : null}

      {state.setup && state.live ? (
        <>
          <p className="muted">
            {stationRole(state) === "start"
              ? state.rowStarts.filter((entry) => !entry.voided).length +
                state.riderStarts.filter((entry) => !entry.voided).length
              : activePunchCount(state)}{" "}
            {stationRole(state) === "start" ? "starts" : "punches"} · roster v
            {state.roster?.version ?? 0}
            {state.lastSyncAt ? "" : " · not synced yet"}
          </p>
          {panel === "punch" && stationRole(state) === "start" ? (
            <StartBoard
              state={state}
              digits={digits}
              disabled={busy}
              onDigits={setDigits}
              onRow={(order) => void startRow(order, false)}
              onRider={() => void startRider(false)}
              onUndo={() => setUndoOpen(true)}
            />
          ) : null}
          {panel === "punch" && stationRole(state) !== "start" ? (
            <section className="stack">
              {stationRole(state) === "finish" ? <h1>Finish</h1> : null}
              <Keypad
                value={digits}
                disabled={busy}
                onChange={setDigits}
                onPunch={() => void punch(false)}
                actionLabel={stationRole(state) === "finish" ? "Finish" : "Punch"}
              />
              <button
                type="button"
                className="wide alt"
                onClick={() => setUndoOpen(true)}
              >
                Undo last punch
              </button>
            </section>
          ) : null}
          {panel === "roster" ? <Roster state={state} /> : null}
          {panel === "sync" ? (
            <section className="stack">
              <button
                type="button"
                className="wide"
                disabled={busy}
                onClick={() => void syncNow()}
              >
                {busy ? "Syncing…" : "Sync with the laptop"}
              </button>
              <p>
                {state.lastSyncAt
                  ? `Last sync ${new Date(state.lastSyncAt).toLocaleTimeString()}`
                  : "This phone has not reached the laptop yet. Punches stay here."}
              </p>
              <h2>Punch codes for the laptop</h2>
              {frame ? <QrImage text={frame} /> : <p>No punches to show.</p>}
              {frames.length > 1 ? (
                <div className="tabs">
                  <button
                    type="button"
                    className="tab"
                    onClick={() => setQrIndex((index) => Math.max(0, index - 1))}
                  >
                    Previous
                  </button>
                  <p className="tab active">
                    {Math.min(qrIndex, frames.length - 1) + 1} / {frames.length}
                  </p>
                  <button
                    type="button"
                    className="tab"
                    onClick={() =>
                      setQrIndex((index) => Math.min(frames.length - 1, index + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              ) : null}
              <h2>Roster code from the laptop</h2>
              {camera === "roster" ? (
                <QrCamera
                  onCode={(text) => {
                    void applyRoster(text).catch((caught) =>
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : "That roster code did not work.",
                      ),
                    );
                  }}
                  onClose={() => setCamera(null)}
                />
              ) : (
                <button
                  type="button"
                  className="wide alt"
                  onClick={() => setCamera("roster")}
                >
                  Scan roster code
                </button>
              )}
              <label className="field">
                Or paste the roster code
                <textarea
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                  rows={3}
                />
              </label>
              <button
                type="button"
                className="wide alt"
                onClick={() => {
                  void applyRoster(paste).catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "That roster code did not work.",
                    ),
                  );
                }}
              >
                Apply pasted roster
              </button>
              <DoubleTapField
                seconds={state.settings.doubleTapWindowMs / 1000}
                onChange={(seconds) => {
                  void commit((current) =>
                    setDoubleTapWindow(current, Math.round(seconds * 1000)),
                  ).catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Could not save that window.",
                    ),
                  );
                }}
              />
              <button
                type="button"
                className="wide alt"
                onClick={() => {
                  void commit((current) => endLive(current)).then(() =>
                    setNotice("Recording is paused. Punches stay on this phone."),
                  );
                }}
              >
                Pause this check
              </button>
            </section>
          ) : null}
          <nav className="tabs" aria-label="Station">
            <button
              type="button"
              className={panel === "punch" ? "tab active" : "tab"}
              onClick={() => setPanel("punch")}
            >
              Punch
            </button>
            <button
              type="button"
              className={panel === "roster" ? "tab active" : "tab"}
              onClick={() => setPanel("roster")}
            >
              Roster
            </button>
            <button
              type="button"
              className={panel === "sync" ? "tab active" : "tab"}
              onClick={() => setPanel("sync")}
            >
              Sync
            </button>
          </nav>
        </>
      ) : null}

      <p className="foot">Android 8 or newer. Times come from this phone's clock.</p>

      {flash ? (
        <div className={flash.includes("Not on roster") ? "flash warn" : "flash"}>
          {flash}
        </div>
      ) : null}
      {doubleTap ? (
        <div className="dialog">
          <div className="card" role="alertdialog" aria-label="Possible double punch">
            <h2>Number {doubleTap} was just punched</h2>
            <p>Save another punch for the same number?</p>
            <button
              type="button"
              className="wide"
              onClick={() => {
                if (doubleTap?.startsWith("row:"))
                  void startRow(Number(doubleTap.slice(4)), true);
                else if (state.setup?.role === "start") void startRider(true);
                else void punch(true);
              }}
            >
              Save another
            </button>
            <button type="button" className="wide alt" onClick={() => setDoubleTap(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {undoOpen ? (
        <div className="dialog">
          <div className="card" role="alertdialog" aria-label="Undo punch">
            <h2>
              {state.setup?.role === "start"
                ? "Undo the last start?"
                : "Undo the last punch?"}
            </h2>
            <p>It stays in the file as voided, and the laptop will not score it.</p>
            <button
              type="button"
              className="wide"
              onClick={() => {
                void commit((current) =>
                  current.setup?.role === "start"
                    ? (voidLatestStart(current)?.state ?? current)
                    : (voidLatestPunch(current)?.state ?? current),
                )
                  .then(() => {
                    setUndoOpen(false);
                    setNotice("Last punch voided.");
                  })
                  .catch((caught) =>
                    setError(
                      caught instanceof Error ? caught.message : "Could not undo.",
                    ),
                  );
              }}
            >
              Undo
            </button>
            <button type="button" className="wide alt" onClick={() => setUndoOpen(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Roster({ state }: { state: StationState }) {
  const [query, setQuery] = useState("");
  const riders = state.roster?.riders.filter((rider) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      rider.name.toLowerCase().includes(needle) ||
      String(rider.number).includes(needle) ||
      rider.class.toLowerCase().includes(needle)
    );
  });
  return (
    <section className="stack">
      <label className="field">
        Find a rider
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputMode="search"
        />
      </label>
      <p>
        {riders?.length ?? 0} on roster v{state.roster?.version ?? 0}. Name, number, and
        class only.
      </p>
      <ul className="roster">
        {(riders ?? []).map((rider) => (
          <li key={rider.number}>
            <span>#{rider.number}</span>
            <span>{rider.name}</span>
            <span>{rider.class}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DoubleTapField({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  return (
    <label className="field">
      Warn when the same number is punched again within (seconds). 0 turns the warning
      off.
      <input
        type="number"
        min={0}
        step={1}
        value={seconds}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function activePunchCount(state: StationState): number {
  return state.punches.filter((punch) => !punch.voided).length;
}

async function readBattery(): Promise<number | null> {
  const getter = (
    navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }
  ).getBattery;
  if (!getter) return null;
  try {
    const battery = await getter.call(navigator);
    return Math.round(battery.level * 100);
  } catch {
    return null;
  }
}
