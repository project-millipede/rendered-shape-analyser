/**
 * Normalize one required export at the private generated-provider boundary.
 *
 * @param capability - Required callable export from one selected world.
 * @param exportName - Stable diagnostic name for a missing export.
 * @param isCallable - World-specific callable-interface validation.
 * @returns The validated generated capability.
 */
export const requireGeneratedCapability = <Capability>(
  capability: Capability | undefined,
  exportName: string,
  isCallable: (candidate: Capability) => boolean,
): Capability => {
  if (!capability) {
    throw new Error(
      `generated component is missing or has an invalid ${exportName} export`,
    );
  }
  if (!isCallable(capability)) {
    throw new Error(
      `generated component is missing or has an invalid ${exportName} export`,
    );
  }
  return capability;
};
