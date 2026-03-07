<?php
/**
 * Mock SAML IdP user configuration.
 *
 * Mimics Microsoft Entra SAML claims so local dev matches production responses.
 * Mount this file into the mock-idp container at:
 *   /var/www/simplesamlphp/config/authsources.php
 */
$config = array(
    'admin' => array(
        'core:AdminPassword',
    ),
    'example-userpass' => array(
        'exampleauth:UserPass',

        'user1:user1pass' => array(
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier' => array('jdoe@lib.loc.gov'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' => array('jdoe@loc.gov'),
            'http://schemas.microsoft.com/identity/claims/displayname' => array('Doe, Jane A'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname' => array('Jane'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname' => array('Doe'),
            'http://schemas.microsoft.com/identity/claims/objectidentifier' => array('a1b2c3d4-5678-9012-abcd-ef3456789012'),
            'http://schemas.microsoft.com/identity/claims/tenantid' => array('f0e1d2c3-b4a5-6789-0123-456789abcdef'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' => array('jdoe@lib.loc.gov'),
        ),

        'user2:user2pass' => array(
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier' => array('bsmith@lib.loc.gov'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' => array('bsmith@loc.gov'),
            'http://schemas.microsoft.com/identity/claims/displayname' => array('Smith, Bob R'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname' => array('Bob'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname' => array('Smith'),
            'http://schemas.microsoft.com/identity/claims/objectidentifier' => array('b2c3d4e5-6789-0123-bcde-f45678901234'),
            'http://schemas.microsoft.com/identity/claims/tenantid' => array('f0e1d2c3-b4a5-6789-0123-456789abcdef'),
            'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' => array('bsmith@lib.loc.gov'),
        ),
    ),
);
