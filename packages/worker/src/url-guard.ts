/**
 * Capture target validation. Defense in depth, in order:
 * 1. Structural URL checks (scheme, credentials, port, host syntax).
 * 2. Hostname policy (allowlisted Framer hosts, or custom domain that must pass
 *    the generator check performed by the caller).
 * 3. DNS resolution via DoH: every A/AAAA answer must be public.
 * 4. The same checks run for every request the browser makes (see requestFilter),
 *    including redirects, so a one-time DNS check cannot be bypassed by rebinding.
 */

export type GuardFailure =
  | "scheme"
  | "credentials"
  | "port"
  | "host_syntax"
  | "host_forbidden"
  | "ip_literal"
  | "dns_failed"
  | "dns_private"
  | "too_long"

export class GuardError extends Error {
  constructor(
    readonly reason: GuardFailure,
    message?: string,
  ) {
    super(message ?? reason)
  }
}

const MAX_URL_LENGTH = 2048
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const FORBIDDEN_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan", ".arpa", ".onion"]
const FRAMER_HOST_SUFFIXES = [".framer.app", ".framer.website", ".framer.ai", ".framer.media"]

export interface TargetUrl {
  href: string
  hostname: string
  /** true when host is a Framer-managed subdomain; custom domains must pass the generator check. */
  framerManaged: boolean
}

/** Structural validation. Pure, synchronous, no network. */
export function parseTargetUrl(input: string): TargetUrl {
  if (input.length > MAX_URL_LENGTH) throw new GuardError("too_long")
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new GuardError("host_syntax", "invalid URL")
  }
  if (url.protocol !== "https:") throw new GuardError("scheme")
  if (url.username || url.password) throw new GuardError("credentials")
  if (url.port !== "" && url.port !== "443") throw new GuardError("port")
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (host.startsWith("[") || isIpLiteral(host)) throw new GuardError("ip_literal")
  if (host === "localhost" || FORBIDDEN_SUFFIXES.some((s) => host.endsWith(s)))
    throw new GuardError("host_forbidden")
  if (!HOSTNAME_RE.test(host)) throw new GuardError("host_syntax")
  url.hash = ""
  url.username = ""
  url.password = ""
  return {
    href: url.href,
    hostname: host,
    framerManaged: FRAMER_HOST_SUFFIXES.some((s) => host.endsWith(s)),
  }
}

export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:.]+$/i.test(host) && host.includes(":") || /^0x/i.test(host) || /^\d+$/.test(host)
}

/** True for any address that must never be fetched: loopback, private, link-local, metadata, multicast, reserved. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.includes(".") && !ip.includes(":") ? ip : mappedV4(ip)
  if (v4) {
    const p = v4.split(".").map(Number)
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
    const [a, b] = p as [number, number, number, number]
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  const v6 = expandV6(ip)
  if (!v6) return true
  const h = v6.toLowerCase()
  if (h.startsWith("0000:0000:0000:0000:0000:0000:")) return true // ::, ::1, IPv4-compatible ::a.b.c.d
  if (h.startsWith("2001:0000:")) return true // Teredo 2001::/32 embeds client v4
  if (h.startsWith("0064:ff9b:0001")) return true // 64:ff9b:1::/48 local-use NAT64
  const first = Number.parseInt(h.slice(0, 4), 16)
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (h.startsWith("2001:0db8")) return true // documentation
  if (h.startsWith("0064:ff9b")) return true // NAT64 64:ff9b::/96 - could map to private v4
  if (h.startsWith("2002:")) return true // 6to4 embeds v4
  return false
}

function mappedV4(ip: string): string | null {
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (m?.[1]) return m[1]
  const full = expandV6(ip)
  if (full && /^0000:0000:0000:0000:0000:ffff:/.test(full)) {
    const [hi, lo] = full.split(":").slice(6) as [string, string]
    const n = (Number.parseInt(hi, 16) << 16) | Number.parseInt(lo, 16)
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")
  }
  return null
}

function expandV6(ip: string): string | null {
  const raw = ip.replace(/^\[|\]$/g, "").split("%")[0] ?? ""
  if (!/^[0-9a-f:.]+$/i.test(raw) || !raw.includes(":")) return null
  const parts = raw.split("::")
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(":") : []
  const tail = parts[1] ? parts[1].split(":") : []
  // embedded dotted v4 at the end
  const last = tail.length ? tail[tail.length - 1] : head[head.length - 1]
  if (last?.includes(".")) {
    const v4 = last.split(".").map(Number)
    if (v4.length !== 4) return null
    const [a, b, c, d] = v4 as [number, number, number, number]
    const repl = [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)]
    if (tail.length) tail.splice(-1, 1, ...repl)
    else head.splice(-1, 1, ...repl)
  }
  const missing = 8 - head.length - tail.length
  if (missing < 0 || (parts.length === 1 && missing !== 0)) return null
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail]
  if (groups.some((g) => g.length === 0 || g.length > 4)) return null
  return groups.map((g) => g.padStart(4, "0")).join(":")
}

export interface Resolver {
  (hostname: string): Promise<string[]>
}

/** DNS over HTTPS resolver (Cloudflare). Returns all A and AAAA answers. */
export const dohResolver: Resolver = async (hostname) => {
  const ips: string[] = []
  for (const type of ["A", "AAAA"]) {
    // Fail closed: any failed query aborts the whole resolution (the browser could otherwise use the unchecked family).
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) throw new GuardError("dns_failed", `doh ${type} ${res.status}`)
    const data = (await res.json()) as { Status?: number; Answer?: { type: number; data: string }[] }
    if (data.Status !== undefined && data.Status !== 0 && data.Status !== 3) throw new GuardError("dns_failed", `doh status ${data.Status}`)
    for (const a of data.Answer ?? []) if (a.type === 1 || a.type === 28) ips.push(a.data)
  }
  return ips
}

/** Resolve and require every answer to be public. */
export async function assertPublicHost(hostname: string, resolve: Resolver = dohResolver): Promise<string[]> {
  let ips: string[]
  try {
    ips = await resolve(hostname)
  } catch {
    throw new GuardError("dns_failed")
  }
  if (ips.length === 0) throw new GuardError("dns_failed", "no answers")
  if (ips.some(isPrivateIp)) throw new GuardError("dns_private")
  return ips
}

/**
 * Per-request filter for the headless browser. Call for the navigation and for
 * every sub-request (puppeteer request interception). Caches per-host verdicts
 * for the lifetime of one capture job so DoH is hit once per host.
 */
export function createRequestFilter(resolve: Resolver = dohResolver) {
  const verdicts = new Map<string, Promise<boolean>>()
  return async (requestUrl: string): Promise<boolean> => {
    let target: TargetUrl
    try {
      target = parseTargetUrl(requestUrl)
    } catch {
      return false
    }
    let v = verdicts.get(target.hostname)
    if (!v) {
      v = assertPublicHost(target.hostname, resolve).then(() => true, () => false)
      verdicts.set(target.hostname, v)
    }
    return v
  }
}

/** Cheap "is this a Framer site" check for custom domains. NOT proof of ownership. */
export function looksLikeFramerHtml(html: string): boolean {
  return /<meta\s+name=["']generator["']\s+content=["']Framer[^"']*["']/i.test(html.slice(0, 65536))
}
