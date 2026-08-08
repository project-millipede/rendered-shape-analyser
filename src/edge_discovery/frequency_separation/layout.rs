//! Layout constants for reusable low/high-frequency separation state.

/// Number of signed words in one low/high-frequency band vector.
pub(crate) const LOW_HIGH_FREQUENCY_BAND_WORDS: u32 = 4;

/// Number of frequency levels kept in the first reusable state buffer.
pub(crate) const LOW_HIGH_FREQUENCY_LEVEL_COUNT: u32 = 2;

/// Number of unsigned support words derived from the clean frequency bands.
pub(crate) const LOW_HIGH_FREQUENCY_SUPPORT_WORDS: u32 = 4;

/// Number of words stored for one per-tile frequency-separation state record.
pub(crate) const LOW_HIGH_FREQUENCY_STATE_WORDS: u32 = LOW_HIGH_FREQUENCY_BAND_WORDS
    * LOW_HIGH_FREQUENCY_LEVEL_COUNT
    + LOW_HIGH_FREQUENCY_SUPPORT_WORDS;

/// Byte stride of one per-tile frequency-separation state record.
pub(crate) const LOW_HIGH_FREQUENCY_STATE_STRIDE_BYTES: u32 =
    LOW_HIGH_FREQUENCY_STATE_WORDS * u32::BITS / 8;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frequency_state_keeps_two_band_levels_and_support() {
        assert_eq!(LOW_HIGH_FREQUENCY_BAND_WORDS, 4);
        assert_eq!(LOW_HIGH_FREQUENCY_LEVEL_COUNT, 2);
        assert_eq!(LOW_HIGH_FREQUENCY_SUPPORT_WORDS, 4);
        assert_eq!(LOW_HIGH_FREQUENCY_STATE_WORDS, 12);
        assert_eq!(LOW_HIGH_FREQUENCY_STATE_STRIDE_BYTES, 48);
    }
}
