#!/usr/bin/env node

/**
 * Script pro generování sitemap.xml a robots.txt pro ProEdu.
 * 
 * Použití:
 *   npm run sitemap
 *   SITE_URL=https://www.pro-edu.eu/proeducator npm run sitemap
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// Výchozí adresa webu / aplikace (lze přepsat přes SITE_URL v .env nebo CLI)
const rawBaseUrl = process.env.SITE_URL || 'https://proeducator.eu';
const baseUrl = rawBaseUrl.replace(/\/+$/, '');

const today = new Date().toISOString().split('T')[0];

// Veřejné indexovatelné stránky
const routes = [
  { path: '', changefreq: 'daily', priority: '1.00' },
  { path: '/practice', changefreq: 'daily', priority: '0.90' },
  { path: '/courses', changefreq: 'weekly', priority: '0.90' },
  { path: '/courses/course-combo', changefreq: 'weekly', priority: '0.80' },
  { path: '/courses/course-math', changefreq: 'weekly', priority: '0.80' },
  { path: '/courses/course-czech', changefreq: 'weekly', priority: '0.80' },
  { path: '/learning', changefreq: 'weekly', priority: '0.80' },
  { path: '/contact', changefreq: 'monthly', priority: '0.70' },
  { path: '/login', changefreq: 'monthly', priority: '0.50' },
  { path: '/terms', changefreq: 'monthly', priority: '0.40' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.40' },
];

function generateSitemapXml() {
  const urlsXml = routes.map((r) => {
    const loc = r.path ? `${baseUrl}${r.path}` : `${baseUrl}/`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlsXml}
</urlset>
`;
}

function generateRobotsTxt() {
  // Zjistíme, zda baseUrl obsahuje subpath např. /proeducator
  const urlObj = new URL(baseUrl);
  const subpath = urlObj.pathname.replace(/\/+$/, '');
  const prefix = subpath ? subpath : '';

  return `# ProEdu robots.txt
User-agent: *
Allow: ${prefix}/
Allow: ${prefix}/practice
Allow: ${prefix}/courses
Allow: ${prefix}/courses/*
Allow: ${prefix}/learning
Allow: ${prefix}/contact
Allow: ${prefix}/login
Allow: ${prefix}/terms
Allow: ${prefix}/privacy

# Disallow private & authenticated student / teacher routes
Disallow: ${prefix}/teacher
Disallow: ${prefix}/teacher/
Disallow: ${prefix}/garden
Disallow: ${prefix}/todo
Disallow: ${prefix}/settings
Disallow: ${prefix}/test/
Disallow: ${prefix}/review/
Disallow: ${prefix}/study/
Disallow: ${prefix}/practice/session/

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml
`;
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const sitemapPath = path.join(publicDir, 'sitemap.xml');
fs.writeFileSync(sitemapPath, generateSitemapXml(), 'utf-8');
console.log(`✅ [Sitemap] Vygenerován sitemap.xml (${routes.length} URL) do: ${sitemapPath}`);

const robotsPath = path.join(publicDir, 'robots.txt');
fs.writeFileSync(robotsPath, generateRobotsTxt(), 'utf-8');
console.log(`✅ [Robots] Vygenerován robots.txt do: ${robotsPath}`);
console.log(`🌐 Base URL: ${baseUrl}`);
