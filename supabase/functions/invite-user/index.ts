    const siteUrl = Deno.env.get('SITE_URL');
    const redirectToUrl = siteUrl ? `${siteUrl}/login` : 'http://localhost:8080/login';
    console.log('Redirecting new user to:', redirectToUrl);