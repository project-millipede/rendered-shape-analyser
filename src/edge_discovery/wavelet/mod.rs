//! Concrete wavelet implementations for shared frequency state.
//!
//! Each wavelet family owns its algorithm-specific math and thresholds while
//! writing into the shared `frequency_separation` state. The shared service
//! therefore stays reusable and does not imply Haar, Daubechies, or any other
//! transform.

pub(crate) mod haar;
