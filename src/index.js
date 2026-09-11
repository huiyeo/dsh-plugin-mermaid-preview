/**
 * Host half of dsh-plugin-mermaid-preview.
 *
 * The whole preview lives in the browser half (`./client`). This face exists
 * because the client module system discovers a browser package by scanning the
 * host Loader's mounted rows for a `dsh.client` declaration — a package that is
 * never mounted as a host row is never served to the browser. Contributing
 * nothing to the host tree is the contract, not an omission.
 */

/** Host plugin body: no host service, no host tool, no host row. */
export function apply() {}

/** No host service is required. */
export const inject = []
