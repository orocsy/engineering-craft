# Search Console decisions

| Category | Verify on the exact URL | Action when working as intended |
|---|---|---|
| Page with redirect | Original status, Location, hop count, destination and canonical | Keep intentional redirects. Update own links/sitemaps to final URL |
| Blocked by robots.txt | Production robots rule and intended discovery/access policy | Keep deliberate exclusions. Protect private data with authentication |
| Crawled, currently not indexed | Export examples and count HTML vs images, PDFs and other files. For HTML check canonical, duplicate text, internal links, useful content and render | Keep required assets crawlable. Review eligible pages individually |
| Discovered, currently not indexed | Verify sitemap inclusion, normal links, correct final HTTPS HTML and server health. Check last crawl date | Improve discovery and availability where evidence warrants. Reinspect representative pages |
| Alternate page with proper canonical | Check the duplicate points to the intended, healthy canonical | Leave the duplicate excluded |
| Blocked due to other 4xx | Reproduce complete GET and inspect gateway/app status and response bytes. Trace upstream and compare original/derived assets | When fixed, start one validation if offered and preserve its state |
| Excluded by noindex | Check HTML meta and HTTP header, exact URL and crawl date | Keep intentional private/utility exclusion. Remove accidental directives and recheck public route |
| Not found | Confirm HTTP status, internal links, sitemap and replacement intent | Keep real 404 for removed URLs. Correct broken own links or redirect to a true replacement |

“Not started” is a validation state. Start validation after fixing an unintended issue and verifying the affected examples. A redirect, alternate or deliberately excluded page may need no validation at all. Read pending or failed examples before repeating validation. Google decides what it indexes and when. Do not use the restricted Indexing API for ordinary pages.

When an open issue and the report snapshot are unchanged, reopen the investigation on a newer crawl date, a failed validation, a new affected URL, or an independently reproduced site failure. Use the same property and report filter. An application or gateway log can confirm a specific crawler request after checking the crawler’s published identity guidance. A limited log window without a match cannot establish that a search engine never crawled the site. Save the query window and the current HTTP readback separately.

Check video report examples against the actual watch page. Search appearance, video indexing, structured-data eligibility and ordinary page indexing are separate outcomes. For sitemap counts, parse only page URL locations in the sitemap namespace; media URLs have separate elements. Compare the current XML, platform last-read date, submitted-property host and actual child maps. For HTTPS and structured data report the platform's sample scope. For CWV distinguish field sample availability from lab tests. Compare search clicks, impressions, position and CTR using complete dates, and preserve the population/filter; fall back to existing analytics for business outcomes when available.

Historical example: Channel's report listed hundreds of image URLs under “Crawled, currently not indexed” and five 4xx images. Original images existed, but encoding large binary responses into a cloud function's response exceeded the provider limit. The fix prepared smaller web files, retained originals and checked current public bytes. The historical platform count and the website repair were verified independently. See [Channel image repair workflow](https://github.com/vibelingan/channel/actions/runs/43752358379) and [Google indexing report](https://support.google.com/webmasters/answer/7440203).

## Choosing outside guidance

Treat Google and Bing documentation as authoritative for each platform's reported state and tools. Review [Marketing Skills at 73573e9](https://github.com/coreyhaines31/marketingskills/tree/73573e94a06a39965978b3fa1f9c1eace8cebc7c) for search intent and content checks and [Claude SEO at 468ed5b](https://github.com/AgriciDaniel/claude-seo/tree/468ed5b0d9e3249394783710e54abb02837e326b) for report coverage. A live HTTP success, a successful index request, a new crawl and an indexed record each establish a different fact. Preserve the report date and private raw evidence when refining these rules.
