import { useState } from "react";

import { openSignInPage } from "../auth/google";
import { messageOf } from "../message";

/** A sign-in URL the director can open or copy if the browser did not appear. */
export function SignInLink({
  url,
  onError,
}: {
  url: string;
  onError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  function open() {
    setCopyError(null);
    void openSignInPage(url).catch((caught: unknown) => onError(messageOf(caught)));
  }

  return (
    <div className="stack">
      <p className="hint">
        If the browser did not open, use this link. It is the same sign-in page.
      </p>
      <input
        readOnly
        aria-label="Sign-in link"
        value={url}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="row">
        <button type="button" className="btn small" onClick={open}>
          Open the sign-in page
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setCopyError(null);
            void navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => setCopyError("Select the link above and copy it."),
            );
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {copyError ? <p className="hint">{copyError}</p> : null}
    </div>
  );
}
