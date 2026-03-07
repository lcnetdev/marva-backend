/**
 * Multi-domain SAML configuration.
 *
 * Each key is a hostname (what arrives in the Host / X-Forwarded-Host header).
 * Values override the base SAML config from config/index.js for that domain.
 *
 * To add a new domain:
 *   1. Copy the template block at the bottom
 *   2. Set the hostname key and fill in the values
 *   3. Register the Entity ID and ACS URL in Entra (or your IdP)
 *   4. Place the IdP signing cert in util-service/certs/
 *   5. Restart the server
 */

/**
 * Build the domain config map.
 * Called once at startup. Values can reference env vars for secrets/paths.
 * @returns {Map<string, object>} hostname -> SAML config overrides
 */
function getDomainConfigs() {
  const domains = new Map();

  // --- localhost (local development) ---
  // Uses mock IdP (docker-compose.dev.yml) or dev bypass (DEV_AUTH_BYPASS=1).
  // Reads from the same env vars currently in .env, so zero config change for dev.
  domains.set('localhost', {
    entryPoint:        process.env.SAML_ENTRY_POINT || 'http://localhost:8080/simplesaml/saml2/idp/SSOService.php',
    issuer:            process.env.SAML_ISSUER || 'http://localhost:9400/marva',
    callbackUrl:       process.env.SAML_CALLBACK_URL || 'http://localhost:9400/marva/util/auth/callback',
    logoutUrl:         process.env.SAML_LOGOUT_URL || '',
    logoutCallbackUrl: process.env.SAML_LOGOUT_CALLBACK_URL || 'http://localhost:9400/marva/util/auth/logout/callback',
    idpCertPath:       process.env.SAML_IDP_CERT_PATH || '/app/certs/mock-idp.crt',
    postLoginRedirect: process.env.POST_LOGIN_REDIRECT || 'http://localhost:4444/marva/',
  });

  // --- preprod-3001.id.loc.gov (staging) ---
  // Separate Entra app registration with its own cert.
  domains.set('preprod-3001.id.loc.gov', {
    entryPoint:        process.env.SAML_STAGING_ENTRY_POINT || process.env.SAML_ENTRY_POINT || '',
    issuer:            'https://preprod-3001.id.loc.gov/bfe2/quartz/',
    callbackUrl:       'https://preprod-3001.id.loc.gov/marva/util/auth/callback',
    logoutUrl:         process.env.SAML_STAGING_LOGOUT_URL || process.env.SAML_LOGOUT_URL || '',
    logoutCallbackUrl: 'https://preprod-3001.id.loc.gov/marva/util/auth/logout/callback',
    idpCertPath:       process.env.SAML_STAGING_IDP_CERT_PATH || '/app/certs/entra-staging.cer',
    postLoginRedirect: '/marva/',
  });

  // --- editor.id.loc.gov (production) ---
  // Separate Entra app registration with its own cert.
  domains.set('editor.id.loc.gov', {
    entryPoint:        process.env.SAML_PROD_ENTRY_POINT || process.env.SAML_ENTRY_POINT || '',
    issuer:            'https://editor.id.loc.gov/marva',
    callbackUrl:       'https://editor.id.loc.gov/marva/util/auth/callback',
    logoutUrl:         process.env.SAML_PROD_LOGOUT_URL || process.env.SAML_LOGOUT_URL || '',
    logoutCallbackUrl: 'https://editor.id.loc.gov/marva/util/auth/logout/callback',
    idpCertPath:       process.env.SAML_PROD_IDP_CERT_PATH || '/app/certs/entra-prod.cer',
    postLoginRedirect: '/marva/',
  });

  // --- TEMPLATE: Copy this block to add a new domain ---
  // domains.set('new-domain.example.com', {
  //   entryPoint:        process.env.SAML_NEWDOMAIN_ENTRY_POINT || process.env.SAML_ENTRY_POINT || '',
  //   issuer:            'https://new-domain.example.com/marva',
  //   callbackUrl:       'https://new-domain.example.com/marva/util/auth/callback',
  //   logoutUrl:         process.env.SAML_NEWDOMAIN_LOGOUT_URL || process.env.SAML_LOGOUT_URL || '',
  //   logoutCallbackUrl: 'https://new-domain.example.com/marva/util/auth/logout/callback',
  //   idpCertPath:       process.env.SAML_NEWDOMAIN_IDP_CERT_PATH || '/app/certs/entra-newdomain.cer',
  //   postLoginRedirect: '/marva/',
  // });

  return domains;
}

module.exports = { getDomainConfigs };
