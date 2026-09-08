import { describe, expect, mock, test } from "bun:test";

describe("InstanceDiscovery", () => {
  test("advertise/discover/stop lifecycle", async () => {
    const publishedStopMock = mock(() => {});
    const browserStopMock = mock(() => {});
    const publishMock = mock(() => ({ stop: publishedStopMock }));
    const findMock = mock((_opts: unknown, onUp?: (service: any) => void) => {
      if (typeof onUp === "function") {
        onUp({
          name: "bgagent-12345",
          port: 5165,
          referer: {
            address: "127.0.0.1",
          },
          txt: {
            pid: "12345",
            startedAt: "2024-01-01T10:00:00.000Z",
            url: "http://127.0.0.1:5165",
            version: "1.0.0",
          },
        });
      }
      return { stop: browserStopMock };
    });
    const unpublishAllMock = mock((cb?: () => void) => cb?.());
    const destroyMock = mock(() => {});

    mock.module("bonjour-service", () => ({
      Bonjour: class {
        publish = publishMock;
        find = findMock;
        unpublishAll = unpublishAllMock;
        destroy = destroyMock;
      },
    }));

    const { InstanceDiscovery } = await import("../discovery");
    const discovery = new InstanceDiscovery();

    await discovery.advertise(5165, {
      pid: "12345",
      startedAt: "2024-01-01T10:00:00.000Z",
      url: "http://127.0.0.1:5165",
      version: "1.0.0",
    });

    const discovered = await discovery.discover();
    discovery.stop();

    expect(publishMock).toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ probe: false }));
    expect(findMock).toHaveBeenCalled();
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toEqual(
      expect.objectContaining({
        name: "bgagent-12345",
        host: "127.0.0.1",
        port: 5165,
        metadata: {
          pid: "12345",
          startedAt: "2024-01-01T10:00:00.000Z",
          url: "http://127.0.0.1:5165",
          version: "1.0.0",
        },
      })
    );
    expect(publishedStopMock).toHaveBeenCalled();
    expect(browserStopMock).toHaveBeenCalled();
    expect(unpublishAllMock).toHaveBeenCalled();
    expect(destroyMock).toHaveBeenCalled();
  });
});
