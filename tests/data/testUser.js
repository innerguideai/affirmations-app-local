// tests/data/testUser.js
// Canonical test personas matching UAT personas.
// Never commit real credentials — these are test accounts only.

module.exports = {
  // JACK: guest who converts to account (use for guest-to-account flows)
  JACK: {
    email: 'jack.test@innerguideai.com',
    password: 'TestUser@1234',
    firstName: 'Jack',
    role: 'guest-to-account'
  },

  // JILL: guest only, trial expiry tests
  JILL: {
    email: 'jill.test@innerguideai.com',
    password: 'TestUser@1234',
    firstName: 'Jill',
    role: 'guest-only'
  },

  // JOHN: full logged-in account — default for auth-required tests
  JOHN: {
    email: 'innerguideai@gmail.com',
    password: 'asdf@1234',
    firstName: 'Ritu',
    role: 'full-account'
  },

  // SOCIAL_ONLY: Google sign-in account, no password set — for the
  // null-password login-crash regression (routes/auth.js fix)
  SOCIAL_ONLY: {
    email: 'innerguidetest@gmail.com',
    password: 'Asdf@1234', // dummy — this account has no real password; login must be rejected gracefully, not crash
    firstName: 'Test',
    role: 'social-only-google'
  }
};
