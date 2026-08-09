/**
 * Bidirectional proof for the real generated analysis component.
 *
 * Host calls exercise ping, parameter, and typed-tree guest exports. Guest log
 * and event calls return through the compiled Node host, proving the opposite
 * side of the Component Model boundary without a browser or website runtime.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { capturedEvents } from "../../../target/component-tests/host/events.js";
import { capturedLogLines } from "../../../target/component-tests/host/log.js";
import {
  ANALYSIS_TEXTURE_HEIGHT,
  ANALYSIS_TEXTURE_WIDTH,
  EXPECTED_TREE_AGGREGATES,
  FIXTURE_NODES,
} from "../fixtures/analysis-tree.js";
import {
  loadAnalysisModule,
  type AnalysisModuleExports,
} from "../support/generated-components.js";

describe("generated analysis component", () => {
  let analysis: AnalysisModuleExports;

  beforeAll(async () => {
    ({ analysis } = await loadAnalysisModule());
  });

  it("[P10] projects typed layout records and exact aggregates", () => {
    const stats = analysis.analyzeTree(
      FIXTURE_NODES,
      ANALYSIS_TEXTURE_WIDTH,
      ANALYSIS_TEXTURE_HEIGHT,
    );

    // Priority 10: exact typed result across the component boundary.
    expect(stats.nodeCount).toBe(EXPECTED_TREE_AGGREGATES.nodeCount);
    expect(stats.maxDepth).toBe(EXPECTED_TREE_AGGREGATES.maxDepth);
    expect(stats.ghostCount).toBe(EXPECTED_TREE_AGGREGATES.ghostCount);
    expect(stats.totalArea).toBe(EXPECTED_TREE_AGGREGATES.totalArea);
    expect(stats.coverage).toBe(EXPECTED_TREE_AGGREGATES.coverage);
  });

  it("[P9] projects the public ping string", () => {
    const pingReply = analysis.ping("test");

    // Priority 9: public identity, version, and caller input.
    expect(pingReply).toMatch(/^inspector-component \d+\.\d+\.\d+: test$/);
  });

  it("[P8] accepts the plain JSON parameter string", () => {
    // Priority 8: the public call completes without trapping.
    expect(() => analysis.setParams('{"kernel":"none"}')).not.toThrow();
  });

  it("[P7] publishes the existing guest logs and event", () => {
    analysis.ping("test");
    analysis.analyzeTree(
      FIXTURE_NODES,
      ANALYSIS_TEXTURE_WIDTH,
      ANALYSIS_TEXTURE_HEIGHT,
    );

    // Priority 7: existing host-log calls remain connected.
    expect(
      capturedLogLines.some(
        (line) => line.lvl === "debug" && line.msg.includes("ping received"),
      ),
    ).toBe(true);
    expect(
      capturedLogLines.some(
        (line) => line.lvl === "info" && line.msg.includes("analyzed 6 nodes"),
      ),
    ).toBe(true);
    // Priority 7: existing host-event payload remains exact.
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]?.name).toBe("analysis-done");
    expect(JSON.parse(capturedEvents[0]?.payloadJson ?? "null")).toEqual(
      EXPECTED_TREE_AGGREGATES,
    );
  });
});
