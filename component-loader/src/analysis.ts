import {
  createComponentCapabilityLoader,
  type ComponentCapabilityLoader,
} from "./capability";
import {
  instantiateAnalysisComponent,
  type AnalysisInterface,
} from "./providers/analysis";
import { probeWebAssemblySupport } from "./support-webassembly";

/** Parent sentinel marking a root node. */
export const NO_PARENT = 0xffffffff;

/** Bit 0 of a node record's flags field: laid out but paints nothing. */
export const GHOST_FLAG = 0b1;

/**
 * One layout node, field-for-field the component-reference buffer's 32-byte
 * record.
 */
export interface NodeRecord {
  /**
   * x, y, width, and height in texel space. Values are unsnapped and may
   * exceed the texture; overflow is information, not an error.
   */
  readonly bounds: [number, number, number, number];
  /** Composite nesting level; 1 means a direct child of the captured root. */
  readonly depth: number;
  /** Index in this node list; `NO_PARENT` marks a root. */
  readonly parent: number;
  /** Bit flags; bit 0 is `GHOST_FLAG` for a node that paints nothing. */
  readonly flags: number;
  /** FNV-1a 32-bit hash of the component display name. */
  readonly nameHash: number;
}

/** Authored aggregate returned by the browser-safe analysis boundary. */
export interface TreeStats {
  /** Number of nodes received. */
  readonly nodeCount: number;
  /** Maximum node depth, or 0 for an empty tree. */
  readonly maxDepth: number;
  /** Number of nodes with `GHOST_FLAG` set. */
  readonly ghostCount: number;
  /** Sum of all node areas (width × height) in square texels. */
  readonly totalArea: number;
  /**
   * Sum of root-node areas divided by texture area
   * (`textureWidth × textureHeight`), or 0 when the texture is empty.
   */
  readonly coverage: number;
}

/** Ready browser-safe component capability with no generated types exposed. */
export interface ComponentAnalysisCapability {
  /**
   * Check liveness and version, returning
   * `inspector-component <crate-version>: <message>`.
   */
  readonly ping: (message: string) => string;
  /**
   * Replace the analysis parameters with a forward-compatible JSON document
   * that the component stores verbatim and echoes to its log.
   */
  readonly setParams: (paramsJson: string) => void;
  /** Compute tree statistics over `nodes` for the supplied texture dimensions. */
  readonly analyzeTree: (
    nodes: Array<NodeRecord>,
    textureWidth: number,
    textureHeight: number,
  ) => TreeStats;
}

/** Normalize the generated analysis interface into the authored public shape. */
const instantiateComponentAnalysisCapability = async (): Promise<
  ComponentAnalysisCapability
> => {
  const component: AnalysisInterface = await instantiateAnalysisComponent();
  const capability: ComponentAnalysisCapability = {
    ping(message: string) {
      return component.ping(message);
    },
    setParams(paramsJson: string) {
      component.setParams(paramsJson);
    },
    analyzeTree(
      nodes: Array<NodeRecord>,
      textureWidth: number,
      textureHeight: number,
    ) {
      return component.analyzeTree(nodes, textureWidth, textureHeight);
    },
  };
  return capability;
};

/** Explicit lifecycle for the authored browser-safe analysis capability. */
export const analysisComponentLoader: ComponentCapabilityLoader<ComponentAnalysisCapability> =
  createComponentCapabilityLoader({
    instantiate: instantiateComponentAnalysisCapability,
    probeSupport: probeWebAssemblySupport,
    reportFailure(error) {
      console.info(
        "[analysis][inspector-component] component failed to instantiate",
        error,
      );
    },
  });

export type {
  ComponentCapabilityLoader,
  ComponentCapabilityPrepareResult,
  ComponentCapabilityState,
  ComponentUnsupportedReason,
} from "./capability";
