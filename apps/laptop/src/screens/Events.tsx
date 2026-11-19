import {
  previewReimport,
  type EventSummary,
  type RacePackage,
  type ReimportPreview,
} from "@mwhe/core";
import { useEffect, useMemo, useState } from "react";

import { formatDay } from "../format";
import { messageOf } from "../message";
import { useHub } from "../use-hub";
import { Banner } from "../ui";
import { ReimportDialog } from "./ReimportDialog";

type Filter = "upcoming" | "past" | "all";
type ImportState = "fresh" | "imported" | "changes";

export function Events() {
  const hub = useHub();
  const [rows, setRows] = useState<EventSummary[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(hub.activeEventId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ReimportPreview | null>(null);
  const [incoming, setIncoming] = useState<RacePackage | null>(null);

  async function refresh() {
    if (!hub.hasToken) return;
    setError(null);
    setBusy(true);
    try {
      const list = await hub.listEvents();
      setRows(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Load once when the token or site changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.hasToken, hub.baseUrl]);

  const today = localToday();
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const end = row.endDate ?? row.date;
      const past = end < today;
      if (filter === "upcoming" && past) return false;
      if (filter === "past" && !past) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.locationName.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, query, today]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  async function importSelected(row: EventSummary) {
    setError(null);
    setBusy(true);
    try {
      await hub.importEvent(row.id, row.updatedAt);
      setSelectedId(row.id);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openReimport(row: EventSummary) {
    setError(null);
    setBusy(true);
    try {
      await hub.selectEvent(row.id);
      const racePackage = await hub.fetchPackage(row.id);
      const current = hub.events[row.id];
      if (!current) throw new Error("Import the event first.");
      setIncoming(racePackage);
      setPreview(previewReimport(current, racePackage));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Events on midwesthardenduro.com</h1>
          <p className="lede">
            Every event on the site. Pick one to bring its races and riders onto this
            laptop.
          </p>
        </div>
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="segment" role="group" aria-label="When">
            {(["upcoming", "past", "all"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {item === "all" ? "All" : item === "past" ? "Past" : "Upcoming"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !hub.hasToken}
            onClick={() => void refresh()}
          >
            Refresh list
          </button>
        </div>
      </header>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {!hub.hasToken ? (
        <Banner tone="info">
          Sign in to load the event list. Events already imported stay on this laptop.
        </Banner>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>EVENT</th>
              <th>DATE</th>
              <th>LOCATION</th>
              <th>RACES</th>
              <th>REGISTRATIONS</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const status = importStatus(row, hub.events);
              return (
                <tr
                  key={row.id}
                  className={row.id === selectedId ? "clickable selected" : "clickable"}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="event-name">{row.name}</td>
                  <td>{formatDay(row.date)}</td>
                  <td>{row.locationName}</td>
                  <td>{row.raceCount}</td>
                  <td>{row.registrationCount}</td>
                  <td>
                    <Status status={status} />
                  </td>
                  <td>
                    {status === "fresh" ? (
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void importSelected(row);
                        }}
                      >
                        {row.id === selectedId ? "Import race details" : "Import"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void openReimport(row);
                        }}
                      >
                        Re-import
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className="hint" style={{ padding: 16 }}>
            No events match.
          </p>
        ) : null}
      </div>
      {selected ? (
        <div className="selected-bar">
          <div>
            <strong>
              Selected: {selected.name} · {formatDay(selected.date)}
            </strong>
            <p className="hint">
              {selected.raceCount} races, {selected.registrationCount} registrations
              {selected.locationName ? `, ${selected.locationName}` : ""}.
            </p>
          </div>
          {importStatus(selected, hub.events) === "fresh" ? (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void importSelected(selected)}
            >
              Import race details
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void openReimport(selected)}
            >
              Re-import
            </button>
          )}
        </div>
      ) : null}
      <p className="legend">
        <span>
          <b className="imported">Imported</b> — on this laptop and matches the site
        </span>
        <span>
          <b className="changes">Imported – changes on site</b> — Re-import shows a
          preview first
        </span>
        <span>
          <b className="fresh">Not imported</b> — not on this laptop yet
        </span>
      </p>
      {preview && incoming ? (
        <ReimportDialog
          name={incoming.event.name}
          importedAt={hub.events[incoming.event.id]?.downloadedAt ?? null}
          preview={preview}
          busy={busy}
          onClose={() => {
            setPreview(null);
            setIncoming(null);
          }}
          onApply={() => {
            setBusy(true);
            void hub
              .applyImported(incoming)
              .then(() => {
                setPreview(null);
                setIncoming(null);
              })
              .catch((caught: unknown) => setError(messageOf(caught)))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </div>
  );
}

function Status({ status }: { status: ImportState }) {
  if (status === "imported") {
    return (
      <span className="status imported">
        <i className="dot" /> Imported
      </span>
    );
  }
  if (status === "changes") {
    return (
      <span className="status changes">
        <i className="dot" /> Imported – changes on site
      </span>
    );
  }
  return (
    <span className="status fresh">
      <i className="dot" /> Not imported
    </span>
  );
}

function importStatus(
  row: EventSummary,
  events: { [id: string]: { sourceUpdatedAt?: string | null } },
): ImportState {
  const local = events[row.id];
  if (!local) return "fresh";
  if (
    row.updatedAt &&
    local.sourceUpdatedAt &&
    Date.parse(row.updatedAt) > Date.parse(local.sourceUpdatedAt)
  ) {
    return "changes";
  }
  return "imported";
}

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
