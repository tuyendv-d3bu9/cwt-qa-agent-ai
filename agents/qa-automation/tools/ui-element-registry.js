// agents/qa-automation/tools/ui-element-registry.js
// Deterministic (NO LLM) registry of UI elements discovered during exploration.
//
// WHY — every test case of a feature usually touches the SAME page. Without a registry,
// each test case re-explores that page from scratch: N test cases means paying N times
// to describe one page. The registry makes exploration happen once and be reused.
//
// !! THE TRAP THIS AVOIDS: `ref=eN` from a snapshot is valid ONLY inside that snapshot.
// It changes between captures of the very same page. Keying the registry by `ref` would
// look fine on the first test case and silently target the wrong element afterwards.
// So the registry stores:
//   - key      = role + accessible name        (stable across snapshots)
//   - locator  = Playwright locator string     (the durable artifact; from
//                browser_generate_locator, i.e. produced by Playwright itself)
//   - ref      = transient, re-resolved per session, NEVER the lookup key
//
// Storage is tier 4 (memory/working/) — per-run data. Cross-run reuse would need tier 2;
// not done yet, and the fingerprint used for incremental authoring is kept in the DB
// instead (see agents/runtime/db.js artifacts).

import { runTool } from "../../runtime/tools.js";
import * as P from "../../runtime/paths.js";

export const REGISTRY_PATH = P.UI_ELEMENTS;

/** Stable lookup key. Case/whitespace-insensitive so trivial wording drift still hits. */
export function elementKey(role, name) {
    return `${String(role ?? "").toLowerCase()}|${String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export async function loadRegistry(path = REGISTRY_PATH) {
    const res = await runTool("read_json", { path });
    if (res.error) return { url: null, elements: {}, fingerprint: null, updatedAt: null };
    const data = res.data ?? {};
    return {
        url: data.url ?? null,
        elements: data.elements ?? {},
        fingerprint: data.fingerprint ?? null,
        updatedAt: data.updatedAt ?? null,
    };
}

export async function saveRegistry(registry, path = REGISTRY_PATH) {
    const res = await runTool("write_json", { path, data: registry });
    if (res.error) throw new Error(`Không ghi được ${path}: ${res.error}`);
    return registry;
}

/**
 * Add/refresh one element. `ref` is stored for convenience within the current session
 * but is explicitly marked transient so nothing downstream treats it as durable.
 */
export function putElement(registry, { role, name, locator, ref = null, source = null }) {
    const key = elementKey(role, name);
    const existing = registry.elements[key];
    registry.elements[key] = {
        role,
        name,
        // Keep a locator we already have if the new call did not bring one — losing a
        // durable locator because one refresh failed to generate it would be a regression.
        locator: locator ?? existing?.locator ?? null,
        ref,                    // transient: valid only for the snapshot it came from
        source: source ?? existing?.source ?? null,
        firstSeen: existing?.firstSeen ?? new Date().toISOString(),
    };
    return registry.elements[key];
}

export function getElement(registry, role, name) {
    return registry.elements[elementKey(role, name)] ?? null;
}

/** Elements that have a durable locator — the ones usable for spec generation. */
export function resolvedElements(registry) {
    return Object.values(registry.elements).filter(e => e.locator);
}

/**
 * Which of the wanted elements the registry cannot answer yet. These — and only these —
 * justify another MCP round trip.
 * @param {Array<{role?: string, name: string}>} wanted
 */
export function missingElements(registry, wanted) {
    return wanted.filter(w => {
        // A name-only request matches any role with that name.
        if (!w.role) {
            return !Object.values(registry.elements).some(
                e => elementKey(e.role, e.name).endsWith("|" + String(w.name).trim().toLowerCase().replace(/\s+/g, " ")) && e.locator
            );
        }
        return !getElement(registry, w.role, w.name)?.locator;
    });
}

/**
 * A page structure change invalidates the registry: locators generated against the old
 * layout may no longer resolve. Returns true when the caller must re-explore.
 */
export function isStale(registry, { url, fingerprint }) {
    if (!registry.updatedAt) return true;
    if (url && registry.url && registry.url !== url) return true;
    if (fingerprint && registry.fingerprint && registry.fingerprint !== fingerprint) return true;
    return false;
}

export function stamp(registry, { url, fingerprint }) {
    registry.url = url ?? registry.url;
    registry.fingerprint = fingerprint ?? registry.fingerprint;
    registry.updatedAt = new Date().toISOString();
    return registry;
}
