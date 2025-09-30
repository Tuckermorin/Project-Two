export function assertIPSShape(ips:any) {
  if (!ips || !Array.isArray(ips.factors) || ips.factors.length === 0) {
    throw new Error("Active IPS found but has no enabled factors");
  }
}
