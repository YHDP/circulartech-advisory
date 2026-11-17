/**
 * CircularTech Advisory build (Deno, no remote imports).
 * Adapted from ~/Claude/website-template/build.ts and the Regen Studio site build.
 *
 *   ~/.deno/bin/deno run --allow-read --allow-write build.ts            build the site
 *   ~/.deno/bin/deno run --allow-read --allow-write build.ts --preview <slug>
 *        render one post (draft or not) to _preview/<slug>/index.html (gitignored)
 *
 * What it writes:
 *   - shared header bar, footer and Organization JSON-LD into the static pages (between <!--SITE:*--> markers)
 *   - insights/<slug>/index.html for every APPROVED post, plus its images
 *   - insights/index.html (listing) and the "latest" strip on the lander
 *   - sitemap.xml, feed.xml, robots.txt, llms.txt, llms-full.txt
 *
 * Review gate (same as regenstudio.world): a post is built only when meta.published is true
 * AND meta.review.text and meta.review.assets are both "approved". Only Yvo flips those.
 */

// ── Site constants ──────────────────────────────────────────────────────────
const SITE_URL = "https://www.circulartechadvisory.com";
const SITE_NAME = "CircularTech Advisory";
const LEGAL_NAME = "CircularTech Forum GmbH";
const EMAIL = "consulting@circulartechforum.de";
const FORUM_URL = "https://circulartechforum.de/";
const OG_DEFAULT = `${SITE_URL}/assets/images/og-default.png`;
// Impressum and Datenschutz go live (linked, indexed, in the sitemap) only once the partner
// has confirmed the company details. Until then they stay noindex and unlinked.
const LEGAL_CONFIRMED = false;
const STATIC_PAGES = ["index.html", "impressum.html", "datenschutz.html", "404.html"];
const BLOG_DIR = "Blogs";
const OUT_DIR = "insights";

// ── Types ───────────────────────────────────────────────────────────────────
interface Meta {
  title: string;
  slug: string;
  subtitle?: string;
  author: { name: string; role?: string; url?: string };
  date: string;
  updated?: string;
  categories?: string[];
  tags?: string[];
  featuredImage?: string;
  featuredImageAlt?: string;
  excerpt: string;
  metaDescription?: string;
  seoTitle?: string;
  cta?: { h2: string; body: string; subject?: string };
  published: boolean;
  review?: { text?: string; assets?: string };
}
interface Post extends Meta { content: string; words: number }

// ── Small helpers ───────────────────────────────────────────────────────────
const exists = (p: string) => { try { Deno.statSync(p); return true; } catch { return false; } };
const read = (p: string) => Deno.readTextFileSync(p);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escXml = (s: string) => esc(s).replace(/'/g, "&apos;");
const fmtDate = (d: string) => new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const jsonLd = (o: unknown) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`;
const today = new Date().toISOString().slice(0, 10);

function isApproved(m: Meta): boolean {
  return m.published === true && m.review?.text === "approved" && m.review?.assets === "approved";
}

function replaceBlock(html: string, name: string, inner: string, file: string): string {
  const re = new RegExp(`<!--SITE:${name}-->[\\s\\S]*?<!--/SITE:${name}-->`);
  if (!re.test(html)) throw new Error(`${file}: marker SITE:${name} missing`);
  return html.replace(re, `<!--SITE:${name}-->\n${inner}\n<!--/SITE:${name}-->`);
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&rarr;/g, "→").replace(/&middot;/g, "·");
}

/** Very small HTML → Markdown for llms-full.txt. Good enough for our own, well-formed content. */
function toMarkdown(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<figure[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<\/figure>/g, "\n[Figure: $1]\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/g, "\n**$1**\n")
    .replace(/<summary[^>]*>([\s\S]*?)<\/summary>/g, "\n**Q: $1**\n")
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_m, row) => "\n| " + row.replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g, "$1 | ").trim())
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<\/p>|<br\s*\/?>/g, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
    .replace(/<\/?(strong|b)>/g, "**")
    .replace(/<\/?(em|i)>/g, "*")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s).split("\n").map((l) => l.trim()).join("\n");
  s = s.replace(/(^\|.*\|)\n+(?=\|)/gm, "$1\n");          // table rows on consecutive lines
  const out: string[] = [];
  let inTable = false;
  for (const line of s.split("\n")) {                      // markdown header separator after each table's first row
    const isRow = line.startsWith("|");
    out.push(line);
    if (isRow && !inTable) out.push("|" + line.split("|").slice(1, -1).map(() => " --- |").join(""));
    inTable = isRow;
  }
  s = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

// ── Shared partials ─────────────────────────────────────────────────────────
function bar(active: "home" | "insights" | ""): string {
  const cur = (k: string) => (active === k ? ' aria-current="page"' : "");
  return `    <div class="ctf-bar">
      <a class="ctf-bar__logo" href="/"${cur("home")}><img src="/assets/logo.svg" alt="${SITE_NAME}" width="87" height="76"></a>
      <nav class="ctf-bar__links" aria-label="Site">
        <a href="/insights/"${cur("insights")}>Insights</a>
        <a href="${FORUM_URL}" rel="noopener">circulartechforum.de &rarr;</a>
      </nav>
    </div>`;
}

function footer(): string {
  const legal = LEGAL_CONFIRMED
    ? `<a href="/impressum.html">Impressum</a>\n      <a href="/datenschutz.html">Datenschutz</a>`
    : `<a href="${FORUM_URL}privacy-policy/" rel="noopener">Privacy</a>`;
  return `<footer class="ctf-footer">
  <div class="ctf-inner">
    <p>&copy; <span data-year>${today.slice(0, 4)}</span> ${LEGAL_NAME}</p>
    <nav aria-label="Footer">
      <a href="/insights/">Insights</a>
      <a href="/feed.xml">RSS</a>
      <a href="${FORUM_URL}" rel="noopener">CircularTech Forum</a>
      ${legal}
    </nav>
  </div>
</footer>
<p class="visually-hidden" id="copy-hint">Copies the email address to your clipboard.</p>
<p class="visually-hidden" id="copy-status" role="status" aria-live="polite"></p>`;
}

const ORG_ID = `${SITE_URL}/#org`;
function orgJsonLd(): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "ProfessionalService"],
        "@id": ORG_ID,
        "name": SITE_NAME,
        "legalName": LEGAL_NAME,
        "url": `${SITE_URL}/`,
        "logo": `${SITE_URL}/assets/logo.svg`,
        "image": OG_DEFAULT,
        "email": EMAIL,
        "description": "Digital Product Passport consulting: readiness assessments, compliance roadmaps, passport design and implementation, and circular business value.",
        "areaServed": { "@type": "AdministrativeArea", "name": "European Union" },
        "knowsAbout": [
          "Digital Product Passport", "EU DPP Registry", "Ecodesign for Sustainable Products Regulation (EU) 2024/1781",
          "Battery Regulation (EU) 2023/1542", "Battery passport", "Circular economy", "Product compliance",
        ],
        "sameAs": [FORUM_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "url": `${SITE_URL}/`,
        "name": SITE_NAME,
        "inLanguage": "en",
        "publisher": { "@id": ORG_ID },
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        "url": `${SITE_URL}/`,
        "name": `${SITE_NAME} | Digital Product Passport consulting`,
        "isPartOf": { "@id": `${SITE_URL}/#website` },
        "about": { "@id": ORG_ID },
        "inLanguage": "en",
        "speakable": { "@type": "SpeakableSpecification", "cssSelector": [".ctf-hero__sub", ".ctf-faq__answer"] },
      },
    ],
  });
}

// ── Posts ───────────────────────────────────────────────────────────────────
function loadPosts(includeDrafts = false): Post[] {
  const idx = `${BLOG_DIR}/blogs.json`;
  if (!exists(idx)) return [];
  const slugs: string[] = JSON.parse(read(idx));
  const posts: Post[] = [];
  for (const slug of slugs) {
    const dir = `${BLOG_DIR}/${slug}`;
    if (!exists(`${dir}/meta.json`) || !exists(`${dir}/content.html`)) {
      console.warn(`  ! ${slug}: missing meta.json or content.html, skipped`);
      continue;
    }
    const meta: Meta = JSON.parse(read(`${dir}/meta.json`));
    if (meta.slug !== slug) throw new Error(`${slug}: meta.slug is "${meta.slug}"`);
    if (!includeDrafts && !isApproved(meta)) {
      console.log(`  - ${slug}: not approved (published=${meta.published}, review=${JSON.stringify(meta.review)}), skipped`);
      continue;
    }
    const content = read(`${dir}/content.html`);
    const words = toMarkdown(content).split(/\s+/).length;
    posts.push({ ...meta, content, words });
  }
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

const postUrl = (p: Meta) => `${SITE_URL}/${OUT_DIR}/${p.slug}/`;
const postImage = (p: Meta) => (p.featuredImage ? `${postUrl(p)}${p.featuredImage}` : OG_DEFAULT);

function titleHtml(title: string): string {
  const i = title.indexOf(": ");
  return i < 0 ? esc(title) : `${esc(title.slice(0, i + 1))} <span>${esc(title.slice(i + 2))}</span>`;
}

function card(p: Post): string {
  const img = p.featuredImage
    ? `<img class="ctf-card__img" src="/${OUT_DIR}/${p.slug}/${p.featuredImage}" alt="${esc(p.featuredImageAlt || "")}" width="800" height="450" loading="lazy">\n      `
    : "";
  return `    <a class="ctf-card" href="/${OUT_DIR}/${p.slug}/">
      ${img}<div class="ctf-card__body">
        <p class="ctf-card__meta"><time datetime="${p.date}">${fmtDate(p.date)}</time>${p.categories?.length ? " · " + esc(p.categories[0]) : ""}</p>
        <h3 class="ctf-card__title">${esc(p.title)}</h3>
        <p class="ctf-card__excerpt">${esc(p.excerpt)}</p>
        <span class="ctf-card__link">Read the analysis</span>
      </div>
    </a>`;
}

function cards(posts: Post[]): string {
  if (!posts.length) return `      <p class="ctf-empty">The first analyses are in review and appear here soon.</p>`;
  return `      <div class="ctf-cards">\n${posts.map(card).join("\n")}\n      </div>`;
}

function head(o: { title: string; description: string; url: string; type: string; image: string; extra?: string; robots?: string }): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta name="theme-color" content="#161616">${o.robots ? `\n<meta name="robots" content="${o.robots}">` : ""}
<link rel="canonical" href="${o.url}">
<meta property="og:type" content="${o.type}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.url}">
<meta property="og:image" content="${o.image}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} insights" href="/feed.xml">
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/css/site.css">${o.extra ? "\n" + o.extra : ""}`;
}

function copyButton(subject: string): string {
  return `<button class="ctf-btn ctf-btn--dark" type="button" data-copy aria-describedby="copy-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      <span class="ctf-btn__label">${EMAIL}</span>
    </button>
    <p class="ctf-cta__email">or <a href="mailto:${EMAIL}?subject=${encodeURIComponent(subject)}">open in your mail app</a></p>`;
}

function postPage(p: Post, opts: { robots?: string } = {}): string {
  const url = postUrl(p);
  const desc = p.metaDescription || p.excerpt;
  const minutes = Math.max(1, Math.round(p.words / 220));
  const posting = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        "headline": p.title,
        "description": desc,
        "image": postImage(p),
        "datePublished": p.date,
        "dateModified": p.updated || p.date,
        "inLanguage": "en",
        "wordCount": p.words,
        "articleSection": p.categories || [],
        "keywords": (p.tags || []).join(", "),
        "author": { "@type": "Person", "name": p.author.name, ...(p.author.url ? { "url": p.author.url, "sameAs": [p.author.url] } : {}) },
        "publisher": { "@type": "Organization", "@id": ORG_ID, "name": SITE_NAME, "legalName": LEGAL_NAME, "logo": `${SITE_URL}/assets/logo.svg` },
        "mainEntityOfPage": { "@type": "WebPage", "@id": url },
        "isPartOf": { "@id": `${SITE_URL}/#website` },
        "speakable": { "@type": "SpeakableSpecification", "cssSelector": [".ctf-hero__h1", ".ctf-hero__sub"] },
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": "Insights", "item": `${SITE_URL}/${OUT_DIR}/` },
          { "@type": "ListItem", "position": 3, "name": p.title, "item": url },
        ],
      },
    ],
  };
  const cta = p.cta || { h2: "Want to know where you stand?", body: "Tell us what you make and where your data lives today. We tell you what the passport rules ask of you, and in what order to do it." };
  const updated = p.updated && p.updated !== p.date ? ` · updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: `${p.seoTitle || p.title} | ${SITE_NAME}`, description: desc, url, type: "article", image: postImage(p), robots: opts.robots,
  extra: `<meta property="article:published_time" content="${p.date}">\n<meta property="article:modified_time" content="${p.updated || p.date}">\n<meta name="author" content="${esc(p.author.name)}">\n${jsonLd(posting)}` })}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>

<header class="ctf-hero ctf-hero--compact">
  <div class="ctf-inner">
${bar("insights")}
    <div class="ctf-hero__body">
      <nav class="ctf-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/${OUT_DIR}/">Insights</a></nav>
      <p class="ctf-hero__pre">Insight${p.categories?.length ? " · " + esc(p.categories[0]) : ""}</p>
      <h1 class="ctf-hero__h1">${titleHtml(p.title)}</h1>
      ${p.subtitle ? `<p class="ctf-hero__sub">${esc(p.subtitle)}</p>` : ""}
      <p class="ctf-hero__meta"><strong>${esc(p.author.name)}</strong>${p.author.role ? ", " + esc(p.author.role) : ""} · <time datetime="${p.date}">${fmtDate(p.date)}</time>${updated} · ${minutes} min read</p>
    </div>
  </div>
</header>

<main id="main-content" class="ctf-article">
  <article class="ctf-inner ctf-prose">
${p.content.trim()}
  </article>
</main>

<section class="ctf-cta" aria-labelledby="cta-h2">
  <div class="ctf-inner">
    <h2 class="ctf-cta__h2" id="cta-h2">${esc(cta.h2)}</h2>
    <p class="ctf-cta__body">${esc(cta.body)}</p>
    ${copyButton(cta.subject || "DPP Consulting Request")}
  </div>
</section>

${footer()}
<script src="/assets/js/site.js" defer></script>
</body>
</html>
`;
}

function insightsIndex(posts: Post[]): string {
  const url = `${SITE_URL}/${OUT_DIR}/`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${url}#blog`,
        "url": url,
        "name": `${SITE_NAME} insights`,
        "inLanguage": "en",
        "publisher": { "@id": ORG_ID },
        "blogPost": posts.map((p) => ({ "@type": "BlogPosting", "headline": p.title, "url": postUrl(p), "datePublished": p.date })),
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${SITE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": "Insights", "item": url },
        ],
      },
    ],
  };
  const desc = "Analysis of EU Digital Product Passport rules for manufacturers and passport builders: the DPP Registry, the Battery Regulation and the Ecodesign delegated acts, and what to build when.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head({ title: `Insights | ${SITE_NAME}`, description: desc, url, type: "website", image: OG_DEFAULT, extra: jsonLd(ld) })}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>

<header class="ctf-hero ctf-hero--compact">
  <div class="ctf-inner">
${bar("insights")}
    <div class="ctf-hero__body">
      <p class="ctf-hero__pre">Insights</p>
      <h1 class="ctf-hero__h1">What the passport rules <span>ask of you, and when</span></h1>
      <p class="ctf-hero__sub">${esc(desc)}</p>
    </div>
  </div>
</header>

<main id="main-content" class="ctf-section">
  <div class="ctf-inner">
    <h2 class="visually-hidden">All insights</h2>
${cards(posts)}
  </div>
</main>

${footer()}
<script src="/assets/js/site.js" defer></script>
</body>
</html>
`;
}

// ── Machine-readable files ──────────────────────────────────────────────────
function sitemap(posts: Post[]): string {
  const latest = posts[0] ? (posts[0].updated || posts[0].date) : today;
  const urls: { loc: string; lastmod: string }[] = [
    { loc: `${SITE_URL}/`, lastmod: today },
    { loc: `${SITE_URL}/${OUT_DIR}/`, lastmod: latest },
    ...posts.map((p) => ({ loc: postUrl(p), lastmod: p.updated || p.date })),
  ];
  if (LEGAL_CONFIRMED) {
    urls.push({ loc: `${SITE_URL}/impressum.html`, lastmod: today }, { loc: `${SITE_URL}/datenschutz.html`, lastmod: today });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${escXml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;
}

function feed(posts: Post[]): string {
  const items = posts.slice(0, 20).map((p) => `    <item>
      <title>${escXml(p.title)}</title>
      <link>${postUrl(p)}</link>
      <guid isPermaLink="true">${postUrl(p)}</guid>
      <pubDate>${new Date(p.date + "T08:00:00Z").toUTCString()}</pubDate>
      <author>${EMAIL} (${escXml(p.author.name)})</author>
      <description>${escXml(p.excerpt)}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} insights</title>
    <link>${SITE_URL}/${OUT_DIR}/</link>
    <description>Analysis of EU Digital Product Passport rules for manufacturers and passport builders.</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

// Bot lists mirror ~/Claude/regenstudio-website/robots.txt: AI search and citation allowed, training-only blocked.
function robots(): string {
  const allow = ["OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Applebot-Extended", "Meta-ExternalAgent"];
  const block = ["GPTBot", "anthropic-ai", "claude-web", "Google-Extended", "CCBot", "cohere-ai", "Bytespider"];
  return `# robots.txt for ${SITE_URL.replace("https://", "")}

User-agent: *
Allow: /
Disallow: /Blogs/
Disallow: /_preview/
Disallow: /404.html

# AI search and citation bots: explicitly allowed
${allow.map((b) => `User-agent: ${b}\nAllow: /\nDisallow: /Blogs/\n`).join("\n")}
# AI training-only crawlers: blocked (high crawl, no citation benefit)
${block.map((b) => `User-agent: ${b}\nDisallow: /\n`).join("\n")}
# AI-readable content: see /llms.txt and /llms-full.txt
Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/feed.xml
`;
}

function landerText(): string {
  const html = read("index.html");
  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] || "";
  // drop the generated "latest" strip; posts are listed separately
  return toMarkdown(main.replace(/<!--SITE:LATEST-->[\s\S]*?<!--\/SITE:LATEST-->/, ""));
}

function llms(posts: Post[]): string {
  return `# ${SITE_NAME}

> ${SITE_NAME} is the Digital Product Passport (DPP) consulting practice of ${LEGAL_NAME}, the organiser of the CircularTech Forum. It helps manufacturers, institutions and passport service providers in the EU move from passport rules to a working passport: readiness assessments, compliance roadmaps, passport design and implementation, and circular business value.

Contact: ${EMAIL}. Language: English. Full text of this site for language models: ${SITE_URL}/llms-full.txt

## Pages
- [Home](${SITE_URL}/): services, short answers on what a DPP is and which products need one, and how to get in touch
- [Insights](${SITE_URL}/${OUT_DIR}/): analysis of EU DPP rules and what to build when
${LEGAL_CONFIRMED ? `- [Impressum](${SITE_URL}/impressum.html): legal notice (German)\n- [Datenschutz](${SITE_URL}/datenschutz.html): privacy notice (German)\n` : ""}
## Insights
${posts.length ? posts.map((p) => `- [${p.title}](${postUrl(p)}) (${p.date}): ${p.excerpt}`).join("\n") : "- None published yet."}

## Related
- [CircularTech Forum](${FORUM_URL}): the forum and community behind ${SITE_NAME}
`;
}

function llmsFull(posts: Post[]): string {
  const parts = [
    `# ${SITE_NAME}: full text\n\n> Plain-text version of ${SITE_URL} for language models. Source of truth is the website; quote with a link to the page.\n`,
    `## Home (${SITE_URL}/)\n\n${landerText()}`,
    ...posts.map((p) => `## ${p.title}\n\nURL: ${postUrl(p)}\nAuthor: ${p.author.name}${p.author.role ? ", " + p.author.role : ""}\nPublished: ${p.date}${p.updated ? `\nUpdated: ${p.updated}` : ""}\n\n${p.subtitle ? p.subtitle + "\n\n" : ""}${toMarkdown(p.content).replace(/^## /gm, "### ").replace(/^### (?=###)/gm, "#")}`),
  ];
  return parts.join("\n\n---\n\n") + "\n";
}

// ── Static pages ────────────────────────────────────────────────────────────
function updateStaticPages(posts: Post[]) {
  for (const file of STATIC_PAGES) {
    if (!exists(file)) { console.warn(`  ! ${file} missing`); continue; }
    let html = read(file);
    html = replaceBlock(html, "BAR", bar(file === "index.html" ? "home" : ""), file);
    html = replaceBlock(html, "FOOTER", footer(), file);
    if (file === "index.html") {
      html = replaceBlock(html, "ORG-JSONLD", orgJsonLd(), file);
      html = replaceBlock(html, "LATEST", cards(posts.slice(0, 3)), file);
    }
    if (file === "impressum.html" || file === "datenschutz.html") {
      html = replaceBlock(html, "ROBOTS", LEGAL_CONFIRMED ? "" : `<meta name="robots" content="noindex, nofollow">`, file);
    }
    Deno.writeTextFileSync(file, html);
    console.log(`  ${file}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
function copyPostAssets(slug: string, dest: string) {
  for (const e of Deno.readDirSync(`${BLOG_DIR}/${slug}`)) {
    if (e.isFile && !/\.(json|html|md)$/i.test(e.name)) Deno.copyFileSync(`${BLOG_DIR}/${slug}/${e.name}`, `${dest}/${e.name}`);
  }
}

function main() {
  const args = Deno.args;
  if (args[0] === "--preview") {
    const slug = args[1];
    const post = loadPosts(true).find((p) => p.slug === slug);
    if (!post) throw new Error(`no post "${slug}" in ${BLOG_DIR}/blogs.json`);
    const dest = `_preview/${slug}`;
    Deno.mkdirSync(dest, { recursive: true });
    copyPostAssets(slug, dest);
    Deno.writeTextFileSync(`${dest}/index.html`, postPage(post, { robots: "noindex, nofollow" }));
    console.log(`Preview: http://localhost:8765/${dest}/  (draft, not part of the site)`);
    return;
  }

  console.log("Building CircularTech Advisory…");
  const posts = loadPosts();

  // Remove generated post folders that are no longer approved, then write the approved ones.
  Deno.mkdirSync(OUT_DIR, { recursive: true });
  const keep = new Set(posts.map((p) => p.slug));
  for (const e of Deno.readDirSync(OUT_DIR)) {
    if (e.isDirectory && !keep.has(e.name)) {
      Deno.removeSync(`${OUT_DIR}/${e.name}`, { recursive: true });
      console.log(`  removed ${OUT_DIR}/${e.name}/ (not approved)`);
    }
  }
  for (const p of posts) {
    const dest = `${OUT_DIR}/${p.slug}`;
    Deno.mkdirSync(dest, { recursive: true });
    copyPostAssets(p.slug, dest);
    Deno.writeTextFileSync(`${dest}/index.html`, postPage(p));
    console.log(`  ${dest}/index.html`);
  }
  Deno.writeTextFileSync(`${OUT_DIR}/index.html`, insightsIndex(posts));
  console.log(`  ${OUT_DIR}/index.html (${posts.length} posts)`);

  updateStaticPages(posts);

  Deno.writeTextFileSync("sitemap.xml", sitemap(posts));
  Deno.writeTextFileSync("feed.xml", feed(posts));
  Deno.writeTextFileSync("robots.txt", robots());
  Deno.writeTextFileSync("llms.txt", llms(posts));
  Deno.writeTextFileSync("llms-full.txt", llmsFull(posts));
  console.log("  sitemap.xml, feed.xml, robots.txt, llms.txt, llms-full.txt");
  console.log("Done.");
}

main();
