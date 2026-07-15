import type { Request } from "express";

function normalizeIp(value: string | undefined): string | undefined {
  if (!value) return undefined;

  let ip = value.trim();
  if (!ip) return undefined;

  if (ip.includes(",")) {
    ip = ip.split(",")[0]?.trim() || "";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice("::ffff:".length);
  }

  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") {
    return "127.0.0.1";
  }

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  } else {
    const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort) {
      ip = ipv4WithPort[1];
    }
  }

  return ip.toLowerCase();
}

export function getClientIp(req: Request): string {
  return (
    normalizeIp(req.ip) ||
    normalizeIp(req.ips?.[0]) ||
    normalizeIp(req.socket.remoteAddress) ||
    "unknown"
  );
}
