# Next.js + next-intl Migration Notes

Current project status: this workspace is a static HTML site, not a Next.js app. The multilingual implementation has therefore been generated as static SEO-ready routes under `/en`, `/es`, `/ru`, `/ar`, `/fr`, and `/pt`.

If the site is migrated to Next.js App Router later, use the existing files in `i18n/messages/*.json` as the source dictionaries.

## Suggested Next.js Structure

```txt
app/
  [locale]/
    layout.tsx
    page.tsx
    products/
    applications/
    about/
    factory/
    projects/
    blog/
    contact/
i18n/
  messages/
    en.json
    es.json
    ru.json
    ar.json
    fr.json
    pt.json
middleware.ts
next.config.mjs
```

## next-intl Config Example

```ts
// middleware.ts
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'es', 'ru', 'ar', 'fr', 'pt'],
  defaultLocale: 'en',
  localePrefix: 'always'
});

export const config = {
  matcher: ['/', '/(en|es|ru|ar|fr|pt)/:path*']
};
```

```tsx
// app/[locale]/layout.tsx
import {NextIntlClientProvider} from 'next-intl';
import {notFound} from 'next/navigation';

const locales = ['en', 'es', 'ru', 'ar', 'fr', 'pt'];

export default async function LocaleLayout({children, params}) {
  const {locale} = await params;
  if (!locales.includes(locale)) notFound();

  const messages = (await import(`../../i18n/messages/${locale}.json`)).default;

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

## Translation API Placeholders

Use `i18n/translation-api.example.env` for future DeepL or Google Cloud Translation credentials. Do not use browser translation as SEO content.
