import { DISCOVERY_SERVICE_TYPE, DISCOVERY_TIMEOUT_MS } from "../constants";
import type { DiscoveredInstance } from "../types";

export class InstanceDiscovery {
  private bonjour: any = null;
  private published?: any;

  private async getBonjour(): Promise<any | null> {
    if (!this.bonjour) {
      try {
        const { Bonjour } = await import("bonjour-service");
        this.bonjour = new Bonjour();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[discovery] Failed to initialize bonjour: ${message}`);
        return null;
      }
    }

    return this.bonjour;
  }

  async advertise(port: number, metadata: Record<string, string>): Promise<void> {
    const bonjour = await this.getBonjour();
    if (!bonjour) return;

    try {
      this.published?.stop?.();
      this.published = bonjour.publish({
        name: `bgagent-${process.pid}`,
        type: DISCOVERY_SERVICE_TYPE,
        port,
        txt: metadata,
        // Skip the mDNS conflict probe: it false-positives on Windows/multicast
        // loopback ("Service name is already in use") even for a unique pid-based
        // name, tearing down the advertisement. Announcing without a probe keeps
        // the dashboard discoverable without the spurious error.
        probe: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[discovery] Failed to advertise service: ${message}`);
    }
  }

  async discover(timeoutMs?: number): Promise<DiscoveredInstance[]> {
    const bonjour = await this.getBonjour();
    if (!bonjour) return [];

    const timeout = timeoutMs ?? DISCOVERY_TIMEOUT_MS;

    return new Promise((resolve) => {
      const discovered = new Map<string, DiscoveredInstance>();

      try {
        const browser = bonjour.find({ type: DISCOVERY_SERVICE_TYPE }, (service: any) => {
          const host =
            service.host ||
            service.referer?.address ||
            service.fqdn ||
            service.addresses?.[0] ||
            "unknown";
          const cleanHost = typeof host === "string" ? host.replace(/\.$/, "") : String(host);
          const key = `${cleanHost}:${service.port}`;

          const txt = service.txt ?? {};
          const metadata: Record<string, string> = {};
          for (const [k, v] of Object.entries(txt)) {
            metadata[k] = String(v);
          }

          discovered.set(key, {
            name: service.name || key,
            host: cleanHost,
            port: service.port,
            metadata,
          });
        });

        setTimeout(() => {
          try {
            browser.stop();
          } catch {
            // ignore
          }
          resolve(Array.from(discovered.values()));
        }, timeout);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[discovery] Failed to browse services: ${message}`);
        resolve([]);
      }
    });
  }

  stop(): void {
    const bonjour = this.bonjour;
    if (!bonjour) return;

    try {
      this.published?.stop?.();
      this.published = undefined;
      bonjour.unpublishAll(() => {
        try {
          bonjour.destroy();
        } catch {
          // ignore
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[discovery] Failed to stop discovery service: ${message}`);
      try {
        bonjour.destroy();
      } catch {
        // ignore
      }
    } finally {
      this.bonjour = null;
    }
  }
}
