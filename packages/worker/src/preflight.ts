import { assertPublicHost, GuardError, looksLikeFramerHtml, parseTargetUrl, type Resolver, type TargetUrl } from "./url-guard.js"

const MAX_HOPS = 3
const MAX_HTML_BYTES = 65536

/**
 * Before any browser time is spent: validate URL, resolve host, follow redirects
 * manually (re-validating every hop), and require a Framer generator meta for
 * custom domains. Returns the final URL to navigate to.
 */
export async function preflight(
  input: string,
  deps: { fetch: typeof fetch; resolve?: Resolver },
): Promise<{ target: TargetUrl; hops: number }> {
  let target = parseTargetUrl(input)
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertPublicHost(target.hostname, deps.resolve)
    const res = await deps.fetch(target.href, {
      redirect: "manual",
      headers: { "user-agent": "SitePromo-Preflight/0.1", range: `bytes=0-${MAX_HTML_BYTES - 1}` },
    })
    const location = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop === MAX_HOPS) throw new GuardError("host_forbidden", "too many redirects")
      target = parseTargetUrl(new URL(location, target.href).href)
      continue
    }
    if (!res.ok) throw new GuardError("host_forbidden", `upstream status ${res.status}`)
    if (!target.framerManaged) {
      const html = (await res.text()).slice(0, MAX_HTML_BYTES)
      if (!looksLikeFramerHtml(html)) throw new GuardError("host_forbidden", "not a Framer site")
    }
    return { target, hops: hop }
  }
  throw new GuardError("host_forbidden")
}
