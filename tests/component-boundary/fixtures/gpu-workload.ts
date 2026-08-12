export const SUMMARY_BYTE_LENGTH = 72;
export const COMPONENT_REFERENCE_BUFFER_SIZE = 16 + 16 * 32;
export const ANALYSIS_TEXTURE_WIDTH = 200;
export const ANALYSIS_TEXTURE_HEIGHT = 100;
export const ANALYSIS_NODE_COUNT = 6;

export interface AnalysisRequest {
  entryId: string;
  displayName: string;
  textureWidth: number;
  textureHeight: number;
  nodeCount: number;
}

export interface AnalysisPlan {
  request: AnalysisRequest;
  kernel: string;
  workgroupSizeX: number;
  workgroupSizeY: number;
  dispatchWorkgroupsX: number;
  dispatchWorkgroupsY: number;
  summaryWordsPerNode: number;
  summaryNodeStrideBytes: number;
  edgeDiscoveryTileSize: number;
  edgeDiscoveryThresholdMilli: number;
  edgeDiscoverySlotCapacity: number;
}

export const createAnalysisRequest = (
  entryId: string,
  displayName: string,
): AnalysisRequest => ({
  entryId,
  displayName,
  textureWidth: ANALYSIS_TEXTURE_WIDTH,
  textureHeight: ANALYSIS_TEXTURE_HEIGHT,
  nodeCount: ANALYSIS_NODE_COUNT,
});

export const STABLE_ANALYSIS_REQUEST = createAnalysisRequest(
  "test-entry",
  "TestComponent",
);

export const ASYNC_ANALYSIS_REQUEST = createAnalysisRequest(
  "test-entry-async",
  "TestComponentAsync",
);

export const FRAME_ANALYSIS_REQUEST = createAnalysisRequest(
  "test-entry-frame",
  "TestComponentFrame",
);

/**
 * Exact public plan established by R2-A and preserved by R2-B for the shared
 * 200 × 100 fixture.
 */
export const EXPECTED_STABLE_GPU_PLAN: AnalysisPlan = {
  request: STABLE_ANALYSIS_REQUEST,
  kernel: "per-component-stats-v1",
  workgroupSizeX: 8,
  workgroupSizeY: 8,
  dispatchWorkgroupsX: 25,
  dispatchWorkgroupsY: 13,
  summaryWordsPerNode: 3,
  summaryNodeStrideBytes: 12,
  edgeDiscoveryTileSize: 8,
  edgeDiscoveryThresholdMilli: 60,
  edgeDiscoverySlotCapacity: 325,
};

export const EXPECTED_FRAME_GPU_PLAN: AnalysisPlan = {
  ...EXPECTED_STABLE_GPU_PLAN,
  request: FRAME_ANALYSIS_REQUEST,
};

export const EXPECTED_ASYNC_SUMMARY = {
  textureWidth: ANALYSIS_TEXTURE_WIDTH,
  textureHeight: ANALYSIS_TEXTURE_HEIGHT,
  nodeCount: ANALYSIS_NODE_COUNT,
  nodes: Array.from({ length: ANALYSIS_NODE_COUNT }, (_, nodeIndex) => ({
    nodeIndex,
    texelCount: 0,
    inkCount: 0,
    luminanceSum: 0,
    meanLuminance: 0,
  })),
};

export const EXPECTED_STABLE_HOST_RESULT = {
  entryId: STABLE_ANALYSIS_REQUEST.entryId,
  textureWidth: ANALYSIS_TEXTURE_WIDTH,
  textureHeight: ANALYSIS_TEXTURE_HEIGHT,
  nodeCount: ANALYSIS_NODE_COUNT,
  nodes: [],
};
