# Multilingual Routing Notes

Default language: English (/en).

Static implementation mirrors current HTML pages under /en, /es, /ru, /ar, /fr, /pt.

Next.js migration: move i18n/messages/*.json into next-intl messages, configure middleware localePrefix: always, defaultLocale: en, locales: en, es, ru, ar, fr, pt.
